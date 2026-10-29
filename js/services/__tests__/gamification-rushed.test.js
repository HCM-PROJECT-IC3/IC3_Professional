/* Test: js/gamification.js — bài làm quá nhanh (bấm bừa) không được XP / chuỗi ngày / huy hiệu.
   Chạy: node js/services/__tests__/gamification-rushed.test.js */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var data = {};
globalThis.window = globalThis;
globalThis.addEventListener = function () {};
globalThis.localStorage = { getItem: function (k) { return k in data ? data[k] : null; }, setItem: function (k, v) { data[k] = String(v); }, removeItem: function (k) { delete data[k]; } };
require(path.join(__dirname, '..', '..', 'gamification.js'));
var G = globalThis.EduGamification;

// Giống bài trong ảnh chụp: 14 câu, đúng 2, TB 0,6 giây/câu
var rushed = G.recordResult({ correct: 2, incorrect: 12, total: 14, elapsedSec: 8, avgSecPerQ: 0.6 });
assertEq('bấm bừa 0,6s/câu: 0 XP, không huy hiệu, có cờ rushed', [rushed.xpGained, rushed.newBadges.length, rushed.rushed], [0, 0, true]);
assertEq('bấm bừa: không tăng số bài, không bắt đầu chuỗi ngày', [G.getState().totalQuizzes, G.getState().streak, G.getState().xp], [0, 0, 0]);

var real = G.recordResult({ correct: 10, incorrect: 4, total: 14, elapsedSec: 420, avgSecPerQ: 30 });
assertEq('làm bài thật: XP như cũ (10×10 + 50), có huy hiệu bài đầu', [real.xpGained, real.newBadges.length > 0, !!real.rushed], [150, true, false]);
assertEq('làm bài thật: tính số bài + chuỗi ngày', [G.getState().totalQuizzes, G.getState().streak], [1, 1]);

// Thiếu avgSecPerQ (bản ghi cũ): tự tính từ elapsedSec / số câu đã trả lời
assertEq('thiếu avgSecPerQ: tự tính từ thời gian', G.recordResult({ correct: 5, incorrect: 5, total: 10, elapsedSec: 12 }).xpGained, 0);
// Bài ít câu (≤ 3 câu trả lời) không bị coi là bấm bừa — giống ngưỡng cảnh báo trên màn kết quả
assertEq('bài 3 câu làm nhanh: vẫn có XP', G.recordResult({ correct: 3, incorrect: 0, total: 3, elapsedSec: 3 }).xpGained > 0, true);

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
