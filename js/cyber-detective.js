/* ════════════════════════════════════════════════════════════
   js/cyber-detective.js — Mini-game "Cyber Detective" (mục 10 yêu
   cầu gốc). Học sinh điều tra 1 tình huống mất an toàn thông tin
   qua 6 hướng (Email/Website/Mật khẩu/Thiết bị/Mạng/Tệp tin), sau
   đó kết luận NGUYÊN NHÂN tấn công.

   6 nguyên nhân dùng ĐÚNG 6 trong 12 id tác nhân đã có sẵn ở
   ZOMBIE_TYPES (js/pz-defense.js) — không bịa tác nhân mới, dùng
   lại icon ảnh (img/pz-defense/zom_*.png) đã có. Câu gợi ý phòng
   thủ sau khi kết luận lấy TRỰC TIẾP từ
   EduGameEngine.QuestionTopicMap.getWeaknessForEnemy() (Phase 5) —
   không viết lại nội dung đã có.

   Chỉ 6 file CASES bên dưới là nội dung MỚI của riêng game này
   (đúng cách pz-defense.js tự quản lý ZOMBIE_TYPES/DEF_TYPES).
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Nhãn hiển thị cho 6 nguyên nhân — CHỈ phục vụ UI (tên đầy đủ +
  // icon), không phải bản sao của ZOMBIE_TYPES (không có hp/dmg/
  // mechanic ở đây, những field đó chỉ Cyber Defense cần).
  var CAUSE_LABELS = {
    phishing: { name: 'Phishing (Lừa đảo qua link/email giả)', img: 'img/pz-defense/zom_phishing.png' },
    ransom:   { name: 'Ransomware (Mã hoá đòi tiền chuộc)',     img: 'img/pz-defense/zom_ransom.png' },
    trojan:   { name: 'Trojan (Phần mềm giả danh vô hại)',      img: 'img/pz-defense/zom_trojan.png' },
    worm:     { name: 'Worm (Tự lây lan qua mạng nội bộ)',      img: 'img/pz-defense/zom_worm.png' },
    spyware:  { name: 'Spyware (Theo dõi/đánh cắp thông tin)',  img: 'img/pz-defense/zom_spyware.png' },
    ddos:     { name: 'DDoS (Làm ngập lụt server)',             img: 'img/pz-defense/zom_ddos.png' },
  };

  var CATEGORIES = [
    { id: 'email',    label: 'Email',      icon: '📧' },
    { id: 'website',  label: 'Website',    icon: '🌐' },
    { id: 'password', label: 'Mật khẩu',   icon: '🔑' },
    { id: 'device',   label: 'Thiết bị',   icon: '💻' },
    { id: 'network',  label: 'Mạng',       icon: '📶' },
    { id: 'files',    label: 'Tệp tin',    icon: '📁' },
  ];

  // 6 tình huống — nội dung dựa trên kịch bản mất an toàn thông tin
  // có thật trong đời sống số học sinh THCS. Mỗi category có 1-2 dòng
  // manh mối; `key: true` = manh mối THẬT SỰ chỉ ra nguyên nhân đúng,
  // còn lại là thông tin trung lập/gây nhiễu (không sai, chỉ không
  // liên quan) — đúng tinh thần "điều tra", không phải "đoán mò".
  var CASES = [
    {
      id: 'case-phishing-1',
      title: 'Tài khoản Email bị đăng nhập từ thiết bị lạ',
      intro: 'Bạn nhận được thông báo: tài khoản email của bạn vừa được đăng nhập từ 1 thiết bị bạn không hề dùng. Hãy điều tra 6 hướng bên dưới rồi kết luận nguyên nhân.',
      correctCause: 'phishing',
      clues: {
        email:    { text: '3 ngày trước, bạn nhận 1 email "khẩn cấp" từ "IC3 Support" yêu cầu đăng nhập lại NGAY qua 1 đường link để "xác minh tài khoản".', key: true },
        website:  { text: 'Đường link trong email dẫn tới 1 trang đăng nhập trông giống hệt trang thật, nhưng tên miền lạ, sai chính tả 1 chữ cái.', key: true },
        password: { text: 'Mật khẩu tài khoản khá mạnh, có đủ chữ hoa/thường/số.' },
        device:   { text: 'Thiết bị đăng nhập lạ là 1 điện thoại, ở 1 vị trí địa lý khác xa nơi bạn sống.' },
        network:  { text: 'Mạng Wi-Fi đang dùng không có dấu hiệu bất thường.' },
        files:    { text: 'Không có file lạ nào được tải xuống gần đây.' },
      },
    },
    {
      id: 'case-ransom-1',
      title: 'Toàn bộ file trong máy bị khoá, xuất hiện thông báo đòi tiền chuộc',
      intro: 'Sáng nay mở máy lên, bạn thấy toàn bộ file quan trọng đã đổi đuôi lạ và không mở được nữa, kèm 1 thông báo yêu cầu trả tiền để lấy lại dữ liệu.',
      correctCause: 'ransom',
      clues: {
        files:    { text: 'Toàn bộ file .docx/.xlsx/.jpg đã bị đổi thành đuôi lạ (.locked), không mở được nữa; có 1 file "HUONG_DAN_TRA_TIEN.txt" xuất hiện ở mọi thư mục.', key: true },
        email:    { text: '2 ngày trước, có mở 1 file đính kèm "Bang_diem_hoc_ky.zip" gửi từ 1 địa chỉ lạ.', key: true },
        website:  { text: 'Không phát hiện trang web đáng ngờ nào được truy cập gần đây.' },
        password: { text: 'Không có dấu hiệu tài khoản bị đăng nhập trái phép.' },
        device:   { text: 'Máy chạy chậm bất thường ngay trước khi sự việc xảy ra.' },
        network:  { text: 'Ổ cứng ngoài dùng để sao lưu KHÔNG được cắm vào máy suốt 2 tuần qua.' },
      },
    },
    {
      id: 'case-trojan-1',
      title: 'Máy tính chạy chậm bất thường, quạt tản nhiệt kêu to liên tục',
      intro: 'Máy tính của bạn tự nhiên chạy rất chậm, quạt kêu to liên tục dù bạn không mở ứng dụng nặng nào.',
      correctCause: 'trojan',
      clues: {
        files:    { text: 'Gần đây có cài 1 phần mềm "crack" tải từ 1 trang chia sẻ không rõ nguồn gốc để xem phim miễn phí.', key: true },
        device:   { text: 'Trình quản lý tác vụ cho thấy 1 tiến trình lạ dùng rất nhiều CPU dù không có ứng dụng nào đang mở.', key: true },
        website:  { text: 'Trang tải phần mềm crack đó yêu cầu tắt tạm thời antivirus trước khi cài đặt.' },
        network:  { text: 'Có lưu lượng mạng đi ra ngoài liên tục dù không mở trình duyệt nào.' },
        email:    { text: 'Không có email đáng ngờ nào gần đây.' },
        password: { text: 'Không có dấu hiệu liên quan tới mật khẩu.' },
      },
    },
    {
      id: 'case-worm-1',
      title: 'Nhiều máy trong phòng máy đồng loạt bất thường chỉ sau 1 đêm',
      intro: 'Sáng hôm sau, gần 10 máy trong phòng máy tính của trường cùng có dấu hiệu bất thường — dù tối qua không ai mở file gì.',
      correctCause: 'worm',
      clues: {
        network:  { text: 'Tất cả máy trong phòng dùng chung 1 mạng LAN nội bộ, không có tường lửa phân vùng giữa các máy với nhau.', key: true },
        device:   { text: '1 máy trong phòng có cắm 1 USB lạ mượn từ lớp khác vào buổi chiều hôm trước.', key: true },
        files:    { text: 'Không phát hiện file đính kèm email nào được mở trên các máy này.' },
        email:    { text: 'Không có email đáng ngờ liên quan.' },
        website:  { text: 'Không có trang web đáng ngờ nào được ghi nhận truy cập.' },
        password: { text: 'Không có dấu hiệu liên quan tới mật khẩu.' },
      },
    },
    {
      id: 'case-spyware-1',
      title: 'Có người biết chính xác mật khẩu dù bạn chưa từng chia sẻ',
      intro: 'Bạn phát hiện tài khoản của mình bị người khác đăng nhập, dù chưa từng nói mật khẩu cho ai.',
      correctCause: 'spyware',
      clues: {
        device:   { text: 'Gần đây có dùng 1 máy tính công cộng ở quán net để in bài tập, và quên đăng xuất tài khoản sau khi dùng.', key: true },
        files:    { text: 'Máy tính ở quán net đó có cài sẵn 1 phần mềm "theo dõi bàn phím" để chủ quán quản lý giờ chơi — không do bạn cài.', key: true },
        password: { text: 'Mật khẩu tài khoản khá phức tạp, không dễ đoán.' },
        email:    { text: 'Không có email đáng ngờ nào gần đây.' },
        website:  { text: 'Không có trang web lạ nào được truy cập trên thiết bị cá nhân.' },
        network:  { text: 'Mạng ở nhà không có dấu hiệu bất thường.' },
      },
    },
    {
      id: 'case-ddos-1',
      title: 'Website của trường bị sập đúng giờ cao điểm nộp bài',
      intro: 'Đúng lúc cả trường cùng vào nộp bài online, website trường bất ngờ sập, không ai truy cập được.',
      correctCause: 'ddos',
      clues: {
        network:  { text: 'Lượng truy cập vào server tăng đột biến gấp hàng trăm lần bình thường, đến từ rất nhiều địa chỉ khác nhau cùng lúc.', key: true },
        website:  { text: 'Trang web không hề bị thay đổi nội dung hay giao diện — chỉ đơn giản là không phản hồi được.', key: true },
        device:   { text: 'Máy chủ của trường vẫn bật bình thường, không có dấu hiệu bị xâm nhập trực tiếp.' },
        files:    { text: 'Không có file nào trên server bị thay đổi.' },
        email:    { text: 'Không có email đáng ngờ liên quan tới sự việc.' },
        password: { text: 'Không có dấu hiệu liên quan tới mật khẩu tài khoản quản trị.' },
      },
    },
  ];

  var state = {
    currentCase: null,
    revealed: {}, // { categoryId: true }
    selectedCause: null,
    submitted: false,
    sessionStartedAtMs: 0,
  };

  var el = {};
  function qs(id) { return document.getElementById(id); }

  function cacheEls() {
    el.caseTitle = qs('cdCaseTitle');
    el.revealedCount = qs('cdRevealedCount');
    el.restartBtn = qs('cdRestartBtn');
    el.intro = qs('cdIntro');
    el.board = qs('cdBoard');
    el.causeGrid = qs('cdCauseGrid');
    el.submitBtn = qs('cdSubmitBtn');
    el.caseOverlay = qs('cdCaseOverlay');
    el.caseList = qs('cdCaseList');
    el.resultOverlay = qs('cdResultOverlay');
    el.resultIcon = qs('cdResultIcon');
    el.resultTitle = qs('cdResultTitle');
    el.resultDesc = qs('cdResultDesc');
    el.nextCaseBtn = qs('cdNextCaseBtn');
  }

  function buildCaseOverlay() {
    el.caseList.innerHTML = '';
    CASES.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cd-case-btn';
      btn.textContent = '📁 ' + c.title;
      btn.addEventListener('click', function () { startCase(c); });
      el.caseList.appendChild(btn);
    });
  }

  function startCase(caseDef) {
    state.currentCase = caseDef;
    state.revealed = {};
    state.selectedCause = null;
    state.submitted = false;
    state.sessionStartedAtMs = Date.now();

    el.caseOverlay.hidden = true;
    el.resultOverlay.hidden = true;
    el.caseTitle.textContent = caseDef.title;
    el.intro.textContent = caseDef.intro;

    buildBoard();
    buildCauseGrid();
    updateRevealedCount();
    updateSubmitEnabled();
  }

  function buildBoard() {
    el.board.innerHTML = '';
    CATEGORIES.forEach(function (cat) {
      var clue = state.currentCase.clues[cat.id];
      var card = document.createElement('div');
      card.className = 'cd-clue-card';
      card.dataset.cat = cat.id;
      card.innerHTML =
        '<div class="cd-clue-head"><span class="cd-clue-icon">' + cat.icon + '</span>' + cat.label + '</div>' +
        '<div class="cd-clue-hint">Bấm để điều tra hướng này</div>';
      card.addEventListener('click', function () { revealClue(cat, clue, card); });
      el.board.appendChild(card);
    });
  }

  function revealClue(cat, clue, card) {
    if (state.revealed[cat.id]) return; // đã mở rồi, không tính thêm lượt
    state.revealed[cat.id] = true;
    card.classList.add('is-open');
    if (clue.key) card.classList.add('has-key');
    var body = document.createElement('div');
    body.className = 'cd-clue-body';
    body.textContent = clue.text;
    card.querySelector('.cd-clue-hint').remove();
    card.appendChild(body);
    if (clue.key) {
      var tag = document.createElement('div');
      tag.className = 'cd-clue-key-tag';
      tag.textContent = '🔑 Manh mối quan trọng';
      card.appendChild(tag);
    }
    updateRevealedCount();
  }

  function updateRevealedCount() {
    el.revealedCount.textContent = Object.keys(state.revealed).length;
  }

  function buildCauseGrid() {
    el.causeGrid.innerHTML = '';
    Object.keys(CAUSE_LABELS).forEach(function (causeId) {
      var info = CAUSE_LABELS[causeId];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cd-cause-btn';
      btn.dataset.cause = causeId;
      btn.innerHTML = '<img class="cd-cause-icon" src="' + info.img + '" alt=""><span>' + info.name + '</span>';
      btn.addEventListener('click', function () { selectCause(causeId, btn); });
      el.causeGrid.appendChild(btn);
    });
  }

  function selectCause(causeId, btnEl) {
    if (state.submitted) return;
    state.selectedCause = causeId;
    el.causeGrid.querySelectorAll('.cd-cause-btn').forEach(function (b) { b.classList.remove('is-selected'); });
    btnEl.classList.add('is-selected');
    updateSubmitEnabled();
  }

  function updateSubmitEnabled() {
    el.submitBtn.disabled = !state.selectedCause || state.submitted;
  }

  function submitConclusion() {
    if (!state.selectedCause || state.submitted) return;
    state.submitted = true;
    var isCorrect = state.selectedCause === state.currentCase.correctCause;
    var revealedCount = Object.keys(state.revealed).length;

    // Điểm: đúng = 60 nền + thưởng hiệu quả (điều tra càng ít hướng mà
    // vẫn đúng thì càng nhiều điểm, tối đa +40 khi chỉ mở đúng 2 hướng
    // — vừa đủ để thấy cả 2 manh mối chính của mọi tình huống trong bộ
    // CASES). Sai = 0 điểm bất kể điều tra bao nhiêu.
    var scorePct = 0;
    if (isCorrect) {
      var efficiencyBonus = Math.max(0, 40 - (revealedCount - 2) * 8);
      scorePct = Math.min(100, 60 + efficiencyBonus);
    }

    var weakness = (window.EduGameEngine && window.EduGameEngine.QuestionTopicMap)
      ? window.EduGameEngine.QuestionTopicMap.getWeaknessForEnemy(state.currentCase.correctCause)
      : null;
    var correctLabel = CAUSE_LABELS[state.currentCase.correctCause].name;

    el.resultIcon.textContent = isCorrect ? '🏆' : '❌';
    el.resultTitle.textContent = isCorrect ? 'Kết luận chính xác!' : 'Kết luận chưa đúng!';
    el.resultDesc.textContent =
      'Nguyên nhân thật sự: ' + correctLabel + '\n' +
      'Đã điều tra ' + revealedCount + '/6 hướng.\n' +
      (weakness ? ('💡 Cách phòng thủ: ' + weakness) : '') +
      (isCorrect ? ('\n\nĐiểm ván này: ' + scorePct) : '');
    el.resultOverlay.hidden = false;

    recordSessionIfPossible(isCorrect, scorePct);
  }

  /**
   * (Phase 3/4/6/7) Ghi 1 lượt chơi vào js/gamification.js §
   * recordGameSession — cùng pattern battle-quiz.js/pz-defense.js. Im
   * lặng bỏ qua nếu thiếu EduGamification hoặc chưa chọn học sinh nào.
   */
  function recordSessionIfPossible(isCorrect, scorePct) {
    try {
      if (typeof EduGamification === 'undefined' || !EduGamification.recordGameSession) return;
      var student = null;
      try { student = JSON.parse(localStorage.getItem('eduquiz_current_student') || 'null'); }
      catch (e) { student = null; }
      if (!student || !student.name || !student.class) return;

      EduGamification.recordGameSession('cyber-detective', {
        score: scorePct,
        scoreType: 'percent',
        accuracy: isCorrect ? 100 : 0,
        correctAnswers: isCorrect ? 1 : 0,
        wrongAnswers: isCorrect ? 0 : 1,
        topic: '7. An toàn và bảo mật',
        difficulty: null,
        durationSec: Math.max(0, Math.round((Date.now() - state.sessionStartedAtMs) / 1000)),
        studentName: student.name,
        studentClass: student.class,
        studentSchool: student.school || '',
      });
    } catch (e) { /* ghi XP là phụ — không được làm hỏng màn kết quả */ }
  }

  function init() {
    cacheEls();
    buildCaseOverlay();
    el.submitBtn.addEventListener('click', submitConclusion);
    el.restartBtn.addEventListener('click', function () {
      el.resultOverlay.hidden = true;
      el.caseOverlay.hidden = false;
    });
    el.nextCaseBtn.addEventListener('click', function () {
      el.resultOverlay.hidden = true;
      el.caseOverlay.hidden = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
