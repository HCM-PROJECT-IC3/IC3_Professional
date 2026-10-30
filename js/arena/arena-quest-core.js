/* ============================================================
   js/arena/arena-quest-core.js — logic thuần của "Hành trình IC3" trong Đấu trường.
   Ghép Chơi một mình và Mini-game thành 1 bản đồ: 7 vùng theo 7 chủ đề IC3 (đúng 7 bộ
   "Theo chủ đề" có ở mọi cấp Spark/IC3) + Trùm cuối. Mỗi vùng có 1 trận quiz đúng chủ đề
   (mỗi vùng 1 chế độ chơi khác nhau) và mini-game cùng chủ đề nếu có.
     • Sao 1–3 cho mỗi chặng; quiz theo tỉ lệ đúng, mini-game theo mốc điểm của thang đối thủ.
     • Rương vùng: mọi chặng trong vùng ≥ 1 sao; rương vàng: mọi chặng 3 sao.
     • Danh hiệu theo tổng sao của bản đồ; 3 nhiệm vụ mỗi ngày (cùng cho cả lớp, đổi theo ngày).
   Bản đồ tính riêng cho từng cấp (Spark LV1 … IC3 LV3); sao mini-game dùng chung mọi bản đồ.
   Không mở khoá theo thứ tự: chặng nào cũng vào được, bản đồ chỉ gợi ý chặng kế tiếp.
   Hàm thuần — không DOM, không lưu trữ (arena-quest.js gọi rồi tự lưu).
   Test: js/arena/__tests__/arena-quest-core.test.js
   ============================================================ */
(function (global) {
  'use strict';

  const ALL = '__ALL__';
  const QUIZ_N = 10;          // số câu mỗi trận quiz trên bản đồ
  const CHEST_XU = 20;        // rương vùng (mọi chặng ≥ 1 sao), mỗi bản đồ 1 lần
  const GOLD_CHEST_XU = 30;   // rương vàng (mọi chặng 3 sao), mỗi bản đồ 1 lần
  const QUEST_XU = 10;        // mỗi nhiệm vụ ngày

  const REGIONS = [
    { id: 'r1', no: 1, mt: '1.', name: 'Căn bản về công nghệ', scene: 'classroom', mode: 'speed', minis: ['memory-game', 'computer-simulator'],
      lead: 'Thiết bị, phần cứng, phần mềm, tệp và thư mục.' },
    { id: 'r2', no: 2, mt: '2.', name: 'Công dân số', scene: 'street', mode: 'race', minis: [],
      lead: 'Ứng xử, bản quyền, dấu chân số trên mạng.' },
    { id: 'r3', no: 3, mt: '3.', name: 'Quản lý thông tin', scene: 'server', mode: 'gold', minis: [],
      lead: 'Tìm kiếm, đánh giá và sắp xếp thông tin.' },
    { id: 'r4', no: 4, mt: '4.', name: 'Sáng tạo nội dung', scene: 'party', mode: 'fish', minis: [],
      lead: 'Soạn văn bản, trang tính, trình chiếu, hình ảnh.' },
    { id: 'r5', no: 5, mt: '5.', name: 'Giao tiếp', scene: 'field', mode: 'tug', minis: [],
      lead: 'Email, nhắn tin, họp trực tuyến đúng cách.' },
    { id: 'r6', no: 6, mt: '6.', name: 'Hợp tác, cộng tác', scene: 'island', mode: 'spell', minis: [],
      lead: 'Làm việc nhóm, chia sẻ và cùng sửa tài liệu.' },
    { id: 'r7', no: 7, mt: '7.', name: 'An toàn và bảo mật', scene: 'castle', mode: 'survival', minis: ['cyber-detective', 'pz-defense'],
      lead: 'Mật khẩu, lừa đảo, mã độc và cách phòng thủ.' },
    { id: 'fin', no: 8, mt: ALL, name: 'Trùm cuối', scene: 'space', mode: 'boss', minis: ['battle-quiz'], final: true,
      lead: 'Trộn câu hỏi của cả 7 chủ đề — trận cuối của hành trình.' },
  ];

  const TITLES = [
    { min: 0, name: 'Tân binh số' },
    { min: 6, name: 'Nhà thám hiểm' },
    { min: 15, name: 'Hiệp sĩ mạng' },
    { min: 25, name: 'Chuyên gia IC3' },
    { min: 36, name: 'Huyền thoại IC3' },
  ];

  const QUESTS = [
    { id: 'stars', goal: 3, text: 'Giành thêm 3 sao' },
    { id: 'nodes', goal: 2, text: 'Chơi xong 2 chặng bất kỳ' },
    { id: 'correct', goal: 20, text: 'Trả lời đúng 20 câu ở trận quiz' },
    { id: 'mini', goal: 1, text: 'Có sao ở 1 mini-game' },
    { id: 'quiz', goal: 2, text: 'Chơi 2 trận quiz trên bản đồ' },
    { id: 'three', goal: 1, text: 'Đạt 3 sao ở 1 chặng' },
  ];

  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

  /** Mọi chặng theo thứ tự trên bản đồ: { id, region, kind: 'quiz'|'mini', game? }. */
  function nodes() {
    const out = [];
    REGIONS.forEach((r) => {
      out.push({ id: r.id + '-quiz', region: r.id, kind: 'quiz' });
      r.minis.forEach((g) => out.push({ id: r.id + '-' + g, region: r.id, kind: 'mini', game: g }));
    });
    return out;
  }
  const NODES = nodes();
  const MAX_STARS = NODES.length * 3;
  const nodeById = (id) => NODES.find((n) => n.id === id) || null;
  const regionById = (id) => REGIONS.find((r) => r.id === id) || null;
  const nodesOf = (regionId) => NODES.filter((n) => n.region === regionId);

  /** Sao trận quiz: ≥ 50% đúng = 1★, ≥ 75% = 2★, ≥ 90% và thắng trận = 3★. */
  function quizStars(r) {
    const total = num(r && r.total);
    if (!total) return 0;
    const acc = num(r.correct) / total;
    if (acc >= 0.9 && r.win) return 3;
    if (acc >= 0.75) return 2;
    if (acc >= 0.5) return 1;
    return 0;
  }
  /** Sao mini-game: đạt mốc đối thủ 1 (Đồng) = 1★, mốc 3 (Vàng) = 2★, mốc 5 (Huyền thoại) = 3★. */
  function miniStars(ladder, pts) {
    if (!Array.isArray(ladder) || ladder.length < 5) return 0;
    const p = num(pts);
    return p >= ladder[4] ? 3 : p >= ladder[2] ? 2 : p >= ladder[0] ? 1 : 0;
  }

  /** Khung dữ liệu đã chuẩn hoá (qp lưu ở players[nick].quest). */
  function norm(qp) {
    const q = qp && typeof qp === 'object' ? qp : {};
    if (!q.maps || typeof q.maps !== 'object') q.maps = {};
    if (!q.mini || typeof q.mini !== 'object') q.mini = {};
    return q;
  }
  function mapOf(qp, key) {
    const q = norm(qp);
    const m = q.maps[key] || (q.maps[key] = {});
    if (!m.s || typeof m.s !== 'object') m.s = {};
    if (!m.chest || typeof m.chest !== 'object') m.chest = {};
    return m;
  }
  /** Sao hiện có của 1 chặng trên bản đồ `key`. */
  function starsOf(qp, key, nodeId) {
    const n = nodeById(nodeId);
    if (!n) return 0;
    const q = norm(qp);
    // Chỉ đọc — không tạo sẵn bản đồ rỗng cho cấp chưa chơi (đỡ phình dữ liệu lưu trên máy)
    return n.kind === 'mini' ? num(q.mini[n.game]) : num(((q.maps[key] || {}).s || {})[nodeId]);
  }
  function totalStars(qp, key) { return NODES.reduce((s, n) => s + starsOf(qp, key, n.id), 0); }
  function regionStars(qp, key, regionId) { return nodesOf(regionId).reduce((s, n) => s + starsOf(qp, key, n.id), 0); }
  function titleFor(stars) { return TITLES.filter((t) => stars >= t.min).pop(); }
  function nextTitle(stars) { return TITLES.find((t) => t.min > stars) || null; }
  /** Chặng gợi ý: chặng đầu tiên chưa có sao, hết thì chặng đầu tiên chưa 3 sao. */
  function nextNode(qp, key) {
    return NODES.find((n) => !starsOf(qp, key, n.id)) || NODES.find((n) => starsOf(qp, key, n.id) < 3) || null;
  }

  function dayKey(d) {
    const x = d || new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  /** 3 nhiệm vụ của ngày (giống nhau trên mọi máy cùng ngày). */
  function questsOf(day) {
    let h = 2166136261;
    for (const ch of String(day)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const pool = QUESTS.slice();
    const out = [];
    for (let k = 0; k < 3; k++) {
      h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
      out.push(pool.splice(h % pool.length, 1)[0]);
    }
    return out;
  }
  function dayOf(qp, day) {
    const q = norm(qp);
    if (!q.day || q.day.date !== day) q.day = { date: day, stars: 0, nodes: 0, correct: 0, mini: 0, quiz: 0, three: 0, done: [] };
    return q.day;
  }

  /**
   * Chốt 1 lượt chơi chặng `nodeId` trên bản đồ `key` với `stars` sao (0–3).
   * extra: { correct } (trận quiz). Trả { qp, before, stars, gained, xu, parts: [{label, xu}], quests: [...], titleUp, chest }.
   * Sao chỉ tăng (lấy cao nhất); rương/nhiệm vụ mỗi thứ nhận 1 lần.
   */
  function settle(qp, key, nodeId, stars, day, extra) {
    const q = norm(qp);
    const n = nodeById(nodeId);
    const res = { qp: q, before: 0, stars: 0, gained: 0, xu: 0, parts: [], quests: [], titleUp: null, chest: null };
    if (!n) return res;
    const s = Math.max(0, Math.min(3, Math.round(num(stars))));
    const before = starsOf(q, key, nodeId);
    const totalBefore = totalStars(q, key);
    const best = Math.max(before, s);
    if (n.kind === 'mini') q.mini[n.game] = best; else mapOf(q, key).s[nodeId] = best;
    res.before = before; res.stars = s; res.gained = best - before;

    const d = dayOf(q, day);
    d.nodes += 1;
    d.stars += res.gained;
    if (n.kind === 'quiz') { d.quiz += 1; d.correct += num(extra && extra.correct); }
    if (n.kind === 'mini' && s > 0) d.mini += 1;
    if (s === 3) d.three += 1;

    const m = mapOf(q, key);
    const reg = nodesOf(n.region);
    if (!m.chest[n.region] && reg.every((x) => starsOf(q, key, x.id) >= 1)) {
      m.chest[n.region] = 1;
      res.chest = 'normal';
      res.parts.push({ label: 'Rương vùng ' + regionById(n.region).name, xu: CHEST_XU });
    }
    if (m.chest[n.region] !== 2 && reg.every((x) => starsOf(q, key, x.id) >= 3)) {
      m.chest[n.region] = 2;
      res.chest = 'gold';
      res.parts.push({ label: 'Rương vàng — cả vùng 3 sao', xu: GOLD_CHEST_XU });
    }
    questsOf(day).forEach((qt) => {
      if (d.done.includes(qt.id) || num(d[qt.id]) < qt.goal) return;
      d.done.push(qt.id);
      res.quests.push(qt);
      res.parts.push({ label: 'Nhiệm vụ: ' + qt.text, xu: QUEST_XU });
    });
    const totalAfter = totalStars(q, key);
    const t0 = titleFor(totalBefore), t1 = titleFor(totalAfter);
    if (t1 !== t0) res.titleUp = t1;
    res.xu = res.parts.reduce((a, p) => a + p.xu, 0);
    return res;
  }

  global.EduArenaQuestCore = {
    ALL, QUIZ_N, CHEST_XU, GOLD_CHEST_XU, QUEST_XU, REGIONS, NODES, MAX_STARS, TITLES, QUESTS,
    nodeById, regionById, nodesOf, quizStars, miniStars, norm, mapOf, starsOf, totalStars, regionStars,
    titleFor, nextTitle, nextNode, dayKey, questsOf, dayOf, settle,
  };
})(typeof window !== 'undefined' ? window : globalThis);
