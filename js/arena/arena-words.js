/* ============================================================
   js/arena/arena-words.js — kho từ cho 2 trò chơi chữ ở sảnh chờ Phòng cả lớp (js/arena/arena-lobby-fun.js).
   CỐ Ý tách khỏi ngân hàng câu hỏi (data/ic3): sảnh chờ không được cho học sinh xem trước câu sắp thi.

     CHAIN      từ 2 tiếng (tin học + đời sống học đường) cho trò 🔗 Nối từ
     TRAPS      từ chỉ làm bẫy (cùng chữ, khác dấu: chiếu / chiều, tự / từ / tư...)
     TERMS      [thuật ngữ tiếng Anh, nghĩa tiếng Việt] cho trò 🔤 Ghép chữ
     chainStart(rng)                từ mở đầu (luôn nối tiếp được)
     chainTurn(word, used, rng, n)  { next: từ đúng | null (hết đường), options: n lựa chọn đã trộn }
                                    bẫy: lựa chọn sai ưu tiên từ có tiếng đầu GIỐNG chữ nhưng KHÁC dấu (tính / tình / tin)
     scramble(term, rng)            chữ cái đã xáo (không trùng thứ tự gốc)
   Không mạng, không lưu gì.
   ============================================================ */
(function (global) {
  'use strict';

  const CHAIN = [
    'máy tính', 'máy in', 'máy chiếu', 'máy ảnh', 'máy chủ',
    'tính toán', 'tính năng', 'tính cách', 'toán học',
    'học sinh', 'học tập', 'học bài', 'học hỏi', 'học kỳ',
    'sinh viên', 'sinh nhật', 'sinh học', 'sinh hoạt',
    'nhật ký', 'ký tự', 'ký hiệu', 'ký tên',
    'tự học', 'tự tin', 'tự động', 'tự do',
    'tin học', 'tin nhắn', 'tin tức', 'tin cậy', 'nhắn tin', 'tức thì',
    'động vật', 'động lực', 'động não',
    'vật lý', 'vật liệu', 'vật dụng', 'lý do', 'lý thuyết', 'thuyết trình',
    'trình duyệt', 'trình bày', 'trình chiếu', 'trình độ',
    'chiếu sáng', 'chiếu phim', 'sáng tạo', 'sáng kiến', 'tạo hình',
    'hình ảnh', 'hình nền', 'hình vẽ', 'hình dạng', 'ảnh hưởng', 'hưởng ứng',
    'ứng dụng', 'dụng cụ', 'cụ thể',
    'thể thao', 'thể hiện', 'thể loại', 'hiện đại', 'hiện tại',
    'đại học', 'đại diện', 'diện tích', 'tích cực', 'tích hợp',
    'hợp tác', 'hợp lệ', 'tác giả', 'tác phẩm', 'tác động',
    'giả lập', 'lập trình', 'lập luận', 'luận văn',
    'văn bản', 'văn học', 'văn hoá', 'bản đồ', 'bản sao', 'bản tin', 'bản quyền',
    'đồ hoạ', 'đồ dùng', 'đồ chơi', 'hoạ sĩ',
    'sao lưu', 'sao chép', 'lưu trữ', 'lưu ý', 'quyền lợi', 'lợi ích',
    'ý tưởng', 'ý kiến', 'tưởng tượng', 'kiến thức', 'kiến trúc',
    'bàn phím', 'bàn luận', 'phím tắt', 'tắt máy',
    'mật khẩu', 'mật mã', 'khẩu hiệu', 'hiệu quả', 'hiệu ứng',
    'quả bóng', 'bóng đá', 'đá cầu', 'cầu thủ', 'cầu nối', 'nối mạng', 'nối tiếp', 'mạng lưới', 'lưới điện',
    'điện thoại', 'điện tử', 'điện năng', 'năng lượng', 'năng lực',
    'an toàn', 'an ninh', 'toàn cầu', 'toàn diện',
    'bảo mật', 'bảo vệ', 'bảo hiểm', 'mã hoá', 'mã số', 'hoá học', 'hoá đơn',
    'số học', 'số liệu', 'số hoá', 'đơn vị', 'đơn giản', 'vị trí', 'trí tuệ', 'trí nhớ', 'giản dị',
    'thư mục', 'thư viện', 'mục tiêu', 'mục lục', 'tiêu đề', 'tiêu chí',
    'đề bài', 'đề tài', 'tài liệu', 'tài khoản', 'tài năng', 'dữ liệu',
    'phần mềm', 'phần cứng', 'phần trăm', 'màn hình',
    'trang chủ', 'chủ đề', 'chủ động', 'truy cập', 'cập nhật',
    'kết nối', 'kết quả', 'trực tuyến', 'trực tiếp', 'tiếp tục', 'tiếp theo', 'tục ngữ',
    'ngữ pháp', 'ngữ văn', 'pháp luật', 'luật lệ', 'theo dõi',
    'giao tiếp', 'giao diện', 'giao thông', 'thông tin', 'thông minh', 'thông báo', 'minh hoạ', 'báo cáo', 'báo chí',
    'tình bạn', 'tình cảm', 'tinh thần', 'tính từ', 'tỉnh táo', 'tin tưởng', 'tịnh tiến',
    'học phí', 'hóc búa', 'sinh động', 'sình lầy', 'sính lễ',
    // nối tiếp các ngõ cụt hay gặp (bài, tập, kỳ, tên, thủ, bộ, cảm...)
    'in ấn', 'ấn tượng', 'tượng đài', 'tập tin', 'tập thể', 'bài tập', 'bài học', 'bài hát', 'hỏi đáp', 'kỳ thi', 'kỳ diệu',
    'hoạt động', 'tên miền', 'miền núi', 'lực lượng', 'độ sáng', 'vẽ tranh', 'thao tác', 'loại bỏ', 'phẩm chất', 'chất lượng',
    'chơi cờ', 'thủ đô', 'thủ thuật', 'thuật toán', 'vệ sinh', 'nhớ lại', 'bạn bè', 'cảm biến', 'cảm ơn', 'biến đổi', 'đổi mới',
    'thần tốc', 'tốc độ', 'từ khoá', 'khoá học', 'tiến bộ', 'bộ nhớ', 'bộ phận', 'lễ hội', 'hội thảo',
  ].map((w) => w.normalize('NFC'));

  // Chỉ làm BẪY (không làm từ mở đầu/đáp án): tiếng đầu cùng chữ, khác dấu với tiếng hay gặp ở cuối từ.
  const TRAPS = [
    'chiều cao', 'chiêu sinh', 'anh hùng', 'ánh sáng', 'chú ý', 'chữ số', 'nắng mưa', 'nhất định', 'kỹ năng', 'kỷ niệm',
    'từ điển', 'tư duy', 'hiểu biết', 'tín hiệu', 'đồng hồ', 'đông đúc', 'nhẫn nại', 'vất vả', 'dũng cảm', 'trinh thám',
    'sang trọng', 'táo bạo', 'kiên trì', 'ưng ý', 'thế giới', 'thế hệ', 'hiền lành', 'tịch thu', 'tạc tượng', 'giải thưởng',
    'giá trị', 'lấp lánh', 'vận động', 'độ dài', 'sáo trúc', 'quyển sách', 'y tế', 'lời nói', 'tường rào', 'phim ảnh',
    'tất cả', 'mây trắng', 'quá trình', 'bông hoa', 'đa dạng', 'câu hỏi', 'câu chuyện', 'nội dung', 'mang theo', 'mặt trời',
    'sổ tay', 'ví dụ', 'giãn cách', 'tri thức', 'mực in', 'tiểu học', 'để ý', 'tại sao', 'cấp độ', 'ngũ cốc',
    'thống kê', 'thống nhất', 'mịn màng', 'tỉnh thành', 'mã vạch', 'lịch sử', 'tiếng nói', 'tranh vẽ',
  ].map((w) => w.normalize('NFC'));

  const TERMS = [
    ['MOUSE', 'Chuột máy tính'], ['KEYBOARD', 'Bàn phím'], ['PRINTER', 'Máy in'], ['MONITOR', 'Màn hình'],
    ['FILE', 'Tệp tin'], ['FOLDER', 'Thư mục'], ['EMAIL', 'Thư điện tử'], ['PASSWORD', 'Mật khẩu'],
    ['CLOUD', 'Đám mây (lưu trữ trực tuyến)'], ['BROWSER', 'Trình duyệt web'], ['DOWNLOAD', 'Tải xuống'], ['UPLOAD', 'Tải lên'],
    ['SAVE', 'Lưu'], ['COPY', 'Sao chép'], ['PASTE', 'Dán'], ['DELETE', 'Xoá'],
    ['ROUTER', 'Bộ định tuyến mạng'], ['SPEAKER', 'Loa'], ['CAMERA', 'Máy quay'], ['LAPTOP', 'Máy tính xách tay'],
    ['TABLET', 'Máy tính bảng'], ['ICON', 'Biểu tượng'], ['CURSOR', 'Con trỏ'], ['SCREEN', 'Màn hình hiển thị'],
    ['BACKUP', 'Sao lưu'], ['UPDATE', 'Cập nhật'], ['LOGIN', 'Đăng nhập'], ['ONLINE', 'Trực tuyến'],
    ['SEARCH', 'Tìm kiếm'], ['DATA', 'Dữ liệu'], ['CHART', 'Biểu đồ'], ['TABLE', 'Bảng'],
    ['SLIDE', 'Trang chiếu'], ['FONT', 'Phông chữ'], ['PIXEL', 'Điểm ảnh'], ['MEMORY', 'Bộ nhớ'],
    ['STORAGE', 'Lưu trữ'], ['NETWORK', 'Mạng'], ['WEBSITE', 'Trang web'], ['VIRUS', 'Phần mềm độc hại lây lan'],
    ['PRIVACY', 'Quyền riêng tư'], ['SHARE', 'Chia sẻ'], ['PROFILE', 'Hồ sơ cá nhân'], ['SETTINGS', 'Cài đặt'],
  ];

  const first = (w) => w.split(' ')[0];
  const last = (w) => w.split(' ').slice(-1)[0];
  // Bỏ dấu để tìm "bẫy" giống chữ khác dấu (tính / tình / tinh)
  const bare = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
  const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const nextOf = (word, used) => CHAIN.filter((w) => first(w) === last(word) && w !== word && !(used && used.has(w)));

  function chainStart(rng) {
    const ok = CHAIN.filter((w) => nextOf(w).length >= 2);
    return ok[Math.floor(rng() * ok.length)];
  }
  function chainTurn(word, used, rng, n) {
    const want = n || 4;
    const cands = nextOf(word, used);
    if (!cands.length) return { next: null, options: [] };
    // Ưu tiên từ còn nối tiếp được → chuỗi dài, ít "hết đường"
    const live = cands.filter((c) => nextOf(c, new Set([...(used || []), c])).length);
    const pool = live.length ? live : cands;
    const next = pool[Math.floor(rng() * pool.length)];
    const s = last(word);
    const wrong = CHAIN.concat(TRAPS).filter((w) => first(w) !== s && w !== word);
    const traps = shuffle(wrong.filter((w) => bare(first(w)) === bare(s) || bare(first(w)).slice(0, 2) === bare(s).slice(0, 2)), rng);
    const rest = shuffle(wrong.filter((w) => !traps.includes(w)), rng);
    const options = [next].concat(traps.slice(0, 2), rest).slice(0, want);
    return { next, options: shuffle(options, rng) };
  }
  function scramble(term, rng) {
    const a = term.split('');
    if (new Set(a).size < 2) return a;
    let out = a.slice();
    for (let k = 0; k < 10 && out.join('') === term; k++) out = shuffle(a.slice(), rng);
    return out;
  }

  global.EduArenaWords = { CHAIN, TRAPS, TERMS, chainStart, chainTurn, scramble, first, last };
})(typeof window !== 'undefined' ? window : globalThis);
