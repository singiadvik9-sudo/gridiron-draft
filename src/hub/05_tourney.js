/* ---------- tournaments (accounts only) ---------- */
const NEWT = { name: 'The Pixel Bowl', teamMode: 'draft', early: 1, semi: 1, final: 1, max: 16, open: true, cap: 0 };
const CAPSEG = [[0, 'No cap'], [295, 'Tight $295M'], [325, 'Standard $325M'], [360, 'Loose $360M']];
const maxSeg = mode => mode === 'draft' ? [[4, '4'], [8, '8'], [16, '16']] : [[8, '8'], [16, '16'], [32, '32'], [64, '64']];
const TNS = { code: '', ver: 0, T: null, tname: '' };
const BOS = [[1, 'Single game'], [3, 'Best of 3'], [5, 'Best of 5']];

V.tourneys = async () => {
  setMain('<section class="panel"><h2>Tournaments</h2><p class="sub">Loading…</p></section>');
  const r = await run(() => call('tourney', { op: 'mine' })); if (!r) return;
  setMain('<section class="panel"><h2>Your tournaments</h2>' + (r.list.length ? '<ul class="lglist">' + r.list.map(l => '<li><div><b>' + esc(l.name) + '</b><span class="sub">' + l.code + ' · ' + ({ setup: 'Signing up', live: 'In progress', done: 'Finished' }[l.phase] || l.phase) + ' · ' + l.n + ' teams · ' + (l.mode === 'nfl' ? 'NFL teams' : 'Drafted teams') + (l.champ ? ' · champion ' + esc(l.champ) : '') + (l.mgr === H.user ? ' · you manage' : '') + '</span></div><button class="btn primary" data-h="tn-open" data-code="' + l.code + '">Open</button></li>').join('') + '</ul>' : '<p class="hint">You are not in any tournaments yet.</p>') +
    '<div class="row"><button class="btn primary" data-h="tn-new">Create a tournament</button></div></section>' +
    '<section class="panel"><h3>Join with a code</h3><div class="row joinrow"><input id="jn-code" type="text" maxlength="5" placeholder="TOURNAMENT CODE" autocomplete="off" aria-label="Tournament code"><button class="btn" data-h="join-code">Join</button></div></section>');
  const inp = $('#jn-code'); if (inp) inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
};
ACT['tn-open'] = t => go('tourney', { code: t.dataset.code });
ACT['tn-new'] = () => go('tourneynew');
V.tourneynew = () => {
  const n = NEWT; if (n.teamMode === 'draft' && n.max > 16) n.max = 16;
  setMain('<section class="panel narrow"><h2>Create a tournament</h2>' +
    '<label class="fld" for="nt-name">Name</label><input id="nt-name" type="text" maxlength="24" value="' + esc(n.name) + '">' +
    '<label class="fld">Teams</label>' + seg('teamMode', n.teamMode, [['draft', 'Snake draft from one shared pool'], ['nfl', 'Pick a real NFL team']]) +
    (n.teamMode === 'draft' ? '<label class="fld">Salary cap</label>' + seg('cap', n.cap, CAPSEG) : '') +
    '<label class="fld">Early rounds</label>' + seg('early', n.early, BOS) +
    '<label class="fld">Semifinals</label>' + seg('semi', n.semi, BOS) +
    '<label class="fld">Final</label>' + seg('final', n.final, BOS) +
    '<label class="fld">Maximum teams</label>' + seg('max', n.max, maxSeg(n.teamMode)) +
    '<label class="fld">Anyone with the code can join</label>' + seg('open', n.open, [[true, 'Yes'], [false, 'No, I add people']]) +
    '<div class="row"><button class="btn primary" data-h="tn-create">Create tournament</button><button class="btn ghost" data-h="tourneys">Cancel</button></div></section>');
  const nm = $('#nt-name'); nm.addEventListener('input', () => { n.name = nm.value; });
};
ACT.tourneys = () => go('tourneys');
ACT['tn-create'] = async () => { const r = await run(() => call('tourney', { op: 'create', cfg: NEWT })); if (r) go('tourney', { code: r.code }); };

async function tnLoad(code, force) {
  const r = await call('tourney', { op: 'get', code, ver: force || TNS.code !== code ? 0 : TNS.ver });
  if (r.same) return false;
  TNS.code = code; TNS.ver = r.ver; TNS.T = r.T; return true;
}
V.tourney = async p => {
  if (!p.code) return go('tourneys');
  if (TNS.code !== p.code) { TNS.T = null; setMain('<section class="panel"><p class="sub">Loading tournament…</p></section>'); }
  const ok = await run(() => tnLoad(p.code, true)); if (ok === null) { go('tourneys'); return; }
  tnRender();
  poll(async () => { if (await tnLoad(p.code)) tnRender(); }, 5000);
};
async function tnReload() { await tnLoad(TNS.code, true); tnRender(); }
async function tnOp(op, extra) {
  const r = await run(() => call('tourney', Object.assign({ op, code: TNS.code }, extra || {})));
  if (r && (r.deleted)) { go('tourneys'); return r; }
  if (r) await tnReload();
  return r;
}
const entName = (T, id) => { const e = T.ent.find(x => x.id === id); return e ? e : null; };
function entLabel(T, id, me) {
  const e = entName(T, id); if (!e) return '<span class="sub">TBD</span>';
  return '<span class="' + (e.owner === me ? 'meN' : '') + '">' + esc(e.name) + '</span>' + (e.kind === 'cpu' ? ' <small class="hum">CPU</small>' : e.owner && e.owner !== e.name ? ' <small class="hum">' + esc(e.owner) + '</small>' : '');
}
function tnRender() {
  if (H.view !== 'tourney' || G.state.mode !== 'lobby') return;
  const T = TNS.T, me = H.user, mgr = T.mgr === me, mine = T.ent.find(e => e.owner === me), c = T.cfg;
  const boTxt = n => n === 1 ? '1 game' : 'Bo' + n;
  let h = '<section class="panel"><div class="row between"><h2>' + esc(c.name) + '</h2><button class="btn small" data-h="copy" data-code="' + T.code + '">Code ' + T.code + ' · copy</button></div>' +
    '<div class="chips"><span class="chip">' + ({ setup: 'Signing up', drafting: 'Drafting', live: 'In progress', done: 'Finished' }[T.phase]) + '</span><span class="chip">' + (c.teamMode === 'nfl' ? 'Real NFL teams' : 'Snake draft' + (c.cap ? ' · $' + c.cap + 'M cap' : '')) + '</span><span class="chip">Early ' + boTxt(c.early) + '</span><span class="chip">Semis ' + boTxt(c.semi) + '</span><span class="chip">Final ' + boTxt(c.final) + '</span><span class="chip">Max ' + c.max + '</span></div>' +
    (T.phase === 'done' ? '<div class="champ">🏆 ' + entLabel(T, T.champ, me) + ' win the tournament</div>' : '') + '</section>';
  if (T.phase === 'drafting') h += tnDraftPanel(T, me, mgr, mine);
  else if (T.phase === 'setup') h += tnSetup(T, me, mgr, mine);
  else h += tnBracket(T, me, mgr, mine);
  h += '<section class="panel"><div class="row"><button class="btn" data-h="tourneys">All tournaments</button>' + (mgr ? '<button class="btn ghost" data-h="tn-del">Delete tournament</button>' : (T.phase === 'setup' && mine ? '<button class="btn ghost" data-h="tn-leave">Leave</button>' : '')) + '</div></section>';
  setMain(h);
}
function tnSetup(T, me, mgr, mine) {
  const c = T.cfg;
  let h = '';
  if (!mine) {
    h += '<section class="panel"><h3>Join the field</h3><p class="sub">' + (c.open || mgr ? 'Add yourself as a player.' : 'This tournament is closed. Ask the manager to add you.') + '</p>' + (c.open || mgr ? '<div class="row"><button class="btn primary" data-h="tn-join">Join as a player</button></div>' : '') + '</section>';
  } else if (c.teamMode === 'draft') {
    h += '<section class="panel"><h3>Your team</h3>' + (mine.squad ? '<p class="sub">Drafted: QB ' + esc(mine.squad.qb.n) + ', HB ' + esc(mine.squad.hb.n) + ', WR ' + esc(mine.squad.wr[0].n) + ' &amp; ' + esc(mine.squad.wr[1].n) + ', TE ' + esc(mine.squad.te.n) + ', ' + esc(mine.squad.ol.tm) + ' line, ' + esc(mine.squad.df.tm) + ' defense. Rating ' + E.teamUnits({ squad: mine.squad }).ovrR + '.</p>' +
      '<label class="fld" for="tn-tname">Team name</label><div class="addrow"><input id="tn-tname" type="text" maxlength="18" value="' + esc(mine.name || me) + '"><button class="btn small" data-h="tn-rename">Rename</button></div>' :
      '<p class="sub">' + (mgr ? 'When everyone has joined, start the draft below.' : 'The manager will start a snake draft once everyone has joined. Every player can only be on one team.') + '</p>') + '</section>';
  } else {
    const taken = {}; T.ent.forEach(e => { if (e.abbr && e !== mine) taken[e.abbr] = 1; });
    h += '<section class="panel"><h3>Your team</h3><p class="sub">' + (mine.squad ? 'You picked ' + esc(mine.name) + '.' : 'Choose a real NFL team.') + '</p><div class="addrow"><select id="tn-fr" aria-label="Team">' + E.TEAMS.map(t => '<option value="' + t.abbr + '"' + (taken[t.abbr] ? ' disabled' : '') + (mine.abbr === t.abbr ? ' selected' : '') + '>' + esc(t.city + ' ' + t.nick) + (taken[t.abbr] ? ' (taken)' : '') + '</option>').join('') + '</select><button class="btn primary" data-h="tn-pick">Choose</button></div></section>';
  }
  // entrants and seeding
  const order = T.seeds.length === T.ent.length ? T.seeds : T.ent.map(e => e.id);
  const custom = T.seeds.length === T.ent.length;
  h += '<section class="panel"><div class="row between"><h3>Field (' + T.ent.length + ' / ' + c.max + ')</h3>' + (mgr ? '<span class="row"><span class="sub">Seeding:</span><button class="btn small" data-h="tn-auto" data-m="join">Join order</button><button class="btn small" data-h="tn-auto" data-m="random">Random</button><button class="btn small" data-h="tn-auto" data-m="rating">By team rating</button></span>' : '') + '</div>' +
    (T.ent.length ? '<ol class="ordlist seeds">' + order.map((id, i) => { const e = entName(T, id); return '<li><span class="seedn">' + (i + 1) + '</span><span class="nm">' + entLabel(T, id, me) + '</span><span class="sub">' + (e.squad ? 'ready' : 'needs a team') + '</span>' + (mgr ? '<span class="row"><button class="btn small ghost" data-h="tn-mv" data-i="' + i + '" data-d="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Seed up">▲</button><button class="btn small ghost" data-h="tn-mv" data-i="' + i + '" data-d="1"' + (i === order.length - 1 ? ' disabled' : '') + ' aria-label="Seed down">▼</button><button class="btn small ghost" data-h="tn-rm" data-id="' + id + '">Remove</button></span>' : '') + '</li>'; }).join('') + '</ol>' : '<p class="hint">Nobody has joined yet.</p>') +
    (mgr ? '<div class="row"><span class="sub">Add CPU teams:</span><button class="btn small" data-h="tn-cpu" data-n="1">+1</button><button class="btn small" data-h="tn-cpu" data-n="3">+3</button>' + [8, 16, 32].filter(x => x > T.ent.length && x <= c.max).map(x => '<button class="btn small" data-h="tn-cpu" data-n="' + (x - T.ent.length) + '">Fill to ' + x + '</button>').join('') + '</div><p class="hint">' + (custom ? 'Seeds are set. Seed 1 plays the lowest seed; byes go to the top seeds when the field is not a power of two.' : 'No custom seeding yet: the bracket will follow join order.') + '</p>' : (custom ? '<p class="hint">The manager has set the seeds.</p>' : '')) + '</section>';
  if (mgr) {
    h += '<section class="panel"><h3>Settings</h3><div class="setgrid"><div><label class="fld">Teams</label>' + seg('teamMode', c.teamMode, [['draft', 'Drafted'], ['nfl', 'NFL teams']]) + '</div>' +
      '<div><label class="fld">Early rounds</label>' + seg('early', c.early, BOS) + '</div><div><label class="fld">Semifinals</label>' + seg('semi', c.semi, BOS) + '</div><div><label class="fld">Final</label>' + seg('final', c.final, BOS) + '</div>' +
      '<div><label class="fld">Max teams</label>' + seg('max', c.max, maxSeg(c.teamMode)) + '</div><div><label class="fld">Open to anyone with the code</label>' + seg('open', c.open, [[true, 'Yes'], [false, 'No']]) + '</div></div>' +
      (c.teamMode === 'draft' ? '<div><label class="fld">Salary cap</label>' + seg('cap', c.cap || 0, CAPSEG) + '</div>' : '') +
      (T.ent.length && T.ent.some(e => e.squad) ? '<p class="hint">Switching between drafted and NFL teams clears everyone\'s team choice.</p>' : '') +
      '<div class="row">' + (c.teamMode === 'draft' ? '<button class="btn ' + (T.drafted ? '' : 'primary') + '" data-h="tn-sdraft">' + (T.drafted ? 'Redo the draft' : 'Start the draft') + '</button>' : '') + '<button class="btn primary" data-h="tn-start"' + (c.teamMode === 'draft' && !T.drafted ? ' disabled' : '') + '>Start the tournament</button></div></section>';
  }
  return h;
}
const _seg0 = ACT.seg;
ACT.seg = t => { if (H.view === 'tourney') { tnOp('cfg', { cfg: { [t.dataset.k]: parseV(t.dataset.v) } }); } else _seg0(t); };
ACT['tn-join'] = () => tnOp('join');
ACT['tn-leave'] = () => { if (confirm('Leave this tournament?')) tnOp('leave').then(r => { if (r) go('tourneys'); }); };
ACT['tn-del'] = () => { if (confirm('Delete this tournament for everyone?')) tnOp('delete'); };
ACT['tn-pick'] = () => tnOp('pick', { abbr: $('#tn-fr').value });
ACT['tn-cpu'] = t => tnOp('addcpu', { n: +t.dataset.n });
ACT['tn-rm'] = t => tnOp('rm', { id: t.dataset.id });
ACT['tn-auto'] = t => {
  if (t.dataset.m === 'join') { tnOp('seeds', { order: TNS.T.ent.map(e => e.id) }); return; }
  tnOp('autoseed', { mode: t.dataset.m });
};
ACT['tn-mv'] = t => {
  const T = TNS.T, ord = (T.seeds.length === T.ent.length ? T.seeds : T.ent.map(e => e.id)).slice(), i = +t.dataset.i, j = i + +t.dataset.d;
  const x = ord[i]; ord[i] = ord[j]; ord[j] = x; tnOp('seeds', { order: ord });
};
ACT['tn-start'] = async () => { const r = await tnOp('start'); if (r) toast('The tournament has started.'); };
ACT['tn-rename'] = () => tnOp('team', { name: $('#tn-tname').value });
ACT['tn-sdraft'] = async () => {
  if (TNS.T.drafted && !confirm('Throw out the current teams and draft again?')) return;
  if (await tnOp('startdraft')) toast('The draft has started.');
};
ACT['tn-dskip'] = () => tnOp('dauto');
ACT['tn-dall'] = () => { if (confirm('Auto-draft the rest of the board for everyone?')) tnOp('dauto', { all: true }); };
ACT['tn-dcancel'] = () => { if (confirm('Cancel the draft?')) tnOp('dcancel'); };
ACT['tn-board'] = () => {
  const T = TNS.T, dr = T.dr, mine = T.ent.find(e => e.owner === H.user), code = TNS.code;
  if (!dr || T.phase !== 'drafting') { toast('There is no draft running.'); return; }
  const fetchD = async () => {
    const r = await call('tourney', { op: 'get', code, ver: 0 }); TNS.T = r.T; TNS.ver = r.ver;
    if (!r.T.dr || (r.T.phase === 'setup' && !r.T.drafted)) { G.exitToHub(); go('tourney', { code }); toast('The draft was canceled.'); return null; }
    return r.T.dr.d;
  };
  G.startBoard({
    label: c0(T), d: dr.d, me: mine ? dr.order.indexOf(mine.id) : 0, watch: !mine, names: dr.order.map(id => entName(T, id).name), poll: fetchD,
    post: async cid => { await call('tourney', { op: 'dpick', code, id: cid }); return fetchD(); },
    onDone: () => { G.exitToHub(); go('tourney', { code }); toast('Draft complete. Your team is set.'); }
  });
};
const c0 = T => T.cfg.name + ' draft';
function tnDraftPanel(T, me, mgr, mine) {
  const dr = T.dr, d = dr.d, clock = DR.onClock(d);
  const nm = t => esc(entName(T, dr.order[t]).name);
  let h = '<section class="panel"><h3>The draft is live</h3><p class="sub">' + (DR.isDone(d) ? 'Finishing up…' : 'Pick ' + (d.picks.length + 1) + ' of ' + d.order.length + ' · on the clock: <b>' + nm(clock) + '</b>' + (entName(T, dr.order[clock]).owner === me ? ' (you)' : '')) + '</p>' +
    '<ol class="ordlist">' + dr.order.map((id, t) => { const e = entName(T, id), n = DR.teamIds(d, t).length; return '<li><span class="seedn">' + (t + 1) + '</span><span class="nm">' + entLabel(T, id, me) + '</span><span class="sub">' + n + ' / 7 picks' + (d.cap ? ' · $' + Math.round(DR.spent(DR.teamIds(d, t))) + 'M' : '') + (e.auto ? ' · auto' : '') + '</span></li>'; }).join('') + '</ol>' +
    '<div class="row">' + (mine ? '<button class="btn primary" data-h="tn-board">Open the draft board</button>' : '') + (mgr ? '<button class="btn small" data-h="tn-dskip">Auto-pick for whoever is on the clock</button><button class="btn small" data-h="tn-dall">Auto-draft everything left</button><button class="btn small ghost" data-h="tn-dcancel">Cancel draft</button>' : '') + '</div></section>';
  return h;
}

/* bracket */
function tnBracket(T, me, mgr, mine) {
  const br = T.br, rounds = [];
  for (let r = 1; r <= br.rounds; r++) rounds.push(br.matches.filter(m => m.r === r));
  const rname = r => LG.ROUND_NAMES(br.rounds - r + 1);
  let h = '<section class="panel"><h3>Bracket</h3><div class="bracket">';
  rounds.forEach((ms, ri) => {
    h += '<div class="bround"><h4>' + rname(ri + 1) + '</h4>';
    ms.forEach(m => {
      const A = m.a != null ? T.seeds[m.a] : null, B = m.b != null ? T.seeds[m.b] : null;
      const live = m.a != null && m.b != null && m.win == null;
      const row = (id, idx, wins) => '<div class="bt' + (m.win != null && m.win === (idx ? m.b : m.a) ? ' won' : '') + (entName(T, id) && entName(T, id).owner === me ? ' mine' : '') + '"><span class="bs">' + (idx ? (m.b != null ? m.b + 1 : '') : (m.a != null ? m.a + 1 : '')) + '</span><span class="bn">' + (id ? entLabel(T, id, me) : (m.bye ? '<span class="sub">bye</span>' : '<span class="sub">TBD</span>')) + '</span><b class="bw">' + (m.bye ? '' : wins) + '</b></div>';
      h += '<div class="bm' + (live ? ' live' : '') + '">' + row(A, 0, m.w[0]) + row(B, 1, m.w[1]) + (m.bye ? '' : '<div class="bmeta">' + (m.bo > 1 ? 'Best of ' + m.bo : 'One game') + (m.games.length ? ' · ' + m.games.map(g => g[0] + '-' + g[1]).join(', ') : '') + '</div>');
      if (live) {
        const EA = entName(T, A), EB = entName(T, B), inIt = mine && (EA === mine || EB === mine), oppCpu = inIt && ((EA === mine ? EB : EA).kind === 'cpu'), act = [];
        if (inIt) { act.push('<button class="btn small primary" data-h="tn-play" data-mid="' + m.id + '">Play game ' + (m.games.length + 1) + '</button>'); if (oppCpu) act.push('<button class="btn small" data-h="tn-simme" data-mid="' + m.id + '">Sim it</button>'); }
        if (mgr) { act.push('<button class="btn small ghost" data-h="tn-simm" data-mid="' + m.id + '">Sim game</button><button class="btn small ghost" data-h="tn-win" data-mid="' + m.id + '" data-side="0">Top wins</button><button class="btn small ghost" data-h="tn-win" data-mid="' + m.id + '" data-side="1">Bottom wins</button>'); }
        h += '<div class="bact">' + act.join('') + '</div>';
      }
      h += '</div>';
    });
    h += '</div>';
  });
  return h + '</div></section>';
}
ACT['tn-simme'] = t => tnOp('simme', { mid: t.dataset.mid });
ACT['tn-simm'] = t => tnOp('simmatch', { mid: t.dataset.mid });
ACT['tn-win'] = t => { if (confirm('Set this series winner by hand?')) tnOp('override', { mid: t.dataset.mid, side: +t.dataset.side }); };
ACT['tn-play'] = async t => {
  const mid = t.dataset.mid, code = TNS.code;
  const info = await run(() => call('tourney', { op: 'play', code, mid })); if (!info) return;
  const report = async moves => {
    try { await call('tourney', { op: 'report', code, mid, moves: moves || undefined }); }
    catch (e) { const r = await call('tourney', { op: 'get', code }); const m = r.T.br.matches.find(x => x.id === mid); if (!(m && (m.games.length > info.k || m.win != null))) throw e; }
  };
  const ctx = { label: info.homeName + ' – ' + info.awayName, report, onDone: () => { TNS.ver = 0; go('tourney', { code }); } };
  if (info.room) G.startCtxRoom({ room: info.room, seed: info.seed, side: info.side }, ctx);
  else G.startCtxCpu(info, ctx);
};

/* ---------- boot hooks ---------- */
window.HUB = {
  get token() { return H.token; }, get user() { return H.user; },
  boot, show, renderHeader,
  ready() { G.resume(); }
};
