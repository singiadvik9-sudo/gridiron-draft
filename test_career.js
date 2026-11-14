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

// ---- a partner needs attention: the mood fades every week, a warning comes before they leave, and treating them helps (with cooldowns)
{
  const L = LG.newNFL({ user: 0, seed: 4 }); L.teams[0].owner = 'You'; LG.campInit(L); LG.careerOn(L);
  const c = L.coach; c.partner = { n: 'Riley', mood: 44 }; c.rel = 'dating'; L.phase = 'regular';
  for (let w = 1; w <= 20 && c.partner; w++) { L.week = w; LG.careerWeek(L, () => 0.99); }
  ok(!c.partner && L.inbox.some(m => /Do you even notice me/.test(m.subj)) && L.inbox.some(m => /We are done/.test(m.subj)), 'ignored all season: a warning, then they leave');
  c.partner = { n: 'Riley', mood: 40 }; c.rel = 'dating'; c.dates = {}; L.week = 5;
  const m1 = LG.partnerTreat(L, 'date'); ok(c.partner.mood === 50 && /Riley \+10/.test(m1), 'date night: +10 ("' + m1 + '")');
  const m2 = LG.partnerTreat(L, 'date'); ok(c.partner.mood === 50 && /again in/.test(m2), 'and not again right away ("' + m2 + '")');
  const team = L.morale.team; LG.partnerTreat(L, 'getaway'); ok(c.partner.mood === 72 && L.morale.team === team - 2, 'a getaway: +22, and the team notices you were gone');
  L.week = 7; ok(!/again in/.test(LG.partnerTreat(L, 'date')), 'date night is back two weeks later');
  c.partner = null; c.rel = 'single'; ok(/single/.test(LG.partnerTreat(L, 'gift')), 'no gifts for nobody');
}

// ---- a family wins the fans over; standing up for your partner wins them over more; the job carousel has its moments
{
  const mkL = () => { const L = LG.newNFL({ user: 0, seed: 6 }); L.teams[0].owner = 'You'; LG.campInit(L); LG.careerOn(L); L.phase = 'regular'; return L; };
  const fans = rel => { const L = mkL(), c = L.coach; if (rel) { c.partner = { n: 'Sam', mood: 90 }; c.rel = rel; } L.morale.fans = 50; for (let w = 1; w <= 12; w++) { L.week = w; c.lastP = L.season * 100 + w; LG.careerWeek(L, () => 0.99); } return L.morale.fans; };
  const f0 = fans(null), fd = fans('dating'), fm = fans('married');
  ok(f0 === 50 && fd > f0 && fm > fd, 'fans warm to a coach with a family: single ' + f0 + ', dating ' + fd + ', married ' + fm);
  const L = mkL(), c = L.coach; c.partner = { n: 'Sam', mood: 50 }; c.rel = 'dating';
  const ev = LG.LIFE.filter(e => /heckler|tabloid|paparazzi|trolls|charity|breakdown|awaysign/.test(e.id));
  ok(ev.length === 7 && ev.every(e => e.opts[0].fans > 0 && e.opts[0].part > 0 && e.opts[1].part < 0), 'seven moments to stand up for your partner in public: the fans and your partner love it, looking away costs you');
  const m = { id: 'mx', from: 'x', subj: 'x', kind: 'life', opts: ev[0].opts }; L.inbox.unshift(m); const pop0 = c.pop, f1 = L.morale.fans;
  LG.campOp(L, 0, 'mail', { id: 'mx', i: 0 }); ok(c.partner.mood > 50 && c.pop > pop0 && L.morale.fans > f1, 'defending ' + c.partner.n + ': partner ' + c.partner.mood + ', approval ' + c.pop + ', fans ' + L.morale.fans);
  // the hot seat in season: losses heat it, and the owner speaks up
  c.hot = 60; for (let i = 0; i < 3; i++) LG.careerAfterGame(L, false, false);
  ok(c.hot === 72 && L.inbox.some(m => /vote of confidence/i.test(m.subj)), 'three straight losses: the seat hits ' + c.hot + ' and the owner gives a vote of confidence');
  LG.careerAfterGame(L, true, false); ok(c.hot === 69, 'a win cools it a little');
  // interviews: an offer goes up or down, never away; passing on your last offer is not allowed
  c.offers = []; c.need = true; LG.jobOffers(L, LG.rng(L, 'j'), 'fired');
  const om = L.inbox.find(m => m.kind === 'job' && m.opts && m.opts[0].iv), off = c.offers.find(o => o.tid === om.opts[0].tid), s0 = off.sal;
  LG.campOp(L, 0, 'mail', { id: om.id, i: 0 }); ok(off.iv && off.sal !== s0 && c.offers.indexOf(off) >= 0, 'an interview moves the offer ($' + s0 + 'M to $' + off.sal + 'M)');
  while (c.offers.length > 1) c.offers.pop();
  const last = L.inbox.find(m => m.kind === 'job' && m.opts && m.opts[2] && m.opts[2].tid === c.offers[0].tid);
  ok(/last offer/.test(LG.campOp(L, 0, 'mail', { id: last.id, i: 2 }).msg || ''), 'you cannot pass on your last offer while you need a job');
  // the move: an introductory press conference, and a partner who decides whether to come along
  c.partner = { n: 'Sam', mood: 40 }; const to = c.offers[0].tid; LG.takeOffer(L, 0);
  ok(L.user === to && L.inbox.some(m => /introductory press conference/i.test(m.subj)) && L.inbox.some(m => /I am not moving/.test(m.subj)) && c.partner.mood === 25, 'a new job: an introductory press conference, and an unhappy partner will not move with you');
}

// ---- offers you did not take expire when the season starts; nobody switches teams mid-season (that left a week nobody could finish)
{
  const L = LG.newNFL({ user: 4, seed: 11 }); L.teams[4].owner = 'You'; LG.campInit(L); LG.careerOn(L); LG.runUntilHuman(L, 60);
  const c = L.coach; c.offers = [{ tid: 9, yrs: 3, sal: 5, k: 'good' }];
  const r = LG.campOp(L, 4, 'coach-take', { i: 0 });
  ok(!r.ok && /expired/.test(r.msg) && L.user === 4 && !c.offers.length, 'in season, an old offer cannot be signed: it expired');
  // a save already stuck that way: your old team's game is left with nobody to play it, the new team has played; simming it moves the week on
  const L2 = LG.newNFL({ user: 4, seed: 12 }); L2.teams[4].owner = 'You'; LG.campInit(L2); LG.careerOn(L2); LG.runUntilHuman(L2, 60);
  const mine = LG.weekGames(L2)[0], other = L2.sched.find(g => g.w === L2.week && g.done && g.h !== 4 && g.a !== 4);
  LG.moveTeam(L2, other ? other.h : 9); const wk = L2.week;
  ok(LG.weekGames(L2).length === 1 && !LG.humanSides(L2, mine).some(Boolean), 'the stuck week: one game left, and no person on either side');
  LG.runUntilHuman(L2, 60); ok(L2.week > wk || L2.phase !== 'regular', 'simming it moves the week on');
  // starting a season clears the offers you passed on
  const L3 = LG.newNFL({ user: 4, seed: 13 }); L3.teams[4].owner = 'You'; LG.campInit(L3); LG.careerOn(L3); L3.phase = 'preseason'; L3.coach.offers = [{ tid: 9, yrs: 3, sal: 5, k: 'good' }];
  LG.campGo(L3, 4, 'season'); ok(!L3.coach.offers.length && L3.inbox.some(m => /off the table/.test(m.subj)), 'starting a season: the offers you passed on are off the table');
}
