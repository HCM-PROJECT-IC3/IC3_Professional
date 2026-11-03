/* Test danh mục trường: schoolId suy từ tên (js/models/school.model.js), tạo danh mục
   (js/repositories/school-repository.js) và rules chuyển tiếp tên → schoolId (firestore.rules).
   Chạy: node js/models/__tests__/school.model.test.js — Firestore giả, không gọi mạng. */
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
globalThis.firebase = { firestore: { FieldValue: { serverTimestamp: function () { return 'SERVER_TS'; } } } };

// Firestore giả: collection "schools" có sẵn 1 trường; batch ghi lại các lệnh set
var EXISTING = { 'thcs-huynh-tan-phat': { name: 'THCS Huỳnh Tấn Phát', status: 'active' } };
var batchWrites = [], commits = 0, schoolReads = 0;
var lsStore = {};
globalThis.localStorage = {
  getItem: function (k) { return k in lsStore ? lsStore[k] : null; },
  setItem: function (k, v) { lsStore[k] = String(v); },
};
globalThis.EduFirebase = {
  db: {
    collection: function (name) {
      var q = {
        limit: function () { return q; },
        get: function () {
          if (name === 'schools') schoolReads++;
          return Promise.resolve({
            metadata: { fromCache: false },
            docs: Object.keys(EXISTING).map(function (id) { return { id: id, data: function () { return EXISTING[id]; } }; }),
          });
        },
        doc: function (id) { return { path: name + '/' + id }; },
      };
      return q;
    },
    batch: function () {
      return {
        set: function (ref, data) { batchWrites.push({ path: ref.path, data: data }); },
        commit: function () { commits++; return Promise.resolve(); },
      };
    },
  },
};

require(path.join(ROOT, 'js', 'models', 'school.model.js'));
require(path.join(ROOT, 'js', 'repositories', 'base-repository.js'));
require(path.join(ROOT, 'js', 'repositories', 'school-repository.js'));
var S = globalThis.EduModels.School;
var repo = globalThis.EduRepositories.school;

// 1. schoolIdOf: ổn định, bỏ dấu, đ → d
assertEq('bỏ dấu', S.schoolIdOf('THCS Huỳnh Tấn Phát'), 'thcs-huynh-tan-phat');
assertEq('đ/Đ → d', S.schoolIdOf('Tiểu học Đinh Bộ Lĩnh'), 'tieu-hoc-dinh-bo-linh');
assertEq('khoảng trắng/ký tự lạ thừa', S.schoolIdOf('  THCS  Lê Lợi (Q.3) '), 'thcs-le-loi-q-3');
assertEq('NFC và NFD ra cùng id', S.schoolIdOf('Nguyễn Du'.normalize('NFD')), S.schoolIdOf('Nguyễn Du'.normalize('NFC')));
assertEq('rỗng', S.schoolIdOf(''), '');
assertEq('schoolIdsOf: bỏ trùng + rỗng', S.schoolIdsOf(['THCS A', 'thcs a', '', null, 'THCS B']), ['thcs-a', 'thcs-b']);

assertEq('withSchoolId: thêm schoolId', S.withSchoolId({ name: '6A', school: 'THCS Lê Lợi' }), { name: '6A', school: 'THCS Lê Lợi', schoolId: 'thcs-le-loi' });
assertEq('withSchoolId: không có tên trường → giữ nguyên', S.withSchoolId({ teacherName: 'X' }), { teacherName: 'X' });
assertEq('findCollisions: chỉ khác dấu → trùng', S.findCollisions(['TH Ân', 'TH An', 'THCS B']), [['TH Ân', 'TH An']]);
assertEq('findCollisions: khác hoa/thường/dấu cách → cùng trường, không báo', S.findCollisions(['TH Y', ' th  y ', 'Nguyễn Du'.normalize('NFD'), 'Nguyễn Du']), []);
assertEq('withSchoolId: field tên khác', S.withSchoolId({ studentSchool: 'THCS A' }, 'studentSchool').schoolId, 'thcs-a');

(async function () {
  // ClassRepository: mọi lần ghi có "school" đều kèm schoolId
  require(path.join(ROOT, 'js', 'models', 'roster.model.js'));
  require(path.join(ROOT, 'js', 'repositories', 'roster-repository.js'));
  var baseWrites = [];
  var proto = globalThis.EduBaseRepository.prototype;
  ['create', 'update', 'upsert'].forEach(function (m) {
    proto[m] = function () { baseWrites.push([m].concat([].slice.call(arguments))); return Promise.resolve('id1'); };
  });
  var cls = globalThis.EduRepositories.class;
  await cls.create({ name: '6A', school: 'THCS Lê Lợi' });
  await cls.update('c1', { school: 'THCS Nguyễn Du', teacherId: 't' });
  await cls.update('c2', { teacherName: 'Cô An' });
  assertEq('class.create kèm schoolId', baseWrites[0][1].schoolId, 'thcs-le-loi');
  assertEq('class.update đổi trường kèm schoolId', baseWrites[1][2].schoolId, 'thcs-nguyen-du');
  assertEq('class.update không đổi trường → không thêm schoolId', 'schoolId' in baseWrites[2][2], false);

  // 2. ensureFromNames: chỉ thêm trường chưa có, không ghi đè trường đã có
  var created = await repo.ensureFromNames(['THCS Huỳnh Tấn Phát', ' THCS Lê Lợi ', 'THCS LÊ LỢI', '']);
  assertEq('ensureFromNames: chỉ trường mới', created, ['thcs-le-loi']);
  assertEq('ensureFromNames: 1 batch', commits, 1);
  assertEq('ensureFromNames: document đúng', batchWrites[0], {
    path: 'schools/thcs-le-loi',
    data: { name: 'THCS Lê Lợi', status: 'active', createdAt: 'SERVER_TS', updatedAt: 'SERVER_TS' },
  });
  commits = 0;
  assertEq('ensureFromNames: đủ rồi thì không ghi', await repo.ensureFromNames(['THCS Huỳnh Tấn Phát']), []);
  assertEq('ensureFromNames: không commit rỗng', commits, 0);
  assertEq('ensureFromNames: máy đã biết đủ trường → không đọc lại danh mục', schoolReads, 1);
  await repo.ensureFromNames(['THCS Nguyễn Du']);
  assertEq('ensureFromNames: gặp trường lạ → đọc lại danh mục', schoolReads, 2);

  // updateInfo / setStatus (base update đã bị thay bằng bản ghi lại ở phần ClassRepository)
  baseWrites = [];
  await repo.updateInfo('thcs-le-loi', { address: '  12 Lê Lợi ', phone: '028', name: 'Đổi tên', status: 'inactive', x: 1 });
  assertEq('updateInfo: chỉ field liên hệ + updatedAt (bỏ name/status/field lạ)',
    Object.keys(baseWrites[0][2]).sort(), ['address', 'phone', 'updatedAt']);
  assertEq('updateInfo: cắt khoảng trắng', baseWrites[0][2].address, '12 Lê Lợi');
  assertEq('INFO_FIELDS khớp rules (trừ updatedAt)', repo.INFO_FIELDS, ['address', 'phone', 'contactName', 'note']);
  await repo.setStatus('thcs-le-loi', 'inactive');
  assertEq('setStatus', baseWrites[1][2].status, 'inactive');
  var bad = null;
  try { await repo.setStatus('thcs-le-loi', 'deleted'); } catch (e) { bad = e.message; }
  assertEq('setStatus: từ chối trạng thái lạ', !!bad, true);

  // 3. firestore.rules — kiểm tra tĩnh (máy dev/CI không có emulator)
  var rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  var block = rules.slice(rules.indexOf('match /schools/{schoolId}'), rules.indexOf('match /questions/'));
  assertEq('rules có match /schools', block.length > 0, true);
  assertEq('schools: Quản trị trường chỉ sửa field liên hệ (không đổi name/status)',
    /isSchoolAdmin\(\)[\s\S]*hasOnly\(\['address', 'phone', 'contactName', 'note', 'updatedAt'\]\)/.test(block), true);
  assertEq('schools: Quản trị trường nhận theo tên HOẶC schoolId (giống phần còn lại của rules)',
    /isSchoolAdmin\(\) && \(resource\.data\.name in myStaffSchools\(\) \|\| schoolId in mySchoolIds\(\)\)/.test(block), true);
  assertEq('schools: chỉ Admin tạo/xoá', /allow delete: if isAdmin\(\);/.test(block) && /allow create, update: if isAdmin\(\)/.test(block), true);
  assertEq('mọi chỗ dùng phạm vi trường của Điều phối đều nhận cả school_admin',
    /isCoordinator\(\)/.test(rules.replace(/function isCoordinator\(\)[\s\S]*?\}/, '').replace(/return isCoordinator\(\) \|\| isSchoolAdmin\(\);/, '')), false);
  assertEq('chuyển tiếp: phạm vi nhận cả schoolId', /data\.schoolId in mySchoolIds\(\)/.test(rules), true);
  assertEq('school_admin không tự đăng ký được', /request\.resource\.data\.role in \['student', 'teacher'\]/.test(rules), true);

  // 4. Apps Script cho school_admin dùng các API như Điều phối
  var router = fs.readFileSync(path.join(ROOT, 'apps', 'src', '10-router.gs'), 'utf8');
  ['ROLES_RESULTS', 'ROLES_MANAGE', 'ROLES_STAFF'].forEach(function (k) {
    var line = (router.match(new RegExp('const ' + k + ' = \\[[^\\]]*\\]')) || [''])[0];
    assertEq(k + ' có school_admin ⇔ có coordinator', line.indexOf("'school_admin'") !== -1, line.indexOf("'coordinator'") !== -1);
  });

  console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
