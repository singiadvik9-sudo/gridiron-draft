/* Squad quick games: up to ten people in one room, five a side. The host puts everyone on a team and a position (QB, HB, WR1, WR2, TE);
   each person picks the defender he plays (LDE ... SS). Each team's quarterback calls its plays, on offense and on defense (he holds the
   team's seat for moves); everyone runs his own player in the live snap, with his own input stream (lv:<play>:<team><key>). A team with
   nobody on it is the computer. Players see each other by a short id, never by the pid that stands in for a guest's login.
   lob = { host: pid, names: { a, b }, ps: [{ id, pid, name, team, pos, ds, ready }], started } */
const { cmd, getJ, setJ, parse, withLock, send, fail, clean } = require('./_lib');
const { rkey, TTL, createRoom, readRoom } = require('./_rooms');
const DR = require('../lib/draft.js');
const POS = ['QB', 'HB', 'WR1', 'WR2', 'TE'], SPOTS = ['LDE', 'RDE', 'LDT', 'RDT', 'MLB', 'WLB', 'SLB', 'LCB', 'RCB', 'FS', 'SS'], MAX = 10;
const newId = () => Math.random().toString(36).slice(2, 5).replace(/[^a-z0-9]/g, 'x').padEnd(3, 'x');
const lobKey = code => rkey(code, 'lob');
// anyone on a team without a defender gets one nobody on his team has (the middle and the back end first)
const DS_ORDER = ['MLB', 'LCB', 'RCB', 'FS', 'SS', 'WLB', 'SLB', 'LDE', 'RDE', 'LDT', 'RDT'];
function autoDs(lob) { lob.ps.forEach(p => { if (!p.team || p.ds) return; const k = DS_ORDER.find(d => !lob.ps.some(q => q.team === p.team && q.ds === d)); if (k) p.ds = k; }); }
// what everyone may see: no pids
function pub(lob, pid) {
  return { host: (lob.ps.find(p => p.pid === lob.host) || {}).id, names: lob.names, started: lob.started || 0,
    ps: lob.ps.map(p => ({ id: p.id, name: p.name, team: p.team, pos: p.pos, ds: p.ds, ready: p.ready ? 1 : 0, me: p.pid === pid ? 1 : undefined })) };
}
const memberOf = (lob, pid) => lob && lob.ps.find(p => p.pid === pid);
// the stream a person may write in a play: his team, and his position (offense) or his defender (defense)
function slotOk(lob, pid, slot) { const p = memberOf(lob, pid); return !!p && p.team === slot[0] && (p.pos === slot.slice(1) || p.ds === slot.slice(1)); }
async function create(code, pid, name) {
  const lob = { host: pid, names: { a: 'Home', b: 'Away' }, ps: [{ id: newId(), pid, name, team: 'a', pos: 'QB', ds: 'MLB', ready: 1 }], started: 0 };
  await setJ(lobKey(code), lob, TTL);
  return lob;
}
async function mutate(code, fn) { return withLock('lob:' + code, async () => { const lob = await getJ(lobKey(code)); if (!lob) return { err: [404, 'no_room'] }; const r = await fn(lob); if (!r || !r.err) await setJ(lobKey(code), lob, TTL); return r || {}; }); }
// the ops; returns true when it answered
async function op(res, b, code, room, pid, name) {
  const o = b.op;
  if (o === 'join') {
    const r = await mutate(code, lob => {
      if (memberOf(lob, pid)) return {};
      if (lob.started) return { watch: 1 };   // (a game under way: watch it)
      if (lob.ps.length >= MAX) return { err: [409, 'full'] };
      let id = newId(); while (lob.ps.some(p => p.id === id)) id = newId();
      lob.ps.push({ id, pid, name: clean(name, 18) || 'Player', team: null, pos: null, ds: null, ready: 0 });
    });
    if (r.err) { fail(res, r.err[0], r.err[1]); return true; }
    const lob = await getJ(lobKey(code)), me = memberOf(lob, pid);
    send(res, 200, { seed: room.seed, seat: lob.started && me && me.team && me.pos === 'QB' ? me.team : null, squad: 1, lob: pub(lob, pid) }); return true;
  }
  if (o === 'lob') { const lob = await getJ(lobKey(code)); if (!lob) { fail(res, 404, 'no_room'); return true; } send(res, 200, { lob: pub(lob, pid) }); return true; }
  if (['assign', 'ds', 'ready', 'kick', 'names', 'start'].indexOf(o) < 0) return false;
  const r = await mutate(code, async lob => {
    const me = memberOf(lob, pid), host = lob.host === pid;
    if (!me) return { err: [403, 'forbidden'] };
    const who = id => lob.ps.find(p => p.id === id);
    const clash = (p, team, k, field) => lob.ps.some(q => q !== p && q.team === team && q[field] === k);
    if (o === 'assign') {   // the host moves people around (between plays too)
      if (!host) return { err: [403, 'host_only'] };
      const p = who(b.id); if (!p) return { err: [404, 'no_player'] };
      const team = b.team === 'a' || b.team === 'b' ? b.team : null, pos = team && POS.indexOf(b.pos) >= 0 ? b.pos : null;
      if (pos && clash(p, team, pos, 'pos')) { const q = lob.ps.find(x => x !== p && x.team === team && x.pos === pos); q.pos = p.team === team ? p.pos : null; }   // (swap with whoever had it)
      if (p.team !== team) p.ds = null;
      p.team = team; p.pos = pos; if (!team) p.ready = p === me ? p.ready : 0;
      autoDs(lob);
      if (lob.started) await seatQBs(code, lob, room);
      return {};
    }
    if (o === 'ds') {   // the defender you play
      const p = b.id && host ? who(b.id) : me; if (!p) return { err: [404, 'no_player'] };
      const ds = SPOTS.indexOf(b.ds) >= 0 ? b.ds : null;
      if (ds && clash(p, p.team, ds, 'ds')) return { err: [409, 'taken'] };
      p.ds = ds; return {};
    }
    if (o === 'ready') { me.ready = b.on ? 1 : 0; return {}; }
    if (o === 'kick') {
      if (!host) return { err: [403, 'host_only'] };
      const p = who(b.id); if (!p || p === me) return { err: [400, 'bad_request'] };
      lob.ps = lob.ps.filter(x => x !== p); if (lob.started) await seatQBs(code, lob, room); return {};
    }
    if (o === 'names') { if (!host) return { err: [403, 'host_only'] }; ['a', 'b'].forEach(t => { const v = clean(b.names && b.names[t], 18); if (v) lob.names[t] = v; }); return {}; }
    if (o === 'start') {
      if (!host) return { err: [403, 'host_only'] };
      if (lob.started) return {};
      const on = lob.ps.filter(p => p.team);
      if (!on.length) return { err: [409, 'Put at least one player on a team.'] };
      for (const t of ['a', 'b']) { const ps = on.filter(p => p.team === t); if (ps.length && !ps.some(p => p.pos === 'QB')) return { err: [409, (lob.names[t] || t) + ' need a quarterback: he calls the plays.'] }; }
      const unready = on.filter(p => !p.ready && p.pid !== lob.host);
      if (unready.length) return { err: [409, 'Waiting for ' + unready.map(p => p.name).join(', ') + ' to get ready.'] };
      // both rosters drafted for them, the snake draft the computer would make
      const d = DR.newDraft(2, room.cap || 0, room.seed % 2); DR.autoRun(d);
      await setJ(rkey(code, 'dr'), d, TTL);
      lob.started = Date.now();
      await seatQBs(code, lob, room, d);
      return {};
    }
  });
  if (r.err) { fail(res, r.err[0], r.err[1]); return true; }
  const lob = await getJ(lobKey(code)); send(res, 200, { lob: pub(lob, pid) }); return true;
}
// each team's seat: its quarterback's (he calls the plays), or the computer's
async function seatQBs(code, lob, room, d) {
  d = d || parse(await cmd(['GET', rkey(code, 'dr')]));
  for (const [t, i] of [['a', 0], ['b', 1]]) {
    const qb = lob.ps.find(p => p.team === t && p.pos === 'QB'), cur = parse(await cmd(['GET', rkey(code, t)]));
    const team = cur && cur.squad ? { squad: cur.squad, c1: cur.c1, c2: cur.c2 } : { roster: cur && cur.roster ? cur.roster : DR.toRoster(DR.teamIds(d, i)) };   // (a campaign's teams come with their squads)
    await setJ(rkey(code, t), Object.assign({ pid: qb ? qb.pid : 'cpu:' + t, name: lob.names[t], status: 'ready', cpu: lob.ps.some(p => p.team === t) ? 0 : 1 }, team), TTL);
  }
}
// a person's input stream in a live snap; returns everyone else's in that snap that he asked for (b.want: their slots)
async function live(res, b, code, pid) {
  const n = b.n, slot = typeof b.seat === 'string' && /^[ab][A-Z0-9]{1,4}$/.test(b.seat) ? b.seat : null;
  if (!Number.isInteger(n) || n < 0 || n > 400) return fail(res, 400, 'bad_request');
  const want = (Array.isArray(b.want) ? b.want : []).filter(s => typeof s === 'string' && /^[ab][A-Z0-9]{1,4}$/.test(s) && s !== slot).slice(0, 10);
  const E = require('../lib/engine.js');
  if (slot && !b.poll) {
    const lob = await getJ(lobKey(code)); if (!slotOk(lob, pid, slot)) return fail(res, 403, 'forbidden');
    const ev = E.cleanTrace(b.ev), upto = Number.isInteger(b.upto) ? Math.max(0, Math.min(99999, b.upto)) : 0; if (!ev) return fail(res, 400, 'bad_request');
    const k = rkey(code, 'lv:' + n + ':' + slot), mine = parse(await cmd(['GET', k]));
    if (!mine || upto > mine.upto || (b.fin && !mine.fin) || ev.length > mine.ev.length) {
      const prev = mine ? mine.ev : []; for (let i = 0; i < prev.length; i++) if (ev[i] !== prev[i]) return fail(res, 409, 'diverged');
      await setJ(k, { ev, upto: Math.max(upto, mine ? mine.upto : 0), fin: !!(b.fin || (mine && mine.fin)), t: Date.now() }, TTL);
    }
  }
  const vals = want.length ? (await cmd(['MGET'].concat(want.map(s => rkey(code, 'lv:' + n + ':' + s))))).map(parse) : [];
  const others = {}; want.forEach((s, i) => { others[s] = vals[i] || null; });
  return send(res, 200, { others });
}
// a person who left mid-snap: everyone else may hand his player to the computer once he has been quiet a while
async function force(res, b, code, pid) {
  const n = b.n, slot = typeof b.slot === 'string' && /^[ab][A-Z0-9]{1,4}$/.test(b.slot) ? b.slot : null;
  const lob = await getJ(lobKey(code)); if (!memberOf(lob, pid) || !slot || !Number.isInteger(n)) return fail(res, 403, 'forbidden');
  const k = rkey(code, 'lv:' + n + ':' + slot), o = parse(await cmd(['GET', k])) || { ev: [], upto: 0, fin: false, t: 0 };
  if (o.fin) return send(res, 200, { o });
  if (o.t && Date.now() - o.t < 5000) return fail(res, 409, 'alive');
  const mk = o.ev.length ? Math.floor(o.ev[o.ev.length - 1] / 100) : 0, tick = Math.max(o.upto || 0, mk) + 1;
  const nr = { ev: o.ev.concat([tick * 100 + 49]), upto: 99999, fin: true, t: Date.now(), f: 1 }; await setJ(k, nr, TTL);
  return send(res, 200, { o: nr });
}
// finished squad snaps for the room poll: { n: { a: { key: rec }, b: { key: rec } } } from each side's move (h: its people's keys)
async function liveAll(code, mv) {
  const keys = [], at = [];
  ['a', 'b'].forEach(s => Object.keys(mv[s] || {}).forEach(n => { const v = mv[s][n]; if (v && typeof v === 'object' && v.c && Array.isArray(v.h)) v.h.forEach(k => { keys.push(rkey(code, 'lv:' + n + ':' + s + k)); at.push([n, s, k]); }); }));
  if (!keys.length) return {};
  const vals = (await cmd(['MGET'].concat(keys.slice(0, 600)))).map(parse), out = {};
  at.slice(0, 600).forEach(([n, s, k], i) => { const o = out[n] = out[n] || { a: {}, b: {} }; o[s][k] = vals[i] || null; });
  return out;
}
/* a shared campaign's game, played together: a squad room with the campaign's two teams (home a, away b), the co-managers on their team
   (whoever asked plays quarterback, the others the receivers and backs, everyone a defender), the other team the computer; already started */
async function campRoom(seed, T, side, names) {
  const code = await createRoom(seed, null, {}, { squad: 1, cap: 0, camp: 1 }); if (!code) return null;
  const order = ['QB', 'WR1', 'WR2', 'TE', 'HB'];
  const lob = { host: 'u:' + names[0], names: { a: T.a.name, b: T.b.name }, ps: names.slice(0, 5).map((n, i) => ({ id: newId() + i, pid: 'u:' + n, name: n, team: side, pos: order[i], ds: null, ready: 1 })), started: Date.now() };
  autoDs(lob); await setJ(lobKey(code), lob, TTL);
  for (const t of ['a', 'b']) await setJ(rkey(code, t), { pid: t === side ? 'u:' + names[0] : 'cpu:' + t, name: T[t].name, status: 'ready', squad: T[t].squad, c1: T[t].c1, c2: T[t].c2, cpu: t === side ? 0 : 1 }, TTL);
  return code;
}
// every move made in a squad room, as the engine plays them back (each person's stream in the live snaps; kick returns as usual)
async function roomMoves(code) {
  const rr = await readRoom(code); if (!rr) return null;
  const mv = rr.moves, [ma, mb] = (await cmd(['MGET', rkey(code, 'ma'), rkey(code, 'mb')])).map(parse), lv = await liveAll(code, { a: ma, b: mb });
  Object.keys(lv).forEach(n => {
    const want = []; [['a', ma], ['b', mb]].forEach(([s, m]) => { const v = m && m[n]; if (v && v.c && Array.isArray(v.h)) v.h.forEach(k => want.push([s, k])); });
    if (want.length && want.every(([s, k]) => lv[n][s][k] && lv[n][s][k].fin)) { const o = { a: {}, b: {} }; want.forEach(([s, k]) => { o[s][k] = lv[n][s][k].ev || []; }); mv[n + '-lv'] = o; }
    else delete mv[n + '-lv'];
  });
  return { room: rr.room, moves: mv };
}
module.exports = { create, op, live, force, liveAll, pub, memberOf, slotOk, campRoom, roomMoves, POS, SPOTS, MAX };
