"""Genera las imágenes para compartir (Open Graph) a partir de tools/og-list.json.
Uso: python3 tools/og.py <carpeta con las fuentes woff de Bricolage Grotesque y Atkinson Hyperlegible>"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
F = sys.argv[1]
disp = lambda s: ImageFont.truetype(os.path.join(F, 'bricolage-grotesque-latin-800-normal.woff'), s)
body = lambda s: ImageFont.truetype(os.path.join(F, 'atkinson-hyperlegible-latin-700-normal.woff'), s)
W, H, M = 1200, 630, 76
for it in json.load(open('tools/og-list.json', encoding='utf8')):
    im = Image.new('RGB', (W, H), '#19212b'); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 22, H], fill=it['color'])
    d.text((M, 70), it['kicker'], font=body(25), fill='#5cc3c8', spacing=4)
    size = 96
    while size > 48 and max(d.textlength(it['l1'], font=disp(size)), d.textlength(it['l2'], font=disp(size))) > W - 2 * M: size -= 2
    f = disp(size); y = 190 if size > 80 else 205
    d.text((M, y), it['l1'], font=f, fill='#ffffff')
    y2 = y + int(size * 1.12); w2 = d.textlength(it['l2'], font=f)
    d.rectangle([M - 8, y2 + int(size * .62), M + w2 + 8, y2 + int(size * 1.08)], fill='#d93a26')
    d.text((M, y2), it['l2'], font=f, fill='#ffffff')
    pf = disp(40); pw = d.textlength('loquenocuentan.com', font=pf)
    d.rounded_rectangle([M, 484, M + pw + 56, 566], radius=14, fill='#ffd23f')
    d.text((M + 28, 500), 'loquenocuentan.com', font=pf, fill='#19212b')
    ff = body(24); x = M + pw + 56 + 36
    words, lines, cur = it['foot'].split(), [], ''
    for w in words:
        if d.textlength((cur + ' ' + w).strip(), font=ff) > W - M - x: lines.append(cur); cur = w
        else: cur = (cur + ' ' + w).strip()
    lines.append(cur)
    for i, ln in enumerate(lines[:2]): d.text((x, 525 - 17 * len(lines[:2]) + i * 34), ln, font=ff, fill='#c9d3dc')
    os.makedirs(os.path.dirname(it['file']), exist_ok=True)
    im.save(it['file'], optimize=True)
print('ok')
