// Injuries and injured reserve: players get hurt in games, sit while out, heal week by week; IR frees a spot on the 53.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const season = seed => { const L = LG.newNFL({ user: 0, seed }); L.teams[0].owner = 'You'; LG.runUntilHuman(L, 60); let g = 0; while (L.phase !== 'offseason' && g++ < 60) { LG.simWeek(L, false); LG.advanceWeek(L); LG.checkFinal(L); } return L; };
const S = season(11), games = S.sched.filter(x => x.done), all = games.flatMap(x => x.inj || []), per = all.length / games.length / 2;
ok(per > 1.2 && per < 1.8, 'about 1.5 injuries per team per game (' + per.toFixed(2) + ')');
const short = all.filter(x => x[1] <= 2).length / all.length, seasonOut = all.filter(x => x[1] >= LG.SEASON_OUT).length;
ok(short > 0.6 && short < 0.8 && seasonOut > 0 && seasonOut < all.length * 0.06, 'most last a week or two (' + Math.round(short * 100) + '%), a few end the season (' + seasonOut + ')');
const S2 = season(11);
ok(JSON.stringify(S2.sched.map(x => x.inj || [])) === JSON.stringify(games.map(x => x.inj || [])), 'the same games give the same injuries (screens and the server agree)');
ok(S.news.some(n => / is hurt: /.test(n.t)), 'your injuries are in the news');
// sitting out, healing
const L = LG.newNFL({ user: 0, seed: 5 }); L.teams[0].owner = 'You';
const ln = LG.lineup(L, 0), wr1 = ln.WR[0], hb = ln.HB[0];
wr1.inj = 3; hb.inj = LG.SEASON_OUT;
const ln2 = LG.lineup(L, 0), sq = LG.squadOf(L, 0);
ok(ln2.WR.indexOf(wr1) < 0 && ln2.HB.indexOf(hb) < 0 && !sq.rot.WR.some(p => p.i === wr1.i) && sq.wr.every(p => p.i !== wr1.i), 'an injured player is out of the lineup and the rotation');
ok(LG.returnerOf(L, 0) !== wr1 && LG.returnerOf(L, 0) !== hb, 'and is not the returner');
L.sched.filter(x => x.w === 1).forEach(x => LG.simGame(L, x)); LG.advanceWeek(L);
ok(wr1.inj === 2 && hb.inj === LG.SEASON_OUT, 'a week heals a week (out for the season stays out)');
// injured reserve
const n0 = LG.activeRoster(L, 0).length;
ok(LG.placeIR(L, 0, LG.rosterOf(L, 0).find(p => !p.inj).i) !== null, 'only an injured player can go on IR');
ok(LG.placeIR(L, 0, hb.i) === null && hb.ir && LG.activeRoster(L, 0).length === n0 - 1 && LG.rosterOf(L, 0).length === n0, 'IR takes him off the 53 but keeps him on the team');
ok(LG.payroll(L, 0) === Math.round(LG.rosterOf(L, 0).reduce((t, p) => t + LG.salOf(p), 0) * 10) / 10, 'and on the payroll');
const fa = Object.values(L.players).filter(p => p.t === -1 && LG.salOf(p) <= LG.capRoom(L, 0)).sort((a, b) => a.o - b.o)[0];
ok(n0 === 53 ? LG.signFA(L, 0, fa.i) === null : true, 'the open spot can be filled with a free agent');
ok(/stay on injured reserve/.test(LG.activateIR(L, 0, hb.i) || ''), 'he stays on IR at least ' + LG.IR_MIN + ' weeks');
hb.irw = LG.IR_MIN;
ok(/still injured/.test(LG.activateIR(L, 0, hb.i) || ''), 'and comes back only when healthy');
delete hb.inj;
ok(/active roster is full/.test(LG.activateIR(L, 0, hb.i) || ''), 'with a full 53 someone has to go first');
LG.release(L, 0, fa.i);
ok(LG.activateIR(L, 0, hb.i) === null && !hb.ir && LG.activeRoster(L, 0).length === 53, 'then he is back on the 53');
// CPU teams look after themselves
const C = LG.newNFL({ seed: 6 }), cl = LG.lineup(C, 3), qb = cl.QB[0]; qb.inj = 6;
const backup = LG.rosterOf(C, 3).filter(p => p.p === 'QB' && p !== qb); backup.forEach(p => { p.inj = 2; });
LG.injuryWeek(C);
ok(qb.ir && LG.lineup(C, 3).QB.length === 1 && LG.lineup(C, 3).QB[0].t === 3, 'a CPU team puts a long injury on IR and finds a healthy starter (' + LG.lineup(C, 3).QB[0].n + ')');
// trades: hurt players are worth less
const v0 = LG.playerValue(Object.assign({}, wr1, { inj: 0 }));
ok(LG.playerValue(Object.assign({}, wr1, { inj: 8 })) < v0 * 0.5 && LG.playerValue(Object.assign({}, wr1, { inj: LG.SEASON_OUT })) <= v0 * 0.25 + 1e-9, 'CPU teams value injured players less in trades');
// the offseason heals everyone; custom leagues start healthy
LG.progress(S);
ok(!Object.values(S.players).some(p => p.inj || p.ir), 'everyone is healthy again after the season');
const N = LG.newCustom({ entry: 'nfl', cpus: true, games: 4, playoffs: 0 }, 'm'); for (let i = 0; i < 4; i++) LG.addTeam(N, { name: 'N' + i }); LG.startCustom(N);
ok(!Object.values(N.players).some(p => p.inj || p.ir) && N.teams.every(t => LG.activeRoster(N, t.id).length >= 53), 'a custom league starts with everyone healthy and on the 53 (real players from injured reserve included)');
console.log('ALL DONE');
