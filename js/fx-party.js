/* ============================================================
   js/fx-party.js — hiệu ứng "lễ hội" DÙNG CHUNG cho Gọi tên vui + Đấu trường + mini-game.
     fireworks(opts)    pháo hoa bắn từ dưới lên, nổ thành chùm sáng (canvas, tự dọn)   opts: { shells, ms, sound }
     rain(opts)         mưa ruy băng + giấy màu rơi từ trên xuống, đung đưa (canvas)       opts: { count, ms, glyphs: ['', ''] }
                        glyphs: ~1/3 số hạt là biểu tượng hợp với trò (trứng, tên lửa, bóng bay...)
     rays(el)           vầng tia sáng xoay chậm phía sau 1 khung (chèn làm con đầu tiên)
     letters(el, opts)  chữ trong el nảy lên từng ký tự (giữ nguyên textContent)            opts: { step, delay }
     flash(tone)        chớp viền màn hình: 'good' (xanh) | 'bad' (đỏ) | 'gold'
     host()             nơi gắn lớp phủ: phần tử đang toàn màn hình, không thì <body>
   Canvas + CSS tự chèn, không thư viện, không tải gì → 0 byte mạng, chạy offline.
   Máy đặt "giảm chuyển động": bỏ hết, chỉ còn chữ tĩnh.
   ============================================================ */
(function (global) {
  'use strict';

  var COLORS = ['#ffd23f', '#ff6b6b', '#4dabf7', '#51cf66', '#f783ac', '#ffa94d', '#9775fa', '#ffffff'];
  function reduced() {
    try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function host() {
    var f = document.fullscreenElement;
    return f && f.appendChild && !/^(VIDEO|CANVAS|IMG)$/.test(f.tagName) ? f : document.body;
  }
  function sfx(n) { try { if (global.EduSFX) global.EduSFX.play(n); } catch (e) { /* ignore */ } }

  /** Canvas phủ toàn màn hình; draw(ctx, w, h, t) trả false thì dừng và gỡ canvas. */
  function overlay(draw) {
    var cv = document.createElement('canvas');
    cv.className = 'edp-canvas';
    cv.setAttribute('aria-hidden', 'true');
    var dpr = Math.min(global.devicePixelRatio || 1, 2), w = innerWidth, h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    host().appendChild(cv);
    var ctx = cv.getContext('2d');
    if (!ctx) { cv.remove(); return; }
    ctx.scale(dpr, dpr);
    var t0 = null;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      if (!cv.isConnected || draw(ctx, w, h, ts - t0) === false) { cv.remove(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /** Pháo hoa: mỗi quả bay lên có vệt sáng rồi nổ thành vòng hạt rơi chậm, lấp lánh. */
  function fireworks(opts) {
    var o = opts || {};
    if (reduced()) return;
    var n = o.shells || 7, span = o.ms || 2600, shells = [], sparks = [];
    for (var i = 0; i < n; i++) {
      shells.push({ at: (i / n) * span * 0.75 + Math.random() * 180, x: (i % 2 ? 0.7 : 0.06) + Math.random() * 0.24, top: 0.14 + Math.random() * 0.26, // nổ 2 bên, chừa giữa cho tên/chữ lớn
        color: COLORS[i % (COLORS.length - 1)], up: false, done: false, px: 0, py: 0 });
    }
    overlay(function (ctx, w, h, t) {
      // Vệt mờ dần thay vì xoá trắng → đuôi sáng
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      shells.forEach(function (s) {
        if (s.done || t < s.at) return;
        var f = Math.min(1, (t - s.at) / 650), e = 1 - Math.pow(1 - f, 2);
        s.px = s.x * w + Math.sin(f * 6) * 6;
        s.py = h + 10 - (h + 10 - s.top * h) * e;
        ctx.fillStyle = '#fff6d6';
        ctx.beginPath(); ctx.arc(s.px, s.py, 2.6, 0, Math.PI * 2); ctx.fill();
        if (f >= 1) {
          s.done = true;
          if (o.sound !== false) sfx('boom');
          var k = 56 + Math.floor(Math.random() * 20), ring = Math.random() < 0.5;
          for (var j = 0; j < k; j++) {
            var a = (Math.PI * 2 * j) / k, v = ring ? 4.2 : 1.2 + Math.random() * 3.6;
            sparks.push({ x: s.px, y: s.py, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: 0.011 + Math.random() * 0.01,
              color: Math.random() < 0.2 ? '#ffffff' : s.color, r: 1.6 + Math.random() * 1.6 });
          }
        }
      });
      for (var m = sparks.length - 1; m >= 0; m--) {
        var p = sparks[m];
        p.vx *= 0.975; p.vy = p.vy * 0.975 + 0.06; p.x += p.vx; p.y += p.vy; p.life -= p.decay;
        if (p.life <= 0) { sparks.splice(m, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life * 1.4) * (Math.random() < 0.15 ? 0.4 : 1); // lấp lánh
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return t < span + 900 || sparks.length > 0;
    });
  }

  /** Mưa ruy băng: dải giấy dài xoắn + mảnh vuông, rơi kèm đung đưa. */
  function rain(opts) {
    var o = opts || {};
    if (reduced()) return;
    var n = o.count || 90, span = o.ms || 3200, bits = [];
    for (var i = 0; i < n; i++) {
      bits.push({ x: Math.random(), y: -0.05 - Math.random() * 0.6, vy: 0.0028 + Math.random() * 0.0035, sway: Math.random() * 6.28,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.2, ribbon: Math.random() < 0.35,
        glyph: o.glyphs && o.glyphs.length && i % 3 === 0 ? o.glyphs[(i / 3) % o.glyphs.length] : '',
        size: 6 + Math.random() * 6, color: COLORS[i % COLORS.length] });
    }
    var last = 0;
    overlay(function (ctx, w, h, t) {
      var dt = Math.min(48, t - last) / 16.7; last = t;
      ctx.clearRect(0, 0, w, h);
      var fade = t > span ? Math.max(0, 1 - (t - span) / 700) : 1, alive = false;
      bits.forEach(function (b) {
        b.y += b.vy * dt; b.sway += 0.05 * dt; b.rot += b.vr * dt;
        if (b.y > 1.05) return;
        alive = true;
        var x = b.x * w + Math.sin(b.sway) * 22, y = b.y * h;
        ctx.save(); ctx.translate(x, y); ctx.rotate(b.rot); ctx.globalAlpha = fade;
        ctx.fillStyle = b.color;
        if (b.glyph) {
          ctx.rotate(-b.rot * 0.8); // biểu tượng chỉ lắc nhẹ, không lộn ngược
          ctx.font = Math.round(b.size * 3) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(b.glyph, 0, 0);
        } else if (b.ribbon) {
          // Dải ruy băng uốn sóng: 6 đoạn nhỏ lệch pha
          for (var s = 0; s < 6; s++) ctx.fillRect(Math.sin(b.sway * 2 + s) * 3 - 2, s * 4, 4, 4.6);
        } else {
          ctx.scale(1, Math.abs(Math.cos(b.rot * 2)) + 0.15); // lật mặt giấy
          ctx.fillRect(-b.size / 2, -b.size / 3, b.size, b.size * 0.66);
        }
        ctx.restore();
      });
      return alive && fade > 0;
    });
  }

  /** Vầng tia sáng xoay phía sau el (el cần position khác static). Gọi lại không chèn 2 lần. */
  function rays(el) {
    if (!el || el.querySelector(':scope > .edp-rays')) return;
    var r = document.createElement('span');
    r.className = 'edp-rays';
    r.setAttribute('aria-hidden', 'true');
    el.insertBefore(r, el.firstChild);
  }

  /** Chữ nảy lên lần lượt. Tách theo cụm ký tự (giữ dấu tiếng Việt), mỗi từ không bị ngắt dòng giữa chừng. */
  function letters(el, opts) {
    if (!el || reduced()) return;
    var o = opts || {}, step = o.step || 55, delay = o.delay || 0, text = (el.textContent || '').normalize('NFC');
    var seg = global.Intl && Intl.Segmenter ? new Intl.Segmenter('vi', { granularity: 'grapheme' }) : null;
    var split = function (w) { return seg ? Array.from(seg.segment(w), function (x) { return x.segment; }) : Array.from(w); };
    var k = 0;
    el.textContent = '';
    text.split(/(\s+)/).forEach(function (word) {
      if (!word) return;
      if (/^\s+$/.test(word)) { el.appendChild(document.createTextNode(' ')); return; }
      var wsp = document.createElement('span');
      wsp.className = 'edp-word';
      split(word).forEach(function (ch) {
        var c = document.createElement('span');
        c.className = 'edp-ch';
        c.textContent = ch;
        c.style.animationDelay = (delay + k++ * step) + 'ms';
        wsp.appendChild(c);
      });
      el.appendChild(wsp);
    });
  }

  /** Chớp viền màn hình 1 nhịp. */
  function flash(tone) {
    if (reduced()) return;
    var f = document.createElement('div');
    f.className = 'edp-flash t-' + (tone || 'good');
    f.setAttribute('aria-hidden', 'true');
    host().appendChild(f);
    setTimeout(function () { f.remove(); }, 700);
  }

  if (!document.getElementById('edp-style')) {
    var st = document.createElement('style');
    st.id = 'edp-style';
    st.textContent =
      '.edp-canvas{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:99997}' +
      '.edp-rays{position:absolute;left:50%;top:50%;width:220%;aspect-ratio:1;z-index:-1;pointer-events:none;transform:translate(-50%,-50%);' +
        'background:repeating-conic-gradient(from 0deg,rgba(255,210,63,.55) 0deg 9deg,rgba(255,210,63,0) 9deg 22.5deg);' +
        '-webkit-mask:radial-gradient(closest-side,#000 30%,transparent 72%);mask:radial-gradient(closest-side,#000 30%,transparent 72%);' +
        'animation:edpRays 14s linear infinite,edpFade .6s ease-out}' +
      '@keyframes edpRays{to{transform:translate(-50%,-50%) rotate(360deg)}}' +
      '@keyframes edpFade{from{opacity:0}}' +
      '.edp-word{display:inline-block;white-space:nowrap}' +
      '.edp-ch{display:inline-block;animation:edpCh .55s cubic-bezier(.2,1.8,.4,1) both}' +
      '@keyframes edpCh{0%{transform:translateY(.6em) scale(.2) rotate(-12deg);opacity:0}60%{transform:translateY(-.12em) scale(1.18) rotate(3deg);opacity:1}100%{transform:none;opacity:1}}' +
      '.edp-flash{position:fixed;inset:0;z-index:99996;pointer-events:none;animation:edpFlash .65s ease-out forwards}' +
      '.edp-flash.t-good{box-shadow:inset 0 0 120px 26px rgba(55,200,120,.6)}' +
      '.edp-flash.t-bad{box-shadow:inset 0 0 120px 26px rgba(229,72,77,.6)}' +
      '.edp-flash.t-gold{box-shadow:inset 0 0 140px 34px rgba(255,200,40,.7)}' +
      '@keyframes edpFlash{0%{opacity:0}25%{opacity:1}100%{opacity:0}}' +
      '@media (prefers-reduced-motion: reduce){.edp-rays,.edp-ch{animation:none!important}}';
    document.head.appendChild(st);
  }

  global.EduParty = { fireworks: fireworks, rain: rain, rays: rays, letters: letters, flash: flash, host: host };
})(window);
