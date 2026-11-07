/* ---------- squad games: up to ten people, five a side ----------
   The host puts everyone on a team and a position (QB, HB, WR1, WR2, TE); each person picks the defender he plays. The quarterback calls
   his team's plays on offense and on defense; in the live snap everyone runs his own player. Empty spots and empty teams are the computer.
   S.lob: the lobby from the server (no logins in it); S.me: your team once the game is on; S.canCall: you are its quarterback. */
const SQ_POS = [['QB', 'Quarterback'], ['HB', 'Running back'], ['WR1', 'Receiver 1'], ['WR2', 'Receiver 2'], ['TE', 'Tight end']];
const SQ_SPOTS = DSPOTS.filter(d => d[0]);
const sqMeP = () => S.lob && S.lob.ps.find(p => p.me);
const sqHost = () => { const m = sqMeP(); return !!(m && S.lob && S.lob.host === m.id); };
// the keys of the players people run for a team: positions on offense, defenders on defense
function sqKeys(team, role) { return (S.lob ? S.lob.ps : []).filter(p => p.team === team).map(p => role === 'off' ? p.pos : p.ds).filter(Boolean); }
// who runs a team's player (by position or defender), for the name tags on the field
function sqWho(team, key) { const p = S.lob && S.lob.ps.find(q => q.team === team && (q.pos === key || q.ds === key)); return p ? p.name : ''; }
// the key you play in a snap: your position on offense, your defender on defense
function sqMyKey(role) { const m = sqMeP(); return m ? (role === 'off' ? m.pos : m.ds) : null; }
async function createSquad() {
  if (S.busy) return;
  const name = readName(); S.busy = true; setBusy(true);
  try { const r = await api({ op: 'create', squad: 1, pid: PID, name, cap: readCap() }); enterRoom(r.code, r.seed, null, r.lob); }
  catch (e) { handleErr(e); }
  finally { S.busy = false; setBusy(false); }
}
// a lobby from the server: your team and whether you call the plays; the computer runs the teams nobody is on
function sqTake(lob) {
  S.lob = lob; const m = sqMeP();
  S.me = lob.started && m && m.team ? m.team : null;
  S.canCall = !!(S.me && m.pos === 'QB');
  S.cpuSides = lob.started ? ['a', 'b'].filter(t => !lob.ps.some(p => p.team === t)) : [];
}
async function sqOp(op, extra) {
  try { const r = await api(Object.assign({ op, code: S.code, pid: PID }, extra || {})); if (r.lob) { sqTake(r.lob); S.callSig = null; render(); if (!$('#modal').hidden && $('#modal .sqsetup')) sqSetupModal(); } return r; }
  catch (e) { toast(e.code === 'taken' ? 'Someone on your team already plays that defender.' : e.code === 'host_only' ? 'Only the host can do that.' : /\s/.test(e.code || '') ? e.code : 'Could not do that. Try again.'); return null; }
}
// the lobby: teams, positions, defenders, ready, start
function sqLobbyHTML(inGame) {
  const L = S.lob, me = sqMeP(), host = sqHost(); if (!L || !me) return '<p class="sub">Joining…</p>';
  const col = t => {
    const ps = L.ps.filter(p => p.team === t);
    return '<div class="sqteam ' + t + '"><div class="row between"><h3 style="color:' + TEAM_COL[t] + '">' + (host ? '<input class="sqname" data-sq="name" data-t="' + t + '" maxlength="18" value="' + esc(L.names[t]) + '" aria-label="Team name">' : esc(L.names[t])) + '</h3><span class="chip">' + (ps.length ? ps.length + ' of 5' : 'Computer') + '</span></div>' +
      SQ_POS.map(([k, lab]) => { const p = ps.find(q => q.pos === k); return '<div class="sqslot"><span class="sqpos">' + lab + '</span>' + (p ? sqPerson(p, host, me) : '<span class="sub">Computer</span>') + '</div>'; }).join('') + '</div>';
  };
  const bench = L.ps.filter(p => !p.team);
  return '<div class="sqlobby">' + col('a') + col('b') + '</div>' +
    (bench.length ? '<div class="sqbench"><h4 class="pos-h">Not on a team yet</h4>' + bench.map(p => '<div class="sqslot">' + sqPerson(p, host, me) + '</div>').join('') + '</div>' : '') +
    (me.team ? '<div class="sqmine"><h4 class="pos-h">Your defender</h4><p class="hint">On defense you play this one (the computer plays the rest). One person per defender on each team.</p><div class="row wrap">' +
      SQ_SPOTS.map(([k, lab]) => { const by = L.ps.find(q => q !== me && q.team === me.team && q.ds === k); return '<button class="btn small ctl' + (me.ds === k ? ' on' : '') + '" data-sq="ds" data-k="' + k + '"' + (by ? ' disabled title="' + esc(by.name) + ' plays him"' : '') + '>' + lab + '</button>'; }).join('') + '</div></div>' : '') +
    (inGame ? '' : '<div class="row">' + (me.team ? '<button class="btn' + (me.ready ? '' : ' primary') + '" data-sq="ready">' + (me.ready ? 'Not ready' : 'Ready') + '</button>' : '') +
      (host ? '<button class="btn primary" data-sq="start">Start the game</button>' : '') + '</div>' +
      '<p class="hint">' + (host ? 'Put each person on a team and a position. Every team with people on it needs a quarterback: he calls the plays, on offense and on defense. Open spots are played by the computer, and a team with nobody on it is the computer.' : 'The host puts everyone on a team. Pick your defender and press Ready.') + '</p>');
}
function sqPerson(p, host, me) {
  const tags = (S.lob.host === p.id ? '<span class="chip hostchip">Host</span>' : '') + (p.ready || S.lob.host === p.id ? '<span class="chip ok">Ready</span>' : '') + (p.ds ? '<span class="chip">' + esc((SQ_SPOTS.find(d => d[0] === p.ds) || [, p.ds])[1]) + '</span>' : '');
  if (!host) return '<span class="sqwho' + (p === me ? ' me' : '') + '">' + esc(p.name) + (p === me ? ' (you)' : '') + '</span>' + tags;
  const opts = [['', '', 'Not playing']].concat(['a', 'b'].reduce((a, t) => a.concat(SQ_POS.map(([k, lab]) => [t, k, S.lob.names[t] + ' · ' + lab])), []));
  return '<span class="sqwho' + (p === me ? ' me' : '') + '">' + esc(p.name) + (p === me ? ' (you)' : '') + '</span>' + tags +
    '<select data-sq="assign" data-id="' + p.id + '" aria-label="Team and position for ' + esc(p.name) + '">' + opts.map(([t, k, lab]) => '<option value="' + t + ':' + k + '"' + ((p.team || '') === t && (p.pos || '') === k ? ' selected' : '') + '>' + esc(lab) + '</option>').join('') + '</select>' +
    (p === me ? '' : '<button class="btn small ghost" data-sq="kick" data-id="' + p.id + '">Kick</button>');
}
function sqScreen() {
  $('#main').innerHTML = '<section class="panel"><div class="row between"><h2>Squad game</h2><button class="btn small" data-act="copy">Room ' + esc(S.code) + ' · copy</button></div>' +
    '<p class="sub">Up to ten players, five a side. Share the room code.</p>' + sqLobbyHTML(false) + '</section>';
}
// between plays: the host moves people around, everyone can change his defender
function sqSetupModal() { openModal('<div class="sqsetup"><h3>Teams</h3>' + sqLobbyHTML(true) + '</div>'); }
// the call panel for someone who is not his team's quarterback: who calls it, who you are, your defender
function sqMatePanel(G, p) {
  const st = G.state, role = S.me === st.poss ? 'off' : 'def', m = sqMeP(), qb = S.lob.ps.find(q => q.team === S.me && q.pos === 'QB');
  const sig = 'sqm' + st.playNo + role + (m.pos || '') + (m.ds || '') + (S.mine[st.playNo] || '') + (G.wait ? 'w' : ''); if (S.callSig === sig) return; S.callSig = sig;
  const key = sqMyKey(role), lab = role === 'off' ? (SQ_POS.find(x => x[0] === key) || [, ''])[1] : (SQ_SPOTS.find(x => x[0] === key) || [, ''])[1];
  p.innerHTML = '<div class="cp-head"><span class="role ' + role + '">' + (role === 'off' ? 'Offense' : 'Defense') + '</span><span class="sit">' + esc(ddLabel(st)) + '</span></div>' +
    '<div class="locked"><span class="eyebrow">' + esc(qb ? qb.name : 'Your quarterback') + ' is calling the play</span><b>' + (key ? 'You play ' + esc(lab) : role === 'def' ? 'Pick your defender below' : 'You are not on the field this snap') + '</b>' +
    '<p class="hint">' + (role === 'off' ? 'When the play is called your route shows on the field. Run it, or go your own way: the pass is thrown to where you are heading.' : 'Your zone or your man shows on the field at the snap.') + '</p></div>' +
    (role === 'def' ? '<div class="ctlrow spots">' + SQ_SPOTS.map(([k, l]) => { const by = S.lob.ps.find(q => q !== m && q.team === S.me && q.ds === k); return '<button class="btn small ctl' + (m.ds === k ? ' on' : '') + '" data-sq="ds" data-k="' + k + '"' + (by ? ' disabled' : '') + '>' + l + '</button>'; }).join('') + '</div>' : '');
}
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-sq]'); if (!t || t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
  const a = t.dataset.sq;
  if (a === 'ds') sqOp('ds', { ds: t.dataset.k });
  else if (a === 'ready') sqOp('ready', { on: !(sqMeP() || {}).ready });
  else if (a === 'start') sqOp('start');
  else if (a === 'kick') { if (confirm('Remove this player from the room?')) sqOp('kick', { id: t.dataset.id }); }
  else if (a === 'setup') sqSetupModal();
});
document.addEventListener('change', ev => {
  const t = ev.target; if (!t.dataset || !t.dataset.sq) return;
  if (t.dataset.sq === 'assign') { const [team, pos] = t.value.split(':'); sqOp('assign', { id: t.dataset.id, team: team || null, pos: pos || null }); }
  else if (t.dataset.sq === 'name') sqOp('names', { names: { [t.dataset.t]: t.value } });
});
