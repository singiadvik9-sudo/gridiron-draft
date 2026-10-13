"""Camera angles: every 3D view renders, and the stick keys follow the camera (up is away from you, right is the screen's right).
Needs WebGL: headless Chromium gets it from SwiftShader with the flags below. Run against `node dev-server.js 5055 public_fast`."""
import sys
from playwright.sync_api import sync_playwright
URL = 'http://localhost:5055/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 1280, 'height': 720}); ctx.add_init_script('window.__lvSpeed=1'); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.type + ' ' + m.text) if m.type in ('error', 'warning') and 'Failed to load resource' not in m.text and 'GPU stall' not in m.text else None)
    pg.goto(URL); pg.wait_for_timeout(400); pg.click('[data-h=quick]'); pg.wait_for_timeout(150)
    pg.click('#b-cpu'); pg.wait_for_selector('.sd'); pg.click('[data-act=sd-auto]'); pg.wait_for_selector('.game', timeout=30000)
    pg.wait_for_selector('#callpanel .call')
    # the picker lists every view, and V cycles through them
    n = pg.evaluate("document.querySelectorAll('.vopt').length") if pg.query_selector('.vopt') else 0
    pg.click('[data-act=view-menu]'); n = pg.evaluate("document.querySelectorAll('.vopt').length"); print('views listed', n); assert n == 6
    pg.click('.vopt[data-v=side3d]'); pg.wait_for_function('GAME.Field3D.active && GAME.Field3D.figs.size > 15', timeout=20000)
    pg.keyboard.press('v'); pg.wait_for_timeout(300); assert pg.evaluate('GAME.Field.view') == 'behind', 'V cycles to the next view'
    pg.click('[data-act=ctl-toggle]')
    for v in ['behind', 'defense', 'side3d', 'player', 'top']:
        pg.click('[data-act=view-menu]'); pg.click('.vopt[data-v=%s]' % v); pg.wait_for_timeout(600)
        pg.wait_for_selector('#callpanel .call'); pg.evaluate("document.querySelector('#callpanel .call').click()")
        pg.wait_for_function('!!window.GD_LIVE', timeout=20000); pg.wait_for_timeout(800)
        o = pg.evaluate("(()=>{const L=GD_LIVE,r={dir:L.on.dir};for(const k of ['u','r']){L.held={};L.held[k]=true;r[k]=L.stick().map(x=>x+0);}L.held={};return r})()")
        D = o['dir']
        exp = {'behind': ([1, 0], [0, 1]), 'top': ([1, 0], [0, 1]), 'defense': ([-1, 0], [0, -1]), 'side3d': ([0, -D], [D, 0])}
        if v == 'player':   # follows whichever side I am
            me_off = pg.evaluate("GD_LIVE.on.me === GD_LIVE.on.off")
            exp['player'] = ([1, 0], [0, 1]) if me_off else ([-1, 0], [0, -1])
        ok = o['u'] == exp[v][0] and o['r'] == exp[v][1]
        print(v, 'dir', D, 'up', o['u'], 'right', o['r'], 'OK' if ok else 'WRONG')
        if not ok: errs.append('stick mapping wrong in ' + v)
        pg.screenshot(path='shots/view_%s.png' % v)
        pg.evaluate("GD_LIVE.hand&&GD_LIVE.hand()"); pg.wait_for_function('!window.GD_LIVE', timeout=60000); pg.wait_for_timeout(300)
    # back to the pixel view
    pg.click('[data-act=view-menu]'); pg.click('.vopt[data-v=side]'); pg.wait_for_timeout(300)
    assert not pg.evaluate('GAME.Field3D.active') and pg.evaluate("GAME.Field.cv.width") == 680
    b.close()
print('\n'.join(errs[:10]) or 'NO ERRORS')
sys.exit(1 if errs else 0)
