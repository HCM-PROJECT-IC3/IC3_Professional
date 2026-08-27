/* ════════════════════════════════════════════════════════════
   js/game-zone-gate.js — "Khu Vui Chơi": gộp 5 mini-game (Prism
   Cascade / Trí Nhớ Thiết Bị / Sudoku / Bi-a / Phòng Thủ Dữ Liệu)
   vào 1 hub duy nhất (#gameZoneModalOverlay trong index.html).

   ĐIỀU KIỆN MỞ KHÓA (single-use, chỉ tính bài "Tổng hợp"):
     0) BYPASS: nếu người đang mở trang đã đăng nhập sẵn (qua login.html,
        phiên Firebase Auth vẫn còn) với vai trò "admin", hoặc "teacher"
        đã được duyệt (approved !== false) → Khu Vui Chơi LUÔN mở khóa,
        KHÔNG cần làm bài thi và KHÔNG bị "tiêu thụ" khi chọn 1 game (vào
        được nhiều lần). Trang này vốn không bắt buộc đăng nhập (học sinh
        vào bình thường không cần tài khoản) — bypass chỉ áp dụng KHI CÓ
        SẴN phiên đăng nhập admin/giáo viên, không yêu cầu đăng nhập mới.
     1) CHỈ xét bài làm gần nhất có isRandomMix === true (bài
        "📚 Tổng hợp — ngẫu nhiên chia đều chủ đề") của học sinh
        đang được chọn trong form lobby — KHÔNG tính bài làm theo
        từng chủ đề riêng lẻ (1 trong 7 chủ đề), và KHÔNG tính điểm
        cao nhất trong lịch sử — chỉ lần làm Tổng hợp GẦN NHẤT.
     2) Bài Tổng hợp gần nhất đó phải đạt ≥ PASS_THRESHOLD% điểm.
     3) SINGLE-USE: ngay khi học sinh bấm vào 1 mini-game để chơi,
        lượt mở khóa đó bị "tiêu thụ" (đánh dấu vào
        "eduquiz_gamezone_consumed" trong localStorage) → Khu Vui
        Chơi khóa lại ngay, học sinh phải làm 1 bài Tổng hợp MỚI
        đạt ≥90% thì mới mở khóa lại được.

   Không đụng vào 5 file js/*-modal.js hiện có: các nút mở game gốc
   (#openGameBtn, #openMemoryGameBtn, #openSudokuBtn,
   #openBilliardsBtn, #openPzDefenseBtn) chỉ được DI CHUYỂN vào bên
   trong hub trong index.html — id giữ nguyên nên mỗi *-modal.js vẫn
   tự tìm thấy nút của mình và hoạt động y hệt cũ. File này chỉ:
     1) Tính trạng thái khóa/mở dựa trên "eduquiz_records" +
        "eduquiz_gamezone_consumed".
     2) Hiện panel khóa hoặc panel lưới 5 game trong hub.
     3) Gắn thêm listener trên chính các nút mở game đó để "tiêu
        thụ" lượt mở khóa + tự đóng hub lại khi học sinh chọn 1 game
        (modal game riêng sẽ tự mở đè lên, không cần đợi).
   Nạp SAU js/quiz-engine.js (để nghe được sự kiện "edu:record-saved")
   và SAU 5 file *-modal.js (xem thứ tự script trong index.html).
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PASS_THRESHOLD = 90; // %
  var CONSUMED_KEY    = 'eduquiz_gamezone_consumed'; // localStorage: mảng record.id đã "dùng" để vào game

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

    // ── Bypass admin/giáo viên: true nếu phiên đăng nhập Firebase hiện tại
    //    (nếu có) thuộc role "admin", hoặc "teacher" đã được duyệt. Mặc định
    //    false cho tới khi EduAuth xác nhận xong (async) — không chặn học
    //    sinh trong lúc chờ, chỉ mở thêm quyền khi xác nhận được. ──
    var staffBypass = false;

    function initStaffBypass() {
      if (!window.EduAuth || !window.EduFirebase || !window.EduFirebase.auth) return;
      EduAuth.onAuthReady(function (user, profile) {
        staffBypass = !!profile && (
          profile.role === 'admin' ||
          (profile.role === 'teacher' && profile.approved !== false)
        );
        render();
      });
    }

    /* ── Đọc "học sinh đang được chọn" từ form lobby ── */
    function currentStudent() {
      return {
        name:   (nameSel   && nameSel.value)   || '',
        class:  (classSel  && classSel.value)  || '',
        school: (schoolSel && schoolSel.value) || ''
      };
    }

    function readConsumedIds() {
      try { return JSON.parse(localStorage.getItem(CONSUMED_KEY) || '[]'); }
      catch (e) { return []; }
    }
    function markConsumed(recordId) {
      if (recordId == null) return;
      var ids = readConsumedIds();
      if (ids.indexOf(recordId) === -1) {
        ids.push(recordId);
        try { localStorage.setItem(CONSUMED_KEY, JSON.stringify(ids)); }
        catch (e) { /* localStorage đầy/bị chặn — bỏ qua */ }
      }
    }

    /* ── Bài "Tổng hợp" GẦN NHẤT của học sinh đang chọn (khớp theo
       Tên + Lớp + Trường để tránh trùng tên khác lớp/trường).
       Trả về record đó, hoặc null nếu chưa từng làm bài Tổng hợp. ── */
    function latestRandomMixRecord() {
      var st = currentStudent();
      if (!st.name) return null;

      var records = [];
      try { records = JSON.parse(localStorage.getItem('eduquiz_records') || '[]'); }
      catch (e) { records = []; }

      var mine = records.filter(function (r) {
        return r.studentName === st.name &&
               (r.studentClass  || '') === st.class &&
               (r.studentSchool || '') === st.school &&
               r.isRandomMix === true; // CHỈ tính bài "Tổng hợp", không tính bài theo từng chủ đề riêng lẻ
      });
      if (!mine.length) return null;

      // eduquiz_records được unshift (mới nhất ở đầu mảng) nhưng vẫn
      // sort tường minh theo id (= Date.now() lúc lưu) để chắc chắn
      // lấy đúng LẦN GẦN NHẤT, không phải điểm cao nhất trong lịch sử.
      mine.sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
      return mine[0];
    }

    /* ── Trạng thái mở khóa hiện tại: admin/giáo viên (đã đăng nhập sẵn)
       luôn mở khóa, không cần xét bài thi. Ngược lại (học sinh/khách),
       bài Tổng hợp gần nhất phải đạt ≥90% VÀ chưa bị "tiêu thụ" (chưa
       dùng để vào game lần nào). ── */
    function unlockState() {
      if (staffBypass) return { unlocked: true, record: null, staff: true };
      var rec = latestRandomMixRecord();
      if (!rec) return { unlocked: false, record: null };
      var consumedIds = readConsumedIds();
      var qualifies = (rec.score || 0) >= PASS_THRESHOLD;
      var used      = consumedIds.indexOf(rec.id) !== -1;
      return { unlocked: qualifies && !used, record: rec };
    }

    // Nhớ trạng thái khóa/mở TẠI LẦN render() gần nhất, để phân biệt
    // "vừa mở khóa nhờ bài vừa nộp" với "đã mở khóa từ trước" khi
    // sự kiện edu:record-saved bắn ra.
    var lastKnownUnlocked = false;

    /* ── Cập nhật nút mở hub ngoài lobby + panel trong hub ── */
    function render() {
      var st    = currentStudent();
      var state = unlockState();
      var rec   = state.record;
      var unlocked = state.unlocked;

      if (unlocked) {
        openHubBtn.classList.remove('is-locked');
        openHubBtn.innerHTML = '🎮 Khu Vui Chơi';
        if (hint) hint.textContent = state.staff ? '✓ Quyền quản trị viên/giáo viên — không cần làm bài thi.' : '';
      } else {
        openHubBtn.classList.add('is-locked');
        openHubBtn.innerHTML = '🔒 Khu Vui Chơi';
        if (hint) {
          hint.textContent = !st.name
            ? 'Chọn học sinh để xem tiến độ mở khóa Khu Vui Chơi.'
            : (!rec
                ? 'Làm bài "📚 Tổng hợp" đạt ≥' + PASS_THRESHOLD + '% để mở khóa.'
                : (rec.score >= PASS_THRESHOLD
                    ? 'Đã dùng lượt mở khóa — làm 1 bài "Tổng hợp" mới đạt ≥' + PASS_THRESHOLD + '% để vào lại.'
                    : 'Bài "Tổng hợp" gần nhất: ' + rec.score + '% — cần ≥' + PASS_THRESHOLD + '% để mở khóa.'));
        }
      }

      if (lockedView && unlockedView) {
        lockedView.style.display   = unlocked ? 'none' : '';
        unlockedView.style.display = unlocked ? '' : 'none';
      }
      if (progressEl) {
        progressEl.textContent = state.staff
          ? 'Đăng nhập với quyền quản trị viên/giáo viên — Khu Vui Chơi luôn mở, không cần làm bài thi.'
          : (!st.name
              ? 'Chưa chọn học sinh.'
              : (!rec
                  ? 'Học sinh "' + st.name + '" chưa làm bài "Tổng hợp" nào.'
                  : (rec.score >= PASS_THRESHOLD
                      ? 'Học sinh "' + st.name + '" đã dùng lượt mở khóa (bài Tổng hợp ' + rec.score + '%). Làm 1 bài Tổng hợp mới đạt ≥' + PASS_THRESHOLD + '% để vào lại.'
                      : 'Bài "Tổng hợp" gần nhất của "' + st.name + '": ' + rec.score + '% (cần ≥' + PASS_THRESHOLD + '%).')));
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

    // Chọn 1 game trong hub (khi đã mở khóa) → TIÊU THỤ lượt mở khóa
    // (khóa lại ngay, phải làm 1 bài Tổng hợp mới đạt ≥90% để vào lại)
    // rồi đóng hub lại, để game riêng (đã tự mở qua listener của chính
    // js/*-modal.js) hiện lên. Admin/giáo viên (staffBypass) KHÔNG bị tiêu
    // thụ lượt — họ vào được nhiều lần, không gắn với 1 bài thi cụ thể.
    GAME_BTN_IDS.forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function () {
        var state = unlockState();
        if (state.unlocked && state.record && !state.staff) markConsumed(state.record.id);
        publishCurrentStudent();
        closeHub();
      });
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
      var nowUnlocked = unlockState().unlocked;
      if (!wasUnlocked && nowUnlocked) {
        // Thông báo nhẹ nhàng, không chặn luồng xem kết quả bài thi.
        setTimeout(function () {
          alert('🎉 Chúc mừng! Bạn đã đạt từ ' + PASS_THRESHOLD + '% điểm bài Tổng hợp — Khu Vui Chơi đã được mở khóa (dùng được 1 lần).');
        }, 300);
      }
    });

    render();
    initStaffBypass();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
