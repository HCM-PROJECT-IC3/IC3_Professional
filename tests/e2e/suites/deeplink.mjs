// Link mở thẳng 1 bài ở sảnh: index.html?ct=&cap=&bai= (quiz-engine.js § _selectMinitestFromUrl)
// + bấm "Làm bài" ở Lộ trình 2.0 → sảnh chọn đúng bài.
import { seed } from './_helpers.mjs';

export default async function ({ base, page, check, json }) {
  const meta = await json('data/ic3/meta.json');
  const lv1 = meta.categories.find((c) => c.id === 'Spark').levels.find((l) => l.id === 'LV1');
  const bai = Object.keys(lv1.minitests).filter((n) => /^Bài \d+[.:]/.test(n)).find((n) => /\(/.test(n)); // tên có ngoặc
  const ic3 = meta.categories.find((c) => c.id === 'IC3').levels.find((l) => l.id === 'LV2');
  const topic = Object.keys(ic3.minitests).find((n) => /^\d+\.\s/.test(n));
  const q = (ct, cap, name, extra = '') => `?ct=${encodeURIComponent(ct)}&cap=${encodeURIComponent(cap)}&bai=${encodeURIComponent(name)}${extra}`;

  async function open(qs, act) {
    const p = await page();
    await p.goto(base + 'index.html' + qs, { waitUntil: 'networkidle0' });
    await p.waitForFunction(() => document.getElementById('minitestSelect')?.options.length > 0, { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 400));
    if (act) await act(p);
    const st = await p.evaluate(() => ({
      cat: document.getElementById('categorySelect').value, lvl: document.getElementById('levelSelect').value,
      mt: document.getElementById('minitestSelect').value, search: location.search,
      inExam: getComputedStyle(document.getElementById('lobby')).display === 'none',
    }));
    st.errs = p.errors;
    await p.closeAll();
    return st;
  }

  const plain = await open('');
  check('index.html thường: sảnh chạy, không lỗi', !plain.errs.length && !plain.inExam, plain);
  const a = await open(q('Spark', 'LV1', bai));
  check('chọn đúng bài (tên có ngoặc)', a.cat === 'Spark' && a.lvl === 'LV1' && a.mt === bai, a);
  check('xoá tham số khỏi URL', a.search === '', a.search);
  check('không tự bắt đầu thi, không lỗi', !a.inExam && !a.errs.length, a);
  const t = await open(q('IC3', 'LV2', topic));
  check('chọn đúng bài dạng chủ đề (IC3 LV2)', t.cat === 'IC3' && t.lvl === 'LV2' && t.mt === topic, t);
  const bad = await open(q('Spark', 'LV1', 'Bài 999. Không có'));
  check('bài không có → sảnh bình thường', !bad.errs.length && !bad.inExam && bad.search === '', bad);
  const bad2 = await open(q('XYZ', 'LV9', bai));
  check('chương trình/cấp không có → không lỗi', !bad2.errs.length && !bad2.inExam, bad2);
  const keep = await open(q('Spark', 'LV1', bai, '&x=1'));
  check('giữ tham số khác', keep.search === '?x=1', keep.search);
  const same = await open(q('Spark', 'LV1', bai), async (p) => {
    await p.evaluate(() => {
      const c = document.getElementById('studentClass');
      const o = document.createElement('option'); o.value = '3A1'; o.textContent = '3A1';
      c.appendChild(o); c.disabled = false; c.value = '3A1';
      c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 300));
  });
  check('chọn lớp 3A1 (cùng Spark LV1) → giữ nguyên bài', same.mt === bai && same.lvl === 'LV1', same);

  // Link đề giáo viên (?de=) được ưu tiên
  const man = await json('data/ic3/minitests-manifest.json');
  const [mtName, mtPath] = Object.entries(man.Spark__LV2)[0];
  const firstQ = (await json('data/ic3/' + mtPath)).find((x) => x && x.uid);
  const ep = await page();
  await ep.goto(base + 'index.html', { waitUntil: 'networkidle0' });
  await ep.waitForFunction(() => window.EduCustomExam);
  const code = await ep.evaluate((mt, uid) => window.EduCustomExam.encode({ title: 'Đề thử', cat: 'Spark', level: 'LV2', items: [{ mt, uid }] }), mtName, firstQ.uid);
  await ep.closeAll();
  const de = await open(`?de=${encodeURIComponent(code)}${q('Spark', 'LV1', bai).replace('?', '&')}`);
  check('có ?de= → đề giáo viên thắng, bỏ tham số bài', de.cat === 'Spark' && de.lvl === 'LV2' && /^\?de=/.test(de.search) && !/bai=/.test(de.search) && !de.errs.length,
    { ...de, search: de.search.slice(0, 30) });

  // Bấm từ Lộ trình 2.0
  const p = await page();
  await seed(p, base, {
    'ic3v2.previewRole': 'guest', 'ic3v2.pathLevel': 'Spark|LV1',
    eduquiz_records: [{ id: (Date.now() - 864e5) * 1000, studentName: 'An', studentClass: '3A1', studentSchool: 'TH', catId: 'Spark', levelId: 'LV1',
      mtKey: 'Bài 1. Phần cứng và thiết bị nhập, xuất, kết nối', minitest: 'Bài 1. Phần cứng và thiết bị nhập, xuất, kết nối', score: 95 }],
  });
  const lobby = async () => {
    await p.waitForFunction(() => document.getElementById('minitestSelect')?.options.length > 0, { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 400));
    return p.evaluate(() => document.getElementById('minitestSelect').value);
  };
  await p.goto(base + 'app/#/lo-trinh', { waitUntil: 'networkidle0' });
  await p.waitForSelector('main li a[href*="ct="]');
  const nextName = await p.evaluate(() => [...document.querySelectorAll('main p')].find((e) => e.textContent === 'Nên làm tiếp')?.nextElementSibling?.textContent);
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.evaluate(() => [...document.querySelectorAll('main a')].find((x) => x.textContent.includes('Làm bài này')).click())]);
  check('Lộ trình → "Làm bài này" → sảnh chọn đúng bài nên làm tiếp', (await lobby()) === nextName, nextName);
  await p.goto(base + 'app/#/lo-trinh', { waitUntil: 'networkidle0' });
  await p.waitForSelector('main li a[href*="ct="]');
  const rows = 'main li:has(a[href*="ct="])';
  const rowName = await p.evaluate((r) => document.querySelectorAll(r)[4].querySelector('p').textContent, rows);
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.evaluate((r) => document.querySelectorAll(r)[4].querySelector('a').click(), rows)]);
  check('Lộ trình → "Làm bài" dòng 5 → sảnh chọn đúng bài đó', (await lobby()) === rowName, rowName);
  check('không lỗi JavaScript', p.errors.length === 0, p.errors);
  await p.closeAll();
}
