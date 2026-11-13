// Khu vui chơi (/app/#/tro-choi) + Thành tích (/app/#/thanh-tich) — đọc eduquiz_gamestate, mở trang game cũ.
import { mainText, openApp, overflow, seed } from './_helpers.mjs';

export default async function ({ base, page, check, shot }) {
  const todayUTC = new Date().toISOString().slice(0, 10); // = gamification.js § _today()
  const yesterdayUTC = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const state = (dailyDate) => ({
    xp: 640, totalQuizzes: 12, perfectScores: 1, streak: 4, lastPlayedDate: todayUTC,
    badges: ['first_quiz', 'streak_3', 'ten_quizzes'], totalGameSessions: 9,
    gameCounts: { 'mario-flappy': 4, 'pz-defense': 2, 'computer-simulator': 1, 'daily-challenge': 1, 'arena-room-speed': 1 },
    daily: { date: dailyDate, games: 2, done: false }, dailyQuestsDone: 2,
  });
  const p = await page();
  await seed(p, base, { eduquiz_gamestate: state(todayUTC), 'ic3v2.previewRole': 'guest', ic3_theme: 'light' });
  await openApp(p, base, '#/tro-choi');
  let t = await mainText(p);
  check('nhiệm vụ hôm nay: còn 1 ván', /Còn 1 ván/.test(t));
  check('số lượt đã chơi theo game', /Đã chơi 4 lượt/.test(t) && /Đã chơi 2 lượt/.test(t));
  const links = await p.evaluate(() => [...document.querySelectorAll('main a[href^="../"]')].map((a) => a.getAttribute('href')));
  const bad = [];
  for (const l of links) {
    const r = await fetch(new URL(l, base + 'app/').href);
    if (r.status !== 200) bad.push(`${l} → ${r.status}`);
  }
  check(`mọi link game trỏ tới trang có thật (${links.length})`, links.length >= 11 && !bad.length, bad);
  await shot(p, 'games.png');
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.evaluate(() => [...document.querySelectorAll('main a')].find((a) => a.textContent.includes('Hành trình IC3')).click())]);
  await p.waitForFunction(() => document.getElementById('arHome')?.dataset.role, { timeout: 15000 });
  check('"Hành trình IC3" → Đấu trường đúng vai minigame', (await p.evaluate(() => document.getElementById('arHome').dataset.role)) === 'minigame');

  await seed(p, base, { eduquiz_gamestate: state(todayUTC), 'ic3v2.previewRole': 'guest' });
  await openApp(p, base, '#/thanh-tich');
  t = await mainText(p);
  check('thành tích: Cấp 4, còn 260 XP', /Cấp 4/.test(t) && /Còn 260 XP để lên cấp 5/.test(t));
  check('thành tích: 3/12 huy hiệu, nhiệm vụ 2/3', /3\/12/.test(t) && /2\/3/.test(t));
  check('thành tích: lượt Đấu trường cả lớp gộp đúng tên', /Đấu trường cả lớp/.test(t));
  await shot(p, 'achievements.png');

  await seed(p, base, { eduquiz_gamestate: state(yesterdayUTC), 'ic3v2.previewRole': 'guest' });
  await openApp(p, base, '#/tro-choi');
  check('nhiệm vụ lưu từ hôm qua → hôm nay tính lại (còn 3 ván)', /Còn 3 ván/.test(await mainText(p)));

  await seed(p, base, { 'ic3v2.previewRole': 'guest' });
  await openApp(p, base, '#/thanh-tich');
  t = await mainText(p);
  check('máy mới: Cấp 1, 0/12 huy hiệu', /Cấp 1/.test(t) && /0\/12/.test(t));
  await p.setViewport({ width: 375, height: 812 });
  check('thành tích 375px: không tràn ngang', !(await overflow(p)));
  await openApp(p, base, '#/tro-choi');
  check('khu vui chơi 375px: không tràn ngang', !(await overflow(p)));
  check('không lỗi JavaScript', p.errors.length === 0, p.errors);
  await p.closeAll();
}
