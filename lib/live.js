/* Live play simulation: 22 players on a field, 20 ticks a second, deterministic.
   Both clients (and the server, for verification) run exactly this code from (seed, play number, squads, calls, input traces),
   so a played-out snap always ends in the same result everywhere.  Only + - * / sqrt, min/max/abs/floor are used (no trig/pow),
   which are exactly reproducible across JS engines.

   Frame: offense-relative.  x runs toward the offense's goal line (0 = line of scrimmage), y is across the field (screen-down positive).
   Input per side: { dx, dy } in {-1,0,1} (offense-relative x) plus one-shot action codes:
     1..4 throw to WR1, WR2, TE, HB (quarterback behind the line)  5 juke / dive-tackle+jump / throw away  6 switch defender
     7 spin move (ball carrier) / big hit (defender) */
(function (root) {
'use strict';
const E = root.E || require('./engine.js');
const { mulberry32, hashStr, clamp, fit } = E;
const DT = 0.05, MAXT = 260, YB = 7.4, TPS = 20;
const sqrt = Math.sqrt, abs = Math.abs, min = Math.min, max = Math.max;
const DIAG = 0.70710678;

const T43 = { LDE: [0.9, -2.9], LDT: [0.9, -1], RDT: [0.9, 1], RDE: [0.9, 2.9], WLB: [3, -3.6], MLB: [3.8, 0], SLB: [3, 3.6] };
const T34 = { LDT: [0.9, -2.2], NT: [0.9, 0], RDT: [0.9, 2.2], LEDGE: [2.6, -3.8], LILB: [3.6, -1.1], RILB: [3.6, 1.1], REDGE: [2.6, 3.8],
  LDE: [0.9, -2.2], RDE: [0.9, 2.2], WLB: [2.6, -3.8], SLB: [2.6, 3.8] };   // (the last four: 3-4 squads saved before DE / DT)
const TDB = { LCB: [2.2, -6], RCB: [2.2, 6], SS: [9, 2.2], FS: [9, -2.2] };
const OFFSET = [[-1, 0], [-0.9397, 0.342], [-0.9397, -0.342], [-0.766, 0.643], [-0.766, -0.643], [-0.5, 0.866], [-0.5, -0.866]];
const DIRS = [[1, 0], [0.9397, 0.342], [0.9397, -0.342], [0.766, 0.643], [0.766, -0.643], [0.5, 0.866], [0.5, -0.866], [0.17, 0.985], [0.17, -0.985]];

/* routes: [forward, sideways] waypoints, sideways is positive toward the sideline the receiver lines up on.
   Every call has its own entry; a call without one runs its category's. */
const ROUTES = {
  PASS_S: { WR1: [[2, 0], [6, -4], [10, -8]], WR2: [[2, 0], [6, -4], [10, -8]], TE: [[3, 0], [5, 3]], HB: [[-1, 3], [2, 6]] },                       // slants
  HITCH:  { WR1: [[6, 0], [4.6, 0.4]], WR2: [[6, 0], [4.6, 0.4]], TE: [[5, 0], [4, 1]], HB: [[-1, 3], [1, 7]] },
  MESH:   { WR1: [[2, 0], [2.6, -6], [4, -12]], WR2: [[3, 0], [3.6, -6], [5, -12]], TE: [[6, 0], [6.5, -3]], HB: [[-1, 3], [3, 6]] },
  STICK:  { WR1: [[1.5, 0], [2.6, 3]], WR2: [[7, 0], [7.2, -2]], TE: [[5, 0], [5.4, -1]], HB: [[-1, 3], [2, 6]] },
  PASS_M: { WR1: [[11, 0], [12, -5], [12.5, -9]], WR2: [[10.5, 0], [11, 2.4]], TE: [[9, 0], [10, -1.5]], HB: [[-1, 3], [3, 6]] },                      // dig
  CURLS:  { WR1: [[11, 0], [9, 0.6]], WR2: [[11, 0], [9, -0.6]], TE: [[7, 0], [6, -2]], HB: [[-1, 3], [1, 7]] },
  FLOOD:  { WR1: [[7, 0], [8, -9]], WR2: [[14, 0], [15.5, 3]], TE: [[8, 0], [8.6, 4]], HB: [[-1, 3], [2, 6]] },
  YCROSS: { WR1: [[18, 0], [20, 0.5]], WR2: [[6, 0], [7, 2]], TE: [[12, 0], [13, -8]], HB: [[-1, 3], [3, 6]] },
  PASS_D: { WR1: [[42, 0]], WR2: [[42, 0]], TE: [[34, -0.5]], HB: [[-1, 3], [3, 6]] },                                                               // four verticals
  POST:   { WR1: [[12, 0], [22, -7], [38, -12]], WR2: [[12, 0], [24, 5], [34, 8]], TE: [[7, 0], [8, -3]], HB: [[-1, 3], [3, 6]] },
  GO:     { WR1: [[46, 0]], WR2: [[46, 0]], TE: null, HB: null },
  PA_DEEP: { WR1: [[42, 0]], WR2: [[12, 0], [32, -4]], TE: [[8, 0], [10, -3]], HB: [[-2, 0], [3, 2]] },
  SCREEN: { WR1: [[7, 0]], WR2: [[7, 0]], TE: [[4, 2]], HB: [[-3, 5]] },
  BUBBLE: { WR1: [[6, 0]], WR2: [[-0.5, -2.2]], TE: [[4, 2]], HB: [[-1, 3], [2, 6]] },
  TUNNEL: { WR1: [[-0.5, -2], [0.5, -3]], WR2: [[6, 0]], TE: [[4, 2]], HB: [[-1, 3], [2, 6]] }
};
const DECIDE = { PASS_S: [12, 26], PASS_M: [24, 40], PASS_D: [34, 54], SCREEN: [22, 36] };
const DROP = { PASS_S: -3.8, PASS_M: -5, PASS_D: -7, SCREEN: -5 };
/* per call extras. pass: dec (earliest and latest throw tick), drop (QB drop depth), tgt (only ever throws to him), pa (play-action: fake handoff, linebackers bite)
   run: hoT (earliest handoff tick), rb (blocking bias, positive favors the offense), wide (distance to the edge), flip (back cuts away from the tight end after a step the other way), read (extra defender read delay) */
const PM = {
  HITCH: { dec: [8, 20], drop: -3, safe: 0.35 }, MESH: { dec: [14, 28], drop: -3.6, safe: 0.25 }, STICK: { dec: [10, 22], drop: -3.4, safe: 0.5 },
  CURLS: { dec: [20, 36], drop: -4.6, safe: 0.5 }, FLOOD: { dec: [26, 42] }, YCROSS: { dec: [28, 44] },
  POST: { dec: [34, 54] }, GO: { dec: [38, 60], drop: -7 }, PA_DEEP: { dec: [34, 52], drop: -6.5, pa: 1 },
  BUBBLE: { dec: [8, 16], drop: -2.5, tgt: 'WR2', blk: [['TE', 'RCB']] }, TUNNEL: { dec: [10, 18], drop: -2.8, tgt: 'WR1', blk: [['HB', 'LCB']] },
  DIVE: { hoT: 4, rb: 0.004 }, POWER: { hoT: 7, rb: 0.006 }, DRAW: { hoT: 12, read: 4 },
  SWEEP: { hoT: 5, rb: 0, wide: 7.5 }, COUNTER: { hoT: 9, flip: 1, rb: 0.002 }
};

function vmaxOf(grp, o, s) {
  switch (grp) {
    case 'QB': return 6.0 + (s - 70) * 0.05;
    case 'HB': return 7.1 + (s - 80) * 0.085;
    case 'WR': return 7.3 + (s - 85) * 0.085;
    case 'TE': return 6.6 + (s - 78) * 0.08;
    case 'OL': return 4.9 + (o - 75) * 0.015;
    case 'DL': return 6.1 + (o - 75) * 0.02;
    case 'LB': return 7.0 + (o - 75) * 0.02;
    case 'CB': return 8.0 + (o - 75) * 0.02;
    default: return 7.8 + (o - 75) * 0.02;
  }
}
const ACC = 16, ACC_HUMAN = 25;
// pass protection tuning: bias per tick (base, plus extra while the line is still setting up), help per free lineman, skill weight, noise, how hard a losing block gets driven back, when a block is beaten
const PRO = { flyDB: 0.19, flyLB: 0.12, flyDL: 0.05, flyPick: 0.10, fum: 0.042, fumSack: 2.2, ball: 4, blitzDelay: 6, blitzEdge: 0.006, base: 0.0038, set: 0.012, setT: 50, help: 0.005, skill: 0.0020, noise: 0.04, drive: 1.2, beat: -0.82, swim: 0.2, swimLev: 0.9, bull: 0.5, bullCool: 8, getoff: 0.2, getoffT: 6, burst: 14 };
const RUNMOD = { STACK: -0.010, BLITZ: -0.004, MAN: 0, ZONE: 0.004, PREVENT: 0.012 };

/* ---------- construction ---------- */
function create(ctx) {
  if (ctx.ret) return createRet(ctx);
  const OS = ctx.OS, DS = ctx.DS, play = E.OFF[ctx.offPick] ? ctx.offPick : 'RUN_IN', dplay = E.DEF_CALLS[ctx.defPick] ? ctx.defPick : 'ZONE';
  const spec = E.OFF[play].cat === 'TRICK' ? E.OFF[play].live : E.OFF[play].cat, call = E.DEF_CALLS[dplay].cat, pm = PM[play] || {};   // trick plays line up like the play they disguise
  const R = mulberry32(hashStr(ctx.seed + ':live:' + ctx.playNo));
  const sim = {
    t: 0, P: [], by: {}, R, goalX: 100 - ctx.ballOn, backX: -ctx.ballOn, offPick: spec, defPick: call, play, dplay, pm, toGo: ctx.toGo,
    dec: pm.dec || DECIDE[spec], drop: pm.drop != null ? pm.drop : DROP[spec], hoT: pm.hoT || 7, wideY: pm.wide || 6,
    ball: { x: -3.2, y: 0, z: 0, st: 'snap', car: null, air: null }, pairs: [], out: null, hist: {}, ctl: { o: { dx: 0, dy: 0 }, d: { dx: 0, dy: 0 } },
    ctlId: { o: 'QB', d: null }, human: { o: !!ctx.ctlO, d: !!ctx.ctlD }, kind: /^RUN/.test(spec) ? 'run' : 'pass', handoff: 0, thrown: 0, evt: [], ratO: null, ratD: null
  };
  const add = (id, side, grp, name, o, s, x, y, extra) => {
    const p = Object.assign({ id, side, grp, name, o, rat: fit(o), x, y, vx: 0, vy: 0, vmax: vmaxOf(grp, o, s), hold: 0, eng: null, free: false, cool: 0, imm: 0, dive: 0, jump: 0,
      route: null, ri: 0, man: null, zone: null, mode: 'idle', lag: clamp(Math.round(5 - (fit(o) - 55) * 0.1), 1, 6), seek: null, seekT: 0, s }, extra || {});
    sim.P.push(p); sim.by[id] = p; return p;
  };
  add('QB', 'o', 'QB', OS.qb.n, OS.qb.o, OS.qb.s, -3.2, 0);
  add('HB', 'o', 'HB', OS.hb.n, OS.hb.o, OS.hb.s, -6.8, 0);
  add('WR1', 'o', 'WR', OS.wr[0].n, OS.wr[0].o, OS.wr[0].s, -0.8, -5.4);
  add('WR2', 'o', 'WR', OS.wr[1].n, OS.wr[1].o, OS.wr[1].s, -0.8, 5.4);
  add('TE', 'o', 'TE', OS.te.n, OS.te.o, OS.te.s, -0.8, 3.4);
  [['QB', OS.qb], ['HB', OS.hb], ['WR1', OS.wr[0]], ['WR2', OS.wr[1]], ['TE', OS.te]].forEach(([id, q]) => { if (q.fire) sim.by[id].fire = 1; });   // on fire (drawn with flames)
  OS.ol.p.forEach((p, i) => add('OL' + i, 'o', 'OL', p[0], p[1], 70, -0.8, (i - 2) * 1.1));
  const T = DS.df.sch === '43' ? T43 : T34;
  DS.df.p.forEach((p, i) => {
    const q = T[p[0]] || TDB[p[0]] || [4, 0];
    add('D' + i, 'd', p[1], p[2], p[3], 80, q[0], q[1], { pos: p[0] });
  });
  // assignments
  sim.D = sim.P.filter(p => p.side === 'd'); sim.O = sim.P.filter(p => p.side === 'o');
  sim.OL = sim.O.filter(p => p.grp === 'OL');
  const sgnOf = p => p.y < 0 ? -1 : 1;
  const rt = ROUTES[play] || ROUTES[spec];
  if (rt) ['WR1', 'WR2', 'TE', 'HB'].forEach(id => {
    if (!rt[id]) { sim.by[id].route = null; sim.stay = (sim.stay || []).concat(id); return; }   // stays in to block
    const p = sim.by[id], s = sgnOf(p);
    p.route = rt[id].map(w => [p.x + w[0], p.y + w[1] * s]); if (id === 'HB') p.route = rt[id].map(w => [w[0], w[1] * (p.y === 0 ? 1 : s)]);
    p.mode = 'route';
  });
  if (dplay === 'BLITZ' && spec !== 'SCREEN' && !pm.tgt && sim.by.TE.route) { sim.by.TE.route = null; sim.by.TE.mode = 'idle'; sim.stay = (sim.stay || []).concat('TE'); }   // hot: the tight end stays in against the house
  const byPos = n => sim.D.find(p => p.pos === n);
  const dbs = sim.D.filter(p => p.grp === 'CB' || p.grp === 'S'), lbs = sim.D.filter(p => p.grp === 'LB'), dls = sim.D.filter(p => p.grp === 'DL');
  const zone = (p, x, y, r) => { p.mode = 'zone'; p.zone = { x, y, r: r || 4 }; };
  const man = (p, t) => { p.mode = 'man'; p.man = t; };
  const rush = p => { p.mode = 'rush'; };
  dls.forEach(rush);
  const lcb = byPos('LCB'), rcb = byPos('RCB'), ss = byPos('SS'), fs = byPos('FS');
  const hookY = [-3.6, 0, 3.6, -1.2, 1.2];
  const lbSorted = lbs.slice().sort((a, b) => a.y - b.y);
  const sk = sim.kind === 'run' ? 'run' : 'pass';
  const hooks = (x, w) => lbSorted.forEach((p, i) => zone(p, x, lbSorted.length === 3 ? [-3.6, 0, 3.6][i] : [-4, -1.3, 1.3, 4][i], w || 3.6));
  const midLB = lbSorted.slice().sort((a, b) => abs(a.y) - abs(b.y))[0];
  if (dplay === 'COV3') {          // three deep, four under
    zone(lcb, 19, -6, 6); zone(rcb, 19, 6, 6); zone(fs, 21, 0, 7); zone(ss, 7.5, 4.5, 4);
    lbSorted.forEach((p, i) => zone(p, 6, lbSorted.length === 3 ? [-3.8, 0, 2.4][i] : [-4, -1.3, 1.3, 2.5][i], 3.4));
  } else if (dplay === 'COV4') {   // quarters: four deep
    zone(lcb, 14, -5.6, 5.4); zone(rcb, 14, 5.6, 5.4); zone(ss, 14, 2.2, 5.4); zone(fs, 14, -2.2, 5.4); hooks(6, 3.4);
  } else if (call === 'ZONE') {    // cover 2
    zone(lcb, 8, -5.5, 4.5); zone(rcb, 8, 5.5, 4.5); zone(ss, 16, 3.5, 6); zone(fs, 16, -3.5, 6); hooks(6.5);
  } else if (dplay === 'MAN2') {   // man under, two deep
    man(lcb, 'WR1'); man(rcb, 'WR2'); zone(ss, 19, 3.5, 7); zone(fs, 19, -3.5, 7);
    lbSorted.forEach(p => { if (p === midLB) man(p, 'TE'); else zone(p, 6, p.y < 0 ? -3.4 : 3.4, 3.4); });
  } else if (dplay === 'TIGHT') {  // press man, nobody deep
    man(lcb, 'WR1'); man(rcb, 'WR2'); man(fs, 'TE'); man(ss, 'HB'); hooks(5.5, 3.2);
  } else if (call === 'MAN') {     // cover 1
    man(lcb, 'WR1'); man(rcb, 'WR2'); man(ss, 'TE'); zone(fs, 19, 0, 8);
    man(midLB, 'HB');
    lbSorted.forEach((p, i) => { if (p !== midLB) zone(p, 6, lbSorted.length === 3 ? [-3.6, 0, 3.6][i] : [-4, -1.3, 1.3, 4][i], 3.4); });
  } else if (dplay === 'GOALLINE') {
    man(lcb, 'WR1'); man(rcb, 'WR2'); zone(ss, 3.4, 2.6, 3); zone(fs, 5, 0, 4); hooks(3.2, 3);
  } else if (dplay === 'RUNBLITZ') {
    man(lcb, 'WR1'); man(rcb, 'WR2'); zone(ss, 4.6, 2.6, 3.4); zone(fs, 17, 0, 8);
    lbSorted.forEach((p, i) => { if (i % 2 === 0) rush(p); else zone(p, 4.2, p.y < 0 ? -2.6 : 2.6, 3.2); });
  } else if (call === 'STACK') {
    man(lcb, 'WR1'); man(rcb, 'WR2'); zone(ss, 4.6, 2.6, 3.4); zone(fs, 17, 0, 8); hooks(4.2, 3.2);
  } else if (dplay === 'ZBLITZ') { // five rush, one lineman drops
    man(lcb, 'WR1'); man(rcb, 'WR2'); zone(fs, 18, 0, 8); rush(ss);
    lbSorted.forEach(p => { if (p === midLB) zone(p, 6, 0, 3.6); else rush(p); });
    const dr = dls.slice().sort((a, b) => abs(a.y) - abs(b.y))[dls.length - 1]; if (dr) zone(dr, 5.5, dr.y < 0 ? -3.8 : 3.8, 3.2);
  } else if (dplay === 'CBBLITZ') {
    rush(rcb); man(lcb, 'WR1'); zone(fs, 18, 0, 8); zone(ss, 9, 4, 6);
    lbSorted.forEach(p => { if (p === midLB) man(p, 'HB'); else rush(p); });
  } else if (call === 'BLITZ') {
    man(lcb, 'WR1'); man(rcb, 'WR2'); zone(fs, 18, 0, 8); rush(ss); lbs.forEach(rush);
  } else if (dplay === 'SOFT') {
    zone(lcb, 14, -5.5, 5.5); zone(rcb, 14, 5.5, 5.5); zone(ss, 20, 2.5, 7); zone(fs, 20, -2.5, 7); hooks(7.5, 4);
  } else { // PREVENT
    zone(lcb, 23, -5, 7); zone(rcb, 23, 5, 7); zone(ss, 26, 2.5, 7); zone(fs, 26, -2.5, 7); hooks(11, 4);
  }
  // read delay: how long the defense takes to recognize a run
  sim.read = ({ STACK: 2, BLITZ: 3, MAN: 5, ZONE: 6, PREVENT: 9 }[call] || 6) + (pm.read || 0) + (dplay === 'GOALLINE' ? -1 : dplay === 'COV4' || dplay === 'SOFT' ? 1 : 0);
  // line assignments
  setupBlocks(sim);
  // default human control targets
  const mlb = lbSorted.slice().sort((a, b) => abs(a.y) - abs(b.y))[0] || ss;
  sim.ctlId.d = mlb ? mlb.id : (ss || fs).id;
  sim.ball.car = null; sim.ball.st = 'snap';
  return sim;
}

/* ---------- kick and punt returns ----------
   The receiving team is the "offense" (side o, ten blockers B0..B9 and the returner as HB), the kicking team the "defense" (coverage D0..D10, D10 is the kicker or punter).
   x = 0 is where the ball is caught; ballOn is that spot measured from the returner's own goal line. */
const RETP = { wait: 12, ko: -0.032, pr: -0.1, free: 0 };
function createRet(ctx) {
  const kind = ctx.ret.kind, RS = E.retInfo(ctx.OS), KS = E.retInfo(ctx.DS);
  const rr = kind === 'ko' ? RS.kr : RS.pr;
  const R = mulberry32(hashStr(ctx.seed + ':ret:' + ctx.playNo));
  const sim = {
    t: 0, P: [], by: {}, R, goalX: 100 - ctx.ballOn, backX: -ctx.ballOn, offPick: 'RET', defPick: 'RET', play: 'RET', dplay: 'RET', pm: {}, toGo: 10,
    dec: [0, 0], drop: 0, hoT: 0, wideY: 6, ball: { x: 0, y: 0, z: 0, st: 'carried', car: 'HB', air: null }, pairs: [], out: null, hist: {}, ctl: { o: { dx: 0, dy: 0 }, d: { dx: 0, dy: 0 } },
    ctlId: { o: 'HB', d: null }, human: { o: !!ctx.ctlO, d: false }, kind: 'ret', retKind: kind, handoff: 0, thrown: 0, evt: [], ratO: null, ratD: null, read: 0
  };
  const add = (id, side, grp, name, o, s, x, y, extra) => {
    const p = Object.assign({ id, side, grp, name, o, rat: fit(o), x, y, vx: 0, vy: 0, vmax: vmaxOf(grp, o, s), hold: 0, eng: null, free: false, cool: 0, imm: 0, dive: 0, jump: 0,
      route: null, ri: 0, man: null, zone: null, mode: 'idle', lag: clamp(Math.round(5 - (fit(o) - 55) * 0.1), 1, 6), seek: null, seekT: 0, s }, extra || {});
    sim.P.push(p); sim.by[id] = p; return p;
  };
  const ys = (n, w) => { const a = []; for (let i = 0; i < n; i++) a.push(n === 1 ? 0 : -w + 2 * w * i / (n - 1)); return a; };
  add('HB', 'o', 'HB', rr.n, rr.o, rr.s, 0, 0, { pos: kind === 'ko' ? 'KR' : 'PR' });
  const ko = kind === 'ko';
  const spots = [];
  if (ko) { ys(7, 6.3).forEach(y => spots.push([16, y])); ys(3, 3.2).forEach(y => spots.push([10, y])); }
  else { ys(4, 3.6).forEach(y => spots.push([15, y])); ys(4, 4.8).forEach(y => spots.push([11, y])); spots.push([5.5, -6.2], [5.5, 6.2]); }
  const bo = RS.stc;
  spots.forEach((q, i) => add('B' + i, 'o', 'TE', 'Blocker', bo, 78, q[0], q[1]));
  const co = KS.stc, cov = [];
  if (ko) ys(10, 6.6).forEach((y, i) => cov.push([28 + (i % 2) * 1.4, y]));
  else { cov.push([8, -6.2], [8, 6.2]); ys(8, 6.4).forEach((y, i) => cov.push([27 + (i % 2) * 2, y])); }
  const names = KS.cov.map(c => c[1]);
  cov.forEach((q, i) => add('D' + i, 'd', 'S', names[i % Math.max(1, names.length)] || 'Coverage', co + gauss(R) * 2, 80, q[0], q[1], { pos: 'CV' }));
  const kk = ko ? KS.k : { n: KS.pu[1], o: KS.pu[2] };
  add('D10', 'd', 'S', kk.n, 52, 55, ko ? 27 : 35, 0, { pos: ko ? 'K' : 'P' });
  sim.D = sim.P.filter(p => p.side === 'd'); sim.O = sim.P.filter(p => p.side === 'o'); sim.OL = [];
  // lane by lane: the n-th blocker from the left takes the n-th coverage man from the left (on a punt the two wide men take the gunners)
  const tb = {};
  const link = (b, r) => { tb[b.id] = 1; b.mode = 'block'; sim.pairs.push({ b: b.id, r: r.id, L: 0 }); r.tgtBlk = b.id; };
  let bl = sim.O.filter(p => p.id !== 'HB').sort((a, b) => a.y - b.y), cv = sim.D.filter(p => p.id !== 'D10').sort((a, b) => a.y - b.y);
  if (!ko) { link(sim.by.B8, sim.by.D0); link(sim.by.B9, sim.by.D1); bl = bl.filter(p => !tb[p.id]); cv = cv.filter(p => p.id !== 'D0' && p.id !== 'D1'); }
  bl.forEach((b, i) => { const r = cv[i]; if (r && i < bl.length - RETP.free) link(b, r); });
  bl.forEach(b => { if (!tb[b.id]) b.mode = 'lead'; });
  sim.D.forEach(d => { d.mode = 'cover'; });
  return sim;
}

function setupBlocks(sim) {
  const OL = sim.OL.slice().sort((a, b) => a.y - b.y);
  const rushers = sim.kind === 'pass' ? sim.D.filter(p => p.mode === 'rush') : sim.D.filter(p => p.grp === 'DL' || (p.grp === 'LB' && p.x < 5));
  const free = rushers.slice().sort((a, b) => a.y - b.y);
  const taken = {};
  const pair = (b, r) => { taken[r.id] = 1; sim.pairs.push({ b: b.id, r: r.id, L: 0 }); b.mode = 'block'; b.eng = null; r.tgtBlk = b.id; };
  // pair the closest (lineman, rusher) couples first, defensive linemen before linebackers
  const cand = [];
  OL.forEach(b => free.forEach(r => cand.push({ b, r, d: abs(r.y - b.y) + (r.grp === 'DL' ? 0 : 1.8) + (r.x > 2 ? 0.4 : 0) })));
  cand.sort((u, v) => u.d - v.d || (u.b.id < v.b.id ? -1 : 1));
  const usedB = {};
  cand.forEach(c => { if (taken[c.r.id] || usedB[c.b.id] || c.d > 3.4) return; usedB[c.b.id] = 1; pair(c.b, c.r); });
  // a lineman with nobody in front of him picks up the nearest rusher still unblocked, however far away (pass), or just waits (run)
  if (sim.kind === 'pass') OL.forEach(b => {
    if (usedB[b.id]) return;
    const r = free.filter(q => !taken[q.id]).sort((u, v) => abs(u.y - b.y) - abs(v.y - b.y))[0];
    if (r) { usedB[b.id] = 1; pair(b, r); }
  });
  OL.forEach(b => { if (!usedB[b.id]) b.mode = 'pocket'; });
  const extra = free.filter(r => !taken[r.id]);
  if (sim.kind === 'pass' && sim.offPick !== 'SCREEN' && extra.length) {
    const hb = sim.by.HB; const r = extra.slice().sort((a, b) => abs(a.y - hb.y) - abs(b.y - hb.y))[0];
    hb.mode = 'block'; hb.route = null; sim.pairs.push({ b: 'HB', r: r.id, L: 0 }); r.tgtBlk = 'HB'; taken[r.id] = 1;
  }
  // skill players asked to block a defender (screens)
  (sim.pm.blk || []).forEach(([w, c]) => {
    const cb = sim.D.find(p => p.pos === c), wr = sim.by[w];
    if (cb && wr && wr.mode !== 'block') { wr.mode = 'block'; wr.route = null; wr.rat = wr.rat * 0.62; sim.pairs.push({ b: w, r: cb.id, L: 0 }); cb.tgtBlk = w; }
  });
  // receivers kept in to block (max protection): each takes the nearest rusher nobody has
  (sim.stay || []).forEach(id => {
    const b = sim.by[id]; if (!b || b.mode === 'block') return;
    const r = free.filter(q => !taken[q.id]).sort((u, v) => abs(u.y - b.y) - abs(v.y - b.y))[0];
    if (r) { b.mode = 'block'; b.route = null; sim.pairs.push({ b: id, r: r.id, L: 0 }); r.tgtBlk = id; taken[r.id] = 1; }
    else { b.mode = 'pocket'; b.route = null; }
  });
  if (sim.kind === 'run') {
    const te = sim.by.TE; const ex = free.filter(r => !taken[r.id]).sort((a, b) => abs(a.y - te.y) - abs(b.y - te.y))[0];
    if (ex) { te.mode = 'block'; te.route = null; sim.pairs.push({ b: 'TE', r: ex.id, L: 0 }); ex.tgtBlk = 'TE'; taken[ex.id] = 1; }
    [['WR1', 'LCB'], ['WR2', 'RCB']].forEach(([w, c]) => {
      const cb = sim.D.find(p => p.pos === c); if (cb) { const wr = sim.by[w]; wr.mode = 'block'; wr.route = null; wr.rat = wr.rat * 0.62; sim.pairs.push({ b: w, r: cb.id, L: 0 }); cb.tgtBlk = w; }
    });
  }
}

/* ---------- helpers ---------- */
const dist = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return sqrt(dx * dx + dy * dy); };
function gauss(R) { return (R() + R() + R() + R() - 2) * 1.7320508; }
function steer(p, tx, ty, frac, slow) {
  const dx = tx - p.x, dy = ty - p.y, d = sqrt(dx * dx + dy * dy);
  if (d < 0.05) { p.wx = 0; p.wy = 0; return; }
  let sp = p.vmax * (frac == null ? 1 : frac);
  if (slow !== false && d < 1.2) sp *= d / 1.2 + 0.2;
  p.wx = dx / d * sp; p.wy = dy / d * sp;
}
function stickDir(inp, side) { // offense-relative stick -> unit vector
  let dx = inp.dx, dy = inp.dy;
  if (!dx && !dy) return null;
  if (dx && dy) { dx *= DIAG; dy *= DIAG; }
  return [dx, dy];
}
const isCarrier = (sim, p) => sim.ball.car === p.id;
const attackDir = p => p.side === 'o' ? 1 : -1;

/* ---------- one tick ---------- */
function step(sim, inO, inD, acts) {
  if (sim.out) return sim.out;
  const R = sim.R, B = sim.ball, P = sim.P;
  sim.t++;
  const t = sim.t;
  // inputs
  if (acts) { if ((acts.o || []).indexOf(9) >= 0) sim.human.o = false; if ((acts.d || []).indexOf(9) >= 0) sim.human.d = false; }
  const ctlO = sim.human.o ? sim.by[sim.ctlId.o] : null, ctlD = sim.human.d ? sim.by[sim.ctlId.d] : null;
  const sO = sim.human.o && inO ? stickDir(inO) : null, sD = sim.human.d && inD ? stickDir(inD) : null;
  const aO = (acts && acts.o) || [], aD = (acts && acts.d) || [];
  // history for man coverage
  sim.O.forEach(p => { const h = sim.hist[p.id] || (sim.hist[p.id] = []); h.push(p.x, p.y); if (h.length > 40) h.splice(0, 2); });

  // ----- actions -----
  if (sim.human.o) aO.forEach(c => {
    const behind = !sim.by.QB || sim.by.QB.x <= 0;   // a quarterback past the line of scrimmage is a runner: no more passes (returns have none)
    if (c >= 1 && c <= 4 && B.st === 'carried' && B.car === 'QB' && sim.thrown === 0 && sim.kind === 'pass' && behind) throwTo(sim, ['WR1', 'WR2', 'TE', 'HB'][c - 1], true, aO.indexOf(8) >= 0);   // 8 in the same tick (Shift held) = a lob
    else if (c === 7) { const q = sim.by[B.car]; if (q && q === ctlO && q.cool === 0) { q.spin = 12; q.stumble = Math.max(q.stumble || 0, 5); q.cool = 40; } }   // spin: harder to bring down for a moment, at some speed
    else if (c === 5) {
      const q = sim.by[B.car] || ctlO;
      if (q && B.car === 'QB' && sim.kind === 'pass' && sim.thrown === 0 && behind) sim.throwAway = true;
      else if (q && B.car === q.id && q.cool === 0) { const dy = inO.dy || (q.vy >= 0 ? 1 : -1); q.y = clamp(q.y + dy * 1.3, -YB, YB); q.x += 0.4; q.imm = 8; q.cool = 36; }
    }
  });
  if (sim.kind === 'ret' && sim.retKind === 'pr' && sim.human.o && aO.indexOf(6) >= 0 && t <= 24 && B.car === 'HB' && !sim.out) { finish(sim, { k: 'run', x: 0, fc: true, who: 'HB' }); return sim.out; }
  if (sim.human.d) aD.forEach(c => {
    if ((c === 5 || c === 7) && ctlD && ctlD.eng && ctlD.cool === 0) rushMove(sim, ctlD, c === 5 ? 'swim' : 'bull');   // blocked: a pass-rush move
    else if (c === 5 && ctlD) { if (ctlD.cool === 0) { ctlD.dive = 4; ctlD.jump = 6; ctlD.cool = 24; } }
    else if (c === 7 && ctlD) { if (ctlD.cool === 0) { ctlD.hit = 5; ctlD.cool = 26; } }   // big hit: a surer tackle that jars the ball loose more often; miss and he stumbles
    else if (c === 6) switchDef(sim);
  });
  sim.ctlO = ctlO; sim.ctlD = ctlD;

  // ----- intentions -----
  const carrier = B.car ? sim.by[B.car] : null;
  for (let i = 0; i < P.length; i++) {
    const p = P[i]; p.wx = 0; p.wy = 0;
    if (p.hold > 0) { p.hold--; continue; }
    if (p.eng) continue;
    think(sim, p, carrier, t);
  }
  // human overrides
  if (ctlO && sO && ctlO.hold === 0 && !ctlO.eng) { const sp = ctlO.vmax * (ctlO.id === 'QB' && ctlO.x <= 0 && B.car === 'QB' && !sim.thrown && sim.kind === 'pass' ? 0.95 : 1); ctlO.wx = sO[0] * sp; ctlO.wy = sO[1] * sp; ctlO.human = 1; ctlO.steerT = sim.t; }
  if (ctlD && sD && ctlD.hold === 0 && !ctlD.eng) {
    let dx = sD[0], dy = sD[1];
    // tackle assist: steering at a nearby ball carrier takes the defender onto his path
    if (carrier && carrier.side === 'o') {
      const d = dist(ctlD, carrier), tt = min(0.8, d / (ctlD.vmax + 1)), tx = carrier.x + carrier.vx * tt - ctlD.x, ty = carrier.y + carrier.vy * tt - ctlD.y, tl = sqrt(tx * tx + ty * ty) || 1;
      if (d < 4.5 && (dx * tx + dy * ty) / tl > 0.35) { const w = d < 2.5 ? 0.6 : 0.35; dx = dx * (1 - w) + tx / tl * w; dy = dy * (1 - w) + ty / tl * w; const l = sqrt(dx * dx + dy * dy) || 1; dx /= l; dy /= l; }
    }
    ctlD.wx = dx * ctlD.vmax; ctlD.wy = dy * ctlD.vmax; ctlD.human = 1; ctlD.steerT = sim.t;
  }

  // ----- blocks / rushes -----
  pickup(sim);
  resolvePairs(sim);

  // ----- motion -----
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (p.dcool > 0) p.dcool--; if (p.cool > 0) p.cool--; if (p.imm > 0) p.imm--; if (p.dive > 0) p.dive--; if (p.jump > 0) p.jump--; if (p.spin > 0) p.spin--; if (p.burst > 0) p.burst--; if (p.hit > 0) { p.hit--; if (!p.hit && !sim.out) p.stumble = 8; }
    if (p.eng || p.hold > 0) { if (p.hold > 0) { p.vx *= 0.5; p.vy *= 0.5; } else { p.vx = p.pvx || 0; p.vy = p.pvy || 0; } }
    else {
      let wx = p.wx, wy = p.wy;
      if (p.stumble > 0) { p.stumble--; wx *= 0.65; wy *= 0.65; }
      if (p.dive > 0) { wx *= 1.15; wy *= 1.15; }
      if (p.burst > 0) { wx *= 1.3; wy *= 1.3; }
      const ax = wx - p.vx, ay = wy - p.vy, am = sqrt(ax * ax + ay * ay), lim = (p.steerT === sim.t ? ACC_HUMAN : ACC) * DT;   // the player you are steering starts and cuts quicker
      if (am > lim) { p.vx += ax / am * lim; p.vy += ay / am * lim; } else { p.vx = wx; p.vy = wy; }
    }
    p.x += p.vx * DT; p.y += p.vy * DT;
    if (p.y > YB + 0.3) { p.y = YB + 0.3; p.vy = 0; } else if (p.y < -YB - 0.3) { p.y = -YB - 0.3; p.vy = 0; }
  }
  // the engaged blocker keeps on the defender
  sim.pairs.forEach(pr => { const b = sim.by[pr.b], r = sim.by[pr.r]; if (b.eng === r.id) { b.x = r.x - 0.85; b.y = r.y; } });

  // ----- ball -----
  ballLogic(sim, carrier);
  if (sim.t >= MAXT && !sim.out) timeout(sim);
  return sim.out;
}

function switchDef(sim) {
  const B = sim.ball, ref = B.car ? sim.by[B.car] : (B.air ? { x: B.air.ex, y: B.air.ey } : sim.by.QB);
  const cur = sim.ctlId.d;
  const cand = sim.D.filter(p => p.id !== cur && p.hold === 0).sort((a, b) => dist(a, ref) - dist(b, ref));
  if (cand.length) sim.ctlId.d = cand[0].id;
}

/* ---------- behaviour ---------- */
function think(sim, p, carrier, t) {
  const B = sim.ball;
  if (p.side === 'o') return thinkOff(sim, p, carrier, t);
  return thinkDef(sim, p, carrier, t);
}

function thinkOff(sim, p, carrier, t) {
  const B = sim.ball, pass = sim.kind === 'pass';
  if (carrier && carrier.id === p.id && p.id !== 'QB') { carrierAI(sim, p); return; }
  if (p.id === 'QB') {
    if (B.car === 'QB') {
      if (pass) { qbPass(sim, p, t); return; }
      // handoff
      const hb = sim.by.HB;
      if (!sim.handoff) { steer(p, -3.2, 0, 0.3); if (dist(p, hb) < 1.6 || t >= sim.hoT + 5) { if (t >= sim.hoT) giveBall(sim, 'HB'); } }
      else steer(p, p.x, p.y, 0);
    } else if (sim.handoff || sim.thrown) steer(p, p.x - 1, p.y, 0.15);
    return;
  }
  if (p.id === 'HB') {
    if (sim.kind === 'run' && !sim.handoff) {
      const out = sim.offPick === 'RUN_OUT';
      if (!sim.runSide) { const ts = sim.by.TE.y > 0 ? 1 : -1; sim.runSide = sim.pm.flip ? -ts : ts; }
      if (out) { const fake = sim.pm.flip && sim.t < 6 ? -1 : 1; steer(p, -3.2 + 0.2, 4.5 * sim.runSide * fake * 0.8, 0.95); }
      else steer(p, -3.4, 0, 0.8);
      return;
    }
  }
  if (p.mode === 'route' && p.route) { runRoute(sim, p); return; }
  if (p.mode === 'block' || p.mode === 'pocket') {
    if (p.mode === 'block') {
      const pr = sim.pairs.find(q => q.b === p.id);
      if (pr) { const r = sim.by[pr.r]; if (r) steer(p, r.x - 0.85, r.y, 1); }
      else if (carrier) steer(p, carrier.x + 1, carrier.y, 0.6);
    } else {
      // unassigned lineman: step up and look for work, otherwise get downfield on a run
      if (sim.kind === 'run' && sim.handoff) { steer(p, p.x + 6, carrier ? carrier.y : p.y, 0.55); }
      else if (pass) {
        // slide toward the pair that is losing the most
        let w = null, wl = 0.4; sim.pairs.forEach(q => { const rr = sim.by[q.r], bb = sim.by[q.b]; if (!rr || !bb || bb.grp !== 'OL' || q.L >= wl) return; if (abs(rr.y - p.y) < 3.2) { w = rr; wl = q.L; } });
        if (w) steer(p, w.x + 0.9, w.y, 0.55); else steer(p, -0.6, p.y, 0.25);
      } else steer(p, -0.6, p.y, 0.25);
    }
    return;
  }
  if (carrier && carrier.side === 'd') { // turnover: chase the ball
    steer(p, carrier.x - 0.8 * attackDir(carrier), carrier.y, 0.95);
    return;
  }
  // trailing receivers / blockers once the ball is out
  if (sim.thrown && B.air && sim.byTarget === p.id) { steer(p, B.air.ex, B.air.ey, 1, false); return; }
  if (carrier && carrier.id !== p.id) steer(p, carrier.x + 4, carrier.y, 0.6);
}

function runRoute(sim, p) {
  const w = p.route[p.ri];
  if (!w) {
    if (sim.thrown && sim.byTarget === p.id && sim.ball.air) { steer(p, sim.ball.air.ex, sim.ball.air.ey, 1, false); return; }
    const q = sim.by.QB;
    if (sim.ball.car === 'QB' && !sim.thrown && sim.kind === 'pass') {   // scramble drill: work back toward the quarterback's side, away from the nearest defender
      let nd = null, bd = 1e9; sim.D.forEach(d => { const dd = dist(d, p); if (dd < bd) { bd = dd; nd = d; } });
      const away = nd && bd < 3 ? (p.y >= nd.y ? 1.2 : -1.2) : 0;
      steer(p, max(1.5, p.x - 0.4), clamp(p.y + clamp(q.y - p.y, -1, 1) * 0.8 + away, -YB + 0.5, YB - 0.5), 0.7); return;
    }
    steer(p, p.x + 0.001, p.y, 0.2); return;
  }
  if (sim.thrown && sim.byTarget === p.id && sim.ball.air) { steer(p, sim.ball.air.ex, sim.ball.air.ey, 1, false); return; }
  const d = dist(p, { x: w[0], y: w[1] });
  if (d < 0.8) { p.ri++; }
  steer(p, w[0], clamp(w[1], -YB, YB), 0.99, p.ri === p.route.length - 1 && p.route.length === 1 && w[0] < 12 ? true : false);
}

function qbPass(sim, q, t) {
  const spec = sim.offPick, human = sim.human.o && sim.ctlId.o === 'QB';
  const dec = sim.dec;
  // drop back (a play-action fake keeps the quarterback close to the line for a moment)
  const dx = sim.pm.pa && t < 8 ? -2.4 : sim.drop;
  steer(q, dx, q.y * 0.9, 0.7);
  if (sim.thrown) return;
  if (sim.throwAway) { throwAwayBall(sim); return; }
  const hold = human ? 160 : dec[1];
  // look
  let best = null, bs = -1e9;
  const tgtId = sim.pm.tgt || (spec === 'SCREEN' ? 'HB' : null);
  if (tgtId) best = { id: tgtId, open: 3 };
  else ['WR1', 'WR2', 'TE', 'HB'].forEach(id => {
    const r = sim.by[id]; if (!r || r.mode === 'block') return;
    const open = openness(sim, r);
    const depthW = spec === 'PASS_D' ? 0.22 : spec === 'PASS_M' ? 0.16 : 0.25, hbPen = spec === 'PASS_D' ? -7 : spec === 'PASS_M' ? -3.6 : -2.5;
    const done = r.route && r.ri >= r.route.length - (id === 'HB' ? 0 : 0);
    const sc = min(open, 5) + r.x * depthW + (id === 'HB' ? hbPen : 0) + (done ? 0.5 : 0);
    if (sc > bs) { bs = sc; best = { id, open }; }
  });
  const rusher = nearestFree(sim, q);
  let pressured = false;
  if (rusher && dist(rusher, q) < 2.6 && t >= 10) pressured = sim.R() < clamp(0.12 + (q.rat - 60) * 0.004, 0.05, 0.3);
  if (human || q.x > 0) return;
  // a blitzer coming free that nobody picked up: a sharp quarterback sees him and gets the ball out to his hot read
  if (best && rusher && !rusher.tgtBlk && rusher.mode !== 'rush' && t >= 8 && dist(rusher, q) < 6 && sim.R() < clamp(0.1 + (q.rat - 60) * 0.006, 0.05, 0.35)) { throwTo(sim, best.id, false); return; }
  if (best && ((t >= dec[0] && (best.open > (spec === 'SCREEN' ? 0 : 2.3) || t >= dec[1])) || (pressured && t >= 10))) {
    if (pressured && best.open < 1.4 && sim.R() < 0.25) { throwAwayBall(sim); return; }
    throwTo(sim, best.id, false);
  }
}
function nearestFree(sim, q) {   // the nearest unblocked rusher, or anyone loose in the backfield (a late blitzer, the defender you steer)
  let b = null, bd = 1e9;
  sim.D.forEach(r => { if (r.hold > 0 || r.eng) return; if (r.mode !== 'rush' && !r.free && r.x > 0.5) return; const d = dist(r, q); if (d < bd) { bd = d; b = r; } });
  return b;
}
function openness(sim, r) {
  let m = 12;
  sim.D.forEach(d => { if (d.hold > 0) return; const dd = dist(d, r); if (dd < m) m = dd; });
  return m;
}

// a bullet is fast and flat (underneath defenders can get a hand on it); a lob floats over them but hangs in the air for the safeties
function throwTo(sim, id, humanThrow, lob) {
  const B = sim.ball, q = sim.by.QB, r = sim.by[id], R = sim.R;
  if (!r || sim.thrown) return;
  sim.thrown = sim.t; sim.byTarget = id;
  let ex = r.x, ey = r.y;
  const vb = (sim.offPick === 'PASS_D' ? 24 : 20) * (lob ? 0.68 : 1);
  for (let k = 0; k < 3; k++) { const d = sqrt((ex - q.x) * (ex - q.x) + (ey - q.y) * (ey - q.y)); const ft = d / vb; const pp = predict(r, ft); ex = pp[0]; ey = pp[1]; }
  if (lob) { const sp = sqrt(r.vx * r.vx + r.vy * r.vy); if (sp > 1) { ex += r.vx / sp * 2.2; ey += r.vy / sp * 2.2; } }   // a lob leads him: he runs under it, away from the man on his hip
  const pres = nearestFree(sim, q), pr = pres ? clamp(1 - dist(pres, q) / 5, 0, 1) : 0;
  const sig = clamp(1.9 - (q.rat - 50) * 0.03, 0.35, 2.1) * (1 + pr * 0.7) * (1 + sqrt((r.x - q.x) * (r.x - q.x)) / 45) * (sim.offPick === 'SCREEN' ? 0.55 : 1) * (lob ? 0.85 : 1);
  ex += gauss(R) * sig * 0.8; ey += gauss(R) * sig * 0.6;
  ey = clamp(ey, -YB - 1, YB + 1);
  const d = sqrt((ex - q.x) * (ex - q.x) + (ey - q.y) * (ey - q.y)), n = max(4, Math.ceil(d / (vb * DT)));
  B.st = 'air'; B.car = null; B.air = { sx: q.x, sy: q.y, ex, ey, n, k: 0, peak: lob ? clamp(d * 0.3, 3, 10) : clamp(d * 0.13, 0.8, 5), lob: !!lob };
  sim.ctlId.o = id;
  sim.evt.push(['throw', sim.t, id, lob ? 1 : 0]);
  // defenders recognise the ball after their reaction lag
  autoSwitch(sim, { x: ex, y: ey });
}
// where a receiver will be after ft seconds if he keeps running his route
function predict(r, ft) {
  let x = r.x, y = r.y, left = r.vmax * 0.99 * ft;
  if (r.mode === 'route' && r.route) {
    for (let i = r.ri; i < r.route.length && left > 0; i++) {
      const w = r.route[i], dx = w[0] - x, dy = w[1] - y, d = sqrt(dx * dx + dy * dy);
      if (d <= left) { x = w[0]; y = w[1]; left -= d; } else { x += dx / d * left; y += dy / d * left; left = 0; }
    }
    return [x, clamp(y, -YB, YB)];
  }
  return [r.x + r.vx * ft, r.y + r.vy * ft];
}
function throwAwayBall(sim) {
  const B = sim.ball, q = sim.by.QB;
  sim.thrown = sim.t; sim.byTarget = null;
  const ey = q.y >= 0 ? YB + 4 : -YB - 4;
  B.st = 'air'; B.car = null; B.air = { sx: q.x, sy: q.y, ex: q.x + 4, ey, n: 10, k: 0, peak: 1.5, away: true, react: sim.t };
}
function giveBall(sim, id) {
  sim.ball.car = id; sim.ball.st = 'carried'; sim.handoff = sim.t; sim.ctlId.o = id; sim.evt.push(['hand', sim.t, id]);
  if (id !== 'QB') sim.by[id].seek = null;
  autoSwitch(sim, sim.by[id]);
}
function autoSwitch(sim, ref) {
  if (!sim.human.d) return;
  const c = sim.D.filter(p => p.hold === 0 && !(p.mode === 'rush' && p.grp === 'DL')).sort((a, b) => dist(a, ref) - dist(b, ref))[0];
  if (c) sim.ctlId.d = c.id;
}

function carrierAI(sim, p) {
  const out = sim.offPick === 'RUN_OUT' && p.id === 'HB' && sim.t - sim.handoff < 14 && p.x < 3;
  if (p.side === 'd') { dirSeek(sim, p, -1); return; }
  if (p.id === 'HB' && sim.kind === 'run' && p.x < 0.5 && sim.t - sim.handoff < 10) {
    const side = sim.runSide || 1;
    if (out) steer(p, 2.5, side * sim.wideY, 1); else { let ty = laneY(sim); steer(p, 1.8, ty, 1); }
    return;
  }
  if (sim.kind === 'ret' && !p.human && sim.t < RETP.wait) { steer(p, p.x + 1, p.y, 0.5); return; }
  dirSeek(sim, p, 1);
}
function laneY(sim) {
  const c = [-3.3, -1.65, 0, 1.65, 3.3]; let best = 0, bs = -1e9;
  c.forEach(y => { let m = 9; sim.D.forEach(d => { if (d.hold > 0 || d.x > 7) return; const dd = sqrt((d.x - 2) * (d.x - 2) + (d.y - y) * (d.y - y)) + (d.eng ? 1.8 : 0); if (dd < m) m = dd; }); const sc = m - abs(y) * 0.12; if (sc > bs) { bs = sc; best = y; } });
  return best;
}
function dirSeek(sim, p, dir) {
  if (p.seekT > 0 && p.seek) { p.seekT--; steer(p, p.x + p.seek[0] * 6, p.y + p.seek[1] * 6, 1, false); return; }
  const h = 0.9;
  let bi = 0, bs = -1e9;
  const foes = sim.P.filter(q => q.side !== p.side && q.hold === 0 && !q.eng && abs(q.x - p.x) < 12);
  DIRS.forEach((d, i) => {
    const dx = d[0] * dir, dy = d[1];
    const cx = p.x + dx * p.vmax * h, cy = clamp(p.y + dy * p.vmax * h, -YB - 0.5, YB + 0.5);
    let m = 12;
    for (let k = 0; k < foes.length; k++) {
      const q = foes[k], ddx = cx - q.x, ddy = cy - q.y, dd = sqrt(ddx * ddx + ddy * ddy);
      // a defender running at us closes in
      const reach = q.vmax * h * 0.8, dz = max(0, dd - reach * 0.8);
      if (dz < m) m = dz;
    }
    const edge = max(0, abs(cy) - 6.2);
    const sc = m * 1.0 + dx * 2.6 - edge * 3;
    if (sc > bs) { bs = sc; bi = i; }
  });
  const d = DIRS[bi];
  p.seek = [d[0] * dir, d[1]]; p.seekT = 2;
  steer(p, p.x + p.seek[0] * 6, p.y + p.seek[1] * 6, 1, false);
}

function thinkDef(sim, p, carrier, t) {
  const B = sim.ball, qb = sim.by.QB;
  if (carrier && carrier.id === p.id) { dirSeek(sim, p, -1); return; }
  if (carrier && carrier.side === 'd') { // a teammate has the ball: lead block for him
    steer(p, carrier.x - 4 * attackDir(carrier), carrier.y + (p.y > carrier.y ? 1.4 : -1.4), 0.9); return;
  }
  // the offense has the ball in the open: everybody converges, after a read delay on runs
  const breaker = carrier && carrier.side === 'o' && (carrier.id !== 'QB' || carrier.x > 1.0);
  if (breaker) {
    const rush = p.mode === 'rush' || p.grp === 'DL';
    let delay = 0;
    if (sim.kind === 'run' && sim.handoff && !sim.thrown) delay = rush ? 0 : p.grp === 'LB' ? max(0, sim.read - 4) : max(0, sim.read - 1) - (sim.t - sim.handoff > 6 ? 0 : 0);
    const since = sim.thrown ? 99 : (sim.handoff ? sim.t - sim.handoff : sim.t - (sim.scrambleT || (sim.scrambleT = sim.t)));
    // deep defenders hold their post until the runner is through the line
    const deepWait = sim.kind === 'run' && !sim.thrown && (p.grp === 'S' || p.grp === 'CB') && carrier.x < 0.8 && sim.t - sim.handoff < 14;
    if (since >= delay && !deepWait) { pursue(sim, p, carrier); return; }
    if (deepWait && since >= delay) { steer(p, p.x, p.y + (carrier.y - p.y) * 0.3, 0.35); return; }
  }
  if (sim.kind === 'run' && !sim.handoff) { // read phase
    if (p.mode === 'rush' || p.grp === 'DL') { rushAt(sim, p, sim.by.HB.x > -4 ? sim.by.HB : qb); return; }
    if (p.mode === 'zone') { steer(p, p.zone.x - (sim.t > sim.read ? 2.5 : 0), p.zone.y, sim.t > sim.read ? 0.8 : 0.45); return; }
    if (p.mode === 'man') { const r = sim.by[p.man]; if (r) steer(p, r.x + 1.3, r.y, 0.9, false); return; }
    steer(p, p.x, p.y, 0.2); return;
  }
  if (p.mode === 'rush') { if (p.grp !== 'DL' && sim.t < PRO.blitzDelay) { steer(p, p.x, p.y, 0.3); return; } rushAt(sim, p, qb); return; }
  if (p.mode === 'man') {
    const r = sim.by[p.man]; if (!r) return;
    const h = sim.hist[r.id] || [], lag = p.lag, i = max(0, h.length / 2 - 1 - lag);
    const ty = h.length ? h[Math.floor(i) * 2 + 1] : r.y;
    const cush = p.grp === 'LB' ? 0.7 : 1.5;
    if (sim.thrown && B.air && !B.air.away && sim.byTarget === r.id && sim.t - sim.thrown >= p.lag - 2) steer(p, B.air.ex, B.air.ey, 1, false);
    else steer(p, r.x + cush, ty, 0.97, false);
    return;
  }
  if (p.mode === 'zone') {
    if (sim.thrown && B.air && !B.air.away) { const dl = dist(p, { x: B.air.ex, y: B.air.ey }); if (dl < p.zone.r + 5 && sim.t - sim.thrown >= p.lag - 1) { steer(p, B.air.ex, B.air.ey, 1, false); return; } }
    let tx = p.zone.x, ty = p.zone.y, bd = 1e9;
    if (sim.pm.pa && sim.t < 10 && (p.grp === 'LB' || p.pos === 'SS') && !sim.thrown) { steer(p, p.zone.x - 3.2, p.zone.y, 0.7); return; }
    if (p.grp === 'S' || p.grp === 'CB') { // deep defenders play over the top of whoever runs through their lane
      let deep = null;
      sim.O.forEach(r => { if (r.mode !== 'route' || r.grp === 'HB') return; if (abs(r.y - p.zone.y) < p.zone.r + 1.5 && r.x > p.zone.x - p.zone.r * 0.6 && (!deep || r.x > deep.x)) deep = r; });
      if (deep) { steer(p, deep.x + 2.4, deep.y * 0.85 + p.zone.y * 0.15, 1, false); return; }
    }
    sim.O.forEach(r => { if (r.mode === 'block' || r.mode === 'pocket' || r.grp === 'OL' || r.grp === 'QB') return; const d = sqrt((r.x - p.zone.x) * (r.x - p.zone.x) + (r.y - p.zone.y) * (r.y - p.zone.y)); if (d < p.zone.r + 1.5 && d < bd) { bd = d; tx = r.x + 1.1; ty = r.y; } });
    steer(p, tx, ty, 0.95);
    return;
  }
  steer(p, p.x, p.y, 0.2);
}
function rushAt(sim, p, target) {
  if (p.tgtBlk && !p.free && !p.eng) {
    const b = sim.by[p.tgtBlk];
    if (b) { steer(p, b.x + 0.85, b.y, 1.0, false); return; }
  }
  steer(p, target.x, target.y, 1.0, false);
}
function pursue(sim, p, c) {
  if (!p.human && p.dive === 0 && (p.dcool || 0) === 0 && c.x > 5 && dist(p, c) < 1.8 && dist(p, c) > 1.0) { p.dive = 4; p.dcool = 30; }
  // lead the carrier
  const d = dist(p, c), tt = min(1.4, d / (p.vmax + 1)), tx = c.x + c.vx * tt * 0.8, ty = c.y + c.vy * tt * 0.8;
  if (p.pursueDeep && sim.D.length) { }
  steer(p, tx, ty, 1.0, false);
}

/* ---------- blocks ---------- */
// a defender who was not rushing at the snap and comes after the quarterback (a delayed blitz, or the one you steer) is picked up by a
// lineman with nobody to block, else by the back while he is still near the line; with nobody left he comes free
function pickup(sim) {
  const q = sim.by.QB, B = sim.ball, hb = sim.by.HB;
  if (sim.kind !== 'pass' || sim.thrown || B.car !== 'QB' || q.x > 0) return;
  for (let i = 0; i < sim.D.length; i++) {
    const d = sim.D[i];
    if (d.picked || d.eng || d.hold > 0 || d.free || d.mode === 'rush' || d.x > 1.5) continue;
    const dq = dist(d, q); if (dq > 9 || (d.vx * (q.x - d.x) + d.vy * (q.y - d.y)) / (dq || 1) < 2) continue;   // only one coming at him
    if (sim.pairs.some(pr => pr.r === d.id)) continue;
    d.picked = 1;
    const ol = sim.OL.filter(b => b.mode === 'pocket' && !b.eng && b.hold === 0).sort((a, b) => dist(a, d) - dist(b, d) || (a.id < b.id ? -1 : 1))[0];
    const b = ol && dist(ol, d) < 6 ? ol : hb && hb.mode !== 'block' && hb.x < 2 && dist(hb, d) < 8 ? hb : null;
    if (!b) continue;
    b.mode = 'block'; b.route = null; sim.pairs.push({ b: b.id, r: d.id, L: 0 }); d.tgtBlk = b.id;
    sim.evt.push(['pickup', sim.t, b.id, d.id]);
  }
}
// pass-rush moves for the defender you control while he is blocked. A swim (Space) beats the block outright, more often the more leverage
// he has built up (his meter in the green) and the better he is than the blocker; when it fails the blocker gets the upper hand. A bull
// rush (Q) drives the blocker back toward the quarterback and builds leverage for the swim.
function rushMove(sim, r, kind) {
  const pr = sim.pairs.find(q => q.r === r.id), b = pr && sim.by[pr.b];
  if (!b || b.eng !== r.id) return;
  const edge = (r.rat - b.rat * (b.grp === 'OL' ? 1 : 0.8)) * 0.01;
  r.moveT = sim.t;
  if (kind === 'swim') {
    r.cool = 26;
    const getoff = sim.t - (r.engT || 0) <= PRO.getoffT ? PRO.getoff : 0;   // a move the moment the blocker gets his hands on him
    if (sim.R() < clamp(PRO.swim + getoff + max(0, -pr.L) * PRO.swimLev + edge, 0.08, 0.8)) {
      b.eng = null; r.eng = null; r.free = true; r.tgtBlk = null; b.hold = 7; sim.pairs.splice(sim.pairs.indexOf(pr), 1); r.move = 'win'; r.burst = PRO.burst; r.cool = 0;   // and he bursts past, ready to make the tackle
    } else { pr.L = min(1, pr.L + 0.3); r.pairL = pr.L; r.move = 'stuck'; }
  } else {
    r.cool = PRO.bullCool; pr.L = clamp(pr.L - PRO.bull - edge * 0.5, -1, 1); r.pairL = pr.L; r.move = 'bull';
  }
  sim.evt.push(['move', sim.t, r.id, r.move]);
}
function resolvePairs(sim) {
  const R = sim.R, pass = sim.kind === 'pass', run = sim.kind === 'run' || sim.kind === 'ret', qb = sim.by.QB;
  for (let i = sim.pairs.length - 1; i >= 0; i--) {
    const pr = sim.pairs[i], b = sim.by[pr.b], r = sim.by[pr.r];
    if (!b || !r) { sim.pairs.splice(i, 1); continue; }
    if (b.eng !== r.id) {
      // not locked yet: lock when they meet
      if (b.hold === 0 && r.hold === 0 && !r.eng && dist(b, r) < 1.25) { b.eng = r.id; r.eng = b.id; pr.run = run; r.engT = sim.t; }
      continue;
    }
    // locked in a block
    const bRat = b.rat * (b.grp === 'OL' ? 1 : 0.8), rRat = r.rat * (r.grp === 'DL' ? 1 : r.grp === 'LB' ? 0.92 : 0.8);
    const swim = 0;
    // pass protection: the line sets up in the first second and a half, a free lineman slides over to help a teammate who is struggling
    let help = 0; if (pass) sim.OL.forEach(h => { if (h.mode === 'pocket' && h.hold === 0 && dist(h, r) < 2.6) help++; });
    const bias = pass ? PRO.base + PRO.set * clamp(1 - sim.t / PRO.setT, 0, 1) + PRO.help * min(help, 2) : sim.kind === 'ret' ? RETP[sim.retKind] : (sim.offPick === 'RUN_OUT' ? 0.011 : 0.02) + (sim.pm.rb || 0) + (RUNMOD[sim.defPick] || 0) * (sim.offPick === 'RUN_OUT' ? 0.5 : 1) + (sim.dplay === 'GOALLINE' ? -0.008 : sim.dplay === 'RUNBLITZ' ? -0.005 : 0);
    const delta = (bRat - rRat) * (pass ? PRO.skill : 0.0026) + gauss(R) * (pass ? PRO.noise : 0.045) - swim + bias - (pass && r.grp !== 'DL' ? PRO.blitzEdge : 0);   // blitzers hit the line with a head of steam
    pr.L = clamp(pr.L * 0.975 + delta, -1, 1); r.pairL = pr.L;
    // drift
    let vx;
    if (pass) vx = pr.L > 0 ? 0.25 * pr.L : pr.L * PRO.drive;   // negative L: the rusher drives toward the QB (negative x)
    else vx = pr.L > 0 ? pr.L * 1.7 : pr.L * 0.9;          // run: a winning blocker moves the defender downfield
    r.pvx = vx; r.pvy = 0; r.x += 0;
    if (pr.L <= (pass ? PRO.beat : -0.72)) { // beaten
      b.eng = null; r.eng = null; r.free = true; r.tgtBlk = null; b.hold = 7; sim.pairs.splice(i, 1);
    } else if (pr.L >= 0.82) { // pancake
      b.eng = null; r.eng = null; r.hold = run ? 16 : 12;
      if (pass) { pr.L = 0.15; r.pairL = 0; }   // in pass protection the lineman stays on his man and locks on again when he gets up
      else { r.tgtBlk = null; sim.pairs.splice(i, 1); }
    }
  }
}

/* ---------- the ball, tackles, catches ---------- */
function ballLogic(sim, carrier) {
  const B = sim.ball, R = sim.R;
  // position of the ball
  if (B.st === 'snap') { B.car = 'QB'; B.st = 'carried'; }
  const car = B.car ? sim.by[B.car] : null;
  if (car) { B.x = car.x; B.y = car.y; B.z = 0; }
  if (B.st === 'air') {
    const a = B.air; a.k++;
    const f = a.k / a.n; B.x = a.sx + (a.ex - a.sx) * f; B.y = a.sy + (a.ey - a.sy) * f; B.z = 4 * a.peak * f * (1 - f);
    if (a.k >= a.n) { landBall(sim); return; }
    if (!a.away && contestFlight(sim)) return;
    return;
  }
  if (!car) return;
  // touchdown / end zone
  if (car.side === 'o') {
    if (car.x >= sim.goalX) { return finish(sim, { k: B.car === 'QB' ? 'run' : (sim.thrown ? 'pass' : 'run'), x: sim.goalX + 1, td: true, who: car.id, tgt: sim.byTarget }); }
    if (abs(car.y) > YB) { if (car.id === 'QB' && !sim.handoff && sim.thrown === 0 && car.x <= 0) return finish(sim, { k: 'inc', x: car.x, away: true }); return finishCarry(sim, car, 'oob'); }
  } else {
    if (car.x <= sim.backX) return finish(sim, { k: 'int', x: sim.intX, tdRet: true, retX: sim.backX, by: sim.intBy, who: car.id });
    if (abs(car.y) > YB) return finishCarry(sim, car, 'oob');
  }
  // tackle attempts
  const foes = sim.P.filter(q => q.side !== car.side && q.hold === 0);
  let near = 0; foes.forEach(q => { if (dist(q, car) < 2.4) near++; });
  for (let i = 0; i < foes.length; i++) {
    const q = foes[i];
    if (q.cool > 0 && q.dive === 0) continue;
    if (q.eng && (q.pairL == null || q.pairL > -0.3)) continue;
    const reach = (q.dive > 0 ? 1.55 : 0.95) * (q.eng ? 0.7 : 1);
    if (dist(q, car) > reach) continue;
    if (car.imm > 0 && !(car.id === 'QB')) continue;
    const isQB = car.id === 'QB' && !sim.handoff && sim.kind === 'pass' && sim.thrown === 0 && car.x <= 0.5;
    const evade = isQB ? 54 : car.rat * 0.85 + (car.s - 80) * 0.3;
    let pr = 0.46 + (q.rat - evade) * 0.008 + (near - 1) * 0.07 + (isQB ? 0.05 : 0) + (q.dive > 0 ? 0.08 : 0) - (q.eng ? 0.25 : 0);
    if (q.human && q.dive > 0) pr += 0.05;
    if (q.hit > 0) pr += 0.1;          // big hit
    if (car.spin > 0) pr -= 0.25;      // spin move
    pr = clamp(pr, 0.12, 0.93);
    q.cool = 6;
    if (R() < pr) return tackled(sim, car, q);
    car.stumble = 5; q.cool = 8; if (q.hit > 0) { q.hit = 0; q.stumble = 10; }   // a missed big hit leaves him stumbling
  }
}
function tackled(sim, car, q) {
  const R = sim.R, B = sim.ball;
  const isSack = car.side === 'o' && car.id === 'QB' && !sim.handoff && sim.kind === 'pass' && sim.thrown === 0 && car.x <= 0;   // past the line it is a run
  // the ball comes loose on some tackles (more on a sack, where the quarterback is holding it out): about half the time the offense falls on it
  const fumbleP = (PRO.fum + (q.rat - car.rat) * 0.00008 + (q.dive > 0 ? 0.012 : 0)) * (isSack ? PRO.fumSack : 1) * (q.hit > 0 ? 2 : 1);
  if (car.side === 'o' && sim.kind !== 'ret' && R() < clamp(fumbleP, 0.008, 0.2)) {
    if (R() < 0.5) return finish(sim, { k: 'fumble', x: car.x, who: car.id, by: q.id, sack: isSack, pass: !!sim.thrown, tgt: sim.byTarget });
    sim.fumKept = q.id;
  } else if (car.side === 'o' && sim.kind === 'ret' && R() < 0.007 + (q.rat - car.rat) * 0.00006 && R() < 0.5) return finish(sim, { k: 'fumble', x: car.x, who: car.id, by: q.id });
  if (car.side === 'o') {
    if (isSack) return finish(sim, { k: 'sack', x: car.x, by: q.id });
    if (car.x <= sim.backX) return finish(sim, { k: 'safety', x: car.x, who: car.id });
    return finish(sim, { k: sim.thrown ? 'pass' : 'run', x: car.x + 0.3, who: car.id, tgt: sim.byTarget, by: q.id });
  }
  return finish(sim, { k: 'int', x: sim.intX, retX: car.x - 0.3, by: sim.intBy, who: car.id, tackler: q.id });
}
function finishCarry(sim, car, why) {
  if (car.side === 'o') return finish(sim, { k: sim.thrown ? 'pass' : 'run', x: car.x, who: car.id, tgt: sim.byTarget, oob: true });
  return finish(sim, { k: 'int', x: sim.intX, retX: car.x, by: sim.intBy, who: car.id, oob: true });
}
function retOut(sim, o) {
  const r = { k: 'ret', x: Math.round(o.x * 10) / 10, t: sim.t, who: 'HB' };
  if (o.td) r.td = true;
  if (o.k === 'fumble') { r.fumble = true; r.by = o.by; }
  if (o.k === 'safety' || (!o.td && o.x <= sim.backX)) r.tb = true;
  if (o.oob) r.oob = true;
  if (o.fc) r.fc = true;
  if (o.by && !r.by) r.by = o.by;
  return r;
}
function finish(sim, out) { if (sim.kind === 'ret') out = retOut(sim, out); else if (sim.fumKept && !out.fum && out.k !== 'fumble' && out.k !== 'inc') out.fum = sim.fumKept; out.t = sim.t; sim.out = out; sim.ball.st = 'dead'; sim.ball.car = null; return out; }

// a defender whose hands are in the way of a throw gets a chance at it on the way to the receiver: he may pick it off or knock it down
function contestFlight(sim) {
  const B = sim.ball, a = B.air, R = sim.R;
  if (!a.tried) a.tried = {};
  if (a.lob && a.k < a.n * 0.8) return false;   // a lob is over everyone's head until it comes down
  const cl = [];
  for (let i = 0; i < sim.P.length; i++) {
    const p = sim.P[i];
    if (p.side !== 'd' || p.hold > 0 || p.grp === 'OL' || p.grp === 'QB' || a.tried[p.id]) continue;
    if (p.eng && p.grp === 'DL') continue;
    const reach = (p.grp === 'DL' ? 1.2 : 1.9) + (p.jump > 0 ? 1.1 : 0), hz = 3.3 + (p.jump > 0 ? 1.7 : 0);
    if (B.z > hz) continue;
    const dx = p.x - B.x, dy = p.y - B.y;
    if (dx * dx + dy * dy > reach * reach) continue;
    // the ones standing at the landing spot get their chance when the ball arrives
    const lx = p.x - a.ex, ly = p.y - a.ey;
    if (lx * lx + ly * ly <= (p.jump > 0 ? 3.0 : 2.4) * (p.jump > 0 ? 3.0 : 2.4)) continue;
    cl.push(p);
  }
  for (let i = 0; i < cl.length; i++) {
    const p = cl[i]; a.tried[p.id] = 1;
    const tg = sim.by[sim.byTarget], tr = tg ? tg.rat : 70;
    const base = p.grp === 'DL' ? PRO.flyDL : p.grp === 'LB' ? PRO.flyLB : PRO.flyDB;
    const pw = clamp(base + (p.rat - tr) * 0.004 + (p.jump > 0 ? 0.2 : 0) + (p.dive > 0 ? 0.05 : 0), 0.03, 0.7);
    if (R() >= pw) continue;
    const pick = (PRO.flyPick + (p.rat - 62) * 0.003) * (sim.pm.safe || 1) * (p.grp === 'DL' ? 0.3 : 1);
    if (R() < pick) {
      B.air = null; B.car = p.id; B.st = 'carried'; sim.intX = B.x; sim.intBy = p.id; sim.catchT = sim.t; sim.ctlId.d = p.id; sim.evt.push(['int', sim.t, p.id]);
      sim.D.forEach(q => { q.mode = 'ret'; });
      sim.pairs.length = 0; sim.O.forEach(o => { o.eng = null; if (o.hold) o.hold = 0; }); sim.D.forEach(d => { d.eng = null; });
      return true;
    }
    const x = B.x; B.air = null;
    finish(sim, { k: 'inc', x, tgt: sim.byTarget, pbu: p.id });
    return true;
  }
  return false;
}
function landBall(sim) {
  const B = sim.ball, a = B.air, R = sim.R;
  B.x = a.ex; B.y = a.ey; B.z = 0;
  if (a.away || abs(a.ey) > YB + 0.6) { B.air = null; return finish(sim, { k: 'inc', x: a.ex, tgt: sim.byTarget, away: !!a.away }); }
  // who is in range?
  const cands = [];
  sim.P.forEach(p => {
    if (p.hold > 0 || p.grp === 'OL' || p.grp === 'QB') return;
    const d = sqrt((p.x - a.ex) * (p.x - a.ex) + (p.y - a.ey) * (p.y - a.ey));
    const rr = p.side === 'o' ? 1.9 : (p.jump > 0 ? 3.0 : 2.4);
    if (d > rr) return;
    let sc;
    const prox = (1 - d / (rr + 0.4)) * 9;
    if (p.side === 'o') sc = 0.62 * p.rat + prox + (p.id === sim.byTarget ? 4 : 0) + gauss(R) * 6;
    else sc = 0.56 * p.rat * (p.grp === 'DL' ? 0.7 : p.grp === 'LB' ? 0.92 : 1) + prox + (p.jump > 0 ? 9 : 0) + PRO.ball + gauss(R) * 6;
    cands.push({ p, sc });
  });
  B.air = null;
  if (!cands.length) return finish(sim, { k: 'inc', x: a.ex, tgt: sim.byTarget });
  cands.sort((x, y) => y.sc - x.sc);
  const w = cands[0], marg = w.sc - (cands[1] ? cands[1].sc : w.sc - 8);
  if (w.p.side === 'o') {
    const drop = clamp(0.07 - (w.p.rat - 55) * 0.0018, 0.01, 0.12);
    if (marg < 5 && R() < drop) return finish(sim, { k: 'inc', x: a.ex, tgt: sim.byTarget, drop: true });
    B.car = w.p.id; B.st = 'carried'; sim.catchT = sim.t; sim.ctlId.o = w.p.id; sim.catchAt = w.p.x; w.p.seek = null; w.p.stumble = 3; w.p.imm = 4; sim.evt.push(['catch', sim.t, w.p.id]); autoSwitch(sim, w.p);
    return;
  }
  // defense won the ball
  if (marg > 4 && R() < (0.36 + (w.p.rat - 60) * 0.004) * (sim.pm.safe || 1)) {
    B.car = w.p.id; B.st = 'carried'; sim.intX = w.p.x; sim.intBy = w.p.id; sim.catchT = sim.t; sim.ctlId.d = w.p.id; sim.evt.push(['int', sim.t, w.p.id]);
    sim.D.forEach(p => { p.mode = 'ret'; });
    sim.pairs.length = 0; sim.O.forEach(o => { o.eng = null; if (o.hold) o.hold = 0; }); sim.D.forEach(d => { d.eng = null; });
    return;
  }
  return finish(sim, { k: 'inc', x: a.ex, tgt: sim.byTarget, pbu: w.p.id });
}
function timeout(sim) {
  const car = sim.ball.car ? sim.by[sim.ball.car] : null;
  if (sim.ball.st === 'air') return landBall(sim);
  if (!car) return finish(sim, { k: 'inc', x: 0 });
  if (car.side === 'o') {
    if (car.id === 'QB' && sim.thrown === 0 && sim.kind === 'pass') return finish(sim, { k: 'inc', x: car.x, away: true });
    return finish(sim, { k: sim.thrown ? 'pass' : 'run', x: car.x, who: car.id, tgt: sim.byTarget });
  }
  return finish(sim, { k: 'int', x: sim.intX, retX: car.x, by: sim.intBy, who: car.id });
}

/* ---------- running a whole play from traces (used for verification and for plays nobody watched live) ---------- */
// A trace is a list of integers, one per input change: tick * 100 + dir * 10 + code, dir = (dx + 1) * 3 + (dy + 1) (4 = stick centred),
// code 0 = none, 1..4 throw to WR1 / WR2 / TE / HB, 5 action, 6 switch defender, 9 hand control back to the computer.
// An event stamped T is applied on the step that makes the tick count T.
function enc(tick, dx, dy, code) { return tick * 100 + ((dx + 1) * 3 + (dy + 1)) * 10 + (code || 0); }
function dec(e) { const code = e % 10, dir = Math.floor(e / 10) % 10, tick = Math.floor(e / 100); return [tick, Math.floor(dir / 3) - 1, (dir % 3) - 1, code]; }
function cursor(trace) { return { ev: (trace || []).map(dec), i: 0, dx: 0, dy: 0 }; }
function feed(cur, tick) {
  const acts = [];
  while (cur.i < cur.ev.length && cur.ev[cur.i][0] <= tick) { const e = cur.ev[cur.i++]; cur.dx = e[1]; cur.dy = e[2]; if (e[3]) acts.push(e[3]); }
  return { dx: cur.dx, dy: cur.dy, acts };
}
// one tick with inputs taken from the cursors (the same code path runs on the clients and the server)
function advance(sim, co, cd) {
  const o = feed(co, sim.t + 1), d = feed(cd, sim.t + 1);
  step(sim, { dx: o.dx, dy: o.dy }, { dx: d.dx, dy: d.dy }, { o: o.acts, d: d.acts });
}
function run(ctx, trO, trD) {
  const sim = create(ctx), co = cursor(trO), cd = cursor(trD);
  while (!sim.out && sim.t < MAXT + 5) advance(sim, co, cd);
  return { out: sim.out, ticks: sim.t, sim };
}

const LIVE = { RETP, DT, MAXT, YB, TPS, PRO, create, step, run, advance, cursor, feed, enc, dec, ROUTES, predict };
E.LIVE = LIVE;
if (typeof module !== 'undefined' && module.exports) module.exports = LIVE; else root.LIVE = LIVE;
})(typeof window !== 'undefined' ? window : globalThis);
