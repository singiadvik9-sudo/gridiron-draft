"""Human v Human online, dice only: kickoff choice for the kicker, waiting panel for the receiver, same log on both screens."""
import random, sys
from playwright.sync_api import sync_playwright
errs = []
URL = 'http://localhost:5055/'
def log(*a): print(*a); sys.stdout.flush()
def state(pg):
    if pg.query_selector('.final'): return 'final'
    if pg.query_selector('#callpanel .call[data-id=KO]'): return 'kick'
    t = pg.text_content('#callpanel') if pg.query_selector('#callpanel') else ''
    if 'You receive the kick' in t: return 'recv'
    if pg.query_selector('#callpanel .call:not([disabled])'): return 'call'
    return 'busy'
with sync_playwright() as p:
    b = p.chromium.launch(); pages = []
    for tag in 'AB':
        ctx = b.new_context(viewport={'width': 1100, 'height': 1000}); ctx.add_init_script('window.__lvSpeed=8')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e, t=tag: errs.append(t + ' PAGEERROR ' + str(e)))
        pg.on('console', lambda m, t=tag: errs.append(t + ' CONSOLE ' + m.text) if m.type == 'error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.goto(URL); pg.wait_for_timeout(400); pg.click('[data-h=quick]'); pg.wait_for_timeout(150); pages.append(pg)
    A, B = pages
    A.fill('#team', 'Alpha'); A.click('#b-create'); A.wait_for_selector('.chip.room'); code = A.inner_text('.chip.room').split()[-1]
    B.fill('#team', 'Bravo'); B.fill('#code', code); B.click('#b-join'); B.wait_for_selector('.chip.room')
    A.wait_for_selector('.sd'); B.wait_for_selector('.sd')
    for pg in (A, B): pg.click('[data-act=sd-auto]')
    A.wait_for_selector('.game', timeout=30000); B.wait_for_selector('.game', timeout=30000)
    kicks = 0; want = ['ONSIDE', 'KO', 'KO', 'ONSIDE']
    for n in range(300):
        for k in range(300):
            sa, sb = state(A), state(B)
            if 'final' in (sa, sb): break
            if (sa in ('call', 'kick') or sb in ('call', 'kick')) and 'busy' not in (sa, sb): break
            A.wait_for_timeout(100)
        else:
            A.screenshot(path='shots/kick2_stuck_A.png'); errs.append('stuck %s %s' % (sa, sb)); break
        if 'final' in (sa, sb): break
        for pg, s in ((A, sa), (B, sb)):
            if s == 'kick':
                other = B if pg is A else A
                assert state(other) == 'recv', 'receiver should be waiting: ' + state(other)
                pick = want[kicks % 4]; kicks += 1
                pg.evaluate("document.querySelector('#callpanel .call[data-id=%s]').click()" % pick); log('kick', pick)
                A.wait_for_timeout(800)
            elif s == 'call':
                if pg.query_selector('[data-act=ctl-toggle].on'): pg.click('[data-act=ctl-toggle]')
                ids = pg.evaluate("Array.from(document.querySelectorAll('#callpanel .call:not([disabled])')).map(b=>b.dataset.id)")
                pg.evaluate("document.querySelector('#callpanel .call[data-id=%s]').click()" % random.choice(ids))
        A.wait_for_timeout(300)
        if kicks >= 4: 
            A.wait_for_timeout(2500); break
    A.wait_for_timeout(1500)
    la, lb = A.inner_text('#log'), B.inner_text('#log')
    log('kicks', kicks, 'same log', la == lb, '|', A.inner_text('#banner .bn-text'))
    if la != lb: errs.append('log mismatch'); log(la); log(lb)
    if kicks < 2: errs.append('too few kicks')
    b.close()
log('\n'.join(errs[:20]) or 'NO ERRORS')
