// The first-down banner on a live play and the down that follows come from one rule: a first down only when the ball reached the line
const E = require('./lib/engine.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
let bad = 0; for (let k = 0; k < 20000; k++) { const toGo = 1 + (k % 10), ballOn = 5 + (k % 85), x = (k % 233) / 10 - 3; const y = E.liveGain(x, ballOn, Math.min(toGo, 100 - ballOn)); if ((y >= Math.min(toGo, 100 - ballOn)) !== (x >= Math.min(toGo, 100 - ballOn))) bad++; }
ok(bad === 0, 'the yards shown reach the line to gain exactly when the ball did (' + bad + ' disagreements in 20000)');
ok(E.liveGain(2.6, 40, 3) === 2 && E.liveGain(9.97, 40, 10) === 9 && E.liveGain(3.0, 40, 3) === 3, '2.6 yards on 3rd and 3 is shown as 2 (it used to say +3 · 1ST DOWN), 9.97 on 3rd and 10 as 9');
