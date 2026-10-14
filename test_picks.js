// Draft picks as trade assets: ownership, value (round / recency / projected finish), CPU trades, and use in the rookie draft.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ user: 0, seed: 7 }); L.teams[0].owner = 'You'; LG.runUntilHuman(L, 60);
LG.ensurePicks(L);
const n = L.teams.length;
ok(L.picks.length === n * 7 * 3, 'every team has 7 rounds x 3 years of picks (' + L.picks.length + ')');
ok(L.picks.every(k => k.t === k.o), 'each team starts with its own picks');
const fr = LG.strengthFrac(L), ord = L.teams.map(t => t.id).sort((a, b) => fr[a] - fr[b]);
const worst = ord[0], best = ord[n - 1], mid = ord[Math.floor(n / 2)];
const pk = (o, y, r) => L.picks.find(k => k.o === o && k.y === y && k.r === r);
const V = k => LG.pickValue(L, k, fr);
// round
let mono = true; for (let r = 1; r < 7; r++) if (!(V(pk(mid, 2026, r)) > V(pk(mid, 2026, r + 1)))) mono = false;
ok(mono, 'earlier rounds are worth more: ' + [1, 2, 3, 4, 5, 6, 7].map(r => V(pk(mid, 2026, r)).toFixed(1)).join(' > '));
// projected finish
ok(V(pk(worst, 2026, 1)) > V(pk(best, 2026, 1)), 'a bad team\'s first-rounder beats a good team\'s (' + V(pk(worst, 2026, 1)).toFixed(1) + ' vs ' + V(pk(best, 2026, 1)).toFixed(1) + ')');
// recency
ok(V(pk(mid, 2026, 1)) > V(pk(mid, 2027, 1)) && V(pk(mid, 2027, 1)) > V(pk(mid, 2028, 1)), 'nearer drafts are worth more than later ones');
// uncertainty: far-off picks regress toward the middle
const gap = y => V(pk(worst, y, 1)) / (1) - V(pk(best, y, 1));
ok(Math.abs(LG.pickProjection(L, pk(worst, 2028, 1), fr).frac - 0.5) < Math.abs(LG.pickProjection(L, pk(worst, 2026, 1), fr).frac - 0.5), 'projection of far picks regresses to the middle');
// trading
const me = 0, cpu = L.teams.find(t => !t.owner && t.id !== me).id;
const mine = pk(me, 2026, 1), id1 = LG.pickId(mine);
ok(LG.tradeCheck(L, me, cpu, [id1], []) === null, 'a pick can be offered alone');
ok(LG.tradeCheck(L, me, cpu, [LG.pickId(pk(cpu, 2026, 1))], []) !== null, 'cannot give a pick you do not own');
ok(LG.tradeCheck(L, me, cpu, [id1, id1], []) !== null, 'cannot list the same pick twice');
ok(LG.tradeCheck(L, me, cpu, ['pk:1999:1:0'], []) !== null, 'unknown pick rejected');
// the CPU: a pick for a player of about the same worth
const val = LG.pickValue(L, mine, LG.strengthFrac(L));
const tp = LG.rosterOf(L, cpu).filter(p => p.p !== 'QB').sort((a, b) => Math.abs(LG.playerValue(a) - val * 0.5) - Math.abs(LG.playerValue(b) - val * 0.5))[0];
const lowball = LG.cpuTrade(L, me, cpu, [LG.pickId(pk(me, 2028, 7))], [LG.rosterOf(L, cpu).sort((a, b) => LG.playerValue(b) - LG.playerValue(a))[0].i]);
ok(!lowball.ok, 'a seventh-round pick does not buy their best player');
const ask = LG.cpuTrade(L, me, cpu, [id1, LG.pickId(pk(me, 2027, 1)), LG.pickId(pk(me, 2026, 2))], [tp.i]);
ok(ask.ok, 'three picks for a modest player is accepted (' + ask.msg + ', margin ' + ask.margin.toFixed(1) + ')');
const star = LG.rosterOf(L, cpu).filter(p => p.p !== 'QB' && p.p !== 'K' && p.p !== 'P').sort((a, b) => LG.playerValue(b) - LG.playerValue(a))[0];
const manyLate = [3, 4, 5, 6, 7].map(r => LG.pickId(pk(me, 2026, r)));
ok(!LG.cpuTrade(L, me, cpu, manyLate, [star.i]).ok, 'a pile of late picks does not buy a star');
// the CPU gives up a pick for a player
const cpuPick = LG.pickId(pk(cpu, 2028, 3));
const mp = LG.rosterOf(L, me).filter(p => p.o >= 78 && p.p !== 'QB').sort((a, b) => b.o - a.o)[0];
const sell = LG.cpuTrade(L, me, cpu, [mp.i], [cpuPick]);
ok(sell.ok, 'a good player fetches a third-round pick (' + sell.msg + ')');
const give = [id1, LG.pickId(pk(me, 2027, 1)), LG.pickId(pk(me, 2026, 2))];
LG.doTrade(L, me, cpu, give, [tp.i]);
ok(pk(me, 2026, 1).t === cpu && pk(me, 2027, 1).t === cpu && L.players[tp.i].t === me, 'ownership moved');
ok(/2 picks|3 picks/.test(L.news[0].t) || /pick/.test(L.news[0].t), 'news mentions the picks: ' + L.news[0].t);
ok(LG.tradeCheck(L, me, cpu, [id1], []) !== null, 'the traded pick is no longer mine');
// the rookie draft uses the new owner
let g = 0; while (L.phase !== 'offseason' && g++ < 80) { LG.simWeek(L, false); LG.advanceWeek(L); LG.checkFinal(L); }
ok(L.phase === 'offseason', 'season over');
LG.offseasonBegin(L, 7);
const d = L.draft, slot = d.from.findIndex((o, i) => o === me && i < n);   // my own first-round slot
ok(d.seq[slot] === cpu, 'my traded first-round slot is used by ' + L.teams[cpu].abbr);
ok(d.seq.filter(t => t === cpu).length === 7 + 2 - 0 || d.seq.filter(t => t === cpu).length >= 9, 'their pick count grew (' + d.seq.filter(t => t === cpu).length + ')');
ok(LG.tradeCheck(L, me, cpu, [LG.pickId(pk(me, 2026, 5))], []) !== null, 'this year\'s picks are locked once the draft has started');
ok(LG.tradeCheck(L, me, cpu, [LG.pickId(pk(me, 2027, 5))], []) === null, 'next year\'s picks are still tradeable');
LG.autoDraftToHuman(L); g = 0; while (L.phase === 'draft' && g++ < 400) { const t = LG.onClock(L); LG.draftPick(L, t, LG.cpuPickFor(L, t, L.draft.pool)); }
ok(L.phase === 'preseason' && !L.picks.some(k => k.y === 2026), 'draft done, 2026 picks are spent');
LG.startSeason(L);
ok(L.season === 2027 && L.picks.some(k => k.y === 2029) && !L.picks.some(k => k.y === 2026), 'a new year of picks appears each season');
ok(L.picks.length === n * 7 * 3, 'always three drafts of picks (' + L.picks.length + ')');
console.log('ALL DONE');
