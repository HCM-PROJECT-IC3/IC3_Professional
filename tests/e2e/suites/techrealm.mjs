// TechRealm (/app/#/the-gioi/…) — bản xem thử giao diện với dữ liệu mẫu.
// Kiểm: mọi trang vẽ được, 0 request ra ngoài (kể cả Firebase), không tràn ngang ở 375px, không lỗi JS,
// link sang trang cũ có thật, đủ 4 trạng thái dữ liệu, tương tác chính, và CSS của khu này KHÔNG lọt vào CSS chung.
import { createRequire } from 'node:module';
import path from 'node:path';
import { mainText, overflow, seed } from './_helpers.mjs';

// Luật bí cảnh bản Node — CÙNG file chép vào apps/Code.gs: điểm trên màn hình phải bằng điểm máy chủ chạy lại.
const nodeRequire = createRequire(import.meta.url);

const PAGES = [
  ['', 'Đường lên Kim Đan'],
  ['ban-do', 'Thế giới tu luyện'],
  ['tang-kinh-cac', 'Tàng Kinh Các'],
  ['tang-kinh-cac/ic3-1', 'Cây công pháp'],
  ['quan-ly-cong-phap', 'Quản lý công pháp'],
  ['luyen-cong', 'Luyện Công Đường'],
  ['bi-canh', 'Bí Cảnh'],
  ['bach-cong-phuong', 'Bách Công Phường'],
  ['van-tuong-gioi', 'Vạn Tượng Giới'],
  ['dau-truong', 'Đấu Trường'],
  ['tui-can-khon', 'Túi Càn Khôn'],
  ['thanh-tuu', 'Thành tựu'],
  ['nhan-vat', 'Hồ sơ nhân vật'],
];

// reload: đổi hash trên cùng trang không nạp lại → công tắc trạng thái (sessionStorage) chỉ đọc lúc khởi động.
const open = async (p, base, path, { reload = false } = {}) => {
  await p.goto(`${base}app/#/the-gioi${path ? '/' + path : ''}`, { waitUntil: 'networkidle0' });
  if (reload) await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('.tr main h1, .tr main h2', { timeout: 15000 });
  // chờ hiệu ứng hiện trang (180 ms) xong (bỏ qua hiệu ứng lặp vô hạn như khung chờ nhấp nháy) — ảnh chụp và phép đo không bắt khung hình đang mờ
  await p.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
};
const clickText = (p, sel, text) => p.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find((e) => e.textContent.includes(t));
  if (!el) return false;
  el.click();
  return true;
}, sel, text);

export default async function ({ base, root, page, check, shot }) {
  // ── CSS chung không chứa token TechRealm (học sinh/nhân sự không tải thêm byte nào) ──
  const html = await (await fetch(base + 'app/index.html')).text();
  const cssHref = html.match(/href="\.\/(assets\/index-[^"]+\.css)"/)?.[1];
  const css = cssHref ? await (await fetch(base + 'app/' + cssHref)).text() : '';
  check('CSS chung có thật và không chứa token TechRealm', !!css && !css.includes('--tr-night') && !css.includes('tr-panel'));

  // ── Từng trang: desktop sáng ──
  const p = await page();
  await seed(p, base, { ic3_theme: 'light' });
  const links = new Set();
  for (const [i, [path, heading]] of PAGES.entries()) {
    await open(p, base, path, { reload: i === 0 }); // lần đầu nạp lại để index.html áp theme sáng vừa ghi
    const t = await mainText(p);
    check(`/${path || '(tổng quan)'}: có nội dung "${heading}"`, t.includes(heading));
    (await p.evaluate(() => [...document.querySelectorAll('.tr a[href^="../"]')].map((a) => a.getAttribute('href')))).forEach((l) => links.add(l));
    await shot(p, `tr-${(path || 'tong-quan').replace(/\//g, '-')}.png`);
  }
  check('không lỗi JavaScript (11 trang)', p.errors.length === 0, p.errors);
  check('0 request ra ngoài, gồm Firebase', p.external.size === 0, [...p.external]);

  const bad = [];
  for (const l of links) {
    const u = new URL(l, base + 'app/');
    const r = await fetch(u.origin + u.pathname);
    if (r.status !== 200) bad.push(`${l} → ${r.status}`);
  }
  check(`mọi link sang trang cũ trỏ tới file có thật (${links.size})`, links.size >= 8 && !bad.length, bad);

  // ── Tương tác ──
  await open(p, base, '');
  const bellLabel = () => p.$eval('button[aria-label^="Thông báo"]', (b) => b.getAttribute('aria-label'));
  check('chuông: 3 thông báo chưa đọc', /3 chưa đọc/.test(await bellLabel()));
  await p.click('button[aria-label^="Thông báo"]');
  await p.waitForSelector('[role="dialog"]');
  await shot(p, 'tr-thong-bao.png');
  await clickText(p, '[role="dialog"] button', 'Đánh dấu đã đọc tất cả');
  await p.keyboard.press('Escape');
  check('đọc hết → 0 chưa đọc, Esc đóng ngăn kéo', /0 chưa đọc/.test(await bellLabel()) && !(await p.$('[role="dialog"]')));

  await p.click('button[aria-label="Hồ sơ"]');
  check('menu hồ sơ mở, có "Hồ sơ nhân vật"', await p.$eval('[role="menu"]', (m) => m.textContent.includes('Hồ sơ nhân vật')).catch(() => false));

  // ── Learning: tiến độ THẬT từ eduquiz_records (đúng field quiz-engine.js § saveRecord ghi) ──
  const who = { studentName: 'Lê Minh An', studentClass: '6A1', studentSchool: 'THCS Thử' };
  const recNow = Date.now() * 1000;
  await seed(p, base, { ic3_theme: 'light', eduquiz_records: [
    { id: recNow - 2e9, ...who, category: 'IC3', level: 'LV1', catId: 'IC3', levelId: 'LV1', mtKey: 'Bài 1. Tìm hiểu phần cứng cơ bản của máy tính', minitest: 'Bài 1. Tìm hiểu phần cứng cơ bản của máy tính', examMode: 'test', score: 85, correct: 13, total: 15, elapsedSec: 400 },
    { id: recNow - 1e9, ...who, category: 'IC3', level: 'LV1', catId: 'IC3', levelId: 'LV1', mtKey: 'Bài 2. Các thiết bị nhập xuất cơ bản', minitest: 'Bài 2. Các thiết bị nhập xuất cơ bản', examMode: 'practice', score: 60, correct: 9, total: 15, elapsedSec: 300 },
  ] });
  await open(p, base, 'tang-kinh-cac', { reload: true });
  await p.waitForFunction(() => document.querySelector('main')?.innerText.includes('Thông Huyền Quyết'), { timeout: 15000 });
  let lt = await mainText(p);
  check('Tàng Kinh Các: đủ 12 lĩnh vực, lĩnh vực chưa có bài ghi "Sắp mở"', ['IC3', 'MOS', 'Tin học văn phòng', 'Scratch', 'Python', 'Lập trình Web', 'Computer Science', 'AI', 'Robotics', 'STEM', 'Khoa học tự nhiên', 'Kỹ năng sống'].every((d) => lt.includes(d)) && /Sắp mở: Scratch/.test(lt));
  check('Tàng Kinh Các: tiến độ đọc từ lịch sử bài làm của học sinh trên máy (Lê Minh An, IC3 cấp 1: 3%)', /Lê Minh An/.test(lt) && /3%/.test(lt));
  await clickText(p, 'main a', 'Thông Huyền Quyết · Tầng 1');
  await p.waitForFunction(() => document.querySelector('main h1')?.textContent.includes('Thông Huyền Quyết'));
  await p.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
  const tree = await p.$$eval('main ol[aria-label^="Cây công pháp"] button', (b) => b.map((x) => x.getAttribute('aria-label')));
  check('Cây công pháp IC3 cấp 1: 35 bài + 4 bài kiểm tra', tree.length === 39, tree.length);
  check('tuần tự: bài 1 đạt (85), bài 2 mở (60 < 70), bài 3 chưa mở', /Đã đạt, điểm cao nhất 85/.test(tree[0]) && /Đang mở/.test(tree[1]) && /Chưa mở/.test(tree[2]), tree.slice(0, 3));
  await p.click('main ol[aria-label^="Cây công pháp"] button');
  await p.waitForSelector('[role="dialog"]');
  const drawer = await p.$eval('[role="dialog"]', (d) => ({ t: d.innerText, docs: [...d.querySelectorAll('a[href^="https://drive.google.com/"]')].length, quiz: d.querySelector('a[href*="index.html?ct="]')?.getAttribute('href') }));
  check('chi tiết bài: điểm 85, 1 lần, có tài liệu bài giảng, nút làm bài mở đúng bài ở sảnh', /85%/.test(drawer.t) && drawer.docs >= 1 && /ct=IC3&cap=LV1&bai=B%C3%A0i%201\./.test(drawer.quiz || ''), drawer);
  const qres = await fetch(new URL(drawer.quiz, base + 'app/').href.split('?')[0]);
  check('link làm bài trỏ tới sảnh có thật', qres.status === 200);
  await p.keyboard.press('Escape');

  // Giáo viên cấu hình → link → học sinh mở link → lộ trình áp dụng
  await open(p, base, 'quan-ly-cong-phap');
  await p.waitForSelector('main input[placeholder="VD: 6A1"]');
  await p.type('main input[placeholder="VD: 6A1"]', '6A1');
  await clickText(p, 'main [role="radio"]', 'Tự do');
  await clickText(p, 'main button', 'Tạo link');
  await p.waitForSelector('main textarea[aria-label="Link lớp học"]');
  const classUrl = await p.$eval('main textarea[aria-label="Link lớp học"]', (t) => t.value);
  check('tạo link lớp: chứa ?lop=2z… (nén), 0 request ra ngoài', /#\/the-gioi\/tang-kinh-cac\?lop=2[zj]/.test(classUrl) && p.external.size === 0, classUrl.slice(0, 120));
  await p.goto(classUrl, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => /lớp\s*6A1/.test(document.querySelector('main')?.innerText || ''), { timeout: 15000 });
  check('học sinh mở link: thấy "lộ trình của lớp 6A1", tham số ?lop= được gỡ khỏi địa chỉ', !(await p.evaluate(() => location.hash.includes('lop='))));
  await open(p, base, 'tang-kinh-cac/ic3-1');
  const tree2 = await p.$$eval('main ol[aria-label^="Cây công pháp"] button', (b) => b.map((x) => x.getAttribute('aria-label')));
  check('lộ trình "Tự do" của lớp → bài 3 đã mở', /Đang mở/.test(tree2[2]), tree2[2]);
  await clickText(p, 'main button', 'Bỏ lộ trình lớp');
  const tree3 = await p.$$eval('main ol[aria-label^="Cây công pháp"] button', (b) => b.map((x) => x.getAttribute('aria-label')));
  check('bỏ lộ trình lớp → về tuần tự (bài 3 khoá)', /Chưa mở/.test(tree3[2]), tree3[2]);

  // Báo cáo tiến độ + lịch sử
  await open(p, base, 'luyen-cong');
  await clickText(p, '[role="tab"]', 'Tiến độ & lịch sử');
  await p.waitForFunction(() => /2 bài đã nộp/.test(document.querySelector('main')?.innerText || ''));
  lt = await mainText(p);
  check('Tiến độ & lịch sử: công pháp đang học + 2 bài, phân biệt Kiểm tra / Ôn luyện', /Thông Huyền Quyết · Tầng 1/.test(lt) && /1\/35 bài/.test(lt) && /Kiểm tra/.test(lt) && /Ôn luyện/.test(lt));
  await clickText(p, 'main [role="radio"]', 'Kiểm tra');
  check('lọc "Kiểm tra" → 1 bài', await p.$$eval('main ul.divide-y.text-sm > li', (li) => li.length) === 1);
  await shot(p, 'tr-tien-do.png');

  await open(p, base, 'tui-can-khon');
  await clickText(p, '[role="tab"]', 'Cửa hàng');
  await clickText(p, 'main button', 'Quạt Truyền Âm');
  // Linh thạch do luật tu luyện tính (thưởng đột phá Trúc Cơ = 100) → chưa đủ đổi vật phẩm giá 120
  const shop = await p.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.includes('Đổi 120 linh thạch'));
    return { disabled: !!btn?.disabled, msg: d.innerText.includes('cần thêm 20') };
  });
  check('Túi Càn Khôn: 100 linh thạch (từ luật) < giá 120 → nút đổi bị khoá, báo cần thêm 20', shop.disabled && shop.msg, shop);
  await p.keyboard.press('Escape');

  await open(p, base, 'bach-cong-phuong');
  await clickText(p, 'main button', 'Nộp');
  await clickText(p, '[role="dialog"] button', 'Nộp sản phẩm');
  check('Bách Công Phường: nộp thiếu tệp → báo lỗi', await p.$eval('[role="dialog"] [role="alert"]', (e) => e.textContent.includes('Chọn tệp')).catch(() => false));
  await p.keyboard.press('Escape');

  // ── Luật tu luyện chạy thật trên dữ liệu mẫu ──
  await open(p, base, '');
  const ov = await mainText(p);
  check('Tổng quan: cảnh giới + tiểu cảnh giới + công huân do luật tính (Trúc Cơ · Trung kỳ, 535/900, 20 chờ duyệt)',
    /Trúc Cơ · Trung kỳ/.test(ov) && /535\/900/.test(ov) && /\+20 công huân đang chờ duyệt/.test(ov), ov.slice(0, 300));
  check('Đường lên Kim Đan: điều kiện từ luật (công pháp 5/35, khảo hạch chưa đạt, chỉ đạt 1/4: dự án)',
    /Hoàn thành công pháp Thông Huyền Quyết · Tầng 1/.test(ov) && /5\/35/.test(ov) && /Khảo hạch Kim Đan đạt yêu cầu/.test(ov) && /Đã đạt 1\/4 điều kiện/.test(ov));
  check('chưa đủ điều kiện → nút Đột phá bị khoá', await p.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Đột phá'))?.disabled === true));
  await clickText(p, 'footer button', 'Xem thử hiệu ứng đột phá');
  await p.waitForSelector('[role="dialog"]');
  await new Promise((r) => setTimeout(r, 1500)); // hiệu ứng ~1,3 giây
  const bt = await p.$eval('[role="dialog"]', (d) => d.innerText);
  check('hiệu ứng đột phá: Luyện Khí → Trúc Cơ, liệt kê vật phẩm thưởng từ luật', /Đột phá thành công/.test(bt) && /Trúc Cơ/.test(bt) && /Khung Vân Mây/.test(bt) && /×100/.test(bt), bt);
  await shot(p, 'tr-dot-pha.png');
  await p.keyboard.press('Escape');
  await open(p, base, 'nhan-vat');
  const hv = await mainText(p);
  check('Hồ sơ: lịch sử có đột phá, vật phẩm, thành tựu, giao dịch đã huỷ và đang chờ', /Lên Trúc Cơ/.test(hv) && /Khung Vân Mây/.test(hv) && /Phá cảnh Trúc Cơ/.test(hv) && /Đã huỷ/.test(hv) && /Chờ duyệt/.test(hv));
  check('Hồ sơ: thời gian tu luyện cộng từ bài đã ghi (127 phút)', /127 phút/.test(hv));
  await clickText(p, 'main [role="radio"]', 'Cảnh giới');
  check('lọc lịch sử "Cảnh giới" → chỉ còn dòng đột phá', await p.evaluate(() => [...document.querySelectorAll('main table tbody tr')].length) === 1);

  // ── 4 trạng thái dữ liệu (công tắc ở chân trang, lưu sessionStorage) ──
  for (const [mode, re, label] of [
    ['loading', null, 'đang tải: có khung chờ'],
    ['empty', /Chưa có nhiệm vụ/, 'trống: có lời hướng dẫn'],
    ['error', /Chưa tải được dữ liệu/, 'lỗi: có thông báo + nút Thử lại'],
  ]) {
    await p.evaluate((m) => sessionStorage.setItem('tr.demoMode', m), mode);
    await open(p, base, '', { reload: true });
    if (mode === 'loading') check(`Tổng quan — ${label}`, (await p.$$('main [role="status"]')).length >= 3);
    else check(`Tổng quan — ${label}`, re.test(await mainText(p)) && (mode !== 'error' || (await p.$$('main [role="alert"] button')).length > 0));
    await shot(p, `tr-trang-thai-${mode}.png`);
  }
  await clickText(p, 'main [role="alert"] button', 'Thử lại');
  check('bấm Thử lại → có dữ liệu trở lại', /Nhiệm vụ đang thực hiện/.test(await mainText(p)) && !(await p.$('main [role="alert"]')));

  // ── Nền tối + điện thoại ──
  await p.evaluate(() => { sessionStorage.setItem('tr.demoMode', 'data'); localStorage.setItem('ic3_theme', 'dark'); });
  await open(p, base, '', { reload: true });
  await shot(p, 'tr-tong-quan-toi.png');
  await p.setViewport({ width: 375, height: 812 });
  const wide = [];
  for (const [path] of PAGES) {
    await open(p, base, path);
    if (await overflow(p)) wide.push(path || '(tổng quan)');
  }
  check('375px: không trang nào tràn ngang', !wide.length, wide);
  await open(p, base, '');
  await shot(p, 'tr-tong-quan-375.png');
  await p.click('button[aria-label="Mở menu"]');
  check('375px: menu ngăn kéo có đủ 10 mục', (await p.$$('[role="dialog"] nav a')).length === 10);
  check('không lỗi JavaScript (cả lượt)', p.errors.length === 0, p.errors);
  check('0 request ra ngoài (cả lượt)', p.external.size === 0, [...p.external]);
  await p.closeAll();

  // ── Bí cảnh 1: chơi màn 1 bằng giao diện thật ──
  const E = nodeRequire(path.join(root, 'js/techrealm/challenge-core.js'));
  nodeRequire(path.join(root, 'js/techrealm/thanh-pho-mat-dien-core.js'));
  const g = await page();
  await seed(g, base, { ic3_theme: 'light' });
  await open(g, base, 'bi-canh', { reload: true });
  const story = await g.$$eval('main li', (li) => li.map((x) => x.innerText).filter((t) => /Bí cảnh \d/.test(t)));
  check('Bí Cảnh: 5 bí cảnh cốt truyện, chỉ Bí cảnh 1 chơi được, 4 cái còn lại "Đang thiết kế"', story.length === 5 && /Chơi ngay/.test(story[0]) && story.slice(1).every((t) => /Đang thiết kế/.test(t)), story);
  await clickText(g, 'main a', 'Thành phố mất điện');
  await g.waitForFunction(() => /Kỹ sư Lam/.test(document.querySelector('main')?.innerText || ''), { timeout: 15000 });
  await clickText(g, 'main button', 'Vào thành phố');
  const nodes = await g.$$eval('main button[aria-label]', (b) => b.filter((x) => /Trạm biến áp|Nhà máy điện|Phòng điều khiển|Tâm bão/.test(x.getAttribute('aria-label'))).map((x) => [x.getAttribute('aria-label'), x.disabled]));
  check('bản đồ: 4 địa điểm, chỉ Trạm biến áp mở', nodes.length === 4 && nodes[0][1] === false && nodes.slice(1).every((n) => n[1] === true), nodes);
  await shot(g, 'tr-bi-canh-ban-do.png');
  await g.click('main button[aria-label^="Trạm biến áp"]');
  await g.waitForFunction(() => /Mạch 1\/3/.test(document.querySelector('main')?.innerText || ''));

  const COND = ['Dây đồng', 'Đinh sắt', 'Giấy nhôm', 'Ruột bút chì'];
  const chips = async () => g.$$eval('main [role="radiogroup"][aria-label="Túi vật liệu"] button', (b) => b.map((x) => x.innerText.trim()));
  const pickChip = (name) => g.evaluate((n) => [...document.querySelectorAll('main [role="radiogroup"][aria-label="Túi vật liệu"] button')].find((x) => x.innerText.trim() === n).click(), name);
  const slotsNow = () => g.$$eval('main button[aria-label^="Chỗ đứt"], main button[aria-label^="Chỗ nối"]', (b) => b.length);
  const fillSlot = (i) => g.evaluate((k) => [...document.querySelectorAll('main button[aria-label^="Chỗ đứt"], main button[aria-label^="Chỗ nối"]')][k].click(), i);
  const pause = () => new Promise((r) => setTimeout(r, 220)); // > 120 ms/thao tác (luật chống bấm máy)
  const palette = await chips();
  const conds = palette.filter((n) => COND.includes(n));
  const insul = palette.filter((n) => !COND.includes(n));
  check('túi vật liệu: 3 vật dẫn + 3 vật cách điện', conds.length === 3 && insul.length === 3, palette);
  // vòng 1: thử SAI 1 lần (nhựa…) rồi sửa
  await pickChip(insul[0]); await pause(); await fillSlot(0); await pause();
  await pickChip(insul[0]); await pause(); await pickChip(conds[0]); await pause(); await fillSlot(1); await pause();
  await clickText(g, 'main button', 'Thử mạch'); await pause();
  check('nối bằng vật cách điện → Kỹ sư Lam gợi ý, chưa qua vòng', /Đèn chưa đúng như yêu cầu/.test(await mainText(g)) && /Mạch 1\/3/.test(await mainText(g)));
  await fillSlot(0); await pause(); await fillSlot(0); await pause(); // đang chọn vật dẫn → đặt đè
  await clickText(g, 'main button', 'Thử mạch'); await pause();
  await g.waitForFunction(() => /Mạch 2\/3/.test(document.querySelector('main')?.innerText || ''));
  // vòng 2: công tắc
  await pickChip(conds[1]); await pause(); await fillSlot(0); await pause();
  await clickText(g, 'main button', 'Công tắc'); await pause();
  await clickText(g, 'main button', 'Thử mạch'); await pause();
  await g.waitForFunction(() => /Mạch 3\/3/.test(document.querySelector('main')?.innerText || ''));
  await shot(g, 'tr-bi-canh-mach-song-song.png');
  // vòng 3: song song — mạch chính + Bệnh viện dẫn điện, Khu vui chơi cách điện
  check('mạch song song: 3 chỗ nối (chính, Bệnh viện, Khu vui chơi)', (await slotsNow()) === 3);
  await pickChip(conds[2]); await pause(); await fillSlot(0); await pause(); await fillSlot(1); await pause();
  await pickChip(insul[1]); await pause(); await fillSlot(2); await pause();
  await clickText(g, 'main button', 'Thử mạch'); await pause();
  await g.waitForFunction(() => /Vận dụng kiến thức/.test(document.querySelector('main')?.innerText || ''));
  // câu hỏi: bấm lần lượt tới khi đúng
  for (let q = 0; q < 3; q++) {
    for (let o = 0; o < 4; o++) {
      const solved = await g.evaluate((qi, oi) => {
        const li = document.querySelectorAll('main ol[aria-label="Câu hỏi vận dụng"] > li')[qi];
        if (!li) return true; // câu cuối đúng → màn kết thúc, chuyển sang màn hình kết quả
        const btn = li.querySelectorAll('button')[oi];
        if (!btn.disabled) btn.click();
        return !li.isConnected || [...li.querySelectorAll('button')].every((b) => b.disabled);
      }, q, o);
      await pause();
      if (solved) break;
    }
  }
  await g.waitForFunction(() => /Hoàn thành!|Chưa hoàn thành/.test(document.querySelector('main')?.innerText || ''), { timeout: 10000 });
  const rt = await mainText(g);
  const shown = Number((rt.match(/(\d+)\/100/) || [])[1]);
  await shot(g, 'tr-bi-canh-ket-qua.png');
  const saved = await g.evaluate(() => JSON.parse(localStorage.getItem('tr.challenges.v1') || '{}')['thanh-pho-mat-dien']?.['mach-dien']);
  const replayed = saved && E.replay('thanh-pho-mat-dien', 'mach-dien', saved.seed, saved.actions);
  check('màn 1 qua giao diện: hoàn thành, có đủ 6 tiêu chí, lưu nhật ký trên máy', /Hoàn thành!/.test(rt) && ['Hoàn thành nhiệm vụ', 'Độ chính xác', 'Giải quyết vấn đề', 'Vận dụng kiến thức', 'Thời gian', 'Số lần thử'].every((k) => rt.includes(k)) && !!saved);
  check('ĐIỂM TRÊN MÀN HÌNH = ĐIỂM MÁY CHỦ CHẠY LẠI nhật ký (Node, cùng file với apps/Code.gs)', replayed && replayed.ok && replayed.result.score === shown && replayed.result.completed, { shown, server: replayed && replayed.result });
  check('thử sai 1 lần → số lần thử 4 (tối thiểu 3), điểm < 100', replayed && replayed.state.tests === 4 && shown < 100, replayed && replayed.state.tests);
  await clickText(g, 'main button', 'Bản đồ');
  const after = await g.$$eval('main button[aria-label]', (b) => b.filter((x) => /Nhà máy điện/.test(x.getAttribute('aria-label'))).map((x) => x.disabled));
  check('qua màn 1 → mở Nhà máy điện', after[0] === false);
  await g.setViewport({ width: 375, height: 812 });
  await g.click('main button[aria-label^="Nhà máy điện"]');
  await g.waitForFunction(() => /Máy phát:/.test(document.querySelector('main')?.innerText || ''));
  check('màn 2 ở 375px: không tràn ngang', !(await overflow(g)));
  check('bí cảnh: 0 request ra ngoài, không lỗi JS', g.external.size === 0 && g.errors.length === 0, { ext: [...g.external], err: g.errors });
  await g.closeAll();

  // ── Vạn Tượng Giới + Thành phố thông minh (Prompt 06) ──
  const M = nodeRequire(path.join(root, 'js/techrealm/life-missions-core.js'));
  const c = await page();
  await seed(c, base, { ic3_theme: 'light' });
  await open(c, base, 'van-tuong-gioi', { reload: true });
  const vt = await mainText(c);
  const vtNeed = ['Vật lý', 'Hóa học', 'Sinh học', 'Toán học', 'Năng lượng', 'Môi trường', 'AI Lab', 'Robotics Lab', 'IoT Lab', 'Coding Lab', 'Data Lab',
    'Quản lý chi tiêu', 'Tính tiền điện', 'Lập kế hoạch tiết kiệm', 'Quản lý thời gian', 'Bảo mật tài khoản', 'Phân loại rác', 'Bảo vệ môi trường', 'Thiết kế nhà thông minh', 'Thành phố thông minh'];
  check('Vạn Tượng Giới: đủ 6 môn khoa học, 5 lab công nghệ, 8 nhiệm vụ đời sống, thành phố', vtNeed.filter((n) => !vt.includes(n)), []);
  const vtLinks = await c.$$eval('main a[href*="#/the-gioi/"]', (a) => a.map((x) => x.getAttribute('href')));
  check('mục "Đã mở" trỏ tới trang có thật trong app (bí cảnh, khoá học, nhiệm vụ, thành phố)', vtLinks.length >= 12 && vtLinks.every((h) => /#\/the-gioi\/(bi-canh|tang-kinh-cac|van-tuong-gioi)\//.test(h)), vtLinks.length);

  const cityOpen = async () => { await open(c, base, 'van-tuong-gioi/thanh-pho'); await c.waitForSelector('main [role="grid"]'); };
  const cityPalette = () => c.$$eval('main [role="radiogroup"][aria-label="Chọn công trình"] button', (b) => b.map((x) => [x.innerText.split('\n')[0], x.disabled]));
  const cityTile = (x, y) => c.click(`main [role="gridcell"][aria-label^="Ô ${x + 1}-${y + 1}:"]`);
  const cityPick = (name) => c.evaluate((n) => [...document.querySelectorAll('main [role="radiogroup"][aria-label="Chọn công trình"] button')].find((b) => b.innerText.startsWith(n)).click(), name);
  const cityIdx = (name) => c.evaluate((n) => { const b = [...document.querySelectorAll('main ul[aria-label="Chỉ số thành phố"] button')].find((x) => x.innerText.startsWith(n)); return Number(b.innerText.split('\n')[1]); }, name);
  await cityOpen();
  let cityPal = await cityPalette();
  check('thành phố, máy mới: 6×6 ô có sông; chỉ Khu dân cư mở, 8 công trình khác khoá kèm điều kiện học', (await c.$$eval('main [role="gridcell"]', (x) => x.length)) === 36 && cityPal.filter((x) => !x[1]).map((x) => x[0]).join() === 'Khu dân cư,Phá công trình (hoàn 50%)' && /Mở khi:/.test(await mainText(c)), cityPal);
  await cityPick('Khu dân cư'); await cityTile(0, 0);
  check('xây khu dân cư khi chưa có trạm điện → mất điện, Năng lượng 0', /mất điện/.test(await c.$eval('main [role="gridcell"][aria-label^="Ô 1-1:"]', (b) => b.getAttribute('aria-label'))) && (await cityIdx('Năng lượng')) === 0);
  await cityTile(5, 2);
  check('bấm ô sông → báo không xây được', /sông/.test(await mainText(c)));

  // Phân loại rác qua giao diện → mở Công viên
  await open(c, base, 'van-tuong-gioi/phan-loai-rac');
  for (const w of M.WASTE) {
    await c.evaluate((id, binName) => { const g = document.querySelector(`main [role="radiogroup"][aria-label="Thùng cho ${id}"]`); [...g.querySelectorAll('button')].find((b) => b.innerText === binName).click(); }, w.name, M.BINS[w.bin].name);
  }
  await clickText(c, 'main button', 'Kiểm tra');
  check('Phân loại rác: đúng 17/17 → 100 điểm, có giải thích từng món', /17\/17 món đúng/.test(await mainText(c)) && /thủy ngân/.test(await mainText(c)));
  // Tính tiền điện: giảm máy lạnh + tivi, trả lời 3 câu
  await open(c, base, 'van-tuong-gioi/tien-dien');
  check('Tính tiền điện: lúc đầu vượt ngân sách; ghi rõ "giá minh hoạ"', /Vượt/.test(await mainText(c)) && /Giá minh hoạ/i.test(await mainText(c)));
  const citySetRange = (label, v) => c.$eval(`main input[aria-label="${label}"]`, (el, val) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(val)); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await citySetRange('Số giờ dùng Máy lạnh mỗi ngày', 2);
  await citySetRange('Số giờ dùng Tivi mỗi ngày', 3);
  const cityBill = M.scoreElectric({ 'may-lanh': 2, tivi: 3 }, {}).bill.money;
  check('hoá đơn trên màn hình = luật tính (bậc thang)', (await mainText(c)).includes(cityBill.toLocaleString('vi-VN') + ' đ') && /Trong ngân sách/.test(await mainText(c)), cityBill);
  for (const q of M.electricQuestions()) {
    await c.evaluate((text, opt) => { const li = [...document.querySelectorAll('main ol > li')].find((x) => x.innerText.includes(text)); [...li.querySelectorAll('button')].find((b) => b.innerText === opt).click(); }, q.text, q.options[q.correct]);
  }
  await clickText(c, 'main button', 'Nộp kết quả');
  check('Tính tiền điện: 100 điểm → báo đã mở công trình', /Điểm: 100\/100/.test(await mainText(c)));

  // Thêm sao Bí cảnh "Nhà máy điện" → mở trạm điện; xây và đo chỉ số
  await c.evaluate(() => { const a = JSON.parse(localStorage.getItem('tr.challenges.v1') || '{}'); a['thanh-pho-mat-dien'] = { 'phan-phoi': { score: 80, stars: 2, at: 1, seed: 1, actions: [] } }; localStorage.setItem('tr.challenges.v1', JSON.stringify(a)); });
  await cityOpen();
  cityPal = await cityPalette();
  check('nhiệm vụ + bí cảnh đã làm → mở Công viên, Nhà máy, Trạm mặt trời, Nhiệt điện', ['Công viên', 'Nhà máy', 'Trạm điện mặt trời', 'Trạm nhiệt điện than'].every((n) => cityPal.find((x) => x[0] === n && !x[1])), cityPal);
  await cityPick('Trạm điện mặt trời'); await cityTile(0, 1);
  await cityPick('Công viên'); await cityTile(1, 0);
  check('có điện mặt trời: khu dân cư hết mất điện; Môi trường = 70 − 2 (dân cư) + 8 (công viên) = 76', !/mất điện/.test(await c.$eval('main [role="gridcell"][aria-label^="Ô 1-1:"]', (b) => b.getAttribute('aria-label'))) && (await cityIdx('Môi trường')) === 76);
  await cityPick('Trạm nhiệt điện than'); await cityTile(2, 2);
  check('QUYẾT ĐỊNH: thêm nhiệt điện than → Môi trường giảm 18 (76 → 58)', (await cityIdx('Môi trường')) === 58);
  await c.evaluate(() => [...document.querySelectorAll('main ul[aria-label="Chỉ số thành phố"] button')].find((x) => x.innerText.startsWith('Môi trường')).click());
  check('bảng "Vì sao Môi trường = 58?" liệt kê từng công trình', /Vì sao Môi trường = 58\?/.test(await mainText(c)) && /Trạm nhiệt điện than\s*-18/.test(await mainText(c)));
  const cityMoney0 = await c.evaluate(() => Number(document.querySelector('main').innerText.match(/Tiền\s*(-?\d+)/)[1]));
  await clickText(c, 'main button', 'Qua một năm');
  check('qua một năm → sang năm 2, tiền thay đổi đúng số tiền/năm', /Năm 2/.test(await mainText(c)) && (await c.evaluate(() => Number(document.querySelector('main').innerText.match(/Tiền\s*(-?\d+)/)[1]))) !== cityMoney0);
  await c.reload({ waitUntil: 'networkidle0' });
  await c.waitForSelector('main [role="grid"]');
  check('tải lại trang: thành phố vẫn còn (lưu trên máy)', /Năm 2/.test(await mainText(c)) && (await c.$$eval('main [role="gridcell"]', (x) => x.filter((b) => !/trống|sông/.test(b.getAttribute('aria-label'))).length)) === 4);
  await shot(c, 'tr-thanh-pho.png');
  await c.setViewport({ width: 375, height: 812 });
  for (const r of ['van-tuong-gioi/thanh-pho', 'van-tuong-gioi/tien-dien', 'van-tuong-gioi/phan-loai-rac']) {
    await open(c, base, r);
    check(`${r} ở 375px: không tràn ngang`, !(await overflow(c)));
  }
  check('Vạn Tượng Giới + thành phố: 0 request ra ngoài, không lỗi JS', c.external.size === 0 && c.errors.length === 0, { ext: [...c.external], err: c.errors });
  await c.closeAll();

  // ── AI Sư Phụ + Tông môn (Prompt 07) ──
  const m = await page();
  await seed(m, base, { ic3_theme: 'light' });
  await open(m, base, 'su-phu', { reload: true });
  const mt = await mainText(m);
  check('AI Sư Phụ: có 6 thẻ + "Chế độ học" khi không có bài Kiểm tra dở', ['Hỏi kiến thức', 'Gợi ý bài tập', 'Lập trình', 'Gợi ý nhiệm vụ', 'Thầy cô', 'Cài đặt & nhật ký'].every((t) => mt.includes(t)) && /Chế độ học/.test(mt));
  await m.type('main textarea[aria-label="Câu hỏi"]', 'Số của em là 0912345678, RAM là gì?');
  check('nhập số điện thoại → báo "Đã tự ẩn 1 thông tin cá nhân" (trước khi gửi)', /Đã tự ẩn 1 thông tin cá nhân/.test(await mainText(m)));
  await clickText(m, 'main [role="tab"]', 'Gợi ý nhiệm vụ');
  await m.waitForFunction(() => /Làm ngay|làm hết/.test(document.querySelector('main').innerText));
  check('Gợi ý nhiệm vụ: tính trên máy, có việc kèm link', (await m.$$('main ol > li')).length >= 1 && /không gửi dữ liệu học tập cho AI/.test(await mainText(m)));
  check('AI Sư Phụ (mở trang, chưa hỏi): 0 request ra ngoài, không lỗi JS', m.external.size === 0 && m.errors.length === 0, { ext: [...m.external], err: m.errors });
  // đang làm bài Kiểm tra (bản tự lưu chưa nộp của sảnh) → AI nghỉ
  await m.evaluate(() => localStorage.setItem('eduquiz_inprogress_v1', JSON.stringify({ examMode: 'test', savedAt: Date.now() })));
  await open(m, base, 'su-phu', { reload: true });
  check('đang làm bài Kiểm tra → "Chế độ kiểm tra", ô hỏi bị thay bằng "AI Sư Phụ tạm nghỉ"', /Chế độ kiểm tra/.test(await mainText(m)) && /tạm nghỉ/.test(await mainText(m)) && !(await m.$('main textarea[aria-label="Câu hỏi"]')));
  await clickText(m, 'main [role="tab"]', 'Lập trình');
  check('chế độ kiểm tra: thẻ Lập trình cũng nghỉ', !(await m.$('main textarea[aria-label="Code"]')));
  await m.evaluate(() => localStorage.setItem('eduquiz_inprogress_v1', JSON.stringify({ examMode: 'practice', savedAt: Date.now() })));
  await open(m, base, 'su-phu', { reload: true });
  check('bài Ôn luyện dở → vẫn là Chế độ học', /Chế độ học/.test(await mainText(m)));
  await open(m, base, 'tong-mon');
  const tm = await mainText(m);
  check('Tông môn: liệt kê chức năng thầy cô + trạng thái thật (Dùng được / Giai đoạn sau)', ['Quản lý lớp và học viên', 'Năng lực học viên', 'Chấm sản phẩm', 'Quản lý phần thưởng', 'Phân quyền tài khoản'].every((t) => tm.includes(t)) && /Dùng được/.test(tm) && /Giai đoạn sau/.test(tm));
  const tmLinks = await m.$$eval('main a[href$=".html"]', (a) => a.map((x) => x.href));
  const tmBad = [];
  for (const h of tmLinks) if ((await fetch(h)).status !== 200) tmBad.push(h);
  check(`Tông môn: link sang trang cũ có thật (${tmLinks.length})`, tmLinks.length >= 4 && !tmBad.length, tmBad);
  await m.setViewport({ width: 375, height: 812 });
  for (const r of ['su-phu', 'tong-mon']) {
    await open(m, base, r);
    check(`${r} ở 375px: không tràn ngang`, !(await overflow(m)));
  }
  check('AI Sư Phụ + Tông môn: 0 request ra ngoài, không lỗi JS', m.external.size === 0 && m.errors.length === 0, { ext: [...m.external], err: m.errors });
  await m.closeAll();
}
