/* Hub: menus, accounts, campaign, leagues and tournaments. Shares one scope across the hub/*.js parts. */
const G = window.GAME, LG = window.LG, E = window.E;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const esc = G.esc, toast = G.toast;
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } }
const H = { token: lsGet('gd_tok') || '', user: lsGet('gd_user') || '', view: 'home', p: {}, poll: null };
const V = {}, ACT = {};
const main = () => $('#main');
const setMain = html => { main().innerHTML = html; G.paintCanvases(main()); };
const num = v => (v == null ? '' : String(v));
const rec = r => r.w + '-' + r.l + (r.t ? '-' + r.t : '');
const POSN = LG.POS;
const ERR = { bad_login: 'Wrong name or password.', name_taken: 'That name is taken.', bad_name: 'Names are 3 to 16 letters, numbers or underscores.', bad_password: 'Passwords need at least 6 characters.', auth: 'Please sign in again.', no_league: 'No league with that code.', no_tournament: 'No tournament with that code.', manager_only: 'Only the manager can do that.', busy: 'The server is busy. Try again.', server: 'Something went wrong on the server.', not_member: 'Join the league first.' };
const errText = e => (e && (ERR[e.code] || (e.code && /\s/.test(e.code) ? e.code : null))) || 'Connection problem. Try again.';
async function call(ep, body) {
  try { return await G.api(body, ep); }
  catch (e) { if (e.status === 401 && body.op !== 'login' && body.op !== 'register') { signOut(true); } throw e; }
}
// run an async action with error toasts; returns the result or null
async function run(fn) { try { return await fn(); } catch (e) { toast(errText(e)); return null; } }

/* ---------- navigation ---------- */
function stopPoll() { if (H.poll) { clearTimeout(H.poll); H.poll = null; } }
function go(view, p) {
  stopPoll(); H.view = view; H.p = p || {};
  if (G.state.mode !== 'lobby') return;
  show();
}
function show() {
  stopPoll();
  renderHeader();
  (V[H.view] || V.home)(H.p);
  window.scrollTo(0, 0);
}
function poll(fn, ms) {   // call fn repeatedly while the current view stays the same
  stopPoll(); const view = H.view;
  const tick = async () => { if (H.view !== view || G.state.mode !== 'lobby') return; try { await fn(); } catch (e) {} if (H.view === view) H.poll = setTimeout(tick, ms || 5000); };
  H.poll = setTimeout(tick, ms || 5000);
}
function renderHeader() {
  const el = $('#hdr-right'); if (!el) return;
  el.innerHTML = '<button class="btn small" data-h="home">Menu</button>' +
    (H.user ? '<button class="btn small" data-h="account">' + esc(H.user) + '</button>' : '<button class="btn small primary" data-h="auth">Sign in</button>');
}

/* ---------- accounts ---------- */
function signOut(silent) {
  H.token = ''; H.user = ''; lsSet('gd_tok', null); lsSet('gd_user', null);
  if (!silent) toast('Signed out.'); else toast('Please sign in again.');
  go('home');
}
async function boot() {
  if (H.token) {
    try { const r = await G.api({ op: 'me' }, 'auth'); H.user = r.name; lsSet('gd_user', r.name); }
    catch (e) { if (e.status === 401) { H.token = ''; H.user = ''; lsSet('gd_tok', null); lsSet('gd_user', null); } }
  }
}
function needAccount(next, p) {
  if (H.user) return false;
  go('auth', { next, np: p, why: 'This needs an account so your progress is saved.' }); return true;
}
V.auth = p => {
  const reg = p.reg;
  setMain('<section class="panel narrow"><h2>' + (reg ? 'Create account' : 'Sign in') + '</h2>' +
    (p.why ? '<p class="sub">' + esc(p.why) + '</p>' : '') +
    '<label class="fld" for="au-n">Name</label><input id="au-n" type="text" maxlength="16" autocomplete="username" value="' + esc(lsGet('gd_user') || '') + '">' +
    '<label class="fld" for="au-p">Password</label><input id="au-p" type="password" maxlength="100" autocomplete="' + (reg ? 'new-password' : 'current-password') + '">' +
    '<div class="row"><button class="btn primary" data-h="auth-go">' + (reg ? 'Create account' : 'Sign in') + '</button><button class="btn ghost" data-h="auth-sw">' + (reg ? 'I have an account' : 'Create an account') + '</button></div>' +
    '<p class="hint">Accounts keep your campaigns, leagues, tournaments and stats. You can always play quick games as a guest.</p></section>');
};
ACT['auth-sw'] = () => go('auth', Object.assign({}, H.p, { reg: !H.p.reg }));
ACT['auth-go'] = async () => {
  const name = $('#au-n').value.trim(), password = $('#au-p').value;
  const r = await run(() => call('auth', { op: H.p.reg ? 'register' : 'login', name, password }));
  if (!r) return;
  H.token = r.token; H.user = r.name; lsSet('gd_tok', r.token); lsSet('gd_user', r.name);
  toast('Signed in as ' + r.name + '.');
  go(H.p.next || 'home', H.p.np);
};
V.account = async () => {
  if (needAccount('account')) return;
  setMain('<section class="panel"><h2>Account</h2><p class="sub">Loading…</p></section>');
  const r = await run(() => call('auth', { op: 'me' })); if (!r) return;
  const hist = r.hist || [];
  const line = s => { const k = []; ['pyd', 'ptd', 'ryd', 'rtd', 'recyd', 'rectd', 'rec', 'sk', 'dint'].forEach(x => { if (s[x]) k.push(s[x] + ' ' + ({ pyd: 'pass yd', ptd: 'pass TD', ryd: 'rush yd', rtd: 'rush TD', recyd: 'rec yd', rectd: 'rec TD', rec: 'rec', sk: 'sacks', dint: 'INT' }[x])); }); return k.join(' · '); };
  const rows = hist.map(h => {
    if (h.kind === 'tourney') return '<li class="hist"><div class="hh"><b>' + esc(h.tname) + '</b><span class="chip ' + (h.champ ? 'ok' : '') + '">' + esc(h.place || 'Played') + '</span></div><div class="sub">Tournament · ' + esc(h.team) + ' · games ' + h.gw + '-' + h.gl + ' · ' + h.of + ' teams</div><button class="btn small ghost" data-h="hist-del" data-ts="' + h.ts + '">Delete</button></li>';
    if (h.kind === 'league') return '<li class="hist"><div class="hh"><b>' + esc(h.lname) + ' · ' + h.season + '</b><span class="chip ' + (h.champ ? 'ok' : '') + '">' + (h.champ ? 'Champion' : '#' + h.rank + ' of ' + h.of) + (h.partial ? ' · left league' : '') + '</span></div>' + (h.awards && h.awards.length ? '<div class="awardrow">' + h.awards.map(a => '<span class="chip ok">🏅 ' + esc(a) + '</span>').join(' ') + '</div>' : '') + '<div class="sub">' + esc(h.team) + ' · ' + h.w + '-' + h.l + (h.t ? '-' + h.t : '') + ' · PF ' + h.pf + ' PA ' + h.pa + '</div>' +
      (h.lines && h.lines.length ? '<ul class="plines">' + h.lines.map(l => '<li><b>' + esc(l.n) + '</b> <span>' + l.p + '</span> ' + esc(line(l.s)) + '</li>').join('') + '</ul>' : '') +
      '<button class="btn small ghost" data-h="hist-del" data-ts="' + h.ts + '">Delete</button></li>';
    return '<li class="hist"><b>' + esc(h.title || 'Game') + '</b><button class="btn small ghost" data-h="hist-del" data-ts="' + h.ts + '">Delete</button></li>';
  }).join('');
  setMain('<section class="panel"><h2>' + esc(r.name) + '</h2>' +
    '<div class="row"><button class="btn" data-h="signout">Sign out</button></div></section>' +
    '<section class="panel"><h2>Saved stats</h2><p class="sub">League seasons and tournaments you finished stay here until you delete them.</p>' +
    (hist.length ? '<ul class="histlist">' + rows + '</ul><div class="row"><button class="btn ghost" data-h="hist-clear">Delete everything</button></div>' : '<p class="hint">Nothing yet. Finish a league season or a tournament and it shows up here.</p>') + '</section>');
};
ACT.signout = async () => { try { await G.api({ op: 'logout' }, 'auth'); } catch (e) {} signOut(); };
ACT['hist-del'] = async t => { if (await run(() => call('auth', { op: 'delhist', ts: +t.dataset.ts }))) V.account(); };
ACT['hist-clear'] = async () => { if (!confirm('Delete all saved league and tournament stats from your account?')) return; if (await run(() => call('auth', { op: 'clearhist' }))) V.account(); };

/* ---------- home and quick game ---------- */
V.home = () => {
  const lock = H.user ? '' : '<em class="lockt">Needs an account</em>';
  const tile = (act, title, text, extra) => '<button class="tile" data-h="' + act + '"><b>' + title + '</b><span>' + text + '</span>' + (extra || '') + '</button>';
  const picks = [0, 1, 2, 3, 4, 5, 6].map(i => { const p = E.PLAYERS[((Date.now() % 997) * 7 + i * 23) % E.PLAYERS.length]; return p.skin + ':' + p.hair + ':' + (i % 2 ? '4aa8ff' : 'ff6b4a') + ':' + (i % 2 ? '2a6fb8' : 'b83c22'); });
  setMain('<section class="lobby"><div class="hero"><div class="lineup" aria-hidden="true">' + picks.map(k => G.spCanvas(k, 5)).join('') + '</div>' +
    '<p class="lede">Real NFL players, pixel football. Play a quick game, run a franchise, or build a league.</p></div>' +
    '<div class="tiles">' +
    tile('quick', 'Quick Game', 'Draft a team and play a friend with a code, or play the CPU. No account needed.') +
    tile('camp', 'Campaign', 'Be the GM of a real NFL team. Play the 2026 season, draft rookies, trade, develop players.', H.user ? '' : '<em class="lockt">Guests save on this device</em>') +
    tile('leagues', 'Leagues', 'Custom leagues with friends. Divisions, CPUs, drafts and trades are all up to the manager.', lock) +
    tile('tourneys', 'Tournaments', 'Single-elimination brackets with custom seeding and best-of series.', lock) +
    '</div></section>');
};
V.quick = () => { G.buildLobby(); };
ACT.home = () => { if (G.state.mode !== 'lobby') { if (!confirm('Leave this game?')) return; G.exitToHub(); } go('home'); };
ACT.quick = () => go('quick');
ACT.auth = () => go('auth');
ACT.account = () => go('account');
ACT.camp = () => go('camp');
ACT.leagues = () => { if (!needAccount('leagues')) go('leagues'); };
ACT.tourneys = () => { if (!needAccount('tourneys')) go('tourneys'); };

/* ---------- generic helpers ---------- */
function copyCode(code) { const done = () => toast('Code copied.'); try { navigator.clipboard.writeText(code).then(done, () => toast('Copy failed. Select the code and copy it.')); } catch (e) { toast('Copy failed.'); } }
ACT.copy = t => copyCode(t.dataset.code);
const seg = (name, val, opts) => '<div class="segs" role="group">' + opts.map(o => '<button type="button" class="seg' + (String(val) === String(o[0]) ? ' on' : '') + '" data-h="seg" data-k="' + name + '" data-v="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
const teamDot = t => '<i class="tdot" style="background:' + esc(t.c1) + ';box-shadow:6px 0 0 ' + esc(t.c2) + '"></i>';
const tmName = t => teamDot(t) + esc(t.name);

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-h]'); if (!t) return;
  const f = ACT[t.dataset.h]; if (f) { ev.preventDefault(); f(t, ev); }
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target && (ev.target.id === 'au-p' || ev.target.id === 'au-n')) ACT['auth-go']();
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'jn-code') ACT['join-code']();
});
