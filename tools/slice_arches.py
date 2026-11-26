"""Split the arch ornament sheet by connected shapes (pieces overlap in rows)."""
import sys, os
from collections import deque
from PIL import Image
import numpy as np

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
A = np.array(im.getchannel('A'))
H, W = A.shape
K = 4
small = A[:H // K * K, :W // K * K].reshape(H // K, K, W // K, K).max(axis=(1, 3)) > 230
h, w = small.shape
lab = np.zeros((h, w), dtype=np.int32)
comps = []
for y in range(h):
    for x in range(w):
        if small[y, x] and not lab[y, x]:
            n = len(comps) + 1
            q = deque([(y, x)])
            lab[y, x] = n
            cnt = 0
            while q:
                cy, cx = q.popleft()
                cnt += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
            comps.append(cnt)


def dilate(m, r):
    o = m.copy()
    for _ in range(r):
        p = o.copy()
        p[1:] |= o[:-1]; p[:-1] |= o[1:]; p[:, 1:] |= o[:, :-1]; p[:, :-1] |= o[:, 1:]
        o = p
    return o


big = [i + 1 for i, c in enumerate(comps) if c > 400]
# Order top-to-bottom, then right-to-left (reading order for an RTL app).
def key(n):
    ys, xs = np.nonzero(lab == n)
    return (round(ys.mean() / 30), -xs.mean())
big.sort(key=key)
os.makedirs(out, exist_ok=True)
for i, n in enumerate(big, 1):
    m = dilate(lab == n, 5)  # 5 cells * 4 px = 20 px of glow
    m &= ~dilate((lab > 0) & (lab != n), 2)  # don't pick up a neighbour's tips
    full = np.kron(m, np.ones((K, K), dtype=bool))
    mask = np.zeros((H, W), dtype=bool)
    mask[:full.shape[0], :full.shape[1]] = full
    arr = np.array(im)
    arr[..., 3] = np.where(mask, arr[..., 3], 0)
    piece = Image.fromarray(arr)
    bb = piece.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    piece = piece.crop(bb)
    name = f'arch-{i:02d}.webp'
    piece.save(os.path.join(out, name), 'WEBP', quality=90, alpha_quality=100, method=6)
    print(name, piece.size)
