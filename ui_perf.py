"""Where the time goes in the browser: first load, each campaign screen, simulating a game, the field during a live snap.
Prints milliseconds (median of a few runs). CDP=http://localhost:9333 to use a Chrome you started, URL for the server."""
import os, sys, json, statistics
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:5055/')
def log(*a): print(*a); sys.stdout.flush()
SLOW = int(os.environ.get('SLOW', '1'))   # CPU slowed this many times (4: about a mid-range phone)
def page(b):
    ctx = b.new_context(viewport={'width': 1200, 'height': 900}); pg = ctx.new_page()
    if SLOW > 1: cdp = ctx.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': SLOW})
    return ctx, pg
TIME = """async sel => { const t0 = performance.now(); document.querySelector(sel).click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t0; }"""
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['CDP']) if os.environ.get('CDP') else p.chromium.launch()
    res = {}
    loads = []
    for k in range(3):
        ctx, pg = page(b)
        pg.goto(URL); pg.wait_for_selector('[data-h=quick]', timeout=20000)
        nav = pg.evaluate("(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, menu: window.__menuAt || null }; })()")
        loads.append(nav); ctx.close()
    res['load: DOMContentLoaded'] = statistics.median(x['dcl'] for x in loads); res['load: load event'] = statistics.median(x['load'] for x in loads)
    ctx, pg = page(b); pg.goto(URL); pg.wait_for_selector('[data-h=quick]')
    res['open campaign menu'] = pg.evaluate(TIME, '[data-h=camp]'); pg.wait_for_selector('[data-h=camp-new]')
    res['new campaign: team picker'] = pg.evaluate(TIME, '[data-h=camp-new]'); pg.wait_for_selector('[data-h=camp-pick]')
    res['new campaign: start'] = pg.evaluate(TIME, '[data-h=camp-pick]'); pg.wait_for_selector('[data-h=fr-tab]', timeout=20000)
    tabs = pg.evaluate("[...document.querySelectorAll('[data-h=fr-tab]')].map(b => b.dataset.t)")
    for t in tabs:
        xs = [pg.evaluate(TIME, '[data-h=fr-tab][data-t=%s]' % t) for _ in range(3)]
        res['tab: ' + t] = statistics.median(xs)
    pg.evaluate("document.querySelector('[data-h=fr-tab][data-t=home]').click()")
    sims = []
    for _ in range(3):
        if not pg.query_selector('[data-h=fr-sim]'): break
        sims.append(pg.evaluate("""async () => { const lt = []; const ob = new PerformanceObserver(l => l.getEntries().forEach(e => lt.push(e.duration))); ob.observe({ type: 'longtask' });
          const t0 = performance.now(); document.querySelector('[data-h=fr-sim]').click(); await new Promise(r => setTimeout(r, 30));
          for (let i = 0; i < 600; i++) { const o = document.getElementById('simov'); if (!o || o.hidden) break; await new Promise(r => setTimeout(r, 10)); }
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await new Promise(r => setTimeout(r, 50)); ob.disconnect(); return [performance.now() - t0, lt.length ? Math.max.apply(null, lt) : 0]; }"""))
        pg.wait_for_timeout(300)
    if sims: res['simulate your game (+ the week)'] = statistics.median(x[0] for x in sims); res['  longest freeze while simulating'] = statistics.median(x[1] for x in sims)
    # the longest the page froze while doing all that
    ctx.close()
    # the field: a practice game against the computer, a live snap
    ctx, pg = page(b); pg.goto(URL); pg.wait_for_selector('[data-h=quick]')
    pg.click('[data-h=quick]'); pg.wait_for_timeout(200); pg.click('#b-cpu'); pg.wait_for_selector('.sd, .game', timeout=20000)
    if pg.query_selector('[data-act=sd-auto]'): pg.click('[data-act=sd-auto]')
    pg.wait_for_selector('.game', timeout=30000)
    pg.evaluate("""() => { const F = GAME.Field, d = F.draw.bind(F); window.__dt = []; F.draw = function () { const t = performance.now(); d(); window.__dt.push(performance.now() - t); };
      window.__slow = []; const wrap = (o, k, name) => { const f = o[k]; o[k] = function () { const t = performance.now(), r = f.apply(this, arguments); const ms = performance.now() - t; if (ms > 8) window.__slow.push(name + ' ' + ms.toFixed(1)); return r; }; };
      ['start', 'finish', 'panel', 'draw', 'tick', 'rebuild', 'flashResult'].forEach(k => wrap(GD_LV, k, 'LV.' + k)); wrap(GAME, 'render', 'render'); }""")
    for _ in range(4):
        pg.wait_for_selector('#callpanel .call:not([disabled]), #callpanel button[data-act=km-stop]', timeout=30000)
        k = pg.query_selector('#callpanel button[data-act=km-stop]')
        if k and not pg.query_selector('#callpanel .call:not([disabled])'): k.click(); pg.wait_for_timeout(1500); continue
        if not pg.evaluate("document.querySelector('[data-act=ctl-toggle]') && document.querySelector('[data-act=ctl-toggle]').classList.contains('on')"): pg.click('[data-act=ctl-toggle]')
        pg.evaluate("window.__fr = []; (function loop(t0) { requestAnimationFrame(t => { if (window.GD_LIVE) window.__fr.push(t - t0); if (window.__fr.length < 400) loop(t); }); })(performance.now())")
        pg.click('#callpanel .call:not([disabled])')
        try: pg.wait_for_function('!!window.GD_LIVE', timeout=8000)
        except Exception: continue
        pg.keyboard.down('ArrowRight'); pg.wait_for_timeout(1500); pg.keyboard.up('ArrowRight')
        pg.wait_for_function('!window.GD_LIVE', timeout=40000); break
    dt = pg.evaluate('window.__dt || []'); fr = [x for x in pg.evaluate('window.__fr || []') if x > 0]
    if dt: res['field draw (median / p95 per frame)'] = '%.2f / %.2f' % (statistics.median(dt), sorted(dt)[int(len(dt) * 0.95)])
    if fr: res['live frames (median interval / longest)'] = '%.1f / %.1f' % (statistics.median(fr), max(fr))
    log('slow calls during the snap:', pg.evaluate('window.__slow'))
    ctx.close()
    for k, v in res.items(): log(('%-44s' % k) + (('%7.1f ms' % v) if isinstance(v, (int, float)) else (v + ' ms')))
    log('JSON ' + json.dumps({k: v for k, v in res.items()}))
