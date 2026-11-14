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
const USE_SPOTS = { HB: 1, WR: 2, TE: 1 };
// fit raw weights to a total (spots x 100) with no one over 100: scaled in proportion, anyone over 100 capped and the rest shared out again
function fitUse(w, total) {
  const out = w.map(() => 0), free = w.map((x, i) => i);
  let left = Math.min(total, 100 * w.length);
  if (!w.some(x => x > 0)) return w.map((x, i) => i < total / 100 ? 100 : 0);
  for (let pass = 0; pass < w.length && free.length && left > 1e-9; pass++) {
    const sum = free.reduce((t, i) => t + w[i], 0); if (sum <= 0) { free.forEach(i => { out[i] += left / free.length; }); break; }
    const over = free.filter(i => out[i] + w[i] / sum * left > 100);
    if (!over.length) { free.forEach(i => { out[i] += w[i] / sum * left; }); left = 0; break; }
    over.forEach(i => { left -= 100 - out[i]; out[i] = 100; free.splice(free.indexOf(i), 1); });
  }
  return out;
}
// whole numbers that still add up exactly (the biggest remainders round up)
function roundTo(xs, total) {
  const f = xs.map(Math.floor), short = Math.round(Math.min(total, xs.reduce((t, x) => t + x, 0))) - f.reduce((t, x) => t + x, 0);
  xs.map((x, i) => ({ i, r: x - f[i] })).sort((a, b) => b.r - a.r || a.i - b.i).slice(0, Math.max(0, short)).forEach(o => { f[o.i]++; });
  return f;
}
// u: his share of the team's plays (a whole percent); the group's shares always fill its spots (two receivers on the field: 200 between them)
function usageList(L, tid, pos) {
  const ps = rosterOf(L, tid).filter(p => p.p === pos && healthy(p)).sort(depthOrder);
  const raw = ps.map((p, k) => p.use != null ? p.use : (USE_DEFAULT[pos][k] || 0)), us = roundTo(fitUse(raw, USE_SPOTS[pos] * 100), USE_SPOTS[pos] * 100);
  return ps.map((p, k) => ({ p, u: us[k], set: p.use != null }));
}
const useOf = (L, tid, p) => { const x = usageList(L, tid, p.p).find(y => y.p === p); return x ? x.u : 0; };
/* playing time he was just given (his share raised, or a promise kept): for PT_CALM games he does not ask for more, unless it is taken back
   (his share cut below what he was given, or he loses the starting job he was given). p.ptOk = { s: season, w: last week, u: share, st: starter } */
const PT_CALM = 6;
function ptRaised(L, p, u) { if (p.t < 0 || !L.teams[p.t]) return; p.ptOk = { s: L.season, w: (L.week || 0) + PT_CALM, u: u == null ? (USE_DEFAULT[p.p] ? useOf(L, p.t, p) : 0) : u, st: starterIds(L, p.t)[p.i] ? 1 : 0 }; }
function ptCalm(L, tid, p) {
  const k = p.ptOk; if (!k || k.s !== L.season || (L.week || 0) >= k.w) return false;
  if (USE_DEFAULT[p.p] && useOf(L, tid, p) < k.u) return false;
  if (k.st && !starterIds(L, tid)[p.i]) return false;
  return true;
}
// setting one player's share: the rest of his group make up the difference in proportion to what they had, so the group still fills its spots
function setUsage(L, tid, pid, v) {
  const p = L.players[pid];
  if (!p || p.t !== tid || !USE_DEFAULT[p.p]) return 'Usage is for running backs, receivers and tight ends.';
  if (v === null || v === '') { rosterOf(L, tid).forEach(q => { if (q.p === p.p) delete q.use; }); return null; }   // the whole group back to the default for the depth chart
  v = Math.round(+v); if (!isFinite(v) || v < 0 || v > 100) return 'Usage is 0 to 100.';
  const list = usageList(L, tid, p.p), me = list.find(x => x.p === p), total = USE_SPOTS[p.p] * 100;
  if (!me) { p.use = v; return null; }   // (he is hurt: kept for when he is back)
  const rest = list.filter(x => x !== me);
  v = Math.max(v, total - 100 * rest.length);   // with too few healthy players at the spot, everyone plays (no gap to fill)
  const was = me.u, fill = roundTo(fitUse(rest.map(x => x.u), total - v), total - v);
  p.use = v; rest.forEach((x, k) => { x.p.use = fill[k]; });
  if (v > was) ptRaised(L, p, v);
  return null;
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

// the same, a game at a time, handing the page back now and then (pause() between games once budget ms have gone by), so the screen keeps
// moving while a week or more is simulated. Exactly the same games in the same order: the same results as runUntilHuman.
async function runUntilHumanAsync(L, maxSteps, pause, budget) {
  let t0 = Date.now();
  const tick = async () => { if (pause && Date.now() - t0 > (budget || 30)) { await pause(L); t0 = Date.now(); } };
  for (let k = 0; k < (maxSteps || 40); k++) {
    for (const g of weekGames(L)) { const hs = humanSides(L, g); if (hs[0] || hs[1]) continue; simGame(L, g); await tick(); }
    if (weekGames(L).length) return 'human';
    if (L.phase === 'complete' || L.phase === 'draft' || L.phase === 'offseason') return L.phase;
    const before = L.phase + ':' + L.week;
    advanceWeek(L); await tick();
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
    if (p.o >= 90 && old < 90) report.stars.push(p.i);
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
/* who is a star: the top of the depth chart at QB, HB, WR (two), TE and every defensive starter, rated 78 or better. Nobody else: linemen, kickers,
   punters and backups have no morale of their own and get no star treatment. (A hurt starter still counts.) */
const STAR_SPOTS = { QB: 1, HB: 1, WR: 2, TE: 1 }, GOOD_O = 78;
function starterIds(L, tid) {
  const need = counts(L.teams[tid].sch), out = {}, by = {};
  rosterOf(L, tid).forEach(p => { (by[p.p] = by[p.p] || []).push(p); });
  Object.keys(by).forEach(q => { const n = STAR_SPOTS[q] || (DEF_P[q] ? need[q] || 0 : 0); by[q].sort(depthOrder).slice(0, n).forEach(p => { out[p.i] = 1; }); });
  return out;
}
const isStar = (L, p) => !!p && p.o >= GOOD_O && p.t >= 0 && !!L.teams[p.t] && !!starterIds(L, p.t)[p.i];
const moraleOf = (L, p) => p.mor != null && isStar(L, p) ? p.mor : 65;
function effOvr(L, tid, p) {
  if (!L.camp || !L.teams[tid].owner || !p || !p.p) return p.o;
  const star = isStar(L, p) ? clamp(Math.round((moraleOf(L, p) - 65) / 10), -3, 2) : 0, team = Math.round((L.morale.team - 60) / 15);
  const c = OFF_P[p.p] ? L.staff.oc : DEF_P[p.p] ? L.staff.dc : null, co = c ? Math.round((c.r - 70) / 6) : 0;
  return clamp(p.o + star + team + co, 40, 99);
}
const fightFactor = (L, tid) => !L.camp ? 0 : L.teams[tid].owner ? 1 + Math.max(0, (60 - L.morale.team) / 20) : 1;
function setMorale(L, p, d) { if (!isStar(L, p)) return; p.mor = clamp(Math.round(moraleOf(L, p) + d), 0, 100); }
function moraleBump(L, o) { if (o.team) L.morale.team = clamp(Math.round(L.morale.team + o.team), 0, 100); if (o.fans) L.morale.fans = clamp(Math.round(L.morale.fans + o.fans), 0, 100); if (o.cash) L.fin.cash = Math.round((L.fin.cash + o.cash) * 10) / 10; }
const starsOf = L => { const ids = starterIds(L, myId(L)); return rosterOf(L, myId(L)).filter(p => p.o >= GOOD_O && ids[p.i]).sort((a, b) => b.o - a.o); };

/* the inbox */
function inMail(L, m) {
  const a = L.inbox; L.mailN = (L.mailN || 0) + 1;
  const x = Object.assign({ id: 'm' + L.mailN, when: L.phase === 'regular' ? L.season + ' · Week ' + L.week : L.season + ' · ' + ({ playoffs: 'Playoffs', offseason: 'Offseason', fa: 'Free agency', draft: 'Draft', preseason: 'Preseason' }[L.phase] || ''), read: false }, m);
  a.unshift(x); if (a.length > 80) a.length = 80; return x;
}
const unread = L => (L.inbox || []).filter(m => !m.read).length;
// every message with the same person is one thread: a player by who they are, the owner however the owner signs, anyone else by name
const threadKey = m => m.pid ? 'p:' + m.pid : /\bowner\b/i.test(m.from || '') ? 'owner' : 'f:' + String(m.from || '').toLowerCase();
// the inbox as threads, newest activity first: { key, from, msgs (oldest first), last, unread, ask }
function mailThreads(L) {
  const by = {}, out = [];
  (L.inbox || []).forEach(m => { const k = threadKey(m); let t = by[k]; if (!t) { t = by[k] = { key: k, from: m.from, last: m, msgs: [], unread: 0, ask: 0 }; out.push(t); }
    t.msgs.unshift(m); if (!m.read) t.unread++; if (m.opts && m.ans == null) t.ask++; });
  return out;
}
// opening a message reads its whole thread
function mailRead(L, id) { const m = (L.inbox || []).find(x => x.id === id); if (m) { const k = threadKey(m); L.inbox.forEach(x => { if (threadKey(x) === k) x.read = true; }); } return m; }
// a reply from the buttons on a message: each option carries what it does
function mailAnswer(L, id, i) {
  const m = (L.inbox || []).find(x => x.id === id); let o = m && m.opts && m.opts[i]; if (!o || m.ans != null) return 'That has been answered.';
  if (o.cost && L.fin.cash < o.cost) return 'The team does not have $' + o.cost + 'M to spend.';
  m.ans = i;
  if (m.kind === 'job') { const e = jobAnswer(L, m, o); if (e) { m.ans = null; return e; } return null; }
  if (m.kind === 'life') { if (lifeAnswer(L, m, o)) return null; if (o.reply) inMail(L, { from: m.from, subj: 'Re: ' + m.subj, body: o.reply, read: true, kind: 'life' }); return null; }
  moraleBump(L, { team: o.team, fans: o.fans, cash: (o.cash || 0) - (o.cost || 0) });
  const p = m.pid && L.players[m.pid];
  if (p && o.risk && !p.inj && rng(L, 'risk:' + m.id)() < o.risk) { p.inj = o.riskG || 2; if (o.riskReply) { inMail(L, { from: m.from, pid: m.pid, subj: 'Re: ' + m.subj, body: o.riskReply.replace('{n}', p.n).replace('{g}', p.inj), read: false }); o = Object.assign({}, o, { reply: null }); } }
  if (p) { if (o.star) setMorale(L, p, o.star); if (o.prom) p.prom = o.prom; if (o.shop) setBlock(L, myId(L), p.i, true); }
  else if (o.star) starsOf(L).slice(0, 5).forEach(x => setMorale(L, x, o.star));
  if (o.reply) inMail(L, { from: m.from, pid: m.pid, subj: 'Re: ' + m.subj, body: o.reply.replace('{n}', p ? p.n : 'He'), read: true });
  return null;
}
const PR_EVENTS = [
  { from: 'Community relations', subj: 'Children\'s hospital fundraiser', body: 'The children\'s hospital is holding its fundraiser and has asked the team to host. It costs $1M to do properly. The fans would love it.', opts: [{ t: 'Host it ($1M)', cost: 1, fans: 5, team: 1, reply: 'Great turnout, and it was all over the local news.' }, { t: 'Send a signed jersey', fans: -1, reply: 'They said thanks. The local paper noticed the smaller gesture.' }] },
  { from: 'Marketing', subj: 'A sponsor wants the stadium plaza renamed', body: 'A payday lender will pay $4M to put its name on the plaza. Money is money, but the fans will not like it.', opts: [{ t: 'Take the money', cash: 4, fans: -5, reply: 'Done. The signs go up next week, and so do the angry letters.' }, { t: 'Say no', fans: 1, reply: 'Passed. Nobody will ever know you said no, but it was the right call.' }] },
  { from: 'Community relations', subj: 'Youth football camp', body: 'Your stars could spend an afternoon running a youth camp. They would rather rest, but it would be good for everyone.', opts: [{ t: 'Make them go', fans: 3, team: -1, reply: 'The kids loved it. The players are a bit tired.' }, { t: 'Ask for volunteers', fans: 1, team: 1, reply: 'A few of them showed up on their own. Nice moment.' }] },
  { from: 'Ticket office', subj: 'Ticket prices', body: 'We could raise ticket prices for the next few games and bring in about $3M.', opts: [{ t: 'Raise them', cash: 3, fans: -4, reply: 'Prices are up. Season-ticket holders are grumbling.' }, { t: 'Freeze them', fans: 2, reply: 'Prices stay put, and the fans appreciated the announcement.' }] },
  { from: 'Team captains', subj: 'Team dinner', body: 'The captains want a team dinner to bring everyone together. It runs about $0.5M with the travel and the venue.', opts: [{ t: 'Pay for it', cost: 0.5, team: 4, star: 2, reply: 'Good night. The locker room feels closer.' }, { t: 'Not now', team: -1, reply: 'Understood, coach.' }] }
];
// the season's middle: events about the team, and some about one of your stars ({n}, pid)
const MID_EVENTS = [
  { from: 'Broadcast partners', subj: 'You are the prime-time game', body: 'The network flexed your next game into prime time. The whole country will be watching. Extra media days, extra pressure.', opts: [{ t: 'Embrace the spotlight', fans: 4, team: -1, reply: 'The hype videos are everywhere. The players feel it.' }, { t: 'Treat it like any other week', team: 2, reply: 'Business as usual. The locker room liked that.' }] },
  { from: 'Sports radio', subj: 'Their coach is talking trash', body: 'The coach you play next said on the radio that your team is "soft and overrated." Reporters want a response.', opts: [{ t: 'Fire back', fans: 4, team: 2, reply: 'Your quote is on every bulletin board in the league, including theirs.' }, { t: 'Take the high road', team: 1, fans: -1, reply: 'Classy. The fans wanted a little more fire.' }, { t: 'Pin it up in the locker room', team: 4, reply: 'The players read it every morning. They are angry, in a good way.' }] },
  { from: '{n}', star: 1, subj: 'About my contract', body: 'Coach, I have outplayed this deal. My agent says other teams would pay me a lot more. I want to know you value me.', opts: [{ t: 'Promise talks after the season', star: 6, reply: 'That is all I wanted to hear. Let us win some games.' }, { t: 'Not during the season', star: -6, team: 1, reply: 'Fine. My agent will remember this.' }, { t: 'Offer to shop him', star: 1, shop: 1, reply: 'Appreciate the honesty. (He is on your trading block.)' }] },
  { from: 'Team captains', subj: 'A players-only meeting', body: 'The veterans called a players-only meeting after practice. One of them stood up and gave a speech nobody will forget.', opts: [{ t: 'Let them lead', team: 5, reply: 'You stayed out of it. Whatever was said, they came out of that room together.' }, { t: 'Sit in on it', team: -2, reply: 'Your presence made it awkward. Nobody said much.' }] },
  { from: 'Medical staff', subj: 'Injury scare in practice', body: '{n} tweaked something in practice. The doctors say he can play, but there is a risk he makes it worse.', opts: [{ t: 'Rest him this week', star: 2, team: -1, risk: 0, reply: 'He sits. He is not thrilled, but he will be fresh.' }, { t: 'Let him play through it', star: 1, fans: 1, risk: 0.3, riskG: 3, reply: 'He felt fine. No setbacks.', riskReply: 'Bad news: {n} aggravated it and is out {g} weeks.' }] },
  { from: 'Equipment staff', subj: 'Bad weather this week', body: 'The forecast for the next game is ugly: rain, wind, maybe worse. Do we practice indoors or out in it?', opts: [{ t: 'Practice outside in it', team: 2, star: -1, reply: 'Miserable practices, but they know how the ball feels wet now.' }, { t: 'Stay indoors ($0.5M field rental)', cost: 0.5, team: 1, star: 1, reply: 'Warm and dry. The players appreciated it.' }] },
  { from: 'Team PR', subj: 'An awards race', body: '{n} is in the running for player of the month. A PR push could put him over the top.', opts: [{ t: 'Run a campaign ($0.5M)', cost: 0.5, star: 6, fans: 2, reply: 'The highlight reel is everywhere. He is loving it.' }, { t: 'Let his play speak', star: -1, team: 1, reply: 'Quiet approach. The rest of the room noticed you did not play favorites.' }] },
  { from: 'Social media team', subj: 'A celebration went viral', body: '{n} did a touchdown dance that has 20 million views. The league is threatening fines if he keeps doing it.', opts: [{ t: 'Embrace it', fans: 5, star: 3, team: -1, reply: 'Merch is flying off the shelves. The league office is less amused.' }, { t: 'Tell him to tone it down', star: -4, team: 1, reply: 'He agreed, but he is sulking.' }] },
  { from: 'A streaming service', subj: 'They want to film a docuseries', body: 'A streaming service wants cameras in your building for the rest of the season. They pay $2M. The players hate cameras.', opts: [{ t: 'Let them in', cash: 2, fans: 4, team: -3, reply: 'The cameras are everywhere. Somebody already said something they regret on tape.' }, { t: 'Say no', team: 2, reply: 'No cameras. The players are relieved.' }] },
  { from: 'The owner', subj: 'The owner has an idea', body: 'The owner saw a highlight of an old star on TV and wants to sign him back for one more run. It would cost $2M of team money and a roster headache.', opts: [{ t: 'Go along with it', cost: 2, fans: 4, team: -2, reply: 'The press conference was a circus. The fans loved it.' }, { t: 'Push back politely', fans: -1, team: 2, reply: 'The owner grumbled, but you kept control of the roster.' }] },
  { from: 'Strength coach', subj: 'The bye-week plan', body: 'With a bye coming up, do we give the players the week off or grind?', opts: [{ t: 'Give them the week off', team: 4, star: 2, reply: 'Rested legs and good moods.' }, { t: 'Extra practices', team: -3, fans: 1, reply: 'The players dragged themselves through it. The coaches feel better about the playbook.' }] },
  { from: 'Community relations', subj: 'A charity golf tournament', body: 'A local charity wants your stars at its golf tournament. It is a day off their feet, mostly.', opts: [{ t: 'Send the stars ($0.3M)', cost: 0.3, fans: 4, star: 1, reply: 'Great photos, and somebody hit a hole in one.' }, { t: 'Send a donation instead ($1M)', cost: 1, fans: 2, reply: 'Generous. The charity sent a thank-you plaque.' }, { t: 'Skip it', fans: -2, reply: 'The local news noticed nobody showed up.' }] }
];
// the stupidest kind: an obscure law in his team's state (the league, baffled, suspends him a game)
const TEAM_STATE = { ARI: 'Arizona', ATL: 'Georgia', BAL: 'Maryland', BUF: 'New York', CAR: 'North Carolina', CHI: 'Illinois', CIN: 'Ohio', CLE: 'Ohio', DAL: 'Texas', DEN: 'Colorado', DET: 'Michigan', GB: 'Wisconsin', HOU: 'Texas', IND: 'Indiana', JAX: 'Florida', KC: 'Missouri', LA: 'California', LAC: 'California', LV: 'Nevada', MIA: 'Florida', MIN: 'Minnesota', NE: 'Massachusetts', NO: 'Louisiana', NYG: 'New Jersey', NYJ: 'New Jersey', PHI: 'Pennsylvania', PIT: 'Pennsylvania', SEA: 'Washington', SF: 'California', TB: 'Florida', TEN: 'Tennessee', WAS: 'Maryland' };
const DUMB_LAWS = {
  Arizona: ['letting a donkey sleep in his bathtub', 'cutting down a saguaro cactus to make room for a basketball court'],
  Georgia: ['eating fried chicken with a fork in Gainesville', 'tying a giraffe to a telephone pole'],
  Maryland: ['taking a lion to the movies', 'swearing out loud in Rockville'],
  'New York': ['wearing slippers after 10 p.m.', 'flirting in public with a stranger on the subway'],
  'North Carolina': ['holding a bingo game that ran longer than five hours', 'singing off key in public'],
  Illinois: ['giving a lit cigar to his dog', 'fishing in his pajamas in Chicago'],
  Ohio: ['getting a fish drunk', 'running out of gas on purpose to make a point'],
  Texas: ['selling his own eye', 'milking somebody else\'s cow', 'shooting a buffalo from the second floor of a hotel'],
  Colorado: ['lending his vacuum cleaner to a neighbor in Denver', 'keeping a couch on his front porch in Boulder'],
  Michigan: ['letting his pig run loose in Detroit', 'swearing in front of a woman and child'],
  Wisconsin: ['serving apple pie without a slice of cheese', 'kissing on a moving train'],
  Indiana: ['catching a fish with his bare hands', 'taking a bath between October and March'],
  Florida: ['skateboarding without a license', 'parking an alligator at a parking meter', 'singing in a public place while wearing a swimsuit'],
  Missouri: ['frightening a baby', 'driving with an uncaged bear in his car'],
  Nevada: ['riding a camel on the highway', 'lassoing a fish'],
  California: ['eating an orange in his bathtub', 'riding a bicycle in a swimming pool', 'letting his pet frog die in a frog-jumping contest'],
  Minnesota: ['crossing the state line with a duck on his head', 'hanging his boxers on the same clothesline as women\'s underwear'],
  Massachusetts: ['putting tomatoes in clam chowder', 'snoring with his bedroom window open'],
  Louisiana: ['ordering pizza delivered to a friend\'s house without telling him', 'biting someone with his natural teeth'],
  'New Jersey': ['frowning at a police officer', 'slurping his soup in public'],
  Pennsylvania: ['sleeping on top of a refrigerator outdoors', 'catching a fish with any part of his body other than his mouth'],
  Washington: ['harassing Bigfoot', 'pretending his parents are rich'],
  Tennessee: ['sharing his Netflix password', 'lassoing a fish', 'driving while asleep']
};
// (made-up players only: real players get the league's conduct-policy line)
// [what he did, how bad: 1 minor .. 5 severe]; the worse it is the rarer, and the longer he is out (SUS_GAMES: up to three seasons)
const CRIMES = [
  ['arrested after a bar brawl', 2],
  ['cited for street racing on the interstate', 1],
  ['caught smuggling fireworks across state lines', 1],
  ['charged with driving under the influence', 3],
  ['arrested for disorderly conduct at a casino', 1],
  ['caught running an illegal betting ring', 4],
  ['arrested after a fight at a nightclub', 2],
  ['arrested with a duffel bag of weed in his trunk', 2],
  ['caught with an unregistered handgun at the airport', 3],
  ['charged with felony possession of cocaine', 4],
  ['arrested for punching a bouncer who would not let him into the VIP section', 2],
  ['busted running a backyard dogfighting ring', 5],
  ['arrested for threatening a referee in the parking lot', 3],
  ['caught driving 140 mph with an open bottle of tequila', 3],
  ['charged with assault after a brawl at a steakhouse', 3],
  ['arrested for trashing a hotel suite and throwing a TV off the balcony', 1],
  ['charged with vandalism after keying an ex-teammate\'s Lamborghini', 1],
  ['caught selling counterfeit team jerseys out of his garage', 2],
  ['charged with insurance fraud on a Ferrari he crashed on purpose', 3],
  ['arrested after a strip club fight that ended in the parking lot', 2],
  ['arrested for public intoxication after passing out in a hotel fountain', 1],
  ['arrested for shooting out a neighbor\'s security camera', 2],
  ['charged with resisting arrest after fleeing police on a dirt bike', 2],
  ['caught growing marijuana in his basement under heat lamps', 2],
  ['arrested for breaking into the team facility at 3 a.m. to steal his own game film', 1],
  ['charged with bribing a high school coach for his cousin\'s scholarship', 3],
  ['arrested for illegally hunting deer from a helicopter', 2],
  ['busted with a fake ID claiming he was 21 at age 26', 1],
  ['charged with running an underground poker game out of his mansion', 2],
  ['arrested for pulling a gun during a road-rage incident', 4],
  ['caught on video brawling with fans at a hockey game', 2],
  ['charged with tax evasion on $4 million in appearance fees', 4],
  ['arrested for driving a stolen golf cart through a Waffle House', 1],
  ['charged with failing a league drug test for the third time in a year', 4]
];
const SUS_GAMES = { 1: [1, 2], 2: [2, 4], 3: [4, 8], 4: [17, 34], 5: [34, 51] }, SUS_WEIGHT = { 1: 5, 2: 4, 3: 3, 4: 1.2, 5: 0.6 };
function pickCrime(r) { const tot = CRIMES.reduce((t, c) => t + SUS_WEIGHT[c[1]], 0); let x = r() * tot; for (const c of CRIMES) { x -= SUS_WEIGHT[c[1]]; if (x < 0) return c; } return CRIMES[CRIMES.length - 1]; }
const susText = g => g >= 17 ? (g % 17 === 0 ? g / 17 + ' season' + (g > 17 ? 's' : '') : g + ' games (about ' + (Math.round(g / 17 * 10) / 10) + ' seasons)') : g + ' game' + (g > 1 ? 's' : '');
function suspend(L, p, games, r) {
  const t = L.teams[p.t], mine = p.t === myId(L), st = t && TEAM_STATE[t.abbr], dumb = p.gen && st && DUMB_LAWS[st] && r() < 0.35;
  // a made-up player: the length goes with what he did (a dumb law, a game; the worst, years); a real one: the conduct-policy line
  const crime = p.gen && !dumb ? pickCrime(r) : null;
  if (dumb) games = 1; else if (crime) games = ri(r, SUS_GAMES[crime[1]][0], SUS_GAMES[crime[1]][1]);
  p.sus = (p.sus || 0) + games;
  const why = dumb ? p.n + ' was cited under an obscure ' + st + ' law for ' + pickOf(r, DUMB_LAWS[st]) + '. The NFL, baffled, suspends him 1 game.'
    : crime ? p.n + ' was ' + crime[0] + '. The NFL suspends him ' + susText(games) + '.' : p.n + ' is suspended ' + susText(games) + ' for violating the league\'s conduct policy.';
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
    const mine = p.t === myId(L), f = mine && p.mor != null && isStar(L, p) ? 1 + Math.max(0, (50 - moraleOf(L, p)) / 8) : 1;   // an unhappy star is likelier to do something wild
    if (r() < 0.00012 * f) suspend(L, p, ri(r, 1, 6), r);
  });
  // an event most weeks (a press or community matter, or something in the building), none twice in a row
  if (L.phase === 'regular' && r() < 0.4) {
    const pool = PR_EVENTS.concat(MID_EVENTS).filter(e => e.subj !== L.lastEv), e = pickOf(r, pool), st = e.star || /\{n\}/.test(e.body) ? pickOf(r, starsOf(L).filter(healthy).slice(0, 6)) : null;
    if (!(/\{n\}/.test(e.body) && !st)) { L.lastEv = e.subj; inMail(L, { from: e.from.replace('{n}', st ? st.n : ''), subj: e.subj, body: e.body.replace(/\{n\}/g, st ? st.n : ''), kind: 'pr', opts: e.opts, pid: st ? st.i : undefined }); }
  } else if (L.phase !== 'regular' && r() < 0.14 && !L.career) { const e = pickOf(r, PR_EVENTS); inMail(L, { from: e.from, subj: e.subj, body: e.body, kind: 'pr', opts: e.opts }); }
  // the calendar: the owner's expectations, the trade deadline, a midseason report card
  if (L.career) careerWeek(L, rng(L, 'life' + L.season + ':' + L.week));
  if (L.phase === 'regular') {
    const me = records(L)[myId(L)], rec = me ? me.w + '-' + me.l + (me.t ? '-' + me.t : '') : '';
    if (L.week === 1) inMail(L, { from: 'The owner', subj: 'This is the year', body: 'New season. I expect us to compete. Win, keep the fans in the seats, and do not embarrass the franchise. Good luck, coach.', kind: 'pr' });
    if (L.week === 8 && canTrade(L)) inMail(L, { from: 'Front office', subj: 'The trade deadline is close', body: 'A few weeks left to make trades. If anyone on the roster is unhappy, or you need a piece for a playoff run, now is the time. (Trades tab.)', kind: 'pr' });
    if (L.week === 9) { const good = me && me.w > me.l; inMail(L, { from: 'The owner', subj: 'Midseason report card', body: (good ? 'At ' + rec + ', I like what I see. Keep it going.' : 'At ' + rec + ', this is not what we talked about. Turn it around.') + ' Fans are at ' + L.morale.fans + ', the locker room at ' + L.morale.team + '.', kind: 'pr' }); moraleBump(L, { team: good ? 2 : -2 }); }
  }
}
function campHeal(L) {   // the medical staff gets players back a little sooner
  const lv = L.fin.lv.me; if (lv <= 1) return;
  const r = rng(L, 'heal' + L.season + ':' + L.week + ':' + L.phase);
  rosterOf(L, myId(L)).forEach(p => { if (p.inj > 1 && p.inj < SEASON_OUT && r() < (lv - 1) * 0.12) p.inj--; });
}
/* after every game: suspensions for fights; for your team morale, the fans, the gate, playing time and the press */
/* after each of your games: playing time. Stars who sit lose morale and ask; good backups who sit ask (it goes through team morale); a
   promise kept (or a bigger share) keeps them quiet for PT_CALM games */
function ptMail(L, me, won, tie) {
  starsOf(L).forEach(p => {
    if (!healthy(p)) return;
    const ln = lineup(L, me)[p.p] || [], plays = ln.indexOf(p) >= 0 && !(USE_DEFAULT[p.p] && useOf(L, me, p) < 25);
    setMorale(L, p, (won ? 1 : tie ? 0 : -1) + (plays ? 0.5 : -3));
    if (p.prom > 0) { if (plays) { p.prom = 0; setMorale(L, p, 3); ptRaised(L, p); } else if (--p.prom <= 0) { setMorale(L, p, -12); moraleBump(L, { team: -2 }); inMail(L, { from: p.n, subj: 'You promised me snaps', body: 'Coach, you told me I would get more snaps. I did not. I will remember that when my contract comes up.', pid: p.i }); } }
    else if (!plays && moraleOf(L, p) < 58 && (p.mailG || 0) + 4 <= L.week && !ptCalm(L, me, p)) {
      p.mailG = L.week;
      inMail(L, { from: p.n, subj: 'My playing time', body: 'Coach, can we talk? I am rated ' + p.o + ' and I am barely on the field. I came here to play. What is the plan for me?', kind: 'play', pid: p.i, opts: [
        { t: 'Promise him more snaps', star: 8, prom: 2, reply: 'Thanks, coach. I will hold you to that. (Start him within two games, or he will not forget it.)' },
        { t: 'Tell him to earn it', star: -5, team: 1, reply: 'Understood. I will show you in practice, but I am not happy.' },
        { t: 'Offer to shop him', star: 2, shop: 1, reply: 'I appreciate the honesty. (He is on your trading block now.)' }] });
    }
  });
  // good backups want to play too: no morale of their own, but it gets around the locker room
  const st = starterIds(L, me);
  rosterOf(L, me).forEach(p => {
    if (st[p.i]) { p.ben = 0; if (p.prom > 0) { p.prom = 0; ptRaised(L, p); } return; }   // (a promise kept)
    if (!(STAR_SPOTS[p.p] || DEF_P[p.p]) || p.o < GOOD_O || !healthy(p)) return;
    p.ben = (p.ben || 0) + 1;
    if (p.prom > 0) { if (--p.prom <= 0) { moraleBump(L, { team: -2 }); inMail(L, { from: p.n, subj: 'You promised me snaps', body: 'Coach, you told me I would get more snaps. I did not. The guys in this room all heard about it.', pid: p.i }); } }
    else if (p.ben >= 3 && (p.mailG || 0) + 6 <= L.week && !ptCalm(L, me, p)) {
      p.mailG = L.week;
      inMail(L, { from: p.n, subj: 'My playing time', body: 'Coach, can we talk? I am rated ' + p.o + ' and I am sitting behind other guys. I came here to play. What is the plan for me?', kind: 'play', pid: p.i, opts: [
        { t: 'Promise him more snaps', team: 1, prom: 2, reply: 'Thanks, coach. I will hold you to that. (Make him a starter within two games, or the locker room will hear about it.)' },
        { t: 'Tell him to earn it', team: -1, reply: 'Understood. I will show you in practice, but I am not happy.' },
        { t: 'Offer to shop him', shop: 1, reply: 'I appreciate the honesty. (He is on your trading block now.)' }] });
    }
  });
}
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
  ptMail(L, me, won, tie);
  if (L.career) careerAfterGame(L, won, tie);
  // the boo birds
  if (home && !won && L.morale.fans < 35) {
    const s = starsOf(L)[0]; moraleBump(L, { team: -1 }); starsOf(L).slice(0, 4).forEach(p => setMorale(L, p, -2));
    inMail(L, { from: 'Team PR', subj: 'They booed us off the field', body: 'The home crowd booed the team off after the loss to the ' + opp.nick + (s ? ', and ' + s.n + ' heard it worst' : '') + '. Fan morale is at ' + L.morale.fans + '. Winning fixes this, and a good word at the press conference helps.' });
  }
  // the press wants a word
  const star = starsOf(L).find(healthy) || starsOf(L)[0];
  // each question comes with answers that fit it (ks: which set, PRESS_ANSWERS)
  const mood = L.morale.fans < 40 ? 'fans' : L.morale.team < 45 ? 'locker' : 'mood';
  L.press = { opp: opp.nick, won, tie, score: mine + '-' + theirs, star: star ? star.i : null, qs: [
    won ? 'Big win over the ' + opp.nick + ', ' + mine + '-' + theirs + '. What made the difference?' : tie ? 'A tie with the ' + opp.nick + '. How do you feel about that?' : 'A ' + theirs + '-' + mine + ' loss to the ' + opp.nick + '. What went wrong?',
    star ? 'What did you see from ' + star.n + ' today?' : 'How is the roster holding up?',
    mood === 'fans' ? 'The fans are running out of patience. What do you say to them?' : mood === 'locker' ? 'We hear the locker room is unhappy. Is that true?' : 'What is the mood in the building this week?'
  ], ks: [won ? 'win' : tie ? 'tie' : 'loss', star ? 'star' : 'roster', mood], i: 0 };
}
const COACH_ANSWERS = [
  { t: 'Credit the players', team: 3, fans: 1, star: 2 },
  { t: 'Take the blame yourself', team: 2, fans: 0, star: 1 },
  { t: 'Call out your star', team: -3, fans: 2, star: -7 },
  { t: 'Give a boring answer', team: 0, fans: -1, star: 0 }
];
// the answers that fit each kind of question: team, fans and the star's morale (star: only when the question is about him or the result)
const PRESS_ANSWERS = {
  win: [{ t: 'Credit the players', team: 3, fans: 1, star: 2 }, { t: 'Credit the game plan', team: 1, fans: 2, star: 0 }, { t: 'Stay humble: one game at a time', team: 2, fans: 0, star: 0 }, { t: 'Say it should have been a bigger win', team: -2, fans: 2, star: -1 }],
  loss: [{ t: 'Take the blame yourself', team: 2, fans: 0, star: 1 }, { t: 'Credit the other team', team: 0, fans: -1, star: 0 }, { t: 'Say the players have to be better', team: -3, fans: 2, star: -3 }, { t: 'Give a boring answer', team: 0, fans: -1, star: 0 }],
  tie: [{ t: 'Take the positives from it', team: 2, fans: 0, star: 0 }, { t: 'Say a tie feels like a loss', team: -1, fans: 2, star: 0 }, { t: 'Credit the other team', team: 0, fans: -1, star: 0 }, { t: 'Give a boring answer', team: 0, fans: -1, star: 0 }],
  star: [{ t: 'Praise him', team: 1, fans: 1, star: 3 }, { t: 'Talk up the whole team instead', team: 2, fans: 0, star: -1 }, { t: 'Say he can play better', team: 0, fans: 1, star: -3 }, { t: 'Call him out', team: -3, fans: 2, star: -7 }],
  roster: [{ t: 'Say the group is ready', team: 2, fans: 0 }, { t: 'Say you need reinforcements', team: -2, fans: 2 }, { t: 'Praise the young players', team: 2, fans: 1 }, { t: 'Give a boring answer', team: 0, fans: -1 }],
  fans: [{ t: 'Promise better days', team: 0, fans: 3 }, { t: 'Ask for patience', team: 1, fans: 1 }, { t: 'Tell them to stop booing', team: 1, fans: -4 }, { t: 'Thank them for showing up', team: 0, fans: 2 }],
  locker: [{ t: 'Admit it and promise to fix it', team: 2, fans: -1 }, { t: 'Deny it', team: -1, fans: 1 }, { t: 'Blame the media', team: 1, fans: -2 }, { t: 'Say it is a private matter', team: 1, fans: 0 }],
  mood: [{ t: 'Confident: we expect to win', team: 2, fans: 2 }, { t: 'Focused on next week', team: 1, fans: 0 }, { t: 'Say there is a lot of work to do', team: 0, fans: 0 }, { t: 'Give a boring answer', team: 0, fans: -1 }]
};
// the answers for the question being asked (a save from before: the old four for everything)
function pressOptions(L) { const P = L.press; if (!P) return []; const k = P.ks && P.ks[P.i]; return PRESS_ANSWERS[k] || COACH_ANSWERS; }
function pressAnswer(L, a) {
  const P = L.press, A = pressOptions(L)[a]; if (!P || !A) return null;
  moraleBump(L, { team: A.team, fans: A.fans });
  const s = P.star && L.players[P.star]; if (s && A.star) setMorale(L, s, A.star);
  P.i++; if (P.i >= P.qs.length) L.press = null;
  return A;
}

/* ================= coach career (solo campaigns: L.career) =================
   You are the head coach: 26 and single when it starts, and you never age. L.coach = {
     age, pop (fan approval of you, 0-100), hot (the hot seat, 0-100), rel ('single' | 'dating' | 'engaged' | 'married'), partner { n, mood },
     fam (your family's mood), ct { tid, yrs, sal } (your contract, $M a year), earn (career earnings: a number to look at, nothing more),
     bad / good (losing / winning seasons in a row), hist [{ s, tid, nick, w, l, t, po, champ, why }], offers [{ tid, yrs, sal, k }], need
     (no job: you have to take an offer before the season starts), lastP (the week of the last personal event), scand (scandals) }
   Two losing seasons in a row (or fans who want you gone) and you are fired; two winning seasons in a row and other teams come calling.
   About every two weeks something happens off the field. Scandals only come from a choice you make (an option marked dumb). */
const PARTNER_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Sam', 'Dana', 'Reese', 'Skyler', 'Cameron', 'Elena', 'Maya', 'Sofia', 'Isabel', 'Marcus', 'Nadia', 'Priya', 'Gabriel', 'Lena', 'Chloe'];
function careerOn(L) {
  if (!L.camp || L.career === 0) return;
  L.career = 1;
  if (!L.coach) {
    L.coach = { since: L.season, age: 26, pop: 55, hot: 20, rel: 'single', partner: null, fam: 70, ct: { tid: myId(L), yrs: 4, sal: 3.5 }, earn: 0, bad: 0, good: 0, hist: [], offers: [], need: false, lastP: 0, scand: 0 };
    inMail(L, { from: 'Your agent', subj: 'Your first head coaching job', body: 'Four years at $3.5M a year. You are 26, single, and the youngest head coach in the league. Win and you will have your pick of jobs. Lose two years running and you will be looking for one. And please, think before you do anything stupid.', kind: 'life' });
  }
}
const cBump = (c, k, v) => { if (v) c[k] = clamp(Math.round((c[k] || 0) + v), 0, 100); };
function coachBump(L, o) {
  const c = L.coach; if (!c || !o) return;
  cBump(c, 'pop', o.pop); cBump(c, 'fam', o.fam); cBump(c, 'hot', o.hot);
  if (c.partner && o.part) c.partner.mood = clamp(Math.round(c.partner.mood + o.part), 0, 100);
  if (o.earn) c.earn = Math.round((c.earn + o.earn) * 10) / 10;
  moraleBump(L, { team: o.team, fans: o.fans });
}
/* ---- off the field: every event is { id, when(c, L), from, subj, body, opts: [{ t, ...effects, reply }] }
   effects: pop, part (partner mood), fam, team, fans, earn ($M, career earnings), meet (a new partner), rel (a new status), breakup,
   dumb: { p, s } (a stupid choice: with chance p it becomes scandal s), win/lose (an investment that pays or flops: { p, earn, reply }) */
const single = c => c.rel === 'single', taken = c => c.rel !== 'single';
const LIFE = [
  // romance
  { id: 'app', when: single, from: 'Your phone', subj: 'A dating app match', body: 'Your assistant set up a dating profile "for morale." You matched with {p}, who has no idea who you are and thinks football is "the one with the horses."', opts: [{ t: 'Ask {p} to dinner', meet: 1, pop: 1, reply: 'Dinner went long. {p} still does not know what a first down is, and you do not care.' }, { t: 'Delete the app', reply: 'Back to film study. Your assistant is disappointed.' }] },
  { id: 'gala', when: single, from: 'Community relations', subj: 'Someone at the charity gala', body: 'At the hospital gala you got stuck at the dessert table with {p}, who laughed at all of your jokes, even the clock management one.', opts: [{ t: 'Get their number', meet: 1, reply: 'You texted the next morning. {p} replied in under a minute. Good sign.' }, { t: 'Leave it a nice memory', fam: -1, reply: 'Your mother heard about this somehow and is very disappointed in you.' }] },
  { id: 'meetparents', when: c => c.rel === 'dating', from: '{partner}', subj: 'Meet my parents?', body: '{partner} wants you to come to Sunday dinner with the family. It is the night before you play.', opts: [{ t: 'Go, game week or not', part: 12, team: -1, reply: 'Their dad wanted to talk about your fourth-down decisions for two hours. {partner} is thrilled you came.' }, { t: 'After the season', part: -10, reply: 'There was a long pause on the phone. "Sure. After the season."' }] },
  { id: 'movein', when: c => c.rel === 'dating' && c.partner.mood >= 60, from: '{partner}', subj: 'Moving in together', body: '{partner} found a place with a yard and a room for your film setup.', opts: [{ t: 'Move in together', part: 10, fam: 3, reply: 'Boxes everywhere. Somehow your playbooks ended up in the kitchen.' }, { t: 'Not yet', part: -8, reply: '"Okay," {partner} said, in the way that means it is not okay.' }] },
  { id: 'propose', when: c => c.rel === 'dating' && c.partner.mood >= 70, from: 'Your best friend', subj: 'Is it time?', body: 'Your best friend thinks you should propose to {partner}. They even know a jeweler who gives a discount to anyone who once won a fantasy league.', opts: [{ t: 'Propose', rel: 'engaged', part: 15, fam: 8, pop: 3, reply: '{partner} said yes before you finished the question. The team gave you a Gatorade shower in practice.' }, { t: 'Wait until after the season', part: -4, reply: 'Your friend rolled their eyes so hard you heard it.' }] },
  { id: 'wedding', when: c => c.rel === 'engaged', from: '{partner}', subj: 'Wedding plans', body: '{partner} wants the wedding during the bye week. Their aunt has already booked a band that only plays covers of fight songs.', opts: [{ t: 'Bye-week wedding', rel: 'married', part: 15, fam: 10, pop: 4, team: 2, reply: 'Married. Half the roster showed up and the offensive line cleaned out the buffet in twelve minutes.' }, { t: 'Push it to the offseason', part: -10, fam: -3, reply: 'The band is still booked. They are learning new songs.' }] },
  { id: 'anniv', when: taken, from: 'Your calendar', subj: 'Wait, is it your anniversary?', body: 'It is your anniversary with {partner}. You are in the middle of a three-hour film session.', opts: [{ t: 'Leave practice early for dinner', part: 10, team: -2, reply: '{partner} was surprised. The quarterbacks coach ran the rest of the meeting and nobody learned anything.' }, { t: 'Send flowers and a text', part: -6, reply: 'The flowers arrived. The text said "happy anniversry". {partner} noticed.' }] },
  { id: 'vacation', when: taken, from: '{partner}', subj: 'A trip, just us', body: '{partner} found a deal on a beach trip. It is three days during the season.', opts: [{ t: 'Go on the bye week', part: 10, team: -1, reply: 'Sunburnt and happy. You only checked the injury report six times.' }, { t: 'No trips in season', part: -8, reply: '{partner} went with a friend instead and sent you a lot of photos of the ocean.' }] },
  { id: 'job', when: c => taken(c) && c.partner.mood < 70, from: '{partner}', subj: 'You are never home', body: '{partner} says you have missed every dinner this month. "I feel like I am dating a whiteboard."', opts: [{ t: 'Promise one night a week, no football', part: 12, team: -1, reply: 'Tuesday is date night now. Your coordinators run Tuesday.' }, { t: 'This is the job', part: -12, reply: 'You slept on the couch. It is a nice couch.' }] },
  { id: 'baby', when: c => c.rel === 'married' && c.partner.mood >= 60 && (c.kids || 0) < 3, from: '{partner}', subj: 'Big news', body: '{partner} is expecting! The due date is, of course, the week of the playoffs.', opts: [{ t: 'Announce it at the press conference', kid: 1, fans: 4, pop: 4, part: 10, fam: 10, reply: 'The room applauded. A reporter cried. The team got you a tiny jersey.' }, { t: 'Keep it in the family for now', kid: 1, part: 12, fam: 8, reply: 'Your mom has already told everyone she knows.' }] },
  // standing up for your partner in public (the fans see who you are)
  { id: 'heckler', when: taken, from: 'Team security', subj: 'A fan is going after {partner}', body: 'A drunk fan in the section behind your bench is yelling at {partner} about your play calling, and it is getting ugly.', opts: [{ t: 'Have security remove him and go check on {partner} at halftime', part: 14, fans: 4, pop: 5, team: -1, reply: '{partner} said nobody has ever had their back like that. The video of you jogging up the tunnel is everywhere.' }, { t: 'Stay focused on the game', part: -12, pop: -3, reply: '{partner} moved seats and did not say much on the ride home.' }] },
  { id: 'tabloid', when: taken, from: 'Team PR', subj: 'A tabloid is going after {partner}', body: 'A gossip site ran a nasty, made-up story about {partner}. Reporters will ask about it at your press conference.', opts: [{ t: 'Defend {partner} on the record', part: 15, fans: 4, pop: 6, reply: '"Leave my family out of it." The clip went viral, and the site took the story down.' }, { t: '"No comment"', part: -10, pop: -2, reply: '{partner} watched the press conference. It was a quiet night at home.' }] },
  { id: 'paparazzi', when: taken, from: 'Your phone', subj: 'Photographers outside the restaurant', body: 'Photographers have {partner} boxed in outside the restaurant where you are meeting for dinner.', opts: [{ t: 'Step in and walk {partner} to the car', part: 12, fans: 3, pop: 4, reply: 'The only photo anyone sold is of you holding the door. People loved it.' }, { t: 'Wait inside until they leave', part: -10, pop: -2, reply: '{partner} got to the table twenty minutes late and very annoyed.' }] },
  { id: 'trolls', when: taken, from: 'Social media team', subj: 'Trolls are piling on {partner}', body: 'After the loss, people online are blaming {partner} for "distracting" you. It is nasty.', opts: [{ t: 'Post that the loss is on you, not your family', part: 12, fans: 5, pop: 5, reply: 'Your post is the most-liked thing the team account has ever shared. The trolls went quiet.' }, { t: 'Stay off social media', part: -8, reply: '{partner} read all of it alone.' }] },
  { id: 'charity', when: taken, from: 'Community relations', subj: 'A stumble at the charity drive', body: '{partner} tripped carrying a huge box of donated coats at the team charity drive, right in front of the cameras.', opts: [{ t: 'Drop everything, help them up and carry the box yourself', part: 10, fans: 4, pop: 4, reply: 'The local news led with it: the head coach hauling coats with a grin. Donations doubled.' }, { t: 'Keep talking to the big donor', part: -10, pop: -3, fans: -1, reply: 'The cameras caught you looking the other way. So did {partner}.' }] },
  { id: 'breakdown', when: taken, from: '{partner}', subj: 'Stuck on the highway', body: '{partner}\'s car broke down on the highway in the rain. You are in the middle of a game-plan meeting.', opts: [{ t: 'Leave the meeting and go get them', part: 14, fans: 2, pop: 2, team: -1, reply: 'Soaked, a little late, and very much the hero. A fan who drove by posted about it.' }, { t: 'Send an assistant', part: -8, reply: 'The assistant was nice about it. {partner} wanted it to be you.' }] },
  { id: 'awaysign', when: taken, from: 'Team PR', subj: 'Away fans mocked {partner}\'s sign', body: 'At the road game, home fans were jeering {partner} for holding up a homemade sign for your team.', opts: [{ t: 'Wave {partner} down to seats behind the bench', part: 12, fans: 5, pop: 4, reply: 'The broadcast showed it twice. Your fans made copies of the sign.' }, { t: 'Ignore it', part: -8, reply: '{partner} put the sign away in the second quarter.' }] },
  // family
  { id: 'mom', when: () => true, from: 'Mom', subj: 'Call your mother', body: 'Mom says she only learns what is going on in your life from the TV. She would like a phone call. Today.', opts: [{ t: 'Call her right now', fam: 8, reply: 'Forty-five minutes. She has notes on your sideline outfit.' }, { t: 'Text a heart emoji', fam: -6, reply: 'She replied "?" and then called your sister to complain.' }] },
  { id: 'dad', when: () => true, from: 'Dad', subj: 'Dad has thoughts on your play calling', body: 'Your dad called into a sports radio show to defend your fourth-down call. He did not say he is your dad. Everyone knew.', opts: [{ t: 'Thank him', fam: 6, pop: 1, reply: 'He has called in twice more since.' }, { t: 'Ask him to stop', fam: -8, reply: 'He stopped. Now he calls in about the defense instead.' }] },
  { id: 'sibling', when: () => true, from: 'Your sister', subj: 'My wedding is on a Saturday', body: 'Your sister is getting married the day before a road game. She wants you there for the toast.', opts: [{ t: 'Fly in for the toast and fly out', fam: 12, team: -2, reply: 'You made it with ten minutes to spare. The toast was about field position. People cried anyway.' }, { t: 'Send a video', fam: -12, reply: 'They played it on a projector. Your aunt still brings it up.' }] },
  { id: 'home', when: c => c.fam < 50, from: 'Mom', subj: 'We worry about you', body: 'Your family thinks you are working too hard and wants you home for a weekend.', opts: [{ t: 'Go home on the bye', fam: 15, team: -1, reply: 'Home cooking, your old bedroom, your high school coach dropping by to tell everyone he taught you everything.' }, { t: 'Not this season', fam: -8, reply: 'Mom sent a care package. The cookies were good. The note was guilt.' }] },
  // money that is only a number (career earnings)
  { id: 'smoothie', when: () => true, from: 'A college buddy', subj: 'Get in on the ground floor', body: 'Your college roommate wants $1M for his smoothie chain that only sells "protein smoothies for athletes." He has a logo of you.', opts: [{ t: 'Invest $1M', earn: -1, win: { p: 0.35, earn: 4, reply: 'The smoothie chain is everywhere. Your $1M is worth $5M and your face is on every cup.' }, lose: 'The smoothie chain closed. It turns out athletes already had smoothies.' }, { t: 'Pass', reply: 'He said you would regret it. He sends you a smoothie anyway.' }] },
  { id: 'coin', when: () => true, from: 'Your backup quarterback', subj: 'A coin with a dog on it', body: 'Your backup quarterback wants everybody in on a new cryptocurrency named after his dog. He is very confident.', opts: [{ t: 'Put in $0.5M', earn: -0.5, win: { p: 0.2, earn: 3, reply: 'It went up 600% for no reason anyone can explain. You sold. Your quarterback did not.' }, lose: 'The coin is worth less than the dog. The dog is fine.' }, { t: 'Absolutely not', team: -1, reply: 'Your backup quarterback is mad at you. He did not play anyway.' }] },
  { id: 'mower', when: () => true, from: 'A startup founder', subj: 'Robot lawnmowers', body: 'A startup wants a famous coach to invest in robot lawnmowers that "read the grass like a defense." $2M buys in.', opts: [{ t: 'Invest $2M', earn: -2, win: { p: 0.45, earn: 5, reply: 'Every golf course in the country bought one. Your $2M is now $7M.' }, lose: 'The robots read the grass and went into a pond. All of them.' }, { t: 'No thanks', reply: 'Your neighbor bought one. It mows only your lawn, for some reason.' }] },
  { id: 'truck', when: () => true, from: 'Your offensive line', subj: 'The offensive line food truck', body: 'Your offensive line wants to open a food truck. Their menu is one item: "the whole brisket." They want you as a partner.', opts: [{ t: 'Back them ($0.5M)', earn: -0.5, team: 3, win: { p: 0.6, earn: 1.5, reply: 'There is a line around the block. It is mostly other offensive linemen.' }, lose: 'They ate all of the inventory. Every day.' }, { t: 'Stay out of it', team: -1, reply: 'They opened it anyway. You are not allowed to order.' }] },
  // parties and nights out (where the stupid decisions live)
  { id: 'yacht', when: () => true, from: 'A celebrity friend', subj: 'A party on a yacht', body: 'A pop star you met at a charity event invites you to a party on a yacht the night after a win.', opts: [{ t: 'Go, have one drink, leave', pop: 1, part: -3, reply: 'You were home by eleven. You are in the background of a lot of photos.' }, { t: 'Stay until sunrise', dumb: { p: 0.55, s: 'yacht' }, pop: 2, part: -8, reply: 'A great night, and nobody filmed anything. You got lucky.' }, { t: 'Stay home', part: 4, reply: 'You watched film with {partnerOrDog}.' }] },
  { id: 'teamparty', when: () => true, from: 'Team captains', subj: 'The captains are throwing a party', body: 'The captains are throwing a party after the win and want the coach to show up.', opts: [{ t: 'Make an appearance and leave', team: 3, reply: 'You did one lap, gave a toast and left. Perfect.' }, { t: 'Drive yourself home after a few drinks', dumb: { p: 0.6, s: 'dui' }, team: 3, reply: 'You made it home. That was incredibly stupid and you know it.' }, { t: 'Skip it', team: -2, reply: 'They noticed.' }] },
  { id: 'bar', when: () => true, from: 'Your old teammate', subj: 'A night back home', body: 'You are back in your hometown and your old teammates drag you to the bar you went to in college.', opts: [{ t: 'One round, then home', fam: 2, reply: 'You signed a lot of napkins.' }, { t: 'Dance on the bar like it is senior year', dumb: { p: 0.65, s: 'bardance' }, pop: 1, reply: 'Somehow nobody filmed it. A miracle.' }, { t: 'Get into it with a heckler', dumb: { p: 0.7, s: 'barfight' }, reply: 'Your buddies pulled you out before it went anywhere.' }] },
  { id: 'flirt', when: taken, from: 'Your phone', subj: 'A message from someone you met at a fundraiser', body: 'Someone you met at a fundraiser keeps messaging you. They are funny, and they are not {partner}.', opts: [{ t: 'Shut it down politely', part: 3, reply: 'You told them you are taken. That was the right call.' }, { t: 'Flirt back', dumb: { p: 0.6, s: 'cheat' }, reply: 'It fizzled out before anyone found out. You still feel bad.' }] },
  { id: 'resort', when: taken, from: 'Your phone', subj: 'An invite to a resort', body: 'A sideline reporter you get along with suggests a "working weekend" at a resort during the bye.', opts: [{ t: 'Say no', part: 2, reply: 'You spent the bye at home with {partner}. Good call.' }, { t: 'Go', dumb: { p: 0.7, s: 'resort' }, reply: 'Nobody saw. This time.' }] },
  { id: 'moto', when: () => true, from: 'A new hire in marketing', subj: 'A ride on the motorcycle', body: 'The new marketing hire saw your motorcycle and wants a ride after work. You have not ridden in years.', opts: [{ t: 'Sell the motorcycle', reply: 'Smart. You bought a very sensible car.' }, { t: 'Take them for a ride', dumb: { p: 0.6, s: 'moto' }, reply: 'You got back in one piece. Do not do that again.' }] },
  { id: 'fireworks', when: () => true, from: 'Your coordinators', subj: 'Fireworks on the road', body: 'Your coordinators bought fireworks for the Fourth and want to set them off from the team hotel balcony.', opts: [{ t: 'Absolutely not', team: -1, reply: 'You are no fun, but nobody got arrested.' }, { t: 'Light the first one yourself', dumb: { p: 0.6, s: 'fireworks' }, team: 2, reply: 'Beautiful. The hotel manager only gave you a warning.' }] },
  // the bad ideas at work (still your choice)
  { id: 'signals', when: () => true, from: 'A video intern', subj: 'I can film their signals', body: 'An eager video intern says he can film the other sideline\'s defensive signals from the stands. "Nobody will ever know."', opts: [{ t: 'Tell him never to do that', team: 1, reply: 'He looked disappointed. You did the right thing.' }, { t: 'Do it', dumb: { p: 0.5, s: 'signals' }, team: 2, reply: 'You learned their signals. Nobody noticed. You feel weird about it.' }] },
  { id: 'bounty', when: () => true, from: 'Your defensive coordinator', subj: 'An incentive for big hits', body: 'Your defensive coordinator wants a whiteboard in the defensive room with cash rewards for the biggest hits.', opts: [{ t: 'No', team: -1, reply: 'He grumbled about "toughness." The whiteboard stays blank.' }, { t: 'Go for it', dumb: { p: 0.5, s: 'bounty' }, team: 3, reply: 'The defense is fired up and nobody outside the building found out.' }] },
  { id: 'burner', when: c => c.pop < 60, from: 'Yourself, at 2 a.m.', subj: 'They are being mean online', body: 'The fans are roasting you online. You could make an anonymous account and defend yourself.', opts: [{ t: 'Put the phone down', reply: 'You slept instead. Good.' }, { t: 'Make the account', dumb: { p: 0.6, s: 'burner' }, reply: 'Your anonymous account got into four arguments and nobody figured out it was you. Somehow.' }] },
  { id: 'emails', when: () => true, from: 'A college buddy', subj: 'The group email', body: 'Your college buddies have a reply-all email chain full of crude jokes about the league office. They want your best one.', opts: [{ t: 'Leave the chain', reply: 'You unsubscribed. They called you soft.' }, { t: 'Reply-all with a good one', dumb: { p: 0.45, s: 'emails' }, reply: 'It got a lot of laughs. The emails stayed private, for now.' }] },
  // parody nods: fictional, and nobody real
  { id: 'blocks', when: () => true, from: 'Team PR', subj: 'Your block-building world leaked', body: 'Someone leaked a video of the elaborate block-building kingdom you have been working on during film week. It has a castle shaped like your team logo.', opts: [{ t: 'Own it: give the fans a tour', pop: 5, fans: 2, reply: 'The tour has millions of views. Kids want to play for you now.' }, { t: 'Say it was your nephew\'s', pop: -3, reply: 'Your nephew is six and has never played a video game. The internet knows.' }] },
  { id: 'kneecaps', when: () => true, from: 'Booster club', subj: 'Speak at the booster lunch', body: 'The boosters want a fiery speech at their lunch.', opts: [{ t: 'Promise to bite some kneecaps', pop: 4, team: 2, reply: 'The clip is on a t-shirt already. Your players love it.' }, { t: 'Talk about process', pop: -1, reply: 'Half of them fell asleep.' }] },
  { id: 'milk', when: () => true, from: 'Team PR', subj: 'The milk clip', body: 'A camera caught you chugging whole milk on the sideline in khakis from a discount store. The internet has opinions.', opts: [{ t: 'Sign a deal with a dairy farm', pop: 3, earn: 0.5, reply: 'You are the face of whole milk in three states.' }, { t: 'Switch to water', pop: -1, reply: 'People are disappointed in you. The khakis stay.' }] },
  { id: 'rant', when: c => c.pop < 70, from: 'Team PR', subj: 'A columnist wrote a hit piece', body: 'A columnist wrote that you are too young to coach in this league. You have a press conference in ten minutes.', opts: [{ t: 'Yell "I am 26!" until they get it', pop: 4, team: 2, reply: 'It is the most-watched press conference of the year. The columnist has a new job now.' }, { t: 'Stay calm', pop: 1, reply: 'Professional. Boring. Probably right.' }] },
  { id: 'accent', when: () => true, from: 'Booster club', subj: 'The pep rally', body: 'You have a pep rally in a part of the state where you have never lived. Your staff thinks you should "connect with the locals."', opts: [{ t: 'Try a local accent', pop: -4, fans: -1, reply: 'Nobody from there talks like that. The clip will follow you forever.' }, { t: 'Just be yourself', pop: 2, reply: 'They liked you. Turns out that works.' }] },
  { id: 'clocks', when: () => true, from: 'Your assistant', subj: 'The building clocks', body: 'You could set every clock in the building five minutes fast so nobody is ever late.', opts: [{ t: 'Do it', team: -2, reply: 'Nobody is late. Everyone is confused. Two players have stopped wearing watches in protest.' }, { t: 'Leave the clocks alone', reply: 'Time continues to be the regular time.' }] },
  { id: 'hoodie', when: () => true, from: 'The equipment manager', subj: 'Your hoodie', body: 'You cut the sleeves off your team hoodie because the cuffs were annoying. The equipment manager is horrified. The fans love it.', opts: [{ t: 'Make it your look', pop: 4, reply: 'The sleeveless hoodie is now the best-selling item in the team store.' }, { t: 'Go back to sleeves', reply: 'The equipment manager is at peace.' }] },
  { id: 'grass', when: () => true, from: 'Team PR', subj: 'The grass thing', body: 'A camera caught you eating a blade of grass from the field during a timeout. You say it "keeps you humble."', opts: [{ t: 'Lean into it', pop: 3, reply: 'The grounds crew now saves you a special patch.' }, { t: 'Deny it', pop: -2, reply: 'There are four camera angles.' }] },
  { id: 'playoffs', when: c => c.pop < 65, from: 'Team PR', subj: 'A reporter asked about the playoffs', body: 'After a bad loss, a reporter asks if you still believe this team can make the playoffs.', opts: [{ t: '"Playoffs?! Don\'t talk about playoffs!"', pop: 3, team: 1, reply: 'Instant classic. Your mom has it as her ringtone.' }, { t: 'One game at a time', reply: 'Nothing to see here.' }] },
  { id: 'tablet', when: () => true, from: 'The league office', subj: 'The tablet', body: 'A missed call in your last game had you holding a sideline tablet over your head. The cameras are on you.', opts: [{ t: 'Put it down and breathe', reply: 'Calm. The tablet lives.' }, { t: 'Spike it', dumb: { p: 0.8, s: 'tablet' }, pop: 2, reply: 'Somehow every camera was on a replay. The tablet did not survive.' }] }
];
// what a dumb choice turns into when it goes wrong
const SCANDALS = {
  yacht:     { subj: 'Yacht photos everywhere', body: 'Photos from the yacht party are all over the internet, including one of you doing something with a fire extinguisher nobody can explain.', pop: -12, part: -15, fans: -4 },
  dui:       { subj: 'Arrested: DUI', body: 'You were pulled over and arrested for driving under the influence on the way home from the party. It is the top story everywhere.', pop: -30, part: -20, fam: -20, team: -5, fans: -8, hot: 25 },
  bardance:  { subj: 'The bar video', body: 'Video of you dancing on the bar back home has 30 million views, and you are not alone in it.', pop: -15, part: -25, fam: -6, fans: -3 },
  barfight:  { subj: 'Charged after a bar fight', body: 'You were cited for disorderly conduct after shoving a heckler at a bar. The video does not help.', pop: -25, fam: -12, team: -3, fans: -6, hot: 20 },
  cheat:     { subj: 'The messages leaked', body: 'Screenshots of your flirty messages with someone who is not {partner} leaked. {partner} saw them first.', pop: -25, part: -60, fam: -15, fans: -6, hot: 15 },
  resort:    { subj: 'Resort photos', body: 'Photos of you and a sideline reporter at a resort during the bye are everywhere. {partner} found out from a sports blog.', pop: -25, part: -60, fam: -12, fans: -6, hot: 15 },
  moto:      { subj: 'Motorcycle crash', body: 'You crashed your motorcycle with the marketing hire on the back and tried to keep that part quiet. It did not stay quiet.', pop: -25, part: -40, fam: -15, team: -4, fans: -6, hot: 20 },
  fireworks: { subj: 'Cited for fireworks', body: 'Police cited you after a firework from the team hotel balcony landed in the pool of the hotel next door.', pop: -10, team: -2, fans: -3 },
  signals:   { subj: 'Caught filming signals', body: 'The league caught your intern filming the other sideline. You are fined, the team loses a draft pick, and every road crowd now chants about it.', pop: -25, team: -4, fans: -8, hot: 30 },
  bounty:    { subj: 'The bounty board', body: 'A photo of the whiteboard of cash rewards for big hits leaked. The league suspends your defensive coordinator and fines the team.', pop: -25, team: -6, fans: -6, hot: 30 },
  burner:    { subj: 'Your burner account was found', body: 'Internet sleuths tied the anonymous account defending you to your phone. It also called your own fans "casuals."', pop: -20, fans: -8, hot: 10 },
  emails:    { subj: 'Old emails leaked', body: 'Your reply-all jokes about the league office leaked. They read worse in a news story than they did at 1 a.m.', pop: -22, fam: -6, fans: -6, hot: 20 },
  tablet:    { subj: 'Fined for the tablet', body: 'The league fined you for spiking the tablet. Somebody made it into a slow-motion video set to opera.', pop: -6, hot: 5 }
};
function lifeText(L, s, ev) {
  const c = L.coach, p = c.partner ? c.partner.n : '';
  return String(s).replace(/\{partner\}/g, p || 'your partner').replace(/\{partnerOrDog\}/g, p || 'your dog').replace(/\{p\}/g, ev && ev.np || '');
}
function careerWeek(L, r) {
  const c = L.coach; if (!c || L.phase !== 'regular') return;
  // a partner needs attention: the mood fades every week of the season (faster when you are married to the job: the hot seat), and a low
  // one gets a warning before it is too late
  if (c.partner) {
    c.partner.mood = clamp(c.partner.mood - PARTNER_FADE - (c.hot >= 60 ? 1 : 0), 0, 100);
    if (c.partner.mood < 30 && !c.partner.warned) { c.partner.warned = 1; inMail(L, { from: c.partner.n, subj: 'Do you even notice me?', body: 'I feel like I come after the playbook, the film room and the kicker. Do something for us, or I do not know how much longer this works. (Career tab: date night, a gift or a getaway.)', kind: 'life' }); }
    if (c.partner.mood >= 45) c.partner.warned = 0;
  }
  // a partner who is fed up leaves (it is in the mail); family that is fed up stops calling
  if (c.partner && c.partner.mood <= 12) { inMail(L, { from: c.partner.n, subj: 'We are done', body: c.partner.n + ' packed a bag and left a note: "You will always choose football." You are single again.', kind: 'life' }); c.partner = null; c.rel = 'single'; cBump(c, 'pop', -3); cBump(c, 'fam', -5); return; }
  if (c.partner && c.partner.mood >= 35) {
    const wk = L.week, f = (c.rel === 'married' ? 1 : c.rel === 'engaged' ? (wk % 2 === 0 ? 1 : 0) : (wk % 3 === 0 ? 1 : 0)) + ((c.kids || 0) > 0 && wk % 2 === 0 ? 1 : 0);
    if (f) moraleBump(L, { fans: f });
    if (c.rel === 'married' && wk % 3 === 0) cBump(c, 'pop', 1);
  }
  const now = L.season * 100 + L.week, since = c.lastP && Math.floor(c.lastP / 100) === L.season ? now - c.lastP : 9;   // (a new season starts fresh)
  if (since < 2 || (since < 3 && r() < 0.35)) return;   // about every two weeks
  const pool = LIFE.filter(e => e.when(c, L) && (c.seen || []).indexOf(e.id) < 0);
  const e = pool.length ? pickOf(r, pool) : pickOf(r, LIFE.filter(x => x.when(c, L))); if (!e) return;
  c.lastP = now; c.seen = (c.seen || []).concat([e.id]).slice(-18);
  const np = pickOf(r, PARTNER_NAMES), ev = { np };
  const opts = e.opts.map(o => Object.assign({}, o, { t: lifeText(L, o.t, ev).replace('{p}', np), reply: o.reply ? lifeText(L, o.reply, ev).replace(/\{p\}/g, np) : o.reply, np: o.meet ? np : undefined, lose: o.lose ? lifeText(L, o.lose, ev) : undefined }));
  inMail(L, { from: lifeText(L, e.from, ev), subj: lifeText(L, e.subj, ev), body: lifeText(L, e.body, ev), kind: 'life', ev: e.id, opts });
}
// a personal choice: its effects, a new partner or status, an investment's result, and maybe the scandal a dumb choice turns into
function lifeAnswer(L, m, o) {
  const c = L.coach; if (!c) return;
  coachBump(L, o);
  if (o.meet && c.rel === 'single') { c.partner = { n: o.np, mood: 65 }; c.rel = 'dating'; }
  if (o.kid) c.kids = (c.kids || 0) + 1;
  if (o.rel && c.partner) c.rel = o.rel;
  const R = rng(L, 'life:' + m.id);
  if (o.win) {
    if (R() < o.win.p) { coachBump(L, { earn: o.win.earn + Math.abs(o.earn || 0) }); inMail(L, { from: m.from, subj: 'Re: ' + m.subj, body: o.win.reply, kind: 'life' }); }
    else inMail(L, { from: m.from, subj: 'Re: ' + m.subj, body: o.lose || 'It did not work out.', kind: 'life' });
    return true;
  }
  if (o.dumb) {
    const S = SCANDALS[o.dumb.s];
    if (S && R() < o.dumb.p) {
      c.scand = (c.scand || 0) + 1;
      coachBump(L, S);
      inMail(L, { from: 'Breaking news', subj: 'SCANDAL: ' + S.subj, body: lifeText(L, S.body) + ' Fan approval of you is now ' + c.pop + '.', kind: 'scandal' });
      L.news.unshift({ s: L.season, t: 'Scandal: the ' + L.teams[myId(L)].nick + ' head coach, ' + S.subj.toLowerCase() + '.' });
      return true;   // (the reply that said you got away with it never comes)
    }
  }
  return false;
}
// the end of a season: the record, the hot seat, and what happens to your job
function careerSeason(L) {
  const c = L.coach; if (!c) return;
  const me = myId(L), R = records(L)[me], po = L.po || {}, made = po.seeds && po.seeds[me] != null, champ = po.champ === me, r = rng(L, 'career:' + L.season);
  const win = R.w > R.l, lose = R.w < R.l;
  cBump(c, 'pop', (50 - c.pop) * 0.25);   // (time heals a little)
  c.good = win ? (c.good || 0) + 1 : 0; c.bad = lose ? (c.bad || 0) + 1 : 0;
  cBump(c, 'pop', champ ? 20 : made ? 8 : win ? 4 : lose ? -8 : -2);
  cBump(c, 'hot', champ ? -60 : made ? -25 : win ? -10 : lose ? 25 : 5);
  c.earn = Math.round((c.earn + c.ct.sal) * 10) / 10; c.ct.yrs--;
  const h = { s: L.season, tid: me, nick: L.teams[me].nick, w: R.w, l: R.l, t: R.t, po: made ? 1 : 0, champ: champ ? 1 : 0 };
  c.hist.unshift(h);
  c.offers = [];
  const honey = L.season <= (c.since || 0);   // a first season somewhere: only a fan revolt gets you fired
  const fired = honey ? c.pop < 8 : c.bad >= 2 || (lose && c.pop < 25) || c.pop < 8 || (!win && c.hot >= 95);   // (a winning coach is only fired when the fans have completely turned on him)
  if (fired) {
    h.why = c.bad >= 2 ? 'fired after ' + c.bad + ' losing seasons' : 'fired';
    const runs = c.bad >= 2; c.need = true; c.bad = 0; c.hot = 40;
    inMail(L, { from: 'The owner', subj: 'You are fired', body: (runs ? 'After another losing season, ' : 'The fans have turned on you, and ') + 'we are making a change. Thank you for your work. Your agent will be in touch.', kind: 'job' });
    inMail(L, { from: 'Team PR', subj: 'Your last press conference', body: 'The media wants one last word from you on the way out.', kind: 'job', opts: [{ t: 'Thank the fans and the players', pop: 6, reply: 'Classy. People will remember how you left.' }, { t: 'Blame the roster you were given', pop: -6, hot: -10, reply: 'Every GM in the league read that quote. Some of them agreed with you.' }, { t: 'Walk out without a word', pop: -2, reply: 'The empty podium photo is on every front page.' }] });
    if (c.partner) { const ok2 = c.partner.mood >= 50; coachBump(L, { part: ok2 ? 5 : -5 }); inMail(L, { from: c.partner.n, subj: 'I heard', body: ok2 ? 'Come home. We will figure out the next job together. I am proud of you.' : 'I heard. I am worried about what comes next for us.', kind: 'life' }); }
    else inMail(L, { from: 'Mom', subj: 'Are you okay?', body: 'We saw the news. They did not deserve you. Call me.', kind: 'life' });
    jobOffers(L, r, 'fired');
  } else if (c.ct.yrs <= 0) {
    const sal = Math.round(c.ct.sal * (champ ? 1.6 : made ? 1.35 : win ? 1.15 : 1) * 10) / 10, yrs = champ || made ? 5 : 3;
    c.offers.push({ tid: me, yrs, sal, k: 'ext' });
    inMail(L, { from: 'The owner', subj: 'Your contract is up', body: 'Your deal is done. We would like you back: ' + yrs + ' years at $' + sal + 'M a year. (Career tab: sign it, or see who else is interested.)', kind: 'job' });
    c.need = true;
    if (c.good >= 2 || champ) jobOffers(L, r, 'hot');
  } else if (c.good >= 2 || champ) jobOffers(L, r, 'hot');
}
// offers from other teams: after a run of winning seasons (better money, sometimes better teams), or after a firing (worse teams, less money)
function jobOffers(L, r, why) {
  const c = L.coach, me = myId(L), ranked = L.teams.filter(t => t.id !== me).map(t => ({ t, r: teamRating(L, t.id).ovr })).sort((a, b) => a.r - b.r);
  const pool = why === 'fired' ? ranked.slice(0, Math.ceil(ranked.length * 0.45)) : ranked;
  const n = why === 'fired' ? 2 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3 + (c.pop >= 70 ? 1 : 0));
  shuffle(r, pool.slice()).slice(0, n).forEach(x => {
    const sal = Math.max(2, Math.round(c.ct.sal * (why === 'fired' ? 0.7 + r() * 0.2 : 1.25 + r() * 0.5) * 10) / 10), yrs = why === 'fired' ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 3);
    c.offers.push({ tid: x.t.id, yrs, sal, k: why });
    inMail(L, { from: 'Your agent', subj: 'The ' + x.t.nick + ' want you', body: 'The ' + x.t.name + ' (rated ' + x.r + ') offer ' + yrs + ' years at $' + sal + 'M a year. ' + (why === 'fired' ? 'It is a rebuild, but it is a job.' : 'They have been watching you win.') + ' Interview to push the offer (a rebuilding team wants a vision, a contender wants to hear about winning now), or sign it as it is on the Career tab.', kind: 'job',
      opts: [{ t: 'Interview: sell your long-term vision', iv: 'vision', tid: x.t.id }, { t: 'Interview: promise to win right now', iv: 'win', tid: x.t.id }, { t: 'Pass on them', pass: 1, tid: x.t.id }] });
  });
}
// after each of your games in the season: the hot seat, and the owner's warnings (a vote of confidence is never good news)
function careerAfterGame(L, won, tie) {
  const c = L.coach; if (!c || L.phase !== 'regular') return;
  cBump(c, 'hot', won ? -3 : tie ? 0 : 4);
  const owner = L.teams[myId(L)].nick + ' owner';
  if (c.hot >= 70 && c.vote !== L.season) { c.vote = L.season; inMail(L, { from: 'The ' + owner, subj: 'A vote of confidence', body: 'I want everyone to know I have full confidence in our head coach. (Every coach in the league knows what that sentence means.)', kind: 'job' }); }
  if (c.hot >= 90 && c.vote === L.season && c.last !== L.season) { c.last = L.season; inMail(L, { from: 'The ' + owner, subj: 'Win, or else', body: 'I am not going to keep reading about this team in the wrong section of the paper. Turn it around this season or I will find someone who can.', kind: 'job' }); }
}
// a job mail answered: an interview for an offer, passing on one, or a press conference (coachBump effects)
function jobAnswer(L, m, o) {
  const c = L.coach; if (!c) return null;
  const off = o.tid != null ? (c.offers || []).find(x => x.tid === o.tid) : null;
  if (o.iv) {
    if (!off) return 'That offer is gone.';
    if (off.iv) return 'You already interviewed with them.';
    const rated = teamRating(L, off.tid).ovr, rebuild = rated < 80, R = rng(L, 'iv:' + L.season + ':' + off.tid);
    const p = clamp(0.55 + (c.pop - 50) * 0.01 + (o.iv === 'vision' && rebuild ? 0.15 : o.iv === 'win' && !rebuild ? 0.15 : -0.05), 0.15, 0.9);
    off.iv = 1;
    if (R() < p) { off.sal = Math.round(off.sal * 1.15 * 10) / 10; off.yrs = Math.min(6, off.yrs + 1); inMail(L, { from: 'Your agent', subj: 'Re: ' + m.subj, body: 'You crushed the interview. They raised it to ' + off.yrs + ' years at $' + off.sal + 'M. (Career tab to sign.)', kind: 'job', read: false }); }
    else { off.sal = Math.max(2, Math.round(off.sal * 0.9 * 10) / 10); inMail(L, { from: 'Your agent', subj: 'Re: ' + m.subj, body: 'The interview did not land. They are still interested, at $' + off.sal + 'M. (Career tab.)', kind: 'job', read: false }); }
    return null;
  }
  if (o.pass) {
    if (!off) return null;
    if (c.need && c.offers.length <= 1) return 'You need a job: this is your last offer.';
    c.offers = c.offers.filter(x => x !== off); return null;
  }
  coachBump(L, o);
  if (o.reply) inMail(L, { from: m.from, subj: 'Re: ' + m.subj, body: o.reply, kind: 'job', read: true });
  return null;
}
// take an offer: your own team's extension, or a move to another team (your old players stay behind; the new team comes as it is)
function takeOffer(L, i) {
  const c = L.coach, o = c && c.offers && c.offers[i]; if (!o) return 'That offer is gone.';
  const moving = o.tid !== myId(L);
  if (moving) moveTeam(L, o.tid);
  if (moving) {
    const nick = L.teams[o.tid].nick;
    inMail(L, { from: 'Team PR', subj: 'Your introductory press conference', body: 'The ' + nick + ' are introducing you to the city. Every camera in town is here.', kind: 'job', opts: [{ t: 'Promise a championship', fans: 6, pop: 4, hot: 10, reply: 'The crowd went wild. The owner did not stop smiling. Now you have to deliver.' }, { t: 'Talk about building a culture', team: 3, pop: 2, reply: 'Thoughtful. The players liked it more than the fans did.' }, { t: 'Thank your family for following you here', fam: 6, part: 6, fans: 2, pop: 3, reply: 'Your mom watched it four times.' }] });
    if (c.partner) {
      const comes = c.partner.mood >= 50;
      coachBump(L, { part: comes ? 5 : -15, fam: -3 });
      inMail(L, { from: c.partner.n, subj: comes ? 'Let us go' : 'I am not moving', body: comes ? 'New city, new house. I already found a place with a yard. Let us do this together.' : 'I am not ready to move for your job again. We will try long distance. I do not know how long it lasts.', kind: 'life' });
    } else coachBump(L, { fam: -3 });
  }
  if (o.tid !== c.ct.tid) { c.good = 0; c.bad = 0; c.since = L.season + 1; }   // (a new team, a fresh start: next season is the honeymoon)
  c.ct = { tid: o.tid, yrs: o.yrs, sal: o.sal }; c.offers = []; c.need = false; c.hot = 20;
  inMail(L, { from: 'The owner', subj: o.k === 'ext' ? 'Glad to have you back' : 'Welcome to the ' + L.teams[o.tid].nick, body: o.k === 'ext' ? 'Signed: ' + o.yrs + ' more years. Now go win.' : 'You are our head coach: ' + o.yrs + ' years at $' + o.sal + 'M. The roster, the money and the fans are yours to fix.', kind: 'job' });
  return null;
}
// ask your agent to push an offer up: they say yes or they walk (more likely to walk when you are not in demand)
function counterOffer(L, i) {
  const c = L.coach, o = c && c.offers && c.offers[i]; if (!o || o.k === 'ext' || o.pushed) return 'You cannot push that one.';
  const r = rng(L, 'push:' + L.season + ':' + o.tid);
  if (r() < (o.k === 'fired' ? 0.35 : 0.6) + (c.pop - 50) * 0.005) { o.sal = Math.round(o.sal * 1.2 * 10) / 10; o.pushed = 1; return 'They came up: $' + o.sal + 'M a year.'; }
  c.offers.splice(i, 1); return 'They pulled the offer.';
}
function moveTeam(L, tid) {
  const old = myId(L); if (tid === old) return;
  L.teams[old].owner = null; L.teams[tid].owner = 'You'; L.user = tid;
  L.talks = {}; L.dead = {}; L.morale = { team: 60, fans: 55 }; L.fin = { cash: 30, lv: { st: 1, pr: 1, me: 1 } };
  const r = rng(L, 'staff' + L.season + tid); L.staff = { oc: { n: randName(r), r: 70, sal: 3.3 }, dc: { n: randName(r), r: 70, sal: 3.3 }, mkt: [] }; newCoachMarket(L);
  L.news.unshift({ s: L.season, t: 'The ' + L.teams[tid].nick + ' hire a new head coach, who leaves the ' + L.teams[old].nick + '.' });
}
/* making your partner happy (Career tab): each has a cooldown in weeks, and the bigger ones cost the team some of your attention */
const PARTNER_FADE = 2;
const DATES = {
  date:    { label: 'Date night', mood: 10, cd: 2, desc: 'Dinner, no phones, no film.', say: ['A quiet dinner. You only mentioned the red zone once.', 'You found a place with candles and no TVs. It was perfect.', 'You cooked. It was not great. {p} loved it anyway.'] },
  gift:    { label: 'A thoughtful gift', mood: 6, cd: 1, desc: 'Something you actually picked out yourself.', say: ['You remembered the thing {p} mentioned three months ago. Huge points.', 'Flowers and a handwritten note. {p} kept the note.', 'A framed photo from your first date. {p} put it on the fridge.'] },
  getaway: { label: 'Weekend getaway', mood: 22, cd: 6, team: -2, desc: 'Two days away, phone off. The team will notice you were gone.', say: ['A cabin, a fireplace, no reception. {p} has not been this happy in months.', 'A beach weekend. You came back tanned and the coordinators came back frazzled.', 'A city trip with a show and a late dinner. {p} is still talking about it.'] }
};
function partnerTreat(L, k) {
  const c = L.coach, d = DATES[k]; if (!c || !c.partner) return 'You are single.'; if (!d) return 'Unknown.';
  const now = L.season * 100 + (L.week || 0), last = (c.dates || {})[k];
  if (last != null && Math.floor(last / 100) === L.season && now - last < d.cd) return d.label + ': again in ' + (d.cd - (now - last)) + ' week' + (d.cd - (now - last) === 1 ? '' : 's') + '.';
  c.dates = Object.assign({}, c.dates, { [k]: now });
  coachBump(L, { part: d.mood, team: d.team, fam: 1 });
  const r = rng(L, 'date:' + k + ':' + now), line = pickOf(r, d.say).replace(/\{p\}/g, c.partner.n);
  return line + ' (' + c.partner.n + ' +' + d.mood + ')';
}
const careerBlock = L => L.career && L.coach && L.coach.need ? (L.coach.offers.length ? 'You need a job first: take an offer on the Career tab.' : 'No offers yet.') : null;

/* ---------- a campaign action, the same in the browser (a campaign of your own) and on the server (a shared one) ----------
   campOp(L, tid, op, a) -> { ok, msg, talk } (talk: the CPU's counter, a piece more they would want); campGo for the phase buttons. */
function campOp(L, tid, op, a) {
  a = a || {}; let r = { ok: true };
  if (op === 'trade') {
    if (!canTrade(L)) return { ok: false, msg: 'Trading is closed right now.' };
    if (!tradeTalkLeft(L, a.to)) return { ok: false, msg: L.teams[a.to].nick + ' are done talking trades for now. Try again next week.' };
    const x = cpuTrade(L, tid, a.to, a.give, a.get); if (x.ok) doTrade(L, tid, a.to, a.give, a.get); r = { ok: x.ok, msg: x.msg };
    if (!x.ok) {   // they come back with what would get it done, and they will not talk forever
      tradeTalkUse(L, a.to);
      const c = tradeCounter(L, tid, a.to, a.give, a.get);
      if (c.add) r.talk = { t: a.to, give: a.give.concat([c.add]), get: a.get.slice(), line: x.msg + ' They would do it with one more piece:' };
    } else if (L.phase === 'draft') autoDraftToHuman(L);
  } else if (op === 'sign') { const e = signFA(L, tid, a.pid); r = { ok: !e, msg: e || 'Signed.' }; }
  else if (op === 'release') { const e = release(L, tid, a.pid); r = { ok: !e, msg: e || 'Released.' }; }
  else if (op === 'block') { const e = setBlock(L, tid, a.pid, a.on); r = { ok: !e, msg: e }; }
  else if (op === 'starter') { const e = setStarter(L, tid, a.pid, a.on); r = { ok: !e, msg: e }; }
  else if (op === 'ir') { const e = placeIR(L, tid, a.pid); r = { ok: !e, msg: e }; }
  else if (op === 'activate') { const e = activateIR(L, tid, a.pid); r = { ok: !e, msg: e }; }
  else if (op === 'use') { const e = setUsage(L, tid, a.pid, a.v); r = { ok: !e, msg: e }; }
  else if (op === 'press') { pressAnswer(L, a.a); }
  else if (op === 'ct-open') { contractOpen(L, a.pid); }
  else if (op === 'ct-offer') { const x = contractOffer(L, tid, a.pid, a.o); r = { ok: x.ok, msg: x.msg || (x.signed ? 'Signed!' : '') }; }
  else if (op === 'walk') { const e = letWalk(L, a.pid); r = { ok: !e, msg: e }; }
  else if (op === 'ask') {
    if (!tradeTalkLeft(L, a.to)) r = { ok: false, msg: L.teams[a.to].nick + ' are done talking trades for now.' };
    else { tradeTalkUse(L, a.to); r = tradeAsk(L, tid, a.to, a.pid); }
  }
  else if (op === 'mail') { const e = mailAnswer(L, a.id, a.i); r = { ok: !e, msg: e }; }
  else if (op === 'coach-take') { const inSeason = L.phase === 'regular' || L.phase === 'playoffs'; if (inSeason && L.coach) L.coach.offers = []; const e = inSeason ? 'Those offers expired when the season started.' : takeOffer(L, a.i); r = { ok: !e, msg: e || 'Signed.' }; }
  else if (op === 'coach-push') { const msg = counterOffer(L, a.i); r = { ok: true, msg }; }
  else if (op === 'coach-date') { const msg = partnerTreat(L, a.k); r = { ok: true, msg }; }
  else if (op === 'read') { mailRead(L, a.id); }
  else if (op === 'upgrade') { const e = upgrade(L, a.k); r = { ok: !e, msg: e || 'Upgraded.' }; }
  else if (op === 'hire') { const e = hireCoach(L, a.i); r = { ok: !e, msg: e || 'Hired.' }; }
  else if (op === 'hof') { const e = induct(L, tid, a.pid); r = { ok: !e, msg: e }; }
  else if (op === 'ret') { const e = setReturner(L, tid, a.pid || null); r = { ok: !e, msg: e }; }
  else if (op === 'draft') { if (!draftPick(L, tid, a.pid)) r = { ok: false, msg: 'That pick is not allowed.' }; else autoDraftToHuman(L); }
  else if (op === 'draftauto') { L.draft.auto = L.draft.auto || {}; L.draft.auto[tid] = !!a.on; if (a.on) draftAdvance(L, 'me'); }
  else r = { ok: false, msg: 'Unknown action.' };
  return r;
}
// a move big enough that a co-manager has to say yes first (shared campaigns): its line for the approval card, or null
const BIG_CONTRACT = 15;
function campBig(L, tid, op, a) {
  a = a || {}; const P = id => L.players[id], nm = id => P(id) ? P(id).n + ' (' + P(id).p + ' ' + P(id).o + ')' : 'a pick', list = ids => (ids || []).map(id => { if (isPick(id)) { const k = pickOf_(L, id); return k ? pickLabel(L, k) : 'a pick'; } return nm(id); }).join(', ');
  if (op === 'trade') return 'trade ' + list(a.give) + ' to the ' + L.teams[a.to].nick + ' for ' + list(a.get);
  if ((op === 'release' || op === 'walk') && P(a.pid) && P(a.pid).o >= 80) return (op === 'release' ? 'release ' : 'let ') + nm(a.pid) + (op === 'walk' ? ' walk in free agency' : '');
  if (op === 'ct-offer' && a.o && +a.o.y > 0 && (+a.o.s + (+a.o.b || 0) / +a.o.y) > BIG_CONTRACT) return 'offer ' + nm(a.pid) + ' ' + a.o.y + ' years at $' + Math.round((+a.o.s + (+a.o.b || 0) / +a.o.y) * 10) / 10 + 'M a year';
  if (op === 'draft' && L.draft) { const nx = draftPicksLeft(L)[0]; if (nx && nx.k.r === 1 && nx.k.t === tid) return 'take ' + nm(a.pid) + ' in the first round'; }
  return null;
}
// what a co-manager did, for the activity feed (worked out before the move, while the names are still where they were)
function campDesc(L, tid, op, a) {
  a = a || {}; const P = id => L.players[id], nm = id => P(id) ? P(id).n : 'a player';
  switch (op) {
    case 'sign': return 'signed ' + nm(a.pid);
    case 'release': return 'released ' + nm(a.pid);
    case 'starter': return (a.on ? 'made ' : 'took away ') + nm(a.pid) + (a.on ? ' a starter' : '\'s starting job');
    case 'use': return 'set ' + nm(a.pid) + '\'s usage to ' + (a.v == null ? 'the default' : a.v + '%');
    case 'ir': return 'put ' + nm(a.pid) + ' on injured reserve';
    case 'activate': return 'brought ' + nm(a.pid) + ' back from injured reserve';
    case 'block': return (a.on ? 'put ' + nm(a.pid) + ' on the trading block' : 'took ' + nm(a.pid) + ' off the trading block');
    case 'trade': return 'traded with the ' + L.teams[a.to].nick;
    case 'ask': return 'asked the ' + L.teams[a.to].nick + ' about ' + nm(a.pid);
    case 'ct-open': return 'opened contract talks with ' + nm(a.pid);
    case 'ct-offer': return 'made ' + nm(a.pid) + ' a contract offer';
    case 'walk': return 'let ' + nm(a.pid) + ' walk';
    case 'mail': { const m = (L.inbox || []).find(x => x.id === a.id); return 'answered ' + (m ? '"' + m.subj + '"' : 'an email'); }
    case 'press': return 'answered a press question';
    case 'upgrade': return 'upgraded the ' + (FACILITY[a.k] ? FACILITY[a.k].label.toLowerCase() : a.k);
    case 'hire': return 'hired a coach';
    case 'hof': return 'nominated ' + nm(a.pid) + ' for the Hall of Fame';
    case 'ret': return 'made ' + (a.pid ? nm(a.pid) : 'nobody') + ' the returner';
    case 'draft': return 'drafted ' + nm(a.pid);
    case 'draftauto': return (a.on ? 'turned on' : 'turned off') + ' auto-draft';
    default: return null;   // (reading mail and the like: not worth a line)
  }
}
function campGo(L, tid, op) {
  if (op === 'offseason') offseasonBegin(L, 7);
  else if (op === 'season') { const b = careerBlock(L); if (b) return b; if (L.coach && L.coach.offers.length) { L.coach.offers = []; inMail(L, { from: 'Your agent', subj: 'The other offers are off the table', body: 'The season started, so the teams that wanted you went with someone else. If you keep winning, they will call again.', kind: 'job' }); } startSeason(L); runUntilHuman(L, 60); }
  else if (op === 'fa-next') faNext(L);
  else if (op === 'draft-one' || op === 'draft-me') draftAdvance(L, op === 'draft-one' ? 'one' : 'me');
  else if (op === 'trim') trimRoster(L, tid);
  else return 'Unknown action.';
  return null;
}
function campOffseason(L, rep) {
  const me = myId(L), RR = records(L), R = RR[me], mine = ids => ids.map(id => L.players[id]).filter(p => p && p.t === me);
  L.teams.forEach(t => { const x = RR[t.id]; if (x.w + x.l + x.t >= MODE.games) t.lastPct = x.pct; });   // next season starts from this one's results
  updateModes(L);
  mine(rep.stars).filter(p => isStar(L, p)).forEach(p => inMail(L, { from: 'Head of scouting', subj: 'Superstar: ' + p.n, body: p.n + ' (' + p.p + ') is now a ' + p.o + '. He is one of the best in the league at his position. Build around him.', kind: 'alert', pid: p.i }));
  mine(rep.sleepers).forEach(p => inMail(L, { from: 'Head of scouting', subj: (p.pt >= 90 && p.p !== 'OL' && p.p !== 'K' && p.p !== 'P' ? 'Future superstar: ' : 'Sleeper: ') + p.n, body: 'We had ' + p.n + ' (' + p.p + ') wrong, in the good way. We rated his potential ' + p.was + '. After a season it looks like ' + p.pt + '. Get him on the field.', kind: 'alert', pid: p.i }));
  mine(rep.busts).forEach(p => inMail(L, { from: 'Head of scouting', subj: 'Bust: ' + p.n, body: 'Bad news on ' + p.n + ' (' + p.p + '). We rated his potential ' + p.was + '. After a season it looks like ' + p.pt + '. He is not going to be what we hoped.', kind: 'alert', pid: p.i }));
  const money = Math.round((10 + R.w * 1.2 + L.morale.fans * 0.1 - (L.fin.lv.st + L.fin.lv.pr + L.fin.lv.me) * 1.5) * 10) / 10;
  moraleBump(L, { cash: money, fans: R.w >= 11 ? 6 : R.w <= 5 ? -5 : 0, team: 3 });
  if (L.career) careerSeason(L);
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
/* a CPU team's expiring contracts, best first: a great player (80+, or a starter 76+) is kept unless the team cannot fit him under the cap
   or does not want to pay him (a rebuilding team and a player of 30+; anyone 34+, unless it is going for it now); a solid starter (70+) is
   kept if he fits, unless he is 33+ on a team that is not; an elite one (88+) is wanted whatever his age (a short deal); the rest is a
   judgment call. Every new deal has to fit under the cap with a
   little room left for the rookies. */
const RESIGN_ROOM = 4;
function cpuResign(L, tid, ps, r) {
  const t = L.teams[tid], ids = new Set(ps.map(p => p.i)), ln = lineup(L, tid), win = t.mode === 'win', reb = t.mode === 'rebuild';
  let used = rosterOf(L, tid).filter(p => !ids.has(p.i)).reduce((s, p) => s + salOf(p), 0) + ((L.dead && L.dead[tid]) || 0);
  const room = payrollCap(L) - RESIGN_ROOM;
  ps.slice().sort((a, b) => playerValue(b) - playerValue(a) || (a.i < b.i ? -1 : 1)).forEach(p => {
    const sal = DRx().salaryOfPos(p.p, p.o), starter = (ln[p.p] || []).indexOf(p) >= 0, great = p.o >= 80 || (starter && p.o >= 76);
    let want, why = '';
    if (great) { want = p.o >= 88 || (!(reb && p.a >= 30) && !(p.a >= 34 && !win)); if (!want) why = reb ? 'the rebuilding ' + t.nick + ' did not want to pay a veteran' : 'the ' + t.nick + ' did not want to pay him at his age'; }
    else if (starter && p.o >= 70) want = !(p.a >= 33 && !win);
    else want = r() < 0.4 + (p.o - 65) * 0.012 + (win ? 0.08 : 0) - (reb && p.a >= 29 ? 0.3 : 0);
    if (want && used + sal > room) { want = false; why = 'the ' + t.nick + ' could not fit him under the cap'; }
    if (want) { used += sal; p.sal = sal; p.cx = L.season + (p.a >= 32 ? ri(r, 1, 2) : great ? ri(r, 3, 5) : ri(r, 1, 4)); return; }
    p.was = p.t; p.t = -1; p.sal = sal; p.cx = null; delete p.st; delete p.ctr;
    if (p.o >= 85) L.news.unshift({ s: L.season, t: p.n + ' (' + p.p + ' ' + p.o + ') hits free agency: ' + (why || 'the ' + t.nick + ' let him go') + '.' });
  });
}
function faStart(L, rounds) {
  const r = rng(L, 'fa' + L.season + ':start'), exp = [], cpuExp = {};
  Object.values(L.players).forEach(p => {
    if (p.t < 0) return;
    if (p.cx == null) { p.cx = L.season + ri(r, 1, 3); if (p.sal == null) p.sal = salOf(p); return; }
    if (p.cx > L.season) return;
    const t = L.teams[p.t];
    if (t.owner) { exp.push(p.i); return; }
    (cpuExp[p.t] = cpuExp[p.t] || []).push(p);
  });
  Object.keys(cpuExp).forEach(tid => cpuResign(L, +tid, cpuExp[tid], r));
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
    setMorale(L, p, ratio > 1.1 ? 12 : 6);
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
  threadKey, mailThreads, divisionRanks, nflMatchups, STAT_KEYS, sumStats, gameLog, teamStats, playerStats, induct, ensurePicks, picksOf, pickOf_, isPick, pickId, pickValue, pickProjection, pickLabel, assetValue, strengthFrac, pickOpen, simGame, forfeit, playVerified, weekGames, simWeek, advanceWeek, runUntilHuman, humanSides, checkFinal,
  records, standings, overallRank, rank, startPlayoffs, advancePlayoffs,
  depthOrder, setStarter,
  INJ_RATE, IR_MIN, SEASON_OUT, activeRoster, healthy, injuries, injuryWeek, placeIR, activateIR,
  RET_POS, retRating, returnerCands, returnerOf, setReturner,
  runUntilHumanAsync, USE_DEFAULT, USE_SPOTS, usageList, setUsage, snapShare, ptCalm, PT_CALM, __ptMail: L => ptMail(L, myId(L), false, true),
  progress, offseasonBegin, startDraft, draftPick, onClock, autoDraftToHuman, cpuPickFor, canDraftPos, affordable, capInfo, salOf, UNIT_ROUNDS, fillPrice, hasLegalPick, isUnitId, unitOf, unitRating, draftOvr, salOfId, draftLabel, unitNeeds, canDraftId, affordableId, autoPickFor, startSeason, trimRoster, fillDepth, finishDraft,
  __suspend: suspend, isStar, starterIds, modeOf, MODE, campInit, teamMode, updateModes, cpuTradesRound, tradeAsk, tradeCounter, tradeTalkLeft, tradeTalkUse, draftAdvance, draftUpOffers, draftDownBids, draftPrem, rookieScore, draftSlot, campOp, campGo, campBig, campDesc, BIG_CONTRACT, faNext, faFinish, faStart, cpuResign, TEAM_STATE, DUMB_LAWS, CRIMES, SUS_GAMES, letWalk, demandOf, contractOpen, contractOffer, contractSummary, inMail, mailRead, mailAnswer, unread, moraleOf, setMorale, moraleBump, pressAnswer, pressOptions, PRESS_ANSWERS, upgradeCost, upgrade, hireCoach, coachMarket, FACILITY, deadMoney, COACH_ANSWERS, playerValue, tradeCheck, cpuTrade, tradeEval, teamNeeds, doTrade, canTrade, cpuOffers, PAYROLL_CAP, payrollCap, payroll, capRoom, signFA, release, BLOCK_MAX, blockOf, setBlock, blockBids,
  newCustom, addTeam, removeTeam, assignDivisions, startCustom, finalizeLeagueDraft, customSchedule, ownerRecord, leaders, leagueTables,
  careerOn, careerBlock, careerAfterGame, jobOffers, partnerTreat, DATES, PARTNER_FADE, takeOffer, counterOffer, moveTeam, careerWeek, careerSeason, LIFE, SCANDALS,
  computeAwards, makeBracket, reportSeries, setSeries, bracketOrder, nflMatchups, assignWeeks, rrSchedule, mkPlayer, rng, shuffle
};
if (typeof module !== 'undefined' && module.exports) module.exports = LG;
else root.LG = LG;
})(typeof window !== 'undefined' ? window : globalThis);
