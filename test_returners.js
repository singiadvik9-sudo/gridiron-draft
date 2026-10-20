// No returner position: teams designate one of their backs, receivers or corners to return kicks and punts.
const E = require('./lib/engine.js'), DR = require('./lib/draft.js'), LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
// campaign / leagues
const L = LG.newNFL({ user: 0, seed: 7 }); L.teams[0].owner = 'You';
ok(!Object.values(L.players).some(p => p.p === 'KR' || p.p === 'PR'), 'nobody is listed as a kick or punt returner any more');
ok(L.teams.every(t => { const r = LG.returnerOf(L, t.id); return r && LG.RET_POS[r.p] && r.t === t.id; }), 'every team has a returner from its own backs, receivers and corners');
const c0 = LG.returnerCands(L, 0), best = LG.returnerOf(L, 0);
ok(best === c0[0] && c0.every(p => LG.retRating(p) <= LG.retRating(best)), 'by default it is the best returner (' + best.p + ' ' + best.n + ', ' + LG.retRating(best) + ')');
const other = c0.find(p => p.p !== best.p) || c0[1];
ok(LG.setReturner(L, 0, other.i) === null && LG.returnerOf(L, 0) === other, 'the coach can name someone else (' + other.p + ' ' + other.n + ')');
const sq = LG.squadOf(L, 0);
ok(sq.kr.n === other.n && sq.pr.n === other.n && sq.kr.o === LG.retRating(other), 'he returns kicks and punts in the game');
const qb = LG.rosterOf(L, 0).find(p => p.p === 'QB');
ok(LG.setReturner(L, 0, qb.i) !== null && LG.returnerOf(L, 0) === other, 'a quarterback cannot be the returner');
ok(LG.setReturner(L, 0, null) === null && LG.returnerOf(L, 0) === best, 'and the choice can go back to the best');
LG.setReturner(L, 0, other.i); LG.release(L, 0, other.i);
ok(other.t !== 0 ? LG.returnerOf(L, 0) === best : true, 'if he leaves the team the best one takes over');
// older saves: a player listed as KR still returns
const O = LG.newNFL({ seed: 3 }); const w = LG.rosterOf(O, 2).find(p => p.p === 'WR'); w.p = 'KR'; w.o = 99; w.rt = undefined;
ok(LG.returnerOf(O, 2) === w, 'in an older save a player listed as KR still returns kicks');
// quick game: 9 picks and a returner
ok(DR.ROUNDS === 9 && DR.KINDS.indexOf('PR') < 0 && DR.KINDS.indexOf('KR') < 0, 'the quick-game draft is 9 picks, with no returner picks');
const d = DR.newDraft(2, 0, 0); while (!DR.isDone(d)) { const t = DR.onClock(d); DR.apply(d, t, DR.cpuPick(d, t)); }
const r = DR.toRoster(DR.teamIds(d, 0)), rc = E.returnerCands(r);
ok(r.length === 10 && E.validRoster(r) && r[9] === E.bestReturner(r), 'a drafted roster names its best returner (' + E.RET_FROM[r[9]] + ' ' + rc[r[9]].n + ', ' + rc[r[9]].rt + ')');
const pick = rc.findIndex((x, i) => x && i !== r[9]), r2 = DR.toRoster(DR.teamIds(d, 0), pick), s2 = E.squadFromRoster(r2);
ok(r2[9] === pick && s2.kr.n === rc[pick].n && s2.pr.n === rc[pick].n, 'or the one the person picks (' + E.RET_FROM[pick] + ' ' + rc[pick].n + ')');
ok(rc.slice(3).some(Boolean) && rc.slice(3).every(x => !x || x.s >= 80), 'the defense\'s starting corners can return too, with their speed');
ok(!E.validRoster(r.slice(0, 9).concat([7])), 'a returner index that does not exist is rejected');
// older rosters still load
const old = [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], 0, 0, r[8]];
ok(E.validRoster(old) && E.squadFromRoster(old).kr && E.normRoster(old).length === 10, 'an older 11-slot roster (with returner picks) still makes a squad');
const old7 = r.slice(0, 7); ok(E.validRoster(old7) && E.squadFromRoster(old7).kr, 'and so does the original 7-slot roster');
const auto = E.autoDraft(E.mulberry32(5)); ok(auto.length === 10 && E.validRoster(auto), 'the CPU\'s tournament roster has a returner too');
// a whole game with designated returners
const T = { a: { name: 'A', squad: E.squadFromRoster(r2) }, b: { name: 'B', squad: LG.squadOf(L, 3) } }, R = E.replay(12345, T, {}, ['a', 'b']);
ok(R.state.over && R.log.some(e => e.ev === 'kickoff' || e.ev === 'punt'), 'a full game plays with them returning kicks and punts');
console.log('ALL DONE');
