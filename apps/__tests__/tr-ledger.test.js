/* Sổ cái TechRealm trên Google Sheet GIẢ LẬP — chạy apps/Code.gs thật (gồm cultivation-core + service chép nguyên văn).
   Chạy: node apps/__tests__/tr-ledger.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0;
const eq = (label, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)));
};
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.code || e.message; } };

// ── Google Sheet giả: ô ghi "'…" được lưu không có dấu ' (như Sheet thật), raw giữ nguyên để kiểm ──
function mkSheet(name, parent) {
  const rows = [];
  const raw = [];
  let maxCols = 26;
  const sheet = {
    rows, raw,
    getName: () => name,
    getParent: () => parent,
    getLastRow: () => rows.length,
    getMaxColumns: () => maxCols,
    getMaxRows: () => Math.max(rows.length, 1000),
    deleteColumns: (from, n) => { maxCols -= n; },
    setFrozenRows: () => {},
    getRange(r, c, n, m) {
      const range = {
        setFontWeight: () => range,
        setValues(vals) {
          vals.forEach((v, i) => {
            raw[r - 1 + i] = v.slice();
            rows[r - 1 + i] = v.map((x) => (typeof x === 'string' && x[0] === "'" ? x.slice(1) : x));
          });
          return range;
        },
        getValues: () => rows.slice(r - 1, r - 1 + n).map((row) => row.slice(c - 1, c - 1 + m)),
        createTextFinder(text) {
          const f = {
            matchEntireCell: () => f,
            findAll: () => rows.map((row, i) => ({ row, i })).filter(({ row, i }) => i + 1 >= r && i + 1 < r + n && String(row[c - 1]) === text).map(({ i }) => ({ getRow: () => i + 1 })),
          };
          return f;
        },
      };
      return range;
    },
  };
  return sheet;
}
const files = new Map();
function mkFile(id) {
  const ss = { tabs: new Map(), getId: () => id, getSheetByName: (n) => ss.tabs.get(n) || null, insertSheet: (n) => { const s = mkSheet(n, ss); ss.tabs.set(n, s); return s; }, getSheets: () => [...ss.tabs.values()] };
  files.set(id, ss);
  return ss;
}
mkFile('LEDGER1');

const props = new Map();
const cache = new Map();
let lockFree = true;
let lockHeld = false;
const ctx = {
  console,
  SpreadsheetApp: { openById: (id) => files.get(id) || mkFile(id) },
  CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, v) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => { if (!lockFree) return false; lockHeld = true; return true; }, waitLock: () => {}, releaseLock: () => { lockHeld = false; } }) },
  Utilities: { getUuid: () => '00000000-0000-4000-8000-000000000000', formatDate: () => '2026-11-16 10:00' },
};
vm.createContext(ctx);
const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
vm.runInContext(src + '\n;this.__api = { trService_, trLedgerSheet_, trSheetStore_, trRewardSubmission_, trSubmissionOf_, trRewardChallenge_ };', ctx);
const api = ctx.__api;
const L = 'LABCDEFGH23';
const SYS = { kind: 'system' };

eq('chưa cấu hình file sổ cái → báo rõ, không tự tạo', throws(() => api.trService_().profile(L)), 'failed-precondition');
props.set('TR_LEDGER_SPREADSHEET_ID', 'LEDGER1');

const svc = api.trService_();
const a = svc.recordEvent({ type: 'LESSON', learnerId: L, evidence: { lessonId: 'ic3-lv1/1', score: 88, durationSec: 300, topic: 1 } }, SYS);
const sheet = files.get('LEDGER1').getSheetByName('TR_SoCai');
eq('tạo tab TR_SoCai đúng 12 cột tiêu đề', [sheet.rows[0].length, sheet.getMaxColumns()], [12, 12]);
eq('ghi 1 dòng EXP + 1 thành tựu', [a.ok, sheet.getLastRow()], [true, 3]);
eq('ô chữ ghi kèm dấu \' (ngày giờ ISO không bị Sheet đổi kiểu)', sheet.raw[1][11].startsWith("'2026-") || sheet.raw[1][11].startsWith("'20"), true);
eq('Amount là số', typeof sheet.rows[1][5], 'number');
const b = api.trService_().recordEvent({ type: 'LESSON', learnerId: L, evidence: { lessonId: 'ic3-lv1/1', score: 100 } }, SYS);
eq('lượt chạy KHÁC gửi lại cùng bài → trùng, không ghi thêm dòng', [b.duplicate, sheet.getLastRow()], [true, 3]);
const p = api.trService_().profile(L);
eq('đọc lại từ Sheet: 20 EXP, facts giữ nguyên qua cột Data', [p.exp, p.history.find((h) => h.kind === 'exp').amount, p.activityMinutes], [20, 20, 5]);

// Ghi đua (ví dụ 2 lượt chạy cùng append trước khi có khoá) → 2 dòng cùng txId: vẫn chỉ tính 1 lần
sheet.getRange(sheet.getLastRow() + 1, 1, 1, 12).setValues([sheet.raw[1].slice()]);
eq('dòng trùng txId trong Sheet → EXP vẫn 20', api.trService_().profile(L).exp, 20);

// Khoá bận → báo bận, không ghi
lockFree = false;
const before = sheet.getLastRow();
eq('khoá bận → lỗi resource-exhausted, không ghi dòng nào', [throws(() => api.trService_().recordEvent({ type: 'LESSON', learnerId: L, evidence: { lessonId: 'ic3-lv1/2', score: 90 } }, SYS)), sheet.getLastRow() - before], ['resource-exhausted', 0]);
lockFree = true;
eq('luôn nhả khoá sau lỗi', lockHeld, false);

// Học sinh khác không lẫn dữ liệu
const L2 = 'LZZZZZZZZZ2';
api.trService_().recordEvent({ type: 'TEST', learnerId: L2, evidence: { testId: 'khao-hach-2', score: 90 } }, SYS);
eq('học sinh khác: chỉ thấy dòng của mình', [api.trService_().profile(L2).exp, api.trService_().profile(L).exp], [60, 20]);
eq('mã học viên sai → từ chối trước khi đọc Sheet', throws(() => api.trSheetStore_().transact('x', () => [])), 'invalid-argument');

// Đột phá trọn vòng qua Sheet
const s2 = api.trService_();
s2.recordEvent({ type: 'TEST', learnerId: L, evidence: { testId: 'khao-hach-2', score: 100 } }, SYS);
s2.recordEvent({ type: 'PROJECT', learnerId: L, evidence: { projectId: 'p1', pct: 95 } }, { kind: 'teacher', uid: 'gv1' });
s2.recordEvent({ type: 'LESSON', learnerId: L, evidence: { lessonId: 'ic3-lv1/2', score: 90 } }, SYS); // 20+80+180+20 = 300 = ngưỡng Trúc Cơ
const bt = api.trService_().breakthrough(L, { kind: 'learner', uid: L });
const after = api.trService_().profile(L);
eq('đột phá qua Sheet: lên Trúc Cơ, vật phẩm đọc lại đúng số lượng', [bt.ok, after.realm.name, after.items['linh-thach'], after.items['khung-van-may']], [true, 'Trúc Cơ', 100, 1]);
eq('người xác nhận dự án ghi đúng uid giáo viên', after.history.find((h) => h.type === 'PROJECT').by, 'gv1');

// Cấu hình Admin
props.set('TR_CONFIG', JSON.stringify({ rewards: { LESSON: { amount: 35 } } }));
cache.clear();
api.trService_().recordEvent({ type: 'LESSON', learnerId: 'LCCCCCCCCC3', evidence: { lessonId: 'a', score: 90 } }, SYS);
eq('TR_CONFIG ghi đè mức thưởng', api.trService_().profile('LCCCCCCCCC3').exp, 35);
props.set('TR_CONFIG', JSON.stringify({ rewards: { LESSON: { amount: -1 } } }));
cache.clear();
eq('TR_CONFIG sai luật → không khởi tạo (không ghi bừa)', /không hợp lệ/.test(throws(() => api.trService_()) || ''), true);
props.set('TR_CONFIG', '{hỏng');
cache.clear();
eq('TR_CONFIG không phải JSON → báo lỗi', throws(() => api.trService_()), 'failed-precondition');

// ── Bài nộp đã chấm lại trên máy chủ → EXP (Tàng Kinh Các) ──
props.delete('TR_CONFIG'); cache.clear();
const LP = 'LPPPPPPPPP4';
const BAI1 = 'Bài 1. Tìm hiểu phần cứng cơ bản của máy tính';
const pay = (over) => Object.assign({ lid: LP, bank: 'IC3__LV1.json', score: 90, examMode: 'test', detail: { m: BAI1, e: 420, sv: 90, sk: 'ok' } }, over || {});
eq('công tắc TR_REWARDS chưa bật → không thưởng', JSON.parse(JSON.stringify(api.trRewardSubmission_(pay()))), []);
props.set('TR_REWARDS', 'on'); cache.clear();
eq('bài nộp thiếu mã học viên → không thưởng', api.trSubmissionOf_(pay({ lid: '' })), null);
eq('điểm gửi lên LỆCH điểm máy chủ → không tự thưởng', api.trSubmissionOf_(pay({ detail: { m: BAI1, sv: 40, sk: 'lech' } })), null);
eq('chưa được máy chủ chấm (không có sv) → không thưởng', api.trSubmissionOf_(pay({ detail: { m: BAI1 } })), null);
const r1 = api.trRewardSubmission_(pay());
const r2 = api.trRewardSubmission_(pay());
eq('IC3 cấp 1 · bài 1, 90 điểm máy chủ → +20; nộp lại → trùng', [r1[0].tx.amount, r1[0].tx.sourceId, r2[0].duplicate], [20, 'ic3-lv1/1', true]);
eq('MOS Word: bank MOS__Word.json → MOS/Word', (() => { const s = api.trSubmissionOf_(pay({ bank: 'MOS__Word.json', detail: { m: 'Bài 2: Thao tác với văn bản', sv: 80, sk: 'ok' } })); return [s.catId, s.levelId]; })(), ['MOS', 'Word']);

// ── Bí cảnh: máy chủ chạy lại nhật ký (dùng bản luật CHÉP trong Code.gs; nhật ký tạo bằng bản Node) ──
const NE = require(path.join(__dirname, '..', '..', 'js', 'techrealm', 'challenge-core.js'));
require(path.join(__dirname, '..', '..', 'js', 'techrealm', 'thanh-pho-mat-dien-core.js'));
const LV = NE.levelOf('thanh-pho-mat-dien', 'phan-phoi');
let st = LV.init(NE.rng(3));
const acts = [];
let tt = 0;
const doA = (a) => { tt += 1500; const f = Object.assign({ t: tt }, a); acts.push(f); st = LV.apply(NE.clone(st), f); };
st.buildings.filter((b) => b.essential).forEach((b) => doA({ type: 'toggle', id: b.id }));
doA({ type: 'submit' });
st.qs.forEach((q) => doA({ type: 'answer', q: q.id, o: q.correct }));
const ch = (over) => Object.assign({ lid: 'LCHALLENGE1', challengeId: 'thanh-pho-mat-dien', levelId: 'phan-phoi', seed: 3, actions: acts, score: 100 }, over || {});
const c1 = api.trRewardChallenge_(ch());
const serverScore = NE.replay('thanh-pho-mat-dien', 'phan-phoi', 3, acts).result.score;
eq('Code.gs chạy lại nhật ký → thưởng theo điểm MÁY CHỦ tính (không phải 100 gửi kèm)', [c1.ok, c1.tx.facts.score, serverScore < 100], [true, serverScore, true]);
eq('gửi lại cùng màn → trùng', api.trRewardChallenge_(ch()).duplicate, true);
eq('nhật ký bị cắt (chưa hoàn thành) → không thưởng', api.trRewardChallenge_(ch({ lid: 'LCHALLENGE2', actions: acts.slice(0, 2) })), null);
eq('nhật ký giả "bấm siêu nhanh" → không thưởng', api.trRewardChallenge_(ch({ lid: 'LCHALLENGE3', actions: acts.map((a, i) => Object.assign({}, a, { t: i * 10 })) })), null);

console.log(fails ? `\n✗ ${fails} kiểm tra lỗi` : '\n✓ tr-ledger: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
