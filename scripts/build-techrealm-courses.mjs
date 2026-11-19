#!/usr/bin/env node
/* scripts/build-techrealm-courses.mjs — sinh data/techrealm/courses.json (Tàng Kinh Các) từ dữ liệu ĐANG CÓ:
     data/ic3/meta.json            → bài học (minitest "Bài N…"), bài kiểm tra ("Kiểm tra…"), ôn tập ("Ôn tập…")
     data/slides-manifest.json     → tài liệu (bài giảng trên Google Drive) theo số bài
   KHÔNG chép câu hỏi: mỗi bài chỉ tham chiếu { ct, cap, bai } — làm bài vẫn ở sảnh cũ (index.html?ct=&cap=&bai=),
   chấm điểm vẫn là js/core/grading.js. Thêm minitest mới vào data/ic3 → chạy lại script là khoá học tự cập nhật.
     node scripts/build-techrealm-courses.mjs          → ghi file
     node scripts/build-techrealm-courses.mjs --check  → CI: file đã khớp nguồn chưa (lệch → exit 1) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'techrealm', 'courses.json');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ic3/meta.json'), 'utf8'));
const slides = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/slides-manifest.json'), 'utf8'));

const fail = (m) => { console.error('✖ ' + m); process.exit(1); };
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const LESSON_RE = /^Bài (\d+)[.:]\s*(.+)$/;
const TIET_RE = /Tiết (\d+)/;

function level(ct, cap) {
  const c = meta.categories.find((x) => x.id === ct);
  const l = c && c.levels.find((x) => x.id === cap);
  if (!l) fail(`Không có ${ct}/${cap} trong meta.json`);
  return l;
}
const lessonId = (ct, cap, n) => `${ct}-${cap}/${n}`.toLowerCase();

function docsFor(ct, cap, n) {
  const c = slides.courses[`${ct}_${cap}`];
  const l = c && c.lessons.find((x) => Number(x.key.replace(/\D/g, '')) === n);
  return l ? l.files.map((f) => ({ title: f.name, kind: f.kind, url: `https://drive.google.com/file/d/${f.id}/view` })) : [];
}

function lessonFrom(ct, cap, bai, count) {
  const m = LESSON_RE.exec(bai);
  const n = Number(m[1]);
  return {
    id: lessonId(ct, cap, n), n, title: m[2].trim(), src: { ct, cap, bai }, questions: count,
    docs: docsFor(ct, cap, n), videos: [], practice: [], requires: [],
  };
}

/** Khoá học từ 1 cấp độ: bài theo thứ tự, mỗi bài cần bài trước; bài kiểm tra mở sau phần bài tương ứng số tiết. */
function fromLevel(def) {
  const l = level(def.ct, def.cap);
  const entries = Object.entries(l.minitests);
  const lessons = entries.filter(([k]) => LESSON_RE.test(k)).map(([k, v]) => lessonFrom(def.ct, def.cap, k, v.count))
    .filter((x) => x.questions > 0 || def.keepEmpty).sort((a, b) => a.n - b.n);
  if (!lessons.length) fail(`${def.id}: không có bài nào`);
  lessons.forEach((x, i) => { x.requires = i ? [lessons[i - 1].id] : []; });
  const tiets = entries.map(([k]) => Number((TIET_RE.exec(k) || [])[1]) || 0);
  const maxTiet = Math.max(45, ...tiets);
  const after = (name) => {
    const t = Number((TIET_RE.exec(name) || [])[1]) || maxTiet;
    const k = Math.max(1, Math.min(lessons.length, Math.round((lessons.length * t) / maxTiet)));
    return lessons[k - 1].id;
  };
  const gates = entries.filter(([k]) => /^Kiểm tra/.test(k)).map(([k, v]) => ({
    id: `${def.ct}-${def.cap}/kt-${slug(k)}`.toLowerCase(), title: k, src: { ct: def.ct, cap: def.cap, bai: k }, questions: v.count, requires: [after(k)],
  }));
  const reviews = entries.filter(([k]) => /^Ôn tập/.test(k)).map(([k, v]) => ({
    id: `${def.ct}-${def.cap}/ot-${slug(k)}`.toLowerCase(), title: k, src: { ct: def.ct, cap: def.cap, bai: k }, questions: v.count,
  }));
  return { ...def.info, id: def.id, source: { ct: def.ct, cap: def.cap }, lessons, gates, reviews };
}

/** Khoá học tuyển chọn từ nhiều cấp độ (theo đúng tên bài trong meta.json). */
function curated(def) {
  const lessons = def.picks.map(([ct, cap, bai]) => {
    const l = level(ct, cap);
    if (!l.minitests[bai]) fail(`${def.id}: không thấy bài "${bai}" ở ${ct}/${cap}`);
    return lessonFrom(ct, cap, bai, l.minitests[bai].count);
  });
  lessons.forEach((x, i) => { x.requires = i ? [lessons[i - 1].id] : []; });
  if (def.practice) lessons[def.practice.at].practice.push(def.practice.item);
  return { ...def.info, id: def.id, source: null, lessons, gates: [], reviews: [] };
}

const info = (name, plain, levelLabel, description) => ({ name, plain, level: levelLabel, description });
const COURSES = [
  ...[1, 2, 3].map((n) => fromLevel({ id: `ic3-${n}`, ct: 'IC3', cap: `LV${n}`, info: info(`Thông Huyền Quyết · Tầng ${n}`, `IC3 Cấp độ ${n}`, `Cấp ${n}`, `Toàn bộ chương trình IC3 GS6 Level ${n}: 35 bài theo sách, bài kiểm tra định kỳ và đề ôn tập.`) })),
  ...[1, 2, 3].map((n) => fromLevel({ id: `spark-${n}`, ct: 'Spark', cap: `LV${n}`, info: info(`Tinh Hỏa Quyết · Tầng ${n}`, `IC3 Spark Cấp ${n}`, `Cấp ${n}`, `Chương trình IC3 Spark (tiểu học) cấp ${n}, theo bài trên lớp.`) })),
  fromLevel({ id: 'mos-word', ct: 'MOS', cap: 'Word', info: info('Văn Tự Kinh', 'MOS Word', 'Chứng chỉ', 'Soạn thảo và định dạng tài liệu theo chuẩn MOS Word.') }),
  fromLevel({ id: 'mos-excel', ct: 'MOS', cap: 'Excel', info: info('Số Toán Kinh', 'MOS Excel', 'Chứng chỉ', 'Bảng tính, công thức, biểu đồ theo chuẩn MOS Excel.') }),
  fromLevel({ id: 'mos-ppt', ct: 'MOS', cap: 'PowerPoint', info: info('Ảnh Hiện Kinh', 'MOS PowerPoint', 'Chứng chỉ', 'Thiết kế và trình chiếu bài thuyết trình theo chuẩn MOS PowerPoint.') }),
  curated({
    id: 'tin-hoc-van-phong', info: info('Bách Nghệ Thủ Pháp', 'Tin học văn phòng căn bản', 'Cơ bản', 'Word và PowerPoint cho việc học hằng ngày, kèm thực hành quản lý tệp trên máy tính mô phỏng.'),
    picks: ['Bài 24. Giới thiệu Microsoft Word', 'Bài 25. Tìm kiếm và thay thế', 'Bài 26. Các thao tác định dạng trong văn bản', 'Bài 27. Làm việc với trang văn bản', 'Bài 28. Sử dụng Style trong văn bản', 'Bài 29. Giới thiệu Microsoft PowerPoint', 'Bài 30. Làm việc với trang chiếu', 'Bài 31. Quản lí các trang chiếu'].map((b) => ['IC3', 'LV1', b]),
    practice: { at: 0, item: { title: 'Thực hành: quản lý tệp trên máy tính mô phỏng', page: 'computer-simulator.html' } },
  }),
  curated({
    id: 'ai-nhap-mon', info: info('Linh Trí Thuật · Nhập môn', 'Trí tuệ nhân tạo nhập môn', 'Cơ bản', 'Máy học là gì, viết prompt, đánh giá công cụ AI và kiểm chứng thông tin AI đưa ra.'),
    picks: [['Spark', 'LV3', 'Bài 3. Máy học'], ['Spark', 'LV3', 'Bài 9. Dữ liệu, thông tin và kiến thức'], ['IC3', 'LV3', 'Bài 4. Tìm kiếm nâng cao với bộ lọc và prompt'], ['IC3', 'LV3', 'Bài 11. Cập nhật kiến thức số và đánh giá công cụ AI mới'], ['IC3', 'LV3', 'Bài 5. Đánh giá thông tin'], ['IC3', 'LV3', 'Bài 6. Kiểm chứng thông tin']],
  }),
  curated({
    id: 'tu-duy-may-tinh', info: info('Thiên Cơ Toán Pháp', 'Tư duy máy tính', 'Cơ bản', 'Logic Boolean, sơ đồ quy trình, dữ liệu và trực quan hoá — nền cho lập trình.'),
    picks: [['IC3', 'LV3', 'Bài 3. Từ khóa và toán tử Boolean trong tìm kiếm'], ['IC3', 'LV3', 'Bài 16. Sơ đồ quy trình (Flowchart)'], ['IC3', 'LV2', 'Bài 5. Lưu trữ và truy cập dữ liệu'], ['Spark', 'LV3', 'Bài 32. Thu thập dữ liệu'], ['IC3', 'LV3', 'Bài 15. Trực quan hóa dữ liệu bằng biểu đồ']],
  }),
  curated({
    id: 'ky-nang-song-so', info: info('Hộ Thân Tâm Pháp', 'Kỹ năng sống trên môi trường số', 'Cơ bản', 'Mật khẩu, bắt nạt trực tuyến, ứng xử, sức khỏe thể chất và tinh thần khi dùng thiết bị số.'),
    picks: [['Spark', 'LV1', 'Bài 10. Mật khẩu và dữ liệu cá nhân'], ['Spark', 'LV1', 'Bài 9. Bắt nạt trực tuyến và ứng xử có trách nhiệm'], ['IC3', 'LV2', 'Bài 11. Quy tắc ứng xử trên môi trường số'], ['Spark', 'LV3', 'Bài 34. Ứng xử với thông tin không phù hợp'], ['IC3', 'LV2', 'Bài 32. Máy tính và sức khỏe thể chất'], ['IC3', 'LV2', 'Bài 33. Máy tính và sức khỏe tinh thần'], ['IC3', 'LV3', 'Bài 35. Tác động của công nghệ số đến môi trường']],
  }),
];

const DOMAINS = [
  ['ic3', 'IC3', 'Chứng chỉ IC3 và IC3 Spark', ['ic3-1', 'ic3-2', 'ic3-3', 'spark-1', 'spark-2', 'spark-3']],
  ['mos', 'MOS', 'Chứng chỉ Microsoft Office Specialist', ['mos-word', 'mos-excel', 'mos-ppt']],
  ['van-phong', 'Tin học văn phòng', 'Word, PowerPoint, quản lý tệp', ['tin-hoc-van-phong']],
  ['scratch', 'Scratch', 'Lập trình kéo thả', []],
  ['python', 'Python', 'Lập trình Python', []],
  ['web', 'Lập trình Web', 'HTML, CSS, JavaScript', []],
  ['cs', 'Computer Science', 'Khoa học máy tính', ['tu-duy-may-tinh']],
  ['ai', 'AI', 'Trí tuệ nhân tạo', ['ai-nhap-mon']],
  ['robotics', 'Robotics', 'Robot và điều khiển', []],
  ['stem', 'STEM', 'Khoa học, công nghệ, kỹ thuật, toán', []],
  ['khtn', 'Khoa học tự nhiên', 'Vật lý, hoá học, sinh học', []],
  ['ky-nang-song', 'Kỹ năng sống', 'Sống an toàn, khỏe mạnh trên môi trường số', ['ky-nang-song-so']],
].map(([id, name, plain, courseIds]) => ({ id, name, plain, courseIds }));

const courses = COURSES.map((c) => ({ ...c, domain: DOMAINS.find((d) => d.courseIds.includes(c.id)).id }));
const ids = new Set();
courses.forEach((c) => c.lessons.concat(c.gates).forEach((x) => { if (ids.has(c.id + '|' + x.id)) fail(`trùng id ${x.id}`); ids.add(c.id + '|' + x.id); }));
DOMAINS.forEach((d) => d.courseIds.forEach((id) => { if (!courses.some((c) => c.id === id)) fail(`miền ${d.id}: thiếu khoá ${id}`); }));

const out = JSON.stringify({ version: meta.version, domains: DOMAINS, courses }) + '\n'; // gọn: file sinh tự động
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (cur !== out) fail('data/techrealm/courses.json chưa khớp data/ic3 — chạy: node scripts/build-techrealm-courses.mjs');
  console.log(`data/techrealm/courses.json khớp nguồn (${courses.length} khoá học).`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  const n = courses.reduce((a, c) => a + c.lessons.length, 0);
  console.log(`Đã ghi ${path.relative(ROOT, OUT)}: ${DOMAINS.length} lĩnh vực, ${courses.length} khoá học, ${n} bài, ${courses.reduce((a, c) => a + c.gates.length, 0)} bài kiểm tra, ${(out.length / 1024).toFixed(0)} KB.`);
}
