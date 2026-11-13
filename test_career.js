// Coach career: a contract, the hot seat, getting fired and hired, personal life every couple of weeks, scandals only from your own bad calls.
const LG = require('./lib/league.js');
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// ---- a career played out by a script: it answers every message (some of them badly) and takes the first offer when it needs a job
function career(seed, tid, seasons, dumbP) {
  const L = LG.newNFL({ user: tid, seed }); L.teams[tid].owner = 'You'; LG.campInit(L); LG.careerOn(L); LG.runUntilHuman(L, 60);
  const r = LG.rng(L, 'test'), log = { life: 0, dumb: 0, scandal: 0, noJob: 0, owners: [], start: L.coach && JSON.parse(JSON.stringify(L.coach)) };
  const answer = () => (L.inbox || []).forEach(m => { if (!m.opts || m.ans != null) return; if (m.kind === 'life') { log.life++; const d = m.opts.findIndex(o => o.dumb), i = d >= 0 && r() < dumbP ? d : m.opts.findIndex(o => !o.dumb); if (m.opts[i].dumb) log.dumb++; LG.campOp(L, L.user, 'mail', { id: m.id, i }); } else LG.campOp(L, L.user, 'mail', { id: m.id, i: 0 }); });
  for (let s = 0; s < seasons; s++) {
    let g = 0; while (L.phase !== 'offseason' && g++ < 90) { LG.runUntilHuman(L, 60); LG.weekGames(L).forEach(x => LG.simGame(L, x)); LG.advanceWeek(L); LG.checkFinal(L); answer(); }
    LG.campGo(L, L.user, 'offseason'); answer();
    let k = 0; while (L.phase === 'fa' && k++ < 40) LG.campGo(L, L.user, 'fa-next'); k = 0; while (L.phase === 'draft' && k++ < 400) LG.campGo(L, L.user, 'draft-me');
    if (L.coach.need) { if (!LG.campGo(L, L.user, 'season')) log.noJob++; LG.campOp(L, L.user, 'coach-take', { i: 0 }); }
    if (L.phase !== 'regular') LG.campGo(L, L.user, 'season');
    log.owners.push(L.teams.filter(t => t.owner).map(t => t.id));
  }
  log.scandal = (L.coach.scand || 0);
  return { L, log };
}

{
  const { L, log } = career(9, 12, 4, 0);
  const c = L.coach;
  ok(log.start.age === 26 && log.start.rel === 'single' && c.age === 26, 'you start a single 26-year-old, and you never age');
  ok(log.life >= 4 * 5, 'something off the field about every two weeks (' + log.life + ' in 4 seasons)');
  ok(log.scandal === 0 && log.dumb === 0, 'a coach who never makes the dumb choice has no scandals');
  ok(c.hist.length === 4 && c.earn > 0, 'every season is on the record, and career earnings add up ($' + c.earn + 'M)');
  ok(log.owners.every(o => o.length === 1 && o[0] === log.owners[log.owners.indexOf(o)][0]) && L.teams[L.user].owner === 'You', 'you always coach exactly one team');
  ok(log.noJob === 0, 'a season never starts while you have no job');
}
{
  const { L, log } = career(5, 0, 4, 1);
  ok(log.dumb > 0 && log.scandal > 0 && log.scandal <= log.dumb, 'scandals come only from dumb choices (' + log.scandal + ' from ' + log.dumb + ')');
  ok(L.inbox.some(m => m.kind === 'scandal') || L.coach.scand > 0, 'and they make the news');
}

// ---- the rules of the job, directly
{
  const L = LG.newNFL({ user: 4, seed: 3 }); L.teams[4].owner = 'You'; LG.campInit(L); LG.careerOn(L);
  const c = L.coach;
  // fired: two losing seasons in a row
  c.bad = 1; c.since = 0; L.sched.forEach(g => { if (g.pl === 'reg') { g.done = 1; const mine = g.h === 4 || g.a === 4; g.sh = mine ? (g.h === 4 ? 3 : 30) : 20; g.sa = mine ? (g.a === 4 ? 3 : 30) : 17; } });
  LG.careerSeason(L);
  ok(c.need && c.offers.length >= 2 && c.offers.every(o => o.tid !== 4) && /fired/.test(c.hist[0].why || ''), 'two losing seasons in a row: fired, with offers from other teams');
  ok(LG.careerBlock(L), 'and the next season waits until you take a job');
  const to = c.offers[0].tid; ok(!LG.takeOffer(L, 0) && L.user === to && L.teams[to].owner === 'You' && !L.teams[4].owner && !c.need && c.bad === 0, 'taking an offer moves you to the new team (your old one goes to the computer)');
}
{
  const L = LG.newNFL({ user: 4, seed: 7 }); L.teams[4].owner = 'You'; LG.campInit(L); LG.careerOn(L);
  const c = L.coach; c.good = 1; c.since = 0;
  L.sched.forEach(g => { if (g.pl === 'reg') { g.done = 1; const mine = g.h === 4 || g.a === 4; g.sh = mine ? (g.h === 4 ? 30 : 3) : 20; g.sa = mine ? (g.a === 4 ? 30 : 3) : 17; } });
  LG.careerSeason(L);
  ok(!c.need && c.offers.length >= 1 && c.offers.every(o => o.sal > 3.5), 'two winning seasons in a row: other teams make offers for more money (and you can stay)');
  const n = c.offers.length, m = LG.counterOffer(L, 0); ok(/came up|pulled/.test(m) && (c.offers.length === n || c.offers.length === n - 1), 'asking for more: they come up, or they walk ("' + m + '")');
}
// ---- every personal event and scandal reads cleanly (no unfilled names)
{
  const L = LG.newNFL({ user: 0, seed: 2 }); L.teams[0].owner = 'You'; LG.campInit(L); LG.careerOn(L); L.coach.partner = { n: 'Jordan', mood: 50 }; L.coach.rel = 'dating';
  let bad = 0; for (let w = 0; w < 120; w++) { L.week = 2 + w * 3; L.season = 2026 + Math.floor(w / 6); L.phase = 'regular'; L.coach.lastP = 0; LG.careerWeek(L, LG.rng(L, 'x' + w)); }
  L.inbox.filter(m => m.kind === 'life').forEach(m => { const t = m.from + m.subj + m.body + (m.opts || []).map(o => o.t + (o.reply || '')).join(''); if (/\{|undefined|null/.test(t)) bad++; });
  ok(bad === 0, 'personal events fill in every name (' + L.inbox.filter(m => m.kind === 'life').length + ' checked)');
  ok(Object.values(LG.SCANDALS).every(s => !/[A-Z][a-z]+ [A-Z][a-z]+ (said|wrote)/.test(s.body)) && LG.LIFE.length >= 30, 'plenty of events (' + LG.LIFE.length + '), and the parody ones name nobody real');
}
