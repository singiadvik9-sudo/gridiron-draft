// Usage shares that add up, and players who were just given playing time not asking for more.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const sum = (L, t, pos) => LG.usageList(L, t, pos).reduce((s, x) => s + x.u, 0);
// usage: every group fills its spots exactly, on every team, and stays that way when the coach changes one
{ const L = LG.newNFL({ seed: 4, user: 0 }); L.teams[0].owner = 'You';
  ok(L.teams.every(t => ['HB', 'WR', 'TE'].every(pos => sum(L, t.id, pos) === LG.USE_SPOTS[pos] * 100)), 'every team: backs 100%, receivers 200% (two on the field), tight ends 100%');
  const wr = LG.usageList(L, 0, 'WR'), w3 = wr[2].p; LG.setUsage(L, 0, w3.i, 60);
  const after = LG.usageList(L, 0, 'WR'); ok(after.find(x => x.p === w3).u === 60 && sum(L, 0, 'WR') === 200 && after.every(x => x.u >= 0 && x.u <= 100), 'set one receiver to 60%: he shows 60 and the rest adjust (' + after.map(x => x.u).join(' / ') + ')');
  const hb = LG.usageList(L, 0, 'HB'); LG.setUsage(L, 0, hb[0].p.i, 10); ok(sum(L, 0, 'HB') === 100 && LG.usageList(L, 0, 'HB').every(x => x.u <= 100), 'backs still add up when the starter is cut to 10 (' + LG.usageList(L, 0, 'HB').map(x => x.u).join(' / ') + ')');
  const te = LG.usageList(L, 0, 'TE'); if (te.length === 2) { LG.setUsage(L, 0, te[0].p.i, 0); ok(LG.usageList(L, 0, 'TE').map(x => x.u).join() === '0,100', 'two tight ends: one at 0 means the other plays every snap'); }
  // a player coming back from injury: the group is fitted again, not over 100
  const w1 = after[0].p; w1.inj = 2; ok(sum(L, 0, 'WR') === 200, 'with a receiver hurt the others fill the spots (' + LG.usageList(L, 0, 'WR').map(x => x.u).join(' / ') + ')');
  w1.inj = 0; ok(sum(L, 0, 'WR') === 200, 'and when he is back it still adds up');
  LG.setUsage(L, 0, w3.i, null); ok(LG.usageList(L, 0, 'WR').every(x => !x.set) && sum(L, 0, 'WR') === 200, 'clearing it puts the group back on the depth chart'); }
// playing time: given a bigger share (or a kept promise), a player does not ask for more for a while, unless it is taken back
{ const L = LG.newNFL({ seed: 21, user: 0 }); L.teams[0].owner = 'You'; LG.campInit(L);
  const ids = LG.starterIds(L, 0), wr = LG.rosterOf(L, 0).filter(p => p.p === 'WR' && !ids[p.i]).sort((a, b) => b.o - a.o)[0];
  LG.rosterOf(L, 0).filter(p => p.p === 'WR' && ids[p.i]).forEach(p => { p.o = 95; }); wr.o = 85; L.week = 3; LG.setUsage(L, 0, wr.i, 40);
  ok(LG.ptCalm(L, 0, wr), 'a backup whose share goes up is content for now');
  for (let w = 0; w < LG.PT_CALM; w++) { L.week = 3 + w; wr.ben = 9; wr.mailG = -99; LG.__ptMail(L); }
  ok(!L.inbox.some(m => m.kind === 'play' && m.pid === wr.i), 'and does not email about playing time for ' + LG.PT_CALM + ' games');
  L.week = 3 + LG.PT_CALM; wr.mailG = -99; LG.__ptMail(L); ok(L.inbox.some(m => m.kind === 'play' && m.pid === wr.i), 'after that he can ask again');
  L.inbox = []; L.week = 4; LG.setUsage(L, 0, wr.i, 60); ok(LG.ptCalm(L, 0, wr), 'raised again: content'); LG.setUsage(L, 0, wr.i, 5); ok(!LG.ptCalm(L, 0, wr), 'cut below what he was given: he can ask right away');
  wr.mailG = -99; LG.__ptMail(L); ok(L.inbox.some(m => m.kind === 'play' && m.pid === wr.i), 'and does'); }
