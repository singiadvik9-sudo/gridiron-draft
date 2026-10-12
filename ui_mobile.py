from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':780}, device_scale_factor=2)
    pg.goto('http://localhost:5055/'); pg.wait_for_timeout(400)
    pg.screenshot(path='shots/m_lobby.png')
    pg.click('#b-cpu'); pg.wait_for_timeout(200)
    for i in range(5): pg.keyboard.press('1')
    pg.wait_for_timeout(100); ov=[]
    ov.append(pg.evaluate('document.documentElement.scrollWidth-innerWidth')); pg.screenshot(path='shots/m_draft_ol.png',full_page=True)
    pg.keyboard.press('1'); pg.screenshot(path='shots/m_draft_def.png',full_page=True); ov.append(pg.evaluate('document.documentElement.scrollWidth-innerWidth'))
    pg.keyboard.press('1'); pg.click('[data-act=lock]'); pg.wait_for_timeout(500)
    pg.screenshot(path='shots/m_game.png',full_page=True); ov.append(pg.evaluate('document.documentElement.scrollWidth-innerWidth'))
    print('overflow px', ov); b.close()
