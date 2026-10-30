// Campaign: retirements are announced and remembered, retired players keep their stats, and your team can send them to its Hall of Fame.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 9, user: 0 }); L.teams[0].owner = 'You';
let mine = [], rep = null;
for (let y = 0; y < 4 && !mine.length; y++) {
  let g = 0; while (L.phase !== 'offseason' && g++ < 200) { LG.simWeek(L, false); LG.advanceWeek(L); LG.checkFinal(L); }
  rep = LG.offseasonBegin(L, 7); mine = rep.retired.map(i => L.players[i]).filter(p => p.lt === 0);
  if (!mine.length) { while (L.phase === 'draft') { const on = LG.onClock(L); LG.draftPick(L, on, L.draft.pool[0]); } LG.startSeason(L); }
}
const p = mine[0];
ok(!!p && p.t === -2 && p.lt === 0 && p.ry === L.season && p.peak >= p.o, 'a retired player remembers the team he retired from, the season and his peak (' + (p && p.n) + ', peak ' + (p && p.peak) + ')');
ok(L.news.some(n => n.t.indexOf('Retired: ' + p.n) === 0), 'and the league news says so');
const ps = LG.playerStats(L, p.i); ok(ps && ps.seasons.length > 0 && Object.keys(ps.career).length > 0, 'his stats stay: ' + ps.seasons.length + ' season(s), career ' + JSON.stringify(ps.career));
ok(LG.induct(L, 1, p.i) && LG.induct(L, 0, (Object.values(L.players).find(x => x.t === 0) || {}).i), 'only your own retired players can go in');
ok(LG.induct(L, 0, p.i) === null && L.hof.length === 1 && L.hof[0].n === p.n && LG.induct(L, 0, p.i), 'into the Hall of Fame he goes (once)');
delete L.players[p.i]; const h = LG.playerStats(L, p.i); ok(h && JSON.stringify(h.career) === JSON.stringify(L.hof[0].s), 'the Hall of Fame keeps his career line even if the player record is gone');
