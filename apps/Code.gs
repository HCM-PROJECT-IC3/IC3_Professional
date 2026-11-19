// ⚠️ FILE TẠO TỰ ĐỘNG từ js/techrealm/cultivation-core.js, js/techrealm/cultivation-service.js, js/techrealm/learning-core.js, js/techrealm/challenge-core.js, js/techrealm/thanh-pho-mat-dien-core.js, js/techrealm/mentor-core.js + apps/src/*.gs — đừng sửa tay ở đây.
// Sửa file nguồn tương ứng rồi chạy: node scripts/build-apps-script.js
// Thứ tự: cultivation-core.js, cultivation-service.js, learning-core.js, challenge-core.js, thanh-pho-mat-dien-core.js, mentor-core.js, 00-config.gs, 10-router.gs, 20-auth.gs, 30-submissions.gs, 35-mos.gs, 36-batch.gs, 40-results.gs, 45-activity.gs, 47-arena.gs, 48-class-sheet.gs, 49-class-books.gs, 50-reports.gs, 60-maps.gs, 70-github.gs, 75-roster-codes.gs, 77-grading.gs, 78-ai.gs, 79-tr-ledger.gs, 80-sheet-setup.gs, 90-utils.gs, 95-selftest.gs

// ──────────────── js/techrealm/cultivation-core.js (dùng chung với trình duyệt — sửa ở file gốc) ────────────────
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

// ──────────────── js/techrealm/cultivation-service.js (dùng chung với trình duyệt — sửa ở file gốc) ────────────────
/* ============================================================
   js/techrealm/cultivation-service.js — CultivationService (tầng Application, thuần).

   Điều phối luật ở cultivation-core.js với 1 CỔNG lưu trữ duy nhất:
     store.transact(learnerId, fn)  — đọc mọi dòng sổ cái của học sinh, gọi fn(rows) → dòng mới,
                                     ghi các dòng mới mà txId CHƯA có. Phải chạy loại trừ lẫn nhau
                                     (Apps Script: LockService; bộ nhớ: tự nhiên) và trả { appended, rows }.
   Không biết Sheet, Firestore hay trình duyệt tồn tại. Chạy y hệt ở:
     • Apps Script (apps/src/79-tr-ledger.gs nối store = Google Sheet) — NƠI DUY NHẤT ghi sổ cái thật;
     • Node (unit test) và app React (bản xem thử) với store trong bộ nhớ (createMemoryStore).
   Không dùng `?.` / `??` (chép nguyên văn vào apps/Code.gs).
   ============================================================ */
(function (root) {
  'use strict';
  const C = root.EduCultivation;
  if (!C) throw new Error('Cần nạp js/techrealm/cultivation-core.js trước cultivation-service.js');

  const STAFF = ['teacher', 'admin'];

  function create(opts) {
    const store = opts.store;
    const clock = opts.clock || function () { return new Date().toISOString(); };
    const config = C.mergeConfig(C.DEFAULT_CONFIG, opts.config);
    const errs = C.validateConfig(config);
    if (errs.length) throw new Error('Cấu hình tu luyện không hợp lệ: ' + errs.join(' '));
    const items = opts.items || C.DEFAULT_ITEMS;
    const itemErrs = C.validateItems(items);
    if (itemErrs.length) throw new Error('Danh mục vật phẩm không hợp lệ: ' + itemErrs.join(' '));
    const achievements = opts.achievements || C.DEFAULT_ACHIEVEMENTS;

    /** Sau mỗi thay đổi: ghi thêm thành tựu vừa đạt (cùng giao dịch). */
    function withAchievements(learnerId, rows, newRows, by, now) {
      const s = C.summarize(rows.concat(newRows));
      const el = C.elementScores(s.assessments, now);
      return newRows.concat(C.newAchievements(s, achievements, el).map(function (a) {
        return { txId: C.txIdOf(learnerId, 'ACH', a.id), learnerId: learnerId, kind: 'achievement', achievementId: a.id, by: by, createdAt: now, rulesVersion: config.version };
      }));
    }

    /**
     * Ghi nhận 1 hoạt động có bằng chứng. actor: { kind: 'system'|'teacher'|'admin', uid }.
     * → { ok, duplicate?, tx?, code?, reason? }. Gửi lại cùng sự kiện → { ok:true, duplicate:true }, KHÔNG cộng thêm.
     */
    function recordEvent(event, actor) {
      let result;
      const now = clock();
      store.transact(event && event.learnerId, function (rows) {
        const s = C.summarize(rows);
        result = C.evaluateEvent(event, { config: config, summary: s, actor: actor, now: now });
        if (!result.ok || result.duplicate) return [];
        return withAchievements(event.learnerId, rows, [result.tx], result.tx.by, now);
      });
      return result;
    }

    /** Bài đánh giá năng lực đã chấm trên máy chủ → dữ liệu linh căn. topics: { '1'..'7': điểm 0–100 }. */
    function recordAssessment(learnerId, attemptId, topics, actor) {
      if (!actor || actor.kind !== 'system') return { ok: false, code: 'forbidden', reason: 'Chỉ máy chủ chấm mới ghi bài đánh giá.' };
      const clean = {};
      Object.keys(topics || {}).forEach(function (t) {
        const v = topics[t];
        if (C.TOPIC_ELEMENT[t] && typeof v === 'number' && v >= 0 && v <= 100) clean[t] = Math.round(v);
      });
      if (!Object.keys(clean).length) return { ok: false, code: 'invalid', reason: 'Không có điểm chủ đề hợp lệ.' };
      const now = clock();
      const row = { txId: C.txIdOf(learnerId, 'ASSESS', attemptId), learnerId: learnerId, kind: 'assessment', sourceId: String(attemptId), facts: { topics: clean }, by: 'system', createdAt: now, rulesVersion: config.version };
      const out = store.transact(learnerId, function (rows) { return withAchievements(learnerId, rows, [row], 'system', now); });
      return { ok: true, duplicate: !out.appended.some(function (r) { return r.txId === row.txId; }) };
    }

    /** Duyệt giao dịch đang chờ (chỉ Admin — giao dịch chờ là thưởng của thầy cô vượt trần tuần). */
    function review(learnerId, refTxId, decision, actor, note) {
      if (!actor || actor.kind !== 'admin') return { ok: false, code: 'forbidden', reason: 'Chỉ Admin duyệt giao dịch chờ.' };
      if (decision !== 'confirmed' && decision !== 'rejected') return { ok: false, code: 'invalid', reason: 'Quyết định phải là confirmed hoặc rejected.' };
      let result;
      const now = clock();
      store.transact(learnerId, function (rows) {
        const h = C.summarize(rows).history.filter(function (x) { return x.txId === refTxId; })[0];
        if (!h) { result = { ok: false, code: 'not-found', reason: 'Không có giao dịch này.' }; return []; }
        if (h.status !== 'pending') { result = { ok: true, duplicate: true, status: h.status }; return []; }
        result = { ok: true, status: decision };
        return withAchievements(learnerId, rows, [{ txId: refTxId + '|review', learnerId: learnerId, kind: 'review', refTxId: refTxId, status: decision, note: note || '', by: actor.uid, createdAt: now, rulesVersion: config.version }], actor.uid, now);
      });
      return result;
    }

    /** Huỷ 1 giao dịch đã xác nhận (phát hiện gian lận, chấm nhầm). Bắt buộc lý do. Cảnh giới đã đạt KHÔNG bị hạ tự động. */
    function reverse(learnerId, refTxId, actor, note) {
      if (!actor || STAFF.indexOf(actor.kind) < 0) return { ok: false, code: 'forbidden', reason: 'Chỉ thầy cô / Admin được huỷ giao dịch.' };
      if (!(typeof note === 'string' && note.trim().length >= 5)) return { ok: false, code: 'invalid', reason: 'Cần ghi lý do huỷ (từ 5 ký tự).' };
      let result;
      const now = clock();
      store.transact(learnerId, function (rows) {
        const h = C.summarize(rows).history.filter(function (x) { return x.txId === refTxId && x.kind === 'exp'; })[0];
        if (!h) { result = { ok: false, code: 'not-found', reason: 'Không có giao dịch EXP này.' }; return []; }
        if (h.status === 'reversed') { result = { ok: true, duplicate: true }; return []; }
        result = { ok: true };
        return [{ txId: refTxId + '|reversal', learnerId: learnerId, kind: 'reversal', refTxId: refTxId, amount: -h.amount, note: note.slice(0, 300), by: actor.uid, createdAt: now, rulesVersion: config.version }];
      });
      return result;
    }

    /** Học sinh bấm Đột phá: máy chủ tự kiểm lại mọi điều kiện → { ok, to?, items?, conditions? }. */
    function breakthrough(learnerId, actor) {
      let result;
      const now = clock();
      store.transact(learnerId, function (rows) {
        const s = C.summarize(rows);
        const made = C.breakthroughRows(learnerId, s, config, actor && actor.kind === 'system' ? 'system' : String((actor && actor.uid) || 'learner'), now);
        if (!made) {
          result = { ok: false, code: 'not-eligible', reason: 'Chưa đủ điều kiện đột phá.', conditions: C.breakthroughCheck(s, config).conditions };
          return [];
        }
        result = { ok: true, to: made.to, items: made.rows.filter(function (r) { return r.kind === 'item'; }).map(function (r) { return { itemId: r.itemId, qty: r.qty }; }) };
        return withAchievements(learnerId, rows, made.rows, 'system', now);
      });
      return result;
    }

    /** Hồ sơ tu luyện đầy đủ (chỉ đọc). */
    function profile(learnerId) {
      const now = clock();
      let rows = [];
      store.transact(learnerId, function (r) { rows = r; return []; });
      const s = C.summarize(rows);
      return {
        learnerId: learnerId,
        exp: s.exp,
        pendingExp: s.pendingExp,
        realm: C.realmInfo(s.realm),
        stage: C.stageOf(s.realm, s.exp, config),
        next: C.breakthroughCheck(s, config),
        elements: C.elementScores(s.assessments, now),
        items: s.items,
        achievements: s.achievements,
        activityMinutes: Math.round(s.activitySec / 60),
        history: s.history,
      };
    }

    return { config: config, items: items, recordEvent: recordEvent, recordAssessment: recordAssessment, review: review, reverse: reverse, breakthrough: breakthrough, profile: profile };
  }

  /** Kho trong bộ nhớ — cho unit test và bản xem thử. `rows` có thể nạp sẵn. */
  function createMemoryStore(seed) {
    const all = (seed || []).slice();
    return {
      rows: all,
      transact: function (learnerId, fn) {
        const mine = all.filter(function (r) { return r.learnerId === learnerId; });
        const have = {};
        mine.forEach(function (r) { have[r.txId] = true; });
        const appended = (fn(mine.slice()) || []).filter(function (r) { if (have[r.txId]) return false; have[r.txId] = true; return true; });
        appended.forEach(function (r) { all.push(r); });
        return { appended: appended, rows: mine.concat(appended) };
      },
    };
  }

  const api = { create: create, createMemoryStore: createMemoryStore };
  root.EduCultivationService = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ──────────────── js/techrealm/learning-core.js (dùng chung với trình duyệt — sửa ở file gốc) ────────────────
/* ============================================================
   js/techrealm/learning-core.js — LUẬT HỌC TẬP của Tàng Kinh Các (Domain thuần).

   Chạy ở trình duyệt (app React), Node (test) và Apps Script (scripts/build-apps-script.js chép nguyên văn).
   Không DOM, không mạng, không localStorage; không `?.` / `??`.

   Nội dung khoá học: data/techrealm/courses.json (sinh bởi scripts/build-techrealm-courses.mjs từ data/ic3).
   Tiến độ: đọc LỊCH SỬ BÀI LÀM SẴN CÓ (eduquiz_records do js/quiz-engine.js ghi) — không ghi thêm gì, không đổi
   cách chấm. Mỗi bài làm được nối về đúng bài học nhờ { catId, levelId, mtKey } mà sảnh cũ đã lưu.
   Cấu hình của giáo viên (thứ tự mở bài, điểm đạt, khoá/mở bài, video/tài liệu thêm) đi trong LINK lớp học, như
   đề tự soạn `?de=` — 0 lượt Firebase. Cấu hình này chỉ là hướng dẫn học tập; EXP và cảnh giới vẫn do máy chủ xác
   thực (cultivation-core), nên tự sửa link không lấy được phần thưởng nào.
   Tài liệu: docs/techrealm/LEARNING_SYSTEM.md
   ============================================================ */
(function (root) {
  'use strict';

  const LESSON_RE = /^Bài (\d+)[.:]\s*/;
  const ID_RE = /^[a-z0-9][a-z0-9._\/-]{0,99}$/;
  const PASS = 70; // = js/learning-hub.js § PASS

  /** Giống hệt scripts/build-techrealm-courses.mjs § slug (test so khớp với courses.json). */
  function slug(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  /** Bài làm (catId, levelId, tên minitest) → id đơn vị học: bài học, bài kiểm tra, ôn tập; null nếu không thuộc khoá nào. */
  function unitIdOf(catId, levelId, mtKey) {
    if (!catId || !levelId || !mtKey) return null;
    const base = (String(catId) + '-' + String(levelId)).toLowerCase();
    const m = LESSON_RE.exec(mtKey);
    if (m) return { kind: 'lesson', id: base + '/' + Number(m[1]) };
    if (/^Kiểm tra/.test(mtKey)) return { kind: 'gate', id: base + '/kt-' + slug(mtKey) };
    if (/^Ôn tập/.test(mtKey)) return { kind: 'review', id: base + '/ot-' + slug(mtKey) };
    return null;
  }

  /* ── Cấu hình lớp (giáo viên) ─────────────────────────────────────────────── */
  const DEFAULT_COURSE_CFG = { mode: 'sequential', minScore: PASS, locked: [], unlocked: [], gateAfter: {}, extra: {} };

  function cleanStr(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : ''; }
  function cleanUrl(v) {
    const s = cleanStr(v, 300);
    return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : ''; // chỉ https — chặn javascript:, data:, http:
  }
  function cleanIds(a, max) {
    return (Array.isArray(a) ? a : []).filter(function (x) { return typeof x === 'string' && ID_RE.test(x); }).slice(0, max);
  }
  function cleanLinks(a) {
    return (Array.isArray(a) ? a : []).map(function (x) { return x && { title: cleanStr(x.title, 80), url: cleanUrl(x.url) }; })
      .filter(function (x) { return x && x.title && x.url; }).slice(0, 5);
  }

  /** Cấu hình lớp nhận từ link (không tin được) → bản sạch. Sai kiểu thì về mặc định, không ném lỗi. */
  function sanitizeClassConfig(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const out = { v: 1, className: cleanStr(r.className, 40), issuedAt: typeof r.issuedAt === 'number' ? r.issuedAt : 0, courses: {} };
    const courses = r.courses && typeof r.courses === 'object' ? r.courses : {};
    Object.keys(courses).slice(0, 20).forEach(function (cid) {
      if (!ID_RE.test(cid)) return;
      const c = courses[cid] || {};
      const extra = {};
      Object.keys(c.extra && typeof c.extra === 'object' ? c.extra : {}).slice(0, 100).forEach(function (lid) {
        if (!ID_RE.test(lid)) return;
        const e = { videos: cleanLinks(c.extra[lid].videos), docs: cleanLinks(c.extra[lid].docs) };
        if (e.videos.length || e.docs.length) extra[lid] = e;
      });
      const gateAfter = {};
      Object.keys(c.gateAfter && typeof c.gateAfter === 'object' ? c.gateAfter : {}).slice(0, 30).forEach(function (gid) {
        if (ID_RE.test(gid) && ID_RE.test(String(c.gateAfter[gid]))) gateAfter[gid] = c.gateAfter[gid];
      });
      const ms = Number(c.minScore);
      out.courses[cid] = {
        mode: c.mode === 'free' ? 'free' : 'sequential',
        minScore: ms >= 40 && ms <= 100 ? Math.round(ms) : PASS,
        locked: cleanIds(c.locked, 300),
        unlocked: cleanIds(c.unlocked, 300),
        gateAfter: gateAfter,
        extra: extra,
      };
    });
    return out;
  }
  function courseCfg(classCfg, courseId) {
    const c = classCfg && classCfg.courses && classCfg.courses[courseId];
    return c || DEFAULT_COURSE_CFG;
  }

  /* ── Tiến độ từ lịch sử bài làm ───────────────────────────────────────────── */
  /** records: eduquiz_records ĐÃ lọc theo học sinh. → { units: { id: { best, attempts, lastAt, bestTest, timeSec } } } */
  function progressOf(records) {
    const units = {};
    (records || []).forEach(function (r) {
      const u = unitIdOf(r.catId, r.levelId, r.mtKey);
      if (!u || typeof r.score !== 'number') return;
      const p = units[u.id] || (units[u.id] = { kind: u.kind, best: 0, attempts: 0, lastAt: 0, bestTest: null, timeSec: 0 });
      p.attempts++;
      p.best = Math.max(p.best, r.score);
      if (r.examMode === 'test') p.bestTest = Math.max(p.bestTest === null ? 0 : p.bestTest, r.score);
      const t = Number(r.id) > 1e14 ? Math.floor(Number(r.id) / 1000) : Number(r.id) || 0;
      p.lastAt = Math.max(p.lastAt, t);
      if (typeof r.elapsedSec === 'number' && r.elapsedSec > 0) p.timeSec += Math.min(r.elapsedSec, 4 * 3600);
    });
    return { units: units };
  }

  /* ── Cây kỹ năng: trạng thái từng nút ──
     done: điểm cao nhất ≥ điểm đạt · available: mở được · locked: chưa mở (reason: 'teacher' | 'requires') */
  function nodeStates(course, progress, classCfg) {
    const cfg = courseCfg(classCfg, course.id);
    const min = cfg.minScore;
    const units = (progress && progress.units) || {};
    const st = {};
    const passed = function (id) { return !!units[id] && units[id].best >= min; };
    function decide(node, requires) {
      if (passed(node.id)) return { state: 'done', best: units[node.id].best };
      if (cfg.locked.indexOf(node.id) >= 0) return { state: 'locked', reason: 'teacher' };
      if (cfg.mode === 'free' || cfg.unlocked.indexOf(node.id) >= 0) return { state: 'available', best: units[node.id] ? units[node.id].best : null };
      const missing = requires.filter(function (r) { return !passed(r); });
      return missing.length ? { state: 'locked', reason: 'requires', missing: missing } : { state: 'available', best: units[node.id] ? units[node.id].best : null };
    }
    course.lessons.forEach(function (l) { st[l.id] = decide(l, l.requires || []); });
    (course.gates || []).forEach(function (g) { st[g.id] = decide(g, cfg.gateAfter[g.id] ? [cfg.gateAfter[g.id]] : g.requires || []); });
    return st;
  }

  /** Điều kiện hoàn thành khoá học + bài nên làm tiếp. */
  function courseStatus(course, progress, classCfg) {
    const st = nodeStates(course, progress, classCfg);
    const cfg = courseCfg(classCfg, course.id);
    const lDone = course.lessons.filter(function (l) { return st[l.id].state === 'done'; }).length;
    const gates = course.gates || [];
    const gDone = gates.filter(function (g) { return st[g.id].state === 'done'; }).length;
    const conditions = [{ id: 'lessons', label: 'Đạt ' + cfg.minScore + ' điểm ở mọi bài học', current: lDone, target: course.lessons.length, met: lDone === course.lessons.length }];
    if (gates.length) conditions.push({ id: 'gates', label: 'Đạt ' + cfg.minScore + ' điểm ở mọi bài kiểm tra', current: gDone, target: gates.length, met: gDone === gates.length });
    const total = course.lessons.length + gates.length;
    const next = course.lessons.concat(gates).filter(function (n) { return st[n.id].state === 'available'; })[0] || null;
    return {
      states: st, lessonsDone: lDone, gatesDone: gDone, total: total,
      pct: total ? Math.round(((lDone + gDone) / total) * 100) : 0,
      complete: conditions.every(function (c) { return c.met; }), conditions: conditions, next: next,
    };
  }

  /** EXP xem trước (theo bảng thưởng của cultivation-core). Chỉ để HIỂN THỊ — máy chủ mới ghi EXP thật. */
  function expPreview(course, cultivationConfig) {
    const r = (cultivationConfig && cultivationConfig.rewards) || {};
    const perLesson = (r.LESSON && r.LESSON.amount) || 0;
    const perGate = (r.TEST && r.TEST.amount) || 0;
    return { perLesson: perLesson, perGate: perGate, total: perLesson * course.lessons.length + perGate * (course.gates || []).length };
  }

  /**
   * Bài nộp ĐÃ ĐƯỢC MÁY CHỦ CHẤM LẠI → sự kiện cho CultivationService. Không có điểm máy chủ → [] (không thưởng).
   * sub: { learnerId, catId, levelId, mtKey, serverScore, durationSec }
   */
  function submissionEvents(sub) {
    if (!sub || typeof sub.serverScore !== 'number' || !sub.learnerId) return [];
    const u = unitIdOf(sub.catId, sub.levelId, sub.mtKey);
    if (!u) return [];
    const ev = { score: Math.max(0, Math.min(100, Math.round(sub.serverScore))) };
    if (typeof sub.durationSec === 'number') ev.durationSec = Math.max(0, Math.min(4 * 3600, Math.round(sub.durationSec)));
    if (u.kind === 'lesson') { ev.lessonId = u.id; return [{ type: 'LESSON', learnerId: sub.learnerId, evidence: ev }]; }
    if (u.kind === 'gate') { ev.testId = u.id; return [{ type: 'TEST', learnerId: sub.learnerId, evidence: ev }]; }
    ev.exerciseId = u.id;
    return [{ type: 'EXERCISE', learnerId: sub.learnerId, evidence: ev }];
  }

  const api = {
    PASS: PASS, DEFAULT_COURSE_CFG: DEFAULT_COURSE_CFG, slug: slug, unitIdOf: unitIdOf,
    sanitizeClassConfig: sanitizeClassConfig, courseCfg: courseCfg, progressOf: progressOf,
    nodeStates: nodeStates, courseStatus: courseStatus, expPreview: expPreview, submissionEvents: submissionEvents,
  };
  root.EduLearning = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ──────────────── js/techrealm/challenge-core.js (dùng chung với trình duyệt — sửa ở file gốc) ────────────────
/* ============================================================
   js/techrealm/challenge-core.js — KHUNG BÍ CẢNH (Domain thuần).

   Mỗi màn chơi là một "máy trạng thái" thuần và tất định:
       state0 = level.init(rng(seed))
       state' = level.apply(state, action)           (không sửa state cũ)
       eval   = level.evaluate(state)                → { completed, accuracy, solving, application, attempts, minAttempts }
   Giao diện (React) chỉ gửi action vào CHÍNH các hàm này, nên trạng thái trên màn hình = trạng thái máy chủ dựng lại.
   Nhận thưởng: trình duyệt gửi { seed, actions } — KHÔNG gửi điểm. Apps Script chạy lại (replay) bằng đúng file này
   (scripts/build-apps-script.js chép nguyên văn vào apps/Code.gs) và tự tính điểm. Sửa điểm trong gói tin vô tác dụng.

   Không DOM, không mạng, không Date.now(), không Math.random() (dùng rng có hạt giống), không `?.` / `??`.
   Tài liệu: docs/techrealm/CHALLENGE_SYSTEM.md, docs/techrealm/GAME_DESIGN.md
   ============================================================ */
(function (root) {
  'use strict';

  const registry = {};
  const MAX_ACTIONS = 600;
  const MAX_DURATION_MS = 2 * 3600e3;
  const MIN_MS_PER_ACTION = 120; // người thật không bấm nhanh hơn ~8 lần/giây suốt cả màn

  /** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32) — cùng seed ra cùng dãy ở mọi nơi chạy. */
  function rng(seed) {
    let a = seed >>> 0;
    const next = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next: next,
      int: function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      shuffle: function (arr) { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const tmp = a2[i]; a2[i] = a2[j]; a2[j] = tmp; } return a2; },
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /** Đăng ký 1 bí cảnh: { id, title, levels: [{ id, title, par (giây), init, apply, evaluate }] }. */
  function register(def) {
    if (!def || !def.id || !Array.isArray(def.levels) || !def.levels.length) throw new Error('Bí cảnh không hợp lệ');
    def.levels.forEach(function (l) {
      ['init', 'apply', 'evaluate'].forEach(function (k) { if (typeof l[k] !== 'function') throw new Error('Màn ' + l.id + ' thiếu ' + k); });
    });
    registry[def.id] = def;
    return def;
  }
  function get(id) { return registry[id] || null; }
  function levelOf(challengeId, levelId) {
    const c = registry[challengeId];
    if (!c) return null;
    return c.levels.filter(function (l) { return l.id === levelId; })[0] || null;
  }

  /* ── Tiêu chí đánh giá (Prompt 05 §4) → điểm 0–100 ──
       hoàn thành nhiệm vụ (điều kiện bắt buộc) · độ chính xác 40 · giải quyết vấn đề 25 · vận dụng kiến thức 20
       · thời gian 10 · số lần thử 5.  Chưa hoàn thành: chỉ tính tối đa 40% để vẫn ghi nhận cố gắng. */
  const WEIGHTS = { accuracy: 40, solving: 25, application: 20, time: 10, attempts: 5 };
  function clamp01(x) { return Math.max(0, Math.min(1, Number(x) || 0)); }
  function score(ev, durationSec, par) {
    const time = durationSec <= par ? 1 : clamp01(1 - (durationSec - par) / (2 * par));
    const extra = Math.max(0, (ev.attempts || 0) - (ev.minAttempts || 1));
    const attempts = clamp01(1 - extra / 5);
    const parts = {
      accuracy: Math.round(WEIGHTS.accuracy * clamp01(ev.accuracy)),
      solving: Math.round(WEIGHTS.solving * clamp01(ev.solving)),
      application: Math.round(WEIGHTS.application * clamp01(ev.application)),
      time: Math.round(WEIGHTS.time * time),
      attempts: Math.round(WEIGHTS.attempts * attempts),
    };
    let total = parts.accuracy + parts.solving + parts.application + parts.time + parts.attempts;
    if (!ev.completed) total = Math.min(total, 40);
    const stars = !ev.completed ? 0 : total >= 85 ? 3 : total >= 65 ? 2 : 1;
    return { score: total, stars: stars, parts: parts, completed: !!ev.completed };
  }

  /** Kiểm nhật ký thao tác (không tin được): mảng { t: ms từ lúc bắt đầu, type: chuỗi, … } tăng dần, giới hạn số lượng. */
  function validateLog(actions) {
    if (!Array.isArray(actions)) return 'Nhật ký không phải mảng.';
    if (actions.length > MAX_ACTIONS) return 'Quá nhiều thao tác.';
    let prev = 0;
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (!a || typeof a !== 'object' || typeof a.type !== 'string' || a.type.length > 20) return 'Thao tác #' + i + ' sai dạng.';
      if (typeof a.t !== 'number' || !isFinite(a.t) || a.t < prev || a.t > MAX_DURATION_MS) return 'Thời điểm thao tác #' + i + ' không hợp lệ.';
      if (JSON.stringify(a).length > 200) return 'Thao tác #' + i + ' quá dài.';
      prev = a.t;
    }
    if (actions.length > 2 && prev < (actions.length - 1) * MIN_MS_PER_ACTION) return 'Thao tác nhanh bất thường.';
    return null;
  }

  /** Chạy lại một màn từ seed + nhật ký. Dùng ở CẢ trình duyệt (để chấm) lẫn máy chủ (để xác thực). */
  function replay(challengeId, levelId, seed, actions) {
    const level = levelOf(challengeId, levelId);
    if (!level) return { ok: false, code: 'not-found', reason: 'Không có màn này.' };
    if (!(Number.isInteger(seed) && seed >= 0 && seed <= 0xFFFFFFFF)) return { ok: false, code: 'invalid', reason: 'Hạt giống không hợp lệ.' };
    const bad = validateLog(actions);
    if (bad) return { ok: false, code: 'invalid', reason: bad };
    let state = level.init(rng(seed));
    for (let i = 0; i < actions.length; i++) {
      if (state.done) break; // màn đã kết thúc: thao tác sau đó bỏ qua
      state = level.apply(clone(state), actions[i]);
    }
    const ev = level.evaluate(state);
    const durationSec = Math.round((actions.length ? actions[actions.length - 1].t : 0) / 1000);
    return { ok: true, state: state, eval: ev, durationSec: durationSec, result: score(ev, durationSec, level.par) };
  }

  /** Bài nộp bí cảnh → sự kiện CHALLENGE cho luật tu luyện (chỉ khi replay hợp lệ và màn đã hoàn thành). */
  function rewardEvent(sub) {
    if (!sub || !/^L[0-9A-Z]{10}$/.test(String(sub.learnerId || ''))) return null;
    const r = replay(sub.challengeId, sub.levelId, sub.seed, sub.actions);
    if (!r.ok || !r.result.completed) return null;
    const level = levelOf(sub.challengeId, sub.levelId);
    return {
      type: 'CHALLENGE', learnerId: sub.learnerId,
      evidence: { challengeId: sub.challengeId + '/' + sub.levelId, score: r.result.score, durationSec: r.durationSec, boss: !!level.boss },
    };
  }

  const api = { rng: rng, register: register, get: get, levelOf: levelOf, score: score, validateLog: validateLog, replay: replay, rewardEvent: rewardEvent, WEIGHTS: WEIGHTS, clone: clone };
  root.EduChallenge = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ──────────────── js/techrealm/thanh-pho-mat-dien-core.js (dùng chung với trình duyệt — sửa ở file gốc) ────────────────
/* ============================================================
   js/techrealm/thanh-pho-mat-dien-core.js — BÍ CẢNH 1: THÀNH PHỐ MẤT ĐIỆN (luật thuần, tất định).
   Kiến thức: vật lý (mạch điện, vật dẫn/cách điện, mạch song song), năng lượng, toán (cộng trừ trong giới hạn),
   dữ liệu (đọc biểu đồ, phát hiện bất thường).
   Đăng ký vào EduChallenge (challenge-core.js — phải nạp trước). Chạy ở trình duyệt, Node (test) và Apps Script.
   Kịch bản, nhân vật, bản đồ: docs/techrealm/GAME_DESIGN.md §2.
   ============================================================ */
(function (root) {
  'use strict';
  const E = root.EduChallenge;
  if (!E) throw new Error('Cần nạp js/techrealm/challenge-core.js trước');

  /* ── Dữ liệu chung ── */
  const MATERIALS = {
    dong: { name: 'Dây đồng', conductor: true },
    sat: { name: 'Đinh sắt', conductor: true },
    nhom: { name: 'Giấy nhôm', conductor: true },
    chi: { name: 'Ruột bút chì', conductor: true }, // than chì dẫn điện
    nhua: { name: 'Thanh nhựa', conductor: false },
    go: { name: 'Que gỗ khô', conductor: false },
    len: { name: 'Sợi len', conductor: false },
    thuytinh: { name: 'Ống thủy tinh', conductor: false },
    caosu: { name: 'Cục tẩy cao su', conductor: false },
  };
  const BUILDINGS = [
    { id: 'benh-vien', name: 'Bệnh viện', base: 30, essential: true },
    { id: 'tram-nuoc', name: 'Trạm bơm nước', base: 20, essential: true },
    { id: 'truong-hoc', name: 'Trường học', base: 15 },
    { id: 'nha-o', name: 'Khu nhà ở', base: 35 },
    { id: 'sieu-thi', name: 'Siêu thị', base: 25 },
    { id: 'den-duong', name: 'Đèn đường', base: 10 },
  ];

  /** Câu hỏi trắc nghiệm: phương án đúng luôn khai báo ở vị trí 0, rồi xáo theo seed. */
  function mcq(r, id, text, options) {
    const order = r.shuffle(options.map(function (_, i) { return i; }));
    return { id: id, text: text, options: order.map(function (i) { return options[i]; }), correct: order.indexOf(0) };
  }
  function answerQ(s, a) {
    const q = s.qs.filter(function (x) { return x.id === a.q; })[0];
    if (!q || !(Number.isInteger(a.o) && a.o >= 0 && a.o < q.options.length)) return s;
    const rec = s.answers[q.id] || (s.answers[q.id] = { first: a.o, tries: 0, solved: false });
    if (rec.solved) return s;
    rec.tries++;
    if (a.o === q.correct) rec.solved = true;
    return s;
  }
  const firstRight = function (s, ids) { return ids.filter(function (id) { return s.answers[id] && s.answers[id].first === s.qs.filter(function (q) { return q.id === id; })[0].correct; }).length; };
  const allSolved = function (s) { return s.qs.every(function (q) { return s.answers[q.id] && s.answers[q.id].solved; }); };

  /* ═════════ Màn 1: Trạm biến áp — nối lại mạch điện ═════════ */
  function circuitLit(round, placed, sw) {
    const ok = function (slot) { return !!placed[slot] && !!MATERIALS[placed[slot]] && MATERIALS[placed[slot]].conductor; };
    const lit = {};
    if (round.kind === 'loop') {
      const on = round.slots.every(ok) && (round.switch === undefined || sw === true);
      round.lamps.forEach(function (l) { lit[l] = on; });
    } else {
      const main = round.main.every(ok);
      round.branches.forEach(function (b) { lit[b.lamp] = main && b.slots.every(ok); });
    }
    return lit;
  }
  const L1 = {
    id: 'mach-dien', title: 'Trạm biến áp: nối lại mạch điện', par: 150,
    init: function (r) {
      const cond = r.shuffle(['dong', 'sat', 'nhom', 'chi']).slice(0, 3);
      const ins = r.shuffle(['nhua', 'go', 'len', 'thuytinh', 'caosu']).slice(0, 3);
      const palette = r.shuffle(cond.concat(ins));
      const c0 = MATERIALS[cond[0]].name.toLowerCase();
      return {
        palette: palette, round: 0, placed: {}, sw: false, tests: 0, firstOk: [], roundTests: 0, lastLit: null, done: false,
        rounds: [
          { kind: 'loop', title: 'Nối 2 chỗ đứt để đèn sáng', slots: ['a', 'b'], lamps: ['den'], goal: { den: true } },
          { kind: 'loop', title: 'Mạch có công tắc: làm đèn sáng', slots: ['a'], switch: true, lamps: ['den'], goal: { den: true } },
          { kind: 'parallel', title: 'Chỉ cấp điện cho Bệnh viện, tắt Khu vui chơi để tiết kiệm', main: ['m'],
            branches: [{ lamp: 'benh-vien', name: 'Bệnh viện', slots: ['h'] }, { lamp: 'vui-choi', name: 'Khu vui chơi', slots: ['p'] }],
            goal: { 'benh-vien': true, 'vui-choi': false } },
        ],
        qs: [
          mcq(r, 'q1', 'Vì sao đèn sáng khi em nối bằng ' + c0 + '?', ['Vì ' + c0 + ' là vật dẫn điện, dòng điện đi qua được', 'Vì ' + c0 + ' rất nặng', 'Vì ' + c0 + ' có màu sáng', 'Vì pin tự làm đèn sáng, không cần dây']),
          mcq(r, 'q2', 'Vật nào KHÔNG cho dòng điện đi qua?', [MATERIALS[ins[0]].name, MATERIALS[cond[0]].name, MATERIALS[cond[1]].name, MATERIALS[cond[2]].name]),
          mcq(r, 'q3', 'Trong mạch song song, vì sao Bệnh viện vẫn sáng khi nhánh Khu vui chơi bị ngắt?', ['Mỗi nhánh có đường đi riêng cho dòng điện', 'Bệnh viện có pin riêng', 'Dòng điện chỉ chạy vào toà nhà lớn', 'Vì bóng đèn Khu vui chơi bị hỏng']),
        ],
        answers: {},
      };
    },
    apply: function (s, a) {
      const rd = s.rounds[s.round];
      if (a.type === 'answer') { if (!rd) { answerQ(s, a); if (allSolved(s)) s.done = true; } return s; }
      if (!rd) return s;
      const slots = rd.kind === 'loop' ? rd.slots : rd.main.concat(rd.branches[0].slots, rd.branches[1].slots);
      if (a.type === 'place' && slots.indexOf(a.slot) >= 0 && s.palette.indexOf(a.m) >= 0) s.placed[a.slot] = a.m;
      else if (a.type === 'clear' && slots.indexOf(a.slot) >= 0) delete s.placed[a.slot];
      else if (a.type === 'toggle' && rd.switch) s.sw = !s.sw;
      else if (a.type === 'test') {
        s.tests++; s.roundTests++;
        const lit = circuitLit(rd, s.placed, s.sw);
        s.lastLit = lit;
        const ok = Object.keys(rd.goal).every(function (k) { return !!lit[k] === rd.goal[k]; });
        if (ok) { s.firstOk.push(s.roundTests === 1); s.round++; s.placed = {}; s.sw = false; s.roundTests = 0; s.lastLit = null; }
      }
      return s;
    },
    evaluate: function (s) {
      const built = s.round >= s.rounds.length;
      return {
        completed: built && allSolved(s),
        accuracy: s.firstOk.filter(Boolean).length / s.rounds.length,
        solving: built ? Math.min(1, s.rounds.length / Math.max(s.rounds.length, s.tests)) : s.round / s.rounds.length * 0.5,
        application: firstRight(s, ['q1', 'q2', 'q3']) / 3,
        attempts: s.tests, minAttempts: s.rounds.length,
      };
    },
  };

  /* ═════════ Màn 2: Nhà máy điện — phân phối năng lượng ═════════ */
  function totalOn(bs, on) { return bs.filter(function (b) { return on[b.id]; }).reduce(function (t, b) { return t + b.demand; }, 0); }
  function bestTotal(bs, cap, must) {
    let best = -1;
    for (let mask = 0; mask < (1 << bs.length); mask++) {
      let t = 0; let ok = true;
      for (let i = 0; i < bs.length; i++) {
        const on = (mask >> i) & 1;
        if (!on && (bs[i].essential || (must && must.indexOf(bs[i].id) >= 0))) { ok = false; break; }
        if (on) t += bs[i].demand;
      }
      if (ok && t <= cap && t > best) best = t;
    }
    return best;
  }
  const L2 = {
    id: 'phan-phoi', title: 'Nhà máy điện: chia điện cho thành phố', par: 120,
    init: function (r) {
      const bs = BUILDINGS.map(function (b) { return { id: b.id, name: b.name, demand: Math.max(5, b.base + r.int(-1, 1) * 5), essential: !!b.essential }; });
      const cap = r.pick([90, 100, 110]);
      return { buildings: bs, cap: cap, on: {}, submits: 0, passedAt: 0, done: false, qs: [], answers: {}, perm: r.shuffle([0, 1, 2, 3]), best: bestTotal(bs, cap) };
    },
    apply: function (s, a) {
      if (a.type === 'answer') { if (s.passedAt) { answerQ(s, a); if (allSolved(s)) s.done = true; } return s; }
      if (s.passedAt) return s;
      if (a.type === 'toggle' && s.buildings.some(function (b) { return b.id === a.id; })) s.on[a.id] = !s.on[a.id];
      else if (a.type === 'submit') {
        s.submits++;
        const t = totalOn(s.buildings, s.on);
        const essentials = s.buildings.every(function (b) { return !b.essential || s.on[b.id]; });
        s.lastCheck = { total: t, overload: t > s.cap, essentials: essentials };
        if (t <= s.cap && essentials) {
          s.passedAt = s.submits; s.final = t;
          const left = s.cap - t;
          const opts = [left, s.cap + t, t, left + 10].map(String);
          const order = s.perm;
          s.qs = [
            { id: 'q1', text: 'Máy phát có ' + s.cap + ' kW. Các khu em bật dùng ' + t + ' kW. Còn dư bao nhiêu kW?', options: order.map(function (i) { return opts[i] + ' kW'; }), correct: order.indexOf(0) },
            { id: 'q2', text: 'Vì sao phải cấp điện cho Bệnh viện và Trạm bơm nước trước?', options: order.map(function (i) { return ['Vì đó là nơi thiết yếu cho sức khoẻ và nước sạch', 'Vì hai nơi đó dùng ít điện nhất', 'Vì hai nơi đó gần nhà máy nhất', 'Vì đèn ở đó đẹp nhất'][i]; }), correct: order.indexOf(0) },
          ];
        }
      }
      return s;
    },
    evaluate: function (s) {
      return {
        completed: !!s.passedAt && allSolved(s),
        accuracy: !s.passedAt ? 0 : s.passedAt === 1 ? 1 : 0.5,
        solving: s.passedAt && s.best > 0 ? s.final / s.best : 0,
        application: firstRight(s, ['q1', 'q2']) / 2,
        attempts: s.submits, minAttempts: 1,
      };
    },
  };

  /* ═════════ Màn 3: Phòng điều khiển — tìm chỗ rò điện trong dữ liệu ═════════ */
  const DISTRICTS = ['Khu Bắc', 'Khu Nam', 'Khu Đông', 'Khu Tây'];
  const HOURS = [6, 9, 12, 15, 18, 21];
  const PROFILE = [20, 30, 35, 30, 45, 40]; // ít buổi sáng, đỉnh buổi tối
  const L3 = {
    id: 'du-lieu', title: 'Phòng điều khiển: tìm chỗ rò điện', par: 150,
    init: function (r) {
      const factor = DISTRICTS.map(function () { return 0.8 + r.int(0, 4) / 10; });
      const data = DISTRICTS.map(function (_, d) { return PROFILE.map(function (p) { return Math.round(p * factor[d]) + r.int(-3, 3); }); });
      const ad = r.int(0, 3);
      const ah = r.int(0, 2) * 2 + 1; // 9h, 15h hoặc 21h — tránh trùng đỉnh tự nhiên 18h
      // Rò điện phải NHÌN THẤY được: cao nhất trong chính khu đó và ≥ 1,8× các khu khác cùng giờ (test kiểm 200 seed).
      const own = Math.max.apply(null, data[ad].filter(function (_, h) { return h !== ah; }));
      const peers = Math.max.apply(null, data.filter(function (_, d) { return d !== ad; }).map(function (row) { return row[ah]; }));
      data[ad][ah] = Math.round(Math.max(own, peers) * 1.8) + 5;
      const sums = HOURS.map(function (_, h) { return data.reduce(function (t, row) { return t + row[h]; }, 0); });
      let peak = 0;
      sums.forEach(function (v, h) { if (v > sums[peak]) peak = h; });
      sums.forEach(function (v, h) { if (h !== peak && v === sums[peak]) { data[0][peak] += 1; sums[peak] += 1; } });
      return {
        data: data, districts: DISTRICTS, hours: HOURS, done: false, answers: {},
        qs: [
          mcq(r, 'q1', 'Khu nào có số liệu bất thường (bị rò điện)?', [DISTRICTS[ad]].concat(DISTRICTS.filter(function (_, i) { return i !== ad; }))),
          mcq(r, 'q2', 'Bất thường xảy ra lúc mấy giờ?', [HOURS[ah] + ' giờ'].concat(HOURS.filter(function (_, i) { return i !== ah; }).slice(0, 3).map(function (h) { return h + ' giờ'; }))),
          mcq(r, 'q3', 'Lúc mấy giờ cả thành phố dùng nhiều điện nhất?', [HOURS[peak] + ' giờ'].concat(HOURS.filter(function (_, i) { return i !== peak; }).slice(0, 3).map(function (h) { return h + ' giờ'; }))),
          mcq(r, 'q4', 'Vì sao phải sửa chỗ rò điện ngay?', ['Vì rò điện vừa tốn điện vô ích, vừa có thể gây giật điện, cháy nổ', 'Vì rò điện làm đèn sáng hơn', 'Vì rò điện giúp tiết kiệm tiền', 'Vì đồng hồ điện sẽ chạy chậm lại']),
        ],
      };
    },
    apply: function (s, a) {
      if (a.type === 'answer') { answerQ(s, a); if (allSolved(s)) s.done = true; }
      return s;
    },
    evaluate: function (s) {
      const tries = s.qs.reduce(function (t, q) { return t + (s.answers[q.id] ? s.answers[q.id].tries : 0); }, 0);
      return {
        completed: allSolved(s),
        accuracy: firstRight(s, ['q1', 'q2', 'q3']) / 3,
        solving: Math.max(0, 1 - Math.max(0, tries - 4) / 6),
        application: firstRight(s, ['q4']),
        attempts: tries, minAttempts: 4,
      };
    },
  };

  /* ═════════ Boss: Cơn bão quá tải — 5 lượt giữ thành phố không sập điện ═════════ */
  const EVENTS = [
    { id: 'set', text: 'Sét đánh trúng trạm: máy phát giảm 20 kW.', cap: -20 },
    { id: 'nang', text: 'Nắng nóng: Khu nhà ở cần thêm 15 kW cho quạt.', demand: { 'nha-o': 15 } },
    { id: 'toi', text: 'Trời tối sầm: phải bật Đèn đường cho an toàn.', must: ['den-duong'] },
    { id: 'cap-cuu', text: 'Bệnh viện có ca mổ cấp cứu: cần thêm 10 kW.', demand: { 'benh-vien': 10 } },
    { id: 'mat-troi', text: 'Pin mặt trời trên mái trường phát thêm 15 kW.', cap: 15 },
    { id: 'mua', text: 'Mưa lớn: Trạm bơm nước chạy hết sức, cần thêm 10 kW.', demand: { 'tram-nuoc': 10 } },
  ];
  const BOSS = {
    id: 'bao-qua-tai', title: 'Boss: Cơn bão quá tải', par: 240, boss: true,
    init: function (r) {
      const s = { cap0: 110, base: BUILDINGS.map(function (b) { return { id: b.id, name: b.name, demand: b.base, essential: !!b.essential }; }),
        events: r.shuffle(EVENTS).slice(0, 5), turn: 0, on: { 'benh-vien': true, 'tram-nuoc': true }, hp: 100, log: [], done: false, answers: {},
        qs: [mcq(r, 'q1', 'Khi máy phát bị giảm công suất, em nên tắt khu nào trước?', ['Khu không thiết yếu, như Siêu thị', 'Bệnh viện', 'Trạm bơm nước', 'Tắt hết cả thành phố cho chắc'])] };
      return s;
    },
    apply: function (s, a) {
      if (s.turn >= s.events.length) {
        if (a.type === 'answer') { answerQ(s, a); if (allSolved(s)) s.done = true; }
        return s;
      }
      const ev = s.events[s.turn];
      if (a.type === 'toggle' && s.base.some(function (b) { return b.id === a.id; })) s.on[a.id] = !s.on[a.id];
      else if (a.type === 'end-turn') {
        const cap = s.cap0 + (ev.cap || 0);
        const bs = s.base.map(function (b) { return { id: b.id, essential: b.essential, demand: b.demand + ((ev.demand && ev.demand[b.id]) || 0) }; });
        const total = totalOn(bs, s.on);
        const must = (ev.must || []).every(function (id) { return s.on[id]; });
        const essentials = bs.every(function (b) { return !b.essential || s.on[b.id]; });
        const best = bestTotal(bs, cap, ev.must);
        let ts = 0;
        if (total <= cap) ts = (essentials && must ? 1 : 0.3) * (best > 0 ? total / best : 0);
        const dmg = Math.round(20 * ts);
        s.hp = Math.max(0, s.hp - dmg);
        s.log.push({ event: ev.id, cap: cap, total: total, overload: total > cap, essentials: essentials, must: must, score: ts, dmg: dmg });
        s.turn++;
      }
      return s;
    },
    evaluate: function (s) {
      const n = s.log.length || 1;
      const safe = s.log.filter(function (l) { return !l.overload; }).length;
      return {
        completed: s.turn >= s.events.length && allSolved(s) && safe >= 3,
        accuracy: safe / s.events.length,
        solving: s.log.reduce(function (t, l) { return t + l.score; }, 0) / n,
        application: firstRight(s, ['q1']),
        attempts: 1 + (s.events.length - safe), minAttempts: 1,
      };
    },
  };

  const def = E.register({
    id: 'thanh-pho-mat-dien',
    title: 'Thành phố mất điện',
    levels: [L1, L2, L3, BOSS],
    data: { MATERIALS: MATERIALS, BUILDINGS: BUILDINGS, EVENTS: EVENTS, circuitLit: circuitLit, totalOn: totalOn, bestTotal: bestTotal },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = def;
})(typeof window !== 'undefined' ? window : globalThis);

// ──────────────── js/techrealm/mentor-core.js (dùng chung với trình duyệt — sửa ở file gốc) ────────────────
/* ============================================================
   js/techrealm/mentor-core.js — AI SƯ PHỤ (Domain thuần).

   Mở rộng Trợ lý AI có sẵn (js/services/ai-core.js) bằng 4 việc mới, cùng khuôn: CODE dựng câu lệnh từ dữ liệu có
   cấu trúc (không nhận câu lệnh tự do) → không mượn được key của trường để hỏi việc khác.
     mentorConcept  HS  giải thích kiến thức (câu hỏi ngắn của học sinh, đã lọc thông tin cá nhân)
     mentorHint     HS  gợi ý giải bài tập theo 3 mức — KHÔNG nhận đáp án đúng, dặn AI không nêu đáp án
     codeHelp       HS  hướng dẫn lập trình / phân tích lỗi code — chỉ ra lỗi + gợi ý, không viết lời giải trọn vẹn
     rubricReview   GV  gợi ý chấm sản phẩm theo rubric (GIÁO VIÊN quyết định điểm)
   Chạy ở trình duyệt (ai-core.build gọi sang đây) VÀ Apps Script (scripts/build-apps-script.js chép nguyên văn; 78-ai.gs
   aiBuild_ gọi sang đây) → câu lệnh hai nơi giống hệt, không có bản chép tay.
   Không DOM, không mạng, không `?.` / `??`. Tài liệu: docs/techrealm/AI_MENTOR.md
   ============================================================ */
(function (root) {
  'use strict';

  const PUBLIC_TASKS = ['mentorConcept', 'mentorHint', 'codeHelp'];
  const STAFF_TASKS = ['rubricReview'];
  const LANGS = { python: 'Python', javascript: 'JavaScript', html: 'HTML/CSS', scratch: 'Scratch (mô tả khối lệnh)' };

  const SYS = 'Bạn là "AI Sư Phụ" — trợ giảng thân thiện cho học sinh phổ thông Việt Nam, môn Tin học, khoa học và kỹ năng số. '
    + 'Trả lời bằng tiếng Việt chuẩn, ngắn gọn, đúng kiến thức, hợp lứa tuổi. Không bịa; không chắc thì nói không chắc. '
    + 'Mục tiêu là giúp học sinh TỰ HIỂU và TỰ LÀM: hướng dẫn từng bước, không làm bài hộ. '
    + 'Chỉ trả lời nội dung học tập. Nếu câu hỏi ngoài phạm vi học tập, không phù hợp lứa tuổi, nguy hiểm, hoặc hỏi/đưa thông tin '
    + 'cá nhân (tên, địa chỉ, số điện thoại, mật khẩu): từ chối lịch sự bằng 1 câu và gợi ý hỏi nội dung bài học. '
    + 'Không bao giờ đề nghị học sinh cung cấp thông tin cá nhân.';

  /* ── Lọc thông tin cá nhân khỏi chữ học sinh gõ (chạy ở CẢ trình duyệt lẫn máy chủ) ── */
  const PII = [
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
    [/https?:\/\/\S+|www\.\S+/gi, '[link]'],
    [/(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/g, '[số điện thoại]'],
    [/\b\d{9,12}\b/g, '[dãy số]'],
    [/(?:mật khẩu|mat khau|password|pass)\s*(?:là|:|=)?\s*\S+/gi, '[mật khẩu]'],
    [/\b(?:tên|ten)\s+(?:em|mình|minh|tôi|toi|tớ|to|con)\s+(?:là|la)\s+[^\s,.!?]+(?:\s+[^\s,.!?]+){0,3}/gi, '[tên]'],
    [/\b(?:em|mình|tôi|tớ)\s+(?:tên là|ten la|là học sinh lớp)\s+[^\s,.!?]+(?:\s+[^\s,.!?]+){0,3}/gi, '[tên]'],
    [/\b(?:nhà|nha)\s+(?:em|mình|tôi|tớ)\s+(?:ở|o)\s+[^.!?\n]{1,60}/gi, '[địa chỉ]'],
  ];
  function scrubPII(s) {
    let text = String(s == null ? '' : s);
    let removed = 0;
    PII.forEach(function (rule) {
      text = text.replace(rule[0], function () { removed++; return rule[1]; });
    });
    return { text: text, removed: removed };
  }

  const ctrl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
  function clip(s, n) { return scrubPII(String(s == null ? '' : s).replace(ctrl, '').replace(/\s+/g, ' ').trim()).text.slice(0, n); }
  function clipCode(s, n) { return scrubPII(String(s == null ? '' : s).replace(ctrl, '').replace(/\t/g, '  ').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')).text.slice(0, n); }
  function int(v, a, b, d) { const x = Math.round(Number(v)); return isFinite(x) ? Math.max(a, Math.min(b, x)) : d; }
  function grade(v) { const g = Math.round(Number(v)); return g >= 3 && g <= 12 ? g : 0; }
  const forGrade = function (g) { return g ? ' lớp ' + g : ''; };
  const opts = function (a) { return (Array.isArray(a) ? a : []).slice(0, 8).map(function (x) { return clip(x, 200); }).filter(Boolean); };

  const TASKS = {
    mentorConcept: {
      norm: function (p) { return { topic: clip(p.topic, 120), question: clip(p.question, 300), grade: grade(p.grade) }; },
      ok: function (n) { return n.question.length >= 5; },
      prompt: function (n) {
        return {
          user: 'Học sinh' + forGrade(n.grade) + (n.topic ? ' đang học "' + n.topic + '"' : '') + ' hỏi:\n"' + n.question + '"\n\n'
            + 'Giải thích dễ hiểu trong tối đa 150 chữ, có 1 ví dụ gần gũi đời sống. '
            + 'Kết thúc bằng 1 câu hỏi ngắn để học sinh tự kiểm tra mình đã hiểu chưa (KHÔNG kèm đáp án của câu đó).',
          json: false, maxTokens: 700, temperature: 0.4,
        };
      },
    },
    mentorHint: {
      // Cố ý KHÔNG có trường đáp án đúng: AI không được biết đáp án do hệ thống đưa.
      norm: function (p) { return { question: clip(p.question, 900), options: opts(p.options), attempt: clip(p.attempt, 300), level: int(p.level, 1, 3, 1), grade: grade(p.grade) }; },
      ok: function (n) { return !!n.question; },
      prompt: function (n) {
        const lv = ['', 'MỨC 1: chỉ nhắc khái niệm / kiến thức liên quan, không đề cập phương án nào.',
          'MỨC 2: gợi ý cách suy luận hoặc cách loại trừ, có thể nói 1 phương án CHẮC CHẮN SAI và vì sao.',
          'MỨC 3: phân tích lần lượt từng phương án (điểm hợp lý / chưa hợp lý) nhưng KHÔNG kết luận phương án nào đúng.'][n.level];
        return {
          user: 'Học sinh' + forGrade(n.grade) + ' nhờ gợi ý cho bài tập LUYỆN TẬP sau:\n' + n.question
            + (n.options.length ? '\nCác phương án:\n' + n.options.map(function (o, i) { return 'ABCDEFGH'.charAt(i) + '. ' + o; }).join('\n') : '')
            + (n.attempt ? '\nHọc sinh đang nghĩ: "' + n.attempt + '"' : '')
            + '\n\nĐưa gợi ý ' + lv + ' TUYỆT ĐỐI không nêu đáp án đúng, không viết "đáp án là…". Tối đa 100 chữ. '
            + 'Kết thúc bằng 1 câu hỏi dẫn dắt để học sinh tự nghĩ tiếp.',
          json: false, maxTokens: 500, temperature: 0.3,
        };
      },
    },
    codeHelp: {
      norm: function (p) { return { language: LANGS[p.language] ? p.language : 'python', code: clipCode(p.code, 1500), error: clip(p.error, 300), goal: clip(p.goal, 200), grade: grade(p.grade) }; },
      ok: function (n) { return n.code.trim().length >= 3; },
      prompt: function (n) {
        return {
          user: 'Học sinh' + forGrade(n.grade) + ' đang học ' + LANGS[n.language] + '.'
            + (n.goal ? '\nMục tiêu chương trình: ' + n.goal : '')
            + '\nCode của học sinh:\n```\n' + n.code + '\n```'
            + (n.error ? '\nThông báo lỗi / hiện tượng: ' + n.error : '')
            + '\n\nHãy: (1) chỉ ra dòng hoặc chỗ có vấn đề và GIẢI THÍCH vì sao; (2) gợi ý cách sửa bằng lời, '
            + 'nếu cần minh hoạ thì tối đa 3 dòng code cho đúng chỗ lỗi đó; (3) KHÔNG viết lại toàn bộ chương trình hay lời giải hoàn chỉnh; '
            + '(4) kết thúc bằng 1 việc nhỏ để học sinh tự thử. Tối đa 180 chữ.',
          json: false, maxTokens: 900, temperature: 0.2,
        };
      },
    },
    rubricReview: {
      norm: function (p) {
        const crit = (Array.isArray(p.criteria) ? p.criteria : []).slice(0, 8).map(function (c) { return { name: clip(c && c.name, 80), max: int(c && c.max, 1, 10, 4) }; }).filter(function (c) { return c.name; });
        return { title: clip(p.title, 120), description: clipCode(p.description, 1500), criteria: crit, grade: grade(p.grade) };
      },
      ok: function (n) { return n.description.trim().length >= 20 && n.criteria.length > 0; },
      prompt: function (n) {
        return {
          user: 'Bạn hỗ trợ GIÁO VIÊN chấm sản phẩm học sinh' + forGrade(n.grade) + (n.title ? ' cho dự án "' + n.title + '"' : '') + '.\n'
            + 'Mô tả / nội dung sản phẩm:\n' + n.description + '\n\nRubric:\n'
            + n.criteria.map(function (c, i) { return (i + 1) + '. ' + c.name + ' (tối đa ' + c.max + ' điểm)'; }).join('\n')
            + '\n\nĐề xuất điểm từng tiêu chí (số nguyên, không vượt tối đa) kèm nhận xét ngắn, cụ thể, khích lệ. '
            + 'Chỉ dựa trên mô tả; thiếu thông tin thì cho điểm thận trọng và ghi rõ "cần xem sản phẩm". '
            + 'Trả về DUY NHẤT JSON: {"criteria":[{"name":"…","score":0,"comment":"…"}],"overall":"…"}',
          json: true, maxTokens: 1200, temperature: 0.2,
        };
      },
    },
  };

  /** Dựng câu lệnh — cùng dạng kết quả với ai-core.build. Lỗi: { code: 'invalid-argument' }. */
  function build(task, payload) {
    const t = Object.prototype.hasOwnProperty.call(TASKS, task) ? TASKS[task] : null;
    if (!t) throw Object.assign(new Error('Việc AI không hợp lệ: ' + task), { code: 'invalid-argument' });
    const n = t.norm(payload || {});
    if (!t.ok(n)) throw Object.assign(new Error('Thiếu dữ liệu cho việc AI ' + task), { code: 'invalid-argument' });
    const p = t.prompt(n);
    return { task: task, payload: n, system: SYS, user: p.user, json: p.json, maxTokens: p.maxTokens, temperature: p.temperature };
  }

  /* ── Chế độ học / kiểm tra ──
     Đang làm bài KIỂM TRA (bản tự lưu của sảnh có examMode 'test', chưa nộp, < 8 giờ) → AI Sư Phụ nghỉ HẲN cho học sinh.
     Lớp bảo vệ thứ 2: mentorHint không nhận đáp án; lớp 3 (GĐ5): máy chủ từ chối khi học viên có phiên khảo hạch đang mở. */
  const TEST_MAX_AGE_MS = 8 * 3600e3;
  function modeOf(inProgress, nowMs) {
    if (inProgress && inProgress.examMode === 'test' && typeof inProgress.savedAt === 'number' && nowMs - inProgress.savedAt < TEST_MAX_AGE_MS) return 'test';
    return 'learn';
  }
  function policy(mode, task) {
    if (STAFF_TASKS.indexOf(task) >= 0) return { allowed: true };
    if (PUBLIC_TASKS.indexOf(task) < 0 && ['explain', 'quickQ'].indexOf(task) < 0) return { allowed: false, reason: 'Việc AI không hợp lệ.' };
    if (mode === 'test') return { allowed: false, reason: 'Em đang làm bài kiểm tra — AI Sư Phụ tạm nghỉ tới khi em nộp bài. Cố gắng tự làm nhé!' };
    return { allowed: true };
  }

  /** JSON rubric AI trả về → điểm đã kẹp trong [0, tối đa] theo đúng rubric; null nếu không đọc được. */
  function parseRubric(text, criteria) {
    let j = null;
    try { j = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { j = null; }
    if (!j || !Array.isArray(j.criteria)) return null;
    const rows = (criteria || []).map(function (c, i) {
      const hit = j.criteria.filter(function (x) { return x && String(x.name || '').trim().toLowerCase() === String(c.name).trim().toLowerCase(); })[0] || j.criteria[i] || {};
      return { name: c.name, max: c.max, score: int(hit.score, 0, c.max, 0), comment: clip(hit.comment, 300) };
    });
    return { rows: rows, total: rows.reduce(function (t, r) { return t + r.score; }, 0), max: rows.reduce(function (t, r) { return t + r.max; }, 0), overall: clip(j.overall, 500) };
  }

  /* ── Gợi ý nhiệm vụ: LUẬT trên máy, KHÔNG gọi AI (không gửi dữ liệu học tập đi đâu) ──
     input: { courses: [{ id, name, pct, next: { title, href } | null, started }], challengeLevels: [{ id, name, stars, unlocked }],
              missions: [{ id, name, score, href }], due: số câu cần ôn trong Sổ tay } */
  function suggestNext(input) {
    const out = [];
    const i = input || {};
    if ((i.due || 0) > 0) out.push({ kind: 'on-tap', title: 'Ôn ' + i.due + ' câu đến hạn trong Sổ tay câu sai', why: 'Ôn đúng lúc sắp quên giúp nhớ lâu nhất.' });
    const started = (i.courses || []).filter(function (c) { return c.started && c.next && c.pct < 100; })
      .sort(function (a, b) { return b.pct - a.pct; });
    if (started[0]) out.push({ kind: 'bai-hoc', title: 'Học tiếp ' + started[0].next.title, why: 'Công pháp "' + started[0].name + '" đã được ' + started[0].pct + '% — làm tiếp cho trọn.', href: started[0].next.href });
    const lv = (i.challengeLevels || []).filter(function (l) { return l.unlocked && l.stars < 3; })[0];
    if (lv) out.push({ kind: 'bi-canh', title: (lv.stars ? 'Lấy thêm sao ở ' : 'Vượt màn ') + lv.name, why: lv.stars ? 'Em đã có ' + lv.stars + '/3 sao.' : 'Màn này đã mở cho em.', href: lv.href });
    const ms = (i.missions || []).filter(function (m) { return (m.score || 0) < 60; })[0];
    if (ms) out.push({ kind: 'nhiem-vu', title: 'Làm nhiệm vụ ' + ms.name, why: 'Đạt từ 60 điểm để mở công trình mới trong thành phố.', href: ms.href });
    if (!started.length) {
      const first = (i.courses || []).filter(function (c) { return !c.started && c.next; })[0];
      if (first) out.push({ kind: 'bai-hoc', title: 'Bắt đầu ' + first.name, why: 'Em chưa học công pháp nào — bắt đầu từ bài đầu tiên.', href: first.next.href });
    }
    return out.slice(0, 4);
  }

  const api = { PUBLIC_TASKS: PUBLIC_TASKS, STAFF_TASKS: STAFF_TASKS, LANGS: LANGS, TASKS: TASKS, SYS: SYS, scrubPII: scrubPII, build: build, modeOf: modeOf, policy: policy, parseRubric: parseRubric, suggestNext: suggestNext };
  root.EduMentor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ──────────────── 00-config.gs ────────────────
/**
 * IC3_Professional — Backend Apps Script (Google Sheet + Firebase Auth)
 *
 * Backend của dự án chỉ gồm 2 phần: Firebase (tài khoản, roster, lịch dạy) và Apps Script này (bài nộp, kết quả cho dashboard, bản đồ, đẩy dữ liệu
 * lên GitHub). Mọi API đi qua doPost — xem routes_() trong 10-router.gs.
 *
 * MÃ NGUỒN: apps/src/*.gs (mỗi file 1 nhiệm vụ). apps/Code.gs là bản GỘP để dán vào
 * Apps Script editor — tạo bằng `node scripts/build-apps-script.js`, đừng sửa tay.
 *
 * CÁCH DEPLOY:
 *  1. script.google.com → project → dán toàn bộ apps/Code.gs vào Code.gs → Save.
 *  2. Lần đầu (hoặc khi thêm dịch vụ mới): chọn hàm `doGet` → Run → cấp quyền.
 *  3. Deploy → Manage deployments → ✏️ → Version: New version → Deploy (giữ URL).
 *     Tạo mới: Deploy → New deployment → Web app, Execute as: Me, Who has access: Anyone.
 *  4. Project Settings → Script Properties (tuỳ chọn):
 *     - GITHUB_TOKEN: fine-grained token, quyền "Contents: Read and write" trên đúng repo
 *       (dùng cho nút đẩy câu hỏi ở image-manager.html — token chỉ nằm ở đây, không ở
 *       trình duyệt của ai).
 *     - GEMINI_API_KEY / GEMINI_MODEL / AI_DAILY_MAX: key Gemini hệ thống cho Trợ lý AI (78-ai.gs).
 *       Admin cài từ web (nút "Cài đặt AI" → Key hệ thống) — có gọi thử trước khi lưu; hoặc dán tay ở đây.
 */

// ====== CẤU HÌNH - THAY BẰNG ID THẬT CỦA BẠN ======
const BACKEND_VERSION = '2026-11-17a';
const SPREADSHEET_ID_DATA = '16ty8LB6pnk5Xai1VauUAKfMbIaT88ewfNUAhWM0z5ck';      // Sheet chứa HocSinh + KetQua
const SPREADSHEET_ID_REPORT = '16ty8LB6pnk5Xai1VauUAKfMbIaT88ewfNUAhWM0z5ck';    // Sheet chứa báo cáo tổng hợp (có thể trùng với ID trên nếu để chung 1 file, khác tab)

const SHEET_ROSTER = 'HocSinh';   // cột: MSHS | HoTen | Lop | Truong | Email
const SHEET_SCORES = 'KetQua';    // cột: Timestamp | MSHS | HoTen | Lop | BaiThi | DiemSo | ThoiGianLamPhut | TrangThai | ChiTietLoaiCauHoi(JSON)
const SHEET_REPORT_SUMMARY = 'TongHop'; // nơi ghi báo cáo tổng hợp do dashboard yêu cầu xuất

// Tab nhật ký nộp bài (js/googleSheet.js gửi lên) — nguồn kết quả cho dashboard khi
// js/backend-config.js chọn đọc từ Sheet. Cột: xem LOG_HEADERS.
const SHEET_SUBMISSION_LOG = 'NhatKyNopBai';

// Xoay vòng file nhật ký khi quá lớn — xem getSubmissionLogSheet_() / logTab_(). 300.000
// dòng × 16 cột ≈ 4,8 triệu ô (sau khi cắt cột trống — tab mới mặc định 26 cột). Ngoài ra
// còn xoay khi CẢ FILE vượt FILE_CELL_BUDGET (90-utils.gs) vì các tab nhật ký khác ở chung file.
const MAX_LOG_ROWS = 300000;
const LOG_SPREADSHEET_PROP = 'LOG_SPREADSHEET_ID'; // Script Properties: ID file nhật ký đang ghi
const SHEET_LOG_CATALOG = 'DanhMucNhatKy';          // tab ở file chính: danh sách các file nhật ký
const DEDUPE_TTL_SEC = 6 * 60 * 60;                   // CacheService giữ tối đa 6 giờ
const LOG_HISTORY_PROP = 'LOG_SPREADSHEET_HISTORY';  // Script Properties: ID các file nhật ký đã tạo (cũ → mới)
// Cột A..P của tab nhật ký. N (CheDo), O (CauSai — uid câu sai "a,b,c"), P (ChiTiet — JSON
// gọn: sai/bỏ qua, giây làm bài, chương trình/cấp/bài, hết giờ, vi phạm nâng cao) thêm 10/2026 —
// tự ghi tiêu đề nếu tab cũ chưa có. Có P thì Sheet đủ mọi trường của quiz_results.
const LOG_HEADERS = ['SubmissionId', 'HoTen', 'Lop', 'Truong', 'BaiThi', 'Diem', 'SoCauDung',
  'ThoiGianLam', 'SoLanChuyenTab', 'SoLanClick', 'TrangThai', 'ThoiGianNop', 'GhiChu', 'CheDo', 'CauSai', 'ChiTiet'];
const WRONG_MAX_UIDS = 30;     // tối đa số câu sai lưu mỗi bài (khớp js/services/result-submitter.js)
const WRONG_STATS_TOP = 60;    // số câu hay sai nhất trả về cho dashboard

// Xác thực người gọi bằng Firebase ID token (xem 20-auth.gs).
const FIREBASE_PROJECT_ID = 'data-ic3';

// Đọc kết quả cho dashboard (40-results.gs).
const READ_CHUNK_ROWS = 5000;      // đọc Sheet theo khối từ cuối lên
const READ_MAX_SCAN_ROWS = 60000;  // trần số dòng quét mỗi lượt (giữ thời gian chạy vài giây)
const READ_MAX_ROWS = 10000;       // trần số bài trả về mỗi lượt

// Bản đồ (60-maps.gs) — dịch vụ Maps có sẵn của Apps Script, không cần API key/thẻ.
// Tài khoản Gmail thường: ~1.000 lượt geocode/ngày cho CẢ project → giới hạn theo người.
const MAPS_MAX_PER_USER_PER_DAY = 150;

// Đẩy dữ liệu tĩnh lên GitHub (70-github.gs).
const GITHUB_OWNER = 'HCM-PROJECT-IC3';
const GITHUB_REPO = 'IC3_Professional';
const GITHUB_BRANCH = 'main';
const GITHUB_ALLOWED_PREFIXES = ['data/', 'img/']; // chỉ cho ghi dữ liệu tĩnh, không ghi code
const ROSTER_STATIC_PATH = 'data/roster/students-active.json'; // danh sách học sinh ở trang làm bài

// Email nhận cảnh báo khi phát hiện nghi vấn gian lận (status chứa ⚠️) —
// điền email thật của giáo viên/điều phối vào đây (có thể để nhiều email,
// cách nhau bằng dấu phẩy). Để mảng rỗng thì tắt tính năng gửi email,
// dữ liệu vẫn được ghi vào NhatKyNopBai như cũ, chỉ là không có email.
const ALERT_EMAILS = []; // vd: ['giaovien@example.com', 'dieuphoi@example.com']

// Giới hạn số email cảnh báo gửi tối đa trong 1 giờ, để không bao giờ
// chạm quota MailApp miễn phí (100/ngày với Gmail cá nhân) dù có sự cố
// khiến hàng loạt học sinh bị gắn cờ nghi vấn cùng lúc (vd. bug ở
// integrity-check phía client). Dùng CacheService (miễn phí, có sẵn
// trong mọi project Apps Script) để đếm, không cần thêm Sheet/DB nào.
const ALERT_EMAIL_MAX_PER_HOUR = 15;

// ──────────────── 10-router.gs ────────────────
// ====== ROUTER ======
// Mọi API đi qua doPost với body JSON { action, idToken?, ... } (Content-Type text/plain
// để trình duyệt không gửi preflight — Apps Script không xử lý OPTIONS).
// roles = null: công khai (submitExam / mosSubmit / rosterByCode / aiAsk — học sinh không đăng nhập; submitBatch tự kiểm RELAY_TOKEN). Còn lại bắt buộc
// Firebase ID token và vai trò nằm trong danh sách (xem requireRole_ trong 20-auth.gs).

const ROLES_RESULTS = ['admin', 'coordinator', 'school_admin', 'teacher']; // giống quyền đọc quiz_results
const ROLES_MANAGE = ['admin', 'coordinator', 'school_admin'];         // xoá bài, roster, báo cáo
const ROLES_MAPS = ['admin', 'teaching_coordinator', 'teacher', 'coordinator', 'school_admin'];
const ROLES_ADMIN = ['admin'];
const ROLES_STAFF = ['admin', 'coordinator', 'school_admin', 'teaching_coordinator', 'teacher']; // mọi tài khoản quản trị
const ROLES_TEACH = ['admin', 'teacher'];                              // trang Điểm danh (sổ lớp điều phối)

// Hàm (không phải hằng) để không phụ thuộc thứ tự nạp file khi dán thành nhiều file .gs.
function routes_() {
  return {
    ping:          { roles: null,          handler: function () { return { version: BACKEND_VERSION }; } },
    submitExam:    { roles: null,          handler: function (p) { return writeSubmissionLog_(p.payload); } },
    mosSubmit:     { roles: null,          handler: function (p) { return writeMosLog_(p.payload); } },
    submitBatch:   { roles: null,          handler: submitBatch_ }, // máy chủ trường — tự kiểm RELAY_TOKEN (36-batch.gs)
    listResults:   { roles: ROLES_RESULTS, handler: listResults_ },
    wrongStats:    { roles: ROLES_RESULTS, handler: wrongStats_ },
    deleteResults: { roles: ROLES_MANAGE,  handler: deleteResults_ },
    getRoster:     { roles: ROLES_MANAGE,  handler: function (p, who) { return getRoster_(p.lop, who); } },
    getScores:     { roles: ROLES_MANAGE,  handler: function (p, who) { return getScores_(p.lop, p.baiThi, who); } },
    getDashboard:  { roles: ROLES_MANAGE,  handler: function (p, who) { return buildDashboardPayload_(p.lop, who); } },
    writeReport:   { roles: ROLES_MANAGE,  handler: function (p) { return writeSummaryReport_(p.report); } },
    mapDistance:   { roles: ROLES_MAPS,    handler: mapDistance_ },
    githubReadFile:{ roles: ROLES_ADMIN,   handler: githubReadFile_ },
    githubPublish: { roles: ROLES_ADMIN,   handler: githubPublish_ },
    publishRoster: { roles: ROLES_ADMIN,   handler: publishRoster_ },
    publishRosterCodes: { roles: ROLES_ADMIN, handler: publishRosterCodes_ }, // 75-roster-codes.gs
    rosterByCode:  { roles: null,          handler: rosterByCode_ },          // công khai: mã lớp → tên 1 lớp
    logActivity:   { roles: ROLES_STAFF,   handler: logActivity_ },
    arenaRoomLog:  { roles: ROLES_STAFF,   handler: arenaRoomLog_ },
    arenaRelayTicket: { roles: ROLES_STAFF, handler: arenaRelayTicket_ },
    classSheetWrite:  { roles: ROLES_TEACH, handler: classSheetWrite_ },
    classBooks:       { roles: ROLES_TEACH, handler: classBooks_ },      // 49-class-books.gs — sổ lớp theo trường được gán
    classBookSave:    { roles: ROLES_TEACH, handler: classBookSave_ },
    classBookRemove:  { roles: ROLES_TEACH, handler: classBookRemove_ },
    classSheetRead:   { roles: ROLES_TEACH, handler: classSheetRead_ },  // sổ đã tắt link công khai
    classSheetInfo:   { roles: ROLES_TEACH, handler: classSheetInfo_ },
    aiAsk:         { roles: null,          handler: aiAsk_ },        // 78-ai.gs — công khai: giải thích câu sai, câu hỏi nhanh (có trần lượt)
    aiAskStaff:    { roles: ROLES_STAFF,   handler: aiAskStaff_ },
    aiReport:      { roles: null,          handler: aiReport_ },     // 78-ai.gs — công khai: báo câu trả lời AI có vấn đề (10/ngày/máy)
    aiStatus:      { roles: ROLES_STAFF,   handler: aiStatus_ },
    aiConfig:      { roles: ROLES_ADMIN,   handler: aiConfig_ },
  };
}

/**
 * GET chỉ còn kiểm tra sống (mở URL Web App trên trình duyệt). Trước đây getRoster /
 * getScores / getDashboard chạy bằng GET KHÔNG cần đăng nhập — ai có URL đều đọc được
 * danh sách học sinh (kể cả email) và điểm. Nay chuyển sang doPost + đăng nhập.
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action && action !== 'ping') {
    return jsonOutput_({ ok: false, code: 'moved', error: 'API "' + action + '" chỉ nhận POST kèm đăng nhập.' });
  }
  return jsonOutput_({ ok: true, data: { service: 'IC3 Apps Script', version: BACKEND_VERSION } });
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ ok: false, code: 'invalid-argument', error: 'Payload không hợp lệ: ' + err });
  }
  return jsonOutput_(handleRequest_(payload || {}));
}

/** Tách khỏi doPost để chạy thử trong editor/test mà không cần Web App. */
function handleRequest_(payload) {
  const route = routes_()[payload.action || ''];
  if (!route) return { ok: false, code: 'not-found', error: 'Không rõ action: ' + payload.action };
  try {
    const who = route.roles ? requireRole_(authenticate_(payload.idToken), route.roles) : null;
    return { ok: true, data: route.handler(payload, who) };
  } catch (err) {
    // err.code (nếu có) giúp web phân biệt lỗi "gửi lại vô ích" với lỗi tạm thời.
    return { ok: false, code: (err && err.code) || 'internal', error: String((err && err.message) || err) };
  }
}

/** Lỗi kèm mã cho web (vd 'permission-denied', 'invalid-argument', 'conflict'). */
function appError_(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ──────────────── 20-auth.gs ────────────────
// ====== XÁC THỰC + PHÂN QUYỀN (Firebase ID token) ======
//
// Web gửi kèm Firebase ID token của người đang đăng nhập. Script dùng CHÍNH token đó đọc
// hồ sơ users/{uid} qua Firestore REST: Firestore chỉ trả về khi token thật, còn hạn và
// đúng chủ hồ sơ (firestore.rules) → vừa xác thực vừa biết vai trò/trường. Kết quả giữ
// trong CacheService tới khi token hết hạn (≤ 1 giờ) → ~1 lượt đọc Firebase/giờ/người.
// Lưu ý: nếu bật Enforce App Check cho Firestore, lượt đọc REST này bị chặn.

/**
 * @returns {{uid:string, role:string, approved:boolean, schools:(string[]|null)}}
 *   schools = null: xem mọi trường (admin).
 */
function authenticate_(idToken) {
  if (!idToken || typeof idToken !== 'string') throw appError_('unauthenticated', 'Chưa đăng nhập.');
  const cache = CacheService.getScriptCache();
  // auth3: hồ sơ thêm schoolIds (02/11/2026) — bản đệm auth2 cũ không có, bỏ qua.
  const key = 'auth3:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  // Đọc nhanh phần thân token (CHƯA tin) chỉ để lấy uid/hạn — Firestore xác thực thật ở dưới.
  let claims;
  try {
    claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(idToken.split('.')[1])).getDataAsString());
  } catch (e) {
    throw appError_('unauthenticated', 'Phiên đăng nhập không hợp lệ.');
  }
  const uid = claims.user_id || claims.sub;
  const expSec = Number(claims.exp) || 0;
  if (!uid || claims.aud !== FIREBASE_PROJECT_ID || expSec * 1000 < Date.now()) {
    throw appError_('unauthenticated', 'Phiên đăng nhập đã hết hạn — tải lại trang.');
  }

  const res = UrlFetchApp.fetch(
    'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
    '/databases/(default)/documents/users/' + encodeURIComponent(uid),
    { headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw appError_('unauthenticated', 'Không xác thực được tài khoản (mã ' + res.getResponseCode() + ').');
  }
  const f = (JSON.parse(res.getContentText()).fields) || {};
  const role = (f.role && f.role.stringValue) || '';
  const schools = ((f.schools && f.schools.arrayValue && f.schools.arrayValue.values) || [])
    .map(function (v) { return v.stringValue; }).filter(Boolean);
  const schoolIds = ((f.schoolIds && f.schoolIds.arrayValue && f.schoolIds.arrayValue.values) || [])
    .map(function (v) { return v.stringValue; }).filter(Boolean);
  const who = {
    uid: uid,
    role: role,
    approved: !!(f.approved && f.approved.booleanValue),
    schools: role === 'admin' ? null : schools,
    schoolIds: role === 'admin' ? null : schoolIds,
  };

  const ttl = Math.min(3600, Math.floor(expSec - Date.now() / 1000) - 60);
  if (ttl > 60) cache.put(key, JSON.stringify(who), ttl);
  return who;
}

/** Chặn nếu vai trò không nằm trong danh sách; giáo viên phải được admin duyệt. */
function requireRole_(who, roles) {
  if (roles.indexOf(who.role) === -1 || (who.role === 'teacher' && !who.approved)) {
    throw appError_('permission-denied', 'Tài khoản không có quyền dùng chức năng này.');
  }
  return who;
}

// ──────────────── 30-submissions.gs ────────────────
// ====== GHI BÀI NỘP (công khai — học sinh không đăng nhập) ======
// Router: action 'submitExam'. Xem js/googleSheet.js (phía web).

/**
 * API này công khai (học sinh không đăng nhập) → chặn dữ liệu rác/quá khổ trước khi
 * ghi. Lỗi mã 'invalid-argument': web bỏ bài khỏi hàng đợi thay vì gửi lại mãi.
 */
function validateSubmission_(p) {
  const bad = function (msg) { throw appError_('invalid-argument', 'Bài nộp không hợp lệ: ' + msg); };
  if (!p || typeof p !== 'object') bad('thiếu dữ liệu');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(p.submissionId || ''))) bad('submissionId');
  [['studentName', 120], ['studentClass', 40], ['studentSchool', 160], ['testName', 300],
    ['correct', 20], ['time', 20], ['status', 300], ['note', 500], ['timestamp', 60]].forEach(function (f) {
    const v = p[f[0]];
    if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > f[1])) bad(f[0]);
  });
  if (!String(p.studentName || '').trim()) bad('studentName');
  const score = Number(p.score);
  if (p.score !== undefined && p.score !== '' && !(score >= 0 && score <= 100)) bad('score');
  ['tabSwitch', 'clickCount'].forEach(function (k) {
    if (p[k] !== undefined && p[k] !== '' && !(Number(p[k]) >= 0 && Number(p[k]) < 1e6)) bad(k);
  });
  if (p.examMode && ['practice', 'test'].indexOf(p.examMode) === -1) bad('examMode');
  // CauSai: "uid1,uid2" — uid ngân hàng câu hỏi (ic3__lv1__t1__q1; MOS có dấu/khoảng trắng),
  // cấm ký tự HTML/xuống dòng; khớp UID_RE ở js/services/result-submitter.js.
  if (p.wrong !== undefined && p.wrong !== null && p.wrong !== '') {
    if (typeof p.wrong !== 'string' || p.wrong.length > 2700) bad('wrong');
    const uids = p.wrong.split(',');
    if (uids.length > WRONG_MAX_UIDS || uids.some(function (u) { return !/^[^,<>"'`&\r\n]{3,80}$/.test(u); })) bad('wrong');
  }
  if (p.detail !== undefined && p.detail !== null) p.detail = cleanDetail_(p.detail, bad);
  validateWireAnswers_(p, bad); // câu trả lời để máy chủ chấm lại (77-grading.gs)
}

/**
 * Cột P ChiTiet (js/services/result-submitter.js → detail): chỉ giữ đúng các khoá biết
 * trước, số trong giới hạn, chữ ngắn → JSON gọn ≤ ~600 ký tự. Sai kiểu → từ chối bài.
 */
function cleanDetail_(d, bad) {
  if (typeof d !== 'object' || Array.isArray(d)) bad('detail');
  const n = function (v, max) {
    const x = Number(v);
    if (v !== undefined && v !== null && !(x >= 0 && x <= max)) bad('detail');
    return Math.round(x || 0);
  };
  const t = function (v) {
    if (v !== undefined && v !== null && typeof v !== 'string') bad('detail');
    return String(v || '').slice(0, 160);
  };
  const v = Array.isArray(d.v) ? d.v.slice(0, 6) : [];
  return {
    i: n(d.i, 10000), s: n(d.s, 10000), e: n(d.e, 864000),
    c: t(d.c), l: t(d.l), m: t(d.m), to: d.to ? 1 : 0,
    v: v.map(function (x) { return n(x, 1e6); }),
  };
}

/**
 * Ghi 1 dòng log nộp bài (đối chiếu/dự phòng) — tương đương vai trò của
 * Apps Script cũ mà js/googleSheet.js từng gọi, nhưng chuẩn hoá lại theo
 * router chung của file này. Chống ghi trùng bằng submissionId (khoá lock
 * để tránh 2 request cùng lúc ghi trùng khi mạng chập chờn gửi lại).
 *
 * payload khớp với payload gửi từ js/googleSheet.js:
 * { submissionId, studentName, studentClass, studentSchool, testName,
 *   score, correct, time, tabSwitch, clickCount, status, timestamp, note, examMode, wrong, detail }
 */
function writeSubmissionLog_(payload) {
  validateSubmission_(payload);

  // Chống trùng bằng CacheService (giữ mã đã ghi 6 giờ — DEDUPE_TTL_SEC) thay cho đọc
  // lại TOÀN BỘ cột SubmissionId mỗi lượt nộp: cách cũ chậm dần theo số dòng (100.000
  // dòng = đọc 100.000 ô mỗi bài, trong lúc giữ khoá chung) → mùa ôn thi các lượt nộp
  // xếp hàng chờ khoá rồi hết giờ. Gửi lại từ hàng đợi phía học sinh dùng cùng mã
  // (js/services/result-submitter.js) và thường diễn ra trong vài phút - vài giờ.
  //
  // KHÔNG còn khoá chung quanh appendRow (xem withRareLock_): mỗi bài nộp ghi song song.
  // Đánh đổi: 2 request CÙNG mã tới cùng lúc (< 1 giây) có thể ghi 2 dòng — hiếm, vì máy học
  // sinh gửi lại sau ≥ 15 giây và chỉ 1 tab gửi (Web Locks); listResults_ bỏ dòng trùng mã.
  const cache = CacheService.getScriptCache();
  const dedupeKey = 'sub:' + String(payload.submissionId).slice(0, 200);
  if (cache.get(dedupeKey)) return { written: false, duplicate: true };

  applyServerGrading_(payload); // bài Kiểm tra có gửi câu trả lời → chấm lại, ⚠️ nếu lệch điểm (77-grading.gs)
  const sheet = getSubmissionLogSheet_();
  // asText_(): giữ NGUYÊN chữ — trước đây Sheet tự đổi "7/24" (số câu đúng), lớp
  // "3/12", thời gian "5:05" thành ngày/giờ, và tên bắt đầu bằng "=" thành công thức.
  sheet.appendRow([
    asText_(payload.submissionId),
    asText_(payload.studentName),
    asText_(payload.studentClass),
    asText_(payload.studentSchool),
    asText_(payload.testName),
    payload.score         ?? '',
    asText_(payload.correct),
    asText_(payload.time),
    payload.tabSwitch     ?? '',
    payload.clickCount    ?? '',
    asText_(payload.status),
    new Date(), // Dùng giờ server (đáng tin cậy hơn giờ máy học sinh) - lưu dạng Date thật để sort/lọc được
    asText_(payload.note),
    asText_(payload.examMode), // N — CheDo: 'practice' (Ôn luyện) | 'test' (Kiểm tra); bài cũ để trống
    // O — CauSai: uid câu sai "a,b,c"; "-" = không sai câu nào; trống = web cũ chưa gửi.
    payload.wrong === '' ? '-' : asText_(payload.wrong),
    payload.detail ? JSON.stringify(payload.detail) : '' // P — ChiTiet (đã lọc ở cleanDetail_)
  ]);
  cache.put(dedupeKey, '1', DEDUPE_TTL_SEC);

  // Cảnh báo gian lận qua email — CHỈ khi có dấu ⚠️ trong status (do
  // js/googleSheet.js gắn khi integrity.valid == false), và chỉ với
  // dòng MỚI ghi (bản trùng đã return ở trên). Ngoài khoá để không giữ
  // khoá trong lúc gửi mail; lỗi gửi mail không làm mất dòng log đã ghi.
  if (payload.status && String(payload.status).indexOf('⚠️') !== -1) {
    sendCheatAlertEmail_(payload);
  }

  return { written: true, duplicate: false };
}

/**
 * Tab nhật ký đang nhận bài nộp. Mỗi file Google Sheet tối đa 10 triệu ô (mọi tab
 * cộng lại); 13 cột × 100.000 bài/ngày đầy 1 file sau ~1 tuần. Khi tab hiện tại
 * vượt MAX_LOG_ROWS dòng, tự tạo FILE MỚI "NhatKyNopBai <ngày>" (cùng dòng tiêu đề),
 * ghi tiếp vào đó và thêm 1 dòng vào tab DanhMucNhatKy của file chính để tra cứu.
 * Chưa có file mới nào thì dùng tab NhatKyNopBai của file chính như trước.
 * Không giữ khoá; chỉ lúc phải xoay file mới vào withRareLock_.
 */
function getSubmissionLogSheet_() {
  return batchMemo_('sub', openSubmissionLogSheet_); // lô từ máy chủ trường: mở + kiểm tab 1 lần cho cả lô
}

function openSubmissionLogSheet_() {
  const currentId = cachedProp_(LOG_SPREADSHEET_PROP); // qua cache — xem cachedProp_ (quota Properties)
  const sheet = currentId
    ? SpreadsheetApp.openById(currentId).getSheetByName(SHEET_SUBMISSION_LOG)
    : SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_SUBMISSION_LOG);
  if (!sheet) {
    throw new Error('Chưa có tab "' + SHEET_SUBMISSION_LOG + '" trong Sheet báo cáo — xem HUONG_DAN.md để tạo.');
  }
  ensureLogSheetLayout_(sheet);
  if (!logTabFull_(sheet)) return sheet; // đầy theo số dòng HOẶC file sắp chạm trần 10 triệu ô

  return withRareLock_(function () {
    // Lượt khác vừa xoay file trong lúc chờ khoá → ghi vào file đó, không tạo thêm file
    const now = cachedProp_(LOG_SPREADSHEET_PROP);
    if (now && now !== currentId) {
      const moved = SpreadsheetApp.openById(now).getSheetByName(SHEET_SUBMISSION_LOG);
      if (moved) return moved;
    }
    const made = newLogFile_(SHEET_SUBMISSION_LOG, LOG_HEADERS);
    setCachedProp_(LOG_SPREADSHEET_PROP, made.file.getId());
    // Lịch sử file đọc thẳng Properties (không qua cache) để không mất file nào khi ghi lại.
    const history = JSON.parse(PropertiesService.getScriptProperties().getProperty(LOG_HISTORY_PROP) || '[]');
    history.push(made.file.getId());
    setCachedProp_(LOG_HISTORY_PROP, JSON.stringify(history));
    ensureLogSheetLayout_(made.sheet);
    return made.sheet;
  });
}

/**
 * Tiêu đề các cột thêm sau (N CheDo, O CauSai...) + định dạng giờ nộp (L) kiểu Việt Nam.
 * Chạy tối đa 1 lần/6 giờ cho mỗi tab (cờ trong CacheService) — không tốn thêm thời
 * gian cho từng bài nộp.
 */
function ensureLogSheetLayout_(sheet) {
  const cache = CacheService.getScriptCache();
  const flag = 'layout:' + sheet.getParent().getId();
  if (cache.get(flag)) return;
  withRareLock_(function () { // 6 giờ/lần; 2 lượt cùng xoá cột thì lượt sau báo lỗi → làm trong khoá
    if (cache.get(flag)) return;
    const head = sheet.getRange(1, 1, 1, LOG_HEADERS.length).getDisplayValues()[0];
    LOG_HEADERS.forEach(function (h, i) {
      if (i >= 13 && !head[i]) sheet.getRange(1, i + 1).setValue(h); // chỉ cột thêm sau, không đè tiêu đề cũ
    });
    sheet.getRange('L2:L').setNumberFormat('HH:mm:ss d/M/yyyy');
    const max = sheet.getMaxColumns(); // cột trống thừa vẫn tính vào trần 10 triệu ô/file
    if (max > LOG_HEADERS.length) sheet.deleteColumns(LOG_HEADERS.length + 1, max - LOG_HEADERS.length);
    cache.put(flag, '1', DEDUPE_TTL_SEC);
  });
}

/**
 * Giữ nguyên chữ khi ghi vào Sheet: thêm dấu ' trước giá trị mà Sheet sẽ tự đổi
 * (dạng số/ngày/giờ như "7/24", "3/12", "5:05") hoặc hiểu thành công thức (bắt đầu
 * bằng = + - @). Dấu ' không hiện trong ô và không có trong giá trị đọc ra.
 */
function asText_(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /^[=+\-@]/.test(s) || /^[\d\s\/.:,-]+$/.test(s) ? "'" + s : s;
}

/**
 * Gửi email cảnh báo 1 lượt nộp bài bị nghi vấn gian lận, có throttle
 * (ALERT_EMAIL_MAX_PER_HOUR) để không bao giờ vượt quota MailApp free.
 * Lỗi ở đây (mail quota hết, ALERT_EMAILS rỗng...) chỉ log, KHÔNG throw —
 * đây là tính năng "thêm", không được phép làm hỏng luồng ghi log chính.
 */
function sendCheatAlertEmail_(payload) {
  try {
    if (!ALERT_EMAILS || ALERT_EMAILS.length === 0) return;

    const cache = CacheService.getScriptCache();
    const bucketKey = 'cheatAlertCount_' + Math.floor(Date.now() / (60 * 60 * 1000)); // 1 khoá/giờ
    const sentThisHour = Number(cache.get(bucketKey) || 0);
    if (sentThisHour >= ALERT_EMAIL_MAX_PER_HOUR) {
      console.warn('Đã đạt giới hạn ' + ALERT_EMAIL_MAX_PER_HOUR + ' email cảnh báo/giờ — bỏ qua để giữ quota MailApp.');
      return;
    }

    const subject = '⚠️ Nghi vấn gian lận: ' + (payload.studentName || 'Ẩn danh') + ' — ' + (payload.testName || '');
    const body = [
      'Học sinh: ' + (payload.studentName || ''),
      'Lớp: ' + (payload.studentClass || ''),
      'Trường: ' + (payload.studentSchool || ''),
      'Bài thi: ' + (payload.testName || ''),
      'Điểm: ' + (payload.score ?? ''),
      'Trạng thái: ' + (payload.status || ''),
      'Ghi chú: ' + (payload.note || ''),
      'Số lần chuyển tab: ' + (payload.tabSwitch ?? ''),
      '',
      '(Email tự động từ apps/Code.gs — xem chi tiết đầy đủ ở sheet "' + SHEET_SUBMISSION_LOG + '")'
    ].join('\n');

    MailApp.sendEmail(ALERT_EMAILS.join(','), subject, body);
    cache.put(bucketKey, String(sentThisHour + 1), 3600); // hết hạn sau 1 giờ, tự dọn
  } catch (e) {
    console.error('Lỗi gửi email cảnh báo gian lận (không ảnh hưởng việc ghi log):', e);
  }
}

// ──────────────── 35-mos.gs ────────────────
// ====== KẾT QUẢ MOS PRACTICE (công khai — học sinh không đăng nhập) ======
// Router: mosSubmit. Xem js/mos-submissions.js (phía web). Trước đây mỗi bài MOS ghi 1
// lượt Firestore (mos_submissions) mà không trang nào đọc lại — nay vào tab NhatKyMOS
// để giáo viên mở Sheet là xem/lọc được, 0 lượt Firebase.

const SHEET_MOS_LOG = 'NhatKyMOS';
const MOS_HEADERS = ['SubmissionId', 'HoTen', 'Lop', 'Truong', 'DuAn', 'MaDuAn', 'Diem',
  'TaskDung', 'TaskTuCham', 'TaskThuCong', 'ThoiGianNop', 'ChiTiet'];

function validateMosSubmission_(p) {
  const bad = function (msg) { throw appError_('invalid-argument', 'Bài MOS không hợp lệ: ' + msg); };
  if (!p || typeof p !== 'object') bad('thiếu dữ liệu');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(p.submissionId || ''))) bad('submissionId');
  [['studentName', 120], ['studentClass', 40], ['studentSchool', 160], ['projectId', 120], ['projectTitle', 300]]
    .forEach(function (f) {
      const v = p[f[0]];
      if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > f[1])) bad(f[0]);
    });
  if (!String(p.studentName || '').trim()) bad('studentName');
  if (p.score !== null && p.score !== undefined && !(Number(p.score) >= 0 && Number(p.score) <= 100)) bad('score');
  if (p.results !== undefined && (!Array.isArray(p.results) || p.results.length > 200)) bad('results');
}

/** p: payload như js/mos-submissions.js dựng (studentName, ..., score, results[]). */
function writeMosLog_(p) {
  validateMosSubmission_(p);
  const cache = CacheService.getScriptCache();
  const dedupeKey = 'mos:' + p.submissionId;
  if (cache.get(dedupeKey)) return { written: false, duplicate: true };

  // Chỉ giữ phần cần cho giáo viên xem lại, cắt ngắn để 1 ô không vượt 50.000 ký tự.
  const detail = JSON.stringify((p.results || []).map(function (r) {
    return { id: r.id, label: String(r.label || '').slice(0, 200), passed: r.passed, manual: !!r.manual,
      note: String(r.note || '').slice(0, 200) };
  })).slice(0, 45000);

  // Không khoá quanh appendRow (xem withRareLock_ trong 90-utils.gs) — cùng đánh đổi như bài nộp IC3.
  // Tự sang file mới khi đầy — xem logTab_. Trong lô (36-batch.gs) chỉ mở + kiểm 1 lần.
  const sheet = batchMemo_('mos', function () { return logTab_(SHEET_MOS_LOG, MOS_HEADERS); });
  sheet.appendRow([
    asText_(p.submissionId), asText_(p.studentName), asText_(p.studentClass), asText_(p.studentSchool),
    asText_(p.projectTitle), asText_(p.projectId),
    // score null = không có task tự chấm (toàn thủ công) — để trống thay vì 0.
    p.score === null || p.score === undefined ? '' : Number(p.score),
    Number(p.passedCount) || 0, Number(p.autoTotal) || 0, Number(p.manualCount) || 0,
    new Date(), asText_(detail),
  ]);
  cache.put(dedupeKey, '1', DEDUPE_TTL_SEC);
  return { written: true, duplicate: false };
}

// ──────────────── 36-batch.gs ────────────────
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

// ──────────────── 40-results.gs ────────────────
// ====== ĐỌC / XOÁ KẾT QUẢ CHO DASHBOARD (thay Firestore quiz_results) ======
// Router: 'listResults' (admin / điều phối / giáo viên đã duyệt), 'deleteResults'
// (admin / điều phối). Người gọi đã được xác thực ở 10-router.gs → tham số `who`.

/** Các file nhật ký, MỚI NHẤT trước (file chính là cũ nhất). */
function logSpreadsheetIds_() {
  const history = JSON.parse(cachedProp_(LOG_HISTORY_PROP) || '[]');
  return history.slice().reverse().concat([SPREADSHEET_ID_REPORT]);
}

/** Thời điểm nộp (ms) từ cột L: Date thật (bản mới) hoặc chuỗi giờ VN "16:59:17 5/10/2026" (bản cũ). */
function submittedMs_(raw) {
  if (raw instanceof Date) return raw.getTime();
  const s = String(raw || '');
  let m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return Date.UTC(+m[6], +m[5] - 1, +m[4], +m[1] - 7, +m[2], +(m[3] || 0));
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 7, +m[5], +(m[6] || 0));
  return null;
}

/** 1 dòng nhật ký (giá trị HIỂN THỊ) → cùng dạng bản ghi quiz_results mà dashboard đang dùng. */
function logRowToResult_(r, ms) {
  const parts = String(r[4]).split(' › ');
  const cd = String(r[6]).split('/');
  const correct = Number(cd[0]) || 0;
  const total = Number(cd[1]) || 0;
  const t = String(r[7]).split(':');
  const status = String(r[10] || '');
  const note = String(r[12] || '');
  const integrityOk = status === '' || status === 'OK';
  const flags = [];
  if (!integrityOk) flags.push(status.replace(/^⚠️\s*/, ''));
  if (note && note !== 'Hết giờ') note.split('; ').forEach(function (x) { if (x) flags.push(x); });
  const out = {
    id: r[0], studentName: r[1], studentClass: r[2], studentSchool: r[3], testName: r[4],
    category: parts[0] || '', level: parts[1] || '', minitest: parts.slice(2).join(' › '),
    score: Number(r[5]) || 0, correct: correct, total: total,
    incorrect: Math.max(0, total - correct), skipped: 0,
    // Cột H ghi "mm:ss"; bản cũ bị Sheet đổi thành giờ ("68:08:00") — chỉ lấy 2 phần đầu.
    elapsedSec: (Number(t[0]) || 0) * 60 + (Number(t[1]) || 0),
    tabSwitches: Number(r[8]) || 0, clicks: Number(r[9]) || 0,
    integrityOk: integrityOk, flags: flags, timedOut: note.indexOf('Hết giờ') !== -1,
    // O — CauSai: "a,b" | "-" (không sai câu nào) | trống (bài do web cũ gửi, không có dữ liệu).
    examMode: r[13] || '', wrong: r[14] && r[14] !== '-' ? String(r[14]).split(',') : [], wrongTracked: !!r[14],
    submittedAtMs: ms, source: 'sheet'
  };
  return applyDetail_(out, r[15]);
}

/** Cột P ChiTiet (bài nộp từ 10/2026): ghi đè các trường ở trên bằng số liệu chính xác. */
function applyDetail_(out, raw) {
  if (!raw) return out;
  let d;
  try { d = JSON.parse(raw); } catch (e) { return out; }
  if (!d || typeof d !== 'object') return out;
  out.incorrect = Number(d.i) || 0;
  out.skipped = Number(d.s) || 0;
  if (Number(d.e) > 0) out.elapsedSec = Number(d.e);
  if (d.c || d.l || d.m) { out.category = String(d.c || ''); out.level = String(d.l || ''); out.minitest = String(d.m || ''); }
  out.timedOut = !!d.to;
  const v = Array.isArray(d.v) ? d.v : [];
  ['multiTabHits', 'fullscreenExits', 'appSwitches', 'devtoolsHits', 'shortcutBlocks', 'printAttempts']
    .forEach(function (k, i) { out[k] = Number(v[i]) || 0; });
  return out;
}

/**
 * "Câu cả lớp hay sai" — tổng hợp cột O (CauSai) NGAY TRÊN SERVER rồi trả về bảng gọn
 * (≤ WRONG_STATS_TOP câu), thay vì gửi hàng nghìn bài về trình duyệt. Dùng chung bộ
 * lọc/quyền với listResults_. Không đụng Firestore (chỉ xác thực người gọi như mọi API).
 * p: { schools?, classes?, sinceMs?, testName? }
 * @returns {{ submissions, withData, truncated, items: [{uid, count, students, tests}] }}
 *   submissions = số bài trong phạm vi; withData = số bài có dữ liệu cột CauSai (mẫu số để
 *   tính % sai — bài cũ trước khi có cột O không tính); students = số HS khác nhau làm sai.
 */
function wrongStats_(p, who) {
  const res = listResults_({ schools: p.schools, classes: p.classes, sinceMs: p.sinceMs, limit: READ_MAX_ROWS }, who);
  const wantTest = p.testName ? String(p.testName) : '';
  const byUid = {};
  let submissions = 0;
  let withData = 0;
  res.rows.forEach(function (r) {
    if (wantTest && r.testName !== wantTest) return;
    submissions++;
    if (!r.wrongTracked) return;
    withData++;
    const student = nameKey_(r.studentName) + '|' + String(r.studentClass || '').toLowerCase();
    r.wrong.forEach(function (uid) {
      const e = byUid[uid] || (byUid[uid] = { uid: uid, count: 0, students: {}, tests: {} });
      e.count++;
      e.students[student] = 1;
      e.tests[r.testName] = (e.tests[r.testName] || 0) + 1;
    });
  });
  const items = Object.keys(byUid).map(function (k) {
    const e = byUid[k];
    const tests = Object.keys(e.tests).sort(function (a, b) { return e.tests[b] - e.tests[a]; });
    return { uid: e.uid, count: e.count, students: Object.keys(e.students).length, tests: tests.slice(0, 3) };
  }).sort(function (a, b) { return (b.count - a.count) || (b.students - a.students) || (a.uid < b.uid ? -1 : 1); });
  return { submissions: submissions, withData: withData, truncated: res.truncated, items: items.slice(0, WRONG_STATS_TOP) };
}

/**
 * Danh sách bài nộp mới nhất trước, đã lọc theo quyền.
 * p: { schools?, classes?, sinceMs?, limit?, studentName? }; who: người gọi (đã xác thực).
 * Quét từ CUỐI tab ngược lên theo khối (bài nộp được ghi theo thứ tự thời gian) và
 * dừng ngay khi gặp bài cũ hơn sinceMs → lần làm mới của dashboard chỉ đọc phần đuôi.
 */
function listResults_(p, who) {
  // So theo schoolId (tên trường khác hoa/thường/dấu cách vẫn khớp; xem schoolIdOf_).
  let schoolIds = Array.isArray(p.schools) && p.schools.length ? p.schools.map(schoolIdOf_) : null;
  const scope = whoSchoolIdSet_(who);
  if (scope) {
    schoolIds = schoolIds ? schoolIds.filter(function (id) { return scope.has(id); }) : Array.from(scope);
    if (!schoolIds.length) return { rows: [], truncated: false };
  }
  const schoolSet = schoolIds ? new Set(schoolIds) : null;
  const classSet = Array.isArray(p.classes) && p.classes.length ? new Set(p.classes.map(String)) : null;
  const wantName = p.studentName ? nameKey_(p.studentName) : '';
  const sinceMs = Number(p.sinceMs) || 0;
  const limit = Math.max(1, Math.min(Number(p.limit) || 1000, READ_MAX_ROWS));

  const rows = [];
  // Bài nộp ghi song song không khoá (30-submissions.gs) → rất hiếm khi 1 mã có 2 dòng; giữ dòng mới nhất
  const seenIds = new Set();
  let scanned = 0;
  let done = false;
  let truncated = false;
  const ids = logSpreadsheetIds_();
  for (let f = 0; f < ids.length && !done; f++) {
    const sheet = SpreadsheetApp.openById(ids[f]).getSheetByName(SHEET_SUBMISSION_LOG);
    if (!sheet) continue;
    let end = sheet.getLastRow();
    // Dashboard làm mới (sinceMs) thường chỉ có vài chục bài mới: đọc khối nhỏ trước rồi
    // tăng ×4 — trước đây luôn đọc 5.000 dòng × 16 cột (~1–2 giây Apps Script/lần làm mới,
    // chiếm 1 trong 30 lượt chạy song song mà học sinh nộp bài cũng cần).
    let chunk = sinceMs ? 200 : READ_CHUNK_ROWS;
    while (end >= 2 && !done) {
      const start = Math.max(2, end - chunk + 1);
      chunk = Math.min(READ_CHUNK_ROWS, chunk * 4);
      const n = end - start + 1;
      const shown = sheet.getRange(start, 1, n, LOG_HEADERS.length).getDisplayValues();
      const times = sheet.getRange(start, 12, n, 1).getValues();
      for (let i = n - 1; i >= 0; i--) {
        const r = shown[i];
        const ms = submittedMs_(times[i][0]);
        if (sinceMs && ms && ms < sinceMs) { done = true; break; }
        if (!r[0] || seenIds.has(r[0])) continue;
        seenIds.add(r[0]);
        if (schoolSet && !schoolSet.has(schoolIdOf_(r[3]))) continue;
        if (classSet && !classSet.has(r[2])) continue;
        if (wantName && nameKey_(r[1]) !== wantName) continue;
        rows.push(logRowToResult_(r, ms));
        if (rows.length >= limit) { done = true; break; }
      }
      scanned += n;
      end = start - 1;
      if (!done && scanned >= READ_MAX_SCAN_ROWS) { done = true; truncated = true; }
    }
  }
  return { rows: rows, truncated: truncated };
}

/**
 * Xoá bài nộp theo mã (nút xoá ở Báo cáo kết quả). Chỉ admin, hoặc điều phối đào tạo
 * với bài thuộc trường của mình — giống quyền xoá quiz_results trong firestore.rules.
 * p: { ids: string[] (≤ 500) }; quyền admin/điều phối đã kiểm ở router.
 */
function deleteResults_(p, who) {
  const wanted = new Set((Array.isArray(p.ids) ? p.ids : []).slice(0, 500).map(String));
  if (!wanted.size) return { deleted: 0 };

  // Khoá riêng (không chặn bài nộp đang ghi): appendRow chỉ thêm dòng cuối, không làm lệch
  // số dòng đã tìm thấy ở đây; khoá này chỉ để 2 lượt xoá không chạy chồng nhau.
  const lock = LockService.getUserLock();
  lock.waitLock(30000);
  try {
    let deleted = 0;
    const ids = logSpreadsheetIds_();
    for (let f = 0; f < ids.length && wanted.size; f++) {
      const sheet = SpreadsheetApp.openById(ids[f]).getSheetByName(SHEET_SUBMISSION_LOG);
      if (!sheet || sheet.getLastRow() < 2) continue;
      const rowNums = [];
      wanted.forEach(function (id) {
        const cell = sheet.getRange('A:A').createTextFinder(id).matchEntireCell(true).findNext();
        if (!cell || cell.getRow() < 2) return;
        if (!inWhoScope_(who, sheet.getRange(cell.getRow(), 4).getDisplayValue())) return;
        rowNums.push(cell.getRow());
      });
      rowNums.sort(function (a, b) { return b - a; }).forEach(function (row) {
        wanted.delete(String(sheet.getRange(row, 1).getDisplayValue()));
        sheet.deleteRow(row);
        deleted++;
      });
    }
    if (deleted) auditServer_('delete_results', who, { deleted: deleted, ids: Array.from(new Set(p.ids)).slice(0, 50) });
    return { deleted: deleted };
  } finally {
    lock.releaseLock();
  }
}

// ──────────────── 45-activity.gs ────────────────
// ====== NHẬT KÝ HOẠT ĐỘNG (Audit log của Admin) ======
// Router: logActivity (mọi tài khoản quản trị đã đăng nhập). Ghi vào tab NhatKyHoatDong.
// Trước đây thiết kế ghi Firestore activity_logs nhưng phải TẮT vì mỗi lần giáo viên mở
// dashboard = 1 lượt ghi Firebase. Ở Sheet: 0 lượt Firebase, admin lọc/xem ngay trong Sheet.
// Ai làm gì lấy từ tài khoản đã xác thực (who), không tin tên/vai trò web gửi lên.

const SHEET_ACTIVITY_LOG = 'NhatKyHoatDong';
const ACTIVITY_HEADERS = ['ThoiGian', 'Uid', 'VaiTro', 'HanhDong', 'DoiTuong', 'ChiTiet', 'Trang'];
const ACTIVITY_ACTIONS = ['login', 'logout', 'view_student_detail', 'export_excel', 'export_pdf',
  'create_exam', 'assign_exam', 'update_roster', 'publish_roster', 'publish_questions', 'delete_results',
  'update_user', 'update_school', 'update_class_books', 'firestore_heavy'];

/** p: { activity, targetId?, meta?, page? } */
function logActivity_(p, who) {
  const activity = String(p.activity || '');
  if (ACTIVITY_ACTIONS.indexOf(activity) === -1) throw appError_('invalid-argument', 'Hành động không hợp lệ: ' + activity);
  const sheet = logTab_(SHEET_ACTIVITY_LOG, ACTIVITY_HEADERS);
  // appendRow tự an toàn khi nhiều lượt gọi cùng lúc; không cần khoá (không chống trùng).
  sheet.appendRow([
    new Date(), who.uid, who.role, activity,
    asText_(String(p.targetId || '').slice(0, 200)),
    asText_(JSON.stringify(p.meta || {}).slice(0, 2000)),
    asText_(String(p.page || '').slice(0, 100)),
  ]);
  return { logged: true };
}

/** Ghi nhật ký từ PHÍA SERVER cho thao tác nhạy cảm (đẩy GitHub, xoá bài) — web không bỏ qua được.
 *  Lỗi ghi nhật ký không được làm hỏng thao tác chính. */
function auditServer_(activity, who, meta) {
  try {
    logActivity_({ activity: activity, meta: meta, page: 'apps-script' }, who);
  } catch (e) {
    console.warn('Không ghi được nhật ký ' + activity + ': ' + e);
  }
}

// ──────────────── 47-arena.gs ────────────────
// ====== ĐẤU TRƯỜNG — PHÒNG CẢ LỚP (arena.html) ======
// Router: arenaRoomLog (tài khoản quản trị đã đăng nhập — người dẫn phòng). Ghi tab NhatKyDauTruong.
// Phòng cả lớp chạy NGANG HÀNG trên máy người dẫn (WebRTC, js/arena/arena-room.js) — 0 lượt
// Firebase. Hết trận, người dẫn bấm "Lưu lên Google Sheet" → ĐÚNG 1 lượt gọi cho cả phòng
// (thay vì mỗi câu trả lời 1 lượt ghi Firestore như live-quiz.html cũ). Mỗi người chơi 1 dòng.

const SHEET_ARENA_LOG = 'NhatKyDauTruong';
const ARENA_HEADERS = ['ThoiGian', 'MaPhong', 'CheDo', 'BoCau', 'Hang', 'BietDanh', 'Diem', 'SoCauDung',
  'SoCauHoi', 'ChuoiDungDaiNhat', 'NguoiDan', 'BatDau', 'KetThuc'];
const ARENA_MAX_PLAYERS = 80;   // khớp EduArenaRoomCore.MAX_PLAYERS
const ARENA_MAX_QUESTIONS = 200;
// Khớp MODE_LABEL trong js/arena/arena-room.js (trước đây chỉ nhận speed/race → 4 chế độ còn lại
// bấm "Lưu lên Google Sheet" luôn bị từ chối 'invalid-argument').
const ARENA_MODES = { speed: 'Tốc độ', race: 'Đua về đích', survival: 'Sinh tồn', tug: 'Kéo co', spell: 'Đấu phép', heist: 'Giải mã' };

// ====== ĐƯỜNG DỰ PHÒNG (Firestore) — TRẦN CHUNG MỖI NGÀY CHO CẢ DỰ ÁN ======
// Router: arenaRelayTicket (tài khoản quản trị — người dẫn phòng). Học sinh không nối thẳng được
// tới máy giáo viên đi đường dự phòng qua Firestore (js/arena/arena-relay.js) — mỗi em ~21 ghi +
// ~66 đọc/trận 20 câu. Firestore Spark DÙNG CHUNG với dashboard/lịch dạy/đăng nhập… nên nhiều giáo
// viên cùng mở phòng không được ăn hết hạn mức: máy người dẫn xin "chỗ" theo từng gói nhỏ, CHỈ khi
// có em thật sự cần đường dự phòng (phòng cả lớp chung Wi-Fi: 0 lượt gọi). Đếm theo ngày giờ VN.
// Đổi trần: Script Properties → RELAY_DAILY_SLOTS (mặc định 150 ≈ 3.200 ghi + 10.000 đọc/ngày).
const RELAY_DAILY_SLOTS_DEFAULT = 150;
const RELAY_CHUNK_MAX = 10;

/** p: { slots: số chỗ xin thêm (1..10) } → { granted, used, cap } */
function arenaRelayTicket_(p) {
  const want = Math.max(1, Math.min(RELAY_CHUNK_MAX, Math.round(Number(p.slots) || 5)));
  const day = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  const key = 'RELAY_USED_' + day;
  const props = PropertiesService.getScriptProperties(); // ~3 lượt Properties/lần — 1 lần cho mỗi 5 em
  return withRareLock_(function () {
    const cap = Math.max(0, Number(props.getProperty('RELAY_DAILY_SLOTS')) || RELAY_DAILY_SLOTS_DEFAULT);
    const raw = props.getProperty(key);
    if (raw === null) { // lượt đầu trong ngày: dọn bộ đếm ngày cũ
      props.getKeys().forEach(function (k) { if (k.indexOf('RELAY_USED_') === 0 && k !== key) props.deleteProperty(k); });
    }
    const used = Number(raw) || 0;
    const granted = Math.max(0, Math.min(want, cap - used));
    if (granted) props.setProperty(key, String(used + granted));
    return { granted: granted, used: used + granted, cap: cap };
  });
}

/** p: { summary: EduArenaRoomCore.summary(room) } */
function arenaRoomLog_(p, who) {
  const s = p.summary || {};
  const code = String(s.code || '');
  if (!/^[2-9A-HJKMNP-Z]{6}$/.test(code)) throw appError_('invalid-argument', 'Mã phòng không hợp lệ.');
  if (!ARENA_MODES[s.mode]) throw appError_('invalid-argument', 'Chế độ không hợp lệ.');
  const players = Array.isArray(s.players) ? s.players : [];
  if (!players.length || players.length > ARENA_MAX_PLAYERS) throw appError_('invalid-argument', 'Danh sách người chơi không hợp lệ.');
  const questions = Math.max(0, Math.min(ARENA_MAX_QUESTIONS, Number(s.questions) || 0));
  const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const time = (v) => (Number(v) > 0 ? new Date(Number(v)) : '');

  // Gửi lại cùng 1 phòng (bấm 2 lần, mạng chập chờn) → không ghi trùng.
  const cache = CacheService.getScriptCache();
  const key = 'arena:' + code + ':' + (Number(s.endedAt) || 0);
  if (cache.get(key)) return { written: 0, duplicate: true };

  const sheet = logTab_(SHEET_ARENA_LOG, ARENA_HEADERS);
  const now = new Date();
  const mode = ARENA_MODES[s.mode];
  players.forEach(function (pl, i) {
    sheet.appendRow([
      now, code, mode, asText_(String(s.title || '').slice(0, 150)),
      num(pl.rank || i + 1, ARENA_MAX_PLAYERS), asText_(String(pl.name || '').slice(0, 30)),
      num(pl.value, 100000), num(pl.correct, ARENA_MAX_QUESTIONS), questions, num(pl.bestStreak, ARENA_MAX_QUESTIONS),
      who.uid, time(s.startedAt), time(s.endedAt),
    ]);
  });
  cache.put(key, '1', DEDUPE_TTL_SEC);
  return { written: players.length };
}

// ──────────────── 48-class-sheet.gs ────────────────
// ====== GHI ĐIỂM DANH VÀO SỔ LỚP CỦA ĐIỀU PHỐI (diem-danh.html) ======
//
// Sổ "FORM QUẢN LÝ LỚP" (Google Sheet của Điều phối đào tạo, mỗi tab 1 lớp): cột E là nhãn
// TIẾT / THỨ / NGÀY / TÊN GV / BÀI DẠY / ĐÃ HOÀN THÀNH, mỗi cột từ F là 1 tiết, học sinh từ dòng dưới.
// Web chỉ ĐỌC sổ qua link công khai (export CSV); muốn GHI thì phải qua đây vì trình duyệt không có
// quyền sửa file của người khác. Script chạy bằng tài khoản deploy ("Execute as: Me") → tài khoản đó
// phải là Người chỉnh sửa của file (điều phối thêm email đó ở nút Chia sẻ).
//
// Không tin vị trí ô từ web: script tự tìm lại dòng nhãn trong tab, kiểm cột thuộc vùng tiết, tên học
// sinh ở dòng gửi lên phải khớp tên trên Sheet (điều phối chèn/xoá dòng thì từ chối, không ghi lệch).
// Chỉ ghi: ký hiệu điểm danh (x / v / NL / Mới / trống), ô NGÀY đang trống, ô ĐÃ HOÀN THÀNH.

const NO_EDIT_MSG_ = 'Tài khoản Google đã deploy Apps Script chưa có quyền sửa file này — nhờ điều phối bấm Chia sẻ, thêm email đó với quyền Người chỉnh sửa.';
const CLASS_MARKS_ = { x: 'x', v: 'v', nl: 'NL', moi: 'Mới', '': '' };

function classSheetNorm_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLocaleUpperCase('vi');
}

/** Tìm ô nhãn trong 40 dòng đầu → { r, c } (0-based) hoặc null. */
function classSheetFind_(disp, label) {
  for (let r = 0; r < Math.min(disp.length, 40); r++) {
    for (let c = 0; c < disp[r].length; c++) {
      const v = classSheetNorm_(disp[r][c]);
      if (v === label || (label === 'TÊN GV' && v.indexOf(label) === 0)) return { r: r, c: c };
    }
  }
  return null;
}

/**
 * p = { sheetId, gid, cols: [{ col, tiet }], marks: [{ row, name, m }], ngay?: 'YYYY-MM-DD', done?: bool }
 * row/col 0-based như CSV web đã đọc. Trả { written, ngay, done }.
 */
function classSheetWrite_(p, who) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(String(p.sheetId || ''))) throw appError_('invalid-argument', 'Mã file Sheet không hợp lệ.');
  requireClassBook_(who, p.sheetId); // 49-class-books.gs
  const cols = Array.isArray(p.cols) ? p.cols : [];
  const marks = Array.isArray(p.marks) ? p.marks : [];
  if (!cols.length || cols.length > 3) throw appError_('invalid-argument', 'Cần 1–3 cột tiết.');
  if (marks.length > 120) throw appError_('invalid-argument', 'Quá nhiều học sinh.');

  let ss;
  try { ss = SpreadsheetApp.openById(p.sheetId); } catch (e) {
    throw appError_('permission-denied', NO_EDIT_MSG_);
  }
  const sh = ss.getSheets().filter(function (s) { return String(s.getSheetId()) === String(p.gid); })[0];
  if (!sh) throw appError_('not-found', 'Không thấy tab lớp này trong file (điều phối đã xoá/đổi tab?).');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw appError_('unavailable', 'Đang có người ghi sổ — thử lại sau vài giây.');
  try {
    const nRow = sh.getLastRow(), nCol = sh.getLastColumn();
    const disp = sh.getRange(1, 1, nRow, nCol).getDisplayValues();
    const tiet = classSheetFind_(disp, 'TIẾT'), bai = classSheetFind_(disp, 'BÀI DẠY');
    if (!tiet || !bai) throw appError_('failed-precondition', 'Tab này không đúng mẫu FORM QUẢN LÝ LỚP.');
    const ngay = classSheetFind_(disp, 'NGÀY'), done = classSheetFind_(disp, 'ĐÃ HOÀN THÀNH');
    let nameCol = -1;
    disp[tiet.r].forEach(function (x, c) { if (nameCol < 0 && /^HỌ\s*(&|VÀ)\s*TÊN/.test(classSheetNorm_(x))) nameCol = c; });
    if (nameCol < 0) nameCol = 0;
    const firstStudent = Math.max(tiet.r, bai.r, done ? done.r : 0) + 1;

    // Cột: nằm bên phải ô nhãn TIẾT; ô TIẾT trên Sheet hoặc trống (công thức chưa hiện) hoặc đúng số tiết
    cols.forEach(function (x) {
      const c = Number(x.col);
      if (!(c > tiet.c && c < nCol)) throw appError_('invalid-argument', 'Cột tiết nằm ngoài vùng điểm danh.');
      const shown = String(disp[tiet.r][c] || '').trim();
      if (shown && shown !== String(x.tiet)) throw appError_('conflict', 'Sheet đã đổi: cột này là Tiết ' + shown + ' — bấm "Tải lại từ Sheet" rồi ghi lại.');
    });

    // Học sinh: dòng gửi lên phải đúng tên trên Sheet
    const toWrite = [];
    marks.forEach(function (x) {
      const r = Number(x.row);
      if (!(r >= firstStudent && r < nRow)) throw appError_('invalid-argument', 'Dòng học sinh ngoài vùng danh sách.');
      if (classSheetNorm_(disp[r][nameCol]) !== classSheetNorm_(x.name)) {
        throw appError_('conflict', 'Sheet đã đổi: dòng ' + (r + 1) + ' không còn là "' + x.name + '" — bấm "Tải lại từ Sheet" rồi ghi lại.');
      }
      if (!Object.prototype.hasOwnProperty.call(CLASS_MARKS_, String(x.m || ''))) throw appError_('invalid-argument', 'Ký hiệu điểm danh không hợp lệ: ' + x.m);
      toWrite.push({ r: r, v: CLASS_MARKS_[String(x.m || '')] });
    });

    let written = 0, ngayDone = false, doneDone = false;
    try {
    cols.forEach(function (x) {
      const c = Number(x.col);
      toWrite.forEach(function (w) {
        if (String(disp[w.r][c]) === w.v) return; // giống rồi — khỏi ghi
        sh.getRange(w.r + 1, c + 1).setValue(w.v);
        written++;
      });
    });

    // NGÀY: chỉ điền ô đang trống, đúng kiểu ngày như các ô bên cạnh (ô chọn ngày của điều phối)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p.ngay || ''));
    if (m && ngay) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      let fmt = 'dd.MM';
      for (let c = tiet.c + 1; c < nCol; c++) {
        const cell = sh.getRange(ngay.r + 1, c + 1);
        if (cell.getValue() instanceof Date) { fmt = cell.getNumberFormat() || fmt; break; }
      }
      cols.forEach(function (x) {
        const cell = sh.getRange(ngay.r + 1, Number(x.col) + 1);
        if (String(disp[ngay.r][Number(x.col)] || '').trim()) return;
        cell.setValue(d).setNumberFormat(fmt);
        ngayDone = true;
      });
    }

    // ĐÃ HOÀN THÀNH: ô tick (TRUE/FALSE)
    if (p.done === true && done) {
      cols.forEach(function (x) {
        if (classSheetNorm_(disp[done.r][Number(x.col)]) === 'TRUE') return;
        sh.getRange(done.r + 1, Number(x.col) + 1).setValue(true);
        doneDone = true;
      });
    }
    SpreadsheetApp.flush();
    } catch (e) {
      if (/permission|quyền/i.test(String(e && e.message))) throw appError_('permission-denied', NO_EDIT_MSG_);
      throw e;
    }
    return { written: written, ngay: ngayDone, done: doneDone };
  } finally {
    lock.releaseLock();
  }
}

// ──────────────── 49-class-books.gs ────────────────
// ====== SỔ LỚP DÙNG CHUNG THEO TRƯỜNG (diem-danh.html) ======
// Router: classBooks, classBookSave, classBookRemove (admin + giáo viên đã duyệt).
// Trước đây mỗi giáo viên tự dán link sổ của điều phối trên máy mình và classSheetWrite ghi được mọi file.
// Nay 1 người dán, cả trường dùng chung: tab SoLopTruong (file SPREADSHEET_ID_DATA), mỗi file 1 dòng gắn 1 trường.
// Máy chủ chỉ trả sổ thuộc các trường Admin đã gán trên hồ sơ (who.schools / schoolIds) → giáo viên trường khác
// không nhận được mã file, đăng nhập máy nào cũng có đủ sổ. 0 lượt Firestore ngoài xác thực (đã nhớ 1 giờ).
//
// Sổ riêng tư (classSheetRead, classSheetInfo): Sheet có ngày sinh học sinh, điều phối có thể tắt "Bất kỳ ai có đường
// liên kết" và chỉ chia sẻ cho tài khoản deploy; trang không đọc thẳng được thì đọc qua đây. Tài khoản deploy mở được cả
// file dữ liệu của hệ thống, nên 2 route này chỉ trả tab đúng mẫu FORM QUẢN LÝ LỚP và không bao giờ mở file hệ thống.

const SHEET_CLASS_BOOKS = 'SoLopTruong';
const CLASS_BOOK_HEADERS = ['FileId', 'SchoolId', 'Truong', 'TieuDe', 'Tabs', 'NguoiThem', 'CapNhat'];
const CLASS_BOOK_CACHE_KEY = 'classbooks1';
const CLASS_BOOK_CACHE_SEC = 30 * 60; // ghi sổ là xoá bản đệm; hạn ngắn phòng lượt đọc chậm đè lại bản cũ
const CLASS_BOOK_MAX_SAVE = 20;
const CLASS_READ_MAX_TABS = 30;

function classBookTab_() {
  return ensureTab_(SPREADSHEET_ID_DATA, SHEET_CLASS_BOOKS, CLASS_BOOK_HEADERS);
}

/** Mọi sổ (qua bản đệm): [{ id, schoolId, school, title, tabs, by }]. Chỉ dùng trong máy chủ — chưa lọc theo trường. */
function classBooksAll_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CLASS_BOOK_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const sheet = classBookTab_();
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 6).getDisplayValues();
  const books = rows.filter(function (r) { return r[0]; }).map(function (r) {
    let tabs = [];
    try { tabs = JSON.parse(r[4]); } catch (e) { tabs = []; }
    return { id: r[0], schoolId: r[1], school: r[2], title: r[3], tabs: tabs, by: r[5] };
  });
  const text = JSON.stringify(books);
  if (text.length < 90000) cache.put(CLASS_BOOK_CACHE_KEY, text, CLASS_BOOK_CACHE_SEC);
  return books;
}

/**
 * Sổ người gọi được thấy + các trường được gán (ô chọn trường khi thêm sổ).
 * Admin (who.schools = null) thấy mọi sổ; schools = các trường đang có sổ.
 */
function classBooks_(p, who) {
  const scope = whoSchoolIdSet_(who);
  const all = classBooksAll_();
  const names = scope ? who.schools : all.map(function (b) { return b.school; });
  return {
    all: !scope,
    schools: names.filter(function (n, i) { return names.indexOf(n) === i; }),
    books: all.filter(function (b) { return !scope || scope.has(b.schoolId); }).map(function (b) {
      return { id: b.id, school: b.school, title: b.title, tabs: b.tabs, own: b.by === who.uid };
    }),
  };
}

function cleanClassBook_(b) {
  const id = String((b && b.id) || '');
  const school = String((b && b.school) || '').trim().slice(0, 160);
  const tabs = (b && Array.isArray(b.tabs) ? b.tabs : []).slice(0, 200).map(function (t) {
    return { gid: String((t && t.gid) || '0'), name: String((t && t.name) || '').trim().slice(0, 80) };
  }).filter(function (t) { return /^\d{1,12}$/.test(t.gid) && t.name; });
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id) || !schoolIdOf_(school) || !tabs.length) {
    throw appError_('invalid-argument', 'Sổ lớp thiếu mã file, trường hoặc danh sách lớp.');
  }
  refuseSystemFile_(id);
  return { id: id, school: school, title: String((b && b.title) || 'Sổ lớp').slice(0, 200), tabs: tabs };
}

/** Dòng hiện có của từng file: { id: { row, schoolId, by } }. */
function classBookRows_(sheet) {
  const last = sheet.getLastRow();
  const out = {};
  (last < 2 ? [] : sheet.getRange(2, 1, last - 1, 6).getDisplayValues()).forEach(function (r, i) {
    if (r[0]) out[r[0]] = { row: i + 2, schoolId: r[1], by: r[5] };
  });
  return out;
}

/**
 * Thêm sổ / cập nhật danh sách lớp (giữ người thêm đầu tiên). Chỉ vào trường mình được gán;
 * file đã thuộc trường ngoài phạm vi thì từ chối, không nói là trường nào.
 * p: { books: [{ id, school, title, tabs: [{ gid, name }] }] }
 */
function classBookSave_(p, who) {
  const items = Array.isArray(p.books) ? p.books : [];
  if (!items.length || items.length > CLASS_BOOK_MAX_SAVE) throw appError_('invalid-argument', 'Mỗi lần thêm 1–' + CLASS_BOOK_MAX_SAVE + ' sổ.');
  const books = items.map(cleanClassBook_);
  const scope = whoSchoolIdSet_(who);
  books.forEach(function (b) {
    if (!inWhoScope_(who, b.school)) throw appError_('permission-denied', 'Tài khoản chưa được gán trường "' + b.school + '" — nhờ Admin gán trước.');
  });
  const sheet = classBookTab_(); // ngoài khoá: ensureTab_ có thể tự lấy khoá chung
  withRareLock_(function () {
    const rows = classBookRows_(sheet);
    // Kiểm hết trước khi ghi: 1 sổ bị từ chối thì cả lượt không đổi gì
    books.forEach(function (b) {
      if (rows[b.id] && scope && !scope.has(rows[b.id].schoolId)) throw appError_('conflict', 'Sổ này đã thuộc một trường khác.');
    });
    books.forEach(function (b) {
      const old = rows[b.id];
      const line = [asText_(b.id), asText_(schoolIdOf_(b.school)), asText_(b.school), asText_(b.title),
        asText_(JSON.stringify(b.tabs)), old ? old.by : who.uid, new Date()];
      if (old) sheet.getRange(old.row, 1, 1, line.length).setValues([line]);
      else sheet.appendRow(line);
    });
    CacheService.getScriptCache().remove(CLASS_BOOK_CACHE_KEY);
  });
  auditServer_('update_class_books', who, { saved: books.map(function (b) { return b.id; }) });
  return classBooks_(p, who);
}

/** Gỡ sổ khỏi trường: người đã thêm hoặc Admin. File trên Google không bị đụng tới. p: { id } */
function classBookRemove_(p, who) {
  const id = String(p.id || '');
  const sheet = classBookTab_();
  withRareLock_(function () {
    const old = classBookRows_(sheet)[id];
    if (!old) return;
    if (who.schools && old.by !== who.uid) throw appError_('permission-denied', 'Chỉ người đã thêm sổ hoặc Admin mới gỡ được.');
    sheet.deleteRow(old.row);
    CacheService.getScriptCache().remove(CLASS_BOOK_CACHE_KEY);
  });
  auditServer_('update_class_books', who, { removed: id });
  return classBooks_(p, who);
}

/** Ghi điểm danh chỉ vào sổ của trường người gọi được gán (Admin: mọi file). */
function requireClassBook_(who, sheetId) {
  const scope = whoSchoolIdSet_(who);
  if (!scope) return;
  const ok = classBooksAll_().some(function (b) { return b.id === String(sheetId) && scope.has(b.schoolId); });
  if (!ok) throw appError_('permission-denied', 'Sổ này không thuộc trường được gán cho tài khoản — nhờ Admin gán trường hoặc thêm sổ ở thẻ Cài đặt.');
}

function refuseSystemFile_(id) {
  if ([SPREADSHEET_ID_DATA, SPREADSHEET_ID_REPORT].concat(logSpreadsheetIds_()).indexOf(id) !== -1) {
    throw appError_('permission-denied', 'Đây không phải sổ lớp.');
  }
}

function openClassFile_(sheetId) {
  const id = String(sheetId || '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw appError_('invalid-argument', 'Mã file Sheet không hợp lệ.');
  refuseSystemFile_(id);
  try { return SpreadsheetApp.openById(id); } catch (e) {
    throw appError_('permission-denied', NO_EDIT_MSG_);
  }
}

/** Bảng hiển thị của tab nếu đúng mẫu FORM QUẢN LÝ LỚP, không thì null. */
function classTabRows_(sh) {
  const nRow = sh.getLastRow(), nCol = sh.getLastColumn();
  if (!nRow || !nCol) return null;
  const disp = sh.getRange(1, 1, nRow, nCol).getDisplayValues();
  return classSheetFind_(disp, 'TIẾT') && classSheetFind_(disp, 'BÀI DẠY') ? disp : null;
}

/** Cùng dạng /export?format=csv của Google: web phân tích và ghi theo đúng vị trí dòng/cột như đọc thẳng. */
function classRowsCsv_(rows) {
  return rows.map(function (r) {
    return r.map(function (v) { return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
  }).join('\n');
}

/** Đọc các tab lớp của 1 sổ trong phạm vi người gọi. p: { sheetId, gids: [...] } → { tabs: { gid: csv } } (tab sai mẫu bị bỏ). */
function classSheetRead_(p, who) {
  const gids = Array.isArray(p.gids) ? p.gids.map(String) : [];
  if (!gids.length || gids.length > CLASS_READ_MAX_TABS) throw appError_('invalid-argument', 'Mỗi lần đọc 1–' + CLASS_READ_MAX_TABS + ' lớp.');
  const ss = openClassFile_(p.sheetId);
  requireClassBook_(who, p.sheetId);
  const tabs = {};
  ss.getSheets().forEach(function (sh) {
    const gid = String(sh.getSheetId());
    if (gids.indexOf(gid) === -1) return;
    const rows = classTabRows_(sh);
    if (rows) tabs[gid] = classRowsCsv_(rows);
  });
  return { tabs: tabs };
}

/**
 * Thêm sổ riêng tư: web không đọc được tên file + danh sách tab nên hỏi ở đây. Chưa thuộc trường nào thì người có mã file
 * xem được tên tab; không trả nội dung lớp (phải thêm vào trường mình mới đọc được). p: { sheetId } → { title, school, tabs }
 */
function classSheetInfo_(p, who) {
  const ss = openClassFile_(p.sheetId);
  const scope = whoSchoolIdSet_(who);
  const book = classBooksAll_().filter(function (b) { return b.id === String(p.sheetId); })[0];
  if (book && scope && !scope.has(book.schoolId)) throw appError_('conflict', 'Sổ này đã thuộc một trường khác.');
  let school = '';
  const tabs = [];
  ss.getSheets().forEach(function (sh) {
    const rows = classTabRows_(sh);
    if (!rows) return;
    tabs.push({ gid: String(sh.getSheetId()), name: sh.getName() });
    const at = !school && classSheetFind_(rows, 'TRƯỜNG');
    if (at) school = String(rows[at.r][at.c + 1] || '').trim();
  });
  if (!tabs.length) throw appError_('failed-precondition', 'File này không có tab đúng mẫu FORM QUẢN LÝ LỚP.');
  return { title: ss.getName(), school: school, tabs: tabs };
}

// ──────────────── 50-reports.gs ────────────────
// ====== ROSTER / ĐIỂM / BÁO CÁO TỔNG HỢP (tab HocSinh, KetQua, TongHop) ======
// Router: getRoster, getScores, getDashboard, writeReport — chỉ admin / điều phối đào tạo.
// Điều phối chỉ thấy học sinh của các trường mình phụ trách (who.schools), giống
// firestore.rules. Trước đây các API này chạy bằng GET công khai, không cần đăng nhập.

/** Roster (tab HocSinh), lọc theo lớp và theo trường được phép xem. */
function getRoster_(lopFilter, who) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_ROSTER);
  let rows = sheetToObjects_(sheet);
  if (who && who.schools) rows = rows.filter(function (r) { return inWhoScope_(who, r.Truong); });
  if (lopFilter) rows = rows.filter(function (r) { return r.Lop === lopFilter; });
  return rows;
}

/**
 * Điểm (tab KetQua). Tab này không có cột trường → điều phối chỉ thấy điểm của học sinh
 * có MSHS nằm trong roster các trường mình phụ trách.
 */
function getScores_(lopFilter, baiThiFilter, who) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_SCORES);
  let rows = sheetToObjects_(sheet);
  if (who && who.schools) {
    const ids = new Set(getRoster_(null, who).map(function (r) { return String(r.MSHS); }));
    rows = rows.filter(function (r) { return ids.has(String(r.MSHS)); });
  }
  if (lopFilter) rows = rows.filter(function (r) { return r.Lop === lopFilter; });
  if (baiThiFilter) rows = rows.filter(function (r) { return r.BaiThi === baiThiFilter; });
  return rows;
}

/**
 * Số liệu tổng hợp tính sẵn trên server. Vai trò lấy từ tài khoản đã xác thực (trước
 * đây lấy từ tham số "role" web tự khai — ai cũng tự xưng admin được).
 */
function buildDashboardPayload_(lopFilter, who) {
  const role = who ? who.role : '';
  const scores = getScores_(lopFilter, null, who);
  const roster = getRoster_(lopFilter, who);

  const totalStudents = roster.length;
  const submitted = scores.filter(function (s) { return s.TrangThai === 'Đã nộp' || s.TrangThai === 'Hoàn thành'; });
  const completionRate = totalStudents > 0 ? submitted.length / totalStudents : 0;

  const avgScore = submitted.length > 0
    ? submitted.reduce(function (sum, s) { return sum + (Number(s.DiemSo) || 0); }, 0) / submitted.length
    : 0;

  // Phân bố điểm theo khoảng (để vẽ biểu đồ histogram/pie)
  const distribution = { '0-4': 0, '5-6': 0, '7-8': 0, '9-10': 0 };
  submitted.forEach(function (s) {
    const d = Number(s.DiemSo) || 0;
    if (d < 5) distribution['0-4']++;
    else if (d < 7) distribution['5-6']++;
    else if (d < 9) distribution['7-8']++;
    else distribution['9-10']++;
  });

  // Tỷ lệ đúng/sai theo loại câu hỏi (yêu cầu cột ChiTietLoaiCauHoi lưu JSON dạng
  // {"MultipleChoice":{"dung":8,"sai":2}, "Matching":{"dung":5,"sai":3}, ...})
  const byQuestionType = {};
  submitted.forEach(function (s) {
    if (!s.ChiTietLoaiCauHoi) return;
    let detail;
    try { detail = JSON.parse(s.ChiTietLoaiCauHoi); } catch (e) { return; }
    Object.keys(detail).forEach(function (type) {
      if (!byQuestionType[type]) byQuestionType[type] = { dung: 0, sai: 0 };
      byQuestionType[type].dung += detail[type].dung || 0;
      byQuestionType[type].sai += detail[type].sai || 0;
    });
  });

  const base = {
    totalStudents: totalStudents,
    totalSubmitted: submitted.length,
    completionRate: completionRate,
    avgScore: avgScore,
    distribution: distribution,
    byQuestionType: byQuestionType,
    byClass: groupByClass_(submitted),
  };
  if (role === 'admin') base.roster = roster; // admin cần xem/chỉnh toàn bộ danh sách
  return base;
}

function groupByClass_(submitted) {
  const map = {};
  submitted.forEach(function (s) {
    if (!map[s.Lop]) map[s.Lop] = { count: 0, totalScore: 0 };
    map[s.Lop].count++;
    map[s.Lop].totalScore += Number(s.DiemSo) || 0;
  });
  return Object.keys(map).map(function (lop) {
    return { lop: lop, soLuong: map[lop].count, diemTB: map[lop].totalScore / map[lop].count };
  });
}

/**
 * report: mảng các object (mỗi object = 1 dòng báo cáo), ví dụ:
 * [{ ngayXuat: '2026-08-13', lop: '6A1', soHS: 32, tyLeHoanThanh: 0.9, diemTB: 7.5 }, ...]
 */
function writeSummaryReport_(report) {
  if (!Array.isArray(report) || report.length === 0 || report.length > 5000) {
    throw appError_('invalid-argument', 'report rỗng, quá lớn hoặc sai định dạng');
  }
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_REPORT_SUMMARY);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const rows = report.map(function (item) {
    return headers.map(function (h) { return item[h] !== undefined ? noFormula_(item[h]) : ''; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);

  return { rowsWritten: rows.length };
}

// ──────────────── 60-maps.gs ────────────────
// ====== KHOẢNG CÁCH ĐƯỜNG BỘ (tab "🚗 Hỗ trợ xăng xe" — teaching-schedule.html) ======
// Router: mapDistance. Dùng dịch vụ Maps có sẵn của Apps Script (dữ liệu Google Maps, có
// số nhà/hẻm ở Việt Nam, không cần API key hay thẻ ngân hàng) thay cho máy chủ demo
// OpenStreetMap trước đây (giới hạn 1 lượt/giây, thiếu số nhà trong hẻm).
// Hạn mức: tài khoản Gmail thường ~1.000 lượt geocode/ngày cho cả project → mỗi người
// tối đa MAPS_MAX_PER_USER_PER_DAY lượt; kết quả giữ 6 giờ trong CacheService.

/**
 * p: { origin: địa chỉ nhà giáo viên, destination: tên trường (kèm thành phố) }
 * @returns {{km:number, matchedSchoolAddress:string, approximateHome:boolean}|null}
 *   null = không định vị được nhà hoặc trường.
 */
function mapDistance_(p, who) {
  const origin = String(p.origin || '').trim();
  const destination = String(p.destination || '').trim();
  if (!origin || !destination || origin.length > 300 || destination.length > 300) {
    throw appError_('invalid-argument', 'Thiếu hoặc quá dài: địa chỉ nhà / tên trường.');
  }

  const cache = CacheService.getScriptCache();
  const key = 'dist:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, origin + '\n' + destination));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const day = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  const quotaKey = 'mapsq:' + who.uid + ':' + day;
  const used = Number(cache.get(quotaKey) || 0);
  if (used >= MAPS_MAX_PER_USER_PER_DAY) {
    throw appError_('resource-exhausted', 'Đã tính ' + used + ' khoảng cách hôm nay — giới hạn ' +
      MAPS_MAX_PER_USER_PER_DAY + '/ngày/người để giữ hạn mức bản đồ chung. Điền tay hoặc thử lại ngày mai.');
  }
  cache.put(quotaKey, String(used + 1), 24 * 60 * 60);

  const home = geocodeVn_(origin, null);
  if (!home) return remember_(cache, key, null);
  // Tìm trường QUANH nhà giáo viên (±0,3° ≈ 33 km) — trùng tên trường giữa các quận là chuyện thường.
  const school = geocodeVn_(destination, home);
  if (!school) return remember_(cache, key, null);

  const dir = Maps.newDirectionFinder()
    .setOrigin(home.lat, home.lng)
    .setDestination(school.lat, school.lng)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .setLanguage('vi')
    .getDirections();
  if (!dir || dir.status !== 'OK' || !dir.routes.length) return remember_(cache, key, null);
  const meters = dir.routes[0].legs.reduce(function (m, leg) { return m + leg.distance.value; }, 0);

  return remember_(cache, key, {
    km: Math.round(meters / 100) / 10,
    matchedSchoolAddress: school.address,
    approximateHome: home.approximate,
  });
}

/** Geocode trong Việt Nam; `near` (toạ độ) → ưu tiên kết quả quanh điểm đó. */
function geocodeVn_(address, near) {
  const geocoder = Maps.newGeocoder().setRegion('vn').setLanguage('vi');
  if (near) geocoder.setBounds(near.lat - 0.3, near.lng - 0.3, near.lat + 0.3, near.lng + 0.3);
  const res = geocoder.geocode(address);
  if (!res || res.status !== 'OK' || !res.results.length) return null;
  const r = res.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    address: r.formatted_address,
    // Không khớp tới số nhà (chỉ tới đường/phường) → báo "xấp xỉ" như bản cũ.
    approximate: !!r.partial_match || r.geometry.location_type === 'APPROXIMATE' ||
      r.geometry.location_type === 'GEOMETRIC_CENTER',
  };
}

function remember_(cache, key, value) {
  cache.put(key, JSON.stringify(value), DEDUPE_TTL_SEC);
  return value;
}

// ──────────────── 70-github.gs ────────────────
// ====== ĐẨY DỮ LIỆU TĨNH LÊN GITHUB (image-manager.html — chỉ admin) ======
// Router: githubReadFile, githubPublish. Token GitHub nằm ở Script Properties
// (GITHUB_TOKEN) — trước đây mỗi admin dán token vào trình duyệt (localStorage), ai mở
// được máy đó là lấy được quyền ghi repo. Chỉ cho ghi dưới GITHUB_ALLOWED_PREFIXES
// (dữ liệu/ảnh), không ghi được code.

function githubToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw appError_('failed-precondition',
      'Apps Script chưa có GITHUB_TOKEN (Project Settings → Script Properties).');
  }
  return token;
}

function githubRequest_(method, path, body, accept) {
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/' + path, {
    method: method,
    contentType: 'application/json',
    payload: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: 'Bearer ' + githubToken_(), Accept: accept || 'application/vnd.github+json' },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code === 401 || code === 403) throw appError_('failed-precondition', 'GITHUB_TOKEN không hợp lệ/hết quyền (' + code + ').');
  if (code >= 300) throw appError_('internal', 'GitHub API lỗi ' + code + ': ' + res.getContentText().slice(0, 200));
  return res;
}

function checkGithubPath_(path) {
  const p = String(path || '');
  const allowed = GITHUB_ALLOWED_PREFIXES.some(function (prefix) { return p.indexOf(prefix) === 0; });
  if (!allowed || p.indexOf('..') !== -1 || p.length > 300) {
    throw appError_('invalid-argument', 'Không được ghi/đọc đường dẫn: ' + p);
  }
  return p;
}

/** Nội dung MỚI NHẤT của 1 file trên nhánh (không qua cache GitHub Pages ~10 phút). p: { path } */
function githubReadFile_(p) {
  const path = checkGithubPath_(p.path);
  const res = githubRequest_('get', 'contents/' + path.split('/').map(encodeURIComponent).join('/') +
    '?ref=' + GITHUB_BRANCH, null, 'application/vnd.github.raw+json');
  return { text: res.getContentText('UTF-8') };
}

/**
 * Đẩy nhiều file trong ĐÚNG 1 commit.
 * p: { files: [{path, content?|base64?}], message, expectedShas?: {path: sha git bản đã mở} }
 * expectedShas: file trên nhánh đã khác (người khác vừa đẩy) → dừng, mã 'conflict'.
 */
function githubPublish_(p, who) {
  const files = Array.isArray(p.files) ? p.files : [];
  if (!files.length || files.length > 200) throw appError_('invalid-argument', 'Danh sách file rỗng hoặc quá nhiều (tối đa 200).');
  files.forEach(function (f) { checkGithubPath_(f.path); });
  const out = commitFiles_(files, p.message, p.expectedShas, who);
  auditServer_('publish_questions', who, { files: files.length, sha: out.sha });
  return out;
}

/**
 * Cập nhật danh sách học sinh cho trang làm bài (data/roster/students-active.json) —
 * nút "🚀 Cập nhật cho học sinh" ở roster-manager.html. Chỉ ADMIN: file dùng chung cho mọi
 * trường, điều phối chỉ thấy học sinh trường mình → đẩy lên sẽ làm mất học sinh trường khác.
 * Chỉ ghi ĐÚNG file này và chỉ nhận nội dung đúng dạng roster.
 * p: { content: chuỗi JSON { version, generatedAt, count, students:[{school, className, name}] } }
 */
function publishRoster_(p, who) {
  const content = String(p.content || '');
  if (!content || content.length > 5 * 1024 * 1024) throw appError_('invalid-argument', 'Roster rỗng hoặc quá lớn (tối đa 5 MB).');
  let data;
  try { data = JSON.parse(content); } catch (e) { throw appError_('invalid-argument', 'Roster không phải JSON hợp lệ.'); }
  const students = data && data.students;
  const ok = Array.isArray(students) && students.length > 0 && students.every(function (s) {
    return s && typeof s.name === 'string' && typeof s.className === 'string' && typeof s.school === 'string';
  });
  if (!ok) throw appError_('invalid-argument', 'Roster sai cấu trúc (cần students: [{school, className, name}]).');
  const out = commitFiles_([{ path: ROSTER_STATIC_PATH, content: content }],
    'chore(roster): cập nhật danh sách học sinh (' + students.length + ' em)', null, who);
  auditServer_('publish_roster', who, { students: students.length, sha: out.sha });
  return out;
}

/** Ghi nhiều file trong ĐÚNG 1 commit (dùng chung cho câu hỏi + roster). */
function commitFiles_(files, messageText, expectedShas, who) {
  // Khoá RIÊNG (user lock — Web App chạy dưới 1 tài khoản nên dùng chung cho mọi lượt gọi),
  // không dùng script lock của bài nộp: đẩy GitHub mất vài chục giây, học sinh nộp bài
  // lúc đó không được phải chờ. 2 admin bấm đẩy cùng lúc → lần lượt, không ghi đè nhau.
  const lock = LockService.getUserLock();
  lock.waitLock(30000);
  try {
    const ref = JSON.parse(githubRequest_('get', 'git/ref/heads/' + GITHUB_BRANCH).getContentText());
    const baseCommitSha = ref.object.sha;
    const baseTreeSha = JSON.parse(githubRequest_('get', 'git/commits/' + baseCommitSha).getContentText()).tree.sha;

    const expected = expectedShas || {};
    const expectedPaths = Object.keys(expected).filter(function (k) { return expected[k]; });
    if (expectedPaths.length) {
      const tree = JSON.parse(githubRequest_('get', 'git/trees/' + baseTreeSha + '?recursive=1').getContentText());
      const current = {};
      (tree.tree || []).forEach(function (t) { current[t.path] = t.sha; });
      const changed = expectedPaths.filter(function (k) { return current[k] && current[k] !== expected[k]; });
      if (changed.length) throw appError_('conflict', 'Dữ liệu trên GitHub đã thay đổi sau khi bạn mở trang: ' + changed.join(', '));
    }

    const treeItems = files.map(function (f) {
      const blob = f.base64 != null
        ? { content: String(f.base64), encoding: 'base64' }
        : { content: String(f.content || ''), encoding: 'utf-8' };
      const sha = JSON.parse(githubRequest_('post', 'git/blobs', blob).getContentText()).sha;
      return { path: f.path, mode: '100644', type: 'blob', sha: sha };
    });
    const newTree = JSON.parse(githubRequest_('post', 'git/trees', { base_tree: baseTreeSha, tree: treeItems }).getContentText());
    const message = String(messageText || 'chore(data): cập nhật từ trang quản lý').slice(0, 500) +
      '\n\nĐẩy qua Apps Script bởi tài khoản ' + who.uid;
    const commit = JSON.parse(githubRequest_('post', 'git/commits',
      { message: message, tree: newTree.sha, parents: [baseCommitSha] }).getContentText());
    githubRequest_('patch', 'git/refs/heads/' + GITHUB_BRANCH, { sha: commit.sha });
    return { sha: commit.sha };
  } finally {
    lock.releaseLock();
  }
}

// ──────────────── 75-roster-codes.gs ────────────────
// ====== DANH SÁCH LỚP THEO MÃ (chế độ EduBackend.roster.mode = 'class-code') ======
// Router: publishRosterCodes (Admin), rosterByCode (công khai — học sinh không đăng nhập).
// Thay cho file công khai data/roster/students-active.json (ai có URL cũng tải được tên MỌI học
// sinh — docs/architecture/AUDIT-2.0.md §5.1): mỗi lớp 1 mã 6 ký tự ngẫu nhiên, giáo viên phát cho
// lớp; nhập đúng mã mới thấy tên của ĐÚNG lớp đó. 32^6 ≈ 1 tỉ mã → không dò được.
// Tab MaLop (file SPREADSHEET_ID_DATA): 1 dòng/lớp. Đẩy lại roster giữ nguyên mã lớp cũ.

const SHEET_ROSTER_CODES = 'MaLop';
const ROSTER_CODE_HEADERS = ['MaLop', 'Truong', 'Lop', 'SoHocSinh', 'DanhSach', 'CapNhat'];
const ROSTER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 ký tự, bỏ I O 0 1 (dễ đọc nhầm)
const ROSTER_CODE_LEN = 6;
// Dữ liệu chỉ đổi khi Admin đẩy roster (lúc đó xoá + nạp lại) → giữ tối đa của CacheService (6 giờ)
const ROSTER_CODE_CACHE_SEC = 6 * 60 * 60;
const ROSTER_CODE_MISS_SEC = 10 * 60;

function normalizeRosterCode_(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Mã mới chưa dùng — lấy từ Utilities.getUuid() (ngẫu nhiên v4), 256 % 32 = 0 nên phân bố đều. */
function newRosterCode_(taken) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const hex = Utilities.getUuid().replace(/-/g, '');
    let code = '';
    for (let i = 0; i < ROSTER_CODE_LEN; i++) code += ROSTER_CODE_ALPHABET.charAt(parseInt(hex.substr(i * 2, 2), 16) % 32);
    if (!taken.has(code)) return code;
  }
  throw appError_('internal', 'Không tạo được mã lớp mới.');
}

function rosterCodeKey_(school, className) {
  return schoolIdOf_(school) + '|' + String(className || '').trim().toLowerCase();
}

/**
 * Admin đẩy roster (cùng nội dung với publishRoster_) → cấp/giữ mã từng lớp, ghi tab MaLop.
 * p: { content: chuỗi JSON { students:[{school, className, name}] } }
 * @returns {{ classes: Array<{code, school, className, count}>, students: number }}
 */
function publishRosterCodes_(p, who) {
  const content = String(p.content || '');
  if (!content || content.length > 5 * 1024 * 1024) throw appError_('invalid-argument', 'Roster rỗng hoặc quá lớn (tối đa 5 MB).');
  let data;
  try { data = JSON.parse(content); } catch (e) { throw appError_('invalid-argument', 'Roster không phải JSON hợp lệ.'); }
  const students = data && data.students;
  const ok = Array.isArray(students) && students.length > 0 && students.every(function (s) {
    return s && typeof s.name === 'string' && typeof s.className === 'string' && typeof s.school === 'string';
  });
  if (!ok) throw appError_('invalid-argument', 'Roster sai cấu trúc (cần students: [{school, className, name}]).');

  const groups = {};
  students.forEach(function (s) {
    const name = s.name.trim();
    if (!name || !s.className.trim() || !s.school.trim()) return;
    const key = rosterCodeKey_(s.school, s.className);
    const g = groups[key] = groups[key] || { school: s.school.trim(), className: s.className.trim(), names: {} };
    g.names[name] = true;
  });

  return withRareLock_(function () {
    const sheet = ensureTab_(SPREADSHEET_ID_DATA, SHEET_ROSTER_CODES, ROSTER_CODE_HEADERS);
    const last = sheet.getLastRow();
    const old = last > 1 ? sheet.getRange(2, 1, last - 1, 3).getDisplayValues() : [];
    const codeByKey = {};
    const taken = new Set();
    old.forEach(function (r) {
      const code = normalizeRosterCode_(r[0]);
      if (!code) return;
      taken.add(code);
      codeByKey[rosterCodeKey_(r[1], r[2])] = code;
    });

    const now = new Date();
    const rows = Object.keys(groups).sort().map(function (key) {
      const g = groups[key];
      const code = codeByKey[key] || newRosterCode_(taken);
      taken.add(code);
      const names = Object.keys(g.names).sort(function (a, b) { return a.localeCompare(b, 'vi'); });
      return [code, noFormula_(g.school), noFormula_(g.className), names.length, JSON.stringify(names), now];
    });

    if (last > 1) sheet.getRange(2, 1, last - 1, ROSTER_CODE_HEADERS.length).clearContent();
    if (rows.length) sheet.getRange(2, 1, rows.length, ROSTER_CODE_HEADERS.length).setValues(rows);
    // Bỏ bản đệm của mọi mã cũ + mới (lớp đổi danh sách / bị bỏ), rồi nạp sẵn mã đang dùng
    const cache = CacheService.getScriptCache();
    cache.removeAll([].concat.apply([], Array.from(taken).map(function (code) { return ['rc:' + code, 'rcx:' + code]; })));
    warmRosterCodes_(rows.map(function (r) {
      return [r[0], String(r[1]).replace(/^'/, ''), String(r[2]).replace(/^'/, ''), r[3], r[4]];
    }));

    const total = rows.reduce(function (n, r) { return n + r[3]; }, 0);
    auditServer_('publish_roster', who, { mode: 'class-code', classes: rows.length, students: total });
    return {
      students: total,
      classes: rows.map(function (r) { return { code: r[0], school: String(r[1]).replace(/^'/, ''), className: String(r[2]).replace(/^'/, ''), count: r[3] }; }),
    };
  });
}

/**
 * Nạp bản đệm cho MỌI lớp cùng lúc. Đầu giờ cả lớp (hoặc nhiều lớp) cùng nhập mã: nếu mỗi lượt
 * trượt bản đệm tự mở Sheet (~1–2 giây) thì vài chục lượt có thể chiếm hết 30 lượt chạy song song
 * của Apps Script — bài nộp của lớp khác bị từ chối đúng lúc đó. Nay 1 lượt đọc nạp cả bảng.
 * rows: [[mã, trường, lớp, số HS, danh sách JSON], ...] (giá trị hiển thị).
 * @returns {Object} { mã: {school, className, names} }
 */
function warmRosterCodes_(rows) {
  const byCode = {};
  const put = {};
  rows.forEach(function (r) {
    const code = normalizeRosterCode_(r[0]);
    if (!code) return;
    let names = [];
    try { names = JSON.parse(r[4]); } catch (e) { names = []; }
    byCode[code] = { school: r[1], className: r[2], names: Array.isArray(names) ? names : [] };
    put['rc:' + code] = JSON.stringify(byCode[code]);
  });
  const keys = Object.keys(put);
  for (let i = 0; i < keys.length; i += 500) { // putAll tối đa ~1.000 khoá / lần
    const chunk = {};
    keys.slice(i, i + 500).forEach(function (k) { chunk[k] = put[k]; });
    CacheService.getScriptCache().putAll(chunk, ROSTER_CODE_CACHE_SEC);
  }
  return byCode;
}

/** Công khai: mã lớp → { school, className, names }. Mã sai → not-found (không lộ mã nào tồn tại). */
function rosterByCode_(p) {
  const code = normalizeRosterCode_(p.code);
  if (code.length !== ROSTER_CODE_LEN || /[^A-Z2-9]|[IO]/.test(code)) throw appError_('invalid-argument', 'Mã lớp gồm 6 chữ/số, ví dụ K7P2QX.');
  const cache = CacheService.getScriptCache();
  const hit = cache.get('rc:' + code);
  if (hit) return JSON.parse(hit);
  // Mã gõ sai vừa tra → không mở Sheet lại (đẩy roster mới xoá dấu này)
  if (cache.get('rcx:' + code)) throw appError_('not-found', 'Không tìm thấy lớp với mã này.');

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_ROSTER_CODES);
  const last = sheet ? sheet.getLastRow() : 0;
  const all = last < 2 ? {} : warmRosterCodes_(sheet.getRange(2, 1, last - 1, 5).getDisplayValues());
  if (all[code]) return all[code];
  cache.put('rcx:' + code, '1', ROSTER_CODE_MISS_SEC);
  throw appError_('not-found', 'Không tìm thấy lớp với mã này.');
}

// ──────────────── 77-grading.gs ────────────────
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

// ──────────────── 78-ai.gs ────────────────
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
  // AI Sư Phụ: dùng CHÍNH js/techrealm/mentor-core.js (chép nguyên văn vào Code.gs) — câu lệnh giống hệt trình duyệt.
  if (typeof EduMentor !== 'undefined' && Object.prototype.hasOwnProperty.call(EduMentor.TASKS, task)) {
    try { return EduMentor.build(task, payload); } catch (e) { throw appError_('invalid-argument', e.message); }
  }
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
  if (hit) { aiLog_('dung-dem', task, ident, b.user.length, hit.length); return { text: hit, cached: true }; }

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
  let text;
  try { text = aiCallGemini_(key, model, b); } catch (e) { aiLog_('loi:' + (e.code || 'khac'), task, ident, b.user.length, 0); throw e; }
  if (!text) throw appError_('ai-empty', 'Gemini không trả về nội dung — thử lại.');
  aiLog_('ok', task, ident, b.user.length, text.length);
  cache.put(mineKey, String(mine + 1), AI_CACHE_SEC);
  props.setProperty('AI_COUNT', day + ':' + (used + 1));
  if (text.length < 90000) cache.put(ck, text, AI_CACHE_SEC);
  return { text: text, cached: false, model: model };
}

/** Công khai (học sinh không đăng nhập): chỉ việc nhẹ, có mã máy để đếm lượt. */
function aiIsMentor_(task, list) { return typeof EduMentor !== 'undefined' && EduMentor[list].indexOf(task) >= 0; }
function aiAsk_(p) {
  if (AI_PUBLIC_TASKS.indexOf(p.task) < 0 && !aiIsMentor_(p.task, 'PUBLIC_TASKS')) throw appError_('permission-denied', 'Việc AI này cần đăng nhập tài khoản giáo viên.');
  const cid = String(p.cid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  if (cid.length < 8) throw appError_('invalid-argument', 'Thiếu mã máy.');
  return aiRun_(p.task, p.payload, 'c:' + cid, AI_CLIENT_MAX);
}
/** Tài khoản quản trị: mọi việc AI. */
function aiAskStaff_(p, who) {
  if (AI_PUBLIC_TASKS.indexOf(p.task) < 0 && AI_STAFF_TASKS.indexOf(p.task) < 0 && !aiIsMentor_(p.task, 'PUBLIC_TASKS') && !aiIsMentor_(p.task, 'STAFF_TASKS')) throw appError_('invalid-argument', 'Việc AI không hợp lệ: ' + p.task);
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

// ====== NHẬT KÝ AI + BÁO LỖI (Prompt 07 §4) ======
// Tab NhatKyAI: 1 dòng/lượt gọi — KHÔNG lưu nội dung câu hỏi/trả lời, KHÔNG lưu mã máy/uid thô (chỉ 10 ký tự băm).
// Ghi nhật ký không bao giờ làm hỏng lượt AI (lỗi ghi thì bỏ qua).
const AI_LOG_TAB = 'NhatKyAI';
const AI_LOG_HEADERS = ['ThoiGian', 'Loai', 'Viec', 'NguoiDung', 'SoKyTuHoi', 'SoKyTuTraLoi', 'GhiChu'];
const AI_REPORT_REASONS = ['sai-kien-thuc', 'lo-dap-an', 'khong-phu-hop', 'khac'];
const AI_REPORT_MAX = 10;
function aiIdentHash_(ident) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(ident))).slice(0, 10);
}
function aiLog_(kind, task, ident, inChars, outChars, note) {
  try {
    logTab_(AI_LOG_TAB, AI_LOG_HEADERS).appendRow([new Date(), kind, task, aiIdentHash_(ident), inChars || 0, outChars || 0, asText_(String(note || '').slice(0, 300))]);
  } catch (e) { /* nhật ký là phụ — không chặn lượt AI */ }
}
/** Công khai: học sinh / giáo viên báo một câu trả lời AI có vấn đề. Giới hạn 10 lần/ngày/máy. Ghi chú được lọc thông tin cá nhân. */
function aiReport_(p) {
  const cid = String(p.cid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  if (cid.length < 8) throw appError_('invalid-argument', 'Thiếu mã máy.');
  const reason = AI_REPORT_REASONS.indexOf(p.reason) >= 0 ? p.reason : 'khac';
  const task = String(p.task || '').replace(/[^A-Za-z]/g, '').slice(0, 30);
  const cache = CacheService.getScriptCache();
  const k = 'aiR:' + aiDay_() + ':' + cid;
  const n = Number(cache.get(k)) || 0;
  if (n >= AI_REPORT_MAX) throw appError_('ai-limit', 'Đã gửi đủ ' + AI_REPORT_MAX + ' báo lỗi hôm nay trên máy này.');
  cache.put(k, String(n + 1), AI_CACHE_SEC);
  const note = typeof EduMentor !== 'undefined' ? EduMentor.scrubPII(String(p.note || '').slice(0, 300)).text : '';
  aiLog_('bao-loi:' + reason, task, 'c:' + cid, 0, 0, note);
  return { ok: true };
}

// ──────────────── 79-tr-ledger.gs ────────────────
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

// ──────────────── 80-sheet-setup.gs ────────────────

// ====== MENU TÙY CHỈNH TRÊN GOOGLE SHEET ======
// Tự động thêm menu "🎯 Công cụ IC3" mỗi khi mở file Sheet.
// Chỉ cần bấm menu, không cần vào Apps Script editor.
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎯 Công cụ IC3')
    .addItem('🎨 Định dạng HocSinh', 'setupHocSinhFormatting_')
    .addItem('🎨 Định dạng KetQua', 'setupKetQuaFormatting_')
    .addItem('🎨 Định dạng NhatKyNopBai', 'setupNhatKyNopBaiFormatting_')
    .addItem('🎨 Định dạng TongHop', 'setupTongHopFormatting_')
    .addItem('📊 Cập nhật bảng Thống Kê + biểu đồ', 'setupThongKeSheet_')
    .addSeparator()
    .addItem('🚀 Chạy tất cả', 'runAllSetup_')
    .addItem('🩺 Kiểm tra sau khi deploy', 'kiemTraSauDeploy')
    .addToUi();
}

function runAllSetup_() {
  setupHocSinhFormatting_();
  setupKetQuaFormatting_();
  setupNhatKyNopBaiFormatting_();
  setupTongHopFormatting_();
  setupThongKeSheet_();
  SpreadsheetApp.getUi().alert('✅ Đã định dạng toàn bộ 4 sheet và cập nhật ThongKe + biểu đồ.');
}

// ====== ĐỊNH DẠNG SHEET HOC SINH ======
// Cột: A MSHS | B HoTen | C Lop | D Truong | E Email
function setupHocSinhFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_ROSTER);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_ROSTER + '"');

  const lastCol = 5; // A..E
  const maxRows = 2000;

  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  sheet.getBandings().forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  sheet.autoResizeColumns(1, lastCol);

  // Cảnh báo trùng MSHS (mã học sinh không được trùng nhau)
  const idRange = sheet.getRange(2, 1, maxRows - 1, 1);
  const rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"", COUNTIF($A$2:$A,$A2)>1)')
    .setBackground('#f4cccc').setFontColor('#990000').setBold(true)
    .setRanges([idRange]).build());
  sheet.setConditionalFormatRules(rules);

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== ĐỊNH DẠNG SHEET KET QUA ======
// Cột: A Timestamp | B MSHS | C HoTen | D Lop | E BaiThi | F DiemSo |
//      G ThoiGianLamPhut | H TrangThai | I ChiTietLoaiCauHoi(JSON)
function setupKetQuaFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_SCORES);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_SCORES + '"');

  const lastCol = 9; // A..I
  const maxRows = 3000;

  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(3); // luôn thấy Timestamp, MSHS, HoTen khi cuộn ngang

  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  sheet.getBandings().forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  sheet.autoResizeColumns(1, lastCol);

  // Timestamp (A) hiển thị ngày giờ
  sheet.getRange(2, 1, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  // DiemSo (F) căn giữa
  sheet.getRange(2, 6, maxRows - 1, 1).setHorizontalAlignment('center');

  const rules = [];

  // Thang màu điểm số theo min/max thực tế trong dữ liệu (không cố định 0-10 hay 0-100)
  const diemRange = sheet.getRange(2, 6, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.MAX, '')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.PERCENT, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.MIN, '')
    .setRanges([diemRange]).build());

  // TrangThai (H): Đã nộp/Hoàn thành → xanh, còn lại (Chưa nộp...) → xám nhạt
  const statusRange = sheet.getRange(2, 8, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Hoàn thành')
    .setBackground('#d9ead3').setFontColor('#274e13')
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Đã nộp')
    .setBackground('#d9ead3').setFontColor('#274e13')
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Chưa nộp')
    .setBackground('#f3f3f3').setFontColor('#666666')
    .setRanges([statusRange]).build());

  sheet.setConditionalFormatRules(rules);

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== ĐỊNH DẠNG SHEET TONG HOP ======
// Cột: A NgayXuat | B Lop | C SoHocSinh | D TyLeHoanThanh | E DiemTB
function setupTongHopFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_REPORT_SUMMARY);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_REPORT_SUMMARY + '"');

  const lastCol = 5; // A..E
  const maxRows = 2000;

  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  sheet.getBandings().forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  sheet.autoResizeColumns(1, lastCol);

  // NgayXuat (A) dạng ngày, TyLeHoanThanh (D) dạng %, DiemTB (E) 1 số thập phân
  sheet.getRange(2, 1, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(2, 4, maxRows - 1, 1).setNumberFormat('0%').setHorizontalAlignment('center');
  sheet.getRange(2, 5, maxRows - 1, 1).setNumberFormat('0.0').setHorizontalAlignment('center');

  const rules = [];
  const tyLeRange = sheet.getRange(2, 4, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.MAX, '')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.PERCENT, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.MIN, '')
    .setRanges([tyLeRange]).build());

  const diemTbRange = sheet.getRange(2, 5, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.MAX, '')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.PERCENT, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.MIN, '')
    .setRanges([diemTbRange]).build());

  sheet.setConditionalFormatRules(rules);

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== ĐỊNH DẠNG SHEET NHẬT KÝ NỘP BÀI ======
// Cột: A SubmissionId | B HoTen | C Lop | D Truong | E BaiThi | F Diem |
//      G SoCauDung | H ThoiGianLam | I SoLanChuyenTab | J SoLanClick |
//      K TrangThai | L ThoiDiemNop | M GhiChu
function setupNhatKyNopBaiFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_SUBMISSION_LOG);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_SUBMISSION_LOG + '"');

  const lastCol = LOG_HEADERS.length; // A..N
  const maxRows = 2000; // đủ dùng lâu dài, chỉnh nếu cần nhiều hơn

  // --- Header: bold, nền màu, chữ trắng, freeze ---
  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2); // luôn thấy SubmissionId + HoTen khi cuộn ngang

  // --- Băng màu xen kẽ cho dễ đọc ---
  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  const existingBandings = sheet.getBandings();
  existingBandings.forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  // --- Autosize cột ---
  sheet.autoResizeColumns(1, lastCol);

  // --- Format cột Điểm (F) là số nguyên căn giữa ---
  sheet.getRange(2, 6, maxRows - 1, 1).setNumberFormat('0').setHorizontalAlignment('center');

  // --- Format cột ThoiGianNop (L): giờ trước, ngày/tháng kiểu Việt Nam (khớp các dòng cũ) ---
  sheet.getRange('L2:L').setNumberFormat('HH:mm:ss d/M/yyyy');
  if (sheet.getRange(1, lastCol).getValue() === '') sheet.getRange(1, lastCol).setValue(LOG_HEADERS[lastCol - 1]);

  // --- Xoá rule cũ, thêm Conditional Formatting mới ---
  const rules = [];

  // 1) Cột TrangThai (K): "OK" → xanh lá, còn lại (gian lận/nghi vấn) → đỏ cam
  const statusRange = sheet.getRange(2, 11, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('OK')
    .setBackground('#d9ead3').setFontColor('#274e13')
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('⚠️')
    .setBackground('#f4cccc').setFontColor('#990000').setBold(true)
    .setRanges([statusRange]).build());

  // 2) Cột Điểm (F): thang màu đỏ→vàng→xanh theo điểm 0-100
  const diemRange = sheet.getRange(2, 6, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.NUMBER, '100')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.NUMBER, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setRanges([diemRange]).build());

  // 3) Cột SoLanChuyenTab (I): >3 lần chuyển tab → tô cam cảnh báo khả nghi
  const tabSwitchRange = sheet.getRange(2, 9, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(3)
    .setBackground('#fce5cd').setFontColor('#b45f06').setBold(true)
    .setRanges([tabSwitchRange]).build());

  sheet.setConditionalFormatRules(rules);

  // --- Bật bộ lọc trên hàng tiêu đề ---
  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  // --- Kẻ viền nhẹ toàn bộ vùng dữ liệu đang có ---
  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== SHEET THỐNG KÊ + BIỂU ĐỒ (tự cập nhật bằng công thức sống) ======
function setupThongKeSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT);
  let sheet = ss.getSheetByName('ThongKe');
  if (!sheet) {
    sheet = ss.insertSheet('ThongKe');
  } else {
    sheet.getCharts().forEach(c => sheet.removeChart(c));
    sheet.clear();
  }

  const src = SHEET_SUBMISSION_LOG; // 'NhatKyNopBai'

  // --- Tiêu đề ---
  sheet.getRange('A1').setValue('📊 THỐNG KÊ THEO LỚP (tự động cập nhật)')
    .setFontWeight('bold').setFontSize(14);

  // --- Bảng tổng hợp theo lớp bằng QUERY, tự cập nhật khi NhatKyNopBai có dữ liệu mới ---
  sheet.getRange('A3').setFormula(
    '=IFERROR(QUERY(' + src + '!C2:F,' +
    '"select C, count(F), avg(F) where C is not null group by C label count(F) \'SoLuotNop\', avg(F) \'DiemTB\'"),' +
    '"Chưa có dữ liệu")'
  );
  sheet.getRange('A3').setFontWeight('bold');

  // --- Số lượt nghi vấn gian lận theo lớp (TrangThai chứa ⚠️) ---
  sheet.getRange('F3').setValue('Lớp');
  sheet.getRange('G3').setValue('Số lượt nghi vấn');
  sheet.getRange('F3:G3').setFontWeight('bold').setBackground('#f4cccc');
  sheet.getRange('F4').setFormula(
    '=IFERROR(QUERY(' + src + '!C2:K,' +
    '"select C, count(K) where K contains \'⚠️\' group by C label count(K) \'\'"),"")'
  );

  // --- Tổng quan toàn trường ---
  sheet.getRange('A20').setValue('Tổng số bài đã nộp:').setFontWeight('bold');
  sheet.getRange('B20').setFormula('=COUNTA(' + src + '!A2:A)-COUNTBLANK(' + src + '!A2:A)');
  sheet.getRange('A21').setValue('Điểm trung bình toàn trường:').setFontWeight('bold');
  sheet.getRange('B21').setFormula('=IFERROR(AVERAGE(' + src + '!F2:F),0)');
  sheet.getRange('A22').setValue('Tổng số lượt nghi vấn gian lận:').setFontWeight('bold');
  sheet.getRange('B22').setFormula('=IFERROR(COUNTIF(' + src + '!K2:K,"*⚠️*"),0)');

  sheet.autoResizeColumns(1, 8);

  // --- Biểu đồ cột: điểm TB theo lớp ---
  SpreadsheetApp.flush(); // đảm bảo QUERY đã tính xong trước khi vẽ chart
  const chart1 = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange('A3:A100'))
    .addRange(sheet.getRange('C3:C100'))
    .setPosition(5, 1, 0, 0)
    .setOption('title', 'Điểm trung bình theo lớp')
    .setOption('legend', { position: 'none' })
    .setOption('colors', ['#1a73e8'])
    .build();
  sheet.insertChart(chart1);

  // --- Biểu đồ tròn: số lượt nghi vấn theo lớp ---
  const chart2 = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange('F4:G20'))
    .setPosition(5, 10, 0, 0)
    .setOption('title', 'Tỷ lệ nghi vấn gian lận theo lớp')
    .build();
  sheet.insertChart(chart2);
}

// ──────────────── 90-utils.gs ────────────────

// ====== TIỆN ÍCH ======

function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nameKey_(s) { return String(s || '').trim().toLowerCase(); }

// Tên trường → schoolId. PHẢI giống js/models/school.model.js → schoolIdOf (test code-gs so 2 bản).
const SCHOOL_ID_MEMO_ = {};
function schoolIdOf_(name) {
  const key = String(name || '');
  if (!(key in SCHOOL_ID_MEMO_)) {
    SCHOOL_ID_MEMO_[key] = key
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  return SCHOOL_ID_MEMO_[key];
}

/** schoolId người gọi được xem: "schoolIds" trên hồ sơ + suy từ "schools" (tên). null = mọi trường (admin). */
function whoSchoolIdSet_(who) {
  if (!who || !who.schools) return null;
  return new Set((who.schoolIds || []).concat(who.schools.map(schoolIdOf_)).filter(Boolean));
}

/** Bản ghi có tên trường `schoolName` nằm trong phạm vi người gọi (so theo schoolId). */
function inWhoScope_(who, schoolName) {
  const set = whoSchoolIdSet_(who);
  return !set || set.has(schoolIdOf_(schoolName));
}

/** Chặn chuỗi bị Sheet hiểu thành công thức (= + - @) nhưng giữ số/ngày như cũ. */
function noFormula_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

/**
 * Khoá chung CHỈ cho việc hiếm (tạo tab, cắt cột, xoay vòng file) — KHÔNG bọc appendRow.
 * appendRow của Apps Script tự nguyên tử (không 2 lượt ghi đè cùng 1 dòng), nên bài nộp ghi
 * song song tới trần 30 lượt chạy/tài khoản. Trước 10/2026 mỗi bài nộp giữ khoá này suốt lúc
 * mở file + đếm dòng + appendRow (~0,5–1 giây) → cả hệ thống chỉ ghi được ~1–2 bài/giây,
 * cuối tiết nhiều lớp cùng nộp thì xếp hàng chờ khoá 20 giây rồi lỗi, học sinh phải gửi lại.
 */
function withRareLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Tab `name` trong file `spreadsheetId`; chưa có thì tạo kèm dòng tiêu đề (in đậm, cố định). */
function ensureTab_(spreadsheetId, name, headers) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    // 2 lượt cùng thấy thiếu tab → lượt sau insertSheet báo "đã có" → tạo trong khoá, xem lại tên
    sheet = withRareLock_(function () {
      let s = ss.getSheetByName(name);
      if (s) return s;
      s = ss.insertSheet(name);
      s.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      s.setFrozenRows(1);
      return s;
    });
  }
  trimColumnsOnce_(sheet, headers.length);
  return sheet;
}

// ====== TRẦN 10 TRIỆU Ô / FILE ======
// Google Sheet tính CẢ Ô TRỐNG vào trần 10 triệu ô mỗi file. Tab mới mặc định 26 cột →
// tab nhật ký 300.000 dòng thật ra chiếm 7,8 triệu ô (không phải 300.000 × 16), và các tab
// nhật ký khác (MOS, hoạt động, Đấu trường) cùng nằm trong file chính → file đầy trước khi
// kịp xoay vòng, mọi lần ghi sau đó báo lỗi. Nay: cắt cột trống thừa + xoay vòng theo TỔNG
// số ô của cả file (FILE_CELL_BUDGET), áp dụng cho mọi tab nhật ký.
const FILE_CELL_BUDGET = 8000000; // chừa 2 triệu ô cho tab khác + phần tăng giữa 2 lần đo

/** Xoá cột trống phía sau `n` cột dữ liệu (tối đa 1 lần/6 giờ mỗi tab — cờ trong cache). */
function trimColumnsOnce_(sheet, n) {
  const cache = CacheService.getScriptCache();
  const flag = 'trim:' + sheet.getParent().getId() + ':' + sheet.getName();
  if (cache.get(flag)) return;
  withRareLock_(function () { // 2 lượt cùng xoá cột → lượt sau xoá vượt số cột còn lại, báo lỗi
    if (cache.get(flag)) return;
    const max = sheet.getMaxColumns();
    if (max > n) sheet.deleteColumns(n + 1, max - n);
    cache.put(flag, '1', DEDUPE_TTL_SEC);
  });
}

/** Tổng số ô (kể cả trống) của file — đo lại tối đa 15 phút/lần (getSheets tốn thời gian). */
function fileCells_(ss) {
  const cache = CacheService.getScriptCache();
  const key = 'cells:' + ss.getId();
  const hit = cache.get(key);
  if (hit) return Number(hit);
  const n = ss.getSheets().reduce(function (sum, sh) { return sum + sh.getMaxRows() * sh.getMaxColumns(); }, 0);
  cache.put(key, String(n), 900);
  return n;
}

/** Tab nhật ký đầy (quá MAX_LOG_ROWS dòng) hoặc file chứa nó sắp chạm trần ô → cần file mới. */
function logTabFull_(sheet) {
  return sheet.getLastRow() >= MAX_LOG_ROWS || fileCells_(sheet.getParent()) >= FILE_CELL_BUDGET;
}

/** Tạo file mới chỉ có 1 tab `name` (đúng số cột), ghi vào DanhMucNhatKy của file chính. */
function newLogFile_(name, headers) {
  const stamp = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm');
  const file = SpreadsheetApp.create(name + ' ' + stamp);
  const fresh = file.getSheets()[0].setName(name);
  fresh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  fresh.setFrozenRows(1);
  const max = fresh.getMaxColumns();
  if (max > headers.length) fresh.deleteColumns(headers.length + 1, max - headers.length);
  const main = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT);
  const catalog = main.getSheetByName(SHEET_LOG_CATALOG) || main.insertSheet(SHEET_LOG_CATALOG);
  if (catalog.getLastRow() === 0) catalog.appendRow(['TaoLuc', 'TenFile', 'DuongDan']);
  catalog.appendRow([new Date(), file.getName(), file.getUrl()]);
  return { file: file, sheet: fresh };
}

/**
 * Tab nhật ký phụ (NhatKyMOS, NhatKyHoatDong, NhatKyDauTruong...) để appendRow: nằm ở file
 * chính cho tới khi đầy, rồi tự chuyển sang file riêng "<tên tab> <ngày giờ>" (Script
 * Property LOGFILE_<tên tab>, đọc qua cache). Bài nộp IC3 có hàm riêng getSubmissionLogSheet_.
 */
function logTab_(name, headers) {
  const key = 'LOGFILE_' + name;
  const fileId = cachedProp_(key) || SPREADSHEET_ID_REPORT;
  const sheet = ensureTab_(fileId, name, headers);
  if (!logTabFull_(sheet)) return sheet;
  return withRareLock_(function () {
    // Lượt khác có thể vừa xoay file trong lúc chờ khoá → ghi tiếp vào file đó, không tạo thêm
    const now = cachedProp_(key) || SPREADSHEET_ID_REPORT;
    if (now !== fileId) return ensureTab_(now, name, headers);
    const made = newLogFile_(name, headers);
    setCachedProp_(key, made.file.getId());
    return made.sheet;
  });
}

/**
 * Script Property đọc qua CacheService. PropertiesService của tài khoản Gmail thường chỉ
 * cho 50.000 lượt đọc/ghi MỖI NGÀY — trước đây MỖI bài nộp đọc LOG_SPREADSHEET_ID (và mỗi
 * lần dashboard tải đọc lịch sử file nhật ký) → mùa thi 100.000 bài/ngày vượt trần, Apps
 * Script báo lỗi quota cho mọi bài nộp sau đó. CacheService không giới hạn lượt; hết hạn /
 * bị dọn thì đọc lại Properties 1 lần. Giá trị null lưu thành '\u0000'.
 */
function cachedProp_(key) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('prop:' + key);
  if (hit !== null && hit !== undefined) return hit === '\u0000' ? null : hit;
  const v = PropertiesService.getScriptProperties().getProperty(key);
  cache.put('prop:' + key, v === null || v === undefined ? '\u0000' : v, DEDUPE_TTL_SEC);
  return v === undefined ? null : v;
}

/** Ghi Script Property + cập nhật luôn bản trong cache (các lượt chạy khác thấy ngay). */
function setCachedProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
  CacheService.getScriptCache().put('prop:' + key, value, DEDUPE_TTL_SEC);
}

// ──────────────── 95-selftest.gs ────────────────
// ====== KIỂM TRA SAU KHI DEPLOY (chạy tay trong editor hoặc menu 🎯 Công cụ IC3) ======
// Dán apps/Code.gs mới → Save → chọn hàm kiemTraSauDeploy → Run → xem "Execution log".
// Ghi 1 bài nộp MẪU (mã SELFTEST...), đọc lại qua listResults_ để chắc cột P ChiTiet được
// ghi/đọc đúng, rồi XOÁ ngay dòng mẫu đó. Không đụng Firestore, không gửi email (status OK).

function kiemTraSauDeploy() {
  const out = [];
  const ok = function (label, cond, detail) { out.push((cond ? '✅ ' : '❌ ') + label + (detail ? ' — ' + detail : '')); return cond; };
  const id = 'SELFTEST' + Date.now();
  let written = false;
  try {
    ok('Phiên bản backend', true, BACKEND_VERSION);
    ok('Có đủ API mới', ['listResults', 'wrongStats', 'arenaRoomLog', 'arenaRelayTicket'].every(function (k) { return !!routes_()[k]; }));

    const res = writeSubmissionLog_({
      submissionId: id, studentName: 'Kiểm tra hệ thống', studentClass: 'SELFTEST', studentSchool: 'SELFTEST',
      testName: 'Kiểm tra › sau › deploy', score: 50, correct: '5/10', time: '01:40', tabSwitch: 0, clickCount: 1,
      status: 'OK', timestamp: '', note: '', examMode: 'test', wrong: '',
      detail: { i: 3, s: 2, e: 100, c: 'Kiểm tra', l: 'sau', m: 'deploy', to: 0, v: [1, 0, 0, 0, 0, 0] },
    });
    written = ok('Ghi bài nộp mẫu', res.written === true);

    const rows = listResults_({ schools: ['SELFTEST'], limit: 5 }, { uid: 'selftest', role: 'admin', schools: null }).rows;
    const r = rows.filter(function (x) { return x.id === id; })[0];
    ok('Đọc lại bài mẫu qua listResults_', !!r);
    ok('Cột P ChiTiet ghi + đọc đúng', !!r && r.incorrect === 3 && r.skipped === 2 && r.elapsedSec === 100 && r.minitest === 'deploy' && r.multiTabHits === 1,
      r ? 'sai=' + r.incorrect + ', bỏ qua=' + r.skipped + ', giây=' + r.elapsedSec : '');

    const sheet = getSubmissionLogSheet_();
    const head = sheet.getRange(1, 1, 1, LOG_HEADERS.length).getDisplayValues()[0];
    ok('Tiêu đề cột P = ChiTiet', head[15] === 'ChiTiet', head[15] || '(trống)');
    ok('Không thừa cột trống (trần 10 triệu ô tính cả ô trống)', sheet.getMaxColumns() === LOG_HEADERS.length, sheet.getMaxColumns() + ' cột');
    const cells = fileCells_(sheet.getParent());
    ok('File nhật ký còn dưới ngưỡng xoay vòng', cells < FILE_CELL_BUDGET, cells.toLocaleString() + ' / ' + FILE_CELL_BUDGET.toLocaleString() + ' ô');
    const a = cachedProp_(LOG_SPREADSHEET_PROP);
    ok('Đọc Script Properties qua cache', a === cachedProp_(LOG_SPREADSHEET_PROP), a ? 'đang ghi file ' + a : 'đang ghi file chính');
  } catch (e) {
    ok('Lỗi khi kiểm tra', false, String(e && e.message || e));
  } finally {
    if (written) {
      const del = deleteResults_({ ids: [id] }, { uid: 'selftest', role: 'admin', schools: null });
      ok('Xoá bài mẫu', del.deleted === 1);
      CacheService.getScriptCache().remove('sub:' + id);
    }
  }
  const text = out.join('\n');
  console.log(text);
  try { SpreadsheetApp.getUi().alert('Kiểm tra sau deploy', text, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* chạy trong editor: xem Execution log */ }
  return out;
}
