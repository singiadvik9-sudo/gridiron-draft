// Live controls: scrambling, the spin move, the big hit, tackle assist and the scramble drill.
const E = require('./lib/engine.js'); require('./lib/live.js'); const LV = E.LIVE, LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 3 }), T = LG.teamsFor(L, 0, 1);
const ctx = (n, o) => Object.assign({ seed: 500 + n, playNo: n, ballOn: 30, toGo: 10, offPick: 'PASS_M', defPick: ['ZONE', 'MAN', 'BLITZ', 'COV3'][n % 4], OS: T.a.squad, DS: T.b.squad, ctlO: true, ctlD: false }, o || {});
// a quarterback who runs past the line is a runner: his tackles are runs, not sacks
let runs = 0, sacksPast = 0, gains = [];
for (let n = 0; n < 60; n++) {
  const sim = LV.create(ctx(n)), co = LV.cursor([LV.enc(1, 0, 0, 0), LV.enc(14, 1, 0, 0)]), cd = LV.cursor([]);
  while (!sim.out && sim.t < LV.MAXT + 5) LV.advance(sim, co, cd);
  if (sim.out.k === 'sack' && sim.out.x > 0) sacksPast++;
  if (sim.out.k === 'run') { runs++; gains.push(sim.out.x); }
}
gains.sort((a, b) => a - b);
ok(sacksPast === 0 && runs > 30, 'a scrambling quarterback tackled past the line is a run, not a sack (' + runs + ' runs, median gain ' + gains[gains.length >> 1].toFixed(1) + ' yards)');
// no passes once he is past the line
{ const sim = LV.create(ctx(3, { defPick: 'PREVENT' })), co = LV.cursor([LV.enc(1, 0, 0, 0), LV.enc(10, 1, 0, 0), LV.enc(40, 1, 0, 1)]), cd = LV.cursor([]);
  let past = false; while (!sim.out && sim.t < LV.MAXT + 5) { LV.advance(sim, co, cd); if (sim.t === 40) past = sim.by.QB.x > 0; }
  ok(!past || !sim.thrown, 'a throw key past the line does nothing' + (past ? '' : ' (he never got past it here)')); }
// the spin move and the big hit: one defender right next to the ball carrier, many snaps, with and without them
const contact = (spin, hit) => { let tk = 0, fum = 0, n = 0;
  for (let k = 0; k < 400; k++) {
    const sim = LV.create(ctx(k, { offPick: 'RUN_IN', defPick: 'ZONE', ctlO: false })), co = LV.cursor([]), cd = LV.cursor([]);
    while (!sim.out && !(sim.ball.car === 'HB' && sim.t > sim.handoff + 1)) LV.advance(sim, co, cd);
    if (sim.out) continue;
    const hb = sim.by.HB, d = sim.D.find(q => !q.eng && q.hold === 0); if (!d) continue;
    sim.P.forEach(q => { if (q.side === 'd' && q !== d) { q.x = 30; q.y = 0; } });   // only this one can reach him
    d.x = hb.x + 0.5; d.y = hb.y; d.cool = 0; d.dive = 0; hb.imm = 0; hb.spin = spin ? 12 : 0; d.hit = hit ? 5 : 0; n++;
    LV.advance(sim, co, cd);
    if (sim.out && (sim.out.k === 'run' || sim.out.k === 'fumble')) tk++;
    if (sim.out && sim.out.k === 'fumble') fum++;
  } return { tk: tk / n, n }; };
const base = contact(false, false), spun = contact(true, false), hit = contact(false, true);
ok(spun.tk < base.tk - 0.1, 'the spin move (Q) makes the carrier harder to bring down (' + Math.round(base.tk * 100) + '% tackled on contact, ' + Math.round(spun.tk * 100) + '% while spinning)');
ok(hit.tk > base.tk + 0.04, 'a big hit (Q on defense) tackles more often (' + Math.round(hit.tk * 100) + '% vs ' + Math.round(base.tk * 100) + '%)');
// the big hit: more tackles and more fumbles when it lands, a stumble when it misses
{ const sim = LV.create(ctx(1, { offPick: 'RUN_IN', ctlO: false, ctlD: true })); const d = sim.D[0];
  sim.ctlId.d = d.id; const co = LV.cursor([]), cd = LV.cursor([LV.enc(2, 0, 0, 7)]);
  LV.advance(sim, co, cd); LV.advance(sim, co, cd);
  ok(d.hit > 0 && d.cool > 0, 'Q starts a big hit');
  for (let i = 0; i < 8 && !sim.out; i++) LV.advance(sim, co, cd);
  ok(sim.out || d.stumble > 0, 'and a big hit that finds nobody leaves him stumbling'); }
// tackle assist: a defender steering roughly at a nearby carrier is nudged onto his path
{ const sim = LV.create(ctx(2, { offPick: 'RUN_IN', defPick: 'ZONE', ctlO: false, ctlD: true })), co = LV.cursor([]);
  let cd = LV.cursor([]);
  while (!sim.out && !(sim.ball.car === 'HB' && sim.t > sim.handoff + 1)) LV.advance(sim, co, cd);
  const hb = sim.by.HB, d = sim.D.find(q => q.grp === 'S');
  d.eng = null; d.hold = 0; d.x = hb.x + 3; d.y = hb.y + 2; d.vx = 0; d.vy = 0; sim.ctlId.d = d.id;
  const vmax = d.vmax, tt = Math.min(0.8, Math.hypot(hb.x - d.x, hb.y - d.y) / (vmax + 1)), ix = hb.x + hb.vx * tt - d.x, iy = hb.y + hb.vy * tt - d.y;
  cd = LV.cursor([LV.enc(sim.t + 1, -1, -1, 0)]);   // the stick points roughly at him (diagonally), not exactly at where he is going
  LV.advance(sim, co, cd);
  const ang = (x, y) => Math.atan2(y, x), err = a => Math.abs(Math.atan2(Math.sin(a - ang(ix, iy)), Math.cos(a - ang(ix, iy))));
  ok(sim.out || err(ang(d.wx, d.wy)) < err(ang(-1, -1)) - 0.05, 'steering roughly at the carrier is nudged onto his path (' + Math.round(err(ang(-1, -1)) * 57) + ' degrees off with the stick alone, ' + Math.round(err(ang(d.wx, d.wy)) * 57) + ' with the assist)'); }
// quicker controlled player
{ const a = LV.create(ctx(4, { offPick: 'RUN_IN' })), b = LV.create(ctx(4, { offPick: 'RUN_IN', ctlO: false }));
  const co = LV.cursor([LV.enc(1, 0, 1, 0)]), cn = LV.cursor([]), cd = LV.cursor([]);
  LV.advance(a, co, cd); LV.advance(a, co, cd); LV.advance(b, cn, cd); LV.advance(b, cn, cd);
  ok(Math.abs(a.by.QB.vy) > 0.7, 'the player you steer gets going quickly (' + Math.abs(a.by.QB.vy).toFixed(2) + ' yd/s after two ticks)'); }
// scramble drill: receivers come back toward a quarterback who is still holding the ball
{ const sim = LV.create(ctx(9, { offPick: 'HITCH', defPick: 'ZONE' })), co = LV.cursor([LV.enc(1, 0, 0, 0), LV.enc(20, 0, -1, 0)]), cd = LV.cursor([]);
  let done = null; while (!sim.out && sim.t < 120) { LV.advance(sim, co, cd); const w = sim.by.WR2; if (!done && w.route && w.ri >= w.route.length) done = { t: sim.t, y: w.y }; }
  const w = sim.by.WR2; ok(!done || sim.out && sim.t < done.t + 10 || Math.abs(w.y - sim.by.QB.y) < Math.abs(done.y - sim.by.QB.y) + 0.5, 'a receiver whose route is done works back toward the scrambling quarterback'); }
// everything is still exactly reproducible (what keeps screens and the server in step)
const r1 = LV.run(ctx(7), [LV.enc(1, 0, 0, 0), LV.enc(9, 1, 1, 0), LV.enc(30, 1, 0, 7)], []), r2 = LV.run(ctx(7), [LV.enc(1, 0, 0, 0), LV.enc(9, 1, 1, 0), LV.enc(30, 1, 0, 7)], []);
ok(JSON.stringify(r1.out) === JSON.stringify(r2.out), 'the same inputs give the same snap');
console.log('ALL DONE');
// the ball is spotted where it is: a gain short of the line to gain is short (no rounding up to a first down)
{ const U = { a: E.teamUnits(T.a), b: E.teamUnits(T.b) }, st = Object.assign(E.initState(5), { kick: false, poss: 'a', down: 3, toGo: 10, ballOn: 30 });
  const short = E.stepGame(st, T, U, 5, 'PASS_M', 'ZONE', { k: 'pass', x: 9.6, who: 'WR1', tgt: 'WR1', t: 40 }, {}).state, made = E.stepGame(st, T, U, 5, 'PASS_M', 'ZONE', { k: 'pass', x: 10.1, who: 'WR1', tgt: 'WR1', t: 40 }, {}).state;
  ok(short.down === 4 && short.toGo === 1 && made.down === 1, '9.6 yards on 3rd and 10 is 4th and 1, 10.1 is a first down'); }
// a runner in the open is not stopped by the snap clock, and whoever tackles him is on him when he goes down
{ let late = 0, far = 0, n = 0;
  for (let i = 0; i < 300; i++) { const R = LV.run(ctx(i, { offPick: ['RUN_OUT', 'SWEEP', 'PASS_D', 'SCREEN'][i % 4], defPick: ['PREVENT', 'SOFT'][i % 2], ctlO: false, ctlD: true }), [], []), o = R.out, s = R.sim;
    if (o.k !== 'run' && o.k !== 'pass') continue; n++;
    if (o.t >= 260 && !o.by && !o.td && !o.oob) late++;
    if (o.by) { const q = s.by[o.by], c = s.by[o.who]; if (Math.hypot(q.x - c.x, q.y - c.y) > 0.85) far++; } }
  ok(late === 0 && far === 0, 'no run is cut off by the clock, and every tackler ends up on the man he tackled (' + n + ' plays)'); }
