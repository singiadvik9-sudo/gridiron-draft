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
// move records: "PICK" or { p: pick, c: 1 } (the player also controls the players on the field)
function moveOf(v) { return v && typeof v === 'object' ? (v.c ? { pick: v.p, ctl: 1 } : { pick: v.p }) : { pick: v }; }
// finished live plays among the given move records: { n: { a: rec, b: rec } }
async function liveAll(code, mv) {
  const ns = {};
  ['a', 'b'].forEach(s => Object.keys(mv[s] || {}).forEach(n => { const v = mv[s][n]; if (v && typeof v === 'object' && v.c) ns[n] = 1; }));
  const list = Object.keys(ns).slice(0, 200);
  if (!list.length) return {};
  const keys = []; list.forEach(n => { keys.push(rkey(code, 'lv:' + n + ':a'), rkey(code, 'lv:' + n + ':b')); });
  const vals = (await cmd(['MGET'].concat(keys))).map(parse), out = {};
  list.forEach((n, i) => { out[n] = { a: vals[i * 2] || null, b: vals[i * 2 + 1] || null }; });
  return out;
}
async function readRoom(code) {
  const room = await getJ(rkey(code, 'room')); if (!room) return null;
  const v = (await cmd(['MGET', rkey(code, 'a'), rkey(code, 'b'), rkey(code, 'ma'), rkey(code, 'mb')])).map(parse);
  const moves = {};
  [['a', v[2]], ['b', v[3]]].forEach(([s, m]) => { Object.keys(m || {}).forEach(n => { moves[n + '-' + s] = moveOf(m[n]); }); });
  const lv = await liveAll(code, { a: v[2], b: v[3] });
  Object.keys(lv).forEach(n => {
    const a = moves[n + '-a'], b = moves[n + '-b'], r = lv[n];
    const okSide = (s, mv) => !mv || !mv.ctl || (r[s] && r[s].fin);   // a side that played needs its finished stream
    if (a && b && okSide('a', a) && okSide('b', b)) moves[n + '-lv'] = { a: (r.a && r.a.ev) || [], b: (r.b && r.b.ev) || [] };
  });
  return { room, seats: { a: v[0], b: v[1] }, moves };
}
module.exports = { createRoom, readRoom, liveAll, moveOf, rkey, TTL };
