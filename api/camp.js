/* Shared campaigns: one team run by up to five friends together (accounts only). One gzipped document per campaign; every change goes
   through withLock, so moves happen one at a time in the order they arrive.
   doc = { code, owner, members: [names], inv: [names], L, ver (anything changed), lver (the league changed), feed: [{ by, t, at }],
           pend: [{ id, by, op, a, t, at }] (big moves waiting for a yes), rd: { key, label, first, by: { name: 1 }, at } (the ready check),
           busy: { by, gid, at } (someone is playing the team's game) }
   Everyone can do everything (equal powers). Big moves (LG.campBig: trades, cutting or losing an 80+, contracts over $15M a year, a
   first-round pick) wait for another co-manager's yes. Simulating, advancing and playing wait until every co-manager who is online is
   ready. The chat is the campaign's own; approvals are announced in it. */
const zlib = require('zlib');
const { putZ, getZ, cmd, getJ, setJ, parse, withLock, readBody, send, fail, clean, randCode, userFrom, uKey } = require('./_lib');
const CHAT = require('./_chat');
const LG = require('../lib/league.js');
const key = c => 'gd:cp:' + c, skey = c => 'gd:cps:' + c, chatKey = c => 'gd:cpc:' + c, onKey = n => 'gd:on:' + n.toLowerCase();
const MAX_MEMBERS = 5, ONLINE = 90000, BUSY_MS = 45 * 60000, RD_MS = 10 * 60000, TTL = 400 * 86400;
const bad = (msg, code) => { const e = new Error(msg); e.http = code || 400; throw e; };
const isMem = (doc, n) => doc.members.some(x => x.toLowerCase() === n.toLowerCase());
const summary = doc => { const L = doc.L, t = L.teams[L.user]; return { code: doc.code, team: t ? t.name : '', season: L.season, week: L.week, phase: L.phase, owner: doc.owner, members: doc.members }; };
async function save(doc) { await putZ(key(doc.code), doc, TTL); await setJ(skey(doc.code), summary(doc), TTL); }
async function userEdit(name, fn) { await withLock('user:' + name.toLowerCase(), async () => { const u = await getJ(uKey(name)); if (!u) return; fn(u); await setJ(uKey(name), u); }); }
const addTo = (u, f, c) => { u[f] = u[f] || []; if (u[f].indexOf(c) < 0) u[f].push(c); }, dropFrom = (u, f, c) => { u[f] = (u[f] || []).filter(x => x !== c); };
async function online(names) { if (!names.length) return []; const v = (await cmd(['MGET'].concat(names.map(onKey)))).map(parse); return names.filter((n, i) => v[i] && Date.now() - v[i].at < ONLINE); }
const feed = (doc, by, t) => { if (!t) return; doc.feed.unshift({ by, t, at: Date.now() }); if (doc.feed.length > 80) doc.feed.length = 80; };
const say = (doc, t) => CHAT.sys(chatKey(doc.code), t, 30 * 86400).catch(() => {});
async function mutate(code, fn) {
  let out;
  await withLock('cp:' + code, async () => {
    const doc = await getZ(key(code)); if (!doc) bad('no_campaign', 404);
    const l0 = doc.lver;
    out = await fn(doc);
    doc.ver = (doc.ver || 0) + 1;
    await save(doc);
    out = out || {}; out.ver = doc.ver; out.lver = doc.lver; out.lchanged = doc.lver !== l0;
  });
  return out;
}
// the team's next game (for simulating or playing it)
const gameOf = (L, gid) => L.sched.find(g => g.id === gid && !g.done && (g.h === L.user || g.a === L.user));
function runSim(doc, gid) { const L = doc.L, g = gameOf(L, gid); if (!g) bad('That game is not up next.'); LG.simGame(L, g); LG.runUntilHuman(L, 60); LG.checkFinal(L); doc.lver++; return g; }
const result = (L, g) => { const me = L.user, mine = g.h === me ? g.sh : g.sa, them = g.h === me ? g.sa : g.sh; return (mine > them ? 'won ' : mine < them ? 'lost ' : 'tied ') + mine + '-' + them + ' against the ' + L.teams[g.h === me ? g.a : g.h].nick; };

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const b = readBody(req); if (req.method !== 'POST' || !b) return fail(res, 400, 'bad_request');
  try {
    const u = await userFrom(req); if (!u) return fail(res, 401, 'auth');
    const me = u.name, op = b.op;
    // share a campaign you have open: it moves to the server, with you as its owner
    if (op === 'create') {
      let L = b.L;
      if (typeof b.Lz === 'string') { if (b.Lz.length > 1400000) return fail(res, 413, 'too_big'); try { L = JSON.parse(zlib.gunzipSync(Buffer.from(b.Lz, 'base64'), { maxOutputLength: 2600000 }).toString('utf8')); } catch (e) { return fail(res, 400, 'bad_request'); } }
      if (!L || typeof L !== 'object' || !L.teams || !L.players || !L.camp) return fail(res, 400, 'bad_request');
      let code = null; for (let i = 0; i < 10 && !code; i++) { const c = randCode(); if ((await cmd(['SET', key(c), 'x', 'NX', 'EX', 60])) !== null) code = c; }
      if (!code) return fail(res, 503, 'busy');
      const doc = { code, owner: me, members: [me], inv: [], L, ver: 1, lver: 1, feed: [{ by: me, t: 'started sharing the campaign', at: Date.now() }], pend: [], rd: null, busy: null };
      await save(doc); await userEdit(me, x => addTo(x, 'cp', code));
      return send(res, 200, { code });
    }
    if (op === 'mine') {
      const fresh = await getJ(uKey(me)), cps = (fresh && fresh.cp) || [], inv = (fresh && fresh.cpi) || [];
      const all = cps.concat(inv), v = all.length ? (await cmd(['MGET'].concat(all.map(skey)))).map(parse) : [];
      return send(res, 200, { mine: v.slice(0, cps.length).filter(Boolean), invites: v.slice(cps.length).filter(Boolean) });
    }
    const code = String(b.code || '').toUpperCase(); if (!/^[A-Z0-9]{5}$/.test(code)) return fail(res, 400, 'bad_request');
    if (op === 'chat' || op === 'chatget') {
      const s = await getJ(skey(code)); if (!s) return fail(res, 404, 'no_campaign'); if (!isMem(s, me)) return fail(res, 403, 'forbidden');
      if (op === 'chatget') return send(res, 200, await CHAT.list(chatKey(code), b.since));
      try { return send(res, 200, { msg: await CHAT.post(chatKey(code), me, b.text, 30 * 86400) }); } catch (e) { if (e.code === 'slow' || e.code === 'empty') return fail(res, e.status, e.code); throw e; }
    }
    if (op === 'get') {
      const doc = await getZ(key(code)); if (!doc) return fail(res, 404, 'no_campaign');
      if (!isMem(doc, me)) return fail(res, isMem({ members: doc.inv }, me) ? 409 : 403, isMem({ members: doc.inv }, me) ? 'invited' : 'forbidden');
      const on = await online(doc.members);
      const out = { ver: doc.ver, lver: doc.lver, owner: doc.owner, members: doc.members, inv: doc.inv, feed: doc.feed.slice(0, 40), pend: doc.pend, rd: doc.rd, busy: doc.busy, online: on };
      if (b.lver !== doc.lver) out.L = doc.L;
      return send(res, 200, out);
    }
    const r = await mutate(code, async doc => {
      const L = doc.L, tid = L.user, mem = isMem(doc, me);
      if (doc.busy && Date.now() - doc.busy.at > BUSY_MS) doc.busy = null;   // (a game nobody finished)
      if (doc.rd && Date.now() - doc.rd.at > RD_MS) doc.rd = null;
      switch (op) {
        case 'invite': {
          if (!mem) bad('forbidden', 403);
          const who = String(b.name || '').trim(), x = await getJ(uKey(who)); if (!x) bad('no_user', 404);
          if (isMem(doc, x.name)) return { ok: true, already: true };
          if (doc.members.length + doc.inv.length >= MAX_MEMBERS) bad('A shared campaign has room for ' + MAX_MEMBERS + ' co-managers.');
          if (!isMem({ members: doc.inv }, x.name)) doc.inv.push(x.name);
          await userEdit(x.name, y => addTo(y, 'cpi', code)); feed(doc, me, 'invited ' + x.name); return { ok: true };
        }
        case 'join': {
          if (mem) return { ok: true };
          if (!isMem({ members: doc.inv }, me)) bad('forbidden', 403);
          doc.inv = doc.inv.filter(n => n.toLowerCase() !== me.toLowerCase()); doc.members.push(me);
          await userEdit(me, y => { dropFrom(y, 'cpi', code); addTo(y, 'cp', code); }); feed(doc, me, 'joined as a co-manager'); say(doc, me + ' joined as a co-manager.'); return { ok: true };
        }
        case 'decline': { doc.inv = doc.inv.filter(n => n.toLowerCase() !== me.toLowerCase()); await userEdit(me, y => dropFrom(y, 'cpi', code)); return { ok: true }; }
        case 'leave': {
          if (!mem) return { ok: true }; if (me === doc.owner) bad('The owner cannot leave. End the sharing instead.');
          doc.members = doc.members.filter(n => n !== me); await userEdit(me, y => dropFrom(y, 'cp', code)); feed(doc, me, 'left'); return { ok: true };
        }
        case 'remove': {
          if (me !== doc.owner) bad('owner_only', 403); const who = String(b.name || ''); if (who === doc.owner) bad('bad_request');
          doc.members = doc.members.filter(n => n !== who); doc.inv = doc.inv.filter(n => n !== who);
          await userEdit(who, y => { dropFrom(y, 'cp', code); dropFrom(y, 'cpi', code); }); feed(doc, me, 'removed ' + who); return { ok: true };
        }
        case 'end': {   // the owner takes it back: he gets the campaign to keep, and the sharing stops
          if (me !== doc.owner) bad('owner_only', 403);
          for (const n of doc.members.concat(doc.inv)) await userEdit(n, y => { dropFrom(y, 'cp', code); dropFrom(y, 'cpi', code); });
          doc.members = [me]; doc.inv = []; doc.ended = 1; return { ok: true, L };
        }
      }
      if (!mem) bad('forbidden', 403);
      const busyBy = doc.busy && doc.busy.by !== me ? doc.busy.by : null;
      if (op === 'op') {
        if (busyBy && b.what !== 'read') bad(busyBy + ' is playing the game right now. Wait until it is over.');
        const what = String(b.what || ''), a = b.a && typeof b.a === 'object' ? b.a : {};
        let big = doc.members.length > 1 ? LG.campBig(L, tid, what, a) : null;
        if (big && what === 'trade') { const x = LG.cpuTrade(L, tid, a.to, a.give, a.get); if (!x.ok) big = null; }   // (a trade they would not take: no need to ask; it gets their answer)
        if (big) {
          if (doc.pend.length >= 10) bad('Too many moves are waiting for a yes already.');
          const p = { id: Math.random().toString(36).slice(2, 9), by: me, op: what, a, t: big, at: Date.now() }; doc.pend.push(p);
          say(doc, me + ' wants to ' + big + '. Approve or reject it on the campaign page.');
          return { ok: true, pending: true, msg: 'Waiting for a co-manager to approve: ' + big + '.' };
        }
        const t = LG.campDesc(L, tid, what, a), x = LG.campOp(L, tid, what, a);
        if (what === 'mail' && x.ok) { const m = (L.inbox || []).find(y => y.id === a.id); if (m) m.by = me; }   // (whoever answered it)
        if (x.ok || what === 'trade') doc.lver++;
        if (x.ok) feed(doc, me, t);
        return x;
      }
      if (op === 'approve' || op === 'reject' || op === 'cancel') {
        const i = doc.pend.findIndex(p => p.id === b.id); if (i < 0) bad('That move is no longer waiting.', 404);
        const p = doc.pend[i];
        if (op === 'approve' && p.by === me) bad('Someone else has to approve your move.');
        if (op === 'cancel' && p.by !== me) bad('Only ' + p.by + ' can take that back.');
        doc.pend.splice(i, 1);
        if (op !== 'approve') { feed(doc, me, (op === 'cancel' ? 'took back their move: ' : 'rejected ' + p.by + '\'s move: ') + p.t); say(doc, me + (op === 'cancel' ? ' took back: ' : ' rejected ' + p.by + '\'s move: ') + p.t + '.'); return { ok: true }; }
        if (busyBy) bad(busyBy + ' is playing the game right now. Wait until it is over.');
        const x = LG.campOp(L, tid, p.op, p.a); doc.lver++;
        const line = me + ' approved ' + p.by + '\'s move: ' + p.t + (x.ok ? '' : ' (it did not go through: ' + (x.msg || 'no longer possible') + ')');
        feed(doc, me, 'approved ' + p.by + '\'s move: ' + p.t + (x.ok ? '' : ' (it did not go through)')); say(doc, line + '.');
        return Object.assign({}, x, { msg: x.ok ? 'Done: ' + p.t + '.' : x.msg });
      }
      // simulate, play or move on: everyone online has to be ready
      if (op === 'adv' || op === 'unready') {
        if (op === 'unready') { if (doc.rd && doc.rd.by[me]) { delete doc.rd.by[me]; if (!Object.keys(doc.rd.by).length) doc.rd = null; } return { ok: true }; }
        if (busyBy) bad(busyBy + ' is playing the game right now.');
        const kind = b.kind === 'sim' || b.kind === 'play' || b.kind === 'go' ? b.kind : null, arg = clean(b.arg, 20); if (!kind || !arg) bad('bad_request');
        if (kind !== 'go' && !gameOf(L, arg)) bad('That game is not up next.');
        if (kind === 'go' && ['offseason', 'season', 'fa-next', 'draft-one', 'draft-me', 'trim'].indexOf(arg) < 0) bad('bad_request');
        const k = kind + ':' + arg, label = kind === 'sim' ? 'simulate ' + (L.phase === 'playoffs' ? 'the playoff game' : 'week ' + L.week) : kind === 'play' ? 'play ' + (L.phase === 'playoffs' ? 'the playoff game' : 'week ' + L.week) : ({ offseason: 'move on to the offseason', season: 'start the season', 'fa-next': 'move free agency on a day', 'draft-one': 'move the draft on a pick', 'draft-me': 'draft up to our pick', trim: 'trim the roster to 53' })[arg];
        if (!doc.rd || doc.rd.key !== k) doc.rd = { key: k, label, first: me, by: {}, at: Date.now() };
        doc.rd.by[me] = 1;
        const others = (await online(doc.members)).filter(n => n !== me), waiting = others.filter(n => !doc.rd.by[n]);
        if (waiting.length) { if (Object.keys(doc.rd.by).length === 1) say(doc, me + ' wants to ' + label + '. Press Ready on the campaign page.'); return { ok: true, waiting }; }
        const first = doc.rd.first; doc.rd = null;
        if (kind === 'sim') { const g = runSim(doc, arg); feed(doc, first, 'simulated the game: ' + result(L, g)); return { ok: true, done: true }; }
        if (kind === 'play') { doc.busy = { by: first, gid: arg, at: Date.now() }; feed(doc, first, 'started playing ' + label.replace('play ', '')); return { ok: true, play: first === me }; }
        const e = LG.campGo(L, tid, arg); if (e) bad(e); doc.lver++; feed(doc, me, label.replace('move on', 'moved on').replace('start ', 'started ').replace('draft up', 'drafted up').replace('trim the', 'trimmed the').replace('move the', 'moved the').replace('move free', 'moved free'));
        return { ok: true, done: true };
      }
      // the result of the game played (checked: the moves are played back and must finish the game), or giving up on it
      if (op === 'report' || op === 'abandon') {
        if (!doc.busy || doc.busy.by !== me) bad('You are not playing a game.');
        const g = gameOf(L, doc.busy.gid);
        if (op === 'abandon' || !g) { doc.busy = null; return { ok: true }; }
        const cpuSide = g.h === tid ? 'b' : 'a';
        if (!LG.playVerified(L, g, b.moves || {}, [cpuSide])) bad('That game did not finish.');
        LG.runUntilHuman(L, 60); LG.checkFinal(L); doc.busy = null; doc.lver++; feed(doc, me, 'played the game: ' + result(L, g));
        return { ok: true };
      }
      bad('bad_request');
    });
    if (op === 'end' && r.ok) { await cmd(['DEL', key(code), skey(code)]); await userEdit(me, y => dropFrom(y, 'cp', code)); }   // (the owner has it back: the shared copy is gone)
    return send(res, 200, r);
  } catch (e) { return fail(res, e.http || 500, e.http ? e.message : 'server'); }
};
