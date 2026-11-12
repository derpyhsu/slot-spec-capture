// Usage: node probe/reels.js specs/<gameId>
// Player-facing reel feel in grid cells, per speed mode, plus win-sequence timing.
// Reads motion.json, events.json, meta.json. Writes reels.json and merges it into spec.json
// as presentation.measured. Values: number = measured, "none" = observed absent, null = not measurable.
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const rd = (f) => { const p = path.join(dir, f); if (!fs.existsSync(p)) return null; let j = JSON.parse(fs.readFileSync(p, 'utf8')); return typeof j === 'string' ? JSON.parse(j) : j; };
const { names, parents = [], mot } = rd('motion.json');
const ev = rd('events.json') || [];
const meta = rd('meta.json') || {};
const med = (a) => { const s = a.filter((v) => v != null && !Number.isNaN(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const r0 = (v) => (v == null ? null : Math.round(v));
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const tmpl = (n) => n.replace(/-?\d+/g, '#');

// 1. reel symbol nodes: the symbol-like template with the most samples
const cnt = {};
for (const r of mot) { const k = tmpl(names[r[1]]); cnt[k] = (cnt[k] || 0) + 1; }
const cand = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
const reelT = (cand.find(([k]) => /symbol|Symbol|SlotRollerItem|PokerSymbol|Item/.test(k)) || cand[0] || [])[0];
const reelIds = new Set(names.map((n, i) => (tmpl(n) === reelT ? i : -1)).filter((i) => i >= 0));
const useParent = new Set([...reelIds].map((i) => parents[i])).size > 1;
const colOf = (i) => (useParent ? parents[i] : (names[i].match(/_(\d+)_/) || [, '0'])[1]);

// samples per node
const byId = new Map();
for (const r of mot) if (reelIds.has(r[1])) { if (!byId.has(r[1])) byId.set(r[1], []); byId.get(r[1]).push(r); }
for (const L of byId.values()) L.sort((a, b) => a[0] - b[0]);

// 2. cell height: spacing between neighbouring symbols of one column in the same frame
const frameY = new Map();
for (const [id, L] of byId) for (const r of L) { const k = colOf(id) + '@' + r[0]; if (!frameY.has(k)) frameY.set(k, []); frameY.get(k).push(r[3]); }
const gaps = {};
for (const ys of frameY.values()) {
  if (ys.length < 3) continue;
  const s = ys.sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) { const g = Math.round(s[i] - s[i - 1]); if (g > 20) gaps[g] = (gaps[g] || 0) + 1; }
}
const cellPx = Number((Object.entries(gaps).sort((a, b) => b[1] - a[1])[0] || [])[0]) || null;

// columns ordered left to right by x
const colX = new Map();
for (const [id, L] of byId) { const c = colOf(id); if (!colX.has(c)) colX.set(c, L[0][2]); }
const cols = [...colX.keys()];
// parents share x=0 when each reel has its own parent; fall back to name order
cols.sort((a, b) => (colX.get(a) - colX.get(b)) || String(a).localeCompare(String(b), undefined, { numeric: true }));

// 3. spins (and quick stops) from marks
const marks = ev.filter((e) => e[1] === 'mark' && (e[2] === 'spin' || e[2] === 'qs'));
const qsTaps = ev.filter((e) => e[1] === 'mark' && e[2] === 'qsTap');
const spins = marks.map((m, i) => ({ t0: m[0], t1: i + 1 < marks.length ? marks[i + 1][0] : Infinity, quick: m[2] === 'qs', mode: !m[3] || /^\d+$/.test(m[3]) ? 'normal' : m[3] }));

function columnCurve(c, t0, t1) {
  // per-frame median displacement across the column's nodes, wraps removed
  const frames = new Map();
  for (const [id, L] of byId) {
    if (colOf(id) !== c) continue;
    for (let i = 1; i < L.length; i++) {
      const a = L[i - 1], b = L[i];
      if (b[0] < t0 || b[0] >= t1 || b[0] - a[0] > 100) continue;
      const d = b[3] - a[3];
      if (cellPx && Math.abs(d) > 2 * cellPx) continue; // wrap-around jump
      if (!frames.has(b[0])) frames.set(b[0], []);
      frames.get(b[0]).push([d, b[0] - a[0]]);
    }
  }
  return [...frames.entries()].sort((a, b) => a[0] - b[0]).map(([t, ds]) => ({ t, d: med(ds.map((x) => x[0])), dt: med(ds.map((x) => x[1])) || 16.7 }));
}

function analyseSpin(s) {
  const per = [];
  for (const c of cols) {
    const F = columnCurve(c, s.t0, Math.min(s.t1, s.t0 + 60000));
    const mv = F.filter((f) => Math.abs(f.d) > 0.5);
    if (mv.length < 3) { per.push(null); continue; }
    const start = mv[0].t, stop = mv[mv.length - 1].t;
    const dir = Math.sign(F.reduce((a, f) => a + f.d, 0)) || -1;
    const v = mv.map((f) => (f.d / f.dt) * 1000);
    const vmax = Math.max(...v.map(Math.abs));
    const steady = med(v.filter((x) => Math.abs(x) > 0.5 * vmax).map(Math.abs));
    let off = 0, ext = -Infinity, tExt = stop, finalOff = 0;
    const offs = [];
    for (const f of F) { if (f.t < start) continue; off += f.d; offs.push([f.t, off]); }
    finalOff = off;
    for (const [t, o] of offs) if (dir * o > ext) { ext = dir * o; tExt = t; }
    // deceleration: from the last frame still at >= 90% steady speed to the extreme point
    let tDec = start;
    for (let i = 0; i < mv.length; i++) if (mv[i].t <= tExt && Math.abs(v[i]) >= 0.9 * steady) tDec = mv[i].t;
    const over = ext - dir * finalOff;
    per.push({ start: start - s.t0, stop: stop - s.t0, steady, decel: tExt - tDec, over, bounceMs: stop - tExt });
  }
  return per;
}

const res = spins.map((s) => ({ ...s, cols: analyseSpin(s) }));

// 4. per speed mode
const modes = {};
for (const s of res.filter((x) => !x.quick)) (modes[s.mode] = modes[s.mode] || []).push(s);
const cell = (px) => (cellPx && px != null ? px / cellPx : null);
const speedModes = Object.entries(modes).map(([mode, S]) => {
  const ok = S.map((s) => s.cols).filter((c) => c.filter(Boolean).length === cols.length);
  const startGap = [], stopGap = [], speed = [], decel = [], over = [], bms = [];
  for (const c of ok) {
    for (let i = 1; i < c.length; i++) { startGap.push(c[i].start - c[i - 1].start); stopGap.push(c[i].stop - c[i - 1].stop); }
    for (const x of c) { speed.push(x.steady); decel.push(x.decel); over.push(x.over); bms.push(x.bounceMs); }
  }
  const sg = med(startGap), ov = cell(med(over));
  const bounce = ov == null ? null : ov < 0.02 ? 'none' : { cells: r2(ov), ms: r0(med(bms)) };
  return {
    mode, spins: S.length, analysed: ok.length,
    startGapMs: sg == null ? null : Math.abs(sg) < 20 ? 0 : r0(sg),
    scrollCellsPerSec: r2(cell(med(speed))),
    stopGapMs: r0(med(stopGap)), decelMs: r0(med(decel)), bounce,
    firstStopMs: r0(med(ok.map((c) => c[0].stop))), lastStopMs: r0(med(ok.map((c) => c[c.length - 1].stop))),
  };
});

// quick stop: from the second tap to the last reel at rest
const qsBy = {};
for (const s of res.filter((x) => x.quick)) {
  const tap = qsTaps.find((m) => m[0] >= s.t0 && m[0] < s.t1);
  const ok = s.cols.filter(Boolean);
  const last = Math.max(...ok.map((c) => c.stop));
  if (!tap || !Number.isFinite(last)) continue;
  const q = (qsBy[s.mode] = qsBy[s.mode] || { toStop: [], gaps: [], bounce: [] });
  q.toStop.push(s.t0 + last - tap[0]);
  const st = ok.map((c) => c.stop).sort((a, b) => a - b);
  q.gaps.push(st[st.length - 1] - st[0]);
  q.bounce.push(med(ok.map((c) => c.over)));
}
const quickStop = Object.entries(qsBy).map(([mode, q]) => {
  const ov = cell(med(q.bounce));
  return { mode, samples: q.toStop.length, tapToAllStoppedMs: r0(med(q.toStop)), firstToLastReelMs: r0(med(q.gaps)), bounce: ov == null ? null : ov < 0.02 ? 'none' : { cells: r2(ov) } };
});

// 4b. anticipation (咪牌): extra wait on a reel compared with the mode's usual stop gap
const antic = [];
for (const sp of res.filter((x) => !x.quick)) {
  const mm = speedModes.find((m) => m.mode === sp.mode); if (!mm || !sp.cols.every(Boolean)) continue;
  const base = Math.max(mm.stopGapMs || 0, 1);
  for (let i = 1; i < sp.cols.length; i++) {
    const gap = sp.cols[i].stop - sp.cols[i - 1].stop;
    if (gap > base + 300) antic.push({ mode: sp.mode, reel: i + 1, extraWaitMs: r0(gap - base), slowCellsPerSec: r2(cell(sp.cols[i].steady)) });
  }
}

// 5. win sequence (generic event families, no node names in output)
const num = (x) => { const m = String(x).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
const showFreq = {};
for (const s of res) {
  const seen = new Set(ev.filter((e) => e[0] >= s.t0 && e[0] < s.t1 && e[1] === 'show').map((e) => e[2]));
  for (const n of seen) showFreq[n] = (showFreq[n] || 0) + 1;
}
const winSpins = [];
let lastBet = null;
for (const s of res.filter((x) => !x.quick)) {
  const E = ev.filter((e) => e[0] >= s.t0 && e[0] < s.t1);
  for (const e of ev) if (e[1] === 'text' && /bet/i.test(e[2]) && e[0] < s.t0 && num(e[3])) lastBet = num(e[3]);
  const stopAll = Math.max(...s.cols.filter(Boolean).map((c) => c.stop));
  if (!Number.isFinite(stopAll)) continue;
  const T = s.t0 + stopAll;
  const isWinLbl = (e) => e[1] === 'text' && !/balance|bet|round|id|time|auto/i.test(e[2]) && /[¥$€]|d.d/.test(e[3]) && num(e[3]) > 0;
  const winTexts = E.filter((e) => isWinLbl(e) && e[0] >= T - 50);
  const winT = winTexts[0];
  if (!winT) continue;
  const readyE = E.find((e) => e[1] === 'ready' && e[3] === '1' && e[0] >= T);
  const line = E.find((e) => e[1] === 'show' && /line/i.test(e[2]) && e[0] >= T - 50 && (!readyE || e[0] <= readyE[0]));
  const bal = E.filter((e) => e[1] === 'text' && /balance/i.test(e[2]) && e[0] >= T);
  const ready = E.find((e) => e[1] === 'ready' && e[3] === '1' && e[0] >= T);
  const special = E.filter((e) => e[1] === 'show' && e[0] >= T - 50 && e[0] < Math.min(line ? line[0] : Infinity, winT[0]) && showFreq[e[2]] <= 0.5 * res.length && !/line|win|balance|marquee/i.test(e[2]));
  const big = E.find((e) => e[1] === 'show' && /big.?win|mega|super.?win|epic/i.test(e[2]));
  const bigEnd = big && E.find((e) => e[1] === 'hide' && e[2] === big[2] && e[0] > big[0]);
  const winVals = winTexts.map((e) => num(e[3])).filter((v) => v > 0);
  const winAmt = winVals.length ? Math.max(...winVals) : null;
  const rel = (e) => (e ? e[0] - s.t0 : null);
  winSpins.push({
    mode: s.mode, reelsStoppedMs: r0(stopAll),
    specialMs: special.length ? [r0(special[0][0] - s.t0), r0(Math.min(line ? line[0] : Infinity, winT[0]) - s.t0)] : 'none',
    lineMs: line ? r0(rel(line)) : null, winShownMs: r0(rel(winT)), winCountMs: [r0(rel(winT)), r0(rel(winTexts[winTexts.length - 1]))],
    balanceRollMs: bal.length ? [r0(rel(bal[0])), r0(rel(bal[bal.length - 1]))] : null,
    readyMs: ready ? r0(rel(ready)) : null,
    bigWin: big ? { startMs: r0(rel(big)), endMs: bigEnd ? r0(rel(bigEnd)) : null } : 'none',
    winX: winAmt && lastBet ? r2(winAmt / lastBet) : null,
    winValues: [...new Set(winVals)].slice(0, 6),
  });
}

const measured = {
  cell: { heightPx: cellPx, design: meta.design || null, columns: cols.length },
  speedModes, quickStop, anticipation: antic.length ? antic : 'notSeen',
  winSequence: winSpins.slice(0, 12),
  bigWinSeen: winSpins.filter((w) => w.bigWin !== 'none').map((w) => ({ winX: w.winX, startMs: w.bigWin.startMs, endMs: w.bigWin.endMs })),
};
fs.writeFileSync(path.join(dir, 'reels.json'), JSON.stringify(measured, null, 1));
const sp = path.join(dir, 'spec.json');
if (fs.existsSync(sp)) {
  const spec = JSON.parse(fs.readFileSync(sp, 'utf8'));
  spec.presentation = spec.presentation || {};
  spec.presentation.measured = measured;
  fs.writeFileSync(sp, JSON.stringify(spec, null, 2));
}
console.log(JSON.stringify({ reelTemplate: reelT, cols: cols.length, cellPx, modes: speedModes.map((m) => [m.mode, m.analysed, m.scrollCellsPerSec, m.stopGapMs, m.decelMs, m.bounce]), quickStop, antic: antic.length, winSpins: winSpins.length }));
