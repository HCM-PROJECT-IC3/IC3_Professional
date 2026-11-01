// ====== NHẬN BÀI THEO LÔ TỪ MÁY CHỦ TRƯỜNG (Docker — server/relay.js) ======
// Router: submitBatch. Máy chủ trường nhận bài nộp của học sinh qua LAN, lưu ra đĩa rồi gửi
// lên đây theo lô: 1 lượt chạy Apps Script cho tối đa BATCH_MAX bài thay vì 1 lượt/bài →
// mùa thi không còn chạm trần 30 lượt chạy song song / tài khoản.
// Router để công khai (máy chủ không có tài khoản Firebase) nhưng bắt buộc mã RELAY_TOKEN
// trong Script Properties, trùng biến GAS_RELAY_TOKEN của máy chủ. Chưa đặt thì tắt hẳn —
// máy chủ tự gửi từng bài như trang học sinh.

const BATCH_MAX = 100;
const BATCH_TIME_BUDGET_MS = 4 * 60 * 1000; // Apps Script dừng ở 6 phút — chừa thời gian trả kết quả

// Tab đã mở trong lô đang chạy (null = không trong lô). Mỗi bài lẻ phải mở file, đọc số dòng và
// đếm ô cả file (logTabFull_) — trong lô làm 1 lần: 100 bài thêm tối đa 100 dòng, còn xa trần
// xoay file (MAX_LOG_ROWS / FILE_CELL_BUDGET chừa dư hàng triệu ô).
let BATCH_MEMO_ = null;

function batchMemo_(key, open) {
  if (!BATCH_MEMO_) return open();
  if (!BATCH_MEMO_[key]) BATCH_MEMO_[key] = open();
  return BATCH_MEMO_[key];
}

function batchActions_() {
  return { submitExam: writeSubmissionLog_, mosSubmit: writeMosLog_ };
}

function submitBatch_(p) {
  // Đọc thẳng Properties (không qua cachedProp_): đặt/đổi mã có hiệu lực ngay; lô hiếm nên không tốn quota.
  const token = PropertiesService.getScriptProperties().getProperty('RELAY_TOKEN');
  if (!token) throw appError_('failed-precondition', 'Chưa bật nhận bài theo lô: đặt Script Properties RELAY_TOKEN.');
  if (typeof p.token !== 'string' || p.token !== token) throw appError_('permission-denied', 'RELAY_TOKEN không khớp.');
  const items = p.items;
  if (!Array.isArray(items) || !items.length || items.length > BATCH_MAX) {
    throw appError_('invalid-argument', 'items phải có 1..' + BATCH_MAX + ' bài');
  }
  const actions = batchActions_();
  const started = Date.now();
  BATCH_MEMO_ = {};
  try {
    return runBatch_(items, actions, started);
  } finally {
    BATCH_MEMO_ = null;
  }
}

function runBatch_(items, actions, started) {
  return {
    results: items.map(function (it) {
      // Hết thời gian: báo lỗi tạm để máy chủ gửi lại các bài còn lại ở lô sau.
      if (Date.now() - started > BATCH_TIME_BUDGET_MS) return { ok: false, code: 'deadline-exceeded', error: 'Hết thời gian lô' };
      const fn = it && Object.prototype.hasOwnProperty.call(actions, it.action) ? actions[it.action] : null;
      if (!fn) return { ok: false, code: 'invalid-argument', error: 'action' };
      try {
        return { ok: true, data: fn(it.payload) };
      } catch (err) {
        return { ok: false, code: (err && err.code) || 'internal', error: String((err && err.message) || err) };
      }
    }),
  };
}
