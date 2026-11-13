// Cổng giáo viên 2.0 (/app/#/giao-vien). Dữ liệu giả thay EduTeacherData.loadAll; applyFilters, ExamHistory,
// EduAnalytics… là code THẬT. Trường hợp "chưa đăng nhập" chạy Firebase SDK THẬT (không phiên → 0 lượt đọc).
import { firebaseHosts, mainText, openApp, overflow, seed, seedCache, stat, stubAuth, waitStaff } from './_helpers.mjs';

const DAY = 864e5;
function fixture(now = Date.now()) {
  const classes = ['4A1', '4A2', '5A1'];
  const names = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Khoa', 'Lan', 'Minh', 'Ngọc', 'Phúc', 'Quân'];
  const students = names.map((n, i) => ({ id: 's' + i, name: 'Học sinh ' + n, className: classes[i % 3], school: 'TH Thử Nghiệm' }));
  const tests = ['IC3 Spark › Level 1 › Bài 1', 'IC3 Spark › Level 1 › Bài 2', 'IC3 Spark › Level 1 › Tổng hợp'];
  const results = [];
  students.slice(0, 10).forEach((s, i) => {
    for (let k = 0; k < 3; k++) results.push({ id: `r${i}-${k}`, studentName: s.name, studentClass: s.className, studentSchool: s.school,
      testName: tests[(i + k) % 3], score: [35, 48, 55, 62, 71, 78, 84, 90, 96, 58][i] + k * 3, submittedAtMs: now - ((i * 2 + k * 5) * DAY) / 3 });
  });
  return { schools: ['TH Thử Nghiệm'], students, results, noSchoolsAssigned: false };
}
const loader = (data) => `if (window.EduTeacherData) window.EduTeacherData.loadAll = async (prof) => { window.__loads = (window.__loads || 0) + 1;
  return (prof.schools || []).length ? ${JSON.stringify(data)} : { schools: [], students: [], results: [], noSchoolsAssigned: true }; };`;
const TEACHER = { uid: 'u1', role: 'teacher', approved: true, name: 'Cô Thử Nghiệm', schools: ['TH Thử Nghiệm'] };
// Khoá bản lưu danh sách học sinh mà js/teacher/data-loader.js dùng (uid:các trường đã sắp xếp; Admin: toàn bộ).
const warmKey = (prof) => (prof.role === 'admin' ? 'roster:active:all' : `teacher:roster:${prof.uid}:${(prof.schools || []).slice().sort().join('|')}`);

export default async function ({ base, page, check, shot }) {
  // Firebase thật, chưa đăng nhập
  let p = await page();
  await seed(p, base, { 'ic3v2.previewRole': 'teacher' });
  p.external.clear();
  await openApp(p, base, '#/giao-vien');
  await waitStaff(p);
  const href = await p.evaluate(() => document.querySelector('main a[href*="login.html"]')?.getAttribute('href'));
  check('chưa đăng nhập → mời đăng nhập, quay lại đúng trang', href === '../login.html?next=app%2F%23%2Fgiao-vien', href);
  check('chưa đăng nhập: SDK thật nạp, 0 request Firestore/Auth', firebaseHosts(p).length === 0 && !p.errors.length, { fb: firebaseHosts(p), errs: p.errors });
  await p.closeAll();

  // Mặc định máy ĐÃ có bản lưu (đã từng mở) → tự tải. cold: máy chưa có bản lưu → phải hỏi trước, không tự đọc.
  const scenario = async (profile, opts = {}) => {
    const q = await page(opts.size);
    await stubAuth(q, base, profile, loader(fixture()));
    await seed(q, base, { ic3_theme: opts.theme || 'light' });
    if (!opts.cold && profile) await seedCache(q, base, [[warmKey(profile), { students: [], cachedAt: Date.now() }]]);
    await openApp(q, base, '#/giao-vien');
    await waitStaff(q);
    return q;
  };

  p = await scenario(TEACHER);
  await p.waitForFunction(() => /Tổng quan lớp học/.test(document.querySelector('main').innerText));
  check('giáo viên: vào được, tải dữ liệu 1 lần', (await p.evaluate(() => window.__loads)) === 1);
  check('giáo viên: Học sinh = 12', (await stat(p, 'Học sinh')) === '12');
  check('header hiện người đăng nhập + nút Đăng xuất', await p.evaluate(() => !document.querySelector('header select')));
  await shot(p, 'teacher.png');
  await p.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Tất cả').click());
  await p.select('select[aria-label="Lớp"]', '4A1');
  await new Promise((r) => setTimeout(r, 200));
  check('lọc lớp 4A1 → 4 học sinh, KHÔNG tải lại', (await stat(p, 'Học sinh')) === '4' && (await p.evaluate(() => window.__loads)) === 1);
  check('không lỗi JavaScript', p.errors.length === 0, p.errors);
  await p.closeAll();

  p = await scenario(TEACHER, { size: { width: 375, height: 812 }, theme: 'dark' });
  check('375px + tối: không tràn ngang', !(await overflow(p)));
  await p.closeAll();

  // Máy CHƯA có bản lưu (lần đầu / địa chỉ mới): KHÔNG tự đọc Firebase — hỏi trước, chỉ tải khi bấm.
  p = await scenario(TEACHER, { cold: true });
  let t = await mainText(p);
  check('máy chưa có bản lưu → không tự tải (0 lần gọi loadAll)', (await p.evaluate(() => window.__loads || 0)) === 0, t.slice(0, 160));
  check('máy chưa có bản lưu → báo trước số lượt đọc ước tính', /Lần đầu mở trên máy này/.test(t) && /lượt đọc/.test(t), t.slice(0, 200));
  await p.evaluate(() => [...document.querySelectorAll('main button')].find((b) => /Tải dữ liệu/.test(b.textContent)).click());
  await p.waitForFunction(() => /Tổng quan lớp học/.test(document.querySelector('main').innerText) && document.querySelectorAll('main table').length);
  check('bấm "Tải dữ liệu" → tải đúng 1 lần, hiện dashboard', (await p.evaluate(() => window.__loads)) === 1 && (await stat(p, 'Học sinh')) === '12');
  await p.closeAll();

  p = await scenario({ uid: 'a1', role: 'admin', name: 'Quản trị' }, { cold: true });
  t = await mainText(p);
  await shot(p, 'teacher-cold-admin.png');
  check('Quản trị viên, máy chưa có bản lưu → cảnh báo đọc TOÀN BỘ học sinh, 0 lần tải', /toàn bộ học sinh/.test(t) && (await p.evaluate(() => window.__loads || 0)) === 0, t.slice(0, 200));
  await p.closeAll();

  // Tự đăng xuất khi không thao tác (features/auth/idle.ts — cùng luật js/idle-logout.js).
  // Tua đồng hồ bằng Date.now giả (không chờ thật 15 phút). Máy dùng chung: edu_idle_remember = '0' → 15 phút.
  p = await page();
  await p.evaluateOnNewDocument(() => {
    const real = Date.now.bind(Date);
    window.__clock = 0;
    Date.now = () => real() + window.__clock;
  });
  await stubAuth(p, base, TEACHER, loader(fixture()));
  await seed(p, base, { edu_idle_remember: '0' });
  await seedCache(p, base, [[warmKey(TEACHER), { students: [], cachedAt: Date.now() }]]);
  await openApp(p, base, '#/giao-vien');
  await waitStaff(p);
  await p.waitForFunction(() => /Tổng quan lớp học/.test(document.querySelector('main').innerText));
  await p.evaluate(() => { window.__clock = 14.5 * 60e3; });
  await p.waitForFunction(() => /tự đăng xuất sau/.test(document.body.innerText), { timeout: 12000 }).catch(() => {});
  const warn = await p.evaluate(() => document.querySelector('[role=alertdialog]')?.innerText || '');
  check('không thao tác 14,5 phút → cảnh báo đếm ngược', /Bạn không thao tác 15 phút/.test(warn) && /\d+s/.test(warn), warn);
  await p.evaluate(() => [...document.querySelectorAll('[role=alertdialog] button')].find((b) => /Tiếp tục/.test(b.textContent)).click());
  await new Promise((r) => setTimeout(r, 300));
  check('"Tiếp tục làm việc" → tắt cảnh báo', !(await p.evaluate(() => !!document.querySelector('[role=alertdialog]'))));
  await p.evaluate(() => { window.__clock += 16 * 60e3; });
  await p.waitForFunction(() => /login\.html/.test(location.href), { timeout: 15000 }).catch(() => {});
  const url = p.url();
  check('quá 15 phút → đăng xuất, về login.html?reason=idle&next=đúng trang',
    /login\.html\?reason=idle&min=15&next=app%2F%23%2Fgiao-vien/.test(url), url);
  await p.closeAll();

  for (const [label, prof, re] of [
    ['sai vai trò (điều phối) → bị chặn', { uid: 'u2', role: 'coordinator' }, /không có quyền/],
    ['giáo viên chờ duyệt → bị chặn', { uid: 'u3', role: 'teacher', approved: false }, /chờ quản trị viên duyệt/],
    ['giáo viên chưa gán trường → hướng dẫn, không lỗi', { uid: 'u4', role: 'teacher', approved: true, schools: [] }, /chưa được gán trường/],
  ]) {
    p = await scenario(prof);
    const t = await p.evaluate(() => document.querySelector('main').innerText);
    const loads = await p.evaluate(() => window.__loads || 0);
    check(label, re.test(t) && (label.includes('chặn') ? loads === 0 : true) && !p.errors.length, { t: t.slice(0, 120), loads, errs: p.errors });
    await p.closeAll();
  }
}
