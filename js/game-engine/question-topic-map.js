/* ============================================================
   js/game-engine/question-topic-map.js
   Bảng ánh xạ: tác nhân/lá chắn trong Cyber Defense → chủ đề IC3
   thật (yêu cầu gốc mục 8: "question → topic → enemy → defender →
   game"). Hạ tầng cho Battle Quiz / Cyber Detective (Phase 6-7) —
   CHƯA có game nào gọi module này.

   QUAN TRỌNG — không phát minh taxonomy mới: 7 CANONICAL_TOPICS bên
   dưới lấy ĐÚNG NGUYÊN VĂN tên minitest đã có sẵn trong
   quiz_data.json (giống hệt ở cả 2 category Spark/IC3, cả 3 level).
   Khi câu hỏi được nhập vào Firestore collection "questions" (xem
   js/image-manager.js § migrate), mỗi document có sẵn field phẳng
   `minitestName` đúng 1 trong 7 chuỗi này — nên filterQuestionsByTopic()
   bên dưới chỉ cần so khớp field đó, KHÔNG cần sửa quiz-engine.js hay
   tạo Question Engine thứ hai.

   Nạp file này ĐỘC LẬP — không phụ thuộc pz-defense.js hay
   quiz-engine.js (chỉ đọc dữ liệu do 2 file đó định nghĩa khi được
   truyền vào tham số).
   ============================================================ */
(function (global) {
  'use strict';

  // 7 chủ đề IC3 GS6 — nguyên văn minitestName trong quiz_data.json.
  var CANONICAL_TOPICS = Object.freeze([
    '1. Căn bản về công nghệ',
    '2. Công dân số',
    '3. Quản lý thông tin',
    '4. Sáng tạo nội dung',
    '5. Giao tiếp',
    '6. Hợp tác, cộng tác',
    '7. An toàn và bảo mật',
  ]);

  var TOPIC_SECURITY   = '7. An toàn và bảo mật';
  var TOPIC_FUNDAMENTALS = '1. Căn bản về công nghệ';
  var TOPIC_INFO       = '3. Quản lý thông tin';
  var TOPIC_CONTENT    = '4. Sáng tạo nội dung';
  var TOPIC_COMM       = '5. Giao tiếp';
  var TOPIC_COLLAB     = '6. Hợp tác, cộng tác';

  // ── 12 tác nhân mã độc (ZOMBIE_TYPES trong js/pz-defense.js) —
  //    tất cả đều thuộc chủ đề "An toàn và bảo mật" (đúng bản chất
  //    nội dung); `weakness` là 1 câu gợi ý phòng thủ thực tế, ngắn
  //    gọn hơn `tip` đã có sẵn trong pz-defense.js (dùng cho UI khác,
  //    vd. Cyber Detective sau này cần câu ngắn để làm "manh mối"). ──
  var ENEMY_TOPIC_MAP = {
    worm:         { relatedTopic: TOPIC_SECURITY, weakness: 'Cập nhật phần mềm & vá lỗ hổng thường xuyên để chặn đường tự lây lan.' },
    virus:        { relatedTopic: TOPIC_SECURITY, weakness: 'Không mở file/vật chủ lạ; quét virus trước khi mở tệp đính kèm.' },
    trojan:       { relatedTopic: TOPIC_SECURITY, weakness: 'Chỉ cài phần mềm từ nguồn chính thức, kiểm tra kỹ trước khi cài.' },
    adware:       { relatedTopic: TOPIC_SECURITY, weakness: 'Chặn quảng cáo/pop-up, không bấm vào quảng cáo đáng ngờ.' },
    spyware:      { relatedTopic: TOPIC_SECURITY, weakness: 'Dùng antivirus + tường lửa để phát hiện hoạt động theo dõi ngầm.' },
    ransom:       { relatedTopic: TOPIC_SECURITY, weakness: 'Sao lưu dữ liệu định kỳ — cách phòng thủ hiệu quả nhất trước ransomware.' },
    phishing:     { relatedTopic: TOPIC_SECURITY, weakness: 'Kiểm tra kỹ người gửi/đường link trước khi bấm — không vội tin.' },
    rootkit:      { relatedTopic: TOPIC_SECURITY, weakness: 'Quét sâu hệ thống định kỳ; trường hợp nặng có thể cần cài lại hệ điều hành.' },
    logicbomb:    { relatedTopic: TOPIC_SECURITY, weakness: 'Kiểm soát quyền truy cập & giám sát hành vi bất thường trong hệ thống.' },
    sqlinjection: { relatedTopic: TOPIC_SECURITY, weakness: 'Kiểm tra kỹ dữ liệu nhập vào (input validation) ở các form/ô nhập liệu.' },
    boss:         { relatedTopic: TOPIC_SECURITY, weakness: 'Cách ly máy nghi nhiễm khỏi mạng để chặn bị điều khiển từ xa.' },
    ddos:         { relatedTopic: TOPIC_SECURITY, weakness: 'Dùng dịch vụ lọc lưu lượng/giới hạn tốc độ truy cập để chống ngập lụt.' },
  };

  // ── 19 lá chắn (DEF_TYPES trong js/pz-defense.js) — gắn theo ĐÚNG
  //    vai trò thật của từng app/thiết bị ngoài đời (không phải theo
  //    "phe phòng thủ" trong game), để 1 lá chắn có thể trỏ sang đúng
  //    chủ đề IC3 nó đại diện — vd. Word/Excel/PowerPoint thuộc "Sáng
  //    tạo nội dung", không phải "An toàn và bảo mật". ──
  var DEFENDER_TOPIC_MAP = {
    word:       { relatedTopic: TOPIC_CONTENT },
    excel:      { relatedTopic: TOPIC_CONTENT },
    powerpoint: { relatedTopic: TOPIC_CONTENT },
    copilot:    { relatedTopic: TOPIC_CONTENT },
    chrome:     { relatedTopic: TOPIC_INFO },
    extdrive:   { relatedTopic: TOPIC_INFO },
    outlook:    { relatedTopic: TOPIC_COMM },
    gmail:      { relatedTopic: TOPIC_COMM },
    zoom:       { relatedTopic: TOPIC_COMM },
    teams:      { relatedTopic: TOPIC_COLLAB },
    windows:    { relatedTopic: TOPIC_FUNDAMENTALS },
    keyboard:   { relatedTopic: TOPIC_FUNDAMENTALS },
    mouse:      { relatedTopic: TOPIC_FUNDAMENTALS },
    printer:    { relatedTopic: TOPIC_FUNDAMENTALS },
    monitor:    { relatedTopic: TOPIC_FUNDAMENTALS },
    cpu:        { relatedTopic: TOPIC_FUNDAMENTALS },
    tower:      { relatedTopic: TOPIC_FUNDAMENTALS },
    scanner:    { relatedTopic: TOPIC_SECURITY },
    killswitch: { relatedTopic: TOPIC_SECURITY },
  };

  function getTopicForEnemy(enemyId) {
    return (ENEMY_TOPIC_MAP[enemyId] && ENEMY_TOPIC_MAP[enemyId].relatedTopic) || null;
  }
  function getWeaknessForEnemy(enemyId) {
    return (ENEMY_TOPIC_MAP[enemyId] && ENEMY_TOPIC_MAP[enemyId].weakness) || null;
  }
  function getTopicForDefender(defenderId) {
    return (DEFENDER_TOPIC_MAP[defenderId] && DEFENDER_TOPIC_MAP[defenderId].relatedTopic) || null;
  }

  /**
   * Lọc 1 danh sách câu hỏi đã tải sẵn (từ Firestore "questions", vd.
   * dạng `snap.docs.map(d => d.data())`, hoặc mảng câu hỏi đọc từ
   * quiz_data.json có gắn `minitestName`) theo đúng 1 trong 7
   * CANONICAL_TOPICS. Hàm THUẦN (không tự fetch Firestore) — nơi gọi
   * (game tương lai) tự quyết định lấy `questions` từ đâu, đúng
   * nguyên tắc "không tạo Question Engine thứ hai".
   * @param {Array<Object>} questions
   * @param {string} topic — 1 giá trị trong CANONICAL_TOPICS
   * @returns {Array<Object>}
   */
  function filterQuestionsByTopic(questions, topic) {
    if (!Array.isArray(questions) || !topic) return [];
    return questions.filter(function (q) { return q && q.minitestName === topic; });
  }

  /** Tiện ích: lấy thẳng câu hỏi liên quan tới 1 tác nhân cụ thể. */
  function filterQuestionsForEnemy(questions, enemyId) {
    return filterQuestionsByTopic(questions, getTopicForEnemy(enemyId));
  }

  global.EduGameEngine = global.EduGameEngine || {};
  global.EduGameEngine.QuestionTopicMap = {
    CANONICAL_TOPICS: CANONICAL_TOPICS,
    ENEMY_TOPIC_MAP: ENEMY_TOPIC_MAP,
    DEFENDER_TOPIC_MAP: DEFENDER_TOPIC_MAP,
    getTopicForEnemy: getTopicForEnemy,
    getWeaknessForEnemy: getWeaknessForEnemy,
    getTopicForDefender: getTopicForDefender,
    filterQuestionsByTopic: filterQuestionsByTopic,
    filterQuestionsForEnemy: filterQuestionsForEnemy,
  };
})(window);
