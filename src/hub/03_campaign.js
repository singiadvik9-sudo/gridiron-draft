/* ---------- campaign (single player, saved to the account or to this device) ---------- */
// gzip a string to base64 in the browser (null where it cannot: the save then goes up as it is)
async function gz(str) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const buf = await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(), u = new Uint8Array(buf);
    let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch (e) { return null; }
}
const SAVE = {
  n: () => H.user ? 5 : 3,
  meta: L => { const t = L.teams[L.user]; return { team: t ? t.name : '', season: L.season, week: L.week, phase: L.phase, updated: Date.now() }; },
  async list() {
    if (H.user) return (await call('save', { op: 'list' })).slots;
    const out = [];
    for (let i = 1; i <= 3; i++) { let m = null; try { m = JSON.parse(lsGet('gd_cm' + i)); } catch (e) {} out.push(m ? Object.assign({ slot: i }, m) : { slot: i, empty: true }); }
    return out;
  },
  async get(slot) {
    if (H.user) { const r = await call('save', { op: 'get', slot }); C.rev = r.rev || 0; return r.L; }
    return JSON.parse(lsGet('gd_c' + slot));
  },
  async put(slot, L, force) {
    // (base: the version this device loaded; the server refuses if another device has saved since)
    if (H.user) { const z = await gz(JSON.stringify(L)); const r = await call('save', Object.assign({ op: 'put', slot, base: C.rev, force: force ? 1 : undefined }, z ? { Lz: z } : { L })); C.rev = r.meta ? r.meta.updated : C.rev; return; }
    if (!lsSet('gd_c' + slot, JSON.stringify(L)) || !lsSet('gd_cm' + slot, JSON.stringify(SAVE.meta(L)))) throw new Error('This device ran out of storage. Sign in to save online.');
  },
  async del(slot) { if (H.user) await call('save', { op: 'delete', slot }); else { lsSet('gd_c' + slot, null); lsSet('gd_cm' + slot, null); } }
};
const C = { L: null, slot: 0, timer: 0, state: 'saved', base: null, rev: null };

async function campSave() {
  clearTimeout(C.timer); C.timer = 0;
  if (!C.L || C.shared) return;   // (a shared campaign lives on the server: every move is saved there as it is made)
  C.state = 'saving';
  try { await SAVE.put(C.slot, C.L); C.state = 'saved'; }
  catch (e) {
    C.state = 'error';
    if (e.code === 'stale') staleSave(e.body && e.body.meta);
    else toast(e.message && /\s/.test(e.message) ? e.message : 'Could not save. Check your connection.');
  }
  const el = $('.chip.savechip'); if (el) el.textContent = savedText();
}
// this campaign was saved on another device after this one loaded it: load that version, or keep this one (overwriting the other)
function staleSave(meta) {
  const w = meta ? esc((meta.team || '') + ' · ' + meta.season + (meta.phase === 'season' || meta.phase === 'reg' ? ' week ' + meta.week : '') + ' · saved ' + new Date(meta.updated).toLocaleTimeString()) : 'a newer save';
  G.openModal('<h3>Saved on another device</h3><p>This campaign was saved on another device after you opened it here (' + w + '). Saving now would wipe out that progress.</p>' +
    '<div class="row"><button class="btn primary" data-h="stale-load">Load the other device\'s version</button><button class="btn" data-h="stale-keep">Keep this one (overwrite it)</button></div>');
}
ACT['stale-load'] = async () => { G.closeModal(); const L = await run(() => SAVE.get(C.slot)); if (!L) return; C.L = L; C.state = 'saved'; FR.offers = null; go('camphub'); toast('Loaded the newer save.'); };
ACT['stale-keep'] = async () => { G.closeModal(); C.state = 'saving'; try { await SAVE.put(C.slot, C.L, true); C.state = 'saved'; toast('Saved over the other version.'); } catch (e) { C.state = 'error'; toast('Could not save. Check your connection.'); } const el = $('.chip.savechip'); if (el) el.textContent = savedText(); };
// the rest of the league's games until your next one, a game at a time behind a "Simulating" note (the page keeps moving, and nothing can
// be clicked until it is done, so the league cannot change under it)
async function simAway(L, first) {
  let ov = document.getElementById('simov'); if (!ov) { ov = document.createElement('div'); ov.id = 'simov'; ov.setAttribute('role', 'status'); document.body.appendChild(ov); }
  const say = () => { ov.textContent = 'Simulating ' + (L.phase === 'playoffs' ? 'the playoffs' : L.phase === 'regular' ? 'week ' + L.week : 'the season') + '…'; };
  // (a short wait so the note shows before the work starts; a timer, not an animation frame, which a tab in the background never gets.
  // In the background there is nobody to keep the page moving for, so it just runs straight through.)
  say(); ov.hidden = false; if (!document.hidden) await new Promise(r => setTimeout(r, 30));
  try { if (first) first(); await LG.runUntilHumanAsync(L, 60, async () => { say(); if (!document.hidden) await new Promise(r => setTimeout(r, 0)); }, 40); }
  finally { ov.hidden = true; }
}
const savedText = () => C.state === 'saved' ? 'Saved' : C.state === 'saving' ? 'Saving…' : C.state === 'error' ? 'Not saved!' : 'Unsaved changes';
function campDirty(now) {
  C.state = 'dirty'; clearTimeout(C.timer);
  if (now) campSave(); else C.timer = setTimeout(campSave, 2500);
}

V.camp = async () => {
  setMain('<section class="panel"><h2>Campaign</h2><p class="sub">Loading saves…</p></section>');
  const slots = await run(() => SAVE.list()); if (!slots) { setMain('<section class="panel"><h2>Campaign</h2><p class="sub bad">Could not load your saves.</p></section>'); return; }
  setMain('<section class="panel"><h2>Campaign</h2><p class="sub">Take over a real NFL team for the 2026 season. You make the roster moves and play your own games; the CPU runs the other 31 teams. ' +
    (H.user ? 'Saves are stored on your account.' : 'You are a guest: saves stay on this device. Sign in to keep them on your account.') + '</p><div class="slots">' +
    slots.map(s => s.empty ? '<div class="slot-card"><b>Slot ' + s.slot + '</b><span class="sub">Empty</span><button class="btn primary" data-h="camp-new" data-slot="' + s.slot + '">New campaign</button></div>' :
      '<div class="slot-card"><b>Slot ' + s.slot + ' · ' + esc(s.team) + '</b><span class="sub">' + s.season + ' · ' + ({ regular: 'Week ' + s.week, playoffs: 'Playoffs', offseason: 'Offseason', draft: 'Draft', preseason: 'Preseason' }[s.phase] || s.phase) + '</span>' +
      '<div class="row"><button class="btn primary" data-h="camp-load" data-slot="' + s.slot + '">Continue</button><button class="btn ghost" data-h="camp-del" data-slot="' + s.slot + '">Delete</button></div></div>').join('') + '</div></section>' + (H.user ? '<section class="panel" id="shsec"><h3>Shared campaigns</h3><p class="sub">Loading…</p></section>' : ''));
  if (H.user) sharedSection();
};
ACT['camp-del'] = async t => { if (!confirm('Delete this campaign for good?')) return; if (await run(() => SAVE.del(+t.dataset.slot).then(() => true))) V.camp(); };
ACT['camp-load'] = async t => {
  const slot = +t.dataset.slot; t.disabled = true;
  const L = await run(() => SAVE.get(slot)); t.disabled = false; if (!L) return;
  C.L = L; C.slot = slot; C.state = 'saved'; FR.tab = 'home'; FR.give = []; FR.get = []; FR.offers = null; FR.rtid = null;
  go('camphub');
};
ACT['camp-new'] = t => go('campnew', { slot: +t.dataset.slot });
V.campnew = p => {
  C.base = C.base || LG.newNFL({ seed: 7 });
  const base = C.base, byDiv = {};
  base.teams.forEach(t => { const k = LG.DIV_NAMES[t.div]; (byDiv[k] = byDiv[k] || []).push(t); });
  setMain('<section class="panel"><h2>Choose your team</h2><p class="sub">Ratings are the Madden-style overall of each team\'s starters.</p>' +
    Object.keys(byDiv).map(k => '<h4 class="pos-h">' + k + '</h4><div class="teamgrid">' + byDiv[k].map(t => { const r = LG.teamRating(base, t.id); return '<button class="teambtn" data-h="camp-pick" data-slot="' + p.slot + '" data-tid="' + t.id + '">' + tmName(t) + '<span class="rt">OFF ' + r.off + ' · DEF ' + r.def + ' · <b>' + r.ovr + '</b></span></button>'; }).join('') + '</div>').join('') + '</section>');
};
ACT['camp-pick'] = async t => {
  const tid = +t.dataset.tid, slot = +t.dataset.slot;
  const L = LG.newNFL({ user: tid, seed: Math.floor(Math.random() * 2147483647) });
  L.teams[tid].owner = 'You'; L.user = tid;
  LG.runUntilHuman(L, 60);
  C.L = L; C.slot = slot; C.rev = null; FR.tab = 'home'; FR.give = []; FR.get = []; FR.offers = null; FR.rtid = null;   // (a new campaign replaces whatever was in the slot)
  await campSave(); go('camphub');
};
ACT['camp-exit'] = async () => { await campSave(); go('camp'); };

/* the inbox: messages, contract talks in place, answers to players and PR events */
// who a message is from decides its colour and icon (the owner gold, the league red, a player blue ...)
function mailLook(m) {
  const f = String(m.from || '');
  const k = m.kind === 'contract' ? 'deal' : /owner/i.test(f) ? 'owner' : /league office/i.test(f) ? 'league' : m.kind === 'play' || m.pid && !/staff|PR|relations|team|office|media/i.test(f) ? 'player' : /PR|media|radio|broadcast|stream|social/i.test(f) ? 'media' : m.opts ? 'event' : 'staff';
  return { k, icon: { deal: '📝', owner: '👔', league: '⚖️', player: '🏈', media: '📺', event: '📣', staff: '📋' }[k] };
}
function inboxHTML(L, tid) {
  const sel = FR.mail, nNew = LG.unread(L);
  let h = '<div class="inbox"><div class="panel mlist"><h3>Inbox ' + (nNew ? '<span class="mbadge">' + nNew + ' new</span>' : '') + '</h3>' + (L.inbox.length ? '<ul class="mails">' + L.inbox.map(m => { const lk = mailLook(m); return '<li class="mk-' + lk.k + (m.read ? '' : ' new') + (sel === m.id ? ' on' : '') + (m.opts && m.ans == null ? ' ask' : '') + '" data-h="mail-open" data-id="' + m.id + '"><span class="mic">' + lk.icon + '</span><b>' + esc(m.from) + '</b><span>' + esc(m.subj) + '</span><small>' + esc(m.when) + (m.opts && m.ans == null ? ' · needs an answer' : '') + '</small></li>'; }).join('') + '</ul>' : '<p class="hint">Nothing yet.</p>') + '</div><div class="panel mread">';
  const m = L.inbox.find(x => x.id === sel), cp = sel && sel[0] === 'c' ? L.players[sel.slice(1)] : m && m.kind === 'contract' ? L.players[m.pid] : null;
  if (cp) h += '<h3>Contract talks: ' + esc(cp.n) + ' <small>' + cp.p + ' ' + cp.o + ', age ' + cp.a + '</small></h3>' + threadHTML(L, cp);
  else if (m) {
    const lk = mailLook(m);
    h += '<div class="mhead mk-' + lk.k + '"><span class="mic big">' + lk.icon + '</span><div><h3>' + esc(m.subj) + '</h3><p class="sub">From ' + esc(m.from) + ' · ' + esc(m.when) + '</p></div></div><p class="mbody">' + esc(m.body) + '</p>';
    if (m.opts) h += m.ans != null ? '<p class="hint">' + (m.by ? esc(m.by) + ' chose: ' : 'You chose: ') + esc(m.opts[m.ans].t) + '</p>' : '<div class="row">' + m.opts.map((o, i) => '<button class="btn small" data-h="mail-ans" data-id="' + m.id + '" data-i="' + i + '">' + esc(o.t) + '</button>').join('') + '</div>';
  } else h += '<p class="hint">Pick a message.</p>';
  return h + '</div></div>';
}
ACT['mail-open'] = async t => { FR.mail = t.dataset.id; await FR.A.act('read', { id: t.dataset.id }); };
/* new mail: a big card slides in (once per new message), and the Inbox tab glows with the count */
const MAILSEEN = {};
function mailNotify(L) {
  const key = String(L.seed) + ':' + (L.user != null ? L.user : ''), n = L.mailN || 0;
  if (MAILSEEN[key] == null) { MAILSEEN[key] = n; return; }
  if (n <= MAILSEEN[key]) return;
  const fresh = (L.inbox || []).filter(m => !m.read && +String(m.id).slice(1) > MAILSEEN[key]); MAILSEEN[key] = n;
  if (!fresh.length) return;
  const m = fresh[0], lk = mailLook(m), old = document.getElementById('mailpop'); if (old) old.remove();
  const el = document.createElement('div'); el.id = 'mailpop'; el.className = 'mailpop mk-' + lk.k; el.setAttribute('role', 'status');
  el.innerHTML = '<span class="mic big">' + lk.icon + '</span><div class="mp-txt"><span class="eyebrow">' + (fresh.length > 1 ? fresh.length + ' new messages' : 'New message') + '</span><b>' + esc(m.subj) + '</b><small>From ' + esc(m.from) + (m.opts ? ' · needs an answer' : '') + '</small></div><div class="mp-btns"><button class="btn small primary" data-h="mail-pop" data-id="' + esc(m.id) + '">Read it</button><button class="btn small" data-h="mail-pop-x">Later</button></div>';
  document.body.appendChild(el); setTimeout(() => { if (el.parentNode) el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 9000);
}
const inboxLabel = L => 'Inbox' + (LG.unread(L) ? ' <span class="mbadge glow">' + LG.unread(L) + '</span>' : '');
ACT['mail-pop'] = async t => { const id = t.dataset.id, el = document.getElementById('mailpop'); if (el) el.remove(); FR.tab = 'inbox'; FR.mail = id; if (FR.A) await FR.A.act('read', { id }); };
ACT['mail-pop-x'] = async () => { const el = document.getElementById('mailpop'); if (el) el.remove(); };
ACT['mail-ans'] = async t => { const r = await FR.A.act('mail', { id: t.dataset.id, i: +t.dataset.i }); if (r && r.msg) toast(r.msg); };
/* the Franchise tab: morale, money, facilities, coordinators */
function franchiseHTML(L, tid) {
  const meter = (l, v) => '<div class="st"><span>' + l + '</span><span class="bar"><i class="' + (v >= 66 ? 'hi' : v >= 40 ? 'mid' : 'lo') + '" style="width:' + v + '%"></i></span><b>' + v + '</b></div>';
  const stars = LG.rosterOf(L, tid).filter(p => LG.isStar(L, p)).sort((a, b) => b.o - a.o).slice(0, 12);
  let h = '<div class="panel"><h3>Morale</h3><div class="stats">' + meter('Team', L.morale.team) + meter('Fans', L.morale.fans) + '</div><p class="hint">Team morale moves with results, press conferences and playing time, and it changes how your whole team plays. Fans follow results. Unhappy stars play worse, ask for more money and are more likely to get into trouble.</p>' +
    tbl(['Star', 'Morale', ''], stars.map(p => '<tr><td class="nm"><span class="pos">' + p.p + '</span> ' + plLink(p) + '</td><td>' + LG.moraleOf(L, p) + '</td><td>' + (p.sus ? 'Suspended ' + p.sus : p.inj ? 'Hurt' : '') + '</td></tr>').join('')) + '</div>';
  h += '<div class="panel"><h3>Team money: $' + L.fin.cash + 'M</h3><p class="hint">Separate from the salary cap. It comes in from home games (more with a bigger stadium and happy fans), sponsors after each season and PR deals. It pays for upgrades and coaches.</p>' +
    tbl(['Facility', 'Level', 'What it does', ''], Object.keys(LG.FACILITY).map(k => { const f = LG.FACILITY[k], lv = L.fin.lv[k], c = LG.upgradeCost(lv); return '<tr><td class="nm">' + f.label + '</td><td>' + lv + ' / 5</td><td>' + f.desc + '</td><td>' + (lv >= 5 ? '' : '<button class="btn small" data-h="fac-up" data-k="' + k + '"' + (L.fin.cash < c ? ' disabled' : '') + '>Upgrade $' + c + 'M</button>') + '</td></tr>'; }).join('')) + '</div>';
  const role = k => k === 'oc' ? 'Offensive coordinator' : 'Defensive coordinator';
  h += '<div class="panel"><h3>Coordinators</h3><p class="hint">A better coordinator lifts that whole side of the ball (about a point per 6 rating over 70). Salaries come out of team money each season.</p><ul class="news">' + ['oc', 'dc'].map(k => '<li>' + role(k) + ': <b>' + esc(L.staff[k].n) + '</b> · rated ' + L.staff[k].r + ' · $' + L.staff[k].sal + 'M a year</li>').join('') + '</ul><h4 class="pos-h">Available</h4>' +
    tbl(['Coach', 'Job', 'Rating', 'Salary', ''], LG.coachMarket(L).map((c, i) => '<tr><td class="nm">' + esc(c.n) + '</td><td>' + role(c.k) + '</td><td>' + c.r + '</td><td>$' + c.sal + 'M</td><td><button class="btn small" data-h="coach-hire" data-i="' + i + '"' + (L.fin.cash < c.sal ? ' disabled' : '') + '>Hire</button></td></tr>').join('')) + '</div>';
  return h;
}
ACT['fac-up'] = async t => { const r = await FR.A.act('upgrade', { k: t.dataset.k }); if (r && r.msg) toast(r.msg); };
ACT['coach-hire'] = async t => { const r = await FR.A.act('hire', { i: +t.dataset.i }); if (r && r.msg) toast(r.msg); };
function campAdapter() {
  const L = C.L, tid = L.user; LG.campInit(L); setTimeout(() => mailNotify(L), 0);
  const after = (now) => { campDirty(now); frShow(campAdapter()); };
  return {
    tabs: [{ id: 'inbox', label: inboxLabel(L), html: () => inboxHTML(L, tid) }, { id: 'franchise', label: 'Franchise', html: () => franchiseHTML(L, tid) }],
    kind: 'campaign', L, tid, title: 'Campaign', canAdvance: true, canEditRoster: () => true, status: savedText(),
    headBtns: (H.user ? '<button class="btn small" data-h="camp-share" title="Run this team together with friends">Share</button>' : '') + '<button class="btn small" data-h="camp-exit">Save &amp; exit</button>',
    cpuOffers: async pos => LG.cpuOffers(L, tid, pos),
    blockBids: async () => LG.blockBids(L, tid),
    async act(op, a) {
      const r = LG.campOp(L, tid, op, a);
      if (r.talk) FR.talk = r.talk;
      if (!r.ok && r.msg) toast(r.msg);
      after(op === 'draft' && L.phase !== 'draft'); return r;
    },
    async go(op) {
      if (op === 'offseason') {
        LG.campGo(L, tid, 'offseason'); FR.tab = 'inbox';
        const gone = ((L.progress && L.progress.retired) || []).map(id => L.players[id]).filter(p => p && p.lt === tid);
        const al = L.progress || {}, me2 = ids => (ids || []).map(id => L.players[id]).filter(p => p && p.t === tid);
        const alerts = me2(al.stars).filter(p => LG.isStar(L, p)).map(p => '<li><b class="slp">Superstar</b> ' + G.esc(p.n) + ' (' + p.p + ') is now a ' + p.o + '.</li>').concat(me2(al.sleepers).map(p => '<li><b class="slp">' + (p.pt >= 90 && p.p !== 'OL' && p.p !== 'K' && p.p !== 'P' ? 'Future superstar' : 'Sleeper') + '</b> ' + G.esc(p.n) + ' (' + p.p + '): potential ' + p.pt + ', the scouts said ' + p.was + '.</li>'), me2(al.busts).map(p => '<li><i class="bust">Bust</i> ' + G.esc(p.n) + ' (' + p.p + '): potential ' + p.pt + ', the scouts said ' + p.was + '.</li>'));
        if (alerts.length && !gone.length) setTimeout(() => G.openModal('<h3>Scouting report</h3><ul class="news">' + alerts.join('') + '</ul>'), 50);
        if (gone.length) setTimeout(() => G.openModal((alerts.length ? '<h3>Scouting report</h3><ul class="news">' + alerts.join('') + '</ul>' : '') + '<h3>Retirements</h3><p class="sub">' + gone.length + ' of your players ' + (gone.length > 1 ? 'have' : 'has') + ' retired.</p><ul class="news">' + gone.map(p => '<li><a href="#" class="plk" data-h="fr-pl" data-id="' + G.esc(p.i) + '">' + G.esc(p.n) + '</a> (' + p.p + ', ' + p.a + ', peak ' + (p.peak || p.o) + ') <button class="btn small" data-h="fr-hof" data-id="' + p.i + '">Hall of Fame</button></li>').join('') + '</ul><p class="hint">Their stats stay with them for good (Stats tab, Your retired players).</p>'), 50);
      }
      else if (op === 'season') { LG.campGo(L, tid, 'season'); FR.tab = 'home'; }
      else if (op === 'fa-next') { LG.campGo(L, tid, 'fa-next'); if (L.phase === 'draft') FR.tab = 'draft'; }
      else LG.campGo(L, tid, op);
      after(true);
    },
    async sim(gid) { const g = L.sched.find(x => x.id === gid); if (!g || g.done) return; await simAway(L, () => LG.simGame(L, g)); LG.checkFinal(L); after(true); },
    async play(gid) {
      const g = L.sched.find(x => x.id === gid); if (!g || g.done) return;
      g.T = LG.teamsFor(L, g.h, g.a);
      const side = g.h === tid ? 'a' : 'b', cpuSide = side === 'a' ? 'b' : 'a';
      G.startCtxCpu({ seed: LG.gameSeed(L, g), T: g.T, side, cpuSide }, {
        label: g.pl === 'po' ? 'Playoffs' : 'Week ' + g.w,
        report: async moves => { if (!LG.playVerified(L, g, moves, [cpuSide])) throw new Error('The game did not finish.'); },
        onDone: async () => { go('camphub'); await simAway(L); LG.checkFinal(L); campDirty(true); FR.tab = 'home'; go('camphub'); }
      });
    }
  };
}
V.camphub = () => { if (!C.L) { go('camp'); return; } if (C.shared) { sharedShow(); return; } frShow(campAdapter()); };
