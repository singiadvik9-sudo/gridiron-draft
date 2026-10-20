// Shared custom leagues (accounts only). One gzipped document per league; every change goes through withLock.
const { putZ, getZ, cmd, getJ, setJ, parse, withLock, readBody, send, fail, clean, randCode, userFrom, addToUser, pushHist, uKey } = require('./_lib');
const { createRoom, readRoom, rkey } = require('./_rooms');
const E = require('../lib/engine.js');
const LG = require('../lib/league.js');
const key = c => 'gd:lg:' + c, skey = c => 'gd:lgs:' + c;
const bad = (msg, code) => { const e = new Error(msg); e.http = code || 400; throw e; };
const num = (v, a, b, d) => { v = Math.round(+v); return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };

function cleanCfg(c, base) {
  const o = Object.assign({}, base || {}); c = c || {};
  if (c.name != null) o.name = clean(c.name, 24) || 'My League';
  if (c.entry === 'nfl' || c.entry === 'draft') o.entry = c.entry;
  ['divisions', 'cpus', 'trades', 'autoTrim'].forEach(k => { if (c[k] != null) o[k] = !!c[k]; });
  if (c.nDivs != null) o.nDivs = num(c.nDivs, 2, 8, 2);
  if (c.games != null) o.games = num(c.games, 1, 31, 8);
  if (c.playoffs != null) o.playoffs = num(c.playoffs, 0, 16, 4);
  // rounds: unit drafts (every league made from now on; base.units) need far fewer than the older player-by-player drafts
  const units = base ? !!base.units : true;
  if (c.rounds != null) o.rounds = units ? num(c.rounds, LG.UNIT_ROUNDS[0], LG.UNIT_ROUNDS[1], 16) : num(c.rounds, 25, 34, 28);
  if (c.rookieRounds != null) o.rookieRounds = num(c.rookieRounds, 1, 7, 3);
  if (c.cap != null) o.cap = [0, 200, 230, 260, 285, 315, 350, 270, 300, 335].includes(+c.cap) ? +c.cap : 0;   // 200/230/260 with real salaries; the older caps are kept for older leagues
  if (c.deadline != null) o.deadline = num(c.deadline, 0, 20, 10);
  return o;
}
const myTeam = (L, name) => L.teams.find(t => t.owner === name);
function summary(doc) {
  const L = doc.L;
  return { code: doc.code, name: L.cfg.name, mgr: doc.mgr, phase: L.phase, season: L.season, week: L.week, teams: L.teams.length, humans: L.teams.filter(t => t.owner).length, members: doc.members.length, ver: doc.ver, updated: Date.now() };
}
async function save(doc) { doc.ver = (doc.ver || 0) + 1; await putZ(key(doc.code), doc); await setJ(skey(doc.code), summary(doc)); }

function histEntry(doc, name) {
  const L = doc.L, t = myTeam(L, name); if (!t) return null;
  const rec = LG.ownerRecord(L, name), R = LG.overallRank(L), rk = R.findIndex(r => r.id === t.id) + 1;
  const lines = [];
  Object.keys(L.stats).forEach(id => {
    const p = L.players[id]; if (!p || p.t !== t.id) return;
    const s = L.stats[id], tot = (s.pyd || 0) + (s.ryd || 0) + (s.recyd || 0) + (s.sk || 0) * 20 + (s.dint || 0) * 20;
    lines.push({ n: p.n, p: p.p, s, tot });
  });
  lines.sort((a, b) => b.tot - a.tot);
  const last = L.hist[L.hist.length - 1];
  const aw = [];
  if (last && last.season === L.season && last.awards) {
    last.awards.players.forEach(x => { if (x.t === t.id) aw.push(x.label + ': ' + x.n); });
    last.awards.teams.forEach(x => { if (x.t === t.id) aw.push(x.label); });
  }
  return { ts: Date.now(), kind: 'league', code: doc.code, lname: L.cfg.name, season: L.season, team: t.name, w: rec.w, l: rec.l, t: rec.t, pf: rec.pf, pa: rec.pa, rank: rk, of: L.teams.length, champ: !!(last && last.season === L.season && last.champ === t.id), awards: aw, lines: lines.slice(0, 8).map(x => ({ n: x.n, p: x.p, s: x.s })) };
}
// advance everything that does not need a human; returns history entries to write after saving
function settle(doc) {
  const L = doc.L, push = [];
  if (L.teams.length) LG.ensurePicks(L);
  if (L.phase === 'draft' && L.draft) { LG.autoDraftToHuman(L); if (L.phase !== 'draft') LG.finalizeLeagueDraft(L); }
  if (L.phase === 'preseason' && !L.sched.length) LG.finalizeLeagueDraft(L);
  if (L.phase === 'regular' || L.phase === 'playoffs') { LG.runUntilHuman(L, 60); LG.checkFinal(L); }
  if (L.phase === 'offseason' && L.histPushed !== L.season) {
    L.histPushed = L.season;
    L.teams.forEach(t => { if (t.owner) { const h = histEntry(doc, t.owner); if (h) push.push([t.owner, h]); } });
  }
  return push;
}
async function mutate(code, fn) {
  let pushes = [], out;
  await withLock('lg:' + code, async () => {
    const doc = await getZ(key(code)); if (!doc) bad('no_league', 404);
    out = await fn(doc);
    pushes = settle(doc);
    await save(doc);
    out = out || {}; out.ver = doc.ver;
  });
  for (const [n, h] of pushes) await pushHist(n, h);
  return out;
}
const isMgr = (doc, name) => doc.mgr === name;

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const b = readBody(req); if (req.method !== 'POST' || !b) return fail(res, 400, 'bad_request');
  try {
    const user = await userFrom(req); if (!user) return fail(res, 401, 'auth');
    const me = user.name, op = b.op;
    if (op === 'create') {
      const cfg = cleanCfg(b.cfg), L = LG.newCustom(cfg, me);
      L.cfg = cleanCfg(cfg, L.cfg);
      let code = null;
      for (let i = 0; i < 10 && !code; i++) { const c = randCode(); if ((await cmd(['SET', key(c), 'x', 'NX', 'EX', 60])) !== null) code = c; }
      if (!code) return fail(res, 503, 'busy');
      const doc = { code, mgr: me, members: [me], L, ver: 0 };
      await save(doc); await addToUser(me, 'lg', code);
      return send(res, 200, { code });
    }
    if (op === 'mine') {
      const fresh = await getJ(uKey(me)); const codes = (fresh && fresh.lg) || [];
      if (!codes.length) return send(res, 200, { leagues: [] });
      const v = (await cmd(['MGET'].concat(codes.map(skey)))).map(parse);
      const list = v.filter(Boolean);
      return send(res, 200, { leagues: list });
    }
    const code = String(b.code || '').toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) return fail(res, 400, 'bad_request');

    if (op === 'get') {
      const s = parse(await cmd(['GET', skey(code)]));
      if (!s) return fail(res, 404, 'no_league');
      if (b.ver && +b.ver === s.ver) return send(res, 200, { same: true, ver: s.ver });
      const doc = await getZ(key(code)); if (!doc) return fail(res, 404, 'no_league');
      return send(res, 200, { ver: doc.ver, mgr: doc.mgr, members: doc.members, L: doc.L, member: doc.members.indexOf(me) >= 0 });
    }
    if (op === 'cpuoffers') {
      const doc = await getZ(key(code)); if (!doc) return fail(res, 404, 'no_league');
      const t = myTeam(doc.L, me); if (!t || !LG.canTrade(doc.L)) return send(res, 200, { offers: [] });
      return send(res, 200, { offers: LG.cpuOffers(doc.L, t.id, LG.POS.indexOf(b.pos) >= 0 ? b.pos : null) });
    }
    if (op === 'blockbids') {
      const doc = await getZ(key(code)); if (!doc) return fail(res, 404, 'no_league');
      const t = myTeam(doc.L, me); if (!t || !LG.canTrade(doc.L)) return send(res, 200, { bids: [] });
      return send(res, 200, { bids: LG.blockBids(doc.L, t.id) });
    }

    const r = await mutate(code, async doc => {
      const L = doc.L, c = L.cfg, mgr = isMgr(doc, me), t = myTeam(L, me);
      const member = doc.members.indexOf(me) >= 0;
      if (op === 'join') {
        if (!member) { if (doc.members.length >= 40) bad('full'); doc.members.push(me); await addToUser(me, 'lg', code); }
        return { ok: true };
      }
      if (!member) bad('not_member', 403);
      const needMgr = () => { if (!mgr) bad('manager_only', 403); };
      switch (op) {
        case 'leave': {
          if (mgr) bad('The manager cannot leave. Delete the league instead.');
          if (t) { const h = L.phase !== 'setup' ? histEntry(doc, me) : null; if (h) { h.partial = true; doc._h = h; } if (L.phase === 'setup' && t.mk) LG.removeTeam(L, t.id); else t.owner = null; }
          doc.members = doc.members.filter(x => x !== me);
          const u = await getJ(uKey(me)); if (u) { await withLock('user:' + me.toLowerCase(), async () => { const cu = await getJ(uKey(me)); cu.lg = (cu.lg || []).filter(x => x !== code); if (doc._h) { cu.hist = cu.hist || []; cu.hist.unshift(doc._h); } await setJ(uKey(me), cu); }); }
          delete doc._h;
          return { ok: true, left: true };
        }
        case 'kick': {
          needMgr(); const n = String(b.name); if (n === me || doc.members.indexOf(n) < 0) bad('bad_request');
          const kt = myTeam(L, n); if (kt) { if (L.phase === 'setup' && kt.mk) LG.removeTeam(L, kt.id); else kt.owner = null; }
          doc.members = doc.members.filter(x => x !== n);
          return { ok: true };
        }
        case 'cfg': {
          needMgr();
          const nc = cleanCfg(b.cfg, c);
          if (L.phase !== 'setup') { ['entry', 'divisions', 'nDivs', 'rounds'].forEach(k => { nc[k] = c[k]; }); }
          if (nc.entry !== c.entry && L.teams.length) bad('Remove all teams before switching between NFL teams and a player draft.');
          L.cfg = nc; return { ok: true };
        }
        case 'claim': {
          if (t && L.phase !== 'setup') bad('You already have a team.');
          if (L.phase !== 'setup' && L.phase !== 'regular') bad('Wait for the current phase to finish.');
          if (t) { if (t.mk) LG.removeTeam(L, t.id); else t.owner = null; }
          const tid = b.tid != null ? +b.tid : -1;
          if (tid >= 0) {
            const x = L.teams[tid]; if (!x || x.owner) bad('That team is taken.');
            x.owner = me; if (b.name && c.entry === 'draft' && L.phase === 'setup') x.nick = x.name = clean(b.name, 18) || x.name;
            return { ok: true, tid };
          }
          if (L.phase !== 'setup') bad('Pick an open team.');
          const rr = LG.addTeam(L, { abbr: clean(b.abbr, 4), name: clean(b.name, 18) || me, owner: me });
          if (rr.err) bad(rr.err);
          rr.team.mk = true; if (c.entry === 'draft') { rr.team.name = rr.team.nick = clean(b.name, 18) || (me + "'s Club"); }
          return { ok: true, tid: rr.team.id };
        }
        case 'unclaim': {
          if (!t) bad('You have no team.'); if (L.phase !== 'setup') bad('The league has started.');
          if (t.mk) LG.removeTeam(L, t.id); else t.owner = null; return { ok: true };
        }
        case 'rename': {
          if (!t) bad('You have no team.'); if (c.entry !== 'draft' && L.phase !== 'setup') bad('NFL team names are fixed.');
          if (c.entry === 'draft') { const nm = clean(b.name, 18); if (nm) { t.name = t.nick = nm; } }
          return { ok: true };
        }
        case 'addcpu': {
          needMgr(); if (!c.cpus) bad('CPU teams are turned off.');
          const n = num(b.n, 1, 32, 1); let made = 0;
          for (let i = 0; i < n; i++) { const rr = LG.addTeam(L, { abbr: b.abbr ? clean(b.abbr, 4) : undefined }); if (rr.err) { if (!made) bad(rr.err); break; } made++; }
          return { ok: true, made };
        }
        case 'rmteam': {
          needMgr(); const x = L.teams[+b.tid]; if (!x) bad('bad_request');
          if (x.owner) { doc.members = doc.members; }
          const e = LG.removeTeam(L, x.id); if (e) bad(e);
          return { ok: true };
        }
        case 'assign': {
          needMgr(); if (L.phase !== 'setup') bad('The league has started.');
          const x = L.teams[+b.tid]; if (!x) bad('bad_request');
          const d = String(b.div || ''); if (!/^D[1-8]$/.test(d)) bad('bad_request');
          x.div = d; return { ok: true };
        }
        case 'order': {
          needMgr(); if (L.phase !== 'setup') bad('The league has started.');
          const o = (b.order || []).map(Number), ids = L.teams.map(x => x.id);
          if (o.length !== ids.length || ids.some(i => o.indexOf(i) < 0)) bad('bad_request');
          L.draftOrder = o; return { ok: true };
        }
        case 'start': {
          needMgr(); if (L.phase !== 'setup') bad('Already started.');
          if (!c.cpus) { L.teams.filter(x => !x.owner).map(x => x.id).reverse().forEach(id => LG.removeTeam(L, id)); L.draftOrder = null; }
          if (L.draftOrder && L.draftOrder.length !== L.teams.length) L.draftOrder = null;
          const e = LG.startCustom(L); if (e) bad(e);
          return { ok: true };
        }
        case 'simweek': { needMgr(); if (L.phase !== 'regular' && L.phase !== 'playoffs') bad('Nothing to sim.'); LG.simWeek(L, false); LG.advanceWeek(L); return { ok: true }; }
        case 'forfeit': {   // manager only: the named team loses the game (a no-show, or a game nobody can finish)
          needMgr(); if (L.phase !== 'regular' && L.phase !== 'playoffs') bad('No games are being played right now.');
          const g = L.sched.find(x => x.id === b.gid); if (!g || g.done || g.w !== L.week) bad('That game is not available.');
          const e = LG.forfeit(L, g, +b.loser); if (e) bad(e);
          LG.advanceWeek(L); return { ok: true };
        }
        case 'offseason': {
          needMgr(); if (L.phase !== 'offseason') bad('The season is not over yet.');
          LG.offseasonBegin(L, c.rookieRounds || 3); if (L.draft) L.draft.auto = L.draft.auto || {};
          return { ok: true };
        }
        case 'season': {
          needMgr(); if (L.phase !== 'preseason') bad('Finish the draft first.');
          LG.startSeason(L); return { ok: true };
        }
        case 'delete': {
          needMgr(); await cmd(['DEL', key(code), skey(code)]);
          const err = new Error('deleted'); err.http = 200; err.deleted = true; throw err;
        }
        case 'draft': {
          if (L.phase !== 'draft' || !t) bad('Not drafting.');
          if (!LG.draftPick(L, t.id, String(b.pid))) bad('That pick is not allowed right now.');
          return { ok: true };
        }
        case 'draftauto': {
          if (L.phase !== 'draft' || !L.draft) bad('Not drafting.');
          L.draft.auto = L.draft.auto || {};
          if (b.all) { needMgr(); L.draft.auto.all = !!b.on; }
          else if (b.tid != null && mgr) L.draft.auto[+b.tid] = !!b.on;
          else if (t) L.draft.auto[t.id] = !!b.on;
          return { ok: true };
        }
        case 'draftskip': {   // manager makes the pick for whoever is on the clock
          needMgr(); if (L.phase !== 'draft') bad('Not drafting.');
          const tid = LG.onClock(L); if (tid == null) bad('bad_request');
          if (L.draft.units) { const pid = LG.autoPickFor(L, tid); if (pid == null || !LG.draftPick(L, tid, pid)) { L.draft.pos++; LG.autoDraftToHuman(L); } return { ok: true }; }
          const pool = L.draft.kind === 'league' ? L.draft.pool.filter(id => LG.affordable(L, tid, L.players[id]) && LG.canDraftPos(L, tid, L.players[id].p)) : L.draft.pool;
          LG.draftPick(L, tid, LG.cpuPickFor(L, tid, pool.length ? pool : L.draft.pool)); return { ok: true };
        }
        case 'trade': {
          if (!t) bad('You have no team.'); if (!LG.canTrade(L)) bad('Trading is closed right now.');
          const to = L.teams[+b.to]; if (!to || to.id === t.id) bad('bad_request');
          const give = (b.give || []).map(String), get = (b.get || []).map(String);
          if (give.length > 8 || get.length > 8) bad('At most 8 players and picks each way.');
          const why = LG.tradeCheck(L, t.id, to.id, give, get); if (why) return { ok: false, msg: why };
          if (to.owner) {
            L.offers = L.offers || [];
            if (L.offers.filter(o => o.from === t.id).length >= 5) bad('You have too many open offers.');
            L.nid++; L.offers.push({ id: 'o' + L.nid, from: t.id, to: to.id, give, get, s: L.season });
            return { ok: true, pending: true, msg: 'Offer sent to ' + to.owner + '.' };
          }
          const rr = LG.cpuTrade(L, t.id, to.id, give, get);
          if (rr.ok) LG.doTrade(L, t.id, to.id, give, get);
          return { ok: rr.ok, msg: rr.msg };
        }
        case 'tradeop': {
          L.offers = L.offers || []; const o = L.offers.find(x => x.id === b.id); if (!o) bad('That offer is gone.');
          const from = L.teams[o.from], to = L.teams[o.to];
          if (b.act === 'cancel') { if (!t || t.id !== o.from) bad('forbidden', 403); L.offers = L.offers.filter(x => x !== o); return { ok: true }; }
          if (!t || t.id !== o.to) bad('forbidden', 403);
          if (b.act === 'decline') { L.offers = L.offers.filter(x => x !== o); return { ok: true }; }
          if (b.act !== 'accept') bad('bad_request');
          if (!LG.canTrade(L)) bad('Trading is closed right now.');
          const why = LG.tradeCheck(L, o.from, o.to, o.give, o.get);
          if (why) { L.offers = L.offers.filter(x => x !== o); return { ok: false, msg: why }; }
          LG.doTrade(L, o.from, o.to, o.give, o.get);
          const moved = o.give.concat(o.get);
          L.offers = L.offers.filter(x => x !== o && !x.give.concat(x.get).some(id => moved.indexOf(id) >= 0));
          return { ok: true, msg: 'Trade complete.' };
        }
        case 'sign': {
          if (!t) bad('You have no team.'); if (L.phase === 'setup' || L.phase === 'draft') bad('Not available right now.');
          const e = LG.signFA(L, t.id, String(b.pid)); if (e) bad(e); return { ok: true };
        }
        case 'ir': {   // put an injured player on injured reserve
          if (!t) bad('You have no team.');
          const e = LG.placeIR(L, t.id, String(b.pid)); if (e) bad(e); return { ok: true };
        }
        case 'activate': {   // bring him back from injured reserve
          if (!t) bad('You have no team.');
          const e = LG.activateIR(L, t.id, String(b.pid)); if (e) bad(e); return { ok: true };
        }
        case 'use': {   // a back, receiver or tight end's usage (share of snaps); empty: the default for his place on the depth chart
          if (!t) bad('You have no team.');
          const e = LG.setUsage(L, t.id, String(b.pid), b.v == null ? null : +b.v); if (e) bad(e); return { ok: true };
        }
        case 'ret': {   // the team's kick and punt returner (empty: the best one)
          if (!t) bad('You have no team.');
          const e = LG.setReturner(L, t.id, b.pid ? String(b.pid) : null); if (e) bad(e); return { ok: true };
        }
        case 'block': {
          if (!t) bad('You have no team.');
          const e = LG.setBlock(L, t.id, String(b.pid), !!b.on); if (e) bad(e); return { ok: true };
        }
        case 'release': {
          if (!t) bad('You have no team.'); if (L.phase === 'setup' || L.phase === 'draft') bad('Not available right now.');
          const e = LG.release(L, t.id, String(b.pid)); if (e) bad(e); return { ok: true };
        }
        case 'simme': {
          const g = L.sched.find(x => x.id === b.gid); if (!g || g.done || !t || (g.h !== t.id && g.a !== t.id) || g.w !== L.week) bad('bad_request');
          if (L.teams[g.h].owner && L.teams[g.a].owner) bad('Both teams are human. Play it, or ask the manager to sim the week.');
          LG.simGame(L, g); return { ok: true };
        }
        case 'play': {   // freeze both squads and (for human-vs-human) open a live room
          const g = L.sched.find(x => x.id === b.gid);
          if (!g || g.done || !t || (g.h !== t.id && g.a !== t.id) || g.w !== L.week || (L.phase !== 'regular' && L.phase !== 'playoffs')) bad('That game is not available.');
          if (!g.T) g.T = LG.teamsFor(L, g.h, g.a);
          const side = g.h === t.id ? 'a' : 'b', ho = L.teams[g.h].owner, ao = L.teams[g.a].owner;
          const out = { seed: LG.gameSeed(L, g), T: g.T, side, cpuSide: (side === 'a' ? ao : ho) ? null : (side === 'a' ? 'b' : 'a'), gid: g.id, homeName: L.teams[g.h].name, awayName: L.teams[g.a].name };
          if (ho && ao) {
            let rc = g.room;
            if (rc && !(await getJ(rkey(rc, 'room')))) rc = null;
            if (!rc) {
              rc = await createRoom(out.seed, { k: 'league', code, gid: g.id }, {
                a: { pid: 'u:' + ho, name: L.teams[g.h].nick, status: 'ready', squad: g.T.a.squad, owner: ho },
                b: { pid: 'u:' + ao, name: L.teams[g.a].nick, status: 'ready', squad: g.T.b.squad, owner: ao } });
              if (!rc) bad('busy', 503);
              g.room = rc;
            }
            out.room = rc;
          }
          return out;
        }
        case 'report': {
          const g = L.sched.find(x => x.id === b.gid);
          if (!g || g.done || !t || (g.h !== t.id && g.a !== t.id) || g.w !== L.week) bad('That game is not available.');
          const ho = L.teams[g.h].owner, ao = L.teams[g.a].owner;
          if (!g.T) bad('Start the game first.');
          if (ho && ao) {
            if (!g.room) bad('No room for this game.');
            const rm = await readRoom(g.room); if (!rm) bad('The room expired.');
            const done = LG.playVerified(L, g, rm.moves, []);
            if (!done) bad('Both teams have not finished the game yet.');
          } else {
            const side = g.h === t.id ? 'a' : 'b', mv = E.cleanMoves(b.moves, side);
            const done = LG.playVerified(L, g, mv, [side === 'a' ? 'b' : 'a']);
            if (!done) bad('That game did not finish.');
          }
          return { ok: true, sh: g.sh, sa: g.sa };
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
