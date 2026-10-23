/* ============================================================
   js/name-picker/name-picker-core.js — LOGIC THUẦN của trang "Gọi tên học sinh" (goi-ten.html).
   Không đụng DOM/mạng → chạy được trong Node (js/name-picker/__tests__/name-picker-core.test.js).

   • parseNames(text)       dán từ Excel/Word/Zalo: mỗi dòng 1 tên, bỏ số thứ tự đầu dòng,
                            dòng có cột (Tab) → lấy ô giống họ tên nhất; bỏ trùng
   • remaining(all, called) người chưa được gọi (bốc không lặp, hết lượt → quay vòng mới)
   • pick / decoy / finalists   chọn người được gọi TRƯỚC, hiệu ứng chỉ "diễn" tới kết quả đó
   • raceScript / popOrder   kịch bản cho trò Đường đua và Bóng bay
   Kết quả không bao giờ gửi đi đâu — trang chỉ lưu localStorage trên máy giáo viên.
   ============================================================ */
(function (global) {
  'use strict';

  const MAX_NAMES = 300;
  const keyOf = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const clean = (s) => String(s || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const hasLetter = (s) => /\p{L}/u.test(s);

  /** 1 dòng → tên: "12. Nguyễn Văn A" → "Nguyễn Văn A"; "1⇥Nguyễn Văn A⇥8A1" → ô có chữ dài nhất. */
  function lineToName(line) {
    let cells = line.split('\t').map(clean).filter(Boolean);
    if (cells.length > 1) {
      const named = cells.filter((c) => hasLetter(c) && !/^\d+[A-Za-z]\d*$/.test(c)); // bỏ ô số thứ tự, ô lớp "8A1"
      cells = [(named.length ? named : cells).sort((a, b) => b.length - a.length)[0]];
    }
    const s = clean(cells[0] || '').replace(/^(\d+|[-•*·+])\s*[.):\-–]?\s+/, '').replace(/^\d+[.)]\s*/, '');
    return clean(s);
  }
  function parseNames(text) {
    let lines = String(text || '').split(/\r?\n/);
    // Dán 1 dòng "An, Bình; Chi" → tách theo dấu phẩy / chấm phẩy
    if (lines.filter((l) => l.trim()).length === 1 && /[,;]/.test(lines.join(''))) lines = lines.join('').split(/[,;]/);
    const seen = new Set();
    const out = [];
    lines.forEach((l) => {
      const n = lineToName(l);
      if (!n || !hasLetter(n) && !/^\d+$/.test(n)) return;
      const k = keyOf(n);
      if (seen.has(k) || out.length >= MAX_NAMES) return;
      seen.add(k);
      out.push(n);
    });
    return out;
  }
  function numberList(n) { return Array.from({ length: Math.max(2, Math.min(MAX_NAMES, n | 0)) }, (_, i) => String(i + 1)); }

  /** Người chưa gọi. Hết người → { list: tất cả, fresh: true } (bắt đầu vòng mới). */
  function remaining(all, called) {
    const done = new Set((called || []).map(keyOf));
    const left = all.filter((n) => !done.has(keyOf(n)));
    return left.length ? { list: left, fresh: false } : { list: all.slice(), fresh: true };
  }
  const pick = (list, rng) => list[Math.floor(rng() * list.length)];
  /** Người "suýt bị gọi" cho Lật kèo (khác người được gọi; null nếu chỉ có 1 người). */
  function decoy(list, winner, rng) {
    const others = list.filter((n) => n !== winner);
    return others.length ? pick(others, rng) : null;
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  /** n người vào vòng cuối, luôn có người được gọi (và người suýt bị gọi nếu có), xếp ngẫu nhiên. */
  function finalists(list, winner, n, rng, also) {
    const must = [winner].concat(also && also !== winner ? [also] : []);
    const rest = shuffle(list.filter((x) => !must.includes(x)), rng).slice(0, Math.max(0, n - must.length));
    return shuffle(must.concat(rest), rng);
  }

  /**
   * Đường đua: mỗi người 1 dãy mốc tiến độ (0..1) theo thời gian 0..1, đổi người dẫn đầu vài lần.
   * Người được gọi về đích đúng lúc kết thúc; người suýt bị gọi (Lật kèo) dẫn đầu gần hết đường rồi bị vượt.
   * @returns { [name]: number[] }  (SEG+1 mốc, mốc cuối = vị trí lúc kết thúc)
   */
  const SEG = 10;
  function raceScript(names, winner, rng, lead) {
    const out = {};
    names.forEach((n) => {
      const w = Array.from({ length: SEG }, () => 0.5 + rng());
      if (n === lead) for (let k = 0; k < SEG - 2; k++) w[k] += 0.9;   // bứt lên sớm, hụt hơi cuối
      if (n === winner) { w[SEG - 1] += 1.6; w[SEG - 2] += 1.0; }        // nước rút
      const end = n === winner ? 1 : 0.8 + rng() * 0.15;
      const sum = w.reduce((s, x) => s + x, 0);
      let acc = 0;
      out[n] = [0].concat(w.map((x) => { acc += x; return (acc / sum) * end; }));
    });
    return out;
  }
  /** Vị trí ở thời điểm t (0..1) theo kịch bản (nội suy tuyến tính giữa các mốc). */
  function raceAt(marks, t) {
    const x = Math.max(0, Math.min(1, t)) * SEG;
    const i = Math.min(SEG - 1, Math.floor(x));
    return marks[i] + (marks[i + 1] - marks[i]) * (x - i);
  }
  /** Bóng bay: thứ tự nổ (mọi người trừ người được gọi); người suýt bị gọi nổ cuối cùng. */
  function popOrder(names, winner, rng, last) {
    const rest = shuffle(names.filter((n) => n !== winner && n !== last), rng);
    return last && last !== winner && names.includes(last) ? rest.concat(last) : rest;
  }

  /** Vòng quay: góc (độ, theo chiều kim đồng hồ) để ô thứ i dừng dưới kim ở đỉnh. */
  function wheelAngle(i, n, turns, jitter) {
    const seg = 360 / n;
    return turns * 360 + (360 - (i * seg + seg / 2)) + (jitter || 0) * seg * 0.35;
  }
  /** Ô đang nằm dưới kim khi bánh xe xoay `deg` độ. */
  function wheelIndexAt(deg, n) {
    const seg = 360 / n;
    const a = ((360 - (deg % 360)) % 360 + 360) % 360;
    return Math.floor(a / seg) % n;
  }
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);

  global.EduNamePicker = {
    MAX_NAMES, SEG, keyOf, parseNames, numberList, remaining, pick, decoy, shuffle, finalists,
    raceScript, raceAt, popOrder, wheelAngle, wheelIndexAt, easeOut,
  };
})(typeof window !== 'undefined' ? window : globalThis);
