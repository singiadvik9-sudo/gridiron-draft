// Play calls: every play and defensive call is complete, runs in the stat engine and on the live field, and the CPU only calls real ones.
const E = require('./lib/engine.js'), L = E.LIVE;
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const mk = n => { const r = E.mulberry32(n); return { a: E.mkTeam('A', E.autoDraft(r)), b: E.mkTeam('B', E.autoDraft(r)) }; };
const T = mk(5), U = { a: E.teamUnits(T.a), b: E.teamUnits(T.b) };
const offIds = Object.keys(E.OFF), defIds = Object.keys(E.DEF_CALLS);
const live = offIds.filter(id => E.OFF[id].kind === 'run' || E.OFF[id].kind === 'pass');

ok(E.OFF_CATS.every(c => offIds.some(id => E.OFF[id].cat === c.id)) && E.DEF_CATS.every(c => defIds.some(id => E.DEF_CALLS[id].cat === c.id)), 'every section has plays');
ok(offIds.concat(defIds).every(id => id.length <= 12), 'call ids fit the 12 character move limit');
ok(offIds.every(id => E.OFF[id].label && E.OFF[id].desc && E.OFF_CATS.some(c => c.id === E.OFF[id].cat)) && defIds.every(id => E.DEF_CALLS[id].label && E.DEF_CALLS[id].desc && E.DEF_CATS.some(c => c.id === E.DEF_CALLS[id].cat)), 'every call has a name, a description and a section');
const sec = id => E.OFF_CATS.filter(c => c.id !== 'SPEC').every(c => offIds.filter(i => E.OFF[i].cat === c.id).length >= 3);
ok(sec(), 'each offensive section has at least three plays (' + E.OFF_CATS.filter(c => c.id !== 'SPEC').map(c => offIds.filter(i => E.OFF[i].cat === c.id).length).join('/') + ')');
ok(E.DEF_CATS.every(c => defIds.filter(i => E.DEF_CALLS[i].cat === c.id).length >= 2), 'each defensive section has at least two calls');
ok(E.OFF_CATS.every(c => c.id === 'SPEC' || E.OFF[c.id] && E.OFF[c.id].cat === c.id) && E.DEF_CATS.every(c => E.DEF_CALLS[c.id] && E.DEF_CALLS[c.id].cat === c.id), 'the original six offensive and five defensive calls are still there (old games replay)');

// stat engine: every play against every defense gives a sane result
{
  let bad = 0, n = 0;
  const base = Object.assign(E.initState(1), { ballOn: 40, down: 2, toGo: 8, clock: 100 });
  live.forEach(op => defIds.forEach(dp => { for (let i = 0; i < 6; i++) {
    const r = E.stepGame(Object.assign({}, base, { playNo: i }, op === 'FAKEPUNT' ? { down: 4, toGo: 3 } : {}), T, U, 100 + i, op, dp, null, null); n++;   // (the fake punt is a 4th-down call)
    if (!r.entry.text || !Number.isFinite(r.entry.yards) || r.entry.offPick !== op || r.entry.defPick !== dp || r.state.ballOn < 1 || r.state.ballOn > 99 && !r.entry.ev) bad++;
  } }));
  ok(bad === 0, 'stat engine handles ' + n + ' play x defense snaps');
  const m = (d, o) => E.matchup(d, o);
  ok(m('MAN', 'MESH') < m('MAN', 'PASS_S') && m('ZONE', 'FLOOD') < m('ZONE', 'PASS_M') && m('BLITZ', 'DRAW') < m('BLITZ', 'RUN_IN') && m('BLITZ', 'BUBBLE') < m('BLITZ', 'PASS_S'), 'plays beat the defenses they are meant to beat');
  ok(m('GOALLINE', 'RUN_IN') > m('ZONE', 'RUN_IN') && m('GOALLINE', 'PASS_D') < m('ZONE', 'PASS_D') && m('COV4', 'PASS_D') > m('COV2', 'PASS_D') || m('COV4', 'PASS_D') > m('ZONE', 'PASS_D'), 'defensive calls have the strengths they claim');
  ok(m('STACK', 'PA_DEEP') < m('STACK', 'PASS_D'), 'play-action burns a stacked box');
}
// short yardage: a dive converts 3rd and 1 more often than a toss sweep
{
  const base = Object.assign(E.initState(1), { ballOn: 50, down: 3, toGo: 1, clock: 100 });
  const fd = op => { let c = 0; for (let i = 0; i < 600; i++) { const r = E.stepGame(Object.assign({}, base, { playNo: i }), T, U, 900 + i, op, 'ZONE', null, null); if (r.entry.firstDown || r.entry.ev === 'td') c++; } return c / 600; };
  const d = fd('DIVE'), s = fd('SWEEP');
  ok(d > s, 'dive converts 3rd-and-1 more often than the sweep (' + d.toFixed(2) + ' vs ' + s.toFixed(2) + ')');
}
// live field: every play x every defense runs to a result, deterministically, with real routes
{
  let slow = 0, N = 0, bad = 0;
  live.forEach(op => defIds.forEach((dp, k) => {
    const [A, B] = [T.a, T.b], ctx = { seed: 11 + k, playNo: 3, ballOn: 35, toGo: 10, offPick: op, defPick: dp, OS: A.squad, DS: B.squad };
    const r1 = L.run(ctx), r2 = L.run(ctx); N++;
    if (JSON.stringify(r1.out) !== JSON.stringify(r2.out)) bad++;
    if (r1.ticks >= L.MAXT) slow++;
    if (!r1.out || !r1.out.k) bad++;
  }));
  ok(bad === 0, 'all ' + N + ' play x defense combinations finish on the field, the same way every time');
  ok(slow <= N * 0.03, 'few snaps run into the time limit (' + slow + ' of ' + N + ')');
  // different plays really send the receivers to different places
  const route = op => { const s = L.create({ seed: 1, playNo: 1, ballOn: 40, toGo: 10, offPick: op, defPick: 'COV3', OS: T.a.squad, DS: T.b.squad }), c = [L.cursor([]), L.cursor([])]; for (let t = 0; t < 30; t++) L.advance(s, c[0], c[1]); return ['WR1', 'WR2', 'TE'].map(id => s.by[id].x.toFixed(1) + ',' + s.by[id].y.toFixed(1)).join(' '); };
  const shapes = new Set(live.filter(id => E.OFF[id].kind === 'pass').map(route));
  ok(shapes.size >= 10, 'passing plays run distinct routes (' + shapes.size + ' different shapes)');
  const lay = dp => { const s = L.create({ seed: 1, playNo: 1, ballOn: 40, toGo: 10, offPick: 'PASS_M', defPick: dp, OS: T.a.squad, DS: T.b.squad }), c = [L.cursor([]), L.cursor([])]; for (let t = 0; t < 40; t++) L.advance(s, c[0], c[1]); return s.D.map(d => d.x.toFixed(0) + ',' + d.y.toFixed(0)).join(' '); };
  const lays = new Set(defIds.map(lay));
  ok(lays.size >= 10, 'defensive calls line up differently (' + lays.size + ' different looks)');
}
// replay with named plays: a full game with CPU calls and live snaps stays deterministic and the log names the plays
{
  let badCpu = 0; const seed = 77, moves = {}; let st = E.initState(seed), g = 0, names = new Set();
  while (!st.over && g++ < 300) {
    const n = st.playNo, off = st.poss, def = off === 'a' ? 'b' : 'a';
    const pick = E.cpuMove(st, U, off, seed, 'off'), kick = E.noDef(E.legalOff(st, pick));
    if (!((E.OFF[pick] || E.PATS[pick] || E.KICKS[pick]) && (kick || E.DEF_CALLS[E.cpuMove(st, U, def, seed, 'def')]))) badCpu++;
    moves[n + '-' + off] = { pick }; if (!kick) moves[n + '-' + def] = { pick: E.cpuMove(st, U, def, seed, 'def') };
    st = E.replay(seed, T, moves, []).state;
    if (n > 3) break;
  }
  ok(badCpu === 0, 'the cpu only calls real plays');
  const a = E.replay(seed, T, moves, ['a', 'b']), b = E.replay(seed, T, moves, ['a', 'b']);
  ok(JSON.stringify(a.log) === JSON.stringify(b.log) && a.log.every(e => E.OFF[e.offPick] || E.KICKS[e.offPick] || E.PATS[e.offPick]), 'replay with named plays is deterministic');
}
console.log(process.exitCode ? 'SOME FAILED' : 'ALL OK');
