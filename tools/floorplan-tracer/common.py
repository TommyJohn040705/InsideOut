import pymupdf,cv2,numpy as np,json
S=3740/1224.0; OX,OY=299,242; CW,CH=3067,992
PDFS={1:'053E5_01FLR_47d0ba55',2:'053E5_02FLR_ec413b14',3:'053E5_03FLR_881a0d50',4:'053E5_04FLR_f9c8ff84',5:'053E5_05FLR_31b8c6c8',6:'053E5_06FLR_2c58d931'}
BASE=__import__('os').environ.get('PDF_DIR', 'pdfs') + '/'
def tx(p): return (p.x*S-OX, p.y*S-OY)
def bez(p0,p1,p2,p3,n=8):
  return [((1-t)**3*p0.x+3*(1-t)**2*t*p1.x+3*(1-t)*t*t*p2.x+t**3*p3.x,(1-t)**3*p0.y+3*(1-t)**2*t*p1.y+3*(1-t)*t*t*p2.y+t**3*p3.y) for t in np.linspace(0,1,n)]
def path_polys(x):
  """return list of polylines (pixel coords) for a drawing path"""
  polys=[];cur=[]
  def flush():
    nonlocal cur
    if len(cur)>1: polys.append(cur)
    cur=[]
  for it in x['items']:
    k=it[0]
    if k=='l':
      a,b=tx(it[1]),tx(it[2])
      if cur and np.hypot(cur[-1][0]-a[0],cur[-1][1]-a[1])>0.5: flush()
      if not cur: cur=[a]
      cur.append(b)
    elif k=='c':
      pts=[(q[0]*S-OX,q[1]*S-OY) for q in bez(*it[1:5])]
      if cur and np.hypot(cur[-1][0]-pts[0][0],cur[-1][1]-pts[0][1])>0.5: flush()
      if not cur: cur=[pts[0]]
      cur+=pts[1:]
    elif k=='re':
      flush();r=it[1];polys.append([tx(r.tl),tx(r.tr),tx(r.br),tx(r.bl),tx(r.tl)])
    elif k=='qu':
      flush();q=it[1];polys.append([tx(q.ul),tx(q.ur),tx(q.lr),tx(q.ll),tx(q.ul)])
  flush();return polys
def load(floor):
  d=pymupdf.open(BASE+PDFS[floor]+'.pdf');return d[0].get_drawings()
def inside(poly,m=20):
  xs=[p[0] for p in poly];ys=[p[1] for p in poly]
  return max(xs)>-m and min(xs)<CW+m and max(ys)>-m and min(ys)<CH+m
