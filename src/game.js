(function () {
'use strict';
const E = window.E;
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const TEAM_COL = { a: '#ff6b4a', b: '#4aa8ff' };
const other = t => t === 'a' ? 'b' : 'a';
const ord = n => ['', '1st', '2nd', '3rd', '4th'][n] || n + 'th';

/* ---------- tiny storage helpers (all optional) ---------- */
function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
const PID = (() => {
  let v = ssGet('gd_pid');
  if (!v) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); ssSet('gd_pid', v); }
  return v;
})();


/* ---------- state ---------- */
const S = {
  mode: 'lobby', code: null, seed: 0, me: null, seats: {}, moves: {}, mine: {},
  myName: lsGet('gd_name') || '', screen: null, shown: null, callSig: null,
  poll: null, ready: false, G: null, cpuFor: -1, busy: false, api: true, cpuSides: [], ctx: null, sd: null,
  ctlOn: lsGet('gd_ctl') === '1', toN: {}, toSel: null, ctlN: {}, lv: {}, rv: {}, rvSeen: {}, lvSeen: {}, lvPart: {}, lvLoaded: true
};

/* ---------- sprites ---------- */
// One football-player body for everyone. Only skin and hair color change per player; jersey and helmet
// take the team colors. H helmet, M facemask, F skin, R hair, J jersey, W white, P pants, S cleats.
const BODY = [
  "....HHHH....",
  "...HHWWHH...",
  "..RHHHHHHM..",
  "..RRHHFFFM..",
  "...R.HFFF...",
  "...JJJFJJ...",
  "..FJJJJJJF..",
  "..FJJWWJJF..",
  "..FJJWWJJF..",
  "...PPPPPP...",
  "...PP..PP...",
  "...SS..SS..."
];
const SPR = 14;   // 14x14 canvas: 12x12 template plus a 1-cell outline margin
const D = E.DATA;
function hex2rgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function shade(h, f) {
  const c = hex2rgb(h), k = f < 0 ? 0 : 255, t = Math.abs(f);
  return 'rgb(' + c.map(v => Math.round(v + (k - v) * t)).join(',') + ')';
}
function lum(h) { const c = hex2rgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
const spriteCache = new Map();
// key: "skin:hair:jersey:helmet"  (skin 1-5, hair K/N/B/R/G/X, colors as hex without #)
function buildSprite(key) {
  const [sk, hr, jc, hc] = key.split(':');
  const skin = D.SKIN[+sk - 1], hair = hr === 'X' ? skin : D.HAIR[hr];
  const jersey = '#' + jc, helmet = '#' + hc;
  const G = Array.from({ length: SPR }, () => new Array(SPR).fill('.'));
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) G[y + 1][x + 1] = BODY[y][x];
  const O = G.map(r => r.slice());
  for (let y = 0; y < SPR; y++) for (let x = 0; x < SPR; x++) {
    if (G[y][x] !== '.') continue;
    if ((y > 0 && G[y - 1][x] !== '.') || (y < SPR - 1 && G[y + 1][x] !== '.') || (x > 0 && G[y][x - 1] !== '.') || (x < SPR - 1 && G[y][x + 1] !== '.')) O[y][x] = 'O';
  }
  const col = { H: helmet, M: '#c9ccd4', F: skin, R: hair, J: jersey, W: '#f4f1e6', P: '#e6e3d6', S: '#171a24', O: '#0a0d18' };
  const cv = document.createElement('canvas'); cv.width = cv.height = SPR;
  const cx = cv.getContext('2d');
  for (let y = 0; y < SPR; y++) for (let x = 0; x < SPR; x++) {
    const ch = O[y][x]; if (ch === '.') continue;
    cx.fillStyle = col[ch]; cx.fillRect(x, y, 1, 1);
  }
  return cv;
}
function getSprite(key) {
  let s = spriteCache.get(key);
  if (!s) { s = buildSprite(key); spriteCache.set(key, s); }
  return s;
}
const hexNo = h => h.replace('#', '');
function jerseyOf(tm) { return lum(tm.c1) < 0.14 ? tm.c2 : tm.c1; }
function keyFor(p, tm) { return p.skin + ':' + p.hair + ':' + hexNo(jerseyOf(tm)) + ':' + hexNo(lum(tm.c1) < 0.14 ? tm.c1 : tm.c2); }
// line / defense packages are not individual likenesses: generic mix of skin and hair
const SKIN_MIX = [1, 2, 3, 4, 4, 5, 5, 3, 1, 4, 5];
const HAIR_MIX = ['K', 'N', 'K', 'X', 'K', 'B', 'K', 'N', 'X', 'K', 'R'];
function genericKey(tm, seed, n) {
  const h = E.hashStr(tm.abbr + ':' + seed + ':' + n);
  return SKIN_MIX[h % SKIN_MIX.length] + ':' + HAIR_MIX[(h >>> 5) % HAIR_MIX.length] + ':' + hexNo(jerseyOf(tm)) + ':' + hexNo(lum(tm.c1) < 0.14 ? tm.c1 : tm.c2);
}
// the sprite key for a drafted slot (used on cards, strip, rosters)
function slotKey(slotIdx, id) {
  const e = E.entity(slotIdx, id), k = E.SLOTS[slotIdx].kind;
  if (k === 'OL' || k === 'DEF' || k === 'ST') return genericKey(e.tm, k, 0);
  return keyFor(e, e.tm);
}
// on the field every sprite wears its drafted side's colors
const SIDE_J = { a: 'ff6b4a', b: '4aa8ff' }, SIDE_H = { a: 'b83c22', b: '2a6fb8' };
function fieldKey(base, side) { const p = base.split(':'); return p[0] + ':' + p[1] + ':' + SIDE_J[side] + ':' + SIDE_H[side]; }
function paintCanvases(root) {
  root.querySelectorAll('canvas[data-sp]').forEach(cv => {
    const sc = +cv.dataset.s || 4;
    cv.width = cv.height = SPR * sc;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(getSprite(cv.dataset.sp), 0, 0, SPR * sc, SPR * sc);
  });
}
window.GD = { getSprite, slotKey, genericKey };

/* ---------- small view helpers ---------- */
function meter(f) {
  const n = Math.max(0, Math.min(10, Math.round(f / 10)));
  let h = '<span class="meter">';
  for (let i = 0; i < 10; i++) h += '<i class="' + (i < n ? 'on' : '') + '"></i>';
  return h + '</span>';
}
function statRow(k, v) {
  return '<div class="st"><span>' + k + '</span><span class="bar"><i class="' + (v >= 88 ? 'hi' : v >= 76 ? 'mid' : 'lo') + '" style="width:' + Math.max(8, Math.min(100, (v - 40) / 0.6)) + '%"></i></span><b>' + v + '</b></div>';
}
const spCanvas = (key, s) => '<canvas class="spr" data-sp="' + key + '" data-s="' + s + '"></canvas>';
const brite = tm => { const c = lum(tm.c1) < 0.2 ? tm.c2 : tm.c1; return lum(c) < 0.4 ? shade(c, 0.45) : c; };
const teamChip = tm => '<span class="chip tm" style="--tc:' + brite(tm) + '">' + esc(tm.city + ' ' + tm.nick) + '</span>';
function cardHTML(id, i, slotIdx) {
  const slot = E.SLOTS[slotIdx], e = E.entity(slotIdx, id), g = E.grade(e.ovr);
  let art, name, chips, body;
  if (slot.kind === 'OL') {
    art = '<div class="pc-art units">' + [0, 1, 2, 3, 4].map(n => spCanvas(genericKey(e.tm, 'OL', n), 3)).join('') + '<span class="grade">' + g + '</span></div>';
    name = E.unitName(e, 'OL'); chips = teamChip(e.tm);
    body = '<div class="plist">' + e.players.map(p => '<div><span>' + esc(p[0]) + '</span><b>' + p[1] + '</b></div>').join('') + '</div>';
  } else if (slot.kind === 'DEF') {
    art = '<div class="pc-art units">' + [0, 1, 2, 3].map(n => spCanvas(genericKey(e.tm, 'DEF', n), 3)).join('') + '<span class="grade">' + g + '</span></div>';
    name = E.unitName(e, 'DEF'); chips = teamChip(e.tm) + '<span class="chip">' + (e.scheme === '34' ? '3-4' : '4-3') + '</span>';
    const top = e.players.slice().sort((a, b) => b[3] - a[3]).slice(0, 3).map(p => p[2] + ' ' + p[3]).join(' · ');
    body = '<div class="stats">' + E.GROUPS.map(k => statRow(k, Math.round(e.g[k]))).join('') + '</div><div class="trait">' + esc(top) + '</div>';
  } else {
    art = '<div class="pc-art">' + spCanvas(keyFor(e, e.tm), 7) + '<span class="grade">' + g + '</span></div>';
    name = e.name; chips = teamChip(e.tm);
    body = '<div class="stats">' + statRow('SPD', e.spd) + statRow('STR', e.str) + statRow('AGI', e.agi) + statRow('AWR', e.awr) + '</div>' + (e.est ? '<div class="trait">rating estimated from comparable players</div>' : '');
  }
  return '<button class="pcard g-' + g + '" data-act="pick" data-i="' + i + '" aria-label="Draft ' + esc(name) + '">' + art +
    '<div class="pc-main"><div class="pc-top"><span class="key">' + (i + 1) + '</span><span class="pc-name">' + esc(name) + '</span><span class="dex">' + e.ovr + '</span></div>' +
    '<div class="chips">' + chips + '</div>' + body + '</div></button>';
}

const abbr = n => (String(n).replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/)[0] || 'TM').slice(0, 3).toUpperCase();
function spotLabel(st, teams) {
  if (st.ballOn === 50) return '50';
  if (st.ballOn < 50) return abbr(teams[st.poss].name) + ' ' + st.ballOn;
  return abbr(teams[other(st.poss)].name) + ' ' + (100 - st.ballOn);
}
function ddLabel(st) { if (st.kick) return 'Kickoff'; return ord(st.down) + ' & ' + (st.toGo >= 100 - st.ballOn ? 'Goal' : st.toGo); }

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

/* ---------- derived game ---------- */
function validSeat(d) { return !!(d && d.status === 'ready' && (d.squad || E.validRoster(d.roster))); }
function bothReady() { return validSeat(S.seats.a) && validSeat(S.seats.b); }
function teamOf(seat) {
  const d = S.seats[seat];
  const name = String(d.name || 'Team ' + seat.toUpperCase()).slice(0, 18);
  return d.squad ? { name, squad: d.squad } : { name, roster: d.roster, squad: E.squadFromRoster(d.roster) };
}
const moveOf = v => v && typeof v === 'object' ? Object.assign({ pick: v.p }, v.c ? { ctl: 1 } : {}, v.t ? { to: 1 } : {}) : { pick: v };
const myMove = n => Object.assign({ pick: S.mine[n] }, S.ctlN[n] ? { ctl: 1 } : {}, S.toN[n] ? { to: 1 } : {});
function allMoves() {
  const mv = Object.assign({}, S.moves);
  if (S.me) for (const n in S.mine) mv[n + '-' + S.me] = myMove(n);
  for (const n in S.lv) mv[n + '-lv'] = S.lv[n];
  for (const n in S.rv) mv[n + '-rv'] = S.rv[n];
  return mv;
}
function derive() {
  if (!bothReady()) return null;
  const teams = { a: teamOf('a'), b: teamOf('b') };
  const rp = E.replay(S.seed, teams, allMoves(), S.cpuSides);
  return { teams, state: rp.state, log: rp.log, U: rp.U, wait: rp.wait };
}

/* ---------- field renderer ---------- */
const Field = {
  W: 680, H: 372, YPP: 20, BASE_YPP: 20, TOP: 42,   // YPP: pixels per yard (a live snap zooms out a little for deep routes)
  cv: null, ctx: null, scene: null, cam: 50, ballX: null, ballLift: 0, flash: null,
  queue: [], busy: false, live: null, anim: null,
  init() {
    if (this.cv) return;
    const cv = document.createElement('canvas');
    cv.width = this.W; cv.height = this.H; cv.className = 'field';
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Football field');
    this.cv = cv; this.ctx = cv.getContext('2d');
  },
  losX(sc) { return sc.poss === 'a' ? sc.ballOn : 100 - sc.ballOn; },
  clampCam(x) { const half = this.W / this.YPP / 2; return Math.max(-10 + half, Math.min(110 - half, x)); },
  // big moments: the field shakes, and a touchdown throws confetti in the scoring team's colour (fx is drawn by draw / drawOverlay)
  celebrate(text, color) {
    const big = /TOUCHDOWN|INTERCEPTED|FUMBLE|SAFETY|ON FIRE/.test(text), hit = /SACK|BIG HIT|CONTESTED/.test(text);
    if (!big && !hit) return;
    const parts = /TOUCHDOWN|ON FIRE/.test(text) ? Array.from({ length: 46 }, (_, i) => ({ x: Math.random() * this.W, y: -10 - Math.random() * 120, vx: (Math.random() - 0.5) * 60, vy: 90 + Math.random() * 140, c: i % 3 ? color : '#ffcf3f', s: 3 + Math.random() * 4, fire: /ON FIRE/.test(text) })) : [];
    this.fx = { t0: performance.now(), shake: big ? 9 : 6, parts };
  },
  set(sc) { this.scene = sc; this.YPP = this.BASE_YPP; this.cam = this.clampCam(this.losX(sc)); this.ballX = null; this.ballLift = 0; this.flash = null; this.draw(); },
  formation(sc) {
    const o = sc.poss, d = other(o), dir = o === 'a' ? 1 : -1, los = this.losX(sc);
    const midY = this.TOP + (this.H - this.TOP) / 2, ROW = 24;
    const out = [], OS = sc.teams[o].squad, DS = sc.teams[d].squad;
    const put = (team, wx, sy, base, id, grp) => out.push({ wx, sy, wz: (sy - midY) / ROW, key: fieldKey(base, team), team, id, grp, stance: grp === 'OL' || grp === 'DL' });
    const sk = p => p.sk + ':' + p.hr + ':000000:000000';
    const OFFP = [[OS.qb, 3, 0, 'QB', 'QB'], [OS.hb, 7, 0, 'HB', 'HB'], [OS.wr[0], 0.7, -5.2, 'WR1', 'WR'], [OS.wr[1], 0.7, 5.2, 'WR2', 'WR'], [OS.te, 0.7, 3, 'TE', 'TE']];
    OFFP.forEach(q => put(o, los - dir * q[1], midY + q[2] * dir * ROW, sk(q[0]), q[3], q[4]));
    const gt = ab => ({ abbr: ab, c1: '#222222', c2: '#222222' });
    [-2, -1, 0, 1, 2].forEach((yy, n) => put(o, los - dir * 0.7, midY + yy * dir * ROW, genericKey(gt(OS.ol.tm), 'OL', n), 'OL' + n, 'OL'));
    const T43 = { LDE: [-0.9, -2.9], LDT: [-0.9, -1], RDT: [-0.9, 1], RDE: [-0.9, 2.9], WLB: [-3, -3.6], MLB: [-3.8, 0], SLB: [-3, 3.6] };
    const T34 = { LDT: [-0.9, -2.2], NT: [-0.9, 0], RDT: [-0.9, 2.2], LEDGE: [-2.6, -3.8], LILB: [-3.6, -1.1], RILB: [-3.6, 1.1], REDGE: [-2.6, 3.8], LDE: [-0.9, -2.2], RDE: [-0.9, 2.2], WLB: [-2.6, -3.8], SLB: [-2.6, 3.8] };
    const TD = Object.assign({}, DS.df.sch === '43' ? T43 : T34, { LCB: [-2.2, -6], RCB: [-2.2, 6], SS: [-9, 2.2], FS: [-9, -2.2] });
    DS.df.p.forEach((p, n) => {
      const q = TD[p[0]]; if (!q) return;
      put(d, los - dir * q[0], midY + q[1] * dir * ROW, genericKey(gt(DS.df.tm), 'DEF', n), 'D' + n, p[1]);
    });
    out.sort((a, b) => a.sy - b.sy);
    return out;
  },

  draw() {
    const x = this.ctx, W = this.W, H = this.H, YPP = this.YPP, TOP = this.TOP, sc = this.scene;
    if (!x) return;
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#0e1528'; x.fillRect(0, 0, W, H);
    if (!sc) return;
    const fx = this.fx, fe = fx ? (performance.now() - fx.t0) / 1000 : 9;
    if (fx && fe > 1.4) this.fx = null;
    const shake = fx && fe < 0.45 ? fx.shake * (1 - fe / 0.45) : 0;
    x.save(); if (shake) x.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
    const left = this.cam - W / YPP / 2, sx = wx => (wx - left) * YPP;
    for (let yd = -10; yd < 110; yd += 5) {
      const a = sx(yd), b = sx(yd + 5);
      if (b < 0 || a > W) continue;
      x.fillStyle = yd < 0 ? '#6b2a1e' : yd >= 100 ? '#1b4a80' : (((yd / 5) | 0) % 2 === 0 ? '#1f5233' : '#245c3a');
      x.fillRect(a, TOP, b - a + 1, H - TOP);
    }
    // yard lines + numbers
    x.textAlign = 'center'; x.font = '14px Silkscreen, monospace';
    for (let yd = 0; yd <= 100; yd += 5) {
      const px = Math.round(sx(yd)); if (px < -20 || px > W + 20) continue;
      x.fillStyle = 'rgba(239,233,214,' + (yd === 0 || yd === 100 ? 0.95 : 0.4) + ')';
      x.fillRect(px - (yd === 0 || yd === 100 ? 1 : 0), TOP, yd === 0 || yd === 100 ? 3 : 2, H - TOP);
      if (yd % 10 === 0 && yd > 0 && yd < 100) {
        x.fillStyle = 'rgba(239,233,214,.55)';
        x.fillText(String(Math.min(yd, 100 - yd)), px, TOP + 20);
        x.fillText(String(Math.min(yd, 100 - yd)), px, H - 8);
      }
    }
    // end zone names
    [['a', -5], ['b', 105]].forEach(([t, wx]) => {
      const px = sx(wx); if (px < -40 || px > W + 40) return;
      x.save(); x.translate(px, TOP + (H - TOP) / 2); x.rotate(t === 'a' ? -Math.PI / 2 : Math.PI / 2);
      x.fillStyle = 'rgba(239,233,214,.5)'; x.font = '22px Silkscreen, monospace';
      x.fillText(abbr(sc.teams[t].name), 0, 8); x.restore();
    });
    // scrimmage + first down lines
    const los = this.losX(sc), dir = sc.poss === 'a' ? 1 : -1;
    const fd = Math.max(-0.01, Math.min(100.01, los + dir * sc.toGo));
    x.fillStyle = '#5aa9ff'; x.fillRect(Math.round(sx(los)) - 1, TOP, 3, H - TOP);
    x.fillStyle = '#ffcf3f'; x.fillRect(Math.round(sx(fd)) - 1, TOP, 3, H - TOP);
    // players
    const live = this.live;
    const offscreen = [];
    if (live && live.land) {   // where the throw is coming down
      const lx = Math.round(sx(live.land.wx)), pul = 0.5 + 0.5 * Math.sin(performance.now() / 120);
      x.strokeStyle = '#ffcf3f'; x.globalAlpha = 0.5 + 0.4 * pul; x.lineWidth = 2; x.beginPath(); x.ellipse(lx, live.land.sy + 9, 9 + pul * 3, 4 + pul * 1.5, 0, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1;
    }
    (live ? live.items : this.formation(sc)).forEach(p => {
      const px = Math.round(sx(p.wx)); if (px < -20 || px > W + 20) { if (live && p.num) offscreen.push({ p, right: px > W }); return; }
      x.fillStyle = TEAM_COL[p.team]; x.globalAlpha = 0.55;
      x.beginPath(); x.ellipse(px, p.sy + 9, 11, 4, 0, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
      if (p.ring) {
        const pulse = p.tag ? 0.5 + 0.5 * Math.sin(performance.now() / 170) : 0;   // your own player pulses
        x.strokeStyle = p.ring; x.lineWidth = p.tag ? 3 : 2; x.beginPath(); x.ellipse(px, p.sy + 9, 15 + pulse * 3, 6.5 + pulse * 1.5, 0, 0, Math.PI * 2); x.stroke();
        if (p.tag) { x.globalAlpha = 0.18 + 0.12 * pulse; x.fillStyle = p.ring; x.beginPath(); x.ellipse(px, p.sy + 9, 15 + pulse * 3, 6.5 + pulse * 1.5, 0, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; }
      }
      const face = p.face != null ? p.face : (p.team === sc.poss ? dir : -dir), spx = Math.round(p.sy) - 21 - (p.lift || 0);
      if (p.catchAge != null && p.catchAge < 14) {   // the catch: a ring bursting out from him
        const k = p.catchAge / 14; x.strokeStyle = p.catchK === 'contested' ? '#ffcf3f' : '#efe9d6'; x.globalAlpha = 1 - k; x.lineWidth = 3;
        x.beginPath(); x.ellipse(px, p.sy + 9, 10 + k * 26, 4 + k * 10, 0, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1;
      }
      if (p.conf) {   // confidence after a tough catch: sparks circling him
        const t = performance.now() / 260; x.fillStyle = '#7fe0ff';
        for (let k = 0; k < 3; k++) { const a = t + k * 2.1; x.fillRect(Math.round(px + Math.cos(a) * 13) - 2, Math.round(spx + 12 + Math.sin(a) * 6) - 2, 4, 4); }
      }
      if (p.fire) {   // on fire: flickering flames behind him
        const t = performance.now() / 90;
        for (let k = 0; k < 6; k++) { const fh = 10 + 8 * Math.abs(Math.sin(t + k * 1.7)); x.fillStyle = k % 2 ? '#ff7a1a' : '#ffcf3f'; x.globalAlpha = 0.75; x.fillRect(px - 12 + k * 4, spx + 22 - fh, 4, fh); }
        x.globalAlpha = 1;
      }
      if (p.dive) { x.save(); x.translate(px, spx + 24); x.rotate(face * 1.2); x.scale(face < 0 ? -1 : 1, 1); x.drawImage(getSprite(p.key), -14, -24, 28, 28); x.restore(); }   // laid out: a diving catch or tackle
      else if (face < 0) { x.save(); x.translate(px, 0); x.scale(-1, 1); x.drawImage(getSprite(p.key), -14, spx, 28, 28); x.restore(); }
      else x.drawImage(getSprite(p.key), px - 14, spx, 28, 28);
      if (p.ring && p.tag) {
        const bob = Math.round(Math.sin(performance.now() / 200) * 2);
        x.fillStyle = p.ring; x.beginPath(); x.moveTo(px - 8, spx - 14 + bob); x.lineTo(px + 8, spx - 14 + bob); x.lineTo(px, spx - 3 + bob); x.fill();
        x.strokeStyle = '#0b1020'; x.lineWidth = 2; x.stroke();
        x.font = '11px Silkscreen, monospace'; x.textAlign = 'center'; x.lineWidth = 4; x.strokeStyle = '#0b1020';
        const lab = 'YOU · ' + p.tag.toUpperCase(); x.strokeText(lab, px, spx - 19 + bob); x.fillStyle = p.ring; x.fillText(lab, px, spx - 19 + bob);
      }
      if (p.lev != null) {   // your rusher's leverage against his blocker: green, he is winning (swim now); red, the blocker is
        const w = 34, f = Math.max(-1, Math.min(1, -p.lev)), bx = px - w / 2, by = spx + 31;
        x.fillStyle = '#0b1020'; x.fillRect(bx - 2, by - 2, w + 4, 8);
        x.fillStyle = f > 0.25 ? '#3fdc6a' : f > -0.2 ? '#ffcf3f' : '#ff5a4a'; x.fillRect(bx + w / 2, by, Math.round(f * w / 2), 4);
        x.fillStyle = '#efe9d6'; x.fillRect(bx + w / 2, by - 1, 1, 6);
      }
      if (p.pop) { x.font = '12px Silkscreen, monospace'; x.textAlign = 'center'; x.lineWidth = 4; x.strokeStyle = '#0b1020'; x.strokeText(p.pop, px, spx - 34); x.fillStyle = p.popCol || (p.pop === 'STONEWALLED' ? '#ff7a6a' : '#3fdc6a'); x.fillText(p.pop, px, spx - 34); }
      if (p.num) {
        x.fillStyle = '#ffcf3f'; x.strokeStyle = '#0b1020'; x.lineWidth = 2; x.fillRect(px - 10, spx - 20, 20, 18); x.strokeRect(px - 10, spx - 20, 20, 18);
        x.fillStyle = '#10152a'; x.font = '15px Silkscreen, monospace'; x.textAlign = 'center'; x.fillText(p.num, px, spx - 5);
      }
    });
    // receivers you can throw to who are out of the picture: a marker on the edge with his key and how far away he is
    offscreen.forEach(({ p, right }) => {
      const ex = right ? W - 6 : 6, ey = Math.max(TOP + 16, Math.min(H - 10, Math.round(p.sy))), dx = right ? -1 : 1;
      const yd = Math.round(Math.abs(p.wx - (right ? left + W / YPP : left)));
      x.fillStyle = '#ffcf3f'; x.strokeStyle = '#0b1020'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex + dx * 12, ey - 9); x.lineTo(ex + dx * 12, ey + 9); x.closePath(); x.fill(); x.stroke();
      const bxl = right ? ex - 12 - 40 : ex + 12; x.fillRect(bxl, ey - 9, 40, 18); x.strokeRect(bxl, ey - 9, 40, 18);
      x.fillStyle = '#10152a'; x.font = '11px Silkscreen, monospace'; x.textAlign = 'center'; x.fillText(p.num + ' +' + yd, bxl + 20, ey + 4);
    });
    // ball
    const bx = live ? live.ball.wx : (this.ballX == null ? los - dir * 0.2 : this.ballX);
    const gy = live ? live.ball.sy : TOP + (H - TOP) / 2, by = gy - this.ballLift;
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(sx(bx), gy + 8, 6, 2.5, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#8a4b22'; x.beginPath(); x.ellipse(sx(bx), by, 6, 3.6, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#efe9d6'; x.fillRect(Math.round(sx(bx)) - 2, Math.round(by) - 1, 4, 1);
    x.restore();
    this.drawOverlay(x, W, H, left, W / YPP);
    if (fx && fe < 1.4) fx.parts.forEach(q => { const px = q.x + q.vx * fe, py = q.y + q.vy * fe + 60 * fe * fe; if (py > H) return; x.globalAlpha = Math.max(0, 1 - fe / 1.4); x.fillStyle = q.fire && Math.random() < 0.5 ? '#ff7a1a' : q.c; x.fillRect(px, py, q.s, q.s); x.globalAlpha = 1; });
  },
  // minimap, messages, key strip and flash text: drawn over the 2D field and over the 3D views (W x H are logical pixels)
  drawOverlay(x, W, H, left, span) {
    const sc = this.scene, live = this.live, TOP = this.TOP;
    const los = this.losX(sc), dir = sc.poss === 'a' ? 1 : -1, fd = Math.max(-0.01, Math.min(100.01, los + dir * sc.toGo));
    // mini map
    const mx = 14, mw = W - 28, my = 11, mh = 12, mp = wx => mx + (Math.max(0, Math.min(100, wx)) / 100) * mw;
    x.fillStyle = '#17213d'; x.fillRect(mx, my, mw, mh);
    x.fillStyle = 'rgba(255,107,74,.55)'; x.fillRect(mx, my, mw * 0.06, mh);
    x.fillStyle = 'rgba(74,168,255,.55)'; x.fillRect(mx + mw * 0.94, my, mw * 0.06, mh);
    x.fillStyle = 'rgba(239,233,214,.3)';
    for (let i = 1; i < 10; i++) x.fillRect(Math.round(mp(i * 10)), my, 1, mh);
    x.strokeStyle = 'rgba(239,233,214,.8)'; x.lineWidth = 1;
    const vl = mp(left), vr = mp(left + span);
    x.strokeRect(vl + 0.5, my - 2.5, Math.max(4, vr - vl), mh + 5);
    x.fillStyle = TEAM_COL[sc.poss]; x.fillRect(Math.round(mp(los)) - 2, my - 1, 5, mh + 2);
    x.fillStyle = '#ffcf3f'; x.fillRect(Math.round(mp(fd)) - 1, my - 1, 2, mh + 2);
    x.font = '10px Silkscreen, monospace'; x.textAlign = 'left';
    x.fillStyle = '#93a0c4'; x.fillText(abbr(sc.teams.a.name), mx, my + mh + 12);
    x.textAlign = 'right'; x.fillText(abbr(sc.teams.b.name), mx + mw, my + mh + 12);
    if (live && live.msg) {
      x.textAlign = 'center'; x.font = '14px Silkscreen, monospace'; x.lineWidth = 5; x.strokeStyle = '#0b1020';
      x.strokeText(live.msg, W / 2, TOP + 44); x.fillStyle = '#efe9d6'; x.fillText(live.msg, W / 2, TOP + 44);
    }
    // key reminder strip while you control a player
    if (live && live.hud && live.hud.length) {
      const bh = 30, by0 = H - bh;
      x.fillStyle = 'rgba(11,16,32,.88)'; x.fillRect(0, by0, W, bh); x.fillStyle = '#ffcf3f'; x.fillRect(0, by0, W, 2);
      x.font = '11px Silkscreen, monospace'; x.textBaseline = 'middle';
      let tw = 0; const parts = live.hud.map(h => { const kw = Math.max(20, x.measureText(h[0]).width + 12), lw = x.measureText(h[1]).width; tw += kw + 6 + lw + 18; return [kw, lw]; });
      let cx = Math.max(8, (W - (tw - 18)) / 2);
      live.hud.forEach((h, i) => {
        const kw = parts[i][0], cy = by0 + bh / 2 + 1;
        x.fillStyle = '#efe9d6'; x.fillRect(cx, cy - 10, kw, 20); x.fillStyle = '#9aa2bf'; x.fillRect(cx, cy + 7, kw, 3);
        x.fillStyle = '#10152a'; x.textAlign = 'center'; x.fillText(h[0], cx + kw / 2, cy - 1);
        x.fillStyle = '#efe9d6'; x.textAlign = 'left'; x.fillText(h[1], cx + kw + 6, cy - 1);
        cx += kw + 6 + parts[i][1] + 18;
      });
      x.textBaseline = 'alphabetic';
    }
    // flash text
    if (this.flash && this.flash.until && performance.now() > this.flash.until) this.flash = null;
    if (this.flash) {
      const f = this.flash, cy = H / 2 - 8;
      // a turnover gets a band across the field in the team that won the ball's colour, saying so, and who made the play
      if (f.turn) {
        x.globalAlpha = 0.82; x.fillStyle = '#0b1020'; x.fillRect(0, cy - 46, W, f.sub ? 96 : 76); x.globalAlpha = 1;
        x.fillStyle = f.color; x.fillRect(0, cy - 46, W, 4); x.fillRect(0, cy + (f.sub ? 46 : 26), W, 4);
        x.textAlign = 'center'; x.font = '12px Silkscreen, monospace'; x.fillStyle = f.color; x.fillText('TURNOVER · ' + f.turn.toUpperCase() + ' BALL', W / 2, cy - 28);
      }
      x.textAlign = 'center'; x.font = '34px Silkscreen, monospace';
      x.lineWidth = 6; x.strokeStyle = '#0b1020'; x.strokeText(f.text, W / 2, cy + (f.turn ? 6 : 0));
      x.fillStyle = f.color; x.fillText(f.text, W / 2, cy + (f.turn ? 6 : 0));
      if (f.sub) { x.font = '13px Silkscreen, monospace'; x.lineWidth = 4; x.strokeText(f.sub, W / 2, cy + 32); x.fillStyle = '#efe9d6'; x.fillText(f.sub, W / 2, cy + 32); }
    }
  },
  enqueue(entry, teams) { this.queue.push({ entry, teams }); if (!this.busy) this.next(); },
  next() {
    const job = this.queue.shift();
    if (!job) { this.busy = false; document.body.classList.remove('fbusy'); return; }
    if (job.seen) { const a = job.seen.after; this.set({ poss: a.poss, ballOn: a.ballOn, down: a.down, toGo: a.toGo, teams: job.teams }); this.next(); return; }
    this.busy = true; document.body.classList.add('fbusy');   // (the call screen waits until the play has been shown)
    this.play(job.entry, job.teams, () => this.next());
  },
  play(entry, teams, done) {
    const b = entry.before, dir = b.poss === 'a' ? 1 : -1, los = b.poss === 'a' ? b.ballOn : 100 - b.ballOn;
    this.scene = { poss: b.poss, ballOn: b.ballOn, down: b.down, toGo: b.toGo, teams };
    const kind = entry.anim;
    let endX = los + dir * entry.travel;
    if (kind === 'fg') endX = dir === 1 ? 104 : -4;
    endX = Math.max(-9, Math.min(109, endX));
    const lift = kind === 'punt' ? 80 : kind === 'fg' ? 70 : (kind === 'pass' || kind === 'int' || kind === 'inc') ? 46 : 0;
    const dur = kind === 'punt' || kind === 'fg' ? 850 : (kind === 'pass' || kind === 'int' || kind === 'inc') ? 640 : 520;   // quick, so the game keeps moving
    const startX = los - dir * (kind === 'punt' || kind === 'fg' ? 7 : 3);
    const FL = {
      td: ['TOUCHDOWN', entry.ptsTeam], fg: ['FIELD GOAL', entry.ptsTeam], fgmiss: ['NO GOOD', null],
      int: ['INTERCEPTED', other(b.poss)], sack: ['SACK', other(b.poss)], fumble: ['FUMBLE', other(b.poss)],
      downs: ['TURNOVER ON DOWNS', other(b.poss)], safety: ['SAFETY', entry.ptsTeam]
    };
    if (entry.onside) FL.kickoff = entry.onside === 'kept' ? ['ONSIDE KICK RECOVERED', b.poss] : ['ONSIDE KICK FAILS', other(b.poss)];
    const fl = FL[entry.ev] || (entry.firstDown ? ['FIRST DOWN', b.poss] : null);
    const after = { poss: entry.after.poss, ballOn: entry.after.ballOn, down: entry.after.down, toGo: entry.after.toGo, teams };
    const turnover = entry.after.poss !== b.poss && /^(int|fumble|downs)$/.test(entry.ev);   // these get the turnover band and a longer look
    const t0 = performance.now(), hold = turnover ? 1500 : fl || entry.contested || entry.conf ? 650 : 110, settle = 220;
    let finished = false;
    const finish = () => { if (finished) return; finished = true; this.flash = null; this.fxFire = 0; this.anim = null; this.set(after); done(); };
    const camStart = this.cam;
    this.anim = { kind, startX, endX, entry, dir };
    const step = t => {
      if (finished) return;
      const el = t - t0;
      if (el < dur) {
        const p = el / dur, e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        this.ballX = startX + (endX - startX) * e;
        this.ballLift = lift ? Math.sin(Math.PI * e) * lift : 0;
        this.cam = this.clampCam(los + (endX - los) * e * 0.8);
      } else if (el < dur + hold) {
        this.ballX = endX; this.ballLift = 0;
        if (fl && !this.flash) {
          this.flash = { text: fl[0], color: fl[1] ? TEAM_COL[fl[1]] : '#efe9d6' };
          if (turnover) { this.flash.turn = (teams[entry.after.poss] || {}).name || ''; this.flash.sub = turnoverLine(entry); }
          this.celebrate(fl[0], this.flash.color);
        }
        if (entry.contested && !this.flash) { this.flash = { text: 'CONTESTED CATCH', color: '#ffcf3f', sub: 'OVER ' + (entry.contested >= 3 ? 'THREE' : 'TWO') + ' DEFENDERS' + (entry.conf ? ' · +' + (entry.contested >= 3 ? E.CONF_BOOST + 2 : E.CONF_BOOST) + ' CONFIDENCE' : '') }; this.celebrate('CONTESTED', '#ffcf3f'); }
        else if (entry.conf && this.flash && !this.flash.sub) this.flash.sub = entry.conf.toUpperCase() + ' IS FEELING IT';
        if (entry.fire && !this.fxFire) { this.fxFire = 1; if (!fl) this.flash = { text: 'ON FIRE', color: '#ff7a1a' }; this.celebrate('ON FIRE', '#ff7a1a'); }
      } else if (el < dur + hold + settle) {
        if (this.scene !== after) { this.scene = after; this.ballX = null; this.flash = null; this.cam0 = this.cam; }
        const p = (el - dur - hold) / settle, target = this.clampCam(this.losX(after));
        this.cam = this.cam0 + (target - this.cam0) * p;
      } else { finish(); return; }
      this.draw();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(finish, dur + hold + settle + 1800);
  }
};


// who made the turnover, from the play's own line ("Josh Allen is picked off by Jaylen Watson." -> "PICKED OFF BY JAYLEN WATSON")
function turnoverLine(e) {
  const t = String(e.text || ''), m = t.match(/picked off by ([^.,]+)/i) || t.match(/forced out by ([^.,]+)/i) || t.match(/strip[- ]sack(?:ed)? by ([^.,]+)/i);
  if (e.ev === 'int') return m ? 'PICKED OFF BY ' + m[1].toUpperCase() : 'PICKED OFF';
  if (e.ev === 'fumble') return m ? 'FORCED BY ' + m[1].toUpperCase() : 'BALL IS LOOSE';
  return e.ev === 'downs' ? 'STOPPED SHORT ON 4TH DOWN' : '';
}

/* ---------- header ---------- */
function renderHeader() {
  const el = $('#hdr-right'); if (!el) return;
  if (S.mode === 'lobby') { if (window.HUB) window.HUB.renderHeader(); else el.innerHTML = ''; return; }
  const label = S.ctx ? S.ctx.label : S.mode === 'local' ? 'Practice' : S.mode === 'sdraft' ? ((S.sd && S.sd.label) || 'Draft') : 'Room ' + S.code;
  el.innerHTML = '<span class="chip room">' + esc(label) + '</span><button class="btn small" data-act="leave">Leave</button>';
}


/* ---------- lobby ---------- */
function screenName() {
  if (S.mode === 'lobby') return 'lobby';
  if (S.mode === 'sdraft') return 'draft';
  if (S.ctx) return bothReady() ? 'game' : 'wait';
  if (S.sd && !DR.isDone(S.sd.d)) return 'draft';
  if (S.mode === 'local' && S.me && !validSeat(S.seats[S.me])) return 'draft';
  if (!bothReady()) return 'wait';
  return 'game';
}
function buildLobby() {
  const seedN = Date.now() % 997;
  const picks = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const p = E.PLAYERS[(seedN * 7 + i * 23) % E.PLAYERS.length];
    return keyFor(p, p.tm);
  });
  $('#main').innerHTML =
    '<section class="lobby">' +
    '<div class="hero"><div class="lineup" aria-hidden="true">' + picks.map(k => spCanvas(k, 5)).join('') + '</div>' +
    '<p class="lede">Draft a real NFL offense and defense. Call the plays. Beat your friends.</p></div>' +
    '<div class="panel join-panel">' +
    '<label class="fld" for="team">Team name</label>' +
    '<input id="team" type="text" maxlength="18" autocomplete="off" placeholder="Your team name" value="' + esc(S.myName) + '">' +
    '<label class="fld" for="cap">Salary cap</label>' +
    '<select id="cap">' + CAP_OPTS.map(o => '<option value="' + o[0] + '"' + (o[0] === lsGet('gd_cap') ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
    '<div class="row"><button class="btn primary" data-act="create" id="b-create" disabled>Create room</button></div>' +
    '<div class="row joinrow"><input id="code" type="text" maxlength="5" autocomplete="off" spellcheck="false" placeholder="ROOM CODE" aria-label="Room code"><button class="btn" data-act="join" id="b-join" disabled>Join room</button></div>' +
    '<div class="or"><span>or</span></div>' +
    '<button class="btn" data-act="cpu" id="b-cpu">Practice vs CPU</button>' +
    '<p class="hint" id="access"></p></div>' +
    '<div class="panel how"><h2>How a game works</h2><ol>' +
    '<li><b>Snake draft 11 slots.</b> Quarterback, running back, two receivers, tight end, an entire offensive line, an entire defense, a kicker, a punt returner, a kick returner, and the rest of special teams (punter, long snapper, coverage). You and your opponent take turns from one shared pool (1-2-2-1…), and every player can only be on one team.</li>' +
    '<li><b>Optional salary cap.</b> Every player and unit has a salary based on rating and position. QBs and pass rushers cost the most, running backs and safeties the least. Stay under the cap or the pick is blocked.</li>' +
    '<li><b>Call plays.</b> Offense and defense pick in secret at the same time. Pro-game ratings decide who wins the matchup.</li>' +
    '<li><b>Beat the clock.</b> Each quarter is 2:00 and the clock follows NFL rules (it stops on incompletions, out of bounds, scores and turnovers), with one change: no delay of game, just a cap of 5 seconds on the clock that can run between plays. Each team has 3 timeouts a half, plus spikes and kneel-downs.</li>' +
    '<li><b>Real play calls.</b> Pick a section (Inside Run, Quick Pass, Deep Shot, Cover 2, Blitz ...) then a play: Mesh beats man, Flood beats zone, a Draw punishes the blitz. Arrow keys switch sections, number keys pick the play.</li>' +
    '<li><b>Or play it yourself.</b> Switch on <i>Control your players</i> when you call a play. You run the quarterback (then whoever has the ball) or a defender on the field, and everyone else moves on their own. Switch it off any time to only call plays.</li></ol>' +
    '<p class="hint">Ratings are Madden NFL 27 overalls for current starters. Unofficial fan project, no logos.</p></div>' +
    '</section>';
  paintCanvases($('#main'));
  updateLobbyHints();
}
function updateLobbyHints() {
  const create = $('#b-create'), join = $('#b-join'), hint = $('#access');
  if (!create) return;
  create.disabled = !S.api; join.disabled = !S.api;
  hint.textContent = !S.ready ? 'Connecting…' : S.api ? 'Create a room and send the code to a friend.' : 'Online rooms are unavailable right now. Practice vs CPU still works.';
}
const CAP_OPTS = [['0', 'No cap'], ['tight', 'Tight · $330M'], ['standard', 'Standard · $360M'], ['loose', 'Loose · $400M']];
function readCap() {
  const el = $('#cap'), v = el ? el.value : (lsGet('gd_cap') || '0');
  lsSet('gd_cap', v); return DR.CAPS[v] || 0;
}
function readName() {
  const v = ($('#team') && $('#team').value || '').trim().slice(0, 18);
  S.myName = v || S.myName || 'Team'; lsSet('gd_name', S.myName);
  return S.myName;
}

/* ---------- server api (Vercel function + Redis) ---------- */
async function api(body, ep) {
  const h = { 'content-type': 'application/json' };
  const tk = window.HUB && window.HUB.token; if (tk) h['x-token'] = tk;
  const r = await fetch('/api/' + (ep || 'room'), { method: 'POST', headers: h, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const err = new Error((j && j.error) || 'http ' + r.status); err.code = (j && j.error) || 'http'; err.status = r.status; throw err; }
  return j;
}

/* ---------- starting modes ---------- */
function resetForMode() {
  stopPoll();
  S.seats = {}; S.moves = {}; S.mine = {}; S.shown = null; S.callSig = null; S.G = null; S.cpuFor = -1;
  S.cpuSides = []; S.ctx = null; sdStop(); S.screen = null; Field.queue = []; Field.busy = false; document.body.classList.remove('fbusy'); Field.scene = null;
  S.ctlN = {}; S.toN = {}; S.toSel = null; S.lv = {}; S.rv = {}; S.rvSeen = {}; S.lvSeen = {}; S.lvPart = {}; S.lvLoaded = true; LV.stop();
}
function startLocal() {
  readName();
  resetForMode();
  S.mode = 'local'; S.code = null; S.me = 'a'; S.cpuSides = ['b']; S.seed = Math.floor(Math.random() * 2147483647);
  const cap = readCap(), first = Math.random() < 0.5 ? 0 : 1;
  sdStart({ label: 'Practice', d: DR.newDraft(2, cap, first), me: 0, names: [S.myName, 'CPU Squad'], cpu: [false, true], localCpu: true });
  render(); sdStep();
}
function setBusy(b) {
  ['b-create', 'b-join', 'b-cpu'].forEach(id => { const el = $('#' + id); if (el) el.disabled = b || (id !== 'b-cpu' && !S.api); });
}
async function createRoom() {
  if (S.busy) return;
  const name = readName(); S.busy = true; setBusy(true);
  try {
    const r = await api({ op: 'create', pid: PID, name, cap: readCap() });
    enterRoom(r.code, r.seed, 'a');
  } catch (e) { handleErr(e); }
  finally { S.busy = false; setBusy(false); }
}
async function joinRoom(code, quiet) {
  if (S.busy) return;
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) { if (!quiet) toast('Room codes have 5 characters.'); return; }
  const name = quiet ? (S.myName || 'Team') : readName();
  S.busy = true; setBusy(true);
  try {
    const r = await api({ op: 'join', code, pid: PID, name });
    if (!r.seat) toast('That room is full. You are watching.');
    enterRoom(code, r.seed, r.seat);
  } catch (e) {
    if (e.code === 'no_room') { if (!quiet) toast('No room with that code.'); ssSet('gd_room', null); }
    else if (!quiet) handleErr(e);
  }
  finally { S.busy = false; setBusy(false); }
}
function enterRoom(code, seed, seat) {
  resetForMode();
  S.mode = 'online'; S.code = code; S.seed = seed; S.me = seat; S.lvLoaded = false;
  ssSet('gd_room', code);
  startPoll();
  render();
}
let lastPoll = '';
function startPoll() {
  stopPoll(); lastPoll = '';
  const tick = async () => {
    if (S.mode !== 'online') return;
    if (!LV.on) try {
      const r = await api({ op: 'state', code: S.code, lvall: S.lvLoaded && !(S.G && S.G.wait && !S.me) ? 0 : 1 });
      const sig = JSON.stringify(r);
      if (!LV.on && sig !== lastPoll) {
        lastPoll = sig;
        S.seats = r.seats || {};
        const o = {};
        ['a', 'b'].forEach(s => { const m = (r.moves && r.moves[s]) || {}; for (const n in m) o[n + '-' + s] = moveOf(m[n]); });
        S.moves = o; if (r.lv) takeLv(r.lv); S.lvLoaded = true; sdOnline(r); render();
      }
    } catch (e) { /* transient: keep polling */ }
    if (S.mode === 'online') S.poll = setTimeout(tick, S.screen === 'game' ? 700 : 1200);
  };
  tick();
}
// finished live snaps fetched from the room (coming back to a game, or watching one)
function takeLv(lv) {
  const mv = allMoves();
  for (const n in lv) {
    const r = lv[n];
    if (+n >= RVN) {   // a kick or punt return played by the receiving player (move numbers 1000 + the number of the kick)
      const rn = n - RVN; if (S.rv[rn]) continue;
      let got = false;
      ['a', 'b'].forEach(s => { const m = mv[n + '-' + s]; if (m && m.ctl && r[s] && r[s].fin) { S.rv[rn] = { s, ev: r[s].ev || [] }; got = true; } });
      if (!got) S.lvPart[n] = r;
      continue;
    }
    if (S.lv[n]) continue;
    const ca = mv[n + '-a'] && mv[n + '-a'].ctl, cb = mv[n + '-b'] && mv[n + '-b'].ctl;
    if ((!ca || (r.a && r.a.fin)) && (!cb || (r.b && r.b.fin))) S.lv[n] = { a: (r.a && r.a.ev) || [], b: (r.b && r.b.ev) || [] };
    else S.lvPart[n] = r;
  }
}
const RVN = 1000;   // return moves are numbered 1000 + the play they belong to
function stopPoll() { if (S.poll) { clearTimeout(S.poll); S.poll = null; } }
function leave() {
  stopPoll(); ssSet('gd_room', null);
  S.mode = 'lobby'; S.code = null; S.me = null; resetForMode();
  render();
}

/* ---------- snake draft ---------- */
const money = x => '$' + (Math.round(x * 10) / 10) + 'M';
const KLAB = { QB: 'QB', HB: 'HB', WR: 'WR', TE: 'TE', OL: 'O-Line', DEF: 'Defense', K: 'Kicker', ST: 'Spec Teams' };
const SLOT_ORDER = ['QB', 'HB', 'WR', 'WR', 'TE', 'OL', 'DEF', 'K', 'ST'];
// the returner: one of the drafted back, receivers or the defense's starting corners (E.RET_FROM), the best by default
function sdReturners(ids) {
  const g = k => ids.filter(i => DR.BY[i].k === k).map(i => DR.BY[i].n), wr = g('WR');
  if (!g('HB').length || wr.length < 2 || !g('DEF').length) return null;
  const r = []; r[1] = g('HB')[0]; r[2] = wr[0]; r[3] = wr[1]; r[6] = g('DEF')[0];
  const c = E.returnerCands(r); return { c, best: E.bestReturner(r) };
}
// o: {label, d, me, names[], cpu[] (local CPU teams), localCpu, post(cid)->draft, poll()->draft, onDone(roster, draft)}
function sdStart(o) {
  sdStop();
  S.sd = Object.assign({ tab: null, q: '', auto: false, cpu: [], names: [], me: 0, busy: false, timer: 0, pollT: 0, built: false }, o);
  sdFixTab(); S.screen = null;
}
function sdStop() {
  const sd = S.sd; if (!sd) return;
  if (sd.timer) clearTimeout(sd.timer); if (sd.pollT) clearTimeout(sd.pollT);
  sd.timer = 0; sd.pollT = 0; S.sd = null;
}
function sdFixTab() {
  const sd = S.sd; if (!sd) return;
  const left = DR.openKinds(DR.teamIds(sd.d, sd.me));
  if (!sd.tab || left[sd.tab] <= 0) sd.tab = DR.KINDS.find(k => left[k] > 0) || sd.tab || 'QB';
}
function sdSet(nd) {
  const sd = S.sd; if (!sd || !nd || nd.picks.length < sd.d.picks.length) return false;
  const ch = nd.picks.length !== sd.d.picks.length; sd.d = nd; return ch;
}
function sdSub(c) {
  const D = E.DATA, last = n => String(n).split(' ').slice(-1)[0];
  if (c.k === 'OL') return D.OLU[c.n].players.map(p => last(p[0]) + ' ' + p[1]).join(' · ');
  if (c.k === 'ST') return D.STU[c.n].players.map(p => last(p[1]) + ' ' + p[2]).slice(0, 3).join(' · ') + ' …';
  if (c.k === 'DEF') return D.DFU[c.n].players.slice().sort((x, y) => y[3] - x[3]).slice(0, 4).map(p => last(p[2]) + ' ' + p[3]).join(' · ');
  return '';
}
function sdShell() {
  $('#main').innerHTML = '<section class="sd"><div class="sd-head panel" id="sd-head"></div><div class="sd-body"><div class="sd-main panel">' +
    '<div class="sd-tabs" id="sd-tabs"></div><input id="sd-q" class="sd-q" type="search" autocomplete="off" placeholder="Search players or teams" aria-label="Search"><div class="sd-list" id="sd-list"></div></div>' +
    '<aside class="sd-side"><div class="panel" id="sd-lineup"></div><div class="panel" id="sd-log"></div></aside></div></section>';
  $('#sd-q').value = S.sd.q;
  S.sd.built = true;
}
function sdSlots(ids) {
  const used = {}, out = [];
  SLOT_ORDER.forEach(k => {
    const id = ids.find(i => DR.BY[i].k === k && !used[i]);
    if (id) used[id] = 1; out.push({ k, c: id ? DR.BY[id] : null });
  });
  return out;
}
function sdUpdate() {
  const sd = S.sd; if (!sd) return;
  if (!sd.built || !$('#sd-head')) sdShell();
  sdFixTab();
  const d = sd.d, done = DR.isDone(d), clock = done ? null : DR.onClock(d), mine = DR.teamIds(d, sd.me), myTurn = clock === sd.me && !sd.watch;
  const nm = t => sd.names[t] || 'Team ' + (t + 1);
  const status = done ? 'Draft complete' : myTurn ? 'You are on the clock' : 'Waiting for ' + nm(clock);
  let cap = '<span class="chip">No salary cap</span>';
  if (d.cap) {
    const sp = DR.spent(mine), pct = Math.min(100, sp / d.cap * 100);
    cap = '<div class="capbar"><div class="capnums"><span>Salary cap ' + money(d.cap) + '</span><b>' + money(d.cap - sp) + ' left</b></div><div class="capfill"><i style="width:' + pct + '%"></i></div></div>';
  }
  $('#sd-head').innerHTML = '<div class="sd-top"><div><span class="eyebrow">' + esc(sd.label || 'Snake draft') + ' · Pick ' + Math.min(d.picks.length + 1, d.order.length) + ' of ' + d.order.length + '</span><h2 class="' + (myTurn ? 'turn' : '') + '">' + esc(status) + '</h2></div>' +
    '<div class="sd-btns"><button class="btn small" data-act="sd-best"' + (myTurn && !sd.busy ? '' : ' disabled') + '>Pick for me</button><button class="btn small ' + (sd.auto ? 'primary' : 'ghost') + '" data-act="sd-auto">Auto-draft: ' + (sd.auto ? 'on' : 'off') + '</button></div></div>' + cap;
  const left = DR.openKinds(mine);
  $('#sd-tabs').innerHTML = DR.KINDS.map(k => '<button class="sd-tab' + (sd.tab === k ? ' on' : '') + (left[k] <= 0 ? ' full' : '') + '" data-act="sd-tab" data-k="' + k + '">' + KLAB[k] + '<i>' + (left[k] > 0 ? left[k] + ' to go' : '✓') + '</i></button>').join('');
  sdList();
  const slots = sdSlots(mine);
  $('#sd-lineup').innerHTML = '<h3>' + esc(nm(sd.me)) + (d.cap ? ' · ' + money(DR.spent(mine)) : '') + '</h3><ul class="sd-lu">' + slots.map(x => x.c ?
    '<li><span class="k">' + x.k + '</span><b>' + esc(x.c.name) + '</b><i>' + x.c.ovr + '</i><span class="m">' + money(x.c.sal) + '</span></li>' :
    '<li class="empty"><span class="k">' + x.k + '</span><b>—</b></li>').join('') + '</ul>';
  const rets = sdReturners(mine);
  if (rets) {   // who returns kicks and punts: the best by default, the person can change it
    if (sd.ret == null || !rets.c[sd.ret]) sd.ret = rets.best;
    $('#sd-lineup').innerHTML += '<label class="fld" for="sd-ret">Returner</label><select id="sd-ret" data-act="sd-ret">' + rets.c.map((x, i) => x ? '<option value="' + i + '"' + (i === sd.ret ? ' selected' : '') + '>' + esc(E.RET_FROM[i].replace(/\d$/, '') + ' ' + x.n) + ' · ' + x.rt + (i === rets.best ? ' (best)' : '') + '</option>' : '').join('') + '</select>';
  }
  const recent = d.picks.slice(-10).reverse();
  let others = '';
  if (d.n === 2) {
    const t = 1 - sd.me, os = sdSlots(DR.teamIds(d, t));
    others = '<h3>' + esc(nm(t)) + (d.cap ? ' · ' + money(DR.spent(DR.teamIds(d, t))) : '') + '</h3><ul class="sd-lu small">' + os.map(x => x.c ? '<li><span class="k">' + x.k + '</span><b>' + esc(x.c.name) + '</b><i>' + x.c.ovr + '</i></li>' : '<li class="empty"><span class="k">' + x.k + '</span><b>—</b></li>').join('') + '</ul>';
  } else {
    others = '<h3>Recent picks</h3><ol class="sd-recent">' + (recent.map(p => '<li><span>#' + p.n + '</span><b>' + esc(DR.BY[p.id].name) + '</b><i>' + esc(nm(p.t)) + '</i></li>').join('') || '<li><i>None yet</i></li>') + '</ol>';
  }
  $('#sd-log').innerHTML = others;
}
function sdList() {
  const sd = S.sd, d = sd.d, done = DR.isDone(d), myTurn = !done && DR.onClock(d) === sd.me;
  const tk = DR.taken(d), q = sd.q.trim().toLowerCase(), left = DR.openKinds(DR.teamIds(d, sd.me));
  let rows = DR.CANDS.filter(c => c.k === sd.tab && !tk[c.id] && (!q || (c.name + ' ' + c.tm).toLowerCase().includes(q))).sort((a, b) => b.ovr - a.ovr || a.sal - b.sal);
  const total = rows.length; rows = rows.slice(0, 70);
  const cap = !!d.cap;
  let h = rows.map(c => {
    let why = '';
    if (left[c.k] <= 0) why = 'Filled'; else if (myTurn) { const e = DR.legal(d, sd.me, c.id); if (e) why = cap && /cap/.test(e) ? 'Over cap' : 'No'; }
    const g = E.grade(c.ovr);
    return '<div class="sd-row g-' + g + (why ? ' no' : '') + '"><b class="sd-ovr">' + c.ovr + '</b><div class="sd-nm"><b>' + esc(c.name) + '</b><span>' + esc(c.tm || '') + (sdSub(c) ? ' · ' + esc(sdSub(c)) : '') + '</span></div>' +
      '<span class="sd-sal">' + money(c.sal) + '</span><button class="btn small primary" data-act="sd-pick" data-id="' + c.id + '"' + (myTurn && !why && !sd.busy ? '' : ' disabled') + '>' + (why || 'Draft') + '</button></div>';
  }).join('');
  if (!rows.length) h = '<p class="hint">Nobody matches.</p>';
  else if (total > rows.length) h += '<p class="hint">Showing the top ' + rows.length + ' of ' + total + '. Search to find more.</p>';
  const el = $('#sd-list'); if (el) el.innerHTML = h;
}
async function sdPick(cid) {
  const sd = S.sd; if (!sd || sd.busy) return;
  const err = DR.legal(sd.d, sd.me, cid); if (err) { toast(err); return; }
  sd.busy = true; sdUpdate();
  try {
    if (sd.post) sdSet(await sd.post(cid)); else DR.apply(sd.d, sd.me, cid);
  } catch (e) { toast(e.code === 'illegal' || e.code === 'taken' ? 'That pick is not available. The board has been refreshed.' : e.code === 'turn' ? 'It is not your turn yet.' : 'Could not draft that player. Try again.'); if (sd.poll) { try { sdSet(await sd.poll()); } catch (e2) {} } }
  if (S.sd !== sd) return;
  sd.busy = false; sdAfter();
}
function sdBest() { const sd = S.sd; if (!sd || DR.isDone(sd.d) || DR.onClock(sd.d) !== sd.me) return; sdPick(DR.bestPick(sd.d, sd.me)); }   // plans the best lineup under the cap
function sdAfter() {
  const sd = S.sd; if (!sd) return;
  if (DR.isDone(sd.d)) { sdFinish(); return; }
  if (S.screen === 'draft') sdUpdate(); else render();
  sdStep();
}
function sdStep() {
  const sd = S.sd; if (!sd || DR.isDone(sd.d) || sd.timer) return;
  const t = DR.onClock(sd.d);
  if (sd.localCpu && sd.cpu[t]) {
    sd.timer = setTimeout(() => { sd.timer = 0; if (S.sd !== sd || DR.isDone(sd.d) || DR.onClock(sd.d) !== t) return; DR.apply(sd.d, t, DR.cpuPick(sd.d, t)); sdAfter(); }, 650);
  } else if (sd.auto && t === sd.me && !sd.busy) {
    sd.timer = setTimeout(() => { sd.timer = 0; if (S.sd === sd && DR.onClock(sd.d) === sd.me) sdPick(DR.bestPick(sd.d, sd.me)); }, 450);
  }
}
function sdPollLoop() {
  const sd = S.sd; if (!sd || !sd.poll) return;
  sd.pollT = setTimeout(async () => {
    sd.pollT = 0; if (S.sd !== sd) return;
    try { if (!sd.busy) { const ch = sdSet(await sd.poll()); if (ch) { sdAfter(); if (S.sd !== sd) return; } } } catch (e) {}
    if (S.sd === sd) sdPollLoop();
  }, 1500);
}
function sdFinish() {
  const sd = S.sd; if (!sd) return;
  if (sd.timer) { clearTimeout(sd.timer); sd.timer = 0; }
  if (sd.pollT) { clearTimeout(sd.pollT); sd.pollT = 0; }
  if (S.mode === 'local' && sd.localCpu) {
    ['a', 'b'].forEach((seat, t) => { S.seats[seat] = { pid: t === sd.me ? PID : 'cpu', name: sd.names[t], status: 'ready', roster: DR.toRoster(DR.teamIds(sd.d, t), t === sd.me ? sd.ret : null) }; });
    S.sd = null; S.screen = null; render(); return;
  }
  if (S.mode === 'sdraft') {
    const cb = sd.onDone, roster = DR.toRoster(DR.teamIds(sd.d, sd.me), sd.ret), d = sd.d;
    if (cb) cb(roster, d); else sdUpdate();
    return;
  }
  sdUpdate(); render();
}
function sdOnline(r) {   // a poll result from the quick room
  if (!r.dr) { if (S.sd) sdStop(); return; }
  const me = S.me === 'a' ? 0 : S.me === 'b' ? 1 : -1;
  const names = [(r.seats.a || {}).name || 'Team A', (r.seats.b || {}).name || 'Team B'];
  if (!S.sd) { sdStart({ label: 'Room ' + S.code, d: r.dr, me: Math.max(0, me), names, watch: me < 0, post: cid => api({ op: 'pick', code: S.code, seat: S.me, pid: PID, id: cid }).then(x => x.dr) }); sdStep(); }
  else { S.sd.names = names; if (sdSet(r.dr)) { if (DR.isDone(S.sd.d)) sdFinish(); else sdStep(); } }
}

/* ---------- roster list + modals ---------- */
function squadListHTML(team) {
  const q = team.squad, side = team === (S.G && S.G.teams.b) ? 'b' : 'a';
  const sk = p => fieldKey(p.sk + ':' + p.hr + ':000000:000000', side);
  const row = (pos, key, name, ovr, tag) => '<li><span class="r-pos">' + pos + '</span>' + spCanvas(key, 2) + '<span class="r-name">' + esc(name) + '</span><span class="r-type">' + esc(tag || '') + '</span><span class="r-fit">' + ovr + '</span><span class="grade g-' + E.grade(ovr) + '">' + E.grade(ovr) + '</span></li>';
  let h = '';
  [['QB', q.qb], ['HB', q.hb], ['WR', q.wr[0]], ['WR', q.wr[1]], ['TE', q.te]].forEach(r => { h += row(r[0], sk(r[1]), r[1].n, r[1].o, r[1].tm); });
  if (q.rot) {   // the rotation and how fresh each one is right now (fatigue: tired players come out more and play a little worse)
    const st = S.G && S.G.state, en = p => Math.round(100 * E.energy(st || {}, p.i));
    ['HB', 'WR', 'TE'].forEach(pos => (q.rot[pos] || []).forEach(p => { h += '<li class="rotl"><span class="r-pos">' + pos + '</span><span class="r-name">' + esc(p.n) + '</span><span class="r-type">use ' + p.u + '% · energy ' + en(p) + '%</span><span class="r-fit">' + p.o + '</span></li>'; }));
  }
  const gk = n => fieldKey(genericKey({ abbr: q.ol.tm, c1: '#222222', c2: '#222222' }, 'OL', n), side);
  q.ol.p.forEach((p, n) => { h += row('OL', gk(n), p[0], p[1], ''); });
  q.df.p.forEach((p, n) => { h += row(p[0], fieldKey(genericKey({ abbr: q.df.tm, c1: '#222222', c2: '#222222' }, 'DEF', n), side), p[2], p[3], ''); });
  if (q.k) {
    [['K', q.k], ['RET', q.kr]].forEach(r => { h += row(r[0], sk(r[1]), r[1].n, r[1].o, r[1].tm); });   // one returner for kicks and punts
    const stN = q.st.p.slice().sort((x, y) => y[2] - x[2]).slice(0, 2).map(p => p[1]).join(', ');
    h += row('ST', fieldKey(genericKey({ abbr: q.st.tm, c1: '#222222', c2: '#222222' }, 'DEF', 9), side), (q.st.tm || '') + ' special teams', E.teamUnits({ squad: q }).stOvr, stN);
  }
  return '<ul class="roster">' + h + '</ul>';
}
function rosterListHTML(team) {
  if (!team.roster) return squadListHTML(team);
  let rows = '';
  const ros = E.normRoster(team.roster), rc = E.returnerCands(ros)[ros[9]];
  E.SLOTS.forEach((s, i) => {
    const e = E.entity(i, ros[i]), g = E.grade(e.ovr);
    const nm = s.kind === 'OL' ? E.unitName(e, 'OL') : s.kind === 'DEF' ? E.unitName(e, 'DEF') : s.kind === 'ST' ? e.tm.nick + ' Special Teams' : e.name;
    rows += '<li><span class="r-pos">' + s.short + '</span>' + spCanvas(slotKey(i, ros[i]), 2) + '<span class="r-name">' + esc(nm) + '</span><span class="r-type" style="--tc:' + brite(e.tm) + '">' + esc(e.tm.nick) + '</span><span class="r-fit">' + e.ovr + '</span><span class="grade g-' + g + '">' + g + '</span></li>';
  });
  if (rc) rows += '<li><span class="r-pos">RET</span><span class="r-name">' + esc(rc.n) + '</span><span class="r-type">returns kicks and punts</span><span class="r-fit">' + rc.rt + '</span></li>';
  return '<ul class="roster">' + rows + '</ul>';
}
function handleErr(e) {
  const code = e && e.code;
  if (code === 'full') toast('That room is full.');
  else if (code === 'bad_request') toast('The server rejected that request. Reload and try again.');
  else toast('Connection problem. Check your network and try again.');
}

function openModal(html) {
  const m = $('#modal'); if (!m) return;
  m.innerHTML = '<div class="m-back" data-act="close-modal"></div><div class="m-card" role="dialog" aria-modal="true">' + html + '<div class="row"><button class="btn" data-act="close-modal">Close</button></div></div>';
  m.hidden = false; paintCanvases(m);
}
function closeModal() { const m = $('#modal'); if (m) { m.hidden = true; m.innerHTML = ''; } }
function showRosters() {
  const G = S.G; if (!G) return;
  const col = t => '<div class="rcol ' + t + '"><h3>' + esc(G.teams[t].name) + '</h3><div class="ratings small"><div><span class="eyebrow">OFF</span><b>' + G.U[t].offR + '</b></div><div><span class="eyebrow">DEF</span><b>' + G.U[t].defR + '</b></div></div>' + rosterListHTML(G.teams[t]) + '</div>';
  openModal('<div class="rcols">' + col('a') + col('b') + '</div>');
}
function showMatchups() {
  const plays = Object.keys(E.OFF).filter(id => E.OFF[id].cat !== 'SPEC');
  const sym = v => v >= 0.35 ? ['good2', '++'] : v > 0.05 ? ['good1', '+'] : v <= -0.35 ? ['bad2', '−−'] : v < -0.05 ? ['bad1', '−'] : ['neu', '·'];
  let h = '<h3>Matchups</h3><p class="sub">How each defensive call fares against each offensive play. Green favors the defense, red favors the offense.</p><div class="tbl-wrap"><table class="mt mt-wide"><thead><tr><th></th>' +
    plays.map(p => '<th class="vt"><span>' + esc(E.OFF[p].label) + '</span></th>').join('') + '</tr></thead><tbody>';
  E.DEF_CATS.forEach(c => {
    Object.keys(E.DEF_CALLS).filter(d => E.DEF_CALLS[d].cat === c.id).forEach(d => {
      h += '<tr><th>' + esc(E.DEF_CALLS[d].label) + '</th>';
      plays.forEach(p => { const x = sym(E.matchup(d, p)); h += '<td class="' + x[0] + '">' + x[1] + '</td>'; });
      h += '</tr>';
    });
  });
  h += '</tbody></table></div><p class="hint">Mesh beats man, flood beats zone, screens beat the blitz, a stacked box stops the run but bites on play-action. Ratings decide the rest.</p>';
  openModal(h);
}

/* ---------- waiting room ---------- */
function drawWait() {
  const m = $('#main');
  const mk = seat => {
    const d = S.seats[seat];
    return '<li class="' + (validSeat(d) ? 'ok' : '') + '"><span class="dot" style="background:' + TEAM_COL[seat] + '"></span><b>' + esc(d ? d.name || 'Team' : 'Open seat') + '</b><span>' + (!d ? 'Waiting for a friend' : validSeat(d) ? 'Roster locked' : 'Joined') + '</span></li>';
  };
  m.innerHTML = '<section class="panel wait"><span class="eyebrow">Room code</span><div class="bigcode">' + esc(S.code) + '</div>' +
    (S.ctx ? '<p class="sub">Waiting for the game to load…</p>' : '<p class="sub">Send this code to your friend. They open this page and press Join room.</p><div class="row"><button class="btn" data-act="copy">Copy code</button></div>') +
    '<ul class="seats">' + mk('a') + mk('b') + '</ul>' +
    '<p class="hint">' + (S.me ? (validSeat(S.seats[S.me]) ? 'Your roster is locked. The game starts when both teams are ready.' : 'The snake draft begins as soon as your friend joins.') : 'You are watching this room.') + '</p></section>';
}

/* ---------- game screen ---------- */
// full screen: the browser's own full screen where it exists (not on iPhone), plus a layout that drops the header and gives the field all the room
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const fsLabel = () => document.body.classList.contains('fs') ? '✕ Exit full screen' : '⛶ Full screen';
function setFs(on) { document.body.classList.toggle('fs', on); const b = $('[data-act="fullscreen"]'); if (b) b.textContent = fsLabel(); }
function toggleFull() {
  const on = !document.body.classList.contains('fs'), d = document, el = d.documentElement;
  try {
    if (on) { const rq = el.requestFullscreen || el.webkitRequestFullscreen; if (rq) { const r = rq.call(el); if (r && r.catch) r.catch(() => {}); } }
    else if (isFull()) { const ex = d.exitFullscreen || d.webkitExitFullscreen; if (ex) ex.call(d); }
  } catch (e) { /* the layout still switches */ }
  setFs(on);
}
document.addEventListener('fullscreenchange', () => { if (!isFull()) setFs(false); });
document.addEventListener('webkitfullscreenchange', () => { if (!isFull()) setFs(false); });
function buildGame() {
  Field.init();
  $('#main').innerHTML =
    '<section class="game">' +
    '<div class="sb"><div class="sb-team a"><div class="sb-name" id="sb-an"></div><div class="sb-score" id="sb-as">0</div></div>' +
    '<div class="sb-mid"><div class="sb-q" id="sb-q"></div><div class="sb-dd" id="sb-dd"></div><div class="sb-ball" id="sb-ball"></div><div class="sb-to" id="sb-to"></div></div>' +
    '<div class="sb-team b"><div class="sb-name" id="sb-bn"></div><div class="sb-score" id="sb-bs">0</div></div></div>' +
    '<div class="fieldhost" id="fieldHost"></div>' +
    '<div class="deck"><div class="lvpanel panel" id="lvpanel"></div>' +
    '<div class="side"><div class="banner" id="banner"></div><ol class="log" id="log"></ol>' +
    '<div class="row"><button class="btn small" data-act="rosters">Rosters</button><button class="btn small" data-act="matchups">Matchups</button></div></div></div></section>';
  $('#fieldHost').appendChild(Field.cv);
  $('#fieldHost').insertAdjacentHTML('beforeend', '<div class="callpanel playcall" id="callpanel"></div>');   // play calling happens on the field, Madden style
  $('#fieldHost').insertAdjacentHTML('beforeend', '<div class="fvbar"><button class="fsbtn" data-act="fullscreen" title="Full screen (F)" aria-label="Toggle full screen">' + fsLabel() + '</button></div>');
  S.shown = null; S.callSig = null;
}
function updateGame() {
  const G = derive();
  if (!G) { drawWait(); return; }
  S.G = G;
  const st = G.state, T = G.teams, ck = E.clockInfo(st);
  document.body.classList.toggle('gover', !!st.over);
  const set = (id, v) => { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; };
  set('#sb-an', T.a.name + (S.me === 'a' ? ' (you)' : '')); set('#sb-bn', T.b.name + (S.me === 'b' ? ' (you)' : ''));
  set('#sb-as', st.score.a); set('#sb-bs', st.score.b);
  const aEl = $('.sb-team.a'), bEl = $('.sb-team.b');
  if (aEl) aEl.classList.toggle('has', !st.over && st.poss === 'a');
  if (bEl) bEl.classList.toggle('has', !st.over && st.poss === 'b');
  set('#sb-q', st.over ? 'FINAL' : ck.q + ' · ' + ck.text + (ck.running ? ' ▶' : ''));
  set('#sb-to', st.over ? '' : 'Timeouts ' + st.to.a + ' · ' + st.to.b);
  set('#sb-dd', st.over ? '' : ddLabel(st));
  set('#sb-ball', st.over ? '' : 'Ball on ' + spotLabel(st, T));
  // log + animation
  const L = G.log;
  if (S.shown == null) {
    S.shown = L.length;
    Field.set({ poss: st.poss, ballOn: st.ballOn, down: st.down, toGo: st.toGo, teams: T });
  } else {
    while (S.shown < L.length) {
      const e = L[S.shown];
      if ((e.live && S.lvSeen[e.n]) || (e.rvLive && S.rvSeen[e.n])) { Field.queue.push({ seen: e, teams: T }); }   // already watched on the field
      else Field.enqueue(e, T);
      S.shown++;
    }
    if (!Field.busy) Field.next();
    if (!Field.busy && !Field.queue.length && L.length === 0) Field.set({ poss: st.poss, ballOn: st.ballOn, down: st.down, toGo: st.toGo, teams: T });
  }
  renderBanner(G); renderLog(G);
  if (G.wait && !LV.on) LV.consider(G);
  if (LV.on) LV.panel(false); else renderCall(G);
  if (S.ctx && st.over) ctxFinish(G);
}
const offLabel = id => (E.OFF[id] || E.KICKS[id] || { label: id }).label;
function renderBanner(G) {
  const el = $('#banner'); if (!el) return;
  const e = G.log[G.log.length - 1], T = G.teams;
  if (!e) { el.innerHTML = '<div class="bn-meta">Kickoff</div><div class="bn-text">' + esc(T[G.state.poss].name) + ' take the opening possession.</div>'; el.style.setProperty('--bc', TEAM_COL[G.state.poss]); return; }
  const o = offLabel(e.offPick), d = e.defPick ? E.DEF_CALLS[e.defPick].label : null;
  el.style.setProperty('--bc', TEAM_COL[e.ptsTeam || e.off]);
  el.innerHTML = '<div class="bn-meta">Last play · ' + esc(o) + (d ? ' vs ' + esc(d) : '') + '</div><div class="bn-text">' + esc(e.text) + '</div>';
}
function renderLog(G) {
  const el = $('#log'); if (!el) return;
  const T = G.teams, rows = [];
  for (let i = G.log.length - 1; i >= 0 && rows.length < 14; i--) {
    const e = G.log[i], c = Math.max(0, e.clk), q = e.q + ' ' + Math.floor(c / 60) + ':' + ('0' + (c % 60)).slice(-2);
    const to = e.after && e.after.poss !== e.off && /^(int|fumble|downs)$/.test(e.ev);   // turnovers stand out in the log
    rows.push('<li class="ev-' + e.ev + (to ? ' to' : '') + '"' + (to ? ' style="--tc:' + TEAM_COL[e.after.poss] + '"' : '') + '><span class="lg-n" style="color:' + TEAM_COL[e.off] + '">' + q + '</span><span class="lg-t">' + (to ? '<b class="tochip">Turnover</b> ' : '') + esc(e.text) + '</span></li>');
  }
  const html = rows.join('');
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}
// the box score under the final: team totals, then the players who mattered for each side
function boxHTML(G) {
  const T = G.teams, B = E.boxScore(G.log, T), a = B.teams.a, b = B.teams.b;
  const rows = [
    ['Total yards', a.total, b.total],
    ['Passing', a.comp + '/' + a.att + ', ' + a.pass + ' yds', b.comp + '/' + b.att + ', ' + b.pass + ' yds'],
    ['Rushing', a.ratt + ' car, ' + a.rush + ' yds', b.ratt + ' car, ' + b.rush + ' yds'],
    ['First downs', a.first, b.first],
    ['Sacks', a.sacksBy, b.sacksBy],
    ['Giveaways', a.to, b.to],
    ['Pass breakups', a.pbu, b.pbu],
    ['Punts', a.punts ? a.punts + ' · avg ' + Math.round(a.puntYds / a.punts) : '0', b.punts ? b.punts + ' · avg ' + Math.round(b.puntYds / b.punts) : '0']
  ];
  const tbl = '<table class="box"><thead><tr><th style="color:' + TEAM_COL.a + '">' + esc(T.a.name) + '</th><th></th><th style="color:' + TEAM_COL.b + '">' + esc(T.b.name) + '</th></tr></thead><tbody>' +
    rows.map(r => '<tr><td>' + r[1] + '</td><th>' + r[0] + '</th><td>' + r[2] + '</td></tr>').join('') + '</tbody></table>';
  const line = (p, f) => '<li><b>' + esc(p.name) + '</b><span>' + f + '</span></li>';
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const side = k => {
    const L = B.lead[k];
    const items = [];
    L.passing.forEach(p => items.push(line(p, p.c + '/' + p.a + ', ' + p.pyd + ' yds' + (p.ptd ? ', ' + p.ptd + ' TD' : '') + (p.int ? ', ' + p.int + ' INT' : ''))));
    L.rushing.forEach(p => items.push(line(p, p.ratt + ' car' + ', ' + p.ryd + ' yds' + (p.rtd ? ', ' + p.rtd + ' TD' : ''))));
    L.receiving.forEach(p => items.push(line(p, p.rec + ' rec' + ', ' + p.recyd + ' yds' + (p.rectd ? ', ' + p.rectd + ' TD' : ''))));
    L.defense.forEach(p => items.push(line(p, [p.sk && plural(p.sk, 'sack'), p.dint && plural(p.dint, 'INT'), p.pbu && plural(p.pbu, 'PBU'), p.ff && p.ff + ' FF'].filter(Boolean).join(' · '))));
    L.kicking.forEach(p => items.push(line(p, 'FG ' + p.fgm + '/' + p.fga + (p.fgl ? ', long ' + p.fgl : ''))));
    return '<div class="boxside"><h4 style="color:' + TEAM_COL[k] + '">' + esc(T[k].name) + '</h4><ul>' + (items.join('') || '<li><span>No stats</span></li>') + '</ul></div>';
  };
  return '<div class="boxwrap">' + tbl + '<div class="boxsides">' + side('a') + side('b') + '</div></div>';
}
// the call panel sits on the field: it covers it while you pick a play (or for the final score) and shrinks to a strip otherwise
function renderCall(G) {
  renderCall0(G);
  const p = $('#callpanel'); if (p) p.classList.toggle('full', !!p.querySelector('.calls, .final'));
}
function renderCall0(G) {
  const p = $('#callpanel'); if (!p) return;
  const st = G.state, T = G.teams;
  if (st.over) {
    const sig = 'over' + (S.ctx ? S.ctx.status : ''); if (S.callSig === sig) return; S.callSig = sig;
    const w = st.winner;
    const head = w === null ? 'Tie game' : (S.me ? (w === S.me ? 'You win' : 'You lose') : T[w].name + ' win');
    const cx = S.ctx, cxRow = cx ? (cx.status === 'saving' ? '<p class="sub">Saving the result…</p>' : cx.status === 'err' ? '<p class="sub bad">Could not save the result' + (cx.err ? ': ' + esc(cx.err) : '') + '.</p><div class="row"><button class="btn primary" data-act="ctx-retry">Try again</button></div>' : '<div class="row"><button class="btn primary" data-act="ctx-done">Continue</button><button class="btn" data-act="rosters">Rosters</button></div>') : '';
    p.innerHTML = '<div class="final"><span class="eyebrow">Final</span><h2>' + esc(head) + '</h2><div class="fscore"><span style="color:' + TEAM_COL.a + '">' + esc(T.a.name) + ' <b>' + st.score.a + '</b></span><span style="color:' + TEAM_COL.b + '">' + esc(T.b.name) + ' <b>' + st.score.b + '</b></span></div>' +
      boxHTML(G) +
      (cx ? cxRow : '<div class="row"><button class="btn primary" data-act="leave">Back to menu</button><button class="btn" data-act="rosters">Rosters</button></div>') + '</div>';
    return;
  }
  if (!S.me) {
    if (S.callSig === 'spec') return; S.callSig = 'spec';
    p.innerHTML = '<p class="sub">You are watching this game.</p>'; return;
  }
  const n = st.playNo, role = S.me === st.poss ? 'off' : 'def';
  if (st.kick && role === 'def') {   // the other team is choosing its kick
    const sg = 'kw' + n; if (S.callSig === sg) return; S.callSig = sg;
    p.innerHTML = '<div class="cp-head"><span class="role def">Kickoff</span><span class="sit">' + esc(T[st.kick.k].name) + ' kick off</span></div><div class="locked"><span class="eyebrow">Get ready</span><b>You receive the kick</b><p class="sub">Waiting for ' + esc(T[st.kick.k].name) + ' to choose a deep kick or an onside kick…</p></div>'; return;
  }
  const locked = S.mine[n] != null ? S.mine[n] : null;
  const sig = n + '|' + role + '|' + (callCat(role, st) || '') + '|' + (locked || '') + '|' + (lastCallFor(G) || '') + '|' + st.down + '|' + st.ballOn + '|' + (S.ctlOn ? 1 : 0) + '|' + (S.ctlN[n] ? 1 : 0) + '|' + (st.kick ? 'k' : '') + '|' + (toSel(n) ? 1 : 0) + '|' + (S.toN[n] ? 1 : 0) + '|' + st.clock + '|' + st.ro;
  if (S.callSig === sig) return; S.callSig = sig;
  const sit = st.kick ? 'Kickoff' : ddLabel(st) + ' at ' + spotLabel(st, T);
  if (st.kick && !locked && !(st.q >= 4 && st.score[S.me] < st.score[other(S.me)])) {   // nothing to decide: kick it deep
    p.innerHTML = '<div class="cp-head"><span class="role off">You kick off</span><span class="sit">Kicking it deep</span></div>';
    setTimeout(() => { if (S.G === G && G.state.playNo === n && S.mine[n] == null) submitCall('KO'); }, 250); return;
  }
  if (st.kick && !locked) {
    p.innerHTML = '<div class="cp-head"><span class="role off">You kick off</span><span class="sit">' + esc(T[S.me].name) + ' kick to ' + esc(T[other(S.me)].name) + '</span></div>' +
      '<div class="calls">' + E.offOptions(st).map((o, i) => '<button class="call" data-act="call" data-id="' + o.id + '"><span class="key">' + (i + 1) + '</span><b>' + esc(o.label) + '</b><small>' + esc(o.desc) + '</small></button>').join('') + '</div>'; return;
  }
  if (locked) {
    const lbl = role === 'off' ? offLabel(locked) : E.DEF_CALLS[locked].label;
    p.innerHTML = '<div class="cp-head"><span class="role ' + role + '">' + (role === 'off' ? 'Offense' : 'Defense') + '</span><span class="sit">' + esc(sit) + '</span></div>' +
      '<div class="locked"><span class="eyebrow">Locked in</span><b>' + esc(lbl) + '</b>' + (S.ctlN[n] ? '<p class="sub ctlnote">You will run the players on the field.</p>' : '') + (S.toN[n] ? '<p class="sub ctlnote">Timeout called.</p>' : '') + '<p class="sub">Waiting for ' + esc(T[other(S.me)].name) + (S.mode === 'local' ? '…' : ' to call their play…') + '</p></div>';
    return;
  }
  const cats = callCats(role, st), cat = callCat(role, st), shown = callOpts(role, st).filter(o => o.cat === cat);
  let k = 0;
  p.innerHTML = '<div class="cp-head"><span class="role ' + role + '">' + (role === 'off' ? 'You have the ball' : 'You are on defense') + '</span><span class="sit">' + esc(sit) + '</span></div>' +
    coachRowHTML(G, role) + fireRowHTML(st, role) + ctlRowHTML(role) + toRowHTML(st) + (lastCallFor(G) ? '<div class="ctlrow"><button class="btn small primary" data-act="hurry">Hurry-up: ' + esc(role === 'off' ? offLabel(lastCallFor(G)) : E.DEF_CALLS[lastCallFor(G)].label) + ' again (R)</button><span class="hint">No huddle: run the same call again.</span></div>' : '') +
    '<div class="cats" role="tablist" aria-label="Play type">' + cats.map(c => '<button class="cat' + (c.id === cat ? ' on' : '') + '" role="tab" aria-selected="' + (c.id === cat) + '" data-act="cat" data-cat="' + c.id + '">' + esc(c.label) + '<i>' + c.n + '</i></button>').join('') + '</div>' +
    '<div class="calls">' + shown.map(o => { const key = o.disabled ? '' : ++k, rec = coachPicks(G, role).indexOf(o.id); return '<button class="call' + (rec >= 0 ? ' rec' : '') + '" data-act="call" data-id="' + o.id + '" title="' + esc(o.desc) + '"' + (o.disabled ? ' disabled' : '') + '><span class="key">' + key + '</span>' + (rec >= 0 ? '<i class="cbadge">' + (rec ? 'Coach' : '★ Coach') + '</i>' : '') + '<b>' + esc(o.label) + '</b><small>' + esc(o.desc) + '</small>' + (o.note ? '<em>' + esc(o.note) + '</em>' : '') + '</button>'; }).join('') + '</div>';
}
// play calls come in sections (Inside Run, Quick Pass, Cover 2/3/4 ...): one section is open at a time
function callOpts(role, st) {
  return role === 'off' ? E.offOptions(st).filter(o => st.down === 4 ? o.id !== 'SPIKE' && o.id !== 'KNEEL' : (o.id !== 'PUNT' && o.id !== 'FG' && o.id !== 'FAKEPUNT')) : E.defOptions();
}
function callCats(role, st) {
  const opts = callOpts(role, st);
  return (role === 'off' ? E.OFF_CATS : E.DEF_CATS).map(c => ({ id: c.id, label: c.label, n: opts.filter(o => o.cat === c.id).length })).filter(c => c.n);
}
function callCat(role, st) {
  const cats = callCats(role, st), has = id => cats.some(c => c.id === id), n = st.playNo;
  if (S.catSel && S.catSel.n === n && S.catSel.role === role && has(S.catSel.cat)) return S.catSel.cat;
  if (role === 'off' && st.down === 4 && has('SPEC')) return 'SPEC';
  const cp = S.G && coachFor(S.G, role), cc = cp && cp.id && (role === 'off' ? E.OFF[cp.id] && E.OFF[cp.id].cat : E.DEF_CALLS[cp.id] && E.DEF_CALLS[cp.id].cat);
  if (cc && has(cc)) return cc;   // open on the coach's pick
  const last = lsGet('gd_cat_' + role);
  if (last && last !== 'SPEC' && has(last)) return last;
  const dflt = role === 'off' ? 'PASS_M' : 'ZONE';
  return has(dflt) ? dflt : (cats[0] && cats[0].id);
}
function openCat(id) {
  const G = S.G; if (!G || !S.me) return;
  const st = G.state, role = S.me === st.poss ? 'off' : 'def';
  if (!callCats(role, st).some(c => c.id === id)) return;
  S.catSel = { n: st.playNo, role, cat: id }; S.callSig = null; renderCall(G);
}
function stepCat(d) {
  const G = S.G; if (!G || !S.me || S.mine[G.state.playNo] != null) return;
  const st = G.state, role = S.me === st.poss ? 'off' : 'def', cats = callCats(role, st), cur = callCat(role, st);
  const i = cats.findIndex(c => c.id === cur); if (i < 0) return;
  openCat(cats[(i + d + cats.length) % cats.length].id);
}
const toSel = n => !!(S.toSel && S.toSel.n === n && S.toSel.on);
// a timeout stops the clock before the snap and gives back whatever ran off since the last play
function toRowHTML(st) {
  const left = st.to[S.me];
  if (!(st.ro > 0)) return '<div class="ctlrow"><span class="hint">Clock stopped. Timeouts left: ' + left + '.</span></div>';
  if (left <= 0) return '<div class="ctlrow"><span class="hint">Clock running, no timeouts left.</span></div>';
  const on = toSel(st.playNo);
  return '<div class="ctlrow"><button class="btn small ctl' + (on ? ' on' : '') + '" data-act="to-toggle" aria-pressed="' + on + '">Timeout (' + left + ' left): ' + (on ? 'YES' : 'no') + '</button><span class="hint">Clock is running. A timeout stops it and gives back the ' + st.ro + ' second' + (st.ro === 1 ? '' : 's') + ' that just ran off. Press T.</span></div>';
}
function ctlRowHTML(role) {
  const on = S.ctlOn;
  return '<div class="ctlrow"><button class="btn small ctl' + (on ? ' on' : '') + '" data-act="ctl-toggle" aria-pressed="' + on + '">Control your players: ' + (on ? 'ON' : 'OFF') + '</button>' +
    '<span class="hint">' + (on ? (role === 'off' ? 'You play the quarterback, then whoever has the ball.' : 'You play one defender and can switch.') + ' Everyone else moves on their own. You also run back kickoffs and punts.' : 'You only call the plays. The computer runs everyone.') + ' Press C to switch.</span></div>';
}
// coach's picks (like Ask Madden): E.suggest reads what the other team has called in this kind of spot and plays the options out
// with the stat engine; the best pick and two alternatives, worked out once per snap. G calls the best one.
function coachFor(G, role) {
  const st = G.state, key = st.playNo + role;
  if (S.coach && S.coach.key === key && S.coach.G === G.log.length) return S.coach.r;
  let r = null; try { r = E.suggest(st, G.log, G.teams, G.U, S.me, role); } catch (e) { r = null; }
  S.coach = { key, G: G.log.length, r }; return r;
}
const coachPicks = (G, role) => { const r = G && coachFor(G, role); return r ? r.picks : []; };
const pickLabel = (role, id) => role === 'off' ? offLabel(id) : E.DEF_CALLS[id].label;
function coachRowHTML(G, role) {
  const r = coachFor(G, role); if (!r || !r.picks.length) return '';
  return '<div class="coach"><span class="eyebrow">Coach\'s picks</span><div class="cpicks">' + r.picks.map((id, i) => '<button class="btn small' + (i ? '' : ' primary') + '" data-act="call" data-id="' + id + '">' + (i ? '' : '★ ') + esc(pickLabel(role, id)) + (i ? '' : ' (G)') + '</button>').join('') + '</div><p class="hint">' + esc(r.why) + '</p></div>';
}
function coachCall() { const G = S.G; if (!G || G.state.over) return; const role = S.me === G.state.poss ? 'off' : 'def', r = coachFor(G, role); if (r && r.id && S.mine[G.state.playNo] == null) submitCall(r.id); }
// who is on fire right now (st.fire[id] = { f: snaps left, n: name }): a line over the calls
function fireRowHTML(st, role) {
  const hot = Object.values(st.fire || {}).filter(f => f.f > 0 && f.n), cf = Object.values(st.conf || {}).filter(c => c.f > 0 && c.n);
  const confRow = cf.length ? '<div class="ctlrow confrow"><span>⚡ ' + cf.map(c => esc(c.n) + ' +' + c.b + ' (' + c.f + ' snaps)').join(', ') + ': confidence after a tough catch.</span></div>' : '';
  if (!hot.length) return confRow;
  return '<div class="ctlrow firerow"><span>🔥 ' + hot.map(f => esc(f.n) + ' (' + f.f + ' snaps)').join(', ') + ' on fire: +' + E.FIRE_BOOST + ' rating until he is stopped.' + '</span></div>' + confRow;
}
// hurry-up: run the same call again (no huddle); the button shows it, R does it
function lastCallFor(G) {
  const st = G && G.state; if (!st || st.kick || !S.me || !S.lastCall) return null;
  const role = S.me === st.poss ? 'off' : 'def', pick = S.lastCall[role];
  if (!pick) return null;
  if (role === 'off') return E.offOptions(st).some(o => o.id === pick && !o.disabled) ? pick : null;
  return E.DEF_CALLS[pick] ? pick : null;
}
function hurry() { const G = S.G, pick = lastCallFor(G); if (pick) submitCall(pick); }
function submitCall(pick) {
  const G = S.G; if (!G || G.state.over || !S.me) return;
  const st = G.state, n = st.playNo, role = S.me === st.poss ? 'off' : 'def';
  if (S.mine[n] != null) return;
  if (role === 'off') { if (!E.offOptions(st).some(o => o.id === pick && !o.disabled)) return; }
  else if (!E.DEF_CALLS[pick]) return;
  S.mine[n] = pick; S.callSig = null;
  if (!st.kick) S.lastCall = Object.assign({}, S.lastCall, { [role]: pick });   // for hurry-up (R)
  if (!st.kick) { const c = (role === 'off' ? E.OFF[pick] : E.DEF_CALLS[pick]).cat; if (c !== 'SPEC') lsSet('gd_cat_' + role, c); }
  const ctl = S.ctlOn && !(role === 'off' && E.noDef(pick)) ? 1 : 0;
  const to = toSel(n) && st.ro > 0 && st.to[S.me] > 0 ? 1 : 0;
  if (to) S.toN[n] = 1; else delete S.toN[n];
  if (ctl) S.ctlN[n] = 1; else delete S.ctlN[n];
  if (S.mode === 'online') {
    api({ op: 'move', code: S.code, seat: S.me, pid: PID, n, pick, ctl, to }).catch(e => { delete S.mine[n]; delete S.ctlN[n]; delete S.toN[n]; S.callSig = null; handleErr(e); updateGame(); });
  }
  updateGame();
}


/*LIVE_CLIENT*/

/* ---------- hub-driven games (campaign, leagues, tournaments) ---------- */
function ctxMoves() { const o = {}; for (const n in S.mine) o[n + '-' + S.me] = myMove(n); for (const n in S.lv) o[n + '-lv'] = S.lv[n]; for (const n in S.rv) o[n + '-rv'] = S.rv[n]; return o; }
function ctxFinish(G) {
  const c = S.ctx; if (!c || c.sent) return;
  c.sent = true; c.status = 'saving'; S.callSig = null;
  const done = ok => { c.status = ok ? 'ok' : 'err'; S.callSig = null; if (S.ctx === c) renderCall(S.G); };
  Promise.resolve(c.report(c.kind === 'cpu' ? ctxMoves() : null, G.state)).then(() => done(true), e => { c.err = (e && e.message) || ''; done(false); });
}
function startCtxCpu(info, ctx) {   // info: {T, seed, side, cpuSide}
  resetForMode();
  S.mode = 'local'; S.code = null; S.me = info.side; S.cpuSides = info.cpuSide ? [info.cpuSide] : []; S.seed = info.seed;
  S.seats.a = { status: 'ready', name: info.T.a.name, squad: info.T.a.squad }; S.seats.b = { status: 'ready', name: info.T.b.name, squad: info.T.b.squad };
  S.ctx = Object.assign({ kind: 'cpu', label: 'Game', sent: false, status: '' }, ctx);
  render();
}
function startCtxRoom(info, ctx) {  // info: {room, seed, side}
  resetForMode();
  S.mode = 'online'; S.code = info.room; S.seed = info.seed; S.me = info.side; S.lvLoaded = false;
  S.ctx = Object.assign({ kind: 'room', label: 'Live game', sent: false, status: '' }, ctx);
  startPoll(); render();
}
function startBoard(o) {   // hub-driven snake draft (tournaments): {label, d, me, names, post, poll, onDone}
  resetForMode();
  S.mode = 'sdraft'; S.me = null;
  sdStart(o); sdPollLoop(); render(); sdStep();
}
function exitToHub() { leave(); }
window.GAME = { resume: () => { const saved = ssGet('gd_room'); if (saved && S.api && S.mode === 'lobby') joinRoom(saved, true); }, api, startCtxCpu, startCtxRoom, startBoard, exitToHub, buildLobby: () => buildLobby(), readName, toast, esc, spCanvas, paintCanvases, keyFor, genericKey, fieldKey, getSprite, openModal, closeModal, state: S, PID, joinRoom, S, Field };

/* ---------- router ---------- */
function render() {
  const sc = screenName(), changed = sc !== S.screen;
  S.screen = sc; document.body.classList.toggle('ingame', sc === 'game');
  renderHeader();
  if (sc === 'lobby') { if (changed) { if (window.HUB) window.HUB.show(); else buildLobby(); } }
  else if (sc === 'draft') { if (changed) { S.sd && (S.sd.built = false); sdUpdate(); } else sdUpdate(); }
  else if (sc === 'wait') drawWait();
  else { if (changed) buildGame(); updateGame(); }
}

/* ---------- events ---------- */
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act;
  if (a === 'create') createRoom();
  else if (a === 'join') joinRoom($('#code').value);
  else if (a === 'cpu') startLocal();
  else if (a === 'fullscreen') toggleFull();
  else if (a === 'leave') leave();
  else if (a === 'ctx-done') { const c = S.ctx; leave(); if (c && c.onDone) c.onDone(); }
  else if (a === 'ctx-retry') { const c = S.ctx; if (c) { c.sent = false; ctxFinish(S.G); renderCall(S.G); } }
  else if (a === 'sd-pick') sdPick(t.dataset.id);
  else if (a === 'sd-best') sdBest();
  else if (a === 'sd-auto') { const sd = S.sd; if (sd) { sd.auto = !sd.auto; sdUpdate(); sdStep(); } }
  else if (a === 'sd-tab') { const sd = S.sd; if (sd) { sd.tab = t.dataset.k; sdUpdate(); } }
  else if (a === 'copy') { const done = () => toast('Room code copied.'); try { navigator.clipboard.writeText(S.code).then(done, () => toast('Copy failed. Select the code and copy it.')); } catch (e) { toast('Copy failed. Select the code and copy it.'); } }
  else if (a === 'call') submitCall(t.dataset.id);
  else if (a === 'cat') openCat(t.dataset.cat);
  else if (a === 'ctl-toggle') { S.ctlOn = !S.ctlOn; lsSet('gd_ctl', S.ctlOn ? '1' : '0'); S.callSig = null; if (S.G) renderCall(S.G); }
  else if (a === 'to-toggle') { const n = S.G.state.playNo; S.toSel = { n, on: !toSel(n) }; S.callSig = null; renderCall(S.G); }
  else if (a === 'hurry') hurry();
  else if (a === 'live-hand') LV.hand();
  else if (a === 'live-force') LV.force();
  else if (a === 'rosters') showRosters();
  else if (a === 'matchups') showMatchups();
  else if (a === 'close-modal') closeModal();
});
document.addEventListener('keydown', ev => {
  const tag = ev.target && ev.target.tagName;
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'code') { joinRoom(ev.target.value); return; }
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (ev.key === 'Escape') { closeModal(); return; }
  const m = $('#modal'); if (m && !m.hidden) return;
  if (LV.on) { if (LV.key(ev, true)) return; }
  if (S.screen === 'game' && (ev.key === 'f' || ev.key === 'F') && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { toggleFull(); return; }
  if (S.screen === 'game' && !LV.on && (ev.key === 'c' || ev.key === 'C')) { const b = $('[data-act="ctl-toggle"]'); if (b) b.click(); return; }
  if (S.screen === 'game' && !LV.on && (ev.key === 't' || ev.key === 'T')) { const b = $('[data-act="to-toggle"]'); if (b) b.click(); return; }
  if (S.screen === 'game' && !LV.on && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && $('#callpanel .cats')) { ev.preventDefault(); stepCat(ev.key === 'ArrowRight' ? 1 : -1); return; }
  if (S.screen === 'game' && !LV.on && (ev.key === 'r' || ev.key === 'R')) { hurry(); return; }
  if (S.screen === 'game' && !LV.on && (ev.key === 'g' || ev.key === 'G') && !ev.ctrlKey && !ev.metaKey) { coachCall(); return; }
  if (S.screen === 'game' && !LV.on && /^[1-9]$/.test(ev.key)) {
    const btns = document.querySelectorAll('#callpanel .call:not([disabled])');
    const b = btns[+ev.key - 1]; if (b) submitCall(b.dataset.id);
  }
});
document.addEventListener('keyup', ev => { if (LV.on) LV.key(ev, false); });
window.addEventListener('blur', () => { if (LV.on) { LV.held = {}; LV.push(0); } });
// on-screen pad: hold a direction, tap an action
document.addEventListener('pointerdown', ev => {
  const h = ev.target.closest && ev.target.closest('[data-hold]'); if (h && LV.on) { ev.preventDefault(); LV.hold(h.dataset.hold, true); h.setPointerCapture && h.setPointerCapture(ev.pointerId); return; }
  const k = ev.target.closest && ev.target.closest('[data-lvk]'); if (k && LV.on) { ev.preventDefault(); const v = k.dataset.lvk; if (v === 'lob') { LV.lobArm = !LV.lobArm; LV.panel(true); } else { const n = +v; if (n >= 1 && n <= 4 && LV.lobArm) { LV.push(8); LV.lobArm = false; } LV.push(n); } }
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => document.addEventListener(t, ev => { const h = ev.target.closest && ev.target.closest('[data-hold]'); if (h && LV.on) LV.hold(h.dataset.hold, false); }));
document.addEventListener('change', ev => {   // the returner pick in the draft lineup
  if (ev.target && ev.target.id === 'sd-ret' && S.sd) { S.sd.ret = +ev.target.value; sdUpdate(); }
});
document.addEventListener('input', ev => {
  if (ev.target && ev.target.id === 'sd-q' && S.sd) { S.sd.q = ev.target.value; sdList(); return; }
  if (ev.target && ev.target.id === 'code') ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

/* ---------- boot ---------- */
async function init() {
  Field.init();
  if (window.HUB) await window.HUB.boot();
  render();
  try { await api({ op: 'ping' }); S.api = true; } catch (e) { S.api = false; }
  S.ready = true; updateLobbyHints();
  if (window.HUB) window.HUB.ready();
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (Field.scene) Field.draw(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
