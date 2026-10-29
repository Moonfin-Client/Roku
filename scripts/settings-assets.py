#!/usr/bin/env python3
"""Builds the settings icon font, its glyph table and the settings card images.

The font is cut from the Material Icons font Flutter ships, down to the glyphs the settings
screens name, and each glyph is moved to its own private use codepoint from U+E000 so every
one of them sits in the basic plane. Run it again after naming a new glyph anywhere in
settings, then commit what it writes.

Needs fontTools (pip install fonttools) and a Flutter checkout for the source font.
"""

import json
import math
import os
import re
import struct
import sys
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLUTTER = os.environ.get('FLUTTER_ROOT', os.path.expanduser('~/flutter'))
SOURCE_FONT = os.path.join(FLUTTER, 'bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf')
ICONS_DART = os.path.join(FLUTTER, 'packages/flutter/lib/src/material/icons.dart')

FONT_OUT = os.path.join(ROOT, 'fonts/SettingsIcons.ttf')
TABLE_OUT = os.path.join(ROOT, 'source/utils/settingsGlyphs.bs')
IMAGES_OUT = os.path.join(ROOT, 'images/settings')
FIRST_CODE = 0xE000

# Glyphs picked at run time rather than written out where the scan below can see them
EXTRA_GLYPHS = [
    'check', 'check_box', 'check_box_outline_blank', 'chevron_right', 'arrow_left', 'arrow_right',
    'keyboard_arrow_up', 'keyboard_arrow_down', 'lock_outline', 'restore', 'refresh', 'tune',
    'extension', 'restart_alt', 'play_arrow_rounded',
    # The library header controls and the Sort & Filter group headings
    'home', 'sort', 'category_outlined', 'filter_list', 'shuffle', 'settings', 'grid_view',
    'expand_more', 'expand_less',
    # The music category screens' buttons
    'sort_by_alpha', 'play_arrow', 'album', 'queue_music',
]


def collect_glyph_names():
    names = set(EXTRA_GLYPHS)

    def walk(items):
        for item in items:
            if isinstance(item.get('glyph'), str):
                names.add(item['glyph'])
            walk(item.get('children', []))

    with open(os.path.join(ROOT, 'settings/settings.json')) as handle:
        walk(json.load(handle))

    char_call = re.compile(r'(?:Char|Glyph)\(\s*"([a-z0-9_]+)"\s*\)')
    glyph_field = re.compile(r'\bglyph\s*:\s*"([a-z0-9_]+)"', re.I)
    map_value = re.compile(r'(?::|\?\?)\s*"([a-z0-9_]+)"')
    for folder in ('components', 'source'):
        for base, _, files in os.walk(os.path.join(ROOT, folder)):
            for name in files:
                if not name.endswith('.bs') or name == 'settingsGlyphs.bs':
                    continue
                path = os.path.join(base, name)
                with open(path) as handle:
                    text = handle.read()
                names.update(char_call.findall(text))
                names.update(glyph_field.findall(text))
                if name == 'settingsIcons.bs':
                    names.update(map_value.findall(text))
    return sorted(names)


def build_font(names):
    from fontTools import subset
    from fontTools.pens.cu2quPen import Cu2QuPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib import TTFont, newTable
    from fontTools.ttLib.tables._c_m_a_p import cmap_format_4

    with open(ICONS_DART) as handle:
        codes = {name: int(code, 16) for name, code in re.findall(
            r'static const IconData (\w+) = IconData\(\s*0x([0-9a-fA-F]+)', handle.read())}
    unknown = [name for name in names if name not in codes]
    if unknown:
        sys.exit('Not in the Material Icons font: ' + ', '.join(unknown))

    font = TTFont(SOURCE_FONT, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = []
    options.hinting = False
    options.drop_tables += ['GSUB', 'GPOS', 'GDEF']
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    options.notdef_outline = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[codes[name] for name in names])
    subsetter.subset(font)
    by_code = font.getBestCmap()

    # Quadratic outlines, since the CFF ones the source carries aren't a safe bet on every Roku
    order = font.getGlyphOrder()
    glyph_set = font.getGlyphSet()
    glyphs = {}
    for glyph_name in order:
        pen = TTGlyphPen(glyph_set)
        glyph_set[glyph_name].draw(Cu2QuPen(pen, 1.0, reverse_direction=True))
        glyphs[glyph_name] = pen.glyph()
    font['loca'] = newTable('loca')
    glyf = font['glyf'] = newTable('glyf')
    glyf.glyphOrder = order
    glyf.glyphs = glyphs
    del font['CFF ']
    glyf.compile(font)
    hmtx = font['hmtx']
    for glyph_name, glyph in glyphs.items():
        hmtx[glyph_name] = (hmtx[glyph_name][0], getattr(glyph, 'xMin', 0))
    maxp = font['maxp'] = newTable('maxp')
    maxp.tableVersion = 0x00010000
    maxp.maxZones = 1
    for field in ('maxTwilightPoints', 'maxStorage', 'maxFunctionDefs', 'maxInstructionDefs',
                  'maxStackElements', 'maxSizeOfInstructions', 'maxComponentElements', 'maxComponentDepth'):
        setattr(maxp, field, 0)
    font['post'].formatType = 3.0
    font.sfntVersion = '\x00\x01\x00\x00'

    mapping = {FIRST_CODE + index: by_code[codes[name]] for index, name in enumerate(names)}
    tables = []
    for platform, encoding in ((0, 3), (3, 1)):
        table = cmap_format_4(4)
        table.platformID, table.platEncID, table.language = platform, encoding, 0
        table.cmap = dict(mapping)
        tables.append(table)
    font['cmap'].tables = tables
    font['OS/2'].usFirstCharIndex = FIRST_CODE
    font['OS/2'].usLastCharIndex = FIRST_CODE + len(names) - 1
    font.save(FONT_OUT)


def write_table(names):
    width = max(len(name) for name in names) + 3
    lines = [
        "' Written by scripts/settings-assets.py, which also cuts fonts/SettingsIcons.ttf to match.",
        "' Run it again after naming a new glyph anywhere in settings.",
        'namespace settingsGlyphs',
        '    const FONT_URI = "pkg:/fonts/SettingsIcons.ttf"',
        '',
        '    function Table() as object',
        '        return {',
    ]
    for index, name in enumerate(names):
        comma = ',' if index < len(names) - 1 else ''
        lines.append(f'            {(chr(34) + name + chr(34) + ":").ljust(width)} &h{FIRST_CODE + index:X}{comma}')
    lines += [
        '        }',
        '    end function',
        '',
        "    ' The character that draws a glyph in the icon font, or nothing for a name it doesn't have",
        '    function Char(name as string) as string',
        '        if m.settingsGlyphTable = invalid then m.settingsGlyphTable = settingsGlyphs.Table()',
        '        code = m.settingsGlyphTable[name]',
        '        if code = invalid then return ""',
        '        return Chr(code)',
        '    end function',
        'end namespace',
        '',
    ]
    with open(TABLE_OUT, 'w') as handle:
        handle.write('\n'.join(lines))


def write_png(path, width, height, pixels):
    """Writes grey and alpha pairs, row by row, as an 8-bit PNG."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw += bytes(pixels[y][x])
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 4, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as handle:
        handle.write(png)


def rounded_distance(px, py, left, top, right, bottom, radius):
    """Signed distance from a point to a rounded rectangle, negative inside."""
    cx = min(max(px, left + radius), right - radius)
    cy = min(max(py, top + radius), bottom - radius)
    return math.hypot(px - cx, py - cy) - radius


def coverage(px, py, shape, samples=6):
    inside = 0
    for sy in range(samples):
        for sx in range(samples):
            if shape(px + (sx + 0.5) / samples, py + (sy + 0.5) / samples):
                inside += 1
    return inside / (samples * samples)


def nine_patch(path, radius, alpha_at, margin=0):
    """A white rounded shape with one stretchable pixel in the middle of each side."""
    corner = radius + margin
    content = corner * 2 + 1
    size = content + 2
    pixels = [[(0, 0)] * size for _ in range(size)]
    for y in range(content):
        for x in range(content):
            pixels[y + 1][x + 1] = (255, round(255 * alpha_at(x, y, content)))
    middle = corner + 1
    for edge in ((0, middle), (size - 1, middle)):
        pixels[edge[0]][edge[1]] = (0, 255)
        pixels[edge[1]][edge[0]] = (0, 255)
    write_png(path, size, size, pixels)


def rounded_shape(content, radius, inset=0.0):
    return lambda px, py: rounded_distance(px, py, inset, inset, content - inset, content - inset, max(radius - inset, 0)) <= 0


def write_fill(path, radius):
    nine_patch(path, radius, lambda x, y, content: coverage(x, y, rounded_shape(content, radius)))


def write_stroke(path, radius, width):
    def alpha(x, y, content):
        outer = coverage(x, y, rounded_shape(content, radius))
        inner = coverage(x, y, rounded_shape(content, radius, width))
        return max(outer - inner, 0)
    nine_patch(path, radius, alpha)


def write_square(path, corner, width=None):
    """Sharp corners for the pixel theme, filled or as a ring of the given width."""
    def alpha(x, y, content):
        def inside(inset):
            return lambda px, py: inset <= px <= content - inset and inset <= py <= content - inset
        outer = coverage(x, y, inside(0))
        if width is None:
            return outer
        return max(outer - coverage(x, y, inside(width)), 0)
    nine_patch(path, corner, alpha)


def write_glow(path, radius, sigma, spread, margin):
    """The soft halo around a focused card, tinted and faded by the Poster that draws it."""
    def alpha(x, y, content):
        distance = rounded_distance(x + 0.5, y + 0.5, margin - spread, margin - spread,
                                    content - margin + spread, content - margin + spread, radius + spread)
        return 0.5 * math.erfc(distance / (sigma * math.sqrt(2)))
    nine_patch(path, radius, alpha, margin)


def write_cover(path, radius, inset):
    """Solid outside a rounded rectangle set in by the inset, painted in the page color to round off the corners of what sits under it."""
    nine_patch(path, radius, lambda x, y, content: 1 - coverage(x, y, rounded_shape(content, radius, inset)))


def write_dot(path, diameter):
    pixels = []
    centre = diameter / 2
    for y in range(diameter):
        row = []
        for x in range(diameter):
            value = coverage(x, y, lambda px, py: math.hypot(px - centre, py - centre) <= centre)
            row.append((255, round(255 * value)))
        pixels.append(row)
    write_png(path, diameter, diameter, pixels)


def write_images():
    os.makedirs(IMAGES_OUT, exist_ok=True)
    dp = 1920 / 1150
    card = round(16 * dp)
    write_fill(os.path.join(IMAGES_OUT, 'card27.9.png'), card)
    write_stroke(os.path.join(IMAGES_OUT, 'card27s.9.png'), card, dp)
    write_stroke(os.path.join(IMAGES_OUT, 'card27s2.9.png'), card, 2 * dp)
    # A 14 unit blur is a Gaussian with a sigma of 0.57735 of it plus half a unit
    write_glow(os.path.join(IMAGES_OUT, 'glow.9.png'), card, (14 * 0.57735 + 0.5) * dp, 0.5 * dp, 44)
    tile = round(14 * dp)
    write_fill(os.path.join(IMAGES_OUT, 'tile23.9.png'), tile)
    write_stroke(os.path.join(IMAGES_OUT, 'tile23s.9.png'), tile, dp)
    bubble = round(12 * dp)
    write_fill(os.path.join(IMAGES_OUT, 'bubble20.9.png'), bubble)
    write_stroke(os.path.join(IMAGES_OUT, 'bubble20s.9.png'), bubble, dp)
    write_fill(os.path.join(IMAGES_OUT, 'pill26.9.png'), 26)
    write_stroke(os.path.join(IMAGES_OUT, 'pill26s3.9.png'), 26, 2 * dp)
    write_fill(os.path.join(IMAGES_OUT, 'round3.9.png'), 3)
    write_square(os.path.join(IMAGES_OUT, 'square.9.png'), 2)
    write_square(os.path.join(IMAGES_OUT, 'square3s.9.png'), 4, 2 * dp)
    write_dot(os.path.join(IMAGES_OUT, 'dot96.png'), 96)
    # The Glass keyboard panel and the keycaps in the keyboard hints
    keyboard = os.path.join(ROOT, 'images/keyboard')
    write_fill(os.path.join(keyboard, 'panel48.9.png'), 48)
    write_stroke(os.path.join(keyboard, 'panel48s.9.png'), 48, 2)
    write_stroke(os.path.join(keyboard, 'cap10s.9.png'), 10, 2)
    # The ring around the pills on the classic home info row, which fill with images/makd/dotspill14.9.png
    home = os.path.join(ROOT, 'images/home')
    os.makedirs(home, exist_ok=True)
    write_stroke(os.path.join(home, 'pill14s1.9.png'), 14, 1)
    write_setup_images()


def write_setup_images():
    """The setup wizard's preview stage: its 2 px ring, the corners that round off the preview, and its shadow."""
    setup = os.path.join(ROOT, 'images/setup')
    os.makedirs(setup, exist_ok=True)
    write_stroke(os.path.join(setup, 'stage24s2.9.png'), 24, 2)
    write_cover(os.path.join(setup, 'stage24cover.9.png'), 24, 2)
    # The stage shadow's 80 px blur is a Gaussian with a sigma of 40, faded out by 96 px
    write_glow(os.path.join(setup, 'stage24shadow.9.png'), 24, 40, 0, 96)
    # The previews are shrunk onto the stage, but Roku draws a 9-patch's corners at their own size,
    # so these are cut at the radii the real screens' masks (8, 14, 16 and 18) end up with there
    for radius in (4, 8, 9, 10):
        write_cover(os.path.join(setup, f'corners{radius}.9.png'), radius, 0)
    # The hairline round the detail screens' 75 px buttons, at its size on the stage
    write_stroke(os.path.join(setup, 'ring20.9.png'), 20, 1)


def main():
    names = collect_glyph_names()
    build_font(names)
    write_table(names)
    write_images()
    print(f'{len(names)} glyphs, font {os.path.getsize(FONT_OUT)} bytes')


if __name__ == '__main__':
    main()
