import random
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for g in range(3):
        pg=b.new_page(viewport={'width':1100,'height':900})
        pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.goto('http://localhost:5055/'); pg.wait_for_timeout(400)
        if g==0: pg.screenshot(path='shots/lobby.png')
        pg.fill('#team','Test Hogs'); pg.click('#b-cpu'); pg.wait_for_timeout(200)
        if g==0:
            pg.screenshot(path='shots/draft1.png')
            for i in range(4): pg.keyboard.press('1')
            pg.wait_for_timeout(100); pg.screenshot(path='shots/draft5.png')
            pg.keyboard.press('1'); pg.wait_for_timeout(100); pg.screenshot(path='shots/draft6.png')
        pg.click('[data-act=auto]'); pg.wait_for_timeout(100)
        if g==0: pg.screenshot(path='shots/review.png')
        pg.click('[data-act=lock]'); pg.wait_for_timeout(300)
        if g==0: pg.screenshot(path='shots/game0.png')
        n=0
        while n<1500 and not pg.query_selector('.final'):
            btns=pg.query_selector_all('#callpanel .call:not([disabled])')
            if btns: random.choice(btns).click()
            pg.wait_for_timeout(40); n+=1
        pg.wait_for_timeout(300)
        print('game',g,'iters',n,'final',bool(pg.query_selector('.final')), pg.inner_text('#sb-as'), '-', pg.inner_text('#sb-bs'), '|', pg.inner_text('#sb-q'), '| log rows', len(pg.query_selector_all('#log li')))
        if g==0:
            pg.screenshot(path='shots/final.png', full_page=True)
            pg.click('[data-act=rosters] >> nth=0'); pg.wait_for_timeout(200); pg.screenshot(path='shots/rosters.png')
        pg.close()
    b.close()
print('\n'.join(errs[:20]) or 'NO ERRORS')
