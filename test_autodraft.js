// Pick for me / Auto-draft: plan the best lineup that fits under the salary cap, then take the planned player hardest to replace.
const DR = require('./lib/draft.js');
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
const score = (d, t) => DR.teamIds(d, t).reduce((s, id) => s + DR.W[DR.BY[id].k] * DR.BY[id].ovr, 0);
// a fresh board: the plan is a full lineup within the cap, and no other lineup in a brute-force check of cheaper swaps beats it
const d0 = DR.newDraft(2, DR.CAPS.tight, 0), p0 = DR.planLineup(d0, 0);
const planned = Object.values(p0.pick).reduce((a, cs) => a.concat(cs), []);
ok(planned.length === 11 && DR.KINDS.every(k => p0.pick[k].length === DR.NEED[k]), 'the plan fills all 11 slots');
ok(planned.reduce((s, c) => s + c.sal, 0) <= DR.CAPS.tight + 1e-6, 'the planned lineup fits under the cap ($' + Math.round(planned.reduce((s, c) => s + c.sal, 0)) + 'M of $' + DR.CAPS.tight + 'M)');
let better = 0;
for (const c of planned) for (const o of DR.CANDS.filter(x => x.k === c.k && planned.indexOf(x) < 0)) {
  const cost = planned.reduce((s, x) => s + x.sal, 0) - c.sal + o.sal, val = p0.value - DR.W[c.k] * c.ovr + DR.W[c.k] * o.ovr;
  if (cost <= DR.CAPS.tight + 1e-6 && val > p0.value + 1e-9) better++;
}
ok(better === 0, 'no single swap makes a better lineup that still fits');
const noCap = DR.planLineup(DR.newDraft(2, 0, 0), 0);
ok(DR.KINDS.every(k => noCap.pick[k][0].ovr === Math.max(...DR.CANDS.filter(c => c.k === k).map(c => c.ovr))), 'without a cap the plan is the best player at every slot');
// whole drafts against the CPU: always legal, never over the cap, and better lineups than the old pick-for-me
for (const n of [2, 4, 8]) for (const cap of [0, DR.CAPS.tight, DR.CAPS.standard]) {
  let oldS = 0, newS = 0, bad = 0;
  for (let seed = 1; seed <= 6; seed++) for (const mode of ['old', 'new']) {
    let x = seed * 7919; const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
    const d = DR.newDraft(n, cap, seed % n);
    while (!DR.isDone(d)) { const t = DR.onClock(d), id = t === 0 && mode === 'new' ? DR.bestPick(d, 0) : DR.cpuPick(d, t, rnd); if (DR.legal(d, t, id)) bad++; DR.apply(d, t, id); }
    if (cap && DR.spent(DR.teamIds(d, 0)) > cap + 1e-6) bad++;
    if (mode === 'old') oldS += score(d, 0); else newS += score(d, 0);
  }
  ok(bad === 0 && newS >= oldS - 0.01, n + ' teams, ' + (cap ? 'cap $' + cap + 'M' : 'no cap') + ': every pick legal, under the cap, lineup ' + (newS / 6).toFixed(2) + ' vs ' + (oldS / 6).toFixed(2) + ' before');
}
console.log('ALL DONE');
