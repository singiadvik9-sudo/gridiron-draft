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
function plRows(L, list, btn) {
  return list.map(p => '<tr><td class="pos">' + p.p + '</td><td class="nm">' + esc(p.n) + '</td><td>' + p.a + '</td><td><b class="ov ' + gradeCls(p.o) + '">' + p.o + '</b> ' + trend(p) + '</td><td class="pt">' + (p.a <= 26 && p.pt > p.o ? 'pot ' + p.pt : '') + '</td><td class="act">' + (btn ? btn(p) : '') + '</td></tr>').join('');
}
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
  const phase = { regular: 'Week ' + L.week, playoffs: 'Playoffs', offseason: 'Offseason', draft: 'Draft', preseason: 'Preseason', setup: 'Setup' }[L.phase] || L.phase;
  let h = '<section class="fr"><div class="frhead">' + (t ? '<div class="frteam">' + tmName(t) + '</div>' : '<div class="frteam">Spectating</div>') +
    '<div class="frmeta"><span class="chip">' + esc(A.title) + '</span><span class="chip">' + L.season + ' · ' + phase + '</span>' + (A.status ? '<span class="chip">' + esc(A.status) + '</span>' : '') + '</div>' +
    '<div class="frbtns">' + (A.headBtns || '') + '</div></div>';
  h += '<nav class="tabs" role="tablist">' + tabs.map(x => '<button class="tab' + (FR.tab === x[0] ? ' on' : '') + '" role="tab" data-h="fr-tab" data-t="' + x[0] + '">' + x[1] + '</button>').join('') + '</nav>';
  const extra = (A.tabs || []).find(x => x.id === FR.tab);
  h += '<div class="frbody">' + (extra ? extra.html() : (FRV[FR.tab] || FRV.home)(A)) + '</div></section>';
  const keep = window.scrollY;
  setMain(h); window.scrollTo(0, keep);
}
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
    else h += '<div class="panel next"><h2>No game this week</h2><p class="sub">' + (A.waitMsg || 'The week moves on once every game is done.') + '</p></div>';
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
  if (L.progress && (L.phase === 'draft' || L.phase === 'preseason')) {
    const mine = LG.rosterOf(L, tid).filter(p => (L.progress.up.indexOf(p.i) >= 0 || L.progress.down.indexOf(p.i) >= 0));
    const ret = L.progress.retired.map(id => PL(L, id)).filter(p => p && p.lt === tid);
    if (mine.length) h += '<div class="panel"><h3>Player development</h3><ul class="news">' + mine.map(p => '<li>' + esc(p.n) + ' (' + p.p + ') ' + (p.h && p.h.length ? (p.h[p.h.length - 1] + ' → <b>' + p.o + '</b>') : p.o) + ' ' + trend(p) + '</li>').join('') + '</ul></div>';
  }
  h += '<div class="panel"><h3>League news</h3>' + (L.news.length ? '<ul class="news">' + L.news.slice(0, 8).map(n => '<li><span>' + n.s + '</span> ' + esc(n.t) + '</li>').join('') + '</ul>' : '<p class="hint">Nothing yet.</p>') + '</div>';
  return h;
};
ACT['fr-play'] = async t => { await FR.A.play(t.dataset.g); };
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

FRV.roster = A => {
  const L = A.L, tid = FR.rtid != null && L.teams[FR.rtid] ? FR.rtid : A.tid, ro = LG.rosterOf(L, tid), ln = LG.lineup(L, tid);
  const start = {}; POSN.forEach(p => ln[p].forEach(x => { start[x.i] = 1; }));
  const mineT = tid === A.tid;
  let h = '<div class="panel"><div class="row between"><h3>' + esc(L.teams[tid].name) + ' · ' + ro.length + ' / ' + LG.ROSTER_MAX + '</h3><select data-hc="rtid" aria-label="Team">' + L.teams.map(x => '<option value="' + x.id + '"' + (x.id === tid ? ' selected' : '') + '>' + esc(x.name) + (x.owner ? ' (' + esc(x.owner === 'You' ? 'you' : x.owner) + ')' : '') + '</option>').join('') + '</select></div>';
  POSN.forEach(pos => {
    const list = ro.filter(p => p.p === pos).sort((a, b) => b.o - a.o);
    h += '<h4 class="pos-h">' + (LG.POS_NAME && LG.POS_NAME[pos] || pos) + ' <small>' + (pos === 'KR' ? 'returns kickoffs' : pos === 'PR' ? 'returns punts' : 'starts ' + LG.counts(L.teams[tid].sch)[pos]) + '</small></h4>' +
      tbl(['Pos', 'Name', 'Age', 'OVR', '', ''], plRows(L, list, p => (start[p.i] ? '<span class="star" title="Starter">★</span> ' : '') + (mineT && A.canEditRoster() ? '<button class="btn small ghost" data-h="fr-rel" data-id="' + p.i + '">Release</button>' : '')));
  });
  return h + '</div>';
};
ACT['fr-rel'] = async t => { const p = PL(FR.A.L, t.dataset.id); if (!p || !confirm('Release ' + p.n + '?')) return; await FR.A.act('release', { pid: t.dataset.id }); };

FRV.stand = A => {
  const L = A.L, S = LG.standings(L);
  let h = '';
  S.divs.forEach(d => {
    h += '<div class="panel"><h3>' + esc(d.name) + '</h3>' + tbl(['Team', 'W-L-T', 'PF', 'PA', 'Diff'], d.rows.map(r => { const t = L.teams[r.id]; return '<tr class="' + (r.id === A.tid ? 'me' : '') + '"><td class="nm">' + tmName(t) + (t.owner ? ' <small class="hum">' + esc(t.owner === 'You' ? '' : t.owner) + '</small>' : '') + (L.po && L.po.seeds && L.po.seeds[r.id] ? ' <small class="seed">#' + L.po.seeds[r.id] + '</small>' : '') + '</td><td>' + rec(r) + '</td><td>' + r.pf + '</td><td>' + r.pa + '</td><td>' + (r.pd > 0 ? '+' : '') + r.pd + '</td></tr>'; }).join('')) + '</div>';
  });
  return h;
};

/* trades */
const plPick = (L, ids, side) => ids.map(p => '<label class="pk"><input type="checkbox" data-h="tr-tog" data-side="' + side + '" data-id="' + p.i + '"' + (FR[side].indexOf(p.i) >= 0 ? ' checked' : '') + '><span class="pos">' + p.p + '</span> ' + esc(p.n) + ' <b>' + p.o + '</b> <small>' + p.a + 'y</small></label>').join('');
// draft picks in the trade lists: round, year, who it came from, and where it is expected to land
const pkPick = (L, tid, side) => {
  const fr = LG.strengthFrac(L), ks = LG.picksOf(L, tid).filter(k => LG.pickOpen(L, k));
  if (!ks.length) return '<p class="hint">No picks to trade.</p>';
  const years = Array.from(new Set(ks.map(k => k.y)));
  return '<div class="pkgrid">' + years.map(y => '<div class="pkrow"><span class="pky">' + y + '</span>' + ks.filter(k => k.y === y).map(k => {
    const id = LG.pickId(k), pj = LG.pickProjection(L, k, fr);
    const tip = 'Round ' + k.r + ', ' + k.y + (k.o === k.t ? '' : ' (from ' + L.teams[k.o].name + ')') + ' · expected overall pick ' + (pj.known ? '' : '≈') + pj.overall + ' · value ' + Math.round(LG.pickValue(L, k, fr));
    return '<label class="pkc' + (k.o === k.t ? '' : ' via') + '" title="' + esc(tip) + '"><input type="checkbox" data-h="tr-tog" data-side="' + side + '" data-id="' + id + '"' + (FR[side].indexOf(id) >= 0 ? ' checked' : '') + '><span>R' + k.r + '</span><b>' + Math.round(LG.pickValue(L, k, fr)) + '</b>' + (k.o === k.t ? '' : '<small>' + esc(L.teams[k.o].abbr) + '</small>') + '</label>';
  }).join('') + '</div>').join('') + '</div>';
};
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
  h += '<div class="panel"><div class="row between"><h3>Propose a trade</h3><select data-hc="trto" aria-label="Trade partner">' + others.map(t => '<option value="' + t.id + '"' + (t.id === FR.to ? ' selected' : '') + '>' + esc(t.name) + (t.owner ? ' (' + esc(t.owner) + ')' : '') + '</option>').join('') + '</select></div>' +
    '<div class="trcols"><div><h4>You send · value ' + valSum(FR.give) + '</h4>' + pkPick(L, tid, 'give') + '<div class="pklist">' + plPick(L, mine, 'give') + '</div></div><div><h4>' + esc(to.nick) + ' send · value ' + valSum(FR.get) + '</h4>' + pkPick(L, FR.to, 'get') + '<div class="pklist">' + plPick(L, theirs, 'get') + '</div></div></div>' +
    '<div class="row"><button class="btn primary" data-h="tr-prop">' + (to.owner ? 'Send offer to ' + esc(to.owner) : 'Propose to ' + esc(to.nick)) + '</button><button class="btn ghost" data-h="tr-clear">Clear</button></div>' +
    '<p class="hint">CPU teams judge by player value, age and what they need. Draft picks are worth more the earlier the round, the sooner the draft, and the worse the original team is projected to finish (hover a pick to see its expected overall slot; far-off picks are less certain and discounted). Dashed picks came from another team. Rosters must keep a full set of starters and stay at ' + LG.ROSTER_MAX + ' or fewer.</p></div>';
  const opos = FR.opos || 'ALL', posName = { QB: 'quarterback', HB: 'running back', WR: 'wide receiver', TE: 'tight end', OL: 'offensive lineman', DL: 'defensive lineman', LB: 'linebacker', CB: 'cornerback', S: 'safety', K: 'kicker', P: 'punter', KR: 'kick returner', PR: 'punt returner' };
  h += '<div class="panel"><div class="row between"><h3>CPU offers</h3><div class="row"><select data-hc="opos" aria-label="Position you want"><option value="ALL">Any position</option>' + POSN.map(p => '<option value="' + p + '"' + (p === opos ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><button class="btn small" data-h="tr-offers">Find offers</button></div></div>' +
    (FR.offers ? (FR.offers.length ? '<ul class="offers">' + FR.offers.map((o, i) => '<li>' + esc(L.teams[o.t].name) + ' would give ' + o.get.map(id => esc(plLabel(L, id))).join(', ') + ' for your ' + o.give.map(id => esc(plLabel(L, id))).join(', ') + ' <small>(value ' + valSum(o.get) + ' for ' + valSum(o.give) + ')</small><span class="row"><button class="btn small primary" data-h="tr-acc" data-i="' + i + '">Accept</button></span></li>').join('') + '</ul>'
      : '<p class="hint">' + (FR.offersPos && FR.offersPos !== 'ALL' ? 'No CPU team has a ' + posName[FR.offersPos] + ' who would help your lineup that they would trade for a fair price right now.' : 'No teams are interested right now.') + '</p>')
      : '<p class="hint">Ask around to see which CPU teams would make a deal. Pick a position to shop for a player there: each team offers its best one who would start for you (or come close), for the cheapest package of your players and picks it would accept.</p>') + '</div>';
  return h;
};
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
ACT['tr-acc'] = async t => { const o = FR.offers[+t.dataset.i]; const r = await FR.A.act('trade', { to: o.t, give: o.give, get: o.get }); if (r) toast(r.msg); FR.offers = null; frShow(FR.A); };
ACT['to-acc'] = async t => { const r = await FR.A.act('tradeop', { id: t.dataset.id, act: 'accept' }); if (r) toast(r.msg || 'Done.'); };
ACT['to-dec'] = async t => { await FR.A.act('tradeop', { id: t.dataset.id, act: 'decline' }); };
ACT['to-can'] = async t => { await FR.A.act('tradeop', { id: t.dataset.id, act: 'cancel' }); };

/* free agents */
FRV.fa = A => {
  const L = A.L;
  const fa = Object.values(L.players).filter(p => p.t === -1 && (FR.faPos === 'ALL' || p.p === FR.faPos)).sort((a, b) => b.o - a.o).slice(0, 40);
  const n = LG.rosterOf(L, A.tid).length;
  return '<div class="panel"><div class="row between"><h3>Free agents</h3><select data-hc="fapos" aria-label="Position"><option>ALL</option>' + POSN.map(p => '<option' + (p === FR.faPos ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></div>' +
    '<p class="hint">Roster ' + n + ' / ' + LG.ROSTER_MAX + '.</p>' + tbl(['Pos', 'Name', 'Age', 'OVR', '', ''], plRows(L, fa, p => A.canEditRoster() ? '<button class="btn small" data-h="fr-sign" data-id="' + p.i + '">Sign</button>' : '')) + '</div>';
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
  const mine = tid === A.tid, kept = !!L.teams[tid].owner;   // single games and past seasons are only stored for teams a person runs
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
    h += '<h4 class="pos-h">' + c[0] + '</h4>' + tbl(['Player'].concat(cols.map(k => k[1])), list.map(r => '<tr><td class="nm"><span class="pos">' + r.p.p + '</span> ' + esc(r.p.n) + (r.p.t !== tid ? ' <small>(' + (r.p.t >= 0 ? esc(L.teams[r.p.t].abbr) : 'FA') + ')</small>' : '') + '</td>' + cols.map(k => '<td>' + num(r.s[k[0]]) + '</td>').join('') + '</tr>').join(''));
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
    h += '<div class="panel"><h3>' + c[1] + '</h3>' + (top.length ? '<ol class="leaders">' + top.map(x => { const t = L.teams[x.t]; return '<li class="' + (x.t === A.tid ? 'me' : '') + '"><span>' + esc(x.n) + ' <small>' + (t ? esc(t.abbr) : 'FA') + '</small></span><b>' + x.v + '</b></li>'; }).join('') + '</ol>' : '<p class="hint">No games played yet.</p>') + '</div>';
  });
  h += '</div>';
  const withAw = L.hist.filter(x => x.awards && (x.awards.players.length || x.awards.teams.length));
  if (withAw.length) {
    h += '<div class="panel"><h3>Awards</h3>' + withAw.slice().reverse().slice(0, 5).map(x => '<h4 class="pos-h">' + x.season + ' season</h4><ul class="news awards">' +
      x.awards.players.map(a => '<li class="' + (a.t === A.tid ? 'me' : '') + '"><span>' + a.label + '</span> <b>' + esc(a.n) + '</b> <small>' + a.p + ' · ' + esc((L.teams[a.t] || { abbr: '' }).abbr) + '</small></li>').join('') +
      x.awards.teams.map(a => '<li class="' + (a.t === A.tid ? 'me' : '') + '"><span>' + a.label + '</span> <b>' + esc(L.teams[a.t].name) + '</b></li>').join('') + '</ul>').join('') + '</div>';
  }
  if (L.hist.length) h += '<div class="panel"><h3>Champions</h3><ul class="news">' + L.hist.slice().reverse().map(x => '<li><span>' + x.season + '</span> ' + (x.champ != null ? esc(L.teams[x.champ].name) : '—') + '</li>').join('') + '</ul></div>';
  return h;
};

/* draft board */
FRV.draft = A => {
  const L = A.L, d = L.draft, tid = A.tid, on = LG.onClock(L);
  if (!d) return '<div class="panel"><p class="hint">No draft is running.</p></div>';
  const q = FR.dq.toLowerCase(), mineTurn = on === tid && tid >= 0;
  let pool = d.pool.map(id => PL(L, id)).filter(p => p && (FR.dpos === 'ALL' || p.p === FR.dpos) && (!q || p.n.toLowerCase().indexOf(q) >= 0));
  pool.sort((a, b) => (b.o + (d.kind === 'rookie' ? b.pt * 0.5 : 0)) - (a.o + (d.kind === 'rookie' ? a.pt * 0.5 : 0)));
  pool = pool.slice(0, 50);
  const auto = d.auto && (d.auto[tid] === true || d.auto.all === true);
  const myPicks = d.picks.filter(x => x.t === tid).map(x => PL(L, x.p)).filter(Boolean);
  const left = d.seq.slice(d.pos).filter(t => t === tid).length;
  let h = '<div class="panel next"><span class="eyebrow">Pick ' + Math.min(d.pos + 1, d.seq.length) + ' of ' + d.seq.length + '</span><h2>' + (mineTurn ? 'You are on the clock' : on != null ? esc(L.teams[on].name) + ' are on the clock' : 'Draft complete') + '</h2>' +
    '<p class="sub">You have ' + left + ' pick' + (left === 1 ? '' : 's') + ' left. ' + (d.kind === 'league' ? 'You must still be able to fill every starting spot.' : '') + '</p>' +
    (d.cap && tid >= 0 ? (ci => '<p class="sub">Salary cap $' + d.cap + 'M · spent <b>$' + Math.round(ci.spent * 10) / 10 + 'M</b> · room <b>$' + Math.round(ci.room * 10) / 10 + 'M</b>. Salaries follow rating and position: QBs and pass rushers cost the most, running backs and safeties the least.</p>')(LG.capInfo(L, tid)) : '') +
    '<div class="row">' + (tid >= 0 ? '<button class="btn' + (auto ? ' primary' : '') + '" data-h="fr-dauto">' + (auto ? 'Auto-draft is ON' : 'Auto-draft for me') + '</button>' : '') + (A.draftBtns ? A.draftBtns() : '') + '</div></div>';
  h += '<div class="panel"><div class="row between"><h3>Available players</h3><span class="row"><input type="text" id="dq" placeholder="Search name" value="' + esc(FR.dq) + '" aria-label="Search"><select data-hc="dpos" aria-label="Position"><option>ALL</option>' + POSN.map(p => '<option' + (p === FR.dpos ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></span></div>' +
    tbl(['Pos', 'Name', 'Age', 'OVR', '', ''], plRows(L, pool, p => mineTurn ? '<button class="btn small primary" data-h="fr-draft" data-id="' + p.i + '"' + (d.kind === 'league' && (!LG.canDraftPos(L, tid, p.p) || !LG.affordable(L, tid, p)) ? ' disabled' : '') + '>Draft' + (d.cap ? ' · $' + Math.round(LG.salOf(p) * 10) / 10 + 'M' : '') + '</button>' : '')) + '</div>';
  if (myPicks.length) h += '<div class="panel"><h3>Your picks</h3><ul class="news">' + myPicks.map(p => '<li>' + p.p + ' ' + esc(p.n) + ' <b>' + p.o + '</b></li>').join('') + '</ul></div>';
  const recent = d.picks.slice(-8).reverse();
  if (recent.length) h += '<div class="panel"><h3>Recent picks</h3><ul class="news">' + recent.map(x => '<li><span>#' + x.n + '</span> ' + esc(L.teams[x.t].nick) + ': ' + esc(plLabel(L, x.p)) + '</li>').join('') + '</ul></div>';
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
