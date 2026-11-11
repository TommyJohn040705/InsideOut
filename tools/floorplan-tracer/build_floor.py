"""Trace one E5 floor from its vector PDF into: wall mask, room regions, door openings,
corridor skeleton graph, clean SVG. Output in the app's cropped 3067x992 frame (percent coords)."""
APP = __import__('os').environ.get('APP_DIR', '../..')
import sys, json, re, math, subprocess
sys.path.insert(0, __import__('os').path.dirname(__file__))
from common import *
from skimage.segmentation import watershed
from skimage.morphology import skeletonize
from scipy import ndimage as ndi

F = int(sys.argv[1])
OUT = __import__('os').environ.get('OUT_DIR', 'out')
import os; os.makedirs(OUT, exist_ok=True)
PX_PER_M = 29.2

dr = load(F)
rooms_all = json.load(open(f'{APP}/src/data/e5/rooms.json'))
rooms = [r for r in rooms_all if r['floor'] == F]
byNum = {r['roomNumber']: r for r in rooms if r.get('roomNumber')}
ocr = json.load(open(f'ocr{F}.json'))

# ---------- 1. walls ----------
wall_polys = []          # exact vector polygons for SVG
walls = np.zeros((CH, CW), np.uint8)
soft = np.zeros((CH, CW), np.uint8)
ink = np.zeros((CH, CW), np.uint8)
soft_segs = []
diag_segs = []
diag_pieces = []
for x in dr:
    filled = 'f' in x['type'] and sum(x.get('fill') or (0, 0, 0)) < 1.5
    if 'f' in x['type'] and not filled: continue  # white masking shapes
    for poly in path_polys(x):
        if not inside(poly, 5):
            continue
        a = np.array(poly, np.int32)
        cv2.polylines(ink, [a], False, 255, 2)
        if filled and len(poly) > 2:
            cv2.fillPoly(walls, [a], 255)
            wall_polys.append(poly)
        elif not filled:
            # long axis-aligned straight strokes = thin partitions / glazing
            for p, q in zip(poly[:-1], poly[1:]):
                dx, dy = q[0] - p[0], q[1] - p[1]
                L = math.hypot(dx, dy)
                if L < 36:
                    continue
                ang = abs(math.degrees(math.atan2(dy, dx))) % 90
                if ang < 2 or ang > 88:
                    soft_segs.append((p, q))
                elif L > 4 and 15 < ang < 75:
                    diag_pieces.append((p, q, L))

# keep thin straight lines only if they touch a real wall (or another kept line): glazing/partitions.
near = cv2.dilate(walls, np.ones((17, 17), np.uint8)) > 0
kept = [False] * len(soft_segs)
def touches(pt, m):
    x, y = int(round(pt[0])), int(round(pt[1]))
    return 0 <= x < CW and 0 <= y < CH and m[y, x]
for _ in range(4):
    for i, (p, q) in enumerate(soft_segs):
        if not kept[i] and (touches(p, near) or touches(q, near)):
            kept[i] = True; cv2.line(soft, (int(p[0]), int(p[1])), (int(q[0]), int(q[1])), 255, 2)
    near = near | (cv2.dilate(soft, np.ones((9, 9), np.uint8)) > 0)
block = cv2.dilate(walls | soft, np.ones((3, 3), np.uint8))

# building envelope: close all ink heavily, fill holes
env = cv2.morphologyEx(walls | soft, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (301, 301)))
env = ndi.binary_fill_holes(env > 0)
_l, _n = ndi.label(env); _a = ndi.sum(env, _l, range(1, _n + 1))
env = np.isin(_l, [i + 1 for i, a in enumerate(_a) if a > 0.15 * _a.max()])
wb0 = (walls | soft)
wb_c = cv2.dilate(wb0, np.ones((1, 241), np.uint8)) > 0   # for column extents: spread sideways
wb_r = cv2.dilate(wb0, np.ones((241, 1), np.uint8)) > 0   # for row extents: spread vertically
wb = wb_c
colany = wb.any(0); rowany = wb.any(1)
first_y = np.where(colany, wb.argmax(0), CH); last_y = np.where(colany, CH - 1 - wb[::-1].argmax(0), -1)
rowany = wb_r.any(1)
first_x = np.where(rowany, wb_r.argmax(1), CW); last_x = np.where(rowany, CW - 1 - wb_r[:, ::-1].argmax(1), -1)
yy, xx = np.mgrid[0:CH, 0:CW]
scan = (yy >= first_y[None, :]) & (yy <= last_y[None, :]) & (xx >= first_x[:, None]) & (xx <= last_x[:, None])
env = env & scan
env = cv2.erode(env.astype(np.uint8) * 255, np.ones((3, 3), np.uint8)) > 0
free = env & (block == 0)
# merge collinear diagonal pieces (dashed lines) into full lines
buckets = {}
for p, q, L in diag_pieces:
    th = math.atan2(q[1] - p[1], q[0] - p[0]) % math.pi
    nx, ny = -math.sin(th), math.cos(th); rho = p[0] * nx + p[1] * ny
    buckets.setdefault((round(math.degrees(th) / 1.0), round(rho / 6)), []).append((p, q, L, th))
for k, segs in buckets.items():
    tot = sum(x[2] for x in segs)
    th = segs[0][3]; ux, uy = math.cos(th), math.sin(th)
    ts = [pt[0] * ux + pt[1] * uy for sg in segs for pt in sg[:2]]
    span = max(ts) - min(ts)
    if span > 250 and tot > 0.3 * span:
        pts = [pt for sg in segs for pt in sg[:2]]
        a = min(pts, key=lambda pt: pt[0] * ux + pt[1] * uy); b = max(pts, key=lambda pt: pt[0] * ux + pt[1] * uy)
        diag_segs.append((a, b))
# upper floors: big X marks = open-to-below voids -> not walkable
void = np.zeros((CH, CW), np.uint8)
def seg_x(a, b, c, d):
    def cr(o, p, q): return (p[0]-o[0])*(q[1]-o[1]) - (p[1]-o[1])*(q[0]-o[0])
    return cr(a, b, c) * cr(a, b, d) < 0 and cr(c, d, a) * cr(c, d, b) < 0
if F >= 2:
    for i in range(len(diag_segs)):
        for j in range(i + 1, len(diag_segs)):
            (a, b), (c, d) = diag_segs[i], diag_segs[j]
            if seg_x(a, b, c, d):
                xs = [a[0], b[0], c[0], d[0]]; ys = [a[1], b[1], c[1], d[1]]
                cv2.rectangle(void, (int(min(xs)), int(min(ys))), (int(max(xs)), int(max(ys))), 255, -1)
    free &= void == 0
print('void px', int((void > 0).sum()))

# ---------- 2. seeds ----------
def pct2px(x, y): return (x / 100 * CW, y / 100 * CH)
seeds = {}  # number -> (px,py,source)
for num, (x, y, conf) in ocr.items():
    seeds[num] = (*pct2px(x, y), 'ocr')
# fuzzy: OCR label not in app data -> nearest app room (unread so far) differing by 1 char
for num in sorted(seeds, key=lambda n: -ocr[n][2]):
    if num in byNum: continue
    cands = []
    for jn, r in byNum.items():
        if jn in seeds or len(jn) != len(num): continue
        if sum(a != b for a, b in zip(jn, num)) == 1:
            jx, jy = pct2px(r['coords']['x'], r['coords']['y'])
            d = math.hypot(jx - seeds[num][0], jy - seeds[num][1])
            if d < 220: cands.append((d, jn))
    if cands:
        jn = min(cands)[1]; seeds[jn] = (seeds[num][0], seeds[num][1], 'ocr-fuzzy')
    if not (num[1:2] == '8' and not cands): del seeds[num]
manual = json.load(open('manual.json')).get(str(F), {})
for num, (x, y) in manual.items():
    seeds[num] = (*pct2px(x, y), 'manual')
dropped = sorted(set(ocr) - set(seeds) - set(byNum))
for jn, r in byNum.items():
    if jn not in seeds:
        seeds[jn] = (*pct2px(r['coords']['x'], r['coords']['y']), 'json')

lab_cc, ncc = ndi.label(free)
dt_free = ndi.distance_transform_edt(free)
dist_to_free_idx = ndi.distance_transform_edt(~free, return_indices=True)[1]
markers = np.zeros((CH, CW), np.int32)
seed_list = []
for i, (num, (px, py, src)) in enumerate(sorted(seeds.items()), start=1):
    ix, iy = int(np.clip(px, 0, CW - 1)), int(np.clip(py, 0, CH - 1))
    if not free[iy, ix]:
        iy, ix = dist_to_free_idx[0][iy, ix], dist_to_free_idx[1][iy, ix]
    # move into the most open spot within 28 px (escape slivers between double lines / text)
    R = 28; y0, y1, x0, x1 = max(0, iy - R), min(CH, iy + R + 1), max(0, ix - R), min(CW, ix + R + 1)
    win = dt_free[y0:y1, x0:x1].copy()
    yy, xx = np.mgrid[y0:y1, x0:x1]; win[(yy - iy) ** 2 + (xx - ix) ** 2 > R * R] = 0
    if win.max() > dt_free[iy, ix] + 2:
        j = np.unravel_index(np.argmax(win), win.shape); iy, ix = y0 + j[0], x0 + j[1]
    seed_list.append({'id': i, 'num': num, 'px': float(ix), 'py': float(iy), 'src': src})
    cv2.circle(markers, (int(ix), int(iy)), 3, i, -1)
markers[~free] = 0
seeded_cc = set(np.unique(lab_cc[markers > 0])) - {0}
walk = free & np.isin(lab_cc, list(seeded_cc))

dt = ndi.distance_transform_edt(walk)
labels = watershed(-dt, markers, mask=walk)
S = {s['id']: s for s in seed_list}

HALLS = set()
def is_circ(num):
    if num in HALLS: return True
    r = byNum.get(num)
    if r and r['category'] in ('stairs', 'elevator'): return True
    return len(num) >= 2 and num[1] == '8'
def is_vertical(num):
    r = byNum.get(num); return bool(r and r['category'] in ('stairs', 'elevator'))

# ---------- 3. openings between regions ----------
pairs = {}
for dy, dx in ((0, 1), (1, 0)):
    a = labels[:CH - dy, :CW - dx]; b = labels[dy:, dx:]
    m = (a != b) & (a > 0) & (b > 0)
    ys, xs = np.nonzero(m)
    for y, x_, la, lb in zip(ys, xs, a[m], b[m]):
        k = (min(la, lb), max(la, lb)); pairs.setdefault(k, []).append((x_, y))
openings = []
for (la, lb), pts in pairs.items():
    pts = np.array(pts)
    img = np.zeros((CH, CW), np.uint8); img[pts[:, 1], pts[:, 0]] = 1
    img = cv2.dilate(img, np.ones((5, 5), np.uint8))
    n, cc = cv2.connectedComponents(img)
    for c in range(1, n):
        sel = cc[pts[:, 1], pts[:, 0]] == c
        p = pts[sel]
        if len(p) < 10: continue        # < ~0.35 m: not a real opening
        # choose boundary pixel nearest the centroid (stays inside free space)
        cx, cy = p.mean(0); j = np.argmin(((p - [cx, cy]) ** 2).sum(1))
        openings.append({'a': int(la), 'b': int(lb), 'x': float(p[j][0]), 'y': float(p[j][1]), 'w': int(len(p))})

# open halls: big non-circulation rooms that connect >=3 other rooms
cnt = {}
for o in openings:
    na, nb = S[o['a']]['num'], S[o['b']]['num']
    if not is_circ(na) and not is_circ(nb) and not is_vertical(na) and not is_vertical(nb):
        cnt[o['a']] = cnt.get(o['a'], 0) + 1; cnt[o['b']] = cnt.get(o['b'], 0) + 1
for sid, c in cnt.items():
    if c >= 3 and (labels == sid).sum() > 40000: HALLS.add(S[sid]['num'])
print('open halls', sorted(HALLS))
# ---------- 4. corridor skeleton graph ----------
circ_ids = [s['id'] for s in seed_list if is_circ(s['num'])]
circ = np.isin(labels, circ_ids)
circ_s = cv2.morphologyEx(circ.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
holes = ndi.binary_fill_holes(circ_s) & ~circ_s
hl, hn = ndi.label(holes)
if hn:
    ha = ndi.sum(holes, hl, range(1, hn + 1))
    circ_s |= np.isin(hl, [i + 1 for i, a in enumerate(ha) if a < 4000])
sk = skeletonize(circ_s)
# graph from skeleton pixels
ys, xs = np.nonzero(sk)
pix = set(zip(xs.tolist(), ys.tolist()))
def nbrs(p):
    x, y = p
    return [(x + i, y + j) for i in (-1, 0, 1) for j in (-1, 0, 1) if (i or j) and (x + i, y + j) in pix]
deg = {p: len(nbrs(p)) for p in pix}
keyp = {p for p, d in deg.items() if d != 2}
nodes = {}; edges = []
def nid(p):
    if p not in nodes: nodes[p] = len(nodes)
    return nodes[p]
visited = set()
for k in keyp:
    for n0 in nbrs(k):
        if (k, n0) in visited: continue
        path = [k, n0]; prev, cur = k, n0
        while cur not in keyp:
            nx = [q for q in nbrs(cur) if q != prev and q not in path[-3:]]
            if not nx: break
            prev, cur = cur, nx[0]; path.append(cur)
        visited.add((k, n0)); visited.add((path[-1], path[-2]) if len(path) > 1 else None)
        if len(path) < 2: continue
        # RDP simplify
        approx = cv2.approxPolyDP(np.array(path, np.int32).reshape(-1, 1, 2), 5, False).reshape(-1, 2)
        ids = [nid(tuple(map(int, q))) for q in approx]
        for u, v in zip(ids[:-1], ids[1:]):
            if u != v: edges.append((u, v))
coords = {i: p for p, i in nodes.items()}
G = {i: set() for i in coords}
for u, v in edges: G[u].add(v); G[v].add(u)

# merge nodes closer than 12px
def merge_close(G, coords, r=12):
    changed = True
    while changed:
        changed = False
        for u in list(G):
            if u not in G: continue
            for v in list(G[u]):
                if v in G and v != u and math.dist(coords[u], coords[v]) < r:
                    for w in G[v]:
                        if w != u: G[u].add(w); G[w].discard(v); G[w].add(u)
                    G[u].discard(v); del G[v]; changed = True
                    break
merge_close(G, coords)
# prune short spurs (dead ends < 25 px) repeatedly
for _ in range(3):
    for u in [u for u in G if len(G[u]) == 1]:
        v = next(iter(G[u]))
        if math.dist(coords[u], coords[v]) < 25 and len(G[v]) > 2:
            G[v].discard(u); del G[u]

def los(p, q):
    n = int(math.dist(p, q)) + 1
    for t in np.linspace(0, 1, max(n, 2)):
        x = int(round(p[0] + (q[0] - p[0]) * t)); y = int(round(p[1] + (q[1] - p[1]) * t))
        if not walk[y, x]: return False
    return True

def nearest_node(p, require_los=True, exclude=()):
    best = None; bd = 1e9
    for i in G:
        if i in exclude or i in door_set: continue
        d = math.dist(p, coords[i])
        if d < bd and (not require_los or los(p, coords[i])): bd = d; best = i
    return best

def region_of(i):
    x, y = coords[i]; return labels[int(round(y)), int(round(x))]
def nearest_in(p, reg):
    best = None; bd = 1e9
    for i in G:
        if i in door_set: continue
        if region_of(i) != reg: continue
        d = math.dist(p, coords[i])
        if d < bd and los(p, coords[i]): bd = d; best = i
    return best
# ---------- 5. doors -> graph ----------
next_id = max(coords) + 1 if coords else 0
door_nodes = {}   # opening index -> node id
door_set = set()
room_links = {}   # seed id -> list of node ids (doors)
for oi, o in enumerate(openings):
    na, nb = S[o['a']]['num'], S[o['b']]['num']
    ca, cb = is_circ(na), is_circ(nb)
    p = (o['x'], o['y'])
    if ca and cb:
        # narrow doorway between two circulation areas: link nearest node on each side through it
        ka = nearest_in(p, o['a']); kb = nearest_in(p, o['b'])
        if ka is not None and kb is not None and ka != kb:
            did = next_id; next_id += 1; coords[did] = p; G[did] = {ka, kb}; G[ka].add(did); G[kb].add(did)
        continue
    did = next_id; next_id += 1; coords[did] = p; G[did] = set(); door_nodes[oi] = did; door_set.add(did)
    if ca or cb:
        k = nearest_node(p)
        if k is None: k = nearest_node(p, False)
        door_set.add(did)
        if k is not None and k != did: G[did].add(k); G[k].add(did)
        room = o['b'] if ca else o['a']
        room_links.setdefault(room, []).append(('circ', did))
    else:
        room_links.setdefault(o['a'], []).append(('room', did, o['b']))
        room_links.setdefault(o['b'], []).append(('room', did, o['a']))

review = []
attach = {}  # seed id -> list of node ids the room connects to
for s in seed_list:
    if is_vertical(s['num']):
        k = nearest_node((s['px'], s['py'])) or nearest_node((s['px'], s['py']), False)
        attach[s['id']] = [k] if k is not None else []
        continue
    if is_circ(s['num']): continue
    links = room_links.get(s['id'], [])
    circ_doors = [l[1] for l in links if l[0] == 'circ']
    sp = (s['px'], s['py'])
    if circ_doors:
        best = min(circ_doors, key=lambda d: math.dist(sp, coords[d]))
        # also expose room-to-room doors so inner suite rooms are reachable through this room
        attach[s['id']] = [best] + [l[1] for l in links if l[0] == 'room']
    else:
        rd = [l[1] for l in links if l[0] == 'room']
        if rd:
            attach[s['id']] = rd   # suite room: reached through neighbour room
        else:
            k = nearest_node(sp, False); attach[s['id']] = [k] if k is not None else []
            review.append(s['num'])
# suite chaining: room-room door nodes connect to both rooms -> rooms appear in connectedTo
# parent rooms must accept transit: give parent its circ door too (already) - the door node lists both rooms.
for oi, o in enumerate(openings):
    if oi in door_nodes and not is_circ(S[o['a']]['num']) and not is_circ(S[o['b']]['num']):
        pass

# bridge separate corridor networks through rooms that have doors into both
def components():
    comp = {}; c = 0
    for u in G:
        if u in comp: continue
        st = [u]
        while st:
            v = st.pop()
            if v in comp: continue
            comp[v] = c; st += list(G[v])
        c += 1
    return comp
bridged = []
for _ in range(3):
    comp = components()
    for sid, links in room_links.items():
        cd = [l[1] for l in links if l[0] == 'circ']
        cs_ = {comp.get(d) for d in cd}
        if len(cs_) > 1:
            sp = (S[sid]['px'], S[sid]['py'])
            hub = next_id; next_id += 1; coords[hub] = sp; G[hub] = set(cd)
            for d in cd: G[d].add(hub)
            bridged.append(S[sid]['num'])
    # vertical rooms whose node sits in a tiny island: link island to nearest main-network node
    comp = components()
    sizes = {}
    for v, c in comp.items(): sizes[c] = sizes.get(c, 0) + 1
    main_c = max(sizes, key=sizes.get)
    for c in sizes:
        if c == main_c: continue
        isl = [v for v in comp if comp[v] == c]
        best = None
        for a in isl:
            for b in G:
                if comp.get(b) != main_c: continue
                d = math.dist(coords[a], coords[b])
                if d < 90 and (best is None or d < best[0]) and los(coords[a], coords[b]): best = (d, a, b)
        if best: G[best[1]].add(best[2]); G[best[2]].add(best[1])
print('bridged through rooms', sorted(set(bridged)))
comp = components(); sizes = {}
for v, c in comp.items(): sizes[c] = sizes.get(c, 0) + 1
main_c = max(sizes, key=sizes.get)
for sv in seed_list:
    if not is_vertical(sv['num']): continue
    sp = (sv['px'], sv['py'])
    cand = sorted((math.dist(sp, coords[i]), i) for i in G if comp.get(i) == main_c and i not in door_set)
    pick = next((i for d, i in cand[:40] if los(sp, coords[i])), None)
    if pick is None and cand and cand[0][0] < 220: pick = cand[0][1]
    if pick is not None: attach[sv['id']] = [pick]
    else: review.append(sv['num'])
# ---------- 6. export in app format ----------
def pct(p): return {'x': round(p[0] / CW * 100, 2), 'y': round(p[1] / CH * 100, 2)}
room_id_of = {s['id']: byNum[s['num']]['id'] for s in seed_list if s['num'] in byNum}
connected = {i: [f'e5-f{F}-n{j}' for j in sorted(G[i])] for i in G}
for sid, nlist in attach.items():
    rid = room_id_of.get(sid)
    if not rid: continue
    for n in nlist:
        if n in connected and rid not in connected[n]: connected[n].append(rid)
# drop nodes that link to nothing
alive = {i for i in G if connected[i]}
for i in alive:
    connected[i] = [t for t in connected[i] if not t.startswith(f'e5-f{F}-n') or int(t.split('-n')[1]) in alive]
hallways = []
for i in alive:
    hallways.append({'id': f'e5-f{F}-n{i}', 'coords': pct(coords[i]), 'label': f'Floor {F} traced node', 'floor': F,
                     'connectedTo': connected[i]})
# room coordinate + bounds updates
room_updates = {}
for s in seed_list:
    if s['num'] not in byNum: continue
    m = labels == s['id']
    if not m.any(): continue
    ys_, xs_ = np.nonzero(m)
    room_updates[byNum[s['num']]['id']] = {
        'coords': pct((s['px'], s['py'])) if s['src'] != 'json' else byNum[s['num']]['coords'],
        'bounds': {'x': round(xs_.min() / CW * 100, 2), 'y': round(ys_.min() / CH * 100, 2),
                   'width': round((xs_.max() - xs_.min()) / CW * 100, 2), 'height': round((ys_.max() - ys_.min()) / CH * 100, 2)},
        'seedSource': s['src']}

# ---------- 7. clean SVG ----------
CAT_COL = {'classroom': '#fde68a', 'conference': '#fde68a', 'lab': '#bbf7d0', 'workshop': '#bbf7d0', 'office': '#c7d2fe',
           'restroom': '#bae6fd', 'elevator': '#e9d5ff', 'stairs': '#e9d5ff', 'study': '#fef3c7', 'dining': '#fef3c7',
           'utility': '#e5e7eb', 'entrance': '#f1f5f9', 'exit': '#f1f5f9', 'bridge': '#f1f5f9', 'other': '#e5e7eb'}
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CW} {CH}" width="{CW}" height="{CH}">',
         '<rect width="100%" height="100%" fill="none"/>']
# building floor
cs, _ = cv2.findContours(walk.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
for c in cs:
    if cv2.contourArea(c) < 200: continue
    parts.append('<path fill="#ffffff" d="M' + ' L'.join(f'{p[0][0]},{p[0][1]}' for p in c) + 'Z"/>')
# rooms
for s in seed_list:
    m = (labels == s['id']).astype(np.uint8)
    if not m.any(): continue
    circ_r = is_circ(s['num'])
    cat = byNum[s['num']]['category'] if s['num'] in byNum else ('corridor' if circ_r else 'other')
    col = '#eef2f7' if (circ_r and s['num'] not in HALLS) else CAT_COL.get(cat, '#e5e7eb')
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in cs:
        if cv2.contourArea(c) < 80: continue
        c = cv2.approxPolyDP(c, 1.5, True)
        parts.append(f'<path data-room="{s["num"]}" fill="{col}" d="M' + ' L'.join(f'{p[0][0]},{p[0][1]}' for p in c) + 'Z"/>')
# walls (exact vectors)
parts.append('<g fill="#334155">')
for poly in wall_polys:
    parts.append('<path d="M' + ' L'.join(f'{p[0]:.1f},{p[1]:.1f}' for p in poly) + 'Z"/>')
parts.append('</g>')
# soft partitions
parts.append('<g stroke="#64748b" stroke-width="3" stroke-linecap="square">')
for i, (p, q) in enumerate(soft_segs):
    if kept[i]: parts.append(f'<line x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{q[0]:.1f}" y2="{q[1]:.1f}"/>')
parts.append('</g>')
if (void > 0).any():
    cs, _ = cv2.findContours(void, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in cs:
        x, y, w, h = cv2.boundingRect(c)
        if not env[min(CH - 1, y + h // 2), min(CW - 1, x + w // 2)]: continue
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="10 8"/>')
        parts.append(f'<text x="{x + w/2:.0f}" y="{y + h/2:.0f}" font-family="Inter,Arial,sans-serif" font-size="22" fill="#94a3b8" text-anchor="middle">OPEN TO BELOW</text>')
open(f'{OUT}/e5_flr{F}_map.svg', 'w').write('\n'.join(parts + ['</svg>']))   # app version: no labels
# labels
parts.append('<g font-family="Inter,Arial,sans-serif" font-size="17" font-weight="600" fill="#1e293b" text-anchor="middle">')
for s in seed_list:
    if is_circ(s['num']) and s['num'] not in byNum: continue
    parts.append(f'<text x="{s["px"]:.0f}" y="{s["py"] + 6:.0f}">{s["num"]}</text>')
parts.append('</g></svg>')
open(f'{OUT}/e5_flr{F}_clean.svg', 'w').write('\n'.join(parts))

json.dump({'floor': F, 'hallways': hallways, 'roomUpdates': room_updates, 'review': review,
           'seeds': seed_list, 'openings': len(openings)}, open(f'{OUT}/floor{F}.json', 'w'))
np.save(f'{OUT}/labels{F}.npy', labels)
cv2.imwrite(f'{OUT}/walk{F}.png', walk.astype(np.uint8) * 255)
print(f'floor {F}: seeds {len(seed_list)} (ocr {sum(s["src"]!="json" for s in seed_list)}), openings {len(openings)}, '
      f'graph nodes {len(G)}, edges {sum(len(v) for v in G.values())//2}, review {review}, dropped OCR {dropped}')
