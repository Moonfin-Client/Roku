'-- Static factory functions (high level) --

' Returns a QR Code representing the given Unicode text string at the given error correction level.
' As a conservative upper bound, this function is guaranteed to succeed for strings that have 738 or fewer
' Unicode code points (not UTF-16 code units) if the low error correction level is used. The smallest possible
' QR Code version is automatically chosen for the output. The ECC level of the result may be higher than the
' ecl argument if it can be done without increasing the version.
function _qrCode_high_encodeText(text as string, ecl as object) as object
    segs = m.QrSegment.makeSegments(text)
    return m.encodeSegments(segs, ecl)
end function

' Returns a QR Code representing the given binary data at the given error correction level.
' This function always encodes using the binary segment mode, not any text mode. The maximum number of
' bytes allowed is 2953. The smallest possible QR Code version is automatically chosen for the output.
' The ECC level of the result may be higher than the ecl argument if it can be done without increasing the version.
function _qrCode_high_encodeBinary(data as object, ecl as object) as object
    seg = m.QrSegment.makeBytes(data)
    return m.encodeSegments([seg], ecl)
end function