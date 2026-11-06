"""OCR room labels on a de-cluttered render: remove walls + any straight segment longer than 40px."""
APP = __import__('os').environ.get('APP_DIR', '../..')
import sys,subprocess,json,re,math;sys.path.insert(0, __import__('os').path.dirname(__file__))
from common import *
F=int(sys.argv[1]);dr=load(F)
png=cv2.imread(f'{APP}/public/e5_flr{F}.png',0)
mask=np.zeros((CH,CW),np.uint8)
for x in dr:
  filled='f' in x['type']
  for poly in path_polys(x):
    if not inside(poly,5):continue
    a=np.array(poly,np.int32)
    if filled and len(poly)>2: cv2.fillPoly(mask,[a],255); cv2.polylines(mask,[a],True,255,3)
    for p,q in zip(poly[:-1],poly[1:]):
      if math.dist(p,q)>40: cv2.line(mask,(int(p[0]),int(p[1])),(int(q[0]),int(q[1])),255,3)
    # arcs / door swings: long polylines made of many short pieces
    L=sum(math.dist(p,q) for p,q in zip(poly[:-1],poly[1:]))
    if len(poly)>6 and L>90: cv2.polylines(mask,[a],False,255,3)
clean=png.copy();clean[mask>0]=255
cv2.imwrite(f'clean_ocr{F}.png',clean)
big=cv2.resize(clean,None,fx=2.5,fy=2.5,interpolation=cv2.INTER_CUBIC)
res={}
for rot in [0,90,270]:
  im={0:big,90:cv2.rotate(big,cv2.ROTATE_90_CLOCKWISE),270:cv2.rotate(big,cv2.ROTATE_90_COUNTERCLOCKWISE)}[rot]
  cv2.imwrite('/tmp/o.png',im)
  for psm in ['11','12']:
    out=subprocess.run(['tesseract','/tmp/o.png','-','--psm',psm,'-c','tessedit_char_whitelist=0123456789ABCDEF','tsv'],capture_output=True,text=True).stdout
    for line in out.splitlines()[1:]:
      p=line.split('\t')
      if len(p)<12 or not p[11].strip():continue
      t=p[11].strip();conf=float(p[10])
      if not re.fullmatch(rf'{F}\d{{3}}[A-F]?',t) or conf<35:continue
      l,tp,w,h=map(int,p[6:10]);cx,cy=(l+w/2)/2.5,(tp+h/2)/2.5
      if rot==90: cx,cy=cy,CH-cx
      if rot==270: cx,cy=CW-cy,cx
      if t not in res or res[t][2]<conf: res[t]=(cx,cy,conf,rot)
old=json.load(open(f'ocr{F}.json')) if __import__('os').path.exists(f'ocr{F}.json') else {}
out={k:[round(v[0]/CW*100,2),round(v[1]/CH*100,2),v[2]] for k,v in res.items()}
for k,v in old.items():
  if k not in out: out[k]=v
json.dump(out,open(f'ocr{F}.json','w'))
rooms={r['roomNumber'] for r in json.load(open(f'{APP}/src/data/e5/rooms.json')) if r['floor']==F}
print(F,'labels',len(out),'new vs old',sorted(set(out)-set(old)),'json missing',sorted(rooms-set(out)))
