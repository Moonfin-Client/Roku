'**************************************************************************************
' QR Code generator library (Brightscript)
' Copyright (c) Kevin Hoos.
'**************************************************************************************
' Ported from:
' Copyright (c) Project Nayuki. (MIT License)
' https:'www.nayuki.io/page/qr-code-generator-library
'
' Permission is hereby granted, free of charge, to any person obtaining a copy of
' this software and associated documentation files (the "Software"), to deal in
' the Software without restriction, including without limitation the rights to
' use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
' the Software, and to permit persons to whom the Software is furnished to do so,
' subject to the following conditions:
' - The above copyright notice and this permission notice shall be included in
'   all copies or substantial portions of the Software.
' - The Software is provided "as is", without warranty of any kind, express or
'   implied, including but not limited to the warranties of merchantability,
'   fitness for a particular purpose and noninfringement. In no event shall the
'   authors or copyright holders be liable for any claim, damages or other
'   liability, whether in an action of contract, tort or otherwise, arising from,
'   out of or in connection with the Software or the use or other dealings in the
'   Software.
'**************************************************************************************

'---- Data segment class ----

' A segment of character/binary/control data in a QR Code symbol.
' Instances of this class are immutable.
' The mid-level way to create a segment is to take the payload data
' and call a static factory function such as QrSegment.makeNumeric().
' The low-level way to create a segment is to custom-make the bit buffer
' and call the QrSegment() constructor with appropriate values.
' This segment class imposes no length restrictions, but QR Codes have restrictions.
' Even in the most favorable conditions, a QR Code can only hold 7089 characters of data.
' Any segment longer than this is meaningless for the purpose of generating QR Codes.
function QrSegment() as object
    this = {}

    this.makeBytes = _qrSegment_makeBytes
    this.makeNumeric = _qrSegment_makeNumeric
    this.makeAlphanumeric = _qrSegment_makeAlphanumeric
    this.makeSegments = _qrSegment_makeSegments
    this.makeEci = _qrSegment_makeEci
    this.isNumeric = _qrSegment_isNumeric
    this.isAlphanumeric = _qrSegment_isAlphanumeric
    this.constructor = _qrSegment_constructor

    '-- Methods --

    ' Returns a new copy of the data bits of this segment.
    this.getData = function()
        return slice(m.bitData) ' Make defensive copy
    end function


    ' (Package-private) Calculates and returns the number of bits needed to encode the given segments at
    ' the given version. The result is infinity if a segment has too many characters to fit its length field.
    this.getTotalBits = function(segs as object, version as integer) as integer
        result = 0
        for each seg in segs
            ccbits = seg.mode.callFunc("numCharCountBits", version)
            if (seg.numChars >= (1 << ccbits)) then
                return infinity() ' The segment's length doesn't fit the field's bit width
            end if
            result += 4 + ccbits + seg.bitData.count()
        next
        return result
    end function


    ' Returns a new array of bytes representing the given string encoded in UTF-8.
    this.toUtf8ByteArray = function(str as string) as object
        str = str.escape()
        result = []
        for i = 0 to str.len() - 1
            if (str.mid(i, 1) <> "%") then
                result.push(asc(str.mid(i, 1)))
            else
                result.push(val(str.mid(i + 1, 2), 16))
                i += 2
            end if
        next
        return result
    end function

    '-- Constants --'

    ' Describes precisely all strings that are encodable in numeric mode.
    this.NUMERIC_REGEX = CreateObject("roRegex", "^[0-9]*$", "")

    ' Describes precisely all strings that are encodable in alphanumeric mode.
    this.ALPHANUMERIC_REGEX = CreateObject("roRegex", "^[A-Z0-9 $%*+.\/:-]*$", "")

    ' The set of all legal characters in alphanumeric mode,
    ' where each character value maps to the index in the string.
    this.ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"

    return this
end function

'-- Static factory functions (mid level) --

' Returns a segment representing the given binary data encoded in
' byte mode. All input byte arrays are acceptable. Any text string
' can be converted to UTF-8 bytes and encoded as a byte mode segment.
function _qrSegment_makeBytes(data as object) as object
    bb = []
    for each b in data
        appendBits(b, 8, bb)
        next
    return m.constructor("BYTE", data.count(), bb)
end function


' Returns a segment representing the given string of decimal digits encoded in numeric mode.
function _qrSegment_makeNumeric(digits as string) as object
    if (not m.isNumeric(digits)) then
        throw("String contains non-numeric characters")
    end if
    bb = []
    for i = 0 to digits.len() - 1 ' Consume up to 3 digits per iteration
        n = min(digits.len() - i, 3)
        appendBits(val(digits.mid(i, n), 10), n * 3 + 1, bb)
        i += n
    next
    return m.constructor("NUMERIC", digits.len(), bb)
end function


' Returns a segment representing the given text string encoded in alphanumeric mode.
' The characters allowed are: 0 to 9, A to Z (uppercase only), space,
' dollar, percent, asterisk, plus, hyphen, period, slash, colon.
function _qrSegment_makeAlphanumeric(text as string) as object
    if (not m.isAlphanumeric(text)) then
        throw("String contains unencodable characters in alphanumeric mode")
    end if
    bb = []
    for i = 0 to text.len() - 2 step 2 ' Process groups of 2
        temp = m.ALPHANUMERIC_CHARSET.instr(text.mid(i, 1)) * 45
        temp += m.ALPHANUMERIC_CHARSET.instr(text.mid(i + 1, 1))
        appendBits(temp, 11, bb)
    next
    if (i < text.len()) then ' 1 character remaining
        appendBits(m.ALPHANUMERIC_CHARSET.instr(text.mid(i, 1)), 6, bb)
    end if
    return m.constructor("ALPHANUMERIC", text.len(), bb)
end function


' Returns a new mutable list of zero or more segments to represent the given Unicode text string.
' The result may use various segment modes and switch modes to optimize the length of the bit stream.
function _qrSegment_makeSegments(text as string) as object
    ' Select the most efficient segment encoding automatically
    if (text = "") then
        return []
    else if (m.isNumeric(text)) then
        return [m.makeNumeric(text)]
    else if (m.isAlphanumeric(text)) then
        return [m.makeAlphanumeric(text)]
    else
        return [m.makeBytes(m.toUtf8ByteArray(text))]
    end if
end function


' Returns a segment representing an Extended Channel Interpretation
' (ECI) designator with the given assignment value.
function _qrSegment_makeEci(assignVal as integer) as object
    bb = []
    if (assignVal < 0) then
        throw("ECI assignment value out of range")
    else if (assignVal < (1 << 7)) then
        appendBits(assignVal, 8, bb)
    else if (assignVal < (1 << 14)) then
        appendBits(2, 2, bb) '0b10
        appendBits(assignVal, 14, bb)
    else if (assignVal < 1000000) then
        appendBits(6, 3, bb) '0b110
        appendBits(assignVal, 21, bb)
    else
        throw("ECI assignment value out of range")
    end if
    return m.constructor("ECI", 0, bb)
end function


' Tests whether the given string can be encoded as a segment in numeric mode.
' A string is encodable iff each character is in the range 0 to 9.
function _qrSegment_isNumeric(text as string) as boolean
    return m.NUMERIC_REGEX.isMatch(text)
end function


' Tests whether the given string can be encoded as a segment in alphanumeric mode.
' A string is encodable iff each character is in the following set: 0 to 9, A to Z
' (uppercase only), space, dollar, percent, asterisk, plus, hyphen, period, slash, colon.
function _qrSegment_isAlphanumeric(text as string) as boolean
    return m.ALPHANUMERIC_REGEX.isMatch(text)
end function


'-- Constructor (low level) and fields --

' Creates a new QR Code segment with the given attributes and data.
' The character count (numChars) must agree with the mode and the bit buffer length,
' but the constraint isn't checked. The given bit buffer is cloned and stored.
function _qrSegment_constructor(mode as string, numChars = 0 as integer, bitData = [] as object) as object
    ' The mode indicator of this segment.
    m.mode = CreateObject("roSGNode", "QRMode")
    m.mode.mode = mode

    ' The length of this segment's unencoded data. Measured in characters for
    ' numeric/alphanumeric/kanji mode, bytes for byte mode, and 0 for ECI mode.
    ' Always zero or positive. Not the same as the data's bit length.
    m.numChars = numChars

    ' The data bits of this segment. Accessed through getData().
    m.bitData = bitData

    if (numChars < 0)
        throw("Invalid argument")
    end if
    m.bitData = slice(bitData) ' Make defensive copy
    return m
end function
