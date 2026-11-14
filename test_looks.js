// The defense's pre-snap looks, the quarterback's mistakes, audibles, defensive momentum (lockdown) and the pre-snap read.
const E = require('./lib/engine.js'), L = require('./lib/live.js');
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const mk = n => { const r = E.mulberry32(n); return [E.mkTeam('A', E.autoDraft(r)), E.mkTeam('B', E.autoDraft(r))]; };

// ---- moves: a look survives cleaning, a made-up one does not
{
  const mv = E.cleanMoves({ '3-b': { pick: 'ZONE', dj: 'SHOW' }, '4-b': { pick: 'MAN', dj: 'NUKE' } });
  ok(mv['3-b'].dj === 'SHOW' && !mv['4-b'].dj, 'cleanMoves keeps a real look only');
}

// ---- the dice: each look moves the matchup the way it says
{
  ok(E.adjMatch('CRASH', 'ZONE', 'RUN_IN') > 0 && E.adjMatch('CRASH', 'ZONE', 'PA_DEEP') < 0, 'crash: good against the run, bad against play-action');
  ok(E.adjMatch('PRESS', 'MAN', 'PASS_S') > 0 && E.adjMatch('PRESS', 'MAN', 'PASS_D') < 0, 'press: good against quick throws, bad deep');
  ok(E.adjMatch('SINK', 'ZONE', 'PASS_D') > 0 && E.adjMatch('SINK', 'ZONE', 'RUN_IN') < 0, 'sink: good deep, soft against the run');
  ok(E.adjMatch('SHOW', 'ZONE', 'PASS_M') > 0 && E.adjMatch('SHOW', 'BLITZ', 'PASS_M') < 0, 'show: a disguise fools the pass, a real blitz shown is tipped off');
}

// ---- the live sim: a look changes the alignment, and the same inputs give the same snap
{
  const [A, B] = mk(5), ctx = j => ({ seed: 21, playNo: 4, ballOn: 30, toGo: 10, offPick: 'PASS_M', defPick: 'MAN', dj: j, OS: A.squad, DS: B.squad });
  const base = L.create(ctx(null)), press = L.create(ctx('PRESS')), spy = L.create(ctx('SPY')), crash = L.create(ctx('CRASH')), sink = L.create(ctx('SINK'));
  const cb = s => s.D.find(p => p.pos === 'LCB');
  ok(cb(press).x < cb(base).x - 0.5, 'press: the corner walks up on the receiver');
  ok(spy.D.some(p => p.mode === 'spy'), 'spy: one defender shadows the quarterback');
  ok(crash.D.filter(p => p.grp === 'LB').every(p => p.x <= 2.01) && crash.read < base.read, 'crash: linebackers at the line, reading the run sooner');
  ok(sink.D.find(p => p.pos === 'FS').x > base.D.find(p => p.pos === 'FS').x, 'sink: the safeties start deeper');
  const r1 = L.run(ctx('SHOW'), [], []).out, r2 = L.run(ctx('SHOW'), [], []).out;
  ok(JSON.stringify(r1) === JSON.stringify(r2), 'a snap with a look is deterministic');
}

// ---- quarterback mistakes happen, now and then, on the field and in the dice
{
  let meat = 0, slip = 0, n = 0;
  for (let i = 0; i < 3000; i++) { const [A, B] = mk(i % 30 + 1); const o = L.run({ seed: i * 13 + 1, playNo: i, ballOn: 35, toGo: 10, offPick: ['PASS_S', 'PASS_M', 'PASS_D'][i % 3], defPick: 'ZONE', OS: A.squad, DS: B.squad }, [], []).out; n++; if (o.meat) meat++; if (o.slip) slip++; }
  ok(meat > 0 && meat / n < 0.03, 'live: a gift interception now and then (' + meat + ' in ' + n + ')');
  ok(slip > 0 && slip / n < 0.02, 'live: the ball slips now and then (' + slip + ' in ' + n + ')');
  let dm = 0, ds = 0;
  for (let i = 0; i < 4000; i++) { const [A, B] = mk(i % 30 + 1), U = { a: E.teamUnits(A), b: E.teamUnits(B) }, st = Object.assign(E.initState(1), { poss: 'a', ballOn: 35, down: 1, toGo: 10, playNo: i, clock: 600, q: 1, kick: null });
    const e = E.stepGame(st, { a: A, b: B }, U, 'm' + i, 'PASS_M', 'ZONE', null, {}).entry; if (e.meat) dm++; if (e.slip) ds++; }
  ok(dm > 0 && dm < 120 && ds > 0 && ds < 80, 'dice: gifts ' + dm + ' and slips ' + ds + ' in 4000 throws');
}

// ---- whole games: the computer uses looks, its quarterback audibles, defenses lock down; all of it replays the same
{
  let lock = 0, aud = 0, looks = 0, broken = 0;
  for (let g = 0; g < 40; g++) {
    const r = E.mulberry32(g + 3), T = { a: E.mkTeam('A', E.autoDraft(r)), b: E.mkTeam('B', E.autoDraft(r)) };
    const R1 = E.replay(500 + g, T, {}, ['a', 'b']), R2 = E.replay(500 + g, T, {}, ['a', 'b']);
    if (JSON.stringify(R1.state) !== JSON.stringify(R2.state)) broken++;
    R1.log.forEach(e => { if (e.lock) lock++; if (e.aud) aud++; if (e.dj) looks++; });
    const bad = R1.log.find(e => e.lock && !/LOCKDOWN/.test(e.text)); if (bad) broken++;
  }
  ok(!broken, 'games replay the same, and every lockdown is announced');
  ok(looks > 40 * 15, 'the computer shows looks (' + looks + ' in 40 games)');
  ok(aud > 40, 'computer quarterbacks audible against them (' + aud + ')');
  ok(lock > 10 && lock < 40 * 6, 'defenses lock down now and then (' + lock + ' in 40 games)');
}

// ---- lockdown: the defense plays better for its snaps, and its momentum restarts
{
  const st = Object.assign(E.initState(3), { poss: 'a', lock: { a: 0, b: 3 }, mom: { a: 10, b: 0 } }), [A, B] = mk(2), T = { a: A, b: B };
  const sn = E.snapTeams(T, null, st, 'RUN_IN', 3, {});
  ok(sn.teams.b.squad.df.p.every((q, i) => q[3] === Math.min(99, B.squad.df.p[i][3] + E.LOCK_BOOST)), 'a defense in lockdown plays +' + E.LOCK_BOOST);
  const nst = {}, e = { offPick: 'RUN_IN', off: 'a', ev: 'run', yards: 2, before: { down: 1 }, after: { poss: 'a', down: 2 }, text: '' };
  E.momAfter(st, nst, e, T); ok(nst.lock.b === 2, 'a lockdown counts down its snaps');
  const nst2 = {}, e2 = { offPick: 'PASS_D', off: 'a', ev: 'td', yards: 40, pts: 6, ptsTeam: 'a', before: { down: 1 }, after: { poss: 'a', down: 1 }, text: '' };
  E.momAfter(st, nst2, e2, T); ok(nst2.lock.b === 0 && /breaks/.test(e2.text), 'a touchdown breaks it');
  const st3 = Object.assign({}, st, { lock: { a: 0, b: 0 }, mom: { a: 0, b: 80 } }), nst3 = {}, e3 = { offPick: 'PASS_M', off: 'a', ev: 'int', yards: 0, before: { down: 2 }, after: { poss: 'b', down: 1 }, text: '' };
  E.momAfter(st3, nst3, e3, T); ok(nst3.lock.b === E.LOCK_SNAPS && nst3.mom.b === 0 && e3.lock === 'b', 'a turnover fills the meter: lockdown');
}

// ---- the pre-snap read against a computer offense: usually honest
{
  let honest = 0, n = 0;
  for (let g = 0; g < 30; g++) {
    const r = E.mulberry32(g + 7), T = { a: E.mkTeam('A', E.autoDraft(r)), b: E.mkTeam('B', E.autoDraft(r)) }, U = { a: E.teamUnits(T.a), b: E.teamUnits(T.b) };
    for (let p = 0; p < 30; p++) {
      const st = Object.assign(E.initState(g), { poss: 'a', ballOn: 40, down: 1 + p % 3, toGo: [10, 6, 3][p % 3], playNo: p, kick: null });
      const lk = E.scoutLook(st, U, 'a', 900 + g); if (!lk) continue;
      const pick = E.cpuMove(st, U, 'a', 900 + g, 'off'), kind = E.OFF[pick].kind; n++; if (lk.kind === kind) honest++;
    }
  }
  ok(n > 300 && honest / n > 0.6 && honest / n < 0.85, 'the read tells the truth about 7 in 10 (' + Math.round(honest / n * 100) + '%)');
}

// ---- check-with-me (your offense): only against a look your call is weak against, into the section you named, never by the real call
{
  const r = E.mulberry32(3), T = { a: E.mkTeam('A', E.autoDraft(r)), b: E.mkTeam('B', E.autoDraft(r)) }, U = { a: E.teamUnits(T.a), b: E.teamUnits(T.b) };
  const st = Object.assign(E.initState(1), { poss: 'a', ballOn: 40, down: 1, toGo: 10, playNo: 5, kick: null });
  let hits = 0, wrong = 0;
  for (let s = 0; s < 200; s++) { const a = E.checkWithMe(st, U, 'a', s, 'RUN_IN', 'SCREEN', 'CRASH'); if (a) { hits++; if (E.OFF[a].cat !== 'SCREEN') wrong++; } }
  ok(hits > 40 && !wrong, 'against crashing linebackers an inside run checks to a screen (' + hits + ' of 200)');
  ok(!E.checkWithMe(st, U, 'a', 1, 'PASS_M', 'RUN_IN', 'SHOW'), 'no check when the look is no threat to the call');
  ok(E.cleanMoves({ '2-a': { pick: 'RUN_IN', ck: 'SCREEN' }, '3-a': { pick: 'RUN_IN', ck: 'NOPE' } })['2-a'].ck === 'SCREEN', 'cleanMoves keeps a real check only');
  // in a game: a scripted offense with a check set, against a CPU defense that shows looks, checks now and then and replays the same
  let ck = 0;
  for (let g = 0; g < 6; g++) {
    const seed = 70 + g, moves = {}; let R = E.replay(seed, T, moves, ['b']);
    for (let i = 0; i < 400 && !R.state.over && R.wait == null; i++) {
      const st2 = R.state, n = st2.playNo, side = 'a', role = st2.poss === side ? 'off' : 'def';
      if (moves[n + '-' + side]) break;
      moves[n + '-' + side] = Object.assign({ pick: E.cpuMove(st2, R.U, side, seed, role, R.log) }, role === 'off' ? { ck: 'SCREEN' } : {});
      R = E.replay(seed, T, moves, ['b']);
    }
    R.log.forEach(e => { if (e.ck) ck++; });
    ok(JSON.stringify(E.replay(seed, T, moves, ['b']).state) === JSON.stringify(R.state), 'game ' + g + ' with checks replays the same');
  }
  ok(ck > 0, 'your quarterback checked to a screen in play (' + ck + ' times in 6 games)');
}

// ---- fourth down, the way a modern staff calls it
{
  const r = E.mulberry32(1), A = E.mkTeam('A', E.autoDraft(r)), B = E.mkTeam('B', E.autoDraft(r)), U = { a: E.teamUnits(A), b: E.teamUnits(B) };
  const call = o => { const c = {}; for (let s = 0; s < 60; s++) { const p = E.cpuMove(Object.assign(E.initState(1), { poss: 'a', down: 4, kick: null, q: 2, clock: 100, score: { a: 0, b: 0 }, playNo: s }, o), U, 'a', s, 'off'); const k = E.OFF[p].cat === 'SPEC' ? p : 'GO'; c[k] = (c[k] || 0) + 1; } return c; };
  ok(call({ ballOn: 50, toGo: 1 }).GO === 60 && call({ ballOn: 35, toGo: 1 }).GO === 60, '4th and inches past your own 30: go for it');
  ok(call({ ballOn: 25, toGo: 7 }).PUNT === 60 && call({ ballOn: 75, toGo: 8 }).FG === 60, '4th and long: punt from deep, kick in range');
  ok(call({ q: 4, clock: 80, score: { a: 10, b: 17 }, ballOn: 30, toGo: 9 }).GO === 60, 'behind by a touchdown on the last drive: never punt');
  ok(call({ q: 4, clock: 50, score: { a: 10, b: 12 }, ballOn: 75, toGo: 6 }).FG === 60, 'behind by two late, in range: kick the winner');
  ok(call({ q: 4, clock: 50, score: { a: 14, b: 10 }, ballOn: 40, toGo: 3 }).PUNT === 60, 'ahead late, deep in your own end: punt');
}

// ---- the ball in the air: the defender you steer is moved to the one who can get there, when yours is out of the play
{
  let sw = 0, n = 0;
  for (let i = 0; i < 300; i++) { const [A, B] = mk(i % 30 + 1); const sim = L.create({ seed: i * 7 + 2, playNo: i, ballOn: 35, toGo: 10, offPick: ['PASS_M', 'PASS_D'][i % 2], defPick: 'ZONE', OS: A.squad, DS: B.squad, ctlD: true });
    sim.ctlId.d = sim.D.find(p => p.grp === 'DL').id; let tT = null;
    while (!sim.out && sim.t < L.MAXT) { L.step(sim, null, null, { o: [], d: [] }); if (sim.ball.air && tT == null) tT = sim.t; if (tT != null && sim.t === tT + 2) { n++; if (sim.by[sim.ctlId.d].grp !== 'DL') sw++; } } }
  ok(n > 100 && sw / n > 0.35, 'a lineman you were steering hands off to a defender near the throw (short throws near the line stay with him) (' + sw + ' of ' + n + ')');
}
