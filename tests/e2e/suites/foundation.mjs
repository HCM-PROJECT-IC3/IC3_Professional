// Nền móng app 2.0: Domain cũ nạp đúng, không nạp Firebase ở trang học sinh, 404, theme dùng chung, không tràn ngang.
import { mainText, openApp, overflow, seed } from './_helpers.mjs';

export default async function ({ base, page, check, shot }) {
  const p = await page();
  await seed(p, base, { 'ic3v2.previewRole': 'guest', ic3_theme: 'light' });
  await openApp(p, base, '#/ui');
  const t = await mainText(p);
  check('rbac.js: 6 vai trò', /6 vai trò/.test(t), t.slice(0, 200));
  check('grading.js: chấm câu mẫu giống bản cũ', /Chấm câu mẫu giống bản cũ/.test(t));
  check('Firebase chưa nạp ở trang học sinh', /Chưa nạp — 0 lượt/.test(t) && !(await p.evaluate(() => 'firebase' in window)));
  check('không request ra ngoài', p.external.size === 0, [...p.external]);
  await shot(p, 'ui.png');

  await openApp(p, base, '#/khong-co-trang-nay');
  check('route lạ → trang 404 thân thiện', /Không tìm thấy trang/.test(await mainText(p)));

  await seed(p, base, { 'ic3v2.previewRole': 'guest', ic3_theme: 'dark' });
  await openApp(p, base, '#/');
  check('theme dùng chung khoá ic3_theme (tối)', await p.evaluate(() => document.documentElement.classList.contains('dark')));

  await p.setViewport({ width: 375, height: 812 });
  await openApp(p, base, '#/ui');
  check('375px: không tràn ngang', !(await overflow(p)));
  check('không lỗi JavaScript', p.errors.length === 0, p.errors);
  await p.closeAll();
}
