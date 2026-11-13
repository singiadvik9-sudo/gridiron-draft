/* ---------- shared campaigns: one team, run by friends together ----------
   The campaign lives on the server (api/camp.js); every move goes there and comes back to everyone within a few seconds. Big moves wait
   for a co-manager's yes; simulating, playing and moving on wait until everyone online is ready. C.shared = { code, ver, lver, meta }. */
const SH = { busyStarted: null };
const shCall = (op, extra) => call('camp', Object.assign({ op, code: C.shared.code }, extra || {}));
// the latest from the server (the league itself only when it changed)
async function sharedLoad() {
  const S0 = C.shared; if (!S0) return false;
  const r = await call('camp', { op: 'get', code: S0.code, lver: S0.lver });
  if (C.shared !== S0) return false;
  const changed = r.ver !== S0.ver; S0.ver = r.ver; S0.meta = r;
  if (r.L) { C.L = r.L; S0.lver = r.lver; }
  return changed;
}
async function sharedOpen(code) {
  const r = await run(() => call('camp', { op: 'get', code })); if (!r) return;
  C.shared = { code, ver: r.ver, lver: r.lver, meta: r }; C.L = r.L; C.slot = 0; C.state = 'saved'; FR.tab = 'home'; FR.give = []; FR.get = []; FR.offers = null; FR.rtid = null;
  go('camphub');
}
function sharedShow() {
  frShow(sharedAdapter()); hubChat('camp', C.shared.code);
  // keep up with the others: a fresh look every 3 s (drawn again only when something changed, and not while you are typing)
  poll(async () => {
    if (!C.shared) return;
    if (await sharedLoad()) { const f = document.activeElement; if (!(f && /INPUT|SELECT|TEXTAREA/.test(f.tagName) && $('#main').contains(f))) frShow(sharedAdapter()); }
    sharedBusyCheck();
  }, 3000);
  sharedBusyCheck();
}
// the team's game is yours to play (everyone said they were ready): off you go
function sharedBusyCheck() {
  const b = C.shared && C.shared.meta.busy; if (!b || G.state.mode !== 'lobby' || SH.busyStarted === b.gid + ':' + b.at) return;
  if (b.room) { if ((b.players || []).indexOf(H.user) >= 0) { SH.busyStarted = b.gid + ':' + b.at; sharedTogether(b); } }   // played together: into the room
  else if (b.by === H.user) { SH.busyStarted = b.gid + ':' + b.at; sharedPlay(b.gid); }
}
// the team's game with the other co-managers: a squad room against the computer; at the end it is reported (the server checks it from the
// room's own record) and everyone goes back to the campaign
function sharedTogether(b) {
  const code = C.shared.code, L = C.L, g = L.sched.find(x => x.id === b.gid);
  hubChatOff();
  G.joinRoomCtx(b.room, {
    label: g && g.pl === 'po' ? 'Playoffs' : 'Week ' + (g ? g.w : ''),
    report: async () => { await call('camp', { op: 'report', code, room: b.room }); },
    onDone: async () => { if (C.shared && C.shared.code === code) { await sharedLoad(); FR.tab = 'home'; go('camphub'); } }
  });
}
function sharedPlay(gid) {
  const L = C.L, tid = L.user, g = L.sched.find(x => x.id === gid); if (!g) return;
  g.T = LG.teamsFor(L, g.h, g.a);
  const side = g.h === tid ? 'a' : 'b', cpuSide = side === 'a' ? 'b' : 'a', code = C.shared.code;
  G.startCtxCpu({ seed: LG.gameSeed(L, g), T: g.T, side, cpuSide }, {
    label: g.pl === 'po' ? 'Playoffs' : 'Week ' + g.w,
    report: async moves => { await call('camp', { op: 'report', code, moves }); },
    onDone: async () => { if (C.shared && C.shared.code === code) { await sharedLoad(); FR.tab = 'home'; go('camphub'); } }
  });
}
// after a move: what the server said, then the latest
async function sharedAfter(r) {
  if (r && r.msg && (!r.ok || r.pending)) toast(r.msg);
  if (r && r.waiting) toast('Waiting for ' + r.waiting.join(', ') + ' to be ready.');
  await sharedLoad(); if (H.view === 'camphub') frShow(sharedAdapter());
  sharedBusyCheck();
}
function sharedAdapter() {
  const L = C.L, tid = L.user, S0 = C.shared, M = S0.meta || {}; LG.campInit(L);
  const owner = M.owner === H.user, on = M.online || [];
  return {
    tabs: [{ id: 'inbox', label: inboxLabel(L), html: () => inboxHTML(L, tid) }, { id: 'franchise', label: 'Franchise', html: () => franchiseHTML(L, tid) }],
    kind: 'campaign', L, tid, title: 'Shared campaign', canAdvance: true, canEditRoster: () => !(M.busy && M.busy.by !== H.user), status: on.length + ' of ' + (M.members || []).length + ' online',
    headBtns: '<button class="btn small" data-h="sh-invite">Invite</button>' + (owner ? '<button class="btn small ghost" data-h="sh-end">Stop sharing</button>' : '<button class="btn small ghost" data-h="sh-leave">Leave</button>') + '<button class="btn small" data-h="sh-exit">Exit</button>',
    cpuOffers: async pos => LG.cpuOffers(L, tid, pos),
    blockBids: async () => LG.blockBids(L, tid),
    top: () => sharedTopHTML(L, M),
    async act(op, a) {
      const r = await run(() => shCall('op', { what: op, a })); if (!r) return { ok: false };
      if (r.talk) FR.talk = r.talk;
      await sharedAfter(r); return r;
    },
    async go(op) { await sharedAdv('go', op); },
    async sim(gid) { await sharedAdv('sim', gid); },
    async play(gid) { await sharedAdv('play', gid); }
  };
}
async function sharedAdv(kind, arg) {
  let ov = document.getElementById('simov'); if (!ov) { ov = document.createElement('div'); ov.id = 'simov'; ov.setAttribute('role', 'status'); document.body.appendChild(ov); }
  ov.textContent = kind === 'play' ? 'Getting the game ready…' : 'Working…'; ov.hidden = false;
  try { const r = await run(() => shCall('adv', { kind, arg })); await sharedAfter(r); } finally { ov.hidden = true; }
}
const agoS = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
// the panel above the tabs: who is here, what waits for a yes, the ready check, someone playing, what everyone did
function sharedTopHTML(L, M) {
  const me = H.user, on = M.online || [];
  let h = '<div class="panel shtop"><div class="row between"><span class="shwho">' + (M.members || []).map(n => '<span class="shm"><i class="frdot' + (on.indexOf(n) >= 0 ? ' on' : '') + '"></i>' + esc(n) + (n === M.owner ? ' <small>owner</small>' : '') + '</span>').join('') +
    ((M.inv || []).length ? '<span class="sub">invited: ' + M.inv.map(esc).join(', ') + '</span>' : '') + '</span></div>';
  if (M.busy) h += '<div class="shbar">' + (M.busy.room ? '<b>' + M.busy.players.map(esc).join(', ') + '</b> are playing the game together.' + ((M.busy.players || []).indexOf(me) >= 0 ? ' <button class="btn small primary" data-h="sh-rejoin">Back to the game</button>' : ' The team cannot be changed until it is over.') : M.busy.by === me ? 'You are playing the game.' : '<b>' + esc(M.busy.by) + '</b> is playing the game. The team cannot be changed until it is over.') + ((M.busy.players || [M.busy.by]).indexOf(me) >= 0 ? ' <button class="btn small ghost" data-h="sh-abandon">Give it up</button>' : '') + '</div>';
  if (M.rd) { const mine = !!M.rd.by[me], who = Object.keys(M.rd.by), wait = on.filter(n => !M.rd.by[n]);
    h += '<div class="shbar"><b>' + esc(M.rd.first) + '</b> wants to ' + esc(M.rd.label) + '. Ready: ' + who.map(esc).join(', ') + (wait.length ? ' · waiting for ' + wait.map(esc).join(', ') : '') + ' ' +
      (mine ? '<button class="btn small ghost" data-h="sh-unready">Not ready</button>' : '<button class="btn small primary" data-h="sh-ready" data-k="' + esc(M.rd.key) + '">Ready</button>') + '</div>'; }
  (M.pend || []).forEach(p => { h += '<div class="shbar pend"><b>' + esc(p.by) + '</b> wants to ' + esc(p.t) + '. ' + (p.by === me ? '<span class="sub">Waiting for a co-manager.</span> <button class="btn small ghost" data-h="sh-cancel" data-id="' + p.id + '">Take it back</button>' : '<button class="btn small primary" data-h="sh-yes" data-id="' + p.id + '">Approve</button><button class="btn small ghost" data-h="sh-no" data-id="' + p.id + '">Reject</button>') + '</div>'; });
  const fd = (M.feed || []).slice(0, 6);
  if (fd.length) h += '<ul class="shfeed">' + fd.map(f => '<li><b>' + esc(f.by) + '</b> ' + esc(f.t) + ' <small>' + agoS(f.at) + '</small></li>').join('') + '</ul>';
  return h + '</div>';
}
ACT['sh-yes'] = async t => { const r = await run(() => shCall('approve', { id: t.dataset.id })); if (r) toast(r.msg || 'Approved.'); await sharedAfter(null); };
ACT['sh-no'] = async t => { await run(() => shCall('reject', { id: t.dataset.id })); await sharedAfter(null); };
ACT['sh-cancel'] = async t => { await run(() => shCall('cancel', { id: t.dataset.id })); await sharedAfter(null); };
ACT['sh-ready'] = async t => { const [kind, arg] = t.dataset.k.split(':'); await sharedAdv(kind, arg); };
ACT['sh-unready'] = async () => { await run(() => shCall('unready')); await sharedAfter(null); };
ACT['sh-abandon'] = async () => { if (confirm('Give up the game? It stays unplayed.')) { await run(() => shCall('abandon')); await sharedAfter(null); } };
ACT['sh-rejoin'] = () => { const b = C.shared && C.shared.meta.busy; if (b && b.room) sharedTogether(b); };
ACT['sh-exit'] = () => { C.shared = null; C.L = null; hubChatOff(); go('camp'); };
ACT['sh-leave'] = async () => { if (!confirm('Leave this shared campaign? You can only come back if someone invites you again.')) return; if (await run(() => shCall('leave'))) ACT['sh-exit'](); };
ACT['sh-end'] = async () => {
  if (!confirm('Stop sharing? The campaign comes back to you as one of your own (in an empty slot), and your co-managers lose it.')) return;
  const slots = await run(() => SAVE.list()); if (!slots) return; const free = slots.find(s => s.empty);
  if (!free) { toast('Free up a campaign slot first: the campaign comes back to you there.'); return; }
  const r = await run(() => shCall('end')); if (!r || !r.L) return;
  C.shared = null; C.L = r.L; C.slot = free.slot; C.rev = null; hubChatOff(); await campSave(); toast('The campaign is yours again, in slot ' + free.slot + '.'); go('camphub');
};
// invite: your friends (one click each), or anyone by name
ACT['sh-invite'] = async () => {
  const F = await run(() => call('friends', { op: 'list' })) || { friends: [] }, M = C.shared.meta || {}, inn = n => (M.members || []).concat(M.inv || []).some(x => x.toLowerCase() === n.toLowerCase());
  G.openModal('<h3>Invite co-managers</h3><p class="sub">They run the team with you: everyone can do everything, big moves need a second yes. Up to 5 in all.</p>' +
    (F.friends.length ? '<ul class="frlist">' + F.friends.map(f => '<li><span class="frwho"><i class="frdot' + (f.online ? ' on' : '') + '"></i><b>' + esc(f.name) + '</b></span>' + (inn(f.name) ? '<span class="sub">in</span>' : '<button class="btn small primary" data-h="sh-inv1" data-n="' + esc(f.name) + '">Invite</button>') + '</li>').join('') + '</ul>' : '<p class="hint">Add friends on the Friends page, or invite anyone by account name:</p>') +
    '<div class="row"><input id="sh-name" type="text" maxlength="16" placeholder="Account name" aria-label="Account name"><button class="btn" data-h="sh-inv1">Invite</button></div>');
};
ACT['sh-inv1'] = async t => {
  const n = t.dataset.n || (($('#sh-name') || {}).value || '').trim(); if (!n) return;
  const r = await run(() => shCall('invite', { name: n })); if (!r) return;
  toast(r.already ? n + ' is already in.' : n + ' is invited. They will find it under Campaign.'); t.disabled = true; await sharedAfter(null);
};
// share the campaign you have open: it moves to your account's shared campaigns
ACT['camp-share'] = async () => {
  if (!confirm('Share this campaign? It moves out of slot ' + C.slot + ' into your shared campaigns, and you can invite friends to run the team with you. (You can stop sharing later and take it back.)')) return;
  await campSave();
  C.L.career = 0;   // (career mode is for one coach: a shared campaign is the team's, not a person's)
  const z = await gz(JSON.stringify(C.L)), r = await run(() => call('camp', Object.assign({ op: 'create' }, z ? { Lz: z } : { L: C.L }))); if (!r) return;
  await run(() => SAVE.del(C.slot).then(() => true));
  await sharedOpen(r.code); ACT['sh-invite']();
};
// the Campaign screen: your shared campaigns, and invitations
async function sharedSection() {
  const r = await run(() => call('camp', { op: 'mine' })), el = $('#shsec'); if (!el || !r) return;
  const card = (s, inv) => '<div class="slot-card"><b>' + esc(s.team) + '</b><span class="sub">' + s.season + ' · ' + ({ regular: 'Week ' + s.week, playoffs: 'Playoffs', offseason: 'Offseason', draft: 'Draft', fa: 'Free agency', preseason: 'Preseason' }[s.phase] || s.phase) + ' · with ' + s.members.filter(n => n !== H.user).map(esc).join(', ') + '</span>' +
    '<div class="row">' + (inv ? '<button class="btn primary" data-h="sh-join" data-code="' + s.code + '">Join</button><button class="btn ghost" data-h="sh-dec" data-code="' + s.code + '">Decline</button>' : '<button class="btn primary" data-h="sh-open" data-code="' + s.code + '">Open</button>') + '</div></div>';
  el.innerHTML = '<h3>Shared campaigns</h3>' + (r.invites.length ? '<h4 class="pos-h">Invitations</h4><div class="slots">' + r.invites.map(s => card(s, true)).join('') + '</div>' : '') +
    (r.mine.length ? '<div class="slots">' + r.mine.map(s => card(s, false)).join('') + '</div>' : '<p class="hint">Run a team together with friends: open one of your campaigns and press Share.</p>');
}
ACT['sh-open'] = t => sharedOpen(t.dataset.code);
ACT['sh-join'] = async t => { if (await run(() => call('camp', { op: 'join', code: t.dataset.code }))) sharedOpen(t.dataset.code); };
ACT['sh-dec'] = async t => { if (await run(() => call('camp', { op: 'decline', code: t.dataset.code }))) sharedSection(); };
