// Cocos Creator 2.x spec-capture probe. Load with evaluate_script (format "script").
// Exposes window.__specCap. Reads only; drives the canvas with pointer events.
(() => {
  if (window.__specCap) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const canvas = () => document.querySelector('canvas');
  const scene = () => cc.director.getScene();
  const t0 = performance.now();
  const now = () => Math.round(performance.now() - t0);

  function find(name, root = scene()) {
    if (root.name === name && root.activeInHierarchy) return root;
    for (const c of root.children) { const r = find(name, c); if (r) return r; }
    return null;
  }
  const is3 = /^3\./.test(cc.ENGINE_VERSION);
  function screenOf(node) {
    let s;
    if (is3) {
      const cam = scene().getComponentsInChildren(cc.Camera).find((c) => c.visibility & node.layer);
      s = cam.worldToScreen(node.worldPosition, new cc.Vec3());
    } else {
      s = cc.Camera.findCamera(node).getWorldToScreenPoint(node.convertToWorldSpaceAR(cc.v2(0, 0)));
    }
    const c = canvas(), r = c.getBoundingClientRect();
    return [r.left + (s.x / c.width) * r.width, r.bottom - (s.y / c.height) * r.height];
  }
  async function tapXY(x, y) {
    const c = canvas();
    const o = { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, button: 0 };
    c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new MouseEvent('mousedown', o));
    await sleep(80);
    c.dispatchEvent(new PointerEvent('pointerup', o)); c.dispatchEvent(new MouseEvent('mouseup', o));
  }
  async function tap(name) {
    const n = find(name); if (!n) return 'notFound';
    const [x, y] = screenOf(n); await tapXY(x, y); return [Math.round(x), Math.round(y)];
  }
  function labels(root = scene(), activeOnly = false) {
    const out = [];
    const walk = (n) => {
      if (activeOnly && !n.activeInHierarchy) return;
      const l = n.getComponent(cc.Label) || n.getComponent(cc.RichText);
      if (l && l.string && l.string.trim()) out.push(l.string);
      n.children.forEach(walk);
    };
    walk(root); return out;
  }
  function buttons() {
    const out = [];
    const walk = (n, p) => {
      if (!n.activeInHierarchy) return;
      const path = p + '/' + n.name;
      if (n.getComponent(cc.Button)) out.push(path.split('/').slice(-3).join('/'));
      n.children.forEach((c) => walk(c, path));
    };
    walk(scene(), ''); return out;
  }
  // Rules text: from the first help-like title to the first debug/loading marker.
  function rules() {
    const all = labels();
    let a = all.findIndex((s) => /游戏帮助|遊戲幫助|赔付表|賠付表|PAY ?TABLE|Game ?Rules|Help/i.test(s));
    if (a < 0) a = 0;
    let b = all.findIndex((s, i) => i > a && /^100 %$|滾輪參數設定|測試工具/.test(s));
    if (b < 0) b = all.length;
    return all.slice(a, b).join('\n');
  }

  // ---- presentation recorder ----
  const ev = [];
  let rec = false;
  const push = (k, n, v) => { if (rec && ev.length < 20000) ev.push([now(), k, n, v]); };
  const hook = (proto, fn, k, nameOf) => {
    if (!proto || !proto[fn] || proto[fn].__sc) return;
    const orig = proto[fn];
    const w = function (...a) { try { push(k, nameOf(this, a), String(a[1] ?? a[0] ?? '')); } catch (e) {} return orig.apply(this, a); };
    w.__sc = 1; proto[fn] = w;
  };
  const nodeName = (c) => (c.node ? (c.node.parent ? c.node.parent.name + '/' : '') + c.node.name : '?');
  if (window.sp) {
    hook(sp.Skeleton.prototype, 'setAnimation', 'spine', nodeName);
    hook(sp.Skeleton.prototype, 'addAnimation', 'spineQ', nodeName);
  }
  hook(cc.Animation.prototype, 'play', 'anim', nodeName);
  if (window.dragonBones && dragonBones.ArmatureDisplay) hook(dragonBones.ArmatureDisplay.prototype, 'playAnimation', 'db', nodeName);
  if (cc.AudioSource) {
    const an = (src, a) => ((a[0] && a[0].name) || (src.clip && src.clip.name) || 'clip');
    hook(cc.AudioSource.prototype, 'play', 'sfx', an); hook(cc.AudioSource.prototype, 'playOneShot', 'sfx', an);
  }
  if (cc.audioEngine) {
    const an = (_, a) => (a[0] && (a[0].name || a[0].nativeUrl || a[0]._name)) || 'clip';
    hook(cc.audioEngine, 'play', 'sfx', an); hook(cc.audioEngine, 'playEffect', 'sfx', an); hook(cc.audioEngine, 'playMusic', 'bgm', an);
  }
  // Node visibility + short label changes, polled.
  let seen = new Map(), lab = new Map();
  function poll() {
    if (!rec) return;
    const vis = new Map(), lb = new Map();
    const walk = (n, depth) => {
      if (!n.activeInHierarchy) return;
      const op = is3 ? n.getComponent(cc.UIOpacity) : null;
      if ((op ? op.opacity : n.opacity) === 0) return;
      if (depth > 1) vis.set(n.uuid, n.name);
      const l = n.getComponent(cc.Label);
      if (l && l.string && l.string.length <= 24) lb.set(n.uuid, [n.name, l.string]);
      n.children.forEach((c) => walk(c, depth + 1));
    };
    walk(scene(), 0);
    for (const [u, nm] of vis) if (!seen.has(u)) push('show', nm);
    for (const [u, nm] of seen) if (!vis.has(u)) push('hide', nm);
    for (const [u, [nm, s]] of lb) { const p = lab.get(u); if (p && p[1] !== s) push('text', nm, s); }
    seen = vis; lab = lb;
  }
  setInterval(poll, 100);

  async function spin(btn = 'SpinBtn', quietMs = 3000, maxMs = 240000) {
    const start = ev.length, ts = now();
    push('mark', 'spin', String(ts));
    await tap(btn);
    let last = ev.length, lastT = now();
    while (now() - ts < maxMs) {
      await sleep(250);
      if (ev.length !== last) { last = ev.length; lastT = now(); }
      else if (now() - lastT > quietMs && now() - ts > 2000) break;
    }
    return { ms: now() - ts, events: ev.length - start };
  }

  window.__specCap = {
    find, tap, tapXY, labels, buttons, rules, spin,
    start() { seen = new Map(); lab = new Map(); rec = true; push('mark', 'start'); poll(); return 'rec'; },
    // Fire-and-forget batch so a long free game never times out the MCP call. Poll status().
    run(n, btn = 'HitArea') { const st = (this._run = { done: 0, n, end: false }); this.start(); (async () => { for (let i = 0; i < n; i++) { await spin(btn); st.done++; } this.stop(); st.end = true; })(); return 'started'; },
    status() { return this._run; },
    stop() { rec = false; return ev.length; },
    events: () => ev,
  };
})();
