from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':800})
    pg.goto('http://localhost:5055/'); pg.wait_for_timeout(500); pg.click('[data-h=quick]'); pg.select_option('#cap','loose'); pg.click('#b-cpu'); pg.wait_for_selector('.sd')
    pg.click('[data-act=sd-tab][data-k=DEF]'); pg.wait_for_timeout(200)
    print('overflow', pg.evaluate('document.documentElement.scrollWidth-innerWidth')); pg.screenshot(path='shots/m_sd.png')
