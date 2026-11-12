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
      // 2.x: world (design units) -> canvas pixels through the viewport rect and scale.
      const w = node.convertToWorldSpaceAR(cc.v2(0, 0)), vp = cc.view.getViewportRect();
      s = { x: vp.x + w.x * cc.view.getScaleX(), y: vp.y + w.y * cc.view.getScaleY() };
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
    let b = all.findIndex((s, i) => i > a && /^100 %$|滾輪參數設定|測試工具|測試列表|测试|Enter text here|余额低于准入|button$/.test(s));
    if (b < 0) b = all.length;
    return all.slice(a, b).join('\n');
  }

  // ---- presentation recorder ----
  const ev = [];
  let rec = false;
  let act = 0, txt = 0, learning = false; const noise = new Set(); // nodes that blink while idle // counts events that mean the game is still presenting (not tween builds)
  const push = (k, n, v) => { if (rec && ev.length < 60000) { ev.push([now(), k, n, v]); if (learning && (k === 'show' || k === 'hide')) noise.add(n); if ((k === 'show' || k === 'hide' || k === 'text') && !noise.has(n)) act++; if (k === 'text') txt++; } };
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
  // Tweens: duration + easing straight from the engine (cc.tween in 2.x and 3.x).
  const easeName = (o) => { const e = o && o.easing; return e == null ? 'linear' : typeof e === 'string' ? e : (e.name || 'fn'); };
  const tgtName = (tg) => !tg ? '?' : tg.name !== undefined && tg.children ? (tg.parent ? tg.parent.name + '/' : '') + tg.name : tg.node ? nodeName(tg) : 'obj';
  const TW = cc.Tween && cc.Tween.prototype;
  for (const fn of ['to', 'by']) {
    if (!TW || !TW[fn] || TW[fn].__sc) continue;
    const o = TW[fn];
    TW[fn] = function (d, props, opts) {
      try { push('tween', tgtName(this._target), `${fn}|${d}|${easeName(opts)}|${props ? Object.keys(props).join('+') : ''}`); } catch (e) {}
      return o.apply(this, arguments);
    };
    TW[fn].__sc = 1;
  }
  // Legacy 2.x actions (cc.moveTo(...).easing(...)): duration and whether eased.
  if (!is3 && cc.Node.prototype.runAction && !cc.Node.prototype.runAction.__sc) {
    const o = cc.Node.prototype.runAction;
    cc.Node.prototype.runAction = function (a) {
      try { push('action', (this.parent ? this.parent.name + '/' : '') + this.name, `${a && a._duration != null ? a._duration : '?'}|ease${a && a._easeList ? a._easeList.length : 0}`); } catch (e) {}
      return o.apply(this, arguments);
    };
    cc.Node.prototype.runAction.__sc = 1;
  }

  // Motion: per-frame local position/scale of every node that moves. Rest sample before and after each move.
  const mot = [], names = [], parents = [], ids = new Map(), last = new Map();
  let prevT = 0;
  function sample() {
    if (!rec) return;
    const t = now();
    const walk = (n) => {
      if (!n.activeInHierarchy) return;
      const p = is3 ? n.position : n;
      const x = Math.round(p.x * 10) / 10, y = Math.round(p.y * 10) / 10;
      const s = Math.round((is3 ? n.scale.x : n.scaleX) * 1000) / 1000;
      const L = last.get(n.uuid);
      if (!L) last.set(n.uuid, [x, y, s, false]);
      else if (L[0] !== x || L[1] !== y || L[2] !== s) {
        let id = ids.get(n.uuid);
        if (id === undefined) { id = names.length; ids.set(n.uuid, id); names.push((n.parent ? n.parent.name + '/' : '') + n.name); parents.push(n.parent ? n.parent.uuid : ''); }
        if (mot.length < 400000) { if (!L[3]) mot.push([prevT, id, L[0], L[1], L[2]]); mot.push([t, id, x, y, s]); }
        L[0] = x; L[1] = y; L[2] = s; L[3] = true;
      } else if (L[3]) {
        L[3] = false;
        if (mot.length < 400000) mot.push([t, ids.get(n.uuid), x, y, s]);
      }
      n.children.forEach(walk);
    };
    walk(scene());
    prevT = t;
  }
  cc.director.on(cc.Director.EVENT_AFTER_UPDATE, sample);

  // Node visibility + short label changes, polled.
  let seen = new Map(), lab = new Map();
  let lastReady = '';
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
    const sb = SPIN.map((nm) => find(nm)).find(Boolean), btc = sb && sb.getComponent(cc.Button);
    const rd = btc ? (btc.interactable && btc.enabledInHierarchy !== false ? '1' : '0') : '?';
    if (rd !== lastReady) { push('ready', 'spin', rd); lastReady = rd; }
    seen = vis; lab = lb;
  }
  setInterval(poll, 100);

  const SPIN = ['SpinBtn', 'HitArea', 'SpinButton', 'Spin', 'BtnSpin', 'spinBtn'];
  let label = '';
  async function spin(btn, quietMs = 3000, maxMs = 240000, quick = false) {
    const start = ev.length, ts = now();
    push('mark', quick ? 'qs' : 'spin', label);
    const b = btn || SPIN.find((n) => find(n));
    if (!b) return { ms: 0, events: 0, error: 'noSpinButton' };
    // Retry the tap when nothing on screen changes text (balance/bet) within 4 s: UI may not be interactable yet.
    if (quick) { await tap(b); await sleep(250); push('mark', 'qsTap', label); await tap(b); }
    else for (let k = 0; k < 3; k++) { const t0 = txt; await tap(b); let ok = false; for (let w = 0; w < 16 && !ok; w++) { await sleep(250); ok = txt !== t0; } if (ok) break; }
    let last = act, lastT = now();
    while (now() - ts < maxMs) {
      await sleep(250);
      if (act !== last) { last = act; lastT = now(); }
      else if (now() - lastT > quietMs && now() - ts > 2000) break;
    }
    return { ms: now() - ts, events: ev.length - start };
  }


  // ---- help page structure: sprites (frame names) and labels in order ----
  function helpRoot() {
    let r = null;
    const walk = (n) => { if (!r && /Help.*(View|Panel)|HelpMenu|Rule.*View/i.test(n.name)) r = n; n.children.forEach(walk); };
    walk(scene()); return r;
  }
  function spriteOf(n) { const sp = n.getComponent(cc.Sprite); return sp && sp.spriteFrame ? sp.spriteFrame : null; }
  function helpDump() {
    const root = helpRoot(); if (!root) return 'noHelp';
    const out = [];
    const walk = (n, d) => {
      const sf = spriteOf(n), l = n.getComponent(cc.Label) || n.getComponent(cc.RichText);
      if (sf) out.push(d + 's ' + n.name + ' = ' + sf.name);
      if (l && l.string && l.string.trim()) out.push(d + 'l ' + n.name + ' = ' + l.string.replace(/\n/g, ' / '));
      n.children.forEach((c) => walk(c, d + 1));
    };
    walk(root, 0); return out.join('\n');
  }
  // Export help-page sprites whose node or frame name matches re, as PNG data URLs (max width 700).
  function exportSprites(re, max = 40) {
    const root = helpRoot() || scene(), out = [], seenF = new Set();
    const walk = (n) => {
      const sf = spriteOf(n);
      if (sf && out.length < max && (re.test(n.name) || re.test(sf.name)) && !seenF.has(sf.name)) {
        seenF.add(sf.name);
        try {
          const tex = is3 ? sf.texture : sf.getTexture();
          const img = is3 ? tex && tex.image && tex.image.data : tex && (tex._image || tex.getHtmlElementObj && tex.getHtmlElementObj());
          const r = is3 ? sf.rect : sf.getRect(), rot = is3 ? sf.rotated : sf.isRotated();
          const w = rot ? r.height : r.width, h = rot ? r.width : r.height;
          const k = Math.min(1, 700 / r.width), c = document.createElement('canvas');
          c.width = Math.round(r.width * k); c.height = Math.round(r.height * k);
          const g = c.getContext('2d');
          if (rot) { g.translate(0, c.height); g.rotate(-Math.PI / 2); g.drawImage(img, r.x, r.y, w, h, 0, 0, c.height, c.width); }
          else g.drawImage(img, r.x, r.y, w, h, 0, 0, c.width, c.height);
          out.push({ node: n.name, frame: sf.name, w: c.width, h: c.height, url: c.toDataURL('image/png') });
        } catch (e) { out.push({ node: n.name, frame: sf.name, error: String(e).slice(0, 80) }); }
      }
      n.children.forEach(walk);
    };
    walk(root); return out;
  }
  function meta() {
    const d = cc.view.getDesignResolutionSize(), f = cc.view.getFrameSize();
    return { engine: cc.ENGINE_VERSION, design: [d.width, d.height], frame: [f.width, f.height] };
  }

  window.__specCap = {
    helpDump, exportSprites, meta,
    setLabel(x) { label = x; return x; },
    quick(n, btn) { const st = (this._run = { done: 0, n, end: false }); this.start(); (async () => { for (let i = 0; i < n; i++) { await spin(btn, 3000, 60000, true); st.done++; } this.stop(); st.end = true; })(); return 'started'; },
    find, tap, tapXY, labels, buttons, rules, spin,
    start() { seen = new Map(); lab = new Map(); rec = true; push('mark', 'start'); poll(); return 'rec'; },
    // Fire-and-forget batch so a long free game never times out the MCP call. Poll status().
    run(n, btn) { const st = (this._run = { done: 0, n, end: false }); this.start(); (async () => { learning = true; await sleep(3000); learning = false; st.noise = noise.size; for (let i = 0; i < n; i++) { await spin(btn); st.done++; } this.stop(); st.end = true; })(); return 'started'; },
    status() { return this._run; },
    stop() { rec = false; return ev.length; },
    events: () => ev,
    // Save to specs/<gameId>/motion.json. Rows: [t, id, x, y, scale]; names[id] = "parent/node".
    motion: () => ({ names, parents, mot }),
  };
})();
