// Trading block: put players up for trade, CPU teams bid for them, accepting a bid trades him away.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ user: 0, seed: 11 }); L.teams[0].owner = 'You'; LG.runUntilHuman(L, 60);
const me = 0, ro = LG.rosterOf(L, me).sort((a, b) => b.o - a.o), fr = LG.strengthFrac(L), val = ids => ids.reduce((t, id) => t + LG.assetValue(L, id, fr), 0);
const star = ro[0], mid = ro[5];
ok(LG.blockOf(L, me).length === 0, 'the block starts empty');
ok(LG.setBlock(L, me, star.i, true) === null && LG.setBlock(L, me, mid.i, true) === null, 'players can be put on the block');
ok(LG.blockOf(L, me).join() === [star.i, mid.i].join(), 'the block lists them');
ok(LG.setBlock(L, me, LG.rosterOf(L, 3)[0].i, true) !== null, 'someone else\'s player cannot be put on your block');
ok(LG.setBlock(L, me, mid.i, true) === null && LG.blockOf(L, me).length === 2, 'putting him on twice keeps one entry');
const extra = ro.slice(10, 10 + LG.BLOCK_MAX); extra.forEach(p => LG.setBlock(L, me, p.i, true));
ok(LG.blockOf(L, me).length === LG.BLOCK_MAX, 'the block holds at most ' + LG.BLOCK_MAX);
extra.forEach(p => LG.setBlock(L, me, p.i, false));
ok(LG.blockOf(L, me).join() === [star.i, mid.i].join(), 'players come off the block');
const t0 = Date.now(), B = LG.blockBids(L, me), ms = Date.now() - t0;
ok(B.length === 2 && B[0].id === star.i, 'bids come back for each player on the block (' + ms + 'ms)');
ok(B.every(b => b.bids.length > 0), 'CPU teams bid for both (' + B.map(b => b.bids.length).join(', ') + ' bids)');
ok(B.every(b => b.bids.every(x => !L.teams[x.t].owner && x.get.every(id => LG.isPick(id) ? LG.pickOf_(L, id).t === x.t : L.players[id].t === x.t))), 'each bid is a CPU team offering its own players or picks');
ok(B.every(b => b.bids.every(x => LG.cpuTrade(L, me, x.t, [b.id], x.get).ok)), 'every bid is one the CPU accepts');
ok(B.every(b => b.bids.every(x => val(x.get) <= val([b.id]) * 1.3 + 0.01)), 'no bid is worth more than 1.3x the player');
ok(B.every(b => b.bids.every((x, i, a) => i === 0 || val(a[i - 1].get) >= val(x.get) - 0.01)), 'best bids first');
// accepting a bid trades him away, and he leaves the block
const x = B[1].bids[0];
LG.doTrade(L, me, x.t, [B[1].id], x.get);
ok(L.players[mid.i].t === x.t && LG.blockOf(L, me).join() === star.i, 'a traded player drops off the block');
const cut = LG.rosterOf(L, me).sort((a, b) => a.o - b.o).find(p => LG.setBlock(L, me, p.i, true) === null && LG.release(L, me, p.i) === null);
ok(cut && LG.blockOf(L, me).indexOf(cut.i) < 0 && LG.blockOf(L, me).join() === star.i, 'a released player drops off the block');
console.log('ALL DONE');
