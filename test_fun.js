// More fun: trick plays (and the defense remembering them), players catching fire, and lob vs bullet passes.
const E = require('./lib/engine.js'); require('./lib/live.js'); const LV = E.LIVE, LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 3 }), T = LG.teamsFor(L, 0, 1), U = { a: E.teamUnits(T.a), b: E.teamUnits(T.b) };
const st0 = Object.assign(E.initState(5), { kick: false, poss: 'a', down: 2, toGo: 8, ballOn: 40 });
// trick plays
ok(E.OFF_CATS.some(c => c.id === 'TRICK') && ['TRICK', 'HOOKLAT', 'FAKEPUNT'].every(id => E.OFF[id] && E.OFF[id].cat === 'TRICK'), 'a Trick Plays category: flea flicker, hook and lateral, fake punt');
ok(E.legalOff(st0, 'FAKEPUNT') === 'RUN_IN' && E.legalOff(Object.assign({}, st0, { down: 4 }), 'FAKEPUNT') === 'FAKEPUNT', 'the fake punt is a 4th-down call');
const avg = (pick, def, st) => { let y = 0; for (let n = 0; n < 1500; n++) y += E.stepGame(Object.assign({}, st, { playNo: n }), T, U, 77, pick, def).state.ballOn - st.ballOn; return y / 1500; };
const fresh = avg('TRICK', 'BLITZ', st0), seen = avg('TRICK', 'BLITZ', Object.assign({}, st0, { tricks: { a: 2 } }));
ok(fresh > seen + 1.5, 'a flea flicker against the blitz works, but less once the defense has seen tricks (' + fresh.toFixed(1) + ' yards a play fresh, ' + seen.toFixed(1) + ' after two)');
ok(E.stepGame(st0, T, U, 77, 'HOOKLAT', 'ZONE').state.tricks.a === 1, 'the game state counts each team\'s trick plays');
// on fire
let fires = 0, outs = 0, boosted = 0, games = 30;
for (let g = 0; g < games; g++) {
  const R = E.replay(400 + g, T, {}, ['a', 'b']);
  R.log.forEach(e => { if (e.fire) fires++; if (e.fireOut) outs++; });
}
ok(fires / games > 0.8 && fires / games < 4, 'players catch fire a couple of times a game (' + (fires / games).toFixed(2) + ' a game, cooled off ' + (outs / games).toFixed(2) + ')');
{ const R = E.replay(401, T, {}, ['a', 'b']);
  ok(JSON.stringify(E.replay(401, T, {}, ['a', 'b']).log) === JSON.stringify(R.log), 'the same game replays exactly, fire included (what the league server checks)');
  const sq = T.a.squad, hb = sq.hb, st = Object.assign({}, st0, { fire: { [hb.i]: { s: 2, f: 4, n: hb.n } } }), hot = E.onFire(sq, st);
  ok(hot.hb.o === Math.min(99, hb.o + E.FIRE_BOOST) && hot.hb.fire === 1 && E.onFire(sq, st0) === sq, 'a player on fire plays ' + E.FIRE_BOOST + ' points better (' + hb.o + ' -> ' + hot.hb.o + ')'); }
// lob vs bullet: a lob floats higher and slower, and underneath defenders cannot get a hand on it on the way
const ctx = n => ({ seed: 900 + n, playNo: n, ballOn: 30, toGo: 10, offPick: 'PASS_D', defPick: ['ZONE', 'MAN', 'COV3', 'PREVENT'][n % 4], OS: T.a.squad, DS: T.b.squad, ctlO: true, ctlD: false });
const throwAt = (n, lob) => { const sim = LV.create(ctx(n)), ev = [LV.enc(1, 0, 0, 0)].concat(lob ? [LV.enc(30, 0, 0, 8)] : []).concat([LV.enc(30, 0, 0, 1)]), co = LV.cursor(ev), cd = LV.cursor([]);
  while (!sim.out && !sim.ball.air && sim.t < 60) LV.advance(sim, co, cd);
  const a = sim.ball.air;
  while (!sim.out && sim.t < LV.MAXT + 5) LV.advance(sim, co, cd);
  return { a, out: sim.out }; };
let n0 = 0, bPeak = 0, lPeak = 0, bN = 0, lN = 0, bYd = 0, lYd = 0;
for (let n = 0; n < 200; n++) { const b = throwAt(n, false), l = throwAt(n, true); if (!b.a || !l.a) continue; n0++;
  bPeak += b.a.peak; lPeak += l.a.peak; bN += b.a.n; lN += l.a.n; if (b.out.k === 'pass') bYd += b.out.x; if (l.out.k === 'pass') lYd += l.out.x; }
ok(n0 > 150 && lPeak > bPeak * 1.8 && lN > bN * 1.3, 'Shift + throw key lobs it: higher (' + (lPeak / n0).toFixed(1) + ' vs ' + (bPeak / n0).toFixed(1) + ') and longer in the air (' + (lN / n0 / LV.TPS).toFixed(2) + 's vs ' + (bN / n0 / LV.TPS).toFixed(2) + 's)');
ok(lYd > bYd, 'and deep lobs gain more than deep bullets (' + (lYd / n0).toFixed(1) + ' vs ' + (bYd / n0).toFixed(1) + ' yards a throw)');
{ const r = throwAt(5, true); ok(r.a.lob === true && JSON.stringify(throwAt(5, true).out) === JSON.stringify(r.out), 'lobs replay exactly'); }
