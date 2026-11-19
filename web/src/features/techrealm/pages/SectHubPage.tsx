import { Link } from 'react-router';
import { BarChart3, Bot, ClipboardCheck, FileText, Gift, KeyRound, Landmark, ListChecks, Settings2, ShieldCheck, Swords, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { legacyUrl } from '@/lib/utils';
import { Panel, TrPageHeader, trPath } from '../ui/primitives';

/* TÔNG MÔN — trung tâm cho thầy cô (Prompt 07 §1) + quản trị. Chỉ là MỤC LỤC: không đọc dữ liệu, 0 lượt
   Firebase / Apps Script. Mỗi chức năng trỏ tới trang đã có (giữ nguyên quyền truy cập của trang đó) hoặc ghi rõ
   giai đoạn sẽ làm. Hướng dẫn: docs/techrealm/HUONG_DAN_GIAO_VIEN.md */

type Status = 'live' | 'partial' | 'later';
interface Item { icon: LucideIcon; title: string; what: string; status: Status; note?: string; href?: string; to?: string }
const STATUS: Record<Status, { label: string; tone: 'green' | 'orange' | 'neutral' }> = {
  live: { label: 'Dùng được', tone: 'green' }, partial: { label: 'Một phần', tone: 'orange' }, later: { label: 'Giai đoạn sau', tone: 'neutral' },
};

const TEACHER: Item[] = [
  { icon: Users, title: 'Quản lý lớp và học viên', what: 'Nhập danh sách lớp, sửa tên, gộp trùng.', status: 'live', href: 'roster-manager.html' },
  { icon: BarChart3, title: 'Theo dõi tiến độ', what: 'Kết quả bài làm cả lớp, lọc theo lớp / bài.', status: 'live', to: '/giao-vien' },
  { icon: ListChecks, title: 'Năng lực học viên & báo cáo lớp', what: 'Tỷ lệ hoàn thành, kết quả kiểm tra, năng lực từng lĩnh vực, lỗ hổng, học sinh cần chú ý. Xuất CSV, in.', status: 'live', to: '/giao-vien/nang-luc' },
  { icon: Settings2, title: 'Giao bài (công pháp cho lớp)', what: 'Chọn khoá, điều kiện mở bài, ngưỡng đạt rồi gửi LINK cho lớp.', status: 'live', to: trPath('quan-ly-cong-phap') },
  { icon: FileText, title: 'Soạn đề / tạo bài tập', what: 'Đề tự soạn, kể cả tạo câu hỏi bằng AI.', status: 'live', href: 'ic3-dashboard.html' },
  { icon: Swords, title: 'Tạo bí cảnh / thi cả lớp', what: 'Phòng thi đấu cả lớp theo thời gian thực.', status: 'partial', note: 'Bí cảnh mẫu "Thành phố mất điện" đã có; trình tạo bí cảnh riêng làm sau khi nghiệm thu bí cảnh mẫu.', href: 'arena.html' },
  { icon: Bot, title: 'AI Sư Phụ — chấm theo rubric', what: 'AI gợi ý điểm từng tiêu chí, thầy cô quyết định.', status: 'live', to: trPath('su-phu') },
  { icon: ClipboardCheck, title: 'Chấm sản phẩm / xác nhận hoàn thành', what: 'Học sinh nộp sản phẩm, thầy cô duyệt → cộng công huân.', status: 'later', note: 'Cần mã học tập (GĐ4) và Bách Công Phường (GĐ7). Máy chủ đã có sẵn sổ cái + móc thưởng, đang tắt.' },
  { icon: Gift, title: 'Quản lý phần thưởng', what: 'Thưởng / thu hồi công huân, vật phẩm.', status: 'later', note: 'Cần mã học tập (GĐ4). Sổ cái chỉ ghi thêm — thu hồi là 1 dòng đảo, có lịch sử.' },
];
const ADMIN: Item[] = [
  { icon: Landmark, title: 'Tổng quan quản trị', what: 'Tài khoản chờ duyệt, cần xử lý, trường / lớp.', status: 'live', to: '/quan-tri' },
  { icon: ShieldCheck, title: 'Phân quyền tài khoản', what: 'Duyệt giáo viên, đổi vai trò, gán trường.', status: 'live', href: 'admin-users.html' },
  { icon: KeyRound, title: 'AI: key, giới hạn, nhật ký', what: 'Key Gemini của trường cất trong Script Properties (GEMINI_API_KEY) — không bao giờ tới trình duyệt. Giới hạn: 30 lượt/máy/ngày, 150/tài khoản thầy cô, 800/trường/ngày. Nhật ký + báo lỗi: tab NhatKyAI trong sheet nhật ký.', status: 'live' },
];

function Row({ it }: { it: Item }) {
  const st = STATUS[it.status];
  const link = it.to ? <Link to={it.to} className="text-sm text-primary hover:underline">Mở</Link> : it.href ? <a href={legacyUrl(it.href)} className="text-sm text-primary hover:underline">Mở</a> : null;
  return (
    <li className="flex items-start gap-3 py-3">
      <it.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">{it.title} <Badge tone={st.tone}>{st.label}</Badge></p>
        <p className="text-sm text-muted-foreground">{it.what}</p>
        {it.note && <p className="mt-0.5 text-xs text-muted-foreground">{it.note}</p>}
      </div>
      {link && <span className="shrink-0">{link}</span>}
    </li>
  );
}

export default function SectHubPage() {
  return (
    <div className="space-y-5">
      <TrPageHeader title="Tông môn" plain="Dành cho thầy cô" description="Mọi việc quản lý lớp ở một chỗ. Trang cần đăng nhập (theo dõi tiến độ, năng lực, quản trị) sẽ hỏi tài khoản khi mở; học sinh không thấy dữ liệu của lớp." />
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Panel title="Giáo viên" icon={Users}><ul className="divide-y">{TEACHER.map((it) => <Row key={it.title} it={it} />)}</ul></Panel>
        <div className="min-w-0 space-y-5">
          <Panel title="Quản trị" icon={ShieldCheck}><ul className="divide-y">{ADMIN.map((it) => <Row key={it.title} it={it} />)}</ul></Panel>
          <Panel title="Bảo vệ dữ liệu" icon={KeyRound}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Học sinh không cần tài khoản; tiến độ lưu trên máy.</li>
              <li>AI chỉ nhận câu hỏi — tự ẩn email, số điện thoại, địa chỉ, mật khẩu trước khi gửi.</li>
              <li>Đang làm bài Kiểm tra: AI nghỉ, không gợi ý.</li>
              <li>Báo cáo năng lực chỉ hiện cho tài khoản giáo viên / quản trị.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
