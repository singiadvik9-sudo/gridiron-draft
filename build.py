import json,os,glob
R=os.path.dirname(os.path.abspath(__file__))
def rd(p): return open(os.path.join(R,p)).read()
import subprocess
# the page ships minified (esbuild: comments and spaces out, local names shortened; top-level names stay, so the scripts still find each
# other); GD_NOMIN=1 builds it as written, for reading in the browser
ESB=os.path.join(R,'node_modules/.bin/esbuild')
def mini(code, loader='js'):
    if os.environ.get('GD_NOMIN') or not os.path.exists(ESB): return code
    out=subprocess.run([ESB,'--minify','--loader='+loader,'--log-level=error','--charset=utf8'],input=code.encode('utf8'),capture_output=True)
    if out.returncode: raise SystemExit('esbuild: '+out.stderr.decode('utf8')[:2000])
    m=out.stdout.decode('utf8').strip()
    if loader=='js' and '</script' in m.lower(): raise SystemExit('a script would close its own tag')
    return m
t=rd('src/template.html')
hub='(function(){\n\'use strict\';\n'+'\n'.join(rd(f) for f in sorted(glob.glob(os.path.join(R,'src/hub/*.js'))))+'\n})();'
t=t.replace('/*CSS*/',mini(rd('src/style.css'),'css')).replace('/*DATA*/',json.dumps(json.load(open(os.path.join(R,'lib/data.json'))),separators=(',',':')).replace('</','<\\/')).replace('/*ENGINE*/',mini(rd('lib/engine.js')+'\n'+rd('lib/live.js')+'\n'+rd('lib/league.js')+'\n'+rd('lib/draft.js'))).replace('/*APP*/',mini(rd('src/game.js').replace('/*NET*/',rd('src/net.js')).replace('/*CHAT*/',rd('src/chat.js')).replace('/*DIAG*/',rd('src/diagrams.js')).replace('/*SQUAD*/',rd('src/squad.js')).replace('/*LIVE_CLIENT*/',rd('src/live_client.js')))).replace('/*HUB*/',mini(hub))
os.makedirs(os.path.join(R,'public'),exist_ok=True)
open(os.path.join(R,'public/index.html'),'w').write(t)
print(len(t),'bytes')
