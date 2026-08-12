/* ════════════════════════════════════════════════════════════
   js/pz-defense.js — Mini-game "Phòng Thủ Dữ Liệu"
   (tower-defense kiểu Plants vs Zombies, reskin theo chủ đề an
   ninh mạng). Cùng pattern với js/billiards.js: trang
   pz-defense.html được nhúng qua modal (js/pz-defense-modal.js)
   giống hệt game.html / memory-game.html / sudoku.html /
   billiards.html — chỉ chứa đúng 1 mini-game độc lập, không đụng
   vào quiz-engine.js / gamification.js.

   Cơ chế:
   - Lưới 5 hàng (lane) × 8 cột. 12 loại "tác nhân" mã độc/tấn
     công (Worm, Trojan, Ransomware, Virus, Trùm Botnet, Spyware,
     Adware, Phishing, Rootkit, Logic Bomb, SQL Injection, DDoS)
     xuất hiện ở mép phải mỗi hàng, bò dần sang trái để xâm nhập
     Server ở mép trái. MỖI loại có 1 cơ chế riêng phản ánh đúng
     hành vi thật (xem bảng trong pz-defense-design.md) — đây là
     cách "dạy ngầm" khái niệm IC3 qua gameplay.
   - Người chơi dùng tài nguyên "Dữ liệu" để đặt 1 trong 19 "linh
     vật" (12 phần mềm + 6 phần cứng + 1 "Công Tắc Ngắt Khẩn", icon
     minh họa dạng cây/plant lấy từ img/pz-defense/plants/) lên các
     ô trống — mỗi linh
     vật 1 vai trò: chặn đường (có/không tự hồi máu), sinh Sun, bắn hạ
     zombie (đơn lẻ hoặc buff bởi Copilot), gây sát thương diện rộng cả
     hàng, làm chậm/đóng băng cả hàng, "dò quét" để lộ diện tác nhân ẩn
     danh (Trojan ngụy trang / Spyware tàng hình / Rootkit kháng dame),
     miễn nhiễm "câu mồi" Phishing, hồi máu Server + giải khóa
     Ransomware, hoặc nổ diện rộng dùng-1-lần.
   - Kiểu PvZ gốc (4 điểm, xem thêm §Sun/§Lawnmower/§bomb/§cooldown
     bên dưới): (1) Sun ☀️ rơi ngẫu nhiên từ trời + linh vật "sinh Dữ
     liệu" chỉ "nảy" ra 1 cục Sun tại chỗ — phải BẤM vào mới thu được,
     không tự cộng; (2) mỗi hàng có 1 "🚜 Xe cắt cỏ" — mạng chót cứu 1
     lần (quét sạch cả hàng thay vì trừ máu Server) rồi hết tác dụng;
     (3) linh vật nổ dùng-1-lần (Công Tắc Ngắt Khẩn) kiểu Cherry Bomb —
     đặt xuống là kích nổ diện rộng gần vị trí rồi tự hủy; (4) mỗi loại
     linh vật có cooldown hồi chiêu riêng SAU KHI đặt (không chỉ phụ
     thuộc đủ/thiếu Dữ liệu) — thẻ trong shop hiện đếm ngược khi đang
     hồi.
   - Qua hết toàn bộ 13 đợt tấn công (12 đợt giới thiệu từng tác
     nhân + 1 đợt "Thử thách cuối" trộn tất cả) mà Server còn máu
     → thắng. Server hết máu → thua. Sau mỗi đợt, 1 "mẹo IC3" hiện
     lên (LEVEL_TIPS) để biến việc qua đợt thành 1 khoảnh khắc ôn
     bài nhanh.

   Vật lý/thời gian: hoàn toàn tính theo khung hình (frame-based,
   giả định ~60fps qua requestAnimationFrame) — cùng cách tiếp cận
   với js/billiards.js, không dùng deltaTime thực để giữ code đơn
   giản, nhất quán.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Định nghĩa 18 "linh vật" (plant equivalent): 12 linh vật PHẦN
  //    MỀM gốc (đối xứng quân số với 12 tác nhân tấn công bên dưới)
  //    + 6 linh vật PHẦN CỨNG bổ sung để phủ đúng mảng "Computing
  //    Fundamentals" của IC3 GS6 (Bàn phím/Chuột/Máy in/Màn hình/CPU/
  //    Vỏ máy). Mỗi linh vật giữ 1 vai trò riêng; 6 vai trò gốc là cơ
  //    chế nền (wall / generator / shooter / slow / scanner / aoe),
  //    3 linh vật phần mềm còn lại mở thêm freeze / buff / restore /
  //    shooter miễn-nhiễm-phishing để khắc chế đúng thứ mà các tác
  //    nhân "khó nhằn" nhất gây ra; 6 linh vật phần cứng tái dùng các
  //    cơ chế nền để cân bằng lại roster — xem `desc` mỗi loại. ──
  var DEF_TYPES = [
    { id: 'word', img: 'img/pz-defense/plants/wallnut.png', name: 'Word Chắn Đường', cost: 50, cooldownFrames: 780,
      hp: 260, type: 'wall', ring: '#2b579a',
      desc: 'Núi hồ sơ Word chất đống chặn lối — rẻ, dễ đặt, nhưng "mỏng cơm" nhất trong 3 tường chắn.' },
    { id: 'excel', img: 'img/pz-defense/plants/sunflower.png', name: 'Excel Sinh Dữ Liệu', cost: 60, cooldownFrames: 480,
      hp: 90, type: 'generator', genAmount: 22, genFrames: 200, ring: '#217346',
      desc: 'Định kỳ "nảy" ra 1 cục Sun tại chỗ — bấm vào để hứng Dữ liệu, không tự cộng.' },
    { id: 'chrome', img: 'img/pz-defense/plants/peashooter.png', name: 'Chrome Quét Nhanh', cost: 80, cooldownFrames: 360,
      hp: 90, type: 'shooter', dmg: 9, rateFrames: 42, projSpeed: 6.5, ring: '#ea4335',
      desc: 'Bắn nhanh, sát thương thấp — dọn tốt các tác nhân máu mỏng như Worm/DDoS.' },
    { id: 'outlook', img: 'img/pz-defense/plants/firepeashooter.png', name: 'Outlook Cảnh Báo', cost: 130, cooldownFrames: 600,
      hp: 110, type: 'shooter', dmg: 30, rateFrames: 108, projSpeed: 5, ring: '#0364b8',
      desc: 'Bắn chậm, sát thương cao — phù hợp hạ các tác nhân trâu bò như Ransomware/Rootkit.' },
    { id: 'teams', img: 'img/pz-defense/plants/icepeashooter.png', name: 'Teams Làm Chậm', cost: 95, cooldownFrames: 540,
      hp: 110, type: 'slow', slowFactor: 0.5, ring: '#5b5fc7',
      desc: 'Làm chậm mọi tác nhân trong cả hàng — cả hàng tấn công đều rề rà hơn.' },
    { id: 'scanner', img: 'img/pz-defense/plants/datascanner.png', name: 'Gemini Dò Quét', cost: 150, cooldownFrames: 600,
      hp: 100, type: 'scanner', ring: '#8e6ef0',
      desc: 'AI quét sâu hơn Màn Hình: lộ diện Trojan ngụy trang / Spyware tàng hình / phá kháng dame của Rootkit — bền hơn, hồi chiêu nhanh hơn.' },
    { id: 'powerpoint', img: 'img/pz-defense/plants/lightningreed.png', name: 'PowerPoint Phát Sóng', cost: 170, cooldownFrames: 680,
      hp: 105, type: 'aoe', dmg: 9, rateFrames: 68, ring: '#d24726',
      desc: 'Định kỳ "phát sóng" gây sát thương cho TẤT CẢ tác nhân đang lộ diện trong cả hàng — khắc chế Worm tự nhân bản.' },
    { id: 'gmail', img: 'img/pz-defense/plants/twinshooter.png', name: 'Gmail Lọc Thư Rác', cost: 110, cooldownFrames: 480,
      hp: 100, type: 'shooter', dmg: 13, rateFrames: 58, projSpeed: 6, ring: '#c2402c',
      immuneTo: 'hijack',
      desc: 'Bắn hạ bình thường, đồng thời lọc thư rác — mọi lá chắn cùng hàng MIỄN NHIỄM với "câu mồi" của Phishing.' },
    { id: 'zoom', img: 'img/pz-defense/plants/timeleaf.png', name: 'Zoom Họp Khẩn', cost: 140, cooldownFrames: 720,
      hp: 100, type: 'freeze', freezeFrames: 90, freezeIntervalFrames: 260, ring: '#2d8cff',
      desc: 'Định kỳ triệu tập "họp khẩn" — đóng băng cả hàng vài giây, khắc chế Trùm Botnet triệu hồi & Logic Bomb hẹn giờ.' },
    { id: 'copilot', img: 'img/pz-defense/plants/boosterbud.png', name: 'Copilot Trợ Lý', cost: 160, cooldownFrames: 660,
      hp: 80, type: 'buff', buffDmgMult: 1.4, buffRateMult: 0.8, ring: '#6b57ff',
      desc: 'Không tự bắn — tăng sát thương & tốc độ bắn cho các lá chắn "bắn hạ" đứng cùng hàng.' },
    { id: 'windows', img: 'img/pz-defense/plants/steelwall.png', name: 'Windows Tường Lửa', cost: 120, cooldownFrames: 900,
      hp: 340, type: 'wall', regenPerTick: 1.2, ring: '#00adef',
      desc: 'Tường lửa hệ điều hành, tự hồi máu theo thời gian — chắc hơn Word, vẫn nhẹ hơn Vỏ Máy — trụ vững trước SQL Injection xuyên phá.' },
    { id: 'extdrive', img: 'img/pz-defense/plants/repairflower.png', name: 'Ổ Cứng Sao Lưu', cost: 200, cooldownFrames: 960,
      hp: 90, type: 'restore', healAmount: 14, healFrames: 220, ring: '#f5a623',
      desc: 'Định kỳ hồi máu Server & tự "giải khóa" các lá chắn đang bị Ransomware khóa cùng hàng — mô phỏng sao lưu định kỳ.' },

    // ── 6 linh vật PHẦN CỨNG bổ sung — cân bằng lại roster vốn thiên
    //    hẳn về phần mềm, phủ đúng mảng "Computing Fundamentals" của
    //    IC3 GS6 (thiết bị nhập/xuất, bộ xử lý, lưu trữ, vỏ máy...).
    //    Tái dùng các `type` cơ chế sẵn có (shooter/slow/scanner/aoe/
    //    generator/wall) — không cần đụng vào game-loop. ──
    { id: 'keyboard', img: 'img/pz-defense/plants/cactus.png', name: 'Bàn Phím Gõ Lệnh', cost: 65, cooldownFrames: 300,
      hp: 80, type: 'shooter', dmg: 7, rateFrames: 34, projSpeed: 7, ring: '#5a5a5a',
      desc: 'Gõ lệnh liên tục, tốc độ bắn rất nhanh nhưng sát thương thấp — tỉa các tác nhân máu mỏng ngay từ đầu hàng.' },
    { id: 'mouse', img: 'img/pz-defense/plants/magnetshroom.png', name: 'Chuột Khoanh Vùng', cost: 85, cooldownFrames: 420,
      hp: 95, type: 'slow', slowFactor: 0.6, ring: '#c0c0c0',
      desc: 'Rê chuột khoanh vùng chọn, làm chậm mọi tác nhân trong hàng — nhẹ tay hơn Teams nhưng rẻ hơn.' },
    { id: 'printer', img: 'img/pz-defense/plants/solarshroom.png', name: 'Máy In Xuất Dữ Liệu', cost: 65, cooldownFrames: 360,
      hp: 90, type: 'generator', genAmount: 16, genFrames: 145, ring: '#8d8d8d',
      desc: 'Định kỳ "nảy" ra 1 cục Sun nhỏ tại chỗ (bấm để hứng) — sinh nhanh hơn Excel nhưng mỗi lần ít hơn, tổng sản lượng tương đương.' },
    { id: 'monitor', img: 'img/pz-defense/plants/antivirusplant.png', name: 'Màn Hình Hiển Thị', cost: 135, cooldownFrames: 600,
      hp: 95, type: 'scanner', ring: '#3aa0ff',
      desc: 'Hiển thị rõ mọi hoạt động trong hàng, lộ diện Trojan ngụy trang / Spyware tàng hình / phá kháng dame của Rootkit — rẻ hơn Gemini, hiệu quả tương đương.' },
    { id: 'cpu', img: 'img/pz-defense/plants/laserbean.png', name: 'CPU Xử Lý Đa Luồng', cost: 155, cooldownFrames: 660,
      hp: 110, type: 'aoe', dmg: 8, rateFrames: 65, ring: '#00b7c3',
      desc: 'Định kỳ xử lý & tỏa nhiệt, gây sát thương nhẹ cho TẤT CẢ tác nhân đang lộ diện trong cả hàng.' },
    { id: 'tower', img: 'img/pz-defense/plants/tallnut.png', name: 'Vỏ Máy Bọc Thép', cost: 220, cooldownFrames: 1080,
      hp: 460, type: 'wall', regenPerTick: 1.5, ring: '#2c2c2c',
      desc: 'Case máy tính chắc chắn, tự "tản nhiệt" hồi máu theo thời gian — tường thủ TRÂU NHẤT trong 3 loại, đắt hơn cả Windows.' },

    // ── Linh vật NỔ dùng-1-lần (kiểu Cherry Bomb của PvZ gốc) — đặt
    //    xuống là kích hoạt ngòi nổ ngắn, dọn sạch 1 cụm rồi tự hủy;
    //    đổi lại hồi chiêu RẤT lâu. Dùng ảnh "Bomb Flower" (Plant
    //    reference) thay vì icon phần mềm/cứng lẫn emoji cũ. ──
    { id: 'killswitch', img: 'img/pz-defense/plants/bombflower.png', name: 'Công Tắc Ngắt Khẩn', cost: 175, cooldownFrames: 1500,
      hp: 40, type: 'bomb', fuseFrames: 45, blastDmg: 500, blastRadius: 130, ring: '#ff5252',
      desc: 'Đặt xuống là kích nổ gần như ngay lập tức, gây sát thương cực lớn quanh vị trí đặt rồi tự hủy — dùng 1 lần, hồi chiêu rất lâu.' }
  ];
  var DEF_BY_ID = {};
  DEF_TYPES.forEach(function (d) { DEF_BY_ID[d.id] = d; });

  // ── Định nghĩa 12 tác nhân tấn công — mỗi loại 1 "mechanic"
  //    phản ánh đúng hành vi thật (xem pz-defense-design.md §1) ──
  var ZOMBIE_TYPES = [
    { id: 'worm', img: 'img/pz-defense/zom_worm.png', name: 'Worm', hp: 55, speed: 0.75,
      dmgToDef: 0.42, breachDmg: 8, reward: 3, mechanic: 'split',
      splitHpFactor: 0.45, splitCount: 2,
      tip: 'Worm tự lây lan mà không cần bạn mở file nào.' },

    { id: 'virus', img: 'img/pz-defense/zom_virus.png', name: 'Virus Lây Lan', hp: 45, speed: 1.0,
      dmgToDef: 0.35, breachDmg: 6, reward: 3, mechanic: 'infect',
      auraRadius: 70, buffMult: 1.35,
      tip: 'Virus cần 1 file/vật chủ để phát tán — khác Worm ở chỗ đó.' },

    { id: 'trojan', img: 'img/pz-defense/zom_trojan.png', name: 'Trojan Ẩn Danh', hp: 120, speed: 0.55,
      dmgToDef: 0.6, breachDmg: 14, reward: 4, mechanic: 'disguise',
      revealAfterCols: 2,
      tip: 'Trojan trông vô hại — luôn kiểm tra nguồn trước khi cài phần mềm lạ.' },

    { id: 'adware', img: 'img/pz-defense/zom_adware.png', name: 'Adware', hp: 26, speed: 0.85,
      dmgToDef: 0, breachDmg: 3, reward: 2, mechanic: 'debuff-lane',
      laneRateMult: 1.7,
      tip: 'Adware gây phiền nhưng thường không đánh cắp dữ liệu trực tiếp.' },

    { id: 'spyware', img: 'img/pz-defense/zom_spyware.png', name: 'Spyware', hp: 40, speed: 0.8,
      dmgToDef: 0.3, breachDmg: 0, reward: 5, mechanic: 'stealth',
      stealAmount: 26,
      tip: 'Spyware âm thầm theo dõi — antivirus + tường lửa giúp phát hiện sớm.' },

    { id: 'ransom', img: 'img/pz-defense/zom_ransom.png', name: 'Ransomware', hp: 230, speed: 0.4,
      dmgToDef: 1.0, breachDmg: 22, reward: 6, mechanic: 'lock',
      lockChance: 0.4, lockFrames: 110,
      tip: 'Ransomware khóa dữ liệu để đòi tiền — sao lưu định kỳ là cách phòng thủ tốt nhất.' },

    { id: 'phishing', img: 'img/pz-defense/zom_phishing.png', name: 'Phishing', hp: 50, speed: 0.7,
      dmgToDef: 0.5, breachDmg: 10, reward: 4, mechanic: 'hijack',
      hijackFrames: 260,
      tip: 'Phishing khai thác SỰ CHỦ QUAN của con người, không phải lỗ hổng kỹ thuật.' },

    { id: 'rootkit', img: 'img/pz-defense/zom_rootkit.png', name: 'Rootkit', hp: 150, speed: 0.5,
      dmgToDef: 0.55, breachDmg: 16, reward: 6, mechanic: 'resist',
      resistHitsNeeded: 5, resistDmgMult: 0.4,
      tip: 'Rootkit ẩn sâu tới mức đôi khi phải cài lại hệ điều hành mới gỡ hết.' },

    { id: 'logicbomb', img: 'img/pz-defense/zom_logicbomb.png', name: 'Logic Bomb', hp: 140, speed: 0.45,
      dmgToDef: 0.5, breachDmg: 18, reward: 7, mechanic: 'timed-bomb',
      fuseFrames: 430, blastDmg: 110, blastRadius: 95,
      tip: 'Logic Bomb có thể nằm im hàng tháng trước khi kích hoạt theo điều kiện định sẵn.' },

    { id: 'sqlinjection', img: 'img/pz-defense/zom_sqlinjection.png', name: 'SQL Injection', hp: 65, speed: 0.6,
      dmgToDef: 0.5, breachDmg: 12, reward: 5, mechanic: 'pierce',
      pierceDmgMult: 0.55,
      tip: 'SQL Injection khai thác ô nhập liệu không được kiểm tra kỹ (input validation).' },

    { id: 'boss', img: 'img/pz-defense/zom_botnet.png', name: 'Trùm Botnet', hp: 950, speed: 0.28,
      dmgToDef: 1.8, breachDmg: 40, reward: 25, mechanic: 'summon',
      summonFrames: 260, summonId: 'worm', summonCount: 2,
      tip: 'Botnet là mạng lưới máy đã nhiễm bị điều khiển từ xa để tấn công đồng loạt.' },

    { id: 'ddos', img: 'img/pz-defense/zom_ddos.png', name: 'DDoS', hp: 16, speed: 0.9,
      dmgToDef: 0.2, breachDmg: 4, reward: 2, mechanic: 'flood',
      tip: 'DDoS làm sập dịch vụ bằng LƯU LƯỢNG chứ không cần khai thác lỗ hổng nào.' }
  ];
  var ZOMBIE_BY_ID = {};
  ZOMBIE_TYPES.forEach(function (z) { ZOMBIE_BY_ID[z.id] = z; });

  // ── 13 đợt: 12 đợt giới thiệu lần lượt từng tác nhân (đợt cuối
  //    của mỗi đợt luôn trộn thêm tác nhân cũ) + 1 đợt "Thử thách
  //    cuối" trộn mọi tác nhân đặc biệt. `burst:true` = spawn dồn
  //    dập gần như cùng lúc (dùng cho đợt DDoS). ──
  var WAVES = [
    { worm: 6 },
    { worm: 4, virus: 4 },
    { worm: 3, virus: 3, trojan: 3 },
    { worm: 2, virus: 2, trojan: 2, adware: 5 },
    { trojan: 3, virus: 3, adware: 3, spyware: 3 },
    { trojan: 3, spyware: 3, ransom: 3, virus: 2 },
    { ransom: 2, spyware: 2, phishing: 4, trojan: 2 },
    { phishing: 3, rootkit: 3, trojan: 2, ransom: 2 },
    { rootkit: 3, logicbomb: 3, spyware: 2, virus: 3 },
    { logicbomb: 3, sqlinjection: 3, rootkit: 2, trojan: 2 },
    { sqlinjection: 3, ransom: 2, phishing: 2, boss: 1 },
    { ddos: 16, worm: 4, virus: 4, trojan: 3, burst: true },
    { trojan: 3, ransom: 2, rootkit: 2, sqlinjection: 2, boss: 1, phishing: 2 }
  ];
  var LEVEL_TIPS = ZOMBIE_TYPES.reduce(function (acc, z) { acc[z.id] = z.tip; return acc; }, {});
  var WAVE_FINAL_TIP = 'Đợt Thử Thách: bạn đã gặp đủ 12 tác nhân — ôn lại bằng cách nhớ mỗi loại tương ứng khái niệm IC3 nào!';
  var TOTAL_WAVES = WAVES.length;

  // Đợt nào giới thiệu tác nhân nào lần đầu (để chọn tip hiện lên
  // sau khi qua đợt đó) — suy ra tự động từ WAVES: đợt i giới
  // thiệu tác nhân đầu tiên CHƯA từng xuất hiện ở các đợt trước.
  var seenIds = {};
  var WAVE_INTRO_TIP = WAVES.map(function (comp, idx) {
    if (idx === WAVES.length - 1) return WAVE_FINAL_TIP;
    var introduced = null;
    Object.keys(comp).forEach(function (zid) {
      if (zid === 'burst') return;
      if (!seenIds[zid]) { introduced = zid; }
      seenIds[zid] = true;
    });
    return introduced ? LEVEL_TIPS[introduced] : 'Đợt hỗn hợp — phối hợp nhiều loại lá chắn cùng lúc!';
  });

  // ── Thông số lưới / bàn chơi ──
  var TABLE_W = 640, TABLE_H = 320;
  var GRID_LEFT = 78, GRID_TOP = 14;
  var COLS = 8, ROWS = 5;
  var CELL_W = 66, CELL_H = 58;
  var GRID_RIGHT = GRID_LEFT + COLS * CELL_W;
  var GRID_BOTTOM = GRID_TOP + ROWS * CELL_H;
  var DEF_HALF = 22, ZOMBIE_HALF = 20;
  var SPAWN_X = GRID_RIGHT + 26;
  var REVEAL_X_PER_COL = CELL_W; // ngưỡng "lộ diện" tính theo số cột đã đi qua
  var PREP_FRAMES = 300;      // ~5s chuẩn bị giữa các đợt
  var DATA_START = 150;

  // ── Sun (☀️): thay hẳn cơ chế "tự sinh đều" cũ bằng kiểu PvZ gốc —
  //    Sun rơi ngẫu nhiên từ trời + linh vật "generator" (Excel/Bàn
  //    phím/Máy in) không cộng thẳng vào Dữ liệu nữa mà "nảy" ra 1
  //    cục Sun tại chỗ — người chơi phải BẤM vào mới thu được. ──
  var SKY_SUN_INITIAL_DELAY = 150;   // ~2.5s tới cục Sun trời đầu tiên
  var SKY_SUN_MIN_FRAMES = 460;      // ~7.7s
  var SKY_SUN_MAX_FRAMES = 620;      // ~10.3s
  var SKY_SUN_VALUE = 25;
  var SKY_SUN_FALL_SPEED = 0.85;
  var SUN_LIFE_FRAMES = 560;         // Sun đứng yên bao lâu trước khi biến mất nếu không bấm
  var PLANT_SUN_LIFE_FRAMES = 380;
  var SUN_CLICK_RADIUS = 18;

  // ── Tốc độ game tổng thể: mỗi khung hình thực (raf, ~60fps) chỉ
  //    cộng dồn FRAME_STEP "khung hình logic" thay vì đúng 1 — mọi thứ
  //    di chuyển/đếm giờ (zombie, đạn, cooldown, Sun rơi, spawn...)
  //    đều chậm lại theo đúng tỉ lệ này vì tất cả cùng chạy qua step().
  //    Giảm số này (vd. 0.5) để chậm hơn nữa, tăng lên gần 1 để nhanh
  //    hơn (1 = tốc độ gốc trước đây). ──
  var FRAME_STEP = 0.6;
  var frameAcc = 0;
  var animClock = 0; // đồng hồ hoạt ảnh riêng — luôn chạy mượt mỗi khung hình thật (raf),
                      // không bị chậm theo FRAME_STEP, để dáng đi/tấn công của zombie
                      // không bị giật dù tốc độ game đã chậm lại.

  // Zombie di chuyển chậm hơn hẳn (độc lập với FRAME_STEP ở trên) —
  // nhân thêm vào def.speed của mọi tác nhân tấn công. Giảm mạnh so
  // với trước để cảm giác "thong thả" ngay từ Đợt 1, rồi tăng dần
  // theo waveIdx (xem waveSpeedMult) để độ khó đi từ dễ → khó thay vì
  // đều tay suốt 13 đợt.
  var ZOMBIE_SPEED_MULT = 0.32;
  var WAVE_SPEED_MIN = 0.8;   // hệ số tốc độ ở Đợt 1 — chậm, dễ làm quen
  var WAVE_SPEED_MAX = 1.35;  // hệ số tốc độ ở Đợt cuối — nhanh hơn hẳn, thử thách thật sự
  function waveSpeedMult() {
    if (TOTAL_WAVES <= 1) return WAVE_SPEED_MIN;
    var t = waveIdx / (TOTAL_WAVES - 1); // 0 ở Đợt 1 → 1 ở Đợt cuối
    return WAVE_SPEED_MIN + (WAVE_SPEED_MAX - WAVE_SPEED_MIN) * t;
  }

  var canvas, ctx, dpr = 1;
  var images = {}, zombieImages = {}, imagesReady = false;

  // ── Chọn đội hình trước trận: giới hạn đúng LOADOUT_SIZE linh vật
  //    trong tổng số DEF_TYPES được mang vào shop mỗi ván. Chọn lại
  //    mỗi khi bấm "Chơi lại" (xem showLoadoutOverlay trong resetGame). ──
  var LOADOUT_SIZE = 7;
  var loadoutSelected = [];   // mảng id linh vật đã chọn (tối đa LOADOUT_SIZE)
  var loadoutConfirmed = false;
  var activeDefTypes = [];    // DEF_TYPES đã lọc theo loadoutSelected — dùng khi vào trận

  var data = 0;
  var serverHP = 200, serverMaxHP = 200;
  var waveIdx = 0;
  var wavesCleared = 0;
  var killCount = 0;
  var gameState = 'prep';   // 'prep' | 'spawning' | 'clearing'
  var prepTimer = 0;
  var skySunTimer = 0;
  var spawnQueue = [], spawnedIdx = 0, spawnTimer = 0, spawnGap = 60;
  var gameOver = false, victory = false;

  var occ = [];             // occ[row][col] = defender | null
  var defenders = [], zombies = [], projectiles = [];
  var suns = [];             // {x,y,vy,landed,lifeTimer,value}
  var floatTexts = [];       // {x,y,text,life} — chữ "+25" bay lên khi hứng Sun
  var mowers = [];           // {row, alive, sweepTimer} — 1 xe cắt cỏ / hàng, cứu 1 lần
  var cooldowns = {};        // cooldowns[defId] = số khung hình còn phải chờ mới đặt lại được
  var selectedDefId = null;
  var hoverCell = null;

  var els = {};

  function $(id) { return document.getElementById(id); }

  function preloadImages(cb) {
    var toLoad = DEF_TYPES.length + ZOMBIE_TYPES.length;
    if (toLoad === 0) { cb(); return; }
    function done() { toLoad--; if (toLoad <= 0) { imagesReady = true; cb(); } }
    DEF_TYPES.forEach(function (d) {
      if (!d.img) { done(); return; } // linh vật dùng emoji (vd. Công Tắc Ngắt Khẩn) — không có ảnh để tải
      var img = new Image();
      img.onload = img.onerror = done;
      img.src = d.img;
      images[d.id] = img;
    });
    ZOMBIE_TYPES.forEach(function (z) {
      var img = new Image();
      img.onload = img.onerror = done;
      img.src = z.img;
      zombieImages[z.id] = img;
    });
  }

  function cellX(col) { return GRID_LEFT + col * CELL_W + CELL_W / 2; }
  function cellY(row) { return GRID_TOP + row * CELL_H + CELL_H / 2; }

  function resetOcc() {
    occ = [];
    for (var r = 0; r < ROWS; r++) {
      occ.push(new Array(COLS).fill(null));
    }
  }

  // ── Khởi động lại toàn bộ ván chơi ──
  function resetGame() {
    data = DATA_START;
    serverHP = serverMaxHP = 200;
    waveIdx = 0;
    wavesCleared = 0;
    killCount = 0;
    gameState = 'prep';
    prepTimer = PREP_FRAMES;
    skySunTimer = SKY_SUN_INITIAL_DELAY;
    spawnQueue = []; spawnedIdx = 0; spawnTimer = 0;
    gameOver = false; victory = false;
    defenders = []; zombies = []; projectiles = [];
    suns = []; floatTexts = [];
    mowers = [];
    for (var r = 0; r < ROWS; r++) mowers.push({ row: r, alive: true, sweepTimer: 0 });
    cooldowns = {};
    DEF_TYPES.forEach(function (t) { cooldowns[t.id] = 0; });
    selectedDefId = null; hoverCell = null;
    resetOcc();
    updateHUD();
    hideOverlay();
    frameAcc = 0;
    // Mỗi ván mới (kể cả bấm "Chơi lại") đều phải chọn lại đội hình
    // 7 linh vật trước khi trận thật sự chạy — xem showLoadoutOverlay.
    loadoutConfirmed = false;
    activeDefTypes = [];
    buildShopUI();
    showLoadoutOverlay();
  }

  function buildSpawnList(idx) {
    var comp = WAVES[idx];
    var list = [];
    Object.keys(comp).forEach(function (zid) {
      if (zid === 'burst') return;
      for (var i = 0; i < comp[zid]; i++) list.push(zid);
    });
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    return list;
  }

  function startWave(idx) {
    gameState = 'spawning';
    spawnQueue = buildSpawnList(idx);
    spawnedIdx = 0;
    var burst = !!WAVES[idx].burst;
    spawnGap = burst ? 9 : Math.max(24, 62 - idx * 5);
    spawnTimer = 12;
    showToast('🌊 Đợt ' + (idx + 1) + '/' + TOTAL_WAVES + ' bắt đầu — mã độc đang tới!', 2600);
  }

  // ── Vòng lặp chính ──
  // FRAME_STEP < 1 làm chậm toàn bộ game một cách đồng nhất: thay vì
  // chạy đúng 1 "khung hình logic" mỗi lần raf gọi step() (~60 lần/
  // giây), ta chỉ cộng dồn FRAME_STEP vào frameAcc và chỉ thực sự
  // update khi frameAcc đạt ngưỡng 1 — nghĩa là zombie/đạn di chuyển
  // chậm hơn, cooldown/hồi chiêu/Sun rơi/spawn đều giãn ra đúng cùng
  // 1 tỉ lệ vì tất cả cùng nằm trong khối update bên dưới.
  function step() {
    animClock++;
    frameAcc += FRAME_STEP;
    while (frameAcc >= 1) {
      frameAcc -= 1;
      if (!gameOver && loadoutConfirmed) {
        updateSuns();
        updateCooldowns();
        updateMowers();
        updateSpawning();
        updateZombies();
        updateDefenders();
        updateProjectiles();
        updateFloatTexts();
      }
    }
    render();
    requestAnimationFrame(step);
  }

  // ── Sun rơi từ trời (kiểu PvZ gốc) — người chơi phải bấm để hứng ──
  function updateSuns() {
    skySunTimer--;
    if (skySunTimer <= 0) {
      var row = Math.floor(Math.random() * ROWS);
      suns.push({
        x: GRID_LEFT + 30 + Math.random() * (COLS * CELL_W - 60),
        y: GRID_TOP - 12, vy: SKY_SUN_FALL_SPEED,
        restY: cellY(row), landed: false, lifeTimer: SUN_LIFE_FRAMES,
        value: SKY_SUN_VALUE
      });
      skySunTimer = SKY_SUN_MIN_FRAMES + Math.random() * (SKY_SUN_MAX_FRAMES - SKY_SUN_MIN_FRAMES);
    }
    for (var i = suns.length - 1; i >= 0; i--) {
      var s = suns[i];
      if (!s.landed) {
        s.y += s.vy;
        if (s.y >= s.restY) { s.y = s.restY; s.landed = true; }
      } else {
        s.lifeTimer--;
        if (s.lifeTimer <= 0) suns.splice(i, 1);
      }
    }
  }

  function updateCooldowns() {
    var changed = false;
    Object.keys(cooldowns).forEach(function (id) {
      if (cooldowns[id] > 0) {
        cooldowns[id]--;
        changed = true;
      }
    });
    if (changed) refreshShopAffordability();
  }

  // ── Xe cắt cỏ (Lawnmower): chỉ đếm ngược hiệu ứng "vừa quét" ──
  function updateMowers() {
    mowers.forEach(function (m) { if (m.sweepTimer > 0) m.sweepTimer--; });
  }

  function updateFloatTexts() {
    for (var i = floatTexts.length - 1; i >= 0; i--) {
      var f = floatTexts[i];
      f.y -= 0.6; f.life--;
      if (f.life <= 0) floatTexts.splice(i, 1);
    }
  }

  function collectSun(idx) {
    var s = suns[idx];
    if (!s) return;
    data += s.value;
    floatTexts.push({ x: s.x, y: s.y, text: '+' + s.value, life: 40 });
    suns.splice(idx, 1);
    refreshShopAffordability();
    updateHUD();
  }

  function updateSpawning() {
    if (gameState === 'prep') {
      prepTimer--;
      if (prepTimer <= 0) startWave(waveIdx);
      return;
    }
    if (gameState === 'spawning') {
      spawnTimer--;
      if (spawnTimer <= 0 && spawnedIdx < spawnQueue.length) {
        spawnZombie(spawnQueue[spawnedIdx]);
        spawnedIdx++;
        spawnTimer = spawnGap;
      }
      if (spawnedIdx >= spawnQueue.length) gameState = 'clearing';
      return;
    }
    if (gameState === 'clearing') {
      if (zombies.length === 0) {
        wavesCleared++;
        var tip = WAVE_INTRO_TIP[waveIdx];
        waveIdx++;
        if (waveIdx >= TOTAL_WAVES) {
          endGame(true);
        } else {
          gameState = 'prep';
          prepTimer = PREP_FRAMES;
          showToast('✅ Đợt ' + wavesCleared + '/' + TOTAL_WAVES + ' xong! 💡 ' + tip, 4200);
          updateHUD();
        }
      }
    }
  }

  function spawnZombie(zid, opts) {
    var def = ZOMBIE_BY_ID[zid];
    if (!def) return;
    opts = opts || {};
    var row = (opts.row != null) ? opts.row : Math.floor(Math.random() * ROWS);
    var z = {
      zid: zid, def: def, row: row,
      x: (opts.x != null ? opts.x : SPAWN_X), y: cellY(row),
      hp: opts.hp || def.hp, maxHp: opts.hp || def.hp,
      attacking: null, alive: true,
      // — trạng thái riêng theo mechanic —
      revealed: def.mechanic !== 'disguise' && def.mechanic !== 'stealth',
      hitsTaken: 0,
      hasSplit: !!opts.hasSplit,
      fuseTimer: def.fuseFrames || 0,
      summonTimer: def.summonFrames || 0,
      lockRolled: false,
      freezeTimer: 0,
      walkPhase: Math.random() * Math.PI * 2 // lệch pha ngẫu nhiên để bầy zombie không "đồng bộ" lắc y hệt nhau
    };
    zombies.push(z);
    return z;
  }

  function getLaneSlowFactor(row) {
    var f = 1;
    defenders.forEach(function (d) {
      if (d.alive && d.row === row && d.type.type === 'slow') f = Math.min(f, d.type.slowFactor);
    });
    return f;
  }

  function laneHasScanner(row) {
    return defenders.some(function (d) { return d.alive && d.row === row && d.type.type === 'scanner'; });
  }

  // Gmail Lọc Thư Rác: có lá chắn miễn nhiễm `mechanic` này trong hàng không
  function laneHasImmunity(row, mechanic) {
    return defenders.some(function (d) { return d.alive && d.row === row && d.type.immuneTo === mechanic; });
  }

  // Copilot Trợ Lý: hệ số buff sát thương / tốc độ bắn cho "bắn hạ" cùng hàng
  function laneBuff(row) {
    var buff = { dmg: 1, rate: 1 };
    defenders.forEach(function (d) {
      if (!d.alive || d.row !== row || d.type.type !== 'buff') return;
      buff.dmg = Math.max(buff.dmg, d.type.buffDmgMult);
      buff.rate = Math.min(buff.rate, d.type.buffRateMult);
    });
    return buff;
  }

  function laneFireRateMult(row) {
    var mult = 1;
    zombies.forEach(function (z) {
      if (z.alive && z.row === row && z.def.mechanic === 'debuff-lane') mult = Math.max(mult, z.def.laneRateMult);
    });
    return mult;
  }

  // Tác nhân có đang bị "ẩn" khỏi tầm khóa mục tiêu của lá chắn
  // bắn hạ hay không (Trojan trước khi lộ diện / Spyware chưa bị
  // dò quét) — không ảnh hưởng việc bị lá chắn "chặn đường" vật lý.
  function isTargetable(z) {
    if (z.def.mechanic === 'disguise' || z.def.mechanic === 'stealth') {
      return z.revealed || laneHasScanner(z.row);
    }
    return true;
  }

  function findBlockerAt(row, prospectiveX, zombieCurrentX) {
    var blocker = null;
    defenders.forEach(function (d) {
      if (!d.alive || d.row !== row) return;
      if (d.x >= zombieCurrentX) return; // lá chắn phải ở phía bên trái (đã đi qua) zombie
      if (zombieCurrentX - d.x <= (DEF_HALF + ZOMBIE_HALF) || prospectiveX - d.x <= (DEF_HALF + ZOMBIE_HALF)) {
        if (!blocker || d.x > blocker.x) blocker = d; // ưu tiên lá chắn gần nhất (x lớn nhất)
      }
    });
    return blocker;
  }

  // lá chắn đứng ngay phía SAU (bên trái) 1 lá chắn khác, cùng hàng
  function findDefenderBehind(row, x) {
    var behind = null;
    defenders.forEach(function (d) {
      if (!d.alive || d.row !== row) return;
      if (d.x >= x) return;
      if (!behind || d.x > behind.x) behind = d;
    });
    return behind;
  }

  function stunDefender(d, frames) {
    d.stunned = true;
    d.stunTimer = Math.max(d.stunTimer || 0, frames);
  }

  function explodeLogicBomb(z) {
    defenders.forEach(function (d) {
      if (!d.alive || d.row !== z.row) return;
      if (Math.abs(d.x - z.x) <= z.def.blastRadius) {
        d.hp -= z.def.blastDmg;
        if (d.hp <= 0) { d.alive = false; occ[d.row][d.col] = null; removeDefender(d); }
      }
    });
    showToast('💣 Logic Bomb phát nổ! Lá chắn lân cận bị thiệt hại nặng.', 1800);
  }

  function killZombie(z, opts) {
    opts = opts || {};
    z.alive = false;
    if (!opts.silent) {
      killCount++;
      data += z.def.reward;
      refreshShopAffordability();
    }
    if (z.def.mechanic === 'split' && !z.hasSplit) {
      for (var i = 0; i < z.def.splitCount; i++) {
        spawnZombie('worm', {
          row: z.row,
          x: z.x + (i === 0 ? -14 : 14),
          hp: Math.max(8, Math.round(z.def.hp * z.def.splitHpFactor)),
          hasSplit: true
        });
      }
      showToast('🐛 Worm tự nhân bản khi bị hạ!', 1400);
    }
  }

  function updateZombies() {
    // Virus: lan tỏa buff tốc độ cho đồng loại lân cận cùng hàng
    zombies.forEach(function (z) {
      z.buffed = false;
    });
    zombies.forEach(function (v) {
      if (!v.alive || v.def.mechanic !== 'infect') return;
      zombies.forEach(function (z) {
        if (z === v || !z.alive || z.row !== v.row) return;
        if (Math.abs(z.x - v.x) <= v.def.auraRadius) z.buffed = true;
      });
    });

    for (var i = zombies.length - 1; i >= 0; i--) {
      var z = zombies[i];
      if (!z.alive) { zombies.splice(i, 1); continue; }

      // — Logic Bomb: đồng hồ đếm ngược, hết giờ thì nổ diện rộng —
      if (z.def.mechanic === 'timed-bomb') {
        z.fuseTimer--;
        if (z.fuseTimer <= 0) {
          explodeLogicBomb(z);
          killZombie(z, { silent: true });
          zombies.splice(i, 1);
          continue;
        }
      }

      // — Trùm Botnet: định kỳ triệu hồi thêm Worm —
      if (z.def.mechanic === 'summon') {
        z.summonTimer--;
        if (z.summonTimer <= 0) {
          z.summonTimer = z.def.summonFrames;
          for (var s = 0; s < z.def.summonCount; s++) {
            spawnZombie(z.def.summonId, { row: Math.floor(Math.random() * ROWS) });
          }
          showToast('👑 Trùm Botnet vừa ra lệnh triệu hồi thêm quân!', 1600);
        }
      }

      // — Trojan: tự lộ diện sau khi đi qua N cột kể từ lúc xuất hiện —
      if (z.def.mechanic === 'disguise' && !z.revealed) {
        if (SPAWN_X - z.x >= z.def.revealAfterCols * REVEAL_X_PER_COL) z.revealed = true;
      }

      if (z.attacking) {
        var d = z.attacking;
        if (!d.alive) { z.attacking = null; z.lockRolled = false; continue; }

        // — Ransomware: khi vừa chạm, có % khóa (stun) lá chắn thay vì chỉ trừ máu —
        if (z.def.mechanic === 'lock' && !z.lockRolled) {
          z.lockRolled = true;
          if (Math.random() < z.def.lockChance) {
            stunDefender(d, z.def.lockFrames);
            showToast('🔒 Ransomware đã khóa tạm 1 lá chắn!', 1400);
          }
        }
        // — Phishing: "câu" lá chắn — vô hiệu hóa bắn cho tới khi người chơi bấm xác minh —
        // (Gmail Lọc Thư Rác cùng hàng → miễn nhiễm, không bị câu) —
        if (z.def.mechanic === 'hijack' && !d.hijacked && !laneHasImmunity(z.row, 'hijack')) {
          d.hijacked = true;
          d.verified = false;
          d.hijackTimer = z.def.hijackFrames;
        }

        d.hp -= z.def.dmgToDef;

        // — SQL Injection: xuyên qua lá chắn chắn đường, trúng luôn lá chắn phía sau —
        if (z.def.mechanic === 'pierce') {
          var behind = findDefenderBehind(z.row, d.x);
          if (behind) {
            behind.hp -= z.def.dmgToDef * z.def.pierceDmgMult;
            if (behind.hp <= 0) { behind.alive = false; occ[behind.row][behind.col] = null; removeDefender(behind); }
          }
        }

        if (d.hp <= 0) {
          d.alive = false;
          occ[d.row][d.col] = null;
          removeDefender(d);
          z.attacking = null;
          z.lockRolled = false;
        }
        continue;
      }

      // — Zoom Họp Khẩn: đang bị "đóng băng" thì đứng yên tại chỗ —
      if (z.freezeTimer > 0) { z.freezeTimer--; continue; }

      var slow = getLaneSlowFactor(z.row);
      var speedMult = z.buffed ? 1.35 : 1;
      var nextX = z.x - z.def.speed * ZOMBIE_SPEED_MULT * waveSpeedMult() * slow * speedMult;
      var blocker = findBlockerAt(z.row, nextX, z.x);
      if (blocker) {
        z.attacking = blocker;
        z.x = blocker.x + DEF_HALF + ZOMBIE_HALF;
        continue;
      }
      z.x = nextX;
      if (z.x <= GRID_LEFT) {
        breach(z);
        zombies.splice(i, 1);
      }
    }
  }

  function breach(z) {
    if (z.def.mechanic === 'stealth') {
      data = Math.max(0, data - z.def.stealAmount);
      showToast('🕵️ ' + z.def.name + ' đã đánh cắp ' + z.def.stealAmount + ' Dữ liệu (không trừ máu Server)!', 2200);
      updateHUD();
      refreshShopAffordability();
      return;
    }

    // Xe cắt cỏ: mạng chót của MỖI hàng, cứu 1 lần — quét sạch toàn bộ
    // tác nhân đang có trong hàng đó thay vì trừ máu Server, rồi "hết đạn".
    var mower = mowers[z.row];
    if (mower && mower.alive) {
      mower.alive = false;
      mower.sweepTimer = 26;
      zombies.forEach(function (zz) { if (zz.alive && zz.row === z.row) zz.alive = false; });
      showToast('🚜 Xe cắt cỏ hàng ' + (z.row + 1) + ' đã quét sạch — Server không mất máu lần này! (Hàng này hết mạng chót)', 2600);
      return;
    }

    serverHP -= z.def.breachDmg;
    showToast('⚠️ ' + z.def.name + ' đã xâm nhập Server! (-' + z.def.breachDmg + ' máu)', 2000);
    updateHUD();
    if (serverHP <= 0) { serverHP = 0; endGame(false); }
  }

  function removeDefender(d) {
    var idx = defenders.indexOf(d);
    if (idx >= 0) defenders.splice(idx, 1);
  }

  function updateDefenders() {
    defenders.forEach(function (d) {
      if (!d.alive) return;

      if (d.stunned) {
        d.stunTimer--;
        if (d.stunTimer <= 0) d.stunned = false;
        return; // lá chắn bị khóa: không sinh Dữ liệu, không bắn
      }

      // Phishing: nếu bị "câu" mà người chơi không bấm xác minh, tự
      // khôi phục sau `hijackFrames` (đúng như z.def.hijackFrames đã
      // gán lúc hijack) — trước đây hijackTimer bị gán nhưng không ai
      // đếm ngược nên lá chắn bị khóa vĩnh viễn nếu người chơi bỏ sót.
      if (d.hijacked && !d.verified) {
        d.hijackTimer--;
        if (d.hijackTimer <= 0) {
          d.hijacked = false;
          d.verified = false;
          d.hijackTimer = 0;
          showToast('✅ ' + d.type.name + ' tự khôi phục sau khi hết thời gian bị "câu".', 1600);
        }
      }

      // Windows Tường Lửa: tự hồi máu mỗi khung hình cho tới khi đầy
      if (d.type.regenPerTick && d.hp < d.maxHp) {
        d.hp = Math.min(d.maxHp, d.hp + d.type.regenPerTick);
      }

      if (d.type.type === 'generator') {
        d.genCooldown--;
        if (d.genCooldown <= 0) {
          // Không cộng thẳng vào Dữ liệu nữa — "nảy" ra 1 cục Sun tại
          // chỗ, người chơi phải bấm vào mới thu được (giống PvZ gốc).
          suns.push({
            x: d.x + (Math.random() * 12 - 6), y: d.y - 6,
            vy: 0, restY: d.y - 6, landed: true,
            lifeTimer: PLANT_SUN_LIFE_FRAMES, value: d.type.genAmount
          });
          d.genCooldown = d.type.genFrames;
        }
      } else if (d.type.type === 'bomb') {
        // Công Tắc Ngắt Khẩn: ngòi nổ ngắn rồi kích nổ diện rộng, tự hủy
        if (d.fuseTimer == null) d.fuseTimer = d.type.fuseFrames;
        d.fuseTimer--;
        if (d.fuseTimer <= 0) {
          var boomHit = false;
          zombies.forEach(function (z) {
            if (!z.alive) return;
            var dx = z.x - d.x, dy = z.y - d.y;
            if (Math.sqrt(dx * dx + dy * dy) <= d.type.blastRadius) {
              z.hp -= d.type.blastDmg;
              z.hitFlash = 10;
              boomHit = true;
              if (z.hp <= 0) killZombie(z);
            }
          });
          d.alive = false;
          occ[d.row][d.col] = null;
          showToast('⚡ ' + d.type.name + ' đã kích nổ!', 1600);
          if (boomHit) updateHUD();
        }
      } else if (d.type.type === 'shooter') {
        if (d.hijacked && !d.verified) return; // Phishing: chưa xác minh thì không bắn
        d.shootCooldown--;
        if (d.shootCooldown <= 0) {
          var hasTarget = zombies.some(function (z) { return z.row === d.row && isTargetable(z); });
          if (hasTarget) {
            var buff = laneBuff(d.row); // Copilot Trợ Lý: buff sát thương/tốc độ bắn cùng hàng
            projectiles.push({ x: d.x, y: d.y, row: d.row, dmg: d.type.dmg * buff.dmg, speed: d.type.projSpeed, color: d.type.ring });
            d.shootCooldown = Math.round(d.type.rateFrames * laneFireRateMult(d.row) * buff.rate);
          }
        }
      } else if (d.type.type === 'aoe') {
        // PowerPoint Phát Sóng: định kỳ gây sát thương nhẹ cho CẢ hàng
        d.shootCooldown = (d.shootCooldown == null) ? d.type.rateFrames : d.shootCooldown - 1;
        if (d.shootCooldown <= 0) {
          d.shootCooldown = d.type.rateFrames;
          var hit = false;
          zombies.forEach(function (z) {
            if (!z.alive || z.row !== d.row || !isTargetable(z)) return;
            hit = true;
            z.hp -= d.type.dmg;
            z.hitFlash = 8;
            if (z.hp <= 0) killZombie(z);
          });
          if (hit) updateHUD();
        }
      } else if (d.type.type === 'freeze') {
        // Zoom Họp Khẩn: định kỳ đóng băng cả hàng vài giây
        d.freezeCooldown = (d.freezeCooldown == null) ? d.type.freezeIntervalFrames : d.freezeCooldown - 1;
        if (d.freezeCooldown <= 0) {
          d.freezeCooldown = d.type.freezeIntervalFrames;
          var froze = false;
          zombies.forEach(function (z) {
            if (!z.alive || z.row !== d.row || !isTargetable(z)) return;
            z.freezeTimer = Math.max(z.freezeTimer, d.type.freezeFrames);
            froze = true;
          });
          if (froze) showToast('🥶 Zoom Họp Khẩn đóng băng cả hàng!', 1400);
        }
      } else if (d.type.type === 'restore') {
        // Ổ Cứng Sao Lưu: hồi máu Server + giải khóa lá chắn bị Ransomware khóa cùng hàng
        d.healCooldown = (d.healCooldown == null) ? d.type.healFrames : d.healCooldown - 1;
        if (d.healCooldown <= 0) {
          d.healCooldown = d.type.healFrames;
          if (serverHP < serverMaxHP) {
            serverHP = Math.min(serverMaxHP, serverHP + d.type.healAmount);
            updateHUD();
          }
          defenders.forEach(function (other) {
            if (other.alive && other.row === d.row && other.stunned) other.stunned = false;
          });
        }
      }
    });
    // Dọn các lá chắn vừa chết trong khung hình này (vd. bomb vừa nổ)
    // — lọc sau forEach thay vì splice() ngay trong lúc lặp để tránh
    // bỏ sót phần tử kế tiếp.
    for (var i = defenders.length - 1; i >= 0; i--) {
      if (!defenders[i].alive) defenders.splice(i, 1);
    }
  }

  function updateProjectiles() {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i];
      p.x += p.speed;
      if (p.x > GRID_RIGHT + 40) { projectiles.splice(i, 1); continue; }
      var hitIdx = -1;
      for (var j = 0; j < zombies.length; j++) {
        var z = zombies[j];
        if (z.row === p.row && isTargetable(z) && Math.abs(z.x - p.x) < ZOMBIE_HALF) { hitIdx = j; break; }
      }
      if (hitIdx >= 0) {
        var target = zombies[hitIdx];
        var dmg = p.dmg;
        // — Rootkit: kháng phần lớn sát thương cho tới khi trúng đủ N phát —
        if (target.def.mechanic === 'resist' && target.hitsTaken < target.def.resistHitsNeeded && !laneHasScanner(target.row)) {
          dmg = p.dmg * target.def.resistDmgMult;
        }
        target.hitsTaken++;
        target.hp -= dmg;
        target.hitFlash = 8;
        projectiles.splice(i, 1);
        if (target.hp <= 0) {
          killZombie(target);
        }
        updateHUD();
      }
    }
  }

  function endGame(win) {
    gameOver = true;
    victory = win;
    var statsText = 'Mã độc đã tiêu diệt: ' + killCount + '\nĐợt đã vượt qua: ' + wavesCleared + '/' + TOTAL_WAVES;
    if (win) {
      showOverlay('🏆', '🏆 Chiến Thắng!', 'Bạn đã bảo vệ Server thành công qua toàn bộ ' + TOTAL_WAVES + ' đợt tấn công — đủ 12 tác nhân!', statsText);
    } else {
      showOverlay('💥', '💥 Server Đã Bị Xâm Nhập!', 'Đội phòng thủ đã bị áp đảo ở đợt ' + Math.min(waveIdx + 1, TOTAL_WAVES) + '/' + TOTAL_WAVES + '.', statsText);
    }
    updateHUD();
  }

  // ── Đặt lá chắn / xác minh Phishing ──
  function tryPlaceAt(col, row) {
    if (gameOver) return;
    var existing = occ[row] ? occ[row][col] : null;

    // Bấm vào lá chắn đang bị Phishing "câu" (chưa chọn shop) → xác minh
    if (!selectedDefId && existing && existing.hijacked && !existing.verified) {
      existing.verified = true;
      showToast('✅ Đã xác minh — lá chắn hoạt động trở lại!', 1600);
      return;
    }

    if (!selectedDefId) { showToast('👆 Hãy chọn 1 lá chắn ở phía trên trước.', 1600); return; }
    if (col == null || row == null) return;
    if (existing) { showToast('⚠️ Ô này đã có lá chắn rồi.', 1400); return; }
    var type = DEF_BY_ID[selectedDefId];
    if (data < type.cost) { showToast('💾 Không đủ Dữ liệu — cần ' + type.cost + '.', 1600); return; }
    if ((cooldowns[type.id] || 0) > 0) {
      showToast('⏳ ' + type.name + ' đang hồi chiêu — chờ ' + Math.ceil(cooldowns[type.id] / 60) + 's nữa.', 1600);
      return;
    }

    data -= type.cost;
    cooldowns[type.id] = type.cooldownFrames || 300;
    var d = {
      type: type, row: row, col: col,
      x: cellX(col), y: cellY(row),
      hp: type.hp, maxHp: type.hp,
      alive: true,
      genCooldown: type.genFrames || 0,
      shootCooldown: Math.round((type.rateFrames || 0) * 0.4),
      fuseTimer: type.fuseFrames != null ? type.fuseFrames : null,
      stunned: false, stunTimer: 0,
      hijacked: false, verified: false, hijackTimer: 0
    };
    defenders.push(d);
    occ[row][col] = d;
    selectedDefId = null;
    refreshShopAffordability();
    buildShopUI();
    updateHUD();
  }

  // ── Vẽ ──
  function render() {
    ctx.save();
    ctx.clearRect(0, 0, TABLE_W, TABLE_H);

    // nền bàn
    var bgGrad = ctx.createLinearGradient(0, 0, 0, TABLE_H);
    bgGrad.addColorStop(0, '#161a34');
    bgGrad.addColorStop(1, '#0b0d20');
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, TABLE_W, TABLE_H, 16);
    ctx.fill();

    // khu vực Server bên trái
    var srvGrad = ctx.createLinearGradient(0, 0, GRID_LEFT, 0);
    srvGrad.addColorStop(0, 'rgba(79,107,255,.28)');
    srvGrad.addColorStop(1, 'rgba(79,107,255,.05)');
    ctx.fillStyle = srvGrad;
    ctx.fillRect(0, GRID_TOP - 4, GRID_LEFT, GRID_BOTTOM - GRID_TOP + 8);
    ctx.strokeStyle = 'rgba(143,164,255,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(GRID_LEFT, GRID_TOP - 4);
    ctx.lineTo(GRID_LEFT, GRID_BOTTOM + 4);
    ctx.stroke();

    // lưới các hàng/cột
    for (var r = 0; r < ROWS; r++) {
      var ry = GRID_TOP + r * CELL_H;
      ctx.fillStyle = (r % 2 === 0) ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.015)';
      ctx.fillRect(GRID_LEFT, ry, COLS * CELL_W, CELL_H);

      // icon server nhỏ ở đầu mỗi hàng
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🖥️', GRID_LEFT / 2, ry + CELL_H / 2 - 6);

      // Xe cắt cỏ — mạng chót của hàng này, cứu 1 lần rồi biến mất
      var mw = mowers[r];
      if (mw && mw.alive) {
        ctx.save();
        ctx.font = '15px sans-serif';
        ctx.fillText('🚜', GRID_LEFT / 2, ry + CELL_H - 10);
        ctx.restore();
      } else if (mw && mw.sweepTimer > 0) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, mw.sweepTimer / 26) * 0.35;
        ctx.fillStyle = '#35d18a';
        ctx.fillRect(GRID_LEFT, ry, COLS * CELL_W, CELL_H);
        ctx.restore();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    for (var c = 0; c <= COLS; c++) {
      var lx = GRID_LEFT + c * CELL_W;
      ctx.beginPath(); ctx.moveTo(lx, GRID_TOP); ctx.lineTo(lx, GRID_BOTTOM); ctx.stroke();
    }
    for (var rr = 0; rr <= ROWS; rr++) {
      var ly = GRID_TOP + rr * CELL_H;
      ctx.beginPath(); ctx.moveTo(GRID_LEFT, ly); ctx.lineTo(GRID_RIGHT, ly); ctx.stroke();
    }

    // ô đang hover (khi đã chọn 1 lá chắn)
    if (hoverCell && selectedDefId && !gameOver) {
      var canAfford = data >= DEF_BY_ID[selectedDefId].cost;
      var occupied = occ[hoverCell.row][hoverCell.col];
      var ok = canAfford && !occupied;
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = ok ? 'rgba(102,224,208,.9)' : 'rgba(226,59,59,.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(GRID_LEFT + hoverCell.col * CELL_W + 3, GRID_TOP + hoverCell.row * CELL_H + 3, CELL_W - 6, CELL_H - 6);
      ctx.restore();
    }

    // vùng cảnh báo mép phải (nơi zombie xuất hiện)
    var warnGrad = ctx.createLinearGradient(GRID_RIGHT - 20, 0, GRID_RIGHT + 20, 0);
    warnGrad.addColorStop(0, 'rgba(226,59,59,0)');
    warnGrad.addColorStop(1, 'rgba(226,59,59,.18)');
    ctx.fillStyle = warnGrad;
    ctx.fillRect(GRID_RIGHT - 20, GRID_TOP - 4, 40, GRID_BOTTOM - GRID_TOP + 8);

    defenders.forEach(drawDefender);
    projectiles.forEach(drawProjectile);
    zombies.forEach(drawZombie);
    suns.forEach(drawSun);
    floatTexts.forEach(drawFloatText);

    ctx.restore();
  }

  function drawSun(s) {
    ctx.save();
    var blinking = s.landed && s.lifeTimer < 90 && Math.floor(s.lifeTimer / 8) % 2 === 0;
    ctx.globalAlpha = blinking ? 0.3 : 1;
    var rad = 14;
    var g = ctx.createRadialGradient(s.x - 4, s.y - 4, 2, s.x, s.y, rad);
    g.addColorStop(0, '#fff6c8');
    g.addColorStop(0.55, '#ffd558');
    g.addColorStop(1, '#ffb300');
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(255,200,60,.85)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☀️', s.x, s.y);
    ctx.restore();
  }

  function drawFloatText(f) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.life / 40);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#ffe08a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }

  function drawDefender(d) {
    if (!d.alive) return;
    ctx.save();
    var pad = 5;
    var bx = d.x - CELL_W / 2 + pad, by = d.y - CELL_H / 2 + pad, bw = CELL_W - pad * 2, bh = CELL_H - pad * 2;

    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    var cardGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
    cardGrad.addColorStop(0, 'rgba(255,255,255,.14)');
    cardGrad.addColorStop(1, 'rgba(255,255,255,.05)');
    ctx.fillStyle = cardGrad;
    roundRect(ctx, bx, by, bw, bh, 10);
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = (d.stunned || (d.hijacked && !d.verified)) ? '#e2793b' : d.type.ring;
    ctx.lineWidth = d.stunned || (d.hijacked && !d.verified) ? 2.4 : 1.6;
    roundRect(ctx, bx, by, bw, bh, 10);
    ctx.stroke();

    var img = images[d.type.id];
    var s = Math.min(bw, bh) * 0.62;
    ctx.globalAlpha = d.stunned ? 0.55 : 1;
    if (d.type.icon) {
      // Linh vật không có ảnh (vd. Công Tắc Ngắt Khẩn) — vẽ bằng emoji
      ctx.font = (s * 0.8) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.type.icon, d.x, d.y - 3);
    } else if (imagesReady && img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, d.x - s / 2, d.y - s / 2 - 3, s, s);
    }
    ctx.globalAlpha = 1;

    if (d.stunned) {
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🔒', d.x + s * 0.32, d.y - s * 0.32 - 3);
    } else if (d.hijacked && !d.verified) {
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✉️', d.x + s * 0.32, d.y - s * 0.32 - 3);
    } else if (d.type.type === 'bomb' && d.fuseTimer != null) {
      var fsec = Math.max(0, (d.fuseTimer / 60)).toFixed(1);
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff5252';
      ctx.fillText('⏱' + fsec, d.x, by - 6);
    }

    if (d.hp < d.maxHp) {
      var barW = bw - 8;
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fillRect(d.x - barW / 2, by + bh - 6, barW, 4);
      ctx.fillStyle = (d.hp / d.maxHp > 0.4) ? '#35d18a' : '#e23b3b';
      ctx.fillRect(d.x - barW / 2, by + bh - 6, barW * Math.max(0, d.hp / d.maxHp), 4);
    }
    ctx.restore();
  }

  function drawProjectile(p) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }

  function drawZombie(z) {
    ctx.save();
    var r = ZOMBIE_HALF;
    var hidden = !isTargetable(z);
    var isAttacking = !!z.attacking;
    var isFrozen = z.freezeTimer > 0;

    // ── Hoạt ảnh: đi lắc lư khi bò tới (bob dọc + lắc ngang nhẹ),
    //    và "lao/cắn" về phía trước khi đang tấn công lá chắn — dùng
    //    animClock (chạy mượt, không bị chậm theo FRAME_STEP) để dáng
    //    đi luôn mượt kể cả khi game đã giảm tốc. Đứng im khi bị đóng
    //    băng (Zoom Họp Khẩn). ──
    var offX = 0, offY = 0, scalePulse = 1, tilt = 0;
    if (!isFrozen) {
      if (isAttacking) {
        var bite = Math.abs(Math.sin(animClock * 0.32 + z.walkPhase));
        offX = -bite * 6;           // lao người về phía lá chắn (bên trái)
        scalePulse = 1 + bite * 0.08;
        tilt = -bite * 0.12;
      } else {
        offY = Math.sin(animClock * 0.16 + z.walkPhase) * 2.4;   // nhấp nhô khi bước
        offX = Math.sin(animClock * 0.08 + z.walkPhase) * 1.3;   // lắc người nhẹ
        tilt = Math.sin(animClock * 0.16 + z.walkPhase) * 0.05;
      }
    }
    var zx = z.x + offX, zy = z.y + offY;

    ctx.beginPath();
    ctx.arc(zx + 2, zy + 4, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fill();

    ctx.globalAlpha = hidden ? 0.4 : 1;

    ctx.beginPath();
    ctx.arc(zx, zy, r, 0, Math.PI * 2);
    var flashy = z.hitFlash > 0;
    var zg = ctx.createRadialGradient(zx - r * 0.3, zy - r * 0.3, 2, zx, zy, r);
    zg.addColorStop(0, flashy ? '#ffffff' : (z.attacking ? '#5a2e2e' : '#241a33'));
    zg.addColorStop(1, flashy ? '#c9c9c9' : (z.attacking ? '#2c1414' : '#12101c'));
    ctx.fillStyle = zg;
    ctx.fill();
    ctx.strokeStyle = z.attacking ? '#e2793b' : 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    if (z.hitFlash > 0) z.hitFlash--;

    var img = zombieImages[z.zid];
    if (imagesReady && img && img.complete && img.naturalWidth) {
      var s = r * 1.9 * scalePulse;
      ctx.translate(zx, zy);
      ctx.rotate(tilt);
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
      ctx.rotate(-tilt);
      ctx.translate(-zx, -zy);
    }

    if (hidden) {
      ctx.globalAlpha = 1;
      ctx.font = 'bold ' + (r * 0.9) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe08a';
      ctx.fillText('?', zx + r * 0.55, zy - r * 0.55);
    }
    ctx.globalAlpha = 1;

    if (z.def.mechanic === 'timed-bomb') {
      var secs = Math.max(0, Math.ceil(z.fuseTimer / 60));
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = secs <= 2 ? '#ff5252' : '#ffcf80';
      ctx.fillText('⏱' + secs, zx, zy - r - 14);
    }

    var barW = r * 2;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(zx - barW / 2, zy - r - 8, barW, 4);
    ctx.fillStyle = (z.hp / z.maxHp > 0.4) ? '#ffcf80' : '#e23b3b';
    ctx.fillRect(zx - barW / 2, zy - r - 8, barW * Math.max(0, z.hp / z.maxHp), 4);
    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ── Shop (DOM, phía trên canvas) ──
  function buildShopUI() {
    if (!els.shop) return;
    els.shop.innerHTML = '';
    // Trong trận chỉ hiện đúng 7 linh vật đã chọn ở màn "Chọn đội
    // hình" (activeDefTypes) — trước khi xác nhận đội hình, shop để
    // trống vì màn chọn đội hình đang che toàn bộ .pz-wrap.
    activeDefTypes.forEach(function (type) {
      var cd = cooldowns[type.id] || 0;
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'pz-shop-card' + (selectedDefId === type.id ? ' selected' : '') +
        (data < type.cost || cd > 0 ? ' disabled' : '') + (cd > 0 ? ' cooling' : '');
      card.title = type.desc || '';
      var iconHtml = type.icon
        ? '<div class="pz-shop-icon pz-shop-icon-emoji">' + type.icon + '</div>'
        : '<img class="pz-shop-icon" src="' + type.img + '" alt="' + type.name + '">';
      card.innerHTML =
        iconHtml +
        '<div class="pz-shop-name">' + type.name + '</div>' +
        '<div class="pz-shop-cost">💾 ' + type.cost + '</div>' +
        '<div class="pz-shop-cd">' + (cd > 0 ? Math.ceil(cd / 60) + 's' : '') + '</div>';
      card.addEventListener('click', function () {
        if (gameOver) return;
        if ((cooldowns[type.id] || 0) > 0) {
          showToast('⏳ ' + type.name + ' đang hồi chiêu — chờ ' + Math.ceil(cooldowns[type.id] / 60) + 's nữa.', 1400);
          return;
        }
        selectedDefId = (selectedDefId === type.id) ? null : type.id;
        buildShopUI();
      });
      els.shop.appendChild(card);
    });
  }

  function refreshShopAffordability() {
    if (!els.shop) return;
    var cards = els.shop.querySelectorAll('.pz-shop-card');
    activeDefTypes.forEach(function (type, i) {
      if (!cards[i]) return;
      var cd = cooldowns[type.id] || 0;
      cards[i].classList.toggle('disabled', data < type.cost || cd > 0);
      cards[i].classList.toggle('cooling', cd > 0);
      var cdEl = cards[i].querySelector('.pz-shop-cd');
      if (cdEl) cdEl.textContent = cd > 0 ? Math.ceil(cd / 60) + 's' : '';
    });
  }

  // ── HUD / overlay / toast ──
  function updateHUD() {
    if (els.data) els.data.textContent = String(Math.floor(data));
    var displayWave = Math.min(waveIdx + 1, TOTAL_WAVES);
    if (els.wave) els.wave.textContent = displayWave + '/' + TOTAL_WAVES;
    if (els.hpFill) {
      var pct = Math.max(0, serverHP / serverMaxHP * 100);
      els.hpFill.style.width = pct + '%';
      els.hpFill.classList.toggle('pz-hp-mid', pct <= 50 && pct > 25);
      els.hpFill.classList.toggle('pz-hp-low', pct <= 25);
    }
  }

  var toastTimer = null;
  function showToast(msg, dur) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, dur || 1600);
  }

  function showOverlay(icon, title, sub, stats) {
    if (!els.overlay) return;
    els.overlayIcon.textContent = icon;
    els.overlayTitle.textContent = title;
    els.overlaySub.textContent = sub;
    els.overlayStats.textContent = stats;
    els.overlay.classList.add('show');
  }
  function hideOverlay() { if (els.overlay) els.overlay.classList.remove('show'); }

  // ── Màn "Chọn đội hình" trước trận: chọn đúng LOADOUT_SIZE trong
  //    số DEF_TYPES, xác nhận rồi mới thật sự cho spawn/step chạy
  //    (xem cờ loadoutConfirmed trong step()). ──
  function showLoadoutOverlay() {
    buildLoadoutUI();
    if (els.loadoutOverlay) els.loadoutOverlay.classList.add('show');
  }
  function hideLoadoutOverlay() {
    if (els.loadoutOverlay) els.loadoutOverlay.classList.remove('show');
  }

  function buildLoadoutUI() {
    if (!els.loadoutGrid) return;
    // Giữ lại lựa chọn của ván trước (nếu id vẫn còn hợp lệ) để chơi
    // lại nhanh hơn, nhưng vẫn bắt xác nhận lại trước khi vào trận.
    loadoutSelected = loadoutSelected.filter(function (id) { return !!DEF_BY_ID[id]; });
    els.loadoutGrid.innerHTML = '';
    DEF_TYPES.forEach(function (type) {
      var picked = loadoutSelected.indexOf(type.id) !== -1;
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'pz-loadout-item' + (picked ? ' selected' : '');
      item.title = type.desc || '';
      var iconHtml = type.icon
        ? '<div class="pz-loadout-icon pz-shop-icon-emoji">' + type.icon + '</div>'
        : '<img class="pz-loadout-icon" src="' + type.img + '" alt="' + type.name + '">';
      item.innerHTML =
        '<div class="pz-loadout-check">✅</div>' +
        iconHtml +
        '<div class="pz-loadout-name">' + type.name + '</div>';
      item.addEventListener('click', function () {
        var idx = loadoutSelected.indexOf(type.id);
        if (idx !== -1) {
          loadoutSelected.splice(idx, 1);
        } else {
          if (loadoutSelected.length >= LOADOUT_SIZE) {
            showToast('⚠️ Chỉ được chọn tối đa ' + LOADOUT_SIZE + ' linh vật — bỏ bớt 1 cái trước đã.', 1800);
            return;
          }
          loadoutSelected.push(type.id);
        }
        buildLoadoutUI();
      });
      els.loadoutGrid.appendChild(item);
    });
    if (els.loadoutCount) els.loadoutCount.textContent = String(loadoutSelected.length);
    if (els.loadoutStartBtn) els.loadoutStartBtn.disabled = loadoutSelected.length !== LOADOUT_SIZE;
  }

  function confirmLoadout() {
    if (loadoutSelected.length !== LOADOUT_SIZE) return;
    activeDefTypes = DEF_TYPES.filter(function (t) { return loadoutSelected.indexOf(t.id) !== -1; });
    loadoutConfirmed = true;
    buildShopUI();
    hideLoadoutOverlay();
    showToast('🧟 Chuẩn bị phòng thủ! Đặt lá chắn rồi chờ Đợt 1 bắt đầu... ☀️ Bấm vào Sun rơi để hứng Dữ liệu!', 3600);
  }

  // ── Điều khiển (chuột / chạm) trên canvas ──
  function canvasPoint(evt) {
    var rect = canvas.getBoundingClientRect();
    var cx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left;
    var cy = (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top;
    return { x: cx * (TABLE_W / rect.width), y: cy * (TABLE_H / rect.height) };
  }

  function pointToCell(p) {
    if (p.x < GRID_LEFT || p.x >= GRID_RIGHT || p.y < GRID_TOP || p.y >= GRID_BOTTOM) return null;
    var col = Math.floor((p.x - GRID_LEFT) / CELL_W);
    var row = Math.floor((p.y - GRID_TOP) / CELL_H);
    return { col: col, row: row };
  }

  function onCanvasClick(evt) {
    if (!loadoutConfirmed) return; // chưa xác nhận đội hình thì chưa cho thao tác trên bàn chơi
    var p = canvasPoint(evt);
    // Ưu tiên bấm Sun trước — nếu trúng thì thu luôn, không đặt lá chắn
    for (var i = suns.length - 1; i >= 0; i--) {
      var s = suns[i];
      var dx = p.x - s.x, dy = p.y - s.y;
      if (dx * dx + dy * dy <= SUN_CLICK_RADIUS * SUN_CLICK_RADIUS) {
        collectSun(i);
        evt.preventDefault();
        return;
      }
    }
    var cell = pointToCell(p);
    if (!cell) return;
    tryPlaceAt(cell.col, cell.row);
    evt.preventDefault();
  }

  function onCanvasMove(evt) {
    var p = canvasPoint(evt);
    hoverCell = pointToCell(p);
  }

  function setupCanvas() {
    // Đặt độ phân giải + kích thước hiển thị của canvas sao cho vừa
    // khít cả chiều rộng lẫn chiều cao của .pz-board-outer (letterbox
    // theo đúng tỉ lệ TABLE_W/TABLE_H), vì giờ bàn chơi nằm trong bố
    // cục flex 2 cột (bàn chơi + shop sidebar) chứ không còn kéo dài
    // 100% theo chiều ngang trang nữa.
    dpr = window.devicePixelRatio || 1;
    var outer = canvas.parentElement;
    var maxW = (outer && outer.clientWidth) || TABLE_W;
    var maxH = (outer && outer.clientHeight) || TABLE_H;
    var ratio = TABLE_W / TABLE_H;
    var displayW = maxW;
    var displayH = displayW / ratio;
    if (displayH > maxH) {
      displayH = maxH;
      displayW = displayH * ratio;
    }
    var scale = (displayW * dpr) / TABLE_W;
    canvas.width = Math.round(TABLE_W * scale);
    canvas.height = Math.round(TABLE_H * scale);
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';
    ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
  }

  function init() {
    canvas = $('pzCanvas');
    if (!canvas) return;
    els.shop = $('pzShop');
    els.data = $('pzData');
    els.wave = $('pzWave');
    els.hpFill = $('pzHpFill');
    els.toast = $('pzToast');
    els.overlay = $('pzOverlay');
    els.overlayIcon = $('pzOverlayIcon');
    els.overlayTitle = $('pzOverlayTitle');
    els.overlaySub = $('pzOverlaySub');
    els.overlayStats = $('pzOverlayStats');
    els.loadoutOverlay = $('pzLoadoutOverlay');
    els.loadoutGrid = $('pzLoadoutGrid');
    els.loadoutCount = $('pzLoadoutCount');
    els.loadoutStartBtn = $('pzLoadoutStartBtn');
    if (els.loadoutStartBtn) els.loadoutStartBtn.addEventListener('click', confirmLoadout);

    setupCanvas();
    window.addEventListener('resize', setupCanvas);

    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousemove', onCanvasMove);
    canvas.addEventListener('mouseleave', function () { hoverCell = null; });
    canvas.addEventListener('touchstart', function (evt) { onCanvasMove(evt); onCanvasClick(evt); }, { passive: false });

    var restartBtn = $('pzRestartBtn');
    if (restartBtn) restartBtn.addEventListener('click', resetGame);
    var overlayRestartBtn = $('pzOverlayRestartBtn');
    if (overlayRestartBtn) overlayRestartBtn.addEventListener('click', resetGame);

    preloadImages(function () { /* ảnh sẵn sàng, render() sẽ tự vẽ */ });

    resetGame();
    requestAnimationFrame(step);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
