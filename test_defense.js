// Defense: ends and tackles are positions of their own, blitzers get picked up (no free sacks), and pass-rush moves for the defender you control.
const E = require('./lib/engine.js'); require('./lib/live.js'); const LV = E.LIVE, LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 3 }), li = a => L.teams.findIndex(t => t.abbr === a);
// positions: DE and DT instead of DL; every slot holds its own position
ok(LG.POS.indexOf('DL') < 0 && LG.POS.indexOf('DE') >= 0 && LG.POS.indexOf('DT') >= 0, 'the defensive line is split into ends (DE) and tackles (DT)');
let wrong = 0, n34 = 0;
L.teams.forEach(t => {
  const df = LG.teamsFor(L, t.id, (t.id + 1) % 32).a.squad.df;
  if (df.sch === '34') n34++;
  df.p.forEach(q => { const p = L.players[q[4]], want = LG.SLOT_POS[q[0]] || (/LB$/.test(q[0]) ? 'LB' : null); if (want && p && p.p !== want) wrong++; });
});
ok(wrong === 0, 'every team lines up ends at end, tackles at tackle and linebackers at linebacker (' + n34 + ' 3-4 teams stand their ends up at LEDGE / REDGE)');
ok(['T.J. Watt', 'Myles Garrett'].every(n => Object.values(L.players).some(p => p.n === n && p.p === 'DE')), 'edge rushers on 3-4 teams are ends, not linebackers (T.J. Watt, Myles Garrett)');
// a save from before the split: its DL become DE / DT and edge rushers listed at LB become DE
{ const old = LG.newNFL({ seed: 4 }); delete old.dpos;
  Object.values(old.players).forEach(p => { if (p.p === 'DE' && p.n === 'T.J. Watt') p.p = 'LB'; else if (p.p === 'DE' || p.p === 'DT') p.p = 'DL'; });
  LG.ensurePicks(old);
  const left = Object.values(old.players).filter(p => p.p === 'DL').length, watt = Object.values(old.players).find(p => p.n === 'T.J. Watt');
  ok(left === 0 && watt.p === 'DE' && old.dpos === 1, 'old saves are upgraded when they load (no DL left, T.J. Watt back at DE)');
  ok(LG.teamsFor(old, 0, 1).a.squad.df.p.length === 11, 'and their teams still field 11 on defense'); }
// the live sim: one defender you steer straight at the quarterback on every pass play, with or without rush moves
const T = (o, d) => LG.teamsFor(L, li(o), li(d));
function rush(teams, slot, moves, N) {
  const r = { sack: 0, n: 0, pick: 0, win: 0 };
  for (let n = 0; n < N; n++) {
    const sim = LV.create({ seed: 4000 + n, playNo: n, ballOn: 30, toGo: 10, offPick: ['PASS_M', 'PASS_D', 'PASS_S', 'FLOOD'][n % 4], defPick: ['ZONE', 'MAN', 'COV3', 'BLITZ', 'COV4'][n % 5], OS: teams.a.squad, DS: teams.b.squad, ctlO: false, ctlD: true });
    let me = sim.D.find(p => p.pos === slot); sim.ctlId.d = me.id;
    while (!sim.out && sim.t < LV.MAXT + 5) {
      me = sim.by[sim.ctlId.d]; const tg = sim.ball.car ? sim.by[sim.ball.car] : sim.by.QB, dx = tg.x - me.x, dy = tg.y - me.y, acts = { o: [], d: [] };
      if (moves && me.eng && me.cool === 0) acts.d.push(sim.t - me.engT <= 3 || (me.pairL || 0) < -0.3 ? 5 : 7);
      LV.step(sim, null, { dx: Math.abs(dx) > 0.4 ? Math.sign(dx) : 0, dy: Math.abs(dy) > 0.4 ? Math.sign(dy) : 0 }, acts);
    }
    r.n++; if (sim.out.k === 'sack' || (sim.out.k === 'fumble' && sim.out.sack)) r.sack++;
    sim.evt.forEach(e => { if (e[0] === 'pickup') r.pick++; if (e[0] === 'move' && e[3] === 'win') r.win++; });
  }
  return { sack: r.sack / r.n, pick: r.pick / r.n, win: r.win / r.n };
}
const pct = x => Math.round(x * 100) + '%';
const mlb = rush(T('BUF', 'ARI'), 'MLB', false, 150), cb = rush(T('BUF', 'LA'), 'LCB', false, 150);
ok(mlb.sack < 0.06 && mlb.pick > 0.4, 'a linebacker who runs straight at the quarterback gets picked up by a back or a spare lineman, or the quarterback throws hot (' + pct(mlb.pick) + ' of snaps have a pickup): no free sacks (' + pct(mlb.sack) + ', was about 29%)');
ok(cb.sack < 0.1, 'a corner blitz gets home now and then, but the quarterback sees him and throws hot (' + pct(cb.sack) + ' sacks, was about 49%)');
const plain = rush(T('BUF', 'LA'), 'NT', false, 150), moved = rush(T('BUF', 'LA'), 'NT', true, 150);
ok(moved.win > 0.3 && moved.sack > plain.sack + 0.02, 'rush moves let the lineman you control beat his blocker (' + pct(moved.win) + ' of snaps) and get to the quarterback (' + pct(moved.sack) + ' sacks, ' + pct(plain.sack) + ' without moves)');
// the swim: timing matters (right at the get-off, or with leverage built up by a bull rush)
{ const trial = (when) => { let w = 0, k = 0;
    for (let n = 0; n < 300; n++) {
      const sim = LV.create({ seed: 7000 + n, playNo: n, ballOn: 30, toGo: 10, offPick: 'PASS_D', defPick: 'ZONE', OS: T('BUF', 'LA').a.squad, DS: T('BUF', 'LA').b.squad, ctlO: false, ctlD: true });
      const me = sim.D.find(p => p.pos === 'NT'); sim.ctlId.d = me.id;
      while (!sim.out && !(me.eng && sim.t - me.engT >= when)) LV.step(sim, null, { dx: -1, dy: 0 }, { o: [], d: [] });
      if (sim.out) continue; k++;
      LV.step(sim, null, { dx: -1, dy: 0 }, { o: [], d: [5] }); if (me.move === 'win') w++;
    } return w / k; };
  const early = trial(1), late = trial(12);
  ok(early > late + 0.1, 'a swim the moment the blocker gets his hands on you works more often (' + pct(early) + ' vs ' + pct(late) + ' later)'); }
// moves replay exactly (the server re-runs every live snap)
{ const ctx = { seed: 99, playNo: 3, ballOn: 30, toGo: 10, offPick: 'PASS_M', defPick: 'ZONE', OS: T('BUF', 'LA').a.squad, DS: T('BUF', 'LA').b.squad, ctlO: false, ctlD: true };
  const tr = [LV.enc(1, -1, 0, 6)].concat([4, 6, 10, 14, 20, 26, 32].map(t => LV.enc(t, -1, 0, t % 2 ? 5 : 7)));
  ok(JSON.stringify(LV.run(ctx, [], tr).out) === JSON.stringify(LV.run(ctx, [], tr).out), 'rush moves and pickups replay exactly'); }
