'**************************************************************************************
' QR Code generator library (Brightscript)
' Copyright (c) Kevin Hoos.
'**************************************************************************************
' Ported from:
' Copyright (c) Project Nayuki. (MIT License)
' https://www.nayuki.io/page/qr-code-generator-library
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


'---- QR Code symbol class ----

'**************************************************************************************
' A QR Code symbol, which is a type of two-dimension barcode.
' Invented by Denso Wave and described in the ISO/IEC 18004 standard.
' Instances of this class represent an immutable square grid of dark and light cells.
' The class provides static factory functions to create a QR Code from text or binary data.
' The class covers the QR Code Model 2 specification, supporting all versions (sizes)
' from 1 to 40, all 4 error correction levels, and 4 character encoding modes.
'
' Ways to create a QR Code object:
' - High level: Take the payload data and call QrCode.encodeText() or QrCode.encodeBinary().
' - Mid level: Custom-make the list of segments and call QrCode.encodeSegments().
' - Low level: Custom-make the array of data codeword bytes (including
'   segment headers and final padding, excluding error correction codewords),
'   supply the appropriate version number, and call the QrCode() constructor.
' (Note that all ways require supplying the desired error correction level.)
'**************************************************************************************
function QrCode()
    this = {}
    '-- Static factory functions (high level) --
    this.encodeText = _qrCode_high_encodeText
    this.encodeBinary = _qrCode_high_encodeBinary


    '-- Static factory functions (mid level) --
    this.encodeSegments = _qrCode_mid_encodeSegments


    '-- Fields --

    ' The width and height of this QR Code, measured in modules, between
    ' 21 and 177 (inclusive). This is equal to version * 4 + 17.
    this.size = 0

    ' The index of the mask pattern used in this QR Code, which is between 0 and 7 (inclusive).
    ' Even if a QR Code is created with automatic masking requested (mask = -1),
    ' the resulting object still has a mask value between 0 and 7.
    this.mask = -1

    ' The modules of this QR Code (false = light, true = dark).
    ' Immutable after constructor finishes. Accessed through getModule().
    this.modules = []

    ' Indicates function modules that are not subjected to masking. Discarded when constructor finishes.
    this.isFunction = []


    '-- Constructor (low level) and fields --
    this.constructor = _qrCode_low_constructor


    '-- Accessor methods --
    this.getModule = _qrCode_low_getModule


    '-- Private helper methods for constructor: Drawing function modules --
    this.drawFunctionPatterns = _qrCode_draw_drawFunctionPatterns
    this.drawFormatBits = _qrCode_draw_drawFormatBits
    this.drawVersion = _qrCode_draw_drawVersion
    this.drawFinderPattern = _qrCode_draw_drawFinderPattern
    this.drawAlignmentPattern = _qrCode_draw_drawAlignmentPattern
    this.setFunctionModule = _qrCode_draw_setFunctionModule


    '-- Private helper methods for constructor: Codewords and masking --
    this.addEccAndInterleave = _qrCode_mask_addEccAndInterleave
    this.drawCodewords = _qrCode_mask_drawCodewords
    this.applyMask = _qrCode_mask_applyMask
    this.getPenaltyScore = _qrCode_mask_getPenaltyScore


    '-- Private helper functions --
    this.getAlignmentPatternPositions = _qrCode_help_getAlignmentPatternPositions
    this.getNumRawDataModules = _qrCode_help_getNumRawDataModules
    this.getNumDataCodewords = _qrCode_help_getNumDataCodewords
    this.reedSolomonComputeDivisor = _qrCode_help_reedSolomonComputeDivisor
    this.reedSolomonComputeRemainder = _qrCode_help_reedSolomonComputeRemainder
    this.reedSolomonMultiply = _qrCode_help_reedSolomonMultiply
    this.finderPenaltyCountPatterns = _qrCode_help_finderPenaltyCountPatterns
    this.finderPenaltyTerminateAndCount = _qrCode_help_finderPenaltyTerminateAndCount
    this.finderPenaltyAddHistory = _qrCode_help_finderPenaltyAddHistory

    this.QrSegment = QrSegment()
    this.Ecc = []
    levels = ["LOW", "MEDIUM", "QUARTILE", "HIGH"]
    for each level in levels
        ecc = CreateObject("roSGNode", "QREcc")
        ecc.level = level
        this.Ecc.push(ecc)
    next


    '-- Constants and tables --

    ' The minimum version number supported in the QR Code Model 2 standard.
    this.MIN_VERSION = 1
    ' The maximum version number supported in the QR Code Model 2 standard.
    this.MAX_VERSION = 40

    ' For use in getPenaltyScore(), when evaluating which mask is best.
    this.PENALTY_N1 = 3
    this.PENALTY_N2 = 3
    this.PENALTY_N3 = 40
    this.PENALTY_N4 = 10

    this.ECC_CODEWORDS_PER_BLOCK = [
        ' Version: (note that index 0 is for padding, and is set to an illegal value)
        '0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
        [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], ' Low
        [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], ' Medium
        [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], ' Quartile
        [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], ' High
    ]

    this.NUM_ERROR_CORRECTION_BLOCKS = [
        ' Version: (note that index 0 is for padding, and is set to an illegal value)
        '0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
        [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], ' Low
        [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], ' Medium
        [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], ' Quartile
        [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81], ' High
    ]

    return this
end function

function onTextChanged(nodeEvent)
    time = createObject("roTimespan")
    text = nodeEvent.getData()
    qr = QrCode()
    ecl = getEcl()
    qr.encodeText(text, ecl)
    ba = CreateObject("roByteArray")
    ba.FromAsciiString(text)
    digest = CreateObject("roEVPDigest")
    digest.Setup("sha1")
    sha1 = digest.Process(ba)
    renderCode(qr, "tmp:/" + sha1 + ".png")
    ?"Time:", time.totalMilliseconds(), text
end function

function getEcl()
    ecl = CreateObject("roSGNode", "QREcc")
    ecl.level = "LOW"
    if not isNullOrEmpty(m.top.ecl) then
        ecl.level = uCase(m.top.ecl)
    end if
    return ecl
end function

sub renderCode(qr as object, filename as string)
    border = m.top.border
    pixel = m.top.pixel
    lightColor = m.top.lightColor
    darkColor = m.top.darkColor
    size = qr.size
    imageSide = ((border * 2) + size) * pixel

    bm = CreateObject("roBitmap", { width: imageSide, height: imageSide, AlphaEnable: true })
    if bm <> invalid then
        bm.DrawRect(0, 0, imageSide, imageSide, lightColor)
        for y = 0 to size - 1
            for x = 0 to size - 1
                if qr.modules[y][x] = 1 then
                    bm.DrawRect((border + x) * pixel, (border + y) * pixel, pixel, pixel, darkColor)
                end if
            next
        next
        bm.Finish()
        ba = bm.GetPng(0, 0, imageSide, imageSide)
        ba.WriteFile(filename)
        m.top.uri = filename
    end if
end sub
