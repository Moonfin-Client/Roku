'-- Private helper methods for constructor: Codewords and masking --

' Returns a new byte string representing the given data with the appropriate error correction
' codewords appended to it, based on this object's version and error correction level.
function _qrCode_mask_addEccAndInterleave(data as object) as object
    ver = m.version
    ecl = m.errorCorrectionLevel
    if (data.count() <> m.getNumDataCodewords(ver, ecl)) then
        throw("Invalid argument")
    end if

    ' Calculate parameter numbers
    numBlocks = m.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver]
    blockEccLen = m.ECC_CODEWORDS_PER_BLOCK [ecl.ordinal][ver]
    rawCodewords = floor(m.getNumRawDataModules(ver) / 8)
    numShortBlocks = numBlocks - rawCodewords MOD numBlocks
    shortBlockLen = floor(rawCodewords / numBlocks)

    ' Split data into blocks and append ECC to each block
    blocks = []
    rsDiv = m.reedSolomonComputeDivisor(blockEccLen)
    k = 0
    for i = 0 to numBlocks - 1
        dat = slice(data, k, k + shortBlockLen - blockEccLen + iif(i < numShortBlocks, 0, 1))
        k += dat.count()
        ecc = m.reedSolomonComputeRemainder(dat, rsDiv)
        if (i < numShortBlocks) then
            dat.push(0)
        end if
        blocks.push(concat(dat, ecc))
    next

    ' Interleave (not concatenate) the bytes from every block into a single sequence
    result = []
    for i = 0 to blocks[0].count() - 1
        j = 0
        for each block in blocks
            ' Skip the padding byte in short blocks
            if ((i <> shortBlockLen - blockEccLen) or (j >= numShortBlocks)) then
                result.push(block[i])
            end if
            j += 1
        next
    next
    assert(result.count() = rawCodewords)
    return result
end function


' Draws the given sequence of 8-bit codewords (data and error correction) onto the entire
' data area of this QR Code. Function modules need to be marked off before this is called.
function _qrCode_mask_drawCodewords(data as object)
    if (data.count() <> floor(m.getNumRawDataModules(m.version) / 8)) then
        throw("Invalid argument")
    end if
    i = 0 ' Bit index into the data
    ' Do the funny zigzag scan
    for right = m.size - 1 to 1 step -2' Index of right column in each column pair
        if (right = 6) then
            right = 5
        end if
        for vert = 0 to m.size - 1 ' Vertical counter
            for j = 0 to 1
                x = right - j ' Actual x coordinate
                upward = ((right + 1) and 2) = 0
                y = iif(upward, m.size - 1 - vert, vert) ' Actual y coordinate
                if (not m.isFunction[y][x] and (i < data.count() * 8)) then
                    m.modules[y][x] = iif(getBit(data[i >> 3], 7 - (i and 7)), 1, 0)
                    i += 1
                end if
                ' If this QR Code has any remainder bits (0 to 7), they were assigned as
                ' 0/false/light by the constructor and are left unchanged by this method
            next
        next
    next
    assert(i = data.count() * 8)
end function


' XORs the codeword modules in this QR Code with the given mask pattern.
' The function modules must be marked and the codeword bits must be drawn
' before masking. Due to the arithmetic of XOR, calling applyMask() with
' the same mask value a second time will undo the mask. A final well-formed
' QR Code needs exactly one (not zero, two, etc.) mask applied.
function _qrCode_mask_applyMask(mask as integer)
    if ((mask < 0) or (mask > 7)) then
        throw("Mask value out of range")
    end if
    for y = 0 to m.size - 1
        for x = 0 to m.size - 1
            if (mask = 0) then
                invert = (x + y) MOD 2 = 0
            else if (mask = 1) then
                invert = y MOD 2 = 0
            else if (mask = 2) then
                invert = x MOD 3 = 0
            else if (mask = 3) then
                invert = (x + y) MOD 3 = 0
            else if (mask = 4) then
                invert = (floor(x / 3) + floor(y / 2)) MOD 2 = 0
            else if (mask = 5) then
                invert = x * y MOD 2 + x * y MOD 3 = 0
            else if (mask = 6) then
                invert = (x * y MOD 2 + x * y MOD 3) MOD 2 = 0
            else if (mask = 7) then
                invert = ((x + y) MOD 2 + x * y MOD 3) MOD 2 = 0
            else
                throw("Unreachable")
            end if
            if (not m.isFunction[y][x] and invert)
                m.modules[y][x] = abs(m.modules[y][x] - 1)
            end if
        next
    next
end function


' Calculates and returns the penalty score based on state of this QR Code's current modules.
' This is used by the automatic mask choice algorithm to find the mask pattern that yields the lowest score.
function _qrCode_mask_getPenaltyScore() as integer
    result = 0

    ' Adjacent modules in row having same color, and finder-like patterns
    for y = 0 to m.size - 1
        runColor = 0
        runX = 0
        runHistory = [0, 0, 0, 0, 0, 0, 0]
        for x = 0 to m.size - 1
            if (m.modules[y][x] = runColor) then
                runX += 1
                if (runX = 5) then
                    result += m.PENALTY_N1
                else if (runX > 5) then
                    result += 1
                end if
            else
                m.finderPenaltyAddHistory(runX, runHistory)
                if (runColor = 0) then
                    result += m.finderPenaltyCountPatterns(runHistory) * m.PENALTY_N3
                end if
                runColor = m.modules[y][x]
                runX = 1
            end if
        next
        result += m.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * m.PENALTY_N3
    next
    ' Adjacent modules in column having same color, and finder-like patterns
    for x = 0 to m.size - 1
        runColor = 0
        runY = 0
        runHistory = [0, 0, 0, 0, 0, 0, 0]
        for y = 0 to m.size - 1
            if (m.modules[y][x] = runColor) then
                runY += 1
                if (runY = 5) then
                    result += m.PENALTY_N1
                else if (runY > 5) then
                    result += 1
                end if
            else
                m.finderPenaltyAddHistory(runY, runHistory)
                if (not runColor) then
                    result += m.finderPenaltyCountPatterns(runHistory) * m.PENALTY_N3
                end if
                runColor = m.modules[y][x]
                runY = 1
            end if
        next
        result += m.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * m.PENALTY_N3
    next

    ' 2*2 blocks of modules having same color
    for y = 0 to m.size - 2
        for x = 0 to m.size - 2
            color = m.modules[y][x]
            if ((color = m.modules[y][x + 1]) and (color = m.modules[y + 1][x]) and (color = m.modules[y + 1][x + 1]))
                result += m.PENALTY_N2
            end if
        next
    next

    ' Balance of dark and light modules
    dark = 0
    for each row in m.modules
        for each item in row
            if item then
                dark += 1
            end if
        next
    next
    total = m.size * m.size ' Note that size is odd, so dark/total != 1/2
    ' Compute the smallest integer k >= 0 such that (45-5k)% <= dark/total <= (55+5k)%
    k = ceil(abs(dark * 20 - total * 10) / total) - 1
    assert((0 <= k) and (k <= 9))
    result += k * m.PENALTY_N4
    assert((0 <= result) and (result <= 2568888)) ' Non-tight upper bound based on default values of PENALTY_N1, ..., N4
    return result
end function
