// Campaign: team modes and CPU trades, the trade-for-a-player talks, draft classes and draft trades, free agency and contracts, morale, the press, events, money.
const LG = require('./lib/league.js'), E = require('./lib/engine.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const mk = seed => { const L = LG.newNFL({ seed, user: 0 }); L.teams[0].owner = 'You'; LG.campInit(L); return L; };
const L = mk(21), me = 0;
// needs and depth never overlap; modes
ok(L.teams.every(t => { const n = LG.teamNeeds(L, t.id); return !n.deep.some(q => n.needs.indexOf(q) >= 0); }), 'no team both needs a position and has depth there');
ok(L.teams.some(t => t.mode === 'win') && L.teams.some(t => t.mode === 'rebuild') && !L.teams[me].mode, 'teams are win-now or rebuilding (yours is your call)');
// modes are earned: no chance in them, most teams neither, contenders on top, rebuilders at the bottom
{ const modes = M => M.teams.map(t => t.mode || '').join(), M2 = mk(777), M3 = mk(31337); ok(modes(M2) === modes(M3), 'the same rosters get the same modes, whatever the seed');
  const rat = id => LG.teamRating(L, id).ovr, W = L.teams.filter(t => t.mode === 'win'), B = L.teams.filter(t => t.mode === 'rebuild'), Nn = L.teams.filter(t => !t.mode);
  ok(W.length >= 3 && W.length <= 9 && B.length >= 2 && B.length <= 7 && Nn.length >= 16, 'most teams are neither: ' + W.length + ' win-now (' + W.map(t => t.abbr).join(' ') + '), ' + B.length + ' rebuilding (' + B.map(t => t.abbr).join(' ') + ')');
  ok(Math.min(...W.map(t => rat(t.id))) > Math.max(...B.map(t => rat(t.id))) + 3, 'every contender is rated well above every rebuilder');
  ok(LG.modeOf(1.5, 0.75) === 'win' && LG.modeOf(1.5, 0.4) === '' && LG.modeOf(0.3, 0.53) === '' && LG.modeOf(-0.5, 0.8) === 'win', 'a contender has to be winning: a good team at 9-8 is not one, and a 14-3 team is');
  ok(LG.modeOf(-1.5, 0.3) === 'rebuild' && LG.modeOf(-1.5, 0.6) === '' && LG.modeOf(-0.5, 0.2) === 'rebuild' && LG.modeOf(0.5, 0.2) === '' && LG.modeOf(-0.2, 0.47) === '', 'a rebuilder has to be really bad: low-rated and losing, or losing badly'); }
// how modes trade: the same deal, valued by each kind of team
{ const vet = Object.values(L.players).find(p => p.a >= 30 && p.o >= 82 && p.p !== 'QB' && p.t > 0 && !L.teams[p.t].mode);
  const buyer = L.teams.find(t => t.mode === 'win'), keepT = L.teams[vet.t]; const pk = LG.pickId(LG.picksOf(L, buyer.id).find(k => k.r === 1 && LG.pickOpen(L, k)));
  keepT.mode = 'rebuild'; const asReb = LG.tradeEval(L, vet.t, [pk], [vet.i]); keepT.mode = ''; const asNeu = LG.tradeEval(L, vet.t, [pk], [vet.i]);
  ok(asReb.worth > asNeu.worth + 5, 'a rebuilding team sells a veteran for a first much more readily'); }
// asking for a player, countering
{ const t = L.teams.find(x => x.id !== me && x.mode === 'rebuild'), p = LG.rosterOf(L, t.id).filter(x => x.p !== 'QB' && x.p !== 'K' && x.p !== 'P').sort((a, b) => b.o - a.o)[0];
  const a = LG.tradeAsk(L, me, t.id, p.i); ok(a.ok && a.give.length > 0 && LG.cpuTrade(L, me, t.id, a.give, a.get).margin >= 3, 'asking for ' + p.n + ': the team names a price that is good for it (margin ' + (a.ok ? LG.cpuTrade(L, me, t.id, a.give, a.get).margin.toFixed(1) : '') + ')');
  const c = LG.tradeCounter(L, me, t.id, a.give.slice(0, 1).length > 1 ? a.give.slice(0, 1) : [LG.pickId(LG.picksOf(L, me).find(k => k.r === 7))], a.get); ok(!c.ok, 'a lowball counter is not enough' + (c.add ? ', and they say what one more piece would do it' : ': ' + c.msg));
  const n = Object.values(L.players).find(x => x.n === 'Josh Allen'); ok(!LG.tradeAsk(L, me, n.t, n.i).ok, 'Josh Allen is not for sale'); }
for (let i = 0; i < 6; i++) LG.tradeTalkUse(L, 3); ok(LG.tradeTalkLeft(L, 3) === 0, 'and a team stops talking after too many tries');
// draft classes like real ones
{ const C = mk(42); let qb1 = 0, qbGood = 0, sup = 0; const Y = 12; for (let y = 0; y < Y; y++) { C.season = 2026 + y; const c = LG.genProspects(C, 244).map(id => C.players[id]), q = c.filter(p => p.p === 'QB'); if (q.some(p => LG.potSeen(p) >= 85)) qbGood++; if (q.some(p => p.pt >= 93)) sup++; qb1 += q.length / Y; }
  ok(qbGood >= Y - 1, 'nearly every class has a QB who looks like a star (' + qbGood + ' of ' + Y + ')'); ok(sup >= Y / 3, 'and a superstar QB often (' + sup + ' of ' + Y + ' classes)');
  ok(LG.draftPrem('QB') > LG.draftPrem('WR') && LG.draftPrem('WR') > LG.draftPrem('S') && LG.draftPrem('K') < -8, 'real drafts: QBs go early, safeties later, kickers last'); }
// a whole season
for (let w = 0; w < 80 && L.phase !== 'offseason'; w++) { LG.runUntilHuman(L, 60); LG.weekGames(L).forEach(g => LG.simGame(L, g)); LG.advanceWeek(L); LG.checkFinal(L); }
ok(L.phase === 'offseason', 'a season plays through');
ok(L.press && L.press.qs.length === 3, 'a press conference follows your game: "' + L.press.qs[0] + '"');
{ const o0 = LG.pressOptions(L), won = L.press.won, t0 = L.morale.team;
  ok(won ? !o0.some(a => /blame|have to be better/i.test(a.t)) : !o0.some(a => /credit the players|bigger win/i.test(a.t)), 'the answers fit the result (' + (won ? 'a win' : L.press.tie ? 'a tie' : 'a loss') + ': ' + o0.map(a => a.t).join(' / ') + ')');
  LG.pressAnswer(L, 0); ok(L.morale.team === t0 + o0[0].team, 'the first answer moves team morale by ' + o0[0].team);
  const o1 = LG.pressOptions(L), s = L.players[L.press.star], m0 = LG.moraleOf(L, s); ok(o1.some(a => /praise him/i.test(a.t)) && o1.some(a => /call him out/i.test(a.t)), 'a question about the star: praise him or call him out');
  LG.pressAnswer(L, o1.findIndex(a => /call him out/i.test(a.t))); ok(LG.moraleOf(L, s) < m0, 'calling out your star does not lift him'); LG.pressAnswer(L, 3); ok(!L.press, 'and then it is over'); }
// every kind of question: four answers, and none of them out of place
{ const A = LG.PRESS_ANSWERS; ok(Object.keys(A).every(k => A[k].length === 4) && !A.win.some(a => /blame|loss/i.test(a.t)) && !A.loss.some(a => /credit the players|win/i.test(a.t)) && !A.fans.some(a => /blame/i.test(a.t)), 'each kind of question has four answers that fit it (' + Object.keys(A).join(', ') + ')');
  const old = { press: { qs: ['x', 'y'], i: 0 } }; ok(LG.pressOptions(old) === LG.COACH_ANSWERS, 'a press conference from an older save keeps the old answers'); }
ok(L.inbox.length > 1, 'the inbox fills up (' + L.inbox.length + ')');
ok(Object.keys(L.stats).length > 500, 'stats are kept for every team');
const star = Object.values(L.players).filter(p => p.t >= 0 && p.t !== me && L.stats[p.i] && L.stats[p.i].ryd > 300)[0]; ok(LG.playerStats(L, star.i).games.length > 3, 'including game by game, for players on other teams (' + star.n + ')');
// morale moves ratings
{ const p = LG.rosterOf(L, me).filter(x => LG.isStar(L, x) && x.p === 'WR')[0] || LG.rosterOf(L, me).filter(x => LG.isStar(L, x) && ['HB', 'TE', 'QB'].indexOf(x.p) >= 0)[0], was = p.mor, tm = L.morale.team; L.morale.team = 60; p.mor = 65; const sq = () => { const s = LG.teamsFor(L, me, 1).a.squad; return s.wr.concat([s.qb, s.hb, s.te]).concat((s.rot.WR || [])).find(x => x.i === p.i); }; const a = sq(); p.mor = 20; const b = sq(); if (a && b) ok(b.o < a.o, 'an unhappy star plays below his rating (' + a.o + ' -> ' + b.o + ')'); p.mor = was; L.morale.team = tm; }
// free agency and contracts
const rep = LG.offseasonBegin(L, 7);
{ const Rr = LG.records(L), rec = id => Rr[id].w + '-' + Rr[id].l; const bad = L.teams.filter(t => !t.owner && ((t.mode === 'win' && Rr[t.id].pct < 0.55) || (t.mode === 'rebuild' && Rr[t.id].pct > 0.4))); ok(bad.length === 0, 'after a season no team is in a mode its record says it should not be: win-now ' + L.teams.filter(t => t.mode === 'win').map(t => t.abbr + ' ' + rec(t.id)).join(', ') + '; rebuilding ' + L.teams.filter(t => t.mode === 'rebuild').map(t => t.abbr + ' ' + rec(t.id)).join(', ')); }
ok(Object.values(L.players).filter(p => p.t >= 0 && p.t !== me && p.ss && p.ss.length).length > 300, 'and seasons stay in the history of players on other teams');
ok(L.phase === 'fa' && L.fa.exp.length > 0 && Object.values(L.players).some(p => p.t === -1 && p.was != null && p.o >= 75), 'free agency opens before the draft, with your expiring deals and other teams\' free agents');
const e = L.fa.exp.map(i => L.players[i]).sort((a, b) => b.o - a.o)[0], th = LG.contractOpen(L, e.i);
ok(th && th.msgs[0].from === 'him' && L.inbox.some(m => m.kind === 'contract' && m.pid === e.i), e.n + ' writes in with what he wants: "' + th.msgs[0].text.slice(0, 80) + '..."');
{ const a = LG.demandOf(L, e), hit = o => o.s + o.b / o.y, S0 = L.lastStats[e.i]; const hi = Object.assign({}, e), f = { i: 'zz', n: 'Test', p: 'WR', o: 80, a: 26 }; L.players.zz = f; L.lastStats.zz = { rec: 120, recyd: 1800, rectd: 16 }; const big = hit(LG.demandOf(L, f)); L.lastStats.zz = { rec: 5, recyd: 40 }; const small = hit(LG.demandOf(L, f)); ok(big > small * 1.3, 'great seasons ask for more: $' + big.toFixed(1) + 'M against $' + small.toFixed(1) + 'M'); f.t = me; f.o = 99; f.st = 1; f.mor = 20; L.lastStats.zz = { rec: 60, recyd: 800 }; const sad = hit(LG.demandOf(L, f)); f.mor = 65; const fine = hit(LG.demandOf(L, f)); ok(sad > fine, 'and an unhappy player asks for more to stay'); delete L.players.zz; delete L.lastStats.zz; }
{ const r = LG.contractOffer(L, me, e.i, { y: th.ask.y, s: th.ask.s * 0.5, b: 0, g: 0, i: 0 }); ok(r.ok && !r.signed && th.msgs[th.msgs.length - 1].from === 'him', 'a low offer gets a reply: "' + th.msgs[th.msgs.length - 1].text.slice(0, 50) + '..."'); }
{ const a = th.ask, r = LG.contractOffer(L, me, e.i, { y: a.y, s: a.s, b: a.b, g: a.g, i: 0 }); ok(r.signed && e.t === me && e.cx > L.season && e.ctr && e.sal > 0 && L.fa.exp.indexOf(e.i) < 0, 'his price gets a deal: ' + LG.contractSummary(e.ctr));
  const pay0 = LG.payroll(L, me), dead = LG.deadMoney(L, e); ok(dead > 0, 'guarantees and the bonus are dead money if you cut him ($' + dead + 'M)'); }
const w = L.fa.exp.map(i => L.players[i])[0]; ok(LG.letWalk(L, w.i) === null && w.t === -1, 'you can let a player walk');
const fa = Object.values(L.players).filter(p => p.t === -1 && p.was != null && p.was !== me && p.o >= 70).sort((a, b) => b.o - a.o)[0], ft = LG.contractOpen(L, fa.i); ok(ft && ft.msgs.length === 1, 'and open talks with another team\'s free agent (' + fa.n + ')');
const fa0 = LG.rosterOf(L, 3).length; for (let i = 0; i < 4 && L.phase === 'fa'; i++) LG.faNext(L);
ok(L.phase === 'draft' && L.draft.hold === 1, 'after free agency, the draft waits for you');
ok(L.news.length > 0 && !L.fa, 'unsigned players are gone');
// draft-day trades
const pos0 = L.draft.pos;
{ const up = LG.draftUpOffers(L, me), dn = LG.draftDownBids(L, me); ok(up.length + dn.length > 0, 'you can trade up (' + up.length + ' offers) or down (' + dn.length + ' bids)');
  const x = dn[0] || up[0]; if (x) { const k = LG.pickOf_(L, x.get[0]), acc = LG.cpuTrade(L, me, x.t, x.give, x.get).ok; LG.doTrade(L, me, x.t, x.give, x.get); ok(acc && L.draft.seq[LG.draftSlot(L, k)] === me, 'and the pick you get is yours in the running order'); } }
{ const a = LG.pickValue(L, { y: L.season, r: 1, o: L.draft.from[0], t: 0 }), b = LG.pickValue(L, { y: L.season, r: 1, o: L.draft.from[9], t: 0 }), c = LG.pickValue(L, { y: L.season, r: 2, o: L.draft.from[15], t: 0 }), d = LG.pickValue(L, { y: L.season, r: 6, o: L.draft.from[15], t: 0 }); ok(a > b * 1.6 && b > c * 1.6 && c > d * 5, 'top picks are worth far more: #1 ' + Math.round(a) + ', #10 ' + Math.round(b) + ', #48 ' + Math.round(c) + ', late ' + Math.round(d)); }
LG.draftAdvance(L, 'one'); ok(L.draft.pos === pos0 + 1 || LG.onClock(L) === me, 'one pick at a time');
{ const G0 = L.draft.picks.slice(); L.draft.auto = { [me]: true }; const before = LG.rosterOf(L, me).filter(p => p.p === 'QB').length; LG.draftAdvance(L, 'me'); ok(L.phase === 'preseason', 'auto-draft finishes it');
  const top10 = L.draft.picks.slice(0, 10).map(x => L.players[x.p].p); ok(top10.filter(q => q === 'QB').length >= 1 && top10.filter(q => q === 'K' || q === 'P').length === 0, 'the top of the draft looks real: ' + top10.join(' '));
  const mine = L.draft.picks.filter(x => x.t === me).map(x => L.players[x.p]), low = LG.teamNeeds(L, me); ok(mine.filter(p => p.p === 'K' || p.p === 'P').length <= 1 && new Set(mine.map(p => p.p)).size >= Math.min(3, mine.length), 'auto-draft spreads your picks over your holes: ' + mine.map(p => p.p).join(' ')); }
// a new season: money, coaches, upgrades
LG.startSeason(L);
ok(L.dead && !Object.keys(L.dead).length, 'dead money clears');
{ L.fin.cash = 100; const lv = L.fin.lv.st; ok(LG.upgrade(L, 'st') === null && L.fin.lv.st === lv + 1 && L.fin.cash < 100, 'money buys upgrades'); const o = LG.coachMarket(L).find(c => c.k === 'oc' && c.r >= 80) || LG.coachMarket(L)[0]; const b = LG.teamRating(L, me); L.staff.oc.r = 94; const up = LG.teamRating(L, me); ok(up.off > b.off, 'a great offensive coordinator lifts your offense (' + b.off + ' -> ' + up.off + ')'); ok(LG.hireCoach(L, 0) === null, 'and you can hire one'); }
// suspensions: real players get the league's line, made-up ones the details
{ const C = mk(9); let real = null, gen = null; const players = Object.values(C.players), r0 = players.find(p => !p.gen && p.t >= 0); for (let s = 0; s < 400 && !(real && gen); s++) { C.week = 1 + s; C.season = 2026 + s; const n0 = C.news.length; C.news = []; const r = LG.__suspend; break; }
  const fake = { i: 'g1', n: 'Made Up', p: 'WR', o: 90, a: 25, t: 1, gen: 1 }; C.players.g1 = fake; LG.__suspend(C, fake, 3, () => 0.1); const a = C.news[0].t; LG.__suspend(C, r0, 3, () => 0.1); r0.o = 90; LG.__suspend(C, r0, 1, () => 0.1); const b = C.news[0].t;
  ok(/arrested|cited|caught|charged|busted/.test(a), 'a made-up player: "' + a + '"'); ok(/conduct policy/.test(b) && !/arrested|cited|caught|charged|busted/.test(b), 'a real player only gets the league line: "' + b + '"'); ok(r0.sus >= 1 && !LG.healthy(r0), 'and he sits out'); }
// fights: rare, in the game log, and the ejected do not come back
{ const C = mk(5), T = LG.teamsFor(C, 1, 2); let fights = 0, games = 200, again = 0; for (let g = 0; g < games; g++) { const R = E.replay(1000 + g, T, {}, ['a', 'b']); const fs = R.log.filter(e => e.fight); fights += fs.length; fs.forEach(f => { R.log.filter(e => e.n > f.n && e.on).forEach(e => { ['HB', 'WR1', 'WR2', 'TE'].forEach(k => { if (e.on[k] && e.on[k][0] === f.fight.i) again++; }); }); }); }
  ok(fights > 0 && fights < games * 0.35, 'fights are rare (' + fights + ' in ' + games + ' games)'); ok(again === 0, 'the ejected do not come back'); }
// who can be a star: QB1, RB1, WR1-2, TE1 and defensive starters (78+), never linemen, kickers, punters or backups
{ const C = mk(21), ro = LG.rosterOf(C, 0), ids = LG.starterIds(C, 0), byP = q => ro.filter(p => p.p === q).sort((a, b) => b.o - a.o), n = q => ro.filter(p => ids[p.i] && p.p === q).length;
  ok(n('QB') === 1 && n('HB') === 1 && n('WR') === 2 && n('TE') === 1 && n('OL') === 0 && n('K') === 0 && n('P') === 0 && n('CB') === 2 && n('S') === 2, 'the star spots are QB1, RB1, WR1-2, TE1 and the defense');
  const ol = byP('OL')[0], wr3 = byP('WR')[2], qb2 = byP('QB')[1], k = byP('K')[0], wr1 = byP('WR')[0]; [ol, wr3, qb2, k, wr1].forEach(p => { p.o = 95; }); const ids2 = LG.starterIds(C, 0);
  ok(!LG.isStar(C, ol) && !LG.isStar(C, k), 'a 95 lineman or kicker is not a star');
  const wrs = byP('WR').filter(p => ids2[p.i]), bench = byP('WR').find(p => !ids2[p.i] && p.o === 95) || wr3; ok(wrs.every(p => LG.isStar(C, p) === (p.o >= 78)) && !LG.isStar(C, bench) || ids2[bench.i], 'a backup is not a star, however good');
  ol.mor = 10; ok(LG.moraleOf(C, ol) === 65, 'and has no morale of his own'); LG.setMorale(C, ol, -20); ok(ol.mor === 10, 'nothing moves it');
  const t = C.teams.find(x => !x.owner); ok(LG.rosterOf(C, t.id).filter(p => LG.isStar(C, p)).every(p => !!LG.starterIds(C, t.id)[p.i] && p.p !== 'OL'), 'the same on other teams');
  let g = 0, askedNon = 0, starMail = 0; while (C.phase !== 'offseason' && g++ < 90) { LG.runUntilHuman(C, 60); LG.weekGames(C).forEach(x => LG.simGame(C, x)); LG.advanceWeek(C); LG.checkFinal(C); if (C.press) { const s = C.players[C.press.star]; if (s && !LG.starterIds(C, s.t)[s.i]) askedNon++; } }
  ok(askedNon === 0, 'the press only asks about a real starter as your star');
  const ml = C.inbox.filter(m => m.kind === 'play'); ok(ml.every(m => { const q = C.players[m.pid]; return q && q.p !== 'OL' && q.p !== 'K' && q.p !== 'P'; }), 'linemen and kickers do not email about playing time');
  ok(ml.length > 0, 'but good backups do (' + ml.length + ' this season)');
  const b0 = C.morale.team, cm = ml.find(m => m.ans == null); if (cm) { const e0 = LG.mailAnswer(C, cm.id, 0); ok(e0 === null && C.morale.team >= b0 && C.players[cm.pid].prom === 2 && C.players[cm.pid].mor == null, 'promising a backup snaps is a promise, and it goes through team morale, not his'); }
  const hiBench = bench; hiBench.o = 89; hiBench.a = 25; const r = LG.progress(C); ok(!r.stars.filter(id => C.players[id] && C.players[id].t === 0).some(id => LG.isStar(C, C.players[id]) && (C.players[id].p === 'OL' || C.players[id].p === 'K')), 'and only stars are announced as superstars'); }
// below 78 is never a star, starter or not
{ const C = mk(21), ids = LG.starterIds(C, 0), wr = LG.rosterOf(C, 0).filter(p => ids[p.i] && p.p === 'WR').sort((a, b) => b.o - a.o)[0], was = wr.o; wr.o = 78; ok(LG.isStar(C, wr), 'a starter rated 78 is a star'); wr.o = 77; ok(!LG.isStar(C, wr) || !LG.starterIds(C, 0)[wr.i], 'a starter rated 77 is not'); wr.o = was; }
// leagues are untouched
{ const X = LG.newNFL({ seed: 7 }); ok(!X.camp && LG.teamsFor(X, 0, 1).a.squad.ff === 0, 'games outside a campaign have none of this'); }
// CPU teams re-sign their great players unless they cannot fit them under the cap or do not want to pay them (age, a rebuild)
{ const C = mk(31); let g = 0; while (C.phase !== 'offseason' && g++ < 60) { LG.runUntilHuman(C, 60); const x = LG.weekGames(C)[0]; if (x) LG.simGame(C, x); }
  const exp = Object.values(C.players).filter(p => p.t > 0 && p.cx != null && p.cx <= C.season), was = new Map(exp.map(p => [p.i, p.t])), mode = {}; C.teams.forEach(t => { mode[t.id] = t.mode; });
  const pay0 = {}; C.teams.forEach(t => { pay0[t.id] = LG.payroll(C, t.id); });
  LG.faStart(C, 7);
  const great = exp.filter(p => p.o >= 80), left = great.filter(p => p.t === -1), news = C.news.filter(n => /hits free agency/.test(n.t));
  const reason = p => { const t = C.teams[was.get(p.i)], m = mode[t.id]; return p.o < 88 && ((m === 'rebuild' && p.a >= 30) || (p.a >= 34 && m !== 'win')) ? 'age' : LG.payroll(C, t.id) + p.sal > LG.payrollCap(C) - 4 ? 'cap' : null; };
  ok(left.every(p => reason(p)), 'every great player who walks had a reason: ' + left.length + ' of ' + great.length + ' (' + left.filter(p => reason(p) === 'cap').length + ' the cap, ' + left.filter(p => reason(p) === 'age').length + ' age or a rebuild)');
  ok(left.filter(p => p.o >= 88).every(p => reason(p) === 'cap'), 'an elite player (88+) only walks when his team cannot fit him under the cap');
  ok(C.teams.filter(t => !t.owner).every(t => LG.payroll(C, t.id) <= Math.max(pay0[t.id], LG.payrollCap(C))), 'no CPU team goes over the cap re-signing its own');
  ok(left.filter(p => p.o >= 85).every(p => news.some(n => n.t.indexOf(p.n) === 0)), 'and the big names leaving make the news, with why: "' + (news[0] ? news[0].t : '') + '"'); }
// the stupid ones: an obscure law in the team's state, one game; and real players never get any of it
{ const C = mk(9), t = C.teams[1], fake = { i: 'g9', n: 'Dim Bulb', p: 'TE', o: 90, a: 24, t: 1, gen: 1 }; C.players.g9 = fake;
  LG.__suspend(C, fake, 4, () => 0.1); const a = C.news[0].t;
  ok(/obscure \w+( \w+)? law for/.test(a) && fake.sus === 1 && a.indexOf(LG.TEAM_STATE[t.abbr]) >= 0, 'a made-up player can break a dumb ' + LG.TEAM_STATE[t.abbr] + ' law, for one game: "' + a + '"');
  const fake2 = { i: 'g8', n: 'Bad News', p: 'WR', o: 90, a: 24, t: 1, gen: 1 }; C.players.g8 = fake2; LG.__suspend(C, fake2, 4, () => 0.9);
  const c2 = LG.CRIMES.find(c => C.news[0].t.indexOf(c[0]) >= 0), rg = c2 && LG.SUS_GAMES[c2[1]];
  ok(!/obscure/.test(C.news[0].t) && rg && fake2.sus >= rg[0] && fake2.sus <= rg[1], 'or something worse, as long as it deserves: "' + C.news[0].t + '"');
  // the worst ones are rare and cost years; the minor ones a game or two
  const E = require('./lib/engine.js'), R = E.mulberry32(5); let long = 0, short = 0, N = 2000, ex = '';
  for (let k = 0; k < N; k++) { const f = { i: 'gx' + k, n: 'Guy ' + k, p: 'LB', o: 85, a: 25, t: 2, gen: 1 }; C.players[f.i] = f; LG.__suspend(C, f, 3, R); if (f.sus >= 17) { long++; if (!ex) ex = C.news[0].t; } else if (f.sus <= 2) short++; delete C.players[f.i]; }
  ok(long > 0 && long < N * 0.15 && short > N * 0.4, 'serious ones cost seasons (' + long + ' of ' + N + ', e.g. "' + ex + '"); most are a game or two (' + short + ')');
  const real = Object.values(C.players).find(p => !p.gen && p.t >= 0); real.o = 90; LG.__suspend(C, real, 2, () => 0.1);
  ok(/conduct policy/.test(C.news[0].t) && !/obscure/.test(C.news[0].t), 'a real player still only gets the league line');
  ok(Object.keys(LG.TEAM_STATE).length === 32 && Object.values(LG.TEAM_STATE).every(s => LG.DUMB_LAWS[s] && LG.DUMB_LAWS[s].length >= 2), 'every team\'s state has its dumb laws'); }
