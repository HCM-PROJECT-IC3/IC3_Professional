/* ════════════════════════════════════════════════════════════
   js/game-zone-gate.js — "Khu Vui Chơi": gộp 5 mini-game (Prism
   Cascade / Trí Nhớ Thiết Bị / Sudoku / Bi-a / Phòng Thủ Dữ Liệu)
   vào 1 hub duy nhất (#gameZoneModalOverlay trong index.html), và
   CHỈ mở khóa cho học sinh đang được chọn trong form lobby nếu
   trong lịch sử "eduquiz_records" (localStorage, do
   js/quiz-engine.js § SAVE RECORD ghi) có ít nhất 1 bài đạt từ
   PASS_THRESHOLD% điểm trở lên.

   Không đụng vào 5 file js/*-modal.js hiện có: các nút mở game gốc
   (#openGameBtn, #openMemoryGameBtn, #openSudokuBtn,
   #openBilliardsBtn, #openPzDefenseBtn) chỉ được DI CHUYỂN vào bên
   trong hub trong index.html — id giữ nguyên nên mỗi *-modal.js vẫn
   tự tìm thấy nút của mình và hoạt động y hệt cũ. File này chỉ:
     1) Tính trạng thái khóa/mở dựa trên "eduquiz_records".
     2) Hiện panel khóa hoặc panel lưới 5 game trong hub.
     3) Gắn thêm listener trên chính các nút mở game đó để tự đóng
        hub lại khi học sinh chọn 1 game (modal game riêng sẽ tự mở
        đè lên, không cần đợi).
   Nạp SAU js/quiz-engine.js (để nghe được sự kiện "edu:record-saved")
   và SAU 5 file *-modal.js (xem thứ tự script trong index.html).
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PASS_THRESHOLD = 90; // %

  var GAME_BTN_IDS = [
    'openGameBtn',
    'openMemoryGameBtn',
    'openSudokuBtn',
    'openBilliardsBtn',
    'openPzDefenseBtn',
    'openBattleQuizBtn',
    'openCyberDetectiveBtn',
    'openComputerSimBtn'
  ];

  function init() {
    var openHubBtn   = document.getElementById('openGameZoneBtn');
    var hint         = document.getElementById('gameZoneHint');
    var overlay      = document.getElementById('gameZoneModalOverlay');
    var closeBtn     = document.getElementById('closeGameZoneModalBtn');
    var lockedView   = document.getElementById('gameZoneLocked');
    var unlockedView = document.getElementById('gameZoneUnlocked');
    var progressEl   = document.getElementById('gameZoneProgress');
    if (!openHubBtn || !overlay) return; // trang khác không có hub này

    var schoolSel = document.getElementById('studentSchool');
    var classSel  = document.getElementById('studentClass');
    var nameSel   = document.getElementById('studentName');

    /* ── Đọc "học sinh đang được chọn" từ form lobby ── */
    function currentStudent() {
      return {
        name:   (nameSel   && nameSel.value)   || '',
        class:  (classSel  && classSel.value)  || '',
        school: (schoolSel && schoolSel.value) || ''
      };
    }

    /* ── Điểm cao nhất mà học sinh đang chọn từng đạt được, dựa trên
       eduquiz_records (khớp theo Tên + Lớp + Trường để tránh trùng
       tên khác lớp/trường). Trả về null nếu chưa có bài nào. ── */
    function bestScoreForCurrentStudent() {
      var st = currentStudent();
      if (!st.name) return null;

      var records = [];
      try { records = JSON.parse(localStorage.getItem('eduquiz_records') || '[]'); }
      catch (e) { records = []; }

      var mine = records.filter(function (r) {
        return r.studentName === st.name &&
               (r.studentClass  || '') === st.class &&
               (r.studentSchool || '') === st.school;
      });
      if (!mine.length) return null;

      return mine.reduce(function (max, r) {
        return Math.max(max, r.score || 0);
      }, 0);
    }

    function isUnlocked() {
      var best = bestScoreForCurrentStudent();
      return best !== null && best >= PASS_THRESHOLD;
    }

    // Nhớ trạng thái khóa/mở TẠI LẦN render() gần nhất, để phân biệt
    // "vừa mở khóa nhờ bài vừa nộp" với "đã mở khóa từ trước" khi
    // sự kiện edu:record-saved bắn ra (lúc đó bản ghi mới đã được
    // ghi vào localStorage rồi nên không thể tính lại "trước đó" từ
    // đầu — phải dựa vào giá trị đã lưu từ lần render() trước).
    var lastKnownUnlocked = false;

    /* ── Cập nhật nút mở hub ngoài lobby + panel trong hub ── */
    function render() {
      var st = currentStudent();
      var best = bestScoreForCurrentStudent();
      var unlocked = best !== null && best >= PASS_THRESHOLD;

      if (unlocked) {
        openHubBtn.classList.remove('is-locked');
        openHubBtn.innerHTML = '🎮 Khu Vui Chơi';
        if (hint) hint.textContent = '';
      } else {
        openHubBtn.classList.add('is-locked');
        openHubBtn.innerHTML = '🔒 Khu Vui Chơi';
        if (hint) {
          hint.textContent = !st.name
            ? 'Chọn học sinh để xem tiến độ mở khóa Khu Vui Chơi.'
            : (best === null
                ? 'Cần đạt ≥' + PASS_THRESHOLD + '% điểm 1 bài thi để mở khóa.'
                : 'Điểm cao nhất hiện tại: ' + best + '% — cần ≥' + PASS_THRESHOLD + '% để mở khóa.');
        }
      }

      if (lockedView && unlockedView) {
        lockedView.style.display   = unlocked ? 'none' : '';
        unlockedView.style.display = unlocked ? '' : 'none';
      }
      if (progressEl) {
        progressEl.textContent = !st.name
          ? 'Chưa chọn học sinh.'
          : (best === null
              ? 'Học sinh "' + st.name + '" chưa có bài thi nào được ghi nhận.'
              : 'Điểm cao nhất của "' + st.name + '": ' + best + '% (cần ≥' + PASS_THRESHOLD + '%).');
      }

      lastKnownUnlocked = unlocked;
    }

    function openHub() {
      render();
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
    function closeHub() {
      overlay.classList.remove('show');
      document.body.style.overflow = '';
    }

    openHubBtn.addEventListener('click', openHub);
    if (closeBtn) closeBtn.addEventListener('click', closeHub);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeHub();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('show')) closeHub();
    });

    // (Phase 3+) Trước khi mở 1 game, "gửi" học sinh đang chọn ở lobby
    // cho game đó qua localStorage (đọc được từ trong iframe vì cùng
    // origin) — để js/gamification.js § recordGameSession có thể ghi
    // đúng người chơi khi ván kết thúc. Không có tác dụng gì với 5 game
    // hiện tại (chưa game nào đọc key này) trừ Phòng Thủ Dữ Liệu.
    function publishCurrentStudent() {
      var st = currentStudent();
      if (!st.name) return;
      try { localStorage.setItem('eduquiz_current_student', JSON.stringify(st)); }
      catch (e) { /* localStorage đầy/bị chặn — bỏ qua, không chặn việc mở game */ }
    }

    // Chọn 1 game trong hub (khi đã mở khóa) → đóng hub lại, để game
    // riêng (đã tự mở qua listener của chính js/*-modal.js) hiện lên.
    GAME_BTN_IDS.forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function () { publishCurrentStudent(); closeHub(); });
    });

    // Học sinh đổi Trường/Lớp/Tên → tính lại trạng thái khóa ngay.
    [schoolSel, classSel, nameSel].forEach(function (sel) {
      if (sel) sel.addEventListener('change', render);
    });

    // Vừa nộp 1 bài thi xong (js/quiz-engine.js § SAVE RECORD) →
    // tính lại; nếu vừa cán mốc mở khóa thì báo cho học sinh biết.
    window.addEventListener('edu:record-saved', function (e) {
      var wasUnlocked = lastKnownUnlocked; // trạng thái TRƯỚC bài vừa nộp
      render();
      var nowUnlocked = isUnlocked();
      if (!wasUnlocked && nowUnlocked) {
        // Thông báo nhẹ nhàng, không chặn luồng xem kết quả bài thi.
        setTimeout(function () {
          alert('🎉 Chúc mừng! Bạn đã đạt từ ' + PASS_THRESHOLD + '% điểm — Khu Vui Chơi đã được mở khóa.');
        }, 300);
      }
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
