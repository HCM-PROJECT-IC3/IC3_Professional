import type { LucideIcon } from 'lucide-react';
import {
  BookOpen, CalendarDays, ClipboardCheck, FolderOpen, Gamepad2, Image, LayoutDashboard, Library,
  Monitor, NotebookPen, Palette, School, Shuffle, Swords, Trophy, Users, UserCog, FileSpreadsheet,
} from 'lucide-react';
import type { Role } from '@/domain/legacy';

/** Vai trò khi xem app. 'guest' = học sinh KHÔNG đăng nhập (chọn tên ở sảnh). */
export type ViewerRole = Role | 'guest';

export const ROLE_LABEL: Record<ViewerRole, string> = {
  guest: 'Học sinh',
  student: 'Học sinh',
  teacher: 'Giáo viên',
  teaching_coordinator: 'Điều phối giáo viên',
  coordinator: 'Điều phối đào tạo',
  school_admin: 'Quản trị trường',
  admin: 'Quản trị viên',
};

export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Route trong app 2.0 (HashRouter) … */
  to?: string;
  /** … hoặc trang cũ ở thư mục gốc (mở hẳn trang, giữ nguyên đường dẫn). */
  legacy?: string;
  /** Ai thấy mục này. Với trang cũ: CHÉP ĐÚNG window.EDU_ALLOWED_ROLES của trang đó
   *  (auth-guard.js mới là lớp chặn thật; menu chỉ để không hiện thứ người dùng không mở được). */
  roles: ViewerRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const STUDENT: ViewerRole[] = ['guest', 'student'];
const EVERYONE: ViewerRole[] = ['guest', 'student', 'teacher', 'teaching_coordinator', 'coordinator', 'school_admin', 'admin'];
const TEACHER_TOOLS: ViewerRole[] = ['admin', 'teacher'];
const SCHOOL_STAFF: ViewerRole[] = ['admin', 'coordinator', 'school_admin'];

export const NAV: NavGroup[] = [
  {
    label: 'Bản 2.0',
    items: [
      { label: 'Tổng quan', icon: LayoutDashboard, to: '/', roles: EVERYONE },
      { label: 'Thư viện giao diện', icon: Palette, to: '/ui', roles: EVERYONE },
    ],
  },
  {
    label: 'Học tập',
    items: [
      { label: 'Luyện tập & thi thử', icon: BookOpen, legacy: 'index.html', roles: STUDENT },
      { label: 'Kệ sách đề', icon: Library, legacy: 'quiz-shelf.html', roles: STUDENT },
      { label: 'Luyện MOS', icon: FileSpreadsheet, legacy: 'mos/index.html', roles: STUDENT },
      { label: 'Mô phỏng máy tính', icon: Monitor, legacy: 'computer-simulator.html', roles: STUDENT },
      { label: 'Đấu trường', icon: Swords, legacy: 'arena.html', roles: STUDENT },
    ],
  },
  {
    label: 'Giảng dạy',
    items: [
      { label: 'Dashboard giáo viên', icon: LayoutDashboard, legacy: 'teacher-dashboard.html', roles: TEACHER_TOOLS },
      { label: 'Điểm danh & tiến độ', icon: ClipboardCheck, legacy: 'diem-danh.html', roles: TEACHER_TOOLS },
      { label: 'Sổ đầu bài', icon: NotebookPen, legacy: 'so-dau-bai.html', roles: TEACHER_TOOLS },
      { label: 'Lịch giảng dạy', icon: CalendarDays, legacy: 'teaching-schedule.html', roles: ['admin', 'teacher', 'teaching_coordinator'] },
      { label: 'Tài liệu năm học', icon: FolderOpen, legacy: 'tai-lieu-nam-hoc.html', roles: TEACHER_TOOLS },
      { label: 'Thi đua lớp học', icon: Trophy, legacy: 'thi-dua.html', roles: TEACHER_TOOLS },
      { label: 'Gọi tên học sinh', icon: Shuffle, legacy: 'goi-ten.html', roles: TEACHER_TOOLS },
      { label: 'Đấu trường (tổ chức)', icon: Gamepad2, legacy: 'arena.html', roles: TEACHER_TOOLS },
    ],
  },
  {
    label: 'Điều phối',
    items: [
      { label: 'Dashboard điều phối', icon: LayoutDashboard, legacy: 'coordinator-dashboard.html', roles: SCHOOL_STAFF },
      { label: 'Danh sách học sinh', icon: Users, legacy: 'roster-manager.html', roles: SCHOOL_STAFF },
    ],
  },
  {
    label: 'Quản trị',
    items: [
      { label: 'Tài khoản & phân quyền', icon: UserCog, legacy: 'admin-users.html', roles: ['admin'] },
      { label: 'Danh mục trường', icon: School, legacy: 'admin-schools.html', roles: ['admin', 'school_admin'] },
      { label: 'Câu hỏi & hình ảnh', icon: Image, legacy: 'image-manager.html', roles: ['admin'] },
    ],
  },
];

export function navFor(role: ViewerRole): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length);
}
