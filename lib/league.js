/* League engine: rosters, schedules, simulation, standings, playoffs, progression, drafts, trades,
   custom leagues and tournament brackets. Pure JSON-in / JSON-out so the browser (campaign) and the
   server (shared leagues) run the exact same rules. */
(function (root) {
'use strict';
const E = root.E || require('./engine.js');
const DATA = E.DATA;

/* ---------------- constants ---------------- */
// K = kicker, P = punter, KR = kick returner, PR = punt returner (one starter each, no backups)
const POS = ['QB', 'HB', 'WR', 'TE', 'OL', 'DE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'KR', 'PR'];
const ROSTER_MAX = 53;
const TRADE_DEADLINE = 10;       // campaign: no trades after this week
function counts(sch) { return { QB: 1, HB: 1, WR: 2, TE: 1, OL: 5, DE: 2, DT: sch === '43' ? 2 : 3, LB: sch === '43' ? 3 : 2, CB: 2, S: 2, K: 1, P: 1, KR: 0, PR: 0 }; }   // returners are optional: a team without one uses its franchise's real returner
const MIN_DEPTH = { QB: 2, HB: 2, WR: 4, TE: 2, OL: 7, DE: 3, DT: 3, LB: 3, CB: 4, S: 3, K: 1, P: 1, KR: 0, PR: 0 };
const SPECIAL = { K: 1, P: 1, KR: 1, PR: 1 };
const FA_BAG = ['QB', 'HB', 'WR', 'WR', 'TE', 'OL', 'OL', 'DE', 'DT', 'LB', 'LB', 'CB', 'CB', 'S', 'K', 'P'];   // positions free agents are drawn from
const POS_NAME = { QB: 'Quarterback', HB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', OL: 'Offensive line', DE: 'Defensive end', DT: 'Defensive tackle', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety', K: 'Kicker', P: 'Punter', KR: 'Kick returner', PR: 'Punt returner' };
const SLOT_LABELS = {
  '43': { DE: ['LDE', 'RDE'], DT: ['LDT', 'RDT'], LB: ['WLB', 'MLB', 'SLB'], CB: ['LCB', 'RCB'], S: ['SS', 'FS'] },
  '34': { DT: ['LDT', 'NT', 'RDT'], DE: ['LEDGE', 'REDGE'], LB: ['LILB', 'RILB'], CB: ['LCB', 'RCB'], S: ['SS', 'FS'] }
};
// the front in the order the field lines it up, and each slot's job on the field: linemen ('DL') or linebackers ('LB', including the 3-4's
// stand-up edge rushers at LEDGE / REDGE). A player's position (DE, DT, LB) is who he is; the slot is where his scheme plays him.
const FRONT = { '43': ['LDE', 'LDT', 'RDT', 'RDE', 'WLB', 'MLB', 'SLB'], '34': ['LDT', 'NT', 'RDT', 'LEDGE', 'LILB', 'RILB', 'REDGE'] };
const SLOT_POS = { LDE: 'DE', RDE: 'DE', LEDGE: 'DE', REDGE: 'DE', LDT: 'DT', RDT: 'DT', NT: 'DT' };
const slotRole = slot => /^(LDE|RDE|LDT|RDT|NT)$/.test(slot) ? 'DL' : /LB$|EDGE$/.test(slot) ? 'LB' : /CB$/.test(slot) ? 'CB' : 'S';
// saves from before DE / DT: their defensive linemen ('DL') become ends or tackles (the real ones by the 2026 data, made-up ones by build),
// and real edge rushers listed at linebacker become ends; starters named at 'DL' keep starting at their new spot
let DPOS = null;
function upgradePositions(L) {
  if (L.dpos) return;
  if (!DPOS) { DPOS = {}; (DATA.DFU || []).forEach(u => u.players.forEach(q => { if (SLOT_POS[q[0]] || q[1] === 'LB') DPOS[q[2]] = SLOT_POS[q[0]] || 'LB'; }));
    (DATA.DEPTH || []).concat([{ players: DATA.FA || [] }]).forEach(u => u.players.forEach(q => { if (q[0] === 'DE' || q[0] === 'DT' || q[0] === 'LB') DPOS[q[1]] = q[0]; })); }
  for (const k in L.players) {
    const p = L.players[k];
    if (p.p === 'DL') p.p = DPOS[p.n] === 'DE' || DPOS[p.n] === 'DT' ? DPOS[p.n] : (p.s || 76) >= 78 ? 'DE' : 'DT';
    else if (p.p === 'LB' && DPOS[p.n] === 'DE') p.p = 'DE';
  }
  L.dpos = 1;
}
const CONF_DIVS = { AFC: ['AE', 'AN', 'AS', 'AW'], NFC: ['NE', 'NN', 'NS', 'NW'] };
const DIV_NAMES = { AE: 'AFC East', AN: 'AFC North', AS: 'AFC South', AW: 'AFC West', NE: 'NFC East', NN: 'NFC North', NS: 'NFC South', NW: 'NFC West' };

/* ---------------- tiny utils ---------------- */
const rng = (L, tag) => E.mulberry32(E.hashStr(L.seed + ':' + tag));
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pickOf = (r, a) => a[Math.floor(r() * a.length)];
function shuffle(r, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
const clamp = E.clamp;
const FIRST = ['Aaron', 'Andre', 'Antonio', 'Barry', 'Brandon', 'Brett', 'Cameron', 'Carl', 'Chris', 'Cole', 'Corey', 'Curtis', 'Damon', 'Darius', 'Derek', 'Devin', 'Dominic', 'Drew', 'Dwayne', 'Eli', 'Elijah', 'Evan', 'Felix', 'Gabe', 'Garrett', 'Grant', 'Hunter', 'Isaiah', 'Jabari', 'Jace', 'Jalen', 'Jamal', 'Jared', 'Jaylen', 'Jerome', 'Jordan', 'Josh', 'Julian', 'Kai', 'Keenan', 'Kendall', 'Kyle', 'Lamar', 'Landon', 'Logan', 'Marcus', 'Marlon', 'Mason', 'Micah', 'Miles', 'Nate', 'Nico', 'Omar', 'Owen', 'Preston', 'Quincy', 'Reggie', 'Rhett', 'Rodney', 'Ryan', 'Sam', 'Shawn', 'Terrell', 'Trey', 'Tyler', 'Victor', 'Wes', 'Xavier', 'Zach', 'Zion'];
const LAST = ['Abbott', 'Alvarez', 'Bailey', 'Banks', 'Barnes', 'Bell', 'Booker', 'Boyd', 'Brooks', 'Bryant', 'Burke', 'Carter', 'Chambers', 'Coleman', 'Cross', 'Dalton', 'Davis', 'Dixon', 'Duncan', 'Ellis', 'Fields', 'Fletcher', 'Foster', 'Fuller', 'Gaines', 'Garrett', 'Gibson', 'Grant', 'Hale', 'Hardy', 'Harmon', 'Hayes', 'Holland', 'Howard', 'Hughes', 'Ingram', 'Jennings', 'Keller', 'Kemp', 'Lawson', 'Lowe', 'Mack', 'Marsh', 'Maxwell', 'McCoy', 'Mercer', 'Monroe', 'Nash', 'Norris', 'Oliver', 'Owens', 'Parker', 'Pierce', 'Poole', 'Powell', 'Quinn', 'Reeves', 'Rhodes', 'Rivers', 'Rowe', 'Sanders', 'Shaw', 'Spencer', 'Stokes', 'Tate', 'Thornton', 'Tucker', 'Vaughn', 'Walker', 'Webb', 'Whitaker', 'Wilkins', 'Winters', 'Wright', 'Yates', 'Young'];
const SKIN_W = [1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5], HAIR_W = ['K', 'K', 'K', 'N', 'N', 'B', 'X', 'R', 'K', 'X'];
function randName(r) { return pickOf(r, FIRST) + ' ' + pickOf(r, LAST); }

/* ---------------- players ---------------- */
function nid(L, pre) { L.nid = (L.nid || 0) + 1; return (pre || 'x') + L.nid.toString(36); }
function mkPlayer(L, o) {
  const r = rng(L, 'pl' + (L.nid || 0));
  const p = Object.assign({ i: nid(L, 'x'), n: randName(r), p: 'WR', o: 60, a: 24, pt: 66, sk: pickOf(r, SKIN_W), hr: pickOf(r, HAIR_W), t: -1, h: [], gen: 1 }, o);   // gen: made up by the game, not a real person
  if (!p.s) p.s = skillSpeed(p.p, p.o, r);
  if (p.pt < p.o) p.pt = p.o;
  L.players[p.i] = p;
  return p;
}
function skillSpeed(pos, o, r) {
  const b = { QB: 76, HB: 88, WR: 90, TE: 82, OL: 62, DE: 80, DT: 72, DL: 76, LB: 82, CB: 91, S: 88, K: 60, P: 60, KR: 92, PR: 91 }[pos] || 80;
  return clamp(Math.round(b + (o - 70) * 0.15 + (r() - 0.5) * 8), 55, 99);
}
function potFor(r, o, a) { return clamp(o + (a <= 22 ? ri(r, 3, 12) : a <= 24 ? ri(r, 1, 8) : a <= 27 ? ri(r, 0, 3) : 0), 40, 99); }

/* ---------------- building the NFL ---------------- */
function newNFL(opts) {
  opts = opts || {};
  const L = { v: 1, dpos: 1, kind: 'campaign', seed: opts.seed || Math.floor(Math.random() * 2147483647), nid: 0, season: 2026, week: 1, phase: 'regular',
    teams: [], players: {}, sched: [], hist: [], stats: {}, news: [], user: opts.user == null ? null : opts.user, real: true };
  const r = rng(L, 'build');
  DATA.TEAMS.forEach((t, i) => {
    const du = DATA.DFU[i];
    L.teams.push({ id: i, abbr: t.abbr, city: t.city, nick: t.nick, name: t.city + ' ' + t.nick, c1: t.c1, c2: t.c2, conf: t.conf, div: t.div, owner: null, sch: du.scheme });
  });
  const T = abbr => L.teams.findIndex(t => t.abbr === abbr);
  DATA.PLAYERS.forEach(p => {
    mkPlayerFixed(L, { i: 'p' + p.id, n: p.name, p: p.pos, o: p.ovr, s: p.spd, a: p.age, sk: p.skin, hr: p.hair, t: T(p.team), sal: p.sal, cx: p.cx, rt: p.rt }, r);
  });
  DATA.OLU.forEach((u, ui) => u.players.forEach((q, k) => {
    mkPlayerFixed(L, { i: 'o' + ui + '_' + k, n: q[0], p: 'OL', o: q[1], a: q[3], t: T(u.team), sal: q[4], cx: q[5] }, r);
  }));
  DATA.DFU.forEach((u, ui) => u.players.forEach((q, k) => {
    mkPlayerFixed(L, { i: 'd' + ui + '_' + k, n: q[2], p: SLOT_POS[q[0]] || q[1], o: q[3], a: q[5], t: T(u.team), sal: q[6], cx: q[7], rt: q[8] || undefined, s: q[9] || undefined }, r);
  }));
  // the real kickers, punters and returners
  DATA.KICK.forEach(k => mkPlayerFixed(L, { i: 'k' + k.id, n: k.name, p: 'K', o: k.ovr, s: 60, a: 28, sk: k.skin, hr: k.hair, t: T(k.team), sal: k.sal, cx: k.cx }, r));
  DATA.STU.forEach(u => { const q = u.players[0]; mkPlayerFixed(L, { i: 'u' + u.id, n: q[1], p: 'P', o: q[2], s: 60, a: 28, sk: q[3] >= 1 && q[3] <= 5 ? q[3] : 2, hr: 'K', t: T(u.team), sal: q[4], cx: q[5] }, r); });
  // there are no returners on their own: each team designates one of its backs, receivers or corners (returnerOf)
  // the real backups (2026 rosters): second-string quarterbacks, reserve linemen, and so on
  (DATA.DEPTH || []).forEach((u, ui) => u.players.forEach((q, k) => {
    mkPlayerFixed(L, { i: 'b' + ui + '_' + k, n: q[1], p: q[0], o: q[2], a: q[3], s: q[4] || undefined, t: T(u.team), sal: q[5], cx: q[6], rt: q[7] || undefined }, r);
  }));
  // anyone still missing (older data, odd rosters) is made up
  L.teams.forEach(t => fillDepth(L, t.id, r, true));
  // free agent pool: players who really were cut, then a few made-up ones
  (DATA.FA || []).slice(0, 60).forEach((q, k) => mkPlayerFixed(L, { i: 'f' + k, n: q[1], p: q[0], o: q[2], a: q[3], s: q[4] || undefined, t: -1, sal: q[5], cx: q[6], rt: q[7] || undefined }, r));
  for (let k = 0; k < (DATA.FA && DATA.FA.length ? 24 : 80); k++) {
    const pos = pickOf(r, FA_BAG), a = ri(r, 23, 32), o = SPECIAL[pos] && pos !== 'KR' && pos !== 'PR' ? ri(r, 56, 72) : ri(r, 50, 70);
    mkPlayer(L, { p: pos, o, a, pt: potFor(r, o, a), t: -1 });
  }
  L.sched = nflSchedule(L, true);
  L.lastWeek = 18;
  return L;
}
function mkPlayerFixed(L, o, r) {
  const p = Object.assign({ pt: potFor(r, o.o, o.a), hr: pickOf(r, HAIR_W), sk: pickOf(r, SKIN_W), h: [] }, o);
  if (!p.s) p.s = skillSpeed(p.p, p.o, r);
  L.players[p.i] = p; return p;
}
function rosterOf(L, tid) { if (!L.dpos) upgradePositions(L); const a = []; for (const k in L.players) if (L.players[k].t === tid) a.push(L.players[k]); return a; }
// the 53 that count: players on injured reserve are still on the team (and its payroll) but not on the active roster
function activeRoster(L, tid) { return rosterOf(L, tid).filter(p => !p.ir); }
const healthy = p => !p.inj && !p.ir && !p.sus;   // (sus: games left on a suspension)
function posCount(L, tid) { const c = {}; POS.forEach(p => { c[p] = 0; }); rosterOf(L, tid).forEach(p => { c[p.p]++; }); return c; }
// make sure the roster has at least MIN_DEPTH at every position (generating backups when short)
function fillDepth(L, tid, r, jitter) {
  r = r || rng(L, 'depth' + tid + ':' + L.nid);
  const c = posCount(L, tid);
  POS.forEach(pos => {
    while (c[pos] < MIN_DEPTH[pos]) {
      const a = ri(r, 22, 31), o = ri(r, 50, 66);
      mkPlayer(L, { p: pos, o, a, pt: potFor(r, o, a), t: tid });
      c[pos]++;
    }
  });
}

/* ---------------- lineups and squads ---------------- */
/* starters: the coach can name who starts at any position (p.st, e.g. a rookie to develop); they go ahead of better-rated players in the
   lineup, and for backs, receivers and tight ends the default usage follows that order. A starter he no longer has stops counting. */
const depthOrder = (a, b) => (b.st ? 1 : 0) - (a.st ? 1 : 0) || b.o - a.o || (a.i < b.i ? -1 : 1);
function setStarter(L, tid, pid, on) {
  const p = L.players[pid];
  if (!p || p.t !== tid) return 'Not on your roster.';
  if (p.p === 'KR' || p.p === 'PR') return 'Name returners with the returner choice.';
  if (!on) { delete p.st; return null; }
  if (!healthy(p)) return p.n + ' is hurt.';
  // one more starter than the position has: the lowest-rated of the others the coach named goes back to the bench
  const need = counts(L.teams[tid].sch)[p.p], named = rosterOf(L, tid).filter(x => x.p === p.p && x.st && x !== p).sort((a, b) => b.o - a.o);
  if (named.length >= need) delete named[named.length - 1].st;
  p.st = true; return null;
}
function lineup(L, tid) {
  const T = L.teams[tid], need = counts(T.sch), by = {};
  POS.forEach(p => { by[p] = []; });
  rosterOf(L, tid).forEach(p => { if (healthy(p)) by[p.p].push(p); });   // the injured sit
  POS.forEach(p => by[p].sort(depthOrder));   // the coach's starters first, then by rating
  const out = {};
  POS.forEach(p => { out[p] = by[p].slice(0, need[p]); });
  // the returner the team designated (else its best): he returns kicks and punts
  const ret = returnerOf(L, tid);
  out.KR = ret ? [ret] : []; out.PR = ret ? [ret] : [];
  return out;
}
/* returners: a running back, receiver or corner (older saves may still have players listed as KR or PR), rated by rt, his returner
   rating from speed, agility and change of direction (build_rosters.py), or from his speed when he has none */
const RET_POS = { HB: 1, WR: 1, CB: 1, KR: 1, PR: 1 };
const retRating = p => p.rt != null ? p.rt : p.p === 'KR' || p.p === 'PR' ? p.o : clamp(Math.round(62 + ((p.s || 85) - 80 - 1.35) * 2.2), 55, 97);
function returnerCands(L, tid) { return rosterOf(L, tid).filter(p => RET_POS[p.p] && healthy(p)).sort((a, b) => retRating(b) - retRating(a) || b.o - a.o); }
function returnerOf(L, tid) {
  const T = L.teams[tid], c = returnerCands(L, tid), mine = T && T.ret && c.find(p => p.i === T.ret);
  return mine || c[0] || null;
}
function setReturner(L, tid, pid) {
  if (pid == null || pid === '') { delete L.teams[tid].ret; return null; }   // back to the best one
  const p = L.players[pid];
  if (!p || p.t !== tid || !RET_POS[p.p]) return 'Pick one of your running backs, receivers or corners.';
  L.teams[tid].ret = pid; return null;
}
function squadOf(L, tid) {
  const T = L.teams[tid], ln = lineup(L, tid);
  const walk = pos => ({ i: 'w' + pos + tid, n: 'Walk-on ' + pos, p: pos, o: 45, s: 70, sk: 3, hr: 'K' });
  const eo = p => effOvr(L, tid, p);
  const sk = p => { p = p || walk('WR'); return { i: p.i, n: p.n, o: eo(p), s: p.s || 80, sk: p.sk, hr: p.hr, tm: T.abbr }; };
  const g = (pos, n) => { const a = ln[pos].slice(); while (a.length < n) a.push(walk(pos)); return a; };
  const labels = SLOT_LABELS[T.sch];
  const C = counts(T.sch), at = {};
  ['DE', 'DT', 'LB'].forEach(pos => g(pos, C[pos]).forEach((p, i) => { at[labels[pos][i]] = p; }));
  const cb = g('CB', 2), s = g('S', 2);
  const df = FRONT[T.sch].map(slot => [slot, slotRole(slot), at[slot].n, eo(at[slot]), at[slot].i]);
  cb.forEach((p, i) => df.push([labels.CB[i], 'CB', p.n, eo(p), p.i]));
  s.forEach((p, i) => df.push([labels.S[i], 'S', p.n, eo(p), p.i]));
  // kicker, punter and the two returners come from the roster; the long snapper and coverage men from the franchise's special-teams unit
  const base = E.stSquad(typeof T.fr === 'number' && E.TEAMS[T.fr] ? E.TEAMS[T.fr].abbr : DATA.TEAMS.some(x => x.abbr === T.abbr) ? T.abbr : null);
  const spec = (pos, dflt) => { const p = ln[pos][0]; return p ? { i: p.i, n: p.n, o: p.o, s: p.s || 60, sk: p.sk, hr: p.hr, tm: T.abbr } : dflt; };
  const ret = (pos, dflt) => { const p = ln[pos][0]; return p ? { i: p.i, n: p.n, o: retRating(p), s: p.s || 85, a: (p.s || 85) - 3, sk: p.sk, hr: p.hr, tm: T.abbr } : dflt; };
  const pu = ln.P[0], stp = base.st.p.slice();
  if (pu) stp[0] = ['P', pu.n, pu.o, pu.i];
  // the rotation: every back, receiver and tight end the coach gives snaps to (usage u), drawn on each snap (E.personnel)
  const rot = {};
  ['HB', 'WR', 'TE'].forEach(pos => { rot[pos] = usageList(L, tid, pos).filter(x => x.u > 0).map(x => Object.assign(sk(x.p), { u: x.u })); });
  return {
    tm: T.abbr, cs: [T.c1, T.c2], rot,
    qb: sk(g('QB', 1)[0]), hb: sk(g('HB', 1)[0]), wr: g('WR', 2).map(sk), te: sk(g('TE', 1)[0]),
    ol: { tm: T.abbr, p: g('OL', 5).map(p => [p.n, eo(p), p.i]) }, ff: fightFactor(L, tid),
    df: { tm: T.abbr, sch: T.sch, p: df },
    k: spec('K', base.k), kr: ret('KR', base.kr), pr: ret('PR', base.pr), st: { tm: base.st.tm, p: stp }
  };
}
/* usage: each back, receiver and tight end's share of his group's snaps (0-100), set by the coach (p.use) or, until he does, by depth:
   the best of each group plays most. A group's usages share its spots (the receivers' add up to two spots); on a given play the
   ones who fit it best are a little likelier, and on passing downs a receiver can take the TE spot (the slot). */
const USE_DEFAULT = { HB: [65, 30, 5], WR: [95, 80, 20, 5], TE: [85, 15] };   // each group adds up to its spots (1 HB, 2 WR, 1 TE)
function usageList(L, tid, pos) {
  const ps = rosterOf(L, tid).filter(p => p.p === pos && healthy(p)).sort(depthOrder);
  return ps.map((p, k) => ({ p, u: p.use != null ? p.use : (USE_DEFAULT[pos][k] || 0), set: p.use != null }));
}
function setUsage(L, tid, pid, v) {
  const p = L.players[pid];
  if (!p || p.t !== tid || !USE_DEFAULT[p.p]) return 'Usage is for running backs, receivers and tight ends.';
  if (v === null || v === '') { delete p.use; return null; }   // back to the default for his place on the depth chart
  v = Math.round(+v); if (!isFinite(v) || v < 0 || v > 100) return 'Usage is 0 to 100.';
  p.use = v; return null;
}
function teamsFor(L, aId, bId) {
  const T = id => ({ name: L.teams[id].nick, squad: squadOf(L, id), c1: L.teams[id].c1, c2: L.teams[id].c2 });   // (the colours are only for the screen)
  return { a: T(aId), b: T(bId) };
}
function teamRating(L, tid) {
  const U = E.teamUnits({ squad: squadOf(L, tid) });
  return { off: U.offR, def: U.defR, ovr: U.ovrR };
}

/* ---------------- schedules ---------------- */
function gameSeed(L, g) { return E.hashStr(L.seed + ':' + L.season + ':' + g.id) % 2147483647; }
function addGame(L, list, w, a, h, pl) { const g = { id: 'g' + list.length + '_' + (pl || 'r'), w, a, h, pl: pl || 'reg', done: false }; list.push(g); return g; }
// real 2026 slate (week by week) or a generated 17-game NFL-style slate for later seasons
function nflSchedule(L, real, ranks) {
  const list = [];
  if (real && DATA.SCHED && L.season === 2026) {
    const T = abbr => L.teams.findIndex(t => t.abbr === abbr);
    DATA.SCHED.forEach(s => addGame(L, list, s[0], T(s[1]), T(s[2])));
    return list;
  }
  const pairs = nflMatchups(L, ranks);
  const wk = assignWeeks(rng(L, 'wk' + L.season), pairs);
  wk.games.forEach(g => addGame(L, list, g.w, g.a, g.h));
  L.lastWeek = wk.weeks;
  return list;
}
// 17 games per team: 6 division, 4 intra-conference rotation, 4 inter-conference rotation, 2 same-rank, 1 extra inter-conference
// ranks (optional): each team's finish within its division last season, 0 = first. The same-rank games use it; without it the order of the data is used.
function nflMatchups(L, ranks) {
  const y = L.season, byDiv = {}, byRk = {}, rankOf = {};
  Object.keys(DIV_NAMES).forEach(d => {
    byDiv[d] = L.teams.filter(t => t.div === d).sort((a, b) => a.id - b.id); byDiv[d].forEach((t, i) => { rankOf[t.id] = i; });
    byRk[d] = ranks ? byDiv[d].slice().sort((a, b) => (ranks[a.id] == null ? 9 : ranks[a.id]) - (ranks[b.id] == null ? 9 : ranks[b.id]) || a.id - b.id) : byDiv[d];
  });
  const pairs = [], seen = {};
  const add = (a, b, homeFirst, div) => { const g = homeFirst ? { h: a, a: b } : { h: b, a: a }; if (div) g.d = true; pairs.push(g); };
  // division home-and-home
  Object.keys(byDiv).forEach(d => { const t = byDiv[d]; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { add(t[i].id, t[j].id, true, true); add(t[i].id, t[j].id, false, true); } });
  const confs = [['AE', 'AN', 'AS', 'AW'], ['NE', 'NN', 'NS', 'NW']];
  const rot = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]][y % 3];
  confs.forEach(cd => rot.forEach(pr => {
    const A = byDiv[cd[pr[0]]], B = byDiv[cd[pr[1]]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) add(A[i].id, B[j].id, (i + j + y) % 2 === 0);
  }));
  // inter-conference full-division pairing
  const sh = y % 4;
  for (let i = 0; i < 4; i++) {
    const A = byDiv[confs[0][i]], B = byDiv[confs[1][(i + sh) % 4]];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) add(A[a].id, B[b].id, (a + b + y) % 2 === 1);
  }
  // same-rank games against the two divisions not in the rotation
  confs.forEach(cd => {
    const played = rot.find(pr => pr[0] >= 0); // placeholder, computed below
    const skip = new Set();
    rot.forEach(pr => { skip.add(pr[0] + '-' + pr[1]); });
    for (let i = 0; i < 4; i++) {
      const opp = [0, 1, 2, 3].filter(j => j !== i && !rot.some(pr => (pr[0] === i && pr[1] === j) || (pr[1] === i && pr[0] === j)));
      opp.forEach(j => { if (i < j) for (let rk = 0; rk < 4; rk++) add(byRk[cd[i]][rk].id, byRk[cd[j]][rk].id, (rk + y) % 2 === 0); });
    }
  });
  // 17th game: same rank, other conference, a different division than the full pairing
  const sh2 = (y + 1) % 4 === sh ? (y + 2) % 4 : (y + 1) % 4;
  for (let i = 0; i < 4; i++) for (let rk = 0; rk < 4; rk++) add(byRk[confs[0][i]][rk].id, byRk[confs[1][(i + sh2) % 4]][rk].id, y % 2 === 0);
  return pairs;
}
// give every game a week. Packing the games in the order nflMatchups lists them fits all 17 into 17 weeks with no clashes,
// but that order is by kind (division games first), so the weeks themselves are then shuffled: division weeks land all over
// the season, never two in a row. (A random greedy packing almost never fits in 18 weeks, which is why it is done this way.)
function assignWeeks(r, pairs) {
  const used = {}, out = []; let weeks = 0;
  pairs.forEach(g => { let w = 1; while (used[g.a + ':' + w] || used[g.h + ':' + w]) w++; used[g.a + ':' + w] = used[g.h + ':' + w] = 1; out.push({ a: g.a, h: g.h, w, d: !!g.d }); if (w > weeks) weeks = w; });
  const divWeek = {}; out.forEach(g => { if (g.d) divWeek[g.w] = (divWeek[g.w] || 0) + 1; });
  const heavy = w => (divWeek[w] || 0) * 2 > out.filter(g => g.w === w).length;
  let order = null;
  for (let k = 0; k < 200; k++) {
    order = shuffle(r, Array.from({ length: weeks }, (_, i) => i + 1));
    if (order.every((w, i) => i === 0 || !(heavy(w) && heavy(order[i - 1])))) break;
  }
  const map = {}; order.forEach((w, i) => { map[w] = i + 1; });
  out.forEach(g => { g.w = map[g.w]; delete g.d; });
  return { games: out, weeks };
}
// round-robin (circle method) for custom leagues; each round is one week
function rrSchedule(L, teamIds, gpt) {
  const list = [], n = teamIds.length;
  if (n < 2) return list;
  const arr = teamIds.slice(); if (n % 2) arr.push(-1);
  const m = arr.length, per = m - 1;
  const weeks = n % 2 ? gpt + Math.floor((gpt - 1) / per) + (gpt > 0 ? 0 : 0) : gpt;
  let w = 0, cyc = 0;
  while (w < weeks) {
    const a = arr.slice();
    for (let rd = 0; rd < per && w < weeks; rd++) {
      w++;
      for (let i = 0; i < m / 2; i++) {
        const x = a[i], y = a[m - 1 - i];
        if (x < 0 || y < 0) continue;
        const flip = (rd + i + cyc) % 2 === 0;
        addGame(L, list, w, flip ? x : y, flip ? y : x);
      }
      a.splice(1, 0, a.pop());
    }
    cyc++;
  }
  return list;
}

/* ---------------- playing and recording games ---------------- */
function humanSides(L, g) { return [L.teams[g.h].owner || null, L.teams[g.a].owner || null]; }
function simGame(L, g) {
  const T = g.T || teamsFor(L, g.h, g.a);
  const R = E.replay(gameSeed(L, g), T, {}, ['a', 'b']);
  return finishGame(L, g, T, R);
}
// the manager ends a game early: the team named loses 0-1 (the NFL's own forfeit score), no player stats are kept
function forfeit(L, g, loser) {
  if (!g || g.done) return 'That game is not available.';
  if (loser !== g.h && loser !== g.a) return 'Pick one of the two teams.';
  delete g.T; delete g.room;
  g.done = true; g.ff = loser; g.ot = false;
  g.sh = loser === g.h ? 0 : 1; g.sa = loser === g.a ? 0 : 1;
  return null;
}
// moves: the human's picks keyed "n-side"; sides: which side the CPU runs
function playVerified(L, g, moves, cpuSides) {
  const T = g.T || teamsFor(L, g.h, g.a);   // g.T: squads frozen when the game was started
  const R = E.replay(gameSeed(L, g), T, moves || {}, cpuSides || []);
  if (!R.state.over) return null;
  return finishGame(L, g, T, R);
}
function finishGame(L, g, T, R) {
  const st = R.state;
  delete g.T; delete g.room;
  g.done = true; g.sh = st.score.a; g.sa = st.score.b; g.ot = !!st.ot;
  injuries(L, g, addStats(L, g, T, R.log));
  if (L.camp) campAfterGame(L, g, T, R);
  return g;
}
/* ---------------- injuries and injured reserve ----------------
   After every game each player who played can get hurt: a chance per snap, about 1.5 injuries per team per game, drawn from the game
   seed (the same on every screen and the server). p.inj is the weeks he is out (99: the season). The injured sit (lineup, rotation,
   returner). Injured reserve (p.ir) keeps him on the team and its payroll but off the 53; he stays there at least IR_MIN weeks (p.irw)
   and comes back when healthy. CPU teams put long injuries on IR, bring players back and sign a free agent for an empty starting spot.
   Everyone is healthy again in the offseason. */
const INJ_RATE = 0.002, IR_MIN = 4, SEASON_OUT = 99;
function injuryWeeks(r) {
  const x = r();
  return x < 0.5 ? 1 : x < 0.72 ? 2 : x < 0.84 ? 3 + Math.floor(r() * 2) : x < 0.95 ? 5 + Math.floor(r() * 4) : x < 0.98 ? 9 + Math.floor(r() * 4) : SEASON_OUT;
}
function injuries(L, g, gsn) {
  const r = E.mulberry32(E.hashStr(gameSeed(L, g) + ':inj')), out = [];
  Object.keys(gsn || {}).sort().forEach(id => {
    const p = L.players[id], n = gsn[id];
    if (!p || p.t < 0 || !healthy(p) || r() >= 1 - Math.pow(1 - INJ_RATE, n)) return;
    p.inj = injuryWeeks(r); out.push([id, p.inj]);
    if (L.teams[p.t] && L.teams[p.t].owner) L.news.unshift({ s: L.season, t: p.n + ' (' + p.p + ', ' + L.teams[p.t].nick + ') is hurt: ' + (p.inj >= SEASON_OUT ? 'out for the season.' : 'out ' + p.inj + ' week' + (p.inj > 1 ? 's' : '') + '.') });
  });
  if (out.length) g.inj = out;
  if (L.news.length > 40) L.news.length = 40;
}
function placeIR(L, tid, pid) {
  const p = L.players[pid];
  if (!p || p.t !== tid) return 'Not on your roster.';
  if (p.ir) return p.n + ' is already on injured reserve.';
  if (!p.inj) return 'Only an injured player can go on injured reserve.';
  p.ir = true; p.irw = 0; return null;
}
function activateIR(L, tid, pid) {
  const p = L.players[pid];
  if (!p || p.t !== tid || !p.ir) return 'He is not on your injured reserve.';
  if ((p.irw || 0) < IR_MIN) return p.n + ' has to stay on injured reserve ' + (IR_MIN - (p.irw || 0)) + ' more week' + (IR_MIN - (p.irw || 0) > 1 ? 's' : '') + '.';
  if (p.inj) return p.n + ' is still injured (' + (p.inj >= SEASON_OUT ? 'out for the season' : p.inj + ' more week' + (p.inj > 1 ? 's' : '')) + ').';
  if (activeRoster(L, tid).length >= ROSTER_MAX) return 'Your active roster is full (' + ROSTER_MAX + '). Release someone first.';
  delete p.ir; delete p.irw; return null;
}
// a week goes by: injuries heal a week, IR time counts, and CPU teams sort out their rosters
function injuryWeek(L) {
  Object.values(L.players).forEach(p => {
    if (p.inj) { p.inj = p.inj >= SEASON_OUT ? p.inj : p.inj - 1; if (p.inj <= 0) delete p.inj; }
    if (p.ir) p.irw = (p.irw || 0) + 1;
    if (p.sus > 0 && L.phase === 'regular') { p.sus--; if (!p.sus) delete p.sus; }
  });
  if (L.camp) campHeal(L);
  L.teams.forEach(t => { if (!t.owner) cpuInjuries(L, t.id); });
}
function cpuInjuries(L, tid) {
  rosterOf(L, tid).forEach(p => {
    if (!p.ir && p.inj >= IR_MIN) placeIR(L, tid, p.i);   // out a month or more: injured reserve
    else if (p.ir && !p.inj && (p.irw || 0) >= IR_MIN) {   // ready: back on the 53, cutting the least valuable spare player if needed
      if (activeRoster(L, tid).length >= ROSTER_MAX) { const c = posCount(L, tid); const cut = activeRoster(L, tid).filter(x => x !== p && healthy(x) && c[x.p] > MIN_DEPTH[x.p]).sort((a, b) => playerValue(a) - playerValue(b))[0]; if (cut) cut.t = -1; }
      activateIR(L, tid, p.i);
    }
  });
  // an empty starting spot: the best free agent there it can fit under the cap and on the 53
  const need = counts(L.teams[tid].sch), ln = lineup(L, tid);
  POS.forEach(pos => {
    if (!(need[pos] > ln[pos].length)) return;
    const fa = Object.values(L.players).filter(p => p.t === -1 && p.p === pos && healthy(p) && salOf(p) <= capRoom(L, tid)).sort((a, b) => b.o - a.o)[0];
    if (!fa) return;
    if (activeRoster(L, tid).length >= ROSTER_MAX) { const c = posCount(L, tid); const cut = activeRoster(L, tid).filter(x => healthy(x) && x.p !== pos && c[x.p] > MIN_DEPTH[x.p]).sort((a, b) => playerValue(a) - playerValue(b))[0]; if (!cut) return; cut.t = -1; }
    fa.t = tid;
  });
}
function bump(L, id, k, v) { if (!id) return; const s = L.stats[id] || (L.stats[id] = {}); s[k] = (s[k] || 0) + (v || 1); }
function addStats(L, g, T, log) {
  const side = { a: g.h, b: g.a };   // engine side a = home
  const tm = { a: T.a, b: T.b };
  // season totals for everyone; a game-by-game line (g.ps[team][player]) only for teams a person runs, so saves stay small
  const B = (id, k, v) => {
    bump(L, id, k, v);
    const p = id && L.players[id];
    if (p && p.t >= 0 && L.teams[p.t] && (L.camp || L.teams[p.t].owner)) { const ps = g.ps || (g.ps = {}), t = ps[p.t] || (ps[p.t] = {}), l = t[id] || (t[id] = {}); l[k] = (l[k] || 0) + (v || 1); }
  };
  const gsn = {};   // this game's snaps, for injuries
  const snapOf = id => { if (!id) return; L.snaps = L.snaps || {}; L.snaps[id] = (L.snaps[id] || 0) + 1; gsn[id] = (gsn[id] || 0) + 1; };
  log.forEach(e => {
    const O = tm[e.off], D = tm[e.off === 'a' ? 'b' : 'a'];
    const td = e.ev === 'td';
    // snaps: everyone on the field for a run or pass (the rotating spots from the log, the line and the defense from the squads)
    if (e.offPick && E.OFF[e.offPick] && (E.OFF[e.offPick].kind === 'run' || E.OFF[e.offPick].kind === 'pass')) {
      const ot = side[e.off], dt = side[e.off === 'a' ? 'b' : 'a'];
      L.tsnaps = L.tsnaps || {}; const to = L.tsnaps[ot] || (L.tsnaps[ot] = { o: 0, d: 0 }), td2 = L.tsnaps[dt] || (L.tsnaps[dt] = { o: 0, d: 0 }); to.o++; td2.d++;
      ['QB', 'HB', 'WR1', 'WR2', 'TE'].forEach(r => snapOf(e.on && e.on[r] ? e.on[r][0] : E.idOf(O, r)));
      O.squad.ol.p.forEach(q => snapOf(q[2])); D.squad.df.p.forEach(q => snapOf(q[4]));
    }
    const who = r => e.on && e.on[r] ? e.on[r][0] : E.idOf(O, r);   // who played that spot on this snap
    if (e.runId) { const id = who(e.runId === 'FB' ? 'HB' : e.runId); B(id, 'att'); B(id, 'ryd', e.yards || 0); if (td && e.anim === 'run') B(id, 'rtd'); }
    else if (e.recId) {
      const q = who(e.qbId), rc = who(e.recId);
      B(q, 'pa');
      if (e.ev === 'pass' || (td && e.anim === 'pass') || (e.ev === 'downs' && e.anim === 'pass') || (e.ev === 'fumble' && e.anim === 'pass')) {
        B(q, 'pc'); B(q, 'pyd', e.yards || 0); B(rc, 'rec'); B(rc, 'recyd', e.yards || 0);
        if (td) { B(q, 'ptd'); B(rc, 'rectd'); }
      } else if (e.ev === 'int') { B(q, 'int'); B(E.idOf(D, e.defId), 'dint'); }
      else if (e.ev === 'inc' && e.defId) B(E.idOf(D, e.defId), 'pbu');
      else if (e.ev === 'sack' || (e.ev === 'downs' && e.anim === 'sack') || (e.ev === 'fumble' && e.anim === 'sack')) { B(E.idOf(D, e.defId), 'sk'); }
    } else if (e.defId) { B(E.idOf(D, e.defId), 'sk'); }
  });
  [g.h, g.a].forEach(tid => { rosterOf(L, tid).forEach(() => {}); });
  return gsn;
}
// stat views for one team's players: this season, one game, or career
const STAT_KEYS = ['att', 'ryd', 'rtd', 'pa', 'pc', 'pyd', 'ptd', 'int', 'rec', 'recyd', 'rectd', 'sk', 'dint', 'pbu'];
function sumStats(list) { const o = {}; list.forEach(x => { if (x) STAT_KEYS.forEach(k => { if (x[k]) o[k] = (o[k] || 0) + x[k]; }); }); return o; }
function gameLog(L, tid) {   // finished games of this season with a recorded stat line for the team
  return L.sched.filter(g => g.done && g.ps && g.ps[tid] && (g.h === tid || g.a === tid)).sort((a, b) => a.w - b.w);
}
// view: 'season' | 'career' | 'g:<gameId>' | 'y:<year>'. Returns [{ p: player, s: stats }] for players with any stat.
function teamStats(L, tid, view) {
  const out = [], add = (p, st) => { if (p && st && STAT_KEYS.some(k => st[k])) out.push({ p, s: st }); };
  if (view && view.indexOf('g:') === 0) {
    const g = L.sched.find(x => x.id === view.slice(2)), ps = g && g.ps && g.ps[tid] || {};
    Object.keys(ps).forEach(id => add(L.players[id], ps[id]));
  } else if (view && view.indexOf('y:') === 0) {
    const y = +view.slice(2);
    Object.values(L.players).forEach(p => { const e = (p.ss || []).filter(x => x.y === y && x.t === tid); if (e.length) add(p, sumStats(e)); });
  } else if (view === 'career') {
    Object.values(L.players).forEach(p => { if (p.t === tid || (p.ss || []).some(x => x.t === tid)) add(p, sumStats((p.ss || []).filter(x => x.t === tid).concat(p.t === tid ? [L.stats[p.i]] : []))); });
  } else rosterOf(L, tid).forEach(p => add(p, L.stats[p.i]));
  return out;
}
/* a player's numbers: this season so far, game by game (teams a person runs), season by season and all time. Retired players keep
   theirs for good, and the ones a team sends to its Hall of Fame are listed there with the career they had. */
function playerStats(L, id) {
  const p = L.players[id]; if (!p) { const h = (L.hof || []).find(x => x.i === id); return h ? { seasons: h.ss || [], games: [], season: null, career: h.s } : null; }
  const seasons = (p.ss || []).slice(), season = p.t >= 0 && L.stats[id] && STAT_KEYS.some(k => L.stats[id][k]) ? L.stats[id] : null;
  const games = []; L.sched.forEach(g => { if (!g.done || !g.ps) return; Object.keys(g.ps).forEach(t => { const l = g.ps[t][id]; if (l) games.push({ g, t: +t, s: l }); }); });
  games.sort((a, b) => a.g.w - b.g.w);
  return { seasons, games, season, career: sumStats(seasons.concat(season ? [season] : [])) };
}
// send a retired player of yours to the team's Hall of Fame (his career line is kept with him there)
function induct(L, tid, pid) {
  const p = L.players[pid]; if (!p || p.t !== -2) return 'Only retired players can go into the Hall of Fame.';
  if (p.lt !== tid) return 'He did not retire with your team.';
  L.hof = L.hof || []; if (L.hof.some(x => x.i === pid)) return 'He is already in.';
  L.hof.push({ i: p.i, n: p.n, p: p.p, t: tid, y: L.season, ry: p.ry, peak: p.peak || p.o, a: p.a, s: sumStats(p.ss || []), ss: (p.ss || []).slice() });
  L.news.unshift({ s: L.season, t: 'Hall of Fame: ' + L.teams[tid].name + ' induct ' + p.n + ' (' + p.p + ').' }); if (L.news.length > 40) L.news.length = 40;
  return null;
}
function weekGames(L) { return L.sched.filter(g => g.w === L.week && !g.done); }
// sim every game of the current week that no human is waiting on; returns true when the week is complete
function simWeek(L, humanOnly) {
  weekGames(L).forEach(g => {
    const hs = humanSides(L, g);
    if (humanOnly && (hs[0] || hs[1])) return;
    simGame(L, g);
  });
  return weekGames(L).length === 0;
}
function advanceWeek(L) {
  if (weekGames(L).length) return false;
  if (L.phase === 'regular') {
    injuryWeek(L);
    if (L.week >= L.lastWeek) { startPlayoffs(L); return true; }
    L.week++;
    if (L.camp) campWeek(L);
    return true;
  }
  if (L.phase === 'playoffs') { injuryWeek(L); advancePlayoffs(L); return true; }
  return false;
}
// advance with all CPU games simulated, stopping where a human game is pending
function runUntilHuman(L, maxSteps) {
  for (let k = 0; k < (maxSteps || 40); k++) {
    simWeek(L, true);
    if (weekGames(L).length) return 'human';
    if (L.phase === 'complete' || L.phase === 'draft' || L.phase === 'offseason') return L.phase;
    const before = L.phase + ':' + L.week;
    advanceWeek(L);
    if (L.phase + ':' + L.week === before && !weekGames(L).length && L.phase !== 'playoffs') return L.phase;
  }
  return L.phase;
}

/* ---------------- standings ---------------- */
function records(L) {
  const R = {};
  L.teams.forEach(t => { R[t.id] = { id: t.id, w: 0, l: 0, t: 0, pf: 0, pa: 0, dw: 0, dl: 0, dt: 0, cw: 0, cl: 0, ct: 0 }; });
  L.sched.forEach(g => {
    if (!g.done || g.pl !== 'reg') return;
    const h = R[g.h], a = R[g.a];
    h.pf += g.sh; h.pa += g.sa; a.pf += g.sa; a.pa += g.sh;
    const same = L.teams[g.h].div && L.teams[g.h].div === L.teams[g.a].div;
    const key = g.sh > g.sa ? ['w', 'l'] : g.sh < g.sa ? ['l', 'w'] : ['t', 't'];
    h[key[0]]++; a[key[1]]++;
    if (same) { h['d' + key[0]]++; a['d' + key[1]]++; }
  });
  Object.values(R).forEach(r => { const gp = r.w + r.l + r.t; r.pct = gp ? (r.w + r.t / 2) / gp : 0; r.pd = r.pf - r.pa; });
  return R;
}
function rank(R, ids) {
  return ids.slice().sort((x, y) => (R[y].pct - R[x].pct) || ((R[y].dw + R[y].dt / 2) - (R[x].dw + R[x].dt / 2)) || (R[y].pd - R[x].pd) || (R[y].pf - R[x].pf) || (x - y));
}
function standings(L) {
  const R = records(L), out = [];
  const divs = {};
  L.teams.forEach(t => { const k = t.div || 'ALL'; (divs[k] = divs[k] || []).push(t.id); });
  Object.keys(divs).forEach(k => out.push({ div: k, name: DIV_NAMES[k] || (k === 'ALL' ? 'League' : k), rows: rank(R, divs[k]).map(id => R[id]) }));
  return { divs: out, R };
}
// each team's finish within its division this season (0 = first), from the regular-season record
function divisionRanks(L) {
  const R = records(L), out = {}, divs = {};
  L.teams.forEach(t => { if (t.div) (divs[t.div] = divs[t.div] || []).push(t.id); });
  Object.keys(divs).forEach(d => rank(R, divs[d]).forEach((id, i) => { out[id] = i; }));
  return out;
}
function overallRank(L) { const R = records(L); return rank(R, L.teams.map(t => t.id)).map(id => R[id]); }

/* ---------------- playoffs ---------------- */
function startPlayoffs(L) {
  const R = records(L);
  L.phase = 'playoffs';
  const nfl = !!L.real || L.cfg && L.cfg.nflFormat;
  L.po = { round: 0, alive: {}, seeds: {}, champ: null, runner: null, out: {} };
  const confGroups = {};
  if (nfl) {
    ['AFC', 'NFC'].forEach(cf => {
      const ts = L.teams.filter(t => t.conf === cf), divWin = [];
      Object.keys(CONF_DIVS).includes(cf) && CONF_DIVS[cf].forEach(d => { const ids = rank(R, ts.filter(t => t.div === d).map(t => t.id)); divWin.push(ids[0]); });
      const seedsDiv = rank(R, divWin);
      const rest = rank(R, ts.map(t => t.id).filter(id => divWin.indexOf(id) < 0)).slice(0, 3);
      confGroups[cf] = seedsDiv.concat(rest);
    });
  } else {
    const n = (L.cfg && L.cfg.playoffs != null) ? L.cfg.playoffs : 0;
    if (!n) { finishSeason(L, null); return; }
    let ids;
    if (L.cfg && L.cfg.divisions) {
      const divWin = Object.keys(DIV_NAMES).concat(Array.from(new Set(L.teams.map(t => t.div)))).filter((d, i, a) => a.indexOf(d) === i)
        .map(d => rank(R, L.teams.filter(t => t.div === d).map(t => t.id))[0]).filter(x => x != null);
      const dw = rank(R, divWin).slice(0, n);
      const rest = rank(R, L.teams.map(t => t.id).filter(id => dw.indexOf(id) < 0));
      ids = dw.concat(rest).slice(0, n);
    } else ids = rank(R, L.teams.map(t => t.id)).slice(0, n);
    confGroups.ALL = ids;
  }
  L.po.alive = confGroups;
  L.po.nfl = nfl;
  Object.keys(confGroups).forEach(c => confGroups[c].forEach((id, i) => { L.po.seeds[id] = i + 1; }));
  L.week = L.lastWeek + 1;
  nextPlayoffRound(L);
}
function pow2le(n) { let p = 1; while (p * 2 <= n) p *= 2; return p; }
function nextPlayoffRound(L) {
  const po = L.po; po.round++;
  const games = [];
  const roundName = () => 'Round ' + po.round;
  Object.keys(po.alive).forEach(c => {
    const alive = po.alive[c].slice().sort((a, b) => po.seeds[a] - po.seeds[b]);
    if (alive.length < 2) return;
    const P = pow2le(alive.length), nGames = alive.length === P ? alive.length / 2 : alive.length - P;
    const play = alive.length === P ? alive : alive.slice(alive.length - 2 * nGames);
    po['bye' + c + po.round] = alive.filter(x => play.indexOf(x) < 0);
    for (let i = 0; i < nGames; i++) {
      const hi = play[i], lo = play[play.length - 1 - i];
      games.push(addGame(L, L.sched, L.week, lo, hi, 'po'));
      games[games.length - 1].c = c; games[games.length - 1].r = po.round;
    }
  });
  if (!games.length) { finishPlayoffs(L); return; }
  po.pending = games.map(g => g.id);
}
function advancePlayoffs(L) {
  const po = L.po, games = L.sched.filter(g => po.pending.indexOf(g.id) >= 0);
  if (games.some(g => !g.done)) return;
  const winners = {};
  games.forEach(g => {
    const w = g.sh >= g.sa ? g.h : g.a, l = w === g.h ? g.a : g.h;
    (winners[g.c] = winners[g.c] || []).push(w); po.out[l] = po.round;
  });
  const next = {};
  Object.keys(po.alive).forEach(c => {
    const prev = po.alive[c], byes = po['bye' + c + po.round] || [];
    next[c] = (winners[c] || []).concat(byes);
  });
  const conferences = Object.keys(next);
  L.week++;
  if (conferences.every(c => next[c].length <= 1)) {
    // conference champions meet (NFL) or the single bracket is over
    const champs = conferences.map(c => next[c][0]).filter(x => x != null);
    if (champs.length === 1) { return finishSeason(L, champs[0], games.map(g => (g.h === champs[0] ? g.a : g.h)).pop()); }
    if (po.sb) { return; }
    po.sb = true; po.round++;
    const hi = champs.slice().sort((a, b) => po.seeds[a] - po.seeds[b]);
    const g = addGame(L, L.sched, L.week, hi[1], hi[0], 'po'); g.c = 'SB'; g.r = po.round; g.neutral = true;
    po.pending = [g.id]; po.alive = { SB: champs }; champs.forEach(c => { po.seeds[c] = po.seeds[c] || 1; });
    return;
  }
  po.alive = next;
  if (po.alive.SB) { // final just played
    const g = games[0], w = g.sh >= g.sa ? g.h : g.a;
    return finishSeason(L, w, w === g.h ? g.a : g.h);
  }
  nextPlayoffRound(L);
}
function finishPlayoffs(L) {
  const po = L.po, last = L.sched.filter(g => po.pending.indexOf(g.id) >= 0 && g.done).pop();
  if (last) { const w = last.sh >= last.sa ? last.h : last.a; finishSeason(L, w, w === last.h ? last.a : last.h); }
}
// the final game of a bracket is detected in advancePlayoffs; this handles the SB game result
function checkFinal(L) {
  const po = L.po;
  if (!po || L.phase !== 'playoffs' || !po.pending) return;
  const gs = L.sched.filter(g => po.pending.indexOf(g.id) >= 0);
  if (gs.length === 1 && gs[0].done && gs[0].c === 'SB') { const g = gs[0], w = g.sh >= g.sa ? g.h : g.a; finishSeason(L, w, w === g.h ? g.a : g.h); }
}
// season awards from the season's stat lines (called before stats reset)
function computeAwards(L) {
  const S = L.stats, out = { players: [], teams: [] };
  const val = (s, w) => Object.keys(w).reduce((t, k) => t + (s[k] || 0) * w[k], 0);
  const best = (label, k, fn, filt) => {
    let top = null, tv = 0;
    Object.keys(S).forEach(id => {
      const p = L.players[id]; if (!p || p.t < 0 || (filt && !filt(p))) return;
      const v = fn(S[id], p); if (v > tv || (v === tv && top && v > 0 && p.o > top.o)) { tv = v; top = p; }
    });
    if (top && tv > 0) out.players.push({ k, label, pid: top.i, n: top.n, p: top.p, t: top.t, v: Math.round(tv * 10) / 10, stat: S[top.i] });
  };
  const OFFW = { pyd: 0.04, ptd: 4, ryd: 0.1, rtd: 6, recyd: 0.1, rectd: 6, int: -3 }, DEFW = { sk: 4, dint: 6 };
  best('mvp', 'Most Valuable Player', s => val(s, OFFW) + val(s, DEFW));
  best('opoy', 'Offensive Player of the Year', s => val(s, OFFW));
  best('dpoy', 'Defensive Player of the Year', s => val(s, DEFW));
  best('pass', 'Passing Leader', s => s.pyd || 0);
  best('rush', 'Rushing Leader', s => s.ryd || 0);
  best('rec', 'Receiving Leader', s => s.recyd || 0);
  best('sack', 'Sack Leader', s => s.sk || 0);
  best('int', 'Interception Leader', s => s.dint || 0);
  const R = records(L), ids = L.teams.map(t => t.id);
  if (ids.some(i => R[i].w + R[i].l + R[i].t > 0)) {
    out.teams.push({ k: 'rec', label: 'Best Record', t: rank(R, ids)[0] });
    out.teams.push({ k: 'off', label: 'Best Offense', t: ids.slice().sort((a, b) => R[b].pf - R[a].pf || a - b)[0] });
    out.teams.push({ k: 'def', label: 'Best Defense', t: ids.slice().sort((a, b) => R[a].pa - R[b].pa || a - b)[0] });
  }
  return out;
}
function finishSeason(L, champ, runner) {
  L.po = L.po || {};
  L.po.champ = champ; L.po.runner = runner;
  const R = records(L);
  L.hist.push({ season: L.season, awards: computeAwards(L), champ, runner, rec: rank(R, L.teams.map(t => t.id)).slice(0, 3).map(id => [id, R[id].w, R[id].l, R[id].t]) });
  L.phase = 'offseason';
  L.news.unshift({ s: L.season, t: (champ != null ? L.teams[champ].name + ' win the title.' : 'Regular season complete.') });
  if (L.news.length > 40) L.news.length = 40;
}

/* ---------------- progression ---------------- */
// a player's share of his side's snaps this season (offense for QB/HB/WR/TE/OL, defense otherwise), against the average team's snaps;
// null in a save from before snaps were counted
const OFF_POS = { QB: 1, HB: 1, WR: 1, TE: 1, OL: 1 };
function snapShare(L, p) {
  if (!L.tsnaps || !Object.keys(L.tsnaps).length) return null;
  const k = OFF_POS[p.p] ? 'o' : 'd', ts = Object.values(L.tsnaps), den = ts.reduce((t, x) => t + x[k], 0) / Math.max(1, ts.length);
  return den > 0 ? clamp(((L.snaps && L.snaps[p.i]) || 0) / den, 0, 1) : null;
}
function progress(L) {
  const r = rng(L, 'prog' + L.season), report = { up: [], down: [], retired: [], sleepers: [], busts: [], stars: [] };
  // keep each season's stat line for players on a team a person runs (career totals)
  Object.keys(L.stats || {}).forEach(id => {
    const p = L.players[id]; if (!p || p.t < 0 || !L.teams[p.t] || !(L.camp || L.teams[p.t].owner)) return;
    (p.ss = p.ss || []).push(Object.assign({ y: L.season, t: p.t }, L.stats[id]));
    if (p.ss.length > 20) p.ss.shift();
  });
  Object.values(L.players).forEach(p => {
    if (p.t === -2 || p.t === -3) return;
    delete p.inj; delete p.ir; delete p.irw;   // healthy again for the new season
    p.h = (p.h || []).concat([p.o]).slice(-8);
    const a = p.a, bonus = p.o < p.pt ? Math.min(4, Math.round((p.pt - p.o) * 0.22)) : 0;
    let d;
    if (a <= 22) d = ri(r, 1, 5); else if (a === 23) d = ri(r, 0, 4); else if (a === 24) d = ri(r, -1, 3);
    else if (a <= 27) d = ri(r, -2, 2); else if (a <= 29) d = ri(r, -3, 1); else if (a <= 31) d = ri(r, -4, 0);
    else if (a <= 33) d = ri(r, -5, 0); else d = ri(r, -6, -1);
    if (p.p === 'QB') d += a >= 29 ? 1 : 0;
    // kickers and punters last: they keep improving into their thirties and hardly decline until about 38
    if (p.p === 'K' || p.p === 'P') d = a <= 26 ? ri(r, 0, 4) : a <= 36 ? ri(r, -1, 2) : ri(r, -4, 0);
    if (d > 0) d += bonus; else if (d <= 0 && bonus && a < 27) d += 1;
    // playing time: a young player who plays grows faster and one who sits grows slower; a veteran who plays holds on a little longer
    const sh = snapShare(L, p);
    if (sh != null && !(p.p === 'K' || p.p === 'P')) {
      if (d > 0) d = Math.round(d * (0.45 + 0.85 * sh));
      else if (d < 0 && a >= 29) d = Math.round(d * (1 - 0.35 * sh));
      p.sh = Math.round(sh * 100);
    }
    const old = p.o;
    p.o = clamp(p.o + d, 40, 99);
    if (p.o > p.pt) p.pt = p.o;
    if (p.vp != null) {   // after his first season everybody knows what he can be
      if (p.pt - p.vp >= 8) report.sleepers.push(p.i); else if (p.vp - p.pt >= 8) report.busts.push(p.i);
      p.was = p.vp; delete p.vp;
    }
    if (p.s) p.s = clamp(p.s + (a <= 24 ? ri(r, 0, 2) : a >= 29 ? -ri(r, 0, 3) : ri(r, -1, 1)), 50, 99);
    p.a++;
    // a contract that ran out this season: he re-signs at the market price for his new rating, for one to four more seasons
    if (p.cx != null && p.cx <= L.season && !L.faOn) { p.sal = DRx().salaryOfPos(p.p, p.o); p.cx = L.season + ri(r, 1, 4); }
    if (L.camp && p.t >= 0 && L.teams[p.t].owner && d > 0 && d < 9 && a <= 28 && (L.fin ? L.fin.lv.pr : 1) > 1 && r() < (L.fin.lv.pr - 1) * 0.15 && p.o < p.pt) p.o = Math.min(99, p.o + 1);   // the practice facility
    const kp = p.p === 'K' || p.p === 'P';
    const retire = kp ? (p.a >= 41 || (p.a >= 38 && p.o < 70 && r() < 0.5)) : (p.a >= 37) || (p.a >= 34 && p.o < (p.p === 'QB' ? 70 : 76) && r() < 0.5) || (p.a >= 32 && p.o < 55 && r() < 0.6);
    if (retire) {
      report.retired.push(p.i); p.lt = p.t; p.ry = L.season; p.peak = Math.max(old, p.peak || 0, ...(p.h || [])); p.t = -2;
      const t = L.teams[p.lt];
      if (p.peak >= 86 || (t && t.owner)) L.news.unshift({ s: L.season, t: 'Retired: ' + p.n + ' (' + p.p + (t ? ', ' + t.nick : '') + ') hangs it up at ' + p.a + ', after peaking at ' + p.peak + '.' });
      return;
    }
    if (p.o - old >= 4) report.up.push(p.i); else if (old - p.o >= 4) report.down.push(p.i);
    if (p.o >= 90 && old < 90 && p.p !== 'OL') report.stars.push(p.i);
  });
  if (L.news.length > 40) L.news.length = 40;
  // old career line is kept in the player's history; season stats reset
  L.lastStats = L.stats; L.stats = {};
  L.teams.forEach(t => { fillDepth(L, t.id, r); });
  L.snaps = {}; L.tsnaps = {};   // a new season counts from zero
  report.sleepers.slice().sort((x, y) => L.players[y].pt - L.players[x].pt).slice(0, 3).forEach(id => { const p = L.players[id], t = L.teams[p.t];
    L.news.unshift({ s: L.season, t: 'Sleeper: ' + p.n + ' (' + p.p + (t ? ', ' + t.nick : '') + ') shows he can be a star (potential ' + p.pt + ', the scouts said ' + p.was + ').' }); });
  return report;
}

/* ---------------- draft ---------------- */
const PROSPECT_POS = { QB: 10, HB: 18, WR: 28, TE: 12, OL: 40, DE: 22, DT: 20, LB: 28, CB: 28, S: 18, K: 4, P: 4, KR: 0, PR: 0 };
/* A class looks like a real one: a few future superstars (potential 93-99), a dozen or so future stars, a lot of starters and more depth.
   Nobody's potential is known for sure: the draft board, the roster and every CPU team see the scouts' estimate (vp), a few points off
   the truth. Some who look like stars are busts with little room to grow, and some late-round looking players are sleepers: the scouts
   rate them low, but they can grow into stars. The true potential (pt) shows after a player's first season (reveal in progress). */
const TIERS = [   // [name, share of the class, rookie rating lo/hi, potential lo/hi]
  ['super', 0.016, 70, 81, 93, 99], ['star', 0.05, 66, 78, 86, 92], ['starter', 0.28, 60, 72, 78, 86], ['depth', 1, 50, 64, 0, 0]
];
const DRAFT_SCOUT = { bust: 0.14, sleeper: 0.13, noise: 3 };
const potSeen = p => p.vp != null ? p.vp : p.pt;   // the potential everybody can see
// real drafts (DATA.DRAFT): how many players each position has round by round, and how good real rookies are by round. Quarterbacks go
// early, and the good ones are more often real stars: a class nearly always has one, and every other class or so a future superstar.
const ROUND_O = [78, 75, 72, 70, 67, 65, 63], ROUND_TIER = [[0.12, 0.3, 0.55], [0.01, 0.1, 0.55], [0, 0.03, 0.4], [0, 0.01, 0.25], [0, 0, 0.15], [0, 0, 0.1], [0, 0, 0.05]], QB_R1 = [0.22, 0.45, 0.33];
function genProspects(L, n) {
  const r = rng(L, 'class' + L.season), list = [], model = DATA.DRAFT.pos, tn = L.teams.length;
  const one = (pos, rd) => {
    const a = ri(r, 21, 23), od = rd <= 7 ? ROUND_TIER[rd - 1] : [0, 0, 0], ch = pos === 'QB' && rd === 1 ? QB_R1 : od, x = r();
    const tier = x < ch[0] ? TIERS[0] : x < ch[0] + ch[1] ? TIERS[1] : x < ch[0] + ch[1] + ch[2] ? TIERS[2] : TIERS[3], mid = rd <= 7 ? ROUND_O[rd - 1] : 58;
    let o = clamp(ri(r, mid - 5, mid + 5) + (tier === TIERS[0] ? 3 : tier === TIERS[3] ? -2 : 0), 45, 86), pt = tier[4] ? ri(r, tier[4], tier[5]) : Math.min(82, o + ri(r, 2, 10)), vp;
    if (pos === 'K' || pos === 'P') { o = clamp(Math.round(52 + (o - 44) * 0.6 + (r() - 0.5) * 6), 50, 82); pt = Math.min(90, o + ri(r, 2, 10)); }   // kickers and punters: a tighter scale
    else if (tier[4] && tier !== TIERS[0] && r() < DRAFT_SCOUT.bust) { vp = pt; pt = o + ri(r, 1, 4); }   // a bust: he looks the part
    else if (!tier[4] && o <= 64 && r() < DRAFT_SCOUT.sleeper) { pt = ri(r, 84, 97); vp = o + ri(r, 2, 6); }   // a sleeper: nobody sees it yet
    if (vp == null) vp = clamp(pt + ri(r, -DRAFT_SCOUT.noise, DRAFT_SCOUT.noise), o, 99);
    pt = Math.max(pt, o); list.push(mkPlayer(L, { p: pos, o, a, pt, vp: Math.max(o, vp), t: -3 }));
  };
  for (let rd = 1; rd <= 8 && list.length < n; rd++) {
    const m = model[String(Math.min(rd, 7))], bag = []; Object.keys(m).forEach(q => { if (POS.indexOf(q) >= 0) for (let k = 0; k < Math.round(m[q] * 10); k++) bag.push(q); });
    for (let k = 0; k < (rd <= 7 ? tn : n) && list.length < n; k++) one(rd === 8 ? pickOf(r, bag) : pickOf(r, bag), rd);
  }
  list.sort((x, y) => (y.o + potSeen(y) * 0.5) - (x.o + potSeen(x) * 0.5));
  return list.map(p => p.i);
}
function draftOrder(L) {
  const R = records(L), po = L.po || { out: {} };
  const score = t => {
    let s = R[t.id].pct * 10;
    if (L.po && L.po.seeds && L.po.seeds[t.id]) s += 10 + (po.out[t.id] || (po.champ === t.id ? 9 : po.runner === t.id ? 8 : 0)) * 1.5;
    return s + (R[t.id].pd || 0) * 0.0001;
  };
  return L.teams.slice().sort((a, b) => score(a) - score(b)).map(t => t.id);
}
function startDraft(L, rounds) {
  rounds = rounds || 7;
  const prospects = genProspects(L, L.teams.length * rounds + 20);
  const order = draftOrder(L), seq = [], from = [];
  ensurePicks(L);
  const own = {}; L.picks.forEach(k => { if (k.y === L.season) own[k.r + ':' + k.o] = k.t; });   // traded picks go to their new owner
  for (let rd = 0; rd < rounds; rd++) order.forEach(tid => { const t = own[(rd + 1) + ':' + tid]; seq.push(t == null ? tid : t); from.push(tid); });
  L.draft = { kind: 'rookie', rounds, seq, from, pos: 0, picks: [], pool: prospects, timer: null };
  L.phase = 'draft';
  if (L.camp) L.draft.hold = 1;   // a campaign draft goes pick by pick, so you can trade up before the player you want is gone
  else autoDraftToHuman(L);
}
function needCtx(L, tid) {
  const ln = lineup(L, tid), n = counts(L.teams[tid].sch), depth = posCount(L, tid), ctx = {};
  POS.forEach(p => {
    const cur = ln[p];
    ctx[p] = { low: cur.length < n[p] || !cur.length ? 0 : Math.min.apply(null, cur.map(x => x.o)), short: n[p] - cur.length, depth: depth[p], top: cur[0] ? cur[0].o : 0 };
  });
  return ctx;
}
function needScore(ctx, p) {
  const c = ctx[p.p];
  return (p.o - c.low) * 0.55 + c.short * 12 + (c.depth < MIN_DEPTH[p.p] ? 2 : 0) + (p.p === 'QB' ? (c.top > p.o ? -10 : 2) : 0);
}
/* salary cap (custom league drafts): each player's price comes from rating and position (lib/draft.js) */
const DRx = () => root.DR || require('./draft.js');
// a player's salary: his real contract (sal, through season cx) when he has one, else the market price for his position and rating
const salOf = p => p.sal != null ? p.sal : DRx().salaryOfPos(p.p, p.o);
const CAP_FILL = 1.0;   // every unfilled pick is assumed to cost about this much, so nobody gets priced out
function capInfo(L, tid) {
  const d = L.draft; if (!d || !d.cap) return null;
  const left = d.seq.slice(d.pos).filter(t => t === tid).length, spent = (d.spent && d.spent[tid]) || 0;
  return { cap: d.cap, spent, left, room: d.cap - spent };
}
function affordable(L, tid, p) {
  const ci = capInfo(L, tid); if (!ci) return true;
  return salOf(p) + Math.max(0, ci.left - 1) * CAP_FILL <= ci.room + 1e-6;
}
// how real teams treat a position at the top of the draft: quarterbacks and edge rushers go early, safeties and tight ends later, kickers last
function draftPrem(pos) {
  const D = DATA.DRAFT, top = D.top[pos] || 0, all = Object.values(D.pos).reduce((t, m) => t + (m[pos] || 0), 0);
  return top ? clamp(3 * Math.log2((top / 10) / Math.max(0.005, all / 256)), -7, 8) : -13;
}
// a rookie draft pick: what he is and can become, how real teams rate his position, and how much he fills a hole (more so for your auto-draft)
function rookieScore(L, tid, p, ctx) {
  const c = ctx[p.p], seen = potSeen(p), future = p.o + (seen - p.o) * 0.5, mine = L.teams[tid].owner ? 1.6 : 1;
  let need = Math.max(0, future - c.low) * 0.5 * POS_W[p.p] + c.short * 12;
  if (c.depth >= (MIN_DEPTH[p.p] || 1) + 3) need -= 5;
  if (p.p === 'QB' && c.top >= seen) need -= 12;
  if ((p.p === 'K' || p.p === 'P') && c.top >= 72) need -= 15;
  return p.o * 0.6 + seen * 0.5 - (p.a - 21) * 0.4 + draftPrem(p.p) + need * mine;
}
function cpuPickFor(L, tid, pool) {
  if (L.draft && L.draft.kind === 'rookie' && L.camp) { const cx = needCtx(L, tid); let b = null, bv = -1e9; pool.forEach(id => { const v = rookieScore(L, tid, L.players[id], cx); if (v > bv) { bv = v; b = id; } }); return b; }
  const ctx = needCtx(L, tid), ci = L.draft && L.draft.kind === 'league' ? capInfo(L, tid) : null;
  const fair = ci ? Math.max(1, (ci.room - ci.left * CAP_FILL) / Math.max(1, ci.left)) : 0;
  let best = null, bs = -1e9;
  pool.forEach(id => {
    const p = L.players[id];
    if (ci && !affordable(L, tid, p)) return;
    let s = p.o * 0.9 + (potSeen(p) - p.o) * 0.35 - (p.a - 21) * 0.4 + needScore(ctx, p);   // (CPU scouts see what you see)
    if (ci) s -= 1.1 * Math.max(0, salOf(p) - 1.7 * fair);
    if (s > bs) { bs = s; best = id; }
  });
  return best;
}
/* ---------------- unit league drafts ----------------
   d.units[id] = { k: 'OL' | 'DEF', fr, ids, sch, name } for ids 'u:OL:<franchise>' / 'u:DEF:<franchise>'. A team takes exactly one of each;
   its other starting spots (QB, HB, 2 WR, TE, K, P) and its depth come one player at a time. */
const UNIT = 'u:', UNIT_POS = { OL: ['OL'], DEF: ['DE', 'DT', 'LB', 'CB', 'S'] }, UNIT_ROUNDS = [12, 20], SOLO = { QB: 1, HB: 1, WR: 2, TE: 1, K: 1, P: 1 };
const isUnitId = id => typeof id === 'string' && id.indexOf(UNIT) === 0;
const unitOf = (L, id) => L.draft && L.draft.units && L.draft.units[id] || null;
function unitRating(L, u) {   // the starters' average: the best 5 linemen, or the best 11 by the unit's scheme
  const ps = u.ids.map(id => L.players[id]).sort((a, b) => b.o - a.o);
  const top = u.k === 'OL' ? ps.slice(0, 5) : ['DE', 'DT', 'LB', 'CB', 'S'].reduce((a, g) => a.concat(ps.filter(p => p.p === g).slice(0, counts(u.sch)[g])), []);
  return top.length ? Math.round(top.reduce((t, p) => t + p.o, 0) / top.length) : 0;
}
const draftOvr = (L, id) => { const u = unitOf(L, id); return u ? unitRating(L, u) : L.players[id] ? L.players[id].o : 0; };
const salOfId = (L, id) => { const u = unitOf(L, id); return u ? Math.round(u.ids.reduce((t, x) => t + salOf(L.players[x]), 0) * 10) / 10 : salOf(L.players[id]); };
function draftLabel(L, id) { const u = unitOf(L, id); if (u) return u.name + ' (' + u.ids.length + ' players, ' + unitRating(L, u) + ')'; const p = L.players[id]; return p ? p.n + ' (' + p.p + ' ' + p.o + ')' : '?'; }
// what a team still needs to fill its starting spots: its O-line and defense units, and players at the other starting spots
function unitNeeds(L, tid) {
  const d = L.draft, have = { OL: 0, DEF: 0 }, solo = Object.assign({}, SOLO);
  d.picks.forEach(x => { if (x.t !== tid) return; const u = d.units[x.p]; if (u) have[u.k]++; else { const p = L.players[x.p]; if (p && solo[p.p] > 0) solo[p.p]--; } });
  return { units: have, solo, short: (have.OL ? 0 : 1) + (have.DEF ? 0 : 1) + Object.values(solo).reduce((t, n) => t + n, 0) };
}
function canDraftId(L, tid, id) {
  const d = L.draft, left = d.seq.slice(d.pos).filter(t => t === tid).length, nd = unitNeeds(L, tid), u = unitOf(L, id);
  if (u && nd.units[u.k]) return false;   // one O-line and one defense each
  const p = u ? null : L.players[id]; if (!u && !p) return false;
  const fills = u ? true : (nd.solo[p.p] || 0) > 0;
  return left - 1 >= nd.short - (fills ? 1 : 0);
}
// what each pick still to come will cost: the average of the cheapest players left, as many as there are picks to fill
// (linemen and defenders come in units, so the cheap fringe players of a player draft are not there to fill the last rounds)
function fillPrice(L) {
  const d = L.draft;
  const unitsLeft = L.teams.reduce((t, x) => { const nd = unitNeeds(L, x.id); return t + (nd.units.OL ? 0 : 1) + (nd.units.DEF ? 0 : 1); }, 0), n = Math.max(0, d.seq.length - d.pos - unitsLeft);
  if (!n) return 0;
  const cheap = d.pool.filter(id => !isUnitId(id)).map(id => salOf(L.players[id])).sort((a, b) => a - b).slice(0, n);
  return cheap.length ? Math.max(CAP_FILL * 0.8, cheap.reduce((t, x) => t + x, 0) / cheap.length) : CAP_FILL;
}
function affordableId(L, tid, id, fp) {
  const ci = capInfo(L, tid); if (!ci) return true;
  return salOfId(L, id) + Math.max(0, ci.left - 1) * (fp == null ? fillPrice(L) : fp) <= ci.room + 1e-6;
}
// the computer's pick in a unit draft (CPU teams, and managers on auto-draft): the best starting lineup the cap still allows, worked out over
// every open starting spot (each weighted by how much it moves the team rating, lib/draft.js W), then the planned pick that would be hardest to
// replace if someone else took it. With every starting spot filled it picks depth: the best player it needs that it can afford.
const PLAN_W = k => { const W = DRx().W; return { QB: W.QB, HB: W.HB, WR: W.WR, TE: W.TE, OL: W.OL, DEF: W.DEF, K: W.K, P: W.ST }[k]; };
function unitPlan(L, tid, without) {
  const d = L.draft, nd = unitNeeds(L, tid), ci = capInfo(L, tid), left = d.seq.slice(d.pos).filter(t => t === tid).length, fp = ci ? fillPrice(L) : 0;
  const slots = ['OL', 'DEF'].filter(k => !nd.units[k]).map(k => [k, 1]).concat(Object.keys(nd.solo).filter(k => nd.solo[k] > 0).map(k => [k, nd.solo[k]]));
  if (!slots.length) return null;
  const pool = k => d.pool.filter(id => id !== without && (k === 'OL' || k === 'DEF' ? (unitOf(L, id) || {}).k === k : !isUnitId(id) && L.players[id].p === k) && affordableId(L, tid, id, fp))
    .map(id => ({ id, k, ovr: draftOvr(L, id), sal: ci ? salOfId(L, id) : 0 }));
  if (!ci) {
    const pick = {}; let value = 0;
    slots.forEach(([k, n]) => { pick[k] = pool(k).sort((a, b) => b.ovr - a.ovr).slice(0, n); pick[k].forEach(c => { value += PLAN_W(k) * c.ovr; }); });
    return slots.every(([k, n]) => pick[k].length === n) ? { value, pick } : null;
  }
  const U10 = x => Math.round(x * 10), B = U10(ci.room - Math.max(0, left - slots.reduce((t, x) => t + x[1], 0)) * fp);
  if (B < 0) return null;
  const groups = slots.map(([k, n]) => {
    const f = DRx().frontier(pool(k), n), opts = [];
    if (n === 1) f.forEach(c => opts.push({ cost: U10(c.sal), val: PLAN_W(k) * c.ovr, cs: [c] }));
    else for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) opts.push({ cost: U10(f[i].sal) + U10(f[j].sal), val: PLAN_W(k) * (f[i].ovr + f[j].ovr), cs: [f[i], f[j]] });
    return { k, opts };
  });
  return DRx().knapsack(groups, B);
}
function hasLegalPick(L, tid) { const d = L.draft, fp = d.cap ? fillPrice(L) : 0; return d.pool.some(id => canDraftId(L, tid, id) && affordableId(L, tid, id, fp)); }
function autoPickFor(L, tid) {
  const d = L.draft, fp = d.cap ? fillPrice(L) : 0, ok = id => canDraftId(L, tid, id) && affordableId(L, tid, id, fp);
  const plan = unitPlan(L, tid);
  if (plan) {
    const cand = Object.keys(plan.pick).map(k => {
      const c = plan.pick[k].slice().sort((a, b) => b.ovr - a.ovr)[0], alt = unitPlan(L, tid, c.id);
      return { c, loss: alt ? plan.value - alt.value : Infinity };
    }).sort((a, b) => b.loss - a.loss || PLAN_W(b.c.k) - PLAN_W(a.c.k));
    for (const x of cand) if (ok(x.c.id)) return x.c.id;
  }
  // depth: first the positions still under their minimum (a second quarterback, running back, four receivers, two tight ends),
  // never a second kicker or punter, and no more than a sensible number at any spot; the best player that fits
  const c = posCount(L, tid), most = { QB: 3, HB: 4, WR: 6, TE: 3, K: 1, P: 1, KR: 1, PR: 1 };
  const solo = d.pool.filter(id => !isUnitId(id) && ok(id)).map(id => L.players[id]).filter(p => (c[p.p] || 0) < (most[p.p] || 2));
  const short = solo.filter(p => (c[p.p] || 0) < MIN_DEPTH[p.p]);
  const best = (short.length ? short : solo).sort((a, b) => b.o - a.o)[0];
  if (best) return best.i;
  // nothing within those limits fits the room left: the cheapest legal player at the position the team is thinnest at
  const rest = d.pool.filter(id => !isUnitId(id) && ok(id)).map(id => L.players[id]).sort((a, b) => ((c[a.p] || 0) >= (most[a.p] || 2)) - ((c[b.p] || 0) >= (most[b.p] || 2)) || ((c[a.p] || 0) - (MIN_DEPTH[a.p] || 1)) - ((c[b.p] || 0) - (MIN_DEPTH[b.p] || 1)) || salOf(a) - salOf(b) || b.o - a.o);
  // (a third punter helps nobody: when only players over those limits are left, the pick passes)
  return rest.length && (c[rest[0].p] || 0) < (most[rest[0].p] || 2) ? rest[0].i : null;
}
function onClock(L) { const d = L.draft; return d && d.pos < d.seq.length ? d.seq[d.pos] : null; }
function draftPick(L, tid, pid) {
  const d = L.draft; if (!d || onClock(L) !== tid) return false;
  const k = d.pool.indexOf(pid); if (k < 0) return false;
  if (d.units) {   // a unit league: whole O-lines and defenses, players one by one for the rest
    if (!canDraftId(L, tid, pid) || !affordableId(L, tid, pid)) return false;
    if (d.cap) { d.spent = d.spent || {}; d.spent[tid] = Math.round(((d.spent[tid] || 0) + salOfId(L, pid)) * 10) / 10; }
    d.pool.splice(k, 1); d.picks.push({ t: tid, p: pid, n: d.pos + 1 });
    const u = d.units[pid];
    if (u) { u.ids.forEach(id => { L.players[id].t = tid; }); if (u.k === 'DEF') L.teams[tid].sch = u.sch; }   // the defense brings its scheme
    else L.players[pid].t = tid;
    d.pos++;
    if (d.pos >= d.seq.length) finishDraft(L);
    return true;
  }
  const p = L.players[pid];
  if (d.kind === 'league') { if (!canDraftPos(L, tid, p.p) || !affordable(L, tid, p)) return false; if (d.cap) { d.spent = d.spent || {}; d.spent[tid] = Math.round(((d.spent[tid] || 0) + salOf(p)) * 10) / 10; } }
  d.pool.splice(k, 1); d.picks.push({ t: tid, p: pid, n: d.pos + 1 });
  p.t = tid; if (d.kind === 'rookie') p.y = L.season;
  if (d.kind === 'rookie' && L.camp) { p.sal = DRx().salaryOfPos(p.p, p.o); p.cx = L.season + 4; }   // a rookie deal
  d.pos++;
  if (d.pos >= d.seq.length) finishDraft(L);
  return true;
}
// in a player draft a team must always be able to still fill every starting spot
function canDraftPos(L, tid, pos) {
  const d = L.draft, left = d.seq.slice(d.pos).filter(t => t === tid).length;
  const need = counts(L.teams[tid].sch), ln = lineup(L, tid);
  let short = 0; POS.forEach(p => { short += Math.max(0, need[p] - ln[p].length); });
  const fills = ln[pos].length < need[pos];
  return left - (fills ? 1 : 0) >= short - (fills ? 1 : 0) + 0 && (left > short || fills);
}
function autoDraftToHuman(L) {
  const d = L.draft;
  if (d.hold) return false;
  while (d.pos < d.seq.length) {
    const tid = d.seq[d.pos];
    if (d.units && !hasLegalPick(L, tid)) { d.passed = (d.passed || 0) + 1; d.pos++; if (d.pos >= d.seq.length) finishDraft(L); continue; }   // nothing it may take or afford: the pick passes
    if (L.teams[tid].owner && !d.auto) return false;
    if (L.teams[tid].owner && d.auto && d.auto[tid] !== true && d.auto.all !== true) return false;
    let pid = null;
    if (d.units) pid = autoPickFor(L, tid);
    else if (d.kind === 'league') {
      const ok = d.pool.filter(id => affordable(L, tid, L.players[id]) && canDraftPos(L, tid, L.players[id].p));
      pid = cpuPickFor(L, tid, ok.length ? ok : d.pool);
    } else pid = cpuPickFor(L, tid, d.pool);
    if (pid == null || !draftPick(L, tid, pid)) { d.pos++; if (d.pos >= d.seq.length) finishDraft(L); }
    if (L.phase !== 'draft') return true;
    if (d.limit && --d.limit <= 0) return true;
  }
  return true;
}
function finishDraft(L) {
  const d = L.draft;
  L.teams.forEach(t => {
    fillDepth(L, t.id);
    if (!t.owner) trimRoster(L, t.id);
  });
  if (d.kind === 'league') { L.phase = 'preseason'; }
  else { L.phase = 'preseason'; }
  // undrafted prospects become free agents
  Object.values(L.players).forEach(p => { if (p.t === -3) { p.t = -1; } });
  d.done = true;
  if (d.kind === 'rookie' && L.picks) L.picks = L.picks.filter(k => k.y !== L.season);   // this year's picks are spent
}
function trimRoster(L, tid) {
  let r = activeRoster(L, tid);
  const need = counts(L.teams[tid].sch);
  while (r.length > ROSTER_MAX) {
    // release lowest-value player that is not needed for depth
    const c = posCount(L, tid);
    const cand = r.filter(p => c[p.p] > MIN_DEPTH[p.p]).sort((a, b) => playerValue(a) - playerValue(b))[0] || r.sort((a, b) => a.o - b.o)[0];
    cand.t = -1; r = activeRoster(L, tid);
  }
}
function startSeason(L) {
  const prevRanks = L.sched && L.sched.some(g => g.done && g.pl === 'reg') ? divisionRanks(L) : null;   // last season's division standings set this season's schedule
  L.season++;
  L.week = 1; L.phase = 'regular'; L.po = null; L.draft = null;
  ensurePicks(L);   // the window rolls forward: a new year of picks appears
  L.teams.forEach(t => { if (!t.owner || L.cfg && L.cfg.autoTrim) trimRoster(L, t.id); });
  Object.values(L.players).forEach(p => { if (p.t === -1 && p.o < 48) delete L.players[p.i]; });
  if (L.camp) campSeasonStart(L);
  L.sched = L.cfg && L.cfg.kind === 'custom' ? customSchedule(L) : nflSchedule(L, false, prevRanks);
  if (!(L.cfg && L.cfg.kind === 'custom')) L.lastWeek = Math.max.apply(null, L.sched.map(g => g.w));
  // refresh free agents
  const r = rng(L, 'fa' + L.season);
  for (let k = 0; k < 28; k++) { const pos = pickOf(r, FA_BAG), a = ri(r, 23, 32), o = SPECIAL[pos] && pos !== 'KR' && pos !== 'PR' ? ri(r, 56, 72) : ri(r, 50, 70); mkPlayer(L, { p: pos, o, a, pt: potFor(r, o, a), t: -1 }); }
}
function offseasonBegin(L, rounds) {
  L.faOn = !!L.camp;
  const rep = progress(L);
  L.progress = rep;
  if (L.camp) { campOffseason(L, rep); faStart(L, rounds || 7); }
  else startDraft(L, rounds || 7);
  L.faOn = false;
  return rep;
}

/* ---------------- draft picks ---------------- */
// Every team always owns one pick per round for the next three drafts it can still trade. A pick is { y: draft year, r: round, o: original team, t: owner }.
// The draft for season Y is held after season Y is played, so the nearest pick is this season's; once that draft has started its picks are locked
// (and then spent), so the window moves on a year and a new year of picks appears right away.
const PICK_YEARS = 3, PK = 'pk:';
const isPick = id => typeof id === 'string' && id.indexOf(PK) === 0;
const pickId = k => PK + k.y + ':' + k.r + ':' + k.o;
function pickRounds(L) { return L.cfg && L.cfg.kind === 'custom' ? Math.max(1, Math.min(7, L.cfg.rookieRounds || 3)) : 7; }
function ensurePicks(L) {
  if (!L.dpos) upgradePositions(L);   // (every load of a league or campaign passes here)
  if (!L.teams || !L.teams.length) return;
  L.picks = L.picks || [];
  const have = {}; L.picks.forEach(k => { have[k.y + ':' + k.r + ':' + k.o] = 1; });
  const first = L.season + (pickYearLocked(L) ? 1 : 0);   // this year's picks stop counting once its draft has started
  for (let y = first; y < first + PICK_YEARS; y++) {
    for (let r = 1; r <= pickRounds(L); r++) L.teams.forEach(t => { if (!have[y + ':' + r + ':' + t.id]) L.picks.push({ y, r, o: t.id, t: t.id }); });
  }
}
function pickOf_(L, id) {
  if (!isPick(id) || !L.picks) return null;
  const a = id.split(':'), y = +a[1], r = +a[2], o = +a[3];
  return L.picks.find(k => k.y === y && k.r === r && k.o === o) || null;
}
function picksOf(L, tid) { ensurePicks(L); return L.picks.filter(k => k.t === tid).sort((a, b) => a.y - b.y || a.r - b.r || a.o - b.o); }
// can a pick still be traded? (a draft that has started is locked)
function pickYearLocked(L) { return (L.phase === 'draft' && !L.camp) || L.phase === 'preseason' || !!(L.draft && L.draft.done && L.draft.kind === 'rookie'); }
function pickOpen(L, k) {
  if (k.y === L.season && L.camp && L.phase === 'draft' && L.draft && !L.draft.done) return draftSlot(L, k) >= L.draft.pos;   // draft-day trades: a pick not used yet
  return !(k.y === L.season && pickYearLocked(L));
}
// where a pick of this year's draft sits in the running order
function draftSlot(L, k) { const d = L.draft, n = L.teams.length, i = d.from.slice(0, n).indexOf(k.o); return i < 0 ? -1 : (k.r - 1) * n + i; }
// how many drafts away a pick is: 0 for the next draft still to be held (next year's once this year's has started)
function draftsAhead(L, k) { return Math.max(0, k.y - L.season - (pickYearLocked(L) ? 1 : 0)); }
// how strong a team looks: its lineup rating, blended with its record as the season goes on. Returns 0 (worst) .. 1 (best) per team id,
// plus .ovr: the lineup rating alone, which is what picks for later drafts go by (this season's record says little about them)
function strengthFrac(L) {
  const R = records(L), ids = L.teams.map(t => t.id), n = ids.length;
  if (n < 2) return {};
  const ovr = {}; ids.forEach(id => { ovr[id] = teamRating(L, id).ovr; });
  const byOvr = ids.slice().sort((a, b) => ovr[a] - ovr[b]);
  const gpMax = Math.max(1, ...ids.map(id => R[id].w + R[id].l + R[id].t)), gpTot = Math.max(1, L.lastWeek || 17);
  const w = L.phase === 'regular' || L.phase === 'playoffs' ? Math.min(0.7, gpMax / gpTot) : 0;
  const byRec = ids.slice().sort((a, b) => R[a].pct - R[b].pct || R[a].pd - R[b].pd);
  const f = {}; ids.forEach(id => { f[id] = (byOvr.indexOf(id) * (1 - w) + byRec.indexOf(id) * w) / (n - 1); });
  Object.defineProperty(f, 'ovr', { value: {} }); ids.forEach(id => { f.ovr[id] = byOvr.indexOf(id) / (n - 1); });
  return f;
}
// where a pick is expected to land: overall slot (1 = first pick) and the fraction through its round
function pickProjection(L, k, fr) {
  const n = L.teams.length, rounds = pickRounds(L), ahead = draftsAhead(L, k);
  let frac;   // 0 = the team picks first in the round, 1 = last
  const known = k.y === L.season && (L.phase === 'offseason' || L.phase === 'draft' || L.phase === 'fa');   // the order is set once the season is over
  if (known) { const ord = draftOrder(L); frac = n > 1 ? ord.indexOf(k.o) / (n - 1) : 0.5; }
  else {
    fr = fr || strengthFrac(L);
    const m = ahead > 0 && fr.ovr ? fr.ovr : fr;   // later drafts: by the team's overall rating
    frac = m[k.o] == null ? 0.5 : m[k.o];          // strong teams pick late
  }
  const slot = Math.round(frac * (n - 1)) + 1, overall = (k.r - 1) * n + slot;
  return { frac, slot, overall, known };
}
// value in the same units as playerValue: what a rookie taken in that slot is expected to be worth, discounted for risk.
// How far away the draft is does not matter: a pick for a later draft is worth what its projected slot (from the team's rating) is worth
function pickValue(L, k, fr) {
  const av = DATA.DRAFT.av, pj = pickProjection(L, k, fr), slot = clamp(Math.round(pj.overall * 32 / L.teams.length), 1, av.length);
  return 130 * Math.pow(av[slot - 1], 2.2) + 0.5;   // what real picks went on to do (draft_picks), bent so the top of the board is worth far more
}
function pickLabel(L, k) {
  const own = k.o === k.t ? '' : ' (' + L.teams[k.o].abbr + ')', at = L.camp && L.phase === 'draft' && L.draft && !L.draft.done && k.y === L.season ? ' (#' + (draftSlot(L, k) + 1) + ')' : '';
  return k.y + ' round ' + k.r + at + own;
}
// value of any tradeable asset id (player or pick)
function assetValue(L, id, fr) {
  if (isPick(id)) { const k = pickOf_(L, id); return k ? pickValue(L, k, fr) : 0; }
  return L.players[id] ? playerValue(L.players[id]) : 0;
}

/* ---------------- trades and free agency ---------------- */
const POS_W = { QB: 1.5, HB: 0.8, WR: 0.9, TE: 0.7, OL: 0.8, DE: 1, DT: 0.9, LB: 0.75, CB: 0.85, S: 0.65, K: 0.45, P: 0.3, KR: 0.35, PR: 0.3 };
function playerValue(p) {
  if (p.inj) return playerValue(Object.assign({}, p, { inj: 0 })) * (p.inj >= SEASON_OUT ? 0.25 : Math.max(0.3, 1 - p.inj / 12));   // out for weeks: worth less
  const age = p.p === 'QB' ? p.a - 3 : p.a;   // (quarterbacks last)
  const ageF = age <= 25 ? 1.15 : age <= 28 ? 1 : age <= 30 ? 0.85 : age <= 32 ? 0.62 : 0.4;
  const base = Math.pow(Math.max(0, p.o - 48), 1.9) * 0.08;
  return base * POS_W[p.p] * ageF * (1 + Math.max(0, potSeen(p) - p.o) * 0.02) + 0.5;
}
function tradeCheck(L, ta, tb, give, get) {
  // give: ids leaving ta for tb; get: ids leaving tb for ta. An id is a player or a draft pick ("pk:year:round:team").
  if (!give.length && !get.length) return 'Pick at least one player or pick.';
  ensurePicks(L);
  if (new Set(give.concat(get)).size !== give.length + get.length) return 'The same asset is listed twice.';
  for (const id of give.concat(get)) if (isPick(id)) { const k = pickOf_(L, id); if (!k || !pickOpen(L, k)) return 'That pick is not available.'; }
  for (const id of give) if (isPick(id) ? pickOf_(L, id).t !== ta : (!L.players[id] || L.players[id].t !== ta)) return isPick(id) ? 'A pick is no longer owned by that team.' : 'A player is no longer on the team.';
  for (const id of get) if (isPick(id) ? pickOf_(L, id).t !== tb : (!L.players[id] || L.players[id].t !== tb)) return isPick(id) ? 'A pick is no longer owned by that team.' : 'A player is no longer on the team.';
  give = give.filter(id => !isPick(id)); get = get.filter(id => !isPick(id));
  const nIR = (ids) => ids.filter(id => L.players[id] && L.players[id].ir).length;   // a player on IR moves without taking an active spot
  const na = activeRoster(L, ta).length - (give.length - nIR(give)) + (get.length - nIR(get)), nb = activeRoster(L, tb).length - (get.length - nIR(get)) + (give.length - nIR(give));
  // a person has to make room first (rosters start full at 53); a CPU team cuts its least valuable player after the trade (doTrade)
  const over = (tid, n) => n > ROSTER_MAX && L.teams[tid].owner;
  const full = over(ta, na) ? ta : over(tb, nb) ? tb : null;
  if (full != null) return 'That trade would put the ' + L.teams[full].nick + ' over ' + ROSTER_MAX + ' players. Release someone first.';
  const sim = (tid, out, inn) => {
    const c = posCount(L, tid);
    out.forEach(id => { c[L.players[id].p]--; }); inn.forEach(id => { c[L.players[id].p]++; });
    const need = counts(L.teams[tid].sch);
    return POS.every(p => c[p] >= need[p]);
  };
  if (!sim(ta, give, get)) return L.teams[ta].nick + ' would be short of starters at a position.';
  if (!sim(tb, get, give)) return L.teams[tb].nick + ' would be short of starters at a position.';
  return null;
}
/* how a CPU team judges a deal: by its own depth chart, not by adding up values.
   A player it receives counts in full if he would start there, for much less as a backup, unless he is a young player still growing.
   A package adds up less and less: the best piece counts in full, the next ones for a fraction (picks hold up better), so a pile of
   small pieces never makes up a star. Its own starters cost full price (top players a premium), plus what the lineup loses without them.
   Then the rules no price gets around: it keeps a starting quarterback, it does not open a big hole in the lineup, a star needs a real
   piece coming back, and the deal has to fill a need or add something for the future. */
const TRADE = { inStart: 1, inBackup: 0.35, inDeep: 0.12, outBackup: 0.6, outDeep: 0.35, young: 0.75, ladder: [1, 0.7, 0.45, 0.25, 0.15], pickLadder: [1, 0.85, 0.7, 0.5, 0.3], topO: 90, topPrem: 1.25, starV: 60, centre: 0.5, qbDrop: 5, hole: 15, holePrem: 1.5 };
const growing = p => p.a <= 25 && potSeen(p) > p.o + 3;
// where a player ranks at his position on a team, by rating (a hurt starter is still the starter)
function depthRank(L, tid, p) { return rosterOf(L, tid).filter(x => x.p === p.p && x !== p && x.o > p.o).length; }
function tradeEval(L, tid, receive, send, fr) {
  fr = fr || strengthFrac(L);
  const T = L.teams[tid], need = counts(T.sch), rp = receive.filter(id => !isPick(id)).map(id => L.players[id]), sp = send.filter(id => !isPick(id)).map(id => L.players[id]);
  const tops = pos => rosterOf(L, tid).filter(x => x.p === pos).map(x => x.o).sort((a, b) => b - a).slice(0, need[pos] || 0);
  const posns = Array.from(new Set(rp.concat(sp).map(x => x.p))), was = {}; posns.forEach(q => { was[q] = tops(q); });
  const before = lineupScore(L, tid), cnt0 = posCount(L, tid);
  const mode = T.mode || '', keep = x => mode === 'rebuild' ? (x.a >= 28 ? 0.7 : x.a <= 25 ? 1.2 : 1) : mode === 'win' && depthRank(L, tid, x) < (need[x.p] || 0) ? 1.15 : 1;   // rebuilders sell their veterans, win-now teams hold on to their starters
  const outs = sp.map(x => { const r = depthRank(L, tid, x), n = need[x.p] || 0, v = playerValue(x) * keep(x); return { p: x, starter: r < n, v: v * (r < n ? (x.o >= TRADE.topO && mode !== 'rebuild' ? TRADE.topPrem : 1) : Math.max(r === n ? TRADE.outBackup : TRADE.outDeep, growing(x) ? TRADE.young + 0.05 : 0)) }; });
  const snap = rp.concat(sp).map(x => [x, x.t]);
  rp.forEach(x => { x.t = tid; }); sp.forEach(x => { x.t = -9; });
  const after = lineupScore(L, tid), now = {}; posns.forEach(q => { now[q] = tops(q); });
  const ins = rp.map(x => { const r = depthRank(L, tid, x), n = need[x.p] || 0, thin = r === n && cnt0[x.p] <= n; return { id: x.i, p: x, starter: r < n || thin, v: playerValue(x) * Math.max(r < n ? TRADE.inStart : r === n ? TRADE.inBackup : TRADE.inDeep, growing(x) ? TRADE.young : 0) }; });
  snap.forEach(q => { q[0].t = q[1]; });
  if (send.some(isPick) && mode !== 'win') ins.forEach(x => { if (x.p.a >= 31) x.v *= 0.6; });   // a team does not spend picks, its future, on a player near the end of his career (a win-now team will)
  ins.forEach(x => { if (mode === 'rebuild') x.v *= x.p.a >= 29 ? 0.55 : x.p.a <= 25 ? 1.2 : 1; else if (mode === 'win' && x.starter && x.p.a <= 32) x.v *= 1.25; });
  const pickF = mode === 'rebuild' ? 1.35 : mode === 'win' ? 0.72 : 1;   // what a pick is worth to it: rebuilders want them, win-now teams spend them
  const pks = receive.filter(isPick).map(id => ({ id, pick: 1, v: assetValue(L, id, fr) * pickF }));
  const all = ins.concat(pks).sort((a, b) => b.v - a.v);
  const inV = all.reduce((t, x, i) => t + x.v * (x.pick ? TRADE.pickLadder : TRADE.ladder)[Math.min(i, 4)], 0);
  const outV = outs.reduce((t, x) => t + x.v, 0) + send.filter(isPick).reduce((t, id) => t + assetValue(L, id, fr) * pickF, 0);
  const worth = inV - outV + (after - before) * 0.9, sum = a => a.reduce((t, v) => t + v, 0), nick = T.nick;
  // the starting quarterback stays, unless his replacement is about as good
  if (sp.some(x => x.p === 'QB') && (was.QB[0] || 0) - (now.QB[0] || 0) > TRADE.qbDrop && sp.some(x => x.p === 'QB' && x.o === was.QB[0] && !(mode === 'rebuild' && x.a >= 32))) return { worth, fixed: 1, why: nick + ' will not move their starting quarterback without a starter coming back.' };
  for (const q of posns) { const drop = sum(was[q]) - sum(now[q]); if (q !== 'QB' && mode !== 'rebuild' && drop > TRADE.hole && outs.some(x => x.starter && x.p.p === q)) if (inV < outV * TRADE.holePrem) return { worth, hole: 1, why: nick + ' will not open a hole at ' + q + ' without a rich return: they have nobody to replace him.' }; }
  // a star needs a real piece back
  const star = outs.filter(x => x.starter).sort((a, b) => playerValue(b.p) - playerValue(a.p))[0], sv = star ? playerValue(star.p) : 0;
  if (sv >= TRADE.starV) { const best = Math.max(0, ...ins.map(x => x.v), pks.slice().sort((a, b) => b.v - a.v).slice(0, 3).reduce((t, x) => t + x.v, 0)); if (best < sv * TRADE.centre) return { worth, why: nick + ' want a real centerpiece back for ' + star.p.n + '.' }; }
  // it has to fill a need or add something for the future
  if (rp.length && !pks.length && !ins.some(x => x.starter || growing(x.p))) return { worth, why: nick + ' are already set at ' + rp[0].p + '.' };
  return { worth };
}
function lineupScore(L, tid) {
  const ln = lineup(L, tid); let s = 0;
  POS.forEach(p => { if (p !== 'KR' && p !== 'PR') ln[p].forEach(x => { s += playerValue(x) * 0.5; }); });   // the returner is already counted at his own position
  return s;
}
// CPU decides on a user proposal. Returns { ok, msg, margin }. fr: strengthFrac(L), when the caller already has it (it is slow to work out)
function cpuTrade(L, userTid, cpuTid, give, get, fr) {
  const bad = tradeCheck(L, userTid, cpuTid, give, get);
  if (bad) return { ok: false, msg: bad };
  fr = fr || strengthFrac(L);
  const ev = tradeEval(L, cpuTid, give, get, fr), w = ev.worth;
  if (ev.why) return { ok: false, msg: ev.why, margin: w };
  const tot = give.concat(get).reduce((t, id) => t + assetValue(L, id, fr), 0), need = Math.max(Math.min(2, tot * 0.1), 0.06 * tot);
  if (w >= need) return { ok: true, msg: L.teams[cpuTid].nick + ' accept the trade.', margin: w };
  return { ok: false, msg: w > 0 ? L.teams[cpuTid].nick + ' want a little more.' : L.teams[cpuTid].nick + ' turn it down.', margin: w };
}
function doTrade(L, ta, tb, give, get) {
  const mv = (id, to) => { if (isPick(id)) { const k = pickOf_(L, id); k.t = to; if (L.draft && !L.draft.done && L.phase === 'draft' && k.y === L.season) { const i = draftSlot(L, k); if (i >= 0) L.draft.seq[i] = to; } } else L.players[id].t = to; };
  give.forEach(id => mv(id, tb)); get.forEach(id => mv(id, ta));
  give.concat(get).forEach(id => { if (L.players[id]) delete L.players[id].st; });   // the new team decides who starts
  [ta, tb].forEach(tid => { if (!L.teams[tid].owner) trimRoster(L, tid); });   // a CPU team over 53 cuts its least valuable player
  const np = give.concat(get).filter(isPick).length, nm = give.length + get.length - np;
  L.news.unshift({ s: L.season, t: L.teams[ta].nick + ' and ' + L.teams[tb].nick + ' complete a trade (' + [nm ? nm + ' player' + (nm > 1 ? 's' : '') : '', np ? np + ' pick' + (np > 1 ? 's' : '') : ''].filter(Boolean).join(' and ') + ').' });
  if (L.news.length > 40) L.news.length = 40;
}
function canTrade(L) {
  if (L.cfg && L.cfg.trades === false) return false;
  if (L.phase === 'regular') return L.week <= (L.cfg && L.cfg.deadline != null ? L.cfg.deadline : TRADE_DEADLINE);
  return L.phase === 'preseason' || L.phase === 'offseason' || L.phase === 'draft' || L.phase === 'fa';
}
/* what a team needs and where it has plenty: a position's weakest starter against what a good starter is (weighted by how much the position
   matters), and a position where a backup is about as good as the weakest starter */
function teamNeeds(L, tid) {
  const ln = lineup(L, tid), need = counts(L.teams[tid].sch), out = [], deep = [];
  POS.forEach(q => {
    const n = need[q] || 0; if (!n || q === 'KR' || q === 'PR') return;
    const st = rosterOf(L, tid).filter(x => x.p === q).sort((a, b) => b.o - a.o), low = ln[q].length >= n ? Math.min(...ln[q].map(x => x.o)) : 40;
    const gap = ((q === 'QB' ? 82 : 76) - low) * POS_W[q];
    if (gap > 0) out.push({ p: q, gap });
    else if (st[n] && st[n].o >= low - 4 && st[n].o >= 70) deep.push(q);   // real depth: a backup who could start, at a position that is not a need
  });
  return { needs: out.sort((a, b) => b.gap - a.gap).map(x => x.p), deep };
}
// what you can pay with without hurting yourself: your spare players and your picks (a starter only when his backup can step in), cheapest first
function payAssets(L, tid, opt, fr) {
  const need = counts(L.teams[tid].sch), ok = p => {
    if (p.p === opt.pos || p.ir) return false;
    const st = rosterOf(L, tid).filter(x => x.p === p.p).sort((a, b) => b.o - a.o), r = st.indexOf(p), n = need[p.p] || 0;
    return r >= n || (st[n] && st[n].o >= p.o - (opt.sell ? 8 : 3));
  };
  return rosterOf(L, tid).filter(ok).map(p => p.i).concat(picksOf(L, tid).filter(k => pickOpen(L, k)).map(pickId)).map(id => ({ id, v: assetValue(L, id, fr) })).sort((a, b) => a.v - b.v);
}
// the cheapest fair package for what a CPU team is giving up: one piece, what it needs first, then two that add up
function fairPrice(L, userTid, tid, get, pay, fr) {
  const want = get.reduce((t, id) => t + assetValue(L, id, fr), 0), ok = give => cpuTrade(L, userTid, tid, give, get, fr).ok;
  const one0 = pay.filter(m => m.v >= want * 0.7 && m.v <= want * 1.4), wanted = one0.length > 1 ? teamNeeds(L, tid).needs : [], rank = m => (L.players[m.id] && wanted.indexOf(L.players[m.id].p) >= 0 ? 0 : isPick(m.id) ? 1 : 2);
  const one = one0.map((m, i) => [rank(m), i, m]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
  for (const m of one.slice(0, 8)) if (ok([m.id])) return [m.id];
  const small = pay.filter(m => m.v < want).slice(-10), pairs = [];
  for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) { const v = small[i].v + small[j].v; if (v >= want * 0.8 && v <= want * 1.5) pairs.push([small[i], small[j], v]); }
  pairs.sort((x, y) => x[2] - y[2]);
  for (const pr of pairs.slice(0, 8)) if (ok([pr[0].id, pr[1].id])) return [pr[0].id, pr[1].id];
  const top = small.slice(-5), tr = [];
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) for (let k = j + 1; k < top.length; k++) { const v = top[i].v + top[j].v + top[k].v; if (v >= want && v <= want * 1.7) tr.push([top[i].id, top[j].id, top[k].id, v]); }
  tr.sort((a, b) => a[3] - b[3]);
  for (const x of tr.slice(0, 6)) if (ok(x.slice(0, 3))) return x.slice(0, 3);
  return null;
}
// the CPU suggests a few trades it would accept. pos: a player at that position; R1, R2, R3, RL (later rounds) or PICK: a draft pick;
// nothing: the positions you need most, paid with what the other team needs
const PICK_HUNT = { PICK: k => true, R1: k => k.r === 1, R2: k => k.r === 2, R3: k => k.r === 3, RL: k => k.r >= 4 };
function cpuOffers(L, userTid, pos) {
  if (POS.indexOf(pos) >= 0) return cpuOffersFor(L, userTid, pos);
  if (PICK_HUNT[pos]) return cpuPickOffers(L, userTid, PICK_HUNT[pos]);
  const out = [], seen = {};
  for (const q of teamNeeds(L, userTid).needs.slice(0, 3)) {
    for (const o of cpuOffersFor(L, userTid, q)) if (!seen[o.t]) { seen[o.t] = 1; out.push(o); break; }
  }
  return out;
}
// shopping for one position: each CPU team's best player there that would help (or back up) your lineup and that it can spare,
// for the cheapest fair package of your spare players and picks (never a player at that same position)
function cpuOffersFor(L, userTid, pos) {
  const fr = strengthFrac(L), ln = lineup(L, userTid)[pos] || [], floor = ln.length ? Math.min(...ln.map(p => p.o)) : 0, pay = payAssets(L, userTid, { pos }, fr), out = [];
  L.teams.forEach(t => {
    if (t.id === userTid || t.owner) return;
    const cs = rosterOf(L, t.id).filter(p => p.p === pos && p.o > floor - 3).sort((a, b) => b.o - a.o).slice(0, 3);
    for (const c of cs) { if (tradeEval(L, t.id, [], [c.i], fr).fixed) continue; const give = fairPrice(L, userTid, t.id, [c.i], pay, fr); if (give) { out.push({ t: t.id, give, get: [c.i], o: c.o }); break; } }
  });
  return out.sort((a, b) => b.o - a.o).slice(0, 6).map(x => ({ t: x.t, give: x.give, get: x.get }));
}
// shopping for a draft pick: each CPU team's best pick of that kind that it would sell, for your spare players, or your own later picks
function cpuPickOffers(L, userTid, match) {
  ensurePicks(L);
  const fr = strengthFrac(L), pay = payAssets(L, userTid, { sell: 1 }, fr), out = [];
  L.teams.forEach(t => {
    if (t.id === userTid || t.owner) return;
    const ks = picksOf(L, t.id).filter(k => pickOpen(L, k) && match(k)).map(k => ({ id: pickId(k), v: pickValue(L, k, fr) })).sort((a, b) => b.v - a.v).slice(0, 2);
    for (const k of ks) { const give = fairPrice(L, userTid, t.id, [k.id], pay.filter(m => m.id !== k.id), fr); if (give) { out.push({ t: t.id, give, get: [k.id], v: k.v }); break; } }
  });
  return out.sort((a, b) => b.v - a.v).slice(0, 6).map(x => ({ t: x.t, give: x.give, get: x.get }));
}
/* ---------------- trading block ----------------
   A team puts players up for trade (L.block[team] = [player ids]); CPU teams then bid for each one. Players who leave the
   roster drop off the block by themselves. */
const BLOCK_MAX = 8;
function blockOf(L, tid) {
  const a = (L.block && L.block[tid] || []).filter(id => L.players[id] && L.players[id].t === tid);
  if (L.block && L.block[tid] && a.length !== L.block[tid].length) L.block[tid] = a;
  return a;
}
function setBlock(L, tid, pid, on) {
  const p = L.players[pid];
  if (!p || p.t !== tid) return 'Not on your roster.';
  L.block = L.block || {};
  const a = blockOf(L, tid).filter(id => id !== pid);
  if (on) { if (a.length >= BLOCK_MAX) return 'At most ' + BLOCK_MAX + ' players on the block.'; a.push(pid); }
  L.block[tid] = a;
  return null;
}
// what CPU teams would give for each player on the block: per team the most valuable package (one player or pick, else two)
// that it still accepts, at most 1.3x the player's value. Returns [{ id, bids: [{ t, get }] }], best bids first.
function blockBids(L, tid) {
  const fr = strengthFrac(L), av = id => assetValue(L, id, fr);
  return blockOf(L, tid).map(id => {
    const v = av(id), bids = [];
    L.teams.forEach(t => {
      if (t.id === tid || t.owner) return;
      const ok = get => cpuTrade(L, tid, t.id, [id], get, fr).ok;
      const theirs = rosterOf(L, t.id).map(p => p.i).concat(picksOf(L, t.id).filter(k => pickOpen(L, k)).map(pickId))
        .map(x => ({ id: x, v: av(x) })).filter(x => x.v <= v * 1.3).sort((a, b) => b.v - a.v);
      let get = null, best = 0;
      for (const x of theirs.slice(0, 8)) if (ok([x.id])) { get = [x.id]; best = x.v; break; }
      const small = theirs.filter(x => x.v < v).slice(0, 10), pairs = [];
      for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) { const sv = small[i].v + small[j].v; if (sv > best && sv <= v * 1.3) pairs.push([small[i], small[j], sv]); }
      pairs.sort((x, y) => y[2] - x[2]);
      for (const pr of pairs.slice(0, 8)) if (ok([pr[0].id, pr[1].id])) { get = [pr[0].id, pr[1].id]; best = pr[2]; break; }
      if (get) bids.push({ t: t.id, get, v: best });
    });
    return { id, bids: bids.sort((a, b) => b.v - a.v).slice(0, 4).map(x => ({ t: x.t, get: x.get })) };
  });
}
/* payroll: every player is paid his salary (rating and position, lib/draft.js), free agents too, and a team signs one only with room under the cap.
   The cap is the league's own draft cap where it had one, else PAYROLL_CAP (with real contracts a 53-man roster with its IR players costs
   $180M-$398M, median $330M; contract averages run above real cap hits, which is why this sits above the real $301M cap). A team
   over the cap (some real rosters start there) cannot add a free agent until it clears room; releasing a player frees his salary at once. */
const PAYROLL_CAP = 375;
const payrollCap = L => L.cfg && L.cfg.entry === 'draft' && L.cfg.cap ? L.cfg.cap : PAYROLL_CAP;
const payroll = (L, tid) => Math.round((rosterOf(L, tid).reduce((t, p) => t + salOf(p), 0) + ((L.dead && L.dead[tid]) || 0)) * 10) / 10;
const capRoom = (L, tid) => Math.round((payrollCap(L) - payroll(L, tid)) * 10) / 10;
function signFA(L, tid, pid) {
  const p = L.players[pid];
  if (!p || p.t !== -1) return 'Player is not available.';
  if (activeRoster(L, tid).length >= ROSTER_MAX) return 'Roster is full (' + ROSTER_MAX + '). Release someone first.';
  const cost = salOf(p), room = capRoom(L, tid);
  if (cost > room + 1e-6) return p.n + ' costs $' + cost + 'M and you have $' + Math.max(0, room) + 'M under the $' + payrollCap(L) + 'M cap. Release someone first.';
  p.t = tid; return null;
}
function release(L, tid, pid) {
  const p = L.players[pid];
  if (!p || p.t !== tid) return 'Not on your roster.';
  const left = posCount(L, tid); left[p.p]--;
  if (left[p.p] < counts(L.teams[tid].sch)[p.p]) return 'You need a starter at ' + p.p + '.';
  if (L.camp && p.ctr) { L.dead = L.dead || {}; L.dead[tid] = Math.round(((L.dead[tid] || 0) + deadMoney(L, p)) * 10) / 10; delete p.ctr; p.sal = null; p.cx = null; }
  p.t = -1; delete p.st; return null;
}

/* ---------------- campaign: running a franchise ----------------
   Only single-player campaigns switch this on (L.camp, campInit): team modes and trades between CPU teams, free agency as a stage of the
   offseason, contracts negotiated by message, morale, press conferences, inbox events, suspensions, team money, facilities and coordinators. */
const myId = L => L.user;
function campInit(L) {
  if (L.camp) { if (L.modeV !== 2) updateModes(L); return; }
  L.camp = 1; L.inbox = L.inbox || []; L.morale = L.morale || { team: 60, fans: 60 }; L.talks = L.talks || {}; L.dead = L.dead || {}; L.mailN = L.mailN || 0;
  L.fin = L.fin || { cash: 30, lv: { st: 1, pr: 1, me: 1 } };
  if (!L.staff) { const r = rng(L, 'staff'); L.staff = { oc: { n: randName(r), r: 70, sal: 3.3 }, dc: { n: randName(r), r: 70, sal: 3.3 }, mkt: [] }; newCoachMarket(L); }
  updateModes(L);
  inMail(L, { from: 'The owner', subj: 'Welcome aboard', body: 'The team is yours. Contracts, trades, the press and the budget all run through this inbox and the Franchise tab. Keep the locker room happy and the fans in their seats.' });
}
/* team modes come from how good a team really is, with no chance involved. Its rating is measured against the league's spread, and its results
   count once there are any: this season's after MODE.games games, else last season's.
   Win-now: a real contender, rated well above the league and winning (or winning a lot, whatever the rating says).
   Rebuilding: a really bad team, rated well below the league and losing (or losing badly). Everyone else is neither. */
const MODE = { games: 5, winZ: 0.9, winPct: 0.55, hotPct: 0.75, hotZ: -1, badZ: -1, badPct: 0.4, awfulPct: 0.3, awfulZ: 0 };
function modeOf(z, pct) {
  const known = pct != null;
  if ((z >= MODE.winZ && (!known || pct >= MODE.winPct)) || (known && pct >= MODE.hotPct && z >= MODE.hotZ)) return 'win';
  if ((z <= MODE.badZ && (!known || pct <= MODE.badPct)) || (known && pct <= MODE.awfulPct && z <= MODE.awfulZ)) return 'rebuild';
  return '';
}
function updateModes(L) {
  const ovr = {}, R = records(L); L.teams.forEach(t => { ovr[t.id] = teamRating(L, t.id).ovr; });
  const v = Object.values(ovr), mean = v.reduce((a, x) => a + x, 0) / v.length, sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) * (x - mean), 0) / v.length) || 1;
  L.modeV = 2;
  L.teams.forEach(t => {
    if (t.owner) return;
    const r = R[t.id], gp = r.w + r.l + r.t;
    t.mode = modeOf((ovr[t.id] - mean) / sd, gp >= MODE.games ? r.pct : t.lastPct != null ? t.lastPct : null);
  });
}
const teamMode = (L, tid) => L.teams[tid].mode || '';
// what a player plays at: his rating, moved by his morale and the team's, and the coordinator of his side of the ball (your team only)
const OFF_P = { QB: 1, HB: 1, WR: 1, TE: 1, OL: 1 }, DEF_P = { DE: 1, DT: 1, LB: 1, CB: 1, S: 1 };
const isStar = p => p.o >= 78 && p.p !== 'OL';   // offensive linemen are never stars: no morale of their own, no star treatment
const moraleOf = (L, p) => p.p !== 'OL' && p.mor != null ? p.mor : 65;
function effOvr(L, tid, p) {
  if (!L.camp || !L.teams[tid].owner || !p || !p.p) return p.o;
  const star = isStar(p) ? clamp(Math.round((moraleOf(L, p) - 65) / 10), -3, 2) : 0, team = Math.round((L.morale.team - 60) / 15);
  const c = OFF_P[p.p] ? L.staff.oc : DEF_P[p.p] ? L.staff.dc : null, co = c ? Math.round((c.r - 70) / 6) : 0;
  return clamp(p.o + star + team + co, 40, 99);
}
const fightFactor = (L, tid) => !L.camp ? 0 : L.teams[tid].owner ? 1 + Math.max(0, (60 - L.morale.team) / 20) : 1;
function setMorale(L, p, d) { if (p.p === 'OL') return; p.mor = clamp(Math.round(moraleOf(L, p) + d), 0, 100); }
function moraleBump(L, o) { if (o.team) L.morale.team = clamp(Math.round(L.morale.team + o.team), 0, 100); if (o.fans) L.morale.fans = clamp(Math.round(L.morale.fans + o.fans), 0, 100); if (o.cash) L.fin.cash = Math.round((L.fin.cash + o.cash) * 10) / 10; }
const starsOf = L => rosterOf(L, myId(L)).filter(isStar).sort((a, b) => b.o - a.o);

/* the inbox */
function inMail(L, m) {
  const a = L.inbox; L.mailN = (L.mailN || 0) + 1;
  const x = Object.assign({ id: 'm' + L.mailN, when: L.phase === 'regular' ? L.season + ' · Week ' + L.week : L.season + ' · ' + ({ playoffs: 'Playoffs', offseason: 'Offseason', fa: 'Free agency', draft: 'Draft', preseason: 'Preseason' }[L.phase] || ''), read: false }, m);
  a.unshift(x); if (a.length > 80) a.length = 80; return x;
}
const unread = L => (L.inbox || []).filter(m => !m.read).length;
function mailRead(L, id) { const m = (L.inbox || []).find(x => x.id === id); if (m) m.read = true; return m; }
// a reply from the buttons on a message: each option carries what it does
function mailAnswer(L, id, i) {
  const m = (L.inbox || []).find(x => x.id === id), o = m && m.opts && m.opts[i]; if (!o || m.ans != null) return 'That has been answered.';
  if (o.cost && L.fin.cash < o.cost) return 'The team does not have $' + o.cost + 'M to spend.';
  m.ans = i; moraleBump(L, { team: o.team, fans: o.fans, cash: (o.cash || 0) - (o.cost || 0) });
  const p = m.pid && L.players[m.pid];
  if (p) { if (o.star) setMorale(L, p, o.star); if (o.prom) p.prom = o.prom; if (o.shop) setBlock(L, myId(L), p.i, true); }
  else if (o.star) starsOf(L).slice(0, 5).forEach(x => setMorale(L, x, o.star));
  if (o.reply) inMail(L, { from: m.from, subj: 'Re: ' + m.subj, body: o.reply, read: true });
  return null;
}
const PR_EVENTS = [
  { from: 'Community relations', subj: 'Children\'s hospital fundraiser', body: 'The children\'s hospital is holding its fundraiser and has asked the team to host. It costs $1M to do properly. The fans would love it.', opts: [{ t: 'Host it ($1M)', cost: 1, fans: 5, team: 1, reply: 'Great turnout, and it was all over the local news.' }, { t: 'Send a signed jersey', fans: -1, reply: 'They said thanks. The local paper noticed the smaller gesture.' }] },
  { from: 'Marketing', subj: 'A sponsor wants the stadium plaza renamed', body: 'A payday lender will pay $4M to put its name on the plaza. Money is money, but the fans will not like it.', opts: [{ t: 'Take the money', cash: 4, fans: -5, reply: 'Done. The signs go up next week, and so do the angry letters.' }, { t: 'Say no', fans: 1, reply: 'Passed. Nobody will ever know you said no, but it was the right call.' }] },
  { from: 'Community relations', subj: 'Youth football camp', body: 'Your stars could spend an afternoon running a youth camp. They would rather rest, but it would be good for everyone.', opts: [{ t: 'Make them go', fans: 3, team: -1, reply: 'The kids loved it. The players are a bit tired.' }, { t: 'Ask for volunteers', fans: 1, team: 1, reply: 'A few of them showed up on their own. Nice moment.' }] },
  { from: 'Ticket office', subj: 'Ticket prices', body: 'We could raise ticket prices for the next few games and bring in about $3M.', opts: [{ t: 'Raise them', cash: 3, fans: -4, reply: 'Prices are up. Season-ticket holders are grumbling.' }, { t: 'Freeze them', fans: 2, reply: 'Prices stay put, and the fans appreciated the announcement.' }] },
  { from: 'Team captains', subj: 'Team dinner', body: 'The captains want a team dinner to bring everyone together. It runs about $0.5M with the travel and the venue.', opts: [{ t: 'Pay for it', cost: 0.5, team: 4, star: 2, reply: 'Good night. The locker room feels closer.' }, { t: 'Not now', team: -1, reply: 'Understood, coach.' }] }
];
const CRIMES = ['arrested after a bar brawl', 'cited for street racing on the interstate', 'caught smuggling fireworks across state lines', 'charged with driving under the influence', 'arrested for disorderly conduct at a casino', 'caught running an illegal betting ring', 'arrested after a fight at a nightclub'];
function suspend(L, p, games, r) {
  p.sus = (p.sus || 0) + games; const t = L.teams[p.t], mine = p.t === myId(L);
  const why = p.gen ? p.n + ' was ' + pickOf(r, CRIMES) + '. The NFL suspends him ' + games + ' game' + (games > 1 ? 's' : '') + '.' : p.n + ' is suspended ' + games + ' game' + (games > 1 ? 's' : '') + ' for violating the league\'s conduct policy.';
  if (mine || p.o >= 80) L.news.unshift({ s: L.season, t: why + (t ? ' (' + t.nick + ')' : '') });
  if (L.news.length > 40) L.news.length = 40;
  if (mine) { inMail(L, { from: 'NFL league office', subj: 'Suspension: ' + p.n, body: why + ' He cannot play until it is served.', pid: p.i }); moraleBump(L, { team: -3, fans: -3 }); }
}
// once a week: trades between CPU teams, a suspension somewhere in the league (rare), something for the inbox now and then
function campWeek(L) {
  const r = rng(L, 'wk' + L.season + ':' + L.week);
  if (L.week % 4 === 1) updateModes(L);
  if (canTrade(L)) cpuTradesRound(L, 0.06);
  Object.values(L.players).forEach(p => {
    if (p.t < 0 || p.sus || p.ir) return;
    const mine = p.t === myId(L), f = mine && isStar(p) ? 1 + Math.max(0, (50 - moraleOf(L, p)) / 8) : 1;   // an unhappy star is likelier to do something wild
    if (r() < 0.00012 * f) suspend(L, p, ri(r, 1, 6), r);
  });
  if (r() < 0.14) { const e = pickOf(r, PR_EVENTS); inMail(L, { from: e.from, subj: e.subj, body: e.body, kind: 'pr', opts: e.opts }); }
}
function campHeal(L) {   // the medical staff gets players back a little sooner
  const lv = L.fin.lv.me; if (lv <= 1) return;
  const r = rng(L, 'heal' + L.season + ':' + L.week + ':' + L.phase);
  rosterOf(L, myId(L)).forEach(p => { if (p.inj > 1 && p.inj < SEASON_OUT && r() < (lv - 1) * 0.12) p.inj--; });
}
/* after every game: suspensions for fights; for your team morale, the fans, the gate, playing time and the press */
function campAfterGame(L, g, T, R) {
  const me = myId(L);
  R.log.forEach(e => { if (!e.fight) return; const p = L.players[e.fight.i]; if (!p) return;
    p.sus = (p.sus || 0) + 1; p.fights = (p.fights || 0) + 1;
    if (p.t === me) { inMail(L, { from: 'NFL league office', subj: 'Ejected: ' + p.n, body: p.n + ' was thrown out for fighting and is suspended for the next game.', pid: p.i }); moraleBump(L, { team: -2 }); }
    else if (p.o >= 80) L.news.unshift({ s: L.season, t: p.n + ' is ejected for fighting and suspended a game.' }); });
  if (g.h !== me && g.a !== me) return;
  const home = g.h === me, mine = home ? g.sh : g.sa, theirs = home ? g.sa : g.sh, won = mine > theirs, tie = mine === theirs, margin = Math.min(21, Math.abs(mine - theirs));
  const opp = L.teams[home ? g.a : g.h];
  moraleBump(L, { team: (55 - L.morale.team) * 0.12 + (tie ? 0 : won ? 2 + margin / 10 : -2 - margin / 10), fans: (55 - L.morale.fans) * 0.1 + (tie ? 0 : won ? 2 + margin / 7 : -2 - margin / 7) });   // (both drift back toward the middle)
  if (home) moraleBump(L, { cash: Math.round((2 + L.fin.lv.st * 0.8 + L.morale.fans * 0.02) * 10) / 10 });
  // playing time
  starsOf(L).forEach(p => {
    if (!healthy(p)) return;
    const ln = lineup(L, me)[p.p] || [], plays = ln.indexOf(p) >= 0 && !(p.use != null && p.use < 25);
    setMorale(L, p, (won ? 1 : tie ? 0 : -1) + (plays ? 0.5 : -3));
    if (p.prom > 0) { if (plays) { p.prom = 0; setMorale(L, p, 3); } else if (--p.prom <= 0) { setMorale(L, p, -12); moraleBump(L, { team: -2 }); inMail(L, { from: p.n, subj: 'You promised me snaps', body: 'Coach, you told me I would get more snaps. I did not. I will remember that when my contract comes up.', pid: p.i }); } }
    else if (!plays && moraleOf(L, p) < 58 && (p.mailG || 0) + 4 <= L.week) {
      p.mailG = L.week;
      inMail(L, { from: p.n, subj: 'My playing time', body: 'Coach, can we talk? I am rated ' + p.o + ' and I am barely on the field. I came here to play. What is the plan for me?', kind: 'play', pid: p.i, opts: [
        { t: 'Promise him more snaps', star: 8, prom: 2, reply: 'Thanks, coach. I will hold you to that. (Start him within two games, or he will not forget it.)' },
        { t: 'Tell him to earn it', star: -5, team: 1, reply: 'Understood. I will show you in practice, but I am not happy.' },
        { t: 'Offer to shop him', star: 2, shop: 1, reply: 'I appreciate the honesty. (He is on your trading block now.)' }] });
    }
  });
  // the boo birds
  if (home && !won && L.morale.fans < 35) {
    const s = starsOf(L)[0]; moraleBump(L, { team: -1 }); starsOf(L).slice(0, 4).forEach(p => setMorale(L, p, -2));
    inMail(L, { from: 'Team PR', subj: 'They booed us off the field', body: 'The home crowd booed the team off after the loss to the ' + opp.nick + (s ? ', and ' + s.n + ' heard it worst' : '') + '. Fan morale is at ' + L.morale.fans + '. Winning fixes this, and a good word at the press conference helps.' });
  }
  // the press wants a word
  const star = starsOf(L).find(healthy) || starsOf(L)[0];
  L.press = { opp: opp.nick, won, tie, score: mine + '-' + theirs, star: star ? star.i : null, qs: [
    won ? 'Big win over the ' + opp.nick + ', ' + mine + '-' + theirs + '. What made the difference?' : tie ? 'A tie with the ' + opp.nick + '. How do you feel about that?' : 'A ' + theirs + '-' + mine + ' loss to the ' + opp.nick + '. What went wrong?',
    star ? 'What did you see from ' + star.n + ' today?' : 'How is the roster holding up?',
    L.morale.fans < 40 ? 'The fans are running out of patience. What do you say to them?' : L.morale.team < 45 ? 'We hear the locker room is unhappy. Is that true?' : 'What is the mood in the building this week?'
  ], i: 0 };
}
const COACH_ANSWERS = [
  { t: 'Credit the players', team: 3, fans: 1, star: 2 },
  { t: 'Take the blame yourself', team: 2, fans: 0, star: 1 },
  { t: 'Call out your star', team: -3, fans: 2, star: -7 },
  { t: 'Give a boring answer', team: 0, fans: -1, star: 0 }
];
function pressAnswer(L, a) {
  const P = L.press, A = COACH_ANSWERS[a]; if (!P || !A) return null;
  moraleBump(L, { team: A.team, fans: A.fans });
  const s = P.star && L.players[P.star]; if (s && A.star) setMorale(L, s, A.star);
  P.i++; if (P.i >= P.qs.length) L.press = null;
  return A;
}
function campOffseason(L, rep) {
  const me = myId(L), RR = records(L), R = RR[me], mine = ids => ids.map(id => L.players[id]).filter(p => p && p.t === me);
  L.teams.forEach(t => { const x = RR[t.id]; if (x.w + x.l + x.t >= MODE.games) t.lastPct = x.pct; });   // next season starts from this one's results
  updateModes(L);
  mine(rep.stars).forEach(p => inMail(L, { from: 'Head of scouting', subj: 'Superstar: ' + p.n, body: p.n + ' (' + p.p + ') is now a ' + p.o + '. He is one of the best in the league at his position. Build around him.', kind: 'alert', pid: p.i }));
  mine(rep.sleepers).forEach(p => inMail(L, { from: 'Head of scouting', subj: (p.pt >= 90 && p.p !== 'OL' ? 'Future superstar: ' : 'Sleeper: ') + p.n, body: 'We had ' + p.n + ' (' + p.p + ') wrong, in the good way. We rated his potential ' + p.was + '. After a season it looks like ' + p.pt + '. Get him on the field.', kind: 'alert', pid: p.i }));
  mine(rep.busts).forEach(p => inMail(L, { from: 'Head of scouting', subj: 'Bust: ' + p.n, body: 'Bad news on ' + p.n + ' (' + p.p + '). We rated his potential ' + p.was + '. After a season it looks like ' + p.pt + '. He is not going to be what we hoped.', kind: 'alert', pid: p.i }));
  const money = Math.round((10 + R.w * 1.2 + L.morale.fans * 0.1 - (L.fin.lv.st + L.fin.lv.pr + L.fin.lv.me) * 1.5) * 10) / 10;
  moraleBump(L, { cash: money, fans: R.w >= 11 ? 6 : R.w <= 5 ? -5 : 0, team: 3 });
  inMail(L, { from: 'Team finances', subj: 'The ' + L.season + ' books', body: 'A ' + R.w + '-' + R.l + (R.t ? '-' + R.t : '') + ' season brought in $' + money + 'M after sponsors, merchandise and facility upkeep. The team has $' + L.fin.cash + 'M to spend on upgrades and coaches (Franchise tab).' });
}
function campSeasonStart(L) {
  L.dead = {}; L.press = null;
  // keep saves small: other teams' long-retired players and free agents nobody wanted go (your retired players and the Hall of Fame stay for good)
  Object.values(L.players).forEach(p => { if ((p.t === -2 && p.lt !== myId(L) && (p.ry || 0) < L.season - 2) || (p.t === -1 && p.o < 60 && !(L.talks[p.i] && L.talks[p.i].state === 'open'))) { delete L.players[p.i]; delete L.talks[p.i]; } });
  moraleBump(L, { cash: -Math.round((L.staff.oc.sal + L.staff.dc.sal) * 10) / 10, fans: L.fin.lv.st - 1 });
  newCoachMarket(L); updateModes(L);
  if (canTrade(L)) cpuTradesRound(L, 0.3);
  Object.values(L.talks).forEach(t => { t.state = t.state === 'open' ? 'old' : t.state; });
}
/* facilities and coordinators, from the team's money (not the salary cap) */
const FACILITY = {
  st: { label: 'Stadium', desc: 'More money from every home game, and the fans warm up a little each season.' },
  pr: { label: 'Practice facility', desc: 'Young players on your team develop a little faster.' },
  me: { label: 'Medical staff', desc: 'Injured players come back a little sooner.' }
};
const upgradeCost = lv => Math.round(10 * Math.pow(lv, 1.6));
function upgrade(L, k) {
  const lv = L.fin.lv[k]; if (!FACILITY[k]) return 'Unknown upgrade.'; if (lv >= 5) return 'That is as good as it gets.';
  const c = upgradeCost(lv); if (L.fin.cash < c) return 'That costs $' + c + 'M and the team has $' + L.fin.cash + 'M.';
  L.fin.cash = Math.round((L.fin.cash - c) * 10) / 10; L.fin.lv[k] = lv + 1; return null;
}
function newCoachMarket(L) {
  const r = rng(L, 'coach' + L.season), m = [];
  ['oc', 'dc'].forEach(k => { for (let i = 0; i < 3; i++) { const v = ri(r, 60, 92); m.push({ k, n: randName(r), r: v, sal: Math.round((v - 55) * 2.2) / 10 }); } });
  L.staff.mkt = m;
}
const coachMarket = L => L.staff.mkt;
function hireCoach(L, i) {
  const c = L.staff.mkt[i]; if (!c) return 'He has taken another job.';
  if (L.fin.cash < c.sal) return 'His first year costs $' + c.sal + 'M and the team has $' + L.fin.cash + 'M.';
  L.fin.cash = Math.round((L.fin.cash - c.sal) * 10) / 10; L.staff[c.k] = { n: c.n, r: c.r, sal: c.sal }; L.staff.mkt.splice(i, 1); return null;
}

/* CPU teams trading with each other: win-now teams spend picks on what the rebuilding teams will sell */
function cpuTradesRound(L, chance) {
  const r = rng(L, 'cputr' + L.season + ':' + L.week + ':' + L.phase), fr = strengthFrac(L); let done = 0;
  ensurePicks(L);
  for (const b of shuffle(r, L.teams.filter(t => t.mode === 'win' && !t.owner))) {
    if (done >= 2 || r() >= chance) continue;
    const q = teamNeeds(L, b.id).needs.filter(x => x !== 'K' && x !== 'P')[0]; if (!q) continue;
    const low = Math.min(...lineup(L, b.id)[q].map(x => x.o), 99);
    const sellers = shuffle(r, L.teams.filter(t => t.mode === 'rebuild' && !t.owner));
    for (const s of sellers.slice(0, 5)) {
      const p = rosterOf(L, s.id).filter(x => x.p === q && healthy(x) && x.o > low + 2).sort((x, y) => y.o - x.o)[0]; if (!p) continue;
      const want = playerValue(p), ks = picksOf(L, b.id).filter(k => pickOpen(L, k)).map(k => ({ id: pickId(k), v: pickValue(L, k, fr) })).sort((x, y) => x.v - y.v);
      const single = ks.find(k => k.v >= want * 0.8); const packs = (single ? [[single.id]] : []).concat(ks.length > 1 ? [[ks[ks.length - 1].id, ks[ks.length - 2].id]] : []);
      let made = null;
      for (const pk of packs) {
        if (tradeCheck(L, s.id, b.id, [p.i], pk)) continue;
        const es = tradeEval(L, s.id, pk, [p.i], fr), eb = tradeEval(L, b.id, [p.i], pk, fr);
        if (!es.why && !eb.why && es.worth > 0 && eb.worth > 0) { made = pk; break; }
      }
      if (!made) continue;
      const pkt = made.map(id => pickLabel(L, pickOf_(L, id))).join(' and ');
      doTrade(L, s.id, b.id, [p.i], made);
      L.news[0].t = b.nick + ' (win-now) get ' + p.n + ' (' + p.p + ' ' + p.o + ') from the ' + s.nick + ' (rebuilding) for ' + pkt + '.';
      done++; break;
    }
  }
  return done;
}
/* asking for a player: the CPU team names its price, a deal that is good for it (what it needs from your roster first, or picks) */
function tradeAsk(L, userTid, cpuTid, pid) {
  const p = L.players[pid]; if (!p || p.t !== cpuTid) return { ok: false, msg: 'He is not on that team any more.' };
  const fr = strengthFrac(L), pre = tradeEval(L, cpuTid, [], [pid], fr); if (pre.fixed) return { ok: false, msg: pre.why };
  const needs = teamNeeds(L, cpuTid).needs, want = playerValue(p) * (pre.hole ? 1.6 : 1.1), val = id => assetValue(L, id, fr);
  const mine = rosterOf(L, userTid).filter(x => !x.ir && !(x.p === 'QB' && depthRank(L, userTid, x) === 0)).map(x => x.i).concat(picksOf(L, userTid).filter(k => pickOpen(L, k)).map(pickId)).map(id => ({ id, v: val(id) }));
  const rank = m => (L.players[m.id] && needs.indexOf(L.players[m.id].p) >= 0 ? 0 : isPick(m.id) ? 1 : 2);
  const pass = give => { const r = cpuTrade(L, userTid, cpuTid, give, [pid], fr); return r.ok && r.margin >= 3; };
  const one = mine.filter(m => m.v >= want * 0.85 && m.v <= want * 1.7).sort((a, b) => rank(a) - rank(b) || a.v - b.v);
  for (const m of one.slice(0, 12)) if (pass([m.id])) return { ok: true, t: cpuTid, give: [m.id], get: [pid] };
  const small = mine.filter(m => m.v < want).sort((a, b) => rank(a) - rank(b) || b.v - a.v).slice(0, 12), pairs = [];
  for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) { const v = small[i].v + small[j].v; if (v >= want * 0.9 && v <= want * 1.8) pairs.push([small[i], small[j], rank(small[i]) + rank(small[j]), v]); }
  pairs.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
  for (const x of pairs.slice(0, 12)) if (pass([x[0].id, x[1].id])) return { ok: true, t: cpuTid, give: [x[0].id, x[1].id], get: [pid] };
  const big = mine.filter(m => m.v < want).sort((a, b) => b.v - a.v).slice(0, 3).map(m => m.id);
  if (big.length === 3 && pass(big)) return { ok: true, t: cpuTid, give: big, get: [pid] };
  return { ok: false, msg: L.teams[cpuTid].nick + ' do not see a deal for ' + p.n + ' from what you have.' };
}
// you countered and it was not enough: what one more piece from you would get it done (or nothing, if no piece would)
function tradeCounter(L, userTid, cpuTid, give, get) {
  const fr = strengthFrac(L), base = cpuTrade(L, userTid, cpuTid, give, get, fr); if (base.ok) return { ok: true };
  const ev = tradeEval(L, cpuTid, give, get, fr); if (ev.fixed) return { ok: false, msg: ev.why };
  const mine = rosterOf(L, userTid).filter(x => !x.ir && give.indexOf(x.i) < 0 && !(x.p === 'QB' && depthRank(L, userTid, x) === 0)).map(x => x.i).concat(picksOf(L, userTid).filter(k => pickOpen(L, k)).map(pickId).filter(id => give.indexOf(id) < 0)).map(id => ({ id, v: assetValue(L, id, fr) })).sort((a, b) => a.v - b.v);
  for (const m of mine) if (m.v >= 1 && cpuTrade(L, userTid, cpuTid, give.concat([m.id]), get, fr).ok) return { ok: false, add: m.id, msg: base.msg };
  return { ok: false, msg: base.msg };
}
const TALK_MAX = 6;
function tradeTalkLeft(L, cpu) { const k = L.season + ':' + L.week + ':' + L.phase, t = (L.talk || {})[cpu]; return !t || t.k !== k ? TALK_MAX : Math.max(0, TALK_MAX - t.n); }
function tradeTalkUse(L, cpu) { const k = L.season + ':' + L.week + ':' + L.phase; L.talk = L.talk || {}; const t = L.talk[cpu]; L.talk[cpu] = t && t.k === k ? { k, n: t.n + 1 } : { k, n: 1 }; }

/* draft day: the next pick, or on to yours; trading up and down */
function draftAdvance(L, mode) {
  const d = L.draft; if (!d || d.done) return;
  d.hold = 0; d.limit = mode === 'one' ? 1 : 0;
  autoDraftToHuman(L);
  if (L.draft) { L.draft.hold = 1; L.draft.limit = 0; }
}
function draftPicksLeft(L) {   // this draft's picks still to be used, in order, with their slot
  const d = L.draft; return L.picks.filter(k => k.y === L.season).map(k => ({ k, s: draftSlot(L, k) })).filter(x => x.s >= d.pos).sort((a, b) => a.s - b.s);
}
function draftUpOffers(L, tid) {
  const fr = strengthFrac(L), left = draftPicksLeft(L), next = left.findIndex(x => x.k.t === tid), upTo = next < 0 ? left : left.slice(0, next);
  const pay = payAssets(L, tid, { sell: 1 }, fr), out = [];
  for (const x of upTo.slice(-12).reverse()) { if (L.teams[x.k.t].owner) continue; const id = pickId(x.k), give = fairPrice(L, tid, x.k.t, [id], pay, fr); if (give) out.push({ t: x.k.t, give, get: [id], slot: x.s + 1 }); if (out.length >= 6) break; }
  return out.sort((a, b) => a.slot - b.slot);
}
function draftDownBids(L, tid) {
  const fr = strengthFrac(L), left = draftPicksLeft(L), mine = left.find(x => x.k.t === tid); if (!mine) return [];
  const id = pickId(mine.k), v = pickValue(L, mine.k, fr), out = [];
  L.teams.forEach(t => {
    if (t.id === tid || t.owner) return;
    const theirs = left.filter(x => x.k.t === t.id && x.s > mine.s).map(x => ({ id: pickId(x.k), v: pickValue(L, x.k, fr), s: x.s })); if (!theirs.length) return;
    const tries = [[theirs[0]]].concat(theirs[1] ? [[theirs[0], theirs[1]]] : []).concat(theirs[2] ? [[theirs[0], theirs[2]]] : []);
    for (const g of tries.reverse()) { const sum = g.reduce((a, x) => a + x.v, 0); if (sum <= v * 1.15 && cpuTrade(L, tid, t.id, [id], g.map(x => x.id), fr).ok) { out.push({ t: t.id, give: [id], get: g.map(x => x.id), v: sum, slot: g[0].s + 1 }); break; } }
  });
  return out.sort((a, b) => b.v - a.v).slice(0, 5);
}

/* free agency, a stage of the offseason: your expiring contracts are yours to talk about (or let walk); other teams' players whose deals ran out
   and they did not re-sign are on the market. Each day CPU teams sign who they need. Then the draft. */
function faStart(L, rounds) {
  const r = rng(L, 'fa' + L.season + ':start'), exp = [];
  Object.values(L.players).forEach(p => {
    if (p.t < 0) return;
    if (p.cx == null) { p.cx = L.season + ri(r, 1, 3); if (p.sal == null) p.sal = salOf(p); return; }
    if (p.cx > L.season) return;
    const t = L.teams[p.t];
    if (t.owner) { exp.push(p.i); return; }
    const keep = 0.55 + (p.o - 70) * 0.01 + (t.mode === 'win' ? 0.1 : 0) - (t.mode === 'rebuild' && p.a >= 29 ? 0.3 : 0);
    if (r() < keep) { p.sal = DRx().salaryOfPos(p.p, p.o); p.cx = L.season + ri(r, 1, 4); }
    else { p.was = p.t; p.t = -1; p.sal = DRx().salaryOfPos(p.p, p.o); p.cx = null; delete p.st; delete p.ctr; }
  });
  L.fa = { day: 1, days: 4, rounds, exp };
  L.phase = 'fa';
  exp.map(id => L.players[id]).filter(p => p.o >= 80).sort((a, b) => b.o - a.o).forEach(p => { contractOpen(L, p.i); });
  const n = exp.length, others = Object.values(L.players).filter(p => p.t === -1 && p.was != null && p.o >= 75).length;
  inMail(L, { from: 'Your assistant GM', subj: 'Free agency is open', body: n + ' of your players have contracts ending. Talk to them (Free agents tab) or let them walk; anyone unsigned when free agency ends is gone. ' + others + ' good players from other teams are on the market. CPU teams sign players each day.' });
}
function cpuFaDay(L) {
  const r = rng(L, 'fa' + L.season + ':' + (L.fa ? L.fa.day : 0));
  shuffle(r, L.teams.filter(t => !t.owner)).forEach(t => {
    if (r() > 0.6 || activeRoster(L, t.id).length >= ROSTER_MAX) return;
    const q = teamNeeds(L, t.id).needs[0]; if (!q) return;
    const p = Object.values(L.players).filter(x => x.t === -1 && x.p === q && salOf(x) <= capRoom(L, t.id)).sort((a, b) => b.o - a.o)[0]; if (!p) return;
    p.t = t.id; p.cx = L.season + ri(r, 1, 3); delete p.was;
    if (p.o >= 80) L.news.unshift({ s: L.season, t: t.nick + ' sign free agent ' + p.n + ' (' + p.p + ' ' + p.o + ').' });
    const th = L.talks[p.i]; if (th && th.state === 'open') { th.state = 'gone'; inMail(L, { from: p.n, subj: 'I have signed elsewhere', body: 'Thanks for the talks, but I have signed with the ' + t.nick + '.', pid: p.i }); }
  });
  if (L.news.length > 40) L.news.length = 40;
}
function faNext(L) { const f = L.fa; if (!f) return; if (f.day >= f.days) return faFinish(L); cpuFaDay(L); f.day++; }
function faFinish(L) {
  const f = L.fa; if (!f) return;
  f.exp.slice().forEach(id => { const p = L.players[id]; if (p && p.t === myId(L)) letWalk(L, id); });
  cpuFaDay(L); cpuFaDay(L);
  L.teams.forEach(t => { fillDepth(L, t.id); if (!t.owner) trimRoster(L, t.id); });
  L.fa = null;
  startDraft(L, f.rounds);
}
function letWalk(L, pid) {
  const p = L.players[pid], f = L.fa; if (!p || !f || f.exp.indexOf(pid) < 0) return 'He is not up for a new contract.';
  f.exp = f.exp.filter(x => x !== pid);
  p.was = p.t; p.t = -1; p.sal = DRx().salaryOfPos(p.p, p.o); p.cx = null; delete p.st; delete p.ctr;
  if (p.o >= 85) { moraleBump(L, { fans: -3, team: -1 }); L.news.unshift({ s: L.season, t: p.n + ' (' + p.p + ' ' + p.o + ') leaves in free agency.' }); }
  const th = L.talks[pid]; if (th) th.state = 'closed';
  return null;
}
/* what a player asks for: the market for his position and rating, moved by how he played (compared with others at his position) and how happy he is.
   A contract: y years, s base salary a year, b signing bonus (spread over the years on the cap), g percent of the base guaranteed, i incentives a year. */
const STAT_SCORE = { QB: x => (x.pyd || 0) / 25 + (x.ptd || 0) * 4 - (x.int || 0) * 2 + (x.ryd || 0) / 10, HB: x => (x.ryd || 0) / 10 + (x.rtd || 0) * 6 + (x.recyd || 0) / 10 + (x.rectd || 0) * 6, WR: x => (x.recyd || 0) / 10 + (x.rectd || 0) * 6, TE: x => (x.recyd || 0) / 10 + (x.rectd || 0) * 6,
  DE: x => (x.sk || 0) * 5 + (x.pbu || 0), DT: x => (x.sk || 0) * 5 + (x.pbu || 0), LB: x => (x.sk || 0) * 4 + (x.dint || 0) * 5 + (x.pbu || 0) * 2, CB: x => (x.dint || 0) * 6 + (x.pbu || 0) * 2, S: x => (x.dint || 0) * 6 + (x.pbu || 0) * 2 };
const nOf = (v, w) => (v || 0) + ' ' + w + ((v || 0) === 1 ? '' : w === 'pass broken up' ? '' : 's');
const STAT_TEXT = { QB: x => (x.pyd || 0) + ' passing yards, ' + nOf(x.ptd, 'touchdown') + ' and ' + nOf(x.int, 'interception'), HB: x => (x.ryd || 0) + ' rushing yards and ' + nOf(x.rtd, 'touchdown'), WR: x => nOf(x.rec, 'catch').replace('catchs', 'catches') + ' for ' + (x.recyd || 0) + ' yards', TE: x => nOf(x.rec, 'catch').replace('catchs', 'catches') + ' for ' + (x.recyd || 0) + ' yards',
  DE: x => nOf(x.sk, 'sack'), DT: x => nOf(x.sk, 'sack'), LB: x => nOf(x.sk, 'sack') + ' and ' + nOf(x.dint, 'interception'), CB: x => nOf(x.dint, 'interception') + ' and ' + (x.pbu || 0) + ' passes broken up', S: x => nOf(x.dint, 'interception') + ' and ' + (x.pbu || 0) + ' passes broken up' };
function perfOf(L, p) {   // -1 (well below what his rating says) .. 1 (well above), from last season's numbers
  const f = STAT_SCORE[p.p], S = L.lastStats || L.stats || {}, mine = S[p.i]; if (!f) return { perf: 0, line: '' };
  if (!mine) return { perf: p.o >= 70 ? -0.3 : 0, line: '' };
  const peers = Object.keys(S).map(id => L.players[id]).filter(x => x && x.p === p.p);
  if (peers.length < 4) return { perf: 0, line: STAT_TEXT[p.p](mine) };
  const sc = x => f(S[x.i] || {}), pct = (arr, v) => arr.filter(a => a < v).length / arr.length;
  return { perf: clamp(2 * (pct(peers.map(sc), sc(p)) - pct(peers.map(x => x.o), p.o)), -1, 1), line: STAT_TEXT[p.p](mine) };
}
function demandOf(L, p) {
  const pf = perfOf(L, p), mor = moraleOf(L, p), mine = p.t === myId(L);
  const moodF = !mine ? 1 : mor < 45 ? 1 + (45 - mor) * 0.008 : mor > 75 ? 1 - (mor - 75) * 0.005 : 1, ageF = p.a >= 33 ? 0.65 : p.a >= 30 ? 0.85 : 1;
  const hit = Math.max(0.8, DRx().salaryOfPos(p.p, p.o) * (1 + 0.35 * pf.perf) * moodF * ageF);
  const y = p.a <= 27 ? 4 : p.a <= 30 ? 3 : p.a <= 33 ? 2 : 1, b = Math.round(hit * y * (p.o >= 85 ? 0.2 : p.o >= 75 ? 0.1 : 0) * 10) / 10;
  return { y, s: Math.round((hit - b / y) * 10) / 10, b, g: p.o >= 88 ? 60 : p.o >= 78 ? 40 : 15, i: 0, perf: Math.round(pf.perf * 100) / 100, line: pf.line };
}
const capHit = o => Math.round((o.s + o.b / o.y) * 10) / 10;
function contractSummary(o) {
  const tot = Math.round((o.s * o.y + o.b) * 10) / 10, gt = Math.round((o.s * o.y * o.g / 100 + o.b) * 10) / 10;
  return o.y + ' year' + (o.y > 1 ? 's' : '') + ', $' + tot + 'M total: $' + o.s + 'M a year in base salary' + (o.b ? ' plus a $' + o.b + 'M signing bonus' : '') + '. Cap hit $' + capHit(o) + 'M a year. $' + gt + 'M guaranteed (he gets it even if you cut him)' + (o.i ? '. Up to $' + o.i + 'M a year more in incentives if he hits his numbers' : '') + '.';
}
const offerVal = (o, a) => (o.s * o.y + o.b + (o.i || 0) * o.y * 0.5) / o.y * (1 + (o.g - a.g) * 0.0035) * (1 - 0.03 * Math.abs(o.y - a.y));
function deadMoney(L, p) {   // what still counts on the cap if you cut him: the rest of the bonus and the guaranteed part of the base he has left
  const c = p.ctr; if (!c) return 0;
  const left = Math.max(0, p.cx - L.season); return Math.round((c.b * left / c.y + c.s * left * c.g / 100) * 10) / 10;
}
function contractOpen(L, pid) {
  const p = L.players[pid]; if (!p) return null;
  const old = L.talks[pid]; if (old && old.state === 'open') return old;
  const f = L.fa, mine = p.t === myId(L), free = p.t === -1;
  if (!free && !(mine && f && f.exp.indexOf(pid) >= 0)) return null;
  const ask = demandOf(L, p), mor = moraleOf(L, p);
  const t = { pid, ask, pat: clamp(3 + Math.round((mine ? mor - 50 : 0) / 20), 2, 5), state: 'open', msgs: [] }; L.talks[pid] = t;
  const did = ask.line ? 'Last season I had ' + ask.line + '. ' : '', tone = ask.perf > 0.25 ? 'I outplayed my rating and I expect to be paid for it. ' : ask.perf < -0.25 ? 'I know last season was not my best, so I will be reasonable. ' : '', mood = mine && mor < 45 ? 'To be honest, I have not been happy here, and it will take more to keep me. ' : mine && mor > 75 ? 'I love it here, and I am willing to give you a break to stay. ' : '';
  t.msgs.push({ from: 'him', text: (mine ? 'Coach, my contract is up. ' : 'Thanks for reaching out. I am looking for a new home. ') + did + tone + mood + 'Here is what I am looking for: ' + contractSummary(ask) });
  inMail(L, { from: p.n, subj: (mine ? 'My new contract' : 'Free agency: ') + (mine ? '' : p.n + ' (' + p.p + ' ' + p.o + ')'), body: t.msgs[0].text, kind: 'contract', pid });
  return t;
}
// your offer: he signs, counters, or (pushed too far) ends the talks
function contractOffer(L, tid, pid, o) {
  const p = L.players[pid], t = L.talks[pid]; if (!p || !t || t.state !== 'open') return { ok: false, msg: 'These talks are over.' };
  o = { y: Math.round(+o.y), s: Math.round(+o.s * 10) / 10, b: Math.round((+o.b || 0) * 10) / 10, g: Math.round(+o.g || 0), i: Math.round((+o.i || 0) * 10) / 10 };
  if (!(o.y >= 1 && o.y <= 6) || !(o.s >= 0.5) || o.b < 0 || o.g < 0 || o.g > 100 || o.i < 0) return { ok: false, msg: 'That offer does not add up.' };
  const mine = p.t === tid, room = capRoom(L, tid) + (mine ? salOf(p) : 0); if (capHit(o) > room + 1e-6) return { ok: false, msg: 'A cap hit of $' + capHit(o) + 'M is more than your $' + Math.max(0, Math.round(room * 10) / 10) + 'M of room.' };
  if (!mine && activeRoster(L, tid).length >= ROSTER_MAX) return { ok: false, msg: 'Your roster is full. Release someone first.' };
  t.msgs.push({ from: 'you', text: contractSummary(o) });
  const a = t.ask, ratio = offerVal(o, a) / offerVal(a, a);
  if (ratio >= 0.985) {
    p.t = tid; p.sal = capHit(o); p.cx = L.season + o.y; p.ctr = Object.assign({ s0: L.season }, o); delete p.was; delete p.st; t.state = 'signed';
    if (L.fa) L.fa.exp = L.fa.exp.filter(x => x !== pid);
    t.msgs.push({ from: 'him', text: 'Deal. Thank you, coach. I am ready to go to work.' });
    if (isStar(p)) setMorale(L, p, ratio > 1.1 ? 12 : 6);
    inMail(L, { from: p.n, subj: 'Contract signed', body: contractSummary(o), read: true, pid });
    if (p.o >= 85) L.news.unshift({ s: L.season, t: p.n + ' signs with the ' + L.teams[tid].nick + ': $' + Math.round((o.s * o.y + o.b) * 10) / 10 + 'M over ' + o.y + ' years.' });
    return { ok: true, signed: true };
  }
  t.pat -= ratio < 0.6 ? 2 : 1;
  if (t.pat <= 0) { t.state = 'closed'; if (mine) setMorale(L, p, -8); t.msgs.push({ from: 'him', text: 'I do not think you are serious about this. I am done talking.' }); return { ok: true, closed: true }; }
  if (ratio >= 0.8) { const m = 0.25; a.s = Math.round((a.s - Math.max(0, a.s - o.s) * m) * 10) / 10; a.b = Math.round((a.b - Math.max(0, a.b - o.b) * m) * 10) / 10; }
  const why = o.g < a.g - 15 ? 'I need more of it guaranteed. ' : o.y < a.y - 1 ? 'I am looking for more security than that many years. ' : o.y > a.y + 1 ? 'I do not want to be locked in that long at that price. ' : '';
  t.msgs.push({ from: 'him', text: (ratio < 0.6 ? 'That is insulting. ' : ratio < 0.85 ? 'We are still a long way apart. ' : 'We are getting close. ') + why + 'Here is where I am: ' + contractSummary(a) });
  return { ok: true };
}

/* ---------------- custom leagues ---------------- */
const COLORS = [['#c8102e', '#ffffff'], ['#0b3d91', '#ffb81c'], ['#046a38', '#ffffff'], ['#6f2dbd', '#f2c94c'], ['#e87722', '#111111'], ['#00a3b4', '#0b2a4a'], ['#7a1f3d', '#d9b36c'], ['#2f4858', '#f6ae2d'], ['#d62828', '#003049'], ['#1b998b', '#ffffff'], ['#8d99ae', '#2b2d42'], ['#f4d35e', '#0d3b66']];
function newCustom(cfg, manager) {
  // units: the draft takes O-lines and defenses as whole units (leagues made before this have no flag and keep drafting every player)
  const c = Object.assign({ kind: 'custom', name: 'My League', entry: 'nfl', divisions: false, nDivs: 2, cpus: true, games: 8, playoffs: 4, trades: true, rounds: 16, nTeams: 8, deadline: 10, autoTrim: true, units: true }, cfg || {});
  const L = { v: 1, dpos: 1, kind: 'custom', cfg: c, seed: Math.floor(Math.random() * 2147483647), nid: 0, season: 2026, week: 1, phase: 'setup', teams: [], players: {}, sched: [],
    hist: [], stats: {}, news: [], manager, user: null, real: false, lastWeek: 1 };
  return L;
}
// teams in setup. In 'nfl' entry each slot is an NFL franchise; in 'draft' entry it is a custom club.
function addTeam(L, opt) {
  opt = opt || {};
  const c = L.cfg;
  if (L.phase !== 'setup') return { err: 'The league has already started.' };
  if (L.teams.length >= (c.entry === 'nfl' ? 32 : 32)) return { err: 'A league holds up to 32 teams.' };
  const id = L.teams.length;
  let t;
  if (c.entry === 'nfl') {
    const used = L.teams.map(x => x.abbr);
    const fr = opt.abbr ? DATA.TEAMS.find(x => x.abbr === opt.abbr) : DATA.TEAMS.find(x => used.indexOf(x.abbr) < 0);
    if (!fr || used.indexOf(fr.abbr) >= 0) return { err: 'That franchise is taken.' };
    t = { id, abbr: fr.abbr, city: fr.city, nick: fr.nick, name: fr.city + ' ' + fr.nick, c1: fr.c1, c2: fr.c2, conf: fr.conf, div: null, owner: opt.owner || null, sch: DATA.DFU[DATA.TEAMS.indexOf(fr)].scheme, fr: DATA.TEAMS.indexOf(fr) };
  } else {
    const cols = COLORS[id % COLORS.length], nm = (opt.name || 'Team ' + (id + 1)).slice(0, 18);
    const cpuNames = ['Rockets', 'Wolves', 'Vipers', 'Knights', 'Comets', 'Titans', 'Bandits', 'Falcons', 'Storm', 'Miners', 'Rebels', 'Sharks'];
    t = { id, abbr: 'C' + (id + 1), city: '', nick: nm, name: nm, c1: opt.c1 || cols[0], c2: opt.c2 || cols[1], conf: null, div: null, owner: opt.owner || null, sch: id % 2 ? '34' : '43' };
    if (!opt.name && !opt.owner) { t.nick = t.name = pickOf(rng(L, 'tn' + id), cpuNames) + ' ' + (id + 1); }
  }
  L.teams.push(t);
  return { team: t };
}
function removeTeam(L, id) {
  if (L.phase !== 'setup') return 'The league has already started.';
  L.teams = L.teams.filter(t => t.id !== id); L.teams.forEach((t, i) => { t.id = i; });
  return null;
}
function assignDivisions(L) {
  const c = L.cfg;
  if (!c.divisions) { L.teams.forEach(t => { t.div = null; }); return; }
  const n = L.teams.length, k = clamp(c.nDivs, 2, Math.max(2, Math.floor(n / 2)));
  L.teams.forEach((t, i) => { if (t.div == null || t.div === '' || !t.div || t.div[0] !== 'D' || +t.div.slice(1) > k) t.div = 'D' + ((i % k) + 1); });
  Object.keys(DIV_NAMES).forEach(() => {});
  L.teams.forEach(t => { DIV_NAMES[t.div] = DIV_NAMES[t.div] || 'Division ' + t.div.slice(1); });
}
function customSchedule(L) {
  const ids = L.teams.map(t => t.id), g = clamp(L.cfg.games, 1, (ids.length - 1) * 2);
  const list = rrSchedule(L, ids, g);
  L.lastWeek = list.length ? Math.max.apply(null, list.map(x => x.w)) : 1;
  return list;
}
function startCustom(L) {
  const c = L.cfg;
  if (L.teams.length < 2) return 'You need at least 2 teams.';
  L.teams.forEach(t => { if (!t.owner && !c.cpus && !t.keep) { /* empty seat */ } });
  assignDivisions(L);
  if (c.entry === 'nfl') {
    // copy the real franchise rosters for every slot
    const base = newNFL({ seed: L.seed });
    L.nid = base.nid;
    L.teams.forEach(t => {
      Object.values(base.players).forEach(p => { if (p.t === t.fr) { const q = Object.assign({}, p, { t: t.id }); q.i = p.i + 'L' + t.id; L.players[q.i] = q; } });
    });
    // free agents
    Object.values(base.players).forEach(p => { if (p.t === -1) { const q = Object.assign({}, p); L.players[q.i] = q; } });
    L.teams.forEach(t => fillDepth(L, t.id));
    L.sched = customSchedule(L); L.phase = 'regular'; L.week = 1;
    return null;
  }
  // draft entry: every NFL player goes into one pool, teams draft their rosters
  const base = newNFL({ seed: L.seed });
  L.nid = base.nid;
  Object.values(base.players).forEach(p => { const q = Object.assign({}, p, { t: -1 }); if (p.t >= 0) q.fr = p.t; L.players[q.i] = q; });   // fr: the franchise he came from
  const rounds = c.units ? clamp(c.rounds, UNIT_ROUNDS[0], UNIT_ROUNDS[1]) : clamp(c.rounds, 25, 34);
  let order = L.draftOrder && L.draftOrder.length === L.teams.length ? L.draftOrder.slice() : shuffle(rng(L, 'dord'), L.teams.map(t => t.id));
  const seq = [];
  for (let rd = 0; rd < rounds; rd++) (rd % 2 ? order.slice().reverse() : order).forEach(t => seq.push(t));
  L.draft = { kind: 'league', rounds, seq, pos: 0, picks: [], pool: Object.keys(L.players), auto: {}, cap: c.cap || 0, spent: {} };
  if (c.units) {
    // every franchise's O-line (all its linemen) and defense (all its DL, LB, CB, S) is one pick; the rest are drafted one by one.
    // Linemen and defenders nobody had (free agents) stay free agents.
    const units = {};
    DATA.TEAMS.forEach((T, fr) => ['OL', 'DEF'].forEach(k => {
      const ids = Object.keys(L.players).filter(id => L.players[id].fr === fr && UNIT_POS[k].indexOf(L.players[id].p) >= 0);
      if (ids.length) units[UNIT + k + ':' + fr] = { k, fr, ids, sch: (DATA.DFU[fr] || {}).scheme || '43', name: T.nick + (k === 'OL' ? ' O-Line' : ' Defense') };
    }));
    L.draft.units = units;
    L.draft.pool = Object.keys(L.players).filter(id => UNIT_POS.OL.concat(UNIT_POS.DEF).indexOf(L.players[id].p) < 0).concat(Object.keys(units));
  }
  L.draft.pool.sort((x, y) => draftOvr(L, y) - draftOvr(L, x));
  L.phase = 'draft';
  autoDraftToHuman(L);
  return null;
}
function finalizeLeagueDraft(L) {
  if (L.cfg.kind === 'custom' && L.phase === 'preseason' && L.draft && L.draft.kind === 'league' && !L.sched.length) {
    L.sched = customSchedule(L); L.phase = 'regular'; L.week = 1;
  }
}
function leagueTables(L) {
  const R = records(L);
  return L.teams.map(t => ({ t, r: R[t.id] }));
}
function ownerRecord(L, owner) {
  const R = records(L), t = L.teams.find(x => x.owner === owner);
  if (!t) return null;
  const r = R[t.id];
  const champ = (L.hist || []).filter(h => h.champ === t.id).length;
  return { team: t.name, w: r.w, l: r.l, t: r.t, pf: r.pf, pa: r.pa, season: L.season, champs: champ };
}
function leaders(L, key, n) {
  const arr = [];
  const S = L.stats;
  Object.keys(S).forEach(id => { const p = L.players[id]; if (p && S[id][key]) arr.push({ id, n: p.n, t: p.t, v: S[id][key], p: p.p }); });
  arr.sort((a, b) => b.v - a.v);
  return arr.slice(0, n || 5);
}

/* ---------------- tournaments ---------------- */
function bracketOrder(P) {
  let a = [1];
  while (a.length < P) { const n = a.length * 2; a = a.flatMap(x => [x, n + 1 - x]); }
  return a;
}
// entries are already in seed order. bo: array of best-of per round (last = final)
function makeBracket(n, bo) {
  const P = Math.max(2, 1 << Math.ceil(Math.log2(Math.max(2, n)))), rounds = Math.log2(P);
  const order = bracketOrder(P), matches = [];
  for (let rd = 1; rd <= rounds; rd++) {
    const cnt = P >> rd;
    for (let m = 0; m < cnt; m++) matches.push({ id: 'r' + rd + 'm' + (m + 1), r: rd, m: m + 1, a: null, b: null, w: [0, 0], games: [], win: null, bo: (bo && bo[Math.min(rd - 1, bo.length - 1)]) || 1 });
  }
  const find = (r, m) => matches.find(x => x.r === r && x.m === m);
  for (let m = 0; m < P / 2; m++) {
    const s1 = order[m * 2], s2 = order[m * 2 + 1];
    const x = find(1, m + 1);
    x.a = s1 <= n ? s1 - 1 : null; x.b = s2 <= n ? s2 - 1 : null;
  }
  const br = { P, rounds, matches };
  settleByes(br);
  return br;
}
function settleByes(br) {
  const find = (r, m) => br.matches.find(x => x.r === r && x.m === m);
  let changed = true;
  while (changed) {
    changed = false;
    br.matches.forEach(m => {
      if (m.win != null) return;
      const feeders = m.r === 1 ? null : [find(m.r - 1, m.m * 2 - 1), find(m.r - 1, m.m * 2)];
      if (m.r === 1 && ((m.a == null) !== (m.b == null)) ) { m.win = m.a != null ? m.a : m.b; m.bye = true; changed = true; place(br, m); }
    });
  }
}
function place(br, m) {
  if (m.r >= br.rounds) return;
  const nx = br.matches.find(x => x.r === m.r + 1 && x.m === Math.ceil(m.m / 2));
  if (m.m % 2) nx.a = m.win; else nx.b = m.win;
}
// record one game of a series; winner (0 or 1 = side a/b) and scores. returns the match
function reportSeries(br, matchId, side, sa, sb) {
  const m = br.matches.find(x => x.id === matchId);
  if (!m || m.win != null || m.a == null || m.b == null) return null;
  m.games.push([sa, sb]); m.w[side]++;
  const need = Math.floor(m.bo / 2) + 1;
  if (m.w[0] >= need || m.w[1] >= need) { m.win = m.w[0] >= need ? m.a : m.b; place(br, m); }
  return m;
}
function setSeries(br, matchId, winnerSide) { // manager override
  const m = br.matches.find(x => x.id === matchId);
  if (!m || m.a == null || m.b == null) return null;
  const need = Math.floor(m.bo / 2) + 1;
  m.w = winnerSide === 0 ? [need, m.w[1] >= need ? need - 1 : m.w[1]] : [m.w[0] >= need ? need - 1 : m.w[0], need];
  m.win = winnerSide === 0 ? m.a : m.b; place(br, m);
  return m;
}
const ROUND_NAMES = n => n === 1 ? 'Final' : n === 2 ? 'Semifinals' : n === 3 ? 'Quarterfinals' : 'Round of ' + (1 << n);

const LG = {
  POS, POS_NAME, ROSTER_MAX, upgradePositions, potSeen, TIERS, genProspects, FRONT, SLOT_POS, TRADE_DEADLINE, DIV_NAMES, CONF_DIVS, counts, MIN_DEPTH, COLORS, ROUND_NAMES,
  newNFL, rosterOf, posCount, lineup, squadOf, teamsFor, teamRating, gameSeed,
  divisionRanks, nflMatchups, STAT_KEYS, sumStats, gameLog, teamStats, playerStats, induct, ensurePicks, picksOf, pickOf_, isPick, pickId, pickValue, pickProjection, pickLabel, assetValue, strengthFrac, pickOpen, simGame, forfeit, playVerified, weekGames, simWeek, advanceWeek, runUntilHuman, humanSides, checkFinal,
  records, standings, overallRank, rank, startPlayoffs, advancePlayoffs,
  depthOrder, setStarter,
  INJ_RATE, IR_MIN, SEASON_OUT, activeRoster, healthy, injuries, injuryWeek, placeIR, activateIR,
  RET_POS, retRating, returnerCands, returnerOf, setReturner,
  USE_DEFAULT, usageList, setUsage, snapShare,
  progress, offseasonBegin, startDraft, draftPick, onClock, autoDraftToHuman, cpuPickFor, canDraftPos, affordable, capInfo, salOf, UNIT_ROUNDS, fillPrice, hasLegalPick, isUnitId, unitOf, unitRating, draftOvr, salOfId, draftLabel, unitNeeds, canDraftId, affordableId, autoPickFor, startSeason, trimRoster, fillDepth, finishDraft,
  __suspend: suspend, isStar, modeOf, MODE, campInit, teamMode, updateModes, cpuTradesRound, tradeAsk, tradeCounter, tradeTalkLeft, tradeTalkUse, draftAdvance, draftUpOffers, draftDownBids, draftPrem, rookieScore, draftSlot, faNext, faFinish, letWalk, demandOf, contractOpen, contractOffer, contractSummary, inMail, mailRead, mailAnswer, unread, moraleOf, setMorale, moraleBump, pressAnswer, upgradeCost, upgrade, hireCoach, coachMarket, FACILITY, deadMoney, COACH_ANSWERS, playerValue, tradeCheck, cpuTrade, tradeEval, teamNeeds, doTrade, canTrade, cpuOffers, PAYROLL_CAP, payrollCap, payroll, capRoom, signFA, release, BLOCK_MAX, blockOf, setBlock, blockBids,
  newCustom, addTeam, removeTeam, assignDivisions, startCustom, finalizeLeagueDraft, customSchedule, ownerRecord, leaders, leagueTables,
  computeAwards, makeBracket, reportSeries, setSeries, bracketOrder, nflMatchups, assignWeeks, rrSchedule, mkPlayer, rng, shuffle
};
if (typeof module !== 'undefined' && module.exports) module.exports = LG;
else root.LG = LG;
})(typeof window !== 'undefined' ? window : globalThis);
