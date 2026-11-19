/* Unit test báo cáo năng lực (js/techrealm/analytics-core.js) với courses.json + meta.json THẬT.
   Chạy: node js/techrealm/__tests__/analytics-core.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
require(path.join(__dirname, '..', 'learning-core.js'));
const A = require(path.join(__dirname, '..', 'analytics-core.js'));

let fails = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  got ' + JSON.stringify(actual).slice(0, 300) + ' want ' + JSON.stringify(expected).slice(0, 300)));
}
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/techrealm/courses.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ic3/meta.json'), 'utf8'));
const ic3 = meta.categories.find((c) => c.id === 'IC3');
const lv1 = ic3.levels.find((l) => l.id === 'LV1');
const course = catalog.courses.find((c) => c.id === 'ic3-1');
// testName đúng cách result-submitter.js dựng: [category, level, minitest].join(' › ') với TÊN hiển thị
const TN = (mt) => [ic3.name, lv1.name, mt].join(' › ');
const NOW = Date.parse('2026-11-17T03:00:00Z');
const day = 864e5;
const R = (name, cls, mt, score, daysAgo) => ({ studentName: name, studentClass: cls, studentSchool: 'THCS Thử', testName: TN(mt), score, submittedAtMs: NOW - daysAgo * day });
const L = (n) => course.lessons[n - 1].src.bai;

// ── 1. Nối testName → bài học ──
const idx = A.metaIndex(meta);
eq('testName (tên hiển thị) → id chương trình / cấp / bài', A.parseTestName(TN(L(3)), idx), { catId: 'IC3', levelId: 'LV1', mtKey: L(3) });
eq('MỌI minitest trong meta nối lại được từ testName hiển thị', (() => {
  const bad = [];
  meta.categories.forEach((c) => c.levels.forEach((l) => Object.keys(l.minitests).forEach((mt) => {
    const p = A.parseTestName([c.name, l.name, mt].join(' › '), idx);
    if (!p || p.catId !== c.id || p.levelId !== l.id || p.mtKey !== mt) bad.push(c.id + '/' + l.id + '/' + mt);
  })));
  return bad.slice(0, 5);
})(), []);
eq('đề tự soạn / bài lạ → null (không đoán)', [A.parseTestName('Đề tự soạn ›  › Ôn tập cuối tuần', idx), A.parseTestName('Lạ', idx)], [null, null]);

// ── 2. Hồ sơ năng lực từng học sinh ──
const results = [
  R('Lê An', '6A1', L(1), 90, 2), R('Lê An', '6A1', L(2), 60, 2), R('Lê An', '6A1', L(2), 80, 1), R('Lê An', '6A1', L(4), 85, 1), // bỏ bài 3 → lỗ hổng
  R('Lê An', '6A1', course.gates[0].src.bai, 55, 1), R('Lê An', '6A1', '7. An toàn và bảo mật', 80, 3), R('Lê An', '6A1', '1. Căn bản về công nghệ', 70, 3),
  R('Trần Bình', '6A1', L(1), 40, 30), R('Trần Bình', '6A1', L(1), 45, 20),
  R('Phạm Chi', '6A1', L(1), 95, 1), R('Phạm Chi', '6A1', L(2), 50, 1), R('Phạm Chi', '6A1', L(3), 75, 1),
];
const students = [{ name: 'Lê An', className: '6A1' }, { name: 'Trần Bình', className: '6A1' }, { name: 'Phạm Chi', className: '6A1' }, { name: 'Võ Dung', className: '6A1' }];
const rep = A.classReport({ results, students, catalog, meta, now: NOW });
const an = rep.students.find((s) => s.name === 'Lê An');
const ic3An = an.courses.find((c) => c.id === 'ic3-1');
eq('Lê An: 3/35 bài đạt (bài 2 lấy điểm cao nhất 80)', [ic3An.lessonsDone, ic3An.lessons], [3, 35]);
eq('Lê An: lỗ hổng = bài 3 (đã làm bài 4 nhưng bỏ bài 3)', ic3An.gaps.map((g) => g.id), ['ic3-lv1/3']);
eq('Lê An: kết quả kiểm tra giữa HK1 = 55, chưa đạt', ic3An.tests.map((t) => [t.best, t.passed]), [[55, false]]);
eq('Lê An: năng lực theo chủ đề IC3 → linh căn (Hỏa 80, Kim 70)', [an.elements.hoa, an.elements.kim], [80, 70]);
eq('Lê An: năng lực theo lĩnh vực (IC3)', typeof an.domainPct.ic3, 'number');
eq('Lê An: lịch sử mới nhất trước, cần chú ý vì kiểm tra chưa đạt', [an.history[0].at >= an.history[an.history.length - 1].at, an.risk], [true, ['1 bài kiểm tra chưa đạt']]);
const binh = rep.students.find((s) => s.name === 'Trần Bình');
eq('Trần Bình: điểm TB thấp + 20 ngày chưa làm → cần chú ý (2 lý do)', binh.risk, ['Điểm trung bình dưới 50', '20 ngày chưa làm bài']);
const dung = rep.students.find((s) => s.name === 'Võ Dung');
eq('Võ Dung (trong danh sách lớp, chưa nộp) → vẫn có trong báo cáo, "Chưa nộp bài nào"', [dung.attempts, dung.risk], [0, ['Chưa nộp bài nào']]);

// ── 3. Báo cáo lớp ──
eq('tóm tắt lớp: 4 học sinh, 3 đã nộp, 2 hoạt động 7 ngày qua, 3 cần chú ý', [rep.summary.students, rep.summary.withResults, rep.summary.active7, rep.summary.atRisk], [4, 3, 2, 3]);
eq('bài khó nhất lớp (≥ 3 học sinh làm): bài 1 TB (90+45+95)/3', rep.hardest.map((h) => [h.id, h.avg, h.below]), [['ic3-lv1/1', 77, 1]]);
eq('báo cáo theo khoá: IC3 cấp 1 có 3 học sinh', rep.courses.map((c) => [c.id, c.students]), [['ic3-1', 3]]);
eq('linh căn cả lớp: Hỏa có 1 học sinh', rep.elements.find((e) => e.element === 'hoa'), { element: 'hoa', students: 1, avg: 80 });
const csv = A.toCsv(rep);
eq('CSV có BOM, 1 dòng tiêu đề + 4 học sinh, ghi lý do cần chú ý', [csv.charCodeAt(0), csv.split('\r\n').length, /Chưa nộp bài nào/.test(csv)], [0xfeff, 5, true]);

console.log(fails ? `\n✗ ${fails} kiểm tra lỗi` : '\n✓ analytics-core: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
