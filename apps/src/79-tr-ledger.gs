// ====== TECHREALM: SỔ CÁI TU LUYỆN trên Google Sheet ======
// Luật (EduCultivation) và CultivationService (EduCultivationService) KHÔNG viết lại ở đây: scripts/build-apps-script.js
// chép NGUYÊN VĂN js/techrealm/cultivation-core.js + cultivation-service.js vào đầu apps/Code.gs. File này chỉ là
// ADAPTER: kho dòng sổ cái = tab TR_SoCai, khoá = LockService, cấu hình Admin = Script Property TR_CONFIG.
//
// CHƯA ĐĂNG KÝ ROUTE NÀO (chưa có cách gọi từ web): học sinh cần mã học tập trước (docs/techrealm/MIGRATION_PLAN.md
// GĐ4–5). Khi bật, route sẽ gọi trService_().recordEvent(...) với actor do MÁY CHỦ xác định (token / mã phiên),
// không bao giờ lấy số EXP hay actor từ gói tin của trình duyệt. Tài liệu: docs/techrealm/CULTIVATION_SYSTEM.md
//
// Chuẩn bị (1 lần, khi tới GĐ5): tạo 1 file Google Sheet RIÊNG cho sổ cái, đặt Script Property
// TR_LEDGER_SPREADSHEET_ID = id file đó. Sổ cái không xoay vòng sang file mới như nhật ký (phải tìm được mọi dòng
// của 1 học sinh), nên để file riêng: 12 cột × ~800.000 dòng ≈ trần 10 triệu ô.

const TR_LEDGER_TAB = 'TR_SoCai';
// Trường hiếm dùng (itemId, qty, realm, achievementId, facts) gom vào cột Data (JSON) để giữ 12 cột.
const TR_LEDGER_HEADERS = ['TxId', 'LearnerId', 'Kind', 'Type', 'SourceId', 'Amount', 'Status', 'RefTxId', 'Data', 'Note', 'By', 'CreatedAt'];
const TR_LOCK_WAIT_MS = 15000;

function trLedgerSheet_() {
  // cachedProp_ nhớ cả "chưa có" tới 6 giờ → vừa đặt Property xong vẫn báo thiếu. Thiếu thì đọc thẳng Properties
  // (chỉ tốn lượt khi CHƯA cấu hình), có rồi thì ghi vào bản đệm để các lượt sau dùng.
  let id = cachedProp_('TR_LEDGER_SPREADSHEET_ID');
  if (!id) {
    id = PropertiesService.getScriptProperties().getProperty('TR_LEDGER_SPREADSHEET_ID');
    if (id) setCachedProp_('TR_LEDGER_SPREADSHEET_ID', id);
  }
  if (!id) throw appError_('failed-precondition', 'Chưa cấu hình sổ cái TechRealm (Script Property TR_LEDGER_SPREADSHEET_ID).');
  return ensureTab_(id, TR_LEDGER_TAB, TR_LEDGER_HEADERS);
}

/** Ô chữ: luôn thêm ' để Sheet không đổi "2026-11-16T…" thành ngày giờ hay "=…" thành công thức. */
function trCell_(v) { return v === null || v === undefined || v === '' ? '' : "'" + String(v); }

function trRowToSheet_(r) {
  const data = {};
  ['itemId', 'qty', 'realm', 'achievementId', 'facts', 'rulesVersion'].forEach(function (k) { if (r[k] !== undefined) data[k] = r[k]; });
  return [trCell_(r.txId), trCell_(r.learnerId), trCell_(r.kind), trCell_(r.type), trCell_(r.sourceId),
    typeof r.amount === 'number' ? r.amount : '', trCell_(r.status), trCell_(r.refTxId), trCell_(JSON.stringify(data)),
    trCell_(r.note), trCell_(r.by), trCell_(r.createdAt)];
}

function trSheetToRow_(v) {
  let data = {};
  try { data = JSON.parse(String(v[8] || '{}')); } catch (e) { data = {}; }
  const r = { txId: String(v[0]), learnerId: String(v[1]), kind: String(v[2]), by: String(v[10]), createdAt: String(v[11]) };
  if (v[3] !== '') r.type = String(v[3]);
  if (v[4] !== '') r.sourceId = String(v[4]);
  if (v[5] !== '' && v[5] !== null) r.amount = Number(v[5]);
  if (v[6] !== '') r.status = String(v[6]);
  if (v[7] !== '') r.refTxId = String(v[7]);
  if (v[9] !== '') r.note = String(v[9]);
  Object.keys(data).forEach(function (k) { r[k] = data[k]; });
  return r;
}

/** Mọi dòng của 1 học sinh (TextFinder trên cột LearnerId — khớp cả ô, không quét cả tab bằng getValues). */
function trRowsOf_(sheet, learnerId) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const cells = sheet.getRange(2, 2, last - 1, 1).createTextFinder(learnerId).matchEntireCell(true).findAll();
  return cells.map(function (c) { return trSheetToRow_(sheet.getRange(c.getRow(), 1, 1, TR_LEDGER_HEADERS.length).getValues()[0]); });
}

/**
 * Cổng store cho CultivationService. Đọc–tính–ghi của 1 học sinh nằm trong ScriptLock để trần ngày/tuần không bị
 * vượt khi 2 yêu cầu tới cùng lúc. Dù vậy, chống TRÙNG không phụ thuộc khoá: txId tất định + summarize() chỉ tính
 * dòng đầu tiên của mỗi txId. Hết thời gian chờ khoá → lỗi "bận", web xếp hàng gửi lại (pending-sync-queue).
 */
function trSheetStore_() {
  return {
    transact: function (learnerId, fn) {
      if (!/^L[0-9A-Z]{10}$/.test(String(learnerId || ''))) throw appError_('invalid-argument', 'Mã học viên không hợp lệ.');
      const sheet = trLedgerSheet_();
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(TR_LOCK_WAIT_MS)) throw appError_('resource-exhausted', 'Máy chủ đang bận, em thử lại sau vài giây.');
      try {
        const rows = trRowsOf_(sheet, learnerId);
        const have = {};
        rows.forEach(function (r) { have[r.txId] = true; });
        const fresh = (fn(rows.slice()) || []).filter(function (r) {
          if (r.learnerId !== learnerId || have[r.txId]) return false;
          have[r.txId] = true;
          return true;
        });
        if (fresh.length) sheet.getRange(sheet.getLastRow() + 1, 1, fresh.length, TR_LEDGER_HEADERS.length).setValues(fresh.map(trRowToSheet_));
        return { appended: fresh, rows: rows.concat(fresh) };
      } finally {
        lock.releaseLock();
      }
    },
  };
}

/** Cấu hình Admin (Script Property TR_CONFIG, JSON — chỉ phần muốn ghi đè). JSON hỏng → báo lỗi, KHÔNG âm thầm dùng mặc định. */
function trConfigOverride_() {
  const raw = cachedProp_('TR_CONFIG');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { throw appError_('failed-precondition', 'TR_CONFIG không phải JSON hợp lệ.'); }
}

/** CultivationService nối với Google Sheet. Mỗi lượt chạy tạo mới (Apps Script không giữ trạng thái giữa các lượt). */
function trService_() {
  return EduCultivationService.create({
    store: trSheetStore_(),
    config: trConfigOverride_(),
    clock: function () { return new Date().toISOString(); },
  });
}

// ====== TÀNG KINH CÁC → EXP: bài nộp ĐÃ ĐƯỢC MÁY CHỦ CHẤM LẠI ======
// CHƯA được gọi ở đâu và có công tắc riêng (Script Property TR_REWARDS = 'on', mặc định tắt). Khi bật ở GĐ4–5:
// writeSubmissionLog_ gọi trRewardSubmission_(payload) SAU applyServerGrading_ (30-submissions.gs). Luật nối bài làm →
// bài học nằm ở js/techrealm/learning-core.js (chép nguyên văn vào Code.gs), không viết lại ở đây.
// Chỉ thưởng khi: có mã học viên (payload.lid — sảnh gửi kèm từ GĐ4) + máy chủ chấm được (detail.sv) + điểm gửi lên
// KHỚP điểm máy chủ (detail.sk === 'ok'). Lệch điểm ('lech') = nghi sửa gói tin → không tự thưởng, giáo viên xem.
// Lưu ý: applyServerGrading_ chỉ chấm lại bài chế độ KIỂM TRA → muốn nhận EXP của 1 bài học, làm bài đó ở chế độ Kiểm tra.

/** payload bài nộp → đầu vào EduLearning.submissionEvents; null nếu chưa đủ điều kiện xác thực. */
function trSubmissionOf_(payload) {
  const d = (payload && payload.detail) || {};
  const lid = String((payload && payload.lid) || '');
  if (!/^L[0-9A-Z]{10}$/.test(lid) || typeof d.sv !== 'number' || d.sk !== 'ok') return null;
  const m = /^([A-Za-z0-9]+)__([A-Za-z0-9]+)\.json$/.exec(String(payload.bank || '')); // 'IC3__LV1.json'
  if (!m || !d.m) return null;
  return { learnerId: lid, catId: m[1], levelId: m[2], mtKey: String(d.m), serverScore: d.sv, durationSec: Number(d.e) || 0 };
}

/** Ghi EXP cho 1 bài nộp đã xác thực. Trả kết quả từng sự kiện ([] khi tắt / không đủ điều kiện). */
function trRewardSubmission_(payload) {
  if (cachedProp_('TR_REWARDS') !== 'on') return [];
  const sub = trSubmissionOf_(payload);
  if (!sub) return [];
  const svc = trService_();
  return EduLearning.submissionEvents(sub).map(function (e) { return svc.recordEvent(e, { kind: 'system' }); });
}

// ====== BÍ CẢNH → EXP: máy chủ CHẠY LẠI nhật ký thao tác ======
// Trình duyệt gửi { lid, challengeId, levelId, seed, actions } — KHÔNG gửi điểm (có gửi cũng bị bỏ qua).
// EduChallenge.replay (js/techrealm/challenge-core.js, chép nguyên văn) dựng lại màn chơi bằng đúng luật đã chạy trên
// máy học sinh rồi tự tính điểm; chỉ màn HOÀN THÀNH mới sinh sự kiện CHALLENGE. Cùng công tắc TR_REWARDS; chưa có route.
function trRewardChallenge_(payload) {
  if (cachedProp_('TR_REWARDS') !== 'on') return null;
  const p = payload || {};
  const ev = EduChallenge.rewardEvent({ learnerId: String(p.lid || ''), challengeId: String(p.challengeId || ''), levelId: String(p.levelId || ''), seed: p.seed, actions: p.actions });
  return ev ? trService_().recordEvent(ev, { kind: 'system' }) : null;
}
