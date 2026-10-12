// Room storage shared by quick games, league games and tournament matches.
const { cmd, setJ, getJ, parse, randCode } = require('./_lib');
const TTL = 60 * 60 * 24;
const rkey = (code, part) => 'gd:' + code + ':' + part;
async function createRoom(seed, ctx, seats, extra) {
  for (let i = 0; i < 10; i++) {
    const code = randCode();
    const ok = await cmd(['SET', rkey(code, 'room'), JSON.stringify(Object.assign({ seed, created: Date.now(), ctx: ctx || null }, extra || {})), 'EX', TTL, 'NX']);
    if (ok === null) continue;
    for (const s of ['a', 'b']) if (seats && seats[s]) await setJ(rkey(code, s), seats[s], TTL);
    return code;
  }
  return null;
}
async function readRoom(code) {
  const room = await getJ(rkey(code, 'room')); if (!room) return null;
  const v = (await cmd(['MGET', rkey(code, 'a'), rkey(code, 'b'), rkey(code, 'ma'), rkey(code, 'mb')])).map(parse);
  const moves = {};
  [['a', v[2]], ['b', v[3]]].forEach(([s, m]) => { Object.keys(m || {}).forEach(n => { moves[n + '-' + s] = { pick: m[n] }; }); });
  return { room, seats: { a: v[0], b: v[1] }, moves };
}
module.exports = { createRoom, readRoom, rkey, TTL };
