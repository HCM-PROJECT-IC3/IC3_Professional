/* ============================================================
   js/arena/arena-mini-art.js — tranh bìa kiểu game 3D cho 5 mini-game của Đấu trường.
   Mỗi tranh vẽ ĐÚNG cách chơi của trò, đặt đè lên cảnh nền của chính trò đó (np-art):
     memory-game         thẻ lật 3D, 1 cặp vừa khớp (bàn phím ↔ bàn phím) trong lớp học
     computer-simulator  màn hình + thân máy + bàn phím, chuột kéo tệp vào thư mục
     cyber-detective     laptop nhận email giả có lưỡi câu, kính lúp soi manh mối
     pz-defense          tủ Server sau vòm lá chắn, mã độc lao tới bị bật ra
     battle-quiz         Trùm Virus khổng lồ, thanh máu, cú đánh COMBO bay tới
   Khối 3D = hình chiếu xiên (trục x sang phải-xuống, trục y sang trái-xuống, z lên): mặt trên
   sáng, mặt trước vừa, mặt phải tối + viền mực giống tranh np-art → cùng 1 nét với cảnh nền.
   Toạ độ tranh 640×280 (đúng tỉ lệ thẻ 16:7), viewBox "meet" nên không bao giờ bị cắt.
   Id gradient/filter đổi theo tiền tố riêng mỗi lần vẽ (nhiều tranh cùng trang). Không mạng.
   ============================================================ */
(function (global) {
  'use strict';

  const INK = '#2d2416';
  const AX = [0.95, 0.18];  // trục x (rộng) trên màn hình — nghiêng nhẹ để vật rộng không trôi khỏi khung
  const AY = [-0.5, 0.3];   // trục y (sâu)

  /** Pha màu: f > 0 sáng lên (về trắng), f < 0 tối đi (về đen). */
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round((t - v) * p + v));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  const pts = (list) => list.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');

  /** Bộ vẽ cho 1 tranh: giữ defs + tiền tố id. */
  function kit(p) {
    const defs = [];
    const P = (ox, oy, x, y, z) => [ox + x * AX[0] + y * AY[0], oy + x * AX[1] + y * AY[1] - z];
    const ol = (w) => `stroke="${INK}" stroke-width="${w || 2}" stroke-linejoin="round"`;
    let gid = 0;

    /** Gradient tuyến tính dọc (trên sáng → dưới tối) cho 1 mặt. */
    function lin(c1, c2, vertical) {
      const id = `${p}g${++gid}`;
      defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="${vertical === false ? 1 : 0}" y2="${vertical === false ? 0 : 1}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`);
      return `url(#${id})`;
    }
    /** Khối hộp 3D: mặt trên + trước + phải, có bóng đổ mềm. opt: { open: miệng hộp tối (thùng), shadow:false, top/front/right: đè màu } */
    function box(ox, oy, w, d, h, col, opt) {
      const o = opt || {};
      const A = (x, y, z) => P(ox, oy, x, y, z);
      const top = [A(0, 0, h), A(w, 0, h), A(w, d, h), A(0, d, h)];
      const front = [A(0, d, 0), A(w, d, 0), A(w, d, h), A(0, d, h)];
      const right = [A(w, 0, 0), A(w, d, 0), A(w, d, h), A(w, 0, h)];
      let s = '';
      if (o.shadow !== false) {
        const c = A(w / 2, d / 2, 0);
        s += `<ellipse cx="${c[0].toFixed(1)}" cy="${(c[1] + 6).toFixed(1)}" rx="${(w * 0.62 + d * 0.4).toFixed(1)}" ry="${(d * 0.32 + 7).toFixed(1)}" fill="#000" opacity=".28" filter="url(#${p}blur)"/>`;
      }
      s += `<polygon points="${pts(front)}" fill="${o.front || lin(shade(col, -0.08), shade(col, -0.3))}" ${ol()}/>`;
      s += `<polygon points="${pts(right)}" fill="${o.right || lin(shade(col, -0.32), shade(col, -0.52))}" ${ol()}/>`;
      s += `<polygon points="${pts(top)}" fill="${o.top || lin(shade(col, 0.35), shade(col, 0.08), false)}" ${ol()}/>`;
      if (o.open) {
        const k = Math.min(w, d) * 0.12;
        const inner = [A(k, k, h), A(w - k, k, h), A(w - k, d - k, h), A(k, d - k, h)];
        s += `<polygon points="${pts(inner)}" fill="${shade(col, -0.6)}" ${ol(1.4)}/>`;
      }
      // vệt bóng loáng trên mép trước
      const g0 = A(w * 0.08, d, h - 3), g1 = A(w * 0.55, d, h - 3);
      s += `<line x1="${g0[0].toFixed(1)}" y1="${g0[1].toFixed(1)}" x2="${g1[0].toFixed(1)}" y2="${g1[1].toFixed(1)}" stroke="#fff" stroke-opacity=".45" stroke-width="2.5" stroke-linecap="round"/>`;
      return s;
    }
    /** Ma trận để vẽ phẳng lên mặt TRƯỚC (y = d) của hộp: toạ độ cục bộ (u sang phải theo x, v xuống từ mép trên). */
    function onFront(ox, oy, d, h) {
      const o = P(ox, oy, 0, d, h);
      return `matrix(${AX[0]} ${AX[1]} 0 1 ${o[0].toFixed(1)} ${o[1].toFixed(1)})`;
    }
    /** Ma trận vẽ lên mặt TRÊN của hộp: u theo trục x, v theo trục y. */
    function onTop(ox, oy, h) {
      const o = P(ox, oy, 0, 0, h);
      return `matrix(${AX[0]} ${AX[1]} ${AY[0]} ${AY[1]} ${o[0].toFixed(1)} ${o[1].toFixed(1)})`;
    }
    /** Quả cầu bóng (đèn chiếu từ trên-trái). */
    function sphere(cx, cy, r, col, opt) {
      const o = opt || {};
      const id = `${p}s${++gid}`;
      defs.push(`<radialGradient id="${id}" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="${shade(col, 0.55)}"/><stop offset=".45" stop-color="${col}"/><stop offset="1" stop-color="${shade(col, -0.55)}"/></radialGradient>`);
      let s = o.shadow === false ? '' : `<ellipse cx="${cx}" cy="${cy + r * 0.95}" rx="${r * 0.85}" ry="${r * 0.2}" fill="#000" opacity=".3" filter="url(#${p}blur)"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})" ${ol(o.w || 2.2)}/>`;
      s += `<ellipse cx="${cx - r * 0.35}" cy="${cy - r * 0.42}" rx="${r * 0.28}" ry="${r * 0.16}" fill="#fff" opacity=".7" transform="rotate(-30 ${cx - r * 0.35} ${cy - r * 0.42})"/>`;
      return s;
    }
    /** Virus 3D: cầu + gai có núm + mặt. mood: 'angry' | 'hurt'. */
    function virus(cx, cy, r, col, mood) {
      let s = '';
      const n = r > 50 ? 12 : 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + 0.2;
        const x1 = cx + Math.cos(a) * r * 0.9, y1 = cy + Math.sin(a) * r * 0.9;
        const x2 = cx + Math.cos(a) * r * 1.32, y2 = cy + Math.sin(a) * r * 1.32;
        s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="${(r / 9).toFixed(1)}" stroke-linecap="round"/>`;
        s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${shade(col, -0.25)}" stroke-width="${(r / 16).toFixed(1)}" stroke-linecap="round"/>`;
      }
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + 0.2;
        s += sphere(+(cx + Math.cos(a) * r * 1.36).toFixed(1), +(cy + Math.sin(a) * r * 1.36).toFixed(1), Math.max(3.5, r * 0.13), shade(col, 0.15), { shadow: false, w: 1.6 });
      }
      s += sphere(cx, cy, r, col, { shadow: false });
      // đốm trên thân
      s += `<circle cx="${cx + r * 0.42}" cy="${cy + r * 0.4}" r="${r * 0.12}" fill="${shade(col, -0.35)}" opacity=".7"/><circle cx="${cx - r * 0.5}" cy="${cy + r * 0.25}" r="${r * 0.08}" fill="${shade(col, -0.35)}" opacity=".7"/>`;
      const e = r * 0.2, ey = cy - r * 0.08;
      if (mood === 'hurt') {
        s += `<path d="M${cx - r * 0.42} ${ey - e * .6}l${e} ${e}m0 -${e}l-${e} ${e}M${cx + r * 0.2} ${ey - e * .6}l${e} ${e}m0 -${e}l-${e} ${e}" stroke="${INK}" stroke-width="${(r / 14).toFixed(1)}" stroke-linecap="round"/>`;
        s += `<ellipse cx="${cx}" cy="${cy + r * 0.38}" rx="${r * 0.16}" ry="${r * 0.12}" fill="${INK}"/>`;
      } else {
        s += `<ellipse cx="${cx - r * 0.3}" cy="${ey}" rx="${e}" ry="${e * 1.1}" fill="#fff" ${ol(1.6)}/><ellipse cx="${cx + r * 0.3}" cy="${ey}" rx="${e}" ry="${e * 1.1}" fill="#fff" ${ol(1.6)}/>`;
        s += `<circle cx="${cx - r * 0.24}" cy="${ey + e * 0.25}" r="${e * 0.5}" fill="#d0021b"/><circle cx="${cx + r * 0.36}" cy="${ey + e * 0.25}" r="${e * 0.5}" fill="#d0021b"/>`;
        s += `<path d="M${cx - r * 0.55} ${ey - e * 1.5}l${r * 0.4} ${e * 0.9}M${cx + r * 0.55} ${ey - e * 1.5}l-${r * 0.4} ${e * 0.9}" stroke="${INK}" stroke-width="${(r / 11).toFixed(1)}" stroke-linecap="round"/>`;
        const my = cy + r * 0.38, mw = r * 0.42;
        s += `<path d="M${cx - mw} ${my}q${mw} ${r * 0.3} ${mw * 2} 0z" fill="${INK}"/><path d="M${cx - mw * .7} ${my + 2}l${mw * .25} ${r * .1} ${mw * .25} -${r * .1} ${mw * .25} ${r * .1} ${mw * .25} -${r * .1} ${mw * .25} ${r * .1}" fill="#fff"/>`;
      }
      return s;
    }
    /** Ngôi sao lấp lánh. */
    const spark = (x, y, s, c) => `<path class="mga-tw" d="M${x} ${y - 12 * s}l${3 * s} ${9 * s} ${9 * s} ${3 * s}-${9 * s} ${3 * s}-${3 * s} ${9 * s}-${3 * s}-${9 * s}-${9 * s}-${3 * s} ${9 * s}-${3 * s}z" fill="${c || '#fff6c4'}" ${ol(1.4)}/>`;
    /** Chữ nổi 3D (lớp dày phía sau + mặt sáng). */
    const text3d = (x, y, str, size, col, rot) => `<g transform="rotate(${rot || 0} ${x} ${y})" font-family="'Baloo 2', Inter, sans-serif" font-weight="800" font-size="${size}" text-anchor="middle">
      ${[5, 4, 3, 2, 1].map((k) => `<text x="${x + k * 0.8}" y="${y + k}" fill="${INK}">${str}</text>`).join('')}
      <text x="${x}" y="${y}" fill="${col}" stroke="${INK}" stroke-width="1.5" paint-order="stroke">${str}</text></g>`;
    const wrap = (inner) => `<svg class="mga" viewBox="0 0 640 280" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs>
      <filter id="${p}blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
      <filter id="${p}glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>${defs.join('')}</defs>${inner}</svg>`;
    return { P, ol, lin, box, onFront, onTop, sphere, virus, spark, text3d, wrap, shade };
  }

  // ============================================================
  // TỪNG TRÒ
  // ============================================================
  const ART = {};

  /** Thẻ đứng có độ dày: mặt sau (dấu ?) hoặc mặt trước (hình). */
  function card(K, x, y, rot, face, opt) {
    const o = opt || {};
    const w = 96, h = 132;
    let s = `<g transform="rotate(${rot} ${x + w / 2} ${y + h})${o.flip ? ` translate(${x + w / 2} 0) scale(${o.flip} 1) translate(${-(x + w / 2)} 0)` : ''}">`;
    s += `<ellipse cx="${x + w / 2}" cy="${y + h + 6}" rx="${w * 0.55}" ry="9" fill="#000" opacity=".3" filter="url(#${o.p}blur)"/>`;
    s += `<rect x="${x + 6}" y="${y + 6}" width="${w}" height="${h}" rx="12" fill="${face === 'back' ? '#1b3f8f' : '#b9c2cf'}" ${K.ol()}/>`; // độ dày
    if (face === 'back') {
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${K.lin('#4f8df5', '#2456c7')}" ${K.ol(2.4)}/>`;
      s += `<rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="8" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-dasharray="6 5"/>`;
      s += K.text3d(x + w / 2, y + h / 2 + 22, '?', 64, '#ffd34d');
    } else {
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${K.lin('#ffffff', '#e4eaf2')}" ${K.ol(2.4)}/>`;
      s += face;
    }
    s += `<path d="M${x + 10} ${y + 14}q${w * 0.3} -8 ${w * 0.6} 0" stroke="#fff" stroke-opacity=".7" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (o.glow) s = `<rect x="${x - 10}" y="${y - 10}" width="${w + 20}" height="${h + 20}" rx="20" fill="#7dff9e" opacity=".55" filter="url(#${o.p}glow)" transform="rotate(${rot} ${x + w / 2} ${y + h})"/>` + s;
    return s + '</g>';
  }
  /** Bàn phím 3D nhỏ vẽ trong thẻ. */
  function kbdIcon(K, cx, cy) {
    let s = K.box(cx - 30, cy - 22, 62, 30, 9, '#4a5568', { shadow: false });
    const t = K.onTop(cx - 30, cy - 22, 9);
    let keys = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) keys += `<rect x="${4 + c * 8}" y="${4 + r * 8}" width="6.5" height="6.5" rx="1.4" fill="${r === 2 && c > 1 && c < 5 ? '#e2e8f0' : '#cbd5e1'}"/>`;
    s += `<g transform="${t}">${keys}</g>`;
    return s;
  }

  ART['memory-game'] = (p) => {
    const K = kit(p);
    const kb = (x, y) => kbdIcon(K, x + 48, y + 72) + `<text x="${x + 48}" y="${y + 118}" font-family="'Baloo 2', sans-serif" font-weight="800" font-size="15" text-anchor="middle" fill="#2d3748">Bàn phím</text>`;
    const mouse = (x, y) => {
      const cx = x + 48, cy = y + 64;
      return K.sphere(cx, cy, 24, '#64748b', { shadow: false }) + `<path d="M${cx} ${cy - 24}v20" stroke="${INK}" stroke-width="2"/><rect x="${cx - 3}" y="${cy - 16}" width="6" height="10" rx="3" fill="#e2e8f0" ${K.ol(1.4)}/>` +
        `<text x="${cx}" y="${y + 118}" font-family="'Baloo 2', sans-serif" font-weight="800" font-size="15" text-anchor="middle" fill="#2d3748">Chuột</text>`;
    };
    let s = '';
    s += card(K, 70, 104, -8, 'back', { p });
    s += card(K, 185, 92, -2, mouse(185, 92), { p, flip: 0.42 }); // đang lật dở
    s += card(K, 330, 86, -5, kb(330, 86), { p, glow: true });
    s += card(K, 452, 96, 6, kb(452, 96), { p, glow: true });
    s += `<path d="M430 120q12-26 22 0" stroke="#16a34a" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    s += K.text3d(445, 66, 'Khớp!', 34, '#7dff9e', -6);
    s += K.spark(560, 70, 1.3) + K.spark(318, 70, 0.9) + K.spark(600, 190, 0.8, '#7dff9e');
    return K.wrap(s);
  };

  ART['computer-simulator'] = (p) => {
    const K = kit(p);
    let s = '';
    // thân máy (bên phải)
    s += K.box(478, 168, 56, 80, 140, '#3b4252');
    const tf = K.onFront(478, 168, 80, 140);
    s += `<g transform="${tf}"><rect x="10" y="14" width="38" height="8" rx="3" fill="#1f2430"/><rect x="10" y="28" width="38" height="8" rx="3" fill="#1f2430"/><circle cx="29" cy="62" r="7" fill="#22c55e" stroke="${INK}" stroke-width="1.6"/>
      ${[0, 1, 2, 3, 4].map((k) => `<rect x="12" y="${92 + k * 9}" width="34" height="3" rx="1.5" fill="#262b36"/>`).join('')}</g>`;
    // chân đế + màn hình
    s += K.box(272, 214, 20, 12, 40, '#94a3b8', { shadow: false });
    s += K.box(150, 172, 270, 16, 150, '#2d3748');
    const sf = K.onFront(150, 172, 16, 150);
    s += K.box(246, 226, 70, 30, 7, '#cbd5e1');
    // nội dung màn hình (u: 0..270, v: 0..150)
    s += `<g transform="${sf}">
      <rect x="10" y="10" width="250" height="128" rx="6" fill="${K.lin('#38bdf8', '#2563eb')}" stroke="${INK}" stroke-width="2"/>
      <rect x="26" y="20" width="200" height="104" rx="5" fill="#f8fafc" stroke="${INK}" stroke-width="1.6"/>
      <rect x="26" y="20" width="200" height="16" rx="5" fill="#334155"/><circle cx="214" cy="28" r="4" fill="#ef4444"/><circle cx="202" cy="28" r="4" fill="#f59e0b"/>
      ${[[40, 48], [92, 48], [144, 48], [40, 88]].map(([x, y], k) => `<path d="M${x} ${y}h14l4 5h22v22h-40z" fill="${k === 1 ? '#facc15' : '#fbbf24'}" stroke="${INK}" stroke-width="1.5"/><rect x="${x}" y="${y + 6}" width="40" height="21" rx="2" fill="${k === 1 ? '#fde047' : '#fcd34d'}" stroke="${INK}" stroke-width="1.5"/><rect x="${x + 2}" y="${y + 31}" width="36" height="5" rx="2" fill="#cbd5e1"/>`).join('')}
      <rect x="150" y="84" width="26" height="32" rx="2" fill="#fff" stroke="${INK}" stroke-width="1.5"/><path d="M155 94h16M155 101h16M155 108h10" stroke="#2563eb" stroke-width="2"/>
      <path d="M140 100q-20-20 -40-36" stroke="#16a34a" stroke-width="3" fill="none" stroke-dasharray="5 4"/><path d="M98 58l6 12 4-8z" fill="#16a34a"/>
      <path d="M176 112l0 22 6-6 5 10 4-2-5-10 8 0z" fill="#fff" stroke="${INK}" stroke-width="1.6"/></g>`;
    // bàn phím
    s += K.box(110, 240, 170, 30, 8, '#e2e8f0');
    const kt = K.onTop(110, 240, 8);
    let keys = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 13; c++) keys += `<rect x="${6 + c * 12.4}" y="${4 + r * 8.2}" width="10" height="6.5" rx="1.6" fill="${c === 12 && r === 1 ? '#22c55e' : '#94a3b8'}"/>`;
    s += `<g transform="${kt}">${keys}</g>`;
    s += K.sphere(322, 258, 12, '#e2e8f0');
    s += K.text3d(560, 62, 'Xong!', 30, '#7dff9e', 8) + K.spark(600, 30, 1) + K.spark(120, 70, 0.8);
    return K.wrap(s);
  };

  ART['cyber-detective'] = (p) => {
    const K = kit(p);
    let s = '';
    // laptop
    s += K.box(230, 168, 200, 100, 8, '#a0aec0');
    const kt = K.onTop(230, 168, 8);
    let keys = '';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 14; c++) keys += `<rect x="${14 + c * 12.5}" y="${10 + r * 11}" width="10" height="8.5" rx="2" fill="#4a5568"/>`;
    s += `<g transform="${kt}">${keys}<rect x="70" y="62" width="60" height="34" rx="4" fill="#718096"/></g>`;
    // màn hình dựng ở mép sau, hơi ngả
    const A = (x, y, z) => K.P(230, 168, x, y, z);
    const scr = [A(0, 0, 8), A(200, 0, 8), A(200, -22, 132), A(0, -22, 132)];
    s += `<polygon points="${pts(scr)}" fill="${K.lin('#4a5568', '#1a202c')}" ${K.ol(2.2)}/>`;
    const o = A(0, -22, 132);
    // ma trận mặt màn hình: u theo x, v theo hướng xuống của màn hình
    const vx = (A(0, 0, 8)[0] - o[0]) / 124, vy = (A(0, 0, 8)[1] - o[1]) / 124;
    s += `<g transform="matrix(${AX[0]} ${AX[1]} ${vx.toFixed(3)} ${vy.toFixed(3)} ${o[0].toFixed(1)} ${o[1].toFixed(1)})">
      <rect x="8" y="8" width="184" height="108" rx="4" fill="#0f172a"/>
      <rect x="40" y="26" width="120" height="76" rx="6" fill="#fff" stroke="#ef4444" stroke-width="3"/>
      <path d="M40 30l60 40 60-40" fill="none" stroke="#94a3b8" stroke-width="3"/>
      <path d="M118 52v26a10 10 0 1 1-10-10" fill="none" stroke="#475569" stroke-width="4" stroke-linecap="round"/>
      <circle cx="160" cy="28" r="14" fill="#ef4444" stroke="${INK}" stroke-width="2"/><text x="160" y="35" font-family="'Baloo 2', sans-serif" font-weight="800" font-size="20" fill="#fff" text-anchor="middle">!</text></g>`;
    // thẻ manh mối rải bên trái
    const clue = (x, y, rot, icon, open) => `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x + 4}" y="${y + 4}" width="70" height="52" rx="6" fill="#00000040"/><rect x="${x}" y="${y}" width="70" height="52" rx="6" fill="${open ? '#fff7d6' : '#e2e8f0'}" ${K.ol()}/>${icon}</g>`;
    s += clue(40, 160, -10, `<text x="75" y="198" font-family="'Baloo 2', sans-serif" font-weight="800" font-size="28" fill="#94a3b8" text-anchor="middle">?</text>`);
    s += clue(70, 92, 6, `<path d="M95 112a10 10 0 1 1 0 .1M105 112h22m-6 0v8m-6-8v6" stroke="#b45309" stroke-width="3.5" fill="none" stroke-linecap="round"/>`, true);
    s += clue(130, 196, 4, `<path d="M152 228a14 14 0 0 1 28 0M157 228a9 9 0 0 1 18 0M162 228a4 4 0 0 1 8 0" stroke="#2563eb" stroke-width="3" fill="none" stroke-linecap="round"/>`, true);
    // kính lúp
    s += `<g transform="rotate(-28 520 150)"><rect x="508" y="178" width="24" height="86" rx="10" fill="${K.lin('#a0522d', '#5c2e12', false)}" ${K.ol(2.2)}/><rect x="506" y="172" width="28" height="14" rx="4" fill="#c9a227" ${K.ol(1.8)}/></g>`;
    s += `<circle cx="505" cy="118" r="64" fill="none" stroke="${INK}" stroke-width="18"/><circle cx="505" cy="118" r="64" fill="none" stroke="${K.lin('#ffe58a', '#b7791f')}" stroke-width="13"/>`;
    s += `<circle cx="505" cy="118" r="57" fill="${K.lin('#bfe9ff', '#5fb4e8')}" opacity=".55" ${K.ol(1.6)}/>`;
    s += `<path d="M468 94q14-24 42-26" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".85"/>`;
    // dấu vân tay trong kính
    s += `<g stroke="#1e3a8a" stroke-width="2.4" fill="none" opacity=".8">${[8, 15, 22, 29].map((r) => `<path d="M${505 - r} ${130}a${r} ${r + 4} 0 0 1 ${r * 2} 0"/>`).join('')}</g>`;
    s += K.spark(590, 46, 1.1) + K.spark(430, 40, 0.8);
    return K.wrap(s);
  };

  ART['pz-defense'] = (p) => {
    const K = kit(p);
    let s = '';
    // 2 tủ Server
    const rack = (ox, oy, h) => {
      let r = K.box(ox, oy, 64, 56, h, '#334155');
      const f = K.onFront(ox, oy, 56, h);
      let rows = '';
      for (let k = 0; k < Math.floor((h - 16) / 18); k++) {
        rows += `<rect x="6" y="${10 + k * 18}" width="52" height="13" rx="2.5" fill="#1e293b" stroke="#0f172a"/><circle cx="14" cy="${16.5 + k * 18}" r="2.6" fill="${k % 3 === 1 ? '#facc15' : '#22c55e'}"/><circle cx="22" cy="${16.5 + k * 18}" r="2.6" fill="#38bdf8"/><rect x="30" y="${14 + k * 18}" width="22" height="4" rx="2" fill="#475569"/>`;
      }
      return r + `<g transform="${f}">${rows}</g>`;
    };
    s += rack(110, 182, 160) + rack(176, 210, 122);
    // vòm lá chắn trong suốt trùm lên 2 tủ Server (nửa elip, tâm 190;262)
    const sh = K.lin('#c8fbff', '#2bb5e8');
    s += `<path d="M40 262A150 240 0 0 1 340 262" fill="none" stroke="#7df9ff" stroke-width="18" opacity=".45" filter="url(#${p}glow)"/>`;
    s += `<path d="M40 262A150 240 0 0 1 340 262Z" fill="${sh}" opacity=".3"/>`;
    s += `<path d="M40 262A150 240 0 0 1 340 262" fill="none" stroke="#a5f7ff" stroke-width="4"/>`;
    s += `<path d="M78 200A118 200 0 0 1 150 52" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".6"/>`;
    s += `<g stroke="#e0fbff" stroke-width="1.8" opacity=".55" fill="none">${[[110, 120], [190, 70], [270, 120], [150, 180], [230, 180], [300, 200], [80, 210]].map(([x, y]) => `<path d="M${x} ${y - 16}l14 8v16l-14 8-14-8v-16z"/>`).join('')}</g>`;
    // mã độc lao tới
    s += `<path d="M520 170h80M590 110h40M610 226h28" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>`;
    s += K.virus(470, 170, 32, '#7ac943', 'angry');
    s += K.virus(575, 222, 22, '#e5484d', 'angry');
    s += K.virus(568, 110, 18, '#f59e0b', 'angry');
    s += K.virus(362, 138, 20, '#8b5cf6', 'hurt');
    // tia lửa chỗ mã độc va vào vòm và bị bật ra
    s += `<g transform="translate(324 150)"><path d="M0-30l8 21 21-7-14 17 16 14-22-1-2 22-9-20-17 12 6-21-20-9 21-3z" fill="#ffd34d" stroke="${INK}" stroke-width="2"/></g>`;
    s += `<path d="M380 112q14-16 30-14M386 160q16 6 26 22" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    s += K.text3d(440, 66, 'CHẶN!', 34, '#7df9ff', -6);
    return K.wrap(s);
  };

  ART['battle-quiz'] = (p) => {
    const K = kit(p);
    let s = '';
    // thanh máu Boss (3D)
    s += `<rect x="381" y="35" width="196" height="20" rx="7" fill="#0b0f19"/><rect x="376" y="30" width="196" height="20" rx="7" fill="#1f2937" ${K.ol(2.2)}/>`;
    s += `<rect x="381" y="34" width="186" height="12" rx="4" fill="#450a0a"/><rect x="381" y="34" width="74" height="12" rx="4" fill="${K.lin('#fb7185', '#be123c')}"/><rect x="455" y="34" width="30" height="12" fill="#fde047" opacity=".9"/><rect x="383" y="35" width="70" height="3" rx="1.5" fill="#fff" opacity=".5"/>`;
    s += `<text x="470" y="24" font-family="'Baloo 2', sans-serif" font-weight="800" font-size="16" fill="#fff" stroke="${INK}" stroke-width="3" paint-order="stroke" text-anchor="middle">TRÙM VIRUS</text>`;
    // Boss
    s += `<ellipse cx="480" cy="262" rx="110" ry="16" fill="#000" opacity=".35" filter="url(#${p}blur)"/>`;
    s += K.virus(482, 160, 78, '#9b5de5', 'angry');
    // đòn combo bay tới
    s += `<path d="M30 200q120-30 300-50" stroke="#ffd34d" stroke-width="26" stroke-linecap="round" opacity=".35" filter="url(#${p}glow)"/>`;
    s += `<path d="M40 204q120-34 290-56" stroke="#fff6c4" stroke-width="8" stroke-linecap="round" opacity=".9"/>`;
    s += K.sphere(330, 148, 26, '#ffb703', { shadow: false });
    s += `<path d="M322 132l-10 20h12l-6 18 18-24h-12l8-14z" fill="#fff" stroke="${INK}" stroke-width="1.6"/>`;
    // chỗ trúng đòn
    s += `<g transform="translate(400 150)"><path d="M0-40l10 26 28-10-18 22 22 18-30-2-4 30-12-26-24 16 8-28-28-12 30-4z" fill="#fff6c4" stroke="${INK}" stroke-width="2.2"/></g>`;
    s += K.text3d(170, 104, 'COMBO ×5', 40, '#ffd34d', -8);
    s += `<text x="368" y="96" font-family="'Baloo 2', sans-serif" font-weight="800" font-size="24" fill="#ff5d73" stroke="${INK}" stroke-width="3" paint-order="stroke">-26</text>`;
    s += K.spark(90, 60, 1) + K.spark(260, 230, 0.8);
    return K.wrap(s);
  };

  let seq = 0;
  /** Tranh 3D của 1 trò (chuỗi <svg>), '' nếu chưa có. */
  function draw(gameId) {
    const f = ART[gameId];
    return f ? f('mga' + (++seq) + '-') : '';
  }

  global.EduArenaMiniArt = { draw, has: (id) => !!ART[id], shade };
})(typeof window !== 'undefined' ? window : globalThis);
