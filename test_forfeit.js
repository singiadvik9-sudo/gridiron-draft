const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newCustom({ entry: 'nfl', divisions: false, games: 4, playoffs: 4, name: 'T' }, 'mgr');
for (let i = 0; i < 6; i++) LG.addTeam(L, { owner: i < 2 ? 'u' + i : null });
ok(!LG.startCustom(L), 'league starts');
// regular season: forfeit a game, sim the rest, week advances
const g = LG.weekGames(L)[0], loser = g.h;
ok(LG.forfeit(L, g, 999) === 'Pick one of the two teams.', 'rejects a team that is not in the game');
ok(LG.forfeit(L, g, loser) === null && g.done && g.ff === loser && g.sh === 0 && g.sa === 1, 'home forfeit is 0-1');
ok(LG.forfeit(L, g, loser) !== null, 'cannot forfeit a finished game twice');
const g2 = LG.weekGames(L)[0]; LG.forfeit(L, g2, g2.a);
ok(g2.sh === 1 && g2.sa === 0, 'away forfeit is 1-0 for home');
const R = LG.records(L);
ok(R[g.a].w >= 1 && R[loser].l >= 1, 'record counts the forfeit');
LG.simWeek(L, false); LG.advanceWeek(L);
ok(L.week === 2, 'week advances after the rest are simmed');
// finish the season, forfeiting one playoff game
let n = 0, ffPo = false;
while (L.phase !== 'offseason' && n++ < 60) {
  if (L.phase === 'playoffs' && !ffPo) { const pg = LG.weekGames(L)[0]; if (pg) { ok(LG.forfeit(L, pg, pg.a) === null, 'playoff forfeit accepted'); ffPo = true; } }
  LG.simWeek(L, false); LG.advanceWeek(L); LG.checkFinal(L);
}
ok(ffPo, 'reached playoffs');
ok(L.phase === 'offseason' && L.hist.length === 1 && L.hist[0].champ != null, 'season completes with a champion');
console.log('ALL DONE');
