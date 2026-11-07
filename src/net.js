/* ---------- direct links between players' devices ----------
   In an online game the screens open WebRTC data channels to each other (set up through the room server's mailbox, op 'sig'), and the
   controller inputs for live plays, play-call nudges, chat, emotes and pings go straight across: about the time it takes to ping the
   other person, instead of a round trip through the server and its database. The server is still sent everything as the record
   (results, coming back to a game, watching), and when no direct link can be made (some school and work networks) play carries on
   through it. Two players: one link. A squad game: everyone links to the host, who passes each message on to the rest (a star: a
   device needs one link, the host one per player). NET.state: 'off' | 'connecting' | 'open' | 'failed'. */
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
function Link(peer) { this.peer = peer; this.state = 'connecting'; this.pc = null; this.ch = null; this.gen = 0; this.t0 = Date.now(); this.tries = 0; this.rtt = null; this.lastPo = 0; this.pingT = 0; }
const NET = {
  state: 'off', code: null, me: null, links: {}, hub: null, srvRtt: null, on: {}, sigT: 0,
  ICE,
  // the one link a message travels on first: the other player, or (in a squad game) the host; the host's own links all count
  main() { return this.hub && this.hub !== this.me ? this.links[this.hub] : Object.values(this.links).find(l => l.state === 'open') || Object.values(this.links)[0]; },
  ok() { const l = this.main(); return !!(l && l.state === 'open' && l.ch && l.ch.readyState === 'open'); },
  via() { return this.ok() ? 'direct' : 'server'; },
  get rtt() { const ls = Object.values(this.links).filter(l => l.rtt != null); return ls.length ? ls.reduce((t, l) => t + l.rtt, 0) / ls.length : null; },
  // two players: a link to the other seat
  start(code, me, peer) { if (typeof RTCPeerConnection === 'undefined' || !code || !me || !peer) return; this.setPeers(code, me, [peer], null); },
  // a squad game: everyone to the host (lob: the room's lobby; ids, never logins)
  squad(code, lob) {
    if (typeof RTCPeerConnection === 'undefined' || !lob) return;
    const me = (lob.ps.find(p => p.me) || {}).id; if (!me) return;
    const others = lob.ps.filter(p => p.id !== me).map(p => p.id);
    this.setPeers(code, me, me === lob.host ? others : (others.indexOf(lob.host) >= 0 ? [lob.host] : []), lob.host);
  },
  setPeers(code, me, peers, hub) {
    if (this.code !== code || this.me !== me) { this.stop(); this.code = code; this.me = me; }
    this.hub = hub;
    Object.keys(this.links).forEach(p => { if (peers.indexOf(p) < 0) { this.closeLink(this.links[p]); delete this.links[p]; } });
    peers.forEach(p => { if (!this.links[p]) { this.links[p] = new Link(p); this.connect(this.links[p]); } });
    if (!this.sigT && peers.length) { this.sigT = setInterval(() => this.sigPoll(), 900); this.sigPoll(); }
    this.sync();
  },
  sync() { const ls = Object.values(this.links); this.state = !ls.length ? 'off' : this.ok() ? 'open' : ls.some(l => l.state === 'connecting') ? 'connecting' : 'failed'; this.paint(); },
  connect(l) {
    const g = ++l.gen; l.state = 'connecting'; l.t0 = Date.now(); this.closeLink(l, true);
    if (this.me < l.peer) this.offer(l, g);
    this.sync();
  },
  stop() {
    Object.values(this.links).forEach(l => { if (this.code) this.sig(l.peer, { type: 'bye' }).catch(() => {}); this.closeLink(l); });
    this.links = {}; clearInterval(this.sigT); this.sigT = 0; this.state = 'off'; this.code = this.me = this.hub = null; this.paint();
  },
  closeLink(l, keep) { clearInterval(l.pingT); l.pingT = 0; if (!keep) l.gen++; try { if (l.ch) l.ch.close(); } catch (e) {} try { if (l.pc) l.pc.close(); } catch (e) {} l.ch = l.pc = null; },
  sig(to, msg) { return api({ op: 'sig', code: this.code, seat: this.me, pid: PID, to: msg ? to : undefined, msg }); },
  async sigPoll() {
    const ls = Object.values(this.links); if (!this.code || !ls.length) return;
    ls.forEach(l => {
      if (l.state === 'connecting' && Date.now() - l.t0 > 20000) { l.state = 'failed'; this.sync(); }   // no direct link: the server carries the game
      if (l.state === 'failed' && Date.now() - l.t0 > 60000 && l.tries < 3) { l.tries++; this.connect(l); }
    });
    if (ls.every(l => l.state === 'open' || (l.state === 'failed' && l.tries >= 3))) return;   // (nothing to set up)
    try { const r = await this.sig(); for (const m of r.msgs || []) { const l = this.links[m.from]; if (l) await this.onSig(l, m); } } catch (e) {}
  },
  mk(l, g) {
    const pc = l.pc = new RTCPeerConnection({ iceServers: this.ICE });
    pc.onconnectionstatechange = () => { if (g === l.gen && (pc.connectionState === 'failed' || pc.connectionState === 'closed') && l.state === 'open') this.lost(l, g); };
    return pc;
  },
  gathered(pc) { return new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 2500); pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }; }); },
  async offer(l, g) {
    try {
      const pc = this.mk(l, g); this.wire(l, pc.createDataChannel('gd', { ordered: true }), g);
      await pc.setLocalDescription(await pc.createOffer()); await this.gathered(pc);
      if (g === l.gen) await this.sig(l.peer, { type: 'offer', sdp: pc.localDescription.sdp });
    } catch (e) { if (g === l.gen) { l.state = 'failed'; this.sync(); } }
  },
  async onSig(l, m) {
    const g = l.gen;
    if (m.type === 'bye') { if (l.state === 'open' || l.state === 'connecting') { this.closeLink(l, true); l.state = 'connecting'; l.t0 = Date.now(); if (this.me < l.peer) setTimeout(() => { if (g === l.gen) this.connect(l); }, 1500); this.sync(); } return; }
    if (m.type === 'offer' && this.me > l.peer) {   // (a fresh offer replaces whatever we had)
      try {
        this.closeLink(l, true); const pc = this.mk(l, g); pc.ondatachannel = e => this.wire(l, e.channel, g);
        await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp }); await pc.setLocalDescription(await pc.createAnswer()); await this.gathered(pc);
        if (g === l.gen) await this.sig(l.peer, { type: 'answer', sdp: pc.localDescription.sdp });
      } catch (e) {}
      return;
    }
    if (m.type === 'answer' && this.me < l.peer && l.pc && l.pc.signalingState === 'have-local-offer') { try { await l.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); } catch (e) {} }
  },
  wire(l, ch, g) {
    l.ch = ch;
    ch.onopen = () => {
      if (g !== l.gen) return; l.state = 'open'; l.lastPo = performance.now(); this.sync();
      clearInterval(l.pingT); l.pingT = setInterval(() => { if (performance.now() - l.lastPo > 3500) { this.lost(l, g); return; } this.raw(l, { t: 'pi', ts: performance.now() }); }, 1000);   // (no answer for 3.5 s: the link is gone, the server carries on)
      this.raw(l, { t: 'pi', ts: performance.now() }); this.emit('open', {});
    };
    ch.onclose = () => { if (g === l.gen && l.state === 'open') this.lost(l, g); };
    ch.onmessage = e => { let o = null; try { o = JSON.parse(e.data); } catch (x) { return; } if (!o || typeof o.t !== 'string') return;
      if (o.t === 'pi') { this.raw(l, { t: 'po', ts: o.ts }); return; }
      if (o.t === 'po') { l.lastPo = performance.now(); const r = performance.now() - o.ts; l.rtt = l.rtt == null ? r : l.rtt * 0.7 + r * 0.3; this.paint(); return; }
      if (!o.from) o.from = l.peer;
      if (this.hub && this.hub === this.me) Object.values(this.links).forEach(x => { if (x !== l) this.raw(x, o); });   // the host passes it on to everyone else
      this.emit(o.t, o); };
  },
  lost(l, g) { this.closeLink(l, true); l.rtt = null; l.state = 'connecting'; l.t0 = Date.now(); this.sync(); if (this.me < l.peer) setTimeout(() => { if (g === l.gen) this.connect(l); }, 800); },
  raw(l, o) { if (!l || l.state !== 'open' || !l.ch || l.ch.readyState !== 'open') return false; try { l.ch.send(JSON.stringify(o)); return true; } catch (e) { return false; } },
  // to everyone: two players, the other one; a squad game, the host (who passes it on), or from the host to all
  send(o) {
    o = Object.assign({ from: this.me }, o);
    if (this.hub && this.hub === this.me) { let any = false; Object.values(this.links).forEach(l => { if (this.raw(l, o)) any = true; }); return any; }
    return this.raw(this.main(), o);
  },
  emit(t, o) { (this.on[t] || []).forEach(f => { try { f(o); } catch (e) {} }); },
  listen(t, f) { (this.on[t] = this.on[t] || []).push(f); },
  // the server round trip, measured on the way (for the ping shown when there is no direct link)
  srv(ms) { this.srvRtt = this.srvRtt == null ? ms : this.srvRtt * 0.8 + ms * 0.2; },
  // the connection dot and ping next to the room code
  paint() {
    const el = document.getElementById('netst'); if (!el) return;
    const d = this.ok(), ms = d ? this.rtt : this.srvRtt;
    el.className = 'netst ' + (d ? 'direct' : this.state === 'connecting' ? 'conn' : 'server');
    el.title = d ? (this.hub ? 'Linked directly' + (this.hub === this.me ? ' to ' + Object.values(this.links).filter(l => l.state === 'open').length + ' players' : ' to the host') : 'Direct link to the other player') : this.state === 'connecting' ? 'Linking up' : 'Playing through the server (no direct link on this network)';
    el.textContent = (ms != null ? Math.round(ms) + ' ms' : '') + (d ? ' · direct' : this.state === 'connecting' ? ' · linking' : ms != null ? ' · server' : '');
  }
};
window.GD_NET = NET;   // (for the tests and the console)
