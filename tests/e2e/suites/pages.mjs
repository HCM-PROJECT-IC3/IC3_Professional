// Mở thẳng MỌI trang cũ (học sinh, game, mô phỏng, trang nhân sự khi CHƯA đăng nhập):
// không lỗi JavaScript, không gọi Firestore / Firebase Auth, không file cùng nguồn nào lỗi (404 = gõ sai tên/xoá nhầm file),
// thu về 375px (điện thoại) không tràn ngang. Trang nhân sự chưa đăng nhập chỉ hiện màn chờ / mời đăng nhập.
import fs from 'node:fs';
import { firebaseHosts, gotoSettled } from './_helpers.mjs';
import { portfolioPause } from './_portfolio-pause.mjs';

const PAGES = [
  ['index.html', ['EduLearningHub', 'lobbySelectMinitest', 'EduGamification']],
  ['arena.html?vai=minigame', []], ['arena.html?vai=solo', []], ['arena.html?vai=student', []],
  ['mario-flappy.html', []], ['pz-defense.html', []], ['memory-game.html', []], ['battle-quiz.html', []],
  ['cyber-detective.html', []], ['computer-simulator.html', []], ['mos/index.html', []],
  ['login.html', ['EduAuth']],
  ['teacher-dashboard.html', ['EduTeacherData']], ['coordinator-dashboard.html', ['EduCoordinatorData', 'EduQuestionLookup']],
  ['ic3-dashboard.html', []], ['gom-ket-qua.html', []], ['admin-users.html', []],
];

export default async function ({ base, root, page, check }) {
  // Trang .html mới thêm ở gốc mà quên khai ở trên vẫn được mở (15/11/2026: 11 trang chưa từng được kiểm).
  const listed = new Set(PAGES.map(([p]) => p.split('?')[0]));
  fs.readdirSync(root).filter((f) => f.endsWith('.html') && !listed.has(f)).sort().forEach((f) => PAGES.push([f, []]));

  for (const [path, globals] of PAGES) {
    const p = await page({ width: 1280, height: 800 });
    const bad = new Set();
    p.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) bad.add(r.status() + ' ' + r.url().slice(base.length)); });
    await gotoSettled(p, base + path).catch((e) => p.errors.push('load: ' + e.message));
    await new Promise((r) => setTimeout(r, 1200));
    const missing = await p.evaluate((g) => g.filter((k) => typeof window[k] === 'undefined'), globals).catch(() => globals);
    const fb = firebaseHosts(p);
    check(`${path}: mở không lỗi${globals.length ? ', có ' + globals.join(', ') : ''}`, !p.errors.length && !missing.length, { errs: p.errors, missing });
    check(`${path}: không gọi Firestore / Firebase Auth`, fb.length === 0, fb);
    check(`${path}: mọi file cùng nguồn tải được`, bad.size === 0, [...bad]);
    // Không "giao diện mẫu AI" (15/11/2026): tiêu đề tab không emoji, không chữ chuyển màu, không nhắc tên sản phẩm khác.
    const ai = await p.evaluate(() => ({
      titleEmoji: /\p{Extended_Pictographic}/u.test(document.title),
      gradText: [...document.querySelectorAll('body *')].filter((e) => { const s = getComputedStyle(e); return e.getBoundingClientRect().width > 0 && (s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text'); }).map((e) => e.className || e.tagName).slice(0, 3),
      brand: (document.body.innerText.match(/kahoot|blooket|quizizz|gimkit|wayground|wayarena|battle royale/gi) || []),
    })).catch(() => ({ titleEmoji: false, gradText: [], brand: [] }));
    check(`${path}: không vẻ "mẫu AI" (emoji ở tiêu đề tab, chữ gradient, tên sản phẩm khác)`, !ai.titleEmoji && !ai.gradText.length && !ai.brand.length, ai);
    await p.setViewport({ width: 375, height: 800 });
    await new Promise((r) => setTimeout(r, 400));
    const wide = await p.evaluate(() => (document.documentElement.scrollWidth > innerWidth ? document.documentElement.scrollWidth : 0)).catch(() => -1);
    check(`${path}: 375px không tràn ngang`, wide === 0, { scrollWidth: wide });
    await p.closeAll();
  }
  await portfolioPause({ base, page, check });
}
