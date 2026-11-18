import json
for F in range(1,7):
  d=json.load(open(f'{__import__("os").environ.get("OUT_DIR", "out")}/floor{F}.json'));adj={}
  def add(a,b): adj.setdefault(a,set()).add(b);adj.setdefault(b,set()).add(a)
  for h in d['hallways']:
    adj.setdefault(h['id'],set())
    for t in h['connectedTo']: add(h['id'],t)
  rooms={n for n in adj if not n.startswith(f'e5-f{F}-n')}
  seen=set();comps=[]
  for k in adj:
    if k in seen:continue
    st=[k];c=set()
    while st:
      u=st.pop()
      if u in c:continue
      c.add(u);st+=list(adj[u])
    seen|=c;comps.append(c)
  comps.sort(key=len,reverse=True)
  main=comps[0]
  off=sorted(r for r in rooms if r not in main)
  print(F,'components',len(comps),'rooms on main network',len(rooms&main),'/',len(rooms),'off:',[o.replace('e5-','') for o in off])
