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
  wild: 'WILD', scatter: 'SCATTER', paytable: '賠付表', rtp: 'RTP', maxWin: '最高贏分', betRange: '押注', jackpot: 'Jackpot',
};
const PRES = { spinMs: '一般轉一次 (ms)', reelStop: '停輪方式', winShow: '中獎表演', character: '角色', speedModes: '速度模式' };
const DURING = { base: '主遊戲', free: '免費遊戲', both: '主遊戲＋免費遊戲', buy: '購買' };

const esc = (t) => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');
function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.map(fmt).join('、');
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${typeof x === 'object' && x !== null ? JSON.stringify(x) : x}`).join('；');
  return String(v);
}
function fieldRows(obj, names) {
  const rows = ['| 項目 | 內容 | 來源 | 可信度 | 備註 |', '|---|---|---|---|---|'];
  for (const [k, label] of Object.entries(names)) {
    const f = obj && obj[k];
    if (!f) continue;
    if (k === 'paytable') { rows.push(`| ${label} | 見下方賠付表 | ${SRC[f.source] || f.source} | ${CONF[f.confidence] || '—'} | ${esc(f.note || '')} |`); continue; }
    const note = [f.note, f.ref && `「${f.ref}」`].filter(Boolean).join(' ');
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

const pt = s.core.paytable && s.core.paytable.value;
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

// ---- feel.md: presentation and motion ----
function feel(s) {
  const L = [];
  const g = s.game;
  L.push(`# ${g.title || g.id}：表演與體感`, '', `- 遊戲 ID：\`${g.id}\``, `- 記錄日期：${s.capturedAt}`,
    '- 數字來自引擎（tween 參數、每幀節點位置），不是截圖目測。時間誤差約 ±1 幀。', '');
  presentation(L, s.presentation);
  const mf = path.join(dir, 'motion-summary.json');
  if (!fs.existsSync(mf)) { L.push('## 動態量測', '', '尚未量測（沒有 motion-summary.json）。', ''); return L.join('\n'); }
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const AX = { x: '水平', y: '垂直', scale: '縮放' };
  const rows = m.groups.filter((x) => x.spins >= 2 || x.kind === 'scroll').slice(0, 30);
  L.push('## 動態量測', '', `> ${m.spins} 轉、${m.samples} 筆每幀位置樣本。只列至少出現在 2 轉的動態；節點名稱的數字以 # 代替。`, '');
  L.push('| 節點 | 類型 | 方向 | 時長 ms | 距離 | easing（擬合誤差） | 回彈 | 回彈收尾 ms | 欄間起步差 ms | 欄間停止差 ms | 轉數 |',
    '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const x of rows) {
    const kind = x.kind === 'scroll' ? `捲動 ${x.speed} px/s` : x.kind === 'pulse' ? `來回（${x.peakMs} ms 到頂）` : '位移';
    const over = x.overshoot ? `${x.overshoot}${x.axis === 'scale' ? '%' : 'px'}，${x.bounces} 次` : '—';
    L.push(`| \`${x.node}\` | ${kind} | ${AX[x.axis]}${x.dir} | ${x.durMs} | ${x.dist ?? '—'} | ${x.ease ? `${x.ease} (${x.fit})` : '—'} | ${over} | ${x.settleMs ?? '—'} | ${x.startStaggerMs ?? '—'} | ${x.stopStaggerMs ?? '—'} | ${x.spins} |`);
  }
  L.push('', '擬合誤差越小越準（0 = 完全吻合，> 0.1 表示不是標準曲線）。欄間差：同一轉裡，各軸或各欄開始、停止的時間差中位數。', '');
  if (m.tweens.length) {
    L.push('### 引擎 tween 參數', '', '| 對象 | 動作 | 時長 s | easing | 屬性 | 次數 |', '|---|---|---|---|---|---|');
    for (const t of m.tweens.slice(0, 30)) L.push(`| \`${t.target}\` | ${t.op || t.kind} | ${t.durS} | ${t.ease} | ${t.props || ''} | ${t.count} |`);
    L.push('');
  }
  return L.join('\n');
}
