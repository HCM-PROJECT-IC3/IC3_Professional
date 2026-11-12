/* DỮ LIỆU MẪU cho Phase 3 (xem thử giao diện). Không phải học sinh thật, không đọc mạng.
   Phase 4 thay bằng repository thật (localStorage / Google Sheet / Firestore có cache). */
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen, CheckCircle2, ClipboardList, Flame, School, ShieldCheck, Target, UserCheck, Users, UserCog, Zap,
} from 'lucide-react';
import type { ViewerRole } from '@/app/navigation';

export interface SampleStat {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: 'blue' | 'green' | 'orange' | 'neutral';
}

export interface SampleRow {
  id: string;
  student: string;
  className: string;
  exam: string;
  score: number;
  at: string; // ISO
}

const STATS: Record<'student' | 'teacher' | 'staff' | 'admin', SampleStat[]> = {
  student: [
    { label: 'Điểm kinh nghiệm', value: '1.320 XP', hint: '+120 XP tuần này', icon: Zap, tone: 'blue' },
    { label: 'Chuỗi ngày học', value: '9 ngày', hint: 'Kỷ lục: 14 ngày', icon: Flame, tone: 'orange' },
    { label: 'Câu sai cần ôn', value: '23', hint: 'Sổ tay câu sai', icon: Target, tone: 'neutral' },
    { label: 'Bài đã làm', value: '41', hint: '8 bài trong 7 ngày', icon: CheckCircle2, tone: 'green' },
  ],
  teacher: [
    { label: 'Lớp phụ trách', value: '6', hint: 'Khối 3 – 5', icon: BookOpen, tone: 'blue' },
    { label: 'Học sinh', value: '214', hint: '198 đã làm bài tuần này', icon: Users, tone: 'neutral' },
    { label: 'Bài nộp 7 ngày', value: '536', hint: '+12% so với tuần trước', icon: ClipboardList, tone: 'green' },
    { label: 'Tỉ lệ đạt', value: '78%', hint: 'Điểm ≥ 700/1000', icon: Target, tone: 'orange' },
  ],
  staff: [
    { label: 'Trường', value: '12', hint: 'Trong phạm vi phụ trách', icon: School, tone: 'blue' },
    { label: 'Lớp', value: '148', hint: '', icon: BookOpen, tone: 'neutral' },
    { label: 'Học sinh', value: '2.840', hint: '2.311 hoạt động 30 ngày', icon: Users, tone: 'green' },
    { label: 'Bài nộp 7 ngày', value: '6.904', hint: 'Nguồn: Google Sheet', icon: ClipboardList, tone: 'orange' },
  ],
  admin: [
    { label: 'Tài khoản', value: '187', hint: 'Giáo viên & nhân sự', icon: UserCog, tone: 'blue' },
    { label: 'Chờ duyệt', value: '4', hint: 'Giáo viên mới đăng ký', icon: UserCheck, tone: 'orange' },
    { label: 'Trường', value: '12', hint: '', icon: School, tone: 'neutral' },
    { label: 'Vai trò', value: '6', hint: 'js/core/rbac.js', icon: ShieldCheck, tone: 'green' },
  ],
};

export function statsFor(role: ViewerRole): SampleStat[] {
  if (role === 'guest' || role === 'student') return STATS.student;
  if (role === 'teacher' || role === 'teaching_coordinator') return STATS.teacher;
  if (role === 'admin') return STATS.admin;
  return STATS.staff;
}

const NAMES = ['Học sinh A1', 'Học sinh B2', 'Học sinh C3', 'Học sinh D4', 'Học sinh E5', 'Học sinh F6', 'Học sinh G7'];
const CLASSES = ['3A1', '3A2', '4A1', '4A3', '5A2'];
const EXAMS = ['IC3 Spark – Level 1', 'IC3 GS6 – Level 2', 'Minitest Phần cứng', 'MOS Word – Đề 3', 'Ôn tập Internet'];

export const SAMPLE_ROWS: SampleRow[] = Array.from({ length: 23 }, (_, i) => ({
  id: `r${i}`,
  student: NAMES[i % NAMES.length],
  className: CLASSES[i % CLASSES.length],
  exam: EXAMS[(i * 3) % EXAMS.length],
  score: 420 + ((i * 137) % 580),
  at: new Date(Date.UTC(2026, 10, 12, 9) - i * 5.5 * 3600_000).toISOString(),
}));
