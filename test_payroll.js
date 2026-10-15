// Payroll: free agents have salaries and a team needs room under the cap to sign one (campaigns and custom leagues).
const LG = require('./lib/league.js'), DR = require('./lib/draft.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ user: 0, seed: 7 }); L.teams[0].owner = 'You';
const over = L.teams.filter(t => LG.capRoom(L, t.id) < 0).map(t => t.abbr);
ok(LG.payrollCap(L) === LG.PAYROLL_CAP && Math.abs(LG.payroll(L, 0) - LG.rosterOf(L, 0).reduce((s, p) => s + DR.salaryOfPos(p.p, p.o), 0)) < 0.2, 'a campaign team\'s payroll is the sum of its players\' salaries ($' + LG.payroll(L, 0) + 'M)');
ok(over.length > 0 && over.length <= 6, 'most real teams start under the $' + LG.PAYROLL_CAP + 'M cap; the priciest are over it (' + over.join(', ') + ')');
const fa = Object.values(L.players).filter(p => p.t === -1).sort((a, b) => b.o - a.o), star = fa[0];
ok(LG.salOf(star) > 5, 'free agents have salaries: ' + star.n + ' (' + star.p + ' ' + star.o + ') costs $' + LG.salOf(star) + 'M');
// make room on the roster for him
const me = 0; LG.release(L, me, LG.rosterOf(L, me).sort((a, b) => a.o - b.o)[0].i);
const room = LG.capRoom(L, me);
ok(room > LG.salOf(star) ? LG.signFA(L, me, star.i) === null && star.t === me : true, 'with room under the cap he can be signed');
if (star.t === me) LG.release(L, me, star.i);
// a team over the cap: the Rams
const ra = L.teams.find(t => t.abbr === 'LA').id; L.teams[ra].owner = 'Rival';
LG.release(L, ra, LG.rosterOf(L, ra).sort((a, b) => a.o - b.o)[0].i);
const msg = LG.signFA(L, ra, star.i);
ok(LG.capRoom(L, ra) < LG.salOf(star) && /costs \$[\d.]+M and you have \$[\d.]+M under the \$450M cap/.test(msg || ''), 'a team without room cannot sign him: "' + msg + '"');
// releasing salary makes room
for (const p of LG.rosterOf(L, ra).sort((a, b) => LG.salOf(b) - LG.salOf(a))) { if (LG.capRoom(L, ra) >= LG.salOf(star)) break; LG.release(L, ra, p.i); }   // the highest paid first (release refuses a needed starter)
ok(LG.capRoom(L, ra) >= LG.salOf(star) && LG.signFA(L, ra, star.i) === null, 'after releasing enough salary he signs');
// custom leagues: a draft league with a cap pays against its own cap; others against the NFL-sized one
const C = LG.newCustom({ entry: 'draft', cap: 315, cpus: true, games: 4, playoffs: 0, rounds: 14 }, 'm'); for (let i = 0; i < 4; i++) LG.addTeam(C, { name: 'C' + i }); LG.startCustom(C); LG.finalizeLeagueDraft(C);
ok(LG.payrollCap(C) === 315, 'a draft league with a $315M cap uses it for payroll too');
const N = LG.newCustom({ entry: 'nfl', cpus: true, games: 4, playoffs: 0 }, 'm'); for (let i = 0; i < 4; i++) LG.addTeam(N, { name: 'N' + i }); LG.startCustom(N);
ok(LG.payrollCap(N) === LG.PAYROLL_CAP, 'an NFL-team league uses the $' + LG.PAYROLL_CAP + 'M cap');
console.log('ALL DONE');
