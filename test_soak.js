// Three campaign seasons end to end (season, playoffs, offseason, free agency, draft), checking that the league stays consistent.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ user: 7, seed: 77 }); L.teams[7].owner = 'You'; LG.campInit(L); LG.runUntilHuman(L, 60);
const problems = [];
function check(when) {
  const P = Object.values(L.players), seen = {};
  P.forEach(p => {
    ['o', 'a'].forEach(k => { if (typeof p[k] !== 'number' || !isFinite(p[k])) problems.push(when + ': ' + p.n + ' has ' + k + '=' + p[k]); });
    if (p.o < 20 || p.o > 99) problems.push(when + ': ' + p.n + ' rated ' + p.o);
    if (p.inj != null && (p.inj < 0 || !isFinite(p.inj))) problems.push(when + ': ' + p.n + ' inj ' + p.inj);
    if (p.sus != null && (p.sus < 0 || !isFinite(p.sus))) problems.push(when + ': ' + p.n + ' sus ' + p.sus);
    if (p.sal != null && (!isFinite(p.sal) || p.sal < 0)) problems.push(when + ': ' + p.n + ' salary ' + p.sal);
    if (seen[p.i]) problems.push(when + ': duplicate id ' + p.i); seen[p.i] = 1;
  });
  L.teams.forEach(t => {
    if (t.owner) return;
    const n = LG.activeRoster(L, t.id).length; if (L.phase === 'regular' && (n > 53 || n < 40)) problems.push(when + ': ' + t.nick + ' have ' + n + ' active players');
    const pay = LG.payroll(L, t.id); if (L.phase === 'regular' && pay > LG.payrollCap(L) * 1.15) problems.push(when + ': ' + t.nick + ' payroll ' + pay + ' over the cap ' + LG.payrollCap(L));
  });
  if (L.morale) Object.keys(L.morale).forEach(k => { const v = L.morale[k]; if (!isFinite(v)) problems.push(when + ': morale ' + k + ' ' + v); });
  if (L.fin && !isFinite(L.fin.cash)) problems.push(when + ': cash ' + L.fin.cash);
}
let ages0 = null;
for (let season = 0; season < 3; season++) {
  check('start of season ' + L.season);
  let g = 0;
  while (L.phase !== 'offseason' && L.phase !== 'complete' && g++ < 80) { const x = LG.weekGames(L)[0]; if (x) LG.simGame(L, x); LG.runUntilHuman(L, 60); LG.checkFinal(L); if (L.phase === 'regular' && L.week % 6 === 0) check('week ' + L.week); }
  const R = LG.standings ? null : null, rec = {}; L.sched.filter(x => x.done && x.pl !== 'po').forEach(x => { [x.h, x.a].forEach(t => { rec[t] = (rec[t] || 0) + 1; }); });
  const games = Object.values(rec); ok(games.length === 32 && games.every(v => v === games[0]), 'season ' + L.season + ': every team played ' + games[0] + ' regular-season games');
  const w = L.sched.filter(x => x.done && x.pl !== 'po'), wins = w.filter(x => x.sh !== x.sa).length; ok(w.every(x => isFinite(x.sh) && isFinite(x.sa) && x.sh >= 0 && x.sa >= 0), 'and every score is a real score (' + wins + ' decided games)');
  ok(L.phase === 'offseason', 'season ' + L.season + ' reaches the offseason (' + L.phase + ')');
  ages0 = Object.fromEntries(Object.values(L.players).filter(p => !p.gen && p.t >= 0).slice(0, 200).map(p => [p.i, p.a]));
  LG.campGo(L, 7, 'offseason'); check('after the offseason began');
  let f = 0; while (L.phase === 'fa' && f++ < 10) LG.campGo(L, 7, 'fa-next');
  ok(L.phase === 'draft', 'free agency ends in the draft (' + L.phase + ')'); check('draft');
  LG.campOp(L, 7, 'draftauto', { on: true }); let d = 0; while (L.phase === 'draft' && d++ < 400) LG.campGo(L, 7, 'draft-me');
  ok(L.phase !== 'draft', 'the draft finishes (' + L.phase + ')');
  if (L.phase === 'preseason') { LG.campGo(L, 7, 'trim'); LG.campGo(L, 7, 'season'); }
  ok(L.phase === 'regular' && L.week === 1, 'and the next season starts: ' + L.season);
  const aged = Object.keys(ages0).filter(id => L.players[id] && L.players[id].a === ages0[id] + 1).length;
  ok(aged > Object.keys(ages0).length * 0.9, 'players are a year older (' + aged + ' of ' + Object.keys(ages0).length + ' still around)');
  check('start of the next season');
}
ok(!problems.length, 'nothing inconsistent along the way' + (problems.length ? ': ' + problems.length + ' problems, first: ' + problems.slice(0, 6).join(' | ') : ''));
