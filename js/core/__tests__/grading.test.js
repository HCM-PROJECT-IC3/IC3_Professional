/* Test luật chấm (js/core/grading.js) — từng loại câu + TOÀN BỘ ngân hàng data/ic3.
   Chạy: node js/core/__tests__/grading.test.js — hàm thuần, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var ROOT = path.join(__dirname, '..', '..', '..');
var G = require(path.join(__dirname, '..', 'grading.js'));
var wrongAnswersOf = require('./grading-perturb.js').wrongAnswersOf;
var S = G.questionStatus;

// ── Từng loại ──
var single = { type: 'single', options: ['A', 'B', 'C'], correct: ['B'] };
assertEq('single', [S(single, 'B'), S(single, 'A'), S(single, ''), S(single, undefined)], ['correct', 'incorrect', 'skipped', 'skipped']);
var multi = { type: 'multi', correct: ['A', 'C'] };
assertEq('multi: không phụ thuộc thứ tự, thiếu/thừa là sai', [S(multi, ['C', 'A']), S(multi, ['A']), S(multi, ['A', 'B', 'C']), S(multi, [])], ['correct', 'incorrect', 'incorrect', 'skipped']);
var tf = { type: 'truefalse', statements: [{ answer: true }, { answer: false }] };
assertEq('truefalse: phải đúng mọi mệnh đề; khoá chuỗi (JSON) vẫn chấm được', [S(tf, { 0: true, 1: false }), S(tf, { '0': true, '1': false }), S(tf, { 0: true }), S(tf, {})], ['correct', 'correct', 'incorrect', 'skipped']);
var match = { type: 'matching', pairs: [{ left: 'x', right: '1' }, { left: 'y', right: '2' }] };
assertEq('matching', [S(match, { x: '1', y: '2' }), S(match, { x: '2', y: '1' }), S(match, {})], ['correct', 'incorrect', 'skipped']);
var hs = { type: 'hotspot', areas: [{ id: 'a', correct: true }, { id: 'b', correct: false }, { id: 'c', correct: true }] };
assertEq('hotspot: mảng hoặc Set, thứ tự tuỳ ý', [S(hs, ['c', 'a']), S(hs, new Set(['a', 'c'])), S(hs, ['a']), S(hs, ['a', 'b', 'c']), S(hs, new Set())], ['correct', 'correct', 'incorrect', 'incorrect', 'skipped']);
var list = { type: 'list', items: [{ correct: 'p' }, { correct: 'q' }] };
assertEq('list', [S(list, { 0: 'p', 1: 'q' }), S(list, { 0: 'q', 1: 'q' }), S(list, {})], ['correct', 'incorrect', 'skipped']);
var cls = { type: 'classify', items: [{ text: 'mèo', zone: 'thú' }, { text: 'cá', zone: 'nước' }], distractors: ['đá'] };
assertEq('classify: chỉ kéo thẻ mồi nhử = bỏ qua', [S(cls, { 'mèo': 'thú', 'cá': 'nước' }), S(cls, { 'mèo': 'nước', 'cá': 'nước' }), S(cls, { 'đá': 'thú' })], ['correct', 'incorrect', 'skipped']);
var ord = { type: 'ordering', items: ['1', '2', '3'] };
assertEq('ordering', [S(ord, ['1', '2', '3']), S(ord, ['2', '1', '3']), S(ord, [])], ['correct', 'incorrect', 'skipped']);
var fill = { type: 'selectfill', blanks: ['mây', 'gió'] };
assertEq('selectfill/dragfill', [S(fill, { 0: 'mây', 1: 'gió' }), S(fill, { 0: 'gió', 1: 'gió' }), S(fill, {}), S(Object.assign({}, fill, { type: 'dragfill' }), { 0: 'mây', 1: 'gió' })], ['correct', 'incorrect', 'skipped', 'correct']);
assertEq('loại lạ → bỏ qua', S({ type: 'essay' }, 'x'), 'skipped');

// ── Toàn bộ ngân hàng: đáp án của chính câu → đúng; trống → bỏ qua; lệch 1 chỗ → sai ──
var bank = require('./grading-bank.js').loadBank(ROOT);
var bad = { correct: [], skipped: [], incorrect: [] };
var wrongCases = 0;
bank.forEach(function (q) {
  if (S(q, G.correctAnswerOf(q)) !== 'correct') bad.correct.push(q.uid || q.id);
  if (S(q, undefined) !== 'skipped') bad.skipped.push(q.uid || q.id);
  wrongAnswersOf(q).forEach(function (a) { wrongCases++; if (S(q, a) !== 'incorrect') bad.incorrect.push(q.uid || q.id); });
});
assertEq('ngân hàng có câu hỏi', bank.length > 1000, true);
assertEq('mọi câu: đáp án của chính câu được chấm ĐÚNG', bad.correct.slice(0, 10), []);
assertEq('mọi câu: không trả lời → BỎ QUA', bad.skipped.slice(0, 10), []);
assertEq('mọi câu sai lệch 1 chỗ (' + wrongCases + ' trường hợp) → SAI', bad.incorrect.slice(0, 10), []);

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
