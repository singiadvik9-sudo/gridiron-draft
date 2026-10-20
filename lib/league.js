/* League engine: rosters, schedules, simulation, standings, playoffs, progression, drafts, trades,
   custom leagues and tournament brackets. Pure JSON-in / JSON-out so the browser (campaign) and the
   server (shared leagues) run the exact same rules. */
(function (root) {
'use strict';
const E = root.E || require('./engine.js');
const DATA = E.DATA;

/* ---------------- constants ---------------- */
// K = kicker, P = punter, KR = kick returner, PR = punt returner (one starter each, no backups)
const POS = ['QB', 'HB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P', 'KR', 'PR'];
const ROSTER_MAX = 53;
const TRADE_DEADLINE = 10;       // campaign: no trades after this week
function counts(sch) { return { QB: 1, HB: 1, WR: 2, TE: 1, OL: 5, DL: sch === '43' ? 4 : 3, LB: sch === '43' ? 3 : 4, CB: 2, S: 2, K: 1, P: 1, KR: 0, PR: 0 }; }   // returners are optional: a team without one uses its franchise's real returner
const MIN_DEPTH = { QB: 2, HB: 2, WR: 4, TE: 2, OL: 7, DL: 6, LB: 5, CB: 4, S: 3, K: 1, P: 1, KR: 0, PR: 0 };
const SPECIAL = { K: 1, P: 1, KR: 1, PR: 1 };
const FA_BAG = ['QB', 'HB', 'WR', 'WR', 'TE', 'OL', 'OL', 'DL', 'DL', 'LB', 'LB', 'CB', 'CB', 'S', 'K', 'P'];   // positions free agents are drawn from
const POS_NAME = { QB: 'Quarterback', HB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', OL: 'Offensive line', DL: 'Defensive line', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety', K: 'Kicker', P: 'Punter', KR: 'Kick returner', PR: 'Punt returner' };
const SLOT_LABELS = {
  '43': { DL: ['LDE', 'LDT', 'RDT', 'RDE'], LB: ['WLB', 'MLB', 'SLB'], CB: ['LCB', 'RCB'], S: ['SS', 'FS'] },
  '34': { DL: ['LDE', 'NT', 'RDE'], LB: ['WLB', 'LILB', 'RILB', 'SLB'], CB: ['LCB', 'RCB'], S: ['SS', 'FS'] }
};
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
  const p = Object.assign({ i: nid(L, 'x'), n: randName(r), p: 'WR', o: 60, a: 24, pt: 66, sk: pickOf(r, SKIN_W), hr: pickOf(r, HAIR_W), t: -1, h: [] }, o);
  if (!p.s) p.s = skillSpeed(p.p, p.o, r);
  if (p.pt < p.o) p.pt = p.o;
  L.players[p.i] = p;
  return p;
}
function skillSpeed(pos, o, r) {
  const b = { QB: 76, HB: 88, WR: 90, TE: 82, OL: 62, DL: 76, LB: 82, CB: 91, S: 88, K: 60, P: 60, KR: 92, PR: 91 }[pos] || 80;
  return clamp(Math.round(b + (o - 70) * 0.15 + (r() - 0.5) * 8), 55, 99);
}
function potFor(r, o, a) { return clamp(o + (a <= 22 ? ri(r, 3, 12) : a <= 24 ? ri(r, 1, 8) : a <= 27 ? ri(r, 0, 3) : 0), 40, 99); }

/* ---------------- building the NFL ---------------- */
function newNFL(opts) {
  opts = opts || {};
  const L = { v: 1, kind: 'campaign', seed: opts.seed || Math.floor(Math.random() * 2147483647), nid: 0, season: 2026, week: 1, phase: 'regular',
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
    mkPlayerFixed(L, { i: 'd' + ui + '_' + k, n: q[2], p: q[1], o: q[3], a: q[5], t: T(u.team), sal: q[6], cx: q[7], rt: q[8] || undefined, s: q[9] || undefined }, r);
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
function rosterOf(L, tid) { const a = []; for (const k in L.players) if (L.players[k].t === tid) a.push(L.players[k]); return a; }
// the 53 that count: players on injured reserve are still on the team (and its payroll) but not on the active roster
function activeRoster(L, tid) { return rosterOf(L, tid).filter(p => !p.ir); }
const healthy = p => !p.inj && !p.ir;
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
function lineup(L, tid) {
  const T = L.teams[tid], need = counts(T.sch), by = {};
  POS.forEach(p => { by[p] = []; });
  rosterOf(L, tid).forEach(p => { if (healthy(p)) by[p.p].push(p); });   // the injured sit
  POS.forEach(p => by[p].sort((a, b) => b.o - a.o));
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
  const sk = p => { p = p || walk('WR'); return { i: p.i, n: p.n, o: p.o, s: p.s || 80, sk: p.sk, hr: p.hr, tm: T.abbr }; };
  const g = (pos, n) => { const a = ln[pos].slice(); while (a.length < n) a.push(walk(pos)); return a; };
  const labels = SLOT_LABELS[T.sch];
  const dl = g('DL', counts(T.sch).DL), lb = g('LB', counts(T.sch).LB), cb = g('CB', 2), s = g('S', 2);
  const df = [];
  dl.forEach((p, i) => df.push([labels.DL[i], 'DL', p.n, p.o, p.i]));
  lb.forEach((p, i) => df.push([labels.LB[i], 'LB', p.n, p.o, p.i]));
  cb.forEach((p, i) => df.push([labels.CB[i], 'CB', p.n, p.o, p.i]));
  s.forEach((p, i) => df.push([labels.S[i], 'S', p.n, p.o, p.i]));
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
    ol: { tm: T.abbr, p: g('OL', 5).map(p => [p.n, p.o, p.i]) },
    df: { tm: T.abbr, sch: T.sch, p: df },
    k: spec('K', base.k), kr: ret('KR', base.kr), pr: ret('PR', base.pr), st: { tm: base.st.tm, p: stp }
  };
}
/* usage: each back, receiver and tight end's share of his group's snaps (0-100), set by the coach (p.use) or, until he does, by depth:
   the best of each group plays most. A group's usages share its spots (the receivers' add up to two spots); on a given play the
   ones who fit it best are a little likelier, and on passing downs a receiver can take the TE spot (the slot). */
const USE_DEFAULT = { HB: [65, 30, 5], WR: [95, 80, 20, 5], TE: [85, 15] };   // each group adds up to its spots (1 HB, 2 WR, 1 TE)
function usageList(L, tid, pos) {
  const ps = rosterOf(L, tid).filter(p => p.p === pos && healthy(p)).sort((a, b) => b.o - a.o || (a.i < b.i ? -1 : 1));
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
  return { a: { name: L.teams[aId].nick, squad: squadOf(L, aId) }, b: { name: L.teams[bId].nick, squad: squadOf(L, bId) } };
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
  });
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
    if (p && p.t >= 0 && L.teams[p.t] && L.teams[p.t].owner) { const ps = g.ps || (g.ps = {}), t = ps[p.t] || (ps[p.t] = {}), l = t[id] || (t[id] = {}); l[k] = (l[k] || 0) + (v || 1); }
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
  const r = rng(L, 'prog' + L.season), report = { up: [], down: [], retired: [] };
  // keep each season's stat line for players on a team a person runs (career totals)
  Object.keys(L.stats || {}).forEach(id => {
    const p = L.players[id]; if (!p || p.t < 0 || !L.teams[p.t] || !L.teams[p.t].owner) return;
    (p.ss = p.ss || []).push(Object.assign({ y: L.season, t: p.t }, L.stats[id]));
    if (p.ss.length > 20) p.ss.shift();
  });
  Object.values(L.players).forEach(p => {
    if (p.t === -2 || p.t === -3) return;
    delete p.inj; delete p.ir; delete p.irw;   // healthy again for the new season
    p.h = (p.h || []).concat([p.o]).slice(-8);
    const a = p.a, bonus = p.o < p.pt ? Math.min(3, Math.round((p.pt - p.o) * 0.2)) : 0;
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
    if (p.s) p.s = clamp(p.s + (a <= 24 ? ri(r, 0, 2) : a >= 29 ? -ri(r, 0, 3) : ri(r, -1, 1)), 50, 99);
    p.a++;
    // a contract that ran out this season: he re-signs at the market price for his new rating, for one to four more seasons
    if (p.cx != null && p.cx <= L.season) { p.sal = DRx().salaryOfPos(p.p, p.o); p.cx = L.season + ri(r, 1, 4); }
    const kp = p.p === 'K' || p.p === 'P';
    const retire = kp ? (p.a >= 41 || (p.a >= 38 && p.o < 70 && r() < 0.5)) : (p.a >= 37) || (p.a >= 34 && p.o < (p.p === 'QB' ? 70 : 76) && r() < 0.5) || (p.a >= 32 && p.o < 55 && r() < 0.6);
    if (retire) { report.retired.push(p.i); p.t = -2; return; }
    if (p.o - old >= 4) report.up.push(p.i); else if (old - p.o >= 4) report.down.push(p.i);
  });
  // old career line is kept in the player's history; season stats reset
  L.lastStats = L.stats; L.stats = {};
  L.teams.forEach(t => { fillDepth(L, t.id, r); });
  L.snaps = {}; L.tsnaps = {};   // a new season counts from zero
  return report;
}

/* ---------------- draft ---------------- */
const PROSPECT_POS = { QB: 10, HB: 18, WR: 28, TE: 12, OL: 40, DL: 42, LB: 28, CB: 28, S: 18, K: 4, P: 4, KR: 0, PR: 0 };
function genProspects(L, n) {
  const r = rng(L, 'class' + L.season), list = [];
  const bag = []; POS.forEach(p => { for (let k = 0; k < PROSPECT_POS[p]; k++) bag.push(p); });
  for (let k = 0; k < n; k++) {
    const pos = pickOf(r, bag), q = k / n, a = ri(r, 21, 23);
    let o = clamp(Math.round(80 - 28 * Math.pow(q, 0.8) + (r() - 0.5) * 9 - (pos === 'QB' && k > 4 ? 3 : 0)), 44, 90);
    if (pos === 'K' || pos === 'P') o = clamp(Math.round(52 + (o - 44) * 0.6 + (r() - 0.5) * 6), 50, 82);   // kickers and punters are rated on a tighter scale
    const pt = clamp(o + ri(r, 4, 16) - Math.round(q * 6), o, 99);
    list.push(mkPlayer(L, { p: pos, o, a, pt, t: -3 }));
  }
  list.sort((x, y) => (y.o + y.pt * 0.5) - (x.o + x.pt * 0.5));
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
  autoDraftToHuman(L);
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
function cpuPickFor(L, tid, pool) {
  const ctx = needCtx(L, tid), ci = L.draft && L.draft.kind === 'league' ? capInfo(L, tid) : null;
  const fair = ci ? Math.max(1, (ci.room - ci.left * CAP_FILL) / Math.max(1, ci.left)) : 0;
  let best = null, bs = -1e9;
  pool.forEach(id => {
    const p = L.players[id];
    if (ci && !affordable(L, tid, p)) return;
    let s = p.o * 0.9 + (p.pt - p.o) * 0.35 - (p.a - 21) * 0.4 + needScore(ctx, p);
    if (ci) s -= 1.1 * Math.max(0, salOf(p) - 1.7 * fair);
    if (s > bs) { bs = s; best = id; }
  });
  return best;
}
/* ---------------- unit league drafts ----------------
   d.units[id] = { k: 'OL' | 'DEF', fr, ids, sch, name } for ids 'u:OL:<franchise>' / 'u:DEF:<franchise>'. A team takes exactly one of each;
   its other starting spots (QB, HB, 2 WR, TE, K, P) and its depth come one player at a time. */
const UNIT = 'u:', UNIT_POS = { OL: ['OL'], DEF: ['DL', 'LB', 'CB', 'S'] }, UNIT_ROUNDS = [12, 20], SOLO = { QB: 1, HB: 1, WR: 2, TE: 1, K: 1, P: 1 };
const isUnitId = id => typeof id === 'string' && id.indexOf(UNIT) === 0;
const unitOf = (L, id) => L.draft && L.draft.units && L.draft.units[id] || null;
function unitRating(L, u) {   // the starters' average: the best 5 linemen, or the best 11 by the unit's scheme
  const ps = u.ids.map(id => L.players[id]).sort((a, b) => b.o - a.o);
  const top = u.k === 'OL' ? ps.slice(0, 5) : ['DL', 'LB', 'CB', 'S'].reduce((a, g) => a.concat(ps.filter(p => p.p === g).slice(0, counts(u.sch)[g])), []);
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
  L.sched = L.cfg && L.cfg.kind === 'custom' ? customSchedule(L) : nflSchedule(L, false, prevRanks);
  if (!(L.cfg && L.cfg.kind === 'custom')) L.lastWeek = Math.max.apply(null, L.sched.map(g => g.w));
  // refresh free agents
  const r = rng(L, 'fa' + L.season);
  for (let k = 0; k < 28; k++) { const pos = pickOf(r, FA_BAG), a = ri(r, 23, 32), o = SPECIAL[pos] && pos !== 'KR' && pos !== 'PR' ? ri(r, 56, 72) : ri(r, 50, 70); mkPlayer(L, { p: pos, o, a, pt: potFor(r, o, a), t: -1 }); }
}
function offseasonBegin(L, rounds) {
  const rep = progress(L);
  L.progress = rep;
  startDraft(L, rounds || 7);
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
function pickYearLocked(L) { return L.phase === 'draft' || L.phase === 'preseason' || !!(L.draft && L.draft.done && L.draft.kind === 'rookie'); }
function pickOpen(L, k) { return !(k.y === L.season && pickYearLocked(L)); }
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
  const known = k.y === L.season && (L.phase === 'offseason' || L.phase === 'draft');   // the order is set once the season is over
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
  const n = L.teams.length, pool = n * pickRounds(L) + 20, pj = pickProjection(L, k, fr);
  const q = Math.min(1, pj.overall / pool);
  const o = Math.max(44, 80 - 28 * Math.pow(q, 0.8));
  const base = Math.pow(Math.max(0, o - 48), 1.9) * 0.08 * 0.85 * 1.15 * (1 + (10 - q * 6) * 0.02);
  return base * 0.8 + 0.5;
}
function pickLabel(L, k) {
  const own = k.o === k.t ? '' : ' (' + L.teams[k.o].abbr + ')';
  return k.y + ' round ' + k.r + own;
}
// value of any tradeable asset id (player or pick)
function assetValue(L, id, fr) {
  if (isPick(id)) { const k = pickOf_(L, id); return k ? pickValue(L, k, fr) : 0; }
  return L.players[id] ? playerValue(L.players[id]) : 0;
}

/* ---------------- trades and free agency ---------------- */
const POS_W = { QB: 1.5, HB: 0.8, WR: 0.9, TE: 0.7, OL: 0.8, DL: 1, LB: 0.75, CB: 0.85, S: 0.65, K: 0.45, P: 0.3, KR: 0.35, PR: 0.3 };
function playerValue(p) {
  if (p.inj) return playerValue(Object.assign({}, p, { inj: 0 })) * (p.inj >= SEASON_OUT ? 0.25 : Math.max(0.3, 1 - p.inj / 12));   // out for weeks: worth less
  const ageF = p.a <= 25 ? 1.15 : p.a <= 28 ? 1 : p.a <= 30 ? 0.85 : p.a <= 32 ? 0.62 : 0.4;
  const base = Math.pow(Math.max(0, p.o - 48), 1.9) * 0.08;
  return base * POS_W[p.p] * ageF * (1 + Math.max(0, p.pt - p.o) * 0.02) + 0.5;
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
function tradeWorth(L, tid, receive, send, fr) {
  // how much a team values what it receives minus what it sends, counting how it changes the lineup
  fr = fr || strengthFrac(L); const val = ids => ids.reduce((t, id) => t + assetValue(L, id, fr), 0);
  const rp = receive.filter(id => !isPick(id)), sp = send.filter(id => !isPick(id));
  const before = lineupScore(L, tid);
  const snap = {}; rp.concat(sp).forEach(id => { snap[id] = L.players[id].t; });
  rp.forEach(id => { L.players[id].t = tid; }); sp.forEach(id => { L.players[id].t = -9; });
  const after = lineupScore(L, tid);
  Object.keys(snap).forEach(id => { L.players[id].t = snap[id]; });
  return val(receive) - val(send) + (after - before) * 0.9;
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
  const w = tradeWorth(L, cpuTid, give, get, fr);
  const need = Math.max(2, 0.06 * give.concat(get).reduce((t, id) => t + assetValue(L, id, fr), 0));
  if (w >= need) return { ok: true, msg: L.teams[cpuTid].nick + ' accept the trade.', margin: w };
  return { ok: false, msg: w > 0 ? L.teams[cpuTid].nick + ' want a little more.' : L.teams[cpuTid].nick + ' turn it down.', margin: w };
}
function doTrade(L, ta, tb, give, get) {
  const mv = (id, to) => { if (isPick(id)) pickOf_(L, id).t = to; else L.players[id].t = to; };
  give.forEach(id => mv(id, tb)); get.forEach(id => mv(id, ta));
  [ta, tb].forEach(tid => { if (!L.teams[tid].owner) trimRoster(L, tid); });   // a CPU team over 53 cuts its least valuable player
  const np = give.concat(get).filter(isPick).length, nm = give.length + get.length - np;
  L.news.unshift({ s: L.season, t: L.teams[ta].nick + ' and ' + L.teams[tb].nick + ' complete a trade (' + [nm ? nm + ' player' + (nm > 1 ? 's' : '') : '', np ? np + ' pick' + (np > 1 ? 's' : '') : ''].filter(Boolean).join(' and ') + ').' });
  if (L.news.length > 40) L.news.length = 40;
}
function canTrade(L) {
  if (L.cfg && L.cfg.trades === false) return false;
  if (L.phase === 'regular') return L.week <= (L.cfg && L.cfg.deadline != null ? L.cfg.deadline : TRADE_DEADLINE);
  return L.phase === 'preseason' || L.phase === 'offseason' || L.phase === 'draft';
}
// the CPU suggests a few trades it would accept; with pos, offers that bring you a player at that position
function cpuOffers(L, userTid, pos) {
  if (POS.indexOf(pos) >= 0) return cpuOffersFor(L, userTid, pos);
  const r = rng(L, 'offers' + L.season + ':' + L.week + ':' + L.nid);
  const mine = rosterOf(L, userTid).filter(p => p.o >= 60), out = [];
  const others = shuffle(r, L.teams.filter(t => t.id !== userTid && !t.owner));
  for (const t of others) {
    if (out.length >= 3) break;
    const want = shuffle(r, mine).slice(0, 4);
    for (const w of want) {
      const theirs = rosterOf(L, t.id).filter(p => p.p === w.p || r() < 0.2).sort((a, b) => Math.abs(playerValue(a) - playerValue(w) * 1.15) - Math.abs(playerValue(b) - playerValue(w) * 1.15));
      for (const c of theirs.slice(0, 3)) {
        if (c.i === w.i) continue;
        const res = cpuTrade(L, userTid, t.id, [w.i], [c.i]);
        if (res.ok) { out.push({ t: t.id, give: [w.i], get: [c.i] }); break; }
      }
      if (out.length && out[out.length - 1].t === t.id) break;
    }
  }
  return out;
}
// shopping for one position: each CPU team's best player there that would help (or back up) your lineup,
// for the cheapest package of your players and picks it would accept (never a player at that same position)
function cpuOffersFor(L, userTid, pos) {
  const fr = strengthFrac(L), av = id => assetValue(L, id, fr);
  const ln = lineup(L, userTid)[pos] || [], floor = ln.length ? Math.min(...ln.map(p => p.o)) : 0;
  const mine = rosterOf(L, userTid).filter(p => p.p !== pos).map(p => p.i).concat(picksOf(L, userTid).filter(k => pickOpen(L, k)).map(pickId))
    .map(id => ({ id, v: av(id) })).sort((a, b) => a.v - b.v);
  const out = [];
  L.teams.forEach(t => {
    if (t.id === userTid || t.owner) return;
    const c = rosterOf(L, t.id).filter(p => p.p === pos && p.o > floor - 3).sort((a, b) => b.o - a.o)[0];
    if (!c) return;
    const want = av(c.i), ok = give => cpuTrade(L, userTid, t.id, give, [c.i], fr).ok;
    // one asset worth about as much, cheapest first; then two smaller ones that add up. Nothing that overpays by much: the point is a fair deal
    let give = null;
    for (const m of mine.filter(m => m.v >= want * 0.7 && m.v <= want * 1.35).slice(0, 8)) if (ok([m.id])) { give = [m.id]; break; }
    if (!give) {
      const small = mine.filter(m => m.v < want).slice(-10), pairs = [];
      for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) if (small[i].v + small[j].v >= want * 0.8 && small[i].v + small[j].v <= want * 1.5) pairs.push([small[i], small[j]]);
      pairs.sort((x, y) => x[0].v + x[1].v - y[0].v - y[1].v);
      for (const pr of pairs.slice(0, 8)) if (ok([pr[0].id, pr[1].id])) { give = [pr[0].id, pr[1].id]; break; }
    }
    if (give) out.push({ t: t.id, give, get: [c.i], o: c.o });
  });
  return out.sort((a, b) => b.o - a.o).slice(0, 6).map(x => ({ t: x.t, give: x.give, get: x.get }));
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
const payroll = (L, tid) => Math.round(rosterOf(L, tid).reduce((t, p) => t + salOf(p), 0) * 10) / 10;
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
  p.t = -1; return null;
}

/* ---------------- custom leagues ---------------- */
const COLORS = [['#c8102e', '#ffffff'], ['#0b3d91', '#ffb81c'], ['#046a38', '#ffffff'], ['#6f2dbd', '#f2c94c'], ['#e87722', '#111111'], ['#00a3b4', '#0b2a4a'], ['#7a1f3d', '#d9b36c'], ['#2f4858', '#f6ae2d'], ['#d62828', '#003049'], ['#1b998b', '#ffffff'], ['#8d99ae', '#2b2d42'], ['#f4d35e', '#0d3b66']];
function newCustom(cfg, manager) {
  // units: the draft takes O-lines and defenses as whole units (leagues made before this have no flag and keep drafting every player)
  const c = Object.assign({ kind: 'custom', name: 'My League', entry: 'nfl', divisions: false, nDivs: 2, cpus: true, games: 8, playoffs: 4, trades: true, rounds: 16, nTeams: 8, deadline: 10, autoTrim: true, units: true }, cfg || {});
  const L = { v: 1, kind: 'custom', cfg: c, seed: Math.floor(Math.random() * 2147483647), nid: 0, season: 2026, week: 1, phase: 'setup', teams: [], players: {}, sched: [],
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
  POS, POS_NAME, ROSTER_MAX, TRADE_DEADLINE, DIV_NAMES, CONF_DIVS, counts, MIN_DEPTH, COLORS, ROUND_NAMES,
  newNFL, rosterOf, posCount, lineup, squadOf, teamsFor, teamRating, gameSeed,
  divisionRanks, nflMatchups, STAT_KEYS, sumStats, gameLog, teamStats, ensurePicks, picksOf, pickOf_, isPick, pickId, pickValue, pickProjection, pickLabel, assetValue, strengthFrac, pickOpen, simGame, forfeit, playVerified, weekGames, simWeek, advanceWeek, runUntilHuman, humanSides, checkFinal,
  records, standings, overallRank, rank, startPlayoffs, advancePlayoffs,
  INJ_RATE, IR_MIN, SEASON_OUT, activeRoster, healthy, injuries, injuryWeek, placeIR, activateIR,
  RET_POS, retRating, returnerCands, returnerOf, setReturner,
  USE_DEFAULT, usageList, setUsage, snapShare,
  progress, offseasonBegin, startDraft, draftPick, onClock, autoDraftToHuman, cpuPickFor, canDraftPos, affordable, capInfo, salOf, UNIT_ROUNDS, fillPrice, hasLegalPick, isUnitId, unitOf, unitRating, draftOvr, salOfId, draftLabel, unitNeeds, canDraftId, affordableId, autoPickFor, startSeason, trimRoster, fillDepth, finishDraft,
  playerValue, tradeCheck, cpuTrade, doTrade, canTrade, cpuOffers, PAYROLL_CAP, payrollCap, payroll, capRoom, signFA, release, BLOCK_MAX, blockOf, setBlock, blockBids,
  newCustom, addTeam, removeTeam, assignDivisions, startCustom, finalizeLeagueDraft, customSchedule, ownerRecord, leaders, leagueTables,
  computeAwards, makeBracket, reportSeries, setSeries, bracketOrder, nflMatchups, assignWeeks, rrSchedule, mkPlayer, rng, shuffle
};
if (typeof module !== 'undefined' && module.exports) module.exports = LG;
else root.LG = LG;
})(typeof window !== 'undefined' ? window : globalThis);
