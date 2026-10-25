/* ============================================================
   js/arena/arena-covers.js — tranh bìa cho thẻ chọn chế độ Đấu trường (kiểu thẻ game Blooket).
   Mỗi thẻ .ar-mode thay icon emoji bằng 1 khung tranh: cảnh nền của np-art (cắt bằng viewBox)
   + nhân vật/đạo cụ đặt thẳng trong toạ độ cảnh (1000×600), nên co giãn cùng nhau.
   Id gradient/filter trong mỗi tranh được đổi tên riêng (cvN-…): cảnh trong trận (arena-scene.js)
   dùng cùng id, nếu trùng thì khi màn chọn bị ẩn, url(#id) trỏ vào bản bị ẩn và mất màu.
   Không mạng, không lưu gì.
   ============================================================ */
(function (global) {
  'use strict';

  const A = global.EduNamePickerArt;
  if (!A) return;
  const INK = '#3a2a1e';
  const ol = (w) => `stroke="${INK}" stroke-width="${w || 2.4}" stroke-linejoin="round" stroke-linecap="round"`;

  /** Đặt 1 hình <svg viewBox> vào toạ độ cảnh; cls gắn cho nhóm bọc ngoài (để CSS cho cử động). */
  const put = (art, x, y, w, h, cls, tf) =>
    `<g${tf ? ` transform="${tf}"` : ''}><g class="${cls || ''}">${art.replace('<svg ', `<svg x="${x}" y="${y}" width="${w}" height="${h}" `)}</g></g>`;
  const KW = 80, KH = 130; // bạn nhỏ to hơn trong cảnh thật một chút cho rõ trên thẻ
  const kid = (i, x, gy, run, cls, flip) => put(A.kid(i), x, gy - KH, KW, KH, `cv-kid${run ? ' is-run' : ''} ${cls || ''}`,
    flip ? `translate(${2 * x + KW} 0) scale(-1 1)` : '');

  // ── Đạo cụ riêng (cùng nét viền với np-art) ──
  const heart = (x, y, s, cls) => `<g class="${cls || ''}"><g transform="translate(${x} ${y}) scale(${s})"><path d="M0 12C-14-4-30 6-22 22 -16 32 0 42 0 42S16 32 22 22C30 6 14-4 0 12z" fill="#e5484d" ${ol(2.6)}/><ellipse cx="-12" cy="10" rx="4" ry="6" fill="#fff" opacity=".55" transform="rotate(-30 -12 10)"/></g></g>`;
  const coin = (x, y, r) => `<g><circle cx="${x}" cy="${y}" r="${r}" fill="#f7c331" ${ol(2.2)}/><circle cx="${x}" cy="${y}" r="${r * .62}" fill="none" stroke="#d69a12" stroke-width="2.5"/><path d="M${x - r * .3} ${y - r * .45}q${r * .3}-${r * .2} ${r * .5} 0" stroke="#fff6c4" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`;
  const bolt = (x, y, s) => `<g class="cv-pulse"><g transform="translate(${x} ${y}) scale(${s})"><path d="M14 0L-18 44h18L-6 84 30 34H10L22 0z" fill="#ffd23f" ${ol(3)}/><path d="M12 6L-8 36" stroke="#fff6c4" stroke-width="4" stroke-linecap="round"/></g></g>`;
  const gem = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-16 0l8-10h16l8 10-16 20z" fill="${c}" ${ol(2.2)}/><path d="M-16 0h32M-8-10l8 10 8-10M0 0v20" fill="none" stroke="${INK}" stroke-width="1.4" opacity=".6"/><path d="M-10-4l4-4" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></g>`;
  const flag = (x, gy, h) => `<g><path d="M${x} ${gy}v${-h}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>${[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) =>
    `<rect x="${x + 2 + c * 14}" y="${gy - h + r * 12}" width="14" height="12" fill="${(r + c) % 2 ? '#fff' : '#2b2b33'}"/>`).join('')).join('')}<rect x="${x + 2}" y="${gy - h}" width="56" height="48" fill="none" ${ol(2.4)}/></g>`;
  const safe = (x, gy) => `<g ${ol(3)}><rect x="${x}" y="${gy - 120}" width="130" height="120" rx="10" fill="#7d8796"/><rect x="${x + 12}" y="${gy - 108}" width="106" height="96" rx="6" fill="#9aa4b2"/>
    <circle cx="${x + 65}" cy="${gy - 60}" r="26" fill="#d7dce3"/><circle cx="${x + 65}" cy="${gy - 60}" r="8" fill="#5b6472"/>
    ${[0, 60, 120, 180, 240, 300].map((a) => `<path d="M${x + 65} ${gy - 60}l0 -20" transform="rotate(${a} ${x + 65} ${gy - 60})" stroke-width="2"/>`).join('')}
    <rect x="${x + 104}" y="${gy - 80}" width="8" height="40" rx="3" fill="#f2c94c"/></g>`;
  const rope = (x1, x2, y) => `<path d="M${x1} ${y}q${(x2 - x1) / 2} 10 ${x2 - x1} 0" stroke="#a4723f" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M${x1} ${y}q${(x2 - x1) / 2} 10 ${x2 - x1} 0" stroke="#d9a868" stroke-width="2.5" stroke-dasharray="6 8" fill="none"/>`;
  const fireball = (x, y, s) => `<g class="cv-float"><g transform="translate(${x} ${y}) scale(${s})"><path d="M-70 0q30-30 64-22 30-6 34 22-4 28-34 22-34 8-64-22z" fill="#ff8a2a" opacity=".55"/><circle cx="6" cy="0" r="26" fill="#ff7a1a" ${ol(2.6)}/><circle cx="12" cy="-4" r="14" fill="#ffd23f"/><circle cx="16" cy="-8" r="5" fill="#fff6c4"/></g></g>`;
  const spark = (x, y, s, c) => `<path class="cv-twinkle" d="M${x} ${y - 14 * s}l${3 * s} ${10 * s} ${10 * s} ${3 * s}-${10 * s} ${3 * s}-${3 * s} ${10 * s}-${3 * s}-${10 * s}-${10 * s}-${3 * s} ${10 * s}-${3 * s}z" fill="${c || '#fff6c4'}"/>`;
  const bone = (x, y, s, r) => `<g transform="translate(${x} ${y}) rotate(${r || 0}) scale(${s})"><path d="M-30-6h60a10 10 0 1 1 6 12 10 10 0 1 1-6 12h-60a10 10 0 1 1-6-12 10 10 0 1 1 6-12z" fill="#f4ecd8" ${ol(2.4)}/></g>`;
  const rock = (x, gy, s, c) => `<g transform="translate(${x} ${gy}) scale(${s})"><path d="M-46 0q-6-38 24-46 34-8 54 12 16 16 12 34z" fill="${c || '#9aa0a8'}" ${ol(3)}/><path d="M-30-14q6-18 26-22" stroke="rgba(255,255,255,.45)" stroke-width="6" fill="none" stroke-linecap="round"/></g>`;
  const board = (x, y) => {
    const tiles = [100, 200, 300].map((v, c) => [0, 1].map((r) =>
      `<rect x="${x + 16 + c * 108}" y="${y + 16 + r * 70}" width="96" height="58" rx="8" fill="${['#2f7be0', '#e5484d', '#16a37f'][c]}" ${ol(2.4)}/><text x="${x + 64 + c * 108}" y="${y + 55 + r * 70}" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="28" fill="#fff">${v * (r + 1)}</text>`).join('')).join('');
    return `<g><rect x="${x}" y="${y}" width="340" height="172" rx="12" fill="#24408c" ${ol(3.5)}/>${tiles}</g>`;
  };

  /** Mỗi chế độ: cảnh nền (giống cảnh trong trận) + khung cắt [x, y] (cửa sổ 660×300 trong cảnh 1000×600) + lớp nhân vật.
      Nhân vật vẽ theo mặt đất y≈564; cảnh có mặt đất khác thì dy dời cả lớp nhân vật. */
  const COVERS = {
    speed: { scene: 'field', vb: [170, 248], art: () => `${kid(6, 320, 512, true)}${kid(1, 460, 516, true, 'cv-lag')}${bolt(650, 300, 1.15)}` },
    gold: { scene: 'farm', vb: [170, 300], art: () => `${put(A.gift('#2f7be0'), 290, 480, 80, 80, 'cv-bob d1')}${put(A.gift('#f5b301'), 395, 452, 110, 110, 'cv-bob')}${put(A.gift('#e5484d'), 530, 480, 80, 80, 'cv-bob d2')}
      ${coin(380, 420, 16)}${coin(520, 400, 13)}${coin(455, 380, 11)}${put(A.hen(), 650, 470, 100, 92)}` },
    race: { scene: 'track', vb: [170, 160], art: () => `${kid(2, 300, 330, true)}${kid(5, 430, 410, true, 'cv-lag')}${flag(700, 400, 150)}` },
    survival: { scene: 'island', vb: [170, 250], dy: -50, art: () => `${kid(4, 380, 564)}${kid(9, 500, 564, false, 'cv-scared', true)}
      ${heart(370, 360, 1.05, 'cv-bob')}${heart(445, 342, 1.2, 'cv-bob d1')}${heart(520, 360, 1.05, 'cv-bob d2')}` },
    fish: { scene: 'pond', vb: [170, 300], art: () => `${kid(8, 220, 566)}<path d="M290 458q110-80 202-18" stroke="#5b4630" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M492 440v52" stroke="#eee" stroke-width="1.8"/>
      ${put(A.fish('#f19a1a'), 452, 486, 90, 56, 'cv-flop')}${put(A.fish('#8b4fd6'), 600, 520, 70, 44, 'cv-flop d2')}` },
    tug: { scene: 'sky', vb: [170, 300], art: () => `${rope(300, 700, 500)}<path d="M500 504v40" stroke="${INK}" stroke-width="3"/><path d="M500 504h-26l13 14z" fill="#e5484d" ${ol(2)}/><path d="M500 504h26l-13 14z" fill="#2f7be0" ${ol(2)}/>
      ${kid(3, 210, 562, true, 'is-pull')}${kid(7, 290, 562, true, 'is-pull d1')}${kid(0, 630, 562, true, 'is-pull d1', true)}${kid(5, 710, 562, true, 'is-pull', true)}` },
    spell: { scene: 'castle', vb: [170, 240], dy: -60, art: () => `${kid(2, 240, 564, true)}${kid(11, 620, 564, false, 'cv-scared', true)}${fireball(470, 470, 1)}${spark(560, 400, 1.4)}${spark(400, 380, 1, '#bfe9ff')}${spark(650, 360, 1.1)}` },
    heist: { scene: 'street', vb: [170, 200], art: () => `${safe(440, 464)}${kid(6, 280, 464, false, 'cv-peek')}${gem(610, 446, 1.1, '#3ec7e0')}${gem(650, 452, .9, '#e0559a')}${gem(630, 420, .85, '#6cd46c')}${spark(470, 350, 1.2)}` },
    dino: { scene: 'jungle', vb: [170, 150], dy: -154, art: () => `${put(A.dino(), 480, 380, 220, 170, 'cv-dino')}${rock(310, 566, .9)}${rock(420, 566, .7, '#b9a27a')}${bone(360, 520, .9, -12)}${kid(1, 230, 566)}` },
    moon: { scene: 'space', vb: [170, 0], art: () => `${put(A.rocket('#e5484d'), 420, 130, 76, 140, 'cv-rocket', 'rotate(18 458 200)')}${put(A.rocket('#2f7be0'), 600, 190, 56, 104, 'cv-rocket d2', 'rotate(10 628 242)')}${spark(330, 200, 1.2)}${spark(740, 140, 1)}` },
    boss: { scene: 'server', vb: [170, 214], art: () => `${put(A.virus(), 520, 290, 200, 200, 'cv-boss')}${kid(3, 250, 500, true)}${kid(10, 350, 500, false, 'd1')}
      <path class="cv-pulse" d="M440 400l60-26-14 20 44-8" stroke="#3fe0ff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${spark(470, 330, 1.3, '#bfe9ff')}${spark(720, 300, 1)}` },
    board: { scene: 'classroom', vb: [170, 60], art: () => `${board(330, 110)}${kid(4, 270, 360)}${kid(9, 700, 360, false, '', true)}` },
  };

  let seq = 0;
  /** Cảnh + lớp nhân vật → 1 <svg> duy nhất, id đổi tên riêng cho thẻ này. */
  function cover(mode) {
    const c = COVERS[mode];
    if (!c) return '';
    const pre = `cv${++seq}-`;
    let s = A.scene(c.scene)
      .replace('viewBox="0 0 1000 600"', `viewBox="${c.vb[0]} ${c.vb[1]} 660 300"`)
      .replace(/<\/svg>\s*$/, `<g class="cv-cast"${c.dy ? ` transform="translate(0 ${c.dy})"` : ''}>${c.art()}</g></svg>`);
    s = s.replace(/\bid="([^"]+)"/g, `id="${pre}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${pre}$1)`);
    return s;
  }

  function paint(root) {
    (root || document).querySelectorAll('.ar-mode[data-mode]').forEach((b) => {
      if (b.querySelector('.ar-cover')) return;
      const html = cover(b.dataset.mode);
      if (!html) return;
      const ico = b.querySelector('.ar-mode-ico');
      const box = document.createElement('span');
      box.className = 'ar-cover';
      box.setAttribute('aria-hidden', 'true');
      box.innerHTML = html;
      if (ico) ico.replaceWith(box); else b.prepend(box);
      b.classList.add('has-cover');
    });
  }

  global.EduArenaCovers = { paint, cover };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => paint());
  else paint();
})(typeof window !== 'undefined' ? window : globalThis);
