/* ---------- custom leagues (accounts only, shared through the server) ---------- */
const NEWL = { name: 'My League', entry: 'nfl', divisions: false, nDivs: 2, cpus: true, games: 8, playoffs: 4, trades: true, deadline: 10, rounds: 24, rookieRounds: 3 };
const LGS = { code: '', ver: 0, mgr: '', members: [], L: null, member: false };
const parseV = v => v === 'true' ? true : v === 'false' ? false : (/^-?\d+$/.test(v) ? +v : v);

V.leagues = async () => {
  setMain('<section class="panel"><h2>Leagues</h2><p class="sub">Loading…</p></section>');
  const r = await run(() => call('league', { op: 'mine' })); if (!r) return;
  const phase = { setup: 'Setting up', regular: 'Regular season', playoffs: 'Playoffs', offseason: 'Offseason', draft: 'Draft', preseason: 'Preseason' };
  setMain('<section class="panel"><h2>Your leagues</h2>' + (r.leagues.length ? '<ul class="lglist">' + r.leagues.map(l => '<li><div><b>' + esc(l.name) + '</b><span class="sub">' + l.code + ' · ' + (phase[l.phase] || l.phase) + ' · ' + l.season + (l.phase === 'regular' ? ' · week ' + l.week : '') + ' · ' + l.humans + ' managers / ' + l.teams + ' teams' + (l.mgr === H.user ? ' · you manage' : '') + '</span></div><button class="btn primary" data-h="lg-open" data-code="' + l.code + '">Open</button></li>').join('') + '</ul>' : '<p class="hint">You are not in any leagues yet.</p>') +
    '<div class="row"><button class="btn primary" data-h="lg-new">Create a league</button></div></section>' +
    '<section class="panel"><h3>Join with a code</h3><div class="row joinrow"><input id="jn-code" type="text" maxlength="5" placeholder="LEAGUE CODE" autocomplete="off" aria-label="League code"><button class="btn" data-h="join-code">Join</button></div></section>');
  const inp = $('#jn-code'); if (inp) inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
};
ACT['lg-new'] = () => go('leaguenew');
ACT['lg-open'] = t => go('league', { code: t.dataset.code });
ACT['join-code'] = async () => {
  const code = ($('#jn-code').value || '').trim().toUpperCase();
  if (code.length !== 5) { toast('Codes have 5 characters.'); return; }
  const kind = H.view === 'tourneys' ? 'tourney' : 'league';
  const r = await run(() => call(kind, { op: 'join', code })); if (!r) return;
  go(kind, { code });
};

V.leaguenew = () => {
  const n = NEWL, yn = [[true, 'On'], [false, 'Off']];
  setMain('<section class="panel narrow"><h2>Create a league</h2>' +
    '<label class="fld" for="nl-name">League name</label><input id="nl-name" type="text" maxlength="24" value="' + esc(n.name) + '">' +
    '<label class="fld">How do teams start?</label>' + seg('entry', n.entry, [['nfl', 'Pick an NFL team'], ['draft', 'Draft players']]) +
    '<p class="hint">' + (n.entry === 'nfl' ? 'Each manager takes a real franchise with its real starters. Teams can still trade.' : 'Every NFL player goes into one pool and the managers snake-draft their rosters.') + '</p>' +
    '<label class="fld">Divisions</label>' + seg('divisions', n.divisions, yn) +
    (n.divisions ? '<label class="fld">How many divisions</label>' + seg('nDivs', n.nDivs, [[2, '2'], [3, '3'], [4, '4']]) : '') +
    '<label class="fld">CPU teams can fill empty spots</label>' + seg('cpus', n.cpus, yn) +
    '<label class="fld">Games per team</label>' + seg('games', n.games, [[4, '4'], [8, '8'], [12, '12'], [16, '16']]) +
    '<label class="fld">Playoff teams</label>' + seg('playoffs', n.playoffs, [[0, 'None'], [2, '2'], [4, '4'], [8, '8']]) +
    '<label class="fld">Trading between teams</label>' + seg('trades', n.trades, yn) +
    '<div class="row"><button class="btn primary" data-h="lg-create">Create league</button><button class="btn ghost" data-h="leagues">Cancel</button></div></section>');
  const nm = $('#nl-name'); nm.addEventListener('input', () => { n.name = nm.value; });
};
ACT['lg-create'] = async () => {
  const r = await run(() => call('league', { op: 'create', cfg: NEWL })); if (!r) return;
  go('league', { code: r.code });
};
ACT.seg = t => {
  const k = t.dataset.k, v = parseV(t.dataset.v);
  if (H.view === 'leaguenew') { NEWL[k] = v; V.leaguenew(); }
  else if (H.view === 'tourneynew') { NEWT[k] = v; V.tourneynew(); }
  else if (H.view === 'league') lgCfg({ [k]: v });
};

/* loading and rendering */
async function lgLoad(code, force) {
  const r = await call('league', { op: 'get', code, ver: force || LGS.code !== code ? 0 : LGS.ver });
  if (r.same) return false;
  Object.assign(LGS, { code, ver: r.ver, mgr: r.mgr, members: r.members, L: r.L, member: r.member });
  return true;
}
V.league = async p => {
  if (!p.code) return go('leagues');
  if (LGS.code !== p.code) { LGS.L = null; setMain('<section class="panel"><p class="sub">Loading league…</p></section>'); }
  const ok = await run(() => lgLoad(p.code, true)); if (ok === null) { go('leagues'); return; }
  lgRender();
  poll(async () => { if (await lgLoad(p.code)) lgRender(); }, 5000);
};
async function lgReload() { await lgLoad(LGS.code, true); lgRender(); }
function lgRender() {
  if (H.view !== 'league' || G.state.mode !== 'lobby') return;
  const L = LGS.L;
  if (!LGS.member) { setMain('<section class="panel narrow"><h2>' + esc(L.cfg.name) + '</h2><p class="sub">You have not joined this league.</p><div class="row"><button class="btn primary" data-h="lg-join">Join league</button></div></section>'); return; }
  if (L.phase === 'setup') lgLobby(); else frShow(lgAdapter());
}
ACT['lg-join'] = async () => { if (await run(() => call('league', { op: 'join', code: LGS.code }))) lgReload(); };
async function lgOp(op, extra) {
  const r = await run(() => call('league', Object.assign({ op, code: LGS.code }, extra || {})));
  if (r && r.deleted) { go('leagues'); return r; }
  if (r && r.left) { go('leagues'); return r; }
  if (r) await lgReload();
  return r;
}
async function lgCfg(c) { await lgOp('cfg', { cfg: c }); }

/* lobby (before the league starts) */
function lgLobby() {
  const L = LGS.L, c = L.cfg, me = H.user, mgr = LGS.mgr === me, mine = L.teams.find(t => t.owner === me), yn = [[true, 'On'], [false, 'Off']];
  const phaseTip = c.entry === 'draft' ? 'Managers draft their rosters from every NFL player.' : 'Managers take real NFL franchises.';
  let h = '<section class="panel"><div class="row between"><h2>' + esc(c.name) + '</h2><button class="btn small" data-h="copy" data-code="' + LGS.code + '">Code ' + LGS.code + ' · copy</button></div>' +
    '<p class="sub">Share the code. Friends need an account to join. ' + phaseTip + '</p></section>';
  // settings
  const sett = mgr ? '<div class="setgrid">' +
    '<div><label class="fld">Divisions</label>' + seg('divisions', c.divisions, yn) + '</div>' +
    (c.divisions ? '<div><label class="fld">How many</label>' + seg('nDivs', c.nDivs, [[2, '2'], [3, '3'], [4, '4']]) + '</div>' : '') +
    '<div><label class="fld">CPU teams</label>' + seg('cpus', c.cpus, yn) + '</div>' +
    '<div><label class="fld">Games each</label>' + seg('games', c.games, [[4, '4'], [8, '8'], [12, '12'], [16, '16']]) + '</div>' +
    '<div><label class="fld">Playoff teams</label>' + seg('playoffs', c.playoffs, [[0, 'None'], [2, '2'], [4, '4'], [8, '8']]) + '</div>' +
    '<div><label class="fld">Trading</label>' + seg('trades', c.trades, yn) + '</div>' +
    (c.entry === 'draft' ? '<div><label class="fld">Draft rounds</label>' + seg('rounds', c.rounds, [[21, '21'], [24, '24'], [28, '28']]) + '</div>' : '') +
    '</div>' : '<div class="chips">' + [c.entry === 'nfl' ? 'NFL teams' : 'Player draft', c.divisions ? c.nDivs + ' divisions' : 'No divisions', c.cpus ? 'CPU teams on' : 'No CPUs', c.games + ' games', c.playoffs ? c.playoffs + ' in playoffs' : 'No playoffs', c.trades ? 'Trading on' : 'No trading'].map(x => '<span class="chip">' + x + '</span>').join('') + '</div>';
  h += '<section class="panel"><h3>Settings' + (mgr ? '' : ' <small>(set by the manager)</small>') + '</h3>' + sett + '</section>';
  // teams
  const used = L.teams.map(t => t.abbr);
  const free = c.entry === 'nfl' ? E.TEAMS.filter(t => used.indexOf(t.abbr) < 0) : [];
  const divOpts = c.divisions ? Array.from({ length: c.nDivs }, (_, i) => 'D' + (i + 1)) : [];
  h += '<section class="panel"><h3>Teams (' + L.teams.length + ')</h3>' + (L.teams.length ? tbl(['Team', 'Run by', c.divisions ? 'Division' : '', ''], L.teams.map(t => {
    const dsel = c.divisions ? (mgr ? '<select data-hc="lgdiv" data-tid="' + t.id + '">' + divOpts.map(d => '<option value="' + d + '"' + ((t.div || 'D' + ((t.id % c.nDivs) + 1)) === d ? ' selected' : '') + '>Division ' + d.slice(1) + '</option>').join('') + '</select>' : esc(t.div ? 'Division ' + t.div.slice(1) : '—')) : '';
    const act = [];
    if (!t.owner && !mine && LGS.member) act.push('<button class="btn small" data-h="lg-take" data-tid="' + t.id + '">Take over</button>');
    if (mgr) act.push('<button class="btn small ghost" data-h="lg-rm" data-tid="' + t.id + '">Remove</button>');
    return '<tr class="' + (t.owner === me ? 'me' : '') + '"><td class="nm">' + tmName(t) + '</td><td>' + (t.owner ? esc(t.owner) : '<span class="sub">CPU</span>') + '</td>' + (c.divisions ? '<td>' + dsel + '</td>' : '') + '<td class="act">' + act.join(' ') + '</td></tr>';
  }).join('')) : '<p class="hint">No teams yet.</p>');
  if (!mine) {
    h += '<div class="addrow">' + (c.entry === 'nfl' ? '<select id="lg-fr" aria-label="Franchise">' + free.map(t => '<option value="' + t.abbr + '">' + esc(t.city + ' ' + t.nick) + '</option>').join('') + '</select>' : '<input id="lg-tn" type="text" maxlength="18" placeholder="Your team name" value="' + esc(me + "'s Club") + '">') +
      '<button class="btn primary" data-h="lg-claim">Add my team</button>' + (mgr && c.cpus && c.entry === 'nfl' ? '<button class="btn" data-h="lg-addcpu1">Add as CPU</button>' : '') + '</div>';
  } else {
    h += '<div class="row">' + (c.entry === 'draft' ? '<input id="lg-rn" type="text" maxlength="18" value="' + esc(mine.name) + '" aria-label="Team name"><button class="btn small" data-h="lg-rename">Rename</button>' : '') + '<button class="btn small ghost" data-h="lg-unclaim">Give up my team</button></div>';
  }
  if (mgr && c.cpus) {
    const n = L.teams.length;
    h += '<div class="row"><span class="sub">Add CPU teams:</span><button class="btn small" data-h="lg-fill" data-n="1">+1</button><button class="btn small" data-h="lg-fill" data-n="3">+3</button>' +
      [8, 12, 16, 32].filter(x => x > n).map(x => '<button class="btn small" data-h="lg-fill" data-n="' + (x - n) + '">Fill to ' + x + '</button>').join('') + '</div>';
  }
  h += '</section>';
  if (mgr && c.entry === 'draft' && L.teams.length > 1) {
    const ord = L.draftOrder && L.draftOrder.length === L.teams.length ? L.draftOrder : L.teams.map(t => t.id);
    h += '<section class="panel"><div class="row between"><h3>Draft order</h3><button class="btn small" data-h="lg-shuffle">Randomize</button></div><ol class="ordlist">' +
      ord.map((id, i) => '<li>' + tmName(L.teams[id]) + '<span class="row"><button class="btn small ghost" data-h="lg-ord" data-i="' + i + '" data-d="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up">▲</button><button class="btn small ghost" data-h="lg-ord" data-i="' + i + '" data-d="1"' + (i === ord.length - 1 ? ' disabled' : '') + ' aria-label="Move down">▼</button></span></li>').join('') + '</ol><p class="hint">Leave it alone and the order is random.</p></section>';
  }
  h += '<section class="panel"><h3>Managers</h3><ul class="news">' + LGS.members.map(m => { const t = L.teams.find(x => x.owner === m); return '<li>' + esc(m) + (m === LGS.mgr ? ' <span class="chip">manager</span>' : '') + ' — ' + (t ? esc(t.name) : '<span class="sub">no team yet</span>') + (mgr && m !== me ? ' <button class="btn small ghost" data-h="lg-kick" data-name="' + esc(m) + '">Remove</button>' : '') + '</li>'; }).join('') + '</ul></section>';
  h += '<section class="panel"><div class="row">' + (mgr ? '<button class="btn primary" data-h="lg-start">Start the league</button><button class="btn ghost" data-h="lg-del">Delete league</button>' : '<span class="sub">Waiting for the manager to start.</span><button class="btn ghost" data-h="lg-leave">Leave league</button>') + '<button class="btn" data-h="leagues">All leagues</button></div></section>';
  setMain(h);
}
CH.lgdiv = el => lgOp('assign', { tid: +el.dataset.tid, div: el.value });
ACT['lg-take'] = t => lgOp('claim', { tid: +t.dataset.tid });
ACT['lg-rm'] = async t => { if (confirm('Remove this team?')) lgOp('rmteam', { tid: +t.dataset.tid }); };
ACT['lg-claim'] = () => lgOp('claim', LGS.L.cfg.entry === 'nfl' ? { abbr: $('#lg-fr') && $('#lg-fr').value } : { name: $('#lg-tn').value });
ACT['lg-addcpu1'] = () => lgOp('addcpu', { n: 1, abbr: $('#lg-fr') && $('#lg-fr').value });
ACT['lg-unclaim'] = () => lgOp('unclaim');
ACT['lg-rename'] = () => lgOp('rename', { name: $('#lg-rn').value });
ACT['lg-fill'] = t => lgOp('addcpu', { n: +t.dataset.n });
ACT['lg-kick'] = t => { if (confirm('Remove ' + t.dataset.name + ' from the league?')) lgOp('kick', { name: t.dataset.name }); };
ACT['lg-ord'] = t => {
  const L = LGS.L, ord = (L.draftOrder && L.draftOrder.length === L.teams.length ? L.draftOrder : L.teams.map(x => x.id)).slice(), i = +t.dataset.i, j = i + +t.dataset.d;
  const x = ord[i]; ord[i] = ord[j]; ord[j] = x; lgOp('order', { order: ord });
};
ACT['lg-shuffle'] = () => { const o = LGS.L.teams.map(x => x.id); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = o[i]; o[i] = o[j]; o[j] = x; } lgOp('order', { order: o }); };
ACT['lg-start'] = async () => { const r = await lgOp('start'); if (r) toast('The league has started.'); };
ACT['lg-del'] = () => { if (confirm('Delete this league for everyone? Saved season stats stay on each account.')) lgOp('delete'); };
ACT['lg-leave'] = () => { if (confirm('Leave this league?')) lgOp('leave'); };

/* the running league, through the shared franchise screens */
function lgAdapter() {
  const L = LGS.L, me = H.user, mgr = LGS.mgr === me, t = L.teams.find(x => x.owner === me), tid = t ? t.id : -1;
  const A = {
    kind: 'league', L, tid, title: L.cfg.name + ' · ' + LGS.code, canAdvance: mgr,
    canEditRoster: () => tid >= 0 && L.phase !== 'draft' && L.phase !== 'setup',
    waitMsg: 'Waiting on the other managers\' games.',
    headBtns: '<button class="btn small" data-h="copy" data-code="' + LGS.code + '">Code ' + LGS.code + '</button><button class="btn small" data-h="leagues">All leagues</button>',
    tabs: [{ id: 'lg', label: 'League', html: () => lgPanel(A) }],
    cpuOffers: async () => { const r = await run(() => call('league', { op: 'cpuoffers', code: LGS.code })); return r ? r.offers : []; },
    act: (op, a) => lgOp(op, a),
    go: async op => { await lgOp(op); if (op === 'offseason') FR.tab = 'draft'; if (op === 'season') FR.tab = 'home'; },
    sim: gid => lgOp('simme', { gid }),
    async play(gid) {
      const info = await run(() => call('league', { op: 'play', code: LGS.code, gid })); if (!info) return;
      const report = async moves => {
        try { await call('league', { op: 'report', code: LGS.code, gid, moves: moves || undefined }); }
        catch (e) { const r = await call('league', { op: 'get', code: LGS.code }); const g = r.L.sched.find(x => x.id === gid); if (!(g && g.done)) throw e; }
      };
      const ctx = { label: info.homeName + ' – ' + info.awayName, report, onDone: () => { lgLoad(LGS.code, true).then(() => go('league', { code: LGS.code })); go('league', { code: LGS.code }); } };
      if (info.room) G.startCtxRoom({ room: info.room, seed: info.seed, side: info.side }, ctx);
      else G.startCtxCpu(info, ctx);
    },
    draftBtns: () => mgr ? '<button class="btn" data-h="lg-skip">Pick for the team on the clock</button><button class="btn" data-h="lg-autoall">Auto-draft everyone left</button>' : ''
  };
  return A;
}
ACT['lg-skip'] = () => lgOp('draftskip');
ACT['lg-autoall'] = () => lgOp('draftauto', { all: true, on: true });
function lgPanel(A) {
  const L = A.L, mgr = LGS.mgr === H.user, c = L.cfg, yn = [[true, 'On'], [false, 'Off']];
  let h = '<div class="panel"><h3>Managers</h3>' + tbl(['Manager', 'Team', 'Record'], LGS.members.map(m => { const t = L.teams.find(x => x.owner === m); const r = t ? LG.records(L)[t.id] : null; return '<tr><td>' + esc(m) + (m === LGS.mgr ? ' <span class="chip">manager</span>' : '') + '</td><td class="nm">' + (t ? tmName(t) : '—') + '</td><td>' + (r ? rec(r) : '') + '</td></tr>'; }).join('')) + '</div>';
  h += '<div class="panel"><h3>Rules</h3><div class="chips">' + [c.entry === 'nfl' ? 'NFL teams' : 'Player draft', c.divisions ? c.nDivs + ' divisions' : 'No divisions', c.cpus ? 'CPU teams' : 'Humans only', c.games + ' games', c.playoffs ? c.playoffs + ' in playoffs' : 'No playoffs', c.trades ? 'Trades until week ' + c.deadline : 'No trading'].map(x => '<span class="chip">' + x + '</span>').join('') + '</div></div>';
  if (mgr) {
    h += '<div class="panel"><h3>Manager tools</h3><div class="row">' +
      ((L.phase === 'regular' || L.phase === 'playoffs') ? '<button class="btn primary" data-h="lg-simweek">Sim this week for everyone</button>' : '') +
      (L.phase === 'offseason' ? '<button class="btn primary" data-h="fr-offseason">Start the offseason</button>' : '') +
      (L.phase === 'preseason' ? '<button class="btn primary" data-h="fr-season">Start season ' + (L.season + 1) + '</button>' : '') + '</div>' +
      '<div class="setgrid"><div><label class="fld">Trading</label>' + seg('trades', c.trades, yn) + '</div><div><label class="fld">Trade deadline (week)</label><input type="number" min="0" max="20" data-hc="lgdl" value="' + c.deadline + '"></div></div>' +
      '<div class="row"><button class="btn ghost" data-h="lg-del">Delete league</button></div></div>';
  } else h += '<div class="panel"><div class="row"><button class="btn ghost" data-h="lg-leave">Leave league</button></div></div>';
  return h;
}
CH.lgdl = el => lgCfg({ deadline: +el.value });
ACT['lg-simweek'] = async () => { if (confirm('Sim every unplayed game this week, including human games?')) lgOp('simweek'); };
