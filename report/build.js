// Usage: node report/build.js specs/<gameId>
// Renders spec.json into spec.md for humans. No judgement added: it only formats what spec.json says.
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const s = JSON.parse(fs.readFileSync(path.join(dir, 'spec.json'), 'utf8'));

const SRC = { rules: '規則頁', observed: '實玩觀察', clientConfig: '客戶端設定', inferred: '推測', unknown: '未知' };
const CONF = { high: '高', medium: '中', low: '低' };
const CORE = {
  grid: '盤面', payModel: '賠付方式', waysOrLines: 'Ways / 線數', payDirection: '連線方向', minMatch: '最少連線數',
  spinMode: '轉動方式', dropMode: '掉落方式', cascade: '消除連鎖', freeGame: '免費遊戲', buyFeature: '購買免費遊戲',
  lines: '線表', symbols: '符號表', extraBet: '加押', multiplierReel: '倍數軸', split: '分裂', volatility: '波動度',
  wild: 'WILD', scatter: 'SCATTER', paytable: '賠付表', rtp: 'RTP', maxWin: '最高贏分', betRange: '押注', jackpot: 'Jackpot',
};
const PRES = { spinMs: '一般轉一次 (ms)', reelStop: '停輪方式', winShow: '中獎表演', character: '角色', speedModes: '速度模式' };
const DURING = { base: '主遊戲', free: '免費遊戲', both: '主遊戲＋免費遊戲', buy: '購買' };

const esc = (t) => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');
function fmt(v) {
  if (v === null || v === undefined) return '量不到';
  if (v === 'none') return '無';
  if (Array.isArray(v)) return v.map(fmt).join('、');
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${typeof x === 'object' && x !== null ? JSON.stringify(x) : x}`).join('；');
  return String(v);
}
function fieldRows(obj, names) {
  const rows = ['| 項目 | 內容 | 來源 | 可信度 | 備註 |', '|---|---|---|---|---|'];
  for (const [k, label] of Object.entries(names)) {
    const f = obj && obj[k];
    if (!f) continue;
    if (k === 'symbols' || k === 'lines') { rows.push(`| ${label} | 見下方 | ${SRC[f.source] || f.source} | ${CONF[f.confidence] || '—'} | ${esc(f.note || '')} |`); continue; }
    if (k === 'paytable' && typeof f.value === 'string') { rows.push(`| ${label} | ${esc(f.value)} | ${SRC[f.source] || f.source} | ${CONF[f.confidence] || '—'} | |`); continue; }
    if (k === 'paytable') { rows.push(`| ${label} | 見下方賠付表 | ${SRC[f.source] || f.source} | ${CONF[f.confidence] || '—'} | ${esc(f.note || '')} |`); continue; }
    const note = [f.note, f.backend && `後端：${f.backend}`, f.ref && `「${f.ref}」`].filter(Boolean).join(' ');
    rows.push(`| ${label} | ${esc(fmt(f.value))} | ${SRC[f.source] || f.source} | ${CONF[f.confidence] || '—'} | ${esc(note)} |`);
  }
  return rows.join('\n');
}

const g = s.game;
const L = [];
L.push(`# ${g.title || g.id}`, '');
L.push(`- 遊戲 ID：\`${g.id}\``);
if (g.provider) L.push(`- 廠商：${g.provider}`);
if (g.engine) L.push(`- 引擎：${g.engine}`);
if (g.locale) L.push(`- 語系：${g.locale}`);
L.push(`- 記錄日期：${s.capturedAt}`, `- 格式版本：${s.schemaVersion}`, '');

L.push('## 核心規格', '', fieldRows(s.core, CORE), '');

const sy = s.core.symbols && s.core.symbols.value;
if (sy) {
  L.push('### 符號表', '', '| 後端 id | 名稱 | 角色 | 3 連（×總押分/5） | id 來源 |', '|---|---|---|---|---|');
  for (const x of sy) L.push(`| ${x.id ?? '量不到'} | ${x.name} | ${x.role} | ${x.pay3 ?? '—'} | ${SRC[x.idSource] || (x.idSource === 'backend' ? '後端' : x.idSource)} |`);
  if (s.core.symbols.multiplierSymbols) L.push('', '倍數符號：' + s.core.symbols.multiplierSymbols.map((m) => `id ${m.id} = ${m.x}×`).join('、'));
  L.push('');
}
const ln = s.core.lines && s.core.lines.value;
if (ln) {
  L.push('### 線表', '', '每軸的列號，0 = 最上列。', '', '| 線 | 各軸列號 |', '|---|---|');
  for (const x of ln) L.push(`| ${x.line} | ${x.rows.join(' - ')} |`);
  L.push('', `倍數軸在線上：${s.core.lines.multiplierReelOnLines ? '是' : '否'}`, '');
}
const pt = s.core.paytable && typeof s.core.paytable.value === 'object' && s.core.paytable.value;
if (pt) {
  L.push('### 賠付表', '');
  if (pt.note) L.push(`> ${pt.note}`, '');
  const syms = Object.entries(pt).filter(([k, v]) => k !== 'note' && v && typeof v === 'object' && !Array.isArray(v));
  if (syms.length) {
    const counts = [...new Set(syms.flatMap(([, v]) => Object.keys(v)))].sort((a, b) => b - a);
    L.push(`| 符號 | ${counts.map((c) => c + ' 連').join(' | ')} |`, `|---|${counts.map(() => '---').join('|')}|`);
    for (const [k, v] of syms) L.push(`| ${k} | ${counts.map((c) => v[c] ?? '—').join(' | ')} |`);
  } else {
    for (const [k, v] of Object.entries(pt)) if (k !== 'note') L.push(`- ${k}：${fmt(v)}`);
  }
  L.push('');
}

if (s.features && s.features.length) {
  L.push('## 特殊玩法', '');
  for (const f of s.features) {
    L.push(`### ${f.name}`, '');
    L.push(`- 出現時機：${DURING[f.during] || f.during}`);
    if (f.trigger) L.push(`- 觸發：${f.trigger}`);
    if (f.effect) L.push(`- 效果：${f.effect}`);
    if (f.params) L.push(`- 參數：${fmt(f.params)}`);
    L.push(`- 來源：${SRC[f.source] || f.source}`, '');
  }
}

function presentation(L, p) {
  if (!p) return;
  L.push('## 表演', '', fieldRows(p, PRES), '');
  if (p.featureCues && p.featureCues.length) {
    L.push('### 玩法對應的表演節點', '', '| 玩法 | 節點 | 出現轉數 |', '|---|---|---|');
    for (const c of p.featureCues) L.push(`| ${c.feature} | ${c.cues.map((x) => '`' + x + '`').join(' ')} | ${c.seenInSpins ?? '—'} |`);
    L.push('');
  }
  if (p.timelines && p.timelines.length) {
    for (const t of p.timelines) {
      L.push(`### 時間軸：${t.title}`, '');
      if (t.note) L.push(`> ${t.note}`, '');
      L.push('| 時間 | 事件 |', '|---|---|');
      for (const [ms, what] of t.steps) L.push(`| ${(ms / 1000).toFixed(2)}s | ${esc(what)} |`);
      L.push('');
    }
  }
}

if (s.ui) { L.push('## 介面', ''); for (const [k, v] of Object.entries(s.ui)) L.push(`- ${k}：${fmt(v)}`); L.push(''); }
if (s.conflicts && s.conflicts.length) { L.push('## 矛盾', ''); s.conflicts.forEach((c) => L.push(`- ${c}`)); L.push(''); }
if (s.openQuestions && s.openQuestions.length) { L.push('## 待確認', ''); s.openQuestions.forEach((c) => L.push(`- [ ] ${c}`)); L.push(''); }

fs.writeFileSync(path.join(dir, 'spec.md'), L.join('\n'));
console.log('wrote ' + path.join(dir, 'spec.md'));
fs.writeFileSync(path.join(dir, 'feel.md'), feel(s));
console.log('wrote ' + path.join(dir, 'feel.md'));

// ---- feel.md: player-facing feel, from spec.json presentation (measured + observations) ----
// null = 量不到, "none" = 無. No node names, no raw motion.
function feel(s) {
  const L = [];
  const g = s.game, p = s.presentation || {}, m = p.measured;
  const v = (x, unit = '') => (x === null || x === undefined ? '量不到' : x === 'none' ? '無' : `${x}${unit}`);
  const span = (a) => (Array.isArray(a) ? `${(a[0] / 1000).toFixed(2)}–${(a[1] / 1000).toFixed(2)} s` : v(a));
  const at = (x) => (typeof x === 'number' ? `${(x / 1000).toFixed(2)} s` : v(x));
  const MODE = { normal: '一般', turbo: '加速', super: '極速' };
  L.push(`# ${g.title || g.id}：表演與體感`, '', `- 記錄日期：${s.capturedAt}`,
    '- 量測值來自引擎（每幀位置、事件時間），誤差約 ±1 幀（約 17 ms）。「量不到」= 這次沒有資料；「無」= 有觀察，確定沒有。', '');
  if (!m) { L.push('尚未量測。'); return L.join('\n'); }
  const c = m.cell || {};
  L.push('## 基準', '', `- 單格高度：${v(c.heightPx, ' px')}（設計解析度 ${c.design ? c.design.join('×') : '量不到'}）`, `- 轉軸數（含特殊軸）：${v(c.columns)}`, '- 距離一律以「格」表示；速度 = 格/秒。', '');
  L.push('## 轉輪（各速度模式）', '', '| 模式 | 樣本轉數 | 開轉 | 捲速 格/秒 | 停輪間隔 ms | 減速 ms | 回彈 | 首軸停 | 末軸停 |', '|---|---|---|---|---|---|---|---|---|');
  for (const x of m.speedModes || []) {
    const start = x.startGapMs === 0 ? '各軸同時' : x.startGapMs == null ? '量不到' : `間隔 ${x.startGapMs} ms`;
    const b = x.bounce == null ? '量不到' : x.bounce === 'none' ? '無' : `有，${x.bounce.cells} 格、${x.bounce.ms} ms`;
    L.push(`| ${MODE[x.mode] || x.mode} | ${x.analysed}/${x.spins} | ${start} | ${v(x.scrollCellsPerSec)} | ${v(x.stopGapMs)} | ${v(x.decelMs)} | ${b} | ${at(x.firstStopMs)} | ${at(x.lastStopMs)} |`);
  }
  L.push('', '減速 = 從還在全速到停在最遠點的時間；0 表示全速直接停住，再靠回彈收尾。開轉、停輪時間都從按下 Spin 起算。', '');
  L.push('## 急停（轉動中再按一次 Spin）', '', '| 模式 | 次數 | 再按 → 全部停妥 | 首軸到末軸 | 回彈 | 備註 |', '|---|---|---|---|---|---|');
  for (const q of m.quickStop || []) L.push(`| ${MODE[q.mode] || q.mode} | ${q.samples} | ${v(q.tapToAllStoppedMs, ' ms')} | ${v(q.firstToLastReelMs, ' ms')} | ${q.bounce == null ? '量不到' : q.bounce === 'none' ? '無' : q.bounce.cells + ' 格'} | ${q.note || ''} |`);
  L.push('');
  const an = m.anticipation;
  L.push('## 咪牌', '');
  if (an === 'notSeen' || !an) L.push('- 本次未出現。方向、等待時長量不到。');
  else { L.push('| 模式 | 第幾軸開始 | 多等 ms | 咪牌捲速 格/秒 |', '|---|---|---|---|'); for (const a of an) L.push(`| ${MODE[a.mode] || a.mode} | ${a.reel} | ${a.extraWaitMs} | ${v(a.slowCellsPerSec)} |`); }
  L.push('');
  L.push('## 中獎表演時序', '', '從按下 Spin 起算。各段用通用事件判斷，不依賴特定節點。', '',
    '| # | 模式 | 停輪完成 | 特殊玩法表演 | 亮線 | 贏分出現 | 贏分跑分 | 餘額入帳 | 下一轉可按 | 贏分（押注倍數） |', '|---|---|---|---|---|---|---|---|---|---|');
  (m.winSequence || []).forEach((w, i) => L.push(`| ${i + 1} | ${MODE[w.mode] || w.mode} | ${at(w.reelsStoppedMs)} | ${span(w.specialMs)} | ${at(w.lineMs)} | ${at(w.winShownMs)} | ${span(w.winCountMs)} | ${span(w.balanceRollMs)} | ${at(w.readyMs)} | ${v(w.winX, '×')} |`));
  if (!(m.winSequence || []).length) L.push('| — | 本次沒有中獎轉 | | | | | | | | |');
  L.push('');
  L.push('## 大獎', '');
  if (p.bigWinRules) L.push(`- 門檻（規則）：${p.bigWinRules}`);
  if ((m.bigWinSeen || []).length) m.bigWinSeen.forEach((b) => L.push(`- 觀察到：贏分 ${v(b.winX, '×')}，表演 ${at(b.startMs)} → ${at(b.endMs)}`));
  else L.push('- 本次沒有出現大獎表演：門檻與各段時長量不到。');
  L.push('');
  if ((p.observations || []).length) {
    L.push('## 其他體感', '', '| 項目 | 描述 | 類型 |', '|---|---|---|');
    for (const o of p.observations) L.push(`| ${o.topic} | ${esc(o.text)} | ${o.kind === 'inferred' ? '推測' : '觀察'} |`);
    L.push('');
  }
  return L.join('\n');
}
