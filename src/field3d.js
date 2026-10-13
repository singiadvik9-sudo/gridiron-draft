/* ---------- 3D camera views ----------
   three.js (public/vendor/three.min.js) is fetched the first time a 3D view is picked. The field, the stands and the
   low-poly players are drawn from the very same state as the 2D field (the formation, or a snapshot of the live sim);
   the 2D canvas turns into a transparent overlay for the minimap, the key strip, messages and name tags.
   Cameras only look along the field or across it, so the stick keeps mapping to whole-number sim directions
   (Field3D.basis tells the live controls which way is "up" on the screen). */
const VIEWS = [
  { id: 'side', label: 'Sideline', sub: '2D pixels' },
  { id: 'side3d', label: 'Sideline 3D', sub: 'broadcast camera' },
  { id: 'behind', label: 'Behind the offense', sub: 'down the field' },
  { id: 'defense', label: 'Behind the defense', sub: 'facing the offense' },
  { id: 'player', label: 'Player cam', sub: 'over your shoulder' },
  { id: 'top', label: 'Overhead', sub: 'coach cam' }
];
const YBW = 7.4;          // half the playing width (YB in lib/live.js)
const FIELD_Z = 12.4;     // half the width of the painted grass
const Field3D = {
  ready: false, active: false, host: null, gl: null, ren: null, scene: null, camera: null, loading: null, raf: 0,
  figs: new Map(), cx: 50, cpos: null, clook: null, snap: true, lastT: 0, tkey: '', fieldTex: null, fieldMesh: null, ball: null, lines: null, mode: 'side',
  tags: [], fsc: null, fitems: null, sizeKey: '', cw: 0, ch: 0, bpos: null, rs: 0.85, fails: 0, ema: 0,

  // something is wrong with 3D on this device: go back to the 2D field
  giveUp(msg) {
    if (Field.view === 'side') return;
    lsSet('gd_view', 'side'); Field.setView('side'); paintViewBar(); toast(msg);
  },
  supported() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } },
  load() {
    if (window.THREE) { this.ready = true; return Promise.resolve(); }
    if (!this.loading) this.loading = new Promise((res, rej) => {
      const sc = document.createElement('script'); sc.src = 'vendor/three.min.js';
      sc.onload = () => { this.ready = !!window.THREE; this.ready ? res() : rej(new Error('three')); };
      sc.onerror = () => { this.loading = null; rej(new Error('load')); };
      document.head.appendChild(sc);
    });
    return this.loading;
  },

  /* ----- which way is up on the screen: used by the live controls ----- */
  basis(m) {
    const v = Field.view, d = m ? m.dir : 1;
    if (v === 'side3d') return { R: [1, 0], F: [0, -1] };
    const f = v === 'defense' ? [-d, 0] : v === 'player' && m && m.me !== m.off ? [-d, 0] : [d, 0];
    return { F: f, R: [-f[1], f[0]] };
  },

  /* ----- setup ----- */
  enable(host, view) {
    this.mode = view; this.host = host;
    if (!this.ren) this.init();
    if (this.gl.parentNode !== host) host.insertBefore(this.gl, Field.cv);
    this.active = true; this.snap = true; this.sizeKey = ''; this.lastT = 0; this.tkey = '';
    if (!this.raf) this.raf = requestAnimationFrame(t => this.loop(t));
  },
  disable() {
    this.active = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    if (this.gl && this.gl.parentNode) this.gl.parentNode.removeChild(this.gl);
    if (Field.cv) { Field.cv.width = Field.W; Field.cv.height = Field.H; }
  },
  init() {
    const T = THREE;
    const ren = this.ren = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    ren.setPixelRatio(1); ren.outputColorSpace = T.SRGBColorSpace;
    this.gl = ren.domElement; this.gl.className = 'gl'; this.gl.setAttribute('aria-hidden', 'true');
    this.gl.addEventListener('webglcontextlost', ev => { ev.preventDefault(); this.giveUp('The 3D view lost its graphics context. Back to the sideline view.'); });
    const sc = this.scene = new T.Scene();
    sc.background = new T.Color(0x0b1020); sc.fog = new T.Fog(0x0b1020, 80, 230);
    sc.add(new T.HemisphereLight(0xcfdcff, 0x24402c, 0.95));
    const sun = new T.DirectionalLight(0xffffff, 1.15); sun.position.set(25, 70, 30); sc.add(sun);
    this.camera = new T.PerspectiveCamera(50, 1.8, 0.3, 420);
    this.cpos = new T.Vector3(50, 10, 20); this.clook = new T.Vector3(50, 0, 0);
    this.buildWorld(); this.buildBall(); this.buildLines();
  },
  mat(color, extra) {
    this._m = this._m || {};
    const k = color + (extra ? JSON.stringify(extra) : '');
    return this._m[k] || (this._m[k] = new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, extra || {})));
  },
  geos() {
    if (this._g) return this._g;
    const T = THREE, B = (x, y, z) => new T.BoxGeometry(x, y, z);
    return this._g = {
      leg: B(0.27, 0.8, 0.29), shoe: B(0.42, 0.13, 0.3), torso: B(0.46, 0.72, 0.8), pad: B(0.52, 0.2, 0.94), arm: B(0.21, 0.38, 0.21), fore: B(0.18, 0.36, 0.18),
      helm: new T.SphereGeometry(0.29, 10, 8), face: B(0.14, 0.2, 0.3), mask: B(0.05, 0.19, 0.3),
      ring: new T.RingGeometry(0.82, 1.04, 30).rotateX(-Math.PI / 2), blob: new T.CircleGeometry(0.66, 14).rotateX(-Math.PI / 2),
      cone: new T.ConeGeometry(0.3, 0.62, 4).rotateX(Math.PI)
    };
  },

  /* ----- the stadium ----- */
  fieldTexture(sc) {
    const A = sc.teams.a.name, Bn = sc.teams.b.name, W = 2048, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), TX = W / 120, TZ = H / (FIELD_Z * 2), px = v => (v + 10) * TX, pz = v => (v + FIELD_Z) * TZ;
    for (let yd = 0; yd < 100; yd += 5) { x.fillStyle = ((yd / 5) | 0) % 2 === 0 ? '#2f7a48' : '#35854f'; x.fillRect(px(yd), 0, 5 * TX + 1, H); }
    x.fillStyle = '#7a2e20'; x.fillRect(px(-10), 0, 10 * TX, H);
    x.fillStyle = '#1d4f8a'; x.fillRect(px(100), 0, 10 * TX, H);
    x.fillStyle = 'rgba(8,14,24,.34)'; x.fillRect(0, 0, W, pz(-YBW)); x.fillRect(0, pz(YBW), W, H - pz(YBW));   // out of bounds
    x.fillStyle = 'rgba(239,233,214,.92)';
    for (let yd = 0; yd <= 100; yd += 5) x.fillRect(px(yd) - (yd % 100 === 0 ? 2.2 : 1.2), pz(-YBW), yd % 100 === 0 ? 4.4 : 2.4, pz(YBW) - pz(-YBW));
    x.fillRect(px(-10), pz(-YBW), 3, pz(YBW) - pz(-YBW)); x.fillRect(px(110) - 3, pz(-YBW), 3, pz(YBW) - pz(-YBW));
    x.fillRect(px(-10), pz(-YBW) - 2.5, 120 * TX, 5); x.fillRect(px(-10), pz(YBW) - 2.5, 120 * TX, 5);
    for (let yd = 1; yd < 100; yd++) { const l = yd % 5 === 0 ? 0 : 1; if (l) for (const z of [-3.1, 3.1, -YBW + 0.7, YBW - 0.7]) x.fillRect(px(yd) - 0.8, pz(z) - 0.3 * TZ, 1.6, 0.6 * TZ); }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = 'bold ' + Math.round(TZ * 1.9) + 'px Arial, sans-serif'; x.fillStyle = 'rgba(239,233,214,.85)';
    for (let yd = 10; yd <= 90; yd += 10) {
      const n = String(Math.min(yd, 100 - yd));
      x.save(); x.translate(px(yd), pz(4.7)); x.fillText(n, 0, 0); x.restore();
      x.save(); x.translate(px(yd), pz(-4.7)); x.rotate(Math.PI); x.fillText(n, 0, 0); x.restore();
    }
    x.font = 'bold ' + Math.round(TZ * 5.4) + 'px Arial, sans-serif'; x.fillStyle = 'rgba(239,233,214,.55)';
    x.save(); x.translate(px(-5), H / 2); x.rotate(-Math.PI / 2); x.fillText(abbr(A), 0, 0); x.restore();
    x.save(); x.translate(px(105), H / 2); x.rotate(Math.PI / 2); x.fillText(abbr(Bn), 0, 0); x.restore();
    return cv;
  },
  buildWorld() {
    const T = THREE, sc = this.scene;
    const tex = this.fieldTex = new T.CanvasTexture(document.createElement('canvas'));
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(8, this.ren.capabilities.getMaxAnisotropy());
    const fm = this.fieldMesh = new T.Mesh(new T.PlaneGeometry(120, FIELD_Z * 2), new T.MeshLambertMaterial({ map: tex }));
    fm.rotation.x = -Math.PI / 2; fm.position.set(50, 0, 0); sc.add(fm);
    const ground = new T.Mesh(new T.PlaneGeometry(600, 600), this.mat(0x0a1020)); ground.rotation.x = -Math.PI / 2; ground.position.set(50, -0.06, 0); sc.add(ground);
    // crowd texture
    const cc = document.createElement('canvas'); cc.width = 128; cc.height = 32; const cx = cc.getContext('2d');
    const pal = ['#8a2f2f', '#2f4f8a', '#cfc7a8', '#1b2140', '#3b3f5c', '#b58a2f', '#5a2a4a', '#2a5a52'];
    cx.fillStyle = '#12182e'; cx.fillRect(0, 0, 128, 32);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 700; i++) { cx.fillStyle = pal[(rnd() * pal.length) | 0]; cx.fillRect((rnd() * 128) | 0, (rnd() * 32) | 0, 2, 2); }
    const crowd = new T.CanvasTexture(cc); crowd.wrapS = crowd.wrapT = T.RepeatWrapping; crowd.magFilter = T.NearestFilter; crowd.colorSpace = T.SRGBColorSpace;
    const crowdMat = (rx) => { const t = crowd.clone(); t.needsUpdate = true; t.repeat.set(rx, 1); return new T.MeshLambertMaterial({ map: t, flatShading: true }); };
    // stands: three rising tiers along each side and behind each end zone
    const tier = (cx0, cz0, len, depth, h, y, alongX) => {
      const m = new T.Mesh(new T.BoxGeometry(alongX ? len : depth, h, alongX ? depth : len), crowdMat(len / 6));
      m.position.set(cx0, y + h / 2, cz0); sc.add(m);
    };
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < 3; i++) tier(50, sgn * (YBW + 14 + i * 3.2), 150, 3.4, 4 + i * 3.4, 0, true);
      for (let i = 0; i < 3; i++) tier(sgn < 0 ? -15 - i * 3.2 : 115 + i * 3.2, 0, 70, 3.4, 4 + i * 3.4, 0, false);
    }
    // ad boards and the team benches along the sidelines
    for (const sgn of [-1, 1]) {
      const board = new T.Mesh(new T.BoxGeometry(122, 1.05, 0.3), this.mat(0x1a2442)); board.position.set(50, 0.52, sgn * (YBW + 4.2)); sc.add(board);
      for (let i = 0; i < 12; i++) { const b = new T.Mesh(new T.BoxGeometry(6.2, 0.7, 0.34), this.mat(i % 2 ? 0xffcf3f : 0xefe9d6)); b.position.set(-5 + i * 10, 0.55, sgn * (YBW + 4.2)); sc.add(b); }
    }
    for (const x of [-11.2, 111.2]) { const b = new T.Mesh(new T.BoxGeometry(0.3, 1.05, 30), this.mat(0x1a2442)); b.position.set(x, 0.52, 0); sc.add(b); }
    // goal posts
    const yel = this.mat(0xffcf3f, { emissive: 0x3a2e00 });
    for (const gx of [-10, 110]) {
      const g = new T.Group();
      const cyl = (r, h) => new T.CylinderGeometry(r, r, h, 8);
      const base = new T.Mesh(cyl(0.16, 3.4), yel); base.position.set(0, 1.7, 0); g.add(base);
      const bar = new T.Mesh(cyl(0.12, 6.2), yel); bar.rotation.x = Math.PI / 2; bar.position.set(0, 3.4, 0); g.add(bar);
      for (const z of [-3.1, 3.1]) { const up = new T.Mesh(cyl(0.1, 11.7), yel); up.position.set(0, 3.4 + 5.85, z); g.add(up); }
      g.position.set(gx, 0, 0); sc.add(g);
    }
    // flood lights
    for (const [lx, lz] of [[-22, -34], [-22, 34], [122, -34], [122, 34]]) {
      const pole = new T.Mesh(new T.CylinderGeometry(0.4, 0.6, 34, 6), this.mat(0x1a2038)); pole.position.set(lx, 17, lz); sc.add(pole);
      const head = new T.Mesh(new T.BoxGeometry(9, 4.4, 0.8), new T.MeshBasicMaterial({ color: 0xfff3c4 })); head.position.set(lx, 35, lz); head.lookAt(50, 20, 0); sc.add(head);
    }
  },
  buildBall() {
    const T = THREE, g = new T.Group();
    const b = new T.Mesh(new T.SphereGeometry(0.2, 10, 8), this.mat(0x7a3f1c)); b.scale.set(1.55, 0.95, 0.95); g.add(b);
    const lace = new T.Mesh(new T.BoxGeometry(0.22, 0.03, 0.05), this.mat(0xefe9d6)); lace.position.set(0, 0.19, 0); g.add(lace);
    const stripe = new T.Mesh(new T.BoxGeometry(0.04, 0.34, 0.34), this.mat(0xefe9d6)); stripe.position.set(0.16, 0, 0); g.add(stripe);
    const stripe2 = stripe.clone(); stripe2.position.x = -0.16; g.add(stripe2);
    const spin = new T.Group(); spin.add(g);
    const holder = new T.Group(); holder.add(spin);
    const sh = new T.Mesh(this.geos().blob, new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })); sh.scale.set(0.5, 1, 0.5); sh.position.y = 0.03;
    this.scene.add(holder); this.scene.add(sh);
    this.ball = { holder, spin, shadow: sh, prev: new T.Vector3() };
  },
  buildLines() {
    const T = THREE, mk = (color, h) => {
      const g = new T.Group();
      const strip = new T.Mesh(new T.PlaneGeometry(0.42, YBW * 2 + 0.2).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })); strip.position.y = 0.035; g.add(strip);
      for (const z of [-1, 1]) { const p = new T.Mesh(new T.BoxGeometry(0.32, h, 0.32), new T.MeshBasicMaterial({ color })); p.position.set(0, h / 2, z * (YBW + 0.7)); g.add(p); }
      this.scene.add(g); return g;
    };
    this.lines = { los: mk(0x5aa9ff, 1.25), fd: mk(0xffcf3f, 1.25) };
  },

  /* ----- players ----- */
  makeFig(key) {
    const T = THREE, g = this.geos(), [sk, hr, jc, hc] = key.split(':'), skin = D.SKIN[+sk - 1] || '#c68c60';
    const jersey = '#' + jc, helmet = '#' + hc, pants = '#e6e3d6';
    const root = new T.Group(), body = new T.Group(); body.position.y = 0.9; root.add(body);
    const mk = (geo, color, x, y, z, parent) => { const m = new T.Mesh(geo, this.mat(color)); m.position.set(x, y, z); parent.add(m); return m; };
    const legL = new T.Group(), legR = new T.Group(); legL.position.set(0, 0, -0.18); legR.position.set(0, 0, 0.18); body.add(legL); body.add(legR);
    for (const l of [legL, legR]) { mk(g.leg, pants, 0, -0.4, 0, l); mk(g.shoe, '#171a24', 0.07, -0.83, 0, l); }
    const upper = new T.Group(); upper.position.y = 0.02; body.add(upper);
    mk(g.torso, jersey, 0, 0.36, 0, upper); mk(g.pad, jersey, 0, 0.66, 0, upper);
    const head = new T.Group(); head.position.y = 0.98; upper.add(head);
    mk(g.helm, helmet, 0, 0.02, 0, head); mk(g.face, skin, 0.2, -0.05, 0, head); mk(g.mask, '#c9ccd4', 0.27, -0.06, 0, head);
    const armL = new T.Group(), armR = new T.Group(); armL.position.set(0, 0.7, -0.52); armR.position.set(0, 0.7, 0.52); upper.add(armL); upper.add(armR);
    for (const a of [armL, armR]) { mk(g.arm, jersey, 0, -0.19, 0, a); mk(g.fore, skin, 0.02, -0.56, 0, a); }
    const shadow = new T.Mesh(g.blob, new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false })); shadow.position.y = 0.03; this.scene.add(shadow);
    this.scene.add(root);
    return { key, root, body, upper, head, legL, legR, armL, armR, shadow, ph: Math.random() * 6, hd: null, ring: null, arrow: null, big: 1 };
  },
  figFor(it) {
    const id = it.team + '|' + it.id;
    let f = this.figs.get(id);
    if (!f || f.key !== it.key) {
      if (f) this.dropFig(f);
      f = this.makeFig(it.key); this.figs.set(id, f);
    }
    f.used = true; return f;
  },
  dropFig(f) { this.scene.remove(f.root); this.scene.remove(f.shadow); if (f.ring) this.scene.remove(f.ring); if (f.arrow) this.scene.remove(f.arrow); },
  pose(f, it, dt, now, dirW) {
    const sp = Math.hypot(it.vx || 0, it.vz || 0), grp = it.grp || '';
    // facing: the way he runs, else the way the play goes (offence) or toward the ball (defence)
    let want = f.hd;
    if (sp > 0.9) want = Math.atan2(-(it.vz || 0), it.vx || 0);
    else if (want == null) want = it.fx != null ? it.fx : (it.off ? (dirW > 0 ? 0 : Math.PI) : (dirW > 0 ? Math.PI : 0));
    if (f.hd == null) f.hd = want; else { let d = want - f.hd; d = Math.atan2(Math.sin(d), Math.cos(d)); f.hd += d * Math.min(1, dt * 12); }
    f.root.rotation.y = f.hd;
    const sz = grp === 'OL' || grp === 'DL' ? 1.14 : grp === 'LB' || grp === 'TE' ? 1.06 : grp === 'WR' || grp === 'CB' ? 0.97 : 1;
    f.root.scale.set(sz, 1, sz * 1.04);
    f.ph += dt * Math.min(sp, 9.5) * 1.55;
    const amp = Math.min(1.05, sp * 0.15), sw = Math.sin(f.ph) * amp;
    let lean = Math.min(0.42, sp * 0.05), y = 0, bodyPitch = 0, aL = -sw * 0.95, aR = sw * 0.95, lL = sw, lR = -sw;
    if (it.stance) { lean = 0.62; y = -0.16; lL = -0.5; lR = 0.45; aL = aR = 0.35; }
    if (it.eng) { lean = 0.5; y = -0.1; aL = aR = 1.25; lL = -0.3; lR = 0.3; }
    if (it.carrier) { aR = 1.15; aL = 0.65 - sw * 0.3; }
    if (it.jump) { y += 0.75; aL = aR = 2.7; lL = -0.4; lR = 0.4; }
    if (it.dive) { bodyPitch = -1.38; y = 0.62; aL = aR = 2.9; lL = lR = 0.05; lean = 0; }
    if (it.down) { bodyPitch = 1.45; y = 0.28; aL = aR = -0.4; lean = 0; lL = lR = 0; }
    f.body.rotation.z = bodyPitch; f.body.position.y = 0.9 + y - Math.abs(Math.sin(f.ph)) * 0.05 * (sp > 1);
    f.upper.rotation.z = -lean;
    f.legL.rotation.z = lL; f.legR.rotation.z = lR; f.armL.rotation.z = aL; f.armR.rotation.z = aR;
    f.root.position.set(it.wx, 0, it.wz);
    f.shadow.position.set(it.wx, 0.03, it.wz); const air = it.jump ? 0.75 : 0; f.shadow.scale.set(1 - air * 0.25, 1, 1 - air * 0.25);
    // ring under a controlled player, arrow over yours
    if (it.ring) {
      if (!f.ring) { f.ring = new THREE.Mesh(this.geos().ring, new THREE.MeshBasicMaterial({ color: it.ring, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })); this.scene.add(f.ring); }
      f.ring.visible = true; f.ring.material.color.set(it.ring);
      const pulse = it.tag ? 1 + 0.12 * Math.sin(now / 170) : 1; f.ring.scale.set(pulse, 1, pulse); f.ring.position.set(it.wx, 0.05, it.wz);
    } else if (f.ring) f.ring.visible = false;
    if (it.tag) {
      if (!f.arrow) { f.arrow = new THREE.Mesh(this.geos().cone, new THREE.MeshBasicMaterial({ color: it.ring })); this.scene.add(f.arrow); }
      f.arrow.visible = true; f.arrow.material.color.set(it.ring); f.arrow.position.set(it.wx, 2.85 + Math.sin(now / 200) * 0.12, it.wz); f.arrow.rotation.y = now / 400;
    } else if (f.arrow) f.arrow.visible = false;
  },

  /* ----- the scene each frame ----- */
  itemsFor(F, dirW) {
    const live = F.live && F.live.items.length ? F.live : null;
    if (live) return live.items;
    if (this.fsc !== F.scene) { this.fsc = F.scene; this.fitems = F.formation(F.scene); }
    const items = this.fitems.map(it => Object.assign({ off: it.team === F.scene.poss }, it));
    const a = F.anim;
    if (a && F.ballX != null) {
      const e = Math.max(0, Math.min(1, (F.ballX - a.startX) / ((a.endX - a.startX) || 1))), en = a.entry;
      const cid = en.anim === 'run' ? (en.runId === 'FB' ? 'HB' : en.runId) : en.anim === 'pass' ? en.recId : en.anim === 'sack' ? 'QB' : null;
      const c = cid && items.find(i => i.id === cid && i.team === F.scene.poss);
      if (c) {
        if (en.anim === 'pass') { const w0 = c.wx; c.wx = w0 + (a.endX - w0) * e; c.vx = e > 0 && e < 1 ? a.dir * 8 : 0; }
        else if (en.anim === 'run') { const w0 = c.wx, t = F.ballX - a.dir * 0.3; c.wx = w0 + (t - w0) * Math.min(1, e * 4); c.vx = a.dir * 7.5; c.carrier = true; }
        else if (en.anim === 'sack') { c.wx = F.ballX - a.dir * 0.3; c.vx = -a.dir * 3; }
      }
    }
    return items;
  },
  camTarget(F, items, dirW, bx, bz) {
    const v = this.mode, cl = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const L = F.live && F.live.items.length ? F.live : null, me = L && L.mine ? items.find(i => i.mine) : null;
    const myOff = L ? L.meOff : (S.me ? S.me === F.scene.poss : true);
    let mode = v;
    if (v === 'player' && !me) mode = myOff ? 'behind' : 'defense';
    const cx = this.cx;
    switch (mode) {
      case 'side3d': return { p: [cx, 12.5, YBW + 10], l: [cx + 1.5, 0, 0.5], fov: 50 };
      case 'defense': return { p: [cl(cx + dirW * 15, -9, 109), 7.4, bz * 0.3], l: [cl(cx - dirW * 8, -8, 108), 0.8, 0], fov: 58 };
      case 'player': { const f = myOff ? dirW : -dirW; return { p: [me.wx - f * 6.2, 3.5, me.wz * 0.9], l: [me.wx + f * 9, 1.1, me.wz * 0.9], fov: 64 }; }
      case 'top': return { p: [cl(cx - dirW * 9, -9, 109), 33, bz * 0.2], l: [cl(cx + dirW * 4, -8, 108), 0, 0], fov: 50 };
      default: return { p: [cl(cx - dirW * 15, -9, 109), 7.4, bz * 0.3], l: [cl(cx + dirW * 11, -8, 108), 0.7, 0], fov: 58 };
    }
  },
  resize(F) {
    const host = this.host; if (!host) return false;
    const r = host.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), key = Math.round(r.width) + 'x' + Math.round(r.height) + '@' + dpr;
    if (key !== this.sizeKey) {
      this.sizeKey = key;
      this.ren.setSize(Math.max(2, Math.round(r.width * this.rs)), Math.max(2, Math.round(r.height * this.rs)), false);
      this.camera.aspect = r.width / r.height; this.camera.updateProjectionMatrix();
      this.cw = Field.cv.width = Math.round(r.width * dpr); this.ch = Field.cv.height = Math.round(r.height * dpr);
    }
    return true;
  },
  proj(x, y, z, W, H) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  },
  loop(ts) {
    if (!this.active) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(t => this.loop(t));
    if (document.hidden || !Field.cv || !document.body.contains(this.host)) return;
    const dt = Math.min(0.1, this.lastT ? (ts - this.lastT) / 1000 : 0.016); this.lastT = ts;
    try { this.render(Field, dt, ts); this.fails = 0; }
    catch (e) { console.warn('3D view', e); if (++this.fails >= 3) { this.fails = 0; this.giveUp('The 3D view hit a problem. Back to the sideline view.'); } return; }
    // slow graphics: draw fewer pixels
    this.ema = this.ema ? this.ema * 0.95 + dt * 0.05 : dt;
    if (this.ema > 0.05 && this.rs > 0.45 && ts - (this.rsT || 0) > 1500) { this.rs = Math.max(0.45, this.rs - 0.1); this.rsT = ts; this.sizeKey = ''; this.ema = 0.03; }
  },
  render(F, dt, now) {
    const T = THREE, sc = F.scene; if (!sc || !this.resize(F)) return;
    const key = abbr(sc.teams.a.name) + abbr(sc.teams.b.name);
    if (key !== this.tkey) { this.tkey = key; this.fieldTex.image = this.fieldTexture(sc); this.fieldTex.needsUpdate = true; }
    const live = F.live && F.live.items.length ? F.live : null, dirW = live ? live.dir : (sc.poss === 'a' ? 1 : -1), los = F.losX(sc);
    const items = this.itemsFor(F, dirW);
    // ball
    let bx, bz = 0, by, carried = false, carrier = null;
    if (live) { bx = live.ball.wx; bz = live.ball.wz || 0; carried = !!live.ball.carried; by = carried ? 1.2 : 0.35 + (live.ball.h || 0); }
    else {
      const a = F.anim, held = a && F.ballX != null && (a.kind === 'run' || a.kind === 'sack');
      bx = F.ballX == null ? los - dirW * 0.2 : F.ballX; by = F.ballX == null ? 0.22 : 0.4 + (F.ballLift / 20) * 2.4; carried = !!held; if (held) by = 1.15;
    }
    // smooth camera follow
    const tx = bx;
    if (this.snap || Math.abs(tx - this.cx) > 45) this.cx = tx; else this.cx += (tx - this.cx) * (1 - Math.exp(-dt * 5.5));
    const tgt = this.camTarget(F, items, dirW, bx, bz);
    const kP = this.snap ? 1 : 1 - Math.exp(-dt * 6.5);
    this.cpos.x += (tgt.p[0] - this.cpos.x) * kP; this.cpos.y += (tgt.p[1] - this.cpos.y) * kP; this.cpos.z += (tgt.p[2] - this.cpos.z) * kP;
    this.clook.x += (tgt.l[0] - this.clook.x) * kP; this.clook.y += (tgt.l[1] - this.clook.y) * kP; this.clook.z += (tgt.l[2] - this.clook.z) * kP;
    const cam = this.camera; cam.position.copy(this.cpos); cam.lookAt(this.clook);
    if (Math.abs(cam.fov - tgt.fov) > 0.05) { cam.fov += (tgt.fov - cam.fov) * (this.snap ? 1 : 0.1); cam.updateProjectionMatrix(); }
    this.snap = false;
    // players
    this.figs.forEach(f => { f.used = false; });
    this.tags.length = 0;
    items.forEach(it => {
      const f = this.figFor(it); this.pose(f, it, dt, now, dirW);
      if (it.tag || it.num) this.tags.push(it);
    });
    this.figs.forEach((f, id) => { const on = f.used; f.root.visible = on; f.shadow.visible = on; if (!on) { if (f.ring) f.ring.visible = false; if (f.arrow) f.arrow.visible = false; } });
    // ball
    const B = this.ball; B.holder.position.set(bx, by, bz); B.shadow.position.set(bx, 0.04, bz);
    const vx = bx - B.prev.x, vy = by - B.prev.y, vz = bz - B.prev.z, vh = Math.hypot(vx, vz);
    if (!carried && (vh > 0.04 || Math.abs(vy) > 0.04)) { B.holder.rotation.y = Math.atan2(-vz, vx); B.holder.rotation.z = Math.atan2(vy, vh || 1) * 0.8; B.spin.rotation.x += dt * 16; }
    else if (carried) { B.holder.rotation.set(0, 0.4, 0.9); B.spin.rotation.x = 0; }
    else { B.holder.rotation.set(0, B.holder.rotation.y, 0); B.spin.rotation.x = 0; }
    B.prev.set(bx, by, bz);
    B.shadow.visible = !carried || true; B.shadow.scale.setScalar(Math.max(0.3, 0.55 - by * 0.05));
    // down markers
    const fd = Math.max(-0.01, Math.min(100.01, los + dirW * sc.toGo));
    this.lines.los.position.x = los; this.lines.fd.position.x = fd; this.lines.fd.visible = sc.toGo < 100 - (dirW > 0 ? los : 100 - los) + 0.5 || true;
    this.ren.render(this.scene, cam);
    this.overlay(F, items, bx);
  },
  overlay(F, items, bx) {
    const x = F.ctx, W = 680, k = this.cw / W, H = this.ch / k;
    x.setTransform(k, 0, 0, k, 0, 0); x.clearRect(0, 0, W, H); x.imageSmoothingEnabled = false;
    F.drawOverlay(x, W, H, this.cx - 20, 40);
    this.tags.forEach(it => {
      if (it.tag) {
        const p = this.proj(it.wx, 3.5, it.wz, W, H); if (!p) return;
        x.font = '11px Silkscreen, monospace'; x.textAlign = 'center'; x.lineWidth = 4; x.strokeStyle = '#0b1020';
        const lab = 'YOU · ' + it.tag.toUpperCase(); x.strokeText(lab, p.x, p.y); x.fillStyle = it.ring; x.fillText(lab, p.x, p.y);
      }
      if (it.num) {
        const p = this.proj(it.wx, 2.9, it.wz, W, H); if (!p) return;
        x.fillStyle = '#ffcf3f'; x.strokeStyle = '#0b1020'; x.lineWidth = 2; x.fillRect(p.x - 10, p.y - 14, 20, 18); x.strokeRect(p.x - 10, p.y - 14, 20, 18);
        x.fillStyle = '#10152a'; x.font = '15px Silkscreen, monospace'; x.textAlign = 'center'; x.fillText(it.num, p.x, p.y);
      }
    });
  }
};
