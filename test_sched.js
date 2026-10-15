// Schedules after the first year follow last season's division standings; the user's players get game-by-game and career stats.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ user: 0, seed: 11 }); L.teams[0].owner = 'You'; LG.runUntilHuman(L, 60);
// play out season one: the user's games are simmed too (they get stat lines because the team has an owner)
let g = 0; while (L.phase !== 'offseason' && g++ < 60) { LG.simWeek(L, false); LG.advanceWeek(L); LG.checkFinal(L); }
ok(L.phase === 'offseason', 'season one is over');
const log = LG.gameLog(L, 0);
ok(log.length === 17, 'one stat line per game for the user\'s team (' + log.length + ')');
const wk = LG.teamStats(L, 0, 'g:' + log[0].id), tot = LG.teamStats(L, 0, 'season');
const sum = k => tot.reduce((t, x) => t + (x.s[k] || 0), 0), wsum = k => log.reduce((t, gm) => t + Object.values(gm.ps[0]).reduce((u, s) => u + (s[k] || 0), 0), 0);
ok(wk.length > 0, 'a single week lists players with stats (' + wk.length + ')');
ok(['att', 'ryd', 'pa', 'pc', 'pyd', 'rec', 'recyd'].every(k => sum(k) === wsum(k)), 'weekly lines add up to the season totals (rush yds ' + sum('ryd') + ', pass yds ' + sum('pyd') + ')');
ok(!L.sched.some(x => x.ps && x.h !== 0 && x.a !== 0 && !x.ps[x.h] && !x.ps[x.a]) , 'other games store no per-game lines');
const others = L.sched.filter(x => x.done && x.h !== 0 && x.a !== 0 && x.ps).length;
ok(others === 0, 'only games with a person\'s team keep per-game lines (' + others + ')');
const ranks = LG.divisionRanks(L);
ok(Object.keys(ranks).length === 32 && [0, 1, 2, 3].every(r => Object.values(ranks).filter(x => x === r).length === 8), 'every division has a first to fourth place');
const before = { pyd: sum('pyd'), ryd: sum('ryd') };
// any team's season totals can be looked up (the Stats tab team picker), and they match the league totals
const cpu = LG.teamStats(L, 5, 'season'), ids = new Set(LG.rosterOf(L, 5).map(p => p.i));
ok(cpu.length > 0 && cpu.every(r => ids.has(r.p.i) && r.s === L.stats[r.p.i]), 'a CPU team lists its own players with their season totals (' + cpu.length + ')');
LG.offseasonBegin(L, 7); let n = 0; while (L.phase === 'draft' && n++ < 2000) { const t = LG.onClock(L); LG.draftPick(L, t, LG.cpuPickFor(L, t, L.draft.pool)); }
LG.startSeason(L);
ok(L.season === 2027 && L.sched.length === 272, 'season two has 272 games');
const per = {}; L.sched.forEach(x => { per[x.a] = (per[x.a] || 0) + 1; per[x.h] = (per[x.h] || 0) + 1; });
ok(L.teams.every(t => per[t.id] === 17), 'every team plays 17');
// division games are spread through the season, not bunched at the start
const divWeeks = tid => L.sched.filter(x => (x.h === tid || x.a === tid) && L.teams[x.h].div === L.teams[x.a].div).map(x => x.w).sort((p, q) => p - q);
ok(L.teams.every(t => { const w = L.sched.filter(x => x.h === t.id || x.a === t.id).map(x => x.w); return new Set(w).size === w.length; }), 'nobody plays twice in a week');
ok(L.teams.every(t => divWeeks(t.id).length === 6 && divWeeks(t.id).every((w, i, a) => i === 0 || w - a[i - 1] >= 2)), 'division games are never in back-to-back weeks (' + divWeeks(0).join(',') + ')');
ok(L.teams.every(t => divWeeks(t.id).join() !== '1,2,3,4,5,6' && divWeeks(t.id)[5] - divWeeks(t.id)[0] >= 8), 'division games are spread across the season');
// the two same-rank games and the 17th game match teams that finished in the same place last year
const same = {}; L.sched.forEach(x => { if (L.teams[x.a].div !== L.teams[x.h].div && ranks[x.a] === ranks[x.h]) { same[x.a] = (same[x.a] || 0) + 1; same[x.h] = (same[x.h] || 0) + 1; } });
ok(L.teams.every(t => same[t.id] === 5), 'every team plays 5 non-division opponents who finished in the same spot (' + [...new Set(L.teams.map(t => same[t.id]))] + ')');
// career: last season is kept for the user's players, this season adds to it
const car = LG.teamStats(L, 0, 'career');
ok(car.length > 0 && car.reduce((t, x) => t + (x.s.pyd || 0), 0) === before.pyd, 'career shows last season\'s totals (' + before.pyd + ' pass yds)');
ok(LG.teamStats(L, 0, 'y:2026').reduce((t, x) => t + (x.s.ryd || 0), 0) === before.ryd, 'a past season can be looked up');
ok(LG.teamStats(L, 0, 'y:2026').every(x => (x.p.ss || []).some(e => e.y === 2026 && e.t === 0)), 'a past season only lists players who were on that team');
ok(LG.teamStats(L, 0, 'season').length === 0, 'the new season starts with empty totals');
console.log('ALL DONE');
