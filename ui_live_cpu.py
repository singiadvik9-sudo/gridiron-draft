"""Practice vs CPU with live control: play a full game where every snap is run on the field."""
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
    n=0; live=0; kinds={}
    while n<400 and not pg.query_selector('.final'):
        n+=1
        pg.wait_for_selector('#callpanel .call:not([disabled]), .final', timeout=20000)
        if pg.query_selector('.final'): break
        on=pg.evaluate("document.querySelector('[data-act=ctl-toggle]').classList.contains('on')")
        if not on: pg.click('[data-act=ctl-toggle]')
        ids=pg.evaluate("Array.from(document.querySelectorAll('#callpanel .call:not([disabled])')).map(b=>b.dataset.id)")
        pg.click('#callpanel .call[data-id='+random.choice(ids)+']')
        pg.wait_for_timeout(120)
        if pg.evaluate('!!window.GD_LIVE'):
            live+=1
            for k in range(6):
                if not pg.evaluate('!!window.GD_LIVE'): break
                key=random.choice(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'])
                pg.keyboard.down(key); pg.wait_for_timeout(random.randint(60,300)); pg.keyboard.up(key)
                if random.random()<.5: pg.keyboard.press(random.choice('1234 e'))
            pg.wait_for_function('!window.GD_LIVE', timeout=30000)
    pg.wait_for_timeout(500)
    log('plays', n, 'live snaps', live, 'final:', pg.inner_text('.final h2') if pg.query_selector('.final') else 'NOT FINISHED', pg.inner_text('#sb-as'), pg.inner_text('#sb-bs'))
    log('traces stored', pg.evaluate('Object.keys(window.GAME.state.lv).length'))
    pg.screenshot(path='shots/live_cpu_final.png')
    b.close()
log('\n'.join(errs[:20]) or 'NO ERRORS')
