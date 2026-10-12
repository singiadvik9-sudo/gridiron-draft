import random, sys
from playwright.sync_api import sync_playwright
errs=[]
def watch(pg):
    pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
def play_game(pg, limit=2500):
    n=0
    while n<limit and not pg.query_selector('.final'):
        btns=pg.query_selector_all('#callpanel .call:not([disabled])')
        if btns: random.choice(btns).click()
        pg.wait_for_timeout(30); n+=1
    return n
def wait_cont(pg):
    pg.wait_for_selector('[data-act=ctx-done]', timeout=15000)
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1100,'height':900}); watch(pg)
    pg.goto('http://localhost:5055/'); pg.wait_for_timeout(500)
    pg.screenshot(path='shots/home.png')
    # quick practice via menu
    pg.click('[data-h=quick]'); pg.wait_for_timeout(200)
    pg.fill('#team','Hog'); pg.select_option('#cap','standard'); pg.click('#b-cpu'); pg.wait_for_selector('.sd'); pg.screenshot(path='shots/sd_start.png',full_page=True)
    print('cap bar:', pg.inner_text('.capnums').replace('\n',' '), '| rows', len(pg.query_selector_all('.sd-row')))
    dr=pg.query_selector('.sd-row:not(.no) [data-act=sd-pick]:not([disabled])')
    if dr: dr.click(); pg.wait_for_timeout(150)
    pg.click('[data-act=sd-auto]'); pg.wait_for_selector('.game',timeout=20000)
    n=play_game(pg); print('quick game iters',n, pg.inner_text('#sb-as'),'-',pg.inner_text('#sb-bs'))
    pg.click('[data-act=leave]'); pg.wait_for_timeout(200)
    print('back at home:', bool(pg.query_selector('.tiles')))
    # guest campaign
    pg.click('[data-h=home]'); pg.wait_for_timeout(150); pg.click('[data-h=camp]'); pg.wait_for_timeout(300)
    pg.click('[data-h=camp-new]'); pg.wait_for_timeout(300); pg.screenshot(path='shots/campnew.png')
    pg.click('.teambtn >> nth=0'); pg.wait_for_timeout(500); pg.screenshot(path='shots/camphome.png')
    print('camp tabs', [t.inner_text() for t in pg.query_selector_all('.tab')])
    # play first game
    pg.click('[data-h=fr-play]'); pg.wait_for_timeout(300)
    n=play_game(pg); print('campaign game iters',n, pg.inner_text('#sb-as'),'-',pg.inner_text('#sb-bs'))
    wait_cont(pg); pg.click('[data-act=ctx-done]'); pg.wait_for_timeout(400); pg.screenshot(path='shots/camphome2.png')
    # visit tabs
    for t in ['sched','roster','stand','trades','fa','stats']:
        pg.click(f'[data-h=fr-tab][data-t={t}]'); pg.wait_for_timeout(150); pg.screenshot(path=f'shots/camp_{t}.png')
    # trade offers
    pg.click('[data-h=fr-tab][data-t=trades]'); pg.click('[data-h=tr-offers]'); pg.wait_for_timeout(200)
    print('offers', len(pg.query_selector_all('[data-h=tr-acc]')))
    # sim through the season
    pg.click('[data-h=fr-tab][data-t=home]')
    g=0
    while g<60:
        s=pg.query_selector('[data-h=fr-sim]')
        if s: s.click(); pg.wait_for_timeout(120)
        elif pg.query_selector('[data-h=fr-offseason]'): break
        else: pg.wait_for_timeout(100)
        g+=1
    print('season loops',g, pg.inner_text('.frmeta'))
    pg.screenshot(path='shots/camp_off.png')
    pg.click('[data-h=fr-offseason]'); pg.wait_for_timeout(400); pg.screenshot(path='shots/camp_draft.png')
    # draft: auto-draft
    pg.click('[data-h=fr-dauto]'); pg.wait_for_timeout(400)
    print('after draft:', pg.inner_text('.frmeta'))
    pg.click('[data-h=fr-tab][data-t=home]'); pg.screenshot(path='shots/camp_pre.png')
    if pg.query_selector('[data-h=fr-trim]'): pg.click('[data-h=fr-trim]'); pg.wait_for_timeout(200)
    pg.click('[data-h=fr-season]'); pg.wait_for_timeout(500)
    print('new season:', pg.inner_text('.frmeta'))
    pg.click('[data-h=camp-exit]'); pg.wait_for_timeout(400)
    print('slots', [c.inner_text().split('\n')[0] for c in pg.query_selector_all('.slot-card')])
    b.close()
print('\n'.join(errs[:25]) or 'NO ERRORS')
