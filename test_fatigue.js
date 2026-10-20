// Fatigue: players in a rotation tire on the field and recover off it; tired ones come out more and play a little worse.
const E = require('./lib/engine.js'), LG = require('./lib/league.js'), DR = require('./lib/draft.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 11 }), T = LG.teamsFor(L, 0, 1), sq = T.a.squad;
const st = Object.assign(E.initState(5), { poss: 'a', down: 1, toGo: 10 });
const hb = sq.rot.HB[0];
ok(E.energy(st, hb.i) === 1, 'everyone starts fresh');
// tired: drawn less, plays below his rating
const tired = Object.assign({}, st, { fat: { [hb.i]: 0.3 } });
const share = s => { let c = 0; for (let n = 0; n < 3000; n++) { if (E.personnel(sq, Object.assign({}, s, { playNo: n }), 'RUN_IN', 9, 'a').hb.i === hb.i) c++; } return c / 3000; };
const fresh = share(st), worn = share(tired);
ok(worn < fresh - 0.2, 'a tired back comes out more (' + Math.round(fresh * 100) + '% of snaps fresh, ' + Math.round(worn * 100) + '% at 30% energy)');
let seen = null; for (let n = 0; n < 200 && !seen; n++) { const ps = E.personnel(sq, Object.assign({}, tired, { playNo: n }), 'RUN_IN', 9, 'a'); if (ps.hb.i === hb.i) seen = ps.hb; }
ok(seen && seen.o === Math.round(hb.o - 0.7 * E.FAT_DROP) && seen.e === 30, 'and plays below his rating when he is in (' + hb.o + ' -> ' + seen.o + ')');
// over a game: energy drops on the field, comes back off it; the log says how fresh each one was
const R = E.replay(777, T, {}, ['a', 'b']), on = R.log.filter(e => e.on && e.off === 'a');
const en = on.map(e => e.on.HB[2]);
ok(Math.min(...en) < 85 && en.some(x => x === 100), 'backs tire over a drive and come back fresh (lowest ' + Math.min(...en) + '%)');
let drop = false;
for (let i = 1; i < on.length; i++) if (on[i].n === on[i - 1].n + 1 && on[i].on.HB[0] === on[i - 1].on.HB[0] && on[i].on.HB[2] < on[i - 1].on.HB[2]) drop = true;   // back-to-back plays
ok(drop, 'a back who stays on the field loses energy snap by snap');
ok(JSON.stringify(E.replay(777, T, {}, ['a', 'b']).log) === JSON.stringify(R.log), 'the same game replays exactly, fatigue included (what the league server checks)');
// rotation over a season: backups get more snaps than with nobody tiring
const L2 = LG.newNFL({ user: 0, seed: 11 }); L2.teams[0].owner = 'You';
LG.runUntilHuman(L2, 60); let g = 0; while (L2.phase !== 'offseason' && g++ < 60) { LG.simWeek(L2, false); LG.advanceWeek(L2); LG.checkFinal(L2); }
const hbs = LG.usageList(L2, 0, 'HB');
ok(LG.snapShare(L2, hbs[1].p) > 0.2, 'over a season the second back gets real work (' + Math.round(100 * LG.snapShare(L2, hbs[1].p)) + '% of snaps at 30% usage)');
// the quick game: no rotation, no fatigue
const d = DR.newDraft(2, 0, 0); while (!DR.isDone(d)) { const t = DR.onClock(d); DR.apply(d, t, DR.cpuPick(d, t)); }
const Q = { a: { name: 'A', squad: E.squadFromRoster(DR.toRoster(DR.teamIds(d, 0))) }, b: { name: 'B', squad: E.squadFromRoster(DR.toRoster(DR.teamIds(d, 1))) } }, QR = E.replay(31, Q, {}, ['a', 'b']);
ok(!Object.keys(QR.state.fat || {}).length && !QR.log.some(e => e.on), 'quick-game squads (no rotation) do not tire');
console.log('ALL DONE');
