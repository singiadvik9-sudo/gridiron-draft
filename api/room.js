// Quick-game rooms (guests or accounts) and the live rooms used by league games and tournament matches.
const { cmd, getJ, setJ, parse, readBody, send, fail, clean, randCode, userFrom, withLock } = require('./_lib');
const { createRoom, rkey, TTL } = require('./_rooms');
const E = require('../lib/engine.js');
const DR = require('../lib/draft.js');
const CAPVALS = Object.values(DR.CAPS);

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
      return send(res, 200, { seats: { a: v[0] || undefined, b: v[1] || undefined }, moves: { a: v[2] || {}, b: v[3] || {} }, dr: v[4] || undefined });
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
      if (moves[n] === undefined) moves[n] = pick;
      await setJ(mk, moves, TTL);
      return send(res, 200, { ok: true });
    }
    return fail(res, 400, 'bad_request');
  } catch (e) { return fail(res, 500, 'server'); }
};
