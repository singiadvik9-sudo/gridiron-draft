// Game clock: 2:00 quarters, NFL-style stoppage, a 5 second cap per play (no delay-of-game), timeouts, spike, kneel, OT.
const E = require('./lib/engine.js');
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const mk = n => { const r = E.mulberry32(n); return { a: E.mkTeam('A', E.autoDraft(r)), b: E.mkTeam('B', E.autoDraft(r)) }; };
const T = mk(3), U = { a: E.teamUnits(T.a), b: E.teamUnits(T.b) };
ok(E.QLEN === 120 && E.CAP === 5, 'quarters are 2:00 and the runoff cap is 5 s');

// ---- full CPU games: invariants on every snap
let maxPlays = 0, minPlays = 1e9, ots = 0, bad = [], total = 0, spikes = 0, kneels = 0, runoffPlays = 0, tos = 0;
for (let seed = 1; seed <= 40; seed++) {
  let st = E.initState(seed), g = 0;
  while (!st.over && g++ < 400) {
    const off = st.poss, def = off === 'a' ? 'b' : 'a';
    const pick = E.cpuMove(st, U, off, seed, 'off'), kick = E.noDef(E.legalOff(st, pick));
    const to = E.cpuTO(st, off) ? 1 : 0;
    const dpick = kick ? null : E.cpuMove(st, U, def, seed, 'def');
    const res = E.stepGame(st, T, U, seed, pick, dpick, null, { o: !!to, d: false });
    const ns = res.state, e = res.entry;
    if (e.pt > 8 || e.pt < 0) bad.push('pt ' + e.pt);
    const q0 = st.q;
    if (ns.q === q0 && !ns.over) {
      const used = st.clock - ns.clock;
      if (ns.ro > 5) bad.push('runoff over the cap ' + ns.ro);
      if (used > e.pt + 5) bad.push('cap broken ' + used + ' seed ' + seed);
      if (used < 0 && (ns.to.a + ns.to.b) === (st.to.a + st.to.b)) bad.push('clock went up ' + seed);
      if (ns.clock < 1 && !ns.pat) bad.push('between snaps the clock must be at least 1 s ' + ns.clock);
    }
    if (ns.clock < 0) bad.push('negative clock');
    if (/spike/i.test(e.text || '')) spikes++;
    if (/kneel/i.test(e.text || '')) kneels++;
    if (ns.ro > 0) runoffPlays++;
    tos += (ns.to.a + ns.to.b) < (st.to.a + st.to.b) ? 1 : 0;
    st = ns;
  }
  if (!st.over) bad.push('game did not finish ' + seed);
  total++; maxPlays = Math.max(maxPlays, st.playNo); minPlays = Math.min(minPlays, st.playNo); if (st.q === 5) ots++;
}
ok(bad.length === 0, 'clock invariants hold over 40 games ' + bad.slice(0, 3).join('; '));
console.log('   plays/game', minPlays + '..' + maxPlays, 'OT games', ots, 'timeouts used', tos, 'spikes', spikes, 'kneels', kneels, 'running-clock snaps', runoffPlays);
ok(minPlays > 60 && maxPlays < 220, 'sensible number of snaps per game');

// ---- timeout refunds the runoff
{
  let st = E.initState(7); st = Object.assign({}, st, { clock: 60, ro: 4, q: 1, to: { a: 3, b: 3 } });
  const pick = 'RUN_IN';
  const a = E.stepGame(st, T, U, 7, pick, 'ZONE', null, { o: false, d: false }), b = E.stepGame(st, T, U, 7, pick, 'ZONE', null, { o: true, d: false });
  ok(b.state.clock >= a.state.clock + 3 && b.state.to[st.poss] === 2, 'timeout before the snap gives the runoff back and costs a timeout (' + a.state.clock + ' vs ' + b.state.clock + ')');
  const c = E.stepGame(Object.assign({}, st, { to: { a: 0, b: 0 } }), T, U, 7, pick, 'ZONE', null, { o: true, d: true });
  ok(c.state.to.a === 0 && c.state.to.b === 0, 'no timeout can be used with none left');
}

// ---- spike and kneel
{
  let st = Object.assign({}, E.initState(11), { clock: 40, ro: 3, down: 1, toGo: 10, ballOn: 50 });
  const s = E.stepGame(st, T, U, 11, 'SPIKE', null, null, {});
  ok(s.state.down === 2 && s.state.clock >= 38 && s.state.ro === 0 && s.state.ballOn === 50, 'spike stops the clock, burns a down, costs ~1 s');
  const k = E.stepGame(Object.assign({}, st, { ro: 0 }), T, U, 11, 'KNEEL', null, null, {});
  ok(k.state.ballOn < 50 && k.state.ro > 0, 'kneel loses yards and keeps the clock running');
  const opts = E.offOptions(Object.assign({}, st, { down: 4 }));
  ok(opts.filter(o => (o.id === 'SPIKE' || o.id === 'KNEEL')).every(o => o.disabled), 'spike and kneel are off the menu on 4th down');
}

// ---- quarter and half transitions
{
  let st = Object.assign({}, E.initState(5), { clock: 2, ro: 0, q: 1 });
  let r = E.stepGame(st, T, U, 5, 'RUN_IN', 'ZONE', null, {});
  ok(r.state.q === 2 && r.state.clock === 120 && r.entry.qEnd, 'Q1 ends after the play that runs out the clock');
  st = Object.assign({}, E.initState(5), { clock: 2, ro: 0, q: 2, to: { a: 0, b: 1 } });
  r = E.stepGame(st, T, U, 5, 'RUN_IN', 'ZONE', null, {});
  ok(r.state.q === 3 && r.state.to.a === 3 && r.state.to.b === 3 && r.entry.half, 'halftime resets timeouts');
  // tie at the end of Q4 goes to overtime
  st = Object.assign({}, E.initState(5), { clock: 2, ro: 0, q: 4, score: { a: 10, b: 10 } });
  r = E.stepGame(st, T, U, 5, 'RUN_IN', 'ZONE', null, {});
  ok((r.state.q === 5 && !r.state.over) || r.state.over, 'tied game after Q4 goes to overtime (or was decided on the play)');
}
console.log(process.exitCode ? 'SOME FAILED' : 'ALL OK');
// the play call takes time: a second off the running clock for every 5 seconds (the slower side's), at most 5; not when the clock is stopped
{ const E = require('./lib/engine.js'), LG = require('./lib/league.js'), L = LG.newNFL({ seed: 3 }), T = LG.teamsFor(L, 0, 1), U = { a: E.teamUnits(T.a), b: E.teamUnits(T.b) };
  const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const st = Object.assign(E.initState(5), { kick: false, poss: 'a', down: 2, toGo: 7, ballOn: 40, clock: 90, ro: 5 });
  const after = (s, fl) => E.stepGame(s, T, U, 5, 'RUN_IN', 'ZONE', null, fl).state.clock;
  const base = after(st, {});
  ok(base - after(st, { wait: 12 }) === 2 && base - after(st, { wait: 4 }) === 0 && base - after(st, { wait: 60 }) === 5, '12 seconds to call the play take 2 off the clock, 4 take none, a minute takes the most, 5');
  const stopped = Object.assign({}, st, { ro: 0 });
  ok(after(stopped, {}) === after(stopped, { wait: 20 }), 'not when the clock is stopped');
  ok(after(st, { o: 1 }) === after(st, { o: 1, wait: 20 }), 'and not when a timeout is called');
  const nearEnd = Object.assign({}, st, { clock: 3 }); ok(E.stepGame(nearEnd, T, U, 5, 'RUN_IN', 'ZONE', null, { wait: 25 }).entry.callT === 2, 'it always leaves a second for the snap');
  // through the replay: the slower side's seconds count, and the server keeps them
  const R0 = E.replay(9, T, {}, ['a', 'b']), mv = {}; R0.log.forEach(e => { mv[e.n + '-' + e.off] = { pick: e.offPick, cs: 15 }; if (e.defPick) mv[e.n + '-' + (e.off === 'a' ? 'b' : 'a')] = { pick: e.defPick, cs: 5 }; });
  const R1 = E.replay(9, T, mv, []);
  ok(R1.log.some(e => e.callT === 3) && R1.log.every(e => !e.callT || e.callT === 3 || e.callT < 3), 'a 15-second call against a 5-second one takes 3 seconds');
  ok(JSON.stringify(E.cleanMoves({ '3-a': { pick: 'RUN_IN', cs: 12 } }, 'a')) === '{"3-a":{"pick":"RUN_IN","cs":12}}', 'the server keeps the seconds with the move'); }
