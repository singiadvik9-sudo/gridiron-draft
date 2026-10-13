// campaign rosters: real starters, real backups, kickers / punters / returners
const E = require('./lib/engine.js'), LG = require('./lib/league.js');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const L = LG.newNFL({ user: 0 });
const POS = LG.POS, MIN = LG.MIN_DEPTH;
let short = 0, dup = 0, noK = 0, noP = 0, noRet = 0, names = 0, fakes = 0;
L.teams.forEach(t => {
  const r = LG.rosterOf(L, t.id), c = {}; POS.forEach(p => { c[p] = 0; }); r.forEach(p => { c[p.p]++; });
  POS.forEach(p => { if (c[p] < MIN[p]) short++; });
  const seen = {}; r.forEach(p => { if (seen[p.n]) dup++; seen[p.n] = 1; });
  if (!c.K) noK++; if (!c.P) noP++;
  const sq = LG.squadOf(L, t.id);
  if (!sq.k || !sq.pr || !sq.kr || !sq.st) noRet++;
  names += r.length;
  fakes += r.filter(p => /^(Rookie|Player|Backup)/i.test(p.n)).length;
});
ok(short === 0, 'every team has the minimum depth at every position (' + short + ' short)');
ok(dup === 0, 'no team has two players with the same name (' + dup + ')');
ok(noK === 0 && noP === 0, 'every team has a kicker and a punter');
ok(noRet === 0, 'every squad has a kicker, punt returner, kick returner and coverage unit');
const real = r => r.filter(p => /^[b]\d/.test(String(p.i))).length;
const nbk = L.teams.reduce((t, x) => t + LG.rosterOf(L, x.id).filter(p => /^b\d+_\d+$/.test(String(p.i))).length, 0);
ok(nbk > 600, 'rosters carry the real backups (' + nbk + ' of them)');
const fa = Object.values(L.players).filter(p => p.t === -1);
ok(fa.length > 60 && fa.filter(p => /^f\d+$/.test(String(p.i))).length >= 50, 'the free-agent pool starts with real cut players (' + fa.length + ')');
ok(fakes === 0, 'no placeholder names on rosters');
// the lineup honours the returner roles
const sq = LG.squadOf(L, 0);
ok(sq.kr && sq.kr.n && sq.pr && sq.pr.n && sq.k.n, 'squad names: K ' + sq.k.n + ', KR ' + sq.kr.n + ', PR ' + sq.pr.n + ', P ' + sq.st.p[0][1]);
console.log(bad ? 'FAILURES: ' + bad : 'ALL OK'); process.exit(bad ? 1 : 0);
