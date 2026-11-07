"""Two co-managers play their campaign's game together: Ann presses Play, Bob presses Ready, and both land in the same game on their
team against the computer: Ann at quarterback calling the plays, Bob on the field. They play a few snaps; both screens agree."""
import os, sys, random
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:5055/'); errs = []
def log(*a): print(*a); sys.stdout.flush()
def ok(c, m): log(('ok   ' if c else 'FAIL ') + m); (None if c else errs.append(m))
def register(pg, name):
    pg.goto(URL); pg.wait_for_selector('[data-h=auth]'); pg.click('[data-h=auth]'); pg.click('[data-h=auth-sw]')
    pg.fill('#au-n', name); pg.fill('#au-p', 'devpass123'); pg.click('[data-h=auth-go]'); pg.wait_for_selector('[data-h=friends]', timeout=10000)
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['CDP']) if os.environ.get('CDP') else p.chromium.launch()
    ca, cb = b.new_context(viewport={'width': 1150, 'height': 950}), b.new_context(viewport={'width': 1150, 'height': 950})
    A, B = ca.new_page(), cb.new_page()
    for tag, pg in (('A', A), ('B', B)): pg.on('pageerror', lambda e, t=tag: errs.append(t + ' PAGEERROR ' + str(e))); pg.on('dialog', lambda d: d.accept()); pg.add_init_script('window.__lvSpeed=3')
    sfx = str(random.randint(1000, 9999)); an, bn = 'pa' + sfx, 'pb' + sfx
    register(A, an); register(B, bn)
    A.click('[data-h=camp]'); A.wait_for_selector('[data-h=camp-new]'); A.click('[data-h=camp-new]'); A.wait_for_selector('[data-h=camp-pick]'); A.click('[data-h=camp-pick]')
    A.wait_for_selector('[data-h=camp-share]', timeout=20000); A.click('[data-h=camp-share]'); A.wait_for_selector('#sh-name', timeout=15000)
    A.fill('#sh-name', bn); A.click('#modal [data-h=sh-inv1]:not([data-n])'); A.wait_for_timeout(800); A.evaluate("GAME.closeModal()")
    B.click('[data-h=camp]'); B.wait_for_selector('[data-h=sh-join]', timeout=10000); B.click('[data-h=sh-join]'); B.wait_for_selector('.shtop', timeout=15000)
    A.wait_for_function("document.querySelectorAll('.shtop .frdot.on').length >= 2", timeout=40000); ok(True, 'both co-managers online on the campaign page')
    A.click('[data-h=fr-tab][data-t=home]'); A.wait_for_selector('[data-h=fr-play]'); A.click('[data-h=fr-play]')
    B.wait_for_selector('[data-h=sh-ready]', timeout=15000); ok('wants to play' in B.inner_text('.shtop'), 'Bob is asked: "' + B.inner_text('.shtop .shbar').replace('\n', ' ')[:60] + '"')
    B.click('[data-h=sh-ready]')
    A.wait_for_selector('.game', timeout=25000); B.wait_for_selector('.game', timeout=25000)
    sa, sb = A.evaluate('[GAME.S.squad, GAME.S.me, GAME.S.canCall, GAME.S.code]'), B.evaluate('[GAME.S.squad, GAME.S.me, GAME.S.canCall, GAME.S.code]')
    ok(sa[0] and sb[0] and sa[1] == sb[1] and sa[3] == sb[3] and sa[2] and not sb[2], 'both in the same game, on the same team: Ann calls the plays, Bob does not (' + str(sa) + ' / ' + str(sb) + ')')
    ok(A.evaluate('!!GAME.S.ctx') and B.evaluate('!!GAME.S.ctx'), 'and it counts for the campaign')
    # a few snaps: Ann calls (kick meters stopped as they come), both play on the field; the logs must match
    for n in range(4):
        for _ in range(60):
            k = A.query_selector('#callpanel button[data-act=km-stop]')
            if k and not A.query_selector('#callpanel .call:not([disabled])'): k.click(); A.wait_for_timeout(900); continue
            if A.query_selector('#callpanel .call:not([disabled])'): break
            A.wait_for_timeout(300)
        btn = A.query_selector('#callpanel .call:not([disabled])')
        if not btn: break
        if n == 0: ok('calling the play' in B.inner_text('#callpanel').lower(), 'Bob\'s screen: "' + [l for l in B.inner_text('#callpanel').split('\n') if 'CALLING' in l.upper()][:1].__str__()[:60] + '"')
        btn.click()
        try:
            A.wait_for_function('!!window.GD_LIVE', timeout=8000); B.wait_for_function('!!window.GD_LIVE', timeout=8000)
            for pg in (A, B): pg.keyboard.down('ArrowRight'); pg.wait_for_timeout(300); pg.keyboard.up('ArrowRight')
            A.wait_for_function('!window.GD_LIVE', timeout=40000); B.wait_for_function('!window.GD_LIVE', timeout=40000)
        except Exception: pass
        A.wait_for_timeout(1200)
    la, lb = A.inner_text('#log'), B.inner_text('#log'); ok(la == lb and len(la) > 10, 'after a few snaps both screens have the same log (' + str(la.count('\n') + 1) + ' lines)')
    A.screenshot(path='shots/shared_play_A.png'); B.screenshot(path='shots/shared_play_B.png')
    ca.close(); cb.close()
log('\n'.join(errs) or 'NO ERRORS')
