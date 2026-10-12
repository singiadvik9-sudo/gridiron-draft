// Campaign saves attached to an account: 5 slots per user.
const { putZ, getZ, cmd, getJ, setJ, readBody, send, fail, userFrom, clean } = require('./_lib');
module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const b = readBody(req); if (req.method !== 'POST' || !b) return fail(res, 400, 'bad_request');
  try {
    const u = await userFrom(req); if (!u) return fail(res, 401, 'auth');
    const nm = u.name.toLowerCase(), slotKey = n => 'gd:sv:' + nm + ':' + n, metaKey = n => 'gd:svm:' + nm + ':' + n;
    if (b.op === 'list') {
      const m = await cmd(['MGET'].concat([1, 2, 3, 4, 5].map(metaKey)));
      return send(res, 200, { slots: m.map((x, i) => x ? Object.assign({ slot: i + 1 }, JSON.parse(x)) : { slot: i + 1, empty: true }) });
    }
    const slot = +b.slot; if (!(slot >= 1 && slot <= 5)) return fail(res, 400, 'bad_request');
    if (b.op === 'get') { const v = await getZ(slotKey(slot)); return v ? send(res, 200, { L: v }) : fail(res, 404, 'empty'); }
    if (b.op === 'put') {
      const L = b.L; if (!L || typeof L !== 'object' || !L.teams || !L.players) return fail(res, 400, 'bad_request');
      const s = JSON.stringify(L); if (s.length > 2500000) return fail(res, 413, 'too_big');
      const t = L.teams[L.user]; const meta = { team: t ? t.name : '', season: L.season, week: L.week, phase: L.phase, updated: Date.now() };
      await putZ(slotKey(slot), L); await cmd(['SET', metaKey(slot), JSON.stringify(meta)]);
      return send(res, 200, { ok: true, meta });
    }
    if (b.op === 'delete') { await cmd(['DEL', slotKey(slot), metaKey(slot)]); return send(res, 200, { ok: true }); }
    return fail(res, 400, 'bad_request');
  } catch (e) { return fail(res, 500, 'server'); }
};
