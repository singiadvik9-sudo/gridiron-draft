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
// playing defense: no surprise switches, E goes to whoever can get to the ball first, tackles that connect, and a timed jump on the ball
{ const TT = T('BUF', 'ARI'), mk = (i, o) => LV.create(Object.assign({ seed: 900 + i, playNo: i, ballOn: 30, toGo: 10, offPick: 'PASS_M', defPick: 'ZONE', OS: TT.a.squad, DS: TT.b.squad, ctlO: false, ctlD: true }, o || {}));
  let kept = 0, thrown = 0;
  for (let i = 0; i < 60; i++) { const sim = mk(i); const me0 = sim.ctlId.d; while (!sim.out && !sim.thrown) LV.step(sim, null, { dx: 0, dy: 0 }, { o: [], d: [] }); if (!sim.thrown) continue; thrown++; LV.step(sim, null, { dx: 0, dy: 0 }, { o: [], d: [] }); if (sim.ctlId.d === me0) kept++; }
  ok(thrown > 30 && kept === thrown, 'the throw does not take your defender away from you (' + kept + ' of ' + thrown + ')');
  { const sim = mk(3, { offPick: 'RUN_OUT' }); while (!sim.out && !sim.handoff) LV.step(sim, null, { dx: 0, dy: 0 }, { o: [], d: [] });
    const c = sim.by[sim.ball.car], rank = sim.D.filter(p => p.hold === 0 && !p.eng).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) / a.vmax - Math.hypot(b.x - c.x, b.y - c.y) / b.vmax).map(p => p.id);
    const was = sim.ctlId.d; LV.step(sim, null, { dx: 0, dy: 0 }, { o: [], d: [6] }); const first = sim.ctlId.d;
    LV.step(sim, null, { dx: 0, dy: 0 }, { o: [], d: [6] });
    ok(first === (rank[0] === was ? rank[1] : rank[0]) && sim.ctlId.d !== first, 'E goes to the defender who can get to the ball first, and again to the next one'); }
  let mine = 0, n = 200, yds = 0;
  for (let i = 0; i < n; i++) { const sim = mk(i, { offPick: ['RUN_IN', 'RUN_OUT', 'POWER', 'SWEEP'][i % 4], defPick: Object.keys(E.DEF_CALLS)[i % 14] }); let e = false;
    while (!sim.out && sim.t < LV.MAXT + 5) { const acts = { o: [], d: [] }, c = sim.ball.car ? sim.by[sim.ball.car] : sim.by.QB; if (sim.handoff && !e) { acts.d.push(6); e = true; }
      const me = sim.by[sim.ctlId.d], dx = c.x + c.vx * 0.3 - me.x, dy = c.y + c.vy * 0.3 - me.y; if (sim.handoff && Math.hypot(c.x - me.x, c.y - me.y) < 1.7 && me.cool === 0) acts.d.push(5);
      LV.step(sim, null, { dx: Math.abs(dx) > 0.4 ? Math.sign(dx) : 0, dy: Math.abs(dy) > 0.4 ? Math.sign(dy) : 0 }, acts); }
    if (sim.out.by === sim.ctlId.d) mine++; yds += sim.out.x; }
  ok(mine / n > 0.35, 'chase the ball carrier and your defender makes the tackle (' + Math.round(100 * mine / n) + '% of runs, ' + (yds / n).toFixed(1) + ' yards a carry; it was about 5%)');
  const jump = timed => { let comp = 0, k = 0; for (let i = 0; i < 300; i++) { const sim = mk(i, { offPick: ['PASS_M', 'PASS_S', 'FLOOD', 'CURLS'][i % 4], defPick: ['ZONE', 'COV3', 'MAN', 'SOFT'][i % 4] }); let sw = false, j = false;
      while (!sim.out && sim.t < LV.MAXT + 5) { const acts = { o: [], d: [] }, a = sim.ball.air, me = sim.by[sim.ctlId.d]; let inD = { dx: 0, dy: 0 };
        if (a && !a.away) { if (!sw) { acts.d.push(6); sw = true; } else { const dx = a.ex - me.x, dy = a.ey - me.y; inD = { dx: Math.abs(dx) > 0.3 ? Math.sign(dx) : 0, dy: Math.abs(dy) > 0.3 ? Math.sign(dy) : 0 }; if (!j && (!timed || a.k >= a.n * 0.7)) { acts.d.push(5); j = true; } } }
        LV.step(sim, null, inD, acts); }
      if (sim.thrown) { k++; if (sim.out.k === 'pass') comp++; } } return comp / k; };
  const early = jump(false), late = jump(true);
  ok(late < early - 0.04, 'and jumping as the ball comes down beats jumping early (' + Math.round(100 * late) + '% completions against ' + Math.round(100 * early) + '%)'); }
// corners stick closer in man coverage, and W is a jump that breaks up passes (a bot that gets to the ball and jumps as it comes down)
{ const TT = T('BUF', 'ARI'), mk = (i, o) => LV.create(Object.assign({ seed: 900 + i, playNo: i, ballOn: 30, toGo: 10, offPick: ['PASS_M', 'PASS_S', 'FLOOD', 'CURLS', 'HITCH', 'PASS_D'][i % 6], defPick: ['ZONE', 'COV3', 'COV4', 'MAN', 'MAN2', 'SOFT'][i % 6], OS: TT.a.squad, DS: TT.b.squad, ctlO: false, ctlD: true }, o || {}));
  ok(LV.PRO.cbCush < 1.5 && LV.PRO.flyCB > LV.PRO.flyDB, 'corners play tighter and better at the ball than safeties');
  const play = key => { let n = 0, comp = 0, pbu = 0; for (let i = 0; i < 300; i++) { const sim = mk(i); let sw = false, j = false;
      while (!sim.out && sim.t < LV.MAXT + 5) { const acts = { o: [], d: [] }, a = sim.ball.air, me = sim.by[sim.ctlId.d]; let inD = { dx: 0, dy: 0 };
        if (a && !a.away) { if (!sw) { acts.d.push(6); sw = true; } else { const dx = a.ex - me.x, dy = a.ey - me.y; inD = { dx: Math.abs(dx) > 0.3 ? Math.sign(dx) : 0, dy: Math.abs(dy) > 0.3 ? Math.sign(dy) : 0 }; if (key && !j && a.k >= a.n * 0.7) { acts.d.push(key); j = true; } } }
        LV.step(sim, null, inD, acts); }
      if (!sim.thrown) continue; n++; if (sim.out.k === 'pass') comp++; else if (sim.out.pbu) pbu++; } return { comp: comp / n, pbu: pbu / n }; };
  const none = play(0), jump = play(1);
  ok(jump.pbu > none.pbu + 0.08 && jump.comp < none.comp - 0.1, 'W (jump) as the ball comes down breaks up more passes (' + Math.round(100 * jump.pbu) + '% broken up, ' + Math.round(100 * jump.comp) + '% caught; without it ' + Math.round(100 * none.pbu) + '% and ' + Math.round(100 * none.comp) + '%)');
  { const sim = mk(1); while (!sim.out && !sim.ball.air) LV.step(sim, null, { dx: 0, dy: 0 }, { o: [], d: [] }); const me = sim.by[sim.ctlId.d]; me.cool = 0;
    LV.step(sim, null, { dx: 1, dy: 0 }, { o: [], d: [1] }); ok(me.jumpW > 0 && me.dive === 0, 'W jumps without diving'); } }
