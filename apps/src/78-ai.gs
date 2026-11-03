// ====== TRỢ LÝ AI (Gemini) — proxy dùng KEY GIÁO VIÊN (Script Properties GEMINI_API_KEY) ======
// Web thử key cá nhân của người dùng trước (localStorage, gọi thẳng Gemini — js/services/ai-service.js);
// không có / hết hạn mức thì gọi qua đây. Key giáo viên CHỈ nằm ở Script Properties — học sinh F12 không thấy.
// 0 Firestore: chỉ xác thực người gọi ở aiAskStaff/aiConfig/aiStatus (authenticate_ nhớ 1 giờ như mọi route).
//
// Chống hao phí:
//   • Câu lệnh do máy chủ dựng từ dữ liệu có cấu trúc (aiBuild_) — không nhận câu lệnh tự do.
//   • Lưu đệm CacheService 6 giờ theo (việc + dữ liệu): nhiều em hỏi cùng 1 câu sai → 1 lượt Gemini.
//   • Trần lượt gọi Gemini THẬT (lượt dùng bản đệm không tính): tổng/ngày (AI_DAILY_MAX, Script Property, mặc định 800),
//     mỗi máy học sinh 30/ngày, mỗi tài khoản quản trị 150/ngày.
// aiBuild_ PHẢI giống hệt js/services/ai-core.js → build() (apps/__tests__/code-gs.test.js so 2 bản).

const AI_PUBLIC_TASKS = ['explain', 'quickQ'];
const AI_STAFF_TASKS = ['genQuiz', 'reteach'];
const AI_DEFAULT_MODEL = 'gemini-flash-latest';
const AI_DAILY_MAX_DEFAULT = 800;
const AI_CLIENT_MAX = 30;
const AI_STAFF_MAX = 150;
const AI_CACHE_SEC = 21600;

const AI_SYS_ = 'Bạn là trợ giảng Tin học (IC3 / IC3 Spark) thân thiện ở trường phổ thông Việt Nam. '
  + 'Trả lời bằng tiếng Việt chuẩn, ngắn gọn, chính xác, hợp lứa tuổi. Không bịa thông tin; '
  + 'nếu câu hỏi hoặc đáp án có vẻ sai thì nói rõ.';

function aiClip_(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n); }
function aiClipBlock_(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n); }
function aiInt_(v, a, b, d) { const n = Math.round(Number(v)); return isFinite(n) ? Math.max(a, Math.min(b, n)) : d; }
function aiGrade_(v) { const g = Math.round(Number(v)); return g >= 3 && g <= 12 ? g : 0; }
function aiDescribe_(v) {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.map(aiDescribe_).filter(Boolean).join('; ');
  if (typeof v === 'object') return Object.keys(v).map(function (k) { return k + ' → ' + aiDescribe_(v[k]); }).join('; ');
  return String(v);
}
function aiOptions_(a) { return (Array.isArray(a) ? a : []).slice(0, 8).map(function (x) { return aiClip_(aiDescribe_(x), 200); }).filter(Boolean); }
function aiLetters_(opts) { return opts.map(function (o, i) { return 'ABCDEFGH'.charAt(i) + '. ' + o; }).join('\n'); }
function aiForGrade_(g) { return g ? ' lớp ' + g : ''; }

/** Bản Apps Script của EduAICore.build(): { task, payload, system, user, json, maxTokens, temperature }. */
function aiBuild_(task, payload) {
  const p = payload || {};
  let n, user, json, maxTokens, temperature;
  if (task === 'explain') {
    n = { question: aiClip_(p.question, 900), type: aiClip_(p.type, 20), options: aiOptions_(p.options),
      correct: aiClip_(aiDescribe_(p.correct), 600), chosen: aiClip_(aiDescribe_(p.chosen), 600),
      explanation: aiClip_(p.explanation, 400), grade: aiGrade_(p.grade) };
    if (!(n.question && n.correct)) throw appError_('invalid-argument', 'Thiếu dữ liệu cho việc AI ' + task);
    user = 'Học sinh' + aiForGrade_(n.grade) + ' vừa trả lời SAI câu hỏi sau.\n'
      + 'Câu hỏi: ' + n.question + '\n'
      + (n.options.length ? 'Các phương án:\n' + aiLetters_(n.options) + '\n' : '')
      + 'Đáp án đúng: ' + n.correct + '\n'
      + 'Em đã chọn: ' + (n.chosen || '(bỏ trống)') + '\n'
      + (n.explanation ? 'Giải thích có sẵn: ' + n.explanation + '\n' : '')
      + 'Hãy viết cho em (xưng "em", tối đa 90 từ, không viết tiêu đề):\n'
      + '- Vì sao lựa chọn của em chưa đúng.\n- Vì sao đáp án đúng là đúng.\n- Một mẹo ngắn để nhớ.';
    json = false; maxTokens = 1024; temperature = 0.3;
  } else if (task === 'genQuiz') {
    n = { topic: aiClip_(p.topic, 200), source: aiClipBlock_(p.source, 6000), count: aiInt_(p.count, 1, 15, 5),
      level: ['dễ', 'vừa', 'khó'].indexOf(p.level) >= 0 ? p.level : 'vừa', grade: aiGrade_(p.grade), mix: !!p.mix };
    if (!(n.topic || n.source)) throw appError_('invalid-argument', 'Thiếu dữ liệu cho việc AI ' + task);
    user = 'Soạn ' + n.count + ' câu hỏi trắc nghiệm Tin học cho học sinh' + aiForGrade_(n.grade) + ', độ khó ' + n.level
      + (n.topic ? ', về chủ đề: ' + n.topic : '') + '.\n'
      + (n.source ? 'Chỉ dựa trên nội dung bài học sau:\n"""\n' + n.source + '\n"""\n' : '')
      + 'Yêu cầu: mỗi câu có 4 phương án ngắn gọn và đúng 1 đáp án đúng'
      + (n.mix ? '; được xen vài câu Đúng/Sai (2 phương án "Đúng", "Sai") và vài câu nhiều đáp án đúng' : '')
      + '. Phương án sai phải hợp lý, không đánh đố, không trùng nhau. Mỗi câu kèm giải thích 1–2 câu.\n'
      + 'Chỉ trả về JSON dạng: [{"question":"...","options":["...","..."],"correct":["nguyên văn phương án đúng"],"explanation":"..."}]';
    json = true; maxTokens = 8192; temperature = 0.7;
  } else if (task === 'reteach') {
    n = { question: aiClip_(p.question, 900), options: aiOptions_(p.options), correct: aiClip_(aiDescribe_(p.correct), 600),
      explanation: aiClip_(p.explanation, 400), wrong: aiInt_(p.wrong, 0, 100000, 0), students: aiInt_(p.students, 0, 100000, 0),
      scope: aiClip_(p.scope, 120), grade: aiGrade_(p.grade) };
    if (!(n.question && n.correct)) throw appError_('invalid-argument', 'Thiếu dữ liệu cho việc AI ' + task);
    user = 'Câu hỏi sau có ' + n.students + ' học sinh' + aiForGrade_(n.grade) + ' làm sai (' + n.wrong + ' lượt sai'
      + (n.scope ? ', phạm vi: ' + n.scope : '') + ').\n'
      + 'Câu hỏi: ' + n.question + '\n'
      + (n.options.length ? 'Các phương án:\n' + aiLetters_(n.options) + '\n' : '')
      + 'Đáp án đúng: ' + n.correct + '\n'
      + (n.explanation ? 'Giải thích có sẵn: ' + n.explanation + '\n' : '')
      + 'Với vai trò tổ trưởng chuyên môn Tin học, gợi ý cho giáo viên (tối đa 180 từ), gồm 3 mục có gạch đầu dòng:\n'
      + '**Vì sao học sinh hay sai:** những hiểu nhầm thường gặp.\n'
      + '**Giảng lại trong 3 phút:** 2–3 bước, có ví dụ gần gũi.\n'
      + '**Câu hỏi củng cố:** 1 câu hỏi mới tương tự, kèm đáp án.';
    json = false; maxTokens = 1536; temperature = 0.5;
  } else if (task === 'quickQ') {
    n = { topic: aiClip_(p.topic, 200), grade: aiGrade_(p.grade), count: aiInt_(p.count, 1, 8, 5) };
    if (!n.topic) throw appError_('invalid-argument', 'Thiếu dữ liệu cho việc AI ' + task);
    user = 'Soạn ' + n.count + ' câu hỏi nhanh để giáo viên hỏi miệng cả lớp' + aiForGrade_(n.grade) + ' sau bài: ' + n.topic + '.\n'
      + 'Mỗi câu ngắn (dưới 25 từ), không cần hình, có 4 phương án ngắn, đúng 1 đáp án đúng, giải thích dưới 20 từ.\n'
      + 'Chỉ trả về JSON dạng: [{"question":"...","options":["...","...","...","..."],"correct":["nguyên văn phương án đúng"],"explanation":"..."}]';
    json = true; maxTokens = 4096; temperature = 0.8;
  } else {
    throw appError_('invalid-argument', 'Việc AI không hợp lệ: ' + task);
  }
  return { task: task, payload: n, system: AI_SYS_, user: user, json: json, maxTokens: maxTokens, temperature: temperature };
}

function aiRequestBody_(b) {
  const gen = { temperature: b.temperature, maxOutputTokens: b.maxTokens };
  if (b.json) gen.responseMimeType = 'application/json';
  return { systemInstruction: { parts: [{ text: b.system }] }, contents: [{ role: 'user', parts: [{ text: b.user }] }], generationConfig: gen };
}
function aiClassify_(status, body) {
  const s = String(body || '');
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(s)) return 'quota';
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(s)) return 'key';
  if (status === 404 || /models\/[^ ]+ is not found|NOT_FOUND/i.test(s)) return 'model';
  if (status === 400 && /SAFETY|blocked/i.test(s)) return 'safety';
  if (status === 400) return 'bad-request';
  return 'busy';
}
const AI_KIND_MSG_ = {
  quota: 'Key hệ thống đã hết hạn mức Gemini hôm nay (lỗi 429).',
  key: 'Key hệ thống không hợp lệ hoặc đã bị khoá.',
  model: 'Model không tồn tại hoặc key chưa được dùng model này.',
  safety: 'Gemini từ chối trả lời nội dung này.',
  'bad-request': 'Yêu cầu không hợp lệ.',
  busy: 'Gemini đang bận — thử lại sau.',
};

/** Gọi Gemini 1 lần. Lỗi → appError_('ai-<loại>', câu tiếng Việt). */
function aiCallGemini_(key, model, b) {
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(aiRequestBody_(b)), muteHttpExceptions: true,
  });
  const code = res.getResponseCode(), body = res.getContentText();
  if (code !== 200) {
    const kind = aiClassify_(code, body);
    throw appError_('ai-' + kind, AI_KIND_MSG_[kind]);
  }
  let json = null;
  try { json = JSON.parse(body); } catch (e) { throw appError_('ai-busy', AI_KIND_MSG_.busy); }
  const c = json && json.candidates && json.candidates[0];
  const parts = (c && c.content && c.content.parts) || [];
  const text = parts.filter(function (x) { return x && !x.thought && typeof x.text === 'string'; }).map(function (x) { return x.text; }).join('').trim();
  if (!text && ((c && c.finishReason === 'SAFETY') || (json.promptFeedback && json.promptFeedback.blockReason))) throw appError_('ai-safety', AI_KIND_MSG_.safety);
  return text;
}

function aiModel_(props) {
  const m = props.getProperty('GEMINI_MODEL') || '';
  return /^[a-z0-9][a-z0-9.\-]{2,60}$/.test(m) ? m : AI_DEFAULT_MODEL;
}
function aiDay_() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd'); }
function aiDailyMax_(props) { const n = Number(props.getProperty('AI_DAILY_MAX')); return n > 0 ? n : AI_DAILY_MAX_DEFAULT; }
/** Số lượt gọi Gemini thật hôm nay (Script Property AI_COUNT = "yyyyMMdd:n"). */
function aiUsedToday_(props) {
  const v = String(props.getProperty('AI_COUNT') || '').split(':');
  return v[0] === aiDay_() ? Number(v[1]) || 0 : 0;
}

/** Lõi chung: dựng câu lệnh → bản đệm → trần lượt → gọi Gemini bằng key giáo viên → lưu đệm. */
function aiRun_(task, payload, ident, cap) {
  const b = aiBuild_(task, payload);
  const cache = CacheService.getScriptCache();
  const ck = 'ai1:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, task + '|' + b.user));
  const hit = cache.get(ck);
  if (hit) return { text: hit, cached: true };

  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw appError_('ai-no-key', 'Trường chưa cài key AI hệ thống.');
  const day = aiDay_();
  const mineKey = 'aiU:' + day + ':' + ident;
  const mine = Number(cache.get(mineKey)) || 0;
  if (mine >= cap) throw appError_('ai-limit', 'Đã dùng hết ' + cap + ' lượt AI của trường hôm nay trên máy/tài khoản này.');
  const used = aiUsedToday_(props);
  if (used >= aiDailyMax_(props)) throw appError_('ai-limit', 'Trường đã dùng hết lượt AI hôm nay — mai thử lại, hoặc dùng key cá nhân.');

  const model = aiModel_(props);
  const text = aiCallGemini_(key, model, b);
  if (!text) throw appError_('ai-empty', 'Gemini không trả về nội dung — thử lại.');
  cache.put(mineKey, String(mine + 1), AI_CACHE_SEC);
  props.setProperty('AI_COUNT', day + ':' + (used + 1));
  if (text.length < 90000) cache.put(ck, text, AI_CACHE_SEC);
  return { text: text, cached: false, model: model };
}

/** Công khai (học sinh không đăng nhập): chỉ việc nhẹ, có mã máy để đếm lượt. */
function aiAsk_(p) {
  if (AI_PUBLIC_TASKS.indexOf(p.task) < 0) throw appError_('permission-denied', 'Việc AI này cần đăng nhập tài khoản giáo viên.');
  const cid = String(p.cid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  if (cid.length < 8) throw appError_('invalid-argument', 'Thiếu mã máy.');
  return aiRun_(p.task, p.payload, 'c:' + cid, AI_CLIENT_MAX);
}
/** Tài khoản quản trị: mọi việc AI. */
function aiAskStaff_(p, who) {
  if (AI_PUBLIC_TASKS.indexOf(p.task) < 0 && AI_STAFF_TASKS.indexOf(p.task) < 0) throw appError_('invalid-argument', 'Việc AI không hợp lệ: ' + p.task);
  return aiRun_(p.task, p.payload, 'u:' + who.uid, AI_STAFF_MAX);
}
/** Admin cài / đổi / gỡ key hệ thống. Có key mới hoặc đổi model → gọi thử Gemini, lỗi thì KHÔNG lưu. */
function aiConfig_(p) {
  const props = PropertiesService.getScriptProperties();
  if (p.remove) { props.deleteProperty('GEMINI_API_KEY'); return aiStatus_(); }
  const model = p.model && /^[a-z0-9][a-z0-9.\-]{2,60}$/.test(p.model) ? p.model : aiModel_(props);
  const key = p.key ? String(p.key).trim() : props.getProperty('GEMINI_API_KEY');
  if (!key || !/^[A-Za-z0-9_\-]{20,120}$/.test(key)) throw appError_('invalid-argument', 'Key Gemini không đúng dạng.');
  aiCallGemini_(key, model, { system: 'Trả lời ngắn.', user: 'Trả lời đúng một từ: OK', json: false, maxTokens: 256, temperature: 0 });
  props.setProperty('GEMINI_API_KEY', key);
  props.setProperty('GEMINI_MODEL', model);
  if (p.dailyMax) props.setProperty('AI_DAILY_MAX', String(aiInt_(p.dailyMax, 10, 20000, AI_DAILY_MAX_DEFAULT)));
  return aiStatus_();
}
/** Tình trạng key hệ thống — KHÔNG bao giờ trả key. */
function aiStatus_() {
  const props = PropertiesService.getScriptProperties();
  return { configured: !!props.getProperty('GEMINI_API_KEY'), model: aiModel_(props), usedToday: aiUsedToday_(props), dailyMax: aiDailyMax_(props) };
}
