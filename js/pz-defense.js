/* ════════════════════════════════════════════════════════════
   js/pz-defense.js — Mini-game "Phòng Thủ Dữ Liệu"
   (tower-defense kiểu Plants vs Zombies, reskin theo chủ đề phần
   mềm). Cùng pattern với js/billiards.js: trang pz-defense.html
   được nhúng qua modal (js/pz-defense-modal.js) giống hệt
   game.html / memory-game.html / sudoku.html / billiards.html —
   chỉ chứa đúng 1 mini-game độc lập, không đụng vào
   quiz-engine.js / gamification.js.

   Cơ chế:
   - Lưới 5 hàng (lane) × 8 cột. Zombie mã độc (🐛/👾/💀/🦠/👹) xuất
     hiện ở mép phải mỗi hàng, bò dần sang trái để xâm nhập Server
     ở mép trái.
   - Người chơi dùng tài nguyên "Dữ liệu" (tự sinh theo thời gian)
     để đặt "lá chắn phần mềm" (icon Word/Excel/Chrome/Outlook/Teams
     lấy lại từ img/memory-game/) lên các ô trống — mỗi loại 1 vai
     trò: chặn đường (Word), sinh thêm Dữ liệu (Excel), bắn hạ
     zombie (Chrome/Outlook), hoặc làm chậm cả hàng (Teams).
   - Qua hết toàn bộ đợt tấn công mà Server còn máu → thắng. Server
     hết máu (zombie xâm nhập quá nhiều) → thua.

   Vật lý/thời gian: hoàn toàn tính theo khung hình (frame-based,
   giả định ~60fps qua requestAnimationFrame) — cùng cách tiếp cận
   với js/billiards.js, không dùng deltaTime thực để giữ code đơn
   giản, nhất quán.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Định nghĩa lá chắn phần mềm (plant equivalent) ──
  var DEF_TYPES = [
    { id: 'word', img: 'img/memory-game/word.png', name: 'Word Chắn Đường', cost: 50,
      hp: 420, type: 'wall', ring: '#2b579a' },
    { id: 'excel', img: 'img/memory-game/excel.png', name: 'Excel Sinh Dữ Liệu', cost: 60,
      hp: 90, type: 'generator', genAmount: 22, genFrames: 200, ring: '#217346' },
    { id: 'chrome', img: 'img/memory-game/chrome.png', name: 'Chrome Quét Nhanh', cost: 80,
      hp: 90, type: 'shooter', dmg: 9, rateFrames: 42, projSpeed: 6.5, ring: '#ea4335' },
    { id: 'outlook', img: 'img/memory-game/outlook.png', name: 'Outlook Cảnh Báo', cost: 130,
      hp: 110, type: 'shooter', dmg: 30, rateFrames: 108, projSpeed: 5, ring: '#0364b8' },
    { id: 'teams', img: 'img/memory-game/teams.png', name: 'Teams Làm Chậm', cost: 95,
      hp: 110, type: 'slow', slowFactor: 0.5, ring: '#5b5fc7' }
  ];
  var DEF_BY_ID = {};
  DEF_TYPES.forEach(function (d) { DEF_BY_ID[d.id] = d; });

  // ── Định nghĩa zombie mã độc ──
  var ZOMBIE_TYPES = [
    { id: 'worm', emoji: '🐛', name: 'Sâu Worm', hp: 60, speed: 0.7, dmgToDef: 0.42, breachDmg: 8, reward: 3 },
    { id: 'trojan', emoji: '👾', name: 'Trojan Ẩn Danh', hp: 120, speed: 0.55, dmgToDef: 0.6, breachDmg: 14, reward: 4 },
    { id: 'ransom', emoji: '💀', name: 'Ransomware', hp: 230, speed: 0.4, dmgToDef: 1.0, breachDmg: 22, reward: 6 },
    { id: 'virus', emoji: '🦠', name: 'Virus Lây Lan', hp: 45, speed: 1.0, dmgToDef: 0.35, breachDmg: 6, reward: 3 },
    { id: 'boss', emoji: '👹', name: 'Trùm Botnet', hp: 950, speed: 0.28, dmgToDef: 1.8, breachDmg: 40, reward: 25 }
  ];
  var ZOMBIE_BY_ID = {};
  ZOMBIE_TYPES.forEach(function (z) { ZOMBIE_BY_ID[z.id] = z; });

  // ── Cấu hình từng đợt tấn công (số lượng mỗi loại zombie) ──
  var WAVES = [
    { worm: 5 },
    { worm: 5, virus: 3 },
    { worm: 4, trojan: 3, virus: 4 },
    { trojan: 4, ransom: 3, virus: 5 },
    { trojan: 5, ransom: 4, virus: 6 },
    { trojan: 5, ransom: 4, virus: 6, boss: 1 }
  ];
  var TOTAL_WAVES = WAVES.length;

  // ── Thông số lưới / bàn chơi ──
  var TABLE_W = 640, TABLE_H = 320;
  var GRID_LEFT = 78, GRID_TOP = 14;
  var COLS = 8, ROWS = 5;
  var CELL_W = 66, CELL_H = 58;
  var GRID_RIGHT = GRID_LEFT + COLS * CELL_W;
  var GRID_BOTTOM = GRID_TOP + ROWS * CELL_H;
  var DEF_HALF = 22, ZOMBIE_HALF = 20;
  var SPAWN_X = GRID_RIGHT + 26;
  var PREP_FRAMES = 300;      // ~5s chuẩn bị giữa các đợt
  var DATA_START = 150;
  var DATA_TRICKLE_AMOUNT = 1;
  var DATA_TRICKLE_FRAMES = 40;

  var canvas, ctx, dpr = 1;
  var images = {}, imagesReady = false;

  var data = 0;
  var serverHP = 200, serverMaxHP = 200;
  var waveIdx = 0;
  var wavesCleared = 0;
  var killCount = 0;
  var gameState = 'prep';   // 'prep' | 'spawning' | 'clearing'
  var prepTimer = 0;
  var trickleTimer = 0;
  var spawnQueue = [], spawnedIdx = 0, spawnTimer = 0, spawnGap = 60;
  var gameOver = false, victory = false;

  var occ = [];             // occ[row][col] = defender | null
  var defenders = [], zombies = [], projectiles = [];
  var selectedDefId = null;
  var hoverCell = null;

  var els = {};

  function $(id) { return document.getElementById(id); }

  function preloadImages(cb) {
    var toLoad = DEF_TYPES.length;
    if (toLoad === 0) { cb(); return; }
    DEF_TYPES.forEach(function (d) {
      var img = new Image();
      img.onload = img.onerror = function () {
        toLoad--;
        if (toLoad <= 0) { imagesReady = true; cb(); }
      };
      img.src = d.img;
      images[d.id] = img;
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
    trickleTimer = DATA_TRICKLE_FRAMES;
    spawnQueue = []; spawnedIdx = 0; spawnTimer = 0;
    gameOver = false; victory = false;
    defenders = []; zombies = []; projectiles = [];
    selectedDefId = null; hoverCell = null;
    resetOcc();
    buildShopUI();
    updateHUD();
    hideOverlay();
    showToast('🧟 Chuẩn bị phòng thủ! Đặt lá chắn rồi chờ Đợt 1 bắt đầu...', 3200);
  }

  function buildSpawnList(idx) {
    var comp = WAVES[idx];
    var list = [];
    Object.keys(comp).forEach(function (zid) {
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
    spawnGap = Math.max(26, 64 - idx * 6);
    spawnTimer = 12;
    showToast('🌊 Đợt ' + (idx + 1) + '/' + TOTAL_WAVES + ' bắt đầu — mã độc đang tới!', 2600);
  }

  // ── Vòng lặp chính ──
  function step() {
    if (!gameOver) {
      updateResource();
      updateSpawning();
      updateZombies();
      updateDefenders();
      updateProjectiles();
    }
    render();
    requestAnimationFrame(step);
  }

  function updateResource() {
    trickleTimer--;
    if (trickleTimer <= 0) {
      data += DATA_TRICKLE_AMOUNT;
      trickleTimer = DATA_TRICKLE_FRAMES;
      refreshShopAffordability();
      updateHUD();
    }
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
        waveIdx++;
        if (waveIdx >= TOTAL_WAVES) {
          endGame(true);
        } else {
          gameState = 'prep';
          prepTimer = PREP_FRAMES;
          showToast('✅ Đợt ' + wavesCleared + '/' + TOTAL_WAVES + ' hoàn thành! Chuẩn bị đợt kế tiếp...', 2800);
          updateHUD();
        }
      }
    }
  }

  function spawnZombie(zid) {
    var def = ZOMBIE_BY_ID[zid];
    var row = Math.floor(Math.random() * ROWS);
    zombies.push({
      zid: zid, def: def, row: row,
      x: SPAWN_X, y: cellY(row),
      hp: def.hp, maxHp: def.hp,
      attacking: null, alive: true
    });
  }

  function getLaneSlowFactor(row) {
    var f = 1;
    defenders.forEach(function (d) {
      if (d.alive && d.row === row && d.type.type === 'slow') f = Math.min(f, d.type.slowFactor);
    });
    return f;
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

  function updateZombies() {
    for (var i = zombies.length - 1; i >= 0; i--) {
      var z = zombies[i];
      if (!z.alive) { zombies.splice(i, 1); continue; }

      if (z.attacking) {
        var d = z.attacking;
        if (!d.alive) { z.attacking = null; continue; }
        d.hp -= z.def.dmgToDef;
        if (d.hp <= 0) {
          d.alive = false;
          occ[d.row][d.col] = null;
          removeDefender(d);
          z.attacking = null;
        }
        continue;
      }

      var slow = getLaneSlowFactor(z.row);
      var nextX = z.x - z.def.speed * slow;
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
      if (d.type.type === 'generator') {
        d.genCooldown--;
        if (d.genCooldown <= 0) {
          data += d.type.genAmount;
          d.genCooldown = d.type.genFrames;
          refreshShopAffordability();
          updateHUD();
        }
      } else if (d.type.type === 'shooter') {
        d.shootCooldown--;
        if (d.shootCooldown <= 0) {
          var hasTarget = zombies.some(function (z) { return z.row === d.row; });
          if (hasTarget) {
            projectiles.push({ x: d.x, y: d.y, row: d.row, dmg: d.type.dmg, speed: d.type.projSpeed, color: d.type.ring });
            d.shootCooldown = d.type.rateFrames;
          }
        }
      }
    });
  }

  function updateProjectiles() {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i];
      p.x += p.speed;
      if (p.x > GRID_RIGHT + 40) { projectiles.splice(i, 1); continue; }
      var hitIdx = -1;
      for (var j = 0; j < zombies.length; j++) {
        var z = zombies[j];
        if (z.row === p.row && Math.abs(z.x - p.x) < ZOMBIE_HALF) { hitIdx = j; break; }
      }
      if (hitIdx >= 0) {
        var target = zombies[hitIdx];
        target.hp -= p.dmg;
        projectiles.splice(i, 1);
        if (target.hp <= 0) {
          killCount++;
          data += target.def.reward;
          target.alive = false;
          refreshShopAffordability();
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
      showOverlay('🏆', '🏆 Chiến Thắng!', 'Bạn đã bảo vệ Server thành công qua toàn bộ ' + TOTAL_WAVES + ' đợt tấn công!', statsText);
    } else {
      showOverlay('💥', '💥 Server Đã Bị Xâm Nhập!', 'Đội phòng thủ đã bị áp đảo ở đợt ' + Math.min(waveIdx + 1, TOTAL_WAVES) + '/' + TOTAL_WAVES + '.', statsText);
    }
    updateHUD();
  }

  // ── Đặt lá chắn ──
  function tryPlaceAt(col, row) {
    if (gameOver) return;
    if (!selectedDefId) { showToast('👆 Hãy chọn 1 lá chắn ở phía trên trước.', 1600); return; }
    if (col == null || row == null) return;
    if (occ[row][col]) { showToast('⚠️ Ô này đã có lá chắn rồi.', 1400); return; }
    var type = DEF_BY_ID[selectedDefId];
    if (data < type.cost) { showToast('💾 Không đủ Dữ liệu — cần ' + type.cost + '.', 1600); return; }

    data -= type.cost;
    var d = {
      type: type, row: row, col: col,
      x: cellX(col), y: cellY(row),
      hp: type.hp, maxHp: type.hp,
      alive: true,
      genCooldown: type.genFrames || 0,
      shootCooldown: Math.round((type.rateFrames || 0) * 0.4)
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
      ctx.fillText('🖥️', GRID_LEFT / 2, ry + CELL_H / 2);
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
    ctx.strokeStyle = d.type.ring;
    ctx.lineWidth = 1.6;
    roundRect(ctx, bx, by, bw, bh, 10);
    ctx.stroke();

    var img = images[d.type.id];
    var s = Math.min(bw, bh) * 0.62;
    if (imagesReady && img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, d.x - s / 2, d.y - s / 2 - 3, s, s);
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
    ctx.beginPath();
    ctx.arc(z.x + 2, z.y + 4, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(z.x, z.y, r, 0, Math.PI * 2);
    var zg = ctx.createRadialGradient(z.x - r * 0.3, z.y - r * 0.3, 2, z.x, z.y, r);
    zg.addColorStop(0, z.attacking ? '#5a2e2e' : '#33263f');
    zg.addColorStop(1, z.attacking ? '#2c1414' : '#181021');
    ctx.fillStyle = zg;
    ctx.fill();
    ctx.strokeStyle = z.attacking ? '#e2793b' : 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.font = (r * 1.3) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(z.def.emoji, z.x, z.y + 1);

    var barW = r * 2;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(z.x - barW / 2, z.y - r - 8, barW, 4);
    ctx.fillStyle = (z.hp / z.maxHp > 0.4) ? '#ffcf80' : '#e23b3b';
    ctx.fillRect(z.x - barW / 2, z.y - r - 8, barW * Math.max(0, z.hp / z.maxHp), 4);
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
    DEF_TYPES.forEach(function (type) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'pz-shop-card' + (selectedDefId === type.id ? ' selected' : '') + (data < type.cost ? ' disabled' : '');
      card.innerHTML =
        '<img class="pz-shop-icon" src="' + type.img + '" alt="' + type.name + '">' +
        '<div class="pz-shop-name">' + type.name + '</div>' +
        '<div class="pz-shop-cost">💾 ' + type.cost + '</div>';
      card.addEventListener('click', function () {
        if (gameOver) return;
        selectedDefId = (selectedDefId === type.id) ? null : type.id;
        buildShopUI();
      });
      els.shop.appendChild(card);
    });
  }

  function refreshShopAffordability() {
    if (!els.shop) return;
    var cards = els.shop.querySelectorAll('.pz-shop-card');
    DEF_TYPES.forEach(function (type, i) {
      if (!cards[i]) return;
      cards[i].classList.toggle('disabled', data < type.cost);
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
    var p = canvasPoint(evt);
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
