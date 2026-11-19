import type { LucideIcon } from 'lucide-react';
import { Award, Backpack, Compass, FlaskConical, Hammer, LayoutDashboard, LibraryBig, Map as MapIcon, Swords, Target } from 'lucide-react';

/* Menu TechRealm — đúng thứ tự Prompt 02. `plain` = tên thường (giáo viên, phụ huynh, học sinh nhỏ đọc là hiểu). */
export const TR_NAV: { to: string; label: string; plain: string; icon: LucideIcon }[] = [
  { to: '', label: 'Tổng quan', plain: 'Bảng tu luyện', icon: LayoutDashboard },
  { to: 'ban-do', label: 'Thế giới tu luyện', plain: 'Bản đồ chủ đề', icon: MapIcon },
  { to: 'tang-kinh-cac', label: 'Tàng Kinh Các', plain: 'Khoá học, bài học', icon: LibraryBig },
  { to: 'luyen-cong', label: 'Luyện Công Đường', plain: 'Luyện tập, khảo hạch', icon: Target },
  { to: 'bi-canh', label: 'Bí Cảnh', plain: 'Thử thách', icon: Compass },
  { to: 'bach-cong-phuong', label: 'Bách Công Phường', plain: 'Dự án, sản phẩm', icon: Hammer },
  { to: 'van-tuong-gioi', label: 'Vạn Tượng Giới', plain: 'Khoa học, đời sống', icon: FlaskConical },
  { to: 'dau-truong', label: 'Đấu Trường', plain: 'Thi đấu', icon: Swords },
  { to: 'tui-can-khon', label: 'Túi Càn Khôn', plain: 'Vật phẩm', icon: Backpack },
  { to: 'thanh-tuu', label: 'Thành tựu', plain: 'Huy hiệu', icon: Award },
];
