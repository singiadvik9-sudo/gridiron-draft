"""Smoke: a whole practice game against the computer (play calls only), then every campaign screen and a few simulated games, the
other hub pages; any script error on the way fails it. CDP / URL as in the other UI tests."""
import os, sys
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:5055/'); errs = []
def log(*a): print(*a); sys.stdout.flush()
def ok(c, m): log(('ok   ' if c else 'FAIL ') + m); (None if c else errs.append(m))
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['CDP']) if os.environ.get('CDP') else p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1150, 'height': 950}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'ERR_' not in m.text else None)
    pg.add_init_script('window.__lvSpeed=6'); pg.goto(URL); pg.wait_for_selector('[data-h=quick]')
    pg.click('[data-h=quick]'); pg.wait_for_selector('#b-cpu'); pg.click('#b-cpu'); pg.wait_for_selector('.sd, .game', timeout=20000)
    if pg.query_selector('[data-act=sd-auto]'): pg.click('[data-act=sd-auto]')
    pg.wait_for_selector('.game', timeout=30000)
    if pg.evaluate("document.querySelector('[data-act=ctl-toggle]') && document.querySelector('[data-act=ctl-toggle]').classList.contains('on')"): pg.click('[data-act=ctl-toggle]')
    calls = 0
    for _ in range(2500):
        if pg.query_selector('.final'): break
        k = pg.query_selector('#callpanel button[data-act=km-stop]')
        if k and not pg.query_selector('#callpanel .call:not([disabled])'):
            try: k.click()
            except Exception: pass
            pg.wait_for_timeout(250); continue
        c = pg.query_selector('#callpanel .call:not([disabled])')
        if c:
            try: c.click(); calls += 1
            except Exception: pass
        pg.wait_for_timeout(60)
    ok(pg.query_selector('.final') is not None, 'a whole game against the computer, to the final (' + str(calls) + ' calls): ' + (pg.inner_text('.final h2') if pg.query_selector('.final') else 'not finished'))
    pg.click('[data-act=stats]') if pg.query_selector('[data-act=stats]') else None; pg.wait_for_timeout(300); pg.evaluate("GAME.closeModal()")
    pg.click('[data-act=leave]'); pg.wait_for_selector('[data-h=home]', timeout=10000); pg.click('[data-h=home]'); pg.wait_for_selector('[data-h=camp]', timeout=10000)
    # campaign: every tab, a player card, a few simulated games
    pg.click('[data-h=camp]'); pg.wait_for_selector('[data-h=camp-new]'); pg.click('[data-h=camp-new]'); pg.wait_for_selector('[data-h=camp-pick]'); pg.click('[data-h=camp-pick]')
    pg.wait_for_selector('[data-h=fr-tab]', timeout=20000)
    for t in pg.evaluate("[...document.querySelectorAll('[data-h=fr-tab]')].map(b => b.dataset.t)"):
        pg.click('[data-h=fr-tab][data-t=%s]' % t); pg.wait_for_timeout(250)
    ok(True, 'every campaign tab opens')
    pg.click('[data-h=fr-tab][data-t=roster]'); pg.wait_for_timeout(200)
    if pg.query_selector('[data-h=fr-pl]'): pg.click('[data-h=fr-pl] >> nth=0'); pg.wait_for_timeout(300); pg.evaluate("GAME.closeModal()")
    pg.click('[data-h=fr-tab][data-t=home]')
    for i in range(3):
        pg.wait_for_selector('[data-h=fr-sim]', timeout=15000); pg.click('[data-h=fr-sim]')
        pg.wait_for_function("!document.getElementById('simov') || document.getElementById('simov').hidden", timeout=30000); pg.wait_for_timeout(400)
        for _ in range(3):
            q = pg.query_selector('.panel.press [data-h=press]')
            if q: q.click(); pg.wait_for_timeout(250)
    ok('WEEK 4' in pg.inner_text('.frmeta').upper(), 'three simulated games: ' + pg.inner_text('.frmeta').replace('\n', ' '))
    pg.click('[data-h=camp-exit]'); pg.wait_for_timeout(800)
    for h in ('home', 'changes'):
        if pg.query_selector('[data-h=%s]' % h): pg.click('[data-h=%s]' % h); pg.wait_for_timeout(400); pg.evaluate("GAME.closeModal()")
    ok(True, 'the other pages open')
    ctx.close()
ok(not errs, 'no script errors' + (': ' + ' | '.join(errs[:5]) if errs else ''))
log('\n'.join(errs) or 'NO ERRORS')
