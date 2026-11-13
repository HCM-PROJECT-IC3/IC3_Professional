// Cổng điều phối 2.0 (/app/#/dieu-phoi). Dữ liệu giả 2 trường có lớp TRÙNG TÊN; applyFilters, scopeOf,
// EduAnalytics.schoolComparison là code THẬT. Có tình huống lỗi riêng phần kết quả + "Thử lại".
import { mainText, openApp, overflow, seed, seedCache, stat, stubAuth, waitStaff } from './_helpers.mjs';

const DAY = 864e5;
const SCHOOLS = ['TH Hoà Bình', 'TH Thử Nghiệm'];
function fixture(now = Date.now()) {
  const classes = [];
  SCHOOLS.forEach((sc, si) => ['4A1', '4A2', '5A1'].forEach((c, ci) => classes.push({ id: `c${si}${ci}`, name: c, school: sc, courseId: ci < 2 ? 'k4' : 'k5', teacherId: `t${ci}` })));
  const students = [];
  classes.forEach((c, i) => { for (let k = 0; k < 6; k++) students.push({ id: `s${i}-${k}`, name: `HS ${c.name}-${k} ${c.school.slice(3, 6)}`, className: c.name, school: c.school }); });
  const results = [];
  students.forEach((s, i) => {
    if (i % 6 === 5) return; // mỗi lớp 1 em chưa làm
    for (let k = 0; k < 2; k++) results.push({ id: `r${i}-${k}`, studentName: s.name, studentClass: s.className, studentSchool: s.school,
      testName: ['IC3 › L1 › Bài 1', 'IC3 › L1 › Bài 2'][k], score: (s.school === SCHOOLS[0] ? 45 : 70) + ((i * 7) % 30) - k * 4, submittedAtMs: now - ((i + k * 3) % 20) * DAY });
  });
  return { roster: { courses: [{ id: 'k4', name: 'Khối 4' }, { id: 'k5', name: 'Khối 5' }], classes, students, teachers: [{ id: 't0', name: 'GV Một' }, { id: 't1', name: 'GV Hai' }, { id: 't2', name: 'GV Ba' }] }, results };
}
const loader = (failOnce) => {
  const f = fixture();
  return `const C = window.EduCoordinatorData; if (C) { let fail = ${failOnce ? 1 : 0};
    C.loadRoster = async () => { window.__r = (window.__r || 0) + 1; return ${JSON.stringify(f.roster)}; };
    C.loadResults = async () => { window.__s = (window.__s || 0) + 1; if (fail-- > 0) throw new Error('Mạng chập chờn (giả lập)'); return ${JSON.stringify(f.results)}; }; }`;
};
const COORD = { uid: 'u', role: 'coordinator', name: 'Điều phối Thử', schools: SCHOOLS };
// Khoá bản lưu của js/coordinator/data-loader.js: SCOPED_KEYS.dashboard + scopeKeyOf (uid:các trường đã sắp xếp).
const warmKey = (prof) => (prof.role === 'admin' ? 'roster:active:all' : `coordinator:roster:${prof.uid}:${(prof.schools || []).slice().sort().join('|')}`);

export default async function ({ base, page, check, shot }) {
  const scenario = async (profile, { failOnce = false, size, cold = false } = {}) => {
    const p = await page(size);
    await stubAuth(p, base, profile, loader(failOnce));
    await seed(p, base, { ic3_theme: 'light' });
    if (!cold) await seedCache(p, base, [[warmKey(profile), { students: [], courses: [], classes: [], teachers: [], cachedAt: Date.now() }]]);
    await openApp(p, base, '#/dieu-phoi');
    await waitStaff(p);
    return p;
  };

  let p = await scenario(COORD);
  await p.waitForFunction(() => /Tổng quan điều phối/.test(document.querySelector('main').innerText));
  check('điều phối: 36 học sinh, 3 giáo viên, 2 trường', (await stat(p, 'Học sinh')) === '36' && (await stat(p, 'Giáo viên')) === '3' && (await stat(p, 'Trường')) === '2');
  check('điều phối: 6 em chưa làm bài', (await stat(p, 'Chưa làm bài')) === '6');
  check('bảng so sánh 2 trường', (await p.evaluate(() => document.querySelectorAll('main table')[0]?.querySelectorAll('tbody tr').length)) === 2);
  check('lớp trùng tên tách theo trường (6 dòng lớp)', (await p.evaluate(() => document.querySelectorAll('main [role=listitem]').length)) === 6);
  await shot(p, 'coordinator.png');
  await p.select('select[aria-label="Khoá học"]', 'k5');
  await new Promise((r) => setTimeout(r, 200));
  check('lọc Khối 5 → 12 học sinh, 1 giáo viên, KHÔNG tải lại',
    (await stat(p, 'Học sinh')) === '12' && (await stat(p, 'Giáo viên')) === '1' && (await p.evaluate(() => [window.__r, window.__s].join())) === '1,1');
  check('không lỗi JavaScript', p.errors.length === 0, p.errors);
  await p.closeAll();

  p = await scenario(COORD, { failOnce: true });
  await p.waitForFunction(() => /Chưa tải được kết quả bài thi/.test(document.querySelector('main').innerText));
  check('lỗi riêng kết quả: vẫn hiện học sinh, điểm "–"', (await stat(p, 'Học sinh')) === '36' && (await stat(p, 'Điểm TB')) === '–');
  check('lỗi riêng kết quả: ẩn bảng so sánh trường (tránh "Tham gia 0%")', (await p.evaluate(() => document.querySelectorAll('main table').length === 0 || !/So sánh giữa các trường/.test(document.querySelector('main').innerText))));
  await p.evaluate(() => [...document.querySelectorAll('main [role=status] button')].find((b) => /Thử lại/.test(b.textContent)).click());
  await p.waitForFunction(() => !/Chưa tải được kết quả/.test(document.querySelector('main').innerText));
  check('"Thử lại" chỉ đọc lại phần kết quả', (await p.evaluate(() => [window.__r, window.__s].join())) === '1,2' && (await stat(p, 'Điểm TB')) !== '–');
  await p.closeAll();

  p = await scenario({ ...COORD, role: 'school_admin', schools: [SCHOOLS[1]] }, { size: { width: 375, height: 812 } });
  check('quản trị trường vào được; 375px không tràn ngang', /Tổng quan điều phối/.test(await p.evaluate(() => document.querySelector('main').innerText)) && !(await overflow(p)));
  await p.closeAll();

  // Khoá app 2.0 dò bản lưu PHẢI trùng khoá trang cũ ghi — so với EduRosterCache.scopeKeyOf THẬT (lệch → máy đã có
  // bản lưu vẫn bị hỏi lại mỗi lần; không tốn lượt nhưng phiền).
  p = await scenario(COORD);
  const keys = await p.evaluate((prof) => {
    const RC = window.EduRosterCache;
    const scoped = RC.scopeKeyOf(prof);
    return { coordinator: RC.SCOPED_KEYS.dashboard + scoped, teacher: 'teacher:roster:' + scoped };
  }, COORD);
  check('khoá dò bản lưu (điều phối) trùng khoá trang cũ', keys.coordinator === warmKey(COORD), keys);
  check('khoá dò bản lưu (giáo viên) trùng khoá trang cũ', keys.teacher === `teacher:roster:${COORD.uid}:${COORD.schools.slice().sort().join('|')}`, keys);
  await p.closeAll();

  // Máy CHƯA có bản lưu → không tự đọc; bấm mới tải (cả 2 nguồn đúng 1 lần)
  p = await scenario(COORD, { cold: true });
  const t = await mainText(p);
  check('điều phối, máy chưa có bản lưu → không tự tải, báo trước', /Lần đầu mở trên máy này/.test(t) && (await p.evaluate(() => [window.__r || 0, window.__s || 0].join())) === '0,0', t.slice(0, 200));
  await p.evaluate(() => [...document.querySelectorAll('main button')].find((b) => /Tải dữ liệu/.test(b.textContent)).click());
  await p.waitForFunction(() => /Học sinh/.test(document.querySelector('main').innerText) && document.querySelectorAll('main table').length);
  check('bấm "Tải dữ liệu" → tải mỗi nguồn 1 lần', (await p.evaluate(() => [window.__r, window.__s].join())) === '1,1' && (await stat(p, 'Học sinh')) === '36');
  await p.closeAll();

  p = await scenario({ uid: 'u', role: 'teacher', approved: true, schools: SCHOOLS });
  check('giáo viên → bị chặn, không tải dữ liệu', /không có quyền/.test(await p.evaluate(() => document.querySelector('main').innerText)) && (await p.evaluate(() => window.__r || 0)) === 0);
  await p.closeAll();
}
