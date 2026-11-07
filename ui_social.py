"""Two players in an online quick game: chat both ways (over the direct link and through the server), emotes on the scoreboard, mute,
the other player's connection dot, and a rematch at the end. CDP=http://localhost:9333 to use a Chrome you started, URL for the server."""
import os, sys
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:5055/'); errs = []
def log(*a): print(*a); sys.stdout.flush()
def ok(c, m): log(('ok   ' if c else 'FAIL ') + m); (None if c else errs.append(m))
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['CDP']) if os.environ.get('CDP') else p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1200, 'height': 900}); pages = []
    for tag in 'AB':
        pg = ctx.new_page(); pg.on('pageerror', lambda e, t=tag: errs.append(t + ' PAGEERROR ' + str(e)))
        pg.goto(URL); pg.wait_for_timeout(400); pg.click('[data-h=quick]'); pg.wait_for_timeout(150); pages.append(pg)
    A, B = pages
    A.fill('#team', 'Alpha'); A.click('#b-create'); A.wait_for_selector('.chip.room'); code = A.inner_text('.chip.room').split()[-1]
    B.fill('#team', 'Bravo'); B.fill('#code', code); B.click('#b-join'); B.wait_for_selector('.chip.room')
    A.wait_for_selector('#chatdock .chat-tab', timeout=10000); B.wait_for_selector('#chatdock .chat-tab', timeout=10000)
    ok(True, 'both have a chat box during the draft')
    A.click('#chatdock .chat-tab'); A.fill('#chatdock input', 'hello from alpha'); A.press('#chatdock input', 'Enter')
    B.wait_for_function("document.querySelector('#chatdock .chat-badge') && !document.querySelector('#chatdock .chat-badge').hidden", timeout=8000)
    ok(B.inner_text('#chatdock .chat-badge') == '1', 'the other player gets an unread badge')
    B.click('#chatdock .chat-tab'); ok('hello from alpha' in B.inner_text('#chatdock .chat-log'), 'and reads it: "' + B.inner_text('#chatdock .chat-log').strip()[:60] + '"')
    B.click('#chatdock .chat-quick button >> nth=1'); A.wait_for_function("document.querySelector('#chatdock .chat-log').innerText.indexOf('Good game!') >= 0", timeout=8000)
    ok(True, 'a quick line arrives on the other side')
    # typing in the chat does not drive the game (the draft's keys, the field's keys)
    A.fill('#chatdock input', 'asdf 1234'); ok(A.input_value('#chatdock input') == 'asdf 1234', 'typing goes to the chat')
    A.fill('#chatdock input', '')
    for pg in (A, B): pg.click('[data-act=sd-auto]')
    A.wait_for_selector('.game', timeout=40000); B.wait_for_selector('.game', timeout=40000)
    ok(A.query_selector('#chatdock .chatbox') is not None and B.query_selector('#chatdock .chat-emotes') is not None, 'the chat stays for the game, with emotes')
    A.wait_for_function("document.getElementById('oppst') && !document.getElementById('oppst').hidden", timeout=10000)
    ok('Bravo' in A.inner_text('#oppst'), 'the other player\'s dot by the room code: "' + A.inner_text('#oppst') + '" (' + A.get_attribute('#oppst', 'class') + ')')
    B.click('#chatdock .emo-b[data-emo=fire]'); A.wait_for_selector('.emo-bubble', timeout=8000)
    ok('On fire' in A.inner_text('.emo-bubble'), 'an emote pops up by the team on the other screen: "' + A.inner_text('.emo-bubble') + '"')
    B.click('#chatdock .emo-b[data-emo=gg]'); B.wait_for_timeout(300); ok('few seconds' in (B.inner_text('#toast') if B.query_selector('#toast:not([hidden])') else ''), 'emotes have a cooldown')
    # mute: A mutes Bravo; Bravo's next line does not show on A's screen
    A.click('#chatdock .chat-log .chat-who:has-text("Bravo")'); A.wait_for_timeout(200)
    ok('Muted Bravo' in A.inner_text('#chatdock .chat-log'), 'clicking a name mutes him')
    B.wait_for_timeout(800); B.fill('#chatdock input', 'can you hear me'); B.press('#chatdock input', 'Enter'); A.wait_for_timeout(2500)
    ok('can you hear me' not in A.inner_text('#chatdock .chat-log'), 'and his messages stay hidden')
    A.click('#chatdock .chat-log [data-unmute=Bravo]'); A.wait_for_timeout(200)
    ok('can you hear me' in A.inner_text('#chatdock .chat-log'), 'until he is unmuted')
    # rematch (the final screen's button runs the same action; a whole game is too long for this test): one asks, the other follows to the same room
    inject = "document.body.insertAdjacentHTML('beforeend', '<button data-act=rematch id=rmtest>Rematch</button>')"
    A.evaluate(inject); A.click('#rmtest'); A.wait_for_function("GAME.S.code && GAME.S.code !== '%s'" % code, timeout=10000)
    newc = A.evaluate('GAME.S.code'); B.wait_for_timeout(1500)
    B.evaluate(inject); B.click('#rmtest'); B.wait_for_function("GAME.S.code === '%s'" % newc, timeout=10000)
    A.wait_for_selector('.sd', timeout=10000); B.wait_for_selector('.sd', timeout=10000)
    ok(A.evaluate('GAME.S.me') == 'a' and B.evaluate('GAME.S.me') == 'b', 'a rematch: both are drafting again in the new room (' + newc + ')')
    ok(A.query_selector('#chatdock .chatbox') is not None and 'hello from alpha' not in A.inner_text('#chatdock'), 'with a fresh chat')
    ctx.close()
log('\n'.join(errs) or 'NO ERRORS')
