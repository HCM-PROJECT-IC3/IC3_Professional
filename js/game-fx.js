/* ============================================================
   js/game-fx.js — Hiệu ứng hình ảnh DÙNG CHUNG cho các mini-game
   (confetti khi thắng/lập kỷ lục, rung màn hình, làm nổi bật).

   Vẽ bằng <canvas> phủ toàn màn hình, tự huỷ sau khi hiệu ứng kết
   thúc — KHÔNG cần thư viện ngoài (canvas-confetti, particles.js...),
   nên không tốn thêm request mạng và chạy được cả khi offline.

   Cách dùng ở game khác:
     <script src="js/game-fx.js"></script>
     EduFX.confetti();                 // burst mặc định, giữa màn hình
     EduFX.confetti({ x: 0.3 });       // burst lệch trái (x: 0..1, tỉ lệ theo chiều rộng)
     EduFX.shake(el);                  // rung nhẹ 1 phần tử (vd toàn bộ overlay kết quả)
   ============================================================ */
(function (global) {
  'use strict';

  var COLORS = ['#8fa4ff', '#66e0d0', '#ffcf80', '#ff8fa3', '#ffd166', '#4fd6a0'];

  function prefersReducedMotion() {
    try { return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  /**
   * Bắn pháo giấy (confetti) phủ toàn màn hình trong ~1.6s rồi tự dọn dẹp.
   * @param {Object} [opts]
   * @param {number} [opts.x] — vị trí X xuất phát, tỉ lệ 0..1 theo chiều rộng viewport (mặc định 0.5 = giữa).
   * @param {number} [opts.count] — số mảnh giấy (mặc định 60, giảm dần trên máy yếu qua reduced-motion).
   */
  function confetti(opts) {
    opts = opts || {};
    if (prefersReducedMotion()) return; // tôn trọng cài đặt hạn chế chuyển động của người dùng

    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:99998;';
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var originX = (opts.x != null ? opts.x : 0.5) * innerWidth;
    var count = opts.count || 60;
    var pieces = [];
    for (var i = 0; i < count; i++) {
      var angle = (Math.random() * Math.PI) + Math.PI; // bắn lên trên, toả rộng
      var speed = 4 + Math.random() * 6;
      pieces.push({
        x: originX,
        y: innerHeight * 0.4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 5 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.3,
        shape: Math.random() < 0.5 ? 'rect' : 'circle'
      });
    }

    var gravity = 0.18;
    var startTs = null;
    var durationMs = 1600;

    function frame(ts) {
      if (!startTs) startTs = ts;
      var elapsed = ts - startTs;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      pieces.forEach(function (p) {
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - elapsed / durationMs);
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      if (elapsed < durationMs) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    }
    requestAnimationFrame(frame);
  }

  /** Rung nhẹ 1 phần tử (thêm class .edufx-shake, tự gỡ sau animation) — dùng cho khoảnh khắc "va chạm"/thua. */
  function shake(el) {
    if (!el || prefersReducedMotion()) return;
    el.classList.remove('edufx-shake');
    void el.offsetWidth;
    el.classList.add('edufx-shake');
  }

  /** Bật nảy nhẹ (scale bump) khi 1 số trong HUD vừa đổi (điểm/combo) — phản hồi "đã tay" hơn là đổi số im lìm. */
  function pop(el) {
    if (!el || prefersReducedMotion()) return;
    el.classList.remove('edufx-pop');
    void el.offsetWidth;
    el.classList.add('edufx-pop');
  }

  // Style tối thiểu cho .edufx-shake/.edufx-pop — chèn 1 lần duy nhất, không cần
  // file CSS riêng (giữ game-fx.js là 1 file "cắm là chạy", giống game-sfx.js).
  if (!document.getElementById('edufx-style')) {
    var style = document.createElement('style');
    style.id = 'edufx-style';
    style.textContent =
      '@keyframes edufxShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}' +
      '.edufx-shake{animation:edufxShake .4s ease}' +
      '@keyframes edufxPop{0%{transform:scale(1)}45%{transform:scale(1.35)}100%{transform:scale(1)}}' +
      '.edufx-pop{display:inline-block;animation:edufxPop .28s cubic-bezier(.34,1.56,.64,1)}';
    document.head.appendChild(style);
  }

  global.EduFX = { confetti: confetti, shake: shake, pop: pop };
})(window);
