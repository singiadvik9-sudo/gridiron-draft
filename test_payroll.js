// Payroll: free agents have salaries and a team needs room under the cap to sign one (campaigns and custom leagues).
const LG = require('./lib/league.js'), DR = require('./lib/draft.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const L = LG.newNFL({ user: 0, seed: 7 }); L.teams[0].owner = 'You';
const over = L.teams.filter(t => LG.capRoom(L, t.id) < 0).map(t => t.abbr);
ok(LG.payrollCap(L) === LG.PAYROLL_CAP && LG.PAYROLL_CAP === 375 && Math.abs(LG.payroll(L, 0) - LG.rosterOf(L, 0).reduce((s, p) => s + LG.salOf(p), 0)) < 0.2, 'a campaign team\'s payroll is the sum of its players\' salaries ($' + LG.payroll(L, 0) + 'M)');
ok(over.length > 0 && over.length <= 6, 'most real teams start under the $' + LG.PAYROLL_CAP + 'M cap; the priciest are over it (' + over.join(', ') + ')');
const fa = Object.values(L.players).filter(p => p.t === -1).sort((a, b) => b.o - a.o), star = fa[0];
ok(LG.salOf(star) > 5, 'free agents have salaries: ' + star.n + ' (' + star.p + ' ' + star.o + ') costs $' + LG.salOf(star) + 'M');
// make room on the roster for him
const me = 0; LG.release(L, me, LG.rosterOf(L, me).sort((a, b) => a.o - b.o)[0].i);
const room = LG.capRoom(L, me);
ok(room > LG.salOf(star) ? LG.signFA(L, me, star.i) === null && star.t === me : true, 'with room under the cap he can be signed');
if (star.t === me) LG.release(L, me, star.i);
// a team over the cap: the one with the biggest payroll
const ra = L.teams.slice().sort((a, b) => LG.payroll(L, b.id) - LG.payroll(L, a.id))[0].id; L.teams[ra].owner = 'Rival';
LG.release(L, ra, LG.rosterOf(L, ra).sort((a, b) => a.o - b.o)[0].i);
const msg = LG.signFA(L, ra, star.i);
ok(LG.capRoom(L, ra) < LG.salOf(star) && /costs \$[\d.]+M and you have \$[\d.]+M under the \$375M cap/.test(msg || ''), 'a team without room cannot sign him: "' + msg + '"');
// releasing salary makes room
for (const p of LG.rosterOf(L, ra).sort((a, b) => LG.salOf(b) - LG.salOf(a))) { if (LG.capRoom(L, ra) >= LG.salOf(star)) break; LG.release(L, ra, p.i); }   // the highest paid first (release refuses a needed starter)
ok(LG.capRoom(L, ra) >= LG.salOf(star) && LG.signFA(L, ra, star.i) === null, 'after releasing enough salary he signs');
// custom leagues: a draft league with a cap pays against its own cap; others against the NFL-sized one
const C = LG.newCustom({ entry: 'draft', cap: 230, cpus: true, games: 4, playoffs: 0, rounds: 14 }, 'm'); for (let i = 0; i < 4; i++) LG.addTeam(C, { name: 'C' + i }); LG.startCustom(C); LG.finalizeLeagueDraft(C);
ok(LG.payrollCap(C) === 230, 'a draft league with a $230M cap uses it for payroll too');
const N = LG.newCustom({ entry: 'nfl', cpus: true, games: 4, playoffs: 0 }, 'm'); for (let i = 0; i < 4; i++) LG.addTeam(N, { name: 'N' + i }); LG.startCustom(N);
ok(LG.payrollCap(N) === LG.PAYROLL_CAP, 'an NFL-team league uses the $' + LG.PAYROLL_CAP + 'M cap');
// real salaries: players carry their real contract, everyone else the real market for his position and rating
const allen = Object.values(L.players).find(p => p.n === 'Josh Allen'), gar = Object.values(L.players).find(p => p.n === 'Myles Garrett');
ok(allen.sal === 55 && allen.cx === 2030 && gar.sal === 40, 'players are paid their real contracts (Josh Allen $55M through 2030, Myles Garrett $40M)');
const D = require('./lib/data.json'), curve = ['QB', 'WR', 'DL', 'CB'].every(g => D.SAL[g].every((v, i, a) => i === 0 || v >= a[i - 1]));
ok(curve && DR.salaryOfPos('QB', 95) > DR.salaryOfPos('QB', 80) && DR.salaryOfPos('QB', 99) <= 70 && DR.salaryOfPos('WR', 50) < 2, 'the market curve rises with rating and stays in real ranges (QB 95: $' + DR.salaryOfPos('QB', 95) + 'M, WR 50: $' + DR.salaryOfPos('WR', 50) + 'M)');
const made = Object.values(L.players).find(p => p.sal == null);
ok(!made || LG.salOf(made) === DR.salaryOfPos(made.p, made.o), 'a made-up player is paid the market price');
// a contract that runs out is re-signed at the market price for the new rating
const P = LG.newNFL({ seed: 9 }), ex = Object.values(P.players).find(p => p.cx === 2026 && p.t >= 0 && p.a < 30);
LG.progress(P);
ok(ex && ex.cx > 2026 && ex.cx <= 2030 && ex.sal === DR.salaryOfPos(ex.p, ex.o), 'when his contract ends he re-signs at the market price (' + ex.n + ': $' + ex.sal + 'M through ' + ex.cx + ')');
console.log('ALL DONE');
