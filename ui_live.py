"""Human v Human with live control: two browsers, one room, several snaps run on the field.
Checks that both screens end every snap with the same result, the same recorded inputs and the same log."""
import random, json, sys
from playwright.sync_api import sync_playwright
errs = []
URL = 'http://localhost:5055/'
SPEED = 3
def log(*a): print(*a); sys.stdout.flush()

def role(pg):
    t = pg.inner_text('#callpanel .role') if pg.query_selector('#callpanel .role') else ''
    return t
def wait_call(pg, timeout=20000):
    pg.wait_for_selector('#callpanel .call:not([disabled]), .final', timeout=timeout)

def set_ctl(pg, on):
    cur = pg.evaluate("document.querySelector('[data-act=ctl-toggle]') && document.querySelector('[data-act=ctl-toggle]').classList.contains('on')")
    if cur != on: pg.click('[data-act=ctl-toggle]')
    pg.wait_for_timeout(50)

def pick(pg, off_id, def_id):
    ids = pg.evaluate("Array.from(document.querySelectorAll('#callpanel .call:not([disabled])')).map(b=>b.dataset.id)")
    if not ids: return None
    if 'STACK' in ids or 'ZONE' in ids:
        want = def_id if def_id in ids else ids[0]
    else:
        want = off_id if off_id in ids else [i for i in ids if i not in ('PUNT', 'FG')][0]
    pg.click('#callpanel .call[data-id=' + want + ']')
    return want

def drive(pg, is_off, steps):
    """Press keys on the field while the snap is live. steps: list of (ms, key)."""
    for ms, key in steps:
        if not pg.evaluate('!!window.GD_LIVE'): return
        pg.wait_for_timeout(ms); pg.keyboard.press(key)

with sync_playwright() as p:
    b = p.chromium.launch()
    pages = []
    for tag in 'AB':
        ctx = b.new_context(viewport={'width': 1100, 'height': 1000})
        ctx.add_init_script('window.__lvSpeed=%d' % SPEED)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e, t=tag: errs.append(t + ' PAGEERROR ' + str(e)))
        pg.on('console', lambda m, t=tag: errs.append(t + ' CONSOLE ' + m.text) if m.type == 'error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.goto(URL); pg.wait_for_timeout(400); pg.click('[data-h=quick]'); pg.wait_for_timeout(150)
        pages.append(pg)
    A, B = pages
    A.fill('#team', 'Alpha'); A.click('#b-create'); A.wait_for_selector('.chip.room')
    code = A.inner_text('.chip.room').split()[-1]; log('room', code)
    B.fill('#team', 'Bravo'); B.fill('#code', code); B.click('#b-join'); B.wait_for_selector('.chip.room')
    A.wait_for_selector('.sd'); B.wait_for_selector('.sd')
    for pg in (A, B): pg.click('[data-act=sd-auto]')
    A.wait_for_selector('.game', timeout=30000); B.wait_for_selector('.game', timeout=30000)
    log('both in the game')

    combos = [(1, 1), (1, 0), (0, 1), (1, 1), (1, 1), (0, 0), (1, 1), (1, 1), (1, 1), (1, 1)]
    done_live = 0
    for n, (ca, cb) in enumerate(combos):
        wait_call(A); wait_call(B)
        if A.query_selector('.final'): break
        set_ctl(A, bool(ca)); set_ctl(B, bool(cb))
        ra, rb = role(A), role(B)
        offp, defp = (A, B) if 'ball' in ra.lower() else (B, A)
        offc, defc = (ca, cb) if 'ball' in ra.lower() else (cb, ca)
        # kick plays cannot be played live; the pick helper avoids them
        o_id = random.choice(['PASS_S', 'PASS_M', 'PASS_D', 'RUN_IN', 'RUN_OUT', 'SCREEN', 'PASS_M', 'PASS_S'])
        d_id = random.choice(['ZONE', 'MAN', 'STACK', 'BLITZ'])
        po = pick(offp, o_id, None); pd = pick(defp, None, d_id)
        log('play', n, 'offense', po, '(controlled=%s)' % bool(offc), 'defense', pd, '(controlled=%s)' % bool(defc))
        live = bool(offc or defc)
        if live:
            A.wait_for_function('!!window.GD_LIVE', timeout=15000); B.wait_for_function('!!window.GD_LIVE', timeout=15000)
            if n == 0:
                A.wait_for_timeout(700); A.screenshot(path='shots/live_A.png'); B.screenshot(path='shots/live_B.png')
            def hold(pg, key, ms):
                if not pg.evaluate('!!window.GD_LIVE'): return
                pg.keyboard.down(key); pg.wait_for_timeout(ms); pg.keyboard.up(key)
            seq_o = [('ArrowRight', 350), ('ArrowDown', 250), ('DIGIT', 0), ('ArrowRight', 500), (' ', 0), ('ArrowUp', 300), ('ArrowRight', 600)]
            seq_d = [('ArrowRight', 400), ('ArrowUp', 300), ('e', 0), ('ArrowRight', 500), (' ', 0), ('ArrowDown', 300), ('ArrowRight', 500)]
            for k in range(len(seq_o)):
                for pg, c, seq in ((offp, offc, seq_o), (defp, defc, seq_d)):
                    if not c or not pg.evaluate('!!window.GD_LIVE'): continue
                    key, ms = seq[k]
                    if key == 'DIGIT': key = random.choice('1234')
                    if ms: hold(pg, key, ms)
                    else: pg.keyboard.press(key)
            A.wait_for_function('!window.GD_LIVE', timeout=40000); B.wait_for_function('!window.GD_LIVE', timeout=40000)
            done_live += 1
        # both logs have the new play
        A.wait_for_function('document.querySelectorAll("#log li").length>=%d' % (n + 1), timeout=15000)
        B.wait_for_function('document.querySelectorAll("#log li").length>=%d' % (n + 1), timeout=15000)
        A.wait_for_timeout(600)
        la, lb = A.inner_text('#log'), B.inner_text('#log')
        sa = (A.inner_text('#sb-as'), A.inner_text('#sb-bs')); sb = (B.inner_text('#sb-as'), B.inner_text('#sb-bs'))
        lva = A.evaluate('JSON.stringify(window.GAME.state.lv)'); lvb = B.evaluate('JSON.stringify(window.GAME.state.lv)')
        log('   result:', A.inner_text('#banner .bn-text'), '| same log', la == lb, '| same score', sa == sb, sa, '| same traces', lva == lvb)
        if la != lb or sa != sb or lva != lvb:
            log('MISMATCH'); log(la); log(lb); log(lva); log(lvb); errs.append('mismatch at play %d' % n)
            break
    log('live snaps played:', done_live)
    # --- reload one browser in the middle of a snap: it rebuilds the play from the room and carries on
    for pg in (A, B): pg.evaluate('window.__lvSpeed=1')
    wait_call(A); wait_call(B)
    set_ctl(A, True); set_ctl(B, True)
    ra = role(A); offp, defp = (A, B) if 'ball' in ra.lower() else (B, A)
    pick(offp, 'PASS_M', None); pick(defp, None, 'ZONE')
    A.wait_for_function('!!window.GD_LIVE', timeout=15000); B.wait_for_function('!!window.GD_LIVE', timeout=15000)
    A.wait_for_function('window.GD_LIVE && window.GD_LIVE.on && window.GD_LIVE.on.sim.t>12', timeout=15000)
    nlog = B.evaluate('document.querySelectorAll("#log li").length')
    A.reload()
    log('reloaded A mid-snap')
    A.wait_for_function('!!window.GD_LIVE', timeout=20000)
    B.wait_for_function('!window.GD_LIVE', timeout=40000); A.wait_for_function('!window.GD_LIVE', timeout=40000)
    A.wait_for_function('document.querySelectorAll("#log li").length>=%d' % (nlog + 1), timeout=15000)
    B.wait_for_timeout(500)
    la, lb = A.inner_text('#log'), B.inner_text('#log')
    log('   after mid-snap reload: same log', la == lb, '|', A.inner_text('#banner .bn-text'))
    if la != lb: errs.append('mid-snap reload mismatch'); log(la); log(lb)
    # --- reload between snaps: all finished snaps come back from the room
    A.reload(); A.wait_for_selector('.game', timeout=20000); A.wait_for_function('document.querySelectorAll("#log li").length>=%d' % (nlog + 1), timeout=20000)
    A.wait_for_timeout(500)
    la, lb = A.inner_text('#log'), B.inner_text('#log')
    log('   after reload between snaps: same log', la == lb, 'live snaps back', A.evaluate('Object.keys(window.GAME.state.lv).length'))
    if la != lb: errs.append('reload mismatch')
    # --- the other player disappears during a snap
    wait_call(A); wait_call(B)
    set_ctl(A, True); set_ctl(B, True)
    ra = role(A); offp, defp = (A, B) if 'ball' in ra.lower() else (B, A)
    pick(offp, 'PASS_S', None); pick(defp, None, 'MAN')
    A.wait_for_function('!!window.GD_LIVE', timeout=15000); B.wait_for_function('window.GD_LIVE && window.GD_LIVE.on && window.GD_LIVE.on.sim.t>3', timeout=15000)
    B.context.close()
    A.wait_for_function('window.GD_LIVE && window.GD_LIVE.on && window.GD_LIVE.on.stallAt>0', timeout=20000)
    log('A is waiting for B')
    A.wait_for_selector('[data-act=live-force]', timeout=20000)
    A.screenshot(path='shots/live_stalled.png')
    A.click('[data-act=live-force]')
    A.wait_for_function('!window.GD_LIVE', timeout=40000)
    A.wait_for_timeout(400)
    log('   A finished the snap with the computer playing for B:', A.inner_text('#banner .bn-text'))

    A.screenshot(path='shots/live_after_A.png');
    b.close()
log('\n'.join(errs[:20]) or 'NO ERRORS')
