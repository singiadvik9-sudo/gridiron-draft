"""Human v Human with live control: two browsers, one room, several snaps run on the field.
Checks that both screens end every snap with the same result, the same recorded inputs and the same log."""
import random, json, sys
from playwright.sync_api import sync_playwright
errs = []
import os
URL = os.environ.get('URL', 'http://localhost:5055/')
SPEED = 3
ALL = []
def log(*a): print(*a); sys.stdout.flush()

def role(pg):
    t = pg.inner_text('#callpanel .role') if pg.query_selector('#callpanel .role') else ''
    return t
def wait_call(pg, timeout=20000):
    """wait until this page (and the other one) can call a play: kicks on either page get their meter stopped on the way"""
    import time
    end = time.time() + timeout / 1000
    while time.time() < end:
        for q in [pg] + [x for x in ALL if x is not pg]:
            try:
                k = q.query_selector('#callpanel button[data-act=km-stop]')
                if k and not q.query_selector('#callpanel .call:not([disabled])'): k.click(); q.wait_for_timeout(700)
            except Exception: pass
        if pg.query_selector('#callpanel .call:not([disabled]), .final'): return
        pg.wait_for_timeout(200)
    log('STUCK panel:', pg.evaluate("(document.querySelector('#callpanel')||{}).innerText || ''")[:300]); raise Exception('stuck waiting for a call')

def set_ctl(pg, on):
    cur = pg.evaluate("document.querySelector('[data-act=ctl-toggle]') && document.querySelector('[data-act=ctl-toggle]').classList.contains('on')")
    if cur != on: pg.click('[data-act=ctl-toggle]')
    pg.wait_for_timeout(50)

def open_cat(pg, pid):
    """open the call-panel section that holds this play"""
    c = pg.evaluate("(window.E.OFF[%r] || window.E.DEF_CALLS[%r] || {}).cat" % (pid, pid))
    if c and not pg.query_selector('#callpanel .call[data-id=%s]' % pid):
        pg.click('#callpanel [data-act=cat][data-cat=%s]' % c); pg.wait_for_selector('#callpanel .call[data-id=%s]' % pid, timeout=3000)

def pick(pg, off_id, def_id):
    on_def = pg.evaluate("!!Array.from(document.querySelectorAll('#callpanel .cat')).find(b=>/Zone|Man|Blitz|Prevent|Stack/i.test(b.textContent))")
    if on_def:
        want = def_id if def_id else 'ZONE'
        open_cat(pg, want)
    else:
        want = off_id if off_id else 'PASS_M'
        open_cat(pg, want)
    pg.click('#callpanel .call[data-id=' + want + ']')
    return want

def drive(pg, is_off, steps):
    """Press keys on the field while the snap is live. steps: list of (ms, key)."""
    for ms, key in steps:
        if not pg.evaluate('!!window.GD_LIVE'): return
        pg.wait_for_timeout(ms); pg.keyboard.press(key)

with sync_playwright() as p:
    import os
    b = p.chromium.connect_over_cdp(os.environ['CDP']) if os.environ.get('CDP') else p.chromium.launch()   # (CDP=http://localhost:9333 to use a Chrome you started yourself)
    pages = []
    shared = b.new_context(viewport={'width': 1100, 'height': 1000})   # (one context: the stand-in link between the pages is a BroadcastChannel)
    for tag in 'AB':
        ctx = shared
        ctx.add_init_script('window.__lvSpeed=%d' % SPEED)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e, t=tag: errs.append(t + ' PAGEERROR ' + str(e)))
        pg.on('console', lambda m, t=tag: errs.append(t + ' CONSOLE ' + m.text) if m.type == 'error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.goto(URL); pg.wait_for_timeout(400); pg.click('[data-h=quick]'); pg.wait_for_timeout(150)
        pages.append(pg)
    A, B = pages
    ALL[:] = [A, B]
    A.fill('#team', 'Alpha'); A.click('#b-create'); A.wait_for_selector('.chip.room')
    code = A.inner_text('.chip.room').split()[-1]; log('room', code)
    B.fill('#team', 'Bravo'); B.fill('#code', code); B.click('#b-join'); B.wait_for_selector('.chip.room')
    A.wait_for_selector('.sd'); B.wait_for_selector('.sd')
    for pg in (A, B): pg.click('[data-act=sd-auto]')
    try: A.wait_for_selector('.game', timeout=30000); B.wait_for_selector('.game', timeout=30000)
    except Exception:
        for t, pg in (('A', A), ('B', B)): log('DRAFT', t, pg.evaluate("(document.querySelector('.sd-top')||document.body).innerText.slice(0,300)"), '| auto', pg.evaluate("!!document.querySelector('[data-act=sd-auto].on, .sd-auto.on')"))
        raise
    log('both in the game')
    # This machine blocks WebRTC traffic, so the direct link is stood in for by a BroadcastChannel between the two pages with 40 ms of delay
    # each way: everything above the link (inputs streamed across, guessing ahead, corrections, confirmed results) runs for real.
    FAKE = """() => { const N = GD_NET; N.stop(); N.code = GAME.S.code; N.me = GAME.S.me; const peer = GAME.S.me === 'a' ? 'b' : 'a';
      const bc = new BroadcastChannel('gd-link'), l = { peer, state: 'connecting', gen: 1, t0: Date.now(), tries: 0, rtt: null, lastPo: 0, pingT: 0 };
      const ch = { readyState: 'open', close() {}, send: d => setTimeout(() => bc.postMessage({ to: peer, d }), 40) };
      bc.onmessage = e => { if (e.data.to === N.me && l.ch === ch) setTimeout(() => ch.onmessage({ data: e.data.d }), 0); };
      N.links = { [peer]: l }; N.hub = null; N.wire(l, ch, 1); ch.onopen(); }"""
    import os
    if not os.environ.get('NOLINK'):
        for pg in (A, B): pg.evaluate(FAKE)
        A.wait_for_function('GD_NET.rtt != null', timeout=10000); B.wait_for_function('GD_NET.rtt != null', timeout=10000)
    else: log('no direct link: everything goes through the server')
    log('link:', A.evaluate('GD_NET.state'), B.evaluate('GD_NET.state'), '| chip:', A.inner_text('#netst'), '/', B.inner_text('#netst'))
    if A.evaluate('GD_NET.state') != 'open' and not os.environ.get('NOLINK'): errs.append('no direct link')

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
        o_id = random.choice(['HITCH', 'MESH', 'POST', 'DIVE', 'SWEEP', 'BUBBLE', 'FLOOD', 'PA_DEEP', 'DRAW', 'GO', 'COUNTER', 'PASS_D'])
        d_id = random.choice(['COV3', 'COV4', 'TIGHT', 'ZBLITZ', 'MAN2', 'RUNBLITZ', 'SOFT', 'CBBLITZ'])
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
            try: A.wait_for_function('!window.GD_LIVE', timeout=40000); B.wait_for_function('!window.GD_LIVE', timeout=40000)
            except Exception:
                st = "(() => { const m = window.GD_LIVE && window.GD_LIVE.on; if (!m) return 'done'; return JSON.stringify({ me: m.me, t: m.sim.t, out: !!m.sim.out, ended: m.ended, D: m.D, target: m.target, stall: m.stallAt, a: { n: m.stream.a.ev.length, upto: m.stream.a.upto, fin: m.stream.a.fin }, b: { n: m.stream.b.ev.length, upto: m.stream.b.upto, fin: m.stream.b.fin }, net: GD_NET.state, dbg: (m.dbg || []).slice(-25) }); })()"
                log('HANG A', A.evaluate(st)); log('HANG B', B.evaluate(st)); raise
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
            log('MISMATCH', 'ends A', A.evaluate('JSON.stringify(GD_LV.ends)'), 'ends B', B.evaluate('JSON.stringify(GD_LV.ends)')); log(la); log(lb); log(lva); log(lvb); errs.append('mismatch at play %d' % n)
            break
    log('live snaps played:', done_live, '| corrections A/B:', A.evaluate('GD_LV.redos||0'), B.evaluate('GD_LV.redos||0'), '| ping', A.inner_text('#netst'))
    # --- reload one browser in the middle of a snap: it rebuilds the play from the room and carries on
    for pg in (A, B): pg.evaluate('window.__lvSpeed=1')
    wait_call(A); wait_call(B)
    set_ctl(A, True); set_ctl(B, True)
    ra = role(A); offp, defp = (A, B) if 'ball' in ra.lower() else (B, A)
    pick(offp, 'CURLS', None); pick(defp, None, 'COV3')
    A.wait_for_function('!!window.GD_LIVE', timeout=15000); B.wait_for_function('!!window.GD_LIVE', timeout=15000)
    A.wait_for_function('window.GD_LIVE && window.GD_LIVE.on && window.GD_LIVE.on.sim.t>12', timeout=15000)
    nlog = B.evaluate('document.querySelectorAll("#log li").length')
    A.reload()
    log('reloaded A mid-snap')
    A.wait_for_function('!!window.GD_LIVE', timeout=20000)
    try: B.wait_for_function('!window.GD_LIVE', timeout=40000); A.wait_for_function('!window.GD_LIVE', timeout=40000)
    except Exception:
        st = "(() => { const m = window.GD_LIVE && window.GD_LIVE.on; if (!m) return 'done'; return JSON.stringify({ me: m.me, t: m.sim.t, out: !!m.sim.out, ended: m.ended, D: m.D, stall: m.stallAt, a: { n: m.stream.a.ev.length, upto: m.stream.a.upto, fin: m.stream.a.fin }, b: { n: m.stream.b.ev.length, upto: m.stream.b.upto, fin: m.stream.b.fin }, net: GD_NET.state, inflight: m.inflight, tried: m.tried, sinceNet: Math.round(performance.now() - m.lastNet), myCtl: m.myCtl, oppCtl: m.oppCtl, ctl: m.ctl, dbg: (m.dbg || []).slice(-4) }); })()"
        log('HANG A', A.evaluate(st)); log('HANG B', B.evaluate(st)); raise
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
    pick(offp, 'HITCH', None); pick(defp, None, 'MAN2')
    A.wait_for_function('!!window.GD_LIVE', timeout=15000); B.wait_for_function('window.GD_LIVE && window.GD_LIVE.on && window.GD_LIVE.on.sim.t>3', timeout=15000)
    B.close()   # (the other player closes the tab)
    A.wait_for_function('window.GD_LIVE && window.GD_LIVE.on && (window.GD_LIVE.on.stallAt>0 || window.GD_LIVE.on.waitAt>0)', timeout=20000)
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
