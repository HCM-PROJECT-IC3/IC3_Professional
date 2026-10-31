// Kiểm tra tiêu chí chấm:
//  1. Tệp đề gốc (chưa làm gì) phải trượt MỌI task tự chấm — task nào "đạt" sẵn là tiêu chí sai.
//  2. Bài mẫu đã làm đúng trong mos/tools/fixtures*/<projectId>.<ext> (nếu có) phải đạt các task đã làm.
//   node mos/tools/test-rubrics.js
const fs = require('fs');
const path = require('path');
const Grader = require('../js/grader.js');

const ROOT = path.join(__dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8'));
const catalog = { subjects: index.subjects.map(s => Object.assign({}, s, {
  sets: s.sets.map(st => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sets', st.id + '.json'), 'utf8'))) })) };
const rubrics = Object.assign({},
  ...['excel', 'powerpoint', 'word'].map(s => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rubrics', s + '.json'), 'utf8'))));
// fixtures/: bài mẫu sinh bằng make-fixtures.js; fixtures-office/: tệp lưu bằng Excel/PowerPoint thật.
const FIXTURE_DIRS = ['fixtures', 'fixtures-office'].map(name => {
  const dir = path.join(__dirname, name);
  const mf = path.join(dir, 'manifest.json');
  return { name, path: dir, done: fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : {} };
});
const toAB = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

(async () => {
  let bad = 0, checked = 0;
  for (const subject of catalog.subjects) for (const set of subject.sets) for (const p of set.projects) {
    const rubric = rubrics[p.id];
    if (!rubric) continue;
    const file = p.files.find(f => f.name === p.main);
    const full = path.join(ROOT, file.path);
    if (!fs.existsSync(full)) { console.log(`bỏ qua ${p.id}: chưa có tệp đề`); continue; }
    const base = toAB(fs.readFileSync(full));
    for (const t of p.tasks) if (rubric[t.no] && !p.tasks.some(x => x.no === t.no)) bad++;
    const unknown = Object.keys(rubric).filter(no => !p.tasks.some(t => String(t.no) === no));
    if (unknown.length) { console.log(`LỖI ${p.id}: tiêu chí cho task không tồn tại ${unknown}`); bad++; }

    const g = await Grader.grade(base, p, rubric, { baseBuffer: base });
    checked += g.auto;
    for (const r of g.results.filter(r => r.status === 'pass')) {
      console.log(`LỖI ${p.id} task ${r.no}: tệp đề gốc đã "đạt" — ${r.note}`); bad++;
    }
    for (const dir of FIXTURE_DIRS) {
      const fx = path.join(dir.path, p.id + path.extname(p.main));
      if (!fs.existsSync(fx)) continue;
      const s = await Grader.grade(toAB(fs.readFileSync(fx)), p, rubric, { baseBuffer: base });
      const only = dir.done[p.id];
      for (const r of s.results.filter(r => r.status === 'fail' && (!only || only.includes(r.no)))) {
        console.log(`LỖI ${p.id} task ${r.no}: bài mẫu (${dir.name}) đúng bị chấm sai — ${r.note}`); bad++;
      }
      const want = only ? only.filter(no => rubric[no]).length : s.auto;
      console.log(`bài mẫu ${dir.name} ${p.id}: ${s.results.filter(r => r.status === 'pass' && (!only || only.includes(r.no))).length}/${want}`);
    }
    if (process.argv.includes('-v')) for (const r of g.results) console.log(`   ${p.id} #${r.no} ${r.status}: ${r.note}`);
  }
  console.log(`${checked} tiêu chí đã chạy trên tệp gốc, ${bad} lỗi.`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
