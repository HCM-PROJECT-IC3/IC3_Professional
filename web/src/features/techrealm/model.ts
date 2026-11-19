/* Hằng số giao diện của TechRealm (tên, màu, ngưỡng). Đây là bản XEM THỬ: ở giai đoạn tích hợp, cảnh giới và
   điều kiện sẽ đến từ data/techrealm/realms.json + js/techrealm/realm-core.js (docs/techrealm/ARCHITECTURE.md §3). */

export type RealmId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const REALMS: { id: RealmId; name: string; plain: string; congHuan: number }[] = [
  { id: 1, name: 'Luyện Khí', plain: 'Làm quen', congHuan: 0 },
  { id: 2, name: 'Trúc Cơ', plain: 'Nền tảng', congHuan: 300 },
  { id: 3, name: 'Kim Đan', plain: 'Vững vàng', congHuan: 900 },
  { id: 4, name: 'Nguyên Anh', plain: 'Thành thạo', congHuan: 2000 },
  { id: 5, name: 'Hóa Thần', plain: 'Vận dụng', congHuan: 4000 },
  { id: 6, name: 'Độ Kiếp', plain: 'Vượt thử thách', congHuan: 7000 },
  { id: 7, name: 'Chân Tiên', plain: 'Chứng chỉ thật', congHuan: 11000 },
];
export const realmOf = (id: RealmId) => REALMS[id - 1];

/* Năm linh căn = 5 nhóm năng lực, gộp từ 7 chủ đề IC3 (dữ liệu lưu theo 7 chủ đề — DATABASE_SCHEMA §3.9). */
export type ElementId = 'kim' | 'moc' | 'thuy' | 'hoa' | 'tho';
export const ELEMENTS: { id: ElementId; name: string; plain: string; topics: number[]; bar: string; text: string }[] = [
  { id: 'kim', name: 'Kim', plain: 'Công nghệ, phần cứng', topics: [1], bar: 'bg-el-kim', text: 'text-el-kim' },
  { id: 'moc', name: 'Mộc', plain: 'Sáng tạo nội dung', topics: [4], bar: 'bg-el-moc', text: 'text-el-moc' },
  { id: 'thuy', name: 'Thủy', plain: 'Giao tiếp, cộng tác', topics: [5, 6], bar: 'bg-el-thuy', text: 'text-el-thuy' },
  { id: 'hoa', name: 'Hỏa', plain: 'An toàn, bảo mật', topics: [7], bar: 'bg-el-hoa', text: 'text-el-hoa' },
  { id: 'tho', name: 'Thổ', plain: 'Công dân số, quản lý thông tin', topics: [2, 3], bar: 'bg-el-tho', text: 'text-el-tho' },
];

/* Phẩm cấp vật phẩm: Phàm < Linh < Huyền < Địa < Thiên. */
export type Rarity = 1 | 2 | 3 | 4 | 5;
export const RARITY: Record<Rarity, { name: string; cls: string }> = {
  1: { name: 'Phàm', cls: 'text-rar-1 border-rar-1/40' },
  2: { name: 'Linh', cls: 'text-rar-2 border-rar-2/40' },
  3: { name: 'Huyền', cls: 'text-rar-3 border-rar-3/40' },
  4: { name: 'Địa', cls: 'text-rar-4 border-rar-4/40' },
  5: { name: 'Thiên', cls: 'text-rar-5 border-rar-5/50' },
};

/* Trạng thái giao dịch công huân — khớp TR_SoCai.Status. */
export const TX_STATUS = {
  confirmed: { label: 'Đã xác nhận', tone: 'green' },
  pending: { label: 'Chờ duyệt', tone: 'orange' },
  rejected: { label: 'Không duyệt', tone: 'red' },
  reversed: { label: 'Đã huỷ', tone: 'neutral' },
} as const;
export type TxStatus = keyof typeof TX_STATUS;
