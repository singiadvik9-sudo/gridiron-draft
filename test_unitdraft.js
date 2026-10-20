// Custom league drafts made from now on take whole O-lines and defenses as one pick each; the rest one player at a time.
const LG = require('./lib/league.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const mk = (cfg, n, owners) => { const L = LG.newCustom(Object.assign({ entry: 'draft', cpus: true, games: 6, playoffs: 2 }, cfg), 'mgr'); for (let i = 0; i < n; i++) LG.addTeam(L, { owner: i < owners ? 'u' + i : null, name: 'Club' + i }); const e = LG.startCustom(L); if (e) throw new Error(e); return L; };
const L = mk({ rounds: 16, cap: 260 }, 6, 1), d = L.draft;
ok(L.cfg.units === true && d.units && Object.keys(d.units).length === 64, 'a new league drafts units: 32 O-lines and 32 defenses');
ok(!d.pool.some(id => !LG.isUnitId(id) && ['OL', 'DL', 'LB', 'CB', 'S'].indexOf(L.players[id].p) >= 0), 'no lineman or defender is in the pool on his own');
const rams = 'u:DEF:' + require('./lib/data.json').TEAMS.findIndex(t => t.abbr === 'LA'), ru = LG.unitOf(L, rams);
ok(ru.ids.length >= 20 && ru.ids.some(id => L.players[id].n === 'Myles Garrett'), 'the Rams defense is one pick of ' + ru.ids.length + ' players, Myles Garrett included');
ok(LG.onClock(L) === 0, 'the person is on the clock');
const T = mk({ rounds: 16, cap: 200 }, 6, 1), tr = 'u:DEF:' + require('./lib/data.json').TEAMS.findIndex(t => t.abbr === 'LA');
ok(LG.salOfId(T, tr) > 150, 'an elite defense is expensive: the Rams defense costs $' + LG.salOfId(T, tr) + 'M of a $200M cap');
// the best defense still on the board (CPU teams before the person may already have taken some)
const top = d.pool.filter(id => (LG.unitOf(L, id) || {}).k === 'DEF').sort((a, b) => LG.draftOvr(L, b) - LG.draftOvr(L, a))[0], tu = LG.unitOf(L, top), price = LG.salOfId(L, top);
ok(LG.draftPick(L, 0, top) && tu.ids.every(id => L.players[id].t === 0) && L.teams[0].sch === tu.sch, 'drafting a defense (' + tu.name + ') brings every player and its scheme');
ok(Math.abs(d.spent[0] - price) < 0.05 && price > 30, 'it costs the sum of their real salaries ($' + price + 'M)');
L.draft.auto = { all: true }; LG.autoDraftToHuman(L);
ok(L.phase !== 'draft', 'the rest of the draft runs');
ok(L.teams.every(t => d.picks.filter(x => x.t === t.id && LG.isUnitId(x.p)).length === 2 && new Set(d.picks.filter(x => x.t === t.id && LG.isUnitId(x.p)).map(x => LG.unitOf(L, x.p).k)).size === 2), 'every team has exactly one O-line and one defense');
ok(L.teams.every(t => { const ln = LG.lineup(L, t.id), c = LG.counts(t.sch); return Object.keys(c).every(k => ln[k].length >= c[k]); }), 'every team fills every starting spot');
ok(L.teams.every(t => (d.spent[t.id] || 0) <= 260 + 1e-6), 'nobody goes over the cap (most: $' + Math.max(...L.teams.map(t => d.spent[t.id] || 0)) + 'M)');
ok(d.picks.length >= d.seq.length * 0.85, 'most picks are used; a team that can only afford players it has no use for passes (' + d.picks.length + ' of ' + d.seq.length + ')');
ok(L.teams.every(t => { const c = LG.posCount(L, t.id); return c.QB >= 2 && c.WR >= 4 && c.TE >= 2 && c.K === 1 && c.P === 1; }), 'depth picks make sense: two quarterbacks, four receivers, two tight ends, one kicker and one punter');
// the planner: a team that still needs everything aims for the best lineup it can afford, and never spends itself into a corner
const caps = [200, 230, 260, 0].map(cap => { const X = mk({ rounds: 14, cap }, 8, 0); LG.finalizeLeagueDraft(X); return { cap, phase: X.phase, r: X.teams.map(t => LG.teamRating(X, t.id).ovr) }; });
ok(caps.every(c => c.phase === 'regular'), 'drafts with every cap finish and the season starts');
ok(caps[0].r.every(x => x >= caps[0].r[0] - 3) && Math.min(...caps[3].r) >= Math.max(...caps[0].r), 'a looser cap gives better teams (tight ' + caps[0].r[0] + ', none ' + caps[3].r[0] + ')');
// leagues made before keep drafting every player
const O = mk({ rounds: 28, cap: 0, units: false }, 4, 0);
ok(!O.draft.units && O.phase !== 'draft' && LG.rosterOf(O, 0).some(p => p.p === 'OL'), 'an older league (no units flag) still drafts player by player');
console.log('ALL DONE');
