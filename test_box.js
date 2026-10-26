// box score, fumbles and pass breakups
const E = require('./lib/engine.js'), L = E.LIVE;
let bad = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const mk = n => { const r = E.mulberry32(n); return { a: E.mkTeam('A', E.autoDraft(r)), b: E.mkTeam('B', E.autoDraft(r)) }; };
let games = 0, lost = 0, kept = 0, pbu = 0, att = 0, plays = 0, mism = 0, ydMism = 0;
for (let g = 0; g < 40; g++) {
  const T = mk(g + 1), R = E.replay(900 + g, T, {}, ['a', 'b']), B = E.boxScore(R.log, T);
  games++; if (B.teams.a.pts !== R.state.score.a || B.teams.b.pts !== R.state.score.b) mism++;
  ['a', 'b'].forEach(k => { const t = B.teams[k]; lost += t.fumLost; pbu += t.pbu; att += t.att; plays += t.plays; if (t.total !== t.rush + t.pass + t.sackYds) ydMism++; });
  kept += R.log.filter(e => e.fum === 'kept').length;
  // every passer line adds up to the team line
  ['a', 'b'].forEach(k => { const q = B.lead[k].passing[0]; if (q && q.a !== B.teams[k].att) mism++; });
}
ok(mism === 0 && ydMism === 0, 'box score points and passing lines agree with the game');
ok(lost / games > 0.4 && lost / games < 1.2, 'fumbles lost per game: ' + (lost / games).toFixed(2) + ' (the NFL is about 0.7)');
ok(kept / games > 0.3, 'fumbles the offense falls on per game: ' + (kept / games).toFixed(2));
ok(pbu / att > 0.08 && pbu / att < 0.3, 'breakups per pass attempt: ' + (pbu / att).toFixed(3));
// a defender standing between the passer and the receiver can knock the ball down on its way (not only at the landing spot)
{
  let inflight = 0, total = 0, picks = 0;
  for (let i = 0; i < 300; i++) {
    const T = mk(i % 20 + 1), r = L.run({ seed: i, playNo: i % 50, ballOn: 30 + (i * 7) % 40, toGo: 10, offPick: ['PASS_M', 'CURLS', 'POST', 'GO'][i % 4], defPick: ['ZONE', 'MAN'][i % 2], OS: T.a.squad, DS: T.b.squad });
    total++; if (r.out.k === 'int') picks++;
    if (r.out.k === 'inc' && r.out.pbu && r.sim.evt.every(e => e[0] !== 'catch')) inflight++;
  }
  ok(inflight > 20, 'breakups happen in the sim (' + inflight + ' of ' + total + ' throws, ' + picks + ' picked off)');
  ok(picks / total < 0.12 && picks > 0, 'interceptions stay rare (' + (picks / total).toFixed(3) + ')');
}
console.log(bad ? 'FAILURES: ' + bad : 'ALL OK'); process.exit(bad ? 1 : 0);
