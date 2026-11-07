// Friends between accounts, and who is online. Each account keeps fr (friends), fin (requests to it) and fout (requests it sent), by name.
// Presence: every open page checks in (op ping) every 30 s with what it is doing; a friend seen in the last ONLINE ms is online.
// Two accounts are only ever changed one at a time (never one lock inside another), so two people acting at once cannot lock each other out.
const { cmd, getJ, setJ, parse, readBody, send, fail, clean, uKey, userFrom, withLock } = require('./_lib');
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/, MAX = 200, ONLINE = 90000, onKey = n => 'gd:on:' + n.toLowerCase();
// a challenge to a quick game: waiting for the friend (inv), and the answer waiting for whoever sent it (ans); three minutes to answer
const invKey = n => 'gd:inv:' + n.toLowerCase(), ansKey = n => 'gd:ans:' + n.toLowerCase(), INV_TTL = 180;
const has = (arr, n) => (arr || []).some(x => x.toLowerCase() === n.toLowerCase());
const drop = (arr, n) => (arr || []).filter(x => x.toLowerCase() !== n.toLowerCase());
async function edit(name, fn) { return withLock('user:' + name.toLowerCase(), async () => { const u = await getJ(uKey(name)); if (!u) return null; const r = fn(u); u.fr = (u.fr || []).slice(0, MAX); u.fin = (u.fin || []).slice(-100); u.fout = (u.fout || []).slice(-100); await setJ(uKey(name), u); return r === undefined ? u : r; }); }
const STATUS = ['In the menu', 'In a quick game', 'In a squad game', 'Playing a campaign', 'In a league', 'In a tournament', 'Drafting', 'Watching a game'];
module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const b = readBody(req); if (req.method !== 'POST' || !b) return fail(res, 400, 'bad_request');
  try {
    const u = await userFrom(req); if (!u) return fail(res, 401, 'auth');
    const me = u.name, op = b.op;
    // check in; back: how many friends are online and how many requests are waiting (for the header)
    if (op === 'ping') {
      const st = STATUS.indexOf(b.st) >= 0 ? b.st : STATUS[0];
      await cmd(['SET', onKey(me), JSON.stringify({ at: Date.now(), st }), 'EX', 300]);
      const fr = u.fr || []; let on = 0;
      if (fr.length) { const v = (await cmd(['MGET'].concat(fr.map(onKey)))).map(parse); on = v.filter(x => x && Date.now() - x.at < ONLINE).length; }
      const [inv, ans] = (await cmd(['MGET', invKey(me), ansKey(me)])).map(parse);
      if (ans) await cmd(['DEL', ansKey(me)]);   // (said once)
      return send(res, 200, { on, req: (u.fin || []).length, inv: inv || undefined, ans: ans || undefined });
    }
    if (op === 'list') {
      const fr = u.fr || [], v = fr.length ? (await cmd(['MGET'].concat(fr.map(onKey)))).map(parse) : [];
      const friends = fr.map((n, i) => { const p = v[i], ago = p ? Date.now() - p.at : null; return { name: n, online: ago != null && ago < ONLINE, st: ago != null && ago < ONLINE ? p.st : null, ago }; })
        .sort((a, b) => (b.online - a.online) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      return send(res, 200, { friends, incoming: u.fin || [], outgoing: u.fout || [] });
    }
    const who = String(b.name || '').trim();
    if (!NAME_RE.test(who)) return fail(res, 400, 'bad_name');
    if (who.toLowerCase() === me.toLowerCase()) return fail(res, 400, 'self');
    if (op === 'request') {
      const them = await getJ(uKey(who)); if (!them) return fail(res, 404, 'no_user');
      const real = them.name;
      if (has(u.fr, real)) return send(res, 200, { ok: true, already: true });
      if ((u.fr || []).length >= MAX) return fail(res, 409, 'too_many');
      if (has(u.fin, real)) { await befriend(me, real); return send(res, 200, { ok: true, friends: true }); }   // they had asked first: friends now
      await edit(me, x => { if (!has(x.fout, real)) (x.fout = x.fout || []).push(real); });
      await edit(real, x => { if (!has(x.fr, me) && !has(x.fin, me)) (x.fin = x.fin || []).push(me); });
      return send(res, 200, { ok: true, sent: true });
    }
    if (op === 'accept') {
      if (!has(u.fin, who)) return fail(res, 404, 'no_request');
      const them = await getJ(uKey(who)); if (!them) { await edit(me, x => { x.fin = drop(x.fin, who); }); return fail(res, 404, 'no_user'); }
      await befriend(me, them.name); return send(res, 200, { ok: true });
    }
    // challenge a friend: the room is already made (code); he hears about it on his next check-in
    if (op === 'invite') {
      if (!has(u.fr, who)) return fail(res, 403, 'not_friends');
      const code = String(b.code || '').toUpperCase(); if (!/^[A-Z0-9]{5}$/.test(code)) return fail(res, 400, 'bad_request');
      await cmd(['SET', invKey(who), JSON.stringify({ from: me, code, at: Date.now() }), 'EX', INV_TTL]); return send(res, 200, { ok: true });
    }
    // his answer: yes (he is on his way to the room) or no; either way the challenge is gone, and the sender hears which
    if (op === 'answer') {
      const inv = parse(await cmd(['GET', invKey(me)])); if (!inv || inv.from.toLowerCase() !== who.toLowerCase()) return fail(res, 404, 'no_invite');
      await cmd(['DEL', invKey(me)]); await cmd(['SET', ansKey(inv.from), JSON.stringify({ by: me, yes: !!b.yes, code: inv.code }), 'EX', INV_TTL]);
      return send(res, 200, { ok: true, code: b.yes ? inv.code : undefined });
    }
    if (op === 'decline') { await edit(me, x => { x.fin = drop(x.fin, who); }); await edit(who, x => { x.fout = drop(x.fout, me); }); return send(res, 200, { ok: true }); }
    if (op === 'cancel') { await edit(me, x => { x.fout = drop(x.fout, who); }); await edit(who, x => { x.fin = drop(x.fin, me); }); return send(res, 200, { ok: true }); }
    if (op === 'remove') { await edit(me, x => { x.fr = drop(x.fr, who); }); await edit(who, x => { x.fr = drop(x.fr, me); }); return send(res, 200, { ok: true }); }
    return fail(res, 400, 'bad_request');
  } catch (e) { return fail(res, e.code === 'busy' ? 503 : 500, e.code === 'busy' ? 'busy' : 'server'); }
};
// both sides: friends, and no requests left between them
async function befriend(a, b) {
  await edit(a, x => { x.fin = drop(x.fin, b); x.fout = drop(x.fout, b); if (!has(x.fr, b)) (x.fr = x.fr || []).push(b); });
  await edit(b, x => { x.fin = drop(x.fin, a); x.fout = drop(x.fout, a); if (!has(x.fr, a)) (x.fr = x.fr || []).push(a); });
}
