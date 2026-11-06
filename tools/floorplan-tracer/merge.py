import json,shutil
V=__import__('os').environ.get('APP_DIR', '../..')
floors=json.load(open(f'{V}/src/data/e5/floors.json'))
graph=json.load(open(f'{V}/src/data/e5/navigationGraph.json'))
rooms=json.load(open(f'{V}/src/data/e5/rooms.json'))
hall=[];upd={};review={}
for F in range(1,7):
  d=json.load(open(f'{__import__("os").environ.get("OUT_DIR", "out")}/floor{F}.json'));hall+=d['hallways'];upd.update(d['roomUpdates']);review[F]=d['review']
  shutil.copy(f'{__import__("os").environ.get("OUT_DIR", "out")}/e5_flr{F}_map.svg',f'{V}/public/e5_flr{F}_map.svg')
for f in floors:
  n=f['floorNumber'];f['originalImageUrl']=f'/e5_flr{n}.png';f['imageUrl']=f'/e5_flr{n}_map.svg'
moved=0
for r in rooms:
  u=upd.get(r['id'])
  if not u:continue
  r['bounds']=u['bounds']
  if u['seedSource']!='json': r['coords']=u['coords'];moved+=1
graph['hallways']=hall;graph['totalCorridorNodes']=len(hall)
graph['tracedFrom']='Vector geometry of 053E5_01FLR to 06FLR PDFs (walls), OCR room labels, skeletonized corridors'
# vertical links: corridorNodeId = node that lists the room
by_room={}
for h in hall:
  for t in h['connectedTo']: by_room.setdefault(t,h['id'])
missing=[]
for l in graph['verticalLinks']:
  for n in l['nodes']:
    if n['roomId'] in by_room: n['corridorNodeId']=by_room[n['roomId']]
    else: missing.append(n['roomId'])
json.dump(floors,open(f'{V}/src/data/e5/floors.json','w'),indent=2)
json.dump(graph,open(f'{V}/src/data/e5/navigationGraph.json','w'),indent=1)
json.dump(rooms,open(f'{V}/src/data/e5/rooms.json','w'),indent=2)
print('hallway nodes',len(hall),'rooms repositioned',moved,'bounds',len(upd),'vertical link rooms not connected',missing)
print('review',review)
