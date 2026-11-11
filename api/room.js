// Quick-game rooms (guests or accounts) and the live rooms used by league games and tournament matches.
const { cmd, getJ, setJ, parse, readBody, send, fail, clean, randCode, userFrom, withLock } = require('./_lib');
const CHAT = require('./_chat');
const SQ = require('./_squad');
const EMOTES = ['gg', 'nice', 'wow', 'oops', 'lol', 'fire', 'clap', 'mad'];
const { createRoom, readRoom, liveAll, rkey, TTL } = require('./_rooms');
const E = require('../lib/engine.js');
const DR = require('../lib/draft.js');
const CAPVALS = Object.values(DR.CAPS);

/* Live plays: each seat streams its controller inputs (lib/live.js traces) through here, one key per play and seat.
   rec = { ev: [ints], upto: tick through which the stream is complete, fin: the play is over for this seat, t: last write, f: 1 when the other seat forced an AI takeover } */
async function liveOp(res, b, code, seat) {
  const n = b.n;
  if (!Number.isInteger(n) || n < 0 || n > 1400 || (n > 400 && n < 1000)) return fail(res, 400, 'bad_request');
  const me = rkey(code, 'lv:' + n + ':' + seat), her = rkey(code, 'lv:' + n + ':' + (seat === 'a' ? 'b' : 'a'));
  const [mine, other] = (await cmd(['MGET', me, her])).map(parse);
  const now = Date.now();
  if (b.poll) return send(res, 200, { o: other || null, forced: mine && mine.f ? mine : undefined });
  if (b.force) {   // the other player is gone: their stream ends with the computer taking over their player
    const o = other || { ev: [], upto: 0, fin: false, t: 0 };
    if (o.fin || o.f) return send(res, 200, { o });
    if (other && now - (other.t || 0) < 5000) return fail(res, 409, 'alive');
    const mk = (o.ev.length ? Math.floor(o.ev[o.ev.length - 1] / 100) : 0);
    const tick = Math.max(o.upto || 0, mk) + 1;
    const nr = { ev: o.ev.concat([tick * 100 + 49]), upto: 99999, fin: true, t: now, f: 1 };
    await setJ(her, nr, TTL);
    return send(res, 200, { o: nr });
  }
  const ev = E.cleanTrace(b.ev), upto = Number.isInteger(b.upto) ? Math.max(0, Math.min(99999, b.upto)) : 0;
  if (!ev) return fail(res, 400, 'bad_request');
  if (mine && mine.f) return send(res, 200, { o: other || null, forced: mine });
  let rec = mine;
  if (!mine || upto > mine.upto || (b.fin && !mine.fin) || ev.length > mine.ev.length) {
    const prev = mine ? mine.ev : [];
    for (let i = 0; i < prev.length; i++) if (ev[i] !== prev[i]) return fail(res, 409, 'diverged');
    rec = { ev, upto: Math.max(upto, mine ? mine.upto : 0), fin: !!(b.fin || (mine && mine.fin)), t: now };
    await setJ(me, rec, TTL);
  } else if (now - (mine.t || 0) > 1500) { rec = Object.assign({}, mine, { t: now }); await setJ(me, rec, TTL); }
  return send(res, 200, { o: other || null });
}

/* Signaling for the direct link between players' devices (WebRTC): a small mailbox per seat. A message goes in the other seat's box; every
   call takes (and empties) your own. Only setup goes through here (an offer, an answer, a goodbye); the plays still come to the server
   as the record. */
async function sigOp(res, b, code, seat) {
  const to = typeof b.to === 'string' && /^[a-z0-9]{1,3}$/.test(b.to) && b.to !== seat ? b.to : null;
  const msg = b.msg && typeof b.msg === 'object' && JSON.stringify(b.msg).length <= 12000 ? b.msg : null;
  if (to && msg) await withLock('sg:' + code + ':' + to, async () => {
    const k = rkey(code, 'sg:' + to), box = parse(await cmd(['GET', k])) || [];
    box.push(Object.assign({}, msg, { from: seat, at: Date.now() })); while (box.length > 12) box.shift();
    await setJ(k, box, 120);
  });
  const mine = rkey(code, 'sg:' + seat);
  const got = await withLock('sg:' + code + ':' + seat, async () => { const box = parse(await cmd(['GET', mine])) || []; if (box.length) await cmd(['DEL', mine]); return box; });
  return send(res, 200, { msgs: got.filter(m => Date.now() - (m.at || 0) < 60000) });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const b = readBody(req);
  if (req.method !== 'POST' || !b) return fail(res, 400, 'bad_request');
  try {
    const op = b.op;
    if (op === 'ping') return send(res, 200, { ok: true });
    const user = await userFrom(req);
    const pid = user ? 'u:' + user.name : clean(b.pid, 40);
    const name = clean(user ? user.name : b.name, 18) || 'Team';
    if (op === 'create') {
      if (!pid) return fail(res, 400, 'bad_request');
      const seed = Math.floor(Math.random() * 2147483647);
      const cap = CAPVALS.includes(+b.cap) ? +b.cap : 0;
      if (b.squad) {   // a squad game: a lobby first, the host sets the teams
        const code = await createRoom(seed, null, {}, { cap, squad: 1 }); if (!code) return fail(res, 503, 'busy');
        const lob = await SQ.create(code, pid, name);
        return send(res, 200, { code, seed, seat: null, squad: 1, lob: SQ.pub(lob, pid) });
      }
      const code = await createRoom(seed, null, { a: { pid, name, status: 'drafting' } }, { cap });
      return code ? send(res, 200, { code, seed, seat: 'a' }) : fail(res, 503, 'busy');
    }
    const code = String(b.code || '').toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) return fail(res, 400, 'bad_request');
    const room = await getJ(rkey(code, 'room'));
    if (!room) return fail(res, 404, 'no_room');
    if (room.squad && await SQ.op(res, b, code, room, pid, name)) return;
    if (op === 'join') {
      const [sa, sb] = (await cmd(['MGET', rkey(code, 'a'), rkey(code, 'b')])).map(parse);
      let seat = null;
      if (sa && sa.pid === pid) seat = 'a'; else if (sb && sb.pid === pid) seat = 'b';
      else if (!room.ctx && !sb) {
        const ok = await cmd(['SET', rkey(code, 'b'), JSON.stringify({ pid, name: clean(b.name, 18) || name, status: 'drafting' }), 'EX', TTL, 'NX']);
        if (ok !== null) seat = 'b';
      }
      if (seat && !room.ctx) await cmd(['SET', rkey(code, 'dr'), JSON.stringify(DR.newDraft(2, room.cap || 0, room.seed % 2)), 'EX', TTL, 'NX']);
      return send(res, 200, { seed: room.seed, seat, ctx: room.ctx || null });
    }
    if (op === 'chatget') { const r = await CHAT.list(rkey(code, 'chat'), b.since); return send(res, 200, r); }
    if (op === 'state') {
      const v = (await cmd(['MGET', rkey(code, 'a'), rkey(code, 'b'), rkey(code, 'ma'), rkey(code, 'mb'), rkey(code, 'dr'), rkey(code, 'pr:a'), rkey(code, 'pr:b'), rkey(code, 'emo:a'), rkey(code, 'emo:b'), rkey(code, 'chat')])).map(parse);
      const out = { seats: { a: v[0] || undefined, b: v[1] || undefined }, moves: { a: v[2] || {}, b: v[3] || {} }, dr: v[4] || undefined };
      // presence: how long since each seat was last heard from (its connection dot), and whether your seat is open on another device too
      const now = Date.now(), me = b.seat === 'a' || b.seat === 'b' ? b.seat : null, dev = clean(b.dev, 40);
      out.seen = { a: v[5] ? now - v[5].at : null, b: v[6] ? now - v[6].at : null };
      if (me && dev && v[me === 'a' ? 0 : 1] && v[me === 'a' ? 0 : 1].pid === pid) {
        const pr = v[me === 'a' ? 5 : 6]; if (pr && pr.d !== dev && now - pr.at < 6000) out.dup = true;
        await setJ(rkey(code, 'pr:' + me), { at: now, d: dev }, TTL); out.seen[me] = 0;
      }
      out.emo = { a: v[7] || undefined, b: v[8] || undefined }; out.chatN = v[9] ? v[9].n : 0;
      if (room.next) out.next = room.next;
      if (room.squad) { const lob = await getJ(rkey(code, 'lob')); if (lob) out.lob = SQ.pub(lob, pid); if (b.lvall) out.lv = await SQ.liveAll(code, out.moves); }
      else if (b.lvall) out.lv = await liveAll(code, out.moves);
      return send(res, 200, out);
    }
    if (room.squad) {   // squad rooms: everything a person does on the field, in the chat and on the link goes by his place in the lobby
      if (op === 'live' && (b.want || (typeof b.seat === 'string' && b.seat.length > 1))) return await SQ.live(res, b, code, pid);
      if (op === 'force' && b.slot) return await SQ.force(res, b, code, pid);
      if (op === 'chat' || op === 'emo' || op === 'sig') {
        const lob = await getJ(rkey(code, 'lob')), m = SQ.memberOf(lob, pid); if (!m) return fail(res, 403, 'forbidden');
        if (op === 'sig') return await sigOp(res, b, code, m.id);
        if (op === 'chat') { try { return send(res, 200, { msg: await CHAT.post(rkey(code, 'chat'), m.name, b.text, TTL, { s: m.team || '' }) }); } catch (e) { if (e.code === 'slow' || e.code === 'empty') return fail(res, e.status, e.code); throw e; } }
        const k = EMOTES.indexOf(b.k) >= 0 ? b.k : null, t = m.team; if (!k || !t) return fail(res, 400, 'bad_request');
        if ((await cmd(['SET', rkey(code, 'emr:' + m.id), '1', 'NX', 'PX', 2500])) === null) return fail(res, 429, 'slow');
        const e = { k, at: Date.now(), i: Math.floor(Math.random() * 1e9), by: m.name }; await setJ(rkey(code, 'emo:' + t), e, 120); return send(res, 200, { emo: e });
      }
    }
    const seat = b.seat === 'a' || b.seat === 'b' ? b.seat : null;
    if (!seat || !pid) return fail(res, 400, 'bad_request');
    const cur = parse(await cmd(['GET', rkey(code, seat)]));
    if (!cur || cur.pid !== pid) return fail(res, 403, 'forbidden');
    if (op === 'pick') {
      if (room.ctx) return fail(res, 400, 'bad_request');
      const id = clean(b.id, 8), t = seat === 'a' ? 0 : 1;
      const out = await withLock('dr:' + code, async () => {
        const d = parse(await cmd(['GET', rkey(code, 'dr')]));
        if (!d) return { err: [404, 'no_draft'] };
        if (DR.isDone(d)) return { d };
        if (DR.onClock(d) !== t) return { err: [409, 'turn'] };
        if (DR.taken(d)[id]) return { err: [409, 'taken'] };
        if (DR.legal(d, t, id)) return { err: [409, 'illegal'] };
        DR.apply(d, t, id);
        await setJ(rkey(code, 'dr'), d, TTL);
        if (DR.isDone(d)) {
          const sa = parse(await cmd(['GET', rkey(code, 'a')])), sb = parse(await cmd(['GET', rkey(code, 'b')]));
          await setJ(rkey(code, 'a'), { pid: sa.pid, name: sa.name, status: 'ready', roster: DR.toRoster(DR.teamIds(d, 0)) }, TTL);
          await setJ(rkey(code, 'b'), { pid: sb.pid, name: sb.name, status: 'ready', roster: DR.toRoster(DR.teamIds(d, 1)) }, TTL);
        }
        return { d };
      });
      return out.err ? fail(res, out.err[0], out.err[1]) : send(res, 200, { dr: out.d });
    }
    if (op === 'move') {
      const n = b.n, pick = clean(b.pick, 12);
      if (!Number.isInteger(n) || n < 0 || n > 1400 || (n > 400 && n < 1000) || !pick) return fail(res, 400, 'bad_request');
      const mk = rkey(code, 'm' + seat);
      const moves = parse(await cmd(['GET', mk])) || {};
      // c: this player also runs the players on the field, t: he calls a timeout before the snap, w: he goes for two after a touchdown,
      // s: the seconds he took to call it (a second off the running clock for every 5)
      const cs = Number.isInteger(b.cs) && b.cs > 0 ? Math.min(600, b.cs) : 0;
      // u: the defender he starts the snap as (LDE, RCB ...), k: how close to the middle of the meter he stopped his kick (0 is perfect, 100 the edge)
      const dp = typeof b.dp === 'string' && /^[A-Z]{1,6}$/.test(b.dp) ? b.dp : '', kt = Number.isInteger(b.kt) && b.kt >= 0 && b.kt <= 100 ? b.kt : null;
      const dj = typeof b.dj === 'string' && E.ADJS[b.dj] ? b.dj : '';   // j: the defense's pre-snap look
      const ck = typeof b.ck === 'string' && E.CHECKS.indexOf(b.ck) >= 0 ? b.ck : '';   // a: the offense's check-with-me section
      const hm = room.squad && Array.isArray(b.hm) ? b.hm.filter(k => SQ.POS.indexOf(k) >= 0 || SQ.SPOTS.indexOf(k) >= 0).slice(0, 5) : null;
      if (moves[n] === undefined) moves[n] = b.ctl || b.to || b.two || cs || dp || dj || ck || kt != null || (hm && hm.length) ? Object.assign({ p: pick }, b.ctl ? { c: 1 } : {}, b.to ? { t: 1 } : {}, b.two ? { w: 1 } : {}, cs ? { s: cs } : {}, dp ? { u: dp } : {}, dj ? { j: dj } : {}, ck ? { a: ck } : {}, kt != null ? { k: kt } : {}, hm && hm.length && b.ctl ? { h: hm } : {}) : pick;
      await setJ(mk, moves, TTL);
      return send(res, 200, { ok: true });
    }
    if (op === 'live') return await liveOp(res, b, code, seat);
    if (op === 'chat') {
      try { const msg = await CHAT.post(rkey(code, 'chat'), cur.name || seat, b.text, TTL, { s: seat }); return send(res, 200, { msg }); }
      catch (e) { if (e.code === 'slow' || e.code === 'empty') return fail(res, e.status, e.code); throw e; }
    }
    if (op === 'emo') {   // an emote: one every 2.5 seconds
      const k = EMOTES.indexOf(b.k) >= 0 ? b.k : null; if (!k) return fail(res, 400, 'bad_request');
      if ((await cmd(['SET', rkey(code, 'emr:' + seat), '1', 'NX', 'PX', 2500])) === null) return fail(res, 429, 'slow');
      const e = { k, at: Date.now(), i: Math.floor(Math.random() * 1e9) }; await setJ(rkey(code, 'emo:' + seat), e, 120);
      return send(res, 200, { emo: e });
    }
    if (op === 'rematch') {   // a fresh quick game for the same two: the first to ask makes the room, the other is pointed to it
      if (room.ctx) return fail(res, 400, 'bad_request');
      const next = await withLock('rm:' + code, async () => {
        const r0 = await getJ(rkey(code, 'room')); if (r0 && r0.next) return r0.next;
        const nc = await createRoom(Math.floor(Math.random() * 2147483647), null, { a: { pid, name: cur.name || name, status: 'drafting' } }, { cap: room.cap || 0 });
        if (nc) await setJ(rkey(code, 'room'), Object.assign({}, r0 || room, { next: nc }), TTL);
        return nc;
      });
      return next ? send(res, 200, { next }) : fail(res, 503, 'busy');
    }
    if (op === 'sig') return await sigOp(res, b, code, seat);
    return fail(res, 400, 'bad_request');
  } catch (e) { return fail(res, 500, 'server'); }
};
