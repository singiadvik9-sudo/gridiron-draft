// Shared helpers for the serverless functions: Redis (Upstash REST) with an in-memory fallback,
// accounts (scrypt + session tokens), and small utilities.
const crypto = require('crypto');
const zlib = require('zlib');
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const mem = globalThis.__gdmem || (globalThis.__gdmem = new Map());
const DAY = 86400;

function memCmd(a) {
  const op = String(a[0]).toUpperCase(), now = Date.now();
  const get = k => { const v = mem.get(k); if (!v) return null; if (v.exp && v.exp < now) { mem.delete(k); return null; } return v.val; };
  if (op === 'GET') return get(a[1]);
  if (op === 'MGET') return a.slice(1).map(get);
  if (op === 'DEL') { let n = 0; a.slice(1).forEach(k => { if (mem.delete(k)) n++; }); return n; }
  if (op === 'SET') {
    let nx = false, exp = 0;
    for (let i = 3; i < a.length; i++) {
      const o = String(a[i]).toUpperCase();
      if (o === 'NX') nx = true; else if (o === 'EX') exp = now + a[++i] * 1000; else if (o === 'PX') exp = now + +a[++i];
    }
    if (nx && get(a[1]) !== null) return null;
    mem.set(a[1], { val: a[2], exp }); return 'OK';
  }
  throw new Error('unsupported ' + op);
}
async function cmd(args) {
  if (!URL_ || !TOKEN) return memCmd(args);
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const parse = v => { try { return v ? JSON.parse(v) : null; } catch (e) { return null; } };
const getJ = async k => parse(await cmd(['GET', k]));
const setJ = (k, v, ttl) => ttl ? cmd(['SET', k, JSON.stringify(v), 'EX', ttl]) : cmd(['SET', k, JSON.stringify(v)]);
// big documents (leagues, saves) are stored gzipped+base64 so they stay far below the Redis request cap
const putZ = (k, v, ttl) => { const z = zlib.gzipSync(Buffer.from(JSON.stringify(v))).toString('base64'); return ttl ? cmd(['SET', k, z, 'EX', ttl]) : cmd(['SET', k, z]); };
const parseZ = z => { if (!z) return null; try { return JSON.parse(zlib.gunzipSync(Buffer.from(z, 'base64')).toString()); } catch (e) { return null; } };
const getZ = async k => parseZ(await cmd(['GET', k]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function withLock(key, fn) {
  const lk = 'gd:lock:' + key;
  for (let i = 0; i < 60; i++) {
    const ok = await cmd(['SET', lk, '1', 'NX', 'PX', 9000]);
    if (ok) { try { return await fn(); } finally { await cmd(['DEL', lk]); } }
    await sleep(50 + Math.random() * 80);
  }
  const e = new Error('busy'); e.code = 'busy'; throw e;
}
function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' ? b : null;
}
const send = (res, code, obj) => { res.status(code).json(obj); };
const fail = (res, code, error) => send(res, code, { error });
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').slice(0, n);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randCode = () => { let c = ''; for (let k = 0; k < 5; k++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; return c; };

/* accounts */
const uKey = n => 'gd:u:' + String(n).toLowerCase();
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
async function userFrom(req) {
  const t = req.headers && (req.headers['x-token'] || req.headers['X-Token']);
  if (!t || !/^[a-f0-9]{48}$/.test(t)) return null;
  const name = await cmd(['GET', 'gd:s:' + t]);
  if (!name) return null;
  const u = await getJ(uKey(name));
  return u ? u : null;
}
async function newSession(name) {
  const t = crypto.randomBytes(24).toString('hex');
  await cmd(['SET', 'gd:s:' + t, name, 'EX', 30 * DAY]);
  return t;
}
async function addToUser(name, field, code) {
  await withLock('user:' + name.toLowerCase(), async () => {
    const u = await getJ(uKey(name)); if (!u) return;
    u[field] = u[field] || [];
    if (u[field].indexOf(code) < 0) u[field].push(code);
    await setJ(uKey(name), u);
  });
}
async function pushHist(name, entry) {
  await withLock('user:' + name.toLowerCase(), async () => {
    const u = await getJ(uKey(name)); if (!u) return;
    u.hist = u.hist || [];
    u.hist.unshift(entry); if (u.hist.length > 200) u.hist.length = 200;
    await setJ(uKey(name), u);
  });
}
module.exports = { putZ, getZ, parseZ, cmd, getJ, setJ, parse, withLock, readBody, send, fail, clean, randCode, uKey, hashPw, userFrom, newSession, addToUser, pushHist, DAY, sleep, hasRedis: !!(URL_ && TOKEN) };
