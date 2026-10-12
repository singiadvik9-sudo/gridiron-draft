const crypto = require('crypto');
const { cmd, getJ, setJ, readBody, send, fail, clean, uKey, hashPw, userFrom, newSession, withLock } = require('./_lib');
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const b = readBody(req); if (req.method !== 'POST' || !b) return fail(res, 400, 'bad_request');
  try {
    if (b.op === 'register') {
      const name = String(b.name || '').trim(), pw = String(b.password || '');
      if (!NAME_RE.test(name)) return fail(res, 400, 'bad_name');
      if (pw.length < 6 || pw.length > 100) return fail(res, 400, 'bad_password');
      const salt = crypto.randomBytes(16).toString('hex');
      const rec = { name, salt, hash: hashPw(pw, salt), created: Date.now(), hist: [], lg: [], tn: [] };
      const ok = await cmd(['SET', uKey(name), JSON.stringify(rec), 'NX']);
      if (ok === null) return fail(res, 409, 'name_taken');
      return send(res, 200, { name, token: await newSession(name) });
    }
    if (b.op === 'login') {
      const u = await getJ(uKey(String(b.name || '').trim()));
      if (!u) return fail(res, 401, 'bad_login');
      const h = Buffer.from(hashPw(String(b.password || ''), u.salt), 'hex'), want = Buffer.from(u.hash, 'hex');
      if (h.length !== want.length || !crypto.timingSafeEqual(h, want)) return fail(res, 401, 'bad_login');
      return send(res, 200, { name: u.name, token: await newSession(u.name) });
    }
    const u = await userFrom(req);
    if (!u) return fail(res, 401, 'auth');
    if (b.op === 'me') return send(res, 200, { name: u.name, hist: u.hist || [] });
    if (b.op === 'logout') { const t = req.headers['x-token']; await cmd(['DEL', 'gd:s:' + t]); return send(res, 200, { ok: true }); }
    if (b.op === 'delhist') {
      await withLock('user:' + u.name.toLowerCase(), async () => {
        const cur = await getJ(uKey(u.name)); cur.hist = (cur.hist || []).filter(h => h.ts !== b.ts); await setJ(uKey(u.name), cur);
      });
      return send(res, 200, { ok: true });
    }
    if (b.op === 'clearhist') {
      await withLock('user:' + u.name.toLowerCase(), async () => { const cur = await getJ(uKey(u.name)); cur.hist = []; await setJ(uKey(u.name), cur); });
      return send(res, 200, { ok: true });
    }
    return fail(res, 400, 'bad_request');
  } catch (e) { return fail(res, 500, 'server'); }
};
