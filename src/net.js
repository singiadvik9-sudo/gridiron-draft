/* ---------- the direct link between players' devices ----------
   In an online game the two screens open a WebRTC data channel to each other (set up through the room server's mailbox, op 'sig'), and
   the controller inputs for live plays, play-call nudges and pings go straight across it: about the time it takes to ping the other
   person, instead of a round trip through the server and its database. The server is still sent everything as the record (results,
   coming back to a game, watching), and when no direct link can be made (some school and work networks) play carries on through it.
   NET.state: 'off' | 'connecting' | 'open' | 'failed'. NET.rtt: the last round trip in ms, NET.via(): 'direct' or 'server'. */
const NET = {
  state: 'off', code: null, me: null, peer: null, pc: null, ch: null, gen: 0, rtt: null, srvRtt: null, on: {}, sigT: 0, pingT: 0, t0: 0, tries: 0,
  ICE: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
  ok() { return this.state === 'open' && this.ch && this.ch.readyState === 'open'; },
  via() { return this.ok() ? 'direct' : 'server'; },
  // open the link to the other seat (the lower seat makes the offer); does nothing if it is already up or on its way
  start(code, me, peer) {
    if (typeof RTCPeerConnection === 'undefined' || !code || !me || !peer) return;
    if (this.code === code && this.me === me && this.peer === peer && this.state !== 'off') return;
    this.stop(); this.code = code; this.me = me; this.peer = peer; this.tries = 0;
    this.connect();
  },
  connect() {
    const g = ++this.gen; this.state = 'connecting'; this.t0 = Date.now(); this.closePc();
    if (this.me < this.peer) this.offer(g);
    clearInterval(this.sigT); this.sigT = setInterval(() => this.sigPoll(g), 900); this.sigPoll(g);
    this.paint();
  },
  stop() {
    if (this.state !== 'off' && this.code && this.peer) this.sig({ type: 'bye' }).catch(() => {});
    this.gen++; clearInterval(this.sigT); clearInterval(this.pingT); this.sigT = this.pingT = 0; this.closePc();
    this.state = 'off'; this.code = this.me = this.peer = null; this.rtt = null; this.paint();
  },
  closePc() { try { if (this.ch) this.ch.close(); } catch (e) {} try { if (this.pc) this.pc.close(); } catch (e) {} this.ch = this.pc = null; },
  sig(msg) { return api({ op: 'sig', code: this.code, seat: this.me, pid: PID, to: msg ? this.peer : undefined, msg }); },
  async sigPoll(g) {
    if (g !== this.gen) return;
    if (this.state === 'open') { clearInterval(this.sigT); this.sigT = 0; return; }
    if (this.state === 'connecting' && Date.now() - this.t0 > 20000) { this.state = 'failed'; this.paint(); }   // no direct link: the server carries the game
    if (this.state === 'failed' && Date.now() - this.t0 > 60000) { this.tries++; if (this.tries < 4) { this.connect(); return; } clearInterval(this.sigT); this.sigT = 0; return; }
    try { const r = await this.sig(); if (g === this.gen) for (const m of r.msgs || []) await this.onSig(m, g); } catch (e) {}
  },
  mk(g) {
    const pc = this.pc = new RTCPeerConnection({ iceServers: this.ICE });
    pc.onconnectionstatechange = () => { if (g === this.gen && (pc.connectionState === 'failed' || pc.connectionState === 'closed') && this.state === 'open') this.lost(g); };
    return pc;
  },
  gathered(pc) { return new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 2500); pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }; }); },
  async offer(g) {
    try {
      const pc = this.mk(g); this.wire(pc.createDataChannel('gd', { ordered: true }), g);
      await pc.setLocalDescription(await pc.createOffer()); await this.gathered(pc);
      if (g === this.gen) await this.sig({ type: 'offer', sdp: pc.localDescription.sdp, g });
    } catch (e) { if (g === this.gen) { this.state = 'failed'; this.paint(); } }
  },
  async onSig(m, g) {
    if (m.type === 'bye') { if (this.state === 'open' || this.state === 'connecting') { this.closePc(); if (this.me < this.peer) setTimeout(() => { if (g === this.gen) this.connect(); }, 1500); } return; }
    if (m.type === 'offer' && this.me > this.peer) {   // (a fresh offer replaces whatever we had)
      try {
        this.closePc(); const pc = this.mk(g); pc.ondatachannel = e => this.wire(e.channel, g);
        await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp }); await pc.setLocalDescription(await pc.createAnswer()); await this.gathered(pc);
        if (g === this.gen) await this.sig({ type: 'answer', sdp: pc.localDescription.sdp });
      } catch (e) {}
      return;
    }
    if (m.type === 'answer' && this.me < this.peer && this.pc && this.pc.signalingState === 'have-local-offer') { try { await this.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); } catch (e) {} }
  },
  wire(ch, g) {
    this.ch = ch;
    ch.onopen = () => { if (g !== this.gen) return; this.state = 'open'; this.paint(); clearInterval(this.pingT); this.lastPo = performance.now(); this.pingT = setInterval(() => { if (performance.now() - this.lastPo > 3500) { this.lost(g); return; } this.send({ t: 'pi', ts: performance.now() }); }, 1000); this.send({ t: 'pi', ts: performance.now() }); this.emit('open', {}); };   // (no answer for 3.5 s: the link is gone, the server carries on)
    ch.onclose = () => { if (g === this.gen && this.state === 'open') this.lost(g); };
    ch.onmessage = e => { let o = null; try { o = JSON.parse(e.data); } catch (x) { return; } if (!o || typeof o.t !== 'string') return;
      if (o.t === 'pi') { this.send({ t: 'po', ts: o.ts }); return; }
      if (o.t === 'po') { this.lastPo = performance.now(); const r = performance.now() - o.ts; this.rtt = this.rtt == null ? r : this.rtt * 0.7 + r * 0.3; this.paint(); return; }
      this.emit(o.t, o); };
  },
  lost(g) { clearInterval(this.pingT); this.pingT = 0; this.rtt = null; this.closePc(); this.state = 'connecting'; this.paint(); if (this.me < this.peer) setTimeout(() => { if (g === this.gen) this.connect(); }, 800); else { this.t0 = Date.now(); clearInterval(this.sigT); this.sigT = setInterval(() => this.sigPoll(this.gen), 900); } },
  send(o) { if (!this.ok()) return false; try { this.ch.send(JSON.stringify(o)); return true; } catch (e) { return false; } },
  emit(t, o) { (this.on[t] || []).forEach(f => { try { f(o); } catch (e) {} }); },
  listen(t, f) { (this.on[t] = this.on[t] || []).push(f); },
  // the server round trip, measured on the way (for the ping shown when there is no direct link)
  srv(ms) { this.srvRtt = this.srvRtt == null ? ms : this.srvRtt * 0.8 + ms * 0.2; },
  // the connection dot and ping next to the room code
  paint() {
    const el = document.getElementById('netst'); if (!el) return;
    const d = this.ok(), ms = d ? this.rtt : this.srvRtt;
    el.className = 'netst ' + (d ? 'direct' : this.state === 'connecting' ? 'conn' : 'server');
    el.title = d ? 'Direct link to the other player' : this.state === 'connecting' ? 'Linking up with the other player' : 'Playing through the server (no direct link on this network)';
    el.textContent = (ms != null ? Math.round(ms) + ' ms' : '') + (d ? ' · direct' : this.state === 'connecting' ? ' · linking' : ms != null ? ' · server' : '');
  }
};
window.GD_NET = NET;   // (for the tests and the console)
