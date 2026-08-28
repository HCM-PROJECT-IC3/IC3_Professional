/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         EDUQUIZ IC3 — QUIZ ENGINE UPGRADE MODULE               ║
 * ║  Vanilla JS · Tương thích với cấu trúc index.html hiện có      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * HƯỚNG DẪN TÍCH HỢP:
 * 1. Xóa khối <script> hiện tại trong index.html
 * 2. Thay bằng: <script src="quiz-engine-upgrade.js"></script>
 *    HOẶC: Copy toàn bộ nội dung file này vào trong thẻ <script> của index.html
 *
 * CÁC CẢI TIẾN SO VỚI VERSION CŨ:
 * ─────────────────────────────────────────────────────────────────
 * ✅ Task 1: fetch() quiz_data.json → window.quizRepository (toàn cục)
 * ✅ Task 2: Render danh mục + cấp độ + minitest từ JSON
 * ✅ Task 3: Xử lý đầy đủ 4 loại câu hỏi (single/multi/truefalse/matching)
 *           - Hiển thị image_file từ thư mục img/
 *           - Nút CÓ/KHÔNG hoặc ĐÚNG/SAI động theo label_true/label_false
 *           - Multi: kiểm tra đúng theo mảng correct (thứ tự không quan trọng)
 * ✅ Task 4: Giữ nguyên anti-cheat (tabSwitch, clicks, qTime)
 *           Chấm điểm chính xác theo cấu trúc JSON
 * ✅ BONUS:  window.quizRepository — truy xuất toàn cục từ console/devtools
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

/* ============================================================
   § 0 — GLOBAL QUIZ REPOSITORY (Task 1)
   Sau khi fetch, dữ liệu có thể truy xuất qua window.quizRepository
   ============================================================ */
window.quizRepository = null;

/* ============================================================
   § 0b — LAZY DATA LOADING (data/ic3/meta.json + data/ic3/<file>.json)
   ────────────────────────────────────────────────────────────
   Thay vì tải toàn bộ quiz_data.json (~1MB) ngay khi mở trang, ta:
     1. Tải data/ic3/meta.json (vài KB) → đủ để đổ 3 dropdown lobby
        và hiển thị số câu/loại câu hỏi (không cần câu hỏi thật).
     2. Chỉ khi học sinh bấm "Bắt đầu thi", mới tải file câu hỏi đầy
        đủ của ĐÚNG khối đang chọn (data/ic3/<cat>__<level>.json).
     3. Cache lại theo levelKey để đổi qua đổi lại minitest cùng khối
        không phải tải lại.
   Nếu vì lý do nào đó không tìm thấy meta.json (vd. dự án cũ chưa
   chạy scripts/split-quiz-data.py), tự động rơi về cách cũ: tải
   nguyên quiz_data.json — đảm bảo không phá vỡ trang đang chạy.
   ============================================================ */
const _levelCache   = new Map(); // "CAT__LV" → { minitests: {...} }   (bộ nhớ RAM, mất khi reload — KHÔNG lưu localStorage nữa, nên sửa file JSON là lần tải trang kế tiếp thấy ngay, không cần xoá cache tay)
const _levelPending  = new Map(); // "CAT__LV" → Promise                (chống fetch trùng khi bấm nhanh)

function _levelKey(catId, levelId) {
  return `${catId}__${levelId}`;
}

/**
 * Tải đầy đủ câu hỏi của 1 level, trả về { minitests }.
 * Thứ tự ưu tiên (mỗi bước chỉ tải đúng 1 lần, không tải thừa):
 *   1. _levelCache      — đã có sẵn trong RAM của lần thi trước đó cùng phiên (mất khi reload trang)
 *   2. fetch data/ic3/<file>.json — file gọn theo từng khối (lazy-load thật sự), luôn tải MỚI từ mạng
 *   3. quizFullData / quiz_data.json — chỉ dùng khi dự án chưa split dữ liệu
 * _levelPending đảm bảo nếu học sinh đổi qua đổi lại dropdown thật nhanh,
 * cùng 1 khối không bị gọi fetch() song song nhiều lần.
 *
 * LƯU Ý: trước đây có thêm 1 lớp cache bền trong localStorage (còn sống qua
 * nhiều lần ghé trang, chỉ hết hạn khi đổi field "version" trong meta.json).
 * Lớp này đã bị GỠ BỎ theo yêu cầu — vì khi sửa trực tiếp file JSON câu hỏi
 * (vd. chỉnh lại toạ độ % của câu hotspot) mà không tự tay cập nhật
 * "version" trong meta.json, trình duyệt vẫn âm thầm phát dữ liệu CŨ từ
 * localStorage, khiến tưởng như sửa hoài không lên. Giờ mỗi lần tải trang
 * mới sẽ luôn fetch() thẳng từ file JSON hiện tại trên server.
 */
async function _fetchLevelData(catId, levelId) {
  const key = _levelKey(catId, levelId);
  if (_levelCache.has(key)) return _levelCache.get(key);
  if (_levelPending.has(key)) return _levelPending.get(key); // đang tải rồi → chờ chung 1 promise

  const promise = (async () => {
    // ── lazy-load file gọn theo khối (dự án đã chạy split-quiz-data.py) ──
    const metaLevel = _findMetaLevel(catId, levelId);
    if (metaLevel?.file) {
      try {
        const res = await fetch(`data/ic3/${metaLevel.file}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const full = await res.json();
        return full;
      } catch (err) {
        console.warn(`[EduQuiz] Không tải được data/ic3/${metaLevel.file}, thử fallback quiz_data.json`, err.message);
      }
    }

    // ── Bước 4a: đã có sẵn toàn bộ dữ liệu trong quizFullData ───────
    if (window.quizFullData) {
      const cat = window.quizFullData.categories?.find(c => c.id === catId);
      const lv  = cat?.levels?.find(l => l.id === levelId);
      if (lv) return lv;
    }

    // ── Bước 4b: tải nguyên quiz_data.json 1 lần rồi tự cache ──
    if (!window.quizFullData) {
      try {
        const res = await fetch('quiz_data.json', { cache: 'no-store' });
        if (res.ok) window.quizFullData = await res.json();
      } catch (err) {
        console.warn('[EduQuiz] Không tải được quiz_data.json (fallback cuối):', err.message);
      }
    }
    const cat = window.quizFullData?.categories?.find(c => c.id === catId);
    const lv  = cat?.levels?.find(l => l.id === levelId);
    return lv || { minitests: {} };
  })();

  _levelPending.set(key, promise);
  const result = await promise;
  _levelCache.set(key, result);
  _levelPending.delete(key);
  return result;
}

/**
 * Tải trước (prefetch) dữ liệu của 1 khối ngay khi học sinh vừa chọn xong
 * category/level trong lobby — tận dụng thời gian họ gõ tên/lớp/trường để
 * tải ngầm, giúp lúc bấm "Bắt đầu thi" gần như tức thì (0 chờ đợi).
 * Không throw lỗi ra ngoài vì đây chỉ là tối ưu UX, không phải luồng chính.
 */
function _prefetchLevelData(catId, levelId) {
  if (!catId || !levelId) return;
  _fetchLevelData(catId, levelId).catch(() => {});
}

function _findMetaLevel(catId, levelId) {
  const cat = State.quizData?.categories?.find(c => c.id === catId);
  return cat?.levels?.find(l => l.id === levelId);
}

/**
 * State.quizData.minitests[name] có thể là:
 *  - mảng câu hỏi đầy đủ  → [{ type, question, ... }, ...]   (chế độ fallback/quiz_data.json)
 *  - object thống kê gọn  → { count: 45, types: { single: 11, ... } } (chế độ meta.json lazy-load)
 * 2 hàm dưới giúp phần render lobby dùng chung 1 code cho cả 2 dạng.
 */
function _mtCount(mt) {
  if (!mt) return 0;
  return Array.isArray(mt) ? mt.length : (mt.count || 0);
}
function _mtTypeCounts(mt) {
  if (!mt) return {};
  if (Array.isArray(mt)) {
    const counts = {};
    mt.forEach(q => { counts[q.type] = (counts[q.type] || 0) + 1; });
    return counts;
  }
  return mt.types || {};
}

/* ============================================================
   § 1b — MINITEST "TỔNG HỢP" (random, chia đều theo chủ đề)
   Không đụng tới quiz_data.json / data/ic3/*.json — chỉ trộn ở
   phía client mỗi lần học sinh bấm "Bắt đầu thi", nên luôn mới
   ngẫu nhiên và không cần chạy lại split-quiz-data.py.
   ============================================================ */
const RANDOM_MIX_KEY   = '__RANDOM_MIX__';
const RANDOM_MIX_TOTAL_DEFAULT = 40; // fallback nếu không tra được số câu chuẩn bên dưới

// Số câu "Tổng hợp" theo ĐÚNG chuẩn đề thi thật (khớp bảng số câu/thời gian
// chính thức của từng khối) — key = "<categoryId>__<levelId>", vd "IC3__LV1".
const RANDOM_MIX_COUNTS = {
  'Spark__LV1': 31,
  'Spark__LV2': 36,
  'Spark__LV3': 42,
  'IC3__LV1':   45,
  'IC3__LV2':   45,
  'IC3__LV3':   40,
};

/** Lấy số câu "Tổng hợp" chuẩn cho đúng catId/levelId, fallback về mặc định nếu không có trong bảng. */
function _randomMixTotalFor(catId, levelId) {
  return RANDOM_MIX_COUNTS[`${catId}__${levelId}`] ?? RANDOM_MIX_TOTAL_DEFAULT;
}

function _shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Trộn câu hỏi TỔNG HỢP: chia đều số câu cho từng chủ đề (7 chủ đề IC3),
 * nếu 1 chủ đề không đủ câu thì phần thiếu được san sẻ ngẫu nhiên
 * cho các chủ đề khác còn dư (để vẫn cố gắng đạt đủ tổng số mong muốn).
 * @param {Object} minitestsFull - { "1. Căn bản...": [câu hỏi...], ... } (mảng ĐẦY ĐỦ, không phải bản đếm gọn)
 * @param {number} totalWanted   - tổng số câu muốn lấy
 * @returns {Array} mảng câu hỏi đã trộn ngẫu nhiên, sẵn sàng đưa vào prepareQuestions()
 */
function buildRandomMixQuestions(minitestsFull, totalWanted) {
  const topics = Object.keys(minitestsFull || {});
  if (topics.length === 0) return [];

  const avail = {};
  topics.forEach(t => { avail[t] = (minitestsFull[t] || []).length; });

  const base = Math.floor(totalWanted / topics.length);
  let remainder = totalWanted - base * topics.length;

  const want = {};
  topics.forEach(t => { want[t] = base; });
  _shuffleArr(topics).forEach(t => {
    if (remainder > 0) { want[t] += 1; remainder--; }
  });

  // Chủ đề không đủ câu → dồn phần thiếu, san sẻ lại cho chủ đề còn dư chỗ
  let deficit = 0;
  topics.forEach(t => {
    if (want[t] > avail[t]) { deficit += want[t] - avail[t]; want[t] = avail[t]; }
  });
  let guard = 0;
  while (deficit > 0 && guard < 1000) {
    guard++;
    const spare = topics.filter(t => avail[t] > want[t]);
    if (spare.length === 0) break;
    for (const t of _shuffleArr(spare)) {
      if (deficit <= 0) break;
      if (avail[t] > want[t]) { want[t] += 1; deficit--; }
    }
  }

  let pool = [];
  topics.forEach(t => {
    pool = pool.concat(_shuffleArr(minitestsFull[t] || []).slice(0, want[t]));
  });
  return _shuffleArr(pool);
}

/* ============================================================
   § 1 — STATE
   Giữ nguyên cấu trúc State để không phá vỡ anti-cheat
   ============================================================ */
const State = {
  quizData:  null,   // alias → window.quizRepository
  questions: [],
  answers:   {},     // qi → value (string | string[] | {j: 'true'|'false'})
  flags:     new Set(),
  current:   0,
  timer:     null,
  timeLeft:  3000,
  matching:  {},     // qi → { left: right }
  matchSel:  {},
  hotspot:   {},     // qi → Set<areaId> đã bấm chọn
  list:      {},     // qi → { itemIndex: chosenOptionText }        (type = "list")
  classify:  {},     // qi → { itemText: zoneLabel }                (type = "classify")
  ordering:  {},     // qi → [itemText, ...] thứ tự hiện tại         (type = "ordering")
  fillblank: {},     // qi → { blankIndex: chosenText }             (type = "dragfill" | "selectfill")
  session:   {}
};

/* ============================================================
   § 2 — ANTI-CHEAT: VISIBILITY & CLICK TRACKING  (Task 4)
   Giữ nguyên 100% logic chống gian lận
   ============================================================ */
document.addEventListener('visibilitychange', () => {
  if (!State.session.startTime) return;
  if (document.hidden) {
    State.session.tabSwitches++;
    flushQTime(State.current);
  } else {
    State.session.qStart[State.current] = Date.now();
  }
});

window.addEventListener('blur', () => {
  if (State.session.startTime) flushQTime(State.current);
});

function flushQTime(qi) {
  const t = State.session.qStart?.[qi];
  if (!t) return;
  State.session.qTimes[qi] = (State.session.qTimes[qi] || 0) + Math.round((Date.now() - t) / 1000);
  delete State.session.qStart[qi];
}

function beginQTime(qi) {
  flushQTime(State.current);
  State.session.qStart[qi] = Date.now();
}

/* ============================================================
   § 3 — LOAD DATA  (Task 1 — Fetch + window.quizRepository)
   ============================================================ */

/**
 * Nạp dữ liệu từ quiz_data.json vào window.quizRepository và State.quizData.
 * Nếu fetch thất bại → dùng DEMO_DATA dự phòng.
 */
async function loadData() {
  // Hiển thị trạng thái loading (nếu cần)
  _setLoadingState(true);

  try {
    // ── Ưu tiên: meta.json nhẹ (vài KB) để dựng lobby ─────────
    const res = await fetch('data/ic3/meta.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = await res.json();

    window.quizRepository = meta;
    State.quizData = meta;

    console.info(
      `%c[EduQuiz] ✅ meta.json nạp thành công (lazy-load câu hỏi theo khối)!`,
      'color:#00c9a0;font-weight:700'
    );
    _logRepositorySummary(meta);

  } catch (err) {
    // ── Fallback 1: dự án chưa chạy scripts/split-quiz-data.py
    //    → quay lại tải nguyên quiz_data.json như bản cũ ────────
    console.warn('[EduQuiz] ⚠ Không tải được data/ic3/meta.json, thử quiz_data.json...', err.message);
    try {
      const res2 = await fetch('quiz_data.json', { cache: 'no-store' });
      if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
      const data = await res2.json();
      window.quizFullData = data; // dùng làm nguồn cho _fetchLevelData()
      window.quizRepository = data;
      State.quizData = data;
      _logRepositorySummary(data);
    } catch (err2) {
      // ── Fallback 2: dùng dữ liệu demo để trang không trắng ────
      console.warn('[EduQuiz] ⚠ Không tải được quiz_data.json. Dùng DEMO_DATA.', err2.message);
      window.quizRepository = DEMO_DATA;
      State.quizData = DEMO_DATA;
    }
  }

  _setLoadingState(false);
  initLobby();
}

/** In tóm tắt cấu trúc dữ liệu ra console để debug dễ hơn */
function _logRepositorySummary(data) {
  let totalQ = 0;
  data.categories?.forEach(cat => {
    cat.levels?.forEach(lv => {
      Object.values(lv.minitests || {}).forEach(mt => { totalQ += _mtCount(mt); });
    });
  });
  const categories = data.categories?.map(c => c.name).join(', ');
  console.info(
    `%c[EduQuiz] 📦 ${data.categories?.length} danh mục · ${totalQ} câu hỏi\n` +
    `  Danh mục: ${categories}\n` +
    `  Truy xuất tại: window.quizRepository`,
    'color:#6c63ff'
  );
}

function _setLoadingState(isLoading) {
  const btn = document.getElementById('btnStart');
  if (!btn) return;
  if (isLoading) {
    btn.textContent = '⏳ Đang tải dữ liệu...';
    btn.disabled = true;
  }
  // Trạng thái enabled/disabled sau load sẽ do refreshMeta() quyết định
}

/* ============================================================
   § 4 — LOBBY: RENDER MENU  (Task 2)
   Tự động sinh danh sách Category → Level → Minitest từ JSON
   ============================================================ */

function initLobby() {
  const catSel = document.getElementById('categorySelect');
  const lvlSel = document.getElementById('levelSelect');
  const mtSel  = document.getElementById('minitestSelect');

  // ── Đổ danh mục (categories) ───────────────────────────────
  catSel.innerHTML = '';
  (State.quizData?.categories || []).forEach(cat => {
    const opt = new Option(cat.name, cat.id);
    // Màu theo category nếu có
    if (cat.color) opt.style.color = cat.color;
    catSel.appendChild(opt);
  });

  // ── Hàm cập nhật Level khi đổi Category ───────────────────
  const refreshLevels = () => {
    const cat = _findCategory(catSel.value);
    lvlSel.innerHTML = '';
    (cat?.levels || []).forEach(lv => {
      lvlSel.appendChild(new Option(lv.name, lv.id));
    });
    refreshMinitests();
    _prefetchLevelData(catSel.value, lvlSel.value); // tải ngầm trước khi bấm "Bắt đầu thi"
  };

  // ── Hàm cập nhật Minitest khi đổi Level ───────────────────
  const refreshMinitests = () => {
    const cat = _findCategory(catSel.value);
    const lv  = cat?.levels?.find(l => l.id === lvlSel.value);
    mtSel.innerHTML = '';

    const minitests  = lv?.minitests || {};
    const topicNames = Object.keys(minitests);
    topicNames.forEach(name => {
      const mt  = minitests[name];
      const opt = new Option(
        `${name} (${_mtCount(mt)} câu)`,
        name
      );
      mtSel.appendChild(opt);
    });

    // ── Tùy chọn "Tổng hợp" — random chia đều các chủ đề của Level này ──
    if (topicNames.length > 1) {
      const totalAvail = topicNames.reduce((s, n) => s + _mtCount(minitests[n]), 0);
      const wanted = Math.min(_randomMixTotalFor(catSel.value, lvlSel.value), totalAvail);
      if (wanted > 0) {
        const opt = new Option(
          `📚 Tổng hợp — ngẫu nhiên chia đều ${topicNames.length} chủ đề (${wanted} câu)`,
          RANDOM_MIX_KEY
        );
        mtSel.appendChild(opt);
      }
    }

    refreshMeta();
  };

  // ── Cập nhật chip thống kê + nút Bắt đầu ──────────────────
  const refreshMeta = () => {
    const cat = _findCategory(catSel.value);
    const lv  = cat?.levels?.find(l => l.id === lvlSel.value);
    const isRandomMix = mtSel.value === RANDOM_MIX_KEY;
    const minitests   = lv?.minitests || {};
    const mt    = isRandomMix ? null : minitests[mtSel.value];
    const count = isRandomMix
      ? Math.min(_randomMixTotalFor(catSel.value, lvlSel.value), Object.keys(minitests).reduce((s, n) => s + _mtCount(minitests[n]), 0))
      : _mtCount(mt);
    const el  = document.getElementById('minitestMeta');

    if (count) {
      // Minitest có câu hỏi — xoá cảnh báo đỏ (nếu còn sót từ lần chọn
      // trước đó có 0 câu), không hiện lại chip số câu/phân loại vì tên
      // minitest trong dropdown đã có sẵn "(N câu)".
      el.innerHTML = '';
    } else {
      el.innerHTML = '<span class="chip" style="color:var(--red)">⚠ Không có câu hỏi</span>';
    }

    // Kích hoạt nút Bắt đầu chỉ khi đủ thông tin
    const name   = document.getElementById('studentName')?.value.trim();
    const cls    = document.getElementById('studentClass')?.value.trim();
    const school = document.getElementById('studentSchool')?.value.trim();
    const btn    = document.getElementById('btnStart');
    if (btn) {
      btn.disabled = !(count && name && cls && school);
      btn.textContent = btn.disabled ? '▶ Bắt đầu' : '▶ Bắt đầu';
    }
  };

  // ── Gắn sự kiện ───────────────────────────────────────────
  catSel.addEventListener('change', refreshLevels);
  lvlSel.addEventListener('change', refreshMinitests);
  mtSel .addEventListener('change', refreshMeta);
  // Trường/Lớp/Họ và tên giờ là <select> đổ từ roster thật (js/lobby-roster.js)
  // thay vì gõ tay — lắng nghe cả 'change' lẫn 'input' cho chắc chắn.
  ['studentName', 'studentClass', 'studentSchool'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', refreshMeta);
    document.getElementById(id)?.addEventListener('input', refreshMeta);
  });

  // Khởi tạo lần đầu
  refreshLevels();
}

/** Tìm category theo id từ quizRepository */
function _findCategory(catId) {
  return State.quizData?.categories?.find(c => c.id === catId);
}

/* ============================================================
   § 5 — START EXAM  (Task 3 — nạp đúng minitest từ JSON)
   ============================================================ */

async function startExam() {
  const name   = document.getElementById('studentName')?.value.trim();
  const cls    = document.getElementById('studentClass')?.value.trim();
  const school = document.getElementById('studentSchool')?.value.trim();
  const catId  = document.getElementById('categorySelect')?.value;
  const lvlId  = document.getElementById('levelSelect')?.value;
  const mtName = document.getElementById('minitestSelect')?.value;

  if (!name || !cls || !school) {
    alert('⚠ Vui lòng điền đầy đủ thông tin học sinh!');
    return;
  }

  const cat = _findCategory(catId);
  const lv  = cat?.levels?.find(l => l.id === lvlId);

  // ── Tải câu hỏi đầy đủ của ĐÚNG khối này (lazy-load) ──────
  const btn = document.getElementById('btnStart');
  const btnPrevText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tải câu hỏi...'; }

  const fullLevel = await _fetchLevelData(catId, lvlId);
  const isRandomMix = mtName === RANDOM_MIX_KEY;
  const rawQs = isRandomMix
    ? buildRandomMixQuestions(fullLevel?.minitests, _randomMixTotalFor(catId, lvlId))
    : fullLevel?.minitests?.[mtName];

  if (btn) { btn.disabled = false; btn.textContent = btnPrevText; }

  if (!rawQs || rawQs.length === 0) {
    alert('⚠ Không tìm thấy câu hỏi cho bài này. Vui lòng kiểm tra dữ liệu trong data/ic3/.');
    return;
  }

  // Tên minitest hiển thị/ghi log — dùng tên thân thiện thay vì key nội bộ
  const mtDisplayName = isRandomMix
    ? `Tổng hợp — ngẫu nhiên (${rawQs.length} câu, chia đều ${Object.keys(fullLevel?.minitests || {}).length} chủ đề)`
    : mtName;

  // ── Deep clone + chuẩn bị (shuffle order & options) ───────
  State.questions = prepareQuestions(rawQs);
  State.answers   = {};
  State.flags     = new Set();
  State.current   = 0;
  State.matching  = {};
  State.matchSel  = {};
  State.hotspot   = {};
  State.list      = {};
  State.classify  = {};
  State.ordering  = {};
  State.fillblank = {};
  State.timeLeft  = parseInt(document.getElementById('timeSelect')?.value || '3000', 10);

  // ── Khởi tạo session (dữ liệu anti-cheat) ─────────────────
  State.session = {
    studentName:   name,
    studentClass:  cls,
    studentSchool: school,
    category:      cat?.name  || catId,
    level:         lv?.name   || lvlId,
    minitest:      mtDisplayName,
    isRandomMix:   isRandomMix, // true = bài "Tổng hợp" (ngẫu nhiên chia đều chủ đề) — dùng để xét mở khóa Khu Vui Chơi
    startTime:     Date.now(),
    totalTime:     State.timeLeft,
    tabSwitches:   0,
    clicks:        0,
    qTimes:        {},
    qStart:        { 0: Date.now() },
    timedOut:      false,
  };

  // ── Chuyển màn hình ────────────────────────────────────────
  document.getElementById('lobby').style.display  = 'none';
  document.getElementById('exam').style.display   = 'flex';
  document.getElementById('result').style.display = 'none';
  document.getElementById('adminEntryLink')?.style.setProperty('display', 'none');

  const info = document.getElementById('topbarInfo');
  if (info) info.textContent = `👤 ${name} · ${cls} · ${mtDisplayName}`;

  buildSidebar();
  _restoreSidebarState();
  renderQuestion(0);
  startTimer();
}

/* ============================================================
   § 6 — PREPARE QUESTIONS
   Shuffle thứ tự câu hỏi và options, giữ nguyên correct[]
   ============================================================ */

function prepareQuestions(rawQs) {
  const qs = shuffle(JSON.parse(JSON.stringify(rawQs)));

  qs.forEach(q => {
    // Xử lý imageUrl từ image_file nếu chưa có
    if (!q.imageUrl && q.image_file) {
      q.imageUrl = `img/${q.image_file}`;
    }

    // Shuffle options cho single và multi
    if ((q.type === 'single' || q.type === 'multi') && Array.isArray(q.options)) {
      q.options = shuffle(q.options);
      // correct[] tham chiếu theo nội dung text → vẫn đúng sau shuffle
    }

    // Shuffle statements cho truefalse
    if (q.type === 'truefalse' && Array.isArray(q.statements)) {
      q.statements = shuffle(q.statements);
    }

    // Chuẩn bị cột nối cho matching
    if (q.type === 'matching' && Array.isArray(q.pairs) && q.pairs.length > 0) {
      q._leftShuffled  = shuffle(q.pairs.map(p => p.left));
      q._rightShuffled = shuffle([...new Set(q.pairs.map(p => p.right))]);
    }

    // Xáo thứ tự các dòng cho "list" (mỗi dòng tự có options riêng, không ảnh hưởng đáp án)
    if (q.type === 'list' && Array.isArray(q.items)) {
      q.items = shuffle(q.items);
    }

    // "classify": xáo thứ tự item cần phân loại + thứ tự hiển thị zone
    // q.distractors (nếu có): thẻ "mồi nhử" không thuộc khung nào — không
    // tính vào chấm điểm, chỉ trộn chung vào khay để hiển thị cho tự nhiên.
    if (q.type === 'classify' && Array.isArray(q.items)) {
      q.items      = shuffle(q.items);
      // Mỗi zone có thể là chuỗi (chữ) HOẶC object {label, image_file} (ảnh minh
      // họa thay cho tiêu đề chữ — vd. hình cổng kết nối phía trên ô đích).
      // "label" luôn là khoá định danh (data-zone), không nhất thiết hiển thị.
      q._zonesShow = Array.isArray(q.zones)
        ? shuffle(q.zones.map(z => (typeof z === 'string' ? { label: z } : z)))
        : [];
      q._poolShow  = shuffle(q.items.concat(Array.isArray(q.distractors) ? q.distractors : []));
    }

    // "ordering": items là THỨ TỰ ĐÚNG (nguồn dữ liệu gốc) — tạo bản xáo trộn
    // riêng để hiển thị ban đầu, đáp án đúng luôn so với q.items nguyên bản.
    if (q.type === 'ordering' && Array.isArray(q.items)) {
      q._displayOrder = shuffle(q.items);
    }

    // "dragfill" / "selectfill": xáo thứ tự wordBank hiển thị (không ảnh
    // hưởng đáp án vì chấm điểm so sánh theo NỘI DUNG chữ của từng chỗ trống)
    if ((q.type === 'dragfill' || q.type === 'selectfill') && Array.isArray(q.wordBank)) {
      q._wordBankShuffled = shuffle(q.wordBank);
    }
  });

  return qs;
}

/* ============================================================
   § 7 — TIMER
   ============================================================ */

function startTimer() {
  clearInterval(State.timer);
  updateTimerDisplay();
  State.timer = setInterval(() => {
    State.timeLeft--;
    updateTimerDisplay();
    if (State.timeLeft <= 0) { clearInterval(State.timer); autoSubmit(); }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('timer-display');
  if (!el) return;
  const m = Math.floor(State.timeLeft / 60);
  const s = State.timeLeft % 60;
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.className = State.timeLeft <= 60 ? 'danger' : State.timeLeft <= 180 ? 'warning' : '';
}

/* ============================================================
   § 8 — SIDEBAR
   ============================================================ */

function buildSidebar() {
  const grid = document.getElementById('qGrid');
  if (!grid) return;
  grid.innerHTML = '';
  State.questions.forEach((_, i) => {
    const b = document.createElement('button');
    b.className   = 'q-btn';
    b.id          = `qbtn-${i}`;
    b.textContent = i + 1;
    b.onclick     = () => jumpTo(i);
    grid.appendChild(b);
  });
}

/**
 * Thu gọn/mở rộng sidebar danh sách câu hỏi (desktop: co hẹp còn dải icon;
 * điện thoại: ép chiều cao về 0 để nhường không gian dọc cho ảnh câu hỏi).
 * Trạng thái được nhớ lại (localStorage) để không phải bấm lại mỗi lần thi.
 */
function toggleSidebar() {
  const sb = document.getElementById('examSidebar');
  if (!sb) return;
  sb.classList.toggle('collapsed');
  try { localStorage.setItem('ic3_sidebar_collapsed', sb.classList.contains('collapsed') ? '1' : '0'); }
  catch (e) { /* localStorage có thể bị chặn — bỏ qua, không ảnh hưởng chức năng */ }
  // ResizeObserver đã tự bắt được thay đổi kích thước .hsq-stage trong
  // suốt quá trình animation thu/mở sidebar — gọi thêm 1 lần sau khi
  // animation kết thúc (300ms) để đảm bảo khớp chính xác lần cuối.
  setTimeout(() => { if (typeof fitHotspotImage === 'function') fitHotspotImage(); }, 300);
}

function _restoreSidebarState() {
  const sb = document.getElementById('examSidebar');
  if (!sb) return;
  try {
    if (localStorage.getItem('ic3_sidebar_collapsed') === '1') sb.classList.add('collapsed');
  } catch (e) { /* ignore */ }
}

function updateSidebar() {
  State.questions.forEach((_, i) => {
    const b = document.getElementById(`qbtn-${i}`);
    if (!b) return;
    let cls = 'q-btn';
    if (i === State.current) cls += ' active';
    if (isAnswered(i))       cls += ' answered';
    if (State.flags.has(i))  cls += ' flagged';
    b.className = cls;
  });
  const done = State.questions.filter((_, i) => isAnswered(i)).length;
  const fill = document.getElementById('progressFill');
  if (fill) fill.style.width = `${(done / State.questions.length) * 100}%`;
}

/**
 * Kiểm tra xem câu qi đã được trả lời chưa (đủ điều kiện cho thanh tiến độ)
 */
function isAnswered(i) {
  const q = State.questions[i];
  if (!q) return false;

  switch (q.type) {
    case 'matching':
      if (!q.pairs || q.pairs.length === 0) return false;
      return Object.keys(State.matching[i] || {}).length > 0;

    case 'hotspot': {
      const areas = q.areas || [];
      const totalCorrect = areas.filter(a => a.correct).length || areas.length;
      return (State.hotspot[i]?.size || 0) === totalCorrect;
    }

    case 'truefalse':
      // Phải trả lời ĐỦ tất cả statements
      return Object.keys(State.answers[i] || {}).length === (q.statements?.length || 0);

    case 'list':
      return Object.keys(State.list[i] || {}).length === (q.items?.length || 0);

    case 'classify': {
      // Chỉ đếm các item BẮT BUỘC (bỏ qua thẻ mồi nhử trong q.distractors,
      // nếu có, vì chúng không cần được xếp vào nhóm nào để tính là đã trả lời).
      const ans = State.classify[i] || {};
      const req = q.items || [];
      return req.length > 0 && req.every(it => ans[it.text] !== undefined);
    }

    case 'ordering':
      return (State.ordering[i]?.length || 0) === (q.items?.length || 0);

    case 'dragfill':
    case 'selectfill':
      return Object.keys(State.fillblank[i] || {}).length === (q.blanks?.length || 0);

    case 'multi': {
      const arr = State.answers[i];
      if (!Array.isArray(arr)) return false;
      // Nếu đề bài quy định số lượng đáp án cần chọn (q.correct) thì phải
      // chọn ĐỦ đúng số đó (không thiếu, không thừa) mới tính là đã trả lời.
      return q.correct?.length ? arr.length === q.correct.length : arr.length > 0;
    }

    default: {
      const a = State.answers[i];
      return a !== undefined && a !== null && (Array.isArray(a) ? a.length > 0 : true);
    }
  }
}

/* ============================================================
   § 9 — NAVIGATION
   ============================================================ */

function jumpTo(i) {
  beginQTime(i);
  State.current = i;
  renderQuestion(i);
}

function prevQ() { if (State.current > 0) jumpTo(State.current - 1); }
function nextQ() { if (State.current < State.questions.length - 1) jumpTo(State.current + 1); }

/* ============================================================
   § 10 — RENDER QUESTION  (Task 3 — xử lý linh hoạt theo type)
   ============================================================ */

/**
 * Hàm chính render câu hỏi — phân phối xuống render con theo type.
 * Xử lý:
 *   - Hiển thị imageUrl / image_file (img/) nếu có
 *   - Điều phối renderSingle / renderMulti / renderTrueFalse / renderMatching
 */
function renderQuestion(idx) {
  State.current = idx;
  const q = State.questions[idx];
  if (!q) return;

  const panel = document.getElementById('qPanel');
  if (!panel) return;

  panel.classList.toggle('q-panel--hotspot', q.type === 'hotspot');

  const TYPE_META = {
    single:    { icon: '◎', label: 'Một lựa chọn' },
    multi:     { icon: '☑', label: 'Nhiều lựa chọn' },
    truefalse: { icon: '⇄', label: 'Đúng / Sai' },
    matching:  { icon: '↔', label: 'Nối cột' },
    hotspot:   { icon: '🎯', label: 'Bấm vào hình' },
    list:      { icon: '📋', label: 'Chọn cho từng dòng' },
    classify:  { icon: '🗂️', label: 'Phân loại' },
    ordering:  { icon: '↕', label: 'Sắp xếp thứ tự' },
    dragfill:  { icon: '🧩', label: 'Kéo thả điền chỗ trống' },
    selectfill:{ icon: '▾', label: 'Chọn điền chỗ trống' },
  };
  const { icon, label } = TYPE_META[q.type] || { icon: '?', label: q.type };

  // Nav buttons
  const navPrev = `<button class="btn-nav" onclick="prevQ()" ${idx === 0 ? 'disabled' : ''}>← Câu trước</button>`;
  const navNext = idx < State.questions.length - 1
    ? `<button class="btn-nav btn-next-primary" onclick="nextQ()">Câu tiếp →</button>`
    : `<button class="btn-nav" style="background:rgba(6,214,160,.15);border-color:var(--accent5);color:var(--accent5);" onclick="confirmSubmit()">Nộp bài ✓</button>`;
  const navFlag = `<button class="btn-nav btn-flag ${State.flags.has(idx) ? 'flagged' : ''}" onclick="toggleFlag(${idx})">
    ${State.flags.has(idx) ? '⚑ Bỏ đánh dấu' : '⚐ Đánh dấu'}
  </button>`;

  // Hình ảnh — ưu tiên imageUrl (từ image_file), sau đó SVG minh họa
  // (câu hotspot tự vẽ ảnh + vùng bấm bên trong renderHotspot() → không dùng block chung)
  const imgBlock = q.type === 'hotspot' ? '' : _buildImageBlock(q);

  panel.innerHTML = `
    <div class="q-card${q.type === 'hotspot' ? ' q-card--hotspot' : ''}">
      <div class="q-header">
        <div class="q-badge">${idx + 1}</div>
        <div class="q-meta">
          <div class="q-type-badge">${icon} ${label}</div>
          <div class="q-text">${q.question}</div>
        </div>
      </div>
      ${imgBlock}
      <div id="q-body"></div>
    </div>
    <div class="q-nav">${navPrev}${navNext}${navFlag}</div>`;

  // Gọi render theo type
  const renderers = {
    single:    renderSingle,
    multi:     renderMulti,
    truefalse: renderTrueFalse,
    matching:  renderMatching,
    hotspot:   renderHotspot,
    list:      renderList,
    classify:  renderClassify,
    ordering:  renderOrdering,
    dragfill:  renderFillBlank,
    selectfill:renderFillBlank,
  };
  (renderers[q.type] || (() => {}))(q, idx);

  // Mọi câu có hình đều có nút phóng to riêng, kể cả hotspot/matching/classify.
  _attachQuestionImageZoom(panel);

  updateSidebar();
  panel.scrollTop = 0;
}

/**
 * Xây dựng khối hình ảnh cho câu hỏi.
 * Task 3: ưu tiên img/ từ image_file, sau đó SVG tự động.
 */
function _buildImageBlock(q) {
  // Ưu tiên 1: imageUrl đã set sẵn trong JSON (ví dụ: "img/Picture56.png")
  if (q.imageUrl) {
    return `
      <div class="img-illus-custom" style="margin:.5rem 0 1rem;text-align:center;">
        <img src="${q.imageUrl}"
             alt="Hình minh họa câu hỏi ${q.id || ''}"
             loading="lazy"
             style="width:auto;max-width:100%;max-height:min(52vh,520px);
                    border:2px solid var(--border);box-shadow:var(--shadow);"
             onerror="this.parentElement.style.display='none'"/>
      </div>`;
  }

  // Ưu tiên 2: image_file có nhưng chưa có imageUrl
  if (q.image_file) {
    const url = `img/${q.image_file}`;
    return `
      <div class="img-illus-custom" style="margin:.5rem 0 1rem;text-align:center;">
        <img src="${url}"
             alt="Hình minh họa"
             loading="lazy"
             style="width:auto;max-width:100%;max-height:min(52vh,520px);
                    border:2px solid var(--border);box-shadow:var(--shadow);"
             onerror="this.parentElement.style.display='none'"/>
      </div>`;
  }

  // Ưu tiên 3: SVG minh họa tự động (gọi getImageIllustration nếu tồn tại)
  if (q.image) {
    if (typeof getImageIllustration === 'function') {
      return getImageIllustration(q);
    }
  }

  return '';
}

/* ============================================================
   § 11 — RENDER SINGLE  (type = "single")
   Chỉ cho chọn 1 đáp án, so khớp với correct[0]
   ============================================================ */

function _attachQuestionImageZoom(panel) {
  if (!panel) return;

  panel.querySelectorAll('.q-card img').forEach(img => {
    // Ảnh tương tác (hotspot) có nút phóng to riêng bên ngoài sân khấu.
    // Không được bọc lại bằng thumbnail cạnh ảnh vì sẽ làm co ảnh và lệch
    // toàn bộ hệ toạ độ hotspot.
    if (img.dataset.hotspotImage === '1') return;
    // Ảnh trong câu "Phân loại" (classify) ĐÃ có sẵn nút phóng to 🔍 riêng
    // gắn trực tiếp trong renderClassify() + CSS giới hạn kích thước nhỏ
    // gọn (.classify-chip-img img / .classify-zone-chip-img img). Nếu bọc
    // lại lần 2 ở đây, ảnh sẽ bị đổi sang CSS .q-image-zoom-wrap > img
    // (max-width:100%; height:auto) — mất giới hạn kích thước, ảnh phồng
    // to gần bằng kích thước gốc và tràn khỏi màn hình.
    if (img.dataset.classifyImage === '1') return;
    // Không xử lý ảnh đang nằm trong overlay phóng to.
    if (img.closest('.img-zoom-overlay')) return;
    if (img.dataset.zoomReady === '1') return;
    if (img.closest('[data-zoom-wrap="1"]')) return;

    img.dataset.zoomReady = '1';

    // THUMBNAILS MODE:
    // Tách kính lúp thành một thumbnail điều khiển nằm NGOÀI ảnh.
    // Không dùng position:absolute nên sẽ không thể đè lên chữ, đáp án
    // hoặc các phần tử khác; đồng thời tự co giãn tốt trên desktop/mobile.
    const wrap = document.createElement('span');
    wrap.className = 'q-image-zoom-wrap';
    wrap.setAttribute('data-zoom-wrap', '1');

    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);

    const thumb = document.createElement('span');
    thumb.className = 'q-image-zoom-thumb';
    thumb.title = 'Phóng to hình';
    thumb.setAttribute('aria-label', 'Phóng to hình');
    thumb.setAttribute('role', 'button');
    thumb.setAttribute('tabindex', '0');
    thumb.innerHTML = '<span class="q-image-zoom-thumb-icon" aria-hidden="true">🔍</span>';

    const open = e => {
      e.preventDefault();
      e.stopPropagation();
      openImgZoom(img.currentSrc || img.src, img.alt || 'Hình minh họa');
    };
    thumb.addEventListener('click', open);
    thumb.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') open(e);
    });

    // Đặt thumbnail ở cuối wrapper, bên ngoài vùng ảnh.
    wrap.appendChild(thumb);
  });
}

function _hasImage(q) {
  return !!(q?.imageUrl || q?.image_file);
}

function renderSingle(q, qi) {
  const current = State.answers[qi];
  const ALPHA   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const noMarker = _hasImage(q); // câu có ảnh minh hoạ → ẩn nhãn A/B/C/D, chỉ còn nội dung để click

  document.getElementById('q-body').innerHTML = `
    <div class="options-list">
      ${(q.options || []).map((opt, j) => `
        <button class="option-btn ${noMarker ? 'no-marker' : ''} ${current === opt ? 'selected' : ''}"
                data-qi="${qi}"
                data-val="${encodeURIComponent(opt)}"
                onclick="selectSingle(this)">
          ${noMarker ? '' : `<div class="option-marker">${ALPHA[j] ?? (j + 1)}</div>`}
          <span>${opt}</span>
        </button>`).join('')}
    </div>`;
}

function selectSingle(el) {
  const qi  = parseInt(el.dataset.qi);
  const val = decodeURIComponent(el.dataset.val);
  State.answers[qi] = val;
  State.session.clicks++;
  document.querySelectorAll('#q-body .option-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  animatePick(el);
  updateSidebar();
}

/* ============================================================
   § 12 — RENDER MULTI  (type = "multi")
   Cho chọn nhiều đáp án — so khớp toàn bộ mảng correct[]
   ============================================================ */

function renderMulti(q, qi) {
  const current = State.answers[qi] || [];
  const ALPHA   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const COLORS  = ['c0','c1','c2','c3','c4','c5'];
  const noMarker = _hasImage(q);

  // Gợi ý số lượng cần chọn
  const hint = q.correct?.length
    ? `Hãy chọn đúng <strong>${q.correct.length}</strong> đáp án`
    : 'Chọn tất cả đáp án đúng';

  // Nhiều lựa chọn (>4) → chia 2 cột để vừa màn hình, đỡ cuộn dài
  // (xem .options-list--2col trong style.css). Ảnh minh hoạ (noMarker)
  // thường đi kèm chú thích dài hơn nên vẫn giữ 1 cột cho dễ đọc.
  const useGrid = !noMarker && (q.options || []).length > 4;

  document.getElementById('q-body').innerHTML = `
    <div class="multi-hint" style="
        background:var(--purple-lt);border:1.5px solid rgba(79,107,255,.25);
        border-radius:10px;padding:.55rem 1rem;margin-bottom:.8rem;
        font-size:.85rem;font-weight:700;color:var(--purple);">
      ☑ ${hint}
      <span id="multi-counter-${qi}" style="color:${q.correct?.length ? (current.length === q.correct.length ? 'var(--teal)' : 'var(--yellow)') : 'var(--muted)'};font-weight:600;margin-left:.5rem;">
        (Đã chọn: <span id="multi-count-${qi}">${current.length}</span>/${q.correct?.length || '?'})
      </span>
    </div>
    <div class="options-list${useGrid ? ' options-list--2col' : ''}">
      ${(q.options || []).map((opt, j) => {
        const cc  = COLORS[j % COLORS.length];
        const sel = current.includes(opt) ? `selected ${cc}` : '';
        return `<button class="option-btn multi-style ${noMarker ? 'no-marker' : ''} ${sel}"
                        data-qi="${qi}"
                        data-val="${encodeURIComponent(opt)}"
                        data-cc="${cc}"
                        onclick="selectMulti(this)">
          ${noMarker ? '' : `<div class="option-marker">${ALPHA[j] ?? (j + 1)}</div>`}
          <span>${opt}</span>
        </button>`;
      }).join('')}
    </div>`;
}

function selectMulti(el) {
  const qi  = parseInt(el.dataset.qi);
  const val = decodeURIComponent(el.dataset.val);
  const cc  = el.dataset.cc;
  const q   = State.questions[qi];
  const need = q?.correct?.length || 0;

  if (!State.answers[qi]) State.answers[qi] = [];
  const arr = State.answers[qi];
  const idx = arr.indexOf(val);

  if (idx >= 0) {
    arr.splice(idx, 1);
    el.classList.remove('selected', 'c0','c1','c2','c3','c4','c5');
  } else {
    // Chặn chọn quá số lượng yêu cầu — cảnh báo thay vì cho chọn thêm.
    if (need > 0 && arr.length >= need) {
      showNotification(`⚠️ Chỉ được chọn tối đa ${need} đáp án cho câu này. Bỏ chọn bớt trước khi chọn đáp án khác.`, 'warning');
      return;
    }
    arr.push(val);
    el.classList.add('selected', cc);
    animatePick(el);
  }

  State.session.clicks++;

  // Cập nhật bộ đếm đã chọn
  const counter = document.getElementById(`multi-count-${qi}`);
  if (counter) counter.textContent = arr.length;
  const counterWrap = document.getElementById(`multi-counter-${qi}`);
  if (counterWrap && need > 0) counterWrap.style.color = arr.length === need ? 'var(--teal)' : 'var(--yellow)';

  updateSidebar();
}

/* ============================================================
   § 13 — RENDER TRUEFALSE  (type = "truefalse")
   Hiển thị bảng statements — nút label_true / label_false động
   ============================================================ */

function renderTrueFalse(q, qi) {
  const current = State.answers[qi] || {};

  // Label động: lấy từ JSON, mặc định ĐÚNG/SAI
  const lT = q.label_true  || 'ĐÚNG';
  const lF = q.label_false || 'SAI';

  let stmts = q.statements || [];

  // Fallback: nếu statements rỗng hoặc placeholder, parse từ question text
  const PLACEHOLDER_RE = /có \/ không cho từng|đúng \/ sai cho từng|đúng\/sai cho từng/i;
  if (stmts.length === 1 && PLACEHOLDER_RE.test(stmts[0]?.text || '')) {
    const lines = q.question.split(/\n/).map(l => l.trim()).filter(l => /^[-•\d]/.test(l));
    if (lines.length > 0) {
      stmts = lines.map(l => ({
        text:   l.replace(/^[-•\d]+[.)\s]*/, '').trim(),
        answer: stmts[0].answer || 'true'
      }));
    }
  }

  // Đếm đã trả lời bao nhiêu / tổng
  const answeredCount = Object.keys(current).length;

  document.getElementById('q-body').innerHTML = `
    <div style="font-size:.82rem;font-weight:700;color:var(--muted);margin-bottom:.75rem;">
      📋 Trả lời từng câu (${answeredCount}/${stmts.length} đã chọn)
    </div>
    <table class="tf-table" style="width:100%;border-collapse:separate;border-spacing:0 .4rem;">
      <thead>
        <tr>
          <th style="text-align:left;padding:.4rem .6rem;color:var(--muted);font-size:.8rem;">
            Phát biểu
          </th>
          <th style="width:150px;text-align:center;color:var(--muted);font-size:.85rem;">${lT}</th>
          <th style="width:150px;text-align:center;color:var(--muted);font-size:.85rem;">${lF}</th>
        </tr>
      </thead>
      <tbody>
        ${stmts.map((st, j) => `
          <tr class="tf-row" id="tf-row-${qi}-${j}"
              style="background:${
                current[j] === 'true'  ? 'rgba(0,201,160,.08)' :
                current[j] === 'false' ? 'rgba(255,82,82,.06)' :
                'var(--card2)'
              };border-radius:10px;transition:background .2s;">
            <td style="padding:.55rem .75rem;border-radius:10px 0 0 10px;font-size:clamp(.95rem,2.5vw,1.05rem);">
              <span style="font-weight:700;color:var(--muted);margin-right:.4rem;">${j + 1}.</span>
              ${st.text}
            </td>
            <td class="tf-btn-cell" style="text-align:center;border-radius:0;">
              <button class="tf-btn ${current[j] === 'true' ? 'selected-true' : ''}"
                      data-qi="${qi}" data-j="${j}" data-v="true"
                      onclick="selectTF(this)">${lT}</button>
            </td>
            <td class="tf-btn-cell" style="text-align:center;border-radius:0 10px 10px 0;">
              <button class="tf-btn ${current[j] === 'false' ? 'selected-false' : ''}"
                      data-qi="${qi}" data-j="${j}" data-v="false"
                      onclick="selectTF(this)">${lF}</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function selectTF(el) {
  const qi = parseInt(el.dataset.qi);
  const j  = parseInt(el.dataset.j);
  const v  = el.dataset.v;

  if (!State.answers[qi]) State.answers[qi] = {};
  State.answers[qi][j] = v;
  State.session.clicks++;

  // Cập nhật UI row
  const row = el.closest('tr');
  if (row) {
    row.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected-true','selected-false'));
    el.classList.add(v === 'true' ? 'selected-true' : 'selected-false');
    row.style.background = v === 'true'
      ? 'rgba(0,201,160,.08)'
      : 'rgba(255,82,82,.06)';
  }

  updateSidebar();
}

/* ============================================================
   § 14 — RENDER MATCHING  (type = "matching")
   Drag & drop (desktop) + tap-to-place (mobile)
   Pool chip hỗ trợ nhiều right value giống nhau (ví dụ Google×2)
   ============================================================ */

function renderMatching(q, qi) {
  const body = document.getElementById('q-body');
  if (!body) return;

  if (!q.pairs || q.pairs.length === 0) {
    body.innerHTML = `<div class="q-img-notice">🖼️ Câu nối cột này dùng hình ảnh — vui lòng xem đề thi in.</div>`;
    return;
  }

  if (!State.matching[qi]) State.matching[qi] = {};
  const matched = State.matching[qi];

  const leftItems = q._leftShuffled || q.pairs.map(p => p.left);

  // Nếu pairs có "right_img", đáp án được hiển thị dạng HÌNH ẢNH thay vì chữ
  // (ví dụ: nối mô tả với ký hiệu lưu đồ). Map: right-text → đường dẫn ảnh.
  const rightImgMap = {};
  q.pairs.forEach(p => { if (p.right_img) rightImgMap[p.right] = p.right_img; });
  const _chipContent = r => rightImgMap[r]
    ? `<img class="match-shape-img" src="${rightImgMap[r]}" alt="${r}" draggable="false">`
    : r;

  // Đếm số lần mỗi right value CẦN dùng
  const rightCount = {};
  q.pairs.forEach(p => { rightCount[p.right] = (rightCount[p.right] || 0) + 1; });

  // Đếm số lần đã đặt
  const placedCount = {};
  Object.values(matched).forEach(r => { placedCount[r] = (placedCount[r] || 0) + 1; });

  const uniqueRights = q._rightShuffled || [...new Set(q.pairs.map(p => p.right))];

  // Tạo pool chips: mỗi right còn lại (chưa đặt)
  const poolChips = [];
  uniqueRights.forEach(r => {
    const remain = Math.max(0, (rightCount[r] || 0) - (placedCount[r] || 0));
    for (let i = 0; i < remain; i++) {
      poolChips.push({ r, id: `chip-${qi}-${encodeURIComponent(r)}-${i}` });
    }
  });

  const answeredPairs = Object.keys(matched).length;
  const hasRegions = _hasRegions(q);

  body.innerHTML = `
    <div class="match-hint">
      🖱️ Kéo thả hoặc <strong>nhấn chip → nhấn ô</strong> để nối cột
      <span class="match-hint-count">${answeredPairs}/${leftItems.length} đã nối</span>
    </div>

    <div class="drag-pool-title">📦 Đáp án — kéo hoặc nhấn để chọn:</div>
    <div class="drag-pool" id="dragPool-${qi}">
      ${poolChips.length > 0
        ? poolChips.map(({ r, id }) => `
            <div class="drag-chip ${rightImgMap[r] ? 'drag-chip-img' : ''}"
                 draggable="true"
                 data-right="${encodeURIComponent(r)}"
                 data-qi="${qi}"
                 id="${id}">${rightImgMap[r] ? '' : '⠿ '}${_chipContent(r)}</div>`).join('')
        : `<span class="pool-done">✅ Đã điền hết — nhấn ✕ để thay đổi</span>`}
    </div>

    ${hasRegions ? `
    <div class="matching-container">
      <div class="matching-col">
        <div class="matching-col-title">Cột trái</div>
        ${_buildRegionPicker(q, qi, matched)}
      </div>
      <div class="match-arrow">→</div>
      <div class="match-right-col">
        <div class="matching-col-title">Kéo đáp án vào đây</div>
        ${leftItems.map((left, idx) => `
          <div class="match-drop-slot ${matched[left] ? 'filled' : 'empty-hint'}"
               data-qi="${qi}"
               data-left="${encodeURIComponent(left)}"
               id="slot-${qi}-${idx}">
            <span class="slot-label">${left.length > 22 ? left.slice(0,22)+'…' : left} →</span>
            ${matched[left]
              ? `<span class="slot-content">${_chipContent(matched[left])}</span>
                 <button class="slot-remove"
                         data-qi="${qi}" data-left="${encodeURIComponent(left)}"
                         onclick="removeMatchDrop(this)">✕</button>`
              : ''}
          </div>`).join('')}
      </div>
    </div>` : `
    <div class="matching-list">
      ${leftItems.map((left, idx) => `
        <div class="match-row ${matched[left] ? 'filled' : ''}">
          <div class="match-row-text">
            <span class="match-row-num">${idx + 1}</span>
            <span>${left}</span>
          </div>
          <div class="match-drop-slot ${matched[left] ? 'filled' : 'empty-hint'}"
               data-qi="${qi}"
               data-left="${encodeURIComponent(left)}"
               id="slot-${qi}-${idx}">
            ${matched[left]
              ? `<span class="slot-content" title="${rightImgMap[matched[left]] ? matched[left] : ''}">${_chipContent(matched[left])}</span>
                 <button class="slot-remove"
                         data-qi="${qi}" data-left="${encodeURIComponent(left)}"
                         onclick="removeMatchDrop(this)">✕</button>`
              : ''}
          </div>
        </div>`).join('')}
    </div>`}`;

  // Gắn drag & drop events
  body.querySelectorAll('.drag-chip').forEach(chip => {
    chip.addEventListener('dragstart', onDragStart);
    chip.addEventListener('dragend',   onDragEnd);
    chip.addEventListener('click',     onChipTap);
  });
  body.querySelectorAll('.match-drop-slot').forEach(slot => {
    slot.addEventListener('dragover',  onDragOver);
    slot.addEventListener('dragleave', onDragLeave);
    slot.addEventListener('drop',      onDrop);
    slot.addEventListener('click',     onSlotTap);
  });
  body.querySelectorAll('.match-region-hotspot').forEach(hotspot => {
    hotspot.addEventListener('click',    onRegionTap);
    hotspot.addEventListener('dragover', onDragOver);
    hotspot.addEventListener('dragleave',onDragLeave);
    hotspot.addEventListener('drop',     onRegionDrop);
  });
}

/**
 * Câu nối cột có ảnh + toạ độ vùng bấm (q.regions) → cho phép học sinh
 * bấm trực tiếp lên đúng vị trí trên ảnh thay vì đọc danh sách chữ.
 * Định dạng: q.regions = [{ value, x, y, w, h }] — x/y/w/h là % so với
 * kích thước ảnh gốc (0-100), value phải khớp CHÍNH XÁC 1 chuỗi trong
 * q.pairs[].left. Item nào không có vùng tương ứng vẫn hiện ở dạng chữ
 * bên dưới ảnh để không mất đáp án.
 */
function _hasRegions(q) {
  return Array.isArray(q.regions) && q.regions.length > 0 && (q.imageUrl || q.image_file);
}

function _buildRegionPicker(q, qi, matched) {
  const src = q.imageUrl || `img/${q.image_file}`;
  const leftItems = q._leftShuffled || q.pairs.map(p => p.left);
  const regionValues = new Set(q.regions.map(r => r.value));
  const unmapped = leftItems.filter(l => !regionValues.has(l));

  const hotspots = q.regions.map((r, i) => {
    const isMatched = !!matched[r.value];
    return `<button type="button"
              class="match-region-hotspot ${isMatched ? 'matched' : ''}"
              style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;"
              data-qi="${qi}"
              data-left="${encodeURIComponent(r.value)}"
              title="${r.value}"
              aria-label="${r.value}"></button>`;
  }).join('');

  const unmappedList = unmapped.length
    ? `<div class="match-region-extra-hint">Đáp án khác (không có trên ảnh):</div>
       ${unmapped.map(left => `
        <div class="match-left-item ${matched[left] ? 'matched' : ''}">
          <div class="match-dot"></div><span>${left}</span>
        </div>`).join('')}`
    : '';

  return `
    <div class="match-region-wrap">
      <img src="${src}" alt="Bấm trực tiếp vào hình để chọn đáp án" loading="lazy"
           onerror="this.parentElement.style.display='none'">
      ${hotspots}
    </div>
    <div class="match-region-tip">👆 Bấm trực tiếp vào đúng vị trí trên hình</div>
    ${unmappedList}
  `;
}

function onRegionTap(e) {
  if (!_tapChip || !_dragRight) return;
  const hotspot = e.currentTarget;
  const qi = parseInt(hotspot.dataset.qi);
  if (qi !== _dragQi) return;
  const left = decodeURIComponent(hotspot.dataset.left);
  if (!State.matching[qi]) State.matching[qi] = {};
  State.matching[qi][left] = _dragRight;
  State.session.clicks++;
  document.querySelectorAll('.drag-chip.tap-selected').forEach(c => c.classList.remove('tap-selected'));
  _tapChip = null; _dragRight = null; _dragQi = null;
  updateSidebar();
  renderMatching(State.questions[qi], qi);
}

function onRegionDrop(e) {
  e.preventDefault();
  const hotspot = e.currentTarget;
  hotspot.classList.remove('drag-over');
  const qi   = parseInt(hotspot.dataset.qi);
  const left = decodeURIComponent(hotspot.dataset.left);
  const right = _dragRight;
  if (!right || qi !== _dragQi) return;
  if (!State.matching[qi]) State.matching[qi] = {};
  State.matching[qi][left] = right;
  State.session.clicks++;
  updateSidebar();
  renderMatching(State.questions[qi], qi);
}

// ── Drag state ──────────────────────────────────────────────
let _dragRight  = null;
let _dragQi     = null;
let _dragChipEl = null;

function onDragStart(e) {
  _dragRight  = decodeURIComponent(e.currentTarget.dataset.right);
  _dragQi     = parseInt(e.currentTarget.dataset.qi);
  _dragChipEl = e.currentTarget;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _dragRight);
}

function onDragEnd(e) { e.currentTarget.classList.remove('dragging'); }

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

function onDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const qi    = parseInt(e.currentTarget.dataset.qi);
  const left  = decodeURIComponent(e.currentTarget.dataset.left);
  const right = _dragRight;
  if (!right || qi !== _dragQi) return;
  if (!State.matching[qi]) State.matching[qi] = {};
  State.matching[qi][left] = right;
  State.session.clicks++;
  updateSidebar();
  renderMatching(State.questions[qi], qi);
}

function removeMatchDrop(el) {
  const qi   = parseInt(el.dataset.qi);
  const left = decodeURIComponent(el.dataset.left);
  if (State.matching[qi]) delete State.matching[qi][left];
  State.session.clicks++;
  updateSidebar();
  renderMatching(State.questions[qi], qi);
}

// ── Tap-to-place (mobile) ─────────────────────────────────
let _tapChip = null;

function onChipTap(e) {
  const chip = e.currentTarget;
  const qi   = parseInt(chip.dataset.qi);
  document.querySelectorAll('.drag-chip.tap-selected').forEach(c => c.classList.remove('tap-selected'));
  if (_tapChip === chip) { _tapChip = null; _dragRight = null; _dragQi = null; return; }
  _tapChip   = chip;
  _dragRight = decodeURIComponent(chip.dataset.right);
  _dragQi    = qi;
  chip.classList.add('tap-selected');
}

function onSlotTap(e) {
  if (!_tapChip || !_dragRight) return;
  const slot = e.currentTarget;
  const qi   = parseInt(slot.dataset.qi);
  if (qi !== _dragQi) return;
  const left = decodeURIComponent(slot.dataset.left);
  if (!State.matching[qi]) State.matching[qi] = {};
  State.matching[qi][left] = _dragRight;
  State.session.clicks++;
  document.querySelectorAll('.drag-chip.tap-selected').forEach(c => c.classList.remove('tap-selected'));
  _tapChip = null; _dragRight = null; _dragQi = null;
  updateSidebar();
  renderMatching(State.questions[qi], qi);
}

// Stubs giữ tương thích
function selectMatchLeft()  {}
function selectMatchRight() {}
function removeMatch(el)    { removeMatchDrop(el); }

/* ============================================================
   § 14b — RENDER HOTSPOT  (type = "hotspot")
   Bấm trực tiếp lên đúng (các) vị trí trên hình. Dữ liệu q.areas
   là danh sách vùng (x/y/w/h tính theo % kích thước ảnh gốc, góc
   trên-trái) — mỗi vùng có cờ correct true/false. Học sinh cần
   bấm chọn đúng toàn bộ vùng correct:true (không thừa, không thiếu)
   thì câu mới được tính là đúng — giống hệt cách chấm của "multi".
   ============================================================ */

function renderHotspot(q, qi) {
  const body = document.getElementById('q-body');
  if (!body) return;

  if (!State.hotspot[qi]) State.hotspot[qi] = new Set();
  const sel = State.hotspot[qi];
  const src = q.imageUrl || (q.image_file ? `img/${q.image_file}` : '');
  const areas = q.areas || [];
  const totalCorrect = areas.filter(a => a.correct).length || areas.length;

  if (!src || areas.length === 0) {
    body.innerHTML = `<div class="q-img-notice">🖼️ Câu hỏi này thiếu dữ liệu hình ảnh — vui lòng báo cho giáo viên/quản trị viên.</div>`;
    return;
  }

  const areasHtml = areas.map(a => {
    const isSel = sel.has(a.id);
    const shapeCls = a.shape === 'oval' ? 'hotspot-oval' : 'hotspot-rect';
    return `<button type="button"
              class="hotspot-area ${shapeCls} ${isSel ? 'selected' : ''}"
              style="left:${a.x}%;top:${a.y}%;width:${a.w}%;height:${a.h}%;"
              data-qi="${qi}" data-id="${a.id}"
              onclick="toggleHotspot(this)"
              aria-label="Khu vực ${a.id}"></button>`;
  }).join('');

  body.innerHTML = `
    <div class="match-hint" style="
        font-size:.82rem;font-weight:700;color:var(--muted);margin-bottom:.5rem;
        background:var(--yellow-lt);border:1.5px solid rgba(255,179,0,.25);
        border-radius:10px;padding:.4rem .9rem;">
      🎯 Bấm vào đúng <strong>${totalCorrect}</strong> vị trí trên hình
      <span id="hotspot-counter-${qi}" style="margin-left:.75rem;color:${sel.size === totalCorrect ? 'var(--teal)' : 'var(--yellow)'};">
        Đã chọn: <span id="hotspot-count-${qi}">${sel.size}</span>/${totalCorrect}
      </span>
    </div>
    <div class="hsq-stage">
      <img class="hsq-image-el" src="${src}" data-hotspot-image="1"
           alt="Bấm trực tiếp vào hình để chọn đáp án" loading="lazy"
           onload="fitHotspotImage()"
           onerror="this.parentElement.innerHTML='<div class=&quot;q-img-notice&quot;>🖼️ Không tải được hình ảnh.</div>'">
      <div class="hotspot-wrap">${areasHtml}</div>
    </div>
    <div class="hsq-stage-tools">
      <button type="button" class="q-image-zoom-thumb q-image-zoom-thumb--hotspot"
              title="Phóng to hình" aria-label="Phóng to hình"
              onclick="openImgZoom('${escapeAttr(src)}','${escapeAttr(q.question || 'Hình minh họa')}')">
        <span class="q-image-zoom-thumb-icon" aria-hidden="true">🔍</span>
      </button>
    </div>
    <div class="match-region-tip">👆 Bấm trực tiếp vào vị trí đúng trên hình. Bấm lại để bỏ chọn.</div>`;

  // Ảnh nền dùng object-fit:contain thuần CSS (luôn hiện trọn ảnh, giữ
  // đúng tỉ lệ, không cắt/không cover, không phụ thuộc timing JS) — chỉ
  // còn cần JS tính lại đúng VÙNG ẢNH THẬT đang hiển thị (có thể bị
  // letterbox 2 bên hoặc trên/dưới) để đặt khung .hotspot-wrap khớp
  // chính xác, vì object-fit:contain không tự báo cho CSS biết vùng ảnh
  // thật nằm ở đâu bên trong khung.
  const _hsqImg = body.querySelector('.hsq-image-el');
  if (_hsqImg && _hsqImg.complete) fitHotspotImage();
  requestAnimationFrame(fitHotspotImage);
  _bindHotspotResizeObserver();
}

/**
 * Tính chính xác vùng ảnh THẬT đang hiển thị bên trong .hsq-stage khi
 * dùng object-fit:contain (ảnh có thể bị letterbox 2 bên hoặc trên/dưới
 * nếu tỉ lệ khung khác tỉ lệ ảnh gốc), rồi đặt khung .hotspot-wrap khớp
 * TUYỆT ĐỐI với vùng đó bằng left/top/width/height tính bằng px. Nhờ
 * vậy toạ độ % của từng .hotspot-area (đặt theo đúng ảnh gốc trong
 * hotspot-editor) luôn rơi đúng vị trí thật trên ảnh, ở MỌI kích thước
 * màn hình (đã kiểm tra logic đúng ở mọi tỉ lệ khung/ảnh, tương đương
 * 1366×768, 1440×900, 1920×1080 và các kích thước khác).
 */
function fitHotspotImage() {
  const stage = document.querySelector('.hsq-stage');
  const img   = stage ? stage.querySelector('.hsq-image-el') : null;
  const wrap  = stage ? stage.querySelector('.hotspot-wrap') : null;
  if (!stage || !img || !wrap) return;
  if (!img.naturalWidth || !img.naturalHeight) return; // ảnh chưa tải xong

  const cw = stage.clientWidth;
  const ch = stage.clientHeight;
  if (!cw || !ch) return;

  const containerRatio = cw / ch;
  const imageRatio = img.naturalWidth / img.naturalHeight;

  let w, h;
  if (imageRatio > containerRatio) {
    // Ảnh "dẹt" hơn khung ⇒ bám khít theo chiều rộng, letterbox trên/dưới
    w = cw;
    h = cw / imageRatio;
  } else {
    // Ảnh "đứng" hơn khung ⇒ bám khít theo chiều cao, letterbox 2 bên
    h = ch;
    w = ch * imageRatio;
  }

  wrap.style.left   = Math.round((cw - w) / 2) + 'px';
  wrap.style.top    = Math.round((ch - h) / 2) + 'px';
  wrap.style.width  = Math.round(w) + 'px';
  wrap.style.height = Math.round(h) + 'px';

  adjustHotspotHitAreas();
}

/**
 * Theo dõi thay đổi kích thước thật của .hsq-stage (co dãn cửa sổ, thu
 * gọn/mở rộng sidebar, xoay màn hình, đổi zoom trình duyệt...) bằng
 * ResizeObserver — chính xác và tức thời hơn nhiều so với chỉ lắng nghe
 * sự kiện "resize" của window, vì ResizeObserver bắt được MỌI thay đổi
 * kích thước của chính phần tử .hsq-stage, kể cả khi do sidebar/layout
 * xung quanh thay đổi chứ không phải do đổi cỡ cửa sổ. Re-bind lại mỗi
 * lần renderHotspot() chạy vì .hsq-stage bị thay thế hoàn toàn (innerHTML).
 */
let _hsqResizeObserver = null;
function _bindHotspotResizeObserver() {
  const stage = document.querySelector('.hsq-stage');
  if (!stage) return;
  if (_hsqResizeObserver) _hsqResizeObserver.disconnect();
  if (typeof ResizeObserver === 'undefined') return; // fallback: window resize bên dưới vẫn còn tác dụng
  _hsqResizeObserver = new ResizeObserver(() => fitHotspotImage());
  _hsqResizeObserver.observe(stage);
}


/**
 * Trước đây các vùng hotspot (.hotspot-area) bị ép min-width/min-height
 * cố định (32px, 40px trên điện thoại) để dễ bấm — nhưng khi ảnh thu nhỏ
 * lại trên màn hình hẹp, việc ép kích thước cố định này khiến các vùng
 * nằm sát nhau trên ảnh gốc (VD: nút đóng tab, ô địa chỉ, nút "≡"...) bị
 * phóng to đè/chồng lên nhau, vừa rối mắt vừa dễ bấm nhầm.
 *
 * Cách khắc phục: khung nhìn (viền chấm) luôn giữ ĐÚNG kích thước % gốc
 * (không bao giờ bị phóng to ⇒ không bao giờ chồng hình ảnh lên nhau).
 * Để vẫn dễ chạm trên điện thoại, mỗi vùng được cộng thêm một "vùng bấm"
 * vô hình (pseudo-element ::after, điều khiển bằng biến CSS --hit-slop)
 * mở rộng ra xung quanh — nhưng KHÔNG BAO GIỜ vượt quá 1/2 khoảng cách
 * tới vùng hotspot gần nhất, nên 2 vùng bấm liền kề không bao giờ đè lên
 * nhau, bất kể ảnh nhỏ tới đâu.
 */
function adjustHotspotHitAreas() {
  const wrap = document.querySelector('.hotspot-wrap');
  if (!wrap) return;
  const areas = Array.from(wrap.querySelectorAll('.hotspot-area'));
  if (areas.length === 0) return;

  const wrapRect = wrap.getBoundingClientRect();
  if (!wrapRect.width || !wrapRect.height) return;

  // Kích thước "vùng bấm" mong muốn mỗi bên — ưu tiên lớn hơn trên điện
  // thoại vì thao tác bằng ngón tay kém chính xác hơn chuột.
  const desiredSlop = window.innerWidth <= 720 ? 14 : 9;
  const buffer = 1.5; // khoảng hở an toàn, tránh 2 vùng bấm chạm sát mép nhau

  const rects = areas.map(el => {
    const r = el.getBoundingClientRect();
    return {
      left:   r.left   - wrapRect.left,
      top:    r.top    - wrapRect.top,
      right:  r.right  - wrapRect.left,
      bottom: r.bottom - wrapRect.top,
    };
  });

  areas.forEach((el, i) => {
    const a = rects[i];
    let slop = desiredSlop;

    rects.forEach((b, j) => {
      if (i === j) return;
      const dx = Math.max(b.left - a.right, a.left - b.right, 0);
      const dy = Math.max(b.top - a.bottom, a.top - b.bottom, 0);
      let gap;
      if (dx > 0 && dy > 0) gap = Math.sqrt(dx * dx + dy * dy); // lệch chéo
      else gap = dx > 0 ? dx : (dy > 0 ? dy : 0); // trùng trục, hoặc đã chồng nhau sẵn

      slop = Math.min(slop, Math.max(0, gap / 2 - buffer));
    });

    el.style.setProperty('--hit-slop', `${Math.round(slop)}px`);
  });
}
if (!window.__hsqResizeBound) {
  window.__hsqResizeBound = true;
  let _hsqResizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(_hsqResizeT);
    _hsqResizeT = setTimeout(() => { if (typeof fitHotspotImage === 'function') fitHotspotImage(); }, 120);
  });
}

function toggleHotspot(el) {
  const qi = parseInt(el.dataset.qi);
  const id = el.dataset.id;
  if (!State.hotspot[qi]) State.hotspot[qi] = new Set();
  const sel = State.hotspot[qi];
  const q = State.questions[qi];
  const areas = q?.areas || [];
  const totalCorrect = areas.filter(a => a.correct).length || areas.length;

  if (sel.has(id)) {
    sel.delete(id);
  } else {
    // Chặn chọn quá số lượng yêu cầu — cảnh báo thay vì cho chọn thêm,
    // để học sinh không lỡ tay bấm tràn số vị trí đúng.
    if (sel.size >= totalCorrect) {
      showNotification(`⚠️ Chỉ được chọn tối đa ${totalCorrect} vị trí cho câu này. Bỏ chọn bớt trước khi chọn vị trí khác.`, 'warning');
      return;
    }
    sel.add(id);
  }

  State.session.clicks++;
  el.classList.toggle('selected');
  const counter = document.getElementById(`hotspot-count-${qi}`);
  if (counter) counter.textContent = sel.size;
  const counterWrap = document.getElementById(`hotspot-counter-${qi}`);
  if (counterWrap) counterWrap.style.color = sel.size === totalCorrect ? 'var(--teal)' : 'var(--yellow)';
  animatePick(el);
  updateSidebar();
}

/* ============================================================
   § 14c — RENDER LIST  (type = "list")
   Bảng nhiều dòng, MỖI DÒNG có bộ lựa chọn riêng (khác truefalse vì
   không cố định 2 lựa chọn Đúng/Sai — có thể 2..n lựa chọn tuỳ dòng).
   q.items = [{ text, options: [...], correct: "..." }, ...]
   ============================================================ */

function renderList(q, qi) {
  const body = document.getElementById('q-body');
  if (!body) return;
  const current = State.list[qi] || {};
  const items = q.items || [];
  const answeredCount = Object.keys(current).length;

  body.innerHTML = `
    ${q.hint ? `<div class="q-hint-line">💡 ${q.hint}</div>` : ''}
    <div style="font-size:.82rem;font-weight:700;color:var(--muted);margin:.4rem 0 .75rem;">
      📋 Trả lời từng dòng (${answeredCount}/${items.length} đã chọn)
    </div>
    <div class="list-q-rows">
      ${items.map((it, j) => `
        <div class="list-q-row" id="list-row-${qi}-${j}">
          <div class="list-q-text"><span style="font-weight:700;color:var(--muted);margin-right:.4rem;">${j + 1}.</span>${it.text}</div>
          <div class="list-q-opts">
            ${(it.options || []).map(opt => `
              <button type="button"
                      class="list-opt-btn ${current[j] === opt ? 'selected' : ''}"
                      data-qi="${qi}" data-j="${j}" data-val="${encodeURIComponent(opt)}"
                      onclick="selectListOpt(this)">${opt}</button>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

function selectListOpt(el) {
  const qi  = parseInt(el.dataset.qi);
  const j   = parseInt(el.dataset.j);
  const val = decodeURIComponent(el.dataset.val);
  if (!State.list[qi]) State.list[qi] = {};
  State.list[qi][j] = val;
  State.session.clicks++;

  const row = document.getElementById(`list-row-${qi}-${j}`);
  if (row) row.querySelectorAll('.list-opt-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  animatePick(el);
  updateSidebar();
  renderList(State.questions[qi], qi); // cập nhật lại bộ đếm "đã chọn"
}

/* ============================================================
   § 14d — RENDER CLASSIFY  (type = "classify")
   Phân loại: kéo/nhấn từng item (chữ) vào đúng nhóm (zone).
   q.zones = ["Google","Microsoft",...]  q.items = [{text, zone}]
   Dùng lại cơ chế "nhấn chip → nhấn ô" giống matching để đồng nhất
   trải nghiệm & không phải viết lại toàn bộ code kéo-thả.
   ============================================================ */

function renderClassify(q, qi) {
  const body = document.getElementById('q-body');
  if (!body) return;
  if (!State.classify[qi]) State.classify[qi] = {};
  const placed = State.classify[qi];
  const items  = q.items || [];
  const pool   = q._poolShow || items.concat(Array.isArray(q.distractors) ? q.distractors : []);
  const zones  = q._zonesShow || (q.zones || []).map(z => (typeof z === 'string' ? { label: z } : z));

  const unplaced = pool.filter(it => !placed[it.text]);
  // Đếm số item BẮT BUỘC (không tính thẻ mồi nhử) đã được xếp đúng-hay-sai
  // để hiển thị tiến độ nhất quán với logic chấm điểm (chỉ dựa trên q.items).
  const answeredCount = items.filter(it => placed[it.text] !== undefined).length;

  body.innerHTML = `
    ${q.hint ? `<div class="q-hint-line">💡 ${q.hint}</div>` : ''}
    <div class="match-hint">
      🖐️ Kéo-thả (hoặc bấm chọn rồi bấm vào nhóm) để phân loại
      <span class="match-hint-count">${answeredCount}/${items.length} đã phân loại</span>
    </div>
    <div class="drag-pool-title">📦 Các mục cần phân loại:</div>
    <div class="drag-pool" id="classifyPool-${qi}">
      ${unplaced.length > 0
        ? unplaced.map(it => `
            <div class="drag-chip classify-chip${it.image_file ? ' classify-chip-img' : ''}" data-qi="${qi}" draggable="true"
                 data-text="${encodeURIComponent(it.text)}"
                 onclick="onClassifyChipTap(this)">${it.image_file
                   ? `<span class="classify-thumb-image">
                        <img src="img/${it.image_file}" alt="${it.text}" loading="lazy" data-classify-image="1">
                        <span class="img-zoom-btn img-zoom-thumb" role="button" tabindex="0" title="Xem hình lớn" aria-label="Xem hình lớn"
                              onclick="event.stopPropagation();openImgZoom('img/${it.image_file}','${escapeAttr(it.text)}')"
                              onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openImgZoom('img/${it.image_file}','${escapeAttr(it.text)}')}">🔍</span>
                      </span>`
                   : `⠿ ${it.text}`}</div>`).join('')
        : answeredCount >= items.length
          ? `<span class="pool-done">✅ Đã phân loại hết — nhấn ✕ trong nhóm để thay đổi</span>`
          : ''}
    </div>
    <div class="classify-zones${zones.some(z => z.image_file) ? ' classify-zones-img' : ''}">
      ${zones.map(z => `
        <div class="classify-zone" data-qi="${qi}" data-zone="${encodeURIComponent(z.label)}" onclick="onClassifyZoneTap(this)">
          <div class="classify-zone-title">${z.image_file
              ? `<span class="classify-zone-img-wrap"><img src="img/${z.image_file}" alt="" loading="lazy" class="classify-zone-img" data-classify-image="1">
                   <span class="img-zoom-btn img-zoom-thumb" role="button" tabindex="0" title="Xem hình lớn" aria-label="Xem hình lớn"
                         onclick="event.stopPropagation();openImgZoom('img/${z.image_file}','')"
                         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openImgZoom('img/${z.image_file}','')}">🔍</span></span>`
              : z.label}</div>
          <div class="classify-zone-items">
            ${pool.filter(it => placed[it.text] === z.label).map(it => `
              <span class="classify-zone-chip${it.image_file ? ' classify-zone-chip-img' : ''}">${it.image_file
                  ? `<span class="classify-thumb-image">
                       <img src="img/${it.image_file}" alt="${it.text}" loading="lazy" data-classify-image="1">
                       <span class="img-zoom-btn img-zoom-thumb" role="button" tabindex="0" title="Xem hình lớn" aria-label="Xem hình lớn"
                             onclick="event.stopPropagation();openImgZoom('img/${it.image_file}','${escapeAttr(it.text)}')"
                             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openImgZoom('img/${it.image_file}','${escapeAttr(it.text)}')}">🔍</span>
                     </span>`
                  : it.text}
                <button type="button" class="slot-remove" data-qi="${qi}" data-text="${encodeURIComponent(it.text)}"
                        onclick="event.stopPropagation();removeClassifyItem(this)">✕</button>
              </span>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;

  // Gắn drag & drop events — kéo-thả thật (thiếu ở bản trước), song song
  // với bấm-chọn cũ để vẫn dùng tốt trên điện thoại (không có HTML5 drag).
  body.querySelectorAll('.classify-chip').forEach(chip => {
    chip.addEventListener('dragstart', onClassifyDragStart);
    chip.addEventListener('dragend',   onClassifyDragEnd);
  });
  body.querySelectorAll('.classify-zone').forEach(zone => {
    zone.addEventListener('dragover',  onClassifyDragOver);
    zone.addEventListener('dragleave', onClassifyDragLeave);
    zone.addEventListener('drop',      onClassifyDrop);
  });
}

// ── Classify tap-select state (bấm chọn rồi bấm vào nhóm — dự phòng
//    cho điện thoại/máy tính bảng, nơi HTML5 drag không hoạt động) ──
let _classifyTapChip = null;
let _classifyTapText = null;
let _classifyTapQi   = null;

function onClassifyChipTap(el) {
  document.querySelectorAll('.classify-chip.tap-selected').forEach(c => c.classList.remove('tap-selected'));
  if (_classifyTapChip === el) { _classifyTapChip = null; _classifyTapText = null; _classifyTapQi = null; return; }
  _classifyTapChip = el;
  _classifyTapText = decodeURIComponent(el.dataset.text);
  _classifyTapQi   = parseInt(el.dataset.qi);
  el.classList.add('tap-selected');
}

function onClassifyZoneTap(el) {
  if (!_classifyTapChip || _classifyTapText === null) return;
  const qi = parseInt(el.dataset.qi);
  if (qi !== _classifyTapQi) return;
  const zone = decodeURIComponent(el.dataset.zone);
  if (!State.classify[qi]) State.classify[qi] = {};
  State.classify[qi][_classifyTapText] = zone;
  State.session.clicks++;
  _classifyTapChip = null; _classifyTapText = null; _classifyTapQi = null;
  updateSidebar();
  renderClassify(State.questions[qi], qi);
}

// ── Classify drag state (kéo-thả thẻ vào nhóm) ──────────────
let _classifyDragText = null;
let _classifyDragQi   = null;

function onClassifyDragStart(e) {
  _classifyDragText = decodeURIComponent(e.currentTarget.dataset.text);
  _classifyDragQi    = parseInt(e.currentTarget.dataset.qi);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _classifyDragText);
}

function onClassifyDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
}

function onClassifyDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onClassifyDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onClassifyDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const qi   = parseInt(e.currentTarget.dataset.qi);
  const zone = decodeURIComponent(e.currentTarget.dataset.zone);
  // Ưu tiên state kéo-thả nội bộ; nếu trống (vd. thẻ được kéo từ nguồn
  // khác) thì lấy lại text đã set qua dataTransfer khi bắt đầu kéo.
  const text = _classifyDragText || decodeURIComponent(e.dataTransfer.getData('text/plain') || '');
  if (!text || qi !== _classifyDragQi) return;
  if (!State.classify[qi]) State.classify[qi] = {};
  State.classify[qi][text] = zone;
  State.session.clicks++;
  _classifyDragText = null; _classifyDragQi = null;
  document.querySelectorAll('.classify-chip.tap-selected').forEach(c => c.classList.remove('tap-selected'));
  _classifyTapChip = null; _classifyTapText = null; _classifyTapQi = null;
  updateSidebar();
  renderClassify(State.questions[qi], qi);
}

function removeClassifyItem(el) {
  const qi   = parseInt(el.dataset.qi);
  const text = decodeURIComponent(el.dataset.text);
  if (State.classify[qi]) delete State.classify[qi][text];
  State.session.clicks++;
  updateSidebar();
  renderClassify(State.questions[qi], qi);
}

// ── Xem hình phóng to (dùng cho các hình thu nhỏ trong câu "phân loại") ──
function escapeAttr(str) {
  return String(str ?? '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

function openImgZoom(src, alt) {
  closeImgZoom();
  const overlay = document.createElement('div');
  overlay.className = 'img-zoom-overlay';
  overlay.id = 'imgZoomOverlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeImgZoom(); };
  overlay.innerHTML = `
    <button type="button" class="img-zoom-close" onclick="closeImgZoom()">✕</button>
    <img src="${src}" alt="${alt || ''}">`;
  document.body.appendChild(overlay);
  document.addEventListener('keydown', _imgZoomEscHandler);
}

function closeImgZoom() {
  const el = document.getElementById('imgZoomOverlay');
  if (el) el.remove();
  document.removeEventListener('keydown', _imgZoomEscHandler);
}

function _imgZoomEscHandler(e) {
  if (e.key === 'Escape') closeImgZoom();
}

/* ============================================================
   § 14e — RENDER ORDERING  (type = "ordering")
   Sắp xếp lại các mục cho đúng thứ tự — điều khiển bằng nút mũi tên
   lên/xuống (an toàn cho cả desktop lẫn điện thoại, không cần cài
   thêm thư viện kéo-thả cho danh sách dọc).
   q.items = [text, ...] theo ĐÚNG thứ tự (nguồn sự thật để chấm điểm)
   ============================================================ */

function renderOrdering(q, qi) {
  const body = document.getElementById('q-body');
  if (!body) return;
  if (!State.ordering[qi]) State.ordering[qi] = [...(q._displayOrder || q.items || [])];
  const order = State.ordering[qi];

  body.innerHTML = `
    ${q.hint ? `<div class="q-hint-line">💡 ${q.hint}</div>` : ''}
    <div class="ordering-list">
      ${order.map((text, j) => `
        <div class="ordering-row">
          <span class="ordering-num">${j + 1}</span>
          <span class="ordering-text">${text}</span>
          <div class="ordering-arrows">
            <button type="button" class="ordering-arrow-btn" ${j === 0 ? 'disabled' : ''}
                    data-qi="${qi}" data-j="${j}" data-dir="-1" onclick="moveOrderingItem(this)">▲</button>
            <button type="button" class="ordering-arrow-btn" ${j === order.length - 1 ? 'disabled' : ''}
                    data-qi="${qi}" data-j="${j}" data-dir="1" onclick="moveOrderingItem(this)">▼</button>
          </div>
        </div>`).join('')}
    </div>`;
}

function moveOrderingItem(el) {
  const qi  = parseInt(el.dataset.qi);
  const j   = parseInt(el.dataset.j);
  const dir = parseInt(el.dataset.dir);
  const order = State.ordering[qi];
  const k = j + dir;
  if (!order || k < 0 || k >= order.length) return;
  [order[j], order[k]] = [order[k], order[j]];
  State.session.clicks++;
  updateSidebar();
  renderOrdering(State.questions[qi], qi);
}

/* ============================================================
   § 14f — RENDER FILL-BLANK  (type = "dragfill" | "selectfill")
   Điền vào chỗ trống trong đoạn văn. Dữ liệu chuẩn hoá:
   q.segments = [text0, text1, ..., textN]  (N = số chỗ trống, đoạn
                 text bao quanh mỗi chỗ trống, segments.length = blanks.length+1)
   q.blanks   = [correctText0, correctText1, ...]  (đáp án đúng của
                 từng chỗ trống, dùng để chấm điểm — SO SÁNH THEO CHỮ,
                 không theo vị trí trong wordBank, nên xáo trộn
                 wordBank không ảnh hưởng chấm điểm)
   q.wordBank = [text, ...]  (toàn bộ lựa chọn hiển thị cho học sinh,
                 có thể trùng lặp nếu 1 đáp án được dùng nhiều lần)
   dragfill  → kéo/nhấn chip (tái dùng cơ chế giống renderMatching)
   selectfill→ dropdown <select> tại mỗi chỗ trống
   ============================================================ */

function renderFillBlank(q, qi) {
  const body = document.getElementById('q-body');
  if (!body) return;
  if (!State.fillblank[qi]) State.fillblank[qi] = {};
  const filled = State.fillblank[qi];
  const segments = q.segments || [];
  const blanks   = q.blanks || [];
  const answeredCount = Object.keys(filled).length;

  const passageHtml = segments.map((seg, i) => {
    const blankHtml = i < blanks.length ? `
      <span class="fillblank-slot ${filled[i] ? 'filled' : 'empty-hint'}"
            data-qi="${qi}" data-bi="${i}"
            onclick="${q.type === 'selectfill' ? '' : 'onFillSlotTap(this)'}">
        ${q.type === 'selectfill'
          ? `<select class="fillblank-select" data-qi="${qi}" data-bi="${i}" onchange="onSelectFillChange(this)">
               <option value="">— Chọn —</option>
               ${(q._wordBankShuffled || q.wordBank || []).filter((w, idx, arr) => arr.indexOf(w) === idx).map(w =>
                 `<option value="${encodeURIComponent(w)}" ${filled[i] === w ? 'selected' : ''}>${w}</option>`).join('')}
             </select>`
          : (filled[i]
              ? `${filled[i]} <button type="button" class="slot-remove" data-qi="${qi}" data-bi="${i}" onclick="event.stopPropagation();removeFillBlank(this)">✕</button>`
              : '…')}
      </span>` : '';
    return `${seg}${blankHtml}`;
  }).join('');

  const poolHtml = q.type === 'dragfill' ? `
    <div class="drag-pool-title">📦 Đáp án — nhấn chip rồi nhấn vào chỗ trống:</div>
    <div class="drag-pool" id="fillPool-${qi}">
      ${_fillPoolChips(q, qi).map(({ w, id }) => `
        <div class="drag-chip fill-chip" data-qi="${qi}" data-text="${encodeURIComponent(w)}"
             id="${id}" onclick="onFillChipTap(this)">⠿ ${w}</div>`).join('')}
    </div>` : '';

  body.innerHTML = `
    ${q.hint ? `<div class="q-hint-line">💡 ${q.hint}</div>` : ''}
    <div style="font-size:.82rem;font-weight:700;color:var(--muted);margin:.4rem 0 .75rem;">
      ${q.type === 'dragfill' ? '🧩' : '▾'} Đã điền: ${answeredCount}/${blanks.length}
    </div>
    ${poolHtml}
    <div class="fillblank-passage">${passageHtml}</div>`;
}

/** Danh sách chip còn lại trong pool (dragfill) — trừ đi những cái đã dùng */
function _fillPoolChips(q, qi) {
  const filled = State.fillblank[qi] || {};
  const usedCount = {};
  Object.values(filled).forEach(w => { usedCount[w] = (usedCount[w] || 0) + 1; });

  const totalCount = {};
  (q.wordBank || []).forEach(w => { totalCount[w] = (totalCount[w] || 0) + 1; });

  const bank = q._wordBankShuffled || q.wordBank || [];
  const chips = [];
  const seenIdx = {};
  bank.forEach(w => {
    seenIdx[w] = (seenIdx[w] || 0) + 1;
    const remain = (totalCount[w] || 0) - (usedCount[w] || 0);
    if (seenIdx[w] <= remain) chips.push({ w, id: `fillchip-${qi}-${encodeURIComponent(w)}-${seenIdx[w]}` });
  });
  return chips;
}

let _fillTapChip = null;
let _fillTapText = null;
let _fillTapQi   = null;

function onFillChipTap(el) {
  document.querySelectorAll('.fill-chip.tap-selected').forEach(c => c.classList.remove('tap-selected'));
  if (_fillTapChip === el) { _fillTapChip = null; _fillTapText = null; _fillTapQi = null; return; }
  _fillTapChip = el;
  _fillTapText = decodeURIComponent(el.dataset.text);
  _fillTapQi   = parseInt(el.dataset.qi);
  el.classList.add('tap-selected');
}

function onFillSlotTap(el) {
  if (!_fillTapChip || _fillTapText === null) return;
  const qi = parseInt(el.dataset.qi);
  if (qi !== _fillTapQi) return;
  const bi = parseInt(el.dataset.bi);
  if (!State.fillblank[qi]) State.fillblank[qi] = {};
  State.fillblank[qi][bi] = _fillTapText;
  State.session.clicks++;
  _fillTapChip = null; _fillTapText = null; _fillTapQi = null;
  updateSidebar();
  renderFillBlank(State.questions[qi], qi);
}

function removeFillBlank(el) {
  const qi = parseInt(el.dataset.qi);
  const bi = parseInt(el.dataset.bi);
  if (State.fillblank[qi]) delete State.fillblank[qi][bi];
  State.session.clicks++;
  updateSidebar();
  renderFillBlank(State.questions[qi], qi);
}

function onSelectFillChange(el) {
  const qi = parseInt(el.dataset.qi);
  const bi = parseInt(el.dataset.bi);
  const val = el.value ? decodeURIComponent(el.value) : null;
  if (!State.fillblank[qi]) State.fillblank[qi] = {};
  if (val) State.fillblank[qi][bi] = val;
  else delete State.fillblank[qi][bi];
  State.session.clicks++;
  updateSidebar();
  // Không render lại toàn bộ (mất focus dropdown) — chỉ cập nhật bộ đếm dòng trên
  const q = State.questions[qi];
  const counterLine = el.closest('#q-body')?.querySelector('div[style*="Đã điền"]');
  if (counterLine) {
    const answeredCount = Object.keys(State.fillblank[qi] || {}).length;
    counterLine.textContent = `${q.type === 'dragfill' ? '🧩' : '▾'} Đã điền: ${answeredCount}/${(q.blanks||[]).length}`;
  }
}

/* ============================================================
   § 15 — FLAG
   ============================================================ */

function toggleFlag(i) {
  if (State.flags.has(i)) State.flags.delete(i);
  else                    State.flags.add(i);
  renderQuestion(i);
}

/* ============================================================
   § 16 — SUBMIT & GRADING  (Task 4)
   Chấm điểm chính xác theo từng type câu hỏi
   ============================================================ */

function confirmSubmit() {
  const unansweredIdx = State.questions
    .map((_, i) => i)
    .filter(i => !isAnswered(i));

  if (unansweredIdx.length > 0) {
    showNotification(
      `⚠️ Bạn còn ${unansweredIdx.length} câu chưa làm đủ. Vui lòng hoàn thành tất cả câu hỏi trước khi nộp bài.`,
      'warning'
    );
    jumpTo(unansweredIdx[0]);
    return;
  }

  if (confirm('Bạn có chắc muốn nộp bài không?')) submitExam();
}

function autoSubmit() {
  State.session.timedOut = true;
  alert('⏰ Hết giờ! Bài thi được nộp tự động.');
  submitExam();
}

function submitExam() {
  clearInterval(State.timer);
  flushQTime(State.current);
  const elapsed   = Math.round((Date.now() - State.session.startTime) / 1000);
  const result    = gradeExam();
  const integrity = computeIntegrity(result, elapsed);
  const gameResult = saveRecord(result, elapsed, integrity);
  showResult(result, integrity);

  // ── Thông báo huy hiệu mới (nếu có) ────────────────────────
  if (gameResult?.newBadges?.length) {
    gameResult.newBadges.forEach((badge, i) => {
      setTimeout(() => showNotification(`Huy hiệu mới: ${badge.label}`, 'success'), 600 * (i + 1));
    });
  }

  // Gửi lên Google Sheet (chạy nền, chỉ để đối chiếu/dự phòng)
  if (typeof submitToGoogleSheet === 'function') {
    submitToGoogleSheet(result, elapsed, integrity);
  }

  // Lưu vào Firestore (nguồn dữ liệu CHÍNH cho trang Báo cáo trực quan
  // ic3-dashboard.html — điều phối đào tạo / giáo viên / admin xem)
  if (typeof saveResultToFirestore === 'function') {
    const s   = State.session;
    const pct = Math.round((result.correct / result.total) * 100);
    saveResultToFirestore({
      studentName:   s.studentName,
      studentClass:  s.studentClass  || '',
      studentSchool: s.studentSchool || '',
      category:      s.category,
      level:         s.level,
      minitest:      s.minitest,
      score:         pct,
      correct:       result.correct,
      incorrect:     result.incorrect,
      skipped:       result.skipped,
      total:         result.total,
      elapsedSec:    elapsed,
      tabSwitches:   integrity.tabSwitches,
      clicks:        integrity.clicks,
      integrityOk:   integrity.valid,
      flags:         integrity.flags,
      timedOut:      s.timedOut,
    });
  }
}

/**
 * Chấm điểm chính xác theo từng type (Task 4):
 *
 * single:    correct[0] so với State.answers[i] (string)
 * multi:     so sánh mảng đã sort (thứ tự không quan trọng)
 * truefalse: every statement phải đúng answer
 * matching:  every pair phải đúng
 */
function gradeExam() {
  let correct = 0, incorrect = 0, skipped = 0;
  const details = [];

  State.questions.forEach((q, i) => {
    const ua = State.answers[i];   // user answer
    const ma = State.matching[i];  // user matching
    let status = 'skipped';

    switch (q.type) {
      case 'single':
        if (!ua) {
          skipped++;
        } else if ((q.correct || []).includes(ua)) {
          correct++; status = 'correct';
        } else {
          incorrect++; status = 'incorrect';
        }
        break;

      case 'multi': {
        // Sắp xếp cả 2 mảng rồi so sánh để không phụ thuộc thứ tự
        const userArr = [...(ua || [])].sort();
        const corrArr = [...(q.correct || [])].sort();
        if (userArr.length === 0) {
          skipped++;
        } else if (JSON.stringify(userArr) === JSON.stringify(corrArr)) {
          correct++; status = 'correct';
        } else {
          incorrect++; status = 'incorrect';
        }
        break;
      }

      case 'truefalse': {
        const ans = ua || {};
        if (Object.keys(ans).length === 0) {
          skipped++;
        } else {
          // Kiểm tra TẤT CẢ statements phải đúng
          const allCorrect = (q.statements || []).every((st, j) => ans[j] === st.answer);
          if (allCorrect) { correct++; status = 'correct'; }
          else            { incorrect++; status = 'incorrect'; }
        }
        break;
      }

      case 'matching': {
        if (!q.pairs || q.pairs.length === 0) {
          skipped++;
        } else if (!ma || Object.keys(ma).length === 0) {
          skipped++;
        } else {
          const ok = q.pairs.every(p => ma[p.left] === p.right);
          if (ok) { correct++; status = 'correct'; }
          else    { incorrect++; status = 'incorrect'; }
        }
        break;
      }

      case 'hotspot': {
        const selSet = State.hotspot[i];
        const correctIds = (q.areas || []).filter(a => a.correct).map(a => a.id).sort();
        if (!selSet || selSet.size === 0) {
          skipped++;
        } else {
          const selArr = [...selSet].sort();
          const ok = JSON.stringify(selArr) === JSON.stringify(correctIds);
          if (ok) { correct++; status = 'correct'; }
          else    { incorrect++; status = 'incorrect'; }
        }
        break;
      }

      case 'list': {
        const ans = State.list[i] || {};
        const items = q.items || [];
        if (Object.keys(ans).length === 0) {
          skipped++;
        } else {
          const allCorrect = items.every((it, j) => ans[j] === it.correct);
          if (allCorrect) { correct++; status = 'correct'; }
          else             { incorrect++; status = 'incorrect'; }
        }
        break;
      }

      case 'classify': {
        const ans = State.classify[i] || {};
        const items = q.items || [];
        // Bỏ qua/skip chỉ khi KHÔNG item bắt buộc nào được xếp — thẻ mồi nhử
        // (q.distractors) lỡ bị kéo vào 1 nhóm không tính là "đã trả lời".
        if (!items.some(it => ans[it.text] !== undefined)) {
          skipped++;
        } else {
          const allCorrect = items.every(it => ans[it.text] === it.zone);
          if (allCorrect) { correct++; status = 'correct'; }
          else             { incorrect++; status = 'incorrect'; }
        }
        break;
      }

      case 'ordering': {
        const ans = State.ordering[i];
        const correctOrder = q.items || [];
        if (!ans || ans.length === 0) {
          skipped++;
        } else {
          const ok = JSON.stringify(ans) === JSON.stringify(correctOrder);
          if (ok) { correct++; status = 'correct'; }
          else    { incorrect++; status = 'incorrect'; }
        }
        break;
      }

      case 'dragfill':
      case 'selectfill': {
        const ans = State.fillblank[i] || {};
        const blanks = q.blanks || [];
        if (Object.keys(ans).length === 0) {
          skipped++;
        } else {
          const allCorrect = blanks.every((correctText, bi) => ans[bi] === correctText);
          if (allCorrect) { correct++; status = 'correct'; }
          else             { incorrect++; status = 'incorrect'; }
        }
        break;
      }

      default:
        skipped++;
    }

    details.push({
      num:         i + 1,
      qId:         q.id,
      uid:         q.uid || '',
      type:        q.type,
      text:        q.question.slice(0, 60) + (q.question.length > 60 ? '…' : ''),
      fullText:    q.question,
      imageUrl:    q.imageUrl || '',
      explanation: q.explanation || '',
      status,
      // Dữ liệu thô để js/review-detail.js dựng phần "xem chi tiết" —
      // không dùng để chấm điểm (đã chấm ở switch phía trên).
      raw: {
        options:    q.options   || null,   // single/multi
        correct:    q.correct   || null,   // single/multi
        userAns:    q.type === 'single' ? (ua ?? null)
                  : q.type === 'multi'  ? (ua || [])
                  : null,
        statements: q.type === 'truefalse' ? (q.statements || []) : null,
        userTF:     q.type === 'truefalse' ? (ua || {}) : null,
        labelTrue:  q.label_true  || 'Đúng',
        labelFalse: q.label_false || 'Sai',
        pairs:      q.type === 'matching' ? (q.pairs || []) : null,
        userMatch:  q.type === 'matching' ? (ma || {}) : null,
        areas:      q.type === 'hotspot' ? (q.areas || []) : null,
        userAreas:  q.type === 'hotspot' ? [...(State.hotspot[i] || [])] : null,
        listItems:  q.type === 'list' ? (q.items || []) : null,
        userList:   q.type === 'list' ? (State.list[i] || {}) : null,
        classifyItems: q.type === 'classify' ? (q.items || []) : null,
        userClassify:  q.type === 'classify' ? (State.classify[i] || {}) : null,
        orderCorrect:  q.type === 'ordering' ? (q.items || []) : null,
        orderUser:     q.type === 'ordering' ? (State.ordering[i] || []) : null,
        segments:   (q.type === 'dragfill' || q.type === 'selectfill') ? (q.segments || []) : null,
        blanks:     (q.type === 'dragfill' || q.type === 'selectfill') ? (q.blanks || []) : null,
        userBlanks: (q.type === 'dragfill' || q.type === 'selectfill') ? (State.fillblank[i] || {}) : null,
      },
    });
  });

  return { correct, incorrect, skipped, total: State.questions.length, details };
}

/* ============================================================
   § 17 — ANTI-CHEAT: INTEGRITY CHECK  (Task 4 — giữ nguyên)
   ============================================================ */

function computeIntegrity(result, elapsedSec) {
  const flags = [];
  const s     = State.session;
  const answered = result.correct + result.incorrect;

  // 1. Tốc độ làm bài
  const avgSec = answered > 0 ? elapsedSec / answered : 0;
  if (answered > 3 && avgSec < 3) {
    flags.push(`Tốc độ làm bài quá nhanh (TB ${avgSec.toFixed(1)}s/câu)`);
  }

  // 2. Chuyển tab
  if (s.tabSwitches >= 3) {
    flags.push(`Rời khỏi tab ${s.tabSwitches} lần`);
  }

  // 3. Không có click nhưng có đáp án
  if (s.clicks === 0 && answered > 0) {
    flags.push('Không có thao tác bấm nhưng có đáp án — dữ liệu bất thường');
  }

  // 4. Trả lời dưới 1 giây
  const ultraFast = Object.entries(s.qTimes || {}).filter(([qi, t]) => {
    return t < 1 && isAnswered(parseInt(qi));
  });
  if (ultraFast.length > Math.max(2, result.total * 0.25)) {
    flags.push(`${ultraFast.length} câu trả lời trong dưới 1 giây`);
  }

  return {
    flags,
    valid:       flags.length === 0,
    tabSwitches: s.tabSwitches,
    clicks:      s.clicks,
    elapsedSec,
    avgSecPerQ:  parseFloat(avgSec.toFixed(1)),
    timedOut:    s.timedOut,
  };
}

/* ============================================================
   § 18 — SAVE RECORD (localStorage)
   ============================================================ */

function saveRecord(result, elapsedSec, integrity) {
  const s   = State.session;
  const pct = Math.round((result.correct / result.total) * 100);
  const rec = {
    id:            Date.now(),
    studentName:   s.studentName,
    studentClass:  s.studentClass  || '',
    studentSchool: s.studentSchool || '',
    category:      s.category,
    level:         s.level,
    minitest:      s.minitest,
    isRandomMix:   !!s.isRandomMix, // chỉ bài "Tổng hợp" mới được tính để mở khóa Khu Vui Chơi
    date:          new Date().toLocaleString('vi-VN'),
    score:         pct,
    correct:       result.correct,
    incorrect:     result.incorrect,
    skipped:       result.skipped,
    total:         result.total,
    elapsedSec,
    tabSwitches:   s.tabSwitches,
    clicks:        s.clicks,
    avgSecPerQ:    integrity.avgSecPerQ,
    timedOut:      s.timedOut,
    integrityOk:   integrity.valid,
    flags:         integrity.flags,
    details:       result.details,
  };

  try {
    const all = JSON.parse(localStorage.getItem('eduquiz_records') || '[]');
    all.unshift(rec);
    if (all.length > 500) all.length = 500;
    localStorage.setItem('eduquiz_records', JSON.stringify(all));
  } catch (e) {
    console.warn('[EduQuiz] Lưu lịch sử thất bại:', e);
  }

  // ── Gamification: cập nhật XP / streak / huy hiệu (js/gamification.js) ──
  let gameResult = null;
  if (typeof window.EduGamification?.recordResult === 'function') {
    gameResult = window.EduGamification.recordResult(rec);
  }

  // ── Báo cho các module khác (vd. js/game-zone-gate.js) biết vừa có
  //    1 bản ghi kết quả mới được lưu, để tự tính lại trạng thái
  //    khóa/mở Khu Vui Chơi (yêu cầu ≥90% điểm) mà không cần đụng vào
  //    quiz-engine.js thêm lần nữa. ──
  window.dispatchEvent(new CustomEvent('edu:record-saved', { detail: rec }));

  return gameResult;
}

/* ============================================================
   § 19 — SHOW RESULT
   ============================================================ */

function showResult(result, integrity) {
  const { correct, incorrect, skipped, total, details } = result;

  document.getElementById('exam').style.display   = 'none';
  document.getElementById('result').style.display = 'flex';

  const pct = Math.round((correct / total) * 100);

  document.getElementById('resultScore').textContent = `${pct}%`;
  document.getElementById('rCorrect').textContent    = correct;
  document.getElementById('rIncorrect').textContent  = incorrect;
  document.getElementById('rSkipped').textContent    = skipped;

  document.getElementById('resultEmoji').textContent =
    pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : pct >= 50 ? '👍' : '📚';

  document.getElementById('resultLabel').textContent =
    (pct >= 90 ? 'Xuất sắc! Bạn đã làm rất tốt!' :
     pct >= 70 ? 'Tốt lắm! Cố gắng thêm nữa nhé!' :
     pct >= 50 ? 'Khá! Tiếp tục luyện tập!' :
                 'Cần ôn tập thêm. Đừng nản lòng!') +
    ` — ${correct}/${total} câu đúng`;

  const badge = document.getElementById('integrityBadge');
  if (integrity.valid) {
    badge.textContent = '🛡️ Bài làm hợp lệ';
    Object.assign(badge.style, {
      color: 'var(--accent5)',
      background: 'rgba(6,214,160,.08)',
      borderColor: 'rgba(6,214,160,.3)',
    });
  } else {
    badge.innerHTML = `⚠️ Cảnh báo: ${integrity.flags.map(f =>
      `<span style="display:block">${f}</span>`).join('')}`;
    Object.assign(badge.style, {
      color: 'var(--accent4)',
      background: 'rgba(255,209,102,.07)',
      borderColor: 'rgba(255,209,102,.3)',
      textAlign: 'left',
      borderRadius: '10px',
    });
  }

  // Danh sách xem lại đúng/sai (bấm từng câu để mở rộng chi tiết)
  // → tách riêng trong js/review-detail.js, không gộp vào file này.
  if (typeof renderReviewList === 'function') {
    renderReviewList(details);
  } else {
    // Dự phòng tối thiểu nếu review-detail.js chưa được nạp
    document.getElementById('reviewList').innerHTML = details.map(d => `
      <div class="review-item ${d.status}">
        <span class="ri-num">${d.num}</span>
        <span class="ri-icon">${d.status === 'correct' ? '✓' : d.status === 'incorrect' ? '✗' : '–'}</span>
        <span class="ri-text">${d.text}</span>
      </div>`).join('');
  }

  if (pct >= 70) launchConfetti();
}

/* ============================================================
   § 20 — RECORDS MODAL
   ============================================================ */

function showRecords() {
  document.getElementById('recordsModal').style.display = 'flex';
  renderRecords();
}

function closeRecords() {
  document.getElementById('recordsModal').style.display = 'none';
}

function closeModalBg(e) {
  if (e.target.id === 'recordsModal') closeRecords();
}

function renderRecords() {
  const el = document.getElementById('recordsContent');
  let records = [];
  try { records = JSON.parse(localStorage.getItem('eduquiz_records') || '[]'); } catch {}

  if (!records.length) {
    el.innerHTML = '<div class="no-records">📭 Chưa có bài làm nào được lưu.</div>';
    return;
  }

  el.innerHTML = `
    <table class="records-table">
      <thead><tr>
        <th>#</th><th>Học sinh</th><th>Lớp</th><th>Trường</th><th>Bài thi</th>
        <th>Điểm</th><th>Đúng/Tổng</th>
        <th>T.gian</th><th>Tab</th><th>Click</th>
        <th>Tính hợp lệ</th><th>Ngày làm</th>
      </tr></thead>
      <tbody>
        ${records.map((r, i) => `
          <tr>
            <td style="color:var(--muted)">${i + 1}</td>
            <td><strong>${r.studentName}</strong></td>
            <td style="font-size:.85rem">${r.studentClass || '–'}</td>
            <td style="font-size:.8rem">${r.studentSchool || '–'}</td>
            <td style="font-size:.8rem">${r.minitest}<br>
                <span style="color:var(--muted)">${r.level}</span></td>
            <td class="${r.score >= 70 ? 'pass' : 'fail'}">${r.score}%</td>
            <td>${r.correct}/${r.total}</td>
            <td style="font-family:'Space Mono',monospace;font-size:.8rem">${fmtTime(r.elapsedSec)}</td>
            <td class="${r.tabSwitches >= 3 ? 'warn' : ''}">${r.tabSwitches}</td>
            <td>${r.clicks ?? '–'}</td>
            <td class="${r.integrityOk ? 'pass' : 'warn'}">
              ${r.integrityOk ? '✓ Hợp lệ' : '⚠ ' + (r.flags?.[0] || 'Nghi vấn')}
            </td>
            <td style="font-size:.75rem;color:var(--muted)">${r.date}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function clearRecords() {
  if (!confirm('Xóa toàn bộ lịch sử? Hành động này không thể hoàn tác.')) return;
  localStorage.removeItem('eduquiz_records');
  renderRecords();
}

function exportCSV() {
  let records = [];
  try { records = JSON.parse(localStorage.getItem('eduquiz_records') || '[]'); } catch {}
  if (!records.length) { alert('Không có dữ liệu để xuất.'); return; }

  const h = ['STT','Học sinh','Lớp','Trường','Danh mục','Cấp độ','Bài thi','Ngày','Điểm%',
             'Đúng','Sai','Bỏ qua','Tổng','Thời gian(s)','Chuyển tab',
             'Số lần click','TB giây/câu','Hết giờ','Hợp lệ','Cờ cảnh báo'];
  const rows = records.map((r, i) => [
    i + 1, r.studentName, r.studentClass || '', r.studentSchool || '',
    r.category, r.level, r.minitest, r.date,
    r.score, r.correct, r.incorrect ?? r.total - r.correct - r.skipped,
    r.skipped, r.total, r.elapsedSec, r.tabSwitches, r.clicks ?? 0,
    (r.avgSecPerQ || 0).toFixed(1), r.timedOut ? 'Có' : 'Không',
    r.integrityOk ? 'Hợp lệ' : 'Nghi vấn', (r.flags || []).join('; ')
  ]);

  const csv  = [h, ...rows].map(row =>
    row.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')
  ).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a    = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(blob),
    download: `EduQuiz_${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function fmtTime(s) {
  const sec = s || 0;
  return `${String(Math.floor(sec / 60)).padStart(2,'0')}:${String(sec % 60).padStart(2,'0')}`;
}

/* ============================================================
   § 21 — BACK TO LOBBY
   ============================================================ */

function backToLobby() {
  clearInterval(State.timer);
  document.getElementById('exam').style.display    = 'none';
  document.getElementById('result').style.display  = 'none';
  document.getElementById('lobby').style.display   = 'grid';
  document.getElementById('adminEntryLink')?.style.setProperty('display', 'flex');
  // Quay lại từ bài thi/kết quả → luôn về màn Form (chọn bài tiếp theo),
  // bất kể lần trước học sinh đang xem màn Giới thiệu ở màn hình hẹp.
  if (typeof setLobbyView === 'function') setLobbyView('form');
  if (window.EduGamification) EduGamification.renderInto('#lobbyGameStrip');
}

/**
 * Nút "← Quay lại trang chọn bài" trong sidebar khi đang làm bài dở dang —
 * hỏi xác nhận trước vì thoát ngang chừng sẽ KHÔNG lưu/nộp bài đang làm.
 */
function confirmBackToLobby() {
  const ok = confirm('Thoát về trang chọn bài? Bài làm hiện tại sẽ không được lưu và không tính là đã nộp.');
  if (ok) backToLobby();
}

/* ============================================================
   § 22 — CONFETTI
   ============================================================ */

function launchConfetti() {
  const COLORS = ['#4f6bff','#17b3a3','#f6a723','#ff8a3d','#2e8cf0','#dd4fa6'];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.cssText =
        `left:${Math.random() * 100}vw;` +
        `width:${6 + Math.random() * 8}px;height:${10 + Math.random() * 14}px;` +
        `background:${COLORS[Math.floor(Math.random() * COLORS.length)]};` +
        `animation-duration:${1.5 + Math.random() * 2}s;` +
        `animation-delay:${Math.random() * 0.5}s;` +
        `transform:rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }, i * 30);
  }
}

/* ============================================================
   § 23 — UTILS
   ============================================================ */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function animatePick(el) {
  el.style.transform = 'scale(0.97) translateX(3px)';
  setTimeout(() => el.style.transform = '', 150);
}

/* ============================================================
   § 24 — DEMO DATA (dự phòng khi không tải được JSON)
   ============================================================ */

const DEMO_DATA = {
  categories: [{
    id: 'DEMO', name: 'Demo – IC3', color: '#6c63ff',
    levels: [{
      id: 'LV1', name: 'Level Demo', grade: 'K6',
      minitests: {
        'Demo Test': [
          {
            id: 1, type: 'single', image: false,
            question: 'Đâu là hệ điều hành phổ biến nhất trên máy tính để bàn?',
            options: ['Android', 'iOS', 'Windows', 'ChromeOS'],
            correct: ['Windows'],
            uid: 'demo__k6__mt1__q1'
          },
          {
            id: 2, type: 'multi', image: false,
            question: 'Chọn 2 trình duyệt web phổ biến: (Chọn 2)',
            options: ['Microsoft Word', 'Google Chrome', 'Firefox', 'Notepad'],
            correct: ['Google Chrome', 'Firefox'],
            uid: 'demo__k6__mt1__q2'
          },
          {
            id: 3, type: 'truefalse', image: false,
            question: 'Với mỗi phát biểu hãy chọn Đúng hoặc Sai:',
            statements: [
              { text: 'Email là viết tắt của Electronic Mail', answer: 'true' },
              { text: 'RAM là bộ nhớ không mất khi tắt máy',  answer: 'false' }
            ],
            label_true: 'ĐÚNG', label_false: 'SAI',
            uid: 'demo__k6__mt1__q3'
          },
          {
            id: 4, type: 'matching', image: false,
            question: 'Nối hệ điều hành với công ty phát triển:',
            pairs: [
              { left: 'Windows', right: 'Microsoft' },
              { left: 'iOS',     right: 'Apple'     },
              { left: 'Android', right: 'Google'    }
            ],
            uid: 'demo__k6__mt1__q4'
          }
        ]
      }
    }]
  }]
};

/* ============================================================
   § 25 — GOOGLE SHEET INTEGRATION
   Giữ nguyên cấu hình từ file index.html gốc
   (Phần này để trống — module gốc trong index.html vẫn hoạt động)
   ============================================================ */

// Stub nếu hàm chưa được định nghĩa ở nơi khác
if (typeof submitToGoogleSheet !== 'function') {
  window.submitToGoogleSheet = async function (result, elapsedSec, integrity) {
    console.log('[EduQuiz] submitToGoogleSheet: hàm chưa được cấu hình.');
  };
}

/* ============================================================
   § 26 — DARK / LIGHT MODE TOGGLE
   ============================================================ */

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next   = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  const icon = next === 'dark' ? '☀️' : '🌙';
  ['themeToggle', 'themeToggleExam'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = icon;
  });
  try { localStorage.setItem('eduquiz_theme', next); } catch {}
}

// Áp dụng theme đã lưu khi tải trang
(function applyTheme() {
  let saved = 'light';
  try { saved = localStorage.getItem('eduquiz_theme') || 'light'; } catch {}
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.addEventListener('DOMContentLoaded', () => {
      ['themeToggle', 'themeToggleExam'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '☀️';
      });
    });
  }
})();

/* ============================================================
   § 27 — NOTIFICATIONS (Toast UI)
   ============================================================ */

function showNotification(message, type = 'info') {
  let container = document.getElementById('gs-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'gs-toast-container';
    container.style.cssText =
      'position:fixed;top:20px;right:20px;z-index:9999;' +
      'display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const colors = {
    success: { bg: '#1b5e20', border: '#4caf50' },
    error:   { bg: '#7f0000', border: '#f44336' },
    warning: { bg: '#bf360c', border: '#ff9800' },
    info:    { bg: '#0d47a1', border: '#2196f3' },
  };
  const c = colors[type] || colors.info;
  const toast = document.createElement('div');
  toast.style.cssText =
    `background:${c.bg};border:1px solid ${c.border};border-left:4px solid ${c.border};` +
    'color:#fff;padding:12px 18px;border-radius:10px;' +
    "font-family:'Baloo 2',sans-serif;font-size:14px;font-weight:700;" +
    'max-width:360px;box-shadow:0 4px 20px rgba(0,0,0,.5);pointer-events:auto;' +
    'cursor:pointer;opacity:0;transform:translateX(40px);' +
    'transition:opacity .3s ease,transform .3s ease;line-height:1.5;';
  toast.textContent = message;
  toast.onclick = () => {
    toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)';
    setTimeout(() => toast.remove(), 300);
  };
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    toast.style.opacity = '1'; toast.style.transform = 'translateX(0)';
  }));
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

/* ============================================================
   ██ BOOT — Gọi loadData() sau khi DOM sẵn sàng
   ============================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadData);
} else {
  loadData();
}