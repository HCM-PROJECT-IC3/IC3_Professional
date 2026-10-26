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

// Web và Apps Script cùng 1 số phiên bản: đổi apps/src mà quên số ở web (hoặc ngược lại) thì
// thanh cảnh báo "Apps Script chưa cập nhật" của admin báo sai (js/services/backend-version-check.js).
var gsVersion = (fs.readFileSync(path.join(ROOT, 'apps', 'src', '00-config.gs'), 'utf8').match(/BACKEND_VERSION\s*=\s*'([^']+)'/) || [])[1];
assertEq('expectedBackendVersion (web) = BACKEND_VERSION (Apps Script)', globalThis.EduBackend.expectedBackendVersion, gsVersion);

// Logic so phiên bản của thanh cảnh báo
globalThis.addEventListener = function () {};
require(path.join(ROOT, 'js', 'services', 'backend-version-check.js'));
var isStale = globalThis.EduBackendVersionCheck.isStale;
assertEq('bản chạy cũ hơn → cảnh báo; bằng/mới hơn/mất mạng → không',
  [isStale('2026-10-15', '2026-10-26'), isStale('2026-10-26', '2026-10-26'), isStale('2026-11-01', '2026-10-26'), isStale(null, '2026-10-26'), isStale('?', '2026-10-26')],
  [true, false, false, false, true]);

console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
