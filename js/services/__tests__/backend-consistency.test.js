/* Test: js/backend-config.js và firestore.rules phải khớp nhau về việc trang học sinh ghi
   quiz_results. Đổi quizResults.firestore khỏi 'off' mà quên mở quizResultsOpen() trong rules
   → mọi bài ghi Firestore bị từ chối (vẫn còn Sheet, nhưng dashboard đọc Firestore thì trống).
   Mở rules mà web không ghi → lỗ hổng: ai cũng ghi rác được, đốt hạn mức Spark.
   Chạy: node js/services/__tests__/backend-consistency.test.js */
var fs = require('fs');
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var ROOT = path.join(__dirname, '..', '..', '..');
globalThis.window = globalThis;
require(path.join(ROOT, 'js', 'backend-config.js'));
var mode = globalThis.EduBackend.quizResults.firestore;
var rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
var m = rules.match(/function\s+quizResultsOpen\(\)\s*\{\s*return\s+(true|false)\s*;/);

assertEq('firestore.rules có công tắc quizResultsOpen()', !!m, true);
assertEq("quiz_results create đi qua quizResultsOpen()", /allow create: if quizResultsOpen\(\) &&/.test(rules), true);
assertEq("quizResults.firestore là 'all' | 'test-only' | 'off'", ['all', 'test-only', 'off'].indexOf(mode) !== -1, true);
assertEq("rules mở ⇔ web ghi Firestore (firestore = '" + mode + "')", m && m[1] === 'true', mode !== 'off');

console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
