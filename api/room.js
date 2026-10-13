// Quick-game rooms (guests or accounts) and the live rooms used by league games and tournament matches.
const { cmd, getJ, setJ, parse, readBody, send, fail, clean, randCode, userFrom, withLock } = require('./_lib');
const { createRoom, readRoom, liveAll, rkey, TTL } = require('./_rooms');
const E = require('../lib/engine.js');
const DR = require('../lib/draft.js');
const CAPVALS = Object.values(DR.CAPS);

/* Live plays: each seat streams its controller inputs (lib/live.js traces) through here, one key per play and seat.
   rec = { ev: [ints], upto: tick through which the stream is complete, fin: the play is over for this seat, t: last write, f: 1 when the other seat forced an AI takeover } */
async function liveOp(res, b, code, seat) {
  const n = b.n;
  if (!Number.isInteger(n) || n < 0 || n > 400) return fail(res, 400, 'bad_request');
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
    const nr = { ev: o.ev.concat([tick * 100 + 49]), upto: 9999, fin: true, t: now, f: 1 };
    await setJ(her, nr, TTL);
    return send(res, 200, { o: nr });
  }
  const ev = E.cleanTrace(b.ev), upto = Number.isInteger(b.upto) ? Math.max(0, Math.min(9999, b.upto)) : 0;
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
      const code = await createRoom(seed, null, { a: { pid, name, status: 'drafting' } }, { cap });
      return code ? send(res, 200, { code, seed, seat: 'a' }) : fail(res, 503, 'busy');
    }
    const code = String(b.code || '').toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) return fail(res, 400, 'bad_request');
    const room = await getJ(rkey(code, 'room'));
    if (!room) return fail(res, 404, 'no_room');
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
    if (op === 'state') {
      const v = (await cmd(['MGET', rkey(code, 'a'), rkey(code, 'b'), rkey(code, 'ma'), rkey(code, 'mb'), rkey(code, 'dr')])).map(parse);
      const out = { seats: { a: v[0] || undefined, b: v[1] || undefined }, moves: { a: v[2] || {}, b: v[3] || {} }, dr: v[4] || undefined };
      if (b.lvall) out.lv = await liveAll(code, out.moves);
      return send(res, 200, out);
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
      if (!Number.isInteger(n) || n < 0 || n > 400 || !pick) return fail(res, 400, 'bad_request');
      const mk = rkey(code, 'm' + seat);
      const moves = parse(await cmd(['GET', mk])) || {};
      // c: this player also runs the players on the field, t: he calls a timeout before the snap
      if (moves[n] === undefined) moves[n] = b.ctl || b.to ? Object.assign({ p: pick }, b.ctl ? { c: 1 } : {}, b.to ? { t: 1 } : {}) : pick;
      await setJ(mk, moves, TTL);
      return send(res, 200, { ok: true });
    }
    if (op === 'live') return await liveOp(res, b, code, seat);
    return fail(res, 400, 'bad_request');
  } catch (e) { return fail(res, 500, 'server'); }
};
