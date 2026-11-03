/* ============================================================
   js/name-picker/np-art-extra.js — tranh SVG thêm (cùng nét với np-art.js, có khối 3D vol()):
     nhân vật/đạo cụ  bee · bloom(c) · cat · mouse(c) · kite(c, c2) · ball · goalie · light (đèn giao thông) · seeker
     cảnh 1000×600    garden · kitchen · meadow · goal (sân bóng, khung thành giữa) · yard (sân trường) · banyan (gốc đa)
   Dùng ở: 6 trò thêm của Gọi tên (np-games-extra.js) và chế độ "Sút luân lưu" của Đấu trường (arena-scene.js).
   Gắn vào EduNamePickerArt.extra; cảnh đăng ký qua addScene(). Không tải ảnh ngoài.
   ============================================================ */
(function (global) {
  'use strict';

  const A = global.EduNamePickerArt;
  if (!A || !A.addScene || A.extra) return;
  const { INK, ol, svg, skyGrad, cloud, sun, tree, tuft, flower, bush, blades, rock, front, farHills, vol } = A.paint;
  const FUN = A.FUN;

  // ============================================================
  // TRANH NHÂN VẬT / ĐẠO CỤ (mặc định quay mặt sang phải — sprite tự lật khi đi sang trái)
  // ============================================================
  const bee = () => `<svg class="np-bee" viewBox="0 0 84 64" aria-hidden="true">
    <g class="np-bee-wing"><ellipse cx="36" cy="15" rx="11" ry="15" fill="rgba(214,238,255,.88)" stroke="${INK}" stroke-width="1.6" transform="rotate(-22 36 15)"/></g>
    <path d="M9 36l-8 3 8 4z" fill="${INK}"/>
    ${vol(`<ellipse cx="36" cy="38" rx="27" ry="20" fill="#ffc928"/>`, 'npSph')}
    <g stroke="${INK}" stroke-width="7" fill="none"><path d="M25 21q-5 17 0 34"/><path d="M39 18.5q-5 20 0 39"/></g>
    <ellipse cx="36" cy="38" rx="27" ry="20" fill="none" stroke="${INK}" stroke-width="2.2"/>
    <ellipse cx="30" cy="28" rx="10" ry="4" fill="#fff3a8" opacity=".7"/>
    <path d="M60 23q1-12 8-15M65 24q6-10 13-8" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="68" cy="8" r="2.6" fill="${INK}"/><circle cx="78" cy="16" r="2.6" fill="${INK}"/>
    ${vol(`<circle cx="62" cy="35" r="13" fill="#ffd84a" stroke="${INK}" stroke-width="2.2"/>`, 'npSph')}
    <circle cx="66" cy="32" r="3.2" fill="#2a1a12"/><circle cx="67" cy="31" r="1.1" fill="#fff"/><ellipse cx="68" cy="40" rx="3" ry="1.8" fill="#f59a9a" opacity=".7"/>
    <path d="M60 40q4 4 8 1" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <g class="np-bee-wing np-bee-wing-f"><ellipse cx="46" cy="13" rx="10" ry="14" fill="rgba(236,248,255,.92)" stroke="${INK}" stroke-width="1.6" transform="rotate(16 46 13)"/></g>
  </svg>`;
  /** Hoa trong vườn: cuống + lá + cánh (CSS .is-bloom nở to, .is-droop cụp xuống). */
  const bloom = (c) => `<svg class="np-bloom" viewBox="0 0 60 110" aria-hidden="true"><g ${ol(1.8)}>
    <path d="M30 108V42" stroke="#3f7a2a" stroke-width="5" fill="none"/>
    <path d="M30 84q-18-3-23-18 16-1 23 11z" fill="#5fae45"/><path d="M30 72q18-3 23-18-16-1-23 11z" fill="#4f9a3a"/>
    <g class="np-petals">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<ellipse cx="30" cy="15" rx="8" ry="13" fill="${c}" transform="rotate(${a} 30 30)"/>`).join('')}
      ${vol(`<circle cx="30" cy="30" r="9.5" fill="#ffc21f"/>`, 'npSph')}<circle cx="27" cy="27" r="3" fill="#fff3a8" stroke="none"/></g></g></svg>`;
  const cat = () => `<svg class="np-cat" viewBox="0 0 132 98" aria-hidden="true"><g ${ol(2.4)}>
    <path class="np-cat-tail" d="M24 60q-24-6-17-36 4-10 11-6-7 13 1 27 6 9 13 9z" fill="#f29a3a"/>
    <rect class="leg" x="30" y="70" width="12" height="24" rx="6" fill="#f29a3a"/><rect class="leg" x="74" y="70" width="12" height="24" rx="6" fill="#f29a3a"/>
    ${vol(`<ellipse cx="60" cy="60" rx="38" ry="22" fill="#f6a744"/>`, 'npSph')}
    <path d="M40 44q5 10 0 26M54 40q5 13 0 36M68 40q5 12 0 32" stroke="#d97a1f" stroke-width="4" fill="none"/>
    <path d="M44 72q16 8 34 0" fill="#ffe2b8" stroke="none"/>
    <rect class="leg" x="42" y="72" width="12" height="23" rx="6" fill="#f6a744"/><rect class="leg" x="86" y="70" width="12" height="25" rx="6" fill="#f6a744"/>
    <path d="M80 26l3-23 16 15z" fill="#f8b04f"/><path d="M106 18l14-15 2 24z" fill="#f8b04f"/>
    <path d="M84 22l1-11 8 8zM109 17l7-7 1 11z" fill="#f7a1b0" stroke="none"/>
    ${vol(`<circle cx="98" cy="42" r="25" fill="#f8b04f"/>`, 'npSph')}
    <path d="M90 22q8 4 16 0" stroke="#d97a1f" stroke-width="3" fill="none"/>
    <ellipse cx="100" cy="52" rx="13" ry="9" fill="#ffe2b8" stroke="none"/>
    <g stroke="none"><ellipse class="np-cat-eye" cx="91" cy="39" rx="4.2" ry="6" fill="#2a1a12"/><ellipse class="np-cat-eye" cx="108" cy="39" rx="4.2" ry="6" fill="#2a1a12"/><circle cx="92.5" cy="37" r="1.5" fill="#fff"/><circle cx="109.5" cy="37" r="1.5" fill="#fff"/></g>
    <path d="M99.5 48l-4-3h8z" fill="#e5627a" stroke-width="1.4"/><path d="M99.5 48q-3 5-8 3M99.5 48q3 5 8 3" fill="none" stroke-width="1.6"/>
    <path d="M86 50h-17M86 54l-15 5M113 50h17M113 54l15 5" stroke-width="1.3"/></g></svg>`;
  const mouse = (c) => `<svg class="np-mouse" viewBox="0 0 74 48" aria-hidden="true"><g ${ol(1.8)}>
    <path class="np-mouse-tail" d="M12 36q-13 1-11-12 2-7 9-5" fill="none" stroke="#c98b9b" stroke-width="3"/>
    ${vol(`<path d="M10 38q-1-24 26-26 23-1 31 17 2 7-5 9z" fill="#aab0bc"/>`, 'npSph')}
    <path d="M18 34q14 4 40 2" stroke="#8d93a0" stroke-width="2" fill="none"/>
    <circle cx="44" cy="15" r="9.5" fill="#aab0bc"/><circle cx="44" cy="15" r="5.6" fill="#f4b6c2" stroke="none"/>
    <path d="M36 16q5 10 2 22" stroke="${c}" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    <circle cx="57" cy="24" r="2.8" fill="#2a1a12" stroke="none"/><circle cx="58" cy="23" r="1" fill="#fff" stroke="none"/>
    <circle cx="68" cy="29" r="2.8" fill="#e5627a"/><path d="M66 31l8 2M66 29l8-2" stroke-width="1"/>
    <path d="M22 40v5M50 40v5" stroke-width="2.6"/></g></svg>`;
  /** Diều hình thoi 2 màu, đuôi nơ (CSS .np-kite-tail vẫy). Tâm diều ở (35, 37)/130 chiều cao. */
  const kite = (c, c2) => `<svg class="np-kite" viewBox="0 0 70 130" aria-hidden="true"><g ${ol(2)}>
    <path class="np-kite-tail" d="M35 72q-11 12 0 24t0 32" fill="none" stroke-width="2"/>
    <path d="M27 88l8 4-8 4zM43 88l-8 4 8 4zM27 110l8 4-8 4zM43 110l-8 4 8 4z" fill="${c2}" stroke-width="1.4"/>
    ${vol(`<path d="M35 2L66 35 35 72 4 35z" fill="${c}"/>`, 'npSphSoft')}<path d="M35 2L66 35H35zM35 72L4 35h31z" fill="${c2}"/>
    <path d="M35 2v70M4 35h62" stroke-width="1.6" fill="none"/><path d="M14 30l12-14" stroke="#fff" stroke-width="3" opacity=".55" fill="none"/></g></svg>`;
  const ball = () => `<svg class="np-fball" viewBox="0 0 30 30" aria-hidden="true">${vol(`<circle cx="15" cy="15" r="13" fill="#fff" stroke="${INK}" stroke-width="2"/>`, 'npSph')}
    <path d="M15 9l5 3.6-1.9 5.9h-6.2L10 12.6z" fill="${INK}"/><path d="M15 9V3M20 12.6l5.6-2M18.1 18.5l3.4 5M11.9 18.5l-3.4 5M10 12.6l-5.6-2" stroke="${INK}" stroke-width="1.6"/></svg>`;
  /** Thủ môn = học sinh mặc áo xanh lá, găng vàng. */
  const goalie = () => A.kid(6).replace(/fill="#fff" stroke/g, 'fill="#22b573" stroke').replace(/fill="#dfe6f3"/g, 'fill="#17925a"')
    .replace(/fill="#e23b2e"/g, 'fill="#22b573"').replace(/fill="#d22f22"/g, 'fill="#22b573"').replace(/fill="#24408c"/g, 'fill="#1d2b3a"')
    .replace(/<circle cx="(13\.5|50\.5)" cy="61" r="3\.6" fill="[^"]+"/g, '<circle cx="$1" cy="61" r="5.2" fill="#ffd21f"')
    .replace('class="np-kid"', 'class="np-kid np-goalie"');
  /** Đèn giao thông có mắt — "người canh" của Đèn xanh đèn đỏ (CSS .is-red / .is-green bật đèn). */
  const light = () => `<svg class="np-tlight" viewBox="0 0 70 190" aria-hidden="true"><g ${ol(2.4)}>
    ${vol(`<rect x="31" y="96" width="8" height="90" fill="#6b7280"/>`, 'npCyl')}<rect x="18" y="182" width="34" height="7" rx="3" fill="#4b5563"/>
    ${vol(`<rect x="8" y="4" width="54" height="100" rx="14" fill="#2b2f3a"/>`, 'npCyl')}<rect x="13" y="9" width="44" height="90" rx="10" fill="#363b48" stroke="none"/>
    <circle class="np-lamp np-lamp-r" cx="35" cy="26" r="11" fill="#5a2626"/><circle class="np-lamp np-lamp-y" cx="35" cy="53" r="11" fill="#5a4a1e"/><circle class="np-lamp np-lamp-g" cx="35" cy="80" r="11" fill="#1e4a2e"/></g>
    <g class="np-tlight-eyes"><ellipse cx="29" cy="25" rx="2.6" ry="3.4" fill="#fff"/><ellipse cx="41" cy="25" rx="2.6" ry="3.4" fill="#fff"/><circle class="np-pupil" cx="29" cy="26" r="1.5" fill="#1a1a1a"/><circle class="np-pupil" cx="41" cy="26" r="1.5" fill="#1a1a1a"/></g></svg>`;
  /** Người bịt mắt: học sinh có khăn đỏ che mắt (CSS .np-seeker giữ dáng đứng, dang tay dò đường). */
  const seeker = () => A.kid(9).replace(/<\/svg>\s*$/, `<g class="np-blindfold"><path d="M12.5 21q19.5-5 39 0v10q-19.5-5-39 0z" fill="#e23b2e" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M13 23l-9-5 1 9zM13 28l-8 6 9 1z" fill="#c62e22" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/></g></svg>`).replace('class="np-kid"', 'class="np-kid np-seeker-kid"');

  const ICON = {
    bee: () => bee(),
    cat: () => mouse('#e5484d'),
    kite: () => `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M30 26q-8 8-2 14t-6 8" fill="none" stroke="${INK}" stroke-width="1.6"/><path d="M30 2l14 14-14 12-14-12z" fill="#e5484d" stroke="${INK}" stroke-width="2"/><path d="M30 2l14 14H30zM30 28L16 16h14z" fill="#ffc21f" stroke="${INK}" stroke-width="1.6"/></svg>`,
    goal: () => `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 40V10h40v30" fill="none" stroke="${INK}" stroke-width="3"/><path d="M8 14h32M8 20h32M8 26h32M8 32h32M14 10v30M22 10v30M30 10v30M38 10v30" stroke="#9aa" stroke-width="1"/><g transform="translate(26 26) scale(.7)">${ball().replace(/<\/?svg[^>]*>/g, '')}</g></svg>`,
    redlight: () => `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="14" y="2" width="20" height="44" rx="7" fill="#2b2f3a" stroke="${INK}" stroke-width="2"/><circle cx="24" cy="12" r="5" fill="#ff3b30"/><circle cx="24" cy="24" r="5" fill="#5a4a1e"/><circle cx="24" cy="36" r="5" fill="#2ecc71"/></svg>`,
    blind: () => `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="26" r="17" fill="#fbd3b0" stroke="${INK}" stroke-width="2"/><path d="M7 24q-1-18 17-18t17 18q-6-8-17-8T7 24z" fill="#3b2418" stroke="${INK}" stroke-width="2"/><path d="M6 22q18-5 36 0v9q-18-5-36 0z" fill="#e23b2e" stroke="${INK}" stroke-width="2"/><path d="M19 37q5 3 10 0" stroke="${INK}" stroke-width="2" fill="none"/></svg>`,
  };

  // ============================================================
  // CẢNH NỀN 1000×600
  // ============================================================
  A.addScene('garden', () => svg(`${skyGrad('skyG', '#5fb8f4', '#e2f5ff')}<rect width="1000" height="600" fill="url(#skyG)"/>${sun(860, 80, 40, true)}
    ${cloud(260, 40, 1, 'd1')}${cloud(560, 92, .8, 'd2')}
    ${farHills(250, '#a9dc85', '#5aa83e')}<path d="M0 262Q300 200 600 240T1000 226V600H0z" fill="#86c95f" stroke="#4f9a3a" stroke-width="2"/>
    <g stroke="${INK}" stroke-width="2.4" fill="#fff6e6">${Array.from({ length: 26 }, (_, k) => `<path d="M${k * 40 + 6} 248v-38l8-10 8 10v38z"/>`).join('')}<rect x="0" y="218" width="1000" height="8" fill="#f1e3c8"/></g>
    <rect y="248" width="1000" height="352" fill="#7cc257"/><rect y="248" width="1000" height="352" fill="url(#npGrassG)"/>
    ${Array.from({ length: 30 }, (_, k) => tuft(20 + k * 34, 270 + (k % 4) * 80, k % 2 ? '#6cb84f' : '#5fae45')).join('')}
    ${tree(70, 178, 1.15)}<g transform="translate(118 196)" stroke="${INK}" stroke-width="2.4"><path d="M-2 -18v8" fill="none"/><path d="M-22 -8q22-14 44 0 6 16 0 30-22 14-44 0-6-16 0-30z" fill="#f2b632"/>
      <path d="M-24 2h48M-22 12h44" stroke="#b9821c" stroke-width="2.5"/><ellipse cx="0" cy="18" rx="6" ry="4" fill="#5a3a12"/></g>
    ${flower(300, 290, '#ff8fa3')}${flower(640, 300, '#fff3b0')}${flower(820, 284, '#c9a4ff')}${front(592)}`));

  A.addScene('kitchen', () => svg(`<rect width="1000" height="360" fill="#fbe6c4"/>
    <g stroke="#ecd0a2" stroke-width="2">${Array.from({ length: 21 }, (_, k) => `<path d="M${k * 50} 0v360"/>`).join('')}${Array.from({ length: 8 }, (_, k) => `<path d="M0 ${k * 50}h1000"/>`).join('')}</g>
    <g stroke="${INK}" stroke-width="3"><rect x="380" y="40" width="220" height="150" rx="8" fill="#9fdcff"/><path d="M490 40v150M380 115h220" fill="none"/>
      <path d="M370 30h240v14H370z" fill="#d68a45"/><path d="M380 44q40 60 0 120zM600 44q-40 60 0 120z" fill="#ff8fa3"/></g>
    ${cloud(420, 60, .45, 'd1')}
    <g stroke="${INK}" stroke-width="3"><rect x="680" y="150" width="300" height="200" fill="#c58b52"/><rect x="690" y="160" width="135" height="180" rx="6" fill="#d89a5e"/><rect x="835" y="160" width="135" height="180" rx="6" fill="#d89a5e"/>
      <circle cx="812" cy="250" r="6" fill="#f2b632"/><circle cx="848" cy="250" r="6" fill="#f2b632"/><rect x="670" y="136" width="320" height="18" fill="#e9e1d2"/>
      <path d="M720 136v-40h60v40z" fill="#e5484d"/><path d="M714 96h72" fill="none"/><circle cx="880" cy="118" r="18" fill="#7cc4ff"/></g>
    <g stroke="${INK}" stroke-width="3"><path d="M40 360V260q0-40 40-40t40 40v100z" fill="#2a1a12"/><path d="M48 360V264q0-34 32-34t32 34v96" fill="none" stroke="#5a3a24" stroke-width="4"/></g>
    <rect y="346" width="1000" height="18" fill="#a4683a" stroke="${INK}" stroke-width="3"/>
    ${Array.from({ length: 50 }, (_, k) => `<rect x="${(k % 10) * 100 + (Math.floor(k / 10) % 2) * 50}" y="${364 + Math.floor(k / 10) * 48}" width="50" height="48" fill="#f3e9d8"/>`).join('')}
    <rect y="364" width="1000" height="236" fill="#d9c6a4" opacity=".35"/>${Array.from({ length: 50 }, (_, k) => `<rect x="${(k % 10) * 100 + 50 - (Math.floor(k / 10) % 2) * 50}" y="${364 + Math.floor(k / 10) * 48}" width="50" height="48" fill="#c9a77a" opacity=".55"/>`).join('')}
    <g transform="translate(150 372)" stroke="${INK}" stroke-width="2.4"><path d="M0 26l40-24h30v24z" fill="#ffc928"/><circle cx="34" cy="16" r="4" fill="#e0a800"/><circle cx="54" cy="20" r="3" fill="#e0a800"/></g>`));

  A.addScene('meadow', () => svg(`${skyGrad('skyM', '#3d9be9', '#d4efff')}<rect width="1000" height="600" fill="url(#skyM)"/>${sun(120, 90, 38)}
    ${cloud(300, 60, 1.1, 'd1')}${cloud(620, 130, .9, 'd2')}${cloud(820, 40, .8, 'd3')}${cloud(60, 230, .6, 'd2')}
    ${farHills(520, '#a2d77c', '#5aa83e')}<path d="M0 540Q250 500 500 530T1000 520V600H0z" fill="#7cc257" stroke="#4f9a3a" stroke-width="2"/>
    ${tree(930, 520, .7)}${tree(40, 530, .6, true)}${Array.from({ length: 18 }, (_, k) => tuft(30 + k * 56, 560 + (k % 3) * 10)).join('')}`));

  A.addScene('goal', () => svg(`${skyGrad('skyGo', '#2c3e8f', '#6aa8e8')}<rect width="1000" height="120" fill="url(#skyGo)"/>
    <g stroke="${INK}" stroke-width="2.5"><path d="M0 120V40h1000v80z" fill="#3a4a6a"/>${Array.from({ length: 3 }, (_, r) => `<path d="M0 ${60 + r * 22}h1000" stroke="#2a3550" stroke-width="2"/>`).join('')}</g>
    ${Array.from({ length: 120 }, (_, k) => `<circle cx="${(k % 40) * 25 + 12 + (Math.floor(k / 40) % 2) * 12}" cy="${54 + Math.floor(k / 40) * 22}" r="7" fill="${FUN[(k * 7) % FUN.length]}" opacity=".85"/>`).join('')}
    <rect y="118" width="1000" height="482" fill="#4fa83a"/>${Array.from({ length: 8 }, (_, k) => `<rect y="${118 + k * 62}" width="1000" height="31" fill="#5bb546"/>`).join('')}<rect y="118" width="1000" height="482" fill="url(#npGrassG)"/>
    <g fill="none" stroke="#fff" stroke-width="4" opacity=".9"><path d="M0 312h1000"/><rect x="200" y="312" width="600" height="190"/><rect x="340" y="312" width="320" height="70"/><path d="M400 502q100 60 200 0"/></g>
    <circle cx="500" cy="420" r="5" fill="#fff"/>
    <g><path d="M330 312l20-140h300l20 140z" fill="rgba(255,255,255,.18)"/>
      <g stroke="rgba(255,255,255,.75)" stroke-width="1.4">${Array.from({ length: 16 }, (_, k) => `<path d="M${350 + k * 20} 172l${-20 + k * 2.6} 140"/>`).join('')}${Array.from({ length: 7 }, (_, k) => `<path d="M${347 - k * 3} ${192 + k * 20}h${306 + k * 6}"/>`).join('')}</g>
      <g stroke="${INK}" stroke-width="3"><rect x="322" y="160" width="14" height="154" rx="4" fill="#fff"/><rect x="664" y="160" width="14" height="154" rx="4" fill="#fff"/><rect x="322" y="154" width="356" height="14" rx="4" fill="#fff"/></g></g>`));

  A.addScene('yard', () => svg(`${skyGrad('skyY', '#6ec1f5', '#e4f6ff')}<rect width="1000" height="600" fill="url(#skyY)"/>${cloud(120, 30, .8, 'd1')}${cloud(700, 50, .7, 'd2')}
    <g stroke="${INK}" stroke-width="3"><rect x="140" y="120" width="720" height="180" fill="#f7d774"/><path d="M120 124h760l-30-40H150z" fill="#d8573a"/>
      ${Array.from({ length: 10 }, (_, k) => `<rect x="${170 + k * 68}" y="150" width="40" height="44" fill="#9fdcff"/><rect x="${170 + k * 68}" y="222" width="40" height="44" fill="#9fdcff"/>`).join('')}
      <rect x="420" y="94" width="160" height="28" rx="4" fill="#fffdf7"/></g>
    <text x="500" y="115" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="18" fill="#2f6b25">SÂN TRƯỜNG</text>
    ${tree(80, 290, 1)}${tree(940, 290, 1, true)}
    <rect y="300" width="1000" height="300" fill="#d9d2c2"/>${Array.from({ length: 11 }, (_, k) => `<path d="M${k * 100} 300v300" stroke="#c9c1ae" stroke-width="2"/>`).join('')}${Array.from({ length: 6 }, (_, k) => `<path d="M0 ${330 + k * 50}h1000" stroke="#c9c1ae" stroke-width="2"/>`).join('')}
    <path d="M840 316v280" stroke="#fff" stroke-width="10" stroke-dasharray="26 14"/><text x="800" y="336" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="26" fill="#fff" stroke="${INK}" stroke-width="1.2">ĐÍCH</text>
    <path d="M330 316v280" stroke="#fff" stroke-width="5" opacity=".7"/>`));

  A.addScene('banyan', () => svg(`${skyGrad('skyV', '#f7a95c', '#ffe8b8')}<rect width="1000" height="600" fill="url(#skyV)"/>${sun(820, 120, 46)}${cloud(200, 50, .8, 'd1')}
    ${farHills(280, '#b5d98a', '#6aa84a')}
    ${Array.from({ length: 12 }, (_, k) => bush(30 + k * 88, 300, .9 + (k % 3) * .15, k % 2 ? '#3f8a30' : '#4f9a3a')).join('')}
    <g transform="translate(150 300)" stroke="${INK}" stroke-width="3"><path d="M-30 0q10-90-8-150h60q-16 60-4 150z" fill="#8a5a30"/><path d="M-20 -60q-30 10-34 60M20 -50q26 20 30 50" fill="none" stroke="#8a5a30" stroke-width="7"/>
      ${[[-110, -170, 80], [0, -220, 100], [110, -170, 80], [-60, -260, 70], [60, -260, 70]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#3f8a30" stroke="#24561d"/><circle cx="${x - r * .2}" cy="${y - r * .2}" r="${r * .7}" fill="url(#npLeaf)" stroke="none"/>`).join('')}
      ${Array.from({ length: 9 }, (_, k) => `<path d="M${-150 + k * 36} -120q4 50 0 110" stroke="#6b4a2a" stroke-width="2" fill="none"/>`).join('')}</g>
    <rect y="300" width="1000" height="300" fill="#8fc96a"/><rect y="300" width="1000" height="300" fill="url(#npGrassG)"/>
    <ellipse cx="500" cy="468" rx="420" ry="120" fill="#a9d985" stroke="#6cb84f" stroke-width="3" stroke-dasharray="12 10"/>
    ${[[60, 360], [940, 380], [70, 580], [930, 585]].map(([x, y]) => tuft(x, y)).join('')}${flower(240, 340, '#ff8fa3')}${flower(760, 330, '#fff3b0')}`));


  A.extra = { bee, bloom, cat, mouse, kite, ball, goalie, light, seeker, ICON };
})(typeof window !== 'undefined' ? window : globalThis);
