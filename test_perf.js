// Speed work that must not change results: simulating a game at a time (handing the page back between games) gives exactly the same league.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
(async () => {
  const mk = () => { const L = LG.newNFL({ user: 0, seed: 17 }); L.teams[0].owner = 'You'; LG.campInit(L); return L; };
  const A = mk(), B = mk(); let pauses = 0;
  LG.runUntilHuman(A, 60); await LG.runUntilHumanAsync(B, 60, async () => { pauses++; }, 0);
  ok(JSON.stringify(A) === JSON.stringify(B), 'the start of a season, a game at a time: the same league');
  for (let w = 0; w < 6; w++) { const g = LG.weekGames(A)[0]; if (!g) break; LG.simGame(A, g); LG.simGame(B, LG.weekGames(B)[0]); LG.runUntilHuman(A, 60); await LG.runUntilHumanAsync(B, 60, async () => { pauses++; }, 0); }
  ok(JSON.stringify(A) === JSON.stringify(B) && pauses >= 6, 'six weeks of simulating your game and the rest: still the same (week ' + A.week + ', the page got ' + pauses + ' turns on the way)');
  const C = mk(), D = mk(); C.phase = D.phase; while (C.phase !== 'offseason') { LG.runUntilHuman(C, 60); const g = LG.weekGames(C)[0]; if (g) LG.simGame(C, g); else break; }
  while (D.phase !== 'offseason') { await LG.runUntilHumanAsync(D, 60, null); const g = LG.weekGames(D)[0]; if (g) LG.simGame(D, g); else break; }
  ok(JSON.stringify(C) === JSON.stringify(D) && C.phase === 'offseason', 'a whole season into the offseason: the same champion, stats and news');
})();
