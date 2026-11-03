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

// Chống đốt hạn mức (26/10/2026): bề mặt ghi cho tài khoản ẩn danh phải giữ đóng/giới hạn,
// và dữ liệu tạm của Đấu trường phải có TTL (không thì tích luỹ mãi, sát trần 1 GiB).
var liveBlock = rules.slice(rules.indexOf('match /live_hosts/'), rules.indexOf('match /courses/'));
assertEq('live_rooms/live_hosts (trang cũ đã bỏ) đóng hẳn', /allow\s+(get|list|create|update|delete)\b/.test(liveBlock) || !/allow read, write: if false;/.test(liveBlock), false);
var upBlock = rules.slice(rules.indexOf('match /up/{uid}'), rules.indexOf('match /live_hosts/'));
assertEq('arena_relay/up: giãn cách lần ghi (at == request.time, > 0,5 giây)',
  /request\.resource\.data\.at == request\.time/.test(upBlock) && /resource\.data\.at \+ duration\.value\(500, 'ms'\)/.test(upBlock), true);
assertEq('arena_relay/up: chỉ ghi vào phòng đang mở', /get\(\/databases\/\$\(database\)\/documents\/arena_relay\/\$\(code\)\)\.data\.exp > request\.time/.test(upBlock), true);
var ttl = JSON.parse(fs.readFileSync(path.join(ROOT, 'firestore.indexes.json'), 'utf8')).fieldOverrides
  .filter(function (f) { return f.ttl; }).map(function (f) { return f.collectionGroup + '.' + f.fieldPath; });
var mosBlock = rules.slice(rules.indexOf('match /mos_submissions/'), rules.indexOf('match /arena_relay/'));
assertEq('mos_submissions (web đã bỏ, MOS gửi Apps Script) đóng ghi công khai',
  (mosBlock.match(/allow create/g) || []).length === 1 && /allow create: if false;/.test(mosBlock), true);
var qBlock = rules.slice(rules.indexOf('match /questions/'), rules.indexOf('match /quiz_results/'));
assertEq('questions (ngân hàng cũ, không trang nào dùng) đóng ghi', /allow create, update: if false;/.test(qBlock) && !/isEditor\(\)/.test(qBlock), true);
assertEq('không còn file web nào ghi mos_submissions', fs.existsSync(path.join(ROOT, 'js', 'mos-submissions.js')), false);
assertEq('TTL có arena_relay.exp và up.exp', ['arena_relay.exp', 'up.exp'].every(function (k) { return ttl.indexOf(k) !== -1; }), true);

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

// Rules ↔ code (30/10/2026): 2 chỗ bị Firestore từ chối trên bản thật.
var dash = fs.readFileSync(path.join(ROOT, 'js', 'dashboard.js'), 'utf8');
assertEq('Báo cáo (ic3-dashboard) đọc quiz_results: Điều phối lọc where studentSchool in (rules isOwnSchoolField)',
  /where\('studentSchool', 'in', part\)/.test(dash), true);
var ts = fs.readFileSync(path.join(ROOT, 'js', 'teaching-schedule.js'), 'utf8');
assertEq('Giáo viên tự nhập lịch: hỏi máy chủ tuần đã có trước khi "tạo tuần" (rules chỉ cho Admin sửa tuần)',
  /isSelfImport\(\)\)\s*\{\s*const week = await window\.EduRepositories\.teachingWeek\.getById\(wk\)/.test(ts), true);
var weekBlock = rules.slice(rules.indexOf('match /teaching_weeks/'), rules.indexOf('match /teaching_schedule/'));
assertEq('teaching_weeks: giáo viên chỉ được create, không update', /allow update, delete: if isAdmin\(\);/.test(weekBlock), true);
assertEq('arena-relay dùng signInAnonymously ⇒ checklist không bảo tắt Anonymous',
  /signInAnonymously/.test(fs.readFileSync(path.join(ROOT, 'js', 'arena', 'arena-relay.js'), 'utf8'))
    && /Anonymous: Enabled/.test(fs.readFileSync(path.join(ROOT, 'docs', 'FIREBASE-CHECKLIST.md'), 'utf8')), true);

// Nhật ký hoạt động: mọi action web khai báo phải được Apps Script nhận (logActivity_ từ chối action lạ
// → nhật ký mất âm thầm, chỉ có console.warn).
globalThis.firebase = globalThis.firebase || { firestore: { FieldValue: { serverTimestamp: function () { return 0; } } } };
require(path.join(ROOT, 'js', 'models', 'activity-log.model.js'));
var gsActions = (fs.readFileSync(path.join(ROOT, 'apps', 'src', '45-activity.gs'), 'utf8').match(/ACTIVITY_ACTIONS = \[([^\]]*)\]/) || ['', ''])[1];
var missingActions = Object.values(globalThis.EduModels.ActivityLog.ACTIONS).filter(function (a) { return gsActions.indexOf("'" + a + "'") === -1; });
assertEq('mọi ActivityLog.ACTIONS có trong ACTIVITY_ACTIONS (Apps Script)', missingActions, []);

console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
