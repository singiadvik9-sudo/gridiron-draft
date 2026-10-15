// Shopping for a position: CPU teams offer a player there for the cheapest fair package of your players and picks.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ user: 0, seed: 11 }); L.teams[0].owner = 'You'; LG.runUntilHuman(L, 60);
const me = 0, fr = LG.strengthFrac(L), val = ids => ids.reduce((t, id) => t + LG.assetValue(L, id, fr), 0);
for (const pos of ['QB', 'WR', 'CB', 'OL']) {
  const offers = LG.cpuOffers(L, me, pos);
  ok(offers.length > 0, pos + ': some teams offer one (' + offers.length + ')');
  ok(offers.every(o => o.get.length === 1 && L.players[o.get[0]].p === pos && L.players[o.get[0]].t === o.t), pos + ': each offer brings a ' + pos + ' from that team');
  ok(offers.every(o => o.give.every(id => LG.isPick(id) || (L.players[id].t === me && L.players[id].p !== pos))), pos + ': you never send a ' + pos + ' back, only your own players and picks');
  ok(new Set(offers.map(o => o.t)).size === offers.length && offers.every(o => !L.teams[o.t].owner), pos + ': one offer per CPU team');
  ok(offers.every(o => LG.cpuTrade(L, me, o.t, o.give, o.get).ok), pos + ': every offer is one the CPU accepts');
  ok(offers.every(o => val(o.give) <= val(o.get) * 1.5 + 0.01), pos + ': no offer costs more than 1.5x the player\'s value');
}
const any = LG.cpuOffers(L, me), anyBad = LG.cpuOffers(L, me, 'XX');
ok(JSON.stringify(any) === JSON.stringify(anyBad), 'no position (or an unknown one) gives the usual mixed offers');
// accepting one goes through like any other trade
const o = LG.cpuOffers(L, me, 'WR')[0];
const r = LG.cpuTrade(L, me, o.t, o.give, o.get); if (r.ok) LG.doTrade(L, me, o.t, o.give, o.get);
ok(r.ok && L.players[o.get[0]].t === me, 'accepting an offer brings the player over');
console.log('ALL DONE');
