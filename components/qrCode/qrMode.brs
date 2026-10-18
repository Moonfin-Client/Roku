function onModeChanged(nodeEvent)
    mode = nodeEvent.getData()

    if mode = "NUMERIC" then
        constructor(&h1, [10, 12, 14])
    else if mode = "ALPHANUMERIC" then
        constructor(&h2, [9, 11, 13])
    else if mode = "BYTE" then
        constructor(&h4, [8, 16, 16])
    else if mode = "KANJI" then
        constructor(&h8, [8, 10, 12])
    else if mode = "ECI" then
        constructor(&h7, [0, 0, 0])
    else
        throw("Unknown Mode")
    end if
end function

'-- Constructor and fields --
function constructor(modeBits as integer, numBitsCharCount as object)
    ' The mode indicator bits, which is a uint4 value (range 0 to 15).
    m.top.modeBits = modeBits
    ' Number of character count bits for three different version ranges.
    m.top.numBitsCharCount = numBitsCharCount
end function

'-- Method --
' (Package-private) Returns the bit width of the character count field for a segment in
' this mode in a QR Code at the given version number. The result is in the range [0, 16].
function numCharCountBits(version as integer) as integer
    return m.top.numBitsCharCount[floor((version + 7) / 17)]
end function

function onVersionChanged(nodeEvent)
    version = nodeEvent.getData()
    m.top.numCharCountBits = m.top.numBitsCharCount[floor((version + 7) / 17)]
end function