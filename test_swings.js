// Weather, dimes, the quarterback and defenders catching fire, corners on lockdown and the in-game swings.
const E = require('./lib/engine.js'), L = require('./lib/live.js');
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const mk = n => { const r = E.mulberry32(n); return [E.mkTeam('A', E.autoDraft(r)), E.mkTeam('B', E.autoDraft(r))]; };

// ---- weather: drawn from the seed, in the state, and it bites
{
  const seen = {}; for (let s = 0; s < 400; s++) seen[E.initState(s).wx] = (seen[E.initState(s).wx] || 0) + 1;
  ok(Object.keys(E.WEATHER).every(k => seen[k] > 0) && seen.clear > 200, 'every kind of weather turns up, clear most often (' + JSON.stringify(seen) + ')');
  const dice = wx => { let comp = 0, att = 0, fum = 0, runs = 0; for (let i = 0; i < 3000; i++) { const [A, B] = mk(i % 30 + 1), U = { a: E.teamUnits(A), b: E.teamUnits(B) };
      const st = Object.assign(E.initState(1), { poss: 'a', ballOn: 35, down: 1, toGo: 10, playNo: i, clock: 600, q: 1, kick: null, wx });
      const e = E.stepGame(st, { a: A, b: B }, U, 'w' + i, i % 2 ? 'PASS_M' : 'RUN_IN', 'ZONE', null, {}).entry;
      if (i % 2) { if (e.anim === 'pass') { comp++; att++; } else if (e.anim === 'inc' || e.anim === 'int') att++; } else runs++;
      if (e.ev === 'fumble' || e.fum) fum++; } return { comp: comp / att, fum }; };
  const c = dice('clear'), r = dice('storm');
  ok(r.comp < c.comp - 0.05 && r.fum > c.fum * 1.4, 'heavy rain: fewer completions (' + Math.round(100 * r.comp) + '% vs ' + Math.round(100 * c.comp) + '%) and more fumbles (' + r.fum + ' vs ' + c.fum + ')');
  const [A, B] = mk(3), ctx = wx => ({ seed: 5, playNo: 1, ballOn: 30, toGo: 10, offPick: 'PASS_M', defPick: 'ZONE', wx, OS: A.squad, DS: B.squad });
  ok(L.create(ctx('snow')).by.WR1.vmax < L.create(ctx('clear')).by.WR1.vmax, 'snow: everyone is a step slower on the field');
  ok(E.kickGreen({ wx: 'wind' }, 80, 40) < E.kickGreen({ wx: 'clear' }, 80, 40) && E.kickGreen({ wx: 'clear' }, 80, 40, true) < E.kickGreen({ wx: 'clear' }, 80, 40), 'wind and an icing timeout narrow the kick meter');
}

// ---- dimes: always caught, a burst, now and then
{
  let dimes = 0, caught = 0, n = 0;
  for (let i = 0; i < 2500; i++) { const [A, B] = mk(i % 30 + 1); const sim = L.create({ seed: i * 17 + 3, playNo: i, ballOn: 35, toGo: 10, offPick: ['PASS_S', 'PASS_M', 'PASS_D'][i % 3], defPick: 'ZONE', OS: A.squad, DS: B.squad });
    while (!sim.out && sim.t < L.MAXT) L.step(sim, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, []);
    if (sim.evt.some(e => e[0] === 'dime')) { dimes++; if (sim.out.k === 'pass' || sim.out.td || (sim.out.k === 'fumble' && sim.out.pass)) caught++; } n++; }
  ok(dimes > n * 0.01 && dimes < n * 0.08, 'dimes now and then (' + dimes + ' in ' + n + ' throws)');
  ok(caught === dimes, 'and every dime is caught (' + caught + ' of ' + dimes + ')');
}

// ---- swings over whole games, replayed the same
{
  const cnt = {}; let fires = 0, dfires = 0, broken = 0;
  for (let g = 0; g < 40; g++) {
    const r = E.mulberry32(g + 21), T = { a: E.mkTeam('A', E.autoDraft(r)), b: E.mkTeam('B', E.autoDraft(r)) };
    const R1 = E.replay(700 + g, T, {}, ['a', 'b']), R2 = E.replay(700 + g, T, {}, ['a', 'b']);
    if (JSON.stringify(R1.state) !== JSON.stringify(R2.state)) broken++;
    R1.log.forEach(e => { if (e.dfire) dfires++; if (e.fire) fires++; (e.dynSaid || []).forEach(t => { const k = (t.match(/ON FIRE|LOCKDOWN|burned|rhythm|rattled|butterfingers|WALL|fired up/) || [''])[0]; cnt[k] = (cnt[k] || 0) + 1; }); });
    // a defender with a sack, a pick or a forced fumble is on fire right away
    R1.log.forEach((e, i) => { if ((e.ev === 'sack' || e.ev === 'int') && e.defId && !e.slip && !e.dfire) broken++; });
  }
  ok(!broken, 'games replay the same, and every sack and pick lights the defender up');
  ok(dfires > 40 * 2, 'defenders on fire (' + (dfires / 40).toFixed(1) + ' a game)');
  ['LOCKDOWN', 'burned', 'rhythm', 'rattled', 'WALL'].forEach(k => ok(cnt[k] > 10, k + ' happens (' + (cnt[k] / 40).toFixed(1) + ' a game)'));
}

// ---- the swings change ratings on the snap they apply to
{
  const [A, B] = mk(4), T = { a: A, b: B }, qb = A.squad.qb, cb = B.squad.df.p.find(q => q[0] === 'LCB');
  const st = Object.assign(E.initState(2), { poss: 'a', q: 1, dyn: { [qb.i]: { k: 'rhythm', b: 4, f: 99, n: qb.n, t: 'a', r: 'o' }, [cb[4]]: { k: 'cbl', b: 6, f: 99, n: cb[2], t: 'b', r: 'd' } }, wall: { a: 5, b: 0 } });
  const sn = E.snapTeams(T, null, st, 'PASS_M', 2, {});
  ok(sn.teams.a.squad.qb.o === Math.min(99, qb.o + 4), 'in rhythm: the quarterback plays +4');
  ok(sn.teams.b.squad.df.p.find(q => q[0] === 'LCB')[3] === Math.min(99, cb[3] + 6), 'a corner on lockdown plays +6');
  ok(sn.teams.a.squad.ol.p[0][1] === Math.min(99, A.squad.ol.p[0][1] + E.WALL_BOOST), 'the wall: the line plays +' + E.WALL_BOOST);
  const late = Object.assign({}, st, { q: 4, score: { a: 14, b: 17 }, dyn: {} });
  ok(E.clutchFor(late, 'a') && !E.clutchFor(late, 'b'), 'clutch: the team tied or behind by a score late');
}
