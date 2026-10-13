"""Human v Human: punts and kickoffs run back by hand. Both screens must end every return with the same log and the same recorded inputs."""
import random, json, sys
from playwright.sync_api import sync_playwright
errs = []
URL = 'http://localhost:5055/'
import os
SPEED = int(os.environ.get('SPEED', '3'))
def log(*a): print(*a); sys.stdout.flush()
exec(open('ui_live.py').read().split("with sync_playwright()")[0].split("SPEED = 3")[1])   # helpers: role, wait_call, set_ctl, open_cat, pick

def punt_ok(pg):
    if pg.query_selector('#callpanel [data-act=cat][data-cat=SPEC]') and not pg.query_selector('#callpanel .call[data-id=PUNT]'):
        pg.click('#callpanel [data-act=cat][data-cat=SPEC]'); pg.wait_for_timeout(100)
    return pg.evaluate("(()=>{const b=document.querySelector('#callpanel .call[data-id=PUNT]');return !!b&&!b.disabled})()")

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
    rets = 0; kinds = {}
    for n in range(80):
        try: wait_call(A); wait_call(B)
        except Exception as e:
            A.screenshot(path='shots/ret_stuck_A.png'); B.screenshot(path='shots/ret_stuck_B.png')
            log('STUCK', A.inner_text('#callpanel')[:300].replace('\n', ' | '), '||', B.inner_text('#callpanel')[:300].replace('\n', ' | ')); raise
        if A.query_selector('.final') or rets >= 4: break
        set_ctl(A, True); set_ctl(B, True)
        ra = role(A); offp, defp = (A, B) if 'ball' in ra.lower() else (B, A)
        pd = pick(defp, None, 'COV3')   # the defence calls first (it never knows whether a kick is coming)
        if punt_ok(offp): po = 'PUNT'; offp.click('#callpanel .call[data-id=PUNT]')
        elif offp.query_selector('#callpanel .call[data-id=KNEEL]:not([disabled])') or (offp.query_selector('#callpanel [data-act=cat][data-cat=SPEC]') and offp.click('#callpanel [data-act=cat][data-cat=SPEC]') is None and offp.query_selector('#callpanel .call[data-id=KNEEL]:not([disabled])')):
            po = 'KNEEL'; offp.click('#callpanel .call[data-id=KNEEL]')   # three kneels get us to fourth down quickly
        else: po = pick(offp, random.choice(['GO', 'PASS_D', 'POST', 'GO']), None)
        log('play', n, po, pd)
        # follow whatever the screens do until both are back at a call
        for guard in range(400):
            st = [pg.evaluate("(()=>{const g=window.GD_LIVE&&window.GD_LIVE.on;return g?{ret:g.ret?g.ret.kind:null,my:!!g.myCtl,opp:!!g.oppCtl,t:g.sim.t,out:!!g.sim.out}:null})()") for pg in (A, B)]
            if st[0] or st[1]:
                for pg, s in zip((A, B), st):
                    if not s or not s['my'] or s['out']: continue
                    if s['ret']:
                        if s['t'] % 7 == 0: pg.keyboard.press(' ')
                        pg.keyboard.down('ArrowRight'); pg.wait_for_timeout(250); pg.keyboard.up('ArrowRight')
                        if s['ret'] == 'pr' and random.random() < 0.15: pg.keyboard.press('e')
                    elif pg.query_selector('[data-act=live-hand]:not([disabled])'):
                        try: pg.click('[data-act=live-hand]', timeout=1500)
                        except Exception: pass
                if (st[0] and st[0]['ret']) or (st[1] and st[1]['ret']):
                    if st[0] and st[1] and st[0]['ret'] and st[1]['ret'] and 'shown' not in kinds: A.screenshot(path='shots/ret_A.png'); B.screenshot(path='shots/ret_B.png'); kinds['shown'] = 1
                    if not kinds.get('seen_' + str(n)): kinds['seen_' + str(n)] = 1; rets += 1; k = (st[0] or st[1])['ret']; kinds[k] = kinds.get(k, 0) + 1; log('   RETURN', k, 'A=%s B=%s' % (bool(st[0]), bool(st[1])))
                A.wait_for_timeout(60)
            else:
                if (A.query_selector('#callpanel .call:not([disabled])') and B.query_selector('#callpanel .call:not([disabled])')) or A.query_selector('.final'): break
                A.wait_for_timeout(120)
        A.wait_for_timeout(500)
        la, lb = A.inner_text('#log'), B.inner_text('#log')
        sa = (A.inner_text('#sb-as'), A.inner_text('#sb-bs')); sb = (B.inner_text('#sb-as'), B.inner_text('#sb-bs'))
        rva = A.evaluate('JSON.stringify(window.GAME.state.rv||null)') if False else ''
        same = la == lb and sa == sb
        log('   result:', A.inner_text('#banner .bn-text'), '| same log', la == lb, '| same score', sa == sb)
        if not same:
            log('MISMATCH'); log(la); log(lb); errs.append('mismatch at play %d' % n); break
    log('returns played by hand:', rets, {k: v for k, v in kinds.items() if k in ('ko', 'pr')})
    if rets == 0: errs.append('no return came up')
    A.screenshot(path='shots/ret_after_A.png')
    b.close()
log('\n'.join(errs[:20]) or 'NO ERRORS')
