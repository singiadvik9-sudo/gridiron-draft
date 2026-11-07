/* ---------- chat, quick lines and emotes ----------
   One widget for every conversation: an online game's room, a league, a tournament. CHAT.mount(host, opts) puts a collapsible chat box
   in host and keeps it fed; opts: { me: your name, fetch(since) -> { n, msgs }, post(text) -> { msg }, emote(k) (games only),
   quick: [lines], poll: ms (0: the caller pushes news with box.setN / box.add) }. Players you mute (click a name) are hidden everywhere,
   on this device. Messages: { i: id, f: from, t: text, at, s: seat }. */
const EMOTE = { gg: ['GG', '🤝'], nice: ['Nice!', '👍'], wow: ['Wow', '😮'], oops: ['Oops', '😬'], lol: ['Haha', '😂'], fire: ['On fire', '🔥'], clap: ['Clap', '👏'], mad: ['Ugh', '😤'] };
const QUICK = ['Nice play!', 'Good game!', 'Run it back?', 'Good luck!', 'Ouch.', 'Let\'s go!'];
const CHAT = {
  muted() { try { return JSON.parse(localStorage.getItem('gd_mute') || '[]'); } catch (e) { return []; } },
  isMuted(n) { return !!n && this.muted().indexOf(String(n).toLowerCase()) >= 0; },
  toggleMute(n) { const l = this.muted(), k = String(n).toLowerCase(), i = l.indexOf(k); if (i >= 0) l.splice(i, 1); else l.push(k); try { localStorage.setItem('gd_mute', JSON.stringify(l.slice(-200))); } catch (e) {} return i < 0; },
  mount(host, opts) {
    if (!host) return null;
    if (this.cur && !this.cur.dead) this.cur.destroy();   // (one conversation on screen at a time)
    const box = { opts, last: 0, seen: 0, msgs: [], open: false, busy: false, timer: 0, dead: false, el: document.createElement('div') };
    box.el.className = 'chatbox';
    box.el.innerHTML = '<button class="chat-tab" type="button" aria-expanded="false"><span>Chat</span><b class="chat-badge" hidden></b></button>' +
      '<div class="chat-body" hidden><ul class="chat-log" aria-live="polite"></ul>' +
      (opts.emote ? '<div class="chat-emotes">' + Object.keys(EMOTE).map(k => '<button type="button" class="emo-b" data-emo="' + k + '" title="' + EMOTE[k][0] + '">' + EMOTE[k][1] + '</button>').join('') + '</div>' : '') +
      '<div class="chat-quick">' + (opts.quick || QUICK).map(q => '<button type="button" class="btn small ghost" data-q="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' +
      '<form class="chat-form"><input type="text" maxlength="200" placeholder="Say something" aria-label="Chat message"><button class="btn small primary" type="submit">Send</button></form></div>';
    host.appendChild(box.el);
    const $b = s => box.el.querySelector(s), log = $b('.chat-log'), input = $b('input');
    box.toggle = (on) => { box.open = on == null ? !box.open : on; $b('.chat-body').hidden = !box.open; $b('.chat-tab').setAttribute('aria-expanded', box.open); box.el.classList.toggle('open', box.open); if (box.open) { box.seen = box.last; box.badge(); log.scrollTop = log.scrollHeight; } };
    box.badge = () => { const n = box.msgs.filter(m => m.i > box.seen && m.f !== opts.me && !CHAT.isMuted(m.f)).length, b = $b('.chat-badge'); b.hidden = !n || box.open; b.textContent = n > 9 ? '9+' : n; };
    box.paint = () => {
      log.innerHTML = box.msgs.filter(m => !CHAT.isMuted(m.f) || m.sys).map(m => m.sys ? '<li class="sys">' + esc(m.t) + (m.who && CHAT.isMuted(m.who) ? ' <button type="button" class="btn small ghost" data-unmute="' + esc(m.who) + '">Unmute</button>' : '') + '</li>' :
        '<li' + (m.f === opts.me ? ' class="mine"' : '') + '><button type="button" class="chat-who" data-who="' + esc(m.f) + '" title="Click to mute">' + esc(m.f) + '</button> ' + esc(m.t) + '</li>').join('');
      log.scrollTop = log.scrollHeight; box.badge();
    };
    box.add = (msgs) => {
      let ch = false;
      (msgs || []).forEach(m => { if (!m || m.i == null || box.msgs.some(x => x.i === m.i && !x.sys)) return; box.msgs.push(m); ch = true; if (m.i > box.last) box.last = m.i; });
      if (!ch) return;
      box.msgs.sort((a, b) => (a.at || 0) - (b.at || 0)); if (box.msgs.length > 120) box.msgs.splice(0, box.msgs.length - 120);
      if (box.open) box.seen = box.last;
      box.paint();
    };
    box.sys = (t, who) => { box.msgs.push({ sys: 1, i: -1, t, who, at: Date.now() }); box.paint(); };
    box.pull = async () => { if (box.busy || box.dead) return; box.busy = true; try { const r = await opts.fetch(box.last); if (r) box.add(r.msgs); } catch (e) {} box.busy = false; };
    box.setN = n => { if (n > box.last) box.pull(); };   // the other side knows there is something new
    box.send = async t => {
      t = String(t || '').trim().slice(0, 200); if (!t) return;
      try { const r = await opts.post(t); if (r && r.msg) box.add([r.msg]); input.value = ''; }
      catch (e) { box.sys(e && e.code === 'slow' ? 'Slow down a little.' : e && e.code === 'forbidden' ? 'Only members can chat here.' : 'Could not send. Check your connection.'); }
    };
    box.el.addEventListener('click', ev => {
      const t = ev.target.closest('button'); if (!t || !box.el.contains(t)) return;
      if (t.classList.contains('chat-tab')) { box.toggle(); if (box.open) input.focus(); return; }
      if (t.dataset.q) { box.send(t.dataset.q); return; }
      if (t.dataset.emo && opts.emote) { opts.emote(t.dataset.emo); return; }
      if (t.dataset.unmute) { if (CHAT.isMuted(t.dataset.unmute)) CHAT.toggleMute(t.dataset.unmute); box.sys('Unmuted ' + t.dataset.unmute + '.'); return; }
      if (t.dataset.who && t.dataset.who !== opts.me) { const on = CHAT.toggleMute(t.dataset.who); box.sys((on ? 'Muted ' : 'Unmuted ') + t.dataset.who + '.', on ? t.dataset.who : null); }
    });
    box.el.querySelector('form').addEventListener('submit', ev => { ev.preventDefault(); box.send(input.value); });
    input.addEventListener('keydown', ev => { if (ev.key === 'Escape') { input.blur(); box.toggle(false); } ev.stopPropagation(); });
    box.destroy = () => { box.dead = true; clearInterval(box.timer); box.el.remove(); };
    if (opts.poll) box.timer = setInterval(() => { if (!document.hidden) box.pull(); }, opts.poll);
    box.pull(); this.cur = box;
    return box;
  },
  // an emote over a team: a bubble that pops up for a couple of seconds next to its name on the scoreboard
  bubble(anchor, k, who) {
    if (!anchor || !EMOTE[k] || this.isMuted(who)) return;
    const b = document.createElement('span'); b.className = 'emo-bubble'; b.textContent = EMOTE[k][1] + ' ' + EMOTE[k][0];
    anchor.appendChild(b); setTimeout(() => b.classList.add('go'), 20); setTimeout(() => b.remove(), 2600);
  }
};
window.GD_CHAT = CHAT;
