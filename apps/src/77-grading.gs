// ====== LUẬT CHẤM 1 CÂU (bản Apps Script của js/core/grading.js) ======
// Chưa có route nào gọi — nền cho chấm điểm phía máy chủ (docs/architecture/SERVER-GRADING.md).
// PHẢI giống hệt js/core/grading.js → questionStatus: apps/__tests__/code-gs.test.js so 2 bản trên
// TOÀN BỘ data/ic3 (đáp án đúng, bỏ trống, sai lệch 1 chỗ). Đổi bên này thì đổi cả bên kia.
// ans: câu trả lời dạng JSON (xem đầu js/core/grading.js). Trả 'correct' | 'incorrect' | 'skipped'.

function gradingKeys_(o) {
  return o && typeof o === 'object' ? Object.keys(o) : [];
}

function questionStatus_(q, ans) {
  switch (q.type) {
    case 'single':
      if (ans && (q.correct || []).indexOf(ans) !== -1) return 'correct';
      return ans ? 'incorrect' : 'skipped';

    case 'multi': {
      const user = (Array.isArray(ans) ? ans : []).slice().sort();
      if (!user.length) return 'skipped';
      return JSON.stringify(user) === JSON.stringify((q.correct || []).slice().sort()) ? 'correct' : 'incorrect';
    }

    case 'truefalse': {
      const a = ans || {};
      if (!gradingKeys_(a).length) return 'skipped';
      return (q.statements || []).every(function (st, j) { return a[j] === st.answer; }) ? 'correct' : 'incorrect';
    }

    case 'matching': {
      if (!(q.pairs && q.pairs.length && ans && gradingKeys_(ans).length)) return 'skipped';
      return q.pairs.every(function (p) { return ans[p.left] === p.right; }) ? 'correct' : 'incorrect';
    }

    case 'hotspot': {
      const sel = Array.isArray(ans) ? ans : [];
      if (!sel.length) return 'skipped';
      const want = (q.areas || []).filter(function (a) { return a.correct; }).map(function (a) { return a.id; }).sort();
      return JSON.stringify(sel.slice().sort()) === JSON.stringify(want) ? 'correct' : 'incorrect';
    }

    case 'list': {
      const a = ans || {};
      if (!gradingKeys_(a).length) return 'skipped';
      return (q.items || []).every(function (it, j) { return a[j] === it.correct; }) ? 'correct' : 'incorrect';
    }

    case 'classify': {
      const a = ans || {};
      const items = q.items || [];
      if (!items.some(function (it) { return a[it.text] !== undefined; })) return 'skipped';
      return items.every(function (it) { return a[it.text] === it.zone; }) ? 'correct' : 'incorrect';
    }

    case 'ordering': {
      if (!(Array.isArray(ans) && ans.length)) return 'skipped';
      return JSON.stringify(ans) === JSON.stringify(q.items || []) ? 'correct' : 'incorrect';
    }

    case 'dragfill':
    case 'selectfill': {
      const a = ans || {};
      if (!gradingKeys_(a).length) return 'skipped';
      return (q.blanks || []).every(function (text, bi) { return a[bi] === text; }) ? 'correct' : 'incorrect';
    }

    default:
      return 'skipped';
  }
}

// ====== CHẤM LẠI BÀI KIỂM TRA (bước 1 — EduBackend.serverGrading.mode = 'verify', mặc định 'off') ======
// Web gửi kèm câu trả lời DẠNG CÂU GỐC (js/quiz-engine.js § wireAnswerOf) + file khối của đề.
// Máy chủ tra đáp án theo uid trong file đó (raw.githubusercontent.com — repo công khai, không cần
// token), chấm bằng questionStatus_, ghi điểm máy chủ vào ChiTiet (sv) và gắn ⚠️ nếu lệch điểm gửi lên.
// Lỗi tải đề / câu lạ KHÔNG chặn ghi bài nộp — chỉ ghi chú "chưa chấm lại".

const BANK_FILES = ['IC3__LV1.json', 'IC3__LV2.json', 'IC3__LV3.json', 'Spark__LV1.json', 'Spark__LV2.json',
  'Spark__LV3.json', 'MOS__Word.json', 'MOS__Excel.json', 'MOS__PowerPoint.json'];
const ANSWER_KEY_CACHE_SEC = 6 * 3600;
const VERIFY_MAX_ANSWERS = 300;

/** Chỉ giữ các trường questionStatus_ cần — khoá đáp án gọn để cache theo từng câu. */
function answerKeyOf_(q) {
  const k = { type: q.type };
  if (q.correct) k.correct = q.correct;
  if (q.statements) k.statements = q.statements.map(function (s) { return { answer: s.answer }; });
  if (q.pairs) k.pairs = q.pairs.map(function (p) { return { left: p.left, right: p.right }; });
  if (q.areas) k.areas = q.areas.map(function (a) { return { id: a.id, correct: !!a.correct }; });
  if (q.items) {
    k.items = q.items.map(function (it) {
      if (q.type === 'list') return { correct: it.correct };
      if (q.type === 'classify') return { text: it.text, zone: it.zone };
      return it; // ordering: chuỗi
    });
  }
  if (q.blanks) k.blanks = q.blanks;
  return k;
}

/** { uid: khoá đáp án } cho các uid cần — bản đệm trước, thiếu thì tải cả file khối 1 lần. */
function answerKeys_(bank, uids) {
  const cache = CacheService.getScriptCache();
  const prefix = 'ak:' + bank + ':';
  const out = {};
  const hit = cache.getAll(uids.map(function (u) { return prefix + u; })) || {};
  uids.forEach(function (u) { if (hit[prefix + u]) out[u] = JSON.parse(hit[prefix + u]); });
  if (Object.keys(out).length === uids.length) return out;
  // File khối vừa tải mà vẫn thiếu uid (câu ngoài ngân hàng) → không tải lại ~1 MB cho MỖI bài nộp
  // (UrlFetch ~20.000 lượt/ngày). Thiếu do bản đệm bị đẩy ra thì cờ này cũng thường đã mất theo.
  if (cache.get(prefix + '__loaded')) return out;

  const url = 'https://raw.githubusercontent.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/' + GITHUB_BRANCH + '/data/ic3/' + bank;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw appError_('unavailable', 'Không tải được ' + bank + ' (' + res.getResponseCode() + ')');
  const all = {};
  (function collect(node) {
    if (Array.isArray(node)) {
      node.forEach(function (x) {
        if (x && typeof x === 'object' && typeof x.type === 'string' && x.uid) all[x.uid] = answerKeyOf_(x);
        else collect(x);
      });
    } else if (node && typeof node === 'object') {
      Object.keys(node).forEach(function (k) { collect(node[k]); });
    }
  })(JSON.parse(res.getContentText('UTF-8')));
  const put = {};
  Object.keys(all).forEach(function (u) { put[prefix + u] = JSON.stringify(all[u]); });
  const keys = Object.keys(put);
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = {};
    keys.slice(i, i + 500).forEach(function (k) { chunk[k] = put[k]; });
    cache.putAll(chunk, ANSWER_KEY_CACHE_SEC);
  }
  cache.put(prefix + '__loaded', '1', 10 * 60);
  uids.forEach(function (u) { if (all[u]) out[u] = all[u]; });
  return out;
}

/**
 * Chấm lại 1 bài. answers: [[uid, câu trả lời dạng câu gốc], ...]
 * @returns {{ total, correct, score, unknown }} score = % như web (làm tròn)
 */
function verifyAnswers_(bank, answers) {
  const uids = answers.map(function (a) { return a[0]; });
  const keys = answerKeys_(bank, uids.filter(function (u, i) { return uids.indexOf(u) === i; }));
  let correct = 0, unknown = 0;
  answers.forEach(function (a) {
    const q = keys[a[0]];
    if (!q) { unknown++; return; }
    if (questionStatus_(q, a[1] === null ? undefined : a[1]) === 'correct') correct++;
  });
  const total = answers.length;
  return { total: total, correct: correct, unknown: unknown, score: total ? Math.round((correct / total) * 100) : 0 };
}

/** Kiểm tra trường answers/bank của bài nộp (gọi từ validateSubmission_). */
function validateWireAnswers_(p, bad) {
  if (p.answers === undefined || p.answers === null) return;
  if (BANK_FILES.indexOf(p.bank) === -1) bad('bank');
  if (!Array.isArray(p.answers) || !p.answers.length || p.answers.length > VERIFY_MAX_ANSWERS) bad('answers');
  if (JSON.stringify(p.answers).length > 60000) bad('answers');
  p.answers.forEach(function (a) {
    if (!Array.isArray(a) || a.length !== 2 || typeof a[0] !== 'string' || !/^[^<>"'`&\r\n]{3,120}$/.test(a[0])) bad('answers');
  });
}

/** Ghi kết quả chấm lại lên payload trước khi ghi Sheet. Không bao giờ ném lỗi. */
function applyServerGrading_(payload) {
  if (!payload.answers || payload.examMode !== 'test') return;
  payload.detail = payload.detail || {};
  let v;
  try {
    v = verifyAnswers_(payload.bank, payload.answers);
  } catch (e) {
    payload.detail.sk = 'loi';
    return;
  }
  if (v.unknown) { payload.detail.sk = 'thieu'; return; } // câu ngoài ngân hàng (đề tự soạn...) — không kết luận
  payload.detail.sv = v.score;
  const sent = Number(payload.score);
  if (sent === v.score) { payload.detail.sk = 'ok'; return; }
  payload.detail.sk = 'lech';
  payload.status = ('⚠️ Điểm gửi lên ' + sent + '% khác điểm máy chủ chấm ' + v.score + '%' +
    (payload.status && payload.status !== 'OK' ? ' · ' + payload.status : '')).slice(0, 300);
}
