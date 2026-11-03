/* Test câu trả lời "dạng câu gốc" (js/quiz-engine.js § wireAnswerOf) — điều kiện để máy chủ chấm lại.
   Chạy THẬT prepareQuestions của quiz-engine (xáo phương án/mệnh đề/dòng, đổi list & điền chỗ trống
   sang "phân loại 2 cột") trên TOÀN BỘ data/ic3, nhiều lần xáo khác nhau. Với mỗi câu trả lời đúng,
   bỏ trống, sai lệch 1 chỗ (theo dạng học sinh thấy):
     EduGrading.questionStatus(câu GỐC, wireAnswerOf(...) qua JSON) === trạng thái chấm trên máy.
   Chạy: node js/core/__tests__/grading-wire.test.js */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var ROOT = path.join(__dirname, '..', '..', '..');
var G = require(path.join(__dirname, '..', 'grading.js'));
var wrongAnswersOf = require('./grading-perturb.js').wrongAnswersOf;
var bank = require('./grading-bank.js').loadBank(ROOT);

// Lấy đúng các hàm cần từ quiz-engine.js (file chạy trên trình duyệt, không nạp được nguyên khối ở Node)
var src = fs.readFileSync(path.join(ROOT, 'js', 'quiz-engine.js'), 'utf8').replace(/\r\n/g, '\n');
function grab(sig) {
  var s = src.indexOf(sig);
  if (s === -1) throw new Error('Không thấy ' + sig + ' trong quiz-engine.js');
  return src.slice(s, src.indexOf('\n}\n', s) + 3);
}
var ctx = { window: { EduGrading: G }, State: null, console: console, Math: Math, JSON: JSON };
vm.createContext(ctx);
vm.runInContext([
  'function shuffle(arr) {', 'function _twoColLabel(w) {', 'function _splitFillBlankLines(segments, blanksLen) {',
  'function _toTwoColumnClassify(q) {', 'function _stripHowTo(s) {', 'function _trimSharedStatementPrefix(statements) {',
  'function prepareQuestions(rawQs, { keepOrder = false } = {}) {', 'function _answerOf(q, i) {', 'function wireAnswerOf(q, i) {',
].map(grab).join('\n'), ctx);

function putState(q, ans) {
  var S = { answers: {}, matching: {}, hotspot: {}, list: {}, classify: {}, ordering: {}, fillblank: {} };
  if (ans !== undefined) {
    if (['single', 'multi', 'truefalse'].indexOf(q.type) !== -1) S.answers[0] = ans;
    else if (q.type === 'matching') S.matching[0] = ans;
    else if (q.type === 'hotspot') S.hotspot[0] = new Set(ans);
    else if (q.type === 'list') S.list[0] = ans;
    else if (q.type === 'classify') S.classify[0] = ans;
    else if (q.type === 'ordering') S.ordering[0] = ans;
    else S.fillblank[0] = ans;
  }
  ctx.State = S;
}

var ROUNDS = 5;
var cases = 0, converted = 0, mism = [];
var byStatus = { correct: 0, incorrect: 0, skipped: 0 };
for (var round = 0; round < ROUNDS; round++) {
  bank.forEach(function (orig) {
    var prepared = ctx.prepareQuestions([orig])[0];
    if (prepared._wire && round === 0) converted++;
    [undefined, G.correctAnswerOf(prepared)].concat(wrongAnswersOf(prepared)).forEach(function (ans) {
      putState(prepared, ans);
      var local = G.questionStatus(prepared, ctx._answerOf(prepared, 0));
      var wire = JSON.parse(JSON.stringify(ctx.wireAnswerOf(prepared, 0) === undefined ? null : ctx.wireAnswerOf(prepared, 0)));
      var server = G.questionStatus(orig, wire === null ? undefined : wire);
      cases++;
      byStatus[local]++;
      if (local !== server && mism.length < 5) mism.push({ uid: orig.uid, type: orig.type, shownAs: prepared.type, local: local, server: server });
    });
  });
}
assertEq('ngân hàng: ' + bank.length + ' câu, ' + converted + ' câu đổi sang "phân loại 2 cột"', bank.length > 1000 && converted > 0, true);
assertEq('máy chủ chấm câu GỐC = máy học sinh chấm câu đã xáo/đổi dạng (' + ROUNDS + ' lần xáo, ' + cases + ' trường hợp)', mism, []);
assertEq('có đủ cả 3 trạng thái trong phép thử', byStatus.correct > 0 && byStatus.incorrect > 0 && byStatus.skipped > 0, true);

// Câu trùng uid giữa file khối và file minitest phải cùng đáp án — máy chủ tra theo uid
var byUid = {};
var conflicts = [];
(function walk(dir) {
  fs.readdirSync(dir).forEach(function (name) {
    var p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) return walk(p);
    if (!name.endsWith('.json')) return;
    var data; try { data = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return; }
    (function collect(node) {
      if (Array.isArray(node)) node.forEach(function (x) { if (x && typeof x.type === 'string' && typeof x.question === 'string') check(x); else collect(x); });
      else if (node && typeof node === 'object') Object.keys(node).forEach(function (k) { collect(node[k]); });
    })(data);
  });
})(path.join(ROOT, 'data', 'ic3'));
function check(q) {
  if (!q.uid) return;
  var key = JSON.stringify([q.type, G.correctAnswerOf(q)]);
  if (byUid[q.uid] === undefined) byUid[q.uid] = key;
  else if (byUid[q.uid] !== key && conflicts.length < 5) conflicts.push(q.uid);
}
assertEq('cùng uid ở nhiều file → cùng đáp án', conflicts, []);

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
