// Squad games (up to five people a side): each person runs one player, the rest are the computer.
const E = require('./lib/engine.js'); const LV = E.LIVE, LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 3 }), Tm = n => LG.teamsFor(L, n % 32, (n * 7 + 3) % 32);
const ctx = (n, extra) => Object.assign({ seed: 40 + n, playNo: n, ballOn: 30, toGo: 10, offPick: 'PASS_M', defPick: 'ZONE', OS: Tm(n).a.squad, DS: Tm(n).b.squad, ctlO: false, ctlD: false }, extra);
// the same inputs give the same play, every time (every screen and the server agree)
{ const tr = { QB: [LV.enc(3, 0, 1, 0), LV.enc(30, 0, 0, 1)], WR1: [LV.enc(2, 1, 0, 0), LV.enc(15, 1, 1, 0)], LCB: [LV.enc(4, -1, 0, 0)], MLB: [LV.enc(6, -1, 1, 5)] };
  const a = LV.runM(ctx(1, { hum: Object.keys(tr) }), tr), b = LV.runM(ctx(1, { hum: Object.keys(tr) }), tr);
  ok(JSON.stringify(a.out) === JSON.stringify(b.out) && a.ticks === b.ticks, 'a squad snap is the same every time it is played back (' + a.out.k + ', ' + a.ticks + ' ticks)');
  ok(a.sim.humKeys.join() === 'LCB,MLB,QB,WR1' && a.sim.hum[a.sim.idOf.LCB] && a.sim.by[a.sim.idOf.LCB].side === 'd', 'four people: two on offense by position, two on defense by spot'); }
// a person runs his own player: a receiver steered across the field goes where the stick says, not along his route
{ let off = 0, N = 60; for (let n = 0; n < N; n++) { const sim = LV.create(ctx(n, { hum: ['WR1'], offPick: 'CURLS' })), curs = { WR1: LV.cursor([LV.enc(1, 0, 1, 0)]) };
    let across = 0, ticks = 0; for (let t = 0; t < 24 && !sim.out; t++) { LV.advanceM(sim, curs); const w = sim.by.WR1; if (t > 6) { ticks++; if (Math.abs(w.vy) > Math.abs(w.vx)) across++; } }
    if (ticks && across > ticks * 0.7) off++; }
  ok(off > N * 0.8, 'a receiver steered across the field runs across it (' + off + ' of ' + N + ')'); }
// people who do nothing: their players run exactly what the computer would have them run (up to the throw: a pass to a receiver a person
// runs is led by where he is actually going, and the quarterback with a person on him waits for that person to throw)
{ let same = 0, N = 60; for (let n = 0; n < N; n++) {
    const a = LV.create(ctx(n, { hum: ['HB', 'WR1', 'WR2', 'TE'] })), b = LV.create(ctx(n, {})), ca = {}, ok2 = [];
    let eq = true; while (!a.out && !b.out && !a.thrown && !b.thrown && a.t < 80) { LV.advanceM(a, ca); LV.step(b, null, null, { o: [], d: [] }); if (a.thrown || b.thrown) break; if (a.P.some((p, i) => p.x !== b.P[i].x || p.y !== b.P[i].y)) { eq = false; break; } }
    if (eq) same++; }
  ok(same === N, 'idle people: their players move exactly as the computer\'s would (' + same + ' of ' + N + ' snaps identical up to the throw)'); }
// the quarterback cannot be steered away from the handoff, here either
{ let far = 0, N = 60; for (let n = 0; n < N; n++) { const sim = LV.create(ctx(n, { hum: ['QB', 'HB'], offPick: 'RUN_IN' })), curs = { QB: LV.cursor([LV.enc(1, 1, 1, 0)]), HB: LV.cursor([]) };
    while (!sim.out && !sim.handoff && sim.t < 60) LV.advanceM(sim, curs);
    if (sim.handoff && Math.hypot(sim.by.QB.x - sim.by[sim.ball.car].x, sim.by.QB.y - sim.by[sim.ball.car].y) > 2.6) far++; }
  ok(far === 0, 'a squad quarterback hands off within reach (' + far + ' far handoffs)'); }
// the pass leads a receiver a person is running: thrown to where his direction and speed take him
{ let lead = 0, N = 40;
  for (let n = 0; n < N; n++) {
    const sim = LV.create(ctx(n, { hum: ['QB', 'WR1'], offPick: 'PASS_M' })), curs = { QB: LV.cursor([LV.enc(20, 0, 0, 1)]), WR1: LV.cursor([LV.enc(1, 0, 1, 0)]) };   // he runs across; the QB throws to him at tick 20
    let at = null; while (!sim.out && sim.t < 60) { LV.advanceM(sim, curs); if (sim.thrown && !at) { const w = sim.by.WR1; at = { x: w.x, y: w.y, vy: w.vy, ey: sim.ball.air ? sim.ball.air.ey : null }; } }
    if (at && at.ey != null && Math.sign(at.ey - at.y) === Math.sign(at.vy) && Math.abs(at.ey - at.y) > 1) lead++;
  }
  ok(lead > N * 0.7, 'the throw goes ahead of a receiver running across the field (' + lead + ' of ' + N + ')'); }
// defenders run by people: no switching to someone else
{ const sim = LV.create(ctx(5, { hum: ['MLB'] })), id = sim.idOf.MLB, curs = { MLB: LV.cursor([LV.enc(3, 0, 0, 6), LV.enc(8, 0, 0, 6)]) };
  for (let t = 0; t < 20 && !sim.out; t++) LV.advanceM(sim, curs);
  ok(sim.hum[id] && !sim.evt.some(e => e[0] === 'switch'), 'a squad defender stays the one he picked'); }
// the room: a lobby, the host sets the teams, people pick their defenders, get ready, and the game starts with drafted rosters
const RM = require('./api/room.js');
const call = body => new Promise(r => { const req = { method: 'POST', body, headers: {} }; const res = { status(c) { this.c = c; return this; }, json(o) { r(Object.assign({ _c: this.c }, o)); }, setHeader() {} }; RM(req, res); });
(async () => {
  const h = await call({ op: 'create', squad: 1, pid: 'host', name: 'Hank' }), code = h.code;
  ok(h.squad && h.lob.ps.length === 1 && h.lob.ps[0].pos === 'QB' && h.lob.ps[0].me && !JSON.stringify(h.lob).includes(':"host"'), 'a squad room: the host is in the lobby (QB by default), and nobody\'s login id is shown');
  const names = ['Ann', 'Bo', 'Cy', 'Di']; for (const [i, n] of names.entries()) await call({ op: 'join', code, pid: 'p' + i, name: n });
  let lob = (await call({ op: 'lob', code, pid: 'host' })).lob; const id = n => lob.ps.find(p => p.name === n).id;
  ok(lob.ps.length === 5 && lob.ps.filter(p => p.team).length === 1, 'four more join, not yet on a team');
  ok((await call({ op: 'assign', code, pid: 'p0', id: id('Bo'), team: 'a', pos: 'WR1' })).error === 'host_only', 'only the host puts people on teams');
  await call({ op: 'assign', code, pid: 'host', id: id('Ann'), team: 'a', pos: 'WR1' });
  await call({ op: 'assign', code, pid: 'host', id: id('Bo'), team: 'b', pos: 'QB' });
  await call({ op: 'assign', code, pid: 'host', id: id('Cy'), team: 'b', pos: 'TE' });
  lob = (await call({ op: 'assign', code, pid: 'host', id: id('Di'), team: 'b', pos: 'TE' })).lob;
  ok(lob.ps.find(p => p.name === 'Di').pos === 'TE' && !lob.ps.find(p => p.name === 'Cy').pos, 'two on one spot: the new one takes it, the other is moved off');
  await call({ op: 'assign', code, pid: 'host', id: id('Cy'), team: 'b', pos: 'HB' });
  ok((await call({ op: 'ds', code, pid: 'p0', ds: 'LCB' })).lob && (await call({ op: 'ds', code, pid: 'host', ds: 'LCB' })).error === 'taken', 'people pick their defenders; one person per defender on a team');
  await call({ op: 'ds', code, pid: 'host', ds: 'MLB' });
  ok(/ready/.test((await call({ op: 'start', code, pid: 'host' })).error || ''), 'the game waits until everyone is ready');
  for (const pid of ['p0', 'p1', 'p2', 'p3']) await call({ op: 'ready', code, pid, on: 1 });
  lob = (await call({ op: 'start', code, pid: 'host' })).lob; ok(lob && lob.started, 'everyone ready: the host starts it');
  const st = await call({ op: 'state', code, pid: 'p1' });
  ok(st.seats.a.roster && st.seats.b.roster && st.seats.a.status === 'ready' && st.dr && st.dr.picks.length > 10, 'both rosters are drafted for them');
  ok((await call({ op: 'join', code, pid: 'late', name: 'Late' })).seat === null, 'someone arriving after the start watches');
  // each team's quarterback calls its plays (seat a: the host, seat b: Bo); a receiver cannot
  ok((await call({ op: 'move', code, seat: 'a', pid: 'p0', n: 0, pick: 'KO' })).error === 'forbidden', 'a receiver cannot call the play');
  ok((await call({ op: 'move', code, seat: 'a', pid: 'host', n: 3, pick: 'PASS_M', ctl: 1, hm: ['QB', 'WR1', 'NOPE'] })).ok, 'the quarterback calls it, with the players his people run');
  await call({ op: 'move', code, seat: 'b', pid: 'p1', n: 3, pick: 'ZONE', ctl: 1, hm: ['MLB'] });
  await call({ op: 'ds', code, pid: 'p1', ds: 'MLB' });
  // everyone sends his own inputs, and only his own
  ok((await call({ op: 'live', code, seat: 'aWR1', pid: 'p0', n: 3, ev: [210, 540], upto: 30, want: ['aQB', 'bMLB'] })).others, 'Ann sends her receiver\'s inputs');
  ok((await call({ op: 'live', code, seat: 'aQB', pid: 'p0', n: 3, ev: [210], upto: 9 })).error === 'forbidden', 'and nobody else\'s');
  await call({ op: 'live', code, seat: 'aQB', pid: 'host', n: 3, ev: [310], upto: 99999, fin: 1 });
  const lv = await call({ op: 'live', code, seat: 'bMLB', pid: 'p1', n: 3, ev: [], upto: 99999, fin: 1, want: ['aQB', 'aWR1'] });
  ok(lv.others.aQB && lv.others.aQB.fin && lv.others.aWR1.ev.length === 2, 'each one gets the others\' streams');
  const all = await call({ op: 'state', code, pid: 'p2', lvall: 1 });
  ok(all.moves.a[3].h.join() === 'QB,WR1' && all.lv[3] && all.lv[3].a.QB.fin && all.lv[3].b.MLB.fin, 'the room hands out every finished stream, by team and player (h: ' + all.moves.a[3].h.join() + ')');
  ok((await call({ op: 'chat', code, pid: 'p2', text: 'lets go' })).msg.f === 'Cy', 'teammates chat by their names');
})();
