'-- Private helper methods for constructor: Drawing function modules --

' Reads this object's version field, and draws and marks all function modules.
function _qrCode_draw_drawFunctionPatterns()
    ' Draw horizontal and vertical timing patterns
    for i = 0 to m.size - 1
        m.setFunctionModule(6, i, i MOD 2 = 0)
        m.setFunctionModule(i, 6, i MOD 2 = 0)
    next

    ' Draw 3 finder patterns (all corners except bottom right; overwrites some timing modules)
    m.drawFinderPattern(3, 3)
    m.drawFinderPattern(m.size - 4, 3)
    m.drawFinderPattern(3, m.size - 4)

    ' Draw numerous alignment patterns
    alignPatPos = m.getAlignmentPatternPositions()
    numAlign = alignPatPos.count()
    for i = 0 to numAlign - 1
        for j = 0 to numAlign - 1
            ' Don't draw on the three finder corners
            if (not ((i = 0) and (j = 0) or (i = 0) and (j = numAlign - 1) or (i = numAlign - 1) and (j = 0))) then
                m.drawAlignmentPattern(alignPatPos[i], alignPatPos[j])
            end if
        next
    next

    ' Draw configuration data
    m.drawFormatBits(0) ' Dummy mask value; overwritten later in the constructor
    m.drawVersion()
end function


' Draws two copies of the format bits (with its own error correction code)
' based on the given mask and this object's error correction level field.
function _qrCode_draw_drawFormatBits(mask as integer)
    ' Calculate error correction code and pack bits
    data = m.errorCorrectionLevel.formatBits << 3 or mask ' errCorrLvl is uint2, mask is uint3
    remain = data
    for i = 0 to 9
        remain = xor((remain << 1), (remain >> 9) * &h537)
    next
    bits = xor((data << 10 or remain), &h5412) ' uint15
    assert(bits >> 15 = 0)

    ' Draw first copy
    for i = 0 to 5
        m.setFunctionModule(8, i, getBit(bits, i))
    next
    m.setFunctionModule(8, 7, getBit(bits, 6))
    m.setFunctionModule(8, 8, getBit(bits, 7))
    m.setFunctionModule(7, 8, getBit(bits, 8))
    for i = 9 to 14
        m.setFunctionModule(14 - i, 8, getBit(bits, i))
    next

    ' Draw second copy
    for i = 0 to 7
        m.setFunctionModule(m.size - 1 - i, 8, getBit(bits, i))
    next
    for i = 8 to 14
        m.setFunctionModule(8, m.size - 15 + i, getBit(bits, i))
    next
    m.setFunctionModule(8, m.size - 8, true) ' Always dark
end function


' Draws two copies of the version bits (with its own error correction code),
' based on this object's version field, iff 7 <= version <= 40.
function _qrCode_draw_drawVersion()
    if (m.version < 7) then
        return false
    end if

    ' Calculate error correction code and pack bits
    remain = m.version ' version is uint6, in the range [7, 40]
    for i = 0 to 11
        remain = xor((remain << 1), (remain >> 11) * &h1F25)
    next
    bits = m.version << 12 or remain ' uint18
    assert(bits >> 18 = 0)

    ' Draw two copies
    for i = 0 to 17
        color = getBit(bits, i)
        a = m.size - 11 + i MOD 3
        b = floor(i / 3)
        m.setFunctionModule(a, b, color)
        m.setFunctionModule(b, a, color)
    next
end function


' Draws a 9*9 finder pattern including the border separator,
' with the center module at (x, y). Modules can be out of bounds.
function _qrCode_draw_drawFinderPattern(x as integer, y as integer)
    for dy = -4 to 4
        for dx = -4 to 4
            dist = max(abs(dx), abs(dy)) ' Chebyshev/infinity norm
            xx = x + dx
            yy = y + dy
            if ((0 <= xx) and (xx < m.size) and (0 <= yy) and (yy < m.size)) then
                m.setFunctionModule(xx, yy, (dist <> 2) and (dist <> 4))
            end if
        next
    next
end function


' Draws a 5*5 alignment pattern, with the center module
' at (x, y). All modules must be in bounds.
function _qrCode_draw_drawAlignmentPattern(x as integer, y as integer)
    for dy = -2 to 2
        for dx = -2 to 2
            m.setFunctionModule(x + dx, y + dy, max(abs(dx), abs(dy)) <> 1)
        next
    next
end function


' Sets the color of a module and marks it as a function module.
' Only used by the constructor. Coordinates must be in bounds.
function _qrCode_draw_setFunctionModule(x as integer, y as integer, isDark as boolean)
    m.modules[y][x] = iif(isDark, 1, 0)
    m.isFunction[y][x] = true
end function
