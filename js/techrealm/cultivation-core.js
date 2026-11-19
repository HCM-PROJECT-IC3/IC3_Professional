/* ============================================================
   js/techrealm/cultivation-core.js — LUẬT TU LUYỆN của TechRealm (Domain thuần).

   MỘT nguồn duy nhất, chạy ở 3 nơi, KHÔNG có bản chép tay:
     • trình duyệt (app React: web/src/features/techrealm/engine.ts import dạng side-effect)
     • Node (unit test: js/techrealm/__tests__/)
     • Apps Script — scripts/build-apps-script.js chép NGUYÊN VĂN file này vào apps/Code.gs.
   Vì vậy: không DOM, không mạng, không localStorage, không Date.now() (giờ do bên gọi đưa vào),
   và không dùng cú pháp `?.` / `??` (giữ an toàn cho V8 của Apps Script).

   Sổ cái (ledger) là CHUỖI SỰ KIỆN CHỈ THÊM. Không dòng nào bị sửa: duyệt, huỷ, đột phá, nhận vật phẩm
   đều là dòng mới trỏ về dòng cũ. Trạng thái hiện tại = summarize(toàn bộ dòng). Mỗi dòng có txId TẤT ĐỊNH
   → gửi lại cùng sự kiện ra cùng txId → summarize chỉ tính 1 lần (chống cộng trùng kể cả khi ghi đua).
   Tài liệu: docs/techrealm/CULTIVATION_SYSTEM.md
   ============================================================ */
(function (root) {
  'use strict';

  /* ── 1. Cảnh giới và tiểu cảnh giới ─────────────────────────────────────────── */
  const REALMS = [
    { id: 1, name: 'Luyện Khí', plain: 'Làm quen' },
    { id: 2, name: 'Trúc Cơ', plain: 'Nền tảng' },
    { id: 3, name: 'Kim Đan', plain: 'Vững vàng' },
    { id: 4, name: 'Nguyên Anh', plain: 'Thành thạo' },
    { id: 5, name: 'Hóa Thần', plain: 'Vận dụng' },
    { id: 6, name: 'Độ Kiếp', plain: 'Vượt thử thách' },
    { id: 7, name: 'Chân Tiên', plain: 'Chứng chỉ thật' },
  ];
  const STAGES = ['Sơ kỳ', 'Trung kỳ', 'Hậu kỳ'];
  const MAX_REALM = 7;

  /* ── 2. Nguồn EXP (chỉ những hoạt động có BẰNG CHỨNG — không có "mở trang") ── */
  // actors: ai được phép gửi sự kiện loại này. 'system' = Apps Script sau khi tự chấm / tự đối chiếu.
  const SOURCES = {
    LESSON:   { label: 'Hoàn thành bài học',      actors: ['system'],                   idField: 'lessonId',   needScore: true },
    EXERCISE: { label: 'Hoàn thành bài tập',      actors: ['system'],                   idField: 'exerciseId', needScore: true },
    TEST:     { label: 'Vượt qua bài kiểm tra',   actors: ['system'],                   idField: 'testId',     needScore: true },
    QUEST:    { label: 'Hoàn thành nhiệm vụ',     actors: ['system', 'teacher', 'admin'], idField: 'questId' },
    PROJECT:  { label: 'Hoàn thành dự án',        actors: ['teacher', 'admin'],         idField: 'projectId',  needPct: true },
    TEACHER:  { label: 'Giáo viên xác nhận',      actors: ['teacher', 'admin'],         idField: 'awardId',    needNote: true },
    ACTIVITY: { label: 'Tham gia hoạt động học tập', actors: ['system', 'teacher', 'admin'], idField: 'activityId' },
    // Bí cảnh: điểm do MÁY CHỦ chạy lại nhật ký thao tác (challenge-core.replay) — không nhận điểm từ trình duyệt.
    CHALLENGE: { label: 'Vượt bí cảnh', actors: ['system'], idField: 'challengeId', needScore: true },
  };

  function seq(prefix, n) { const out = []; for (let i = 1; i <= n; i++) out.push(prefix + i); return out; }

  /* ── 3. Cấu hình mặc định — Admin ghi đè từng phần (mergeConfig), luôn qua validateConfig ── */
  const DEFAULT_CONFIG = {
    version: '2026-11-16',
    // once: true → mỗi (học sinh, id nguồn) chỉ được thưởng 1 lần, làm lại không cộng thêm.
    rewards: {
      LESSON:   { amount: 20, minScore: 70, once: true, perDay: 200 },
      EXERCISE: { amount: 10, minScore: 60, once: true, perDay: 100 },
      TEST:     { amount: 60, minScore: 70, once: true, perfectBonus: 20 },
      QUEST:    { amount: 40, once: true },
      PROJECT:  { once: true, tiers: [{ minPct: 90, amount: 180 }, { minPct: 75, amount: 150 }, { minPct: 50, amount: 120 }] },
      TEACHER:  { amount: 10, maxAmount: 30, perWeek: 50 },          // vượt perWeek → chờ Admin duyệt
      ACTIVITY: { amount: 15, once: true, perDay: 30 },
      // Mỗi màn 1 lần; mức theo điểm máy chủ chấm lại; màn Boss cộng thêm bossBonus.
      CHALLENGE: { once: true, minScore: 50, perDay: 150, bossBonus: 40, tiers: [{ minPct: 85, amount: 30 }, { minPct: 65, amount: 20 }, { minPct: 50, amount: 10 }] },
    },
    // Điều kiện đột phá LÊN cảnh giới n. courses = id công pháp phải hoàn thành; tests = id bài khảo hạch phải đạt.
    breakthrough: {
      2: { minExp: 300,   courses: [],        tests: ['khao-hach-2'], projects: 0, quests: 0 },
      3: { minExp: 900,   courses: ['ic3-1'], tests: ['khao-hach-3'], projects: 1, quests: 0 },
      4: { minExp: 2000,  courses: ['ic3-1', 'mos-word'], tests: ['khao-hach-4'], projects: 2, quests: 1 },
      5: { minExp: 4000,  courses: ['ic3-2'], tests: ['khao-hach-5'], projects: 3, quests: 2 },
      6: { minExp: 7000,  courses: ['ic3-3'], tests: ['khao-hach-6'], projects: 4, quests: 3 },
      7: { minExp: 11000, courses: ['ic3-3'], tests: ['khao-hach-7'], projects: 4, quests: 3, certified: true },
    },
    // Công pháp → danh sách bài (lessonId = <chương trình>-<cấp>/<số bài>, giống learning-core.lessonIdOf).
    // KHỚP data/techrealm/courses.json (scripts/build-techrealm-courses.mjs) — test learning-core.test.js kiểm.
    courses: {
      'ic3-1': seq('ic3-lv1/', 35),
      'ic3-2': seq('ic3-lv2/', 35),
      'ic3-3': seq('ic3-lv3/', 35),
      'mos-word': seq('mos-word/', 8),
    },
    // Vật phẩm tặng khi đột phá thành công lên cảnh giới n.
    realmRewards: {
      2: [{ itemId: 'khung-van-may', qty: 1 }, { itemId: 'linh-thach', qty: 100 }],
      3: [{ itemId: 'khung-kim-an', qty: 1 }, { itemId: 'dh-kim-dan', qty: 1 }, { itemId: 'linh-thach', qty: 200 }],
      4: [{ itemId: 'cp-mos-excel', qty: 1 }, { itemId: 'linh-thach', qty: 300 }],
      5: [{ itemId: 'linh-thach', qty: 400 }],
      6: [{ itemId: 'linh-thach', qty: 500 }],
      7: [{ itemId: 'dh-chan-tien', qty: 1 }],
    },
  };

  /* ── 4. Vật phẩm ─────────────────────────────────────────────────────────── */
  const ITEM_KINDS = ['linh-thach', 'cong-phap', 'phap-bao', 'dan-duoc', 'danh-hieu', 'trang-tri'];
  // Chức năng được phép. KHÔNG có chức năng nào cộng EXP / đổi điểm / đổi cảnh giới — vật phẩm không mua được thành tích.
  const ITEM_EFFECTS = ['currency', 'unlock-course', 'cosmetic', 'title', 'streak-freeze', 'practice-hint'];
  const OBTAIN_TYPES = ['realm', 'achievement', 'shop', 'event', 'start'];
  const DEFAULT_ITEMS = [
    { id: 'linh-thach', name: 'Linh thạch', kind: 'linh-thach', rarity: 1, desc: 'Tiền đổi vật phẩm trang trí.', obtain: { type: 'realm' }, effect: { type: 'currency' } },
    { id: 'cp-mos-excel', name: 'Số Toán Kinh', kind: 'cong-phap', rarity: 3, desc: 'Mở công pháp MOS Excel.', obtain: { type: 'realm', value: 4 }, effect: { type: 'unlock-course', courseId: 'mos-excel' } },
    { id: 'kiem-thanh-phong', name: 'Thanh Phong Kiếm', kind: 'phap-bao', rarity: 3, desc: 'Pháp bảo trang trí hồ sơ.', obtain: { type: 'achievement', value: 'diet-rong' }, effect: { type: 'cosmetic' } },
    { id: 'an-ho-phap', name: 'Ấn Hộ Pháp', kind: 'phap-bao', rarity: 4, desc: 'Dành cho người vững An toàn và bảo mật.', obtain: { type: 'shop', price: 400 }, effect: { type: 'cosmetic' } },
    { id: 'dan-hoi-xuan', name: 'Hồi Xuân Đan', kind: 'dan-duoc', rarity: 2, desc: 'Giữ chuỗi ngày học khi lỡ nghỉ 1 ngày.', obtain: { type: 'shop', price: 150 }, effect: { type: 'streak-freeze', days: 1 } },
    { id: 'dan-ngo-dao', name: 'Ngộ Đạo Đan', kind: 'dan-duoc', rarity: 2, desc: 'Xem 1 gợi ý khi LUYỆN TẬP (không dùng được khi khảo hạch).', obtain: { type: 'shop', price: 60 }, effect: { type: 'practice-hint', uses: 1 } },
    { id: 'dh-kim-dan', name: 'Kim Đan chân nhân', kind: 'danh-hieu', rarity: 4, desc: 'Danh hiệu khi đạt Kim Đan.', obtain: { type: 'realm', value: 3 }, effect: { type: 'title' } },
    { id: 'dh-chan-tien', name: 'Chân Tiên', kind: 'danh-hieu', rarity: 5, desc: 'Đạt chứng chỉ thật, được thầy cô xác nhận.', obtain: { type: 'realm', value: 7 }, effect: { type: 'title' } },
    { id: 'khung-van-may', name: 'Khung Vân Mây', kind: 'trang-tri', rarity: 2, desc: 'Viền chân dung hoạ tiết mây.', obtain: { type: 'realm', value: 2 }, effect: { type: 'cosmetic' } },
    { id: 'khung-kim-an', name: 'Khung Kim Ấn', kind: 'trang-tri', rarity: 5, desc: 'Viền vàng kim của bậc Kim Đan.', obtain: { type: 'realm', value: 3 }, effect: { type: 'cosmetic' } },
  ];

  /* ── 5. Thành tựu (khai báo, đánh giá từ tóm tắt sổ cái) ── */
  const DEFAULT_ACHIEVEMENTS = [
    { id: 'nhap-mon', name: 'Nhập môn', when: { type: 'exp_at_least', value: 1 } },
    { id: 'pha-canh-truc-co', name: 'Phá cảnh Trúc Cơ', when: { type: 'realm_at_least', value: 2 } },
    { id: 'pha-canh-kim-dan', name: 'Phá cảnh Kim Đan', when: { type: 'realm_at_least', value: 3 } },
    { id: 'tho-ca', name: 'Thợ cả', when: { type: 'projects_at_least', value: 3 } },
    { id: 'ngu-hanh-can-bang', name: 'Ngũ hành cân bằng', when: { type: 'all_elements_at_least', value: 60 } },
  ];

  /* ── 6. Linh căn: 7 chủ đề IC3 → 5 linh căn ── */
  const ELEMENTS = ['kim', 'moc', 'thuy', 'hoa', 'tho'];
  const TOPIC_ELEMENT = { 1: 'kim', 2: 'tho', 3: 'tho', 4: 'moc', 5: 'thuy', 6: 'thuy', 7: 'hoa' };
  const ELEMENT_HALF_LIFE_DAYS = 45; // bài cũ giảm nửa trọng số sau 45 ngày → linh căn theo kịp sự tiến bộ

  /* ── Tiện ích ─────────────────────────────────────────────────────────────── */
  const LEARNER_RE = /^L[0-9A-Z]{10}$/;
  const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,79}$/;
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const num = (v) => typeof v === 'number' && isFinite(v);
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /** Ngày theo giờ Việt Nam (UTC+7) — trần ngày/tuần không lệch lúc 0h–7h sáng. */
  function dayKey(iso) { return new Date(Date.parse(iso) + 7 * 3600e3).toISOString().slice(0, 10); }
  function weekKey(iso) {
    const d = new Date(Date.parse(dayKey(iso) + 'T00:00:00Z'));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // thứ Hai đầu tuần
    return d.toISOString().slice(0, 10);
  }
  function fail(code, reason) { return { ok: false, code: code, reason: reason }; }

  function realmInfo(id) { return REALMS[Math.max(1, Math.min(MAX_REALM, id)) - 1]; }

  /* ── Cấu hình ─────────────────────────────────────────────────────────────── */
  /** Ghép phần Admin ghi đè vào mặc định (ghép sâu theo khoá; mảng thay nguyên). */
  function mergeConfig(base, override) {
    if (!isObj(override)) return clone(base);
    const out = clone(base);
    (function merge(dst, src) {
      Object.keys(src).forEach(function (k) {
        if (isObj(src[k]) && isObj(dst[k])) merge(dst[k], src[k]);
        else dst[k] = clone(src[k]);
      });
    })(out, override);
    return out;
  }

  /** Kiểm cấu hình. Trả [] khi hợp lệ, ngược lại danh sách lỗi (chữ tiếng Việt). */
  function validateConfig(c) {
    const e = [];
    if (!isObj(c) || !isObj(c.rewards) || !isObj(c.breakthrough) || !isObj(c.courses)) return ['Thiếu rewards / breakthrough / courses.'];
    if (typeof c.version !== 'string' || !c.version) e.push('Thiếu version.');
    Object.keys(c.rewards).forEach(function (t) {
      const r = c.rewards[t];
      if (!SOURCES[t]) return e.push('Nguồn lạ trong rewards: ' + t);
      const amounts = [r.amount, r.maxAmount, r.perfectBonus, r.perDay, r.perWeek, r.bossBonus].filter(function (x) { return x !== undefined; });
      if (r.tiers) {
        if (!Array.isArray(r.tiers) || !r.tiers.length) e.push(t + ': tiers rỗng.');
        else r.tiers.forEach(function (x) { amounts.push(x.amount); if (!num(x.minPct) || x.minPct < 0 || x.minPct > 100) e.push(t + ': minPct phải 0–100.'); });
      } else if (r.amount === undefined) e.push(t + ': thiếu amount.');
      amounts.forEach(function (a) { if (!Number.isInteger(a) || a < 0 || a > 1000) e.push(t + ': mức thưởng phải là số nguyên 0–1000 (gặp ' + a + ').'); });
      if (r.minScore !== undefined && (!num(r.minScore) || r.minScore < 0 || r.minScore > 100)) e.push(t + ': minScore phải 0–100.');
    });
    Object.keys(SOURCES).forEach(function (t) { if (!c.rewards[t]) e.push('Thiếu mức thưởng cho ' + t + '.'); });
    let prev = 0;
    for (let n = 2; n <= MAX_REALM; n++) {
      const b = c.breakthrough[n];
      if (!isObj(b)) { e.push('Thiếu điều kiện đột phá lên cảnh giới ' + n + '.'); continue; }
      if (!Number.isInteger(b.minExp) || b.minExp <= prev) e.push('Cảnh giới ' + n + ': minExp phải tăng dần (> ' + prev + ').');
      prev = num(b.minExp) ? b.minExp : prev;
      (b.courses || []).forEach(function (id) { if (!c.courses[id]) e.push('Cảnh giới ' + n + ': công pháp lạ ' + id + '.'); });
      if (!Array.isArray(b.tests)) e.push('Cảnh giới ' + n + ': tests phải là mảng.');
    }
    return e;
  }

  /** Kiểm danh mục vật phẩm: đủ thông tin, độ hiếm, điều kiện nhận, chức năng hợp lệ. */
  function validateItems(items) {
    const e = [];
    const seen = {};
    (items || []).forEach(function (it, i) {
      const at = 'Vật phẩm #' + i + (it && it.id ? ' (' + it.id + ')' : '');
      if (!it || !ID_RE.test(it.id || '')) return e.push(at + ': id không hợp lệ.');
      if (seen[it.id]) e.push(at + ': trùng id.');
      seen[it.id] = true;
      if (!it.name || !it.desc) e.push(at + ': thiếu tên hoặc mô tả.');
      if (ITEM_KINDS.indexOf(it.kind) < 0) e.push(at + ': loại lạ ' + it.kind + '.');
      if (!Number.isInteger(it.rarity) || it.rarity < 1 || it.rarity > 5) e.push(at + ': độ hiếm phải 1–5.');
      if (!isObj(it.obtain) || OBTAIN_TYPES.indexOf(it.obtain.type) < 0) e.push(at + ': điều kiện nhận không hợp lệ.');
      if (it.obtain && it.obtain.type === 'shop' && !(Number.isInteger(it.obtain.price) && it.obtain.price > 0)) e.push(at + ': hàng bán phải có giá.');
      if (!isObj(it.effect) || ITEM_EFFECTS.indexOf(it.effect.type) < 0) e.push(at + ': chức năng không hợp lệ (không được cộng EXP).');
      if (it.kind === 'dan-duoc' && ['streak-freeze', 'practice-hint'].indexOf(it.effect && it.effect.type) < 0) e.push(at + ': đan dược chỉ hỗ trợ luyện tập.');
    });
    return e;
  }

  /* ── Mã giao dịch tất định ─────────────────────────────────────────────────── */
  function safePart(s) { return String(s).replace(/\|/g, '/'); }
  function txIdOf(learnerId, type, key) { return [learnerId, type, key].map(safePart).join('|'); }

  /* ── Tóm tắt sổ cái ─────────────────────────────────────────────────────────
     Dòng (row): { txId, learnerId, kind, type?, sourceId?, amount?, status?, refTxId?, itemId?, qty?,
                   realm?, achievementId?, facts?, note?, by, createdAt, rulesVersion }
     kind: 'exp' | 'review' | 'reversal' | 'realm' | 'item' | 'achievement' | 'assessment'
     Cùng txId xuất hiện nhiều lần (ghi đua / gửi lại) → chỉ dòng ĐẦU TIÊN có hiệu lực. */
  function summarize(rows) {
    const seen = {};
    const list = [];
    (rows || []).forEach(function (r) { if (r && r.txId && !seen[r.txId]) { seen[r.txId] = true; list.push(r); } });
    list.sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0; });

    const review = {};
    const reversed = {};
    list.forEach(function (r) {
      if (r.kind === 'review' && r.refTxId && !review[r.refTxId]) review[r.refTxId] = r;
      if (r.kind === 'reversal' && r.refTxId) reversed[r.refTxId] = r;
    });

    const s = {
      exp: 0, pendingExp: 0, realm: 1, realmAt: null, items: {}, achievements: {},
      lessonsDone: {}, testsPassed: {}, projects: 0, quests: 0, certified: false,
      activitySec: 0, byType: {}, history: [], assessments: [], txIds: seen,
    };
    list.forEach(function (r) {
      if (r.kind === 'exp') {
        let status = r.status;
        if (status === 'pending' && review[r.txId]) status = review[r.txId].status === 'confirmed' ? 'confirmed' : 'rejected';
        if (reversed[r.txId]) status = 'reversed';
        // Người xác nhận hiển thị = người ra quyết định CUỐI: huỷ > duyệt > người ghi.
        const last = reversed[r.txId] || review[r.txId];
        const h = { txId: r.txId, kind: 'exp', type: r.type, sourceId: r.sourceId, amount: r.amount, status: status, by: last ? last.by : r.by, at: r.createdAt, note: r.note };
        if (reversed[r.txId]) h.reverseNote = reversed[r.txId].note;
        s.history.push(h);
        if (r.facts && num(r.facts.durationSec)) s.activitySec += r.facts.durationSec;
        if (status === 'pending') s.pendingExp += r.amount;
        if (status !== 'confirmed') return;
        s.exp += r.amount;
        s.byType[r.type] = (s.byType[r.type] || 0) + r.amount;
        if (r.type === 'LESSON') s.lessonsDone[r.sourceId] = true;
        if (r.type === 'TEST') s.testsPassed[r.sourceId] = true;
        if (r.type === 'PROJECT') s.projects++;
        if (r.type === 'QUEST') { s.quests++; if (r.facts && r.facts.certified) s.certified = true; }
      } else if (r.kind === 'realm') {
        if (r.realm > s.realm) { s.realm = r.realm; s.realmAt = r.createdAt; }
        s.history.push({ txId: r.txId, kind: 'realm', realm: r.realm, by: r.by, at: r.createdAt });
      } else if (r.kind === 'item') {
        s.items[r.itemId] = (s.items[r.itemId] || 0) + (r.qty || 1);
        s.history.push({ txId: r.txId, kind: 'item', itemId: r.itemId, qty: r.qty || 1, by: r.by, at: r.createdAt, note: r.note });
      } else if (r.kind === 'achievement') {
        s.achievements[r.achievementId] = r.createdAt;
        s.history.push({ txId: r.txId, kind: 'achievement', achievementId: r.achievementId, by: r.by, at: r.createdAt });
      } else if (r.kind === 'assessment') {
        s.assessments.push({ at: r.createdAt, topics: (r.facts && r.facts.topics) || {} });
      }
    });
    s.history.reverse(); // mới nhất trước
    return s;
  }

  /* ── Tiểu cảnh giới: chia đoạn EXP của cảnh giới hiện tại thành 3 kỳ ──
     Cảnh giới do ĐỘT PHÁ quyết định, không do EXP. EXP vượt ngưỡng mà chưa đột phá → "Hậu kỳ · đỉnh phong". */
  function stageOf(realm, exp, config) {
    const c = config || DEFAULT_CONFIG;
    if (realm >= MAX_REALM) return { realm: MAX_REALM, stage: 'Viên mãn', index: 3, from: c.breakthrough[MAX_REALM].minExp, to: null, progress: 1, peak: false };
    const from = realm === 1 ? 0 : c.breakthrough[realm].minExp;
    const to = c.breakthrough[realm + 1].minExp;
    const span = to - from;
    const into = Math.max(0, exp - from);
    const peak = exp >= to;
    const index = peak ? 2 : Math.min(2, Math.floor((into / span) * 3));
    return { realm: realm, stage: STAGES[index], index: index, from: from, to: to, progress: Math.min(1, into / span), peak: peak };
  }

  /* ── Đột phá ── */
  function breakthroughCheck(summary, config) {
    const c = config || DEFAULT_CONFIG;
    const target = summary.realm + 1;
    if (target > MAX_REALM) return { from: summary.realm, to: null, eligible: false, conditions: [] };
    const b = c.breakthrough[target];
    const conds = [];
    conds.push({ id: 'exp', label: 'Đạt ' + b.minExp + ' EXP', current: Math.min(summary.exp, b.minExp), target: b.minExp, met: summary.exp >= b.minExp });
    (b.courses || []).forEach(function (cid) {
      const lessons = c.courses[cid] || [];
      const done = lessons.filter(function (l) { return summary.lessonsDone[l]; }).length;
      conds.push({ id: 'course:' + cid, label: 'Hoàn thành công pháp ' + cid, current: done, target: lessons.length, met: lessons.length > 0 && done === lessons.length });
    });
    (b.tests || []).forEach(function (tid) {
      conds.push({ id: 'test:' + tid, label: 'Vượt qua ' + tid, current: summary.testsPassed[tid] ? 1 : 0, target: 1, met: !!summary.testsPassed[tid] });
    });
    if (b.projects) conds.push({ id: 'projects', label: 'Dự án được duyệt', current: Math.min(summary.projects, b.projects), target: b.projects, met: summary.projects >= b.projects });
    if (b.quests) conds.push({ id: 'quests', label: 'Nhiệm vụ thực hành', current: Math.min(summary.quests, b.quests), target: b.quests, met: summary.quests >= b.quests });
    if (b.certified) conds.push({ id: 'certified', label: 'Chứng chỉ thật được xác nhận', current: summary.certified ? 1 : 0, target: 1, met: summary.certified });
    return { from: summary.realm, to: target, eligible: conds.every(function (x) { return x.met; }), conditions: conds };
  }

  /** Dòng sổ cái cho 1 lần đột phá thành công (cảnh giới + vật phẩm thưởng). null khi chưa đủ điều kiện. */
  function breakthroughRows(learnerId, summary, config, by, nowIso) {
    const c = config || DEFAULT_CONFIG;
    const chk = breakthroughCheck(summary, c);
    if (!chk.eligible) return null;
    const rows = [{ txId: txIdOf(learnerId, 'REALM', chk.to), learnerId: learnerId, kind: 'realm', realm: chk.to, by: by, createdAt: nowIso, rulesVersion: c.version }];
    (c.realmRewards[chk.to] || []).forEach(function (g) {
      rows.push({ txId: txIdOf(learnerId, 'ITEM', g.itemId + '@realm-' + chk.to), learnerId: learnerId, kind: 'item', itemId: g.itemId, qty: g.qty, note: 'Thưởng đột phá ' + realmInfo(chk.to).name, by: by, createdAt: nowIso, rulesVersion: c.version });
    });
    return { to: chk.to, rows: rows };
  }

  /* ── Tính 1 sự kiện → dòng EXP (hoặc từ chối có lý do) ──
     event: { type, learnerId, evidence: { <idField>, score?, pct?, amount?, note?, durationSec?, topic?, certified? } }
     ctx:   { config, summary (của học sinh đó), actor: { kind:'system'|'teacher'|'admin', uid }, now: ISO } */
  function evaluateEvent(event, ctx) {
    const c = ctx.config || DEFAULT_CONFIG;
    const actor = ctx.actor || {};
    if (!isObj(event)) return fail('invalid', 'Sự kiện rỗng.');
    const src = SOURCES[event.type];
    if (!src) return fail('invalid', 'Loại hoạt động không được thưởng: ' + event.type + '.');
    if (!LEARNER_RE.test(event.learnerId || '')) return fail('invalid', 'Mã học viên không hợp lệ.');
    if (src.actors.indexOf(actor.kind) < 0) return fail('forbidden', src.label + ' chỉ ghi nhận bởi: ' + src.actors.join(', ') + '.');
    const ev = isObj(event.evidence) ? event.evidence : {};
    const sourceId = ev[src.idField];
    if (!ID_RE.test(String(sourceId || ''))) return fail('invalid', 'Thiếu hoặc sai ' + src.idField + '.');
    if (src.needScore && !(num(ev.score) && ev.score >= 0 && ev.score <= 100)) return fail('invalid', 'Điểm phải 0–100 (do máy chủ chấm).');
    if (src.needPct && !(num(ev.pct) && ev.pct >= 0 && ev.pct <= 100)) return fail('invalid', 'Điểm tiêu chí (pct) phải 0–100.');
    if (src.needNote && !(typeof ev.note === 'string' && ev.note.trim().length >= 5 && ev.note.length <= 300)) return fail('invalid', 'Cần ghi lý do (5–300 ký tự).');

    const rule = c.rewards[event.type];
    const txId = txIdOf(event.learnerId, event.type, sourceId);
    const s = ctx.summary || summarize([]);
    if (s.txIds[txId]) return { ok: true, duplicate: true, txId: txId };

    // Mức thưởng — luôn tra bảng, không lấy số từ bên gửi (trừ TEACHER: trong [1, maxAmount]).
    let amount;
    if (src.needScore && ev.score < rule.minScore) return fail('below-threshold', 'Chưa đạt ' + rule.minScore + ' điểm — làm lại khi sẵn sàng.');
    if (rule.tiers) {
      const val = src.needPct ? ev.pct : ev.score; // dự án: điểm tiêu chí; bí cảnh: điểm máy chủ chấm lại
      const tier = rule.tiers.slice().sort(function (a, b) { return b.minPct - a.minPct; }).filter(function (t) { return val >= t.minPct; })[0];
      if (!tier) return fail('below-threshold', 'Chưa đạt mức tối thiểu.');
      amount = tier.amount + (rule.bossBonus && ev.boss === true ? rule.bossBonus : 0);
    } else if (event.type === 'TEACHER') {
      amount = ev.amount === undefined ? rule.amount : ev.amount;
      if (!Number.isInteger(amount) || amount < 1 || amount > rule.maxAmount) return fail('invalid', 'Mức thưởng của thầy cô phải 1–' + rule.maxAmount + '.');
    } else {
      amount = rule.amount + (rule.perfectBonus && ev.score === 100 ? rule.perfectBonus : 0);
    }

    // Trần theo ngày / tuần (tính trên giao dịch đã xác nhận + đang chờ cùng loại).
    let status = 'confirmed';
    const now = ctx.now;
    const used = function (keyFn) {
      return s.history.filter(function (h) {
        return h.kind === 'exp' && h.type === event.type && (h.status === 'confirmed' || h.status === 'pending') && keyFn(h.at) === keyFn(now);
      }).reduce(function (a, h) { return a + h.amount; }, 0);
    };
    if (rule.perDay !== undefined) {
      const left = rule.perDay - used(dayKey);
      if (left <= 0) return fail('cap-reached', 'Đã đạt mức thưởng tối đa hôm nay cho ' + src.label.toLowerCase() + '.');
      amount = Math.min(amount, left);
    }
    if (rule.perWeek !== undefined && used(weekKey) + amount > rule.perWeek) {
      if (event.type !== 'TEACHER') return fail('cap-reached', 'Đã đạt mức thưởng tối đa tuần này.');
      status = 'pending'; // thầy cô thưởng vượt trần tuần → chờ Admin duyệt
    }

    const facts = {};
    ['score', 'pct', 'durationSec', 'topic', 'certified', 'boss'].forEach(function (k) { if (ev[k] !== undefined) facts[k] = ev[k]; });
    return {
      ok: true,
      tx: {
        txId: txId, learnerId: event.learnerId, kind: 'exp', type: event.type, sourceId: String(sourceId), amount: amount,
        status: status, facts: facts, note: ev.note ? String(ev.note).slice(0, 300) : '',
        by: actor.kind === 'system' ? 'system' : String(actor.uid || actor.kind), createdAt: now, rulesVersion: c.version,
      },
    };
  }

  /* ── Linh căn: trung bình có trọng số theo thời gian, từ bài ĐÃ XÁC THỰC ──
     Trả { kim: { score, samples } | null, … }. null = CHƯA ĐÁNH GIÁ (không phải 0, không phải "yếu"). */
  function elementScores(assessments, nowIso) {
    const now = Date.parse(nowIso);
    const acc = {};
    ELEMENTS.forEach(function (e) { acc[e] = { w: 0, sum: 0, n: 0 }; });
    (assessments || []).forEach(function (a) {
      const ageDays = Math.max(0, (now - Date.parse(a.at)) / 864e5);
      const w = Math.pow(0.5, ageDays / ELEMENT_HALF_LIFE_DAYS);
      Object.keys(a.topics || {}).forEach(function (t) {
        const el = TOPIC_ELEMENT[t];
        const v = a.topics[t];
        if (!el || !num(v) || v < 0 || v > 100) return;
        acc[el].w += w; acc[el].sum += w * v; acc[el].n++;
      });
    });
    const out = {};
    ELEMENTS.forEach(function (e) { out[e] = acc[e].n ? { score: Math.round(acc[e].sum / acc[e].w), samples: acc[e].n } : null; });
    return out;
  }

  /* ── Thành tựu mới đạt (chưa có trong sổ cái) ── */
  function newAchievements(summary, catalog, elements) {
    return (catalog || DEFAULT_ACHIEVEMENTS).filter(function (a) {
      if (summary.achievements[a.id]) return false;
      const w = a.when || {};
      switch (w.type) {
        case 'exp_at_least': return summary.exp >= w.value;
        case 'realm_at_least': return summary.realm >= w.value;
        case 'projects_at_least': return summary.projects >= w.value;
        case 'tests_passed_at_least': return Object.keys(summary.testsPassed).length >= w.value;
        case 'all_elements_at_least':
          return !!elements && ELEMENTS.every(function (e) { return elements[e] && elements[e].score >= w.value; });
        default: return false;
      }
    });
  }

  /** Vật phẩm này học sinh đã đủ điều kiện nhận chưa (để hiển thị / cửa hàng kiểm). */
  function canObtain(item, summary, balance) {
    const o = item.obtain || {};
    if (o.type === 'realm') return summary.realm >= (o.value || 1);
    if (o.type === 'achievement') return !!summary.achievements[o.value];
    if (o.type === 'shop') return (balance || 0) >= o.price;
    if (o.type === 'start') return true;
    return false; // event: chỉ cấp qua sự kiện
  }

  const api = {
    REALMS: REALMS, STAGES: STAGES, MAX_REALM: MAX_REALM, SOURCES: SOURCES, DEFAULT_CONFIG: DEFAULT_CONFIG,
    ITEM_KINDS: ITEM_KINDS, ITEM_EFFECTS: ITEM_EFFECTS, DEFAULT_ITEMS: DEFAULT_ITEMS, DEFAULT_ACHIEVEMENTS: DEFAULT_ACHIEVEMENTS,
    ELEMENTS: ELEMENTS, TOPIC_ELEMENT: TOPIC_ELEMENT,
    realmInfo: realmInfo, mergeConfig: mergeConfig, validateConfig: validateConfig, validateItems: validateItems,
    txIdOf: txIdOf, summarize: summarize, stageOf: stageOf, breakthroughCheck: breakthroughCheck, breakthroughRows: breakthroughRows,
    evaluateEvent: evaluateEvent, elementScores: elementScores, newAchievements: newAchievements, canObtain: canObtain,
    dayKey: dayKey, weekKey: weekKey,
  };
  root.EduCultivation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
