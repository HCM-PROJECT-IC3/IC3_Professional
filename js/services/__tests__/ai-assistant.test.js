/* Test js/services/ai-assistant.js — use case "hỏi Trợ lý AI" với CỔNG GIẢ (không mạng, không localStorage):
   bản đệm → key cá nhân → key của trường → báo cần key.
   Chạy: node js/services/__tests__/ai-assistant.test.js */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

require(path.join(__dirname, '..', 'ai-core.js'));
var AA = require(path.join(__dirname, '..', 'ai-assistant.js'));
var err = AA.aiErr;

/** Dựng use case với cổng giả; ghi lại mọi lượt gọi. */
function rig(o) {
  var log = [], store = {};
  var a = AA.create({
    keyStore: { get: function () { return { key: o.key || '', model: 'gemini-flash-latest' }; } },
    cache: { get: function (k) { return store[k] || null; }, put: function (k, v) { store[k] = v; log.push('put'); } },
    gemini: { generate: function (key, model, b) { log.push('gemini:' + key); return o.gemini ? o.gemini(b) : Promise.resolve('từ key cá nhân'); } },
    school: o.noSchool ? null : { ask: function (task) { log.push('school:' + task); return o.school ? o.school() : Promise.resolve({ text: 'từ key trường', cached: false }); } },
  });
  return { a: a, log: log, store: store };
}
var P = { question: 'RAM là gì?', correct: 'Bộ nhớ tạm', chosen: 'Ổ cứng' };
function fails(p) { return p.then(function () { return null; }, function (e) { return e; }); }

(async function () {
  var r = rig({ key: 'K1' });
  var x = await r.a.ask('explain', P);
  assertEq('có key cá nhân → dùng key cá nhân, KHÔNG gọi máy chủ trường', [x.via, x.text, r.log], ['mine', 'từ key cá nhân', ['gemini:K1', 'put']]);
  var y = await r.a.ask('explain', Object.assign({}, P));
  assertEq('hỏi lại cùng câu → bản đệm, 0 lượt gọi', [y.via, r.log.length], ['cache', 2]);
  var z = await r.a.ask('explain', P, { fresh: true });
  assertEq('fresh → bỏ qua bản đệm', [z.via, r.log.length], ['mine', 4]);

  r = rig({});
  x = await r.a.ask('explain', P);
  assertEq('không có key cá nhân → máy chủ trường', [x.via, r.log], ['school', ['school:explain', 'put']]);

  r = rig({ key: 'K1', gemini: function () { return Promise.reject(err('quota')); }, school: function () { return Promise.resolve({ text: 'đệm trường', cached: true }); } });
  x = await r.a.ask('explain', P);
  assertEq('key cá nhân hết hạn mức (429) → tự chuyển sang key trường', [x.via, x.text, r.log.slice(0, 2)], ['school-cache', 'đệm trường', ['gemini:K1', 'school:explain']]);

  r = rig({ key: 'K1', gemini: function () { return Promise.reject(err('key')); }, school: function () { return Promise.reject(err('no-key', 'Trường chưa cài key AI hệ thống.')); } });
  var e = await fails(r.a.ask('explain', P));
  assertEq('cả 2 lớp hỏng → need-key, nêu lỗi key cá nhân, giữ lỗi từng lớp', [e.kind, /^Key cá nhân: Key không hợp lệ/.test(e.message), e.mine.kind, e.school.kind], ['need-key', true, 'key', 'no-key']);

  r = rig({ school: function () { return Promise.reject(err('limit', 'Đã dùng hết 30 lượt AI của trường hôm nay.')); } });
  e = await fails(r.a.ask('explain', P));
  assertEq('không key cá nhân + trường hết lượt → báo đúng lý do của trường', [e.kind, e.message, e.mine], ['need-key', 'Đã dùng hết 30 lượt AI của trường hôm nay.', null]);

  r = rig({ key: 'K1', gemini: function () { return Promise.reject(err('safety')); } });
  e = await fails(r.a.ask('explain', P));
  assertEq('Gemini từ chối nội dung (safety) → dừng, không đem sang key trường', [e.kind, r.log], ['safety', ['gemini:K1']]);

  r = rig({ noSchool: true });
  e = await fails(r.a.ask('explain', P));
  assertEq('trang không nối máy chủ trường, chưa có key → need-key', [e.kind, e.message], ['need-key', 'Chưa có key AI nào dùng được trên máy này.']);

  r = rig({ key: 'K1' });
  e = await fails(r.a.ask('chat', { text: 'hỏi linh tinh' }));
  assertEq('việc lạ bị chặn ở tầng domain trước khi gọi gì', [e.code, r.log], ['invalid-argument', []]);

  r = rig({ gemini: function () { return Promise.reject(err('empty')); } });
  assertEq('testKey: model chỉ "nghĩ" (không ra chữ) vẫn là key dùng được', await r.a.testKey('K2', 'gemini-pro-latest'), true);
  r = rig({ gemini: function () { return Promise.reject(err('key')); } });
  e = await fails(r.a.testKey('BAD', 'gemini-flash-latest'));
  assertEq('testKey: key sai → ném lỗi kind key', e.kind, 'key');

  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả test PASS');
  process.exit(failures ? 1 : 0);
})();
