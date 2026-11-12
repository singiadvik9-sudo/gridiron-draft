// handoffs: the ball only changes hands within arm's reach (it never jumps to the back), the quarterback cannot be steered away from the
// mesh on a designed run, and runs go just as they did (same timing, same yards for the computer)
const E = require('./lib/engine.js'); require('./lib/live.js'); const LV = E.LIVE, LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 3 }), Tm = n => LG.teamsFor(L, n % 32, (n * 7 + 3) % 32);
const defs = ['ZONE', 'MAN', 'COV3', 'BLITZ', 'COV4', 'STACK', 'MAN2', 'SOFT'];
const gap = (pick, stick) => { let max = 0, n0 = 0, yd = 0, N = 200;
  for (let n = 0; n < N; n++) { const T = Tm(n), sim = LV.create({ seed: 70 + n, playNo: n, ballOn: 30, toGo: 10, offPick: pick, defPick: defs[n % 8], OS: T.a.squad, DS: T.b.squad, ctlO: !!stick, ctlD: false });
    let qx = null;
    while (!sim.out && sim.t < 2000) { const had = sim.handoff; LV.step(sim, stick || { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { o: [], d: [] });
      if (!had && sim.handoff) { n0++; const c = sim.by[sim.ball.car]; max = Math.max(max, Math.hypot(c.x - sim.by.QB.x, c.y - sim.by.QB.y)); qx = sim.by.QB.x; } }
    if (qx != null && stick && qx > -1.5) max = 99;   // the quarterback got to the line with the ball: he was steered
    const o = sim.out; yd += o.k === 'run' || o.td ? Math.min(65, o.x) : 0; }
  return { max, n0, N, avg: yd / N }; };
['RUN_IN', 'RUN_OUT', 'DRAW', 'REVERSE'].forEach(pick => {
  const h = gap(pick, { dx: 1, dy: 0.7 }); ok(h.n0 === h.N && h.max < 2.6, pick + ': a quarterback you steer is held at the mesh and hands it off within reach (largest gap ' + h.max.toFixed(1) + ' yards; it was over 5)'); });
const ai = { RUN_IN: 4.7, RUN_OUT: 5.6 };   // (2026-11: runs retuned: the backside edge stays home, blocked defenders shed to tackle, safeties miss in space)
Object.keys(ai).forEach(pick => { const h = gap(pick); ok(h.max < 2.6 && Math.abs(h.avg - ai[pick]) < 0.6, pick + ' with the computer: handoffs within reach (' + h.max.toFixed(1) + ' yards) and runs gain what they did (' + h.avg.toFixed(2) + ' a carry)'); });
