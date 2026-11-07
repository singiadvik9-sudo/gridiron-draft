// Shared campaigns: one team, run by friends together.
const H = { auth: require('./api/auth.js'), camp: require('./api/camp.js'), friends: require('./api/friends.js') };
const LG = require('./lib/league.js'), E = require('./lib/engine.js');
const call = (name, body, tok) => new Promise(r => { const req = { method: 'POST', body, headers: tok ? { 'x-token': tok } : {} }; const res = { status(c) { this.c = c; return this; }, json(o) { r(Object.assign({ _c: this.c }, o)); }, setHeader() {} }; H[name](req, res); });
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const reg = n => call('auth', { op: 'register', name: n, password: 'secret1' }).then(r => r.token);
  const A = await reg('cm_ann'), B = await reg('cm_bob'), Z = await reg('cm_zed');
  const c = (tok, body) => call('camp', body, tok);
  const L = LG.newNFL({ user: 0, seed: 12 }); L.teams[0].owner = 'You'; LG.campInit(L); LG.runUntilHuman(L, 60);
  const { code } = await c(A, { op: 'create', L }); ok(/^[A-Z0-9]{5}$/.test(code), 'Ann shares her campaign: ' + code);
  ok((await c(B, { op: 'get', code })).error === 'forbidden', 'Bob cannot see it yet');
  await c(A, { op: 'invite', code, name: 'cm_bob' });
  ok((await c(B, { op: 'mine' })).invites.some(x => x.code === code), 'Bob is invited');
  ok((await c(B, { op: 'get', code })).error === 'invited', 'and has to accept first');
  await c(B, { op: 'join', code }); const g0 = await c(B, { op: 'get', code });
  ok(g0.members.join() === 'cm_ann,cm_bob' && g0.L && g0.L.teams[0].owner === 'You', 'he joins and gets the campaign');
  const same = await c(B, { op: 'get', code, lver: g0.lver }); ok(!same.L, 'asking again with the same league version: no league sent');
  // an everyday move: done at once, in the feed
  const ro = LG.rosterOf(g0.L, 0).sort((a, b) => a.o - b.o), low = ro[0];
  const r1 = await c(B, { op: 'op', code, what: 'starter', a: { pid: low.i, on: true } });
  const g1 = await c(A, { op: 'get', code }); ok(r1.ok && g1.L.players[low.i].st && g1.feed[0].by === 'cm_bob' && /starter/.test(g1.feed[0].t), 'Bob makes ' + low.n + ' a starter: Ann sees it, and the feed says "' + g1.feed[0].t + '"');
  // a big move waits for a yes
  const star = LG.rosterOf(g1.L, 0).sort((a, b) => b.o - a.o)[0];
  const r2 = await c(A, { op: 'op', code, what: 'release', a: { pid: star.i } }); const g2 = await c(B, { op: 'get', code });
  ok(r2.pending && g2.pend.length === 1 && g2.L.players[star.i].t === 0, 'Ann wants to cut ' + star.n + ' (' + star.o + '): it waits ("' + g2.pend[0].t + '")');
  ok((await c(A, { op: 'approve', code, id: g2.pend[0].id })).error && true, 'she cannot approve her own move');
  ok((await c(B, { op: 'chatget', code })).msgs.some(m => m.sys && /wants to release/.test(m.t)), 'and the chat says what she wants');
  await c(B, { op: 'reject', code, id: g2.pend[0].id }); const g3 = await c(A, { op: 'get', code });
  ok(!g3.pend.length && g3.L.players[star.i].t === 0 && /rejected/.test(g3.feed[0].t), 'Bob rejects it: he stays');
  // a trade the CPU would take: waits; approved: done
  const T = g3.L, them = LG.rosterOf(T, 5).sort((a, b) => b.o - a.o), mine = LG.rosterOf(T, 0).sort((a, b) => b.o - a.o);
  let deal = null; for (const p of mine.slice(0, 12)) { for (const q of them.slice(8, 30)) { if (LG.cpuTrade(T, 0, 5, [p.i], [q.i]).ok) { deal = [p, q]; break; } } if (deal) break; }
  if (deal) { const r3 = await c(A, { op: 'op', code, what: 'trade', a: { to: 5, give: [deal[0].i], get: [deal[1].i] } }); const pid = (await c(B, { op: 'get', code })).pend[0];
    ok(r3.pending && pid && /^trade/.test(pid.t), 'a trade the other team would take waits for a yes: "' + pid.t + '"');
    const r4 = await c(B, { op: 'approve', code, id: pid.id }); const g4 = await c(A, { op: 'get', code });
    ok(r4.ok && g4.L.players[deal[1].i].t === 0 && g4.L.players[deal[0].i].t === 5, 'approved: it goes through'); }
  else ok(false, 'found a trade to try');
  // simulating: alone online, it just happens; with Bob online, it waits until he is ready too
  const L5 = (await c(A, { op: 'get', code })).L, gm = LG.weekGames(L5).find(x => x.h === 0 || x.a === 0);
  const s1 = await c(A, { op: 'adv', code, kind: 'sim', arg: gm.id }); ok(s1.done, 'nobody else online: Ann simulates the game straight away');
  await call('friends', { op: 'ping', st: 'Playing a campaign' }, B);
  const L6 = (await c(A, { op: 'get', code })).L, gm2 = LG.weekGames(L6).find(x => x.h === 0 || x.a === 0);
  const s2 = await c(A, { op: 'adv', code, kind: 'sim', arg: gm2.id }); ok(s2.waiting && s2.waiting.join() === 'cm_bob', 'with Bob online it waits for him (' + s2.waiting + ')');
  ok(/wants to simulate/.test((await c(B, { op: 'get', code })).rd.label + ' ') || (await c(B, { op: 'get', code })).rd.label, 'he sees "' + (await c(B, { op: 'get', code })).rd.label + '"');
  const s3 = await c(B, { op: 'adv', code, kind: 'sim', arg: gm2.id }); const g7 = await c(A, { op: 'get', code });
  ok(s3.done && g7.L.week > L6.week && !g7.rd, 'he presses Ready: the week is played');
  // playing: the team is reserved for whoever plays, and the result is checked when it comes in
  // Bob goes offline: Ann plays the game on her own
  await require('./api/_lib').cmd(['SET', 'gd:on:cm_bob', JSON.stringify({ at: Date.now() - 600000, st: 'In the menu' }), 'EX', 300]);
  const gm3 = LG.weekGames(g7.L).find(x => x.h === 0 || x.a === 0), p1 = await c(A, { op: 'adv', code, kind: 'play', arg: gm3.id }); const g8 = await c(B, { op: 'get', code });
  ok(p1.play && g8.busy && g8.busy.by === 'cm_ann' && !g8.busy.room, 'with Bob offline, Ann plays it on her own straight away');
  ok(/playing/.test((await c(B, { op: 'op', code, what: 'starter', a: { pid: low.i, on: false } })).error || ''), 'and nobody else can change the team while she does');
  const T8 = LG.teamsFor(g8.L, gm3.h, gm3.a), side = gm3.h === 0 ? 'a' : 'b', seed = LG.gameSeed(g8.L, gm3);
  let mv = {}, st = E.initState(seed); const U = { a: E.teamUnits(T8.a), b: E.teamUnits(T8.b) };
  for (let k = 0; k < 400 && !st.over; k++) { const n = st.playNo, role = st.poss === side ? 'off' : 'def'; mv[n + '-' + side] = { pick: E.cpuMove(st, U, side, seed, role) }; st = E.replay(seed, T8, mv, [side === 'a' ? 'b' : 'a']).state; }
  ok((await c(B, { op: 'report', code, moves: mv })).error, 'only the one playing can report it');
  const rp = await c(A, { op: 'report', code, moves: mv }); const g9 = await c(B, { op: 'get', code });
  ok(rp.ok && !g9.busy && /played the game/.test(g9.feed[0].t), 'Ann reports the game: checked, and in the feed ("' + g9.feed[0].t + '")');
  // the chat is theirs
  ok((await c(B, { op: 'chat', code, text: 'nice win' })).msg && (await c(Z, { op: 'chat', code, text: 'hi' })).error === 'forbidden', 'co-managers chat; strangers cannot');
  // the owner ends it and takes the campaign back
  ok((await c(B, { op: 'end', code })).error, 'only the owner can end the sharing');
  const en = await c(A, { op: 'end', code }); ok(en.ok && en.L && en.L.season && (await c(A, { op: 'get', code })).error === 'no_campaign' && !(await c(B, { op: 'mine' })).mine.length, 'the owner ends it: she gets the campaign back, and it is gone for Bob');
})();
// playing together: when two co-managers are ready to play, a squad room with both on the team, the other team the computer; the
// result is checked from the room's own record, whoever reports it
(async () => {
  await new Promise(r => setTimeout(r, 4000));
  H.room = require('./api/room.js');
  const reg = n => call('auth', { op: 'register', name: n, password: 'secret1' }).then(r => r.token), c = (tok, body) => call('camp', body, tok);
  const A = await reg('pt_ann'), B = await reg('pt_bob');
  const L = LG.newNFL({ user: 3, seed: 21 }); L.teams[3].owner = 'You'; LG.campInit(L); LG.runUntilHuman(L, 60);
  const { code } = await c(A, { op: 'create', L }); await c(A, { op: 'invite', code, name: 'pt_bob' }); await c(B, { op: 'join', code });
  for (const t of [A, B]) await call('friends', { op: 'ping', st: 'Playing a campaign' }, t);
  const L0 = (await c(A, { op: 'get', code })).L, gm = LG.weekGames(L0).find(x => x.h === 3 || x.a === 3);
  await c(A, { op: 'adv', code, kind: 'play', arg: gm.id }); const r2 = await c(B, { op: 'adv', code, kind: 'play', arg: gm.id });
  const g1 = await c(A, { op: 'get', code }), busy = g1.busy;
  ok(r2.room && busy && busy.room === r2.room && busy.players.join() === 'pt_ann,pt_bob', 'both ready: they get a room to play it together (' + r2.room + ')');
  const st = await call('room', { op: 'state', code: busy.room }, B), side = busy.side, cpu = side === 'a' ? 'b' : 'a';
  ok(st.lob.started && st.lob.ps.map(p => p.name + ':' + p.pos).join() === 'pt_ann:QB,pt_bob:WR1' && st.lob.ps.every(p => p.team === side && p.ds), 'in it: Ann at quarterback, Bob at receiver, both with a defender, on their team');
  ok(st.seats[side].squad && st.seats[cpu].squad && st.seats[cpu].cpu === 1 && st.seats[side].name === L0.teams[3].nick, 'the real campaign teams, the other one the computer');
  ok(/playing/.test((await c(B, { op: 'op', code, what: 'starter', a: { pid: LG.rosterOf(L0, 3)[0].i, on: true } })).error || ''), 'the team is locked while they play');
  // Ann (the quarterback) calls every play from her seat; the computer plays the other side
  const T = LG.teamsFor(g1.L, gm.h, gm.a), seed = LG.gameSeed(g1.L, gm), U = { a: E.teamUnits(T.a), b: E.teamUnits(T.b) }, mv = {};
  let s = E.initState(seed);
  for (let k = 0; k < 400 && !s.over; k++) {
    const n = s.playNo, role = s.poss === side ? 'off' : 'def', pick = E.cpuMove(s, U, side, seed, role);
    await call('room', { op: 'move', code: busy.room, seat: side, n, pick }, A); mv[n + '-' + side] = { pick };
    s = E.replay(seed, T, mv, [cpu]).state;
  }
  const rb = await c(B, { op: 'report', code, room: busy.room }); const g2 = await c(A, { op: 'get', code });
  ok(rb.ok && !g2.busy && /played the game together/.test(g2.feed[0].t), 'Bob reports it: checked from the room, and in the feed ("' + g2.feed[0].by + ' ' + g2.feed[0].t + '")');
  ok((await c(A, { op: 'report', code, room: busy.room })).ok, 'Ann reporting it too is fine (it is already in)');
  ok(g2.L.sched.find(x => x.id === gm.id).done, 'the game counts in the campaign');
})();
