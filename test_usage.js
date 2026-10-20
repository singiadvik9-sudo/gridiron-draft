// Usage: backs, receivers and tight ends rotate snap by snap by the coach's usage and the play; growth follows playing time.
const E = require('./lib/engine.js'), LG = require('./lib/league.js'), DR = require('./lib/draft.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ user: 0, seed: 11 }); L.teams[0].owner = 'You';
const sq = LG.squadOf(L, 0);
ok(sq.rot && sq.rot.WR.length >= 3 && sq.rot.WR.every(p => p.u > 0) && sq.rot.TE.length && sq.rot.HB.length, 'a franchise squad carries its rotation (' + sq.rot.HB.length + ' HB, ' + sq.rot.WR.length + ' WR, ' + sq.rot.TE.length + ' TE)');
const wrs = LG.usageList(L, 0, 'WR');
ok(wrs[0].u === 95 && wrs[1].u === 80 && wrs.reduce((t, x) => t + x.u, 0) === 200, 'by default the best receivers play most, sharing the two WR spots');
// the draw: the same snap gives the same personnel (screen and server agree), different snaps vary
const st = Object.assign(E.initState(77), { poss: 'a', down: 1, toGo: 10 });
const p1 = E.personnel(sq, st, 'PASS_M', 77, 'a'), p2 = E.personnel(sq, st, 'PASS_M', 77, 'a');
ok(p1.wr[0].i === p2.wr[0].i && p1.wr[1].i === p2.wr[1].i && p1.te.i === p2.te.i && p1.hb.i === p2.hb.i, 'one snap always draws the same players');
const tally = (pick, down, toGo) => { const c = {}; for (let n = 0; n < 4000; n++) { const s2 = Object.assign({}, st, { playNo: n, down, toGo }); const ps = E.personnel(sq, s2, pick, 77, 'a'); [ps.wr[0], ps.wr[1]].forEach(p => { c[p.n] = (c[p.n] || 0) + 1; }); c['TE:' + ps.te.n] = (c['TE:' + ps.te.n] || 0) + 1; } return c; };
const mid = tally('PASS_M', 1, 10), w0 = wrs[0].p.n, w2 = wrs[2].p.n;
ok(Math.abs(mid[w0] / 4000 - 0.95) < 0.08 && mid[w2] / 4000 < 0.35, 'usage is the share of snaps: ' + w0 + ' ' + Math.round(mid[w0] / 40) + '%, ' + w2 + ' ' + Math.round(mid[w2] / 40) + '%');
// fit: the fastest of two equal-usage receivers plays more on deep shots than on quick passes
const two = Object.assign({}, sq, { rot: Object.assign({}, sq.rot, { WR: [{ i: 'f', n: 'Fast', o: 75, s: 97, u: 50 }, { i: 'r', n: 'Route', o: 88, s: 82, u: 50 }, { i: 'x', n: 'X', o: 80, s: 88, u: 100 }] }) });
const cnt = pick => { let f = 0; for (let n = 0; n < 4000; n++) { const ps = E.personnel(two, Object.assign({}, st, { playNo: n }), pick, 5, 'a'); if (ps.wr.some(p => p.n === 'Fast')) f++; } return f / 4000; };
ok(cnt('PASS_D') > cnt('PASS_S') + 0.1, 'deep shots bring in the fast receiver more (deep ' + Math.round(cnt('PASS_D') * 100) + '%, quick ' + Math.round(cnt('PASS_S') * 100) + '%)');
const pd = tally('PASS_M', 3, 9), r1 = tally('RUN_IN', 1, 2), slot = n => Object.keys(n).filter(k => k.indexOf('TE:') === 0 && LG.rosterOf(L, 0).some(p => p.p === 'WR' && 'TE:' + p.n === k)).reduce((t, k) => t + n[k], 0);
ok(slot(pd) > slot(r1), 'on passing downs a receiver plays the slot (TE spot) more than on short-yardage runs (' + slot(pd) + ' vs ' + slot(r1) + ' of 4000)');
ok(E.personnel(sq, st, 'PUNT', 77, 'a') === sq && E.personnel(Object.assign({}, sq, { rot: undefined }), st, 'PASS_M', 77, 'a').rot === undefined, 'kicks, and squads without a rotation (the quick game), keep their five');
// the coach changes usage
const third = wrs[2].p, second = wrs[1].p;
ok(LG.setUsage(L, 0, third.i, 85) === null && LG.setUsage(L, 0, second.i, 15) === null, 'the coach can change usage');
ok(LG.setUsage(L, 0, LG.rosterOf(L, 0).find(p => p.p === 'QB').i, 50) !== null && LG.setUsage(L, 0, third.i, 140) !== null, 'only for backs, receivers and tight ends, from 0 to 100');
LG.runUntilHuman(L, 60); let g = 0; while (L.phase !== 'offseason' && g++ < 60) { LG.simWeek(L, false); LG.advanceWeek(L); LG.checkFinal(L); }
ok(LG.snapShare(L, third) > LG.snapShare(L, second) + 0.3, 'over a season the snaps follow (' + third.n + ' ' + Math.round(100 * LG.snapShare(L, third)) + '%, ' + second.n + ' ' + Math.round(100 * LG.snapShare(L, second)) + '%)');
ok((L.stats[third.i] || {}).rec > (L.stats[second.i] || {}).rec, 'and so do the catches (' + ((L.stats[third.i] || {}).rec || 0) + ' vs ' + ((L.stats[second.i] || {}).rec || 0) + ')');
// a game is the same on replay (what the league server checks), stats go to whoever played
const T = LG.teamsFor(L, 1, 2);
const A1 = E.replay(4242, T, {}, ['a', 'b']), A2 = E.replay(4242, T, {}, ['a', 'b']);
ok(JSON.stringify(A1.log) === JSON.stringify(A2.log) && A1.log.some(e => e.on), 'a game replays exactly, with who was on the field in its log');
const names = new Set(); A1.log.filter(e => e.off === 'a' && e.on).forEach(e => { names.add(e.on.WR1[1]); names.add(e.on.WR2[1]); });
ok(names.size >= 3, 'more than two receivers line up over a game (' + names.size + ')');
const box = E.boxScore(A1.log, T), recv = box.lead.a.receiving, caught = {};
A1.log.filter(e => e.off === 'a' && e.anim === 'pass' && e.recId && e.on).forEach(e => { const n = e.on[e.recId][1]; caught[n] = (caught[n] || 0) + (e.yards || 0); });
ok(recv.length && recv.every(r => caught[r.name] === r.recyd), 'the box score credits the receivers who actually caught the passes (' + recv.map(r => r.name + ' ' + r.recyd).join(', ') + ')');
// playing time and growth: young players who play grow more than those who sit
const Q = LG.newNFL({ seed: 21 }), young = Object.values(Q.players).filter(p => p.t >= 0 && p.a <= 23 && p.o < 75 && p.p !== 'K' && p.p !== 'P');
Q.snaps = {}; Q.tsnaps = { 0: { o: 600, d: 600 }, 1: { o: 600, d: 600 } };
young.forEach((p, k) => { if (k % 2) Q.snaps[p.i] = 600; });
const before = {}; young.forEach(p => { before[p.i] = p.o; });
LG.progress(Q);
const avg = f => { const v = young.filter(f).map(p => p.o - before[p.i]); return v.reduce((t, x) => t + x, 0) / v.length; };
const played = avg((p, k) => young.indexOf(p) % 2 === 1), sat = avg((p, k) => young.indexOf(p) % 2 === 0);
ok(played > sat + 0.8, 'young players who played grew more (+' + played.toFixed(1) + ' vs +' + sat.toFixed(1) + ' for those who sat)');
ok(Object.keys(Q.snaps).length === 0, 'snaps start again from zero after the offseason');
console.log('ALL DONE');
