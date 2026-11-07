// Friends between accounts, and who is online.
const H = { auth: require('./api/auth.js'), friends: require('./api/friends.js') };
const call = (name, body, tok) => new Promise(r => { const req = { method: 'POST', body, headers: tok ? { 'x-token': tok } : {} }; const res = { status(c) { this.c = c; return this; }, json(o) { r(Object.assign({ _c: this.c }, o)); }, setHeader() {} }; H[name](req, res); });
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const reg = n => call('auth', { op: 'register', name: n, password: 'secret1' }).then(r => r.token);
  const A = await reg('fr_ann'), B = await reg('fr_bob'), C = await reg('fr_cy');
  const f = (tok, body) => call('friends', body, tok);
  ok((await f(A, { op: 'request', name: 'nobody_here' })).error === 'no_user' && (await f(A, { op: 'request', name: 'fr_ann' })).error === 'self', 'no requests to nobody, or to yourself');
  ok((await f(A, { op: 'request', name: 'FR_BOB' })).sent, 'Ann asks Bob (whatever the capitals)');
  let lb = await f(B, { op: 'list' }); ok(lb.incoming.join() === 'fr_ann' && (await f(A, { op: 'list' })).outgoing.join() === 'fr_bob', 'Bob sees the request, Ann sees it waiting');
  ok((await f(B, { op: 'ping', st: 'In the menu' })).req === 1, 'his header can say a request is waiting');
  await f(B, { op: 'accept', name: 'fr_ann' });
  const la = await f(A, { op: 'list' }); lb = await f(B, { op: 'list' });
  ok(la.friends.map(x => x.name).join() === 'fr_bob' && lb.friends.map(x => x.name).join() === 'fr_ann' && !lb.incoming.length && !la.outgoing.length, 'accepted: friends on both sides, no requests left');
  // online: Bob checked in a moment ago
  ok(la.friends[0].online && la.friends[0].st === 'In the menu', 'Ann sees Bob online, in the menu');
  await f(B, { op: 'ping', st: 'In a squad game' }); ok((await f(A, { op: 'list' })).friends[0].st === 'In a squad game', 'and what he is doing');
  ok((await f(A, { op: 'ping', st: 'Playing a campaign' })).on === 1, 'her header counts one friend online');
  ok((await f(C, { op: 'list' })).friends.length === 0 && !(await f(A, { op: 'list' })).friends.some(x => x.name === 'fr_cy'), 'Cy is nobody\'s friend yet, and cannot see anyone');
  // offline: a check-in from long ago
  const L = require('./api/_lib'); await L.cmd(['SET', 'gd:on:fr_bob', JSON.stringify({ at: Date.now() - 600000, st: 'In the menu' }), 'EX', 300]);
  const off = (await f(A, { op: 'list' })).friends[0]; ok(!off.online && !off.st && off.ago >= 600000, 'when he stops checking in he shows offline, last seen ' + Math.round(off.ago / 60000) + ' minutes ago');
  // asking each other: friends at once; declining; cancelling; removing
  await f(C, { op: 'request', name: 'fr_ann' }); const r2 = await f(A, { op: 'request', name: 'fr_cy' }); ok(r2.friends && (await f(C, { op: 'list' })).friends.some(x => x.name === 'fr_ann'), 'two people who ask each other are friends at once');
  await f(C, { op: 'request', name: 'fr_bob' }); await f(B, { op: 'decline', name: 'fr_cy' }); ok(!(await f(C, { op: 'list' })).outgoing.length && !(await f(B, { op: 'list' })).incoming.length, 'a declined request is gone on both sides');
  await f(C, { op: 'request', name: 'fr_bob' }); await f(C, { op: 'cancel', name: 'fr_bob' }); ok(!(await f(B, { op: 'list' })).incoming.length, 'and so is a cancelled one');
  await f(A, { op: 'remove', name: 'fr_bob' }); ok(!(await f(B, { op: 'list' })).friends.some(x => x.name === 'fr_ann'), 'removing a friend removes you from his list too');
  ok((await call('friends', { op: 'list' })).error === 'auth', 'signed out: no friends list');
})();
// challenges: only friends, the friend hears on his next check-in, answers, and the sender hears the answer
(async () => {
  await new Promise(r => setTimeout(r, 1500));
  const reg = n => call('auth', { op: 'register', name: n, password: 'secret1' }).then(r => r.token), f = (tok, body) => call('friends', body, tok);
  const P = await reg('ch_pat'), Q = await reg('ch_quin'), Z = await reg('ch_zed');
  await f(P, { op: 'request', name: 'ch_quin' }); await f(Q, { op: 'accept', name: 'ch_pat' });
  ok((await f(Z, { op: 'invite', name: 'ch_quin', code: 'ABCDE' })).error === 'not_friends', 'only friends can challenge you');
  ok((await f(P, { op: 'invite', name: 'ch_quin', code: 'ABCDE' })).ok, 'Pat challenges Quin to the game in room ABCDE');
  const pq = await f(Q, { op: 'ping', st: 'In the menu' }); ok(pq.inv && pq.inv.from === 'ch_pat' && pq.inv.code === 'ABCDE', 'Quin hears about it on his next check-in');
  const yes = await f(Q, { op: 'answer', name: 'ch_pat', yes: 1 }); ok(yes.code === 'ABCDE' && !(await f(Q, { op: 'ping' })).inv, 'he accepts: off to the room, and the challenge is gone');
  const pp = await f(P, { op: 'ping' }); ok(pp.ans && pp.ans.by === 'ch_quin' && pp.ans.yes && !(await f(P, { op: 'ping' })).ans, 'Pat hears he is coming (once)');
  await f(P, { op: 'invite', name: 'ch_quin', code: 'FGHJK' }); await f(Q, { op: 'answer', name: 'ch_pat', yes: 0 });
  ok((await f(P, { op: 'ping' })).ans.yes === false, 'a no is passed on too');
})();
