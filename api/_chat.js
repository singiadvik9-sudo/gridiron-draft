// Chat shared by game rooms, leagues and tournaments: one document per conversation ({ n: last id, m: the last 100 messages }), a short
// rate limit per person, and a filter for the worst words. Who may read and write is the caller's business.
const { cmd, getJ, setJ, withLock, clean } = require('./_lib');
const KEEP = 100, LEN = 200;
// (whole words, and the usual spellings around them; replaced with asterisks)
const BAD = ['fuck', 'fucking', 'fucker', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'asshole', 'bastard', 'whore', 'slut', 'fag', 'faggot', 'nigger', 'nigga', 'retard', 'retarded', 'kys'];
const BAD_RE = new RegExp('\\b(' + BAD.map(w => w.split('').map(c => c.replace(/[a-z]/, x => '[' + x + ({ a: '@4', e: '3', i: '1!', o: '0', s: '$5' }[x] || '') + ']')).join('[^a-z0-9]?')).join('|') + ')s?\\b', 'gi');
const filter = t => t.replace(BAD_RE, w => w[0] + '*'.repeat(Math.max(1, w.length - 1)));
function err(code, msg) { const e = new Error(msg || code); e.code = code; e.status = 429; return e; }
// post a message; throws { code: 'slow' } when someone sends too fast (one every 0.7 s, eight in ten seconds)
async function post(key, from, text, ttl, extra) {
  text = filter(clean(text, LEN).replace(/\s+/g, ' ').trim());
  if (!text) { const e = err('empty'); e.status = 400; throw e; }
  const rk = 'gd:cr:' + key + ':' + from;
  if ((await cmd(['SET', rk, '1', 'NX', 'PX', 700])) === null) throw err('slow');
  const bk = 'gd:cb:' + key + ':' + from, burst = (await getJ(bk)) || { n: 0, at: Date.now() };
  if (Date.now() - burst.at > 10000) { burst.n = 0; burst.at = Date.now(); }
  if (++burst.n > 8) throw err('slow');
  await setJ(bk, burst, 12);
  return withLock('chat:' + key, async () => {
    const doc = (await getJ(key)) || { n: 0, m: [] };
    const msg = Object.assign({ i: ++doc.n, f: clean(from, 24), t: text, at: Date.now() }, extra || {});
    doc.m.push(msg); if (doc.m.length > KEEP) doc.m.splice(0, doc.m.length - KEEP);
    await setJ(key, doc, ttl);
    return msg;
  });
}
// a line from the game itself (an approval, someone joining): no rate limit, shown as a note
async function sys(key, text, ttl) {
  return withLock('chat:' + key, async () => {
    const doc = (await getJ(key)) || { n: 0, m: [] };
    const msg = { i: ++doc.n, f: '', t: clean(text, 300), at: Date.now(), sys: 1 };
    doc.m.push(msg); if (doc.m.length > KEEP) doc.m.splice(0, doc.m.length - KEEP);
    await setJ(key, doc, ttl); return msg;
  });
}
// messages after id `since` (all of the last 100 when since is 0)
async function list(key, since) {
  const doc = (await getJ(key)) || { n: 0, m: [] }, s = Number.isInteger(since) && since > 0 ? since : 0;
  return { n: doc.n, msgs: doc.m.filter(m => m.i > s) };
}
module.exports = { post, sys, list, filter, LEN };
