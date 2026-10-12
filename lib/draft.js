/* Snake draft over the whole board: every QB/HB/WR/TE, every O-line package and every defense package can be taken
   once. Optional salary cap: each player has a salary from rating and position; a package costs the sum of its players. */
(function (root) {
'use strict';
const E = root.E || require('./engine.js');
const { PLAYERS, OLU, DFU, TEAMS } = E.DATA ? { PLAYERS: E.DATA.PLAYERS, OLU: E.DATA.OLU, DFU: E.DATA.DFU, TEAMS: E.DATA.TEAMS } : {};
const clamp = E.clamp;

/* ---------- salaries ($M per season) ---------- */
// top-of-market salary by position class, roughly the real pay scale: QB >> edge/WR > CB/OL/DT > LB > TE/S > HB
const SAL_MAX = { QB: 56, DE: 36, WR: 38, CB: 30, DT: 30, OL: 28, LB: 22, TE: 19, S: 18, HB: 16 };
const SAL_MIN = 0.8;
function salOne(cls, ovr) {
  const t = clamp((ovr - 58) / 41, 0, 1);
  return SAL_MIN + (SAL_MAX[cls] - SAL_MIN) * Math.pow(t, 1.8);
}
const defCls = pos => /DE$/.test(pos) ? 'DE' : /DT$|^NT$/.test(pos) ? 'DT' : /LB$/.test(pos) ? 'LB' : /CB$/.test(pos) ? 'CB' : 'S';
const r1 = x => Math.round(x * 10) / 10;
// general (league) positions
const LEAGUE_CLS = { QB: 'QB', HB: 'HB', WR: 'WR', TE: 'TE', OL: 'OL', DL: 'DE', LB: 'LB', CB: 'CB', S: 'S' };
const salaryOfPos = (pos, ovr) => r1(salOne(LEAGUE_CLS[pos] || 'S', ovr));

/* ---------- the board ---------- */
// candidate id: 'P<index>' skill player, 'O<index>' o-line package, 'D<index>' defense package
const CANDS = [];
PLAYERS.forEach((p, i) => CANDS.push({ id: 'P' + i, k: p.pos, ovr: p.ovr, sal: r1(salOne(p.pos, p.ovr)), name: p.name, tm: p.team, n: i }));
OLU.forEach((u, i) => CANDS.push({ id: 'O' + i, k: 'OL', ovr: u.ovr, sal: r1(u.players.reduce((t, p) => t + salOne('OL', p[1]), 0)), name: u.tm.nick + ' O-Line', tm: u.team, n: i }));
DFU.forEach((u, i) => CANDS.push({ id: 'D' + i, k: 'DEF', ovr: u.ovr, sal: r1(u.players.reduce((t, p) => t + salOne(defCls(p[0]), p[3]), 0)), name: u.tm.nick + ' Defense', tm: u.team, n: i }));
const BY = {}; CANDS.forEach(c => { BY[c.id] = c; });
const KINDS = ['QB', 'HB', 'WR', 'TE', 'OL', 'DEF'];
const NEED = { QB: 1, HB: 1, WR: 2, TE: 1, OL: 1, DEF: 1 };
const ROUNDS = 7;
const MINSAL = {}; KINDS.forEach(k => { MINSAL[k] = Math.min.apply(null, CANDS.filter(c => c.k === k).map(c => c.sal)); });
// how much each slot moves the team rating (matches teamUnits: offense weights halved because defense is the other half)
const W = { QB: 0.125, HB: 0.06, WR: 0.05, TE: 0.04, OL: 0.175, DEF: 0.5 };

/* ---------- draft state ---------- */
// { n, order:[teamIdx...], picks:[{t,id,n}], cap:0|number }
function snakeOrder(n, first) {
  const out = [], base = Array.from({ length: n }, (_, i) => (i + (first || 0)) % n);
  for (let r = 0; r < ROUNDS; r++) (r % 2 ? base.slice().reverse() : base).forEach(t => out.push(t));
  return out;
}
function newDraft(n, cap, first) { return { n, order: snakeOrder(n, first), picks: [], cap: cap || 0 }; }
const onClock = d => d.picks.length < d.order.length ? d.order[d.picks.length] : null;
const isDone = d => d.picks.length >= d.order.length;
const teamIds = (d, t) => d.picks.filter(p => p.t === t).map(p => p.id);
const taken = d => { const s = {}; d.picks.forEach(p => { s[p.id] = 1; }); return s; };
function openKinds(ids) {
  const left = Object.assign({}, NEED);
  ids.forEach(id => { left[BY[id].k]--; });
  return left;
}
const spent = ids => r1(ids.reduce((t, id) => t + BY[id].sal, 0));
// cheapest way to fill the remaining slots, assuming rivals grab the cheapest players they still need (so a team can never be priced out)
function reserve(d, t, left, tk, skipKind) {
  const opp = {}; KINDS.forEach(k => { opp[k] = 0; });
  for (let u = 0; u < d.n; u++) if (u !== t) { const l = openKinds(teamIds(d, u)); KINDS.forEach(k => { opp[k] += Math.max(0, l[k]); }); }
  let r = 0;
  KINDS.forEach(k => {
    const n = k === skipKind ? left[k] - 1 : left[k];
    if (n <= 0) return;
    const cheap = CANDS.filter(c => c.k === k && !tk[c.id]).map(c => c.sal).sort((a, b) => a - b);
    for (let i = 0; i < n; i++) r += cheap[Math.min(cheap.length - 1, opp[k] + i)];
  });
  return r;
}
// returns null when the pick is allowed, otherwise the reason
function legal(d, t, cid) {
  const c = BY[cid]; if (!c) return 'Unknown player.';
  if (onClock(d) !== t) return 'It is not your turn.';
  const tk = taken(d); if (tk[cid]) return 'Already drafted.';
  const ids = teamIds(d, t), left = openKinds(ids);
  if (left[c.k] <= 0) return 'Your ' + c.k + ' slot' + (NEED[c.k] > 1 ? 's are' : ' is') + ' already filled.';
  if (d.cap) {
    const after = spent(ids) + c.sal + reserve(d, t, left, Object.assign({ [cid]: 1 }, tk), c.k);
    if (after > d.cap + 1e-6) return 'That would put you over the salary cap.';
  }
  return null;
}
function apply(d, t, cid) { d.picks.push({ t, id: cid, n: d.picks.length + 1 }); }
// seven-slot roster (indexes into PLAYERS / OLU / DFU) for a finished set of picks
function toRoster(ids) {
  const g = k => ids.filter(id => BY[id].k === k).map(id => BY[id].n);
  const wr = g('WR');
  if (g('QB').length !== 1 || g('HB').length !== 1 || wr.length !== 2 || g('TE').length !== 1 || g('OL').length !== 1 || g('DEF').length !== 1) return null;
  return [g('QB')[0], g('HB')[0], wr[0], wr[1], g('TE')[0], g('OL')[0], g('DEF')[0]];
}
// room left under the cap after the picks in ids, for display
const capLeft = (d, ids) => d.cap ? r1(d.cap - spent(ids)) : null;

/* ---------- CPU drafting ---------- */
// Value over what would still be there next time around, weighted by how much the slot moves team rating;
// with a cap, each slot gets a fair share of the remaining budget (by market price) and the best player that fits is taken.
function cpuPick(d, t, rnd) {
  rnd = rnd || Math.random;
  const tk = taken(d), ids = teamIds(d, t), left = openKinds(ids), budget = d.cap ? d.cap - spent(ids) : Infinity;
  const open = KINDS.filter(k => left[k] > 0);
  const avail = {}; open.forEach(k => { avail[k] = CANDS.filter(c => c.k === k && !tk[c.id]).sort((a, b) => b.ovr - a.ovr); });
  const share = {}; let tot = 0;
  open.forEach(k => { const top = avail[k].slice(0, 12), m = top.reduce((s, c) => s + c.sal, 0) / top.length * left[k]; share[k] = m; tot += m; });
  const opts = [];
  open.forEach(k => {
    const fair = d.cap ? budget * share[k] / tot : Infinity, cap1 = d.cap ? Math.min(fair * 1.3 / left[k], budget - reserve(d, t, left, tk, k)) : Infinity;
    const ok = avail[k].filter(c => c.sal <= cap1 + 1e-6 || (!d.cap));
    if (!ok.length) return;
    const repl = ok[Math.min(ok.length - 1, 2 + (left[k] > 1 ? 2 : 0))].ovr;
    // when two slots are open at a position the second-best is worth almost as much; a lone slot rewards scarcity
    const best = ok[0], gain = W[k] * (best.ovr - repl) + 0.15 * W[k] * best.ovr;
    opts.push({ c: best, gain });
  });
  if (!opts.length) { // nothing fits the fair-share rule: best legal player overall, else the cheapest fill
    const all = []; open.forEach(k => avail[k].forEach(c => all.push(c)));
    const fit = all.filter(c => !d.cap || spent(ids) + c.sal + reserve(d, t, left, Object.assign({ [c.id]: 1 }, tk), c.k) <= d.cap + 1e-6).sort((a, b) => b.ovr - a.ovr);
    return (fit[0] || all.sort((a, b) => a.sal - b.sal)[0]).id;
  }
  opts.sort((a, b) => b.gain - a.gain);
  const pick = opts.length > 1 && rnd() < 0.12 ? opts[1] : opts[0];
  return pick.c.id;
}
function autoRun(d, caps) { // fill the whole draft with CPU picks (testing / auto-draft everyone)
  while (!isDone(d)) { const t = onClock(d); apply(d, t, cpuPick(d, t)); }
  return d;
}
const CAPS = { tight: 270, standard: 300, loose: 335 };
const DR = { CAPS, CANDS, BY, KINDS, NEED, ROUNDS, W, SAL_MAX, salaryOfPos, snakeOrder, newDraft, onClock, isDone, teamIds, taken, openKinds, spent, legal, apply, toRoster, capLeft, cpuPick, autoRun, reserve };
if (typeof module !== 'undefined' && module.exports) module.exports = DR; else root.DR = DR;
})(typeof window !== 'undefined' ? window : globalThis);
