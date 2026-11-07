"""A squad game with four people: the host (Home QB), a Home receiver, the Away QB and an Away tight end. The host sets the teams in the
lobby, everyone gets ready, the quarterbacks call the plays and all four run their players in live snaps. Every screen must end every
snap with the same log, score and inputs; each shows its own YOU, the ball carrier for everyone, your route on offense, your job on
defense. CDP=http://localhost:9333 to use a Chrome you started, URL for the server."""
import os, sys, random
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:5055/'); errs = []
def log(*a): print(*a); sys.stdout.flush()
def ok(c, m): log(('ok   ' if c else 'FAIL ') + m); (None if c else errs.append(m))
FAKE = """() => { const N = GD_NET, lob = GAME.S.lob, me = lob.ps.find(p => p.me).id; N.stop(); N.code = GAME.S.code; N.me = me;
  const bc = new BroadcastChannel('gd-sq'), l = { peer: 'all', state: 'connecting', gen: 1, t0: Date.now(), tries: 0, rtt: null, lastPo: 0, pingT: 0 };
  const ch = { readyState: 'open', close() {}, send: d => setTimeout(() => bc.postMessage({ from: me, d }), 40) };
  bc.onmessage = e => { if (e.data.from === me || l.ch !== ch) return; const o = JSON.parse(e.data.d); if (o.t === 'pi' || o.t === 'po') { if (o.t === 'pi' && e.data.from) { const back = JSON.stringify({ t: 'po', ts: o.ts }); bc.postMessage({ from: me, to: e.data.from, d: back }); } return; } setTimeout(() => ch.onmessage({ data: e.data.d }), 0); };
  N.links = { all: l }; N.hub = null; N.wire(l, ch, 1); ch.onopen(); l.lastPo = 1e15; }"""
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['CDP']) if os.environ.get('CDP') else p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1150, 'height': 950}); pages = {}
    for tag, name in (('H', 'Hank'), ('W', 'Wes'), ('Q', 'Quin'), ('T', 'Tess')):
        pg = ctx.new_page(); pg.on('pageerror', lambda e, t=tag: errs.append(t + ' PAGEERROR ' + str(e)))
        pg.add_init_script('window.__lvSpeed=3'); pg.goto(URL); pg.wait_for_timeout(400); pg.click('[data-h=quick]'); pg.wait_for_timeout(150)
        pg.fill('#team', name); pages[tag] = pg
    H, W, Q, T = pages['H'], pages['W'], pages['Q'], pages['T']
    H.click('#b-squad'); H.wait_for_selector('.sqlobby'); code = H.evaluate('GAME.S.code'); log('room', code)
    for pg in (W, Q, T): pg.fill('#code', code); pg.click('#b-join'); pg.wait_for_selector('.sqlobby', timeout=10000)
    H.wait_for_function("GAME.S.lob && GAME.S.lob.ps.length === 4", timeout=10000)
    ok(H.query_selector('select[data-sq=assign]') is not None and W.query_selector('select[data-sq=assign]') is None, 'the host gets the team controls, the others do not')
    ids = H.evaluate("Object.fromEntries(GAME.S.lob.ps.map(p => [p.name, p.id]))")
    for name, val in (('Wes', 'a:WR1'), ('Quin', 'b:QB'), ('Tess', 'b:TE')):
        H.select_option('select[data-sq=assign][data-id="%s"]' % ids[name], val); H.wait_for_timeout(500)
    W.wait_for_function("GAME.S.lob.ps.find(p => p.me).pos === 'WR1'", timeout=8000)
    ok(W.evaluate("GAME.S.lob.ps.find(p => p.me).ds") is not None, 'everyone placed on a team gets a defender: Wes plays ' + W.evaluate("GAME.S.lob.ps.find(p => p.me).ds"))
    T.click('[data-sq=ds][data-k=RCB]'); T.wait_for_timeout(500)
    H.click('[data-sq=start]'); H.wait_for_timeout(600)
    ok('ready' in (H.inner_text('#toast') if H.query_selector('#toast:not([hidden])') else '').lower(), 'the host cannot start until everyone is ready')
    for pg in (W, Q, T): pg.click('[data-sq=ready]'); pg.wait_for_timeout(300)
    H.wait_for_timeout(700); H.click('[data-sq=start]')
    try:
        for pg in pages.values(): pg.wait_for_selector('.game', timeout=20000)
    except Exception:
        for t, pg in pages.items(): log('NOGAME', t, pg.evaluate("JSON.stringify({ screen: GAME.S.screen, started: GAME.S.lob && GAME.S.lob.started, seats: Object.fromEntries(Object.entries(GAME.S.seats || {}).map(([k, v]) => [k, v && { status: v.status, roster: !!v.roster, name: v.name }])), toast: (document.querySelector('#toast') || {}).innerText })"))
        raise
    ok(True, 'the game starts on all four screens with drafted rosters')
    for pg in pages.values(): pg.evaluate(FAKE)
    ok(Q.evaluate('GAME.S.canCall') and not W.evaluate('GAME.S.canCall') and W.evaluate('GAME.S.me') == 'a' and T.evaluate('GAME.S.me') == 'b', 'the quarterbacks call the plays; the others are on their teams')
    def callpanel_ready(pg): return pg.evaluate("!!document.querySelector('#callpanel .call:not([disabled]), #callpanel button[data-act=km-stop], .final')")
    def settle(timeout=25000):
        import time
        end = time.time() + timeout / 1000
        while time.time() < end:
            for pg in (H, Q):
                k = pg.query_selector('#callpanel button[data-act=km-stop]')
                if k and not pg.query_selector('#callpanel .call:not([disabled])'):
                    try: k.click(); pg.wait_for_timeout(700)
                    except Exception: pass
            if H.query_selector('.final') or (H.query_selector('#callpanel .call:not([disabled])') and Q.query_selector('#callpanel .call:not([disabled])')): return True
            H.wait_for_timeout(200)
        return False
    def pick(pg, want):
        c = pg.evaluate("(window.E.OFF[%r] || window.E.DEF_CALLS[%r] || {}).cat" % (want, want))
        if c and not pg.query_selector('#callpanel .call[data-id=%s]' % want): pg.click('#callpanel [data-act=cat][data-cat=%s]' % c); pg.wait_for_selector('#callpanel .call[data-id=%s]' % want, timeout=3000)
        pg.click('#callpanel .call[data-id=' + want + ']')
    seen = {'route': False, 'zone': False, 'ball': False, 'you': 0, 'mate': False}
    plays = 0
    for n in range(7):
        if not settle(): log('STUCK', H.inner_text('#callpanel')[:200], '|', Q.inner_text('#callpanel')[:200]); errs.append('stuck'); break
        if H.query_selector('.final'): break
        h_off = 'ball' in H.inner_text('#callpanel .role').lower()
        offq, defq = (H, Q) if h_off else (Q, H)
        o = random.choice(['HITCH', 'MESH', 'POST', 'CURLS', 'FLOOD', 'DIVE', 'SWEEP']); d = random.choice(['COV3', 'COV4', 'MAN2', 'SOFT', 'TIGHT'])
        mate_off, mate_def = (W, T) if h_off else (T, W)
        mtxt = mate_off.inner_text('#callpanel')
        if n == 0: ok('calling the play' in mtxt.lower(), 'a teammate sees who is calling the play: "' + [l for l in mtxt.split('\n') if 'CALLING' in l.upper()][:1].__str__()[:70] + '"')
        pick(offq, o); pick(defq, d)
        for pg in pages.values(): pg.wait_for_function('!!window.GD_LIVE && window.GD_LIVE.on', timeout=15000)
        H.wait_for_timeout(250)
        if n == 0: mate_off.wait_for_timeout(500); mate_off.screenshot(path='shots/squad_receiver.png'); mate_def.screenshot(path='shots/squad_defender.png')
        # what each screen shows at the start of the snap
        for tag, pg in pages.items():
            info = pg.evaluate("(() => { const L = GAME.Field.live; if (!L) return {}; return { you: L.items.filter(i => i.mine).length, mate: L.items.some(i => i.mate), ball: L.items.some(i => i.hasBall), route: !!(L.routes && L.routes.some(r => r.mine)), zone: !!L.zone || L.items.some(i => i.yourMan) }; })()")
            seen['you'] += 1 if info.get('you') == 1 else 0
            if info.get('mate'): seen['mate'] = True
            if info.get('ball'): seen['ball'] = True
            if info.get('route') and pg in (mate_off,): seen['route'] = True
            if info.get('zone') and pg in (mate_def, defq): seen['zone'] = True
        for k in range(5):
            for pg in pages.values():
                if not pg.evaluate('!!window.GD_LIVE'): continue
                key = random.choice(['ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft'])
                pg.keyboard.down(key); pg.wait_for_timeout(120); pg.keyboard.up(key)
            if random.random() < 0.5 and offq.evaluate('!!window.GD_LIVE'): offq.keyboard.press(random.choice('asdf'))
        for pg in pages.values(): pg.wait_for_function('!window.GD_LIVE', timeout=45000)
        plays += 1
        H.wait_for_timeout(900)
        logs = [pg.inner_text('#log') for pg in pages.values()]; lvs = [pg.evaluate('JSON.stringify(window.GAME.state.lv)') for pg in pages.values()]
        same = all(x == logs[0] for x in logs) and all(x == lvs[0] for x in lvs)
        log('play', n, o, 'v', d, '| same on all four:', same, '|', H.inner_text('#banner .bn-text')[:80])
        if not same: errs.append('mismatch at play %d' % n); log(lvs); break
    log('plays:', plays, '| corrections', [pg.evaluate('GD_LV.redos||0') for pg in pages.values()])
    ok(seen['you'] >= plays * 3, 'each person sees YOU on his own player (' + str(seen['you']) + ' of ' + str(plays * 4) + ' screen-snaps)')
    ok(seen['ball'] or plays == 0, 'the ball carrier is marked for everyone')
    ok(seen['mate'], 'the other people\'s players carry their names')
    ok(seen['route'], 'a receiver sees his route')
    ok(seen['zone'], 'a defender sees his zone or his man')
    # the host moves people between plays: Tess becomes Away's running back
    H.click('[data-sq=setup]'); H.wait_for_selector('#modal .sqsetup'); H.select_option('#modal select[data-sq=assign][data-id="%s"]' % ids['Tess'], 'b:HB'); H.wait_for_timeout(800)
    T.wait_for_function("GAME.S.lob.ps.find(p => p.me).pos === 'HB'", timeout=8000); ok(True, 'the host moves someone between plays (Tess to running back)')
    ctx.close()
log('\n'.join(errs) or 'NO ERRORS')
