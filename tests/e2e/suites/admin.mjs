// Quản trị 2.0 CHỈ XEM (/app/#/quan-tri): đọc bản đệm admin-users.js trên máy, 0 request Firebase.
// Bản đệm giả ghi bằng CHÍNH js/services/data-cache-service.js, đúng định dạng admin-users.js lưu.
import { firebaseHosts, mainText, openApp, overflow, seed, stat, stubAuth, waitStaff } from './_helpers.mjs';

const ts = (daysAgo) => ({ seconds: Math.floor((Date.now() - daysAgo * 864e5) / 1000), nanoseconds: 0 });
const USERS = [
  { id: 'a1', u: { name: 'Quản trị Một', email: 'admin@example.test', role: 'admin', createdAt: ts(300) } },
  { id: 't1', u: { name: 'GV Đủ', email: 't1@example.test', role: 'teacher', approved: true, schools: ['TH A'], teacherCode: 'NV01', createdAt: ts(200) } },
  { id: 't2', u: { name: 'GV Chưa Lớp', email: 't2@example.test', role: 'teacher', approved: true, schools: ['TH A'], teacherCode: 'NV02', createdAt: ts(100) } },
  { id: 't3', u: { name: 'GV Thiếu Trường', email: 't3@example.test', role: 'teacher', approved: true, schools: ['TH A'], createdAt: ts(50) } },
  { id: 't4', u: { name: 'GV Mới Đăng Ký', email: 't4@example.test', role: 'teacher', approved: false, requestedRole: 'teacher', createdAt: ts(2) } },
  { id: 't5', u: { name: 'Muốn Điều Phối', email: 't5@example.test', role: 'teacher', approved: false, requestedRole: 'coordinator', createdAt: ts(1) } },
  { id: 'c1', u: { name: 'Điều Phối Chưa Trường', email: 'c1@example.test', role: 'coordinator', schools: [], createdAt: ts(20) } },
  { id: 'c2', u: { name: 'QT Trường B', email: 'c2@example.test', role: 'school_admin', schools: ['TH B'], createdAt: ts(80) } },
  { id: 's1', u: { name: 'Một học sinh', email: 's1@example.test', role: 'student', approved: true, createdAt: ts(5) } },
];
const LOOKUPS = {
  allSchools: ['TH A', 'TH B', 'TH C'],
  allClasses: [{ name: '4A1', school: 'TH A', teacherId: 't1' }, { name: '5A1', school: 'TH B', teacherId: 't3' }],
  allTeachingTeachers: [{ id: 'NV01' }, { id: 'NV02' }], byTeacher: {}, rosterLoaded: true,
};
const ADMIN = { uid: 'a1', role: 'admin', name: 'Quản trị Một' };

export default async function ({ base, page, check, shot }) {
  const scenario = async (profile, { cache = true, size } = {}) => {
    const p = await page(size);
    await stubAuth(p, base, profile);
    await seed(p, base, { ic3_theme: 'light' });
    if (cache) {
      await p.addScriptTag({ url: base + 'js/services/data-cache-service.js' });
      await p.evaluate(async (us, lk) => {
        await window.EduDataCache.setAsync('admin-users:delta', { users: us, fullAt: Date.now() - 3600e3, checkedAt: Date.now() - 600e3, wmC: 0, wmU: 0 }, 30 * 864e5, true);
        await window.EduDataCache.setAsync('admin-users:lookups', lk, 12 * 3600e3, true);
      }, USERS, LOOKUPS);
    }
    p.external.clear();
    await openApp(p, base, '#/quan-tri');
    await waitStaff(p);
    return p;
  };

  let p = await scenario(ADMIN, { cache: false });
  check('máy chưa có bản đệm → hướng dẫn mở Quản lý tài khoản', /chưa có bản lưu danh sách tài khoản/.test(await mainText(p)));
  check('không có bản đệm: 0 request Firebase', firebaseHosts(p).length === 0, firebaseHosts(p));
  await p.closeAll();

  p = await scenario(ADMIN);
  await p.waitForFunction(() => /Tài khoản nhân sự/.test(document.querySelector('main').innerText));
  check('8 tài khoản nhân sự (bỏ học sinh)', (await stat(p, 'Tài khoản nhân sự')) === '8');
  check('2 chờ duyệt, 5 cần xử lý (luật admin-users.js)', (await stat(p, 'Chờ duyệt')) === '2' && (await stat(p, 'Cần xử lý')) === '5');
  check('3 trường, 3 tài khoản mới 30 ngày', (await stat(p, 'Trường')) === '3' && (await stat(p, 'Tài khoản mới')) === '3');
  const rows = await p.evaluate(() => [...document.querySelectorAll('main tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ')));
  check('từng việc cần xử lý đúng', rows.some((r) => /GV Chưa Lớp.*Chưa gán lớp/.test(r)) && rows.some((r) => /Điều Phối Chưa Trường.*Chưa gán trường/.test(r))
    && rows.some((r) => /GV Thiếu Trường.*Thiếu trường của lớp đang dạy/.test(r)) && rows.some((r) => /Muốn Điều Phối.*muốn làm Điều phối đào tạo/.test(r)), rows);
  await shot(p, 'admin.png');
  await p.evaluate(() => [...document.querySelectorAll('main button')].find((b) => /^Tất cả/.test(b.textContent.trim())).click());
  await p.type('input[type=search]', 'truong b');
  check('tìm không dấu "truong b" → QT Trường B', (await p.evaluate(() => [...document.querySelectorAll('main tbody tr')].map((t) => t.innerText).join('|'))).includes('QT Trường B'));
  check('có bản đệm: 0 request Firebase, không lỗi', firebaseHosts(p).length === 0 && !p.errors.length, { fb: firebaseHosts(p), errs: p.errors });
  await p.closeAll();

  p = await scenario(ADMIN, { size: { width: 375, height: 812 } });
  check('375px: không tràn ngang', !(await overflow(p)));
  await p.closeAll();

  p = await scenario({ uid: 'c2', role: 'coordinator', schools: ['TH B'] });
  check('điều phối → bị chặn', /không có quyền/.test(await mainText(p)));
  await p.closeAll();
}
