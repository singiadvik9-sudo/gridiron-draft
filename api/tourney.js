// Tournaments (accounts only): single-elimination brackets with custom seeding, best-of series, CPU entrants.
const { putZ, getZ, cmd, getJ, setJ, parse, withLock, readBody, send, fail, clean, randCode, userFrom, addToUser, pushHist, uKey } = require('./_lib');
const { createRoom, readRoom, rkey } = require('./_rooms');
const E = require('../lib/engine.js');
const LG = require('../lib/league.js');
const DR = require('../lib/draft.js');
const CAPVALS = Object.values(DR.CAPS);
const key = c => 'gd:tn:' + c, skey = c => 'gd:tns:' + c;
const bad = (msg, code) => { const e = new Error(msg); e.http = code || 400; throw e; };
const num = (v, a, b, d) => { v = Math.round(+v); return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
const BO = [1, 3, 5, 7];
let BASE = null;
const base = () => BASE || (BASE = LG.newNFL({ seed: 1 }));
const CPU_NAMES = ['Rockets', 'Wolves', 'Vipers', 'Knights', 'Comets', 'Titans', 'Bandits', 'Falcons', 'Storm', 'Miners', 'Rebels', 'Sharks', 'Hawks', 'Pilots', 'Blaze', 'Ghosts'];

function cleanCfg(c, base0) {
  const o = Object.assign({}, base0 || {}); c = c || {};
  if (c.name != null) o.name = clean(c.name, 24) || 'Tournament';
  if (c.teamMode === 'draft' || c.teamMode === 'nfl') o.teamMode = c.teamMode;
  ['early', 'semi', 'final'].forEach(k => { if (c[k] != null) o[k] = BO.indexOf(+c[k]) >= 0 ? +c[k] : 1; });
  if (c.max != null) o.max = num(c.max, 2, 64, 16);
  if (c.open != null) o.open = !!c.open;
  if (c.cap != null) o.cap = CAPVALS.includes(+c.cap) ? +c.cap : 0;
  if (o.teamMode === 'draft' && o.max > 16) o.max = 16;
  return o;
}
function boList(cfg, rounds) {
  const a = [];
  for (let rd = 1; rd <= rounds; rd++) { const left = rounds - rd + 1; a.push(left === 1 ? cfg.final : left === 2 ? cfg.semi : cfg.early); }
  return a;
}
// drafting: doc.dr = { d, order:[entrant ids by team index] }; CPU entrants pick on their own
function advanceDraft(doc) {
  const dr = doc.dr; if (!dr) return;
  const d = dr.d;
  while (!DR.isDone(d)) {
    const t = DR.onClock(d), e = entOf(doc, dr.order[t]);
    if (e.kind !== 'cpu' && !e.auto) break;
    DR.apply(d, t, DR.cpuPick(d, t, E.mulberry32(E.hashStr(doc.code + ':' + d.picks.length))));
  }
  if (DR.isDone(d)) {
    dr.order.forEach((id, t) => { const e = entOf(doc, id); e.roster = DR.toRoster(DR.teamIds(d, t)); e.squad = E.squadFromRoster(e.roster); delete e.auto; });
    doc.phase = 'setup'; doc.drafted = true;
  }
}
function summary(doc) { return { code: doc.code, name: doc.cfg.name, mgr: doc.mgr, phase: doc.phase, n: doc.ent.length, mode: doc.cfg.teamMode, ver: doc.ver, champ: doc.champ != null ? (doc.ent.find(e => e.id === doc.champ) || {}).name : null }; }
async function save(doc) { doc.ver = (doc.ver || 0) + 1; await putZ(key(doc.code), doc); await setJ(skey(doc.code), summary(doc)); }
const entOf = (doc, id) => doc.ent.find(e => e.id === id);
const entFor = (doc, name) => doc.ent.find(e => e.owner === name);
const gameSeed = (doc, m, k) => E.hashStr(doc.code + ':' + m.id + ':' + k) % 2147483647;
const teamsOf = (doc, m, k) => {
  const A = entOf(doc, doc.seeds[m.a]), B = entOf(doc, doc.seeds[m.b]);
  const home = k % 2 === 0 ? A : B, away = k % 2 === 0 ? B : A;
  return { T: { a: { name: home.name, squad: home.squad }, b: { name: away.name, squad: away.squad } }, homeIsA: k % 2 === 0 };
};
function recordResult(doc, m, k, T, st, homeIsA) {
  const sa = st.score.a, sb = st.score.b;   // home / away
  let homeWin = sa > sb ? true : sa < sb ? false : homeIsA;   // a tie goes to the higher seed
  const aWin = homeIsA ? homeWin : !homeWin;
  const sA = homeIsA ? sa : sb, sB = homeIsA ? sb : sa;
  LG.reportSeries(doc.br, m.id, aWin ? 0 : 1, sA, sB);
  delete m.cur;
}
function simOne(doc, m) {
  const k = m.games.length, tf = teamsOf(doc, m, k);
  const R = E.replay(gameSeed(doc, m, k), tf.T, {}, ['a', 'b']);
  recordResult(doc, m, k, tf.T, R.state, tf.homeIsA);
}
function currentMatches(doc) { return doc.br ? doc.br.matches.filter(m => m.a != null && m.b != null && m.win == null) : []; }
function placeText(doc, entId) {
  if (doc.champ === entId) return 'Champion';
  const rounds = doc.br.rounds;
  const lost = doc.br.matches.filter(m => m.win != null && !m.bye && (doc.seeds[m.a] === entId || doc.seeds[m.b] === entId) && doc.seeds[m.win] !== entId)[0];
  if (!lost) return '';
  const left = rounds - lost.r + 1;
  return left === 1 ? 'Runner-up' : 'Lost in the ' + LG.ROUND_NAMES(left);
}
function settle(doc) {
  const push = [];
  if (doc.phase !== 'live') return push;
  for (let guard = 0; guard < 400; guard++) {
    const todo = currentMatches(doc).filter(m => entOf(doc, doc.seeds[m.a]).kind === 'cpu' && entOf(doc, doc.seeds[m.b]).kind === 'cpu');
    if (!todo.length) break;
    todo.forEach(m => simOne(doc, m));
  }
  const fin = doc.br.matches.find(m => m.r === doc.br.rounds);
  if (fin && fin.win != null) {
    doc.phase = 'done'; doc.champ = doc.seeds[fin.win];
    doc.ent.forEach(e => {
      if (e.kind !== 'human') return;
      let w = 0, l = 0;
      doc.br.matches.forEach(m => { if (m.bye) return; const ia = doc.seeds[m.a] === e.id, ib = doc.seeds[m.b] === e.id; if (ia) { w += m.w[0]; l += m.w[1]; } if (ib) { w += m.w[1]; l += m.w[0]; } });
      push.push([e.owner, { ts: Date.now(), kind: 'tourney', code: doc.code, tname: doc.cfg.name, team: e.name, place: placeText(doc, e.id), champ: doc.champ === e.id, gw: w, gl: l, of: doc.ent.length }]);
    });
  }
  return push;
}
async function mutate(code, fn) {
  let pushes = [], out;
  await withLock('tn:' + code, async () => {
    const doc = await getZ(key(code)); if (!doc) bad('no_tournament', 404);
    out = await fn(doc);
    pushes = settle(doc);
    await save(doc);
    out = out || {}; out.ver = doc.ver;
  });
  for (const [n, h] of pushes) await pushHist(n, h);
  return out;
}
function nflSquad(abbr) { const b = base(), i = b.teams.findIndex(t => t.abbr === abbr); return i < 0 ? null : { squad: LG.squadOf(b, i), name: b.teams[i].nick }; }
function fillCpu(doc) {
  const used = doc.ent.map(e => e.abbr).filter(Boolean);
  doc.ent.forEach((e, i) => {
    if (e.kind !== 'cpu' || e.squad) return;
    if (doc.cfg.teamMode === 'nfl') {
      const r = E.mulberry32(E.hashStr(doc.code + ':cpu' + e.id));
      const free = base().teams.map(t => t.abbr).filter(a => used.indexOf(a) < 0);
      const ab = free[Math.floor(r() * free.length)]; used.push(ab); const s = nflSquad(ab); e.abbr = ab; e.name = s.name; e.squad = s.squad;
    } else {
      const r = E.mulberry32(E.hashStr(doc.code + ':cpu' + e.id));
      e.roster = E.autoDraft(r); e.squad = E.squadFromRoster(e.roster);
    }
  });
}

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const b = readBody(req); if (req.method !== 'POST' || !b) return fail(res, 400, 'bad_request');
  try {
    const user = await userFrom(req); if (!user) return fail(res, 401, 'auth');
    const me = user.name, op = b.op;
    if (op === 'create') {
      const cfg = cleanCfg(b.cfg, { name: 'Tournament', teamMode: 'draft', early: 1, semi: 1, final: 1, max: 16, open: true });
      let code = null;
      for (let i = 0; i < 10 && !code; i++) { const c = randCode(); if ((await cmd(['SET', key(c), 'x', 'NX', 'EX', 60])) !== null) code = c; }
      if (!code) return fail(res, 503, 'busy');
      const doc = { code, mgr: me, cfg, ent: [], seeds: [], br: null, phase: 'setup', champ: null, nid: 0, ver: 0 };
      await save(doc); await addToUser(me, 'tn', code);
      return send(res, 200, { code });
    }
    if (op === 'mine') {
      const u = await getJ(uKey(me)); const codes = (u && u.tn) || [];
      if (!codes.length) return send(res, 200, { list: [] });
      return send(res, 200, { list: (await cmd(['MGET'].concat(codes.map(skey)))).map(parse).filter(Boolean) });
    }
    const code = String(b.code || '').toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) return fail(res, 400, 'bad_request');
    if (op === 'get') {
      const s = parse(await cmd(['GET', skey(code)])); if (!s) return fail(res, 404, 'no_tournament');
      if (b.ver && +b.ver === s.ver) return send(res, 200, { same: true, ver: s.ver });
      const doc = await getZ(key(code)); if (!doc) return fail(res, 404, 'no_tournament');
      return send(res, 200, { ver: doc.ver, T: doc });
    }
    const r = await mutate(code, async doc => {
      const mgr = doc.mgr === me, mine = entFor(doc, me), setup = doc.phase === 'setup';
      const needMgr = () => { if (!mgr) bad('manager_only', 403); };
      const needSetup = () => { if (!setup) bad('The tournament has started.'); };
      switch (op) {
        case 'join': {
          if (mine) return { ok: true };
          needSetup(); if (!doc.cfg.open && !mgr) bad('This tournament is closed.');
          if (doc.ent.length >= doc.cfg.max) bad('The tournament is full.');
          if (doc.drafted && doc.cfg.teamMode === 'draft') bad('The draft is finished, so no new players can join.');
          doc.nid++; doc.ent.push({ id: 'e' + doc.nid, kind: 'human', owner: me, name: me });
          await addToUser(me, 'tn', code); return { ok: true };
        }
        case 'cfg': { needMgr(); if (doc.phase === 'drafting') bad('The draft is in progress.'); const nc = cleanCfg(b.cfg, doc.cfg); if (!setup) { nc.teamMode = doc.cfg.teamMode; nc.max = doc.cfg.max; } if (nc.teamMode !== doc.cfg.teamMode) { doc.drafted = false; doc.ent.forEach(e => { delete e.squad; delete e.roster; delete e.abbr; if (e.kind === 'human') e.name = e.owner; }); } doc.cfg = nc; return { ok: true }; }
        case 'addcpu': {
          needMgr(); needSetup(); const n = num(b.n, 1, 63, 1);
          for (let i = 0; i < n && doc.ent.length < doc.cfg.max; i++) { doc.nid++; doc.ent.push({ id: 'e' + doc.nid, kind: 'cpu', name: CPU_NAMES[doc.nid % CPU_NAMES.length] + ' CPU ' + doc.nid }); }
          return { ok: true };
        }
        case 'rm': {
          needMgr(); needSetup(); const e = entOf(doc, String(b.id)); if (!e) bad('bad_request');
          doc.ent = doc.ent.filter(x => x !== e); doc.seeds = doc.seeds.filter(x => x !== e.id); return { ok: true };
        }
        case 'leave': {
          if (!mine) bad('bad_request'); needSetup(); if (mgr) bad('The manager cannot leave. Delete the tournament instead.');
          doc.ent = doc.ent.filter(x => x !== mine); doc.seeds = doc.seeds.filter(x => x !== mine.id);
          await withLock('user:' + me.toLowerCase(), async () => { const cu = await getJ(uKey(me)); cu.tn = (cu.tn || []).filter(x => x !== code); await setJ(uKey(me), cu); });
          return { ok: true };
        }
        case 'team': {   // draft mode: set your team name once drafted
          if (!mine) bad('Join first.'); mine.name = clean(b.name, 18) || mine.name; return { ok: true };
        }
        case 'startdraft': {
          needMgr(); needSetup(); if (doc.cfg.teamMode !== 'draft') bad('This tournament uses NFL teams.');
          if (doc.ent.length < 2) bad('You need at least 2 teams.'); if (doc.ent.length > 16) bad('Drafted tournaments hold up to 16 teams.');
          const ids = doc.ent.map(e => e.id), r = E.mulberry32(Math.floor(Math.random() * 2147483647));
          for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
          doc.ent.forEach(e => { delete e.squad; delete e.roster; delete e.auto; });
          doc.dr = { d: DR.newDraft(ids.length, doc.cfg.cap || 0, 0), order: ids }; doc.phase = 'drafting'; doc.drafted = false;
          advanceDraft(doc); return { ok: true };
        }
        case 'dpick': {
          if (doc.phase !== 'drafting' || !doc.dr) bad('There is no draft running.'); if (!mine) bad('Join first.');
          const t = doc.dr.order.indexOf(mine.id), id = clean(b.id, 8);
          if (DR.onClock(doc.dr.d) !== t) bad('turn', 409); if (DR.taken(doc.dr.d)[id]) bad('taken', 409);
          if (DR.legal(doc.dr.d, t, id)) bad('illegal', 409);
          DR.apply(doc.dr.d, t, id); advanceDraft(doc); return { ok: true };
        }
        case 'dauto': {   // manager skips whoever is on the clock, or finishes the whole draft
          needMgr(); if (doc.phase !== 'drafting' || !doc.dr) bad('There is no draft running.');
          if (b.all) doc.ent.forEach(e => { e.auto = true; });
          else { const e = entOf(doc, doc.dr.order[DR.onClock(doc.dr.d)]); if (e) { DR.apply(doc.dr.d, DR.onClock(doc.dr.d), DR.cpuPick(doc.dr.d, DR.onClock(doc.dr.d))); } }
          advanceDraft(doc); return { ok: true };
        }
        case 'myauto': {   // draft automatically for me from now on
          if (doc.phase !== 'drafting' || !mine) bad('bad_request'); mine.auto = !!b.on; advanceDraft(doc); return { ok: true };
        }
        case 'dcancel': {
          needMgr(); if (doc.phase !== 'drafting') bad('bad_request');
          doc.phase = 'setup'; doc.dr = null; doc.drafted = false; doc.ent.forEach(e => { delete e.squad; delete e.roster; delete e.auto; }); return { ok: true };
        }
        case 'pick': {   // nfl mode: choose a franchise
          needSetup(); if (!mine) bad('Join first.'); if (doc.cfg.teamMode !== 'nfl') bad('This tournament uses drafted teams.');
          const ab = clean(b.abbr, 4), s = nflSquad(ab); if (!s) bad('bad_request');
          if (doc.ent.some(e => e !== mine && e.abbr === ab)) bad('That team is taken.');
          mine.abbr = ab; mine.name = s.name; mine.squad = s.squad; return { ok: true };
        }
        case 'seeds': {   // full custom order of entrant ids
          needMgr(); needSetup();
          const o = (b.order || []).map(String), ids = doc.ent.map(e => e.id);
          if (o.length !== ids.length || ids.some(i => o.indexOf(i) < 0)) bad('bad_request');
          doc.seeds = o; return { ok: true };
        }
        case 'autoseed': {
          needMgr(); needSetup(); fillCpu(doc);
          const ids = doc.ent.map(e => e.id);
          if (b.mode === 'random') { const r = E.mulberry32(Math.floor(Math.random() * 2147483647)); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = ids[i]; ids[i] = ids[j]; ids[j] = t; } }
          else if (b.mode === 'rating') { const rt = id => { const e = entOf(doc, id); return e.squad ? E.teamUnits({ squad: e.squad }).ovrR : 0; }; ids.sort((x, y) => rt(y) - rt(x)); }
          doc.seeds = ids; return { ok: true };
        }
        case 'start': {
          needMgr(); needSetup();
          if (doc.ent.length < 2) bad('You need at least 2 teams.');
          const miss = doc.ent.filter(e => e.kind === 'human' && !e.squad);
          if (miss.length) bad(doc.cfg.teamMode === 'draft' ? 'Run the draft first.' : 'Waiting for a team from: ' + miss.map(e => e.owner).join(', '));
          fillCpu(doc);
          const ids = doc.ent.map(e => e.id);
          doc.seeds = doc.seeds.length === ids.length && ids.every(i => doc.seeds.indexOf(i) >= 0) ? doc.seeds : ids;
          const rounds = Math.log2(Math.max(2, 1 << Math.ceil(Math.log2(doc.seeds.length))));
          doc.br = LG.makeBracket(doc.seeds.length, boList(doc.cfg, rounds));
          doc.phase = 'live'; return { ok: true };
        }
        case 'delete': { needMgr(); await cmd(['DEL', key(code), skey(code)]); const e = new Error('deleted'); e.deleted = true; throw e; }
        case 'override': {
          needMgr(); if (doc.phase !== 'live') bad('bad_request');
          const m = doc.br.matches.find(x => x.id === b.mid); if (!m || m.a == null || m.b == null || m.win != null) bad('bad_request');
          LG.setSeries(doc.br, m.id, b.side === 1 ? 1 : 0); delete m.cur; return { ok: true };
        }
        case 'simmatch': {   // manager plays the next game of a match on the CPU
          needMgr(); if (doc.phase !== 'live') bad('bad_request');
          const m = doc.br.matches.find(x => x.id === b.mid); if (!m || m.a == null || m.b == null || m.win != null) bad('bad_request');
          simOne(doc, m); return { ok: true };
        }
        case 'simme': {
          if (doc.phase !== 'live' || !mine) bad('bad_request');
          const m = currentMatches(doc).find(x => x.id === b.mid); if (!m) bad('bad_request');
          const sa = entOf(doc, doc.seeds[m.a]), sb = entOf(doc, doc.seeds[m.b]);
          if ((sa !== mine && sb !== mine) || (sa.kind === 'human' && sb.kind === 'human')) bad('Only a match against a CPU can be simmed.');
          simOne(doc, m); return { ok: true };
        }
        case 'play': {
          if (doc.phase !== 'live' || !mine) bad('bad_request');
          const m = currentMatches(doc).find(x => x.id === b.mid); if (!m) bad('That match is not ready.');
          const A = entOf(doc, doc.seeds[m.a]), B = entOf(doc, doc.seeds[m.b]);
          if (A !== mine && B !== mine) bad('forbidden', 403);
          const k = m.games.length; let cur = m.cur;
          if (!cur || cur.k !== k) { const tf = teamsOf(doc, m, k); cur = m.cur = { k, T: tf.T, homeIsA: tf.homeIsA }; }
          const homeEnt = cur.homeIsA ? A : B, awayEnt = cur.homeIsA ? B : A;
          const side = homeEnt === mine ? 'a' : 'b', opp = side === 'a' ? awayEnt : homeEnt;
          const out = { seed: gameSeed(doc, m, k), T: cur.T, side, cpuSide: opp.kind === 'cpu' ? (side === 'a' ? 'b' : 'a') : null, mid: m.id, k, homeName: homeEnt.name, awayName: awayEnt.name };
          if (opp.kind === 'human') {
            let rc = cur.room;
            if (rc && !(await getJ(rkey(rc, 'room')))) rc = null;
            if (!rc) {
              rc = await createRoom(out.seed, { k: 'tourney', code, mid: m.id }, {
                a: { pid: 'u:' + homeEnt.owner, name: homeEnt.name, status: 'ready', squad: cur.T.a.squad, owner: homeEnt.owner },
                b: { pid: 'u:' + awayEnt.owner, name: awayEnt.name, status: 'ready', squad: cur.T.b.squad, owner: awayEnt.owner } });
              if (!rc) bad('busy', 503);
              cur.room = rc;
            }
            out.room = rc;
          }
          return out;
        }
        case 'report': {
          if (doc.phase !== 'live' || !mine) bad('bad_request');
          const m = currentMatches(doc).find(x => x.id === b.mid); if (!m || !m.cur) bad('Start the game first.');
          const A = entOf(doc, doc.seeds[m.a]), B = entOf(doc, doc.seeds[m.b]);
          if (A !== mine && B !== mine) bad('forbidden', 403);
          const cur = m.cur, homeEnt = cur.homeIsA ? A : B, awayEnt = cur.homeIsA ? B : A;
          let R;
          if (homeEnt.kind === 'human' && awayEnt.kind === 'human') {
            if (!cur.room) bad('No room for this game.');
            const rm = await readRoom(cur.room); if (!rm) bad('The room expired.');
            R = E.replay(gameSeed(doc, m, cur.k), cur.T, rm.moves, []);
          } else {
            const side = homeEnt === mine ? 'a' : 'b', mv = E.cleanMoves(b.moves, side);
            R = E.replay(gameSeed(doc, m, cur.k), cur.T, mv, [side === 'a' ? 'b' : 'a']);
          }
          if (!R.state.over) bad('That game did not finish.');
          recordResult(doc, m, cur.k, cur.T, R.state, cur.homeIsA);
          return { ok: true };
        }
        default: bad('bad_request');
      }
    });
    return send(res, 200, r);
  } catch (e) {
    if (e && e.deleted) return send(res, 200, { ok: true, deleted: true });
    if (e && e.http) return fail(res, e.http, e.message);
    if (e && e.code === 'busy') return fail(res, 503, 'busy');
    console.error(e); return fail(res, 500, 'server');
  }
};
