// Usage: node probe/summarize.js specs/<gameId>
// Reads events.json (from __specCap.events()) and writes presentation.json.
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
let ev = JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8'));
if (typeof ev === 'string') ev = JSON.parse(ev);

const spins = [];
let cur = null;
for (const e of ev) {
  if (e[1] === 'mark' && e[2] === 'start') { cur = null; continue; } // initial-state snapshot, not a spin
  if (e[1] === 'mark') { cur = { t0: e[0], ev: [] }; spins.push(cur); continue; }
  if (cur) cur.ev.push(e);
}
const count = (arr) => arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});
const top = (m, n = 40) => Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n));

// What appears in every spin is the baseline; anything rarer is a candidate feature cue.
const perSpin = spins.map((s) => {
  const keys = new Set(s.ev.filter((e) => e[1] !== 'text').map((e) => `${e[1]}:${e[2]}${e[1] === 'spine' || e[1] === 'anim' ? '=' + e[3] : ''}`));
  const end = s.ev.length ? s.ev[s.ev.length - 1][0] - s.t0 : 0;
  return { keys, ms: end, n: s.ev.length };
});
const freq = {};
for (const p of perSpin) for (const k of p.keys) freq[k] = (freq[k] || 0) + 1;
const N = spins.length;
const baseline = Object.keys(freq).filter((k) => freq[k] === N);
const rare = Object.fromEntries(Object.entries(freq).filter(([, c]) => c < N).sort((a, b) => a[1] - b[1]));

const texts = {};
for (const e of ev) if (e[1] === 'text') (texts[e[2]] = texts[e[2]] || new Set()).add(e[3]);
const textChanges = Object.fromEntries(
  Object.entries(texts).map(([k, v]) => [k, [...v].slice(0, 15)]).filter(([k]) => !/balance|win|bet|money|coin/i.test(k)),
);

const out = {
  spins: N,
  spinMs: perSpin.map((p) => p.ms),
  eventKinds: count(ev.map((e) => e[1])),
  spineAnims: top(count(ev.filter((e) => e[1] === 'spine' || e[1] === 'spineQ').map((e) => `${e[2]}=${e[3]}`))),
  clipAnims: top(count(ev.filter((e) => e[1] === 'anim').map((e) => `${e[2]}=${e[3]}`))),
  sfx: top(count(ev.filter((e) => e[1] === 'sfx' || e[1] === 'bgm').map((e) => e[2]))),
  baselineCount: baseline.length,
  rareCues: rare,
  textChanges,
};
fs.writeFileSync(path.join(dir, 'presentation.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ spins: N, kinds: out.eventKinds, rare: Object.keys(rare).length, spine: Object.keys(out.spineAnims).length, sfx: Object.keys(out.sfx).length }));
