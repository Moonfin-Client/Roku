'-- Static factory functions (mid level) --

' Returns a QR Code representing the given segments with the given encoding parameters.
' The smallest possible QR Code version within the given range is automatically
' chosen for the output. Iff boostEcl is true, then the ECC level of the result
' may be higher than the ecl argument if it can be done without increasing the
' version. The mask number is either between 0 to 7 (inclusive) to force that
' mask, or -1 to automatically choose an appropriate mask (which may be slow).
' This function allows the user to create a custom sequence of segments that switches
' between modes (such as alphanumeric and byte) to encode text in less space.
' This is a mid-level API; the high-level API is encodeText() and encodeBinary().
function _qrCode_mid_encodeSegments(segs as object, ecl as object, minVersion = 1 as integer, maxVersion = 40 as integer, mask = -1 as integer, boostEcl = true as boolean) as object
    if (not ((m.MIN_VERSION <= minVersion) and (minVersion <= maxVersion) and (maxVersion <= m.MAX_VERSION)) or (mask < -1) or (mask > 7)) then
        throw("Invalid value")
    end if

    ' Find the minimal version number to use
    for version = minVersion to maxVersion
        dataCapacityBits = m.getNumDataCodewords(version, ecl) * 8 ' Number of data bits available
        usedBits = m.QrSegment.getTotalBits(segs, version)
        if (usedBits <= dataCapacityBits) then
            dataUsedBits = usedBits
            exit for ' This version number is found to be suitable
        end if
        if (version = maxVersion) then ' All versions in the range could not fit the given data
            throw("Data too long")
        end if
    next

    ' Increase the error correction level while the data still fits in the current version number
    for each newEcl in m.Ecc ' From low to high
        if (boostEcl and (dataUsedBits <= m.getNumDataCodewords(version, newEcl) * 8)) then
            ecl = newEcl
        end if
    next

    ' Concatenate all segments to create the data bit string
    bb = []
    for each seg in segs
        appendBits(seg.mode.modeBits, 4, bb)
        appendBits(seg.numChars, seg.mode.callFunc("numCharCountBits", version), bb)
        for each b in seg.getData()
            bb.push(b)
        next
    next
    assert(bb.count() = dataUsedBits)

    ' Add terminator and pad up to a byte if applicable
    dataCapacityBits = m.getNumDataCodewords(version, ecl) * 8
    assert(bb.count() <= dataCapacityBits)
    appendBits(0, min(4, dataCapacityBits - bb.count()), bb)
    appendBits(0, (8 - bb.count() MOD 8) MOD 8, bb)
    assert(bb.count() MOD 8 = 0)

    ' Pad with alternating bytes until data capacity is reached
    padByte = &hEC
    while(bb.count() < dataCapacityBits)
        appendBits(padByte, 8, bb)
        padByte = xor(padByte, xor(&hEC, &h11))
    end while

    ' Pack bits into bytes in big endian
    dataCodewords = []
    while (dataCodewords.count() * 8 < bb.count())
        dataCodewords.push(0)
    end while

    for x = 0 to bb.count() - 1
        b = bb[x]
        i = x
        dataCodewords[i >> 3] = dataCodewords[i >> 3] or (b << (7 - (i and 7)))
    next

    ' Create the QR Code object
    return m.constructor(version, ecl, dataCodewords, mask)
end function
