// Campaign draft classes: future superstars and stars, busts and sleepers, and potential the scouts only estimate until a player has played.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 42 });
// a class: what it holds (several seasons' worth)
let cls = [];
for (let y = 0; y < 4; y++) { L.season = 2026 + y; cls = cls.concat(LG.genProspects(L, 244).map(id => L.players[id])); }
const per = f => cls.filter(f).length / 4;
const supers = per(p => p.pt >= 93), stars = per(p => p.pt >= 86 && p.pt < 93), sleepers = per(p => p.pt - p.vp >= 8), busts = per(p => p.vp - p.pt >= 8);
ok(supers >= 4 && supers <= 12 && stars >= 10, 'every class has future superstars (' + supers + ' with potential 93+ a class) and stars (' + stars + ' at 86-92)');
ok(sleepers >= 5 && busts >= 4, 'and sleepers (' + sleepers + ' a class) and busts (' + busts + ')');
const rk = cls.filter(p => p.p !== 'K' && p.p !== 'P');
ok(Math.max.apply(null, rk.map(p => p.o)) <= 81 && rk.filter(p => p.o >= 75).length / 4 >= 3, 'rookies start as rookies: nobody above 81, a few ready to start at 75+ (' + rk.filter(p => p.o >= 75).length / 4 + ' a class)');
ok(cls.every(p => p.vp >= p.o && (Math.abs(p.vp - p.pt) <= 3 || p.vp > p.pt || p.pt - p.vp >= 8)), 'everyone else is scouted within a few points of the truth (busts look better than they are, sleepers worse)');
const sl = cls.filter(p => p.pt - p.vp >= 8);
ok(sl.every(p => p.o <= 64 && p.vp <= 70 && p.pt >= 84), 'a sleeper looks like a late-rounder (rated ' + Math.min.apply(null, sl.map(p => p.o)) + '-' + Math.max.apply(null, sl.map(p => p.o)) + ', scouted at most ' + Math.max.apply(null, sl.map(p => p.vp)) + ') but can be a star (potential ' + Math.min.apply(null, sl.map(p => p.pt)) + '+)');
{ const a = LG.newNFL({ seed: 7 }), b = LG.newNFL({ seed: 7 }); ok(JSON.stringify(LG.genProspects(a, 50).map(id => [a.players[id].o, a.players[id].pt, a.players[id].vp])) === JSON.stringify(LG.genProspects(b, 50).map(id => [b.players[id].o, b.players[id].pt, b.players[id].vp])), 'the same league gets the same class'); }
// everybody (you, the board, CPU teams, trade values) sees the scouted potential, not the true one
{ const C = LG.newNFL({ seed: 9 }); let g = 0;
  while (C.phase !== 'offseason' && g++ < 60) { LG.simWeek(C, false); LG.advanceWeek(C); LG.checkFinal(C); }
  LG.offseasonBegin(C, 7);
  const order = C.draft.picks.map(x => x.p), pickOf = p => order.indexOf(p.i) + 1, drafted = order.map(id => C.players[id]);
  const sls = drafted.filter(p => p.pt - p.vp >= 8), look = drafted.filter(p => p.vp >= 86);
  const avg = a => a.reduce((t, p) => t + pickOf(p), 0) / Math.max(1, a.length);
  ok(sls.length && avg(sls) > avg(look) + 60, 'CPU teams draft by what the scouts see: sleepers go late (pick ' + Math.round(avg(sls)) + ' on average), the ones who look like stars early (pick ' + Math.round(avg(look)) + ')');
  const s = sls[0], bust = Object.assign({}, s, { pt: s.vp }); ok(LG.playerValue(s) === LG.playerValue(bust), 'and a sleeper is valued in trades like what he looks like');
  // after his first season his potential is known
  LG.startSeason(C); g = 0;
  while (C.phase !== 'offseason' && g++ < 60) { LG.simWeek(C, false); LG.advanceWeek(C); LG.checkFinal(C); }
  const rep = LG.offseasonBegin(C, 7), was = drafted.filter(p => p.t >= 0);
  ok(was.every(p => p.vp == null) && rep.sleepers.length > 0 && was.filter(p => p.pt - p.was >= 8).every(p => rep.sleepers.indexOf(p.i) >= 0), 'after a season the true potential shows: ' + rep.sleepers.length + ' sleepers and ' + rep.busts.length + ' busts found');
  ok(C.news.some(n => /^Sleeper: /.test(n.t)), 'and the news tells the league: "' + (C.news.find(n => /^Sleeper: /.test(n.t)) || {}).t + '"'); }
