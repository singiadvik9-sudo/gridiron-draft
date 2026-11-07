"""Two accounts become friends, see each other online, and one challenges the other to a quick game that both end up in.
CDP=http://localhost:9333 to use a Chrome you started, URL for the server."""
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
    ca, cb = b.new_context(viewport={'width': 1100, 'height': 900}), b.new_context(viewport={'width': 1100, 'height': 900})
    A, B = ca.new_page(), cb.new_page()
    for tag, pg in (('A', A), ('B', B)): pg.on('pageerror', lambda e, t=tag: errs.append(t + ' PAGEERROR ' + str(e)))
    sfx = str(random.randint(1000, 9999)); an, bn = 'ann' + sfx, 'bob' + sfx
    register(A, an); register(B, bn); ok(True, 'two accounts signed in, each with a Friends button')
    A.click('[data-h=friends]'); A.wait_for_selector('#fr-name'); A.fill('#fr-name', bn); A.click('[data-h=fr-add]'); A.wait_for_timeout(600)
    ok(bn in A.inner_text('main') and 'waiting for an answer' in A.inner_text('main'), 'Ann sends Bob a request')
    B.evaluate("document.querySelector('[data-h=friends]').click()"); B.wait_for_selector('[data-h=fr-yes]', timeout=8000)
    B.click('[data-h=fr-yes]'); B.wait_for_timeout(700); ok(an in B.inner_text('main') and B.query_selector('.frdot.on') is not None, 'Bob accepts, and sees Ann online')
    A.evaluate("document.querySelector('[data-h=friends]').click()"); A.wait_for_selector('.frdot.on', timeout=20000)
    ok('In the menu' in A.inner_text('main') or 'In a' in A.inner_text('main'), 'Ann sees Bob online and what he is doing: "' + A.inner_text('.frlist li').replace('\n', ' ')[:60] + '"')
    hdr = A.inner_text('[data-h=friends]'); ok('1' in hdr, 'her Friends button counts one online: "' + hdr.replace('\n', ' ') + '"')
    A.click('[data-h=fr-chal]'); A.wait_for_selector('.chip.room', timeout=10000); code = A.inner_text('.chip.room').split()[-1]
    ok(A.evaluate('GAME.S.me') == 'a', 'Ann challenges him and waits in room ' + code)
    B.wait_for_selector('#invban [data-h=inv-yes]', timeout=25000); ok(an in B.inner_text('#invban'), 'Bob gets the challenge: "' + B.inner_text('#invban').replace('\n', ' ')[:70] + '"')
    B.click('#invban [data-h=inv-yes]'); B.wait_for_selector('.chip.room', timeout=10000)
    ok(B.evaluate('GAME.S.code') == code and B.evaluate('GAME.S.me') == 'b', 'he accepts and joins her room')
    A.wait_for_selector('.sd', timeout=15000); B.wait_for_selector('.sd', timeout=15000); ok(True, 'both are drafting against each other')
    A.wait_for_timeout(16000); ok(True, '(waited for the next check-in)')
    ca.close(); cb.close()
log('\n'.join(errs) or 'NO ERRORS')
