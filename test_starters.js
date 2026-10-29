// Coach-named starters: put anyone in the lineup (a rookie to develop him); he plays the snaps and grows with them.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ user: 0, seed: 11 }); L.teams[0].owner = 'You';
const qbs = LG.rosterOf(L, 0).filter(p => p.p === 'QB').sort((a, b) => b.o - a.o), backup = qbs[qbs.length - 1];
ok(LG.lineup(L, 0).QB[0] === qbs[0], 'by default the best quarterback starts (' + qbs[0].n + ' ' + qbs[0].o + ')');
ok(LG.setStarter(L, 0, backup.i, true) === null && LG.lineup(L, 0).QB[0] === backup && LG.squadOf(L, 0).qb.n === backup.n, 'the coach can start another (' + backup.n + ' ' + backup.o + '), and he plays');
const ol = LG.rosterOf(L, 0).filter(p => p.p === 'OL').sort((a, b) => a.o - b.o), worst = ol[0];
LG.setStarter(L, 0, worst.i, true);
ok(LG.lineup(L, 0).OL.indexOf(worst) >= 0 && LG.lineup(L, 0).OL.length === 5 && LG.squadOf(L, 0).ol.p.some(q => q[0] === worst.n), 'any position: the weakest lineman joins the starting five');
ok(LG.setStarter(L, 0, qbs[0].i, true) === null && !backup.st && LG.lineup(L, 0).QB[0] === qbs[0], 'naming one more starter than the spot has sends the other named one back to the bench');
const wrs = LG.rosterOf(L, 0).filter(p => p.p === 'WR').sort((a, b) => a.o - b.o), w = wrs[0];
LG.setStarter(L, 0, w.i, true);
ok(LG.usageList(L, 0, 'WR')[0].p === w && LG.usageList(L, 0, 'WR')[0].u === 95, 'a receiver named starter gets the starter\'s usage by default (' + w.n + ')');
ok(LG.setStarter(L, 0, w.i, false) === null && !w.st && LG.usageList(L, 0, 'WR')[0].p !== w, 'and can be benched again');
const hurt = LG.rosterOf(L, 0).find(p => p.p === 'TE'); hurt.inj = 2;
ok(LG.setStarter(L, 0, hurt.i, true) !== null, 'an injured player cannot be named a starter');
delete hurt.inj;
// a rookie who starts plays the snaps and grows more than one who sits
const R = LG.newNFL({ user: 0, seed: 21 }); R.teams[0].owner = 'You';
const rook = (pos, o) => { const p = Object.values(R.players).find(x => x.t === -1); Object.assign(p, { p: pos, o, pt: 90, a: 21, t: 0 }); delete p.sal; return p; };
const r1 = rook('QB', 64), r2 = rook('QB', 64);
LG.setStarter(R, 0, r1.i, true);
LG.runUntilHuman(R, 60); let g = 0; while (R.phase !== 'offseason' && g++ < 60) { LG.simWeek(R, false); LG.advanceWeek(R); LG.checkFinal(R); }
const s1 = LG.snapShare(R, r1), s2 = LG.snapShare(R, r2);
ok(s1 > 0.6 && s2 < 0.05, 'the rookie you start plays most of the snaps (' + Math.round(s1 * 100) + '% vs ' + Math.round(s2 * 100) + '% for the one on the bench)');
const o1 = r1.o, o2 = r2.o; LG.progress(R);
ok(r1.o - o1 >= r2.o - o2, 'and grows at least as much over the offseason (+' + (r1.o - o1) + ' vs +' + (r2.o - o2) + ')');
// trades and releases: the new team decides
const T = LG.newNFL({ user: 0, seed: 4 }); T.teams[0].owner = 'You';
const st = LG.rosterOf(T, 0).find(p => p.p === 'WR'); LG.setStarter(T, 0, st.i, true);
LG.doTrade(T, 0, 5, [st.i], [LG.rosterOf(T, 5).find(p => p.p === 'WR').i]);
ok(!st.st, 'a traded starter is not a named starter on his new team');
ok(!Object.values(LG.newNFL({ seed: 2 }).players).some(p => p.st), 'CPU teams keep starting their best');
console.log('ALL DONE');
