/* ---------- campaign (single player, saved to the account or to this device) ---------- */
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
    if (H.user) return (await call('save', { op: 'get', slot })).L;
    return JSON.parse(lsGet('gd_c' + slot));
  },
  async put(slot, L) {
    if (H.user) { await call('save', { op: 'put', slot, L }); return; }
    if (!lsSet('gd_c' + slot, JSON.stringify(L)) || !lsSet('gd_cm' + slot, JSON.stringify(SAVE.meta(L)))) throw new Error('This device ran out of storage. Sign in to save online.');
  },
  async del(slot) { if (H.user) await call('save', { op: 'delete', slot }); else { lsSet('gd_c' + slot, null); lsSet('gd_cm' + slot, null); } }
};
const C = { L: null, slot: 0, timer: 0, state: 'saved', base: null };

async function campSave() {
  clearTimeout(C.timer); C.timer = 0;
  if (!C.L) return;
  C.state = 'saving';
  try { await SAVE.put(C.slot, C.L); C.state = 'saved'; } catch (e) { C.state = 'error'; toast(e.message && /\s/.test(e.message) ? e.message : 'Could not save. Check your connection.'); }
  const el = $('.chip.savechip'); if (el) el.textContent = savedText();
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
      '<div class="row"><button class="btn primary" data-h="camp-load" data-slot="' + s.slot + '">Continue</button><button class="btn ghost" data-h="camp-del" data-slot="' + s.slot + '">Delete</button></div></div>').join('') + '</div></section>');
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
  C.L = L; C.slot = slot; FR.tab = 'home'; FR.give = []; FR.get = []; FR.offers = null; FR.rtid = null;
  await campSave(); go('camphub');
};
ACT['camp-exit'] = async () => { await campSave(); go('camp'); };

function campAdapter() {
  const L = C.L, tid = L.user;
  const after = (now) => { campDirty(now); frShow(campAdapter()); };
  return {
    kind: 'campaign', L, tid, title: 'Campaign', canAdvance: true, canEditRoster: () => true, status: savedText(),
    headBtns: '<button class="btn small" data-h="camp-exit">Save &amp; exit</button>',
    cpuOffers: async pos => LG.cpuOffers(L, tid, pos),
    blockBids: async () => LG.blockBids(L, tid),
    async act(op, a) {
      let r = { ok: true };
      if (op === 'trade') {
        if (!LG.canTrade(L)) r = { ok: false, msg: 'Trading is closed right now.' };
        else { const x = LG.cpuTrade(L, tid, a.to, a.give, a.get); if (x.ok) LG.doTrade(L, tid, a.to, a.give, a.get); r = { ok: x.ok, msg: x.msg }; }
      } else if (op === 'sign') { const e = LG.signFA(L, tid, a.pid); r = { ok: !e, msg: e || 'Signed.' }; }
      else if (op === 'release') { const e = LG.release(L, tid, a.pid); r = { ok: !e, msg: e || 'Released.' }; }
      else if (op === 'block') { const e = LG.setBlock(L, tid, a.pid, a.on); r = { ok: !e, msg: e }; }
      else if (op === 'starter') { const e = LG.setStarter(L, tid, a.pid, a.on); r = { ok: !e, msg: e }; }
      else if (op === 'ir') { const e = LG.placeIR(L, tid, a.pid); r = { ok: !e, msg: e }; }
      else if (op === 'activate') { const e = LG.activateIR(L, tid, a.pid); r = { ok: !e, msg: e }; }
      else if (op === 'use') { const e = LG.setUsage(L, tid, a.pid, a.v); r = { ok: !e, msg: e }; }
      else if (op === 'ret') { const e = LG.setReturner(L, tid, a.pid || null); r = { ok: !e, msg: e }; }
      else if (op === 'draft') {
        if (!LG.draftPick(L, tid, a.pid)) r = { ok: false, msg: 'That pick is not allowed.' };
        else { LG.autoDraftToHuman(L); }
      } else if (op === 'draftauto') { L.draft.auto = L.draft.auto || {}; L.draft.auto[tid] = !!a.on; LG.autoDraftToHuman(L); }
      if (!r.ok && r.msg) toast(r.msg);
      after(op === 'draft' && L.phase !== 'draft'); return r;
    },
    async go(op) {
      if (op === 'offseason') { LG.offseasonBegin(L, 7); FR.tab = L.phase === 'draft' ? 'draft' : 'home'; }
      else if (op === 'season') { LG.startSeason(L); LG.runUntilHuman(L, 60); FR.tab = 'home'; }
      else if (op === 'trim') LG.trimRoster(L, tid);
      after(true);
    },
    async sim(gid) { const g = L.sched.find(x => x.id === gid); if (!g || g.done) return; LG.simGame(L, g); LG.runUntilHuman(L, 60); LG.checkFinal(L); after(true); },
    async play(gid) {
      const g = L.sched.find(x => x.id === gid); if (!g || g.done) return;
      g.T = LG.teamsFor(L, g.h, g.a);
      const side = g.h === tid ? 'a' : 'b', cpuSide = side === 'a' ? 'b' : 'a';
      G.startCtxCpu({ seed: LG.gameSeed(L, g), T: g.T, side, cpuSide }, {
        label: g.pl === 'po' ? 'Playoffs' : 'Week ' + g.w,
        report: async moves => { if (!LG.playVerified(L, g, moves, [cpuSide])) throw new Error('The game did not finish.'); },
        onDone: () => { LG.runUntilHuman(L, 60); LG.checkFinal(L); campDirty(true); go('camphub'); }
      });
    }
  };
}
V.camphub = () => { if (!C.L) { go('camp'); return; } frShow(campAdapter()); };
