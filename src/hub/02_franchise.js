/* ---------- franchise UI (shared by the campaign and by league play) ---------- */
const FR = { A: null, tab: 'home', to: null, give: [], get: [], offers: null, faPos: 'ALL', dpos: 'ALL', sview: 'season', dq: '', rtid: null, stid: null };
const TABS = [['home', 'Home'], ['sched', 'Schedule'], ['roster', 'Roster'], ['stand', 'Standings'], ['trades', 'Trades'], ['fa', 'Free agents'], ['stats', 'Stats']];
const PL = (L, id) => L.players[id];
const plLabel = (L, id) => {
  if (LG.isPick(id)) { const k = LG.pickOf_(L, id); return k ? LG.pickLabel(L, k) + ' pick' : '?'; }
  const p = PL(L, id); return p ? p.n + ' (' + p.p + ' ' + p.o + ')' : '?';
};
const trend = p => { const h = p.h || []; if (!h.length) return ''; const d = p.o - h[h.length - 1]; return d > 0 ? '<i class="up">▲' + d + '</i>' : d < 0 ? '<i class="dn">▼' + (-d) + '</i>' : ''; };
const gradeCls = o => 'g-' + E.grade(o);
// potential: the scouts' estimate (~) until he has played a season, then the real thing, with SLEEPER or BUST when the scouts were way off
function potHTML(p) {
  const tag = p.was == null ? '' : p.pt - p.was >= 8 ? ' <b class="slp" title="The scouts had him at ' + p.was + '">Sleeper</b>' : p.was - p.pt >= 8 ? ' <i class="bust" title="The scouts had him at ' + p.was + '">Bust</i>' : '';
  const v = LG.potSeen(p);
  if (p.vp != null) return v > p.o ? '<span title="Scouting estimate: his real potential shows after his first season">pot ~' + v + '</span>' : '';
  return (p.a <= 26 && p.pt > p.o ? 'pot ' + p.pt : '') + tag;
}
function plRows(L, list, btn) {
  return list.map(p => '<tr><td class="pos">' + p.p + '</td><td class="nm">' + plLink(p) + '<small class="kas">' + G.keyAttrs(p.p, { i: p.i, n: p.n, o: p.o, s: p.s }) + '</small></td><td>' + p.a + '</td><td><b class="ov ' + gradeCls(p.o) + '">' + p.o + '</b> ' + trend(p) + '</td><td class="pt">' + potHTML(p) + '</td><td class="act">' + (btn ? btn(p) : '') + '</td></tr>').join('');
}
const plLink = p => '<a href="#" class="plk" data-h="fr-pl" data-id="' + esc(p.i) + '">' + esc(p.n) + '</a>';   // opens his page: ratings and stats
const tbl = (head, rows) => '<div class="tbl-wrap"><table class="tb"><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
function teamOvr(L, tid) { const r = LG.teamRating(L, tid); return r; }
function myGame(L, tid) { return L.sched.find(x => x.w === L.week && !x.done && (x.h === tid || x.a === tid)); }
function gameLine(L, g, tid) {
  const home = g.h === tid, opp = L.teams[home ? g.a : g.h];
  return (g.neutral ? 'vs ' : home ? 'vs ' : '@ ') + opp.name;
}
function frShow(A) {
  FR.A = A;
  if (A.tid < 0 && FR.tab !== 'stand' && FR.tab !== 'stats' && FR.tab !== 'extra') FR.tab = 'stand';
  const L = A.L, tabs = TABS.slice();
  if (L.phase === 'draft') tabs.splice(1, 0, ['draft', 'Draft']);
  (A.tabs || []).forEach(t => tabs.push([t.id, t.label]));
  if (!tabs.some(t => t[0] === FR.tab)) FR.tab = 'home';
  const t = A.tid >= 0 ? L.teams[A.tid] : null;
  const phase = { regular: 'Week ' + L.week, playoffs: 'Playoffs', offseason: 'Offseason', fa: 'Free agency', draft: 'Draft', preseason: 'Preseason', setup: 'Setup' }[L.phase] || L.phase;
  let h = '<section class="fr"><div class="frhead">' + (t ? '<div class="frteam">' + tmName(t) + '</div>' : '<div class="frteam">Spectating</div>') +
    '<div class="frmeta"><span class="chip">' + esc(A.title) + '</span><span class="chip">' + L.season + ' · ' + phase + '</span>' + (A.status ? '<span class="chip">' + esc(A.status) + '</span>' : '') + '</div>' +
    '<div class="frbtns">' + (A.headBtns || '') + '</div></div>';
  h += '<nav class="tabs" role="tablist">' + tabs.map(x => '<button class="tab' + (FR.tab === x[0] ? ' on' : '') + '" role="tab" data-h="fr-tab" data-t="' + x[0] + '">' + x[1] + '</button>').join('') + '</nav>';
  const extra = (A.tabs || []).find(x => x.id === FR.tab);
  h += (A.top ? '<div class="frtop">' + A.top() + '</div>' : '') + '<div class="frbody">' + (extra ? extra.html() : (FRV[FR.tab] || FRV.home)(A)) + '</div></section>';   // (top: a shared campaign's co-managers, approvals and feed)
  const keep = window.scrollY;
  setMain(h); window.scrollTo(0, keep);
}
ACT['fr-advance'] = async t => { t.disabled = true; if (FR.A && FR.A.advance) await FR.A.advance(); };
ACT['fr-tab'] = t => { FR.tab = t.dataset.t; frShow(FR.A); window.scrollTo(0, 0); };

const FRV = {};
FRV.home = A => {
  const L = A.L, tid = A.tid, t = L.teams[tid], R = LG.records(L)[tid], ra = LG.teamRating(L, tid);
  const order = LG.overallRank(L).map(r => r.id), rk = order.indexOf(tid) + 1;
  let h = '<div class="ratings"><div><span class="eyebrow">Offense</span><b>' + ra.off + '</b></div><div><span class="eyebrow">Defense</span><b>' + ra.def + '</b></div><div><span class="eyebrow">Overall</span><b>' + ra.ovr + '</b></div><div><span class="eyebrow">Record</span><b>' + rec(R) + '</b></div><div><span class="eyebrow">Rank</span><b>' + rk + '/' + L.teams.length + '</b></div></div>';
  const g = myGame(L, tid);
  if (L.phase === 'regular' || L.phase === 'playoffs') {
    if (g) {
      const hv = L.teams[g.h].owner && L.teams[g.a].owner;
      h += '<div class="panel next"><span class="eyebrow">' + (g.pl === 'po' ? 'Playoff game' : 'Week ' + g.w) + '</span><h2>' + esc(gameLine(L, g, tid)) + '</h2>' +
        '<div class="row"><button class="btn primary" data-h="fr-play" data-g="' + g.id + '">Play game</button>' + (hv ? '' : '<button class="btn" data-h="fr-sim" data-g="' + g.id + '">Sim game</button>') + '</div>' +
        (hv ? '<p class="hint">Both teams are managed by people. You both play it live, or the manager can sim the week.</p>' : '') + '</div>';
    } else if (L.phase === 'playoffs') h += '<div class="panel next"><h2>' + (L.po && L.po.out && L.po.out[tid] ? 'Your season is over' : 'Waiting on the other games') + '</h2></div>';
    else h += '<div class="panel next"><h2>No game this week</h2><p class="sub">' + (A.waitMsg || 'The week moves on once every game is done.') + '</p>' + (A.advance ? '<div class="row"><button class="btn primary" data-h="fr-advance">Sim to my next game</button></div>' : '') + '</div>';
  } else if (L.phase === 'fa') {
    const f = L.fa, exp = f.exp.map(id => PL(L, id)).filter(Boolean);
    h += '<div class="panel next"><span class="eyebrow">Free agency · day ' + f.day + ' of ' + f.days + '</span><h2>' + exp.length + ' of your contracts are ending</h2><p class="sub">Negotiate on the Free agents tab, or let them walk. Anyone unsigned when free agency ends is gone. CPU teams sign players each day. The draft comes next.</p><div class="row"><button class="btn primary" data-h="fr-tab" data-t="fa">Open free agency</button><button class="btn" data-h="fa-next">' + (f.day >= f.days ? 'Finish free agency: go to the draft' : 'Next day') + '</button></div></div>';
  } else if (L.phase === 'offseason') {
    const last = L.hist[L.hist.length - 1];
    h += '<div class="panel next"><span class="eyebrow">Season ' + L.season + ' complete</span><h2>' + (last && last.champ != null ? esc(L.teams[last.champ].name) + ' are champions' : 'Regular season over') + '</h2>' +
      (last && last.awards && last.awards.players.length ? '<p class="sub">' + last.awards.players.slice(0, 3).map(a => a.label + ': <b>' + esc(a.n) + '</b>').join(' · ') + ' — all awards are on the Stats tab.</p>' : '') + (A.canAdvance ? '<p class="sub">Next: players age and develop, then the rookie draft.</p><div class="row"><button class="btn primary" data-h="fr-offseason">Start the offseason</button></div>' : '<p class="sub">Waiting for the manager to start the offseason.</p>') + '</div>';
  } else if (L.phase === 'draft') {
    const on = LG.onClock(L), d = L.draft;
    h += '<div class="panel next"><span class="eyebrow">' + (d.kind === 'league' ? 'League draft' : 'Rookie draft') + '</span><h2>' + (on === tid ? 'You are on the clock' : on != null ? esc(L.teams[on].name) + ' are picking' : 'Draft complete') + '</h2>' +
      '<p class="sub">Pick ' + Math.min(d.pos + 1, d.seq.length) + ' of ' + d.seq.length + '.</p><div class="row"><button class="btn primary" data-h="fr-tab" data-t="draft">Open the draft board</button></div></div>';
  } else if (L.phase === 'preseason') {
    const n = LG.rosterOf(L, tid).length, over = n > LG.ROSTER_MAX;
    h += '<div class="panel next"><span class="eyebrow">Preseason</span><h2>Roster: ' + n + ' / ' + LG.ROSTER_MAX + '</h2>' +
      (over ? '<p class="sub bad">Cut ' + (n - LG.ROSTER_MAX) + ' player' + (n - LG.ROSTER_MAX > 1 ? 's' : '') + ' before the season.</p><div class="row"><button class="btn" data-h="fr-trim">Cut the lowest-rated extras</button></div>' : '') +
      (A.canAdvance ? '<div class="row"><button class="btn primary"' + (over && A.kind === 'campaign' ? ' disabled' : '') + ' data-h="fr-season">Start season ' + (L.season + 1) + '</button></div>' : '<p class="sub">Waiting for the manager to start the season.</p>') + '</div>';
  }
  if (L.camp && L.press) h += pressHTML(L);
  if (L.progress && (L.phase === 'draft' || L.phase === 'preseason' || L.phase === 'fa')) {
    const mine = LG.rosterOf(L, tid).filter(p => (L.progress.up.indexOf(p.i) >= 0 || L.progress.down.indexOf(p.i) >= 0));
    const ret = L.progress.retired.map(id => PL(L, id)).filter(p => p && p.lt === tid);
    const sl = (L.progress.sleepers || []).map(id => PL(L, id)).filter(p => p && p.t === tid), bu = (L.progress.busts || []).map(id => PL(L, id)).filter(p => p && p.t === tid);
    if (ret.length) h += '<div class="panel"><h3>Retirements</h3><ul class="news">' + ret.map(p => '<li>' + plLink(p) + ' (' + p.p + ', ' + p.a + ') retires after peaking at ' + (p.peak || p.o) + '. ' + ((L.hof || []).some(x => x.i === p.i) ? '<b class="hof">In your Hall of Fame</b>' : A.canEditRoster() ? '<button class="btn small" data-h="fr-hof" data-id="' + p.i + '">Send to the Hall of Fame</button>' : '') + '</li>').join('') + '</ul><p class="hint">Retired players keep their stats for good: click a name to see his career.</p></div>';
    const su = (L.progress.stars || []).map(id => PL(L, id)).filter(p => p && p.t === tid && LG.isStar(L, p));
    if (su.length) h += '<div class="panel"><h3>New superstars</h3><ul class="news">' + su.map(p => '<li><b class="slp">Superstar</b> ' + plLink(p) + ' (' + p.p + ') is now a <b>' + p.o + '</b>.</li>').join('') + '</ul></div>';
    if (sl.length || bu.length) h += '<div class="panel"><h3>The scouts were wrong</h3><ul class="news">' + sl.map(p => '<li><b class="slp">Sleeper</b> ' + esc(p.n) + ' (' + p.p + ', ' + p.o + '): potential <b>' + p.pt + '</b>, the scouts said ' + p.was + '. Get him on the field.</li>').join('') + bu.map(p => '<li><i class="bust">Bust</i> ' + esc(p.n) + ' (' + p.p + ', ' + p.o + '): potential ' + p.pt + ', the scouts said ' + p.was + '.</li>').join('') + '</ul></div>';
    if (mine.length) h += '<div class="panel"><h3>Player development</h3><ul class="news">' + mine.map(p => '<li>' + esc(p.n) + ' (' + p.p + ') ' + (p.h && p.h.length ? (p.h[p.h.length - 1] + ' → <b>' + p.o + '</b>') : p.o) + ' ' + trend(p) + '</li>').join('') + '</ul></div>';
  }
  h += '<div class="panel"><h3>League news</h3>' + (L.news.length ? '<ul class="news">' + L.news.slice(0, 8).map(n => '<li><span>' + n.s + '</span> ' + esc(n.t) + '</li>').join('') + '</ul>' : '<p class="hint">Nothing yet.</p>') + '</div>';
  return h;
};
function pressHTML(L) {
  const P = L.press;
  return '<div class="panel press"><span class="eyebrow">Press conference · ' + (P.won ? 'win' : P.tie ? 'tie' : 'loss') + ' ' + P.score + ' vs the ' + esc(P.opp) + '</span><h3>"' + esc(P.qs[P.i]) + '"</h3><div class="row">' + LG.pressOptions(L).map((a, i) => '<button class="btn small" data-h="press" data-i="' + i + '">' + esc(a.t) + '</button>').join('') + '</div><p class="hint">Question ' + (P.i + 1) + ' of ' + P.qs.length + '. Your answers move team, fan and player morale.</p></div>';
}
ACT['press'] = async t => { await FR.A.act('press', { a: +t.dataset.i }); };
ACT['fa-next'] = async () => { await FR.A.go('fa-next'); };
ACT['fr-play'] = async t => { await FR.A.play(t.dataset.g); };
ACT['fr-hof'] = async t => { const r = await FR.A.act('hof', { pid: t.dataset.id }); if (r && r.ok) toast('Inducted into the Hall of Fame.'); G.closeModal(); frShow(FR.A); };
ACT['fr-pl'] = t => { const L = FR.A.L, id = t.dataset.id; G.openModal(playerPage(FR.A, id)); };
/* a player's page: his ratings (overall, potential and every sub-rating) and his numbers this season, game by game, season by season and all time */
const SCOLS = [['pc', 'C'], ['pa', 'Att'], ['pyd', 'Pass yds'], ['ptd', 'Pass TD'], ['int', 'INT'], ['att', 'Car'], ['ryd', 'Rush yds'], ['rtd', 'Rush TD'], ['rec', 'Rec'], ['recyd', 'Rec yds'], ['rectd', 'Rec TD'], ['sk', 'Sacks'], ['dint', 'Def INT'], ['pbu', 'PBU']];
function playerPage(A, id) {
  const L = A.L, p = PL(L, id), hf = (L.hof || []).find(x => x.i === id), who = p || hf; if (!who) return '<p>Unknown player.</p>';
  const ps = LG.playerStats(L, id) || { seasons: [], games: [], career: {} };
  const rows = list => { const cols = SCOLS.filter(c => list.some(x => x.s && x.s[c[0]])); return cols.length ? tbl([''].concat(cols.map(c => c[1])), list.map(x => '<tr><td class="nm">' + x.l + '</td>' + cols.map(c => '<td>' + ((x.s && x.s[c[0]]) || 0) + '</td>').join('') + '</tr>').join('')) : '<p class="hint">No stats recorded.</p>'; };
  const tm = t => L.teams[t] ? L.teams[t].abbr : '';
  const status = p ? (p.t >= 0 ? esc(L.teams[p.t].name) : p.t === -2 ? 'Retired' + (p.ry ? ' after ' + p.ry : '') + (L.teams[p.lt] ? ' (' + esc(L.teams[p.lt].nick) + ')' : '') : 'Free agent') : 'Retired';
  let h = '<h3>' + esc(who.n) + ' <small>' + who.p + '</small>' + (hf ? ' <b class="hof">Hall of Fame ' + hf.y + '</b>' : '') + '</h3><p class="sub">' + status + (p ? ' · age ' + p.a + ' · overall <b>' + p.o + '</b>' + (p.t === -2 ? ' (peak ' + (p.peak || p.o) + ')' : '') + ' ' + potHTML(p) : '') + '</p>';
  if (p) h += '<h4 class="pos-h">Ratings</h4>' + G.attrGrid(p.p, { i: p.i, n: p.n, o: p.o, s: p.s });
  if (ps.season) h += '<h4 class="pos-h">This season</h4>' + rows([{ l: L.season, s: ps.season }]);
  if (ps.games.length) h += '<h4 class="pos-h">Game by game</h4>' + rows(ps.games.map(x => { const g = x.g, home = g.h === x.t, opp = L.teams[home ? g.a : g.h]; return { l: (g.pl === 'po' ? 'PO' : 'Wk ' + g.w) + ' ' + (home ? 'vs ' : '@ ') + (opp ? opp.abbr : ''), s: x.s }; }));
  if (ps.seasons.length) h += '<h4 class="pos-h">Season by season</h4>' + rows(ps.seasons.map(x => ({ l: x.y + ' ' + tm(x.t), s: x })));
  h += '<h4 class="pos-h">All time</h4>' + rows([{ l: 'Career', s: ps.career }]);
  const kept = L.camp || (p && L.teams[p.t >= 0 ? p.t : p.lt] && L.teams[p.t >= 0 ? p.t : p.lt].owner);
  if (!ps.seasons.length && !ps.games.length) h += '<p class="hint">' + (kept ? 'His game-by-game lines and seasons show up here as he plays.' : 'Game-by-game lines and past seasons are kept for players on teams a person runs.') + '</p>';
  if (L.camp && p && p.t >= 0 && p.t !== A.tid && !L.teams[p.t].owner && LG.canTrade(L)) h += '<div class="row"><button class="btn primary" data-h="tr-ask" data-id="' + p.i + '">Try to trade for him</button></div>';
  if (L.camp && p && p.t === A.tid && (LG.isStar(L, p) || p.sus || p.ctr)) h += '<p class="sub">' + [LG.isStar(L, p) ? 'Morale <b>' + LG.moraleOf(L, p) + '</b> / 100' : '', p.sus ? 'suspended ' + p.sus + ' game' + (p.sus > 1 ? 's' : '') : '', p.ctr ? esc(LG.contractSummary(p.ctr)) : ''].filter(Boolean).join(' · ') + '</p>';
  if (p && p.t === -2 && p.lt === A.tid && !hf && A.canEditRoster()) h += '<div class="row"><button class="btn primary" data-h="fr-hof" data-id="' + p.i + '">Send to the Hall of Fame</button></div>';
  return h;
}
ACT['fr-sim'] = async t => { await FR.A.sim(t.dataset.g); };
ACT['fr-offseason'] = async () => { await FR.A.go('offseason'); };
ACT['fr-season'] = async () => { await FR.A.go('season'); };
ACT['fr-trim'] = async () => { await FR.A.go('trim'); };

FRV.sched = A => {
  const L = A.L, tid = A.tid;
  const games = L.sched.filter(g => g.h === tid || g.a === tid).sort((a, b) => a.w - b.w);
  const rows = games.map(g => {
    const home = g.h === tid, mine = home ? g.sh : g.sa, theirs = home ? g.sa : g.sh;
    const res = g.done ? '<b class="' + (mine > theirs ? 'win' : mine < theirs ? 'loss' : '') + '">' + (mine > theirs ? 'W' : mine < theirs ? 'L' : 'T') + ' ' + mine + '-' + theirs + (g.ot ? ' OT' : '') + (g.ff != null ? ' (forfeit)' : '') + '</b>' : (g.w === L.week && (L.phase === 'regular' || L.phase === 'playoffs') ? 'This week' : '');
    return '<tr><td>' + (g.pl === 'po' ? 'PO' : g.w) + '</td><td class="nm">' + esc(gameLine(L, g, tid)) + '</td><td>' + res + '</td></tr>';
  }).join('');
  return '<div class="panel">' + tbl(['Wk', 'Opponent', 'Result'], rows) + '</div>';
};

// backs, receivers and tight ends: usage (share of the group's snaps, set by the coach) and the share of snaps he has played this season
// injuries: how long he is out, or his time on injured reserve; with the buttons to move him
function injCell(L, tid, p, edit) {
  let h = '';
  if (p.ir) h += '<span class="inj" title="Injured reserve: off the 53, still on the payroll">IR ' + Math.min(p.irw || 0, LG.IR_MIN) + '/' + LG.IR_MIN + ' wk' + (p.inj ? ' · out ' + (p.inj >= LG.SEASON_OUT ? 'season' : p.inj + ' wk') : '') + '</span> ';
  else if (p.inj) h += '<span class="inj">OUT ' + (p.inj >= LG.SEASON_OUT ? 'SEASON' : p.inj + ' WK') + '</span> ';
  if (edit && p.inj && !p.ir) h += '<button class="btn small ghost" data-h="fr-ir" data-id="' + p.i + '">Place on IR</button>';
  if (edit && p.ir) { const ready = (p.irw || 0) >= LG.IR_MIN && !p.inj; h += '<button class="btn small ghost" data-h="fr-act" data-id="' + p.i + '"' + (ready ? '' : ' disabled title="' + (p.inj ? 'Still injured' : 'At least ' + LG.IR_MIN + ' weeks on IR') + '"') + '>Activate</button>'; }
  return h;
}
// the group's shares of the plays add up to the men it puts on the field (two receivers: 200%)
function useTotal(L, tid, pos) {
  if (!LG.USE_SPOTS || !LG.USE_SPOTS[pos]) return '';
  const n = LG.USE_SPOTS[pos], t = LG.usageList(L, tid, pos).reduce((s, x) => s + x.u, 0);
  return ' · <span class="usetot' + (t < n * 100 ? ' short' : '') + '" title="Each player\'s usage is the share of plays he is on the field for. Change one and the others adjust.">snaps ' + t + '% of ' + n * 100 + '%' + (n > 1 ? ' (' + n + ' on the field)' : '') + '</span>';
}
function useCell(L, tid, p, edit) {
  if (!LG.USE_DEFAULT[p.p]) return '';
  if (!LG.healthy(p)) return '<span class="use"><small>sits while hurt' + (p.use != null ? ' (usage ' + p.use + '% when back)' : '') + '</small></span> ';
  const x = LG.usageList(L, tid, p.p).find(y => y.p === p), u = x ? x.u : 0, sh = LG.snapShare(L, p);
  return '<span class="use" title="Share of plays he is on the field for (the others in his group adjust when you change it); on passing downs receivers can also play the slot">' + (edit ? '<input type="number" min="0" max="100" step="1" data-hc="use" data-id="' + p.i + '" value="' + u + '" aria-label="Usage for ' + esc(p.n) + '">%' : 'use ' + u + '%') +
    (sh != null ? ' <small>played ' + Math.round(sh * 100) + '%</small>' : '') + '</span> ';
}
FRV.roster = A => {
  const L = A.L, tid = FR.rtid != null && L.teams[FR.rtid] ? FR.rtid : A.tid, ro = LG.rosterOf(L, tid), ln = LG.lineup(L, tid);
  const start = {}; POSN.forEach(p => { if (p !== 'KR' && p !== 'PR') ln[p].forEach(x => { start[x.i] = 1; }); });
  const mineT = tid === A.tid, blk = new Set(mineT ? LG.blockOf(L, tid) : []);
  let h = '<div class="panel"><div class="row between"><h3>' + esc(L.teams[tid].name) + ' · ' + LG.activeRoster(L, tid).length + ' / ' + LG.ROSTER_MAX + (ro.length > LG.activeRoster(L, tid).length ? ' (+' + (ro.length - LG.activeRoster(L, tid).length) + ' IR)' : '') + ' · $' + LG.payroll(L, tid) + 'M of $' + LG.payrollCap(L) + 'M</h3><select data-hc="rtid" aria-label="Team">' + L.teams.map(x => '<option value="' + x.id + '"' + (x.id === tid ? ' selected' : '') + '>' + esc(x.name) + (x.owner ? ' (' + esc(x.owner === 'You' ? 'you' : x.owner) + ')' : '') + '</option>').join('') + '</select></div>';
  // the returner: one of the team's backs, receivers or corners, the best unless the coach picks someone
  const rc = LG.returnerCands(L, tid), cur = LG.returnerOf(L, tid), chosen = L.teams[tid].ret && cur && cur.i === L.teams[tid].ret;
  h += '<div class="row"><b>Returner (kicks and punts)</b>' + (mineT && A.canEditRoster() ? '<select data-hc="ret" aria-label="Returner"><option value="">Best available' + (!chosen && cur ? ': ' + esc(cur.n) + ' · ' + LG.retRating(cur) : '') + '</option>' +
    rc.map(p => '<option value="' + p.i + '"' + (chosen && p.i === cur.i ? ' selected' : '') + '>' + p.p + ' ' + esc(p.n) + ' · ' + LG.retRating(p) + '</option>').join('') + '</select>' : '<span>' + (cur ? cur.p + ' ' + esc(cur.n) + ' · ' + LG.retRating(cur) : 'none') + '</span>') + '</div>';
  POSN.forEach(pos => {
    const list = ro.filter(p => p.p === pos).sort((a, b) => b.o - a.o);
    if ((pos === 'KR' || pos === 'PR') && !list.length) return;   // no returner position any more (older saves may still list some)
    h += '<h4 class="pos-h">' + (LG.POS_NAME && LG.POS_NAME[pos] || pos) + ' <small>' + (pos === 'KR' ? 'returns kickoffs' : pos === 'PR' ? 'returns punts' : 'starts ' + LG.counts(L.teams[tid].sch)[pos]) + useTotal(L, tid, pos) + '</small></h4>' +
      tbl(['Pos', 'Name', 'Age', 'OVR', '', ''], plRows(L, list, p => injCell(L, tid, p, mineT && A.canEditRoster()) + useCell(L, tid, p, mineT && A.canEditRoster()) + (start[p.i] ? '<span class="star" title="Starter">★</span> ' : '') + (mineT && blk.has(p.i) ? '<span class="blk" title="On the trading block">BLOCK</span> ' : '') +
        (mineT && A.canEditRoster() && LG.counts(L.teams[tid].sch)[p.p] ? (p.st ? '<button class="btn small" data-h="fr-st" data-id="' + p.i + '" data-on="" title="You named him a starter">Starter ✓</button>' : !start[p.i] && LG.healthy(p) ? '<button class="btn small ghost" data-h="fr-st" data-id="' + p.i + '" data-on="1">Start</button>' : '') : '') +
        (mineT && A.canEditRoster() ? (A.blockBids ? '<button class="btn small ghost" data-h="fr-blk" data-id="' + p.i + '" data-on="' + (blk.has(p.i) ? '' : '1') + '">' + (blk.has(p.i) ? 'Off block' : 'Shop') + '</button>' : '') + '<button class="btn small ghost" data-h="fr-rel" data-id="' + p.i + '">Release</button>' : '')));
  });
  return h + '</div>';
};
ACT['fr-st'] = async t => { const r = await FR.A.act('starter', { pid: t.dataset.id, on: !!t.dataset.on }); if (r && !r.ok && r.msg) toast(r.msg); };
ACT['fr-ir'] = async t => { const r = await FR.A.act('ir', { pid: t.dataset.id }); if (r && !r.ok && r.msg) toast(r.msg); };
ACT['fr-act'] = async t => { const r = await FR.A.act('activate', { pid: t.dataset.id }); if (r && !r.ok && r.msg) toast(r.msg); };
ACT['fr-blk'] = async t => { const r = await FR.A.act('block', { pid: t.dataset.id, on: !!t.dataset.on }); FR.bids = null; if (r && r.ok && t.dataset.on) toast('On the block. See bids on the Trades tab.'); };
ACT['fr-rel'] = async t => { const p = PL(FR.A.L, t.dataset.id); if (!p || !confirm('Release ' + p.n + '?')) return; await FR.A.act('release', { pid: t.dataset.id }); };

FRV.stand = A => {
  const L = A.L, S = LG.standings(L);
  let h = '';
  S.divs.forEach(d => {
    h += '<div class="panel"><h3>' + esc(d.name) + '</h3>' + tbl(['Team', 'W-L-T', 'PF', 'PA', 'Diff'], d.rows.map(r => { const t = L.teams[r.id]; return '<tr class="' + (r.id === A.tid ? 'me' : '') + '"><td class="nm">' + tmName(t) + (t.owner ? ' <small class="hum">' + esc(t.owner === 'You' ? '' : t.owner) + '</small>' : '') + (L.po && L.po.seeds && L.po.seeds[r.id] ? ' <small class="seed">#' + L.po.seeds[r.id] + '</small>' : '') + (t.mode ? ' <small class="tmode ' + t.mode + '" title="' + (t.mode === 'win' ? 'A real contender: spends picks on good players' : 'A really bad team: sells veterans for picks') + '">' + (t.mode === 'win' ? 'Win-now' : 'Rebuilding') + '</small>' : '') + '</td><td>' + rec(r) + '</td><td>' + r.pf + '</td><td>' + r.pa + '</td><td>' + (r.pd > 0 ? '+' : '') + r.pd + '</td></tr>'; }).join('')) + '</div>';
  });
  return h;
};

/* trades */
const plPick = (L, ids, side) => ids.map(p => '<label class="pk"><input type="checkbox" data-h="tr-tog" data-side="' + side + '" data-id="' + p.i + '"' + (FR[side].indexOf(p.i) >= 0 ? ' checked' : '') + '><span class="pos">' + p.p + '</span> ' + plLink(p) + ' <b>' + p.o + '</b> <small>' + p.a + 'y</small></label>').join('');
// draft picks in the trade lists: round, year, who it came from, and where it is expected to land
const pkPick = (L, tid, side, fr0) => {   // (fr0: the teams' strength, worked out once for the whole screen)
  const fr = fr0 || LG.strengthFrac(L), ks = LG.picksOf(L, tid).filter(k => LG.pickOpen(L, k));
  if (!ks.length) return '<p class="hint">No picks to trade.</p>';
  const years = Array.from(new Set(ks.map(k => k.y)));
  return '<div class="pkgrid">' + years.map(y => '<div class="pkrow"><span class="pky">' + y + '</span>' + ks.filter(k => k.y === y).map(k => {
    const id = LG.pickId(k), pj = LG.pickProjection(L, k, fr);
    const tip = 'Round ' + k.r + ', ' + k.y + (k.o === k.t ? '' : ' (from ' + L.teams[k.o].name + ')') + ' · expected overall pick ' + (pj.known ? '' : '≈') + pj.overall + ' · value ' + Math.round(LG.pickValue(L, k, fr));
    return '<label class="pkc' + (k.o === k.t ? '' : ' via') + '" title="' + esc(tip) + '"><input type="checkbox" data-h="tr-tog" data-side="' + side + '" data-id="' + id + '"' + (FR[side].indexOf(id) >= 0 ? ' checked' : '') + '><span>R' + k.r + '</span><b>' + Math.round(LG.pickValue(L, k, fr)) + '</b>' + (k.o === k.t ? '' : '<small>' + esc(L.teams[k.o].abbr) + '</small>') + '</label>';
  }).join('') + '</div>').join('') + '</div>';
};
function faCampHTML(A) {
  const L = A.L, tid = A.tid, room = LG.capRoom(L, tid), n = LG.rosterOf(L, tid).length; let h = '';
  if (L.fa) {
    const exp = L.fa.exp.map(id => PL(L, id)).filter(Boolean).sort((a, b) => b.o - a.o);
    h += '<div class="panel next"><span class="eyebrow">Free agency · day ' + L.fa.day + ' of ' + L.fa.days + '</span><h3>Your expiring contracts</h3>' + (exp.length ? tbl(['Pos', 'Name', 'Age', 'OVR', '', ''], plRows(L, exp, p => { const d = LG.demandOf(L, p); return '<small>asks about $' + (Math.round((d.s + d.b / d.y) * 10) / 10) + 'M/yr' + (LG.isStar(L, p) ? ' · morale ' + LG.moraleOf(L, p) : '') + '</small> <button class="btn small primary" data-h="ct-open" data-id="' + p.i + '">Negotiate</button><button class="btn small ghost" data-h="ct-walk" data-id="' + p.i + '">Let walk</button>'; })) : '<p class="hint">All your contracts are settled.</p>') + '<div class="row"><button class="btn" data-h="fa-next">' + (L.fa.day >= L.fa.days ? 'Finish free agency: go to the draft' : 'Next day') + '</button></div></div>';
  }
  const fa = Object.values(L.players).filter(p => p.t === -1 && (FR.faPos === 'ALL' || p.p === FR.faPos)).sort((a, b) => b.o - a.o).slice(0, 40);
  h += '<div class="panel"><div class="row between"><h3>On the market</h3><select data-hc="fapos" aria-label="Position"><option>ALL</option>' + POSN.map(p => '<option' + (p === FR.faPos ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></div><p class="hint">Roster ' + n + ' / ' + LG.ROSTER_MAX + ' · payroll $' + LG.payroll(L, tid) + 'M of the $' + LG.payrollCap(L) + 'M cap · <b>' + (room >= 0 ? '$' + room + 'M room' : '$' + (-room) + 'M over the cap') + '</b>.</p>' +
    tbl(['Pos', 'Name', 'Age', 'OVR', '', ''], plRows(L, fa, p => (p.was != null && L.teams[p.was] ? '<small>was ' + esc(L.teams[p.was].abbr) + '</small> ' : '') + (p.o >= 70 && !(L.talks[p.i] && L.talks[p.i].state === 'closed') ? '<button class="btn small primary" data-h="ct-open" data-id="' + p.i + '">Negotiate</button>' : '<button class="btn small" data-h="fr-sign" data-id="' + p.i + '">Sign $' + LG.salOf(p) + 'M</button>'))) + '</div>';
  return h;
}
const PICKHUNT = [['PICK', 'Any pick'], ['R1', 'Round 1'], ['R2', 'Round 2'], ['R3', 'Round 3'], ['RL', 'Later rounds']];
FRV.trades = A => {
  const L = A.L, tid = A.tid;
  LG.ensurePicks(L);
  if (!LG.canTrade(L)) return '<div class="panel"><h3>Trades are closed</h3><p class="sub">' + (L.cfg && L.cfg.trades === false ? 'The manager turned trading off for this league.' : 'The deadline has passed. Trading opens again in the offseason.') + '</p></div>';
  const others = L.teams.filter(t => t.id !== tid);
  if (FR.to == null || FR.to === tid || !L.teams[FR.to]) FR.to = others[0].id;
  const to = L.teams[FR.to];
  const mine = LG.rosterOf(L, tid).sort((a, b) => POSN.indexOf(a.p) - POSN.indexOf(b.p) || b.o - a.o), theirs = LG.rosterOf(L, FR.to).sort((a, b) => POSN.indexOf(a.p) - POSN.indexOf(b.p) || b.o - a.o);
  const frs = LG.strengthFrac(L);
  const valSum = ids => Math.round(ids.reduce((s, id) => s + LG.assetValue(L, id, frs), 0));
  let h = '';
  if (A.kind === 'league') {
    const inc = (L.offers || []).filter(o => o.to === tid), out = (L.offers || []).filter(o => o.from === tid);
    if (inc.length || out.length) {
      h += '<div class="panel"><h3>Offers between managers</h3><ul class="offers">' +
        inc.map(o => '<li><b>' + esc(L.teams[o.from].name) + '</b> offer ' + o.give.map(i => esc(plLabel(L, i))).join(', ') + ' for your ' + o.get.map(i => esc(plLabel(L, i))).join(', ') + '<span class="row"><button class="btn small primary" data-h="to-acc" data-id="' + o.id + '">Accept</button><button class="btn small" data-h="to-dec" data-id="' + o.id + '">Decline</button></span></li>').join('') +
        out.map(o => '<li>You offered ' + o.give.map(i => esc(plLabel(L, i))).join(', ') + ' to <b>' + esc(L.teams[o.to].name) + '</b> for ' + o.get.map(i => esc(plLabel(L, i))).join(', ') + '<span class="row"><button class="btn small ghost" data-h="to-can" data-id="' + o.id + '">Cancel</button></span></li>').join('') + '</ul></div>';
    }
  }
  if (FR.talk) { const x = FR.talk; h += '<div class="panel next"><span class="eyebrow">Trade talks with the ' + esc(L.teams[x.t].nick) + '</span><h3>' + esc(x.line) + '</h3>' + (x.give ? '<p>You send: <b>' + x.give.map(i => esc(plLabel(L, i))).join(', ') + '</b><br>You get: <b>' + x.get.map(i => esc(plLabel(L, i))).join(', ') + '</b></p><div class="row"><button class="btn primary" data-h="tk-acc">Accept</button><button class="btn" data-h="tk-cnt">Counter (edit it below)</button><button class="btn ghost" data-h="tk-no">Walk away</button></div>' : '<div class="row"><button class="btn ghost" data-h="tk-no">OK</button></div>') + '</div>'; }
  h += '<div class="panel"><div class="row between"><h3>Propose a trade</h3><select data-hc="trto" aria-label="Trade partner">' + others.map(t => '<option value="' + t.id + '"' + (t.id === FR.to ? ' selected' : '') + '>' + esc(t.name) + (t.owner ? ' (' + esc(t.owner) + ')' : '') + '</option>').join('') + '</select></div>' +
    '<div class="trcols"><div><h4>You send · value ' + valSum(FR.give) + '</h4>' + pkPick(L, tid, 'give', frs) + '<div class="pklist">' + plPick(L, mine, 'give') + '</div></div><div><h4>' + esc(to.nick) + ' send · value ' + valSum(FR.get) + '</h4>' + pkPick(L, FR.to, 'get', frs) + '<div class="pklist">' + plPick(L, theirs, 'get') + '</div></div></div>' +
    '<div class="row"><button class="btn primary" data-h="tr-prop">' + (to.owner ? 'Send offer to ' + esc(to.owner) : 'Propose to ' + esc(to.nick)) + '</button><button class="btn ghost" data-h="tr-clear">Clear</button></div>' +
    (() => { const n = LG.teamNeeds(L, FR.to); return to.owner ? '' : '<p class="sub">' + esc(to.nick) + ' need: <b>' + (n.needs.slice(0, 4).join(', ') || 'nothing urgent') + '</b>' + (n.deep.length ? ' · deep at: ' + n.deep.slice(0, 4).join(', ') : '') + (to.mode ? ' · <b>' + (to.mode === 'win' ? 'win-now contender: they spend picks on good players' : 'rebuilding: they sell veterans for picks') + '</b>' : '') + '</p>'; })() + '<p class="hint">CPU teams judge a deal by their own depth chart: a player who would start for them counts in full, a backup for much less, and a pile of small pieces does not add up to a star. They keep their starting quarterback, will not open a big hole in the lineup, and want the deal to fill a need or add something for the future. Draft picks are worth more the earlier the round and the worse the original team is projected to finish: by its record and rating this season, by its overall rating for later drafts (hover a pick to see its expected overall slot). A pick keeps its value however far away its draft is. Dashed picks came from another team. Rosters must keep a full set of starters and stay at ' + LG.ROSTER_MAX + ' or fewer.</p></div>';
  // trading block: your players up for trade and what CPU teams bid for them
  if (A.blockBids) {
    const blk = LG.blockOf(L, tid), bidsFor = id => (FR.bids || []).find(b => b.id === id);
    h += '<div class="panel"><div class="row between"><h3>Trading block</h3>' + (blk.length ? '<button class="btn small" data-h="tr-bids">' + (FR.bids ? 'Refresh bids' : 'Get bids') + '</button>' : '') + '</div>' +
      (!blk.length ? '<p class="hint">Nobody is on the block. Press Shop next to a player on the Roster tab (up to ' + LG.BLOCK_MAX + ') and CPU teams will bid for him.</p>' :
        blk.map(id => { const b = bidsFor(id), p = PL(L, id);
          return '<div class="blkrow"><div class="row between"><b>' + esc(plLabel(L, id)) + ' <small>value ' + valSum([id]) + ' · ' + p.a + 'y</small></b><button class="btn small ghost" data-h="fr-blk" data-id="' + id + '" data-on="">Take off block</button></div>' +
            (!FR.bids ? '' : b && b.bids.length ? '<ul class="offers">' + b.bids.map((x, i) => '<li>' + esc(L.teams[x.t].name) + ' bid ' + x.get.map(g => esc(plLabel(L, g))).join(' + ') + ' <small>(value ' + valSum(x.get) + ')</small><span class="row"><button class="btn small primary" data-h="tr-bidacc" data-id="' + id + '" data-i="' + i + '">Accept</button></span></li>').join('') + '</ul>' : '<p class="hint">No CPU team wants him at a fair price right now.</p>') + '</div>';
        }).join('') + (FR.bids ? '' : '<p class="hint">Get bids to see what each CPU team would give: its best offer of a player or pick (or two) that it still thinks is worth it.</p>')) + '</div>';
  }
  const opos = FR.opos || 'ALL', posName = { QB: 'quarterback', HB: 'running back', WR: 'wide receiver', TE: 'tight end', OL: 'offensive lineman', DE: 'defensive end', DT: 'defensive tackle', LB: 'linebacker', CB: 'cornerback', S: 'safety', K: 'kicker', P: 'punter', KR: 'kick returner', PR: 'punt returner' };
  h += '<div class="panel"><div class="row between"><h3>CPU offers</h3><div class="row"><select data-hc="opos" aria-label="What you want"><option value="ALL">My biggest needs</option><optgroup label="A player">' + POSN.map(p => '<option value="' + p + '"' + (p === opos ? ' selected' : '') + '>' + p + '</option>').join('') + '</optgroup><optgroup label="A draft pick">' + PICKHUNT.map(x => '<option value="' + x[0] + '"' + (x[0] === opos ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</optgroup></select><button class="btn small" data-h="tr-offers">Find offers</button></div></div>' +
    (FR.offers ? (FR.offers.length ? '<ul class="offers">' + FR.offers.map((o, i) => '<li>' + esc(L.teams[o.t].name) + ' would give ' + o.get.map(id => esc(plLabel(L, id))).join(', ') + ' for your ' + o.give.map(id => esc(plLabel(L, id))).join(', ') + ' <small>(value ' + valSum(o.get) + ' for ' + valSum(o.give) + ')</small><span class="row"><button class="btn small primary" data-h="tr-acc" data-i="' + i + '">Accept</button></span></li>').join('') + '</ul>'
      : '<p class="hint">' + (PICKHUNT.some(x => x[0] === FR.offersPos) ? 'No CPU team would sell that kind of pick for a fair price from what you can spare right now.' : FR.offersPos && FR.offersPos !== 'ALL' ? 'No CPU team has a ' + posName[FR.offersPos] + ' who would help your lineup that they would trade for a fair price right now.' : 'No teams are interested right now.') + '</p>')
      : '<p class="hint">Your biggest needs: <b>' + (LG.teamNeeds(L, tid).needs.slice(0, 4).join(', ') || 'nothing urgent') + '</b>. Ask around to see which CPU teams would make a deal. Pick a position to shop for a player, or a round to shop for a draft pick: each team names the cheapest fair package of the players and picks you can spare.</p>') + '</div>';
  return h;
};
// asking for one player: the CPU team names a price that is good for it; you can accept it, or counter
ACT['tr-ask'] = async t => { const id = t.dataset.id, L = FR.A.L, p = PL(L, id); G.closeModal(); FR.tab = 'trades'; const r = await FR.A.act('ask', { pid: id, to: p.t }); FR.talk = r && r.give ? { t: p.t, give: r.give, get: r.get, line: L.teams[p.t].nick + ' would make this deal for ' + p.n + ':' } : { t: p.t, line: (r && r.msg) || 'No deal.' }; frShow(FR.A); window.scrollTo(0, 0); };
ACT['tk-acc'] = async () => { const x = FR.talk; const r = await FR.A.act('trade', { to: x.t, give: x.give, get: x.get }); FR.talk = null; if (r) toast(r.msg || 'Done.'); frShow(FR.A); };
ACT['tk-cnt'] = () => { const x = FR.talk; FR.to = x.t; FR.give = x.give.slice(); FR.get = x.get.slice(); FR.talk = null; frShow(FR.A); };
ACT['tk-no'] = () => { FR.talk = null; frShow(FR.A); };
ACT['tr-tog'] = t => { const a = FR[t.dataset.side], i = a.indexOf(t.dataset.id); if (t.checked && i < 0) a.push(t.dataset.id); else if (!t.checked && i >= 0) a.splice(i, 1); frShow(FR.A); };
ACT['tr-clear'] = () => { FR.give = []; FR.get = []; frShow(FR.A); };
ACT['tr-prop'] = async () => {
  if (!FR.give.length && !FR.get.length) { toast('Pick at least one player or draft pick.'); return; }
  const r = await FR.A.act('trade', { to: FR.to, give: FR.give.slice(), get: FR.get.slice() });
  if (r && r.ok) { FR.give = []; FR.get = []; FR.offers = null; }
  if (r) toast(r.msg || (r.ok ? 'Done.' : 'No deal.'));
  frShow(FR.A);
};
ACT['tr-offers'] = async t => { const pos = FR.opos || 'ALL'; t.disabled = true; const o = await FR.A.cpuOffers(pos === 'ALL' ? null : pos); t.disabled = false; FR.offers = o; FR.offersPos = pos; frShow(FR.A); };
ACT['tr-bids'] = async t => { t.disabled = true; const b = await FR.A.blockBids(); t.disabled = false; FR.bids = b || []; frShow(FR.A); };
ACT['tr-bidacc'] = async t => {
  const b = (FR.bids || []).find(x => x.id === t.dataset.id), x = b && b.bids[+t.dataset.i]; if (!x) return;
  const r = await FR.A.act('trade', { to: x.t, give: [b.id], get: x.get }); if (r) toast(r.msg); FR.bids = null; frShow(FR.A);
};
ACT['tr-acc'] = async t => { const o = FR.offers[+t.dataset.i]; const r = await FR.A.act('trade', { to: o.t, give: o.give, get: o.get }); if (r) toast(r.msg); FR.offers = null; frShow(FR.A); };
ACT['to-acc'] = async t => { const r = await FR.A.act('tradeop', { id: t.dataset.id, act: 'accept' }); if (r) toast(r.msg || 'Done.'); };
ACT['to-dec'] = async t => { await FR.A.act('tradeop', { id: t.dataset.id, act: 'decline' }); };
ACT['to-can'] = async t => { await FR.A.act('tradeop', { id: t.dataset.id, act: 'cancel' }); };

/* free agents */
const contractForm = (L, p, t) => { const a = t.ask; return '<div class="ctform" data-pid="' + p.i + '"><label>Years<input type="number" data-c="y" min="1" max="6" value="' + a.y + '"></label><label>Base $M/yr<input type="number" step="0.1" data-c="s" value="' + a.s + '"></label><label>Signing bonus $M<input type="number" step="0.1" data-c="b" value="' + a.b + '"></label><label>Guaranteed %<input type="number" data-c="g" min="0" max="100" value="' + a.g + '"></label><label>Incentives $M/yr<input type="number" step="0.1" data-c="i" value="0"></label><button class="btn primary" data-h="ct-offer" data-id="' + p.i + '">Send offer</button></div><p class="hint"><b>Cap hit</b> is base plus the bonus spread over the years, and it counts against the cap each season. <b>Guaranteed</b> money and the unspent bonus stay on your cap as dead money if you cut him. <b>Incentives</b> do not count on the cap, but players value them at half. Patience left: ' + t.pat + '.</p>'; };
function threadHTML(L, p) {
  const t = L.talks[p.i]; if (!t) return '';
  return '<div class="thread">' + t.msgs.map(m => '<div class="msg ' + m.from + '"><b>' + (m.from === 'you' ? 'You' : esc(p.n)) + '</b><p>' + esc(m.text) + '</p></div>').join('') + '</div>' + (t.state === 'open' ? contractForm(L, p, t) : '<p class="hint">' + ({ signed: 'Signed.', closed: 'He has ended the talks.', gone: 'He signed somewhere else.', old: 'These talks ended last offseason.' }[t.state] || '') + '</p>');
}
ACT['ct-open'] = async t => { await FR.A.act('ct-open', { pid: t.dataset.id }); FR.tab = 'inbox'; FR.mail = 'c' + t.dataset.id; frShow(FR.A); };
ACT['ct-walk'] = async t => { const p = PL(FR.A.L, t.dataset.id); if (p && confirm('Let ' + p.n + ' walk?')) await FR.A.act('walk', { pid: t.dataset.id }); };
ACT['ct-offer'] = async t => { const f = t.closest('.ctform'), o = {}; f.querySelectorAll('[data-c]').forEach(i => { o[i.dataset.c] = +i.value; }); const r = await FR.A.act('ct-offer', { pid: t.dataset.id, o }); if (r && r.msg) toast(r.msg); };
FRV.fa = A => {
  const L = A.L;
  if (L.camp) return faCampHTML(A);
  const fa = Object.values(L.players).filter(p => p.t === -1 && (FR.faPos === 'ALL' || p.p === FR.faPos)).sort((a, b) => b.o - a.o).slice(0, 40);
  const n = LG.rosterOf(L, A.tid).length, room = LG.capRoom(L, A.tid), sal = p => LG.salOf(p);
  return '<div class="panel"><div class="row between"><h3>Free agents</h3><select data-hc="fapos" aria-label="Position"><option>ALL</option>' + POSN.map(p => '<option' + (p === FR.faPos ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></div>' +
    '<p class="hint">Roster ' + n + ' / ' + LG.ROSTER_MAX + ' · payroll $' + LG.payroll(L, A.tid) + 'M of the $' + LG.payrollCap(L) + 'M cap · <b>' + (room >= 0 ? '$' + room + 'M room' : '$' + (-room) + 'M over the cap') + '</b>. Free agents are paid like everyone else: their real contract, or the market price for their position and rating.</p>' +
    tbl(['Pos', 'Name', 'Age', 'OVR', '', ''], plRows(L, fa, p => A.canEditRoster() ? '<button class="btn small" data-h="fr-sign" data-id="' + p.i + '"' + (sal(p) > room + 1e-6 || n >= LG.ROSTER_MAX ? ' disabled title="' + (n >= LG.ROSTER_MAX ? 'Roster is full' : 'Not enough cap room') + '"' : '') + '>Sign · $' + sal(p) + 'M</button>' : '')) + '</div>';
};
ACT['fr-sign'] = async t => { const r = await FR.A.act('sign', { pid: t.dataset.id }); if (r && !r.ok) toast(r.msg); };

/* stats */
/* any team's players (your own by default): one game, the season so far, a past season, or a whole career */
const STCOL = [
  ['Passing', ['pc', 'C'], ['pa', 'Att'], ['pyd', 'Yds'], ['ptd', 'TD'], ['int', 'INT']],
  ['Rushing', ['att', 'Att'], ['ryd', 'Yds'], ['rtd', 'TD']],
  ['Receiving', ['rec', 'Rec'], ['recyd', 'Yds'], ['rectd', 'TD']],
  ['Defense', ['sk', 'Sacks'], ['dint', 'INT'], ['pbu', 'PBU']]
];
function teamStatsPanel(A) {
  const key = A.L.seed + ':' + A.tid; if (FR.stKey !== key) { FR.stKey = key; FR.stid = null; }   // a different save or league starts on your own team
  const L = A.L, tid = FR.stid != null && L.teams[FR.stid] ? FR.stid : A.tid >= 0 ? A.tid : 0, games = LG.gameLog(L, tid);
  const mine = tid === A.tid, kept = !!L.teams[tid].owner || !!L.camp;   // single games and past seasons are only stored for teams a person runs
  const years = Array.from(new Set(Object.values(L.players).reduce((a, p) => a.concat((p.ss || []).filter(x => x.t === tid).map(x => x.y)), []))).sort((a, b) => b - a);
  let view = FR.sview;
  if ((view.indexOf('g:') === 0 && !games.some(g => 'g:' + g.id === view)) || (view === 'career' && !kept)) view = FR.sview = 'season';
  const opt = (v, label) => '<option value="' + v + '"' + (view === v ? ' selected' : '') + '>' + esc(label) + '</option>';
  const gl = g => { const home = g.h === tid, opp = L.teams[home ? g.a : g.h], me = home ? g.sh : g.sa, th = home ? g.sa : g.sh; return (g.pl === 'po' ? 'Playoffs' : 'Week ' + g.w) + ' ' + (home ? 'vs ' : '@ ') + opp.abbr + ' · ' + (me > th ? 'W' : me < th ? 'L' : 'T') + ' ' + me + '-' + th; };
  const rows = LG.teamStats(L, tid, view);
  let h = '<div class="panel"><div class="row between"><h3>' + (mine ? 'Your players' : esc(L.teams[tid].name)) + '</h3><div class="row">' +
    '<select data-hc="stid" aria-label="Team">' + L.teams.map(x => '<option value="' + x.id + '"' + (x.id === tid ? ' selected' : '') + '>' + esc(x.name) + (x.owner ? ' (' + esc(x.owner === 'You' ? 'you' : x.owner) + ')' : '') + '</option>').join('') + '</select>' +
    '<select data-hc="sview" aria-label="Stat period">' +
    opt('season', 'Season ' + L.season + ' · total') + games.slice().reverse().map(g => opt('g:' + g.id, gl(g))).join('') + years.map(y => opt('y:' + y, y + ' season')).join('') + (kept ? opt('career', 'Career with this team') : '') + '</select></div></div>' +
    (kept ? '' : '<p class="hint">Single games and past seasons are only kept for teams a person runs, so this team shows this season\'s totals.</p>');
  if (!rows.length) return h + '<p class="hint">' + (view === 'season' ? 'No stats yet. They appear as ' + (mine ? 'your' : 'their') + ' games are played.' : 'No stats recorded for this period.') + '</p></div>';
  const num = v => v || 0;
  STCOL.forEach(c => {
    const cols = c.slice(1), sort = { Passing: 'pyd', Rushing: 'ryd', Receiving: 'recyd', Defense: 'sk' }[c[0]];
    const list = rows.filter(r => cols.some(k => r.s[k[0]])).sort((a, b) => num(b.s[sort]) - num(a.s[sort]));
    if (!list.length) return;
    h += '<h4 class="pos-h">' + c[0] + '</h4>' + tbl(['Player'].concat(cols.map(k => k[1])), list.map(r => '<tr><td class="nm"><span class="pos">' + r.p.p + '</span> ' + plLink(r.p) + (r.p.t !== tid ? ' <small>(' + (r.p.t >= 0 ? esc(L.teams[r.p.t].abbr) : 'FA') + ')</small>' : '') + '</td>' + cols.map(k => '<td>' + num(r.s[k[0]]) + '</td>').join('') + '</tr>').join(''));
  });
  return h + '</div>';
}
FRV.stats = A => {
  const L = A.L;
  const cats = [['pyd', 'Passing yards'], ['ptd', 'Passing TDs'], ['ryd', 'Rushing yards'], ['recyd', 'Receiving yards'], ['sk', 'Sacks'], ['dint', 'Interceptions']];
  let h = teamStatsPanel(A);
  h += '<div class="grid2">';
  cats.forEach(c => {
    const top = LG.leaders(L, c[0], 6);
    h += '<div class="panel"><h3>' + c[1] + '</h3>' + (top.length ? '<ol class="leaders">' + top.map(x => { const t = L.teams[x.t]; return '<li class="' + (x.t === A.tid ? 'me' : '') + '"><span>' + plLink({ i: x.id, n: x.n }) + ' <small>' + (t ? esc(t.abbr) : 'FA') + '</small></span><b>' + x.v + '</b></li>'; }).join('') + '</ol>' : '<p class="hint">No games played yet.</p>') + '</div>';
  });
  h += '</div>';
  const withAw = L.hist.filter(x => x.awards && (x.awards.players.length || x.awards.teams.length));
  if (withAw.length) {
    h += '<div class="panel"><h3>Awards</h3>' + withAw.slice().reverse().slice(0, 5).map(x => '<h4 class="pos-h">' + x.season + ' season</h4><ul class="news awards">' +
      x.awards.players.map(a => '<li class="' + (a.t === A.tid ? 'me' : '') + '"><span>' + a.label + '</span> <b>' + esc(a.n) + '</b> <small>' + a.p + ' · ' + esc((L.teams[a.t] || { abbr: '' }).abbr) + '</small></li>').join('') +
      x.awards.teams.map(a => '<li class="' + (a.t === A.tid ? 'me' : '') + '"><span>' + a.label + '</span> <b>' + esc(L.teams[a.t].name) + '</b></li>').join('') + '</ul>').join('') + '</div>';
  }
  const hof = (L.hof || []).slice().reverse(), gone = A.tid >= 0 ? Object.values(L.players).filter(p => p.t === -2 && p.lt === A.tid && !hof.some(x => x.i === p.i)).sort((a, b) => (b.ry || 0) - (a.ry || 0) || (b.peak || b.o) - (a.peak || a.o)).slice(0, 30) : [];
  if (hof.length) h += '<div class="panel"><h3>Hall of Fame</h3><ul class="news">' + hof.map(x => '<li><span>' + x.y + '</span> <a href="#" class="plk" data-h="fr-pl" data-id="' + esc(x.i) + '">' + esc(x.n) + '</a> <small>' + x.p + ' · ' + esc((L.teams[x.t] || { name: '' }).name) + ' · peak ' + x.peak + '</small></li>').join('') + '</ul></div>';
  if (gone.length) h += '<div class="panel"><h3>Your retired players</h3><ul class="news">' + gone.map(p => '<li><span>' + (p.ry || '') + '</span> ' + plLink(p) + ' <small>' + p.p + ' · peak ' + (p.peak || p.o) + '</small> ' + (A.canEditRoster() ? '<button class="btn small" data-h="fr-hof" data-id="' + p.i + '">Hall of Fame</button>' : '') + '</li>').join('') + '</ul></div>';
  if (L.hist.length) h += '<div class="panel"><h3>Champions</h3><ul class="news">' + L.hist.slice().reverse().map(x => '<li><span>' + x.season + '</span> ' + (x.champ != null ? esc(L.teams[x.champ].name) : '—') + '</li>').join('') + '</ul></div>';
  return h;
};

const draftTradeHTML = (L, tid) => { const x = FR.drTr, frs = LG.strengthFrac(L), val = ids => Math.round(ids.reduce((t, id) => t + LG.assetValue(L, id, frs), 0)); return '<div class="panel"><h3>' + (x.k === 'up' ? 'Trade up' : 'Trade down') + '</h3><p class="hint">Pick values climb steeply toward the top of the board.</p>' + (x.list.length ? '<ul class="offers">' + x.list.map((o, i) => '<li>' + (x.k === 'up' ? 'Pick #' + o.slot + ' from the ' + esc(L.teams[o.t].nick) + ' for your ' + o.give.map(g => esc(plLabel(L, g))).join(' + ') : esc(L.teams[o.t].nick) + ' give ' + o.get.map(g => esc(plLabel(L, g))).join(' + ') + ' for your ' + o.give.map(g => esc(plLabel(L, g))).join(' + ')) + ' <small>(value ' + val(o.get) + ' for ' + val(o.give) + ')</small><span class="row"><button class="btn small primary" data-h="dr-acc" data-i="' + i + '">Accept</button></span></li>').join('') + '</ul>' : '<p class="hint">No team has a deal for you right now.</p>') + '</div>'; };
ACT['dr-adv'] = async t => { FR.drTr = null; await FR.A.go('draft-' + t.dataset.m); };
ACT['dr-up'] = () => { FR.drTr = { k: 'up', list: LG.draftUpOffers(FR.A.L, FR.A.tid) }; frShow(FR.A); };
ACT['dr-down'] = () => { FR.drTr = { k: 'down', list: LG.draftDownBids(FR.A.L, FR.A.tid) }; frShow(FR.A); };
ACT['dr-acc'] = async t => { const o = FR.drTr.list[+t.dataset.i]; FR.drTr = null; const r = await FR.A.act('trade', { to: o.t, give: o.give, get: o.get }); if (r) toast(r.msg || 'Done.'); };
/* draft board */
FRV.draft = A => {
  const L = A.L, d = L.draft, tid = A.tid, on = LG.onClock(L);
  if (!d) return '<div class="panel"><p class="hint">No draft is running.</p></div>';
  const q = FR.dq.toLowerCase(), mineTurn = on === tid && tid >= 0;
  let pool = d.pool.map(id => PL(L, id)).filter(p => p && (FR.dpos === 'ALL' || p.p === FR.dpos) && (!q || p.n.toLowerCase().indexOf(q) >= 0));
  const units = d.units ? d.pool.filter(id => LG.isUnitId(id)) : [], nd = d.units && tid >= 0 ? LG.unitNeeds(L, tid) : null;
  pool.sort((a, b) => (b.o + (d.kind === 'rookie' ? LG.potSeen(b) * 0.5 : 0)) - (a.o + (d.kind === 'rookie' ? LG.potSeen(a) * 0.5 : 0)));   // by what the scouts see
  pool = pool.slice(0, 50);
  const auto = d.auto && (d.auto[tid] === true || d.auto.all === true);
  const myPicks = d.picks.filter(x => x.t === tid && !LG.isUnitId(x.p)).map(x => PL(L, x.p)).filter(Boolean), myUnits = d.picks.filter(x => x.t === tid && LG.isUnitId(x.p)).map(x => LG.draftLabel(L, x.p));
  const left = d.seq.slice(d.pos).filter(t => t === tid).length;
  let h = '<div class="panel next"><span class="eyebrow">Pick ' + Math.min(d.pos + 1, d.seq.length) + ' of ' + d.seq.length + '</span><h2>' + (mineTurn ? 'You are on the clock' : on != null ? esc(L.teams[on].name) + ' are on the clock' : 'Draft complete') + '</h2>' +
    '<p class="sub">You have ' + left + ' pick' + (left === 1 ? '' : 's') + ' left. ' + (d.kind === 'league' ? (d.units ? 'Take one O-line and one defense, and a quarterback, running back, two receivers, tight end, kicker and punter. ' : '') + 'You must still be able to fill every starting spot.' : '') + '</p>' +
    (d.cap && tid >= 0 ? (ci => '<p class="sub">Salary cap $' + d.cap + 'M · spent <b>$' + Math.round(ci.spent * 10) / 10 + 'M</b> · room <b>$' + Math.round(ci.room * 10) / 10 + 'M</b>. Salaries follow rating and position: QBs and pass rushers cost the most, running backs and safeties the least.</p>')(LG.capInfo(L, tid)) : '') +
    '<div class="row">' + (tid >= 0 ? '<button class="btn' + (auto ? ' primary' : '') + '" data-h="fr-dauto">' + (auto ? 'Auto-draft is ON' : 'Auto-draft for me') + '</button>' : '') + (A.draftBtns ? A.draftBtns() : '') + (L.camp && !mineTurn && on != null ? '<button class="btn primary" data-h="dr-adv" data-m="one">Next pick</button><button class="btn" data-h="dr-adv" data-m="me">Sim to my pick</button>' : '') + (L.camp && tid >= 0 ? '<button class="btn" data-h="dr-up">Trade up</button><button class="btn" data-h="dr-down">Trade down</button>' : '') + '</div></div>' + (L.camp && FR.drTr ? draftTradeHTML(L, tid) : '');
  if (units.length) {   // unit drafts: every NFL team's whole O-line and whole defense is one pick
    const kinds = ['OL', 'DEF'].filter(k => !nd || !nd.units[k]);
    if (kinds.length) h += '<div class="panel"><h3>O-lines and defenses</h3><p class="sub">Each is one pick: the team\'s whole unit, starters and backups. Rating is the starters\' average.</p>' + kinds.map(k => {
      const list = units.filter(id => LG.unitOf(L, id).k === k && (!q || LG.unitOf(L, id).name.toLowerCase().indexOf(q) >= 0)).sort((a, b) => LG.draftOvr(L, b) - LG.draftOvr(L, a));
      return '<h4 class="pos-h">' + (k === 'OL' ? 'O-lines' : 'Defenses') + '</h4>' + tbl(['Unit', 'Players', 'OVR', ''], list.map(id => { const u = LG.unitOf(L, id), ok = mineTurn && LG.canDraftId(L, tid, id) && LG.affordableId(L, tid, id);
        return '<tr><td class="nm">' + esc(u.name) + (k === 'DEF' ? ' <small>' + (u.sch === '34' ? '3-4' : '4-3') + '</small>' : '') + '</td><td>' + u.ids.length + '</td><td><b class="ov ' + gradeCls(LG.draftOvr(L, id)) + '">' + LG.draftOvr(L, id) + '</b></td><td class="act">' +
          (mineTurn ? '<button class="btn small primary" data-h="fr-draft" data-id="' + id + '"' + (ok ? '' : ' disabled') + '>Draft' + (d.cap ? ' · $' + LG.salOfId(L, id) + 'M' : '') + '</button>' : (d.cap ? '$' + LG.salOfId(L, id) + 'M' : '')) + '</td></tr>'; }).join(''));
    }).join('') + '</div>';
  }
  h += '<div class="panel"><div class="row between"><h3>Available players</h3><span class="row"><input type="text" id="dq" placeholder="Search name" value="' + esc(FR.dq) + '" aria-label="Search"><select data-hc="dpos" aria-label="Position"><option>ALL</option>' + (d.units ? POSN.filter(p => ['OL', 'DE', 'DT', 'LB', 'CB', 'S'].indexOf(p) < 0) : POSN).map(p => '<option' + (p === FR.dpos ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></span></div>' +
    tbl(['Pos', 'Name', 'Age', 'OVR', '', ''], plRows(L, pool, p => mineTurn ? '<button class="btn small primary" data-h="fr-draft" data-id="' + p.i + '"' + ((d.units ? (!LG.canDraftId(L, tid, p.i) || !LG.affordableId(L, tid, p.i)) : d.kind === 'league' && (!LG.canDraftPos(L, tid, p.p) || !LG.affordable(L, tid, p))) ? ' disabled' : '') + '>Draft' + (d.cap ? ' · $' + Math.round(LG.salOf(p) * 10) / 10 + 'M' : '') + '</button>' : '')) + '</div>';
  if (myPicks.length || myUnits.length) h += '<div class="panel"><h3>Your picks</h3><ul class="news">' + myUnits.map(x => '<li>' + esc(x) + '</li>').join('') + myPicks.map(p => '<li>' + p.p + ' ' + esc(p.n) + ' <b>' + p.o + '</b></li>').join('') + '</ul></div>';
  const recent = d.picks.slice(-8).reverse();
  if (recent.length) h += '<div class="panel"><h3>Recent picks</h3><ul class="news">' + recent.map(x => '<li><span>#' + x.n + '</span> ' + esc(L.teams[x.t].nick) + ': ' + esc(LG.isUnitId(x.p) ? LG.draftLabel(L, x.p) : plLabel(L, x.p)) + '</li>').join('') + '</ul></div>';
  return h;
};
ACT['fr-draft'] = async t => { await FR.A.act('draft', { pid: t.dataset.id }); };
ACT['fr-dauto'] = async () => { const d = FR.A.L.draft, on = !(d.auto && d.auto[FR.A.tid] === true); await FR.A.act('draftauto', { on }); };

/* select and text changes */
const CH = {
  rtid: el => { FR.rtid = +el.value; frShow(FR.A); },
  sview: el => { FR.sview = el.value; frShow(FR.A); },
  stid: el => { FR.stid = +el.value; FR.sview = 'season'; frShow(FR.A); },
  trto: el => { FR.to = +el.value; FR.give = []; FR.get = []; frShow(FR.A); },
  fapos: el => { FR.faPos = el.value; frShow(FR.A); },
  use: async el => { const r = await FR.A.act('use', { pid: el.dataset.id, v: el.value === '' ? null : +el.value }); if (r && !r.ok && r.msg) toast(r.msg); },
  ret: async el => { const r = await FR.A.act('ret', { pid: el.value }); if (r && !r.ok && r.msg) toast(r.msg); },
  opos: el => { FR.opos = el.value; frShow(FR.A); },
  dpos: el => { FR.dpos = el.value; frShow(FR.A); }
};
document.addEventListener('change', ev => { const k = ev.target && ev.target.dataset && ev.target.dataset.hc; if (k && CH[k]) CH[k](ev.target); });
let dqTimer = 0;
document.addEventListener('input', ev => {
  if (ev.target && ev.target.id === 'dq' && FR.A) {
    FR.dq = ev.target.value; clearTimeout(dqTimer);
    dqTimer = setTimeout(() => { frShow(FR.A); const el = $('#dq'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250);
  }
});
