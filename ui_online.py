import random
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    ctxA=b.new_context(viewport={'width':1100,'height':900}); ctxB=b.new_context(viewport={'width':1100,'height':900}); ctxS=b.new_context(viewport={'width':1100,'height':900})
    A=ctxA.new_page(); B=ctxB.new_page(); Sp=ctxS.new_page()
    for pg,tag in ((A,'A'),(B,'B'),(Sp,'S')):
        pg.on('pageerror', lambda e,t=tag: errs.append(t+' PAGEERROR '+str(e)))
        pg.on('console', lambda m,t=tag: errs.append(t+' CONSOLE '+m.text) if m.type=='error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.goto('http://localhost:5055/'); pg.wait_for_timeout(400); pg.click('[data-h=quick]'); pg.wait_for_timeout(150)
    A.fill('#team','Alpha'); A.click('#b-create'); A.wait_for_selector('.chip.room')
    code=A.inner_text('.chip.room').split()[-1]; print('room code',code)
    B.fill('#team','Bravo'); B.fill('#code',code.lower()); B.click('#b-join'); B.wait_for_selector('.chip.room')
    A.wait_for_timeout(300); print('A opp chip:', A.inner_text('#oppchip'))
    for pg in (A,B): pg.click('[data-act=auto]')
    A.click('[data-act=lock]'); A.wait_for_timeout(400)
    print('A wait screen:', A.query_selector('.bigcode') is not None)
    B.click('[data-act=lock]'); A.wait_for_timeout(500)
    print('A game:', A.query_selector('.game') is not None, 'B game:', B.query_selector('.game') is not None)
    n=0
    while n<1500 and not (A.query_selector('.final') and B.query_selector('.final')):
        for pg in (A,B):
            btns=pg.query_selector_all('#callpanel .call:not([disabled])')
            if btns: random.choice(btns).click()
        A.wait_for_timeout(60); n+=1
    A.wait_for_timeout(500)
    sa=(A.inner_text('#sb-as'),A.inner_text('#sb-bs')); sb=(B.inner_text('#sb-as'),B.inner_text('#sb-bs'))
    print('iters',n,'A score',sa,'B score',sb,'logs match',A.inner_text('#log')==B.inner_text('#log'),'|',A.inner_text('.final h2'),'/',B.inner_text('.final h2'))
    Sp.fill('#code',code); Sp.click('#b-join'); Sp.wait_for_timeout(800)
    print('spectator in game:', Sp.query_selector('.game') is not None, Sp.inner_text('#sb-q'))
    A.reload(); A.wait_for_timeout(1200); print('A after reload:', A.query_selector('.final') is not None)
    # room full for 3rd joiner
    ctxC=b.new_context(); C=ctxC.new_page(); C.goto('http://localhost:5055/'); C.wait_for_timeout(300); C.click('[data-h=quick]'); C.wait_for_timeout(150)
    C.fill('#code',code); C.click('#b-join'); C.wait_for_timeout(600); print('third joiner toast:', C.inner_text('#toast') if C.query_selector('#toast:not([hidden])') else 'none')
    b.close()
print('\n'.join(errs[:20]) or 'NO ERRORS')
