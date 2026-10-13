"""Practice vs CPU: score, then choose the kickoff (deep / onside); checks the kick panel, the log and that the game goes on."""
import random, sys
from playwright.sync_api import sync_playwright
errs=[]
def log(*a): print(*a); sys.stdout.flush()
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1100,'height':1000}); ctx.add_init_script('window.__lvSpeed=8')
    pg=ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.goto('http://localhost:5055/'); pg.wait_for_timeout(400); pg.click('[data-h=quick]'); pg.wait_for_timeout(150)
    pg.click('#b-cpu'); pg.wait_for_selector('.sd'); pg.click('[data-act=sd-auto]'); pg.wait_for_selector('.game',timeout=30000)
    kicks=[]; n=0; want=['ONSIDE','KO','ONSIDE','KO']
    while n<500 and len(kicks)<4 and not pg.query_selector('.final'):
        n+=1
        pg.wait_for_selector('#callpanel .call:not([disabled]), .final', timeout=20000)
        if pg.query_selector('.final'): break
        if pg.query_selector('#callpanel .call[data-id=KO]'):
            ids=pg.evaluate("Array.from(document.querySelectorAll('#callpanel .call')).map(b=>b.dataset.id)")
            assert ids==['KO','ONSIDE'], ids
            head=pg.inner_text('#sb-dd'); assert head=='Kickoff', head
            pick=want[len(kicks)]
            pg.click('#callpanel .call[data-id=%s]'%pick)
            pg.wait_for_timeout(200)
            for k in range(200):
                if pg.query_selector('#callpanel .call:not([disabled]):not([data-id=KO]):not([data-id=ONSIDE])') or pg.query_selector('.final'): break
                if pg.evaluate('!!window.GD_LIVE'):
                    pg.keyboard.down('ArrowRight'); pg.wait_for_timeout(250); pg.keyboard.up('ArrowRight')
                else: pg.wait_for_timeout(150)
            txt=pg.inner_text('#banner .bn-text'); kicks.append((pick,txt)); log(pick,'->',txt)
            continue
        on=pg.query_selector('[data-act=ctl-toggle]')
        if on and pg.evaluate("document.querySelector('[data-act=ctl-toggle]').classList.contains('on')"): pg.click('[data-act=ctl-toggle]')
        role=pg.inner_text('#callpanel .role').lower()
        if 'ball' in role:
            # 4th down: kick a field goal when we can, otherwise punt; else throw deep
            sp=pg.query_selector('#callpanel [data-act=cat][data-cat=SPEC]')
            if pg.evaluate("document.getElementById('sb-dd').textContent.startsWith('4th')") and sp:
                sp.click(); pg.wait_for_timeout(50)
                if pg.query_selector('#callpanel .call[data-id=FG]:not([disabled])'): pg.click('#callpanel .call[data-id=FG]')
                else: pg.click('#callpanel .call[data-id=PUNT]')
            else:
                c=pg.query_selector('#callpanel [data-act=cat][data-cat=PASS_M]'); c and c.click(); pg.wait_for_timeout(30)
                ids=pg.evaluate("Array.from(document.querySelectorAll('#callpanel .call:not([disabled])')).map(b=>b.dataset.id)"); pg.click('#callpanel .call[data-id=%s]'%random.choice(ids))
        else:
            ids=pg.evaluate("Array.from(document.querySelectorAll('#callpanel .call:not([disabled])')).map(b=>b.dataset.id)"); pg.click('#callpanel .call[data-id=%s]'%random.choice(ids))
        pg.wait_for_timeout(120)
        if pg.evaluate('!!window.GD_LIVE'):
            for k in range(6):
                if not pg.evaluate('!!window.GD_LIVE'): break
                pg.keyboard.down('ArrowRight'); pg.wait_for_timeout(200); pg.keyboard.up('ArrowRight')
            try: pg.wait_for_function('!window.GD_LIVE', timeout=30000)
            except Exception: errs.append('live stuck')
    log('plays',n,'kick choices',len(kicks), pg.inner_text('#sb-as'), pg.inner_text('#sb-bs'))
    log(pg.evaluate("window.GAME.S.G.log.filter(e=>e.off==='a').map(e=>e.offPick+':'+e.ev).join(' ')"))
    pg.screenshot(path='shots/kick_after.png')
    if len(kicks)<2: errs.append('too few kicks seen')
    b.close()
log('\n'.join(errs[:20]) or 'NO ERRORS')
