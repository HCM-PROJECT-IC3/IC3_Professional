// Máy tính bảng + màn hình lớn (Prompt 08 §3). Các bộ khác đã đo 1280–1366 px và 375 px; bộ này đo thêm
// 768×1024 (tablet dọc), 1024×768 (tablet ngang), 1920×1080 cho MỌI trang .html ở gốc + mọi route app/TechRealm:
// không tràn ngang, không lỗi JavaScript, không console.error, không gọi Firestore / Firebase Auth.
import fs from 'node:fs';
import { firebaseHosts, gotoSettled } from './_helpers.mjs';

const VIEWPORTS = [[768, 1024, 'tablet dọc'], [1024, 768, 'tablet ngang'], [1920, 1080, 'màn hình lớn']];
const APP = ['', 'lo-trinh', 'so-tay', 'tro-choi', 'thanh-tich', 'giao-vien',
  'the-gioi', 'the-gioi/ban-do', 'the-gioi/tang-kinh-cac', 'the-gioi/tang-kinh-cac/ic3-1', 'the-gioi/quan-ly-cong-phap', 'the-gioi/luyen-cong',
  'the-gioi/bi-canh', 'the-gioi/bi-canh/thanh-pho-mat-dien', 'the-gioi/bach-cong-phuong', 'the-gioi/van-tuong-gioi', 'the-gioi/van-tuong-gioi/thanh-pho',
  'the-gioi/van-tuong-gioi/tien-dien', 'the-gioi/dau-truong', 'the-gioi/tui-can-khon', 'the-gioi/thanh-tuu', 'the-gioi/nhan-vat', 'the-gioi/su-phu', 'the-gioi/tong-mon'];
// Console.error KHÔNG phải lỗi của trang: Chrome báo khi tài nguyên ngoài (phông Google) bị chặn trong môi trường kiểm thử.
const NOISE = /Failed to load resource|ERR_|net::/;

export default async function ({ base, root, page, check }) {
  const html = fs.readdirSync(root).filter((f) => f.endsWith('.html')).sort();
  for (const [w, h, label] of VIEWPORTS) {
    const p = await page({ width: w, height: h });
    const cerr = [];
    // chỉ tính lỗi phát từ mã cùng nguồn (khung nhúng của bên thứ ba như Office Online tự ghi cảnh báo CSP của nó)
    p.on('console', (m) => { const at = m.location()?.url || ''; if (m.type() === 'error' && !NOISE.test(m.text()) && (!at || at.startsWith(base)) && !/report-only Content Security Policy/.test(m.text())) cerr.push(p.url().slice(base.length) + ': ' + m.text().slice(0, 160)); });
    const wide = [];
    const urls = [...html, ...APP.map((r) => 'app/#/' + r)];
    for (const u of urls) {
      await gotoSettled(p, base + u).catch((e) => p.errors.push(u + ' load: ' + e.message));
      if (u.startsWith('app/')) await p.reload({ waitUntil: 'networkidle0' }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      const sw = await p.evaluate(() => (document.documentElement.scrollWidth > innerWidth + 1 ? document.documentElement.scrollWidth : 0)).catch(() => -1);
      if (sw) wide.push(`${u} (${sw}px)`);
    }
    check(`${label} ${w}×${h}: ${urls.length} trang không tràn ngang`, !wide.length, wide);
    check(`${label}: không lỗi JavaScript`, !p.errors.length, p.errors.slice(0, 5));
    check(`${label}: không console.error`, !cerr.length, cerr.slice(0, 5));
    check(`${label}: không gọi Firestore / Firebase Auth`, firebaseHosts(p).length === 0, firebaseHosts(p));
    await p.closeAll();
  }
}
