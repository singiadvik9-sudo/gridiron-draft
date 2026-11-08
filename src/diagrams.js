/* ---------- play diagrams ----------
   Every play drawn the way it is actually run: the live simulation sets the play up (your squad against theirs) and the drawing reads it.
   Offense: the formation, each receiver's route to its arrowhead, the ball carrier's path on runs (the mesh, then the hole or the edge).
   Defense: each defender's job: a zone (deep ones blue, underneath ones yellow), a man (a red line to him), a rush (an arrow at the
   quarterback). Up the picture is downfield. Cached per play and matchup. */
const DIAG = { cache: {}, box: null };
const grow = (x, y) => { const b = DIAG.box; if (!b) return; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); };
const DCOL = { WR1: '#ffcf3f', WR2: '#7fb4ff', TE: '#3fdc6a', HB: '#ff7a6a', QB: '#efe9d6' };
const dX = y => 50 + Math.max(-21, Math.min(21, y)) * 2.2, dY = x => 52 - Math.max(-8, Math.min(24, x)) * 2.05;
const pt = (x, y) => { grow(dX(y), dY(x)); return dX(y).toFixed(1) + ',' + dY(x).toFixed(1); };
function diagArrow(pts, col, dash) {   // pts: [[x, y] ...] in field yards
  if (pts.length < 2) return '';
  const a = pts[pts.length - 1], b = pts[pts.length - 2], ax = dX(a[1]), ay = dY(a[0]), ang = Math.atan2(ay - dY(b[0]), ax - dX(b[1])), L = 4;
  const head = [[ax, ay], [ax - L * Math.cos(ang - 0.5), ay - L * Math.sin(ang - 0.5)], [ax - L * Math.cos(ang + 0.5), ay - L * Math.sin(ang + 0.5)]].map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
  return '<polyline points="' + pts.map(q => pt(q[0], q[1])).join(' ') + '" fill="none" stroke="' + col + '" stroke-width="1.6"' + (dash ? ' stroke-dasharray="3 2"' : '') + ' stroke-linejoin="round"/><polygon points="' + head + '" fill="' + col + '"/>';
}
const diagSim = (off, def, OS, DS) => E.LIVE.create({ seed: 7, playNo: 0, ballOn: 35, toGo: 10, offPick: off, defPick: def, OS, DS, ctlO: false, ctlD: false });
// the picture cropped to what is in it (a little room around), never narrower than 2:1
function svgWrap(body) {
  const b = DIAG.box || [0, 0, 100, 68]; DIAG.box = null;
  let x0 = b[0] - 4, y0 = b[1] - 4, w = b[2] - b[0] + 8, h = b[3] - b[1] + 8;
  if (w < h * 2) { const d = h * 2 - w; x0 -= d / 2; w += d; }
  const vb = [x0, y0, w, h].map(v => v.toFixed(1)).join(' ');
  return '<svg viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true"><rect x="' + x0.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="#1d5a2e"/><line x1="' + x0.toFixed(1) + '" x2="' + (x0 + w).toFixed(1) + '" y1="' + dY(0) + '" y2="' + dY(0) + '" stroke="#5aa9ff" stroke-width="0.8"/>' + body + '</svg>';
}
function offDiag(sim, oc) {
  let h = ''; DIAG.box = [1e9, 1e9, -1e9, -1e9];
  const ts = sim.by.TE.y > 0 ? 1 : -1, side = sim.pm.carrier ? sim.runSide : (sim.pm.flip ? -ts : ts);
  // routes
  ['WR1', 'WR2', 'TE', 'HB'].forEach(id => { const p = sim.by[id]; if (p && p.route && p.mode === 'route' && !(oc.kind === 'run' && id === 'HB')) h += diagArrow([[p.x, p.y]].concat(p.route), DCOL[id]); });
  // runs: the carrier to the mesh, then the hole (inside), the edge (outside), or the other way first (counter)
  if (oc.kind === 'run') {
    const cid = sim.pm.carrier || 'HB', c = sim.by[cid], col = DCOL[cid] || DCOL.HB, out = sim.offPick === 'RUN_OUT', W = sim.wideY || 6;
    let path;
    if (sim.pm.jet) path = [[c.x, c.y], [-2.2, side * 2], [1, side * W], [9, side * (W + 1)]];
    else if (sim.pm.carrier) path = [[c.x, c.y], [-3.8, -side * 0.4], [-1.5, side * W], [8, side * (W + 1)]];
    else if (sim.pm.flip) path = [[c.x, c.y], [-3.6, -side * 2.2], [-2, side * 1.5], [6, side * 3.5]];
    else if (out) path = [[c.x, c.y], [-3.2, side * 3], [0.5, side * W], [8, side * (W + 0.5)]];
    else if (sim.play === 'TRAP') path = [[c.x, c.y], [-3, side * 1.2], [0.5, -side * 0.4], [6, -side * 1.6]];   // the cutback behind the pulled guard
    else if (sim.play === 'POWER') path = [[c.x, c.y], [-3, side * 1], [0, side * 2.6], [6, side * 3.4]];        // off tackle
    else if (sim.play === 'ISO' || sim.play === 'DIVE') path = [[c.x, c.y], [-3, side * 0.2], [6, side * 0.4]];  // straight up the middle
    else path = [[c.x, c.y], [-3, side * 0.6], [5, side * 1.4]];
    h += diagArrow(path, col, sim.play === 'DRAW');
    if (sim.pm.carrier) { const hb = sim.by.HB; h += diagArrow([[hb.x, hb.y], [-3, -side * 4.5]], DCOL.HB, true); }   // the fake the other way
  }
  if (sim.pm.pa) h += diagArrow([[sim.by.HB.x, sim.by.HB.y], [-3, 1.5]], DCOL.HB, true);   // play-action: the fake
  // the players
  sim.O.forEach(p => { grow(dX(p.y), dY(p.x)); const col = p.grp === 'OL' ? '#c9c3b0' : DCOL[p.id] || '#efe9d6'; h += '<circle cx="' + dX(p.y).toFixed(1) + '" cy="' + dY(p.x).toFixed(1) + '" r="' + (p.grp === 'OL' ? 1.9 : 2.4) + '" fill="' + col + '" stroke="#0b1020" stroke-width="0.6"/>'; });
  return svgWrap(h);
}
function defDiag(sim) {
  let h = ''; DIAG.box = [1e9, 1e9, -1e9, -1e9];
  sim.O.forEach(p => { grow(dX(p.y), dY(p.x)); h += '<circle cx="' + dX(p.y).toFixed(1) + '" cy="' + dY(p.x).toFixed(1) + '" r="1.7" fill="none" stroke="#c9c3b0" stroke-width="0.6" opacity="0.7"/>'; });
  sim.D.forEach(p => {
    grow(dX(p.y), dY(p.x));
    if (p.mode === 'zone' && p.zone) { const z = p.zone, deep = z.x >= 12; grow(dX(z.y) - z.r * 2.2, dY(z.x) - z.r * 1.6); grow(dX(z.y) + z.r * 2.2, dY(z.x) + z.r * 1.6); h += '<ellipse cx="' + dX(z.y).toFixed(1) + '" cy="' + dY(z.x).toFixed(1) + '" rx="' + (z.r * 2.2).toFixed(1) + '" ry="' + (z.r * 1.6).toFixed(1) + '" fill="' + (deep ? '#5aa9ff' : '#ffcf3f') + '" opacity="0.22"/><line x1="' + dX(p.y).toFixed(1) + '" y1="' + dY(p.x).toFixed(1) + '" x2="' + dX(z.y).toFixed(1) + '" y2="' + dY(z.x).toFixed(1) + '" stroke="' + (deep ? '#7fb4ff' : '#ffcf3f') + '" stroke-width="0.7" opacity="0.8"/>'; }
    else if (p.mode === 'man' && sim.by[p.man]) { const r = sim.by[p.man]; h += '<line x1="' + dX(p.y).toFixed(1) + '" y1="' + dY(p.x).toFixed(1) + '" x2="' + dX(r.y).toFixed(1) + '" y2="' + dY(r.x).toFixed(1) + '" stroke="#ff5a4a" stroke-width="1" stroke-dasharray="2 1.5"/>'; }
    else if (p.mode === 'rush') h += diagArrow([[p.x, p.y], [p.x + (-3 - p.x) * 0.55, p.y * 0.45]], '#ff5a4a');
  });
  sim.D.forEach(p => { h += '<rect x="' + (dX(p.y) - 2).toFixed(1) + '" y="' + (dY(p.x) - 2).toFixed(1) + '" width="4" height="4" fill="#ff5a4a" stroke="#0b1020" stroke-width="0.6" transform="rotate(45 ' + dX(p.y).toFixed(1) + ' ' + dY(p.x).toFixed(1) + ')"/>'; });
  return svgWrap(h);
}
// the diagram for a call: offense (your squad against theirs, against Cover 2) or defense (your defense against a standard pass formation)
function playDiagram(id, role, G) {
  if (!E.LIVE || !G || !G.teams) return '';
  const me = S.me || 'a', opp = me === 'a' ? 'b' : 'a', T = G.teams, k = id + '|' + role + '|' + T.a.name + '|' + T.b.name;
  if (DIAG.cache[k] != null) return DIAG.cache[k];
  let svg = '';
  try {
    if (role === 'off') { const oc = E.OFF[id]; if (oc && (oc.kind === 'run' || oc.kind === 'pass')) svg = offDiag(diagSim(id, 'ZONE', T[me].squad, T[opp].squad), oc); }
    else if (E.DEF_CALLS[id]) svg = defDiag(diagSim('PASS_M', id, T[opp].squad, T[me].squad));
  } catch (e) { svg = ''; }
  return (DIAG.cache[k] = svg);
}
