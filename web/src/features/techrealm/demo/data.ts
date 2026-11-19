/* DỮ LIỆU MẪU — chỉ để nghiệm thu giao diện. Không đọc/ghi mạng, không đọc localStorage của EduQuiz.
   Tên bài trong `src` là TÊN THẬT trong data/ic3/meta.json nên link "Luyện" mở đúng bài ở sảnh cũ.
   Khi tích hợp: thay từng export bằng service tương ứng (ARCHITECTURE.md §3), giữ nguyên kiểu dữ liệu. */
import type { AvatarId } from '../assets';
import type { ElementId, Rarity, RealmId } from '../model';

export interface LessonSrc { ct: string; cap: string; bai: string }

export const ME = {
  learnerId: 'L7KQ2M9XBTA',
  name: 'Thanh Phong',
  avatar: 'trang' as AvatarId,
  title: 'Người giữ khóa',
  sect: 'Phong Phú Tông',
  className: 'Lớp 5A2',
  tuVi: 1840, // tu vi LUYỆN TẬP (trên máy) — công huân, cảnh giới, linh căn, linh thạch: xem engineDemo.ts
  streak: 6,
};

export const QUESTS = [
  { id: 'q1', title: 'Ôn chủ đề An toàn và bảo mật', from: 'Cô Lan giao', due: '20/11', progress: 2, target: 3, reward: '+40 công huân' },
  { id: 'q2', title: 'Hoàn thành 3 bài trong ngày', from: 'Nhiệm vụ ngày', due: 'Hôm nay', progress: 1, target: 3, reward: '+30 tu vi' },
  { id: 'q3', title: 'Nộp áp phích "Mật khẩu mạnh"', from: 'Bách Công Phường', due: '25/11', progress: 0, target: 1, reward: '+120 công huân' },
];

export const RECENT_LESSONS: { title: string; course: string; score: number; when: string; src: LessonSrc }[] = [
  { title: '7. An toàn và bảo mật', course: 'Thông Huyền Quyết · Tầng 1', score: 85, when: 'Hôm qua', src: { ct: 'IC3', cap: 'LV1', bai: '7. An toàn và bảo mật' } },
  { title: '3. Quản lý thông tin', course: 'Thông Huyền Quyết · Tầng 1', score: 70, when: '2 ngày trước', src: { ct: 'IC3', cap: 'LV1', bai: '3. Quản lý thông tin' } },
  { title: 'Bài 3: Sử dụng các công thức', course: 'Số Toán Kinh', score: 60, when: '4 ngày trước', src: { ct: 'MOS', cap: 'Excel', bai: 'Bài 3: Sử dụng các công thức' } },
  { title: '1. Căn bản về công nghệ', course: 'Thông Huyền Quyết · Tầng 1', score: 95, when: 'Tuần trước', src: { ct: 'IC3', cap: 'LV1', bai: '1. Căn bản về công nghệ' } },
];

export const SUGGESTION = {
  title: '4. Sáng tạo nội dung',
  why: 'Linh căn Mộc đang yếu nhất (45). Làm bài này là nhanh nhất để chạm mốc "7 chủ đề từ 70%".',
  src: { ct: 'IC3', cap: 'LV1', bai: '4. Sáng tạo nội dung' } as LessonSrc,
};

export interface Notice { id: string; kind: 'quest' | 'review' | 'realm' | 'system'; title: string; body: string; when: string; read: boolean }
export const NOTICES: Notice[] = [
  { id: 'n1', kind: 'review', title: 'Sản phẩm đã được duyệt', body: 'Cô Lan duyệt "Thư mời hội chợ lớp" — +120 công huân.', when: '10 phút trước', read: false },
  { id: 'n2', kind: 'quest', title: 'Nhiệm vụ mới', body: 'Ôn chủ đề An toàn và bảo mật, hạn 20/11.', when: '2 giờ trước', read: false },
  { id: 'n3', kind: 'realm', title: 'Sắp mở Khảo hạch Kim Đan', body: 'Thầy cô sẽ mở phiên khảo hạch trong tiết Tin tuần sau.', when: 'Hôm qua', read: false },
  { id: 'n4', kind: 'system', title: 'Mùa sự kiện Linh vật 20/11', body: 'Hộp linh vật mùa 20/11 đã mở ở Đấu Trường.', when: '2 ngày trước', read: true },
];

export const NEW_ACHIEVEMENTS = [
  { id: 'a-hoa-1', name: 'Người giữ khóa', desc: 'Đạt 80% chủ đề An toàn và bảo mật', when: 'Hôm qua', tier: 'chinh-thuc' as const },
  { id: 'a-streak-5', name: 'Bền chí', desc: 'Tu luyện 5 ngày liên tiếp', when: '3 ngày trước', tier: 'luyen-tap' as const },
];

/* ── Tàng Kinh Các ── */
export interface Course {
  id: string; name: string; plain: string; group: 'IC3' | 'Spark' | 'MOS' | 'STEM';
  minRealm: RealmId; progress: number; lessons: { title: string; element?: ElementId; done: boolean; src?: LessonSrc }[]; soon?: boolean;
}
const ic3Topics = (cap: string, doneUntil: number) =>
  ['1. Căn bản về công nghệ', '2. Công dân số', '3. Quản lý thông tin', '4. Sáng tạo nội dung', '5. Giao tiếp', '6. Hợp tác, cộng tác', '7. An toàn và bảo mật'].map(
    (bai, i) => ({ title: bai, element: (['kim', 'tho', 'tho', 'moc', 'thuy', 'thuy', 'hoa'] as ElementId[])[i], done: i < doneUntil, src: { ct: 'IC3', cap, bai } }),
  );
const mos = (cap: string, titles: string[], doneUntil: number) => titles.map((bai, i) => ({ title: bai, done: i < doneUntil, src: { ct: 'MOS', cap, bai } }));

export const COURSES: Course[] = [
  { id: 'ic3-1', name: 'Thông Huyền Quyết · Tầng 1', plain: 'IC3 Cấp độ 1', group: 'IC3', minRealm: 1, progress: 71, lessons: ic3Topics('LV1', 5) },
  { id: 'ic3-2', name: 'Thông Huyền Quyết · Tầng 2', plain: 'IC3 Cấp độ 2', group: 'IC3', minRealm: 2, progress: 14, lessons: ic3Topics('LV2', 1) },
  { id: 'ic3-3', name: 'Thông Huyền Quyết · Tầng 3', plain: 'IC3 Cấp độ 3', group: 'IC3', minRealm: 4, progress: 0, lessons: ic3Topics('LV3', 0) },
  { id: 'spark-1', name: 'Tinh Hỏa Quyết · Tầng 1', plain: 'IC3 Spark Cấp 1', group: 'Spark', minRealm: 1, progress: 100, lessons: ic3Topics('LV1', 7).map((l) => ({ ...l, src: { ...l.src, ct: 'Spark' } })) },
  { id: 'mos-word', name: 'Văn Tự Kinh', plain: 'MOS Word', group: 'MOS', minRealm: 2, progress: 25, lessons: mos('Word', ['Bài 1: Làm việc với tài liệu', 'Bài 2: Thao tác với văn bản', 'Bài 3: Định dạng văn bản', 'Bài 4: Định dạng tài liệu để xuất bản'], 1) },
  { id: 'mos-excel', name: 'Số Toán Kinh', plain: 'MOS Excel', group: 'MOS', minRealm: 2, progress: 38, lessons: mos('Excel', ['Bài 1: Giới thiệu Microsoft Excel', 'Bài 2: Xây dựng dữ liệu trong ô', 'Bài 3: Sử dụng các công thức', 'Bài 4: Định dạng trang tính'], 3) },
  { id: 'mos-ppt', name: 'Ảnh Hiện Kinh', plain: 'MOS PowerPoint', group: 'MOS', minRealm: 3, progress: 0, lessons: mos('PowerPoint', ['Bài 1: Bắt đầu với PowerPoint', 'Bài 2: Làm việc với trang chiếu'], 0) },
  { id: 'stem-1', name: 'Vạn Vật Luận', plain: 'Khoa học & đời sống', group: 'STEM', minRealm: 1, progress: 0, lessons: [], soon: true },
];

/* ── Thế giới: 7 vùng = 7 chủ đề IC3. x/y theo % của world-map.svg (800×480). ── */
export const REGIONS: { id: number; name: string; plain: string; element: ElementId; x: number; y: number; mastery: number; minRealm: RealmId }[] = [
  { id: 1, name: 'Thiết Cốt Sơn', plain: 'Căn bản về công nghệ', element: 'kim', x: 18, y: 29, mastery: 88, minRealm: 1 },
  { id: 2, name: 'Vạn Dân Thành', plain: 'Công dân số', element: 'tho', x: 41, y: 23, mastery: 74, minRealm: 1 },
  { id: 3, name: 'Tàng Thư Cốc', plain: 'Quản lý thông tin', element: 'tho', x: 67, y: 27, mastery: 70, minRealm: 1 },
  { id: 4, name: 'Bách Hoa Nguyên', plain: 'Sáng tạo nội dung', element: 'moc', x: 82, y: 61, mastery: 45, minRealm: 1 },
  { id: 5, name: 'Truyền Âm Hải', plain: 'Giao tiếp', element: 'thuy', x: 58, y: 72, mastery: 61, minRealm: 2 },
  { id: 6, name: 'Đồng Tâm Đảo', plain: 'Hợp tác, cộng tác', element: 'thuy', x: 32, y: 71, mastery: 55, minRealm: 3 },
  { id: 7, name: 'Hộ Pháp Quan', plain: 'An toàn và bảo mật', element: 'hoa', x: 13, y: 73, mastery: 81, minRealm: 1 },
];

/* ── Bí Cảnh ── */
export type ChallengeKind = 'cau-do' | 'logic' | 'lap-trinh' | 'khoa-hoc' | 'tinh-huong' | 'boss';
export const CHALLENGE_KIND: Record<ChallengeKind, string> = {
  'cau-do': 'Câu đố', logic: 'Logic', 'lap-trinh': 'Lập trình', 'khoa-hoc': 'Khoa học', 'tinh-huong': 'Tình huống thực tế', boss: 'Boss',
};
export interface Challenge {
  id: string; name: string; plain: string; kind: ChallengeKind; level: 1 | 2 | 3; minRealm: RealmId;
  reward: string; state: 'open' | 'cleared' | 'locked' | 'soon'; page?: string; rules: string[];
}
export const CHALLENGES: Challenge[] = [
  { id: 'c1', name: 'Động Ký Ức', plain: 'Lật thẻ thiết bị, phần mềm', kind: 'cau-do', level: 1, minRealm: 1, reward: '+20 tu vi', state: 'cleared', page: 'memory-game.html', rules: ['Lật 2 thẻ để tìm cặp', 'Ít lượt lật hơn thì nhiều điểm hơn'] },
  { id: 'c2', name: 'Thạch Thất Tệp Tin', plain: 'Mô phỏng quản lý tệp', kind: 'tinh-huong', level: 1, minRealm: 1, reward: '+25 tu vi', state: 'open', page: 'computer-simulator.html', rules: ['Làm đúng nhiệm vụ trên cây thư mục', 'Sai thao tác không bị trừ điểm'] },
  { id: 'c3', name: 'Mê Cung Mật Mã', plain: 'Điều tra sự cố an toàn', kind: 'logic', level: 2, minRealm: 1, reward: '+40 tu vi', state: 'open', page: 'cyber-detective.html', rules: ['Thu thập manh mối từ 6 hướng', 'Kết luận đúng thủ phạm để qua ải'] },
  { id: 'c4', name: 'Thành Trì Dữ Liệu', plain: 'Phòng thủ trước mã độc', kind: 'cau-do', level: 2, minRealm: 2, reward: '+40 tu vi', state: 'open', page: 'pz-defense.html', rules: ['Đặt lá chắn đúng loại tấn công', 'Giữ thành qua 5 đợt'] },
  { id: 'c5', name: 'Hắc Long Mã Độc', plain: 'Đấu Boss cuối hành trình', kind: 'boss', level: 3, minRealm: 2, reward: '+80 công huân (lần đầu)', state: 'open', page: 'arena.html?vai=minigame', rules: ['Mỗi câu đúng là một đòn đánh', 'Thua thì luyện thêm rồi thử lại, không mất gì'] },
  { id: 'c6', name: 'Lò Luyện Mã', plain: 'Lập trình từng bước', kind: 'lap-trinh', level: 2, minRealm: 3, reward: '+60 tu vi', state: 'soon', rules: ['Ghép khối lệnh cho robot đi đúng đường'] },
  { id: 'c7', name: 'Phong Ấn Thập Tự', plain: 'Câu đố logic lưới', kind: 'logic', level: 3, minRealm: 3, reward: '+60 tu vi', state: 'locked', rules: ['Điền lưới theo gợi ý hàng và cột'] },
  { id: 'c8', name: 'Thủy Nguyên Động', plain: 'Thí nghiệm vòng tuần hoàn nước', kind: 'khoa-hoc', level: 1, minRealm: 1, reward: '+30 tu vi', state: 'soon', rules: ['Điều chỉnh nhiệt độ, quan sát bay hơi và ngưng tụ'] },
];

/* ── Bách Công Phường ── */
export interface Project { id: string; name: string; plain: string; skills: string[]; format: string; minRealm: RealmId; reward: number; due?: string }
export const PROJECTS: Project[] = [
  { id: 'p1', name: 'Áp phích "Mật khẩu mạnh"', plain: 'Thiết kế áp phích', skills: ['An toàn số', 'Trình bày'], format: 'PNG, PDF, PPTX', minRealm: 1, reward: 120, due: '25/11' },
  { id: 'p2', name: 'Bảng chi tiêu tuần của em', plain: 'Bảng tính có công thức', skills: ['Excel', 'Tài chính cá nhân'], format: 'XLSX', minRealm: 2, reward: 150 },
  { id: 'p3', name: 'Thư mời hội chợ lớp', plain: 'Văn bản định dạng chuẩn', skills: ['Word', 'Giao tiếp'], format: 'DOCX, PDF', minRealm: 1, reward: 120 },
  { id: 'p4', name: 'Sơ đồ quy trình buổi sáng', plain: 'Lưu đồ (flowchart)', skills: ['Tư duy thuật toán'], format: 'PNG, PDF', minRealm: 3, reward: 180 },
];
export type SubmissionStatus = 'submitted' | 'reviewing' | 'approved' | 'needs-work';
export const SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; tone: 'blue' | 'orange' | 'green' | 'red' }> = {
  submitted: { label: 'Đã nộp', tone: 'blue' },
  reviewing: { label: 'Đang chấm', tone: 'orange' },
  approved: { label: 'Đã duyệt', tone: 'green' },
  'needs-work': { label: 'Cần sửa', tone: 'red' },
};
export const SUBMISSIONS: { id: string; projectId: string; file: string; when: string; status: SubmissionStatus; score?: string; feedback?: string; portfolio: boolean }[] = [
  { id: 's1', projectId: 'p3', file: 'thu-moi-hoi-cho.pdf', when: '12/11', status: 'approved', score: '9/10', feedback: 'Bố cục rõ, nhớ căn lề đều hai bên.', portfolio: true },
  { id: 's2', projectId: 'p1', file: 'ap-phich-mat-khau.png', when: '15/11', status: 'reviewing', portfolio: false },
  { id: 's3', projectId: 'p2', file: 'chi-tieu-tuan.xlsx', when: '08/11', status: 'needs-work', feedback: 'Cột Tổng chưa dùng hàm SUM — sửa rồi nộp lại.', portfolio: false },
];

/* ── Đấu Trường (trang cũ, đã chạy) ── */
export const ARENA_MODES = [
  { id: 'journey', name: 'Hành trình 7 vùng', plain: 'Một mình — trận quiz và mini-game theo chủ đề', page: 'arena.html?vai=minigame' },
  { id: 'solo', name: 'Luận võ tự do', plain: 'Một mình — chọn bộ câu, đấu với đối thủ máy', page: 'arena.html?vai=solo' },
  { id: 'room', name: 'Đại hội tông môn', plain: 'Cả lớp — nhập mã phòng thầy cô đưa', page: 'arena.html?vai=student' },
];

/* ── Túi Càn Khôn ── */
export type ItemKind = 'phap-bao' | 'linh-vat' | 'danh-hieu' | 'khung';
export const ITEM_KIND: Record<ItemKind, string> = { 'phap-bao': 'Pháp bảo', 'linh-vat': 'Linh vật', 'danh-hieu': 'Danh hiệu', khung: 'Khung chân dung' };
export interface Item { id: string; name: string; kind: ItemKind; rarity: Rarity; desc: string; owned: number; price?: number; source: string }
export const ITEMS: Item[] = [
  { id: 'i1', name: 'Thanh Phong Kiếm', kind: 'phap-bao', rarity: 3, desc: 'Trang trí hồ sơ. Không đổi điểm số.', owned: 1, source: 'Qua Bí cảnh Mê Cung Mật Mã' },
  { id: 'i2', name: 'Kính Soi Lỗi', kind: 'phap-bao', rarity: 2, desc: 'Biểu tượng của người hay xem lại câu sai.', owned: 1, source: 'Ôn 50 câu trong Sổ tay câu sai' },
  { id: 'i3', name: 'Ấn Hộ Pháp', kind: 'phap-bao', rarity: 4, desc: 'Dành cho người vững chủ đề An toàn và bảo mật.', owned: 0, price: 400, source: 'Cửa hàng' },
  { id: 'i4', name: 'Quạt Truyền Âm', kind: 'phap-bao', rarity: 2, desc: 'Biểu tượng giao tiếp lịch sự trên mạng.', owned: 0, price: 120, source: 'Cửa hàng' },
  { id: 'i5', name: 'Hồ Ly Lam', kind: 'linh-vat', rarity: 3, desc: 'Linh vật từ hộp mùa 20/11.', owned: 1, source: 'Đấu Trường' },
  { id: 'i6', name: 'Rùa Thạch Bàn', kind: 'linh-vat', rarity: 1, desc: 'Chậm mà chắc.', owned: 2, source: 'Đấu Trường' },
  { id: 'i7', name: 'Hạc Giấy', kind: 'linh-vat', rarity: 2, desc: 'Linh vật đầu tiên của mọi tu sĩ.', owned: 1, source: 'Đấu Trường' },
  { id: 'i8', name: 'Người giữ khóa', kind: 'danh-hieu', rarity: 3, desc: 'Đạt 80% chủ đề An toàn và bảo mật.', owned: 1, source: 'Thành tựu' },
  { id: 'i9', name: 'Bền chí', kind: 'danh-hieu', rarity: 1, desc: 'Tu luyện 5 ngày liên tiếp.', owned: 1, source: 'Thành tựu' },
  { id: 'i10', name: 'Khung Vân Mây', kind: 'khung', rarity: 2, desc: 'Viền chân dung hoạ tiết mây.', owned: 1, source: 'Lên Trúc Cơ' },
  { id: 'i11', name: 'Khung Kim Ấn', kind: 'khung', rarity: 5, desc: 'Viền vàng kim của bậc Kim Đan.', owned: 0, source: 'Lên Kim Đan' },
  { id: 'i12', name: 'Khung Linh Mạch', kind: 'khung', rarity: 3, desc: 'Viền đường mạch công nghệ.', owned: 0, price: 300, source: 'Cửa hàng' },
];

/* ── Thành tựu ── */
export interface Achievement { id: string; name: string; desc: string; tier: 'chinh-thuc' | 'luyen-tap'; earned?: string; progress?: [number, number]; hidden?: boolean }
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'a1', name: 'Nhập môn', desc: 'Hoàn thành bài đầu tiên', tier: 'luyen-tap', earned: '02/10' },
  { id: 'a2', name: 'Bền chí', desc: 'Tu luyện 5 ngày liên tiếp', tier: 'luyen-tap', earned: '13/11' },
  { id: 'a3', name: 'Trăm câu', desc: 'Trả lời đúng 100 câu', tier: 'luyen-tap', earned: '20/10' },
  { id: 'a4', name: 'Ngàn câu', desc: 'Trả lời đúng 1.000 câu', tier: 'luyen-tap', progress: [412, 1000] },
  { id: 'a5', name: 'Phá cảnh Trúc Cơ', desc: 'Đạt cảnh giới Trúc Cơ qua khảo hạch', tier: 'chinh-thuc', earned: '01/11' },
  { id: 'a6', name: 'Người giữ khóa', desc: 'Đạt 80% chủ đề An toàn và bảo mật trong bài kiểm tra có xác thực', tier: 'chinh-thuc', earned: '15/11' },
  { id: 'a7', name: 'Thợ cả', desc: 'Có 3 sản phẩm được duyệt', tier: 'chinh-thuc', progress: [1, 3] },
  { id: 'a8', name: 'Ngũ hành cân bằng', desc: 'Cả 5 linh căn từ 60 trở lên', tier: 'chinh-thuc', progress: [3, 5] },
  { id: 'a9', name: 'Diệt rồng', desc: 'Thắng Boss Hắc Long Mã Độc', tier: 'luyen-tap', progress: [0, 1] },
  { id: 'a10', name: '???', desc: 'Thành tựu ẩn — tự khám phá', tier: 'luyen-tap', hidden: true },
];

/* ── Bộ kỹ năng (cây kỹ năng rút gọn theo linh căn) ── */
export const SKILLS: { element: ElementId; nodes: { name: string; state: 'learned' | 'available' | 'locked' }[] }[] = [
  { element: 'kim', nodes: [{ name: 'Phần cứng cơ bản', state: 'learned' }, { name: 'Hệ điều hành', state: 'learned' }, { name: 'Mạng & kết nối', state: 'available' }, { name: 'Khắc phục sự cố', state: 'locked' }] },
  { element: 'moc', nodes: [{ name: 'Soạn văn bản', state: 'learned' }, { name: 'Trình chiếu', state: 'available' }, { name: 'Bản quyền & CC', state: 'locked' }] },
  { element: 'thuy', nodes: [{ name: 'Thư điện tử', state: 'learned' }, { name: 'Ứng xử trên mạng', state: 'learned' }, { name: 'Làm việc nhóm số', state: 'available' }] },
  { element: 'hoa', nodes: [{ name: 'Mật khẩu mạnh', state: 'learned' }, { name: 'Nhận diện lừa đảo', state: 'learned' }, { name: 'Phòng chống mã độc', state: 'learned' }, { name: 'Sao lưu dữ liệu', state: 'available' }] },
  { element: 'tho', nodes: [{ name: 'Danh tính số', state: 'learned' }, { name: 'Tìm kiếm thông tin', state: 'learned' }, { name: 'Đánh giá nguồn tin', state: 'available' }, { name: 'Quản lý tệp nâng cao', state: 'locked' }] },
];
