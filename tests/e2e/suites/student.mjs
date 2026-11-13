// Góc học tập 2.0 (/app/#/) — số liệu PHẢI khớp Góc học tập cũ (EduLearningHub.studentSummary) trên cùng dữ liệu.
import { mainText, openApp, overflow, seed, stat } from './_helpers.mjs';

const DAY = 864e5;
export const STUDENT_A = ['Nguyễn Minh An', '4A1', 'TH Thử Nghiệm'];
export const STUDENT_B = ['Trần Bảo Bình', '5A2', 'TH Thử Nghiệm'];
export const keyOf = (s) => s.map((x) => x.trim().toLowerCase()).join('|');

export function fixtureRecords(now = Date.now()) {
  const rec = (i, daysAgo, st, score, minitest, mode = 'practice') => {
    const t = now - daysAgo * DAY - i * 60e3;
    return { id: t * 1000 + i, studentName: st[0], studentClass: st[1], studentSchool: st[2], category: 'IC3 Spark', level: 'Level 1',
      minitest, examMode: mode, score, correct: Math.round(score / 5), total: 20 };
  };
  const topics = ['Bài 1. Phần cứng', 'Bài 2. Phần mềm', 'Bài 3. Internet', 'Tổng hợp 20 câu', 'Bài 4. An toàn'];
  const out = [];
  [0, 0, 1, 2, 3, 3, 9, 12, 15, 20, 26, 31].forEach((d, i) =>
    out.push(rec(i, d, STUDENT_A, [45, 62, 88, 71, 55, 93, 40, 66, 80, 58, 74, 90][i], topics[i % 5], i % 3 ? 'practice' : 'test')));
  out.push(rec(99, 1, STUDENT_B, 77, topics[0]));
  return out.sort((a, b) => b.id - a.id); // eduquiz_records: mới nhất trước
}

export default async function ({ base, page, check, shot }) {
  const now = Date.now();
  const kA = keyOf(STUDENT_A);
  const items = {};
  for (let i = 0; i < 9; i++) items['u:q' + i] = { box: 1 + (i % 4), due: i < 5 ? now - 1000 : now + 3 * DAY, added: now - 5 * DAY, wrong: 1 };
  const data = {
    eduquiz_records: fixtureRecords(now),
    eduquiz_wrongbook_v1: { [kA]: { name: STUDENT_A[0], cls: STUDENT_A[1], school: STUDENT_A[2], items, mastered: 3, updated: now } },
    eduquiz_goals_v1: { [kA]: { perWeek: 5 } },
    eduquiz_gamestate: { xp: 640, totalQuizzes: 13, perfectScores: 0, streak: 4, badges: ['first_quiz', 'streak_3', 'ten_quizzes'], totalGameSessions: 2, dailyQuestsDone: 0 },
    'ic3v2.previewRole': 'guest',
    ic3_theme: 'light',
  };

  const p = await page();
  await seed(p, base, data);

  // Bản cũ
  await p.goto(base + 'index.html', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.EduLearningHub, { timeout: 15000 });
  const legacy = await p.evaluate((st) => {
    ['studentName', 'studentClass', 'studentSchool'].forEach((id, i) => {
      const el = document.getElementById(id);
      const o = document.createElement('option');
      o.value = st[i]; o.textContent = st[i]; el.appendChild(o); el.disabled = false; el.value = st[i];
    });
    return window.EduLearningHub.studentSummary();
  }, STUDENT_A);

  // Bản mới
  await p.evaluate((k) => localStorage.setItem('ic3v2.student', k), kA);
  p.external.clear();
  await openApp(p, base, '#/');
  await p.waitForFunction(() => /Chào /.test(document.querySelector('main')?.innerText || ''));
  const app = { done: await stat(p, 'Bài đã làm'), streak: await stat(p, 'Chuỗi ngày học'), due: await stat(p, 'Câu cần ôn hôm nay'), avg: await stat(p, 'Điểm TB 10 bài gần nhất') };
  check('Bài đã làm khớp bản cũ', String(legacy.done) === app.done, { legacy: legacy.done, app: app.done });
  check('Chuỗi ngày học khớp bản cũ', `${legacy.streak} ngày` === app.streak, { legacy: legacy.streak, app: app.streak });
  check('Câu cần ôn khớp bản cũ', String(legacy.due) === app.due, { legacy: legacy.due, app: app.due });
  check('Điểm TB 10 bài gần nhất = 66% (tính tay)', app.avg === '66%', app.avg);
  check('trang học sinh: 0 request ra ngoài', p.external.size === 0, [...p.external]);
  await shot(p, 'student.png');

  // Mục tiêu tuần ghi CÙNG định dạng learning-hub.js
  await p.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === '7 bài').click());
  const goal = await p.evaluate((k) => JSON.parse(localStorage.getItem('eduquiz_goals_v1'))[k], kA);
  check('đổi mục tiêu → ghi { perWeek: 7 } như sảnh cũ', goal && goal.perWeek === 7, goal);

  // Chọn học sinh khác trên máy dùng chung
  await p.select('main select', keyOf(STUDENT_B));
  await p.waitForFunction(() => /Chào Trần Bảo Bình/.test(document.querySelector('main').innerText));
  check('đổi học sinh → số liệu của em đó', (await stat(p, 'Bài đã làm')) === '1');

  await p.setViewport({ width: 375, height: 812 });
  check('375px: không tràn ngang', !(await overflow(p)));

  // Máy chưa có bài nào
  await seed(p, base, { 'ic3v2.previewRole': 'guest' });
  await openApp(p, base, '#/');
  check('máy mới → màn hình trống + Vào luyện tập', /Máy này chưa có bài làm nào/.test(await mainText(p)));
  check('không lỗi JavaScript', p.errors.length === 0, p.errors);
  await p.closeAll();
}
