// Live play (22 players on the field): determinism, rough balance, replay integration and the room relay.
const E = require('./lib/engine.js'), L = require('./lib/live.js');
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const mk = n => { const r = E.mulberry32(n); return [E.mkTeam('A', E.autoDraft(r)), E.mkTeam('B', E.autoDraft(r))]; };

// ---- trace encoding
{
  const ev = [[5, 1, 0, 0], [9, -1, 1, 3], [30, 0, 0, 5], [31, 1, -1, 9]];
  const enc = ev.map(e => L.enc(e[0], e[1], e[2], e[3]));
  ok(enc.every(Number.isInteger) && JSON.stringify(enc.map(L.dec)) === JSON.stringify(ev), 'trace encode/decode round trip');
}

// ---- determinism
{
  const [A, B] = mk(4);
  const ctx = { seed: 99, playNo: 7, ballOn: 40, toGo: 10, offPick: 'PASS_M', defPick: 'MAN', OS: A.squad, DS: B.squad, ctlO: true, ctlD: true };
  const trO = [L.enc(3, 0, 0, 0), L.enc(10, 1, 1, 0), L.enc(30, 1, 0, 2), L.enc(60, 1, 0, 0)], trD = [L.enc(4, 1, 0, 0), L.enc(20, 1, 1, 6), L.enc(40, 0, 1, 5)];
  const a = L.run(ctx, trO, trD), b = L.run(ctx, trO, trD);
  ok(JSON.stringify(a.out) === JSON.stringify(b.out) && a.ticks === b.ticks, 'same inputs -> same play (' + a.out.k + ' in ' + a.ticks + ' ticks)');
  // positions identical tick for tick
  const s1 = L.create(ctx), s2 = L.create(ctx), c1 = [L.cursor(trO), L.cursor(trD)], c2 = [L.cursor(trO), L.cursor(trD)];
  let same = true;
  for (let t = 0; t < 80 && !s1.out; t++) { L.advance(s1, c1[0], c1[1]); L.advance(s2, c2[0], c2[1]); if (JSON.stringify(s1.P.map(p => [p.x, p.y])) !== JSON.stringify(s2.P.map(p => [p.x, p.y]))) { same = false; break; } }
  ok(same, 'every player ends every tick in the same place');
  // different inputs change things
  let diff = 0;
  for (let i = 0; i < 20; i++) {
    const t1 = [L.enc(3, 1, 0, 0), L.enc(9 + i, 0, 1, 0)], r = L.run(Object.assign({}, ctx, { playNo: 8 }), t1, []);
    const r0 = L.run(Object.assign({}, ctx, { playNo: 8 }), [], []);
    if (JSON.stringify(r.out) !== JSON.stringify(r0.out)) diff++;
  }
  ok(diff > 3, 'the controller changes how plays turn out (' + diff + '/20)');
}

// ---- rough balance, computers on both sides
{
  const picks = ['RUN_IN', 'RUN_OUT', 'PASS_S', 'PASS_M', 'PASS_D', 'SCREEN'], defs = ['STACK', 'ZONE', 'MAN', 'BLITZ', 'PREVENT'];
  const tot = {}; let slow = 0, t0 = Date.now(), N = 0;
  picks.forEach(op => { tot[op] = { n: 0, y: 0, comp: 0, att: 0, sack: 0, int: 0, secs: 0 }; });
  for (let i = 0; i < 400; i++) {
    const [A, B] = mk(i % 25 + 1), op = picks[i % 6], dp = defs[(i * 7) % 5], bo = 25 + (i * 11) % 50;
    const r = L.run({ seed: i, playNo: i % 60, ballOn: bo, toGo: 10, offPick: op, defPick: dp, OS: A.squad, DS: B.squad }), o = r.out, t = tot[op]; N++;
    t.n++; t.secs += r.ticks / 20;
    if (o.k === 'sack') { t.sack++; t.y += o.x; } else if (o.k === 'int') t.int++; else if (o.k === 'fumble') { /* lost */ } else if (o.k !== 'inc' && o.k !== 'safety') t.y += Math.min(o.x, 100 - bo);
    if (/PASS|SCREEN/.test(op)) { t.att++; if (o.k === 'pass') t.comp++; }
    if (r.ticks >= L.MAXT) slow++;
  }
  const ms = (Date.now() - t0) / N;
  const R = k => tot[k].y / tot[k].n;
  ok(R('RUN_IN') > 2.5 && R('RUN_IN') < 6.5 && R('RUN_OUT') > 2.5 && R('RUN_OUT') < 7, 'runs average ' + R('RUN_IN').toFixed(1) + ' / ' + R('RUN_OUT').toFixed(1) + ' yards');
  const cp = k => tot[k].comp / tot[k].att;
  ok(cp('PASS_S') > 0.55 && cp('PASS_S') < 0.95 && cp('PASS_M') > 0.4 && cp('PASS_M') < 0.85 && cp('PASS_D') > 0.3 && cp('PASS_D') < 0.85, 'completion rates ' + ['PASS_S', 'PASS_M', 'PASS_D', 'SCREEN'].map(k => cp(k).toFixed(2)).join(' / '));
  const sacks = (tot.PASS_S.sack + tot.PASS_M.sack + tot.PASS_D.sack + tot.SCREEN.sack) / (tot.PASS_S.n + tot.PASS_M.n + tot.PASS_D.n + tot.SCREEN.n);
  ok(sacks >= 0 && sacks < 0.2, 'sack rate ' + sacks.toFixed(3));
  ok(slow <= N * 0.01, 'almost no play runs into the time limit (' + slow + ' of ' + N + ')');
  ok(ms < 8, 'a play simulates in ' + ms.toFixed(1) + ' ms');
}

// ---- a whole game decided on the field, replayed from the recorded inputs
{
  const [A, B] = mk(8), teams = { a: A, b: B }, seed = 4242, U = { a: E.teamUnits(A), b: E.teamUnits(B) };
  const moves = {}; let st = E.initState(seed), guard = 0, rnd = E.mulberry32(5), liveN = 0;
  while (!st.over && guard++ < 200) {
    const n = st.playNo, off = st.poss, def = off === 'a' ? 'b' : 'a';
    const op = E.cpuMove(st, U, off, seed, 'off'), dp = E.cpuMove(st, U, def, seed, 'def');
    const kick = E.noDef(E.legalOff(st, op));
    // alternate who plays: both, offense only, defense only, nobody
    const mode = n % 4, co = !kick && (mode === 0 || mode === 1) ? 1 : 0, cd = !kick && (mode === 0 || mode === 2) ? 1 : 0;
    moves[n + '-' + off] = co ? { pick: op, ctl: 1 } : { pick: op };
    moves[n + '-' + def] = cd ? { pick: dp, ctl: 1 } : { pick: dp };
    if (co || cd) {
      const tr = () => { const a = []; let t = 2; for (let k = 0; k < 14; k++) { t += 1 + Math.floor(rnd() * 8); a.push(L.enc(t, Math.floor(rnd() * 3) - 1, Math.floor(rnd() * 3) - 1, rnd() < 0.2 ? 1 + Math.floor(rnd() * 6) : 0)); } return a; };
      moves[n + '-lv'] = { a: tr(), b: tr() }; liveN++;
    }
    let R = E.replay(seed, teams, moves, []);
    // a human who runs his players also returns kicks by hand
    while (R.wait && R.wait.kind === 'ret') { moves[R.wait.n + '-rv'] = { s: R.wait.ro.recv, ev: [L.enc(2, 1, 0, 0), L.enc(12, 1, 1, 0)] }; R = E.replay(seed, teams, moves, []); }
    if (R.wait) { console.log('FAIL waiting at', R.wait.n); process.exitCode = 1; break; }
    st = R.state;
  }
  const R1 = E.replay(seed, teams, moves, []), R2 = E.replay(seed, teams, JSON.parse(JSON.stringify(moves)), []);
  ok(R1.state.over && R1.log.length > 40, 'game with ' + liveN + ' live snaps finishes (' + R1.log.length + ' plays, ' + R1.state.score.a + '-' + R1.state.score.b + ')');
  ok(JSON.stringify(R1.log) === JSON.stringify(R2.log), 'the replay is identical when run again');
  ok(R1.log.filter(e => e.live).length === liveN, 'live snaps are flagged in the log');
  ok(R1.log.every(e => e.after.ballOn >= 1 && e.after.ballOn <= 99 && e.after.down >= 1 && e.after.down <= 4), 'ball spots and downs stay legal');
  const kinds = {}; R1.log.filter(e => e.live).forEach(e => { kinds[e.ev] = (kinds[e.ev] || 0) + 1; });
  console.log('     live results:', JSON.stringify(kinds));
  // a snap that has not been played yet holds the game
  const m2 = JSON.parse(JSON.stringify(moves)); const first = Object.keys(m2).filter(k => /-lv$/.test(k)).map(k => parseInt(k, 10)).sort((x, y) => x - y)[0];
  delete m2[first + '-lv'];
  const R3 = E.replay(seed, teams, m2, []);
  ok(R3.wait && R3.wait.n === first && R3.log.length === first, 'replay waits for the inputs of play ' + first);
  // input cleaning
  const dirty = { '3-a': { pick: 'RUN_IN', ctl: 1, x: 1 }, '3-b': { pick: 'ZONE' }, '3-lv': { a: [1, 2, 3], b: [] }, '4-lv': { a: [1.5], b: [] }, '5-lv': { a: new Array(600).fill(1), b: [] }, 'zz': {}, '9-a': { pick: 'X'.repeat(20) } };
  const c = E.cleanMoves(dirty, 'a');
  ok(c['3-a'] && c['3-a'].ctl === 1 && !c['3-b'] && c['3-lv'] && !c['4-lv'] && !c['5-lv'] && !c['9-a'] && !c.zz, 'client moves are cleaned');
}

// ---- the room relay
(async () => {
  const H = require('./api/room.js');
  const call = body => new Promise(r => { const req = { method: 'POST', body, headers: {} }, res = { status(c) { this.c = c; return this; }, json(o) { r(Object.assign({ _c: this.c }, o)); }, setHeader() {} }; H(req, res); });
  const c = await call({ op: 'create', pid: 'pa', name: 'Ann' });
  const code = c.code;
  const j = await call({ op: 'join', code, pid: 'pb', name: 'Bo' });
  ok(c.seat === 'a' && j.seat === 'b', 'room with two seats ' + code);
  const A = { code, seat: 'a', pid: 'pa' }, B = { code, seat: 'b', pid: 'pb' };
  ok((await call(Object.assign({ op: 'move', n: 0, pick: 'PASS_M', ctl: 1 }, A)))._c !== 400, 'move with control flag');
  await call(Object.assign({ op: 'move', n: 0, pick: 'ZONE' }, B));
  const st = await call({ op: 'state', code });
  ok(st.moves.a[0].c === 1 && st.moves.a[0].p === 'PASS_M' && st.moves.b[0] === 'ZONE', 'state shows both move forms');
  let r = await call(Object.assign({ op: 'live', n: 0, ev: [], upto: 9 }, A));
  ok(r.o === null, 'first post sees no opponent stream');
  r = await call(Object.assign({ op: 'live', n: 0, ev: [L.enc(12, 1, 0, 0)], upto: 14 }, B));
  ok(r.o && r.o.upto === 9, 'opponent stream comes back');
  r = await call(Object.assign({ op: 'live', n: 0, ev: [L.enc(12, 1, 0, 0), L.enc(15, 0, 1, 2)], upto: 20 }, B));
  r = await call(Object.assign({ op: 'live', n: 0, ev: [], upto: 25 }, A));
  ok(r.o && r.o.ev.length === 2 && r.o.upto === 20, 'streams append');
  r = await call(Object.assign({ op: 'live', n: 0, ev: [L.enc(1, 1, 1, 0)], upto: 30 }, B));
  ok(r._c === 409, 'a stream cannot be rewritten');
  r = await call(Object.assign({ op: 'live', n: 0, force: 1 }, A));
  ok(r._c === 409, 'cannot force a player who is still sending');
  // finish both and read the room back like a verifier would
  await call(Object.assign({ op: 'live', n: 0, ev: [L.enc(12, 1, 0, 0), L.enc(15, 0, 1, 2)], upto: 60, fin: true }, B));
  await call(Object.assign({ op: 'live', n: 0, ev: [], upto: 60, fin: true }, A));
  const { readRoom } = require('./api/_rooms.js');
  const rm = await readRoom(code);
  ok(rm.moves['0-a'].ctl === 1 && rm.moves['0-b'].pick === 'ZONE' && rm.moves['0-lv'] && rm.moves['0-lv'].b.length === 2, 'verifier sees the finished traces');
  const all = await call({ op: 'state', code, lvall: 1 });
  ok(all.lv && all.lv[0] && all.lv[0].b.fin, 'a rejoining player can fetch finished traces');
  // forcing a player who vanished
  await call(Object.assign({ op: 'move', n: 1, pick: 'RUN_IN' }, A));
  await call(Object.assign({ op: 'move', n: 1, pick: 'STACK', ctl: 1 }, B));
  await call(Object.assign({ op: 'live', n: 1, ev: [], upto: 5 }, B));
  const globalMem = globalThis.__gdmem; const key = 'gd:' + code + ':lv:1:b'; const cur = JSON.parse(globalMem.get(key).val); cur.t = Date.now() - 9000; globalMem.set(key, { val: JSON.stringify(cur), exp: 0 });
  r = await call(Object.assign({ op: 'live', n: 1, force: 1 }, A));
  ok(r.o && r.o.f === 1 && r.o.upto === 9999 && E.LIVE.dec(r.o.ev[r.o.ev.length - 1])[3] === 9, 'a vanished player is handed to the computer');
  r = await call(Object.assign({ op: 'live', n: 1, ev: [], upto: 7 }, B));
  ok(r.forced && r.forced.f === 1, 'the returning player is told');
  if (!process.exitCode) console.log('ALL OK');
})();
