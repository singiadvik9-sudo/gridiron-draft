// Real 53-man rosters: every team is its roster plus its injured-reserve list, cut down to the best 53 (build_rosters.py).
const LG = require('./lib/league.js'), DR = require('./lib/draft.js'), D = require('./lib/data.json');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 7 }), T = abbr => L.teams.find(t => t.abbr === abbr).id;
const sizes = L.teams.map(t => LG.rosterOf(L, t.id).length);
ok(sizes.every(n => n === 53), 'every campaign team starts with exactly 53 players (' + [...new Set(sizes)] + ')');
const on = (name, abbr) => LG.rosterOf(L, T(abbr)).find(p => p.n === name);
ok(on('Myles Garrett', 'LA') && on('Myles Garrett', 'LA').o === 99, 'Myles Garrett (on injured reserve) is on the Rams, rated 99');
ok(LG.lineup(L, T('LA')).DE.some(p => p.n === 'Myles Garrett') && LG.teamsFor(L, T('LA'), 0).a.squad.df.p.some(q => q[0] === 'LEDGE' && q[2] === 'Myles Garrett'), 'and he starts at defensive end (standing up at edge in their 3-4)');
ok(['Micah Parsons', 'Laremy Tunsil', 'A.J. Brown'].every(n => Object.values(L.players).some(p => p.n === n && p.t >= 0)), 'other players from injured reserve are on rosters too');
ok(L.teams.every(t => { const c = LG.posCount(L, t.id); return Object.keys(LG.MIN_DEPTH).every(p => c[p] >= LG.MIN_DEPTH[p]); }), 'every team has enough players at every position');
ok(!Object.values(L.players).some(p => p.t >= 0 && ['Kyle Juszczyk', 'Patrick Ricard'].indexOf(p.n) >= 0), 'fullbacks do not take running back spots');
ok(D.DFU.every(u => u.players.length === 11) && D.OLU.every(u => u.players.length === 5) && D.PLAYERS.length === 160, 'every team still has 5 skill starters, a 5-man line and an 11-man defense');
ok(D.DEPTH.every(u => u.players.length === 30) && D.FA.length === 90, '30 backups per team and 90 free agents');
// salaries follow the ratings; the caps still leave room for every real lineup
const real = {}; DR.CANDS.forEach(c => { (real[c.tm] = real[c.tm] || {})[c.k] = (real[c.tm][c.k] || []).concat([c]); });
const cost = t => DR.KINDS.reduce((s, k) => s + (real[t][k] || []).slice(0, DR.NEED[k]).reduce((u, c) => u + c.sal, 0), 0);
const costs = Object.keys(real).map(cost);
ok(Math.max(...costs) <= DR.CAPS.loose, 'every real team\'s lineup fits under the loose cap (most expensive $' + Math.round(Math.max(...costs)) + 'M)');
const gar = DR.CANDS.find(c => c.k === 'DEF' && c.tm === 'LA'), slb = D.DFU.find(u => u.team === 'LA').players.find(p => p[2] === 'Myles Garrett');
ok(gar && slb && slb[6] === 40, 'Myles Garrett is paid his real contract ($' + (slb && slb[6]) + 'M) whatever spot he lines up at');
// a CPU team that takes two players for one cuts its least valuable player, so it stays at 53
const C = LG.newNFL({ user: 0, seed: 7 }); C.teams[0].owner = 'You';
LG.release(C, 0, LG.rosterOf(C, 0).sort((a, b) => a.o - b.o)[0].i);
const give = LG.rosterOf(C, 0).sort((a, b) => a.o - b.o).slice(0, 2).map(p => p.i), get = [LG.rosterOf(C, 5).sort((a, b) => a.o - b.o)[0].i];
LG.doTrade(C, 0, 5, give, get);
ok(LG.rosterOf(C, 5).length === 53 && LG.rosterOf(C, 0).length === 51, 'after a 2-for-1 the CPU team is back to 53 (yours: 51)');
console.log('ALL DONE');
