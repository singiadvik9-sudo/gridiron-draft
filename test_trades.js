// Trades make sense: CPU teams judge a deal by their own depth chart, keep their key players, and deals fill needs on both sides. You can shop for draft picks.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 21, user: 0 }); L.teams[0].owner = 'You';
const me = 0, allen = Object.values(L.players).find(p => p.n === 'Josh Allen' && p.p === 'QB'), buf = allen.t;
const startersOf = tid => { const s = new Set(); Object.values(LG.lineup(L, tid)).forEach(a => a.forEach(p => s.add(p.i))); return s; };
const backups = tid => { const s = startersOf(tid); return LG.rosterOf(L, tid).filter(p => !s.has(p.i)).sort((a, b) => LG.playerValue(b) - LG.playerValue(a)); };
// no pile of backups buys a franchise quarterback, from any team (this was six backups, from all 31)
let bought = 0; L.teams.forEach(t => { if (t.id === buf) return; const b = backups(t.id); for (let k = 1; k <= b.length; k++) if (LG.cpuTrade(L, t.id, buf, b.slice(0, k).map(p => p.i), [allen.i]).ok) { bought++; break; } });
ok(bought === 0, 'no team can buy Josh Allen with its backups');
// a stack of safeties, however good: move the league's best ones to one team
{ const S = Object.values(L.players).filter(p => p.p === 'S' && p.t >= 0 && p.t !== buf).sort((a, b) => LG.playerValue(b) - LG.playerValue(a)).slice(0, 8), was = S.map(p => p.t); S.forEach(p => { p.t = me; });
  const r = LG.tradeEval(L, buf, S.map(p => p.i), [allen.i]); ok(/starting quarterback/.test(r.why || ''), 'nor with the eight best safeties in the league: "' + r.why + '"'); S.forEach((p, i) => { p.t = was[i]; }); }
// not when he is hurt, and not for picks alone
{ allen.inj = LG.SEASON_OUT; const b = backups(me); ok(!LG.cpuTrade(L, me, buf, b.slice(0, 4).map(p => p.i), [allen.i]).ok, 'nor when he is out for the season'); delete allen.inj; }
const r1s = LG.picksOf(L, me).filter(k => k.r <= 2).map(LG.pickId);
ok(!LG.cpuTrade(L, me, buf, r1s, [allen.i]).ok, 'nor for every first- and second-round pick you own (' + r1s.length + ')');
// a comparable starter coming back opens the door to talk: the refusal is no longer about the quarterback
{ const q = Object.values(L.players).find(p => p.n === 'Matthew Stafford'), was = q.t; q.t = me; const r = LG.tradeEval(L, buf, [q.i], [allen.i]); ok(!/starting quarterback/.test(r.why || ''), 'a comparable QB coming back is at least a conversation' + (r.why ? ': "' + r.why + '"' : '')); q.t = was; }
// a team already set at a position does not want your backup there
{ const t = L.teams.find(t => t.id !== me && !t.owner && LG.teamNeeds(L, t.id).deep.indexOf('S') >= 0 && LG.teamNeeds(L, t.id).needs.indexOf('S') < 0) || L.teams[1];
  const old = LG.rosterOf(L, me).filter(p => p.p === 'S' && p.a >= 27).sort((a, b) => a.o - b.o)[0], low = LG.rosterOf(L, t.id).filter(p => p.p !== 'QB').sort((a, b) => a.o - b.o)[0];
  const r = old && LG.cpuTrade(L, me, t.id, [old.i], [low.i]); ok(!old || !r.ok, 'a team set at safety turns down a spare one: "' + (r && r.msg) + '"'); }
// fair deals still happen: a good starter they need, for a fair pick
{ const fr = LG.strengthFrac(L); let done = 0, tried = 0;
  L.teams.forEach(t => { if (t.id === me || t.owner) return; const q = LG.teamNeeds(L, t.id).needs.find(x => x !== 'QB' && x !== 'K' && x !== 'P'); if (!q) return; const mine = LG.rosterOf(L, me).filter(p => p.p === q).sort((a, b) => b.o - a.o)[0]; if (!mine) return;
    const pk = LG.picksOf(L, t.id).filter(k => LG.pickOpen(L, k) && k.r >= 4)[0]; if (!pk) return; tried++; if (LG.cpuTrade(L, me, t.id, [mine.i], [LG.pickId(pk)], fr).ok) done++; });
  ok(tried > 10 && done / tried > 0.7, 'a team pays a late pick for a good player where it has a need (' + done + ' of ' + tried + ')'); }
// offers fill your needs and leave your lineup whole
{ const needs = LG.teamNeeds(L, me).needs, off = LG.cpuOffers(L, me), st = startersOf(me), lineupAfter = o => { const was = o.give.filter(i => !LG.isPick(i)).map(i => [L.players[i], L.players[i].t]); was.forEach(x => { x[0].t = -9; }); const a = LG.lineup(L, me); was.forEach(x => { x[0].t = x[1]; }); return a; };
  ok(needs.length > 0 && off.length > 0 && off.every(o => needs.indexOf(L.players[o.get[0]].p) >= 0), 'CPU offers go after your biggest needs: ' + needs.slice(0, 3).join(', ') + ' (' + off.map(o => L.players[o.get[0]].p).join(', ') + ')');
  ok(off.every(o => { const a = lineupAfter(o); return o.give.every(i => LG.isPick(i) || !st.has(i) || a[L.players[i].p].every(x => x.o >= L.players[i].o - 3)); }), 'and pay with what you can spare (a starter only when his backup can step in)');
  const fr = LG.strengthFrac(L), val = ids => ids.reduce((t, id) => t + LG.assetValue(L, id, fr), 0);
  ok(off.concat(LG.cpuOffers(L, me, 'WR')).every(o => val(o.give) <= val(o.get) * 1.5 + 0.01), 'no offer asks you to badly overpay');
  ok(!off.some(o => o.give.indexOf(Object.values(L.players).find(p => p.n === 'Trey McBride').i) >= 0 && L.players[o.get[0]].o < 90), 'no more Trey McBride for a 78'); }
// shopping for picks
for (const [k, f] of [['R1', x => x.r === 1], ['R2', x => x.r === 2], ['RL', x => x.r >= 4], ['PICK', () => true]]) {
  const o = LG.cpuOffers(L, me, k);
  ok(o.length > 0 && o.every(x => x.get.length === 1 && LG.isPick(x.get[0]) && LG.pickOf_(L, x.get[0]).t === x.t && f(LG.pickOf_(L, x.get[0]))), k + ': teams name a pick of that kind that is theirs (' + o.length + ')');
  ok(o.every(x => LG.cpuTrade(L, me, x.t, x.give, x.get).ok && x.give.every(i => LG.isPick(i) ? LG.pickOf_(L, i).t === me : L.players[i].t === me)), k + ': every one is a deal the CPU accepts, paid with what is yours');
}
{ const o = LG.cpuOffers(L, me, 'R1')[0], k = LG.pickOf_(L, o.get[0]); LG.doTrade(L, me, o.t, o.give, o.get); ok(k.t === me, 'taking one brings the pick over'); }
// a team does not spend its picks on a player near the end of his career
{ const old = { i: 'zz', n: 'Old Vet', p: 'WR', o: 88, a: 34, pt: 88, t: me }, yng = { i: 'zy', n: 'Young Vet', p: 'WR', o: 88, a: 27, pt: 88, t: me }; L.players.zz = old; L.players.zy = yng;
  const t = L.teams.find(x => x.id !== me && !x.owner), pk = LG.pickId(LG.picksOf(L, t.id).filter(k => LG.pickOpen(L, k))[0]);
  ok(LG.tradeEval(L, t.id, ['zz'], [pk]).worth < LG.tradeEval(L, t.id, ['zy'], [pk]).worth - 5, 'a 34-year-old fetches far less in picks than the same player at 27'); delete L.players.zz; delete L.players.zy; }
ok(LG.playerValue({ p: 'QB', o: 90, a: 33, pt: 90 }) > LG.playerValue({ p: 'WR', o: 90, a: 33, pt: 90 }), 'quarterbacks hold their value longer than anyone');
