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
// trick plays on the field: each one does its thing in the live sim, and replays exactly
{ const evOf = (play, k, tr) => { const R = LV.run({ seed: 300 + k, playNo: k, ballOn: 35, toGo: 8, offPick: play, defPick: ['ZONE', 'MAN', 'COV3', 'BLITZ'][k % 4], OS: T.a.squad, DS: T.b.squad, ctlO: !!tr, ctlD: !tr }, tr || [], []); return { R, ev: R.sim.evt.map(e => e[0] + ':' + (e[2] || '')) }; };
  const flea = evOf('TRICK', 1).ev;
  ok(flea.indexOf('hand:HB') >= 0 && flea.indexOf('pitch:HB') >= 0 && flea.indexOf('pitched:QB') >= 0 && flea.indexOf('throw:WR1') + flea.indexOf('throw:WR2') + flea.indexOf('throw:TE') > -3, 'flea flicker: handoff, the back pitches it back to the quarterback, then the throw (' + flea.join(' ') + ')');
  const hbp = evOf('HBPASS', 2).ev;
  ok(hbp.indexOf('pitch:QB') >= 0 && hbp.indexOf('pitched:HB') >= 0 && hbp.some(e => /^throw:/.test(e)), 'halfback pass: the toss to the back, then he throws it (' + hbp.join(' ') + ')');
  let lat = 0, rev = 0; for (let k = 0; k < 40; k++) { if (evOf('HOOKLAT', k).ev.indexOf('pitched:WR2') >= 0) lat++; if (evOf('REVERSE', k).ev.indexOf('hand:WR2') >= 0) rev++; }
  ok(lat >= 10 && rev === 40, 'hook and lateral pitches it to the trailer (' + lat + ' of 40 snaps; the others are not caught), the reverse goes to the receiver every time');
  const s1 = JSON.stringify(evOf('TRICK', 5).R.out), s2 = JSON.stringify(evOf('TRICK', 5).R.out);
  ok(s1 === s2, 'trick plays replay exactly');
  // hand control: E pitches it on the hook and lateral
  { const ctx = { seed: 77, playNo: 3, ballOn: 35, toGo: 8, offPick: 'HOOKLAT', defPick: 'SOFT', OS: T.a.squad, DS: T.b.squad, ctlO: true, ctlD: false }, sim = LV.create(ctx);
    let co = LV.cursor([LV.enc(1, 0, 0, 0), LV.enc(18, 0, 0, 1)]), cd = LV.cursor([]), done = false;
    while (!sim.out && sim.t < LV.MAXT + 5) { LV.advance(sim, co, cd); if (!done && sim.ball.car === 'WR1' && sim.thrown) { done = true; co = LV.cursor([LV.enc(sim.t + 1, 0, 0, 6)]); } }
    ok(!done || sim.evt.some(e => e[0] === 'pitch' && e[2] === 'WR1'), 'with the hook man in your hands, E pitches it' + (done ? '' : ' (not caught here)')); } }
// the coach's picks: legal calls for the side asking, a run and a pass on offense, a field goal in range on 4th down
{ const R = E.replay(401, T, {}, ['a', 'b']), st = Object.assign({}, st0, { down: 2, toGo: 7, ballOn: 40 });
  const o = E.suggest(st, R.log, T, R.U, 'a', 'off'), d = E.suggest(st, R.log, T, R.U, 'b', 'def');
  ok(o.picks.length === 3 && o.picks.every(id => E.legalOff(st, id) === id && E.OFF[id].cat !== 'TRICK') && o.picks.some(id => E.OFF[id].kind === 'run') && o.picks.some(id => E.OFF[id].kind === 'pass'), 'coach\'s picks on offense: three legal calls, a run and a pass among them (' + o.picks.join(', ') + ')');
  ok(d.picks.length >= 2 && d.picks.every(id => E.DEF_CALLS[id]) && /Expect/.test(d.why), 'and on defense, with the reason (' + d.picks.join(', ') + ': ' + d.why + ')');
  ok(E.suggest(Object.assign({}, st, { down: 4, toGo: 6, ballOn: 72 }), R.log, T, R.U, 'a', 'off').id === 'FG', 'on 4th down in range the coach says kick it');
  ok(JSON.stringify(E.suggest(st, R.log, T, R.U, 'a', 'off')) === JSON.stringify(o), 'the same spot gets the same advice'); }
// contested catches and the confidence they give: a catch over two or more defenders, then a boost for a few snaps
{ let comp = 0, ct = 0, conf = 0, ex = null;
  for (let g = 0; g < 20; g++) { const R = E.replay(600 + g, T, {}, ['a', 'b']); R.log.forEach(e => { if (e.anim === 'pass' && (e.ev === 'pass' || e.ev === 'td')) comp++; if (e.contested) ct++; if (e.conf) { conf++; ex = ex || e; } }); }
  ok(ct / comp > 0.04 && ct / comp < 0.2 && conf / 20 > 0.8 && conf / 20 < 5, 'some catches are contested (' + Math.round(100 * ct / comp) + '% of completions) and give a confidence boost (' + (conf / 20).toFixed(1) + ' a game): "' + (ex && ex.text) + '"');
  const sq = T.a.squad, wr = sq.wr[0], st = Object.assign({}, st0, { conf: { [wr.i]: { f: 3, b: E.CONF_BOOST, n: wr.n } } }), up = E.onFire(sq, st);
  ok(up.wr[0].o === Math.min(99, wr.o + E.CONF_BOOST) && up.wr[0].conf === 1, 'a receiver with confidence plays ' + E.CONF_BOOST + ' points better (' + wr.o + ' -> ' + up.wr[0].o + ')');
  const R = E.replay(605, T, {}, ['a', 'b']); ok(JSON.stringify(E.replay(605, T, {}, ['a', 'b']).log) === JSON.stringify(R.log), 'and replays exactly');
  const k = {}; for (let i = 0; i < 300; i++) { const o = LV.run({ seed: 900 + i, playNo: i, ballOn: 30, toGo: 10, offPick: ['PASS_M', 'PASS_S', 'PASS_D', 'FLOOD'][i % 4], defPick: Object.keys(E.DEF_CALLS)[i % 14], OS: T.a.squad, DS: T.b.squad, ctlO: false, ctlD: true }, [], []).out; if (o.k === 'pass') { const key = o.ct ? 'contested' : o.ck || 'plain'; k[key] = (k[key] || 0) + 1; } }
  ok(k.contested > 3 && k.dive > 3 && k.plain > k.contested, 'on the field, catches are told apart: ' + JSON.stringify(k)); }
// the play has to end: a quarterback who just holds it gets the late rush (zone defenders with nobody to cover come after him)
{ let tt = 0, sk = 0, n = 120; for (let i = 0; i < n; i++) { const R = LV.run({ seed: 900 + i, playNo: i, ballOn: 30, toGo: 10, offPick: ['PASS_M', 'PASS_S', 'PASS_D', 'FLOOD'][i % 4], defPick: Object.keys(E.DEF_CALLS)[i % 14], OS: T.a.squad, DS: T.b.squad, ctlO: true, ctlD: false }, [LV.enc(1, 0, 0, 0)], []); tt += R.out.t; if (R.out.k === 'sack' || R.out.sack) sk++; }
  ok(tt / n < 110 && sk / n > 0.8, 'a quarterback who holds the ball is brought down in about ' + (tt / n / LV.TPS).toFixed(1) + ' s (' + Math.round(100 * sk / n) + '% sacks; it was about 11 s)'); }
// two-point conversions: a switch that rides along with your call, the CPU's chart, and a result drawn on its own (nothing else moves)
{ // play a game with side a as a human always going for two: every one of its touchdowns is followed by a try
  const asHuman = sd => { const mv = {}; E.replay(sd, T, {}, ['a', 'b']).log.forEach(e => { if (e.off === 'a') mv[e.n + '-a'] = { pick: e.offPick, two: 1 }; else if (e.defPick) mv[e.n + '-a'] = { pick: e.defPick, two: 1 }; }); return E.replay(sd, T, mv, ['b']); };
  let B = null, tds = []; for (let sd = 701; sd < 760 && !tds.length; sd++) { B = asHuman(sd); tds = B.log.filter(e => e.ev === 'td' && e.ptsTeam === 'a'); }
  ok(tds.length > 0 && tds.every(e => e.two), 'going for two: every touchdown is followed by a two-point try (' + tds.length + ' of them: ' + tds.map(e => e.two > 0 ? 'good' : 'no good').join(', ') + ')');
  let n = 0, good = 0; for (let g = 0; g < 80; g++) { const m = {}, R0 = E.replay(900 + g, T, {}, ['a', 'b']); R0.log.forEach(e => { if (e.off === 'a') m[e.n + '-a'] = { pick: e.offPick, two: 1 }; else if (e.defPick) m[e.n + '-a'] = { pick: e.defPick, two: 1 }; }); E.replay(900 + g, T, m, ['b']).log.forEach(e => { if (e.two && e.ptsTeam === 'a') { n++; if (e.two > 0) good++; } }); }
  ok(good / n > 0.35 && good / n < 0.65, 'about half of them are good (' + Math.round(100 * good / n) + '% of ' + n + ')');
  ok(E.cpuGo2({ q: 4, ot: false, score: { a: 12, b: 14 } }, 'a') && !E.cpuGo2({ q: 4, ot: false, score: { a: 13, b: 14 } }, 'a') && !E.cpuGo2({ q: 1, ot: false, score: { a: 12, b: 14 } }, 'a'), 'the CPU goes by the chart in the second half (down 2 after the touchdown: go; down 1: kick)');
  ok(JSON.stringify(E.cleanMoves({ '3-a': { pick: 'RUN_IN', two: 1 } }, 'a')) === '{"3-a":{"pick":"RUN_IN","two":1}}', 'the server keeps the switch with the move'); }
// passes are thrown over the line: a lineman only gets his hands on a low throw
{ let dl = 0, low = 0, n = 0;
  for (let i = 0; i < 600; i++) { const R = LV.run({ seed: 900 + i, playNo: i, ballOn: 30, toGo: 10, offPick: ['PASS_M', 'PASS_S', 'MESH', 'HITCH', 'FLOOD', 'PASS_D'][i % 6], defPick: Object.keys(E.DEF_CALLS)[i % 14], OS: T.a.squad, DS: T.b.squad, ctlO: false, ctlD: true }, [], []);
    if (!R.sim.thrown) continue; n++; const o = R.out; if (o.pbu && R.sim.by[o.pbu].grp === 'DL') { dl++; } }
  ok(dl / n < 0.03, 'linemen bat down only a few passes (' + dl + ' of ' + n + ' throws, ' + (100 * dl / n).toFixed(1) + '%), the low ones'); }
