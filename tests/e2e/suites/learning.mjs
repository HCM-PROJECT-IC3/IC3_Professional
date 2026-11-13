// Lộ trình học (/app/#/lo-trinh) khớp EduLearningHub.seasonInfo(); Sổ tay câu sai (/app/#/so-tay):
// chữ thuần, HTML độc KHÔNG chạy (cả app lẫn trang cũ), "Ôn ngay" mở đúng Sổ tay của em ở trang cũ.
import { mainText, openApp, overflow, seed } from './_helpers.mjs';

const DAY = 864e5;
const A = ['Nguyễn Minh An', '4A1', 'TH Thử Nghiệm'];
const key = A.map((x) => x.toLowerCase()).join('|');
const LABEL = { 'Chưa làm': 'new', Yếu: 'bad', 'Cần ôn': 'warn', Đạt: 'good', Vững: 'great' };

export default async function ({ base, page, check, json, shot }) {
  const now = Date.now();
  const meta = (await json('data/ic3/meta.json')).categories;
  const spark = meta.find((c) => c.id === 'Spark');
  const lv1 = spark.levels.find((l) => l.id === 'LV1');
  const names = Object.keys(lv1.minitests).filter((n) => /^Bài \d+[.:]/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  const recs = [];
  const add = (i, mt, score, d, old = false) => recs.push(Object.assign({ id: (now - d * DAY) * 1000 + i, studentName: A[0], studentClass: A[1], studentSchool: A[2],
    category: spark.name, level: lv1.name, minitest: mt, score, examMode: 'practice' }, old ? {} : { catId: 'Spark', levelId: 'LV1', mtKey: mt }));
  add(1, names[0], 40, 6); add(2, names[0], 55, 5); // Yếu
  add(3, names[1], 75, 4, true); // Đạt — bản ghi KIỂU CŨ chỉ có tên (resolveIds)
  add(4, names[2], 92, 3); add(5, names[2], 96, 2); // Vững
  recs.sort((a, b) => b.id - a.id);
  const items = {
    'u:a': { q: { question: '<p>Thiết bị nào là <b>thiết bị nhập</b>?</p><img src=x onerror="alert(1)">' }, box: 1, due: now - 1000, wrong: 2, src: 'Spark LV1 › ' + names[0], topic: names[0] },
    'u:b': { q: { question: 'Mật khẩu mạnh cần có gì?' }, box: 2, due: now + DAY, wrong: 1, src: 'Spark LV1 › ' + names[1], topic: names[1] },
    'u:c': { q: { question: 'Phím tắt sao chép là gì?' }, box: 3, due: now - 5000, wrong: 1, src: 'Spark LV1 › ' + names[1], topic: names[1] },
    'u:d': { q: { type: 'hotspot' }, box: 4, due: now + 6 * DAY, wrong: 1, src: 'Spark LV1 › ' + names[2], topic: names[2] },
  };
  const p = await page();
  await seed(p, base, {
    eduquiz_records: recs,
    eduquiz_wrongbook_v1: { [key]: { name: A[0], cls: A[1], school: A[2], mastered: 7, updated: now, items } },
    'ic3v2.previewRole': 'guest', 'ic3v2.pathLevel': 'Spark|LV1', ic3_theme: 'light',
  });

  await p.goto(base + 'index.html', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.quizRepository && window.EduLearningHub, { timeout: 15000 });
  const legacy = await p.evaluate((a) => {
    const s = window.EduLearningHub.seasonInfo(a[0], a[1], a[2], 'Spark', 'LV1');
    return { passed: s.path.passed, next: s.path.next?.name, steps: s.path.steps.map((x) => `${x.name}=${x.state}`) };
  }, A);

  await openApp(p, base, '#/lo-trinh');
  await p.waitForSelector('main li a[href*="ct="]');
  const app = await p.evaluate((label) => ({
    next: [...document.querySelectorAll('main p')].find((e) => e.textContent === 'Nên làm tiếp')?.nextElementSibling?.textContent,
    steps: [...document.querySelectorAll('main li:has(a[href*="ct="])')].map((li) =>
      `${li.querySelector('p').textContent}=${label[[...li.querySelectorAll('span')].map((e) => e.textContent.trim()).find((t) => t in label)]}`),
  }), LABEL);
  check('lộ trình: trạng thái từng bài khớp bản cũ (kể cả bản ghi kiểu cũ)', JSON.stringify(app.steps) === JSON.stringify(legacy.steps),
    { legacy: legacy.steps.slice(0, 4), app: app.steps.slice(0, 4) });
  check('lộ trình: "Nên làm tiếp" khớp bản cũ', app.next === legacy.next, { legacy: legacy.next, app: app.next });
  await shot(p, 'path.png');

  await openApp(p, base, '#/so-tay');
  await p.waitForSelector('main ul li');
  const book = await p.evaluate(() => ({
    first: document.querySelector('main ul li')?.innerText,
    injected: !!document.querySelector('main img[src="x"]'),
    href: [...document.querySelectorAll('main a')].find((a) => a.textContent.includes('Ôn ngay'))?.getAttribute('href'),
  }));
  check('sổ tay: 2 câu đến hạn', /2 câu đến hạn ôn hôm nay/.test(await mainText(p)));
  check('sổ tay: câu hỏi hiện chữ thuần, không chèn HTML', /Thiết bị nào là thiết bị nhập\?/.test(book.first) && !book.injected, book);
  check('sổ tay: không lặp tên bài ở dòng phụ', !new RegExp(`${names[0]}.*·.*${names[0]}`).test(book.first), book.first);
  await shot(p, 'wrongbook.png');
  await p.setViewport({ width: 375, height: 812 });
  check('sổ tay 375px: không tràn ngang', !(await overflow(p)));
  await openApp(p, base, '#/lo-trinh');
  check('lộ trình 375px: không tràn ngang', !(await overflow(p)));
  await p.setViewport({ width: 1366, height: 900 });

  await p.goto(new URL(book.href, base + 'app/').href, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => document.getElementById('lhStudent'), { timeout: 15000 });
  check('"Ôn ngay" → trang cũ mở Sổ tay đúng em', (await p.evaluate(() => document.getElementById('lhStudent').value)) === key);
  check('HTML độc trong câu hỏi KHÔNG chạy (trang cũ + app)', p.dialogs.length === 0, p.dialogs);
  check('không lỗi JavaScript', p.errors.length === 0, p.errors);
  await p.closeAll();
}
