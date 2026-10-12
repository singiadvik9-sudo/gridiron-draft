import json,os,glob
R=os.path.dirname(os.path.abspath(__file__))
def rd(p): return open(os.path.join(R,p)).read()
t=rd('src/template.html')
hub='(function(){\n\'use strict\';\n'+'\n'.join(rd(f) for f in sorted(glob.glob(os.path.join(R,'src/hub/*.js'))))+'\n})();'
t=t.replace('/*CSS*/',rd('src/style.css')).replace('/*DATA*/',json.dumps(json.load(open(os.path.join(R,'lib/data.json'))),separators=(',',':'))).replace('/*ENGINE*/',rd('lib/engine.js')+'\n'+rd('lib/league.js')+'\n'+rd('lib/draft.js')).replace('/*APP*/',rd('src/game.js')).replace('/*HUB*/',hub)
os.makedirs(os.path.join(R,'public'),exist_ok=True)
open(os.path.join(R,'public/index.html'),'w').write(t)
print(len(t),'bytes')
