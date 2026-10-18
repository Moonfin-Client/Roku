function onLevelChanged(nodeEvent)
    level = nodeEvent.getData()

    if level = "LOW" then
        constructor(0, 1) ' The QR Code can tolerate about 7% erroneous codewords
    else if level = "MEDIUM" then
        constructor(1, 0) ' The QR Code can tolerate about 15% erroneous codewords
    else if level = "QUARTILE" then
        constructor(2, 3) ' The QR Code can tolerate about 25% erroneous codewords
    else if level = "HIGH" then
        constructor(3, 2) ' The QR Code can tolerate about 30% erroneous codewords
    else
        throw("Unknown Level")
    end if
end function

'-- Constructor and fields --
function constructor(ordinal as integer, formatBits as integer)
    ' In the range 0 to 3 (unsigned 2-bit integer).
    m.top.ordinal = ordinal
    ' (Package-private) In the range 0 to 3 (unsigned 2-bit integer).
    m.top.formatBits = formatBits
end function
