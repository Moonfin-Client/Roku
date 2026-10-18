'-- Constructor (low level) and fields --

' Creates a new QR Code with the given version number,
' error correction level, data codeword bytes, and mask number.
' This is a low - level API that most users should not use directly.
' A mid - level API is the encodeSegments() function.
function _qrCode_low_constructor(version as integer, errorCorrectionLevel as object, dataCodewords as object, msk as integer)
    ' The version number of this QR Code, which is between 1 and 40 (inclusive).
    ' This determines the size of this barcode.
    m.version = version

    ' The error correction level used in this QR Code.
    m.errorCorrectionLevel = errorCorrectionLevel

    ' Check scalar arguments
    if ((version < m.MIN_VERSION) or (version > m.MAX_VERSION)) then
        throw("Version value out of range")
    end if
    if ((msk < -1) or (msk > 7)) then
        throw("Mask value out of range")
    end if
    m.size = version * 4 + 17

    ' Initialize both grids to be size * size arrays of boolean false
    for y = 0 to m.size - 1
        m.modules[y] = []
        m.isFunction[y] = []
        for x = 0 to m.size - 1
            m.modules[y][x] = 0 ' Initially all light
            m.isFunction[y][x] = false
        next
    next

    ' Compute ECC, draw modules
    m.drawFunctionPatterns()
    allCodewords = m.addEccAndInterleave(dataCodewords)
    m.drawCodewords(allCodewords)

    ' Do masking
    if (msk = -1) then ' Automatically choose best mask
        minPenalty = 1000000000
        for i = 0 to 7
            m.applyMask(i)
            m.drawFormatBits(i)
            penalty = m.getPenaltyScore()
            if (penalty < minPenalty) then
                msk = i
                minPenalty = penalty
            end if
            m.applyMask(i) ' Undoes the mask due to XOR
        next
    end if
    assert((0 <= msk) and (msk <= 7))
    m.mask = msk
    m.applyMask(msk) ' Apply the final choice of mask
    m.drawFormatBits(msk) ' Overwrite old format bits

    m.isFunction = []
end function

'-- Accessor methods --

' Returns the color of the module (pixel) at the given coordinates, which is false
' for light or true for dark. The top left corner has the coordinates (x = 0, y = 0).
' if the given coordinates are out of bounds, then false (light) is returned.
function _qrCode_low_getModule(x as integer, y as integer) as boolean
    return (0 <= x) and (x < m.size) and (0 <= y) and (y < m.size) and m.modules[y][x]
end function