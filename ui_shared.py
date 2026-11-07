"""Two friends run one campaign: Ann shares hers and invites Bob; he joins; a lineup change shows up on both screens with a line in the
feed; cutting a star waits for a yes; simulating waits until both are ready; they chat. CDP / URL as in the other UI tests."""
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
    for tag, pg in (('A', A), ('B', B)): pg.on('pageerror', lambda e, t=tag: errs.append(t + ' PAGEERROR ' + str(e))); pg.on('dialog', lambda d: d.accept())
    sfx = str(random.randint(1000, 9999)); an, bn = 'sa' + sfx, 'sb' + sfx
    register(A, an); register(B, bn)
    # Ann: a new campaign, then Share
    A.click('[data-h=camp]'); A.wait_for_selector('[data-h=camp-new]'); A.click('[data-h=camp-new]'); A.wait_for_selector('[data-h=camp-pick]'); A.click('[data-h=camp-pick]')
    A.wait_for_selector('[data-h=camp-share]', timeout=20000); A.click('[data-h=camp-share]')
    A.wait_for_selector('#sh-name', timeout=15000); ok('shared campaign' in A.inner_text('.frmeta').lower(), 'Ann shares her campaign; the invite box opens')
    A.fill('#sh-name', bn); A.click('#modal [data-h=sh-inv1]:not([data-n])'); A.wait_for_timeout(800); A.evaluate("GAME.closeModal()")
    # Bob: Campaign -> invitation -> Join
    B.click('[data-h=camp]'); B.wait_for_selector('[data-h=sh-join]', timeout=10000); ok(an in B.inner_text('#shsec'), 'Bob finds the invitation under Campaign')
    B.click('[data-h=sh-join]'); B.wait_for_selector('.shtop', timeout=15000); ok(an in B.inner_text('.shtop') and bn in B.inner_text('.shtop'), 'he joins: both names at the top')
    # Bob makes a backup a starter (roster tab); Ann sees it within a few seconds, with a feed line
    B.click('[data-h=fr-tab][data-t=roster]'); B.wait_for_selector('[data-h=fr-st]')
    name = B.evaluate("(() => { const b = [...document.querySelectorAll('[data-h=fr-st]')].find(x => /start/i.test(x.textContent) && !x.disabled); return b ? (b.click(), b.closest('tr').querySelector('.nm, td:nth-child(2)').innerText) : null; })()")
    A.wait_for_function("document.querySelector('.shfeed') && /starter/.test(document.querySelector('.shfeed').innerText)", timeout=15000)
    ok(bn in A.inner_text('.shfeed li'), 'Ann sees Bob\'s change in the feed: "' + A.inner_text('.shfeed li').replace('\n', ' ')[:70] + '"')
    # Ann cuts her best player: it waits for Bob
    A.click('[data-h=fr-tab][data-t=roster]'); A.wait_for_selector('[data-h=fr-rel]')
    A.evaluate("(() => { const bs = [...document.querySelectorAll('[data-h=fr-rel]')]; const best = bs.map(b => [b, +((b.closest('tr').innerText.match(/\\b(9\\d|8\\d)\\b/) || [0, 0])[1])]).sort((x, y) => y[1] - x[1])[0]; best[0].click(); })()")
    B.wait_for_selector('[data-h=sh-yes]', timeout=15000); ok('wants to release' in B.inner_text('.shtop'), 'Bob is asked: "' + B.inner_text('.shbar.pend').replace('\n', ' ')[:80] + '"')
    B.click('[data-h=sh-yes]'); A.wait_for_function("document.querySelector('.shfeed').innerText.indexOf('approved') >= 0", timeout=15000); ok(True, 'he approves; Ann sees it go through')
    # simulating: Ann asks, Bob is online, so it waits for him
    A.click('[data-h=fr-tab][data-t=home]'); A.wait_for_selector('[data-h=fr-sim]'); wk = A.inner_text('.frmeta')
    A.click('[data-h=fr-sim]'); B.wait_for_selector('[data-h=sh-ready]', timeout=15000); ok('wants to simulate' in B.inner_text('.shtop'), 'Bob gets the ready check: "' + B.inner_text('.shtop .shbar').replace('\n', ' ')[:70] + '"')
    B.click('[data-h=sh-ready]'); A.wait_for_function("document.querySelector('.frmeta').innerText !== %r" % wk, timeout=20000)
    ok(True, 'both ready: the week is played (' + wk.split('\n')[1] + ' -> ' + A.inner_text('.frmeta').split('\n')[1] + ')')
    # chat
    A.click('#chatdock .chat-tab'); A.fill('#chatdock input', 'good call on the cut'); A.press('#chatdock input', 'Enter')
    B.wait_for_function("document.querySelector('#chatdock .chat-badge') && !document.querySelector('#chatdock .chat-badge').hidden || (document.querySelector('#chatdock .chat-log') && document.querySelector('#chatdock .chat-log').innerText.indexOf('good call') >= 0)", timeout=15000)
    B.click('#chatdock .chat-tab'); B.wait_for_function("document.querySelector('#chatdock .chat-log').innerText.indexOf('good call') >= 0", timeout=15000); log('B chat:', B.inner_text('#chatdock .chat-log').replace('\n', ' | ')[:300]); ok('good call on the cut' in B.inner_text('#chatdock .chat-log') and 'wants to release' in B.inner_text('#chatdock .chat-log'), 'they chat, and the approval requests are in the chat too')
    A.screenshot(path='shots/shared_A.png')
    ca.close(); cb.close()
log('\n'.join(errs) or 'NO ERRORS')
