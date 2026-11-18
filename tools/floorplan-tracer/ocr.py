APP = __import__('os').environ.get('APP_DIR', '../..')
import sys,subprocess,json,re,cv2,numpy as np
f=int(sys.argv[1]);CW,CH=3067,992
png=cv2.imread(f'{APP}/public/e5_flr{f}.png',0)
big=cv2.resize(png,None,fx=2,fy=2,interpolation=cv2.INTER_CUBIC)
res={}
for rot in [0,90]:
  im=big if rot==0 else cv2.rotate(big,cv2.ROTATE_90_CLOCKWISE)
  cv2.imwrite('/tmp/o.png',im)
  out=subprocess.run(['tesseract','/tmp/o.png','-','--psm','11','-c','tessedit_char_whitelist=0123456789ABCDEF','tsv'],capture_output=True,text=True).stdout
  for line in out.splitlines()[1:]:
    p=line.split('\t')
    if len(p)<12 or not p[11].strip():continue
    t=p[11].strip();conf=float(p[10])
    if not re.fullmatch(rf'{f}\d{{3}}[A-F]?',t) or conf<40:continue
    l,tp,w,h=map(int,p[6:10]);cx,cy=(l+w/2)/2,(tp+h/2)/2
    if rot==90: # rotated cw: x_r = H-1-y, y_r = x
      cx,cy=cy,CH-cx
    if t not in res or res[t][2]<conf: res[t]=(cx,cy,conf,rot)
json.dump({k:[round(v[0]/CW*100,2),round(v[1]/CH*100,2),v[2]] for k,v in res.items()},open(f'ocr{f}.json','w'))
rooms=[r for r in json.load(open(f'{APP}/src/data/e5/rooms.json')) if r['floor']==f]
nums={r['roomNumber']:r for r in rooms if r.get('roomNumber')}
print('floor',f,'json rooms',len(rooms),'ocr labels',len(res),'matched',len(set(res)&set(nums)))
d=[]
for k in set(res)&set(nums):
  c=nums[k]['coords'];d.append(np.hypot((c['x']-res[k][0]/CW*100)*3.09,c['y']-res[k][1]/CH*100))
d=np.array(d);print('offset (height-%) median',np.median(d).round(2),'p90',np.percentile(d,90).round(2),'max',d.max().round(1))
print('ocr only',sorted(set(res)-set(nums))[:30]); print('json only',sorted(set(nums)-set(res))[:40])
