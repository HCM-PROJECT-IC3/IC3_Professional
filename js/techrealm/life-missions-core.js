/* ============================================================
   js/techrealm/life-missions-core.js — NHIỆM VỤ ĐỜI SỐNG (Domain thuần).
   1) Tính tiền điện: điện năng = công suất (W) × giờ/ngày × 30 ngày ÷ 1000 → kWh/tháng; tiền theo BẬC THANG.
      Bảng giá ở đây là GIÁ MINH HOẠ để học cách tính bậc thang — KHÔNG phải biểu giá điện hiện hành (giao diện ghi rõ).
   2) Phân loại rác tại nguồn: nhóm theo Luật Bảo vệ môi trường 2020 (tái sử dụng/tái chế · thực phẩm · rác sinh hoạt
      khác) + nhóm nguy hại thu gom riêng (pin, bóng đèn huỳnh quang, thuốc hết hạn, bình xịt côn trùng).
   Kết quả lưu trên máy, dùng để mở khoá công trình ở Thành phố thông minh. Không DOM, không mạng.
   ============================================================ */
(function (root) {
  'use strict';

  /* ═════ 1. Tính tiền điện ═════ */
  const APPLIANCES = [
    { id: 'tu-lanh', name: 'Tủ lạnh', watt: 120, min: 24, max: 24, start: 24, note: 'Phải chạy cả ngày để giữ thức ăn' },
    { id: 'den', name: 'Đèn LED (5 bóng)', watt: 50, min: 4, max: 12, start: 10 },
    { id: 'quat', name: 'Quạt', watt: 50, min: 0, max: 24, start: 12 },
    { id: 'tivi', name: 'Tivi', watt: 100, min: 0, max: 12, start: 8 },
    { id: 'may-lanh', name: 'Máy lạnh', watt: 900, min: 0, max: 12, start: 8 },
    { id: 'noi-com', name: 'Nồi cơm điện', watt: 600, min: 1, max: 3, start: 2, note: 'Cần ít nhất 1 giờ để nấu cơm' },
  ];
  // Giá minh hoạ (đồng/kWh) cho từng bậc, đến hết `upTo` kWh.
  const TIERS = [
    { upTo: 50, price: 1800 }, { upTo: 100, price: 1900 }, { upTo: 200, price: 2200 },
    { upTo: 300, price: 2800 }, { upTo: 400, price: 3100 }, { upTo: Infinity, price: 3200 },
  ];
  const BUDGET = 500000;

  const kwh = function (watt, hours) { return Math.round((watt * hours * 30) / 1000 * 10) / 10; };
  function usage(hours) {
    return APPLIANCES.map(function (a) {
      const h = Math.max(a.min, Math.min(a.max, Math.round(Number(hours && hours[a.id] !== undefined ? hours[a.id] : a.start))));
      return { id: a.id, name: a.name, watt: a.watt, hours: h, kwh: kwh(a.watt, h) };
    });
  }
  /** Tiền điện bậc thang: mỗi bậc chỉ tính phần kWh nằm trong bậc đó. */
  function bill(totalKwh) {
    let left = totalKwh; let prev = 0; let money = 0;
    const rows = [];
    TIERS.forEach(function (t, i) {
      if (left <= 0) return;
      const span = Math.min(left, t.upTo - prev);
      rows.push({ tier: i + 1, kwh: Math.round(span * 10) / 10, price: t.price, money: Math.round(span * t.price) });
      money += span * t.price; left -= span; prev = t.upTo;
    });
    return { kwh: Math.round(totalKwh * 10) / 10, money: Math.round(money), rows: rows };
  }
  function electricQuestions() {
    return [
      { id: 'e1', text: 'Quạt 50 W chạy 10 giờ mỗi ngày. Một tháng (30 ngày) dùng bao nhiêu kWh?', options: ['15 kWh', '500 kWh', '1,5 kWh', '150 kWh'], correct: 0 },
      { id: 'e2', text: 'Vì sao giảm giờ chạy máy lạnh giúp tiết kiệm nhiều nhất?', options: ['Vì máy lạnh có công suất lớn nhất trong nhà', 'Vì máy lạnh chạy lâu nhất', 'Vì máy lạnh rẻ nhất', 'Vì tắt máy lạnh làm tủ lạnh tốn ít điện hơn'], correct: 0 },
      { id: 'e3', text: 'Giá điện bậc thang nghĩa là gì?', options: ['Dùng càng nhiều, các kWh sau càng đắt hơn', 'Mọi kWh cùng một giá', 'Dùng nhiều thì được giảm giá', 'Chỉ tính tiền vào ban đêm'], correct: 0 },
    ];
  }
  /** Điểm 0–100: đạt ngân sách (giữ đủ nhu cầu tối thiểu) 50 + 3 câu × 50/3 (lần chọn đầu). */
  function scoreElectric(hours, firstAnswers) {
    const u = usage(hours);
    const b = bill(u.reduce(function (t, x) { return t + x.kwh; }, 0));
    const qs = electricQuestions();
    const right = qs.filter(function (q) { return firstAnswers && firstAnswers[q.id] === q.correct; }).length;
    const budgetOk = b.money <= BUDGET;
    return { usage: u, bill: b, budgetOk: budgetOk, right: right, score: Math.round((budgetOk ? 50 : 0) + (right * 50) / qs.length) };
  }

  /* ═════ 2. Phân loại rác ═════ */
  const BINS = {
    'tai-che': { name: 'Tái chế', hint: 'Sạch, khô: nhựa, kim loại, giấy, thủy tinh' },
    'thuc-pham': { name: 'Thực phẩm', hint: 'Thức ăn thừa, vỏ trái cây, rau — ủ thành phân bón được' },
    'khac': { name: 'Rác khác', hint: 'Bẩn, lẫn nhiều chất, không tái chế được' },
    'nguy-hai': { name: 'Nguy hại', hint: 'Thu gom riêng, không bỏ chung — có chất độc' },
  };
  const WASTE = [
    { id: 'chai-nhua', name: 'Chai nhựa nước suối (đã rửa)', bin: 'tai-che', why: 'Nhựa sạch tái chế được thành sợi, đồ dùng mới.' },
    { id: 'lon-nhom', name: 'Lon nhôm nước ngọt', bin: 'tai-che', why: 'Nhôm tái chế được nhiều lần, tiết kiệm năng lượng.' },
    { id: 'giay-bao', name: 'Giấy báo cũ', bin: 'tai-che', why: 'Giấy khô, sạch làm lại thành giấy mới.' },
    { id: 'hop-carton', name: 'Thùng các-tông khô', bin: 'tai-che', why: 'Các-tông khô tái chế được.' },
    { id: 'chai-thuy-tinh', name: 'Chai thủy tinh', bin: 'tai-che', why: 'Thủy tinh nấu chảy làm chai mới.' },
    { id: 'vo-chuoi', name: 'Vỏ chuối', bin: 'thuc-pham', why: 'Phân huỷ được, ủ thành phân bón.' },
    { id: 'com-thua', name: 'Cơm thừa', bin: 'thuc-pham', why: 'Chất thải thực phẩm, ủ phân hoặc làm thức ăn chăn nuôi.' },
    { id: 'rau-hong', name: 'Rau héo, lá rau', bin: 'thuc-pham', why: 'Phân huỷ nhanh, ủ thành phân bón.' },
    { id: 'ba-tra', name: 'Bã trà', bin: 'thuc-pham', why: 'Hữu cơ, ủ phân được.' },
    { id: 'giay-an', name: 'Giấy ăn đã dùng', bin: 'khac', why: 'Bẩn, sợi giấy quá ngắn — không tái chế được.' },
    { id: 'tui-nilon-ban', name: 'Túi ni-lông dính dầu mỡ', bin: 'khac', why: 'Bị bẩn dầu mỡ nên không tái chế được.' },
    { id: 'hop-xop', name: 'Hộp xốp đựng đồ ăn đã dùng', bin: 'khac', why: 'Xốp bẩn rất khó tái chế.' },
    { id: 'gom-vo', name: 'Bát sứ vỡ', bin: 'khac', why: 'Gốm sứ không nấu chảy như thủy tinh — bọc kỹ để tránh đứt tay.' },
    { id: 'pin-cu', name: 'Pin cũ', bin: 'nguy-hai', why: 'Có kim loại nặng, ngấm vào đất và nước — nộp ở điểm thu gom pin.' },
    { id: 'bong-huynh-quang', name: 'Bóng đèn huỳnh quang hỏng', bin: 'nguy-hai', why: 'Có thủy ngân — để nguyên, không đập vỡ, nộp điểm thu gom.' },
    { id: 'thuoc-het-han', name: 'Thuốc hết hạn', bin: 'nguy-hai', why: 'Hoá chất — nộp lại nhà thuốc hoặc điểm thu gom.' },
    { id: 'binh-xit', name: 'Bình xịt côn trùng đã hết', bin: 'nguy-hai', why: 'Còn hoá chất và có thể nổ khi nóng — thu gom riêng.' },
  ];
  /** sorted: { itemId: binId } → điểm theo số món đúng; kèm giải thích từng món. */
  function scoreWaste(sorted) {
    const rows = WASTE.map(function (w) { return { id: w.id, name: w.name, put: (sorted && sorted[w.id]) || null, bin: w.bin, ok: !!sorted && sorted[w.id] === w.bin, why: w.why }; });
    const right = rows.filter(function (r) { return r.ok; }).length;
    return { rows: rows, right: right, total: WASTE.length, score: Math.round((right * 100) / WASTE.length), done: rows.every(function (r) { return r.put; }) };
  }

  const api = { APPLIANCES: APPLIANCES, TIERS: TIERS, BUDGET: BUDGET, kwh: kwh, usage: usage, bill: bill, electricQuestions: electricQuestions, scoreElectric: scoreElectric, BINS: BINS, WASTE: WASTE, scoreWaste: scoreWaste };
  root.EduLifeMissions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
