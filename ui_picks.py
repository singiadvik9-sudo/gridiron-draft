"""Campaign trade screen: draft picks appear on both sides, can be offered, and move to the other team."""
import sys
from playwright.sync_api import sync_playwright
errs = []
URL = 'http://localhost:5070/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_context(viewport={'width': 1200, 'height': 1000}).new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'ERR_' not in m.text else None)
    pg.goto(URL); pg.wait_for_timeout(500)
    pg.click('[data-h=camp]'); pg.wait_for_timeout(300); pg.click('[data-h=camp-new]'); pg.wait_for_timeout(300)
    pg.click('.teambtn >> nth=0'); pg.wait_for_timeout(600)
    pg.click('.tab:has-text("Trades")'); pg.wait_for_timeout(300)
    n_me = len(pg.query_selector_all('.trcols > div:nth-child(1) input[data-id^="pk:"]'))
    n_them = len(pg.query_selector_all('.trcols > div:nth-child(2) input[data-id^="pk:"]'))
    print('pick boxes mine/theirs', n_me, n_them)
    assert n_me == 21 and n_them == 21, 'expected 3 years x 7 rounds each'
    pg.screenshot(path='shots/trade_picks.png', full_page=True)
    first = pg.query_selector('.trcols > div:nth-child(1) input[data-id^="pk:"]'); mid = first.get_attribute('data-id')
    # offer a 1st for their 7th: should be accepted; the lists then show the swap
    pg.evaluate("document.querySelector('.trcols > div:nth-child(1) input[data-id^=\"pk:\"]').click()"); pg.wait_for_timeout(150)
    v1 = pg.inner_text('.trcols > div:nth-child(1) h4'); print('send header', v1)
    last = pg.query_selector_all('.trcols > div:nth-child(2) input[data-id^="pk:"]')[-1].get_attribute('data-id')
    pg.evaluate("(()=>{const a=document.querySelectorAll('.trcols > div:nth-child(2) input[data-id^=\"pk:\"]');a[a.length-1].click()})()"); pg.wait_for_timeout(150)
    print('get header', pg.inner_text('.trcols > div:nth-child(2) h4'))
    pg.click('[data-h=tr-prop]'); pg.wait_for_timeout(500)
    toast = pg.evaluate("(()=>{const t=document.querySelector('.toast');return t?t.innerText:''})()"); print('toast:', toast)
    n_me2 = len(pg.query_selector_all('.trcols > div:nth-child(1) input[data-id^="pk:"]')); print('my picks after', n_me2)
    assert n_me2 == 21, 'one out one in'
    assert pg.query_selector('.trcols > div:nth-child(1) input[data-id="%s"]' % last) is not None, 'their pick is now in my list'
    assert pg.query_selector('.trcols > div:nth-child(1) input[data-id="%s"]' % mid) is None, 'my pick left'
    pg.screenshot(path='shots/trade_picks2.png', full_page=True)
print('ERRORS' if errs else 'NO ERRORS', errs[:3])
