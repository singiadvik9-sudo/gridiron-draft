// Special teams you play yourself: the try after a touchdown (kick or go for two from the 2), and the kick meter for field goals,
// extra points and kickoffs. Plus sub-ratings and the defender you start a snap as.
const E = require('./lib/engine.js'); require('./lib/live.js'); const LV = E.LIVE, LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ seed: 5 }), T = LG.teamsFor(L, 3, 9), U = { a: E.teamUnits(T.a), b: E.teamUnits(T.b) };
const step = (st, op, dp, fl, lv) => E.stepGame(st, T, U, 42, op, dp || 'ZONE', lv || null, fl || null);
// a touchdown is followed by a try of its own
const tdState = () => { for (let i = 0; i < 400; i++) { const r = step(Object.assign(E.initState(1), { poss: 'a', ballOn: 97, toGo: 3, playNo: i }), 'DIVE', 'ZONE'); if (r.entry.ev === 'td') return r; } };
const td = tdState();
ok(td && td.state.pat && td.state.pat.t === 'a' && td.state.ballOn === 98 && !td.state.kick && td.state.score.a === 6, 'a touchdown is worth 6 and sets up the try from the 2 (no kickoff yet)');
const pat = td.state;
ok(E.offOptions(pat).some(o => o.id === 'XP') && E.offOptions(pat).some(o => o.id === 'PASS_S') && !E.offOptions(pat).some(o => o.id === 'PUNT' || o.id === 'FG' || o.id === 'KNEEL'), 'on the try you can kick the extra point or call any run or pass (no punts, field goals or kneels)');
ok(E.noDef('XP') && E.legalOff(pat, 'PUNT') === 'XP' && E.legalOff(pat, 'SLANTS_X') === 'XP', 'the extra point needs no defensive call; anything else illegal becomes the kick');
// the meter decides an extra point you kick yourself
const win = E.kickWin(U.a.kac, E.XP_DIST);
const xpIn = step(pat, 'XP', null, { kt: Math.max(0, win - 1) }), xpOut = step(pat, 'XP', null, { kt: Math.min(100, win + 8) });
ok(xpIn.entry.ev === 'xp' && xpIn.state.score.a === 7 && xpIn.state.kick && xpIn.state.kick.k === 'a', 'stop the meter in the green: the extra point is good, then the kickoff (window ' + win + ')');
ok(xpOut.entry.ev === 'xpmiss' && xpOut.state.score.a === 6 && xpOut.state.kick, 'outside the green it misses: ' + xpOut.entry.text);
ok(xpIn.state.clock === pat.clock, 'the try takes no time off the clock');
// going for two is a real play from the 2
let two = 0, tries = 0;
for (let i = 0; i < 300; i++) { const r = step(Object.assign({}, pat, { playNo: 500 + i }), ['DIVE', 'PASS_S', 'RUN_OUT', 'MESH'][i % 4], ['GOALLINE', 'MAN', 'ZONE', 'TIGHT', 'STACK'][i % 5]); tries++; if (r.entry.two > 0) two++; if (!r.state.kick || r.state.pat) { two = -999; break; } }
ok(two / tries > 0.3 && two / tries < 0.7, 'going for two is played out from the 2 and works about half the time (' + Math.round(100 * two / tries) + '%), always followed by the kickoff');
const twoGood = (() => { for (let i = 0; i < 100; i++) { const r = step(Object.assign({}, pat, { playNo: 900 + i }), 'DIVE', 'ZONE'); if (r.entry.two > 0) return r; } })();
ok(twoGood.state.score.a === 8 && twoGood.entry.pts === 2, 'a good try is two points: ' + twoGood.entry.text);
// on the field: a live snap from the 2 that scores is the conversion
{ const lv = { k: 'run', x: 3, td: true, who: 'HB', t: 30 }; const r = step(pat, 'RUN_IN', 'ZONE', null, lv); ok(r.entry.two > 0 && r.state.score.a === 8 && r.state.kick, 'a snap played on the field that gets in is the two-point conversion'); }
// the CPU: kicks unless the chart says go
{ const st = Object.assign({}, pat, { q: 4, score: { a: 12, b: 14 } }), st2 = Object.assign({}, pat, { q: 1 });
  ok(E.cpuMove(st, U, 'a', 3, 'off') !== 'XP' && E.cpuMove(st2, U, 'a', 3, 'off') === 'XP', 'the CPU goes for two by the chart (down 2 late) and kicks otherwise'); }
// a touchdown as time runs out: the try is still played, then the half (or the game) ends
{ let r = null; for (let i = 0; i < 400 && !r; i++) { const x = step(Object.assign(E.initState(1), { poss: 'a', ballOn: 97, toGo: 3, q: 2, clock: 2, playNo: i }), 'DIVE', 'ZONE'); if (x.entry.ev === 'td') r = x; }
  ok(r.state.pat && r.state.clock === 0 && r.state.q === 2, 'a touchdown at the end of the half: the clock reads 0:00 and the try is next');
  const after = step(r.state, 'XP', null, { kt: 0 });
  ok(after.state.q === 3 && after.entry.half && after.state.score.a === 7, 'after the try, halftime'); }
// field goals: the meter and the kicker's range
{ const st = Object.assign(E.initState(1), { ballOn: 70, down: 4, toGo: 6 }), dist = E.fgDist(st), w = E.kickWin(U.a.kac, dist);
  const good = step(st, 'FG', null, { kt: 0 }), miss = step(st, 'FG', null, { kt: Math.min(100, w + 5) });
  ok(good.entry.ev === 'fg' && miss.entry.ev === 'fgmiss', 'a ' + dist + '-yard field goal: dead centre is good, off the green misses (' + miss.entry.text + ')');
  ok(E.kickWin(90, 40) > E.kickWin(65, 40) && E.kickWin(80, 55) < E.kickWin(80, 30), 'a more accurate kicker gets a wider green, a longer kick a narrower one');
  const weak = { a: Object.assign({}, U.a, { kpw: 62 }), b: U.b }, far = Object.assign(E.initState(1), { poss: 'a', ballOn: 100 - (E.kickRange(62) + 4 - 17), down: 4, toGo: 8 });
  const f = E.stepGame(far, T, weak, 42, 'FG', 'ZONE', null, { kt: 0 });
  ok(E.fgDist(far) > E.kickRange(62) ? f.entry.ev === 'fgmiss' && /short/.test(f.entry.text) : true, 'beyond his leg it comes up short however well he strikes it: ' + f.entry.text);
  ok(E.kickRange(95) > E.kickRange(70), 'a stronger leg kicks it further (' + E.kickRange(70) + ' vs ' + E.kickRange(95) + ' yards)'); }
// kickoffs: in the green deep, way off out of bounds at the 40
{ const st = Object.assign(E.initState(1), { kick: { k: 'a', r: 'b' }, poss: 'a', ballOn: 35 }), w = E.kickWin(U.a.kac, 30);
  const wild = step(st, 'KO', null, { kt: 100 }); ok(wild.state.poss === 'b' && wild.state.ballOn === 40 && /out of bounds/.test(wild.entry.text), 'a kickoff way off the mark sails out of bounds: they start at the 40');
  let deep = 0, short = 0; for (let i = 0; i < 200; i++) { const s2 = Object.assign({}, st, { playNo: i }); deep += step(s2, 'KO', null, { kt: 0 }).state.ballOn; short += step(s2, 'KO', null, { kt: Math.min(100, Math.ceil(w * 1.6)) }).state.ballOn; }
  ok(deep / 200 < short / 200 - 3, 'a kickoff in the green pins them deeper than one a little off (start at the ' + Math.round(deep / 200) + ' vs ' + Math.round(short / 200) + ')'); }
// the move flags reach the engine through the server's cleaning
ok(JSON.stringify(E.cleanMoves({ '3-a': { pick: 'FG', kt: 12 }, '4-b': { pick: 'MAN', ctl: 1, dp: 'RCB' }, '5-a': { pick: 'FG', kt: 400, dp: 'x<y' } }, null)) === '{"3-a":{"pick":"FG","kt":12},"4-b":{"pick":"MAN","ctl":1,"dp":"RCB"},"5-a":{"pick":"FG"}}', 'the server keeps the kick meter and the defender spot with a move, and drops bad ones');
// a replayed game uses the recorded meter
{ const seed = 31; let st = E.initState(seed), moves = {};
  for (let g = 0; g < 400 && !st.over; g++) { const n = st.playNo, o = st.poss, d = o === 'a' ? 'b' : 'a', pick = E.cpuMove(st, U, o, seed, 'off');
    moves[n + '-' + o] = Object.assign({ pick }, o === 'a' && (pick === 'XP' || pick === 'FG' || pick === 'KO') ? { kt: 0 } : {}); if (!E.noDef(E.legalOff(st, pick))) moves[n + '-' + d] = { pick: E.cpuMove(st, U, d, seed, 'def') };
    st = E.replay(seed, T, moves, []).state; }
  const log = E.replay(seed, T, moves, []).log, xps = log.filter(e => e.off === 'a' && e.offPick === 'XP');
  ok(st.over && xps.length > 0 && xps.every(e => e.ev === 'xp' && e.kt === 0), 'a whole game replays with the meter: every extra point struck dead centre is good (' + xps.length + ')'); }
// sub-ratings: every position has its own, they stay put and follow the overall
{ const wr = E.subsOf('WR', { i: 'p1', o: 88, s: 94 }), wr2 = E.subsOf('WR', { i: 'p1', o: 88, s: 94 }), k = E.subsOf('K', { i: 'k1', o: 84 });
  ok(JSON.stringify(wr) === JSON.stringify(wr2) && wr.SPD === 94 && wr.CTH && wr.CIT && k.KPW && k.KAC, 'sub-ratings: speed, catching, catch in traffic for a receiver; power and accuracy for a kicker, the same every time');
  const chase = E.subsOf('WR', { n: "Ja'Marr Chase", o: 99, s: 96 }), lane = E.subsOf('OL', { n: 'Lane Johnson', o: 99 });
  ok(!chase.est && chase.CTH === 98 && chase.CIT === 94 && chase.DRR === 98 && !lane.est, "real players have Madden's own numbers (Ja'Marr Chase: catching 98, in traffic 94, deep routes 98)");
  const grown = E.subsOf('WR', { n: "Ja'Marr Chase", o: 94, s: 96 }); ok(grown.CTH === 93 && grown.SPD === 96, 'they move with his overall (5 down: catching 93), his body does not (speed stays 96)');
  const est = o => E.subsOf('WR', { i: 'zz9', n: 'Made Up Rookie', o, s: 88 });
  ok(est(70).est && est(85).CTH > est(70).CTH + 6, 'a player Madden does not rate gets an estimate fitted on every Madden receiver: catching ' + est(70).CTH + ' at 70, ' + est(85).CTH + ' at 85');
  const cov = Object.keys(E.DATA.ATTR).length; ok(cov > 1700, cov + ' players carry their Madden attributes');
  const all = ['QB', 'HB', 'WR', 'TE', 'OL', 'LDE', 'NT', 'MLB', 'RCB', 'FS', 'K', 'P'].every(p => Object.keys(E.subsOf(p, { i: 'z', o: 75 })).length >= 2); ok(all, 'every position has its own set'); }
// the defender you pick before the snap is the one you play
{ const sq = LG.teamsFor(L, 1, 2);
  const mk = dpos => LV.create({ seed: 1, playNo: 1, ballOn: 40, toGo: 10, offPick: 'PASS_M', defPick: 'ZONE', OS: sq.a.squad, DS: sq.b.squad, ctlO: false, ctlD: true, dpos });
  const s0 = mk(null), s1 = mk('RCB'), s2 = mk('LDE');
  ok(s1.by[s1.ctlId.d].pos === 'RCB' && /DE|EDGE/.test(s2.by[s2.ctlId.d].pos) && s0.by[s0.ctlId.d].grp === 'LB', 'pick a spot before the snap and you start as him (RCB, left end); Auto is the middle linebacker');
  const D34 = LG.teamsFor(L, L.teams.findIndex(t => LG.teamsFor(L, t.id, 0).a.squad.df.sch === '34'), 0).a.squad;
  const s3 = LV.create({ seed: 1, playNo: 1, ballOn: 40, toGo: 10, offPick: 'PASS_M', defPick: 'ZONE', OS: sq.a.squad, DS: D34, ctlO: false, ctlD: true, dpos: 'MLB' });
  ok(s3.by[s3.ctlId.d].grp === 'LB', 'a 3-4 has no MLB: you get the nearest inside linebacker (' + s3.by[s3.ctlId.d].pos + ')'); }
