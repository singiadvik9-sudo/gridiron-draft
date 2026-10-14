"""Campaign: sim a few of your games, then read your own players' stats by week and in total."""
from playwright.sync_api import sync_playwright
errs = []
URL = 'http://localhost:5071/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_context(viewport={'width': 1200, 'height': 1000}).new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'ERR_' not in m.text else None)
    pg.goto(URL); pg.wait_for_timeout(500)
    pg.click('[data-h=camp]'); pg.wait_for_timeout(300); pg.click('[data-h=camp-new]'); pg.wait_for_timeout(300)
    pg.click('.teambtn >> nth=0'); pg.wait_for_timeout(600)
    pg.click('.tab:has-text("Stats")'); pg.wait_for_timeout(200)
    print('before:', pg.inner_text('.panel:has(select[data-hc=sview]) .hint'))
    for i in range(3):
        pg.click('.tab:has-text("Home")'); pg.wait_for_timeout(200)
        pg.click('[data-h=fr-sim]'); pg.wait_for_timeout(700)
    pg.click('.tab:has-text("Stats")'); pg.wait_for_timeout(300)
    opts = [o.inner_text() for o in pg.query_selector_all('select[data-hc=sview] option')]; print('periods', opts)
    tot = pg.inner_text('.panel:has(select[data-hc=sview])'); print('total view:\n', tot[:500])
    pg.screenshot(path='shots/stats_total.png', full_page=True)
    pg.select_option('select[data-hc=sview]', index=1); pg.wait_for_timeout(300)
    print('week view:\n', pg.inner_text('.panel:has(select[data-hc=sview])')[:400])
    pg.screenshot(path='shots/stats_week.png', full_page=True)
    assert len(opts) >= 5, 'season + 3 games + career'
print('ERRORS' if errs else 'NO ERRORS', errs[:3])
