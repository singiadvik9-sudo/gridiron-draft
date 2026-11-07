/* ---------- friends, and who is online ----------
   Signed in, the page checks in every 30 s with what you are doing (so your friends see you online, and what you are up to), and hears back
   how many friends are online and how many requests are waiting, for the Friends button. The Friends page: add someone by name, answer
   requests, see who is online. */
const FRD = { timer: 0, on: 0, req: 0, list: null };
// what you are doing, in a word for your friends
function myStatus() {
  const s = G.state;
  if (s.mode === 'online') return !s.me && !s.squad ? 'Watching a game' : s.squad ? 'In a squad game' : s.ctx ? (s.ctx.kind === 'tourney' ? 'In a tournament' : 'In a league') : 'In a quick game';
  if (s.mode === 'sdraft') return 'Drafting';
  if (s.mode === 'local') return s.ctx ? (C.L ? 'Playing a campaign' : s.ctx.kind === 'tourney' ? 'In a tournament' : 'In a league') : 'In a quick game';
  if (H.view === 'camphub' || H.view === 'camp' || H.view === 'campnew') return 'Playing a campaign';
  if (H.view === 'league' || H.view === 'leagues') return 'In a league';
  if (H.view === 'tourney' || H.view === 'tourneys') return 'In a tournament';
  return 'In the menu';
}
async function friendsPing() {
  if (!H.user) return;
  try {
    const r = await call('friends', { op: 'ping', st: myStatus() });
    const ch = r.on !== FRD.on || r.req !== FRD.req; FRD.on = r.on; FRD.req = r.req;
    if (ch && G.state.mode === 'lobby') renderHeader();
    invShow(r.inv);
    if (r.ans) toast(r.ans.yes ? r.ans.by + ' accepted your challenge and is on the way.' : r.ans.by + ' turned down your challenge.');
  } catch (e) {}
}
function friendsStart() { clearInterval(FRD.timer); FRD.timer = 0; if (!H.user) return; friendsPing(); FRD.timer = setInterval(friendsPing, 15000); }
// the header button: friends online, requests waiting
function friendsBtn() {
  if (!H.user) return '';
  return '<button class="btn small" data-h="friends" title="' + FRD.on + ' friend' + (FRD.on === 1 ? '' : 's') + ' online' + (FRD.req ? ', ' + FRD.req + ' request' + (FRD.req === 1 ? '' : 's') + ' waiting' : '') + '">Friends' +
    (FRD.on ? ' <span class="fron">' + FRD.on + '</span>' : '') + (FRD.req ? ' <span class="chat-badge">' + FRD.req + '</span>' : '') + '</button>';
}
const agoText = ms => ms == null ? 'not seen yet' : ms < 3600000 ? 'seen ' + Math.max(1, Math.round(ms / 60000)) + ' min ago' : ms < 86400000 ? 'seen ' + Math.round(ms / 3600000) + ' h ago' : 'seen ' + Math.round(ms / 86400000) + ' d ago';
V.friends = async () => {
  if (!H.user) return go('auth');
  if (!FRD.list) setMain('<section class="panel narrow"><h2>Friends</h2><p class="sub">Loading…</p></section>');
  await friendsLoad(); friendsRender();
  poll(async () => { await friendsLoad(); friendsRender(); }, 15000);
};
async function friendsLoad() { try { FRD.list = await call('friends', { op: 'list' }); FRD.on = FRD.list.friends.filter(f => f.online).length; FRD.req = FRD.list.incoming.length; renderHeader(); } catch (e) { if (!FRD.list) FRD.list = { friends: [], incoming: [], outgoing: [] }; } }
function friendsRender() {
  if (H.view !== 'friends' || G.state.mode !== 'lobby') return;
  const F = FRD.list || { friends: [], incoming: [], outgoing: [] }, keep = ($('#fr-name') || {}).value || '';
  const on = F.friends.filter(f => f.online).length;
  setMain('<section class="panel narrow"><h2>Friends</h2><p class="sub">' + (F.friends.length ? on + ' of ' + F.friends.length + ' online' : 'Add your friends by their account name to see when they are online.') + '</p>' +
    '<div class="row"><input id="fr-name" type="text" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Their account name" aria-label="Account name" value="' + esc(keep) + '"><button class="btn primary" data-h="fr-add">Add friend</button></div>' +
    (F.incoming.length ? '<h4 class="pos-h">Requests</h4><ul class="frlist">' + F.incoming.map(n => '<li><b>' + esc(n) + '</b><span class="row"><button class="btn small primary" data-h="fr-yes" data-n="' + esc(n) + '">Accept</button><button class="btn small ghost" data-h="fr-no" data-n="' + esc(n) + '">Decline</button></span></li>').join('') + '</ul>' : '') +
    (F.friends.length ? '<h4 class="pos-h">Your friends</h4><ul class="frlist">' + F.friends.map(f => '<li><span class="frwho"><i class="frdot' + (f.online ? ' on' : '') + '" aria-hidden="true"></i><b>' + esc(f.name) + '</b><small>' + (f.online ? esc(f.st || 'Online') : agoText(f.ago)) + '</small></span><span class="row">' + (f.online ? '<button class="btn small primary" data-h="fr-chal" data-n="' + esc(f.name) + '">Challenge</button>' : '') + '<button class="btn small ghost" data-h="fr-del" data-n="' + esc(f.name) + '">Remove</button></span></li>').join('') + '</ul>' : '') +
    (F.outgoing.length ? '<h4 class="pos-h">Sent</h4><ul class="frlist">' + F.outgoing.map(n => '<li><span class="frwho"><b>' + esc(n) + '</b><small>waiting for an answer</small></span><button class="btn small ghost" data-h="fr-cancel" data-n="' + esc(n) + '">Cancel</button></li>').join('') + '</ul>' : '') +
    '</section>');
}
const frDo = async (op, n, msg) => { const r = await run(() => call('friends', { op, name: n })); if (r) { if (msg) toast(typeof msg === 'function' ? msg(r) : msg); await friendsLoad(); friendsRender(); } return r; };
ACT['fr-add'] = async () => {
  const n = ($('#fr-name') || {}).value.trim(); if (!n) return;
  const r = await frDo('request', n, r => r.friends ? 'You and ' + n + ' are friends now.' : r.already ? 'You are already friends.' : 'Request sent to ' + n + '.');
  if (r) { const i = $('#fr-name'); if (i) i.value = ''; }
};
ACT['fr-yes'] = t => frDo('accept', t.dataset.n, 'You and ' + t.dataset.n + ' are friends now.');
ACT['fr-no'] = t => frDo('decline', t.dataset.n);
ACT['fr-cancel'] = t => frDo('cancel', t.dataset.n);
ACT['fr-del'] = t => { if (confirm('Remove ' + t.dataset.n + ' from your friends?')) frDo('remove', t.dataset.n); };
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target && ev.target.id === 'fr-name') ACT['fr-add'](); });

/* challenges: a quick game against a friend. You get a room and wait in it; he gets a note to join on his next check-in. */
ACT['fr-chal'] = async t => {
  const n = t.dataset.n; t.disabled = true;
  try {
    const r = await G.api({ op: 'create', pid: G.PID, name: H.user, cap: 0 });
    await call('friends', { op: 'invite', name: n, code: r.code });
    toast('Challenge sent to ' + n + '. Waiting for them in room ' + r.code + '.');
    await G.joinRoom(r.code, true);
  } catch (e) { t.disabled = false; toast(e.code === 'not_friends' ? 'You are not friends any more.' : 'Could not send the challenge. Try again.'); }
};
// someone challenged you: a note at the top, wherever you are (you can say yes from the menu; in a game, finish it first)
function invShow(inv) {
  let el = document.getElementById('invban');
  if (!inv || Date.now() - inv.at > 175000) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'invban'; el.setAttribute('role', 'alert'); document.body.appendChild(el); }
  const busy = G.state.mode !== 'lobby', sig = inv.code + (busy ? 'b' : '');
  if (el.dataset.sig === sig) return; el.dataset.sig = sig;
  el.innerHTML = '<b>' + esc(inv.from) + '</b> challenges you to a quick game.' +
    (busy ? '<span class="sub">Finish what you are playing to accept.</span>' : '<button class="btn small primary" data-h="inv-yes" data-n="' + esc(inv.from) + '">Accept</button>') +
    '<button class="btn small ghost" data-h="inv-no" data-n="' + esc(inv.from) + '">Decline</button>';
}
ACT['inv-yes'] = async t => {
  const r = await run(() => call('friends', { op: 'answer', name: t.dataset.n, yes: 1 })); invShow(null);
  if (r && r.code) await G.joinRoom(r.code, true);
};
ACT['inv-no'] = async t => { await run(() => call('friends', { op: 'answer', name: t.dataset.n, yes: 0 })); invShow(null); };
ACT.friends = () => go('friends');
