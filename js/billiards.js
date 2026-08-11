/* ════════════════════════════════════════════════════════════
   js/billiards.js — Mini-game "Bi-a Phần Mềm" (Software 8-Ball)
   Cùng pattern với js/sudoku.js: trang billiards.html được nhúng
   qua modal (js/billiards-modal.js) giống hệt game.html /
   memory-game.html / sudoku.html — chỉ chứa đúng 1 mini-game độc
   lập, không đụng vào quiz-engine.js / gamification.js.

   Bản 2: chơi đúng luật bi-a 8-Ball 2 người thay phiên nhau —
   15 bi (7 bi ĐẶC số 1-7, 7 bi SỌC số 9-15, 1 bi ĐEN số 8) + bi
   cái. Mỗi bi ĐẶC/SỌC mang icon 1 phần mềm quen thuộc lấy từ
   img/memory-game/ (Word, Excel, PowerPoint, Outlook, Chrome,
   Teams, Zoom) — bi ĐẶC tô màu icon, bi SỌC nền trắng có 2 vạch
   màu icon — học sinh vừa chơi vừa ôn icon phần mềm.

   Luật rút gọn (không cắm bi cái tự do khi phạm lỗi, để đơn giản
   hoá điều khiển 1 canvas):
   - Bàn "mở" đến khi 1 người đánh trúng bi rơi lỗ hợp lệ đầu
     tiên → người đó nhận nhóm ĐẶC hoặc SỌC theo bi vừa rơi,
     người còn lại nhận nhóm kia.
   - Đánh trúng bi rơi lỗ đúng nhóm của mình (không phạm lỗi) →
     được đánh tiếp lượt kế. Ngược lại (không có bi rơi, phạm lỗi,
     bi cái rơi lỗ, hoặc chạm nhầm bi đối thủ) → đổi lượt.
   - Đánh bi ĐEN (số 8) khi nhóm của mình CHƯA hết → thua ngay.
     Đánh bi ĐEN khi vừa hết nhóm và KHÔNG phạm lỗi → thắng.
   - Bi ĐEN rơi lỗ ngay ở lượt giao bóng đầu tiên → đặt lại giữa
     bàn, ván tiếp tục, không ai thắng/thua.

   Vật lý: canvas 2D thuần, không dùng thư viện ngoài. Bi rơi lỗ
   được kiểm tra TRƯỚC khi xử lý dội băng trong cùng 1 khung hình,
   để bi có thể "rơi" qua góc bàn thay vì luôn bị băng chặn lại
   trước khi tới tâm lỗ.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── 7 icon phần mềm dùng chung cho cả bi Đặc (1-7) và bi Sọc (9-15) ──
  var ICONS = [
    { id: 'word',       img: 'img/memory-game/word.png',       ring: '#2b579a', label: 'Word' },
    { id: 'excel',      img: 'img/memory-game/excel.png',      ring: '#217346', label: 'Excel' },
    { id: 'powerpoint', img: 'img/memory-game/powerpoint.png', ring: '#d24726', label: 'PowerPoint' },
    { id: 'outlook',    img: 'img/memory-game/outlook.png',    ring: '#0364b8', label: 'Outlook' },
    { id: 'chrome',     img: 'img/memory-game/chrome.png',     ring: '#ea4335', label: 'Chrome' },
    { id: 'teams',      img: 'img/memory-game/teams.png',      ring: '#5b5fc7', label: 'Teams' },
    { id: 'zoom',       img: 'img/memory-game/zoom.png',       ring: '#2d8cff', label: 'Zoom' }
  ];

  function buildBallDefs() {
    var solids = ICONS.map(function (ic, i) {
      return { n: i + 1, id: ic.id, ring: ic.ring, label: ic.label, type: 'solid' };
    });
    var stripes = ICONS.map(function (ic, i) {
      return { n: i + 9, id: ic.id, ring: ic.ring, label: ic.label, type: 'stripe' };
    });
    var eight = { n: 8, id: 'eight', ring: '#161616', label: 'Bi Đen', type: 'eight' };
    return { solids: solids, stripes: stripes, eight: eight };
  }

  // ── Thông số bàn / vật lý ──
  var TABLE_W = 640, TABLE_H = 320;
  var RAIL = 22;
  var BALL_R = 12;
  var POCKET_VISUAL_R = 14;
  var POCKET_CAPTURE_R = 18;    // bán kính "hút" bi rơi lỗ — kiểm tra TRƯỚC khi dội băng
  var FRICTION = 0.9915;
  var STOP_SPEED = 0.06;
  var MAX_PULL = 130;
  var POWER_FACTOR = 0.11;
  var WALL_DAMP = 0.86;

  var PLAY_L = RAIL, PLAY_T = RAIL, PLAY_R = TABLE_W - RAIL, PLAY_B = TABLE_H - RAIL;

  var POCKETS = [
    { x: PLAY_L, y: PLAY_T }, { x: TABLE_W / 2, y: PLAY_T }, { x: PLAY_R, y: PLAY_T },
    { x: PLAY_L, y: PLAY_B }, { x: TABLE_W / 2, y: PLAY_B }, { x: PLAY_R, y: PLAY_B }
  ];

  var canvas, ctx, dpr = 1;
  var balls = [];
  var cue = null;
  var images = {};
  var imagesReady = false;

  var aiming = false, dragVec = { x: 0, y: 0 };
  var moving = false;

  var players = [
    { name: 'Người chơi 1', group: null },
    { name: 'Người chơi 2', group: null }
  ];
  var currentPlayerIdx = 0;
  var tableOpen = true;
  var totalShots = 0;
  var shotTrack = null;
  var gameOver = false;

  var els = {};

  function $(id) { return document.getElementById(id); }

  // ── Trợ giúp làm sáng/tối 1 màu hex — dùng để tạo gradient "khối cầu 3D" cho bi ──
  function shadeColor(hex, percent) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = (num >> 16) + Math.round(255 * percent);
    var g = ((num >> 8) & 0x00FF) + Math.round(255 * percent);
    var b = (num & 0x0000FF) + Math.round(255 * percent);
    r = Math.max(Math.min(255, r), 0);
    g = Math.max(Math.min(255, g), 0);
    b = Math.max(Math.min(255, b), 0);
    return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
  }

  function preloadImages(cb) {
    var toLoad = ICONS.length;
    if (toLoad === 0) { cb(); return; }
    ICONS.forEach(function (ic) {
      var img = new Image();
      img.onload = img.onerror = function () {
        toLoad--;
        if (toLoad <= 0) { imagesReady = true; cb(); }
      };
      img.src = ic.img;
      images[ic.id] = img;
    });
  }

  // ── Xếp bàn hình tam giác 15 bi (chuẩn 8-Ball): đỉnh là 1 bi Đặc,
  //    giữa hàng 3 là bi Đen, 2 góc cuối là 1 Đặc + 1 Sọc, còn lại
  //    xen kẽ Đặc/Sọc. ──
  function rackBalls() {
    var defs = buildBallDefs();
    var solidsPool = defs.solids.slice();
    var stripesPool = defs.stripes.slice();
    var eight = defs.eight;

    var startX = TABLE_W * 0.68, startY = TABLE_H / 2, spacing = BALL_R * 2 + 0.6;
    var rows = [1, 2, 3, 4, 5];
    var slotPos = [];
    rows.forEach(function (count, row) {
      var colX = startX + row * (spacing * 0.87);
      var colYStart = startY - (row * spacing) / 2;
      for (var c = 0; c < count; c++) {
        slotPos.push({ x: colX, y: colYStart + c * spacing });
      }
    });
    // idx: hàng0=0 · hàng1=1,2 · hàng2=3,4,5 · hàng3=6,7,8,9 · hàng4=10,11,12,13,14

    var reserved = {};
    reserved[0] = solidsPool.shift();   // đỉnh tam giác
    reserved[4] = eight;                // giữa hàng 3
    reserved[10] = solidsPool.pop();    // góc cuối trái
    reserved[14] = stripesPool.pop();   // góc cuối phải

    var fillQueue = [];
    while (solidsPool.length || stripesPool.length) {
      if (stripesPool.length) fillQueue.push(stripesPool.shift());
      if (solidsPool.length) fillQueue.push(solidsPool.shift());
    }
    var fq = 0;
    for (var i = 0; i < 15; i++) {
      if (!(i in reserved)) { reserved[i] = fillQueue[fq]; fq++; }
    }

    balls = [];
    for (var idx = 0; idx < 15; idx++) {
      var pos = slotPos[idx];
      balls.push({ def: reserved[idx], x: pos.x, y: pos.y, vx: 0, vy: 0, r: BALL_R, pocketed: false, isCue: false });
    }
    cue = { x: TABLE_W * 0.2, y: TABLE_H / 2, vx: 0, vy: 0, r: BALL_R, pocketed: false, isCue: true };
  }

  function resetGame() {
    rackBalls();
    players[0].group = null;
    players[1].group = null;
    currentPlayerIdx = 0;
    tableOpen = true;
    totalShots = 0;
    shotTrack = null;
    gameOver = false;
    updateHUD();
    hideOverlay();
    showToast('🎱 ' + players[0].name + ' giao bóng — bàn đang mở, đánh trúng bi bất kỳ để nhận nhóm!', 3200);
  }

  function allBalls() {
    var list = balls.slice();
    if (cue) list.push(cue);
    return list;
  }

  function groupRemaining(type) {
    return balls.filter(function (b) { return !b.pocketed && b.def.type === type; }).length;
  }

  function groupLabel(type) {
    if (type === 'solid') return 'Bi Đặc (1-7)';
    if (type === 'stripe') return 'Bi Sọc (9-15)';
    return '';
  }

  // ── Vòng lặp vật lý ──
  function step() {
    var wasMoving = moving;
    var list = allBalls();
    var anyMoving = false;

    list.forEach(function (b) {
      if (b.pocketed) return;
      b.x += b.vx;
      b.y += b.vy;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      if (Math.abs(b.vx) < STOP_SPEED) b.vx = 0;
      if (Math.abs(b.vy) < STOP_SPEED) b.vy = 0;
      if (b.vx !== 0 || b.vy !== 0) anyMoving = true;

      // Kiểm tra rơi lỗ TRƯỚC khi dội băng — nếu không, bi luôn bị
      // băng chặn lại trước khi tâm bi tới đủ gần tâm lỗ ở góc bàn.
      for (var p = 0; p < POCKETS.length; p++) {
        var pk = POCKETS[p];
        var dx = b.x - pk.x, dy = b.y - pk.y;
        if (Math.sqrt(dx * dx + dy * dy) < POCKET_CAPTURE_R) {
          onPocketed(b);
          anyMoving = true;
          return;
        }
      }

      // Dội băng
      if (b.x - b.r < PLAY_L) { b.x = PLAY_L + b.r; b.vx = -b.vx * WALL_DAMP; }
      if (b.x + b.r > PLAY_R) { b.x = PLAY_R - b.r; b.vx = -b.vx * WALL_DAMP; }
      if (b.y - b.r < PLAY_T) { b.y = PLAY_T + b.r; b.vy = -b.vy * WALL_DAMP; }
      if (b.y + b.r > PLAY_B) { b.y = PLAY_B - b.r; b.vy = -b.vy * WALL_DAMP; }
    });

    // Va chạm bi-bi (đàn hồi, khối lượng bằng nhau) + ghi nhận chạm đầu tiên của bi cái
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var a = list[i], c = list[j];
        if (a.pocketed || c.pocketed) continue;
        var ddx = c.x - a.x, ddy = c.y - a.y;
        var dist = Math.sqrt(ddx * ddx + ddy * ddy);
        var minDist = a.r + c.r;
        if (dist > 0 && dist < minDist) {
          if (shotTrack && !shotTrack.firstContact) {
            if (a.isCue && !c.isCue) shotTrack.firstContact = c.def.type;
            else if (c.isCue && !a.isCue) shotTrack.firstContact = a.def.type;
          }

          var nx = ddx / dist, ny = ddy / dist;
          var overlap = (minDist - dist) / 2;
          a.x -= nx * overlap; a.y -= ny * overlap;
          c.x += nx * overlap; c.y += ny * overlap;

          var dvx = a.vx - c.vx, dvy = a.vy - c.vy;
          var rel = dvx * nx + dvy * ny;
          if (rel > 0) {
            a.vx -= rel * nx; a.vy -= rel * ny;
            c.vx += rel * nx; c.vy += rel * ny;
          }
          anyMoving = true;
        }
      }
    }

    moving = anyMoving;
    if (wasMoving && !anyMoving && shotTrack) {
      evaluateShot();
      shotTrack = null;
    }
    render();
    requestAnimationFrame(step);
  }

  function onPocketed(b) {
    b.pocketed = true;
    b.vx = 0; b.vy = 0;
    if (shotTrack) {
      shotTrack.potted.push(b);
      if (b.isCue) shotTrack.scratched = true;
    }
  }

  function respawnCue() {
    cue.x = TABLE_W * 0.2;
    cue.y = TABLE_H / 2;
    cue.vx = 0; cue.vy = 0;
    cue.pocketed = false;
  }

  function respotEightBall() {
    var eightBall = balls.filter(function (b) { return b.def.type === 'eight'; })[0];
    if (!eightBall) return;
    eightBall.pocketed = false;
    eightBall.x = TABLE_W / 2;
    eightBall.y = TABLE_H / 2;
    eightBall.vx = 0; eightBall.vy = 0;
  }

  // ── Đánh giá kết quả 1 lượt đánh sau khi bi dừng hẳn ──
  function evaluateShot() {
    var st = shotTrack;
    var breakShot = (totalShots === 1);
    var shooter = players[currentPlayerIdx];
    var opponent = players[1 - currentPlayerIdx];

    var pottedObjects = st.potted.filter(function (b) { return !b.isCue; });
    var pottedEight = pottedObjects.some(function (b) { return b.def.type === 'eight'; });
    var pottedNonEight = pottedObjects.filter(function (b) { return b.def.type !== 'eight'; });

    // ── Bi Đen (8) ──
    if (pottedEight) {
      if (breakShot) {
        respotEightBall();
        showToast('🎱 Bi Đen rơi lỗ ngay lượt giao bóng — đặt lại vị trí, ván tiếp tục.', 2600);
        currentPlayerIdx = 1 - currentPlayerIdx;
        updateHUD();
        return;
      }
      var shooterCleared = shooter.group && groupRemaining(shooter.group) === 0;
      if (shooterCleared && !st.scratched) {
        endGame(currentPlayerIdx, shooter.name + ' đã dồn hết nhóm bi của mình và đánh thắng Bi Đen! 🏆');
      } else {
        endGame(1 - currentPlayerIdx, shooter.name + (st.scratched
          ? ' phạm lỗi khi đánh Bi Đen (bi cái rơi lỗ cùng lúc).'
          : ' đánh Bi Đen quá sớm khi chưa dồn hết nhóm của mình.'));
      }
      return;
    }

    // ── Xác định lỗi (foul) ──
    var foul = false, foulReason = '';
    if (st.scratched) { foul = true; foulReason = 'Bi cái rơi lỗ (phạm luật)'; }
    else if (!st.firstContact) { foul = true; foulReason = 'Không chạm bi nào (phạm luật)'; }
    else if (shooter.group && st.firstContact !== shooter.group) { foul = true; foulReason = 'Chạm nhầm nhóm bi của đối thủ'; }

    // ── Gán nhóm nếu bàn đang mở ──
    if (tableOpen && pottedNonEight.length > 0 && !st.scratched) {
      var hasSolid = pottedNonEight.some(function (b) { return b.def.type === 'solid'; });
      var hasStripe = pottedNonEight.some(function (b) { return b.def.type === 'stripe'; });
      var assignType = (hasSolid && hasStripe) ? (st.firstContact || pottedNonEight[0].def.type) : (hasSolid ? 'solid' : 'stripe');
      shooter.group = assignType;
      opponent.group = (assignType === 'solid') ? 'stripe' : 'solid';
      tableOpen = false;
      showToast('🎯 ' + shooter.name + ' nhận nhóm ' + groupLabel(assignType) + '!', 2400);
    }

    var legalOwnPot = false;
    if (!foul && pottedNonEight.length > 0) {
      legalOwnPot = shooter.group ? pottedNonEight.some(function (b) { return b.def.type === shooter.group; }) : true;
    }

    if (st.scratched) respawnCue();

    if (foul) {
      showToast('⚠️ ' + foulReason + ' — lượt chuyển sang ' + opponent.name, 2400);
    } else if (legalOwnPot) {
      showToast('✅ ' + shooter.name + ' đánh trúng — được đánh tiếp!', 1800);
    } else {
      showToast('Không có bi nào rơi lỗ đúng nhóm — chuyển lượt cho ' + opponent.name, 1800);
    }

    if (!(legalOwnPot && !foul)) {
      currentPlayerIdx = 1 - currentPlayerIdx;
    }
    updateHUD();
  }

  function endGame(winnerIdx, reasonText) {
    gameOver = true;
    showOverlay('🏆 ' + players[winnerIdx].name + ' Thắng!', reasonText, 'Tổng số lượt đánh cả ván: ' + totalShots);
    updateHUD();
  }

  // ── Vẽ ──
  function render() {
    ctx.save();
    ctx.clearRect(0, 0, TABLE_W, TABLE_H);

    // ── Viền gỗ: gradient chéo (ánh sáng từ trên-trái) để trông nổi khối hơn ──
    var railGrad = ctx.createLinearGradient(0, 0, TABLE_W * 0.15, TABLE_H);
    railGrad.addColorStop(0, '#8a5a34');
    railGrad.addColorStop(0.35, '#5a3521');
    railGrad.addColorStop(1, '#2c170c');
    ctx.fillStyle = railGrad;
    roundRect(ctx, 0, 0, TABLE_W, TABLE_H, 18);
    ctx.fill();

    // Vân sáng hắt trên mép gỗ (bevel highlight) — mô phỏng ánh sáng chiếu từ trên xuống
    ctx.save();
    roundRect(ctx, 0, 0, TABLE_W, TABLE_H, 18);
    ctx.clip();
    var railSheen = ctx.createLinearGradient(0, 0, 0, 10);
    railSheen.addColorStop(0, 'rgba(255,255,255,.32)');
    railSheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = railSheen;
    ctx.fillRect(0, 0, TABLE_W, 10);
    var railSheenL = ctx.createLinearGradient(0, 0, 10, 0);
    railSheenL.addColorStop(0, 'rgba(255,255,255,.2)');
    railSheenL.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = railSheenL;
    ctx.fillRect(0, 0, 10, TABLE_H);
    var railShadeR = ctx.createLinearGradient(TABLE_W - 12, 0, TABLE_W, 0);
    railShadeR.addColorStop(0, 'rgba(0,0,0,0)');
    railShadeR.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = railShadeR;
    ctx.fillRect(TABLE_W - 12, 0, 12, TABLE_H);
    var railShadeB = ctx.createLinearGradient(0, TABLE_H - 12, 0, TABLE_H);
    railShadeB.addColorStop(0, 'rgba(0,0,0,0)');
    railShadeB.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = railShadeB;
    ctx.fillRect(0, TABLE_H - 12, TABLE_W, 12);
    ctx.restore();

    // ── Mặt nỉ: gradient hướng sáng + họa tiết dệt nhẹ để có chiều sâu ──
    var feltGrad = ctx.createRadialGradient(TABLE_W * 0.4, TABLE_H * 0.35, 30, TABLE_W / 2, TABLE_H / 2, TABLE_W / 1.15);
    feltGrad.addColorStop(0, '#14a179');
    feltGrad.addColorStop(0.45, '#0f8a68');
    feltGrad.addColorStop(1, '#075744');
    ctx.fillStyle = feltGrad;
    roundRect(ctx, PLAY_L - 4, PLAY_T - 4, PLAY_R - PLAY_L + 8, PLAY_B - PLAY_T + 8, 6);
    ctx.fill();

    // Rãnh băng (cushion groove) — viền trong tối dần tạo cảm giác nỉ lõm xuống dưới băng gỗ
    ctx.save();
    roundRect(ctx, PLAY_L - 4, PLAY_T - 4, PLAY_R - PLAY_L + 8, PLAY_B - PLAY_T + 8, 6);
    ctx.clip();
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 8;
    roundRect(ctx, PLAY_L - 4, PLAY_T - 4, PLAY_R - PLAY_L + 8, PLAY_B - PLAY_T + 8, 6);
    ctx.stroke();
    ctx.restore();

    POCKETS.forEach(function (pk) {
      // vòng bóng quanh miệng lỗ trước (viền nhựa sáng)
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, POCKET_VISUAL_R + 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(pk.x, pk.y, POCKET_VISUAL_R, 0, Math.PI * 2);
      var pg = ctx.createRadialGradient(pk.x - 3, pk.y - 3, 1, pk.x, pk.y, POCKET_VISUAL_R);
      pg.addColorStop(0, '#3a3a3a');
      pg.addColorStop(0.35, '#000');
      pg.addColorStop(1, '#000');
      ctx.fillStyle = pg;
      ctx.fill();
    });

    if (aiming && cue && !cue.pocketed) {
      var shotDir = { x: -dragVec.x, y: -dragVec.y };
      var len = Math.sqrt(shotDir.x * shotDir.x + shotDir.y * shotDir.y);
      if (len > 4) {
        var ux = shotDir.x / len, uy = shotDir.y / len;
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(cue.x + ux * 400, cue.y + uy * 400);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#e8c27a';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        var pull = Math.min(len, MAX_PULL);
        ctx.beginPath();
        ctx.moveTo(cue.x - ux * (pull + 16), cue.y - uy * (pull + 16));
        ctx.lineTo(cue.x - ux * 16, cue.y - uy * 16);
        ctx.stroke();
      }
    }

    var live = allBalls().filter(function (b) { return !b.pocketed; });
    live.forEach(drawBallShadow);
    live.forEach(drawBall);
    ctx.restore();
  }

  // ── Bóng đổ trên mặt nỉ dưới mỗi bi — tạo cảm giác bi "nổi khối" trên mặt bàn ──
  function drawBallShadow(b) {
    ctx.save();
    var sx = b.x + b.r * 0.22, sy = b.y + b.r * 0.42;
    ctx.beginPath();
    ctx.ellipse(sx, sy, b.r * 1.05, b.r * 0.5, 0, 0, Math.PI * 2);
    var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, b.r * 1.05);
    sg.addColorStop(0, 'rgba(0,0,0,.45)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.restore();
  }

  // ── Lớp bóng loáng phủ trên bi (highlight + tối viền) — áp dụng chung cho mọi bi
  //    để mô phỏng bề mặt bi-a nhựa bóng dưới ánh đèn. ──
  function applyBallGloss(b) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.clip();
    var lg = ctx.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.45, b.r * 0.05, b.x, b.y, b.r * 1.2);
    lg.addColorStop(0, 'rgba(255,255,255,.55)');
    lg.addColorStop(0.28, 'rgba(255,255,255,.12)');
    lg.addColorStop(0.6, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = lg;
    ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    ctx.restore();

    // Đốm sáng phản chiếu (specular highlight) — chi tiết làm bi trông "bóng" nhất
    ctx.save();
    var hx = b.x - b.r * 0.38, hy = b.y - b.r * 0.42;
    var hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, b.r * 0.4);
    hl.addColorStop(0, 'rgba(255,255,255,.95)');
    hl.addColorStop(0.5, 'rgba(255,255,255,.35)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.ellipse(hx, hy, b.r * 0.34, b.r * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = hl;
    ctx.fill();
    ctx.restore();
  }

  function drawBall(b) {
    if (b.pocketed) return;
    ctx.save();

    if (b.isCue) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      var cueGrad = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r * 1.05);
      cueGrad.addColorStop(0, '#ffffff');
      cueGrad.addColorStop(0.55, '#f1f1f1');
      cueGrad.addColorStop(1, '#cfcfcf');
      ctx.fillStyle = cueGrad;
      ctx.fill();
      ctx.strokeStyle = '#b9b9b9';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#e23b3b';
      ctx.fill();
      applyBallGloss(b);
      ctx.restore();
      return;
    }

    var def = b.def;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);

    if (def.type === 'eight' || def.type === 'solid') {
      var baseColor = def.type === 'eight' ? '#1c1c1c' : def.ring;
      var sphereGrad = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.08, b.x, b.y, b.r * 1.05);
      sphereGrad.addColorStop(0, shadeColor(baseColor, 0.45));
      sphereGrad.addColorStop(0.45, baseColor);
      sphereGrad.addColorStop(1, shadeColor(baseColor, -0.35));
      ctx.fillStyle = sphereGrad;
      ctx.fill();
    } else {
      var whiteGrad = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.08, b.x, b.y, b.r * 1.05);
      whiteGrad.addColorStop(0, '#ffffff');
      whiteGrad.addColorStop(0.55, '#f4f4f4');
      whiteGrad.addColorStop(1, '#dcdcdc');
      ctx.fillStyle = whiteGrad;
      ctx.fill();
    }

    if (def.type === 'stripe') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = def.ring;
      ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 0.6);
      ctx.fillRect(b.x - b.r, b.y + b.r - b.r * 0.6, b.r * 2, b.r * 0.6);
      ctx.restore();
    }

    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (def.type === 'eight') {
      ctx.fillStyle = '#fff';
      ctx.font = '700 11px Baloo 2, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('8', b.x, b.y + 0.5);
    } else {
      var patchR = b.r * 0.62;
      ctx.beginPath();
      ctx.arc(b.x, b.y, patchR, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      var img = images[def.id];
      if (imagesReady && img && img.complete && img.naturalWidth) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, patchR - 1, 0, Math.PI * 2);
        ctx.clip();
        var s = (patchR - 1) * 1.7;
        ctx.drawImage(img, b.x - s / 2, b.y - s / 2, s, s);
        ctx.restore();
      }
      ctx.strokeStyle = def.ring;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.55, b.y - b.r * 0.55, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 6.2px Baloo 2, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(def.n), b.x - b.r * 0.55, b.y - b.r * 0.55 + 0.5);
    }

    applyBallGloss(b);
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

  // ── Điều khiển (chuột / chạm) ──
  function canvasPoint(evt) {
    var rect = canvas.getBoundingClientRect();
    var cx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left;
    var cy = (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top;
    return { x: cx * (TABLE_W / rect.width), y: cy * (TABLE_H / rect.height) };
  }

  function onDown(evt) {
    if (moving || gameOver || !cue || cue.pocketed) return;
    var p = canvasPoint(evt);
    aiming = true;
    dragVec = { x: 0, y: 0 };
    evt.preventDefault();
  }

  function onMove(evt) {
    if (!aiming) return;
    var p = canvasPoint(evt);
    var dx = p.x - cue.x, dy = p.y - cue.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > MAX_PULL) { dx = (dx / len) * MAX_PULL; dy = (dy / len) * MAX_PULL; }
    dragVec = { x: dx, y: dy };
    evt.preventDefault();
  }

  function onUp() {
    if (!aiming) return;
    aiming = false;
    var len = Math.sqrt(dragVec.x * dragVec.x + dragVec.y * dragVec.y);
    if (len > 8) {
      var ux = -dragVec.x / len, uy = -dragVec.y / len;
      var power = Math.min(len, MAX_PULL) * POWER_FACTOR;
      cue.vx = ux * power * 3.4;
      cue.vy = uy * power * 3.4;
      totalShots++;
      shotTrack = { firstContact: null, potted: [], scratched: false };
      updateHUD();
    }
    dragVec = { x: 0, y: 0 };
  }

  // ── HUD / overlay / toast ──
  function updateHUD() {
    for (var i = 0; i < 2; i++) {
      var p = players[i];
      var isActive = (i === currentPlayerIdx) && !gameOver;
      if (els.playerCard[i]) els.playerCard[i].classList.toggle('active', isActive);
      if (els.playerGroup[i]) els.playerGroup[i].textContent = p.group ? groupLabel(p.group) : 'Chưa xác định nhóm';
      if (els.playerGroup[i]) els.playerGroup[i].className = 'bl-player-group' + (p.group ? ' bl-group-' + p.group : '');
      if (els.playerRemaining[i]) els.playerRemaining[i].textContent = p.group ? (groupRemaining(p.group) + ' bi còn lại') : '—';
    }
    if (els.shots) els.shots.textContent = String(totalShots);
  }

  var toastTimer = null;
  function showToast(msg, dur) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, dur || 1600);
  }

  function showOverlay(title, sub, stats) {
    if (!els.overlay) return;
    els.overlayTitle.textContent = title;
    els.overlaySub.textContent = sub;
    els.overlayStats.textContent = stats;
    els.overlay.classList.add('show');
  }
  function hideOverlay() { if (els.overlay) els.overlay.classList.remove('show'); }

  function setupCanvas() {
    dpr = window.devicePixelRatio || 1;
    var displayW = canvas.clientWidth || TABLE_W;
    var ratio = TABLE_H / TABLE_W;
    canvas.width = TABLE_W * dpr;
    canvas.height = TABLE_H * dpr;
    canvas.style.height = (displayW * ratio) + 'px';
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
  }

  function init() {
    canvas = $('blCanvas');
    if (!canvas) return;
    els.playerCard = [$('blPlayer0Card'), $('blPlayer1Card')];
    els.playerGroup = [$('blPlayer0Group'), $('blPlayer1Group')];
    els.playerRemaining = [$('blPlayer0Remaining'), $('blPlayer1Remaining')];
    els.shots = $('blShots');
    els.toast = $('blToast');
    els.overlay = $('blOverlay');
    els.overlayTitle = $('blOverlayTitle');
    els.overlaySub = $('blOverlaySub');
    els.overlayStats = $('blOverlayStats');

    setupCanvas();
    window.addEventListener('resize', setupCanvas);

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp);

    var restartBtn = $('blRestartBtn');
    if (restartBtn) restartBtn.addEventListener('click', resetGame);
    var overlayRestartBtn = $('blOverlayRestartBtn');
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
