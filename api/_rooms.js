// Room storage shared by quick games, league games and tournament matches.
const { cmd, setJ, getJ, parse, randCode } = require('./_lib');
const TTL = 60 * 60 * 24;
const RV = 1000;   // move numbers from here on belong to the return of kick number n - RV
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
function moveOf(v) { return v && typeof v === 'object' ? Object.assign({ pick: v.p }, v.c ? { ctl: 1 } : {}, v.t ? { to: 1 } : {}, v.w ? { two: 1 } : {}) : { pick: v }; }
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
    const r = lv[n];
    if (+n >= RV) {   // a kick or punt return played by the receiving player: move 1000 + n, finished stream under the same number
      ['a', 'b'].forEach(s => { if (moves[n + '-' + s] && moves[n + '-' + s].ctl && r[s] && r[s].fin) moves[(n - RV) + '-rv'] = { s, ev: r[s].ev || [] }; });
      return;
    }
    const a = moves[n + '-a'], b = moves[n + '-b'];
    const okSide = (s, mv) => !mv || !mv.ctl || (r[s] && r[s].fin);   // a side that played needs its finished stream
    if (a && b && okSide('a', a) && okSide('b', b)) moves[n + '-lv'] = { a: (r.a && r.a.ev) || [], b: (r.b && r.b.ev) || [] };
  });
  Object.keys(moves).forEach(k => { const m = /^(\d+)-[ab]$/.exec(k); if (m && +m[1] >= RV) delete moves[k]; });
  return { room, seats: { a: v[0], b: v[1] }, moves };
}
module.exports = { RV, createRoom, readRoom, liveAll, moveOf, rkey, TTL };
