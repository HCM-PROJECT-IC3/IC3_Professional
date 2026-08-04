/* ============================================================
   js/motion.js — Lớp hiệu ứng chuyển động dùng CHUNG cho toàn
   site (index.html khi làm bài, các trang quản trị), lấy cảm
   hứng từ tuhoc.cc: hiện dần khi CUỘN, nghiêng theo chuột khi
   RÊ, "nảy" khi CHỌN, có trọng lượng khi KÉO-THẢ, nhấn có gợn
   sóng khi BẤM.

   Nguyên tắc: THUẦN CỘNG THÊM.
   - Không sửa/đè bất kỳ hàm nào trong quiz-engine.js, main.js,
     gamification.js, hotspot-question.js...
   - Chỉ lắng nghe DOM (event delegation + MutationObserver) và
     thêm/gỡ class "mo-*" (định nghĩa hiệu ứng ở css/motion.css).
   - Nếu xoá file này + motion.css, toàn bộ chức năng chấm điểm/
     điều hướng vẫn chạy y nguyên như trước.
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var touchDevice = window.matchMedia('(hover: none)').matches;

  var REVEAL_SELECTOR =
    '.topic-card, .lobby-stat, .result-stat, .review-item, ' +
    '.q-item, .deck-card, .stat-card, .kpi-card, .student-row, ' +
    '[data-reveal]';

  var RIPPLE_SELECTOR =
    '.btn-start, .btn-secondary, .btn-retry, .btn-submit-top, ' +
    '.btn-back-lobby, .btn-export, .btn-danger, .option-btn, ' +
    '.tf-btn, .topic-card, .drag-chip, .hotspot-region, .q-btn, ' +
    '[data-ripple]';

  /* 1) SCROLL REVEAL ---------------------------------------- */
  function initScrollReveal() {
    var all = document.querySelectorAll(REVEAL_SELECTOR);
    var fresh = [];
    for (var i = 0; i < all.length; i++) {
      if (!all[i].classList.contains('mo-reveal')) fresh.push(all[i]);
    }
    if (!fresh.length) return;

    if (reduced || !('IntersectionObserver' in window)) {
      fresh.forEach(function (el) { el.classList.add('mo-reveal', 'mo-visible'); });
      return;
    }

    fresh.forEach(function (el, i) {
      el.classList.add('mo-reveal');
      el.style.setProperty('--mo-delay', (i % 8) * 55 + 'ms');
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('mo-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });

    fresh.forEach(function (el) { io.observe(el); });
  }

  /* 2) CLICK / TAP RIPPLE ------------------------------------ */
  function initRipple() {
    document.addEventListener('pointerdown', function (e) {
      var el = e.target.closest && e.target.closest(RIPPLE_SELECTOR);
      if (!el || el.disabled) return;
      var rect = el.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 1.6;
      var span = document.createElement('span');
      span.className = 'mo-ripple';
      span.style.width = span.style.height = size + 'px';
      span.style.left = (e.clientX - rect.left - size / 2) + 'px';
      span.style.top = (e.clientY - rect.top - size / 2) + 'px';

      if (getComputedStyle(el).position === 'static') {
        el.style.position = 'relative';
      }
      el.classList.add('mo-ripple-host');
      el.appendChild(span);
      span.addEventListener('animationend', function () { span.remove(); });
    }, { passive: true });
  }

  /* 3) PICK POP — quan sát các class chọn-đáp-án đã có sẵn --- */
  function initPickPop() {
    var watch = ['selected', 'selected-true', 'selected-false', 'tap-selected'];
    var mo = new MutationObserver(function (mutations) {
      if (reduced) return;
      mutations.forEach(function (m) {
        if (m.attributeName !== 'class') return;
        var el = m.target;
        if (!el.classList) return;
        var before = (m.oldValue || '').split(/\s+/);
        var now = [];
        el.classList.forEach(function (c) { now.push(c); });
        var justPicked = watch.some(function (c) { return now.indexOf(c) !== -1 && before.indexOf(c) === -1; });
        if (justPicked) {
          el.classList.remove('mo-pick-pop');
          void el.offsetWidth; // ép trình duyệt tính lại để animation chạy lại
          el.classList.add('mo-pick-pop');
        }
      });
    });
    mo.observe(document.body, {
      attributes: true, attributeFilter: ['class'],
      attributeOldValue: true, subtree: true
    });
  }

  /* 4) DRAG LIFT — chip .drag-chip đã draggable sẵn ---------- */
  function initDragLift() {
    document.addEventListener('dragstart', function (e) {
      var chip = e.target.closest && e.target.closest('.drag-chip');
      if (chip) chip.classList.add('mo-drag-lift');
    });
    document.addEventListener('dragend', function (e) {
      var chip = e.target.closest && e.target.closest('.drag-chip');
      if (!chip) return;
      chip.classList.remove('mo-drag-lift');
      if (!reduced) {
        chip.classList.add('mo-drop-bounce');
        setTimeout(function () { chip.classList.remove('mo-drop-bounce'); }, 340);
      }
    });
  }

  /* 5) SCREEN TRANSITION — #lobby/#exam/#result đổi bằng
     style.display trong quiz-engine.js, ta chỉ quan sát. ------ */
  function initScreenTransition() {
    ['lobby', 'exam', 'result'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var wasHidden = getComputedStyle(el).display === 'none';
      var mo = new MutationObserver(function () {
        var hiddenNow = getComputedStyle(el).display === 'none';
        if (wasHidden && !hiddenNow) {
          if (!reduced) {
            el.classList.remove('mo-screen-in');
            void el.offsetWidth;
            el.classList.add('mo-screen-in');
          }
          initScrollReveal(); // quét phần tử vừa xuất hiện trong màn mới
        }
        wasHidden = hiddenNow;
      });
      mo.observe(el, { attributes: true, attributeFilter: ['style'] });
    });
  }

  /* 6) MAGNETIC TILT cho thẻ chủ đề IC3 ----------------------- */
  function initTopicTilt() {
    if (reduced || touchDevice) return;
    document.querySelectorAll('.topic-card').forEach(function (card) {
      if (card.dataset.moTiltBound) return;
      card.dataset.moTiltBound = '1';
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        var rx = (0.5 - py) * 10;
        var ry = (px - 0.5) * 10;
        card.style.transform = 'translateY(-4px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
      });
      card.addEventListener('mouseleave', function () { card.style.transform = ''; });
    });
  }

  /* 7) PROGRESS BAR SHINE — mỗi lần progressFill đổi width ---- */
  function initProgressShine() {
    var bar = document.getElementById('progressFill');
    if (!bar) return;
    var mo = new MutationObserver(function () {
      if (reduced) return;
      bar.classList.remove('mo-progress-bump');
      void bar.offsetWidth;
      bar.classList.add('mo-progress-bump');
    });
    mo.observe(bar, { attributes: true, attributeFilter: ['style'] });
  }

  function boot() {
    initScrollReveal();
    initRipple();
    initPickPop();
    initDragLift();
    initScreenTransition();
    initTopicTilt();
    initProgressShine();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Quét lại reveal + tilt mỗi khi nội dung mới được chèn động
     (câu hỏi mới, bảng dữ liệu mới render...), có debounce nhẹ. */
  var rescanTimer = null;
  document.addEventListener('DOMContentLoaded', function () {
    var bodyObserver = new MutationObserver(function () {
      clearTimeout(rescanTimer);
      rescanTimer = setTimeout(function () {
        initScrollReveal();
        initTopicTilt();
      }, 150);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  });
})();
