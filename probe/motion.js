// Usage: node probe/motion.js specs/<gameId>
// Reads motion.json (+ events.json for spin marks and tweens), writes motion-summary.json.
// Measures how things move: duration, easing fit, overshoot/bounce, per-column stagger, scroll speed.
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const rd = (f) => { let j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return typeof j === 'string' ? JSON.parse(j) : j; };
const { names, mot, parents = [] } = rd('motion.json');
const ev = fs.existsSync(path.join(dir, 'events.json')) ? rd('events.json') : [];

const PI = Math.PI, c1 = 1.70158, c3 = c1 + 1;
const bounceOut = (u) => { const n = 7.5625, d = 2.75; if (u < 1 / d) return n * u * u; if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75; if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375; return n * (u -= 2.625 / d) * u + 0.984375; };
const EASE = {
  linear: (u) => u,
  sineIn: (u) => 1 - Math.cos((u * PI) / 2), sineOut: (u) => Math.sin((u * PI) / 2), sineInOut: (u) => -(Math.cos(PI * u) - 1) / 2,
  quadIn: (u) => u * u, quadOut: (u) => 1 - (1 - u) ** 2, quadInOut: (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2),
  cubicIn: (u) => u ** 3, cubicOut: (u) => 1 - (1 - u) ** 3, cubicInOut: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2),
  quartOut: (u) => 1 - (1 - u) ** 4, quintOut: (u) => 1 - (1 - u) ** 5, expoOut: (u) => (u === 1 ? 1 : 1 - 2 ** (-10 * u)),
  backIn: (u) => c3 * u ** 3 - c1 * u * u, backOut: (u) => 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2,
  bounceOut,
  elasticOut: (u) => (u === 0 || u === 1 ? u : 2 ** (-10 * u) * Math.sin((u * 10 - 0.75) * ((2 * PI) / 3)) + 1),
};
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mode = (a) => { const m = {}; a.filter((k) => k != null).forEach((k) => (m[k] = (m[k] || 0) + 1)); return Object.entries(m).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null; };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const tmpl = (n) => n.replace(/\d+/g, '#');

// --- split each node track into motion segments ---
const byId = new Map();
for (const row of mot) { if (!byId.has(row[1])) byId.set(row[1], []); byId.get(row[1]).push(row); }
const segs = [];
for (const [id, rows] of byId) {
  rows.sort((a, b) => a[0] - b[0]);
  let cur = [rows[0]];
  const flush = () => { if (cur.length >= 4) segs.push({ id, rows: cur }); };
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const gap = b[0] - a[0] > 150;
    const still = a[2] === b[2] && a[3] === b[3] && a[4] === b[4];
    if (gap || still) { flush(); cur = [b]; } else cur.push(b);
  }
  flush();
}

function analyse(s) {
  const R = s.rows, t0 = R[0][0], t1 = R[R.length - 1][0], dur = t1 - t0;
  const span = (k) => Math.max(...R.map((r) => r[k])) - Math.min(...R.map((r) => r[k]));
  const sx = span(2), sy = span(3), ss = span(4) * 100;
  const k = sy >= sx && sy >= ss ? 3 : sx >= ss ? 2 : 4;
  const axis = { 2: 'x', 3: 'y', 4: 'scale' }[k];
  const v0 = R[0][k], v1 = R[R.length - 1][k], dist = v1 - v0;
  const out = { id: s.id, t0, t1, dur, axis, dist: r1(k === 4 ? dist : dist), x: R[0][2], y0: R[0][3] };
  if (dur < 40) { out.kind = 'jitter'; return out; }
  // Scrolling strip: steady steps one way, with wrap-around jumps the other way.
  const dl = []; for (let i = 1; i < R.length; i++) dl.push([R[i][k] - R[i - 1][k], R[i][0] - R[i - 1][0]]);
  const sgn = Math.sign(med(dl.map((x) => x[0])) || 0);
  const fwd = dl.filter((x) => Math.sign(x[0]) === sgn), back = dl.filter((x) => Math.sign(x[0]) === -sgn);
  const step = med(fwd.map((x) => Math.abs(x[0]))) || 0;
  if (k !== 4 && sgn && back.filter((x) => Math.abs(x[0]) > 1.2 * step).length >= 2) {
    out.kind = 'scroll'; out.dist = null;
    out.speed = Math.round((step / (med(fwd.map((x) => x[1])) || 16.7)) * 1000);
    return out;
  }
  // Go-and-return (stop bounce, pulse): ends where it started.
  if (Math.abs(dist) < (k === 4 ? 0.01 : 2)) {
    const dev = R.map((r) => r[k] - v0), peakI = dev.reduce((bi, v, i) => (Math.abs(v) > Math.abs(dev[bi]) ? i : bi), 0);
    const amp = dev[peakI];
    if (Math.abs(amp) < (k === 4 ? 0.01 : 2)) { out.kind = 'jitter'; return out; }
    out.kind = 'pulse'; out.dist = r1(k === 4 ? amp * 100 : amp); out.peakMs = R[peakI][0] - t0;
    out.overshoot = 0; out.bounces = 0;
    return out;
  }
  const d = Math.sign(dist);
  let over = 0, cross = 0, tReach = null;
  for (let i = 1; i < R.length; i++) {
    const e = d * (R[i][k] - v1);
    if (e > over) over = e;
    if (tReach == null && d * (R[i][k] - v1) >= 0) tReach = R[i][0];
    if (Math.sign(R[i][k] - v1) !== Math.sign(R[i - 1][k] - v1) && R[i][k] !== v1) cross++;
  }
  let best = null;
  for (const [nm, f] of Object.entries(EASE)) {
    let e = 0;
    for (const r of R) { const u = (r[0] - t0) / dur, p = (r[k] - v0) / dist; e += (p - f(u)) ** 2; }
    e = Math.sqrt(e / R.length);
    if (!best || e < best[1]) best = [nm, e];
  }
  out.kind = 'move';
  out.ease = best[0]; out.fit = Math.round(best[1] * 1000) / 1000;
  out.overshoot = r1(k === 4 ? over * 100 : over); out.bounces = cross;
  out.settleMs = tReach != null ? t1 - tReach : null;
  return out;
}
const A = segs.map(analyse).filter((a) => a.kind === 'move' || a.kind === 'scroll' || a.kind === 'pulse');

// --- spins from event marks ---
const marks = ev.filter((e) => e[1] === 'mark' && e[2] === 'spin').map((e) => e[0]);
const spinOf = (t) => { let i = -1; for (let j = 0; j < marks.length; j++) if (marks[j] <= t) i = j; return i; };

// --- group by node template + axis + direction ---
const groups = new Map();
for (const a of A) {
  const key = `${tmpl(names[a.id])}|${a.axis}|${a.dist == null ? '' : a.dist > 0 ? '+' : '-'}|${a.kind}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(a);
}
const out = [];
for (const [key, L] of groups) {
  const [node, axis, dir, kind] = key.split('|');
  const spins = new Set(L.map((a) => spinOf(a.t0)).filter((i) => i >= 0));
  // per spin: columns (parent name or x) -> start/end; stagger between consecutive columns
  const startStag = [], endStag = [];
  for (const sp of spins) {
    const cols = new Map();
    for (const a of L) {
      if (spinOf(a.t0) !== sp) continue;
      const colOf = (b) => parents[b.id] || names[b.id].split('/')[0];
      const ck = new Set(L.map(colOf)).size > 1 ? colOf(a) : new Set(L.map((b) => Math.round(b.x / 10))).size > 1 ? String(Math.round(a.x / 10)) : String(a.id);
      const c = cols.get(ck) || { s: Infinity, e: -Infinity };
      c.s = Math.min(c.s, a.t0); c.e = Math.max(c.e, a.t1); cols.set(ck, c);
    }
    if (cols.size < 3) continue;
    const cs = [...cols.values()].sort((p, q) => p.s - q.s);
    for (let i = 1; i < cs.length; i++) startStag.push(cs[i].s - cs[i - 1].s);
    const ce = [...cols.values()].sort((p, q) => p.e - q.e);
    for (let i = 1; i < ce.length; i++) endStag.push(ce[i].e - ce[i - 1].e);
  }
  out.push({
    node, axis, dir, kind, count: L.length, spins: spins.size,
    durMs: med(L.map((a) => a.dur)), peakMs: med(L.map((a) => a.peakMs).filter((v) => v != null)), dist: kind === 'scroll' ? null : r1(med(L.map((a) => Math.abs(a.dist)))),
    ease: mode(L.map((a) => a.ease)), fit: med(L.map((a) => a.fit).filter((v) => v != null)),
    overshoot: r1(med(L.map((a) => a.overshoot))), bounces: med(L.map((a) => a.bounces)), settleMs: med(L.map((a) => a.settleMs).filter((v) => v != null)),
    speed: kind === 'scroll' ? med(L.map((a) => a.speed)) : undefined,
    startStaggerMs: med(startStag), stopStaggerMs: med(endStag),
  });
}
out.sort((a, b) => b.spins - a.spins || b.count - a.count);

// --- tweens / actions straight from the engine ---
const tw = new Map();
for (const e of ev) {
  if (e[1] !== 'tween' && e[1] !== 'action') continue;
  const k = `${e[1]}|${tmpl(e[2])}|${e[3]}`;
  tw.set(k, (tw.get(k) || 0) + 1);
}
const tweens = [...tw].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, n]) => {
  const [kind, target, ...rest] = k.split('|');
  return kind === 'tween' ? { kind, target, op: rest[0], durS: Number(rest[1]), ease: rest[2], props: rest[3], count: n } : { kind, target, durS: rest[0], ease: rest[1], count: n };
});

const summary = { spins: marks.length, samples: mot.length, groups: out.slice(0, 80), tweens };
fs.writeFileSync(path.join(dir, 'motion-summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ spins: marks.length, samples: mot.length, segments: A.length, groups: out.length, tweens: tweens.length }));
