import random, re
from playwright.sync_api import sync_playwright
errs=[]
def watch(pg,tag):
    pg.on('pageerror', lambda e: errs.append(tag+' PAGEERROR '+str(e)))
    pg.on('console', lambda m: errs.append(tag+' CONSOLE '+m.text) if m.type=='error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
def reg(pg,name):
    pg.goto('http://localhost:5055/'); pg.wait_for_timeout(400)
    pg.click('[data-h=auth]'); pg.click('[data-h=auth-sw]'); pg.fill('#au-n',name); pg.fill('#au-p','secret12'); pg.click('[data-h=auth-go]'); pg.wait_for_timeout(500)
def step(pg):
    btns=pg.query_selector_all('#callpanel .call:not([disabled])')
    if btns:
        try: random.choice(btns).click(timeout=1500)
        except Exception: pass
with sync_playwright() as p:
    b=p.chromium.launch()
    A=b.new_context(viewport={'width':1100,'height':900}).new_page(); B=b.new_context(viewport={'width':1100,'height':900}).new_page()
    watch(A,'A'); watch(B,'B')
    import time; sfx=str(int(time.time())%100000); reg(A,'alice'+sfx); reg(B,'bobby'+sfx)
    print('A header', A.inner_text('#hdr-right').replace('\n',' | '))
    # campaign for account
    A.click('[data-h=home]'); A.click('[data-h=leagues]'); A.wait_for_timeout(300)
    A.click('[data-h=lg-new]'); A.wait_for_timeout(200); A.screenshot(path='shots/lg_new.png')
    A.fill('#nl-name','Sunday League'); A.click('[data-h=seg][data-k=divisions][data-v=true]'); A.wait_for_timeout(100)
    A.click('[data-h=lg-create]'); A.wait_for_timeout(600)
    code=re.search(r'(?i)code ([A-Z0-9]{5})',A.inner_text('#main')).group(1); print('league code',code)
    A.select_option('#lg-fr','SF'); A.click('[data-h=lg-claim]'); A.wait_for_timeout(400)
    A.click('[data-h=lg-fill][data-n="1"]'); A.wait_for_timeout(400); A.click('[data-h=lg-fill][data-n="1"]'); A.wait_for_timeout(400)
    # bob joins
    B.click('[data-h=home]'); B.click('[data-h=leagues]'); B.wait_for_timeout(300)
    B.fill('#jn-code',code); B.click('[data-h=join-code]'); B.wait_for_timeout(600)
    B.select_option('#lg-fr','KC'); B.click('[data-h=lg-claim]'); B.wait_for_timeout(500)
    A.wait_for_timeout(800); A.screenshot(path='shots/lg_lobby.png',full_page=True)
    print('A lobby teams:', [r.inner_text().split('\t')[0] for r in A.query_selector_all('table.tb tbody tr')])
    A.click('[data-h=lg-start]'); A.wait_for_timeout(800)
    print('A after start:', A.inner_text('.frmeta').replace('\n',' | '))
    B.wait_for_timeout(800); print('B sees:', B.inner_text('.frmeta').replace('\n',' | '))
    A.screenshot(path='shots/lg_home.png')
    # both play week 1 (head-to-head if paired)
    hasA=A.query_selector('[data-h=fr-play]'); hasB=B.query_selector('[data-h=fr-play]')
    print('play buttons', bool(hasA), bool(hasB), A.inner_text('.panel.next h2'), '/', B.inner_text('.panel.next h2'))
    A.click('[data-h=fr-play]'); B.click('[data-h=fr-play]'); A.wait_for_timeout(600); B.wait_for_timeout(600)
    n=0
    while n<3000 and not (A.query_selector('.final') and B.query_selector('.final')):
        step(A); step(B); A.wait_for_timeout(25); B.wait_for_timeout(25); n+=1
    print('hvh iters',n, A.inner_text('#sb-as'),'-',A.inner_text('#sb-bs'),'| B',B.inner_text('#sb-as'),'-',B.inner_text('#sb-bs'))
    A.screenshot(path='shots/lg_game.png')
    for pg in (A,B):
        pg.wait_for_selector('[data-act=ctx-done]',timeout=15000); pg.click('[data-act=ctx-done]'); pg.wait_for_timeout(800)
    print('A after:', A.inner_text('.panel.next h2'), '|', A.inner_text('.ratings').replace('\n',' '))
    # sim through the season as alice (vs cpu), bob gets simmed by manager
    for k in range(20):
        s=A.query_selector('[data-h=fr-sim]')
        if s: s.click(); A.wait_for_timeout(250)
        else:
            A.click('[data-h=fr-tab][data-t=lg]'); 
            sw=A.query_selector('[data-h=lg-simweek]')
            if sw:
                A.once('dialog', lambda d: d.accept()); sw.click(); A.wait_for_timeout(600)
            A.click('[data-h=fr-tab][data-t=home]'); A.wait_for_timeout(200)
        if A.query_selector('[data-h=fr-offseason]'): break
        if A.query_selector('.panel.next h2') and 'champions' in A.inner_text('.panel.next h2'): break
    print('A phase:', A.inner_text('.frmeta').replace('\n',' | '))
    A.screenshot(path='shots/lg_end.png')
    A.click('[data-h=fr-tab][data-t=stand]'); A.wait_for_timeout(200); A.screenshot(path='shots/lg_stand.png',full_page=True)
    # account history
    A.click('[data-h=account]'); A.wait_for_timeout(600); A.screenshot(path='shots/account.png',full_page=True)
    print('hist items', len(A.query_selector_all('.hist')))
    # tournament
    A.click('[data-h=home]'); A.click('[data-h=tourneys]'); A.wait_for_timeout(300)
    A.click('[data-h=tn-new]'); A.click('[data-h=seg][data-k=teamMode][data-v=nfl]'); A.click('[data-h=seg][data-k=semi][data-v="3"]'); A.fill('#nt-name','Test Cup'); A.screenshot(path='shots/tn_new.png',full_page=True)
    A.click('[data-h=tn-create]'); A.wait_for_timeout(600)
    tc=re.search(r'(?i)code ([A-Z0-9]{5})',A.inner_text('#main')).group(1); print('tourney',tc)
    A.click('[data-h=tn-join]'); A.wait_for_timeout(400); A.select_option('#tn-fr','DAL'); A.click('[data-h=tn-pick]'); A.wait_for_timeout(400)
    A.click('[data-h=tn-cpu][data-n="3"]'); A.wait_for_timeout(400)
    A.click('[data-h=tn-mv][data-i="0"][data-d="1"]'); A.wait_for_timeout(400)
    A.screenshot(path='shots/tn_setup.png',full_page=True)
    A.click('[data-h=tn-start]'); A.wait_for_timeout(800); A.screenshot(path='shots/tn_live.png',full_page=True)
    for r in range(4):
        pb=A.query_selector('[data-h=tn-play]')
        if not pb: break
        pb.click(); A.wait_for_timeout(500)
        n=0
        while n<2500 and not A.query_selector('.final'): step(A); A.wait_for_timeout(25); n+=1
        A.wait_for_selector('[data-act=ctx-done]',timeout=15000); A.click('[data-act=ctx-done]'); A.wait_for_timeout(800)
    print('tourney state:', A.inner_text('.chips').replace('\n',' | '), '|', (A.query_selector('.champ') or A).inner_text()[:80] if A.query_selector('.champ') else 'no champ yet')
    A.screenshot(path='shots/tn_end.png',full_page=True)
    # draft-mode tournament with a salary cap
    A.click('[data-h=home]'); A.click('[data-h=tourneys]'); A.wait_for_timeout(300)
    A.click('[data-h=tn-new]'); A.click('[data-h=seg][data-k=teamMode][data-v=draft]'); A.click('[data-h=seg][data-k=cap][data-v="325"]'); A.click('[data-h=seg][data-k=max][data-v="8"]'); A.fill('#nt-name','Draft Cup')
    A.click('[data-h=tn-create]'); A.wait_for_timeout(600)
    A.click('[data-h=tn-join]'); A.wait_for_timeout(400); A.click('[data-h=tn-cpu][data-n="3"]'); A.wait_for_timeout(400)
    A.screenshot(path='shots/tn_dsetup.png',full_page=True)
    print('start disabled before draft:', A.query_selector('[data-h=tn-start]').is_disabled())
    A.click('[data-h=tn-sdraft]'); A.wait_for_timeout(700); A.screenshot(path='shots/tn_dlive.png',full_page=True)
    A.click('[data-h=tn-board]'); A.wait_for_selector('.sd'); A.wait_for_timeout(300)
    print('board:', A.inner_text('.sd-top h2'), '|', A.inner_text('.capnums').replace('\n',' '))
    A.screenshot(path='shots/tn_board.png',full_page=True)
    A.click('[data-act=sd-auto]'); A.wait_for_selector('[data-h=tn-start]',timeout=20000); A.wait_for_timeout(500)
    print('after draft: start enabled', not A.query_selector('[data-h=tn-start]').is_disabled(), '|', A.inner_text('.chips').replace('\n',' | '))
    A.screenshot(path='shots/tn_ddone.png',full_page=True)
    b.close()
print('\n'.join(errs[:25]) or 'NO ERRORS')
