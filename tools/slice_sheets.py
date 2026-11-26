"""Slice the supplied ornament sprite sheets into one transparent WebP per piece.

Bands are found from the alpha channel (solid pixels only, so the soft glow
doesn't merge neighbours), then each crop is grown to include its glow but
never past the midpoint to the next piece.
"""
import sys, os
from PIL import Image
import numpy as np

UP = sys.argv[1]
OUT = sys.argv[2]
SHEETS = [
    ('5f92a610-image.png', 'crown'),
    ('a388e9e5-image.png', 'plate'),
    ('0dbc1b5a-image.png', 'arch'),
    ('ba405ee7-image.png', 'divider'),
]


def runs(mask, min_len, min_gap):
    out, start, gap = [], None, 0
    for i, v in enumerate(mask):
        if v:
            if start is None:
                start = i
            gap = 0
            end = i
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                if end - start + 1 >= min_len:
                    out.append([start, end])
                start = None
    if start is not None and end - start + 1 >= min_len:
        out.append([start, end])
    return out


def spans_with_room(spans, total, pad):
    res = []
    for k, (a, b) in enumerate(spans):
        lo = 0 if k == 0 else (spans[k - 1][1] + a) // 2
        hi = total - 1 if k == len(spans) - 1 else (b + spans[k + 1][0]) // 2
        res.append((max(lo, a - pad), min(hi, b + pad)))
    return res


os.makedirs(OUT, exist_ok=True)
for fname, prefix in SHEETS:
    im = Image.open(os.path.join(UP, fname)).convert('RGBA')
    a = np.array(im.getchannel('A'))
    solid = a > 230
    H, W = a.shape
    rows = runs(solid.sum(1) > 0, 12, 1)
    rows = spans_with_room(rows, H, 18)
    n = 0
    for (r0, r1) in rows:
        band = solid[r0:r1 + 1]
        cols = runs(band.sum(0) > 0, 40, 25)
        cols = spans_with_room(cols, W, 18)
        for (c0, c1) in cols:
            crop = im.crop((c0, r0, c1 + 1, r1 + 1))
            bb = crop.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
            if not bb:
                continue
            crop = crop.crop(bb)
            n += 1
            name = f'{prefix}-{n:02d}.webp'
            crop.save(os.path.join(OUT, name), 'WEBP', lossless=False, quality=90, alpha_quality=100, method=6)
            print(name, crop.size)
