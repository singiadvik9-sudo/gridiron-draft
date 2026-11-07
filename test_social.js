// Chat (rooms, leagues, tournaments), emotes, rematch, presence and the same account on two devices.
const H = { auth: require('./api/auth.js'), league: require('./api/league.js'), tourney: require('./api/tourney.js'), room: require('./api/room.js'), save: require('./api/save.js') };
const LG = require('./lib/league.js');
const call = (name, body, tok) => new Promise(r => { const req = { method: 'POST', body, headers: tok ? { 'x-token': tok } : {} }; const res = { status(c) { this.c = c; return this; }, json(o) { r(Object.assign({ _c: this.c }, o)); }, setHeader() {} }; H[name](req, res); });
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // a quick game room
  const A = await call('room', { op: 'create', pid: 'pa', name: 'Alpha' }), code = A.code;
  await call('room', { op: 'join', code, pid: 'pb', name: 'Bravo' });
  const say = (seat, pid, text) => call('room', { op: 'chat', code, seat, pid, text });
  const m1 = await say('a', 'pa', 'good luck'); ok(m1.msg && m1.msg.t === 'good luck' && m1.msg.f === 'Alpha', 'a player says something in the room');
  ok((await say('a', 'pa', 'again')).error === 'slow', 'and has to wait a moment before the next one');
  await wait(750); const m2 = await say('b', 'pb', 'what the fuck'); ok(m2.msg && /f\*+/.test(m2.msg.t) && !/fuck/.test(m2.msg.t), 'the worst words are starred out: "' + (m2.msg && m2.msg.t) + '"');
  ok((await say('b', 'pa', 'not my seat')).error === 'forbidden', 'nobody can talk as someone else');
  const g = await call('room', { op: 'chatget', code, since: 0 }); ok(g.msgs.length === 2 && g.n === 2, 'both messages are there for anyone in the room');
  ok((await call('room', { op: 'chatget', code, since: 1 })).msgs.length === 1, 'and only the new ones are fetched');
  let slow = 0; for (let k = 0; k < 12; k++) { const r = await say('a', 'pa', 'spam ' + k); if (r.error === 'slow') slow++; await wait(720); }
  ok(slow >= 3, 'a burst is cut off after eight in ten seconds (' + slow + ' of 12 held back)');
  // emotes
  const e1 = await call('room', { op: 'emo', code, seat: 'b', pid: 'pb', k: 'fire' }); ok(e1.emo && e1.emo.k === 'fire', 'an emote');
  ok((await call('room', { op: 'emo', code, seat: 'b', pid: 'pb', k: 'gg' })).error === 'slow' && (await call('room', { op: 'emo', code, seat: 'a', pid: 'pa', k: 'nope' })).error === 'bad_request', 'one every few seconds, and only the known ones');
  // presence: the state poll says when each seat was last heard from, and warns when your seat is open on two devices
  const s1 = await call('room', { op: 'state', code, seat: 'a', pid: 'pa', dev: 'tab1' });
  ok(s1.seen.a === 0 && s1.emo.b && s1.emo.b.k === 'fire' && s1.chatN >= 2 && !s1.dup, 'the poll carries presence, the latest emote and the chat count');
  const s2 = await call('room', { op: 'state', code, seat: 'a', pid: 'pa', dev: 'tab2' }); ok(s2.dup === true, 'the same seat polling from a second device is flagged');
  const s3 = await call('room', { op: 'state', code, seat: 'b', pid: 'pb', dev: 'x' }); ok(s3.seen.a != null && s3.seen.a < 5000 && !s3.dup, 'the other player sees you as connected');
  // rematch: whoever asks first makes the room; the other is pointed to it
  const r1 = await call('room', { op: 'rematch', code, seat: 'a', pid: 'pa' }), r2 = await call('room', { op: 'rematch', code, seat: 'b', pid: 'pb' });
  ok(r1.next && r1.next === r2.next, 'a rematch room, the same one for both');
  const j = await call('room', { op: 'join', code: r1.next, pid: 'pa', name: 'Alpha' }), jb = await call('room', { op: 'join', code: r1.next, pid: 'pb', name: 'Bravo' });
  ok(j.seat === 'a' && jb.seat === 'b', 'both land in it, in their seats');
  ok((await call('room', { op: 'state', code })).next === r1.next, 'and the old room points there');
  // league and tournament chat: members only
  const al = await call('auth', { op: 'register', name: 'chatal', password: 'secret1' }), bo = await call('auth', { op: 'register', name: 'chatbo', password: 'secret2' });
  const lg = await call('league', { op: 'create', cfg: { name: 'Talk' } }, al.token);
  const lm = await call('league', { op: 'chat', code: lg.code, text: 'welcome' }, al.token); ok(lm.msg && lm.msg.f === 'chatal', 'a league member chats');
  ok((await call('league', { op: 'chat', code: lg.code, text: 'hi' }, bo.token)).error === 'forbidden' && (await call('league', { op: 'chatget', code: lg.code }, bo.token)).error === 'forbidden', 'outsiders can neither read nor write');
  await call('league', { op: 'join', code: lg.code }, bo.token);
  ok((await call('league', { op: 'chatget', code: lg.code, since: 0 }, bo.token)).msgs.length === 1, 'once he joins he can read it');
  const tn = await call('tourney', { op: 'create', cfg: { name: 'Cup' } }, al.token);
  ok((await call('tourney', { op: 'chat', code: tn.code, text: 'bracket soon' }, al.token)).msg && (await call('tourney', { op: 'chat', code: tn.code, text: 'x' }, bo.token)).error === 'forbidden', 'tournament chat: the manager yes, a stranger no');
  // a campaign saved from two devices: the second save from the older copy is refused, unless forced
  const L = LG.newNFL({ user: 0, seed: 3 }); L.teams[0].owner = 'You';
  await call('save', { op: 'put', slot: 1, L }, al.token);
  const d1 = await call('save', { op: 'get', slot: 1 }, al.token), d2 = await call('save', { op: 'get', slot: 1 }, al.token);
  ok(d1.rev && d1.rev === d2.rev, 'two devices load the same version');
  await wait(5); const p1 = await call('save', { op: 'put', slot: 1, L, base: d1.rev }, al.token); ok(p1.ok, 'the first one saves');
  const p2 = await call('save', { op: 'put', slot: 1, L, base: d2.rev }, al.token); ok(p2.error === 'stale' && p2.meta && p2.meta.updated === p1.meta.updated, 'the second, still on the old version, is refused and told what is there');
  ok((await call('save', { op: 'put', slot: 1, L, base: d2.rev, force: 1 }, al.token)).ok, 'unless the player chooses to overwrite');
  ok((await call('save', { op: 'put', slot: 1, L }, al.token)).ok, 'saves that do not say which version they came from (older pages) still go through');
})();
// a campaign sent gzipped (what browsers do now): stored the same as one sent as it is
(async () => {
  const zlib = require('zlib'); await new Promise(r => setTimeout(r, 3000));
  const u = await call('auth', { op: 'register', name: 'zipper', password: 'secret1' }); const L = LG.newNFL({ user: 2, seed: 9 }); L.teams[2].owner = 'You';
  const raw = JSON.stringify(L), z = zlib.gzipSync(raw).toString('base64');
  const p = await call('save', { op: 'put', slot: 2, Lz: z }, u.token); const g = await call('save', { op: 'get', slot: 2 }, u.token);
  ok(p.ok && JSON.stringify(g.L) === raw, 'a gzipped save comes back exactly (' + Math.round(raw.length / 1024) + ' KB sent as ' + Math.round(z.length / 1024) + ' KB)');
  ok((await call('save', { op: 'put', slot: 2, Lz: 'not gzip' }, u.token)).error === 'bad_request', 'and a broken one is refused');
})();
