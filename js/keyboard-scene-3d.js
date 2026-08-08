/* ============================================================
   js/keyboard-scene-3d.js
   ------------------------------------------------------------
   Bàn phím 3D "nổi" ở lobby-left — trước đây là CSS transform
   giả-3D (rotateX/rotateZ trên các <div>), giờ là một scene
   WebGL thật dựng bằng Three.js.

   Lấy tinh thần kỹ thuật từ github.com/MengTo/complete-shelf:
     - Một scene WebGL độc lập, không framework/bundler — chỉ
       import Three.js thẳng từ CDN qua ES module.
     - Camera/board dùng chung MỘT vòng lặp easing xác định
       (lerp mỗi khung hình) cho mọi chuyển động — kéo, nghiêng
       theo chuột, bật "flash" phím — thay vì để CSS transition
       tự nội suy, nên không bao giờ bị "giật khung cuối" khi
       người dùng đổi hướng kéo giữa chừng.
     - Nhãn từng phím là canvas texture dán lên mặt trên của
       khối (BoxGeometry, material theo từng mặt) — không cần
       ảnh/atlas ngoài.

   API công khai: window.KB3D.flashKey(ch) — gọi từ hiệu ứng gõ
   chữ trên màn hình mini (xem initKeyboardTyper() trong
   js/main.js) để phím tương ứng "sáng" lên đúng lúc ký tự đó
   xuất hiện trên màn hình.
   ============================================================ */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

(function initKeyboardScene3D() {
  const canvas = document.getElementById('kbCanvas3d');
  const sceneEl = document.getElementById('kbScene');
  if (!canvas || !sceneEl) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    // WebGL không khả dụng (driver cũ, tắt trong trình duyệt...) — bỏ qua
    // trong im lặng, phần còn lại của lobby vẫn hoạt động bình thường.
    window.KB3D = { flashKey() {} };
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0); // nền trong suốt — lộ lớp glow CSS phía sau

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 3.5, 5.6);
  camera.lookAt(0, 0.1, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const glowLightA = new THREE.PointLight(0x8c6bff, 2.6, 14);
  glowLightA.position.set(-2.4, 2.8, 2.2);
  scene.add(glowLightA);
  const glowLightB = new THREE.PointLight(0xdd4fa6, 1.7, 14);
  glowLightB.position.set(2.6, 1.6, -1.4);
  scene.add(glowLightB);
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.55);
  keyLight.position.set(0.6, 4, 3);
  scene.add(keyLight);

  // rig = nhóm ngoài cùng chịu trách nhiệm xoay/nghiêng toàn cảnh (kéo +
  // hover + bồng bềnh nhàn rỗi); board = nhóm bên trong chứa đế + phím.
  const rig = new THREE.Group();
  scene.add(rig);
  const board = new THREE.Group();
  rig.add(board);

  const BASE_RX = -0.60, BASE_RY = 0.40;

  // ── Màu theo theme sáng/tối hiện tại (đọc CSS custom properties của
  //    #kbScene — cùng biến mà style.css dùng cho phần glow/lưới nền,
  //    nên bàn phím 3D luôn khớp màu với card xung quanh nó). ──
  const PURPLE = new THREE.Color('#4f6bff');
  const TEAL   = new THREE.Color('#17b3a3');
  const PINK   = new THREE.Color('#dd4fa6');

  function cssVar(name, fallback) {
    const v = getComputedStyle(sceneEl).getPropertyValue(name).trim();
    if (!v) return fallback;
    try { return new THREE.Color(v); } catch (e) { return fallback; }
  }

  let keyBg1, keyBg2, keyText, boardColor;
  function readThemeColors() {
    keyBg1 = cssVar('--kb-key-bg1', new THREE.Color('#ffffff'));
    keyBg2 = cssVar('--kb-key-bg2', new THREE.Color('#eef0fb'));
    keyText = cssVar('--kb-key-text', new THREE.Color('#4b5170'));
    boardColor = keyBg2.clone().lerp(new THREE.Color('#000000'), 0.18);
  }
  readThemeColors();

  function heatBaseColor(heat) {
    if (heat === 1) return PURPLE.clone().lerp(new THREE.Color('#6d5bd0'), 0.5);
    if (heat === 2) return PURPLE.clone().lerp(PINK, 0.5);
    if (heat === 3) return keyBg1.clone().lerp(PURPLE, 0.22);
    if (heat === 'active') return PINK.clone().lerp(PURPLE, 0.5);
    return keyBg1.clone();
  }
  function heatEmissive(heat) {
    if (heat === 1) return PURPLE;
    if (heat === 2) return PINK;
    if (heat === 'active') return PINK;
    return new THREE.Color('#000000');
  }
  function heatEmissiveIntensity(heat) {
    if (heat === 1) return 0.5;
    if (heat === 2) return 0.65;
    if (heat === 'active') return 0.85;
    return 0;
  }

  // ── Đế bàn phím ──
  const UNIT = 1, GAP = 0.14, KEY_H = 0.32, ROW_STEP = 1.08;
  const ROW_DEFS = [
    { indent: 0,    keys: [
      { ch: 'Q' }, { ch: 'W' }, { ch: 'E' }, { ch: 'R' }, { ch: 'T' },
      { ch: 'Y' }, { ch: 'U' }, { ch: 'I' }, { ch: 'O' }, { ch: 'P' },
    ] },
    { indent: 0.42, keys: [
      { ch: 'A', heat: 3 }, { ch: 'S', heat: 3 }, { ch: 'D' }, { ch: 'F' }, { ch: 'G' },
      { ch: 'H' }, { ch: 'J' }, { ch: 'K' }, { ch: 'L' },
    ] },
    { indent: 0.84, keys: [
      { ch: 'Z', heat: 3 }, { ch: 'X', heat: 2 }, { ch: 'C', heat: 'active' }, { ch: 'V', heat: 2 },
      { ch: 'B' }, { ch: 'N' }, { ch: 'M' },
    ] },
    { indent: 0,    keys: [
      { ch: 'Ctrl', w: 1.5, heat: 1 }, { ch: 'Alt', w: 1.1 },
      { ch: 'IC3 · GS6', w: 4.2, isSpace: true }, { ch: 'Enter', w: 1.6 },
    ] },
  ];

  // Chiều rộng hàng rộng nhất (hàng số 1, QWERTY...P) — dùng làm mốc canh
  // trái chung cho mọi hàng, các hàng ngắn hơn được dịch phải bằng indent
  // (đúng hành vi flex cross-axis "stretch" của bản CSS gốc).
  function rowWidth(row) {
    return row.keys.reduce((sum, k) => sum + (k.w || 1) * UNIT, 0) + GAP * (row.keys.length - 1);
  }
  const maxRowWidth = Math.max(...ROW_DEFS.map(rowWidth));
  const totalDepth = (ROW_DEFS.length - 1) * ROW_STEP;

  function makeLabelTexture(text, wUnits) {
    const cw = Math.max(96, Math.round(96 * wUnits));
    const c = document.createElement('canvas');
    c.width = cw; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#' + keyText.getHexString();
    ctx.font = `700 ${text.length > 2 ? 32 : 54}px 'Space Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.anisotropy = 4;
    return tex;
  }

  const keyGeomCache = {};
  function getKeyGeometry(w) {
    const k = w.toFixed(2);
    if (!keyGeomCache[k]) keyGeomCache[k] = new THREE.BoxGeometry(w * UNIT - GAP, KEY_H, UNIT - GAP);
    return keyGeomCache[k];
  }

  const allKeys = [];   // { mesh, def, sideMat, topMat, baseY }
  const charMeshes = {}; // 'Q' -> mesh, ' ' -> space mesh

  function buildKey(def, x, z) {
    const w = def.w || 1;
    const base = heatBaseColor(def.heat);
    const sideMat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.6, metalness: 0.06 });
    const topMat = new THREE.MeshStandardMaterial({
      color: base, roughness: 0.42, metalness: 0.04,
      map: makeLabelTexture(def.ch, w),
      emissive: heatEmissive(def.heat),
      emissiveIntensity: heatEmissiveIntensity(def.heat),
    });
    // Thứ tự material của BoxGeometry: [+x, -x, +y(mặt trên), -y, +z, -z]
    const mesh = new THREE.Mesh(getKeyGeometry(w), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    const baseY = KEY_H / 2;
    mesh.position.set(x, baseY, z);
    board.add(mesh);
    const rec = { mesh, def, sideMat, topMat, baseY, baseColor: base, lastFlash: -Infinity };
    allKeys.push(rec);
    if (def.ch.length === 1) charMeshes[def.ch] = rec;
    if (def.isSpace) charMeshes[' '] = rec;
    return rec;
  }

  ROW_DEFS.forEach((row, ri) => {
    let cursorX = -maxRowWidth / 2 + row.indent * UNIT;
    const z = -totalDepth / 2 + ri * ROW_STEP;
    row.keys.forEach((def) => {
      const w = def.w || 1;
      const x = cursorX + (w * UNIT) / 2;
      buildKey(def, x, z);
      cursorX += w * UNIT + GAP;
    });
  });

  // Đế bên dưới các phím — 1 khối phẳng bo góc mềm bằng bevel segment thấp.
  const plateGeom = new THREE.BoxGeometry(maxRowWidth + 0.5, 0.22, totalDepth + 0.9);
  const plateMat = new THREE.MeshStandardMaterial({ color: boardColor, roughness: 0.75, metalness: 0.1 });
  const plate = new THREE.Mesh(plateGeom, plateMat);
  plate.position.set(0, -0.11, 0);
  board.add(plate);

  function refreshTheme() {
    readThemeColors();
    plateMat.color.copy(boardColor);
    allKeys.forEach((rec) => {
      const base = heatBaseColor(rec.def.heat);
      rec.baseColor = base;
      rec.sideMat.color.copy(base);
      rec.topMat.color.copy(base);
      const w = rec.def.w || 1;
      rec.topMat.map?.dispose();
      rec.topMat.map = makeLabelTexture(rec.def.ch, w);
      rec.topMat.needsUpdate = true;
    });
  }
  const themeObserver = new MutationObserver(refreshTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ── Resize ──
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (reduceMotion) renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  if (reduceMotion) {
    // Giữ đúng tinh thần bản CSS cũ: tắt hẳn phần tương tác động khi
    // người dùng bật "giảm chuyển động", chỉ vẽ 1 khung tĩnh ở góc
    // nghỉ mặc định.
    rig.rotation.set(BASE_RX, BASE_RY, 0);
    resize();
    window.KB3D = { flashKey() {} };
    return;
  }

  // ── Kéo để xoay quanh trục Y (yaw) + nghiêng nhẹ quanh trục X theo
  //    chiều kéo dọc; không kéo thì tự nghiêng nhẹ theo vị trí con trỏ
  //    (hover tilt) — mọi chuyển động đều được LÀM MƯỢT (lerp) trong
  //    vòng lặp render bên dưới, không phụ thuộc CSS transition. ──
  let targetRX = BASE_RX, targetRY = BASE_RY;
  let curRX = BASE_RX, curRY = BASE_RY;
  let hoverRX = 0, hoverRY = 0;
  let dragging = false;
  let lastX = 0, lastY = 0;

  if (window.matchMedia('(hover: hover)').matches) {
    sceneEl.addEventListener('mousemove', (e) => {
      if (dragging) return;
      const r = sceneEl.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      hoverRX = (py - 0.5) * -0.18;
      hoverRY = (px - 0.5) * 0.3;
    });
    sceneEl.addEventListener('mouseleave', () => { hoverRX = 0; hoverRY = 0; });
  }

  sceneEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    sceneEl.classList.add('is-dragging');
    try { sceneEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  sceneEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    targetRY += (e.clientX - lastX) * 0.012;
    targetRX = Math.min(BASE_RX + 0.3, Math.max(BASE_RX - 0.4, targetRX + (e.clientY - lastY) * 0.006));
    lastX = e.clientX; lastY = e.clientY;
  });
  function stopDrag(e) {
    if (!dragging) return;
    dragging = false;
    sceneEl.classList.remove('is-dragging');
    try { sceneEl.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  sceneEl.addEventListener('pointerup', stopDrag);
  sceneEl.addEventListener('pointercancel', stopDrag);

  // ── Flash phím theo ký tự đang gõ trên màn hình mini ──
  const FLASH_HOLD = 150, FLASH_DECAY = 320;
  function flashKey(ch) {
    const rec = ch === ' ' ? charMeshes[' '] : charMeshes[(ch || '').toUpperCase()];
    if (!rec) return;
    rec.lastFlash = performance.now();
  }
  window.KB3D = { flashKey };

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  const clock = new THREE.Clock();
  function tick() {
    const t = clock.getElapsedTime();
    const now = performance.now();

    curRX += (targetRX + hoverRX - curRX) * 0.12;
    curRY += (targetRY + hoverRY - curRY) * 0.12;
    rig.rotation.set(curRX, curRY, 0);
    rig.position.y = Math.sin(t * 0.6) * 0.1; // bồng bềnh nhàn rỗi, khớp floatY trong CSS cũ

    allKeys.forEach((rec) => {
      let intensity = heatEmissiveIntensity(rec.def.heat);
      let lift = 0;
      if (rec.def.heat === 'active') {
        // pulse liên tục cho phím "hot" nhất (C) — khớp @keyframes kbHotPulse
        intensity += Math.sin(t * (Math.PI / 0.9)) * 0.18;
      }
      const since = now - rec.lastFlash;
      if (since < FLASH_HOLD + FLASH_DECAY) {
        const teal = TEAL;
        rec.topMat.emissive.copy(since < FLASH_HOLD ? teal : teal.clone().lerp(heatEmissive(rec.def.heat), easeOutCubic((since - FLASH_HOLD) / FLASH_DECAY)));
        const flashT = since < FLASH_HOLD ? 1 : 1 - easeOutCubic((since - FLASH_HOLD) / FLASH_DECAY);
        intensity = Math.max(intensity, 0.4 + flashT * 1.1);
        lift = flashT * 0.09;
      } else {
        rec.topMat.emissive.copy(heatEmissive(rec.def.heat));
      }
      rec.topMat.emissiveIntensity = intensity;
      rec.mesh.position.y = rec.baseY + lift;
    });

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
