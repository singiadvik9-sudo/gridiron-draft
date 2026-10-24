/* ---------- live play: you run a player on the field ----------
   Both browsers (and the server, when it verifies a game) run lib/live.js from the same inputs.  Each controlling player
   streams his inputs through the room; an input made now takes effect LV.D ticks later on every screen, and a screen only
   moves on to the next tick once it knows everything either controller did up to it (lockstep). */
const LIVE = E.LIVE;
const RL = 21;   // pixels per sideways unit on the live field
const KEYDIR = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r' };   // the right hand moves; every action is on the left side of the keyboard
const lastName = n => { const w = String(n || '').trim().split(/\s+/); while (w.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(w[w.length - 1])) w.pop(); return w[w.length - 1] || ''; };   // (not "II" for a Jr. or a II)
const K = t => '<kbd>' + t + '</kbd>';
// the left hand rests on the home row: A S D F throw to the four tagged targets (1-4 still work), Shift with one lobs it
const CATCH_POP = { contested: 'CONTESTED CATCH!', dive: 'DIVING GRAB!', toe: 'TOE TAP!', basket: 'OVER THE SHOULDER!' };
const THROWKEY = { a: 1, s: 2, d: 3, f: 4 }, THROWLAB = ['A', 'S', 'D', 'F'];
const LVLAB = { QB: 'quarterback', HB: 'running back', WR1: 'receiver', WR2: 'receiver', TE: 'tight end' };

function liveKeys(teams, off, def) {
  const OS = teams[off].squad, DS = teams[def].squad, k = {};
  const sk = p => p.sk + ':' + p.hr + ':000000:000000';
  k.QB = fieldKey(sk(OS.qb), off); k.HB = fieldKey(sk(OS.hb), off); k.WR1 = fieldKey(sk(OS.wr[0]), off); k.WR2 = fieldKey(sk(OS.wr[1]), off); k.TE = fieldKey(sk(OS.te), off);
  const gt = ab => ({ abbr: ab, c1: '#222222', c2: '#222222' });
  OS.ol.p.forEach((p, n) => { k['OL' + n] = fieldKey(genericKey(gt(OS.ol.tm), 'OL', n), off); });
  DS.df.p.forEach((p, n) => { k['D' + n] = fieldKey(genericKey(gt(DS.df.tm), 'DEF', n), def); });
  return k;
}

function retKeys(teams, recv, kick) {
  const RS = teams[recv].squad, KS = teams[kick].squad, k = {}, info = E.retInfo(RS);
  const gt = ab => ({ abbr: ab, c1: '#222222', c2: '#222222' });
  const kr = info.kr;   // the returner of either kind is drawn like the real player
  k.HB = fieldKey(kr.sk + ':' + kr.hr + ':000000:000000', recv);
  for (let i = 0; i < 10; i++) k['B' + i] = fieldKey(genericKey(gt(RS.ol.tm), 'OL', i), recv);
  for (let i = 0; i < 11; i++) k['D' + i] = fieldKey(genericKey(gt(KS.df.tm), 'DEF', i), kick);
  return k;
}

const LV = {
  on: null, D: 10, held: {}, speed: 1, raf: 0, netT: 0, pend: [],
  speedNow() { return window.__lvSpeed || this.speed; },

  /* ----- starting and stopping ----- */
  consider(G) {
    if (this.on || !G.wait || !S.me || !S.lvLoaded) return;
    const w = G.wait; if (w.n !== G.state.playNo) return;
    if (w.kind === 'ret') {   // the receiving player runs the kick back: he starts it, the other screen watches once his move is in
      if (S.rv[w.n]) return;
      const recv = w.ro.recv;
      if (S.me === recv || (S.moves[(RVN + w.n) + '-' + recv] && S.moves[(RVN + w.n) + '-' + recv].ctl)) this.start(G);
      return;
    }
    if (S.lv[w.n]) return;
    this.start(G);
  },
  start(G) {
    const w = G.wait, n = w.n, me = S.me, ret = w.kind === 'ret';
    const off = ret ? w.ro.recv : w.off, def = ret ? w.ro.kicker : w.def;
    const st = ret ? Object.assign({}, G.state, { poss: off, ballOn: w.ro.at, down: 1, toGo: 10 }) : G.state;
    // this snap's personnel (campaign and league squads rotate their backs, receivers and tight ends): the same draw the engine makes
    const T = ret ? G.teams : E.snapTeams(G.teams, null, st, E.legalOff(st, w.om.pick), S.seed, {}).teams;
    const ctl = {}; ctl[off] = ret ? true : !!w.om.ctl; ctl[def] = ret ? false : !!(w.dm && w.dm.ctl);
    const online = S.mode === 'online', both = ctl.a && ctl.b;
    const ctx = ret ? { seed: S.seed, playNo: n, ret: { kind: w.ro.kind }, ballOn: w.ro.at, toGo: 10, OS: T[off].squad, DS: T[def].squad, ctlO: true, ctlD: false }
      : { seed: S.seed, playNo: n, ballOn: st.ballOn, toGo: st.toGo, offPick: E.legalOff(st, w.om.pick), defPick: E.DEF_CALLS[w.dm.pick] ? w.dm.pick : 'ZONE', OS: T[off].squad, DS: T[def].squad, ctlO: ctl[off], ctlD: ctl[def] };
    this.lobArm = false;
    const m = this.on = {
      n, wn: ret ? RVN + n : n, ret: ret ? w.ro : null, off, def, me, ctl, ctx, online, code0: S.code, D: online && both ? this.D : 0, dir: off === 'a' ? 1 : -1, st, T, keys: ret ? retKeys(T, off, def) : liveKeys(T, off, def),
      stream: { a: { ev: [], upto: ctl.a ? 0 : 9999, fin: !ctl.a }, b: { ev: [], upto: ctl.b ? 0 : 9999, fin: !ctl.b } },
      myCtl: !!ctl[me], oppCtl: !!ctl[other(me)], opp: other(me), last: 0, acc: 0, target: 0, stallAt: 0, ended: 0, inflight: false, lastNet: 0, lastStick: '0,0', pan: '', panT: 0, handed: false, tried: 0
    };
    const part = S.lvPart && S.lvPart[m.wn];   // coming back to a snap that was already under way
    if (part && part[me] && m.myCtl) { m.stream[me].ev = part[me].ev.slice(); m.stream[me].upto = part[me].upto; }
    this.build(m);
    const sc = { poss: off, ballOn: st.ballOn, down: st.down, toGo: st.toGo, teams: T };
    Field.queue = []; Field.busy = false; document.body.classList.remove('fbusy'); Field.flash = null; Field.scene = sc; Field.live = { items: [], ball: { wx: 0, sy: 0 }, los: Field.losX(sc), dir: m.dir };
    m.sn1 = this.snapshot(m); m.sn0 = m.sn1;
    Field.cam = Field.clampCam(Field.losX(sc) + (ret ? m.dir * 9 : 0));
    this.panel(true);
    window.GD_LIVE = this; document.body.classList.add('lvon');
    m.readyAt = performance.now() + 1000 / this.speedNow();
    this.raf = requestAnimationFrame(t => { m.last = t; this.frame(t); });
    clearInterval(this.netT); this.netT = setInterval(() => this.netTick(), 130);
    if (ret && online && m.myCtl) this.announce(m);
    if (online) this.netTick();
  },
  // tell the room that this player runs the return (the other screen starts watching, and the server finds the stream)
  async announce(m) {
    for (let k = 0; k < 8 && this.on === m; k++) {
      try { await api({ op: 'move', code: S.code, seat: m.me, pid: PID, n: m.wn, pick: 'R', ctl: 1 }); return; }
      catch (e) { await new Promise(r => setTimeout(r, 500 * (k + 1))); }
    }
  },
  build(m) {   // (re)create the simulation from tick zero
    m.sim = LIVE.create(m.ctx);
    m.cc = { a: { ev: [], n: 0, i: 0, dx: 0, dy: 0 }, b: { ev: [], n: 0, i: 0, dx: 0, dy: 0 } };
    m.sn1 = this.snapshot(m); m.sn0 = m.sn1;
  },
  rebuild(m) { m.target = Math.max(m.target, m.sim.t); this.build(m); m.acc = 0; },
  snapshot(m) { const B = m.sim.ball; return { p: m.sim.P.map(p => [p.x, p.y]), b: [B.x, B.y, B.z], f: B.st === 'air' && B.air ? B.air.k / B.air.n : -1 }; },   // f: how far through its flight a thrown ball is
  stop() {
    cancelAnimationFrame(this.raf); this.raf = 0; clearInterval(this.netT); this.netT = 0;
    this.on = null; this.held = {}; if (Field.live) { Field.live = null; Field.flash = null; }
    document.body.classList.remove('lvon'); const lp = $('#lvpanel'); if (lp) lp.innerHTML = '';
    Field.YPP = Field.BASE_YPP;   // back to the normal zoom
    window.GD_LIVE = null;
  },

  /* ----- the clock ----- */
  blocked(m) {
    const need = m.sim.t + 1;
    for (const s of ['a', 'b']) {
      if (!m.ctl[s]) continue;
      if (s === m.me && m.myCtl) continue;   // my own stream is always up to date
      const rs = m.stream[s]; if (rs.upto < need && !rs.fin) return true;
    }
    return false;
  },
  sync(m, s) {
    const c = m.cc[s], ev = m.stream[s].ev;
    for (; c.n < ev.length; c.n++) c.ev.push(LIVE.dec(ev[c.n]));
  },
  frame(ts) {
    const m = this.on; if (!m) return;
    this.raf = requestAnimationFrame(t => this.frame(t));
    const dt = Math.min(120, ts - m.last) * this.speedNow() * (m.slowUntil && ts < m.slowUntil ? 0.35 : 1); m.last = ts;   // a moment of slow motion on a pick
    if (ts < m.readyAt) { this.draw(m); if (ts - m.panT > 120) { m.panT = ts; this.panel(false); } return; }
    if (!m.sim.out) m.acc = Math.min(m.acc + dt, 200);
    let guard = 0;
    while (!m.sim.out && guard++ < 500) {
      const catching = m.sim.t < m.target;
      if (!catching && m.acc < 50) break;
      if (this.blocked(m)) { if (!m.stallAt) m.stallAt = ts; break; }
      if (m.stallAt && ts - m.stallAt > 150 && m.D > 0 && m.D < 18) m.D += 2;   // the connection is slower than the delay: type further ahead
      m.stallAt = 0;
      if (!catching) m.acc -= 50;
      this.tick(m);
    }
    this.callouts(m, ts);
    if (m.sim.out && !m.ended) { m.ended = ts; this.flashResult(m); this.flush(m); }
    if (m.sim.out && ts - m.ended > 1250 / Math.max(1, this.speedNow() > 2 ? 4 : 1)) { this.finish(m); return; }
    this.draw(m);
    if (ts - m.panT > 120) { m.panT = ts; this.panel(false); }
  },
  tick(m) {
    this.sync(m, 'a'); this.sync(m, 'b');
    m.sn0 = m.sn1;
    LIVE.advance(m.sim, m.cc[m.off], m.cc[m.def]);
    m.sn1 = this.snapshot(m);
  },

  /* ----- input ----- */
  stick() {
    const m = this.on, h = this.held;
    const sx = (h.r ? 1 : 0) - (h.l ? 1 : 0), up = (h.u ? 1 : 0) - (h.d ? 1 : 0);
    // the keys follow the screen: right is toward the right of the field picture, up is up
    return [sx * m.dir, -up * m.dir];
  },
  push(code) {
    const m = this.on; if (!m || !m.myCtl || m.sim.out || m.handed) return;
    const st = this.stick(), key = st[0] + ',' + st[1];
    if (!code && key === m.lastStick) return;
    m.lastStick = key;
    const stamp = Math.min(399, m.sim.t + 1 + m.D);
    const ev = m.stream[m.me].ev, e = LIVE.enc(stamp, st[0], st[1], code || 0);
    ev.push(e);
    if (ev.length > 480) ev.splice(1, 1);
    if (m.online) this.netTick();
  },
  hand() { const m = this.on; if (!m || !m.myCtl || m.handed) return; this.push(9); m.handed = true; this.panel(true); },
  key(ev, down) {
    const m = this.on; if (!m || !m.myCtl) return false;
    const k = ev.key;
    if (KEYDIR[k]) { this.held[KEYDIR[k]] = down; ev.preventDefault(); this.push(0); return true; }
    if (!down) return false;
    if (k === ' ' || k === 'Spacebar') { ev.preventDefault(); this.push(5); return true; }
    if (k === 'e' || k === 'E' || k === 'Tab') { ev.preventDefault(); this.push(6); return true; }
    if (k === 'q' || k === 'Q') { ev.preventDefault(); this.push(7); return true; }   // spin (ball carrier) / big hit (defender)
    const tk = THROWKEY[k.toLowerCase()];
    if (tk) { ev.preventDefault(); if (ev.shiftKey) this.push(8); this.push(tk); return true; }   // Shift + throw key = lob
    if (/^[1-4]$/.test(k)) { this.push(+k); return true; }
    return false;
  },
  hold(dir, down) { this.held[dir] = down; this.push(0); },

  /* ----- network ----- */
  async netTick() {
    const m = this.on;
    if (!m || !m.online || m.inflight || (!m.myCtl && !m.oppCtl)) return;
    m.inflight = true;
    const mine = m.stream[m.me], gone = this.on !== m;
    try {
      const body = { code: S.code, seat: m.me, pid: PID, n: m.wn };
      if (m.myCtl) { body.op = 'live'; body.ev = mine.ev; body.upto = m.sim.out ? 9999 : (m.sim.t + m.D); body.fin = !!m.sim.out; }
      else { body.op = 'live'; body.poll = 1; }
      const r = await api(body);
      if (this.on === m) this.take(m, r);
      m.tried = 0;
    } catch (e) { m.tried++; if (e && e.code === 'diverged') { /* our own stream was replaced: pick it up on the next answer */ } }
    finally { m.inflight = false; }
  },
  take(m, r) {
    if (r.forced) { const f = r.forced, mine = m.stream[m.me]; if (f.ev.length !== mine.ev.length || f.ev.some((e, i) => e !== mine.ev[i])) { mine.ev = f.ev.slice(); this.rebuild(m); } mine.upto = 9999; mine.fin = true; m.handed = true; }
    const o = r.o; if (!o || !m.oppCtl) return;
    const rs = m.stream[m.opp];
    let same = o.ev.length >= rs.ev.length; for (let i = 0; same && i < rs.ev.length; i++) if (rs.ev[i] !== o.ev[i]) same = false;
    if (!same) { rs.ev = o.ev.slice(); this.rebuild(m); } else if (o.ev.length > rs.ev.length) rs.ev = o.ev.slice();
    if (o.upto > rs.upto) rs.upto = o.upto;
    if (o.fin) rs.fin = true;
  },
  async force() {
    const m = this.on; if (!m || !m.online || !m.oppCtl) return;
    try { const r = await api({ op: 'live', code: S.code, seat: m.me, pid: PID, n: m.wn, force: 1 }); this.take(m, r); m.stallAt = 0; }
    catch (e) { toast(e && e.code === 'alive' ? 'They are still connected. Give it a moment.' : 'Could not reach the server.'); }
  },
  // send the finished stream even after the screen has moved on
  flush(m) {
    if (!m.online || !m.myCtl) return;
    const send = async k => {
      try { await api({ op: 'live', code: S.code, seat: m.me, pid: PID, n: m.wn, ev: m.stream[m.me].ev, upto: 9999, fin: true }); }
      catch (e) { if (k < 12 && S.mode === 'online' && S.code === m.code0) setTimeout(() => send(k + 1), 600 * (k + 1)); }
    };
    send(0);
  },

  /* ----- finishing ----- */
  // the moment the ball changes hands mid-snap (an interception): a call-out and a beat of slow motion, before the return plays out
  callouts(m, ts) {
    const ev = m.sim.evt; m.evSeen = m.evSeen || 0;
    for (; m.evSeen < ev.length; m.evSeen++) {
      const e = ev[m.evSeen];
      if (e[0] !== 'int' || m.sim.out) continue;
      const by = m.sim.by[e[2]], col = TEAM_COL[m.def];
      Field.flash = { text: 'PICKED OFF!', color: col, turn: (m.T[m.def] || {}).name || '', sub: by ? lastName(by.name).toUpperCase() + ' HAS IT' : '', until: performance.now() + 1300 };
      Field.celebrate('INTERCEPTED', col); m.slowUntil = ts + 900;
    }
  },
  flashResult(m) {
    const o = m.sim.out, own = k => TEAM_COL[k];
    let text = '', col = '#efe9d6', turn = 0, sub = '';
    if (o.k === 'ret') {
      const sp = Math.round(m.ret.at + o.x);
      if (o.td) { text = 'TOUCHDOWN'; col = own(m.off); }
      else if (o.fumble) { text = 'FUMBLE'; col = own(m.def); turn = 1; }
      else if (o.fc) text = 'FAIR CATCH';
      else if (o.tb) text = 'TOUCHBACK';
      else text = 'TO THE ' + (sp > 50 ? 'OPP ' + (100 - sp) : 'OWN ' + sp);
    }
    else if (o.td || o.tdRet) { text = 'TOUCHDOWN'; col = own(o.tdRet ? m.def : m.off); }
    else if (o.k === 'sack') { text = 'SACK'; col = own(m.def); }
    else if (o.k === 'int') { text = 'INTERCEPTED'; col = own(m.def); turn = 1; const by = m.sim.by[o.by]; sub = by ? 'PICKED OFF BY ' + lastName(by.name).toUpperCase() + (o.tdRet ? ' · RETURNED FOR A TOUCHDOWN' : '') : ''; }
    else if (o.k === 'fumble') { text = 'FUMBLE'; col = own(m.def); turn = 1; const by = m.sim.by[o.by]; sub = by ? 'FORCED BY ' + lastName(by.name).toUpperCase() + (o.sack ? ' ON THE SACK' : '') : ''; }
    else if (o.k === 'safety') { text = 'SAFETY'; col = own(m.def); }
    else if (o.k === 'inc') text = o.away ? 'THROWN AWAY' : 'INCOMPLETE';
    else { const y = Math.round(o.x); text = y > 0 ? '+' + y + ' YARDS' : y === 0 ? 'NO GAIN' : y + ' YARDS'; if (y >= m.st.toGo) { text += ' · 1ST DOWN'; col = own(m.off); } }
    if (o.fum && !turn && o.k !== 'ret') sub = 'FUMBLE! ' + ((m.T[m.off] || {}).name || 'THE OFFENSE').toUpperCase() + ' FALL ON IT';   // loose, but kept
    Field.flash = { text, color: col }; if (turn) Field.flash.turn = (m.T[m.def] || {}).name || ''; if (sub) Field.flash.sub = sub;
    Field.celebrate(text, col);
  },
  finish(m) {
    const n = m.n, lv = { a: m.stream.a.ev.slice(), b: m.stream.b.ev.slice() };
    if (!m.ctl.a) lv.a = []; if (!m.ctl.b) lv.b = [];
    if (m.ret) { S.rv[n] = { s: m.off, ev: lv[m.off] }; S.rvSeen[n] = true; }
    else { S.lv[n] = lv; S.lvSeen[n] = true; }
    this.stop();
    S.callSig = null;
    if (S.mode === 'online' || S.mode === 'local') render();
  },

  /* ----- drawing ----- */
  draw(m) {
    const L = Field.live; if (!L) return;
    const alpha = Math.max(0, Math.min(1, m.acc / 50)), pv = m.sn0, cu = m.sn1, sim = m.sim, dir = m.dir;
    const sc = Field.scene, los = Field.losX(sc), mid = Field.TOP + (Field.H - Field.TOP) / 2;
    const lerp = (a, b) => a + (b - a) * alpha;
    const items = [];
    const hot = []; if (m.ctl[m.off] && sim.human.o) hot.push([m.off, sim.ctlId.o]); if (m.ctl[m.def] && sim.human.d) hot.push([m.def, sim.ctlId.d]);
    const passer = sim.passer || 'QB';   // (the back on a halfback pass)
    const tags = (m.me === m.off && m.myCtl && sim.human.o && sim.ball.car === passer && !sim.thrown && sim.kind === 'pass') ? Object.assign({ WR1: 'A', WR2: 'S', TE: 'D', HB: 'F' }, { [passer]: undefined }) : null;
    const catchOf = {}; sim.evt.forEach(e => { if (e[0] === 'catch' && sim.t - e[1] < 18) catchOf[e[2]] = e; });
    sim.P.forEach((p, i) => {
      const a = pv.p[i] || cu.p[i], b = cu.p[i], x = lerp(a[0], b[0]), y = lerp(a[1], b[1]);
      const fx = p.vx * dir, face = Math.abs(fx) > 0.8 ? (fx > 0 ? 1 : -1) : (p.side === 'o' ? dir : -dir);
      const it = { wx: los + dir * x, sy: mid + y * dir * RL, wz: y * dir, key: m.keys[p.id], team: p.side === 'o' ? m.off : m.def, face, id: p.id,
        vx: p.vx * dir, vz: p.vy * dir, grp: p.grp, off: p.side === 'o', dive: p.dive > 0, down: p.hold > 0, jump: p.jump > 0, eng: !!p.eng, carrier: sim.ball.car === p.id,
        stance: (p.grp === 'OL' || p.grp === 'DL') && sim.t < 4, fire: !!p.fire };
      const mineHot = hot.some(h => h[0] === m.me && h[1] === p.id), anyHot = hot.some(h => h[1] === p.id);
      it.mine = mineHot;
      if (mineHot) { it.ring = '#ffcf3f'; it.tag = lastName(p.name); if (p.side === 'd' && p.eng) it.lev = p.pairL || 0; }
      if (p.moveT != null && sim.t - p.moveT < 16) it.pop = { win: 'BEAT HIM!', stuck: 'STONEWALLED', bull: 'BULL RUSH' }[p.move];
      const ce = catchOf[p.id];   // the catch, for a moment after it: he leaps (or lays out), a ring bursts and the grab is named
      if (ce) { const age = sim.t - ce[1]; it.catchAge = age; it.catchK = ce[4] || (ce[3] >= 2 ? 'contested' : ''); if (it.catchK === 'dive' && age < 10) it.dive = true; else if (age < 12) it.lift = Math.round(Math.sin(Math.PI * age / 12) * (it.catchK === 'contested' ? 14 : 8)); if (CATCH_POP[it.catchK]) { it.pop = CATCH_POP[it.catchK]; it.popCol = '#ffcf3f'; } }
      if (p.conf) it.conf = true;
      else if (anyHot) { it.ring = TEAM_COL[other(m.me)]; }
      if (tags && tags[p.id]) it.num = tags[p.id];
      items.push(it);
    });
    items.sort((u, v) => u.sy - v.sy);
    const bx = lerp(pv.b[0], cu.b[0]), by = lerp(pv.b[1], cu.b[1]), bz = lerp(pv.b[2], cu.b[2]);
    const carried = sim.ball.car != null, car = carried ? sim.by[sim.ball.car] : null;
    L.items = items; L.los = los; L.dir = dir;
    const fl = cu.f >= 0 ? (pv.f >= 0 ? lerp(pv.f, cu.f) : cu.f) : -1;
    L.ball = { wx: los + dir * bx, sy: mid + by * dir * RL, wz: by * dir, h: bz, carried, lift: carried ? 11 : bz * 9, f: fl };
    const fly = sim.ball.air; L.land = fly && !fly.away ? { wx: los + dir * fly.ex, sy: mid + fly.ey * dir * RL } : null;   // where the throw comes down
    L.mine = items.some(i => i.mine); L.meOff = m.me === m.off;
    L.hud = null;
    if (m.myCtl && !m.handed && !sim.out && performance.now() >= m.readyAt) {
      const off = m.me === m.off, qbHas = off && sim.ball.car === passer && !sim.thrown && sim.kind === 'pass' && sim.by[passer].x <= 0, latOn = off && sim.pm.trick === 'lat' && sim.ball.car === sim.pm.tgt && !sim.latT;
      const mv = ['ARROWS', 'MOVE'];
      L.hud = m.ret ? [mv, ['SPACE', 'JUKE']].concat(m.ret.kind === 'pr' ? [['E', 'FAIR CATCH']] : [])
        : qbHas ? [mv, ['A S D F', 'BULLET'], ['SHIFT+', 'LOB'], ['SPACE', 'THROW AWAY']]
        : latOn ? [mv, ['E', 'LATERAL'], ['SPACE', 'JUKE'], ['Q', 'SPIN']]
        : off ? ((sim.kind === 'run' || sim.fake) && sim.ball.car !== sim.ctlId.o ? [mv] : [mv, ['SPACE', 'JUKE'], ['Q', 'SPIN']])
        : (sim.by[sim.ctlId.d] || {}).eng ? [mv, ['SPACE', 'SWIM'], ['Q', 'BULL RUSH'], ['E', 'SWITCH']]
        : [mv, ['SPACE', 'DIVE'], ['Q', 'BIG HIT'], ['E', 'SWITCH']];
    }
    L.msg = performance.now() < m.readyAt ? (m.myCtl ? 'READY · YOU ARE ' + lastName((sim.by[m.me === m.off ? sim.ctlId.o : sim.ctlId.d] || {}).name).toUpperCase() : 'READY…') : m.stallAt && !sim.out && (performance.now() - m.stallAt > 700) ? 'Waiting for ' + esc((S.seats[m.opp] || {}).name || 'your opponent') + '…' : '';
    // the camera: on a return it looks ahead at the coverage; while the quarterback holds the ball it leans downfield so the routes stay in
    // view (the quarterback near the back edge); with the ball in the air it frames the throw and the catch point
    const qbHold = !m.ret && sim.ball.car === 'QB' && !sim.thrown && sim.kind === 'pass' && sim.by.QB.x <= 0, air = sim.ball.air;
    const focus = m.ret ? L.ball.wx + dir * 9 : qbHold ? L.ball.wx + dir * 11 : air && !air.away ? los + dir * (sim.ball.x + air.ex) / 2 : L.ball.wx;
    // zoom out (to about 52 yards across) when the quarterback's deepest target would not fit, so the routes stay in the picture
    let reach = 0;
    if (qbHold || (air && !air.away)) ['WR1', 'WR2', 'TE', 'HB'].forEach(id => { const r = sim.by[id]; if (r) reach = Math.max(reach, r.x - sim.by.QB.x); });
    const wantYPP = Math.max(13, Math.min(Field.BASE_YPP, Field.W / Math.max(1, reach + 12)));
    Field.YPP += (wantYPP - Field.YPP) * 0.08;
    Field.cam += (Field.clampCam(focus) - Field.cam) * 0.14;
    Field.ballLift = L.ball.lift; Field.draw();
  },

  /* ----- the panel under the field ----- */
  panel(force) {
    const m = this.on, p = $('#lvpanel'); if (!m || !p) return;
    const sim = m.sim, me = m.me, role = me === m.off ? 'off' : 'def';
    const sit = (m.ret ? (m.ret.kind === 'ko' ? 'Kickoff return' : 'Punt return') : ddLabel(m.st)) + ' at ' + spotLabel(m.st, m.T);
    if (force || !p.querySelector('#lvinfo')) {
      p.innerHTML = '<div class="cp-head"><span class="role ' + role + '">' + (m.myCtl ? 'You are playing' : m.oppCtl ? esc((S.seats[m.opp] || {}).name || 'Your opponent') + ' is playing' : 'Live play') + '</span><span class="sit">' + esc(sit) + '</span></div>' +
        '<div class="lvinfo" id="lvinfo"></div>' +
        (m.myCtl ? '<div class="lvpad"><div class="dpad"><button class="pb u" data-hold="u" aria-label="Up">▲</button><button class="pb l" data-hold="l" aria-label="Left">◀</button><button class="pb r" data-hold="r" aria-label="Right">▶</button><button class="pb d" data-hold="d" aria-label="Down">▼</button></div><div class="lvact" id="lvact"></div></div>' +
          '<div class="row"><button class="btn small" data-act="live-hand"' + (m.handed ? ' disabled' : '') + '>' + (m.handed ? 'The computer is playing it' : 'Let the computer play it') + '</button></div>' : '') +
        '<div class="row" id="lvforce"></div>';
      m.pan = '';
    }
    // what can I do right now?
    let info = '', acts = '';
    const ctlId = role === 'off' ? sim.ctlId.o : sim.ctlId.d, cp = sim.by[ctlId];
    if (m.myCtl && !m.handed && !sim.out) {
      if (m.ret) {
        const pr = m.ret.kind === 'pr';
        info = 'You are <b>' + esc(lastName(cp ? cp.name : '')) + '</b>, the ' + (pr ? 'punt' : 'kick') + ' returner. ' + K('←↑↓→') + ' run · ' + K('Space') + ' juke' + (pr ? ' · ' + K('E') + ' fair catch' : '') + '. Follow your blockers.';
        acts = '<button class="ab wide" data-lvk="5">Juke</button>' + (pr ? '<button class="ab wide" data-lvk="6">Fair catch</button>' : '');
      } else if (role === 'off') {
        const pz = sim.passer || 'QB', qbHas = sim.ball.car === pz && !sim.thrown && sim.kind === 'pass', scramble = qbHas && sim.by[pz].x > 0;
        if (scramble) { info = 'You are scrambling with <b>' + esc(lastName(sim.by.QB.name)) + '</b>: past the line you can only run. ' + K('←↑↓→') + ' run · ' + K('Space') + ' juke · ' + K('Q') + ' spin.'; acts = '<button class="ab wide" data-lvk="5">Juke</button><button class="ab wide" data-lvk="7">Spin</button>'; }
        else if (qbHas) {
          info = 'You are <b>' + esc(lastName(sim.by[pz].name)) + '</b>, ' + (pz === 'QB' ? 'the quarterback' : 'throwing the halfback pass') + '. ' + K('←↑↓→') + ' move. Throw to ' + K('A') + esc(lastName(sim.by.WR1.name)) + ' ' + K('S') + esc(lastName(sim.by.WR2.name)) + ' ' + K('D') + esc(lastName(sim.by.TE.name)) + ' ' + K('F') + esc(lastName(sim.by.HB.name)) + '. Hold ' + K('Shift') + ' to lob it over the defense · ' + K('Space') + ' throws it away. Run past the line to scramble.';
          acts = ['1', '2', '3', '4'].map((k, i) => '<button class="ab" data-lvk="' + k + '">' + THROWLAB[i] + '</button>').join('') + '<button class="ab wide' + (LV.lobArm ? ' on' : '') + '" data-lvk="lob">Lob</button><button class="ab wide" data-lvk="5">Throw away</button>';
        } else if (sim.kind === 'run' && sim.ball.car === 'QB') { info = 'Hold on, the handoff is coming. ' + K('←↑↓→') + ' move.'; acts = ''; }
        else if (sim.fake && sim.ball.car !== sim.ctlId.o) { info = 'Trick play: sell it. The ball comes to you in a moment. ' + K('←↑↓→') + ' move.'; acts = ''; }
        else if (sim.pm.trick === 'lat' && sim.ball.car === sim.pm.tgt && !sim.latT) { info = 'Hook and lateral: ' + K('E') + ' pitches it to <b>' + esc(lastName(sim.by[sim.pm.mate].name)) + '</b> trailing you (do it before they wrap you up). ' + K('←↑↓→') + ' run · ' + K('Space') + ' juke.'; acts = '<button class="ab wide" data-lvk="6">Lateral</button><button class="ab wide" data-lvk="5">Juke</button>'; }
        else { info = 'You have the ball: <b>' + esc(lastName(cp ? cp.name : '')) + '</b>. ' + K('←↑↓→') + ' run · ' + K('Space') + ' juke · ' + K('Q') + ' spin.'; acts = '<button class="ab wide" data-lvk="5">Juke</button><button class="ab wide" data-lvk="7">Spin</button>'; }
      } else {
        info = 'You are <b>' + esc(lastName(cp ? cp.name : '')) + '</b> (' + esc(cp && cp.pos ? cp.pos : 'defender') + '). ' + K('←↑↓→') + ' move · ' + K('Space') + ' dive · ' + K('Q') + ' big hit (miss and you stumble) · ' + K('E') + ' switch player. Steer at the ball carrier and you are guided onto him. When a blocker has you: ' + K('Q') + ' bull rush builds leverage, ' + K('Space') + ' swims past him (best with your meter in the green, or the moment he touches you).';
        acts = '<button class="ab wide" data-lvk="5">Dive / Swim</button><button class="ab wide" data-lvk="7">Hit / Bull rush</button><button class="ab wide" data-lvk="6">Switch</button>';
      }
    } else if (m.myCtl && m.handed) info = 'The computer has your players.';
    else if (m.oppCtl) info = 'Your opponent is playing this snap on the field. Your players move on their own.';
    else info = 'Watching the snap.';
    const key = info + '|' + acts;
    if (key !== m.pan) {
      m.pan = key;
      const a = $('#lvinfo'), b = $('#lvact'); if (a) a.innerHTML = info; if (b) b.innerHTML = acts;
    }
    const f = $('#lvforce');
    if (f) {
      const want = m.online && m.oppCtl && m.stallAt && performance.now() - m.stallAt > 5000 && !sim.out;
      const html = want ? '<button class="btn small" data-act="live-force">Opponent not responding · let the computer take over their player</button>' : '';
      if (f.dataset.h !== html) { f.innerHTML = html; f.dataset.h = html; }
    }
  }
};
