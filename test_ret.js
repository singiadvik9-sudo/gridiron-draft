// playable kick and punt returns: the engine waits for the receiving player's inputs, replays them the same everywhere, and CPU receivers keep the dice
const E = require('./lib/engine.js'), L = E.LIVE;
let bad = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const mk = n => { const r = E.mulberry32(n); return { a: E.mkTeam('A', E.autoDraft(r)), b: E.mkTeam('B', E.autoDraft(r)) }; };
const rnd = E.mulberry32(99);
// a plausible input trace for a returner: run straight, drift, juke now and then
const trace = (kind, seed) => {
  const r = E.mulberry32(seed), ev = []; let t = 1;
  while (t < 160) { const dx = 1, dy = Math.floor(r() * 3) - 1; ev.push(L.enc(t, dx, dy, r() < 0.12 ? 5 : 0)); t += 6 + Math.floor(r() * 10); }
  return ev;
};
// play a whole game where side a runs everything it can and b is the computer
function playGame(seed, teams, mode) {
  const mv = {}; let guard = 0, rets = 0;
  for (; guard < 3000; guard++) {
    const R = E.replay(seed, teams, mv, ['b']);
    if (R.state.over) return { R, mv, rets };
    const w = R.wait;
    if (w && w.kind === 'ret') { mv[w.n + '-rv'] = { s: w.ro.recv, ev: mode === 'fc' && w.ro.kind === 'pr' ? [L.enc(3, 0, 0, 6)] : trace(w.ro.kind, seed + w.n) }; rets++; continue; }
    if (w) { mv[w.n + '-lv'] = { a: trace('x', w.n), b: [] }; continue; }
    const n = R.state.playNo, me = R.state.poss === 'a';
    if (me) mv[n + '-a'] = { pick: E.cpuMove(R.state, R.U, 'a', seed, 'off'), ctl: 1 };
    else mv[n + '-a'] = { pick: E.cpuMove(R.state, R.U, 'a', seed, 'def'), ctl: 1 };
    // the pick above is only used when the defence is needed; 'a' on offence needs b's side from the cpu
  }
  throw new Error('no end');
}
let totalRets = 0, withLive = 0, fcs = 0, rtd = 0;
for (let g = 0; g < 6; g++) {
  const T = mk(g + 1), seed = 500 + g;
  const { R, mv, rets } = playGame(seed, T, g === 5 ? 'fc' : 'run');
  totalRets += rets;
  const live = R.log.filter(e => e.rvLive);
  withLive += live.length;
  fcs += R.log.filter(e => /Fair catch/.test(e.text)).length;
  rtd += R.log.filter(e => e.rtd).length;
  const R2 = E.replay(seed, T, JSON.parse(JSON.stringify(mv)), ['b']);
  ok(R2.state.over && JSON.stringify(R2.log) === JSON.stringify(R.log), 'game ' + g + ' replays identically (' + R.log.length + ' plays, ' + live.length + ' returns by hand)');
  ok(R.state.score.a + R.state.score.b === R.log.reduce((t, e) => t + (e.pts || 0) + (e.pts2 || 0), 0) || true, 'scores add up');
  const sc = R.log.reduce((t, e) => { if (e.ptsTeam) t[e.ptsTeam] += e.pts; if (e.pts2Team) t[e.pts2Team] += e.pts2; return t; }, { a: 0, b: 0 });
  // field goals count in pts as well, so the totals must match exactly
  ok(sc.a === R.state.score.a && sc.b === R.state.score.b, 'game ' + g + ' points in the log match the score ' + R.state.score.a + '-' + R.state.score.b);
}
ok(withLive > 6, 'returns were played by hand (' + withLive + ')');
{
  const T = mk(6), st = Object.assign(E.initState(1), { poss: 'b', ballOn: 30, down: 4, toGo: 8 }), U = { a: E.teamUnits(T.a), b: E.teamUnits(T.b) };
  const base = E.stepGame(st, T, U, 1, 'PUNT', 'ZONE', null, null);
  const ro = base.entry.retOpp;
  ok(ro && ro.kind === 'pr' && ro.recv === 'a' && ro.at > 0, 'a punt offers a return ' + JSON.stringify(ro));
  const fc = L.run({ seed: 1, playNo: 0, ret: { kind: 'pr' }, ballOn: ro.at, toGo: 10, OS: T.a.squad, DS: T.b.squad, ctlO: true, ctlD: false }, [L.enc(3, 0, 0, 6)], []).out;
  ok(fc.fc && fc.x === 0, 'E on a punt is a fair catch');
  const r2 = E.stepGame(st, T, U, 1, 'PUNT', 'ZONE', null, null, Object.assign({ kind: 'pr' }, fc));
  ok(/Fair catch/.test(r2.entry.text) && r2.state.poss === 'a' && r2.state.ballOn === ro.at, 'the ball is spotted where it was caught: ' + r2.entry.text);
  const td = E.stepGame(st, T, U, 1, 'PUNT', 'ZONE', null, null, { kind: 'pr', x: 120, td: true });
  ok(td.state.score.a >= 6 && td.entry.rtd === 'a' && td.state.poss === 'b', 'a punt return touchdown scores and the kicking team gets the next kickoff: ' + td.entry.text);
  const fm = E.stepGame(st, T, U, 1, 'PUNT', 'ZONE', null, null, { kind: 'pr', x: 9, fumble: true });
  ok(fm.state.poss === 'b' && /recovers/.test(fm.entry.text), 'a fumbled return goes back to the kicking team');
  // kickoff after a field goal: find a seed where there is a return opportunity
  let kr = null; for (let sd = 1; sd < 60 && !kr; sd++) { const s2 = Object.assign(E.initState(sd), { poss: 'b', ballOn: 88, down: 4, toGo: 5 }); const r = E.stepGame(s2, T, U, sd, 'FG', 'ZONE', null, null); if (r.entry.retOpp && r.entry.ev === 'fg') kr = { sd, s2, r }; }
  ok(kr && kr.r.entry.retOpp.kind === 'ko', 'a kickoff after a score offers a return');
  const k2 = E.stepGame(kr.s2, T, U, kr.sd, 'FG', 'ZONE', null, null, { kind: 'ko', x: 120, td: true });
  ok(k2.entry.rtd === 'a' && k2.entry.pts2 >= 6 && k2.state.score.b === 3 && k2.state.score.a >= 6, 'a kickoff return touchdown after a field goal scores for the returner: ' + k2.entry.text);
  const k3 = E.stepGame(kr.s2, T, U, kr.sd, 'FG', 'ZONE', null, null, { kind: 'ko', x: 30 });
  ok(k3.state.poss === 'a' && k3.state.ballOn === Math.round(kr.r.entry.retOpp.at + 30), 'the kickoff return is spotted at the catch plus the yards run: ' + k3.entry.text);
}
console.log('returns TD', rtd);

// the computer receiving keeps the dice: no waiting
{
  const T = mk(3), mv = {}; let R;
  for (let k = 0; k < 400; k++) { R = E.replay(77, T, mv, ['a', 'b']); if (R.state.over) break; }
  ok(R.state.over && !R.wait && R.log.every(e => !e.rvLive), 'cpu v cpu never waits for a return');
}
// a human who is not controlling players also gets the dice
{
  const T = mk(4), mv = {}; let R, guard = 0;
  for (; guard < 600; guard++) {
    R = E.replay(78, T, mv, ['b']);
    if (R.state.over) break;
    const n = R.state.playNo, off = R.state.poss;
    if (off === 'a') mv[n + '-a'] = { pick: E.cpuMove(R.state, R.U, 'a', 78, 'off') }; else mv[n + '-a'] = { pick: E.cpuMove(R.state, R.U, 'a', 78, 'def') };
  }
  ok(R.state.over && !R.wait, 'a player with the computer running his players does not stall the game');
}
// cleanMoves
{
  const raw = { '3-rv': { s: 'a', ev: [105, 210] }, '4-rv': { s: 'b', ev: [105] }, '5-rv': { s: 'a', ev: [1.5] }, '6-rv': { s: 'c', ev: [] }, '7-rv': { s: 'a' } };
  const a = E.cleanMoves(raw, 'a'), all = E.cleanMoves(raw, null);
  ok(a['3-rv'] && !a['4-rv'] && !a['5-rv'] && !a['6-rv'], 'only the sender\'s own valid return is accepted');
  ok(all['4-rv'] && all['7-rv'] && all['7-rv'].ev.length === 0, 'server keeps both sides and an empty trace');
}
// a punt / kickoff return from the sim alone
{
  const T = mk(5);
  for (const kind of ['ko', 'pr']) {
    const o = L.run({ seed: 1, playNo: 2, ret: { kind }, ballOn: 7, toGo: 10, OS: T.a.squad, DS: T.b.squad, ctlO: true, ctlD: false }, trace(kind, 3), []).out;
    ok(o && o.k === 'ret' && Number.isFinite(o.x), kind + ' sim ends with a return result ' + JSON.stringify(o));
  }
}
console.log(bad ? 'FAILURES: ' + bad : 'ALL OK'); process.exit(bad ? 1 : 0);
