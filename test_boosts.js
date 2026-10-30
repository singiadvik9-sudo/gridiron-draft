// Confidence on the run and after tough catches (1 in 4), stiff arms, jukes that count, drops that shake a receiver, backs on fire,
// and the fixes to the WR reverse and to quarterbacks scrambling up the middle.
const E = require('./lib/engine.js'); require('./lib/live.js'); const LV = E.LIVE, LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 3 }), Tm = n => LG.teamsFor(L, n % 32, (n * 7 + 3) % 32);
const defs = ['ZONE', 'MAN', 'COV3', 'BLITZ', 'COV4', 'STACK', 'MAN2', 'SOFT'];
const yds = o => o.k === 'run' || o.k === 'pass' || o.td ? Math.min(65, o.x) : o.k === 'sack' ? o.x : 0;
// stiff arm: a runner you steer who stiff arms (W) as tacklers close in is brought down less and puts defenders on the ground
{ let broke = [0, 0], st = 0, N = 300;
  [false, true].forEach((arm, k) => { for (let n = 0; n < N; n++) { const T = Tm(n), tr = [LV.enc(1, 1, 0, 0)]; if (arm) for (let t = 12; t < 200; t += 14) tr.push(LV.enc(t, 1, 0, 1));
    const r = LV.run({ seed: 70 + n, playNo: n, ballOn: 30, toGo: 10, offPick: 'RUN_IN', defPick: defs[n % 8], OS: T.a.squad, DS: T.b.squad, ctlO: true, ctlD: false }, tr, []);
    broke[k] += yds(r.out); if (arm && r.out.mv && /stiff/.test(r.out.mv)) st++; } });
  ok(broke[1] > broke[0] + N * 0.2, 'stiff arms help a runner: ' + (broke[0] / N).toFixed(1) + ' yards a carry without, ' + (broke[1] / N).toFixed(1) + ' with');
  ok(st > N * 0.15, 'and the ones that put a defender down are recorded for a shot at confidence (' + st + ' of ' + N + ' carries)'); }
// juke: one in a defender's face that shakes him counts; one in open space does not
{ let close = 0, far = 0, N = 300;
  for (let n = 0; n < N; n++) { const T = Tm(n), sim = LV.create({ seed: 170 + n, playNo: n, ballOn: 30, toGo: 10, offPick: 'RUN_OUT', defPick: defs[n % 8], OS: T.a.squad, DS: T.b.squad, ctlO: true, ctlD: false });
    let jk = 0;
    while (!sim.out && sim.t < 2000) { const c = sim.by[sim.ball.car], nd = c && c.side === 'o' ? Math.min.apply(null, sim.D.map(d => Math.hypot(d.x - c.x, d.y - c.y))) : 99, a = [];
      if (c && c.cool === 0 && c.id !== 'QB' && (n % 2 ? nd < 2.2 : nd > 6 && !jk)) { a.push(5); jk = 1; }   // half the time in a defender's face, half in open space
      LV.step(sim, { dx: 1, dy: 0 }, { dx: 0, dy: 0 }, { o: a, d: [] }); }
    const j = sim.evt.filter(e => e[0] === 'juked'); if (n % 2) close += j.length ? 1 : 0; else far += j.length ? 1 : 0;
    if (j.some(e => !sim.by[e[3]] || sim.by[e[3]].side !== 'd')) close = -1e9; }
  ok(close > N * 0.03 && far === 0, 'jukes right in a defender\'s face that shake him are counted (on ' + close + ' of ' + N / 2 + ' carries), ones in open space never (' + far + ')'); }
// the engine: one roll in four for each move or tough catch, a contested catch always, a drop shakes him and puts out his fire
{ const T = LG.teamsFor(L, 1, 2), U = { a: E.teamUnits(T.a), b: E.teamUnits(T.b) }, st0 = Object.assign(E.initState(2), { poss: 'a' });
  const after = (e0, st) => { const nst = {}, e = Object.assign({ off: 'a', offPick: 'RUN_IN', text: '' }, e0); E.__confAfter(st || st0, nst, e, T, 77); return { nst, e }; };
  let hits = 0, N = 2000; for (let n = 0; n < N; n++) { const r = after({ n, ev: 'run', runId: 'HB', anim: 'run', yards: 6, mv: 'stiff' }); if (r.e.conf) hits++; }
  ok(hits / N > 0.21 && hits / N < 0.29, 'a stiff arm that works gives a confidence boost 1 time in 4 (' + (100 * hits / N).toFixed(1) + '%)');
  let h2 = 0; for (let n = 0; n < N; n++) { const r = after({ n, ev: 'pass', anim: 'pass', recId: 'WR1', yards: 14, catchK: 'dive', mv: 'juke' }); if (r.e.conf) h2++; }
  ok(h2 / N > 0.38 && h2 / N < 0.5, 'a diving catch plus a juke: two rolls (' + (100 * h2 / N).toFixed(1) + '%, about 7 in 16)');
  const toe = after({ n: 5, ev: 'pass', anim: 'pass', recId: 'WR1', yards: 8, contested: 2 }); ok(!!toe.e.conf, 'a catch over two defenders still always does');
  const id = E.idOf(T.a, 'WR1'), hot = Object.assign({}, st0, { conf: { [id]: { f: 4, b: 5, n: 'x' } }, fire: { [id]: { s: 2, f: 5, n: 'x' } } });
  const nst = {}, e = { n: 9, off: 'a', offPick: 'PASS_M', ev: 'inc', anim: 'inc', recId: 'WR1', dropped: 1, text: '' };
  E.__fireAfter(hot, nst, e, T); E.__confAfter(hot, nst, e, T, 77);
  ok(nst.conf[id].b < 0 && !(nst.fire[id] && nst.fire[id].f > 0) && /shaken/.test(e.text), 'a drop: the boost and the fire are gone and he is shaken for a few snaps: "' + e.text.trim() + '"');
  const sq = E.onFire(T.a.squad, nst); ok(sq.wr[0].o < T.a.squad.wr[0].o && sq.wr[0].shaken, 'and he plays below his rating (' + T.a.squad.wr[0].o + ' -> ' + sq.wr[0].o + ')');
  // backs: two big runs (10+) back to back
  let s = st0; const run = y => { const nst = {}; const e = { n: 1, off: 'a', offPick: 'RUN_IN', ev: 'run', anim: 'run', runId: 'HB', yards: y, text: '' }; E.__fireAfter(s, nst, e, T); s = Object.assign({}, s, nst); return e; };
  run(12); const e2 = run(11); ok(!!e2.fire, 'a back with two runs of 10+ yards in a row catches fire');
  s = st0; run(12); run(4); ok(!run(11).fire, 'but not when a short run comes in between'); }
// the reverse is no longer free yards, and a quarterback cannot run straight up the middle through the line
{ const rev = (human) => { let t = 0, N = 300; for (let n = 0; n < N; n++) { const T = Tm(n), tr = human ? [LV.enc(9, 0, -1, 0), LV.enc(14, 1, -1, 0), LV.enc(22, 1, 0, 0)] : [];
    t += yds(LV.run({ seed: 500 + n, playNo: n, ballOn: 35, toGo: 10, offPick: 'REVERSE', defPick: defs[n % 8], OS: T.a.squad, DS: T.b.squad, ctlO: human, ctlD: false }, tr, []).out); } return t / N; };
  const h = rev(true); ok(h < 4.5, 'a reverse cut upfield early gains ' + h.toFixed(1) + ' yards a try (it was about 7, almost every time)');
  let t = 0, five = 0, N = 300; for (let n = 0; n < N; n++) { const T = Tm(n);
    const y = yds(LV.run({ seed: 900 + n, playNo: n, ballOn: 35, toGo: 10, offPick: ['PASS_M', 'PASS_S', 'PASS_D', 'CURLS'][n % 4], defPick: defs[n % 8], OS: T.a.squad, DS: T.b.squad, ctlO: true, ctlD: false }, [LV.enc(12, 1, 0, 0)], []).out); t += y; if (y >= 5) five++; }
  ok(t / N < 3 && five / N < 0.3, 'a quarterback running straight up the middle gains ' + (t / N).toFixed(1) + ' yards (5+ only ' + Math.round(100 * five / N) + '% of the time; it was 5.4 and 67%)'); }
