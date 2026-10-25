/* ============================================================
   js/name-picker/np-art.js — tranh SVG tự vẽ cho trang Gọi tên (goi-ten.html).
   Phong cách tranh thiếu nhi có viền nâu sẫm, mảng sáng/tối (theo trang tham khảo "Gọi Tên Vui"),
   nhưng là SVG tự vẽ — không tải ảnh ngoài, không lấy ảnh của trang tham khảo.
     scene(id)   cảnh nền 1000×600: farm · track · pond · sky · jungle · space · classroom · party · field · street
                 · castle (sân đấu phép) · island (đảo hoang) — 2 cảnh riêng cho Đấu trường
                 · pegboard (ván gỗ đục lỗ) — trò Đua bi
     kid(i)      học sinh chibi đồng phục (áo trắng, khăn quàng đỏ, quần/váy xanh) — 2 dáng: đứng (chính diện)
                 và chạy (nghiêng, tay vươn trước); CSS .is-run đổi dáng. Đĩa màu dưới chân: cam (nữ) · xanh (nam).
     hen, dino, bird, fish(c), balloon(c), rocket(c), gift(c), referee, card(c), ufo, bus, egg, cake
   Lớp CSS điều khiển cử động: .is-run · .is-scared · .is-cry · .is-happy (css/name-picker.css).
   ============================================================ */
(function (global) {
  'use strict';

  const INK = '#3a2a1e';                       // màu viền chung
  const SKIN = ['#fbd3b0', '#f6c7a0', '#f9ceaa', '#efbd94'];
  const SKIN_D = ['#efb38c', '#e6a87e', '#eab088', '#dca274'];
  const HAIR = ['#3b2418', '#2a1a12', '#4a2c1a', '#1f1612'];
  const FUN = ['#e5484d', '#2f7be0', '#f19a1a', '#8b4fd6', '#16a37f', '#e0559a', '#6c9a1f', '#1fa3b8'];
  const ol = (w) => `stroke="${INK}" stroke-width="${w || 1.8}" stroke-linejoin="round" stroke-linecap="round"`;

  // ============================================================
  // HỌC SINH
  // ============================================================
  /** Kiểu cố định theo số thứ tự: nữ (tóc 2 bím / đuôi ngựa) · nam (mũ lưỡi trai / kính). */
  function look(i) {
    const girl = i % 2 === 1, v = (i * 7 + 3) % 8;
    return {
      girl, skin: SKIN[i % 4], skinD: SKIN_D[i % 4], hair: HAIR[(i >> 1) % 4],
      cap: !girl && v % 3 === 0 ? (['#2a5cc9', '#e23b2e', '#2a5cc9'][(i >> 2) % 3]) : '',
      glasses: v === 2 || v === 5, tail: girl ? (v % 2 ? 'pig' : 'pony') : '',
      shoe: girl ? '#f06292' : '#2c4fa8',
    };
  }
  /** Mắt to long lanh + miệng (cười / há hoảng) + nước mắt — dùng chung 2 dáng. */
  const eye = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="3.1" ry="3.9" fill="#2a1a12"/><ellipse cx="${x}" cy="${y + 1.4}" rx="2" ry="1.6" fill="#6b3a1f"/><circle cx="${x + 1}" cy="${y - 1.4}" r="1.3" fill="#fff"/><circle cx="${x - 1}" cy="${y + 1.6}" r=".6" fill="#fff"/>`;
  const mouths = (x, y) => `<path class="np-mouth np-mouth-smile" d="M${x - 4} ${y}q4 4 8 0" fill="#c2453a" stroke="${INK}" stroke-width="1.4"/>
      <path class="np-mouth np-mouth-o" d="M${x - 3.5} ${y - 1}q3.5-3 7 0q.5 6-3.5 6t-3.5-6z" fill="#9b2d24" stroke="${INK}" stroke-width="1.4"/>
      <g class="np-tears" stroke="none"><path d="M${x - 11} ${y - 4}q-2 5 0 6 2-1 0-6z" fill="#6ec3ff"/><path d="M${x + 11} ${y - 4}q-2 5 0 6 2-1 0-6z" fill="#6ec3ff"/></g>`;

  function kidStand(L) {
    return `<g class="np-pose np-pose-stand">
    <g class="leg leg-l"><rect x="24" y="72" width="7" height="17" rx="3" fill="${L.skin}" ${ol(1.6)}/><rect x="24" y="85" width="7" height="5" fill="#fff" ${ol(1.2)}/><path d="M21.5 89.5h10v5.5H20q-1-5.5 1.5-5.5z" fill="${L.shoe}" ${ol(1.6)}/></g>
    <g class="leg leg-r"><rect x="33" y="72" width="7" height="17" rx="3" fill="${L.skin}" ${ol(1.6)}/><rect x="33" y="85" width="7" height="5" fill="#fff" ${ol(1.2)}/><path d="M32.5 89.5h10q2.5 0 1.5 5.5h-11.5z" fill="${L.shoe}" ${ol(1.6)}/></g>
    ${L.girl ? `<path d="M19 62h26l5 13H14z" fill="#24408c" ${ol()}/><path d="M24 63l-3 12M32 63v12M40 63l3 12" stroke="#17306e" stroke-width="1.4"/>` : `<path d="M20 62h24l1.5 12h-10l-3.5-5-3.5 5h-10z" fill="#24408c" ${ol()}/>`}
    <g class="arm arm-l"><path d="M18 46q-6 2-7 12l5 2q1-7 4-9z" fill="#fff" ${ol(1.6)}/><circle cx="13.5" cy="61" r="3.6" fill="${L.skin}" ${ol(1.4)}/></g>
    <g class="arm arm-r"><path d="M46 46q6 2 7 12l-5 2q-1-7-4-9z" fill="#fff" ${ol(1.6)}/><circle cx="50.5" cy="61" r="3.6" fill="${L.skin}" ${ol(1.4)}/></g>
    <path d="M19 47q13-6 26 0l1 17H18z" fill="#fff" ${ol()}/><path d="M38 48q5 2 6 4l1 12h-6z" fill="#dfe6f3"/>
    <path d="M25.5 44.5l6.5 6.5 6.5-6.5z" fill="#e23b2e" ${ol(1.4)}/><path d="M30 50l-3 9 5-4 5 4-3-9z" fill="#d22f22" ${ol(1.4)}/>
    <g class="np-head">
      ${L.tail === 'pony' ? `<path d="M46 16q14 6 9 24-3-10-10-13z" fill="${L.hair}" ${ol()}/>` : ''}
      ${L.tail === 'pig' ? `<path d="M13 20q-9 4-6 16 4-9 9-9z" fill="${L.hair}" ${ol()}/><path d="M51 20q9 4 6 16-4-9-9-9z" fill="${L.hair}" ${ol()}/><circle cx="13" cy="20" r="2.4" fill="#e23b2e" ${ol(1)}/><circle cx="51" cy="20" r="2.4" fill="#e23b2e" ${ol(1)}/>` : ''}
      <ellipse cx="13.5" cy="27" rx="3.4" ry="4.4" fill="${L.skin}" ${ol(1.4)}/><ellipse cx="50.5" cy="27" rx="3.4" ry="4.4" fill="${L.skin}" ${ol(1.4)}/>
      <circle cx="32" cy="25" r="18.5" fill="${L.skin}" ${ol()}/>
      <path d="M14 26q-2-22 18-22t18 22q-3-10-10-12-3 5-11 6 3-3 2-6-11 3-17 12z" fill="${L.hair}" ${ol()}/>
      <path d="M22 9q7-3 14-1" stroke="rgba(255,255,255,.35)" stroke-width="2.5" fill="none"/>
      ${L.cap ? `<path d="M13 19q19-21 38 0z" fill="${L.cap}" ${ol()}/><path d="M13 19q19-6 38 0" fill="none" stroke="#fff" stroke-width="2"/><path d="M42 17q13-1 16 5H41z" fill="${L.cap}" ${ol(1.6)}/><circle cx="32" cy="6" r="2" fill="#fff" ${ol(1)}/>` : ''}
      <g stroke="none">${eye(25, 27)}${eye(39, 27)}<ellipse cx="20" cy="33" rx="3" ry="1.8" fill="#f59a9a" opacity=".6"/><ellipse cx="44" cy="33" rx="3" ry="1.8" fill="#f59a9a" opacity=".6"/></g>
      ${L.glasses ? `<g fill="rgba(255,255,255,.18)" stroke="${INK}" stroke-width="1.6"><circle cx="25" cy="27" r="5.4"/><circle cx="39" cy="27" r="5.4"/><path d="M30.4 27h3.2" fill="none"/></g>` : ''}
      ${mouths(32, 35)}
    </g></g>`;
  }
  /** Dáng chạy: nghiêng sang phải, tay vươn trước, sải chân. */
  function kidRun(L) {
    return `<g class="np-pose np-pose-run">
    <g class="leg leg-r"><path d="M28 70l-9 13 3 3 10-12z" fill="${L.skin}" ${ol(1.6)}/><path d="M16 83l6-1 3 5-8 3q-4-3-1-7z" fill="${L.shoe}" ${ol(1.6)}/></g>
    <g class="leg leg-l"><path d="M34 70l9 12-2 4-10-11z" fill="${L.skin}" ${ol(1.6)}/><rect x="38" y="80" width="6" height="5" fill="#fff" transform="rotate(40 41 82)" ${ol(1.2)}/><path d="M41 84l8 1q3 4-2 6l-9-2z" fill="${L.shoe}" ${ol(1.6)}/></g>
    ${L.girl ? `<path d="M21 60h22l6 14H15z" fill="#24408c" ${ol()}/>` : `<path d="M22 60h20l2 12h-9l-3-4-3 4h-9z" fill="#24408c" ${ol()}/>`}
    <g class="arm arm-r"><path d="M26 48q-8 4-12 12l4 3q4-6 10-9z" fill="#fff" ${ol(1.6)}/><circle cx="15" cy="62" r="3.4" fill="${L.skin}" ${ol(1.4)}/></g>
    <path d="M22 46q12-7 22 0l-1 16H22z" fill="#fff" ${ol()}/><path d="M38 47q4 3 5 5l-1 10h-5z" fill="#dfe6f3"/>
    <path d="M34 45l6 5-7 2z" fill="#e23b2e" ${ol(1.4)}/><path d="M37 50l4 8-6-3z" fill="#d22f22" ${ol(1.4)}/>
    <g class="arm arm-l"><path d="M38 48q8 0 16 3l-1 5q-8-1-15-3z" fill="#fff" ${ol(1.6)}/><circle cx="56" cy="53" r="3.6" fill="${L.skin}" ${ol(1.4)}/></g>
    <g class="np-head">
      ${L.tail === 'pony' ? `<path d="M20 14q-16 2-14 20 4-10 12-12z" fill="${L.hair}" ${ol()}/>` : ''}
      ${L.tail === 'pig' ? `<path d="M18 18q-12 2-11 15 4-8 11-8z" fill="${L.hair}" ${ol()}/><circle cx="17" cy="18" r="2.4" fill="#e23b2e" ${ol(1)}/>` : ''}
      <circle cx="35" cy="25" r="18" fill="${L.skin}" ${ol()}/>
      <path d="M19 38q-8-14-1-26 8-10 20-8 14 2 16 15-7-5-12-5-2 5-9 6 1-3 0-5-6 3-7 9-1 7 1 13z" fill="${L.hair}" ${ol()}/>
      <ellipse cx="30" cy="29" rx="3" ry="3.9" fill="${L.skin}" ${ol(1.4)}/><path d="M30 27.5q1.3 1.5 0 3" stroke="${L.skinD}" stroke-width="1.2" fill="none"/>
      <path d="M27 9q7-3 13-1" stroke="rgba(255,255,255,.35)" stroke-width="2.5" fill="none"/>
      ${L.cap ? `<path d="M17 19q18-20 36-2z" fill="${L.cap}" ${ol()}/><path d="M46 15q11-2 15 4l-14 1z" fill="${L.cap}" ${ol(1.6)}/>` : ''}
      <g stroke="none">${eye(42, 26)}<ellipse cx="45" cy="33" rx="3" ry="1.8" fill="#f59a9a" opacity=".6"/></g>
      ${L.glasses ? `<circle cx="42" cy="26" r="5.4" fill="rgba(255,255,255,.18)" stroke="${INK}" stroke-width="1.6"/><path d="M36.6 26h-8" stroke="${INK}" stroke-width="1.4"/>` : ''}
      ${mouths(46, 34)}
    </g></g>`;
  }
  function kid(i) {
    const L = look(i);
    return `<svg class="np-kid" viewBox="0 0 64 104" aria-hidden="true">
  <ellipse class="np-disc" cx="32" cy="98" rx="19" ry="4.6" fill="${L.girl ? '#f39a3c' : '#3d7be0'}" opacity=".85"/>
  <g class="np-kid-body">${kidStand(L)}${kidRun(L)}</g>
</svg>`;
  }
  function referee() {
    return kid(0).replace(/fill="#fff" stroke/g, 'fill="#ffd21f" stroke').replace(/fill="#dfe6f3"/g, 'fill="#e8b800"')
      .replace(/fill="#e23b2e"/g, 'fill="#ffd21f"').replace(/fill="#d22f22"/g, 'fill="#ffd21f"').replace(/fill="#24408c"/g, 'fill="#222"')
      .replace('fill="#3d7be0" opacity=".85"', 'fill="#000" opacity=".15"').replace('class="np-kid"', 'class="np-kid np-ref"');
  }

  // ============================================================
  // NHÂN VẬT DẪN TRÒ / ĐẠO CỤ
  // ============================================================
  const hen = () => `<svg class="np-hen" viewBox="0 0 120 110" aria-hidden="true">
  <ellipse class="np-shadow" cx="60" cy="104" rx="38" ry="6"/>
  <g class="leg leg-l"><path d="M50 84v16m0 0l-6 4m6-4l6 4" stroke="#e8a21c" stroke-width="4" stroke-linecap="round"/></g>
  <g class="leg leg-r"><path d="M68 84v16m0 0l-6 4m6-4l6 4" stroke="#e8a21c" stroke-width="4" stroke-linecap="round"/></g>
  <g ${ol(2.4)}>
    <path d="M18 46q-12-6-16-22 14 2 20 12z" fill="#b5582a"/><path d="M14 56q-14-2-13-16 12 2 15 10z" fill="#d07a3a"/>
    <path d="M20 60q-6-26 14-30 10-2 18 4 6-20 26-18 20 4 18 26 18 4 20 22-4 30-40 30H44q-24 0-24-34z" fill="#fff6e8"/>
    <path d="M38 56q16-14 38 0-8 20-38 0z" fill="#d9a77b"/><path d="M44 58q12 6 26 0M46 64q10 4 20 0" fill="none" stroke-width="1.6"/>
    <path d="M74 14q4-12 10-2 4-10 8 0 6-6 6 4-12 2-24-2z" fill="#e23b2e"/>
    <path d="M98 34l14 5-14 5z" fill="#f2b632"/><path d="M96 46q4 10-2 14-4-6 2-14z" fill="#e23b2e"/>
  </g>
  <path d="M88 60q10-4 12-14" stroke="#f0d9c0" stroke-width="5" fill="none" stroke-linecap="round"/>
  <g class="np-hen-eye"><circle cx="86" cy="30" r="4.5" fill="#2a1d18"/><circle cx="87.4" cy="28.6" r="1.5" fill="#fff"/></g>
  <path class="np-hen-zz" d="M80 30q5 4 10 0" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`;

  const egg = () => `<svg class="np-egg" viewBox="0 0 24 30" aria-hidden="true"><ellipse cx="12" cy="16" rx="10" ry="13" fill="#fffaf0" ${ol(1.5)}/><ellipse cx="8" cy="11" rx="2.5" ry="4" fill="#fff"/><path d="M15 22q4-3 4-8" stroke="#eadcc0" stroke-width="2" fill="none"/></svg>`;
  const cake = () => `<svg class="np-cake" viewBox="0 0 40 30" aria-hidden="true"><path d="M3 14h34v13H3z" fill="#f7d6a8" ${ol(1.4)}/><path d="M3 14h34v5H3z" fill="#f48fb1" ${ol(1.4)}/><path d="M5 19q3 3 6 0t6 0 6 0 6 0 6 0" fill="none" stroke="#fff" stroke-width="2"/><rect x="18" y="4" width="4" height="10" rx="1" fill="#7cc4ff" ${ol(1.2)}/><path d="M20 0q3 3 0 5-3-2 0-5z" fill="#ffb02e"/></svg>`;

  const dino = () => `<svg class="np-dino" viewBox="0 0 220 170" aria-hidden="true">
  <ellipse class="np-shadow" cx="110" cy="164" rx="70" ry="8"/>
  <g ${ol(3)}>
    <path d="M44 104q-34-2-40-26 26 12 56 4z" fill="#5fae45"/>
    <g class="leg leg-r"><path d="M122 120q-4 30 4 40h22q-2-20 4-36z" fill="#4f9a39"/><path d="M124 158h24l3 6h-29z" fill="#f2efe6"/></g>
    <path d="M40 96q20-40 80-38 40 0 52 34-2 36-64 36-58 0-68-32z" fill="#6cbd4f"/>
    <path d="M70 108q30 16 70 0-6 20-36 20-28 0-34-20z" fill="#f4e3a1"/><path d="M80 116h50M84 122h40" fill="none" stroke-width="1.6"/>
    <g class="leg leg-l"><path d="M78 120q-4 30 4 40h22q-2-20 4-36z" fill="#5fae45"/><path d="M80 158h24l3 6H78z" fill="#f2efe6"/></g>
    <path d="M56 80l8-16 8 12 8-18 8 16 10-18 8 18 10-14 6 16" fill="#f08a2a"/>
    <path d="M140 70q-8-50 34-56 34 0 38 26 4 22-24 30-14 2-20 18z" fill="#6cbd4f"/>
    <path class="np-dino-jaw" d="M172 64q26 0 34-8-2 18-28 18z" fill="#5fae45"/>
    <path d="M150 22l6-12 6 10 8-12 6 12" fill="#f08a2a"/>
    <path d="M150 98q10 8 22 0" fill="none" stroke-width="7" stroke="#4f9a39"/>
  </g>
  <g stroke="none"><circle cx="184" cy="34" r="10" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="187" cy="35" r="5" fill="#2a1d18"/><circle cx="189" cy="33" r="1.8" fill="#fff"/>
    <ellipse cx="196" cy="48" rx="5" ry="3" fill="#f59a9a" opacity=".6"/><circle cx="118" cy="80" r="5" fill="#8fd16f"/><circle cx="96" cy="84" r="4" fill="#8fd16f"/><circle cx="160" cy="40" r="4" fill="#8fd16f"/></g>
  <path d="M180 60q10 8 22-2" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
  <path class="np-dino-tongue" d="M196 60q8 6 2 12-6-2-4-10z" fill="#e65a7a" stroke="${INK}" stroke-width="1.6"/>
</svg>`;

  const bird = () => `<svg class="np-bird" viewBox="0 0 130 90" aria-hidden="true"><g ${ol(2.2)}>
  <g class="np-wing np-wing-back"><path d="M60 40q-30-36-56-30 20 14 30 40z" fill="#2f4fa8"/></g>
  <path d="M30 50q10-26 46-24 30 2 34 20-6 24-40 24-30 0-40-20z" fill="#3c62c8"/>
  <path d="M44 56q20 10 46 0-10 14-24 14-14 0-22-14z" fill="#e8eefc"/>
  <path d="M30 50l-26 2 22 10z" fill="#2f4fa8"/><path d="M104 40l22 4-20 8z" fill="#f2b632"/>
  <g class="np-wing np-wing-front"><path d="M62 44q-16-40-46-40 14 18 22 46z" fill="#4a72dc"/></g></g>
  <circle cx="92" cy="36" r="7" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="94" cy="36" r="3.5" fill="#1a1a2a"/><circle cx="95" cy="34.5" r="1.2" fill="#fff"/>
</svg>`;

  const fish = (c) => `<svg class="np-fish" viewBox="0 0 90 56" aria-hidden="true"><g ${ol(2)}>
  <path class="np-fish-tail" d="M16 28L0 12v32z" fill="${c}"/>
  <path d="M38 8q10-10 22-2l-4 4z" fill="${c}"/>
  <path d="M14 28q14-26 44-24 26 2 30 24-4 22-30 24-30 2-44-24z" fill="${c}"/>
  <path d="M42 40q6 8 12 2" fill="${c}"/></g>
  <path d="M30 18q14-10 30-8" stroke="rgba(255,255,255,.55)" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M40 24q4 6 0 12M48 24q4 6 0 12" stroke="rgba(0,0,0,.18)" stroke-width="2" fill="none"/>
  <circle cx="70" cy="22" r="6.5" fill="#fff" stroke="${INK}" stroke-width="1.8"/><circle cx="72" cy="22" r="3.2" fill="#1a1a2a"/><circle cx="73" cy="20.6" r="1.1" fill="#fff"/>
  <path d="M80 34q4 3 6-1" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="74" cy="31" rx="3" ry="1.8" fill="#ff9a9a" opacity=".6"/>
</svg>`;

  const balloon = (c) => `<svg class="np-balloon-svg" viewBox="0 0 70 130" aria-hidden="true">
  <path class="np-string" d="M35 86q-6 14 2 26t-2 18" fill="none" stroke="#5b5b6b" stroke-width="1.6"/>
  <path d="M35 4C14 4 4 22 4 40c0 24 20 40 31 44 11-4 31-20 31-44C66 22 56 4 35 4z" fill="${c}" ${ol(2.4)}/>
  <path d="M50 18q10 10 8 26" stroke="rgba(0,0,0,.15)" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M31 84h8l-4 6z" fill="${c}" ${ol(1.8)}/>
  <ellipse cx="22" cy="24" rx="6" ry="10" fill="#fff" opacity=".45" transform="rotate(20 22 24)"/>
</svg>`;

  const rocket = (c) => `<svg class="np-rocket" viewBox="0 0 70 130" aria-hidden="true">
  <path class="np-flame" d="M24 104q11 30 11 26 0 4 11-26z" fill="#ffb02e"/><path class="np-flame" d="M29 104q6 16 6 14 0 2 6-14z" fill="#fff3b0"/>
  <g ${ol(2.2)}><path d="M16 74L2 104h18z M54 74l14 30H50z" fill="${c}"/>
  <path d="M35 2q-22 22-20 64v38h40V66q2-42-20-64z" fill="#f7f7fb"/>
  <path d="M35 2q-12 12-17 28h34Q47 14 35 2z" fill="${c}"/>
  <circle cx="35" cy="54" r="11" fill="#7fd1ff"/><rect x="30" y="80" width="10" height="24" rx="4" fill="${c}"/></g>
  <circle cx="35" cy="54" r="14" fill="none" stroke="#9aa3b8" stroke-width="3"/>
  <path d="M48 40q4 20 0 50" stroke="rgba(0,0,0,.1)" stroke-width="6" fill="none"/><circle cx="31" cy="50" r="3.2" fill="#fff" opacity=".85"/>
</svg>`;

  const gift = (c) => `<svg class="np-gift" viewBox="0 0 90 90" aria-hidden="true">
  <ellipse class="np-shadow" cx="45" cy="86" rx="36" ry="4"/>
  <g ${ol(2.2)}><rect x="9" y="34" width="72" height="50" rx="4" fill="${c}"/><rect x="40" y="34" width="10" height="50" fill="#fff" opacity=".7"/></g>
  <rect x="58" y="38" width="20" height="44" fill="rgba(0,0,0,.12)"/>
  <g class="np-lid" ${ol(2.2)}><rect x="4" y="22" width="82" height="16" rx="3" fill="${c}"/><rect x="40" y="22" width="10" height="16" fill="#fff" opacity=".75"/>
    <path d="M45 22q-18-20-24-8 0 8 24 8zM45 22q18-20 24-8 0 8-24 8z" fill="#fff"/></g>
</svg>`;
  const card = (c) => `<svg class="np-card" viewBox="0 0 30 40" aria-hidden="true"><rect x="2" y="2" width="26" height="36" rx="3" fill="${c}" ${ol(2)}/><path d="M7 6v28" stroke="rgba(255,255,255,.4)" stroke-width="3"/></svg>`;

  const ufo = () => `<svg class="np-ufo" viewBox="0 0 200 110" aria-hidden="true">
  <path d="M60 46q0-42 40-42t40 42z" fill="#bfe9ff" opacity=".95" ${ol(2.6)}/>
  <path d="M74 22q8-12 20-12" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".85"/>
  <g ${ol(2.6)}><ellipse cx="100" cy="56" rx="96" ry="22" fill="#7650d6"/><path d="M70 76h60l10 10H60z" fill="#4c34a0"/></g>
  <ellipse cx="100" cy="50" rx="80" ry="11" fill="#9b7ef0"/>
  <g class="np-ufo-lights" stroke="${INK}" stroke-width="1.6">${[24, 52, 80, 120, 148, 176].map((x, k) => `<circle cx="${x}" cy="${58 + (k === 0 || k === 5 ? -2 : 3)}" r="5" fill="#7ff3ff"/>`).join('')}</g>
</svg>`;

  const bus = () => `<svg class="np-bus" viewBox="0 0 160 80" aria-hidden="true"><g ${ol(2.4)}><rect x="4" y="8" width="150" height="56" rx="12" fill="#ffc21f"/>
  ${[16, 46, 76, 106].map((x) => `<rect x="${x}" y="16" width="24" height="18" rx="3" fill="#7fd1ff"/>`).join('')}<rect x="136" y="16" width="14" height="30" rx="3" fill="#7fd1ff"/>
  <circle cx="36" cy="66" r="11" fill="#2b2b33"/><circle cx="124" cy="66" r="11" fill="#2b2b33"/></g>
  <rect x="5" y="42" width="148" height="5" fill="#e23b2e"/><circle cx="36" cy="66" r="4" fill="#bbb"/><circle cx="124" cy="66" r="4" fill="#bbb"/></svg>`;

  /** Trùm Virus (Đấu trường · Diệt Virus): quả cầu gai đội vương miện. Màu thân theo --vc / --vc-d (CSS đổi theo giai đoạn). */
  const virus = () => `<svg class="np-virus" viewBox="0 0 220 220" aria-hidden="true">
  <ellipse class="np-shadow" cx="110" cy="212" rx="64" ry="7"/>
  <g class="np-virus-spikes" ${ol(2.6)}>${Array.from({ length: 12 }, (_, k) => {
    const a = (k * 30 + 15) * Math.PI / 180, x1 = 110 + Math.cos(a) * 62, y1 = 124 + Math.sin(a) * 62, x2 = 110 + Math.cos(a) * 92, y2 = 124 + Math.sin(a) * 92;
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke-width="7" stroke="var(--vc-d, #2f8f3a)"/><circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="9" fill="var(--vc, #5fd068)"/>`;
  }).join('')}</g>
  <circle cx="110" cy="124" r="68" fill="var(--vc, #5fd068)" ${ol(3)}/>
  <circle cx="92" cy="104" r="40" fill="#fff" opacity=".16"/>
  ${[[72, 160, 9], [150, 150, 7], [140, 176, 5], [62, 120, 6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="var(--vc-d, #2f8f3a)" opacity=".55"/>`).join('')}
  <g class="np-virus-face">
    <path d="M66 98l34 12M154 98l-34 12" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="88" cy="122" rx="15" ry="13" fill="#fff" ${ol(2.4)}/><ellipse cx="132" cy="122" rx="15" ry="13" fill="#fff" ${ol(2.4)}/>
    <circle class="np-virus-eye" cx="92" cy="125" r="6.5" fill="#d0202a"/><circle class="np-virus-eye" cx="128" cy="125" r="6.5" fill="#d0202a"/>
    <path d="M78 156q32 22 64 0l-8 6-8-8-8 8-8-8-8 8-8-8-8 8z" fill="#3a0d12" ${ol(2.4)}/>
  </g>
  <g class="np-virus-crown" ${ol(2.4)}><path d="M78 62l6-34 18 20 8-28 8 28 18-20 6 34z" fill="#ffc21f"/><path d="M80 62h60" stroke-width="5" stroke="#e09a12"/>
    <circle cx="110" cy="44" r="5" fill="#e5484d"/><circle cx="90" cy="52" r="3.5" fill="#2f7be0"/><circle cx="130" cy="52" r="3.5" fill="#2f7be0"/></g>
</svg>`;

  // ============================================================
  // CẢNH NỀN 1000×600
  // ============================================================
  const W = 1000, H = 600;
  const DEFS = `<defs>
    <filter id="npBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="npSoft"><feGaussianBlur stdDeviation="2"/></filter>
    <pattern id="npDirt" width="60" height="40" patternUnits="userSpaceOnUse"><rect width="60" height="40" fill="#e3b77a"/><ellipse cx="12" cy="10" rx="4" ry="2" fill="#d6a463"/><ellipse cx="44" cy="28" rx="5" ry="2" fill="#d6a463"/><circle cx="34" cy="8" r="1.5" fill="#c79352"/><circle cx="6" cy="32" r="1.5" fill="#f0c98e"/></pattern>
    <pattern id="npGrass" width="40" height="30" patternUnits="userSpaceOnUse"><rect width="40" height="30" fill="#79c257"/><path d="M6 20l2-6 2 6M26 10l2-6 2 6" stroke="#5fae45" stroke-width="2" fill="none"/></pattern>
    <filter id="npPaper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .15  0 0 0 .5 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="npBrush" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves="3" seed="3"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .22 -.04"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <radialGradient id="npVig" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#1a1208" stop-opacity="0"/><stop offset="1" stop-color="#1a1208" stop-opacity=".32"/></radialGradient>
    <radialGradient id="npLeaf" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#8fd468"/><stop offset=".55" stop-color="#5aa83e"/><stop offset="1" stop-color="#3a7f2c"/></radialGradient>
    <radialGradient id="npLeafD" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#6cbd4f"/><stop offset=".6" stop-color="#3f8a30"/><stop offset="1" stop-color="#2a6422"/></radialGradient>
    <linearGradient id="npDirtG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0cf98" stop-opacity=".55"/><stop offset="1" stop-color="#b9864a" stop-opacity=".55"/></linearGradient>
    <linearGradient id="npGrassG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6e58c" stop-opacity=".45"/><stop offset="1" stop-color="#3f8a30" stop-opacity=".5"/></linearGradient>
    <pattern id="npWood" width="1000" height="36" patternUnits="userSpaceOnUse"><rect width="1000" height="36" fill="#c58b52"/><path d="M0 35h1000" stroke="#a46e3a" stroke-width="3"/><path d="M120 0v36M380 0v36M610 0v36M860 0v36" stroke="#b07a44" stroke-width="2"/></pattern>
  </defs>`;
  const FINISH = `<rect width="1000" height="600" fill="#fff" filter="url(#npBrush)" style="mix-blend-mode:soft-light"/><rect width="1000" height="600" fill="#000" filter="url(#npPaper)" opacity=".18"/><rect width="1000" height="600" fill="url(#npVig)"/>`;
  const svg = (inner, cls) => `<svg class="np-scene ${cls || ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${DEFS}${inner}${FINISH}</svg>`;
  const skyGrad = (id, a, b) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
  const cloud = (x, y, s, cls) => `<g class="np-cloud ${cls || ''}" transform="translate(${x} ${y}) scale(${s})"><path d="M0 46q-2-24 22-24 6-20 30-18 12-16 36-4 24-6 30 18 22 0 22 28z" fill="#fff" stroke="#cfe3f3" stroke-width="3"/><path d="M14 46q20-6 40 0t46 0" stroke="#e3eff9" stroke-width="6" fill="none" stroke-linecap="round"/></g>`;
  const sun = (x, y, r, face) => `<g class="np-sun" transform="translate(${x} ${y})"><circle r="${r * 1.9}" fill="#fff6c4" opacity=".45"/><g class="np-sun-rays">${Array.from({ length: 12 }, (_, k) => `<rect x="-3.5" y="${-r - 28}" width="7" height="18" rx="3.5" fill="#ffd34d" transform="rotate(${k * 30})"/>`).join('')}</g>
    <circle r="${r}" fill="#ffd84a" stroke="#f0a91f" stroke-width="4"/><circle cx="${-r / 3}" cy="${-r / 3}" r="${r / 3}" fill="#fff3a8" opacity=".6"/>${face ? `<circle cx="${-r / 3}" cy="${-r / 8}" r="4.5" fill="#5a3a12"/><circle cx="${r / 3}" cy="${-r / 8}" r="4.5" fill="#5a3a12"/><path d="M${-r / 3} ${r / 5}q${r / 3} ${r / 3} ${r * 2 / 3} 0" stroke="#5a3a12" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="${-r / 1.7}" cy="${r / 6}" r="7" fill="#ff9a8a" opacity=".6"/><circle cx="${r / 1.7}" cy="${r / 6}" r="7" fill="#ff9a8a" opacity=".6"/>` : ''}</g>`;
  /** Cây tán xum xuê nhiều lớp, có viền và mảng sáng. */
  const tree = (x, y, s, dark) => {
    const c1 = dark ? '#2f7a2a' : '#3f8a30', c3 = '#a6e07e';
    const blobs = [[-36, -6, 26], [36, -4, 28], [-20, -34, 30], [20, -36, 30], [0, -58, 26], [0, -14, 34]];
    return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-9 50q4-30 0-60h18q-4 30 0 60z" fill="#8a5a30" stroke="${INK}" stroke-width="3"/><path d="M0 0q-14-10-22-6M2 -6q12-10 20-6" stroke="#8a5a30" stroke-width="6" fill="none"/>
      ${blobs.map(([bx, by, r]) => `<circle cx="${bx}" cy="${by}" r="${r}" fill="${c1}" stroke="#24561d" stroke-width="3"/>`).join('')}
      ${blobs.map(([bx, by, r]) => `<circle cx="${bx - r * .15}" cy="${by - r * .18}" r="${r * .8}" fill="url(#${dark ? 'npLeafD' : 'npLeaf'})"/>`).join('')}
      ${blobs.map(([bx, by, r]) => `<path d="M${bx - r * .6} ${by + r * .5}q${r * .6} ${r * .35} ${r * 1.2} 0" stroke="#24561d" stroke-width="2" fill="none" opacity=".45"/>`).join('')}
      ${blobs.slice(2).map(([bx, by, r]) => `<circle cx="${bx - r * .3}" cy="${by - r * .35}" r="${r * .35}" fill="${c3}"/>`).join('')}</g>`;
  };
  const tuft = (x, y, c) => `<path d="M${x} ${y}l4-14 3 12 4-16 3 16 4-12 3 14z" fill="${c || '#5fae45'}" stroke="#3f7a2a" stroke-width="1.5"/>`;
  const flower = (x, y, c) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<circle cx="0" cy="-5.5" r="4.5" fill="${c || '#fff'}" stroke="${INK}" stroke-width="1" transform="rotate(${a})"/>`).join('')}<circle r="3.4" fill="#ffc21f" stroke="${INK}" stroke-width="1"/></g>`;
  const bush = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})"><g stroke="#24561d" stroke-width="3"><circle cx="-26" cy="0" r="24" fill="${c || '#3f8a30'}"/><circle cx="28" cy="2" r="22" fill="${c || '#3f8a30'}"/><circle cx="0" cy="-12" r="30" fill="${c || '#4f9a3a'}"/></g>
    <circle cx="-6" cy="-22" r="13" fill="#6cbd4f" opacity=".85"/><circle cx="-30" cy="-6" r="8" fill="#5fae45"/>${flower(18, -8, '#ff8fa3')}${flower(-20, 4, '#fff3b0')}</g>`;
  const blades = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c || '#4f9a3a'}" stroke="#2f6b25" stroke-width="1.6"><path d="M0 0q-6-40-22-60 18 18 26 58z"/><path d="M6 0q2-50 10-74 0 30-2 74z"/><path d="M12 0q14-36 34-50-20 20-28 50z"/><path d="M-8 0q-20-24-40-28 22 10 34 28z"/></g>`;
  const rock = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-40 0q-4-30 22-36 30-6 48 10 14 14 10 26z" fill="#9aa0a8" stroke="${INK}" stroke-width="3"/><path d="M-28 -10q6-16 24-20" stroke="#c8ccd2" stroke-width="5" fill="none" stroke-linecap="round"/></g>`;
  const front = (y, c) => [bush(30, y, 1.25, c), blades(140, y + 12, 1), bush(985, y - 6, 1.15, c), blades(870, y + 14, .9), rock(250, y + 16, .6), blades(620, y + 18, .7), flower(180, y - 10), flower(910, y - 34, '#ffd84a')].join('');
  const farHills = (y, c1, c2) => `<path d="M0 ${y}Q180 ${y - 90} 360 ${y - 30}T720 ${y - 60}T1000 ${y - 40}V600H0z" fill="${c1}" stroke="#4f9a3a" stroke-width="2"/>
    ${Array.from({ length: 16 }, (_, k) => `<circle cx="${30 + k * 64}" cy="${y - 34 - Math.sin(k) * 18}" r="${12 + (k % 3) * 4}" fill="${c2}" stroke="#2f6b25" stroke-width="2"/>`).join('')}`;

  const SCENES = {
    farm: () => svg(`${skyGrad('skyF', '#4aaaf0', '#d6f1ff')}<rect width="1000" height="600" fill="url(#skyF)"/>${sun(830, 78, 42)}
      ${cloud(300, 36, 1.2, 'd1')}${cloud(620, 86, .9, 'd2')}${cloud(60, 130, .7, 'd3')}
      ${farHills(300, '#9ed77a', '#4f9a3a')}<path d="M0 330Q260 250 520 310T1000 290V600H0z" fill="#79c257" stroke="#4f9a3a" stroke-width="2"/>
      ${tree(470, 286, .75)}${tree(760, 276, .7, true)}${tree(960, 300, .9)}
      <g stroke="${INK}" stroke-width="2.5" fill="#c4834a">${Array.from({ length: 11 }, (_, k) => `<rect x="${260 + k * 72}" y="258" width="14" height="76" rx="3"/>`).join('')}<rect x="250" y="274" width="760" height="11" rx="4"/><rect x="250" y="302" width="760" height="11" rx="4"/></g>
      <path d="M260 279h750M260 307h750" stroke="#e0a66a" stroke-width="3"/>
      <path d="M0 330Q500 300 1000 320V600H0z" fill="url(#npDirt)" stroke="#c48a4a" stroke-width="3"/><path d="M0 330Q500 300 1000 320V600H0z" fill="url(#npDirtG)"/>
      ${[[420, 450, 90], [700, 520, 120], [560, 380, 60]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * .22}" fill="#c99358" opacity=".35"/>`).join('')}
      ${tree(120, 190, 1.4)}
      <g transform="translate(30 150)" stroke="${INK}" stroke-width="3" stroke-linejoin="round">
        <path d="M200 110l40-26v130l-40 20z" fill="#b8763c"/>
        <rect x="10" y="110" width="190" height="124" fill="#d68a45"/>${Array.from({ length: 8 }, (_, k) => `<path d="M10 ${126 + k * 15}h190" stroke="#b86e32" stroke-width="2"/>`).join('')}
        <path d="M-12 116L105 22 222 116z" fill="#d23a25"/>${Array.from({ length: 4 }, (_, k) => `<path d="M${10 + k * 10} ${100 - k * 18}h${190 - k * 20}" stroke="#a82a1a" stroke-width="3"/>`).join('')}
        <path d="M105 22l130-14 50 76-63 32z" fill="#bf3020"/>
        <path d="M82 234v-70q22-30 46 0v70z" fill="#5a3418"/><path d="M90 234v-26h30v26z" fill="#e8c35a"/>
        <rect x="26" y="140" width="44" height="34" fill="#5a3418"/><path d="M30 144l36 26M66 144l-36 26" stroke="#8a6a4a" stroke-width="3"/>
        <path d="M128 234l70 42 7-11-70-42z" fill="#c07a3c"/>${[0, 1, 2, 3].map((k) => `<path d="M${140 + k * 16} ${241 + k * 9}l-6 10" stroke-width="2.5"/>`).join('')}</g>
      <g transform="translate(70 360)"><ellipse cx="80" cy="50" rx="102" ry="36" fill="#d9a23a" stroke="${INK}" stroke-width="3"/><ellipse cx="80" cy="40" rx="86" ry="24" fill="#f0c45a"/>
        ${Array.from({ length: 22 }, (_, k) => `<path d="M${-14 + k * 9} ${28 + (k % 3) * 9}l14 ${-6 + (k % 2) * 12}" stroke="#c48a26" stroke-width="2"/>`).join('')}</g>
      ${tuft(400, 340)}${flower(300, 340)}${flower(590, 336, '#ffd84a')}${flower(860, 342)}${bush(990, 330, .9)}${front(588)}`),

    track: () => svg(`<rect width="1000" height="600" fill="#c96a3f"/>${Array.from({ length: 21 }, (_, k) => `<rect y="${82 + k * 24}" width="1000" height="12" fill="#c06038" opacity=".5"/>`).join('')}
      <rect width="1000" height="74" fill="#2c5aa0"/>${Array.from({ length: 3 }, (_, r) => Array.from({ length: 42 }, (_, k) => `<g><circle cx="${12 + k * 24 + (r % 2) * 12}" cy="${14 + r * 20}" r="8" fill="${FUN[(k + r) % FUN.length]}" stroke="#1a3a70" stroke-width="1.5"/><circle cx="${12 + k * 24 + (r % 2) * 12}" cy="${11 + r * 20}" r="3.5" fill="#fbd3b0"/></g>`).join('')).join('')}
      <rect y="74" width="1000" height="10" fill="#3f8a30" stroke="${INK}" stroke-width="2"/><rect y="588" width="1000" height="12" fill="#3f8a30" stroke="${INK}" stroke-width="2"/>
      <rect x="66" y="84" width="6" height="504" fill="#fff"/>
      ${Array.from({ length: 2 }, (_, c) => Array.from({ length: 32 }, (_, k) => `<rect x="${850 + c * 10}" y="${84 + k * 16}" width="10" height="16" fill="${(k + c) % 2 ? '#fff' : '#111'}"/>`).join('')).join('')}`, 'np-scene-track'),

    pond: () => svg(`${skyGrad('skyP', '#5cbcf2', '#e6f6ff')}<defs><radialGradient id="water" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="#7fd4fb"/><stop offset=".6" stop-color="#3ea6e6"/><stop offset="1" stop-color="#2a86cc"/></radialGradient></defs>
      <rect width="1000" height="600" fill="url(#skyP)"/>${cloud(440, 14, .9, 'd1')}${cloud(720, 40, .7, 'd2')}
      ${farHills(130, '#8fd06a', '#3f8a30')}${tree(90, 90, .8)}${tree(330, 76, .6, true)}${tree(600, 86, .7)}
      ${Array.from({ length: 10 }, (_, k) => `<g><rect x="${850 + k * 15}" y="${-10 + (k % 3) * 8}" width="9" height="${160 - (k % 3) * 12}" rx="3" fill="${k % 2 ? '#7cbd4a' : '#5a9a30'}" stroke="#2f6b25" stroke-width="1.6"/><path d="M${850 + k * 15} ${40 + k * 7}h9" stroke="#2f6b25" stroke-width="2"/><path d="M${858 + k * 15} ${30 + k * 6}q14-6 22 2" stroke="#5fae45" stroke-width="4" fill="none"/></g>`).join('')}
      <path d="M0 140Q500 110 1000 140V600H0z" fill="url(#npGrass)" stroke="#4f9a3a" stroke-width="2"/><path d="M0 140Q500 110 1000 140V600H0z" fill="url(#npGrassG)"/>
      <ellipse cx="500" cy="345" rx="500" ry="222" fill="#a9763f" stroke="${INK}" stroke-width="3"/><ellipse cx="500" cy="350" rx="482" ry="204" fill="url(#water)" stroke="#7a5428" stroke-width="3"/>
      <g class="np-ripples" stroke="#d4f1ff" stroke-width="3" fill="none" opacity=".75"><path d="M200 300q40-10 80 0"/><path d="M600 420q50-12 100 0"/><path d="M380 480q30-8 60 0"/><path d="M760 260q40-10 80 0"/><path d="M300 210q60-14 120 0"/></g>
      <ellipse cx="420" cy="250" rx="150" ry="22" fill="#fff" opacity=".18"/>
      ${[[70, 220, 1], [130, 470, 1.2], [880, 400, 1.1], [930, 250, .8], [280, 540, .9], [330, 210, .7], [640, 520, .8], [760, 470, .6], [190, 330, .7]].map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0a34 20 0 1 0 1 0l-1 14z" fill="#4f9a3a" stroke="#24561d" stroke-width="2.5"/><path d="M0 2l-20 8M0 2l16 10M0 2l4-14" stroke="#7cc65a" stroke-width="2"/></g>`).join('')}
      ${[[130, 450], [930, 380], [330, 196]].map(([x, y]) => `<g transform="translate(${x} ${y})">${[0, 50, -50, 100, -100].map((a) => `<ellipse cx="0" cy="-14" rx="8" ry="18" fill="#f7a8c8" stroke="#c0507a" stroke-width="1.6" transform="rotate(${a})"/>`).join('')}<circle r="6" fill="#ffd84a" stroke="${INK}" stroke-width="1.4"/></g>`).join('')}
      <g transform="translate(800 150)" stroke="${INK}" stroke-width="2.5"><rect x="0" y="0" width="200" height="46" fill="#b07440"/>${Array.from({ length: 8 }, (_, k) => `<path d="M${k * 26} 0v46" stroke="#8a5a30"/>`).join('')}<rect x="10" y="40" width="14" height="64" fill="#8a5a30"/><rect x="170" y="40" width="14" height="64" fill="#8a5a30"/></g>
      <path d="M836 150q-60-70-120-60" stroke="#6a4020" stroke-width="7" fill="none" stroke-linecap="round"/>
      ${rock(40, 560, .9)}${rock(960, 300, .7)}${rock(560, 586, .6)}
      ${[30, 52, 74].map((x) => `<g stroke="#4a3220" stroke-width="1.4"><rect x="${x}" y="${330 - (x % 3) * 8}" width="4" height="90" fill="#6a8a3a"/><rect x="${x - 3}" y="${318 - (x % 3) * 8}" width="10" height="26" rx="5" fill="#8a5a30"/></g>`).join('')}
      ${front(594, '#4f9a3a')}`),

    sky: () => svg(`${skyGrad('skyB', '#3a9fec', '#c4e9ff')}<rect width="1000" height="600" fill="url(#skyB)"/>
      ${sun(900, 74, 58, true)}${cloud(-20, 26, 1.1, 'd2')}${cloud(880, 300, .9, 'd1')}${cloud(-30, 440, 1.2, 'd3')}${cloud(460, 470, .8, 'd1')}
      <path d="M0 520Q160 450 330 495T660 485T1000 465V600H0z" fill="#9ed77a" stroke="#4f9a3a" stroke-width="3"/><path d="M0 562Q250 512 500 552T1000 532V600H0z" fill="#5fae45" stroke="#3f7a2a" stroke-width="3"/>
      ${Array.from({ length: 14 }, (_, k) => `<circle cx="${30 + k * 72}" cy="${548 + (k % 2) * 10}" r="${20 + (k % 3) * 6}" fill="#4f9a3a" stroke="#2f6b25" stroke-width="2.5"/>`).join('')}
      ${bush(60, 560, 1.1)}${bush(940, 556, 1.2)}${blades(300, 602, .9)}${blades(700, 602, .8)}${flower(400, 572)}${flower(620, 576, '#ffd84a')}`),

    jungle: () => svg(`${skyGrad('skyJ', '#f59a45', '#ffe0a8')}<rect width="1000" height="600" fill="url(#skyJ)"/>
      <circle cx="560" cy="250" r="96" fill="#fff0b8" opacity=".5"/><circle cx="560" cy="250" r="70" fill="#ffe9a8"/>${cloud(200, 56, 1, 'd1')}${cloud(560, 36, .8, 'd2')}
      <g stroke="${INK}" stroke-width="3" stroke-linejoin="round"><path d="M30 300L120 136h46l84 164z" fill="#a8544a"/><path d="M120 136h46l-8 22-16-8-14 10z" fill="#e8582a"/></g>
      <path d="M126 150q-20 60-40 150M150 150q20 60 50 150" stroke="#8a3c32" stroke-width="5" fill="none"/>
      <g class="np-smoke">${[0, 1, 2].map((k) => `<circle cx="${142 + k * 6}" cy="${106 - k * 34}" r="${18 + k * 8}" fill="#f5ece2" stroke="#d8c8b8" stroke-width="2"/>`).join('')}</g>
      <path d="M0 300Q200 200 400 270T800 230T1000 260V600H0z" fill="#c9785a" stroke="#8a4a32" stroke-width="2.5"/><path d="M0 320Q300 260 600 300T1000 290V600H0z" fill="#a8916a" stroke="#7a6444" stroke-width="2.5"/>
      <path d="M200 330Q600 300 1000 320v32H200z" fill="#7fc3d6" stroke="#4e8ea0" stroke-width="2"/>
      <path d="M0 342Q500 322 1000 347V600H0z" fill="url(#npGrass)" stroke="#4f9a3a" stroke-width="2.5"/><path d="M0 342Q500 322 1000 347V600H0z" fill="url(#npGrassG)"/><path d="M0 420Q500 390 1000 420V600H0z" fill="#79b84d" opacity=".55"/>
      ${[[40, 300, 1.1], [930, 280, 1.2], [860, 320, .8]].map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0q-6 120 6 260h14q-8-130 0-260z" fill="#8a5a30" stroke="${INK}" stroke-width="3"/>${[0, 1, 2, 3, 4, 5].map((k) => `<path d="M8 ${40 + k * 40}h12" stroke="#6a4020" stroke-width="3"/>`).join('')}${[-60, -20, 20, 60, 100, 140].map((a) => `<path d="M8 0q60-30 110 10-60-10-110-10z" fill="#3f8a30" stroke="#24561d" stroke-width="2.5" transform="rotate(${a} 8 0)"/>`).join('')}<circle cx="2" cy="10" r="8" fill="#8a5a30" stroke="${INK}" stroke-width="2"/><circle cx="16" cy="12" r="8" fill="#8a5a30" stroke="${INK}" stroke-width="2"/></g>`).join('')}
      ${rock(90, 530, 1.6)}${rock(880, 550, 1.3)}${rock(600, 572, .9)}${front(594, '#3f8a30')}${blades(470, 602, 1.1, '#3f8a30')}`),

    space: () => svg(`<defs><radialGradient id="sp" cx=".5" cy=".55" r=".8"><stop offset="0" stop-color="#4b2a8c"/><stop offset=".6" stop-color="#1f1a5a"/><stop offset="1" stop-color="#0c0f33"/></radialGradient></defs>
      <rect width="1000" height="600" fill="url(#sp)"/>
      <g filter="url(#npBlur)" opacity=".75"><ellipse cx="260" cy="330" rx="260" ry="80" fill="#7a3fd0" transform="rotate(-18 260 330)"/><ellipse cx="740" cy="240" rx="240" ry="70" fill="#3a5fe0" transform="rotate(14 740 240)"/><ellipse cx="560" cy="400" rx="200" ry="60" fill="#c04fbf" opacity=".6"/></g>
      <g class="np-stars">${Array.from({ length: 110 }, (_, k) => `<circle cx="${(k * 137) % 1000}" cy="${(k * 89) % 480}" r="${.8 + (k % 3)}" fill="${k % 5 ? '#fff' : '#ffe08a'}" style="animation-delay:${(k % 7) * .3}s"/>`).join('')}</g>
      ${[[180, 90], [820, 330], [430, 420], [700, 120]].map(([x, y]) => `<path d="M${x} ${y - 12}l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#fff6c4"/>`).join('')}
      <circle cx="500" cy="-210" r="330" fill="#f2e2c4" stroke="#8a7550" stroke-width="5"/><path d="M200 -40q300 160 600 0" stroke="#d8c39c" stroke-width="30" fill="none" opacity=".6"/>
      ${[[330, 40, 34], [520, 70, 26], [720, 30, 40], [420, 92, 14], [640, 100, 18], [800, 80, 12], [250, 70, 16]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * .6}" fill="#cdb894" stroke="#8a7550" stroke-width="3"/><ellipse cx="${x + r * .2}" cy="${y + r * .15}" rx="${r * .6}" ry="${r * .3}" fill="#b9a27a"/>`).join('')}
      <g stroke="${INK}" stroke-width="2.5"><circle cx="90" cy="140" r="26" fill="#3aa7c9"/><circle cx="60" cy="250" r="18" fill="#e0703a"/><circle cx="930" cy="360" r="14" fill="#c95ad6"/></g><path d="M66 134q24 8 48 0" stroke="#7fd6ee" stroke-width="5" fill="none"/>
      <g transform="translate(900 150)"><circle r="24" fill="#a77be0" stroke="${INK}" stroke-width="2.5"/><ellipse rx="44" ry="10" fill="none" stroke="#f2c94c" stroke-width="5" transform="rotate(-18)"/></g>
      <path d="M0 510h1000v90H0z" fill="#8d8f9c" stroke="${INK}" stroke-width="3"/><path d="M0 516h1000" stroke="#b4b6c2" stroke-width="5"/>${Array.from({ length: 6 }, (_, k) => `<path d="M${k * 200 - 60} 600l80 -90" stroke="#6c6e7a" stroke-width="3"/>`).join('')}`, 'np-scene-space'),

    classroom: () => svg(`<rect width="1000" height="600" fill="#ead9ba"/><rect y="300" width="1000" height="34" fill="#c99a62" stroke="${INK}" stroke-width="2.5"/><rect y="334" width="1000" height="266" fill="url(#npWood)"/>
      <rect x="200" y="30" width="540" height="240" rx="8" fill="#7a4a24" stroke="${INK}" stroke-width="3"/><rect x="214" y="44" width="512" height="212" fill="#2f5a46"/><rect x="214" y="250" width="512" height="14" fill="#8a5a30" stroke="${INK}" stroke-width="2"/>
      <text x="470" y="170" text-anchor="middle" font-family="'Baloo 2',sans-serif" font-size="56" font-weight="800" fill="#d9eadf" opacity=".9">Bạn ở đâu...?</text>
      <path d="M240 210q30-10 60 4M620 80l40 30" stroke="#d9eadf" stroke-width="3" fill="none" opacity=".5"/>
      <g stroke="${INK}" stroke-width="2.5"><rect x="20" y="40" width="130" height="290" fill="#8a5a30"/>${[0, 1, 2, 3].map((r) => `<rect x="28" y="${50 + r * 70}" width="114" height="6" fill="#6a4020"/>${Array.from({ length: 6 }, (_, k) => `<rect x="${32 + k * 18}" y="${60 + r * 70}" width="14" height="${44 - (k % 3) * 6}" fill="${FUN[(k + r) % FUN.length]}" stroke-width="1.5"/>`).join('')}`).join('')}
      <rect x="800" y="40" width="170" height="220" fill="#9fd4ef"/></g><path d="M885 40v220M800 150h170" stroke="#fff" stroke-width="8"/><path d="M820 60l40 60" stroke="#fff" stroke-width="6" opacity=".6"/>
      <path d="M770 30q30 120 0 260h30V30z" fill="#b3302a" stroke="${INK}" stroke-width="2.5"/>
      <g transform="translate(900 300)" stroke="${INK}" stroke-width="2.5"><path d="M-26 0h52l-6 40h-40z" fill="#c96a3f"/><circle cx="-12" cy="-20" r="22" fill="#4f9a3a"/><circle cx="14" cy="-26" r="20" fill="#5fae45"/></g>`),

    party: () => svg(`<rect width="1000" height="600" fill="#fbe1ec"/>${Array.from({ length: 12 }, (_, k) => `<rect x="${k * 90}" y="60" width="45" height="440" fill="#f7d4e2" opacity=".6"/>`).join('')}
      <rect y="500" width="1000" height="100" fill="#efc3d5" stroke="${INK}" stroke-width="3"/>
      <path d="M0 10Q500 60 1000 10" stroke="#8a3a5a" stroke-width="3" fill="none"/>
      ${Array.from({ length: 25 }, (_, k) => { const x = k * 41; const y = 10 + Math.sin((k / 24) * Math.PI) * 26; return `<path d="M${x} ${y}h40l-20 36z" fill="${FUN[k % FUN.length]}" stroke="${INK}" stroke-width="2"/>`; }).join('')}
      ${[[60, 200, 0], [940, 180, 3], [30, 330, 5]].map(([x, y, c]) => `<g><path d="M${x} ${y + 46}q-6 30 4 70" stroke="#5b5b6b" stroke-width="1.6" fill="none"/><ellipse cx="${x}" cy="${y}" rx="26" ry="32" fill="${FUN[c]}" stroke="${INK}" stroke-width="2.5"/><ellipse cx="${x - 9}" cy="${y - 12}" rx="5" ry="9" fill="#fff" opacity=".4"/></g>`).join('')}
      ${[[180, 130], [820, 110], [880, 330], [120, 420]].map(([x, y], k) => `<g class="np-confetti-dot">${Array.from({ length: 6 }, (_, j) => `<rect x="${x + j * 14}" y="${y + (j % 3) * 18}" width="8" height="4" fill="${FUN[(j + k) % FUN.length]}" transform="rotate(${j * 40} ${x + j * 14} ${y})"/>`).join('')}</g>`).join('')}`),

    field: () => svg(`${skyGrad('skyS', '#6cc0f5', '#d8f0ff')}<rect width="1000" height="140" fill="url(#skyS)"/>${cloud(400, 16, .7, 'd1')}${cloud(680, 36, .6, 'd2')}
      <g stroke="${INK}" stroke-width="2.5"><rect x="40" y="50" width="300" height="90" fill="#c4643c"/><rect x="34" y="42" width="312" height="12" fill="#a8502c"/></g>${Array.from({ length: 16 }, (_, k) => `<rect x="${58 + (k % 8) * 35}" y="${64 + Math.floor(k / 8) * 34}" width="22" height="20" fill="#e8f6ff" stroke="${INK}" stroke-width="1.5"/>`).join('')}
      ${tree(390, 108, .35)}${tree(450, 112, .3, true)}${tree(850, 106, .35)}${tree(920, 110, .4, true)}
      <path d="M0 136h1000" stroke="#6a6a6a" stroke-width="3"/>${Array.from({ length: 100 }, (_, k) => `<path d="M${k * 10} 122v18" stroke="#8a8a8a" stroke-width="2"/>`).join('')}
      <rect y="140" width="1000" height="460" fill="#5cae3e"/>${Array.from({ length: 10 }, (_, k) => `<rect x="${k * 100}" y="140" width="50" height="460" fill="#67b848"/>`).join('')}<rect y="140" width="1000" height="460" fill="url(#npGrassG)"/>
      <ellipse cx="300" cy="420" rx="220" ry="60" fill="#2f6b25" opacity=".12"/><ellipse cx="760" cy="250" rx="180" ry="40" fill="#2f6b25" opacity=".1"/>
      <g fill="none" stroke="#fff" stroke-width="4"><rect x="30" y="170" width="940" height="400"/><path d="M500 170v400"/><circle cx="500" cy="370" r="70"/><rect x="30" y="270" width="120" height="200"/><rect x="850" y="270" width="120" height="200"/><circle cx="500" cy="370" r="4" fill="#fff"/></g>
      <g fill="#fff" stroke="#9aa" stroke-width="2"><rect x="6" y="320" width="24" height="100"/><rect x="970" y="320" width="24" height="100"/></g>
      <path d="M8 330h20M8 345h20M8 360h20M8 375h20M8 390h20M8 405h20M972 330h20M972 345h20M972 360h20M972 375h20M972 390h20M972 405h20" stroke="#cfd8dc" stroke-width="1.5"/>
      ${bush(20, 598, .9)}${bush(985, 598, .9)}`),

    street: () => svg(`${skyGrad('skyU', '#7a58cf', '#ffb38a')}<rect width="1000" height="600" fill="url(#skyU)"/>
      <circle cx="590" cy="250" r="86" fill="#ffe0a0" opacity=".45"/><circle cx="590" cy="250" r="60" fill="#ffd27a"/>${cloud(200, 56, .9, 'd1')}${cloud(700, 26, .8, 'd2')}
      <path d="M440 330l60-60 50 30 60-50 60 80z" fill="#8a5aa8" opacity=".6"/><g transform="translate(680 200)" fill="#7a3a3a" stroke="${INK}" stroke-width="2"><rect x="0" y="40" width="30" height="100"/><path d="M-8 44h46l-23-22z M-6 74h42l-21-18z M-4 104h38l-19-16z"/></g>
      ${[[0, '#f2c14e'], [150, '#8fc7e8'], [280, '#f2b632'], [720, '#a6dcae'], [860, '#f5a0b4']].map(([x, c], k) => `<g transform="translate(${x} ${120 + (k % 2) * 20})" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
        <path d="M-4 52l74-44 74 44z" fill="#b4472e"/>${[0, 1, 2].map((r) => `<path d="M${8 + r * 8} ${44 - r * 10}h${124 - r * 16}" stroke="#8a2f1e" stroke-width="2"/>`).join('')}
        <rect x="6" y="50" width="128" height="${200 - (k % 2) * 20}" fill="${c}"/>
        <rect x="22" y="66" width="34" height="44" fill="#3f7a5a"/><rect x="84" y="66" width="34" height="44" fill="#3f7a5a"/><path d="M39 66v44M101 66v44" stroke-width="1.6"/>
        <rect x="14" y="112" width="112" height="4" fill="#7a4a2a"/>${Array.from({ length: 8 }, (_, j) => `<rect x="${18 + j * 14}" y="100" width="3" height="14" fill="#7a4a2a" stroke-width="1"/>`).join('')}
        <path d="M6 150h128l-8 26H14z" fill="${FUN[k]}"/><path d="M10 152h120" stroke="#fff" stroke-width="5" stroke-dasharray="16 16"/>
        ${[26, 60, 94].map((lx) => `<g stroke-width="1.6"><path d="M${lx + 10} 176v8"/><ellipse cx="${lx + 10}" cy="192" rx="8" ry="10" fill="#e8452c"/><rect x="${lx + 6}" y="181" width="8" height="3" fill="#f2c94c"/></g>`).join('')}
        <rect x="40" y="${206 - (k % 2) * 20}" width="56" height="${44}" fill="#6a4020"/>
        <rect x="20" y="${232 - (k % 2) * 20}" width="36" height="14" rx="3" fill="#8a5a30"/><circle cx="28" cy="${228 - (k % 2) * 20}" r="8" fill="#5fae45"/><circle cx="44" cy="${226 - (k % 2) * 20}" r="9" fill="#4f9a3a"/></g>`).join('')}
      ${[[150, 150], [470, 210], [940, 120]].map(([x, y]) => `<g transform="translate(${x} ${y})"><path d="M0 40v80" stroke="#6a4020" stroke-width="6"/>${Array.from({ length: 9 }, (_, k) => `<circle cx="${(k * 23) % 64 - 32}" cy="${(k * 17) % 44 - 22}" r="17" fill="${k % 2 ? '#f7b6cc' : '#f39ab8'}" stroke="#c0507a" stroke-width="1.6"/>`).join('')}</g>`).join('')}
      ${[440, 640].map((x) => `<g stroke="${INK}" stroke-width="2"><rect x="${x}" y="250" width="6" height="105" fill="#3a3a44"/><path d="M${x - 10} 250h26l-6-18h-14z" fill="#3a3a44"/><rect x="${x - 6}" y="236" width="18" height="14" fill="#ffe08a"/></g>`).join('')}
      <rect y="350" width="1000" height="120" fill="#ddd2c6" stroke="${INK}" stroke-width="2.5"/>${Array.from({ length: 12 }, (_, k) => `<path d="M${k * 90} 350v120" stroke="#c2b6a8" stroke-width="3"/>`).join('')}<path d="M0 410h1000" stroke="#c2b6a8" stroke-width="3"/>
      <rect y="468" width="1000" height="12" fill="#9b8f84" stroke="${INK}" stroke-width="2"/><rect y="480" width="1000" height="120" fill="#55555f"/>
      ${Array.from({ length: 7 }, (_, k) => `<rect x="${k * 160 + 10}" y="532" width="70" height="8" fill="#f2c94c"/>`).join('')}${Array.from({ length: 6 }, (_, k) => `<rect x="${360 + k * 46}" y="488" width="30" height="110" fill="#f4f4f4"/>`).join('')}`),

    // Gọi tên · Đua bi: tấm ván gỗ đục lỗ treo tường (đường bi gắn lên ván), bên phải là tường phòng có cửa sổ
    pegboard: () => svg(`<rect width="1000" height="600" fill="#f3e1bf"/>${Array.from({ length: 26 }, (_, k) => `<rect x="${k * 40}" width="20" height="600" fill="#ecd4aa" opacity=".6"/>`).join('')}
      <g stroke="${INK}" stroke-width="3"><rect x="828" y="290" width="144" height="150" rx="8" fill="#9fd8f5"/><path d="M900 290v150M828 365h144" stroke-width="4" fill="none"/></g>
      ${cloud(836, 300, .45, 'd1')}<path d="M814 284h172v12H814z" fill="#c99a62" stroke="${INK}" stroke-width="2.5"/>
      <g stroke="${INK}" stroke-width="2.5"><path d="M884 546l8-46h40l8 46z" fill="#d9734a"/><circle cx="912" cy="486" r="20" fill="#4f9a3a"/><circle cx="896" cy="496" r="14" fill="#5fae45"/><circle cx="930" cy="494" r="14" fill="#5fae45"/></g>
      <rect y="556" width="1000" height="44" fill="url(#npWood)" stroke="${INK}" stroke-width="2.5"/>
      <rect x="18" y="8" width="776" height="560" rx="16" fill="#d9a46a" stroke="${INK}" stroke-width="4"/>
      <rect x="30" y="20" width="752" height="536" rx="10" fill="#e0b27c"/>
      ${Array.from({ length: 13 }, (_, r) => Array.from({ length: 19 }, (_, c) => `<circle cx="${50 + c * 40}" cy="${40 + r * 40}" r="4.2" fill="#a8743f"/>`).join('')).join('')}
      <path d="M30 520h752" stroke="#c48d55" stroke-width="2" opacity=".6"/>`, 'np-scene-pegboard'),

    // Đấu trường · Đấu phép: sân đấu phép trước lâu đài lúc chạng vạng, sàn đá có vòng phép phát sáng
    castle: () => svg(`${skyGrad('skyC', '#2a1f5e', '#f0956a')}<rect width="1000" height="600" fill="url(#skyC)"/>
      <g class="np-stars">${Array.from({ length: 40 }, (_, k) => `<circle cx="${(k * 173) % 1000}" cy="${(k * 61) % 200}" r="${.8 + (k % 3) * .7}" fill="#fff6d8" style="animation-delay:${(k % 6) * .4}s"/>`).join('')}</g>
      <circle cx="860" cy="280" r="34" fill="#fff1c2" stroke="#e8c97a" stroke-width="3"/><circle cx="878" cy="268" r="31" fill="#93597a"/>
      <path d="M0 380l90-90 70 50 110-120 90 90 80-60 120 110 100-80 90 70 120-110 130 120V600H0z" fill="#4b3a86" stroke="#2f2560" stroke-width="2.5"/>
      <path d="M0 420l120-60 90 40 140-70 120 70 150-80 130 60 120-40 130 50V600H0z" fill="#5d4a9c" opacity=".9"/>
      <g stroke="${INK}" stroke-width="4" stroke-linejoin="round" transform="translate(500 470) scale(.58) translate(-500 -470)">
        ${[[150, 360, 180], [670, 360, 180]].map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="120" fill="#8f86b6"/>${Array.from({ length: 6 }, (_, k) => `<rect x="${x + 4 + k * 30}" y="${y - 16}" width="20" height="18" fill="#8f86b6"/>`).join('')}`).join('')}
        <rect x="400" y="250" width="200" height="230" fill="#a39bc6"/>${Array.from({ length: 7 }, (_, k) => `<rect x="${404 + k * 28}" y="232" width="18" height="20" fill="#a39bc6"/>`).join('')}
        ${[[320, 180], [600, 180]].map(([x, y]) => `<rect x="${x}" y="${y}" width="80" height="300" fill="#b3abd2"/><path d="M${x - 10} ${y + 2}L${x + 40} ${y - 86}L${x + 90} ${y + 2}z" fill="#6a3fb0"/>
          <path d="M${x + 40} ${y - 86}v-34" stroke-width="2.5"/><path d="M${x + 40} ${y - 120}l30 10-30 10z" fill="${x < 500 ? '#e5484d' : '#2f7be0'}"/>
          <path d="M${x + 26} ${y + 70}q14-26 28 0v34h-28z" fill="#ffd27a"/><path d="M${x + 26} ${y + 170}q14-26 28 0v34h-28z" fill="#ffd27a"/>`).join('')}
        <path d="M455 480v-90q45-60 90 0v90z" fill="#4a3424"/><path d="M500 340v140M455 420h90" stroke-width="2" fill="none"/>
        ${[470, 530].map((x) => `<path d="M${x - 10} 300q10-20 20 0v28h-20z" fill="#ffd27a"/>`).join('')}
      </g>
      <path d="M0 470h1000v130H0z" fill="#8c8170" stroke="${INK}" stroke-width="3"/>
      <path d="M0 478h1000" stroke="#a79d8b" stroke-width="6"/>
      ${Array.from({ length: 11 }, (_, k) => `<path d="M${k * 100} 480l${(k - 5) * 30} 120" stroke="#6f6556" stroke-width="2.5"/>`).join('')}
      <path d="M0 528h1000M0 572h1000" stroke="#6f6556" stroke-width="2"/>
      <ellipse cx="500" cy="540" rx="380" ry="44" fill="none" stroke="#c6a2ff" stroke-width="5" opacity=".8"/>
      <ellipse cx="500" cy="540" rx="330" ry="34" fill="none" stroke="#e6d4ff" stroke-width="2.5" stroke-dasharray="14 10" opacity=".8"/>
      ${[[90, 470], [910, 470]].map(([x, y]) => `<g stroke="${INK}" stroke-width="2.5"><rect x="${x - 6}" y="${y - 110}" width="12" height="110" fill="#5a4030"/><path d="M${x - 16} ${y - 112}h32l-6 14h-20z" fill="#7a7a86"/></g>
        <path class="np-torch" d="M${x} ${y - 160}q-20 26-6 44h12q14-18-6-44z" fill="#ff9a2a" stroke="#c2410c" stroke-width="2"/><path d="M${x} ${y - 140}q-8 14-2 22h4q6-8-2-22z" fill="#ffe08a"/>`).join('')}`, 'np-scene-castle'),

    // Đấu trường · Sinh tồn: đảo hoang giữa biển (kiểu Battle Royale) — biển, bãi cát, dừa
    island: () => {
      const palm = (x, y, s, flip) => `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})" stroke="${INK}" stroke-width="3" stroke-linejoin="round">
        <path d="M-8 0q-4-90 34-170l14 6q-34 80-30 164z" fill="#a8743f"/>${Array.from({ length: 8 }, (_, k) => `<path d="M${-6 + k * 4.5} ${-20 - k * 19}q8 2 14 -2" fill="none" stroke="#7d5229" stroke-width="2"/>`).join('')}
        ${[[-110, -150], [-70, -210], [40, -225], [100, -170], [70, -120], [-60, -110]].map(([lx, ly]) => `<path d="M32 -170Q${(32 + lx) / 2} ${ly - 40} ${lx} ${ly}Q${(32 + lx) / 2 + 6} ${ly - 8} 32 -164z" fill="#3f9a3a"/>`).join('')}
        <circle cx="26" cy="-160" r="9" fill="#7a4f22"/><circle cx="40" cy="-156" r="9" fill="#7a4f22"/></g>`;
      return svg(`${skyGrad('skyI', '#42a8ee', '#d6f1ff')}<rect width="1000" height="600" fill="url(#skyI)"/>${sun(170, 90, 40)}
      ${cloud(380, 40, .9, 'd1')}${cloud(720, 90, .7, 'd2')}
      <defs><linearGradient id="seaI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f8fd0"/><stop offset="1" stop-color="#45c1e8"/></linearGradient></defs>
      <rect y="360" width="1000" height="240" fill="url(#seaI)"/><path d="M0 360h1000" stroke="#1d6fa8" stroke-width="3"/>
      <path d="M640 362q50-40 110-34 50 4 80 34z" fill="#4f9a3a" stroke="${INK}" stroke-width="2.5"/><path d="M700 334q-2-26 10-46" stroke="#8a5a30" stroke-width="4" fill="none"/><path d="M710 288q-20-4-30 8M710 288q16-10 28-2M710 288q-4-16-16-20" stroke="#3f9a3a" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M90 362q30-18 70-14 30 2 50 14z" fill="#6b8f5a" opacity=".8"/>
      ${[400, 430, 460].map((y, k) => `<path class="np-wave" d="M${-40 + k * 30} ${y}${Array.from({ length: 14 }, () => 'q20-8 40 0t40 0').join('')}" stroke="#bfefff" stroke-width="3" fill="none" opacity="${.9 - k * .2}"/>`).join('')}
      <path d="M0 482q120-26 260-12t280 6 260-14 200 10V600H0z" fill="#e7c58a"/>
      <path d="M0 470q120-26 260-12t280 6 260-14 200 10" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".85"/>
      <path d="M0 490q120-24 260-10t280 6 260-14 200 10V600H0z" fill="#f3dba6" stroke="${INK}" stroke-width="3"/>
      ${Array.from({ length: 30 }, (_, k) => `<circle cx="${(k * 97) % 1000}" cy="${510 + (k * 37) % 80}" r="${1.5 + k % 2}" fill="#d9bb80"/>`).join('')}
      <g stroke="${INK}" stroke-width="2"><path d="M300 560l6-12 6 12-12-8h12z" fill="#f28b5b"/><path d="M712 580q8-14 16 0z" fill="#fbe1ec"/><path d="M180 586l5-10 5 10-10-6h10z" fill="#f7c331"/></g>
      ${palm(60, 560, 1.15)}${palm(950, 560, 1.05, true)}${rock(860, 596, .55)}${rock(150, 600, .45)}`, 'np-scene-island');
    },

    // Đấu trường · Diệt Virus: phòng máy chủ bị nhiễm — tủ máy chủ nháy đèn 2 bên, màn hình cảnh báo, sàn mạch điện
    server: () => {
      const rack = (x, w) => `<g stroke="${INK}" stroke-width="3"><rect x="${x}" y="150" width="${w}" height="330" rx="6" fill="#26304f"/>
        ${Array.from({ length: 9 }, (_, k) => `<rect x="${x + 10}" y="${166 + k * 34}" width="${w - 20}" height="24" rx="3" fill="#323e66" stroke-width="2"/>
          ${[0, 1, 2].map((j) => `<circle class="np-led" cx="${x + 22 + j * 12}" cy="${178 + k * 34}" r="3.5" fill="${['#4ff08a', '#ffc21f', '#4fd2ff'][(k + j) % 3]}" stroke="none" style="animation-delay:${((k * 3 + j) % 7) * .23}s"/>`).join('')}
          <path d="M${x + w - 46} ${178 + k * 34}h30" stroke="#55628f" stroke-width="3"/>`).join('')}</g>`;
      return svg(`<defs><linearGradient id="srvBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1330"/><stop offset="1" stop-color="#1d2c5c"/></linearGradient>
        <radialGradient id="srvGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff4d5e" stop-opacity=".45"/><stop offset="1" stop-color="#ff4d5e" stop-opacity="0"/></radialGradient></defs>
      <rect width="1000" height="600" fill="url(#srvBg)"/>
      <g stroke="#2e4688" stroke-width="3" fill="none" opacity=".8">${[[0, 200, 180, 200, 220, 160, 420, 160], [1000, 230, 820, 230, 780, 190, 600, 190], [0, 330, 140, 330, 180, 290, 330, 290], [1000, 360, 860, 360, 820, 320, 680, 320]].map(([a, b, c, d, e, f, g, h]) => `<path d="M${a} ${b}H${c}L${e} ${f}H${g}"/><circle cx="${g}" cy="${h}" r="6" fill="#3c5bb0"/>`).join('')}</g>
      <ellipse cx="500" cy="300" rx="260" ry="160" fill="url(#srvGlow)"/>
      <g stroke="${INK}" stroke-width="4"><rect x="350" y="200" width="300" height="190" rx="12" fill="#1a1f33"/><rect x="368" y="216" width="264" height="158" rx="4" fill="#5a0f1c"/>
        <path d="M484 406h32l10 26h-52z" fill="#3a4466"/><rect x="440" y="430" width="120" height="12" rx="4" fill="#3a4466"/></g>
      <g class="np-alert"><path d="M500 236l42 74h-84z" fill="#ffc21f" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M500 258v26" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><circle cx="500" cy="296" r="4.5" fill="${INK}"/></g>
      ${Array.from({ length: 8 }, (_, k) => `<rect x="${372 + k * 34}" y="334" width="18" height="10" fill="${k % 2 ? '#ffc21f' : '#1a1f33'}" transform="skewX(-25)" transform-origin="${380 + k * 34} 339"/>`).join('')}
      <path d="M612 228l-18 30 14 10-20 34" stroke="#ff9aa6" stroke-width="2.5" fill="none" opacity=".8"/>
      ${rack(14, 128)}${rack(858, 128)}
      <rect y="470" width="1000" height="130" fill="#1a2546" stroke="${INK}" stroke-width="3"/>
      ${Array.from({ length: 11 }, (_, k) => `<path d="M${k * 100} 472l${(k - 5) * 34} 128" stroke="#2c3c70" stroke-width="2.5"/>`).join('')}
      <path d="M0 512h1000M0 560h1000" stroke="#2c3c70" stroke-width="2"/>
      <path class="np-trace" d="M60 540H300l30-22h200l30 22h380" stroke="#3fe0ff" stroke-width="3" fill="none" opacity=".7" stroke-dasharray="12 10"/>
      <path d="M150 600q20-40 60-50t90-10M860 600q-30-36-80-44" stroke="#111a33" stroke-width="9" fill="none" stroke-linecap="round"/>
      ${[[250, 502, 34], [650, 520, 44], [760, 494, 26]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * .22}" fill="#5fd068" opacity=".45"/>`).join('')}
      ${[[230, 120], [700, 96], [790, 150], [300, 70], [620, 130]].map(([x, y], k) => `<g class="np-bit" style="animation-delay:${k * .7}s" transform="translate(${x} ${y})"><circle r="9" fill="#5fd068" stroke="${INK}" stroke-width="2"/>${[0, 60, 120, 180, 240, 300].map((a) => `<path d="M0 -9V-15" stroke="#2f8f3a" stroke-width="3" transform="rotate(${a})"/>`).join('')}</g>`).join('')}`, 'np-scene-server');
    },
  };

  global.EduNamePickerArt = { kid, hen, egg, cake, dino, bird, fish, balloon, rocket, gift, referee, card, ufo, bus, virus, scene: (id) => SCENES[id](), FUN };
})(window);
