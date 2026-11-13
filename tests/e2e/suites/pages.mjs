// Mở thẳng các trang cũ quan trọng (học sinh, game, mô phỏng, trang nhân sự khi CHƯA đăng nhập):
// không lỗi JavaScript, không gọi Firestore / Firebase Auth. Trang nhân sự chưa đăng nhập chỉ hiện màn chờ / mời đăng nhập.
import { firebaseHosts } from './_helpers.mjs';

const PAGES = [
  ['index.html', ['EduLearningHub', 'lobbySelectMinitest', 'EduGamification']],
  ['arena.html?vai=minigame', []], ['arena.html?vai=solo', []], ['arena.html?vai=student', []],
  ['mario-flappy.html', []], ['pz-defense.html', []], ['memory-game.html', []], ['battle-quiz.html', []],
  ['cyber-detective.html', []], ['computer-simulator.html', []], ['mos/index.html', []],
  ['login.html', ['EduAuth']],
  ['teacher-dashboard.html', ['EduTeacherData']], ['coordinator-dashboard.html', ['EduCoordinatorData', 'EduQuestionLookup']],
  ['ic3-dashboard.html', []], ['gom-ket-qua.html', []], ['admin-users.html', []],
];

export default async function ({ base, page, check }) {
  for (const [path, globals] of PAGES) {
    const p = await page({ width: 1280, height: 800 });
    await p.goto(base + path, { waitUntil: 'networkidle0', timeout: 45000 }).catch((e) => p.errors.push('load: ' + e.message));
    await new Promise((r) => setTimeout(r, 1200));
    const missing = await p.evaluate((g) => g.filter((k) => typeof window[k] === 'undefined'), globals).catch(() => globals);
    const fb = firebaseHosts(p);
    check(`${path}: mở không lỗi${globals.length ? ', có ' + globals.join(', ') : ''}`, !p.errors.length && !missing.length, { errs: p.errors, missing });
    check(`${path}: không gọi Firestore / Firebase Auth`, fb.length === 0, fb);
    await p.closeAll();
  }
}
