import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  Atom, BarChart3, Bot, Brain, Building2, Calculator, Clock, Code2, Cpu, Dna, FlaskConical, Home, Leaf, PiggyBank, Recycle, Shield, Sun, Wallet, Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useLive } from '../demo/DemoState';
import { DataBlock } from '../ui/controls';
import { Panel, TrPageHeader, trPath } from '../ui/primitives';

/* Vạn Tượng Giới — khoa học, công nghệ, đời sống (Prompt 06). Mỗi mục trỏ tới NỘI DUNG CÓ THẬT (bí cảnh, khoá học,
   nhiệm vụ, thành phố) hoặc ghi rõ "Sắp mở" — không tạo phòng thí nghiệm giả. Mọi mô phỏng chạy trên máy, an toàn:
   không có hướng dẫn thí nghiệm thật có rủi ro. Thiết kế: docs/techrealm/SMART_CITY.md §4. */

type Item = { name: string; plain: string; icon: LucideIcon; to?: string; note: string; state: 'open' | 'soon' };
const ZONES: { id: string; title: string; desc: string; items: Item[] }[] = [
  { id: 'khoa-hoc', title: 'Phòng thí nghiệm khoa học', desc: 'Mô phỏng an toàn trên trình duyệt.', items: [
    { name: 'Vật lý', plain: 'Mạch điện, vật dẫn – cách điện', icon: Atom, to: 'bi-canh/thanh-pho-mat-dien', note: 'Bí cảnh 1 · Trạm biến áp', state: 'open' },
    { name: 'Năng lượng', plain: 'Công suất, chia điện có hạn', icon: Zap, to: 'bi-canh/thanh-pho-mat-dien', note: 'Bí cảnh 1 · Nhà máy điện', state: 'open' },
    { name: 'Toán học', plain: 'Bậc thang, phần trăm, tối ưu', icon: Calculator, to: 'van-tuong-gioi/tien-dien', note: 'Nhiệm vụ Tính tiền điện', state: 'open' },
    { name: 'Môi trường', plain: 'Phân loại rác, tác động của công trình', icon: Leaf, to: 'van-tuong-gioi/phan-loai-rac', note: 'Nhiệm vụ Phân loại rác', state: 'open' },
    { name: 'Hóa học', plain: 'Axit – bazơ bằng giấy quỳ (mô phỏng)', icon: FlaskConical, note: 'Đang thiết kế (Bí cảnh 5)', state: 'soon' },
    { name: 'Sinh học', plain: 'Thí nghiệm có biến kiểm soát', icon: Dna, note: 'Đang thiết kế (Bí cảnh 5)', state: 'soon' },
  ] },
  { id: 'cong-nghe', title: 'Công nghệ', desc: 'Các phòng lab dẫn tới khoá học và bí cảnh có sẵn.', items: [
    { name: 'AI Lab', plain: 'Máy học, prompt, kiểm chứng thông tin AI', icon: Brain, to: 'tang-kinh-cac/ai-nhap-mon', note: 'Khoá AI nhập môn · 6 bài', state: 'open' },
    { name: 'Coding Lab', plain: 'Boolean, sơ đồ quy trình', icon: Code2, to: 'tang-kinh-cac/tu-duy-may-tinh', note: 'Khoá Tư duy máy tính · 5 bài', state: 'open' },
    { name: 'Data Lab', plain: 'Đọc biểu đồ, tìm bất thường', icon: BarChart3, to: 'bi-canh/thanh-pho-mat-dien', note: 'Bí cảnh 1 · Phòng điều khiển', state: 'open' },
    { name: 'Robotics Lab', plain: 'Lập trình robot theo khối lệnh', icon: Bot, note: 'Đang thiết kế (Bí cảnh 4)', state: 'soon' },
    { name: 'IoT Lab', plain: 'Cảm biến, ngưỡng, tự động hoá', icon: Cpu, note: 'Đang thiết kế (Bí cảnh 4)', state: 'soon' },
  ] },
  { id: 'doi-song', title: 'Đời sống thực tiễn', desc: 'Nhiệm vụ gắn với chuyện hằng ngày. Làm xong sẽ mở công trình trong thành phố.', items: [
    { name: 'Tính tiền điện', plain: 'kWh, giá bậc thang, ngân sách', icon: Zap, to: 'van-tuong-gioi/tien-dien', note: 'Mở Nhà máy, Trạm điện mặt trời', state: 'open' },
    { name: 'Phân loại rác', plain: 'Tái chế, thực phẩm, rác khác, nguy hại', icon: Recycle, to: 'van-tuong-gioi/phan-loai-rac', note: 'Mở Công viên', state: 'open' },
    { name: 'Lập kế hoạch tiết kiệm', plain: 'Ống heo, thưởng như lãi', icon: PiggyBank, note: 'Ngay bên dưới', state: 'open' },
    { name: 'Bảo mật tài khoản', plain: 'Mật khẩu, lừa đảo trực tuyến', icon: Shield, to: 'tang-kinh-cac/ky-nang-song-so', note: 'Khoá Kỹ năng sống · mở Bệnh viện', state: 'open' },
    { name: 'Bảo vệ môi trường', plain: 'Điện sạch, công viên, khoảng cách nhà máy', icon: Sun, to: 'van-tuong-gioi/thanh-pho', note: 'Chỉ số Môi trường của thành phố', state: 'open' },
    { name: 'Quản lý chi tiêu', plain: 'Ngân sách tuần, nhu cầu và mong muốn', icon: Wallet, note: 'Sắp mở', state: 'soon' },
    { name: 'Quản lý thời gian', plain: 'Lịch học, ưu tiên việc', icon: Clock, note: 'Sắp mở', state: 'soon' },
    { name: 'Thiết kế nhà thông minh', plain: 'Cảm biến, tự động tắt đèn', icon: Home, note: 'Sắp mở (cùng IoT Lab)', state: 'soon' },
  ] },
];

function ItemCard({ it }: { it: Item }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <it.icon className={cn('size-5', it.state === 'soon' ? 'text-muted-foreground' : 'text-primary')} aria-hidden />
        {it.state === 'soon' ? <Badge>Sắp mở</Badge> : <Badge tone="green">Đã mở</Badge>}
      </span>
      <span className="mt-2 block font-semibold">{it.name}</span>
      <span className="block text-sm text-muted-foreground">{it.plain}</span>
      <span className="mt-auto block pt-2 text-xs text-muted-foreground">{it.note}</span>
    </>
  );
  return it.to
    ? <Link to={trPath(it.to)} className="flex h-full flex-col rounded-xl border bg-card p-3.5 transition-colors hover:bg-accent">{body}</Link>
    : <div className={cn('flex h-full flex-col rounded-xl border p-3.5', it.state === 'soon' ? 'border-dashed bg-muted/40' : 'bg-card')}>{body}</div>;
}

const fmt = (n: number) => n.toLocaleString('vi-VN');

function SavingsLab() {
  const [weekly, setWeekly] = useState(20000);
  const [weeks, setWeeks] = useState(20);
  const [bonus, setBonus] = useState(true);
  const rows = useMemo(() => {
    let total = 0;
    const out: number[] = [];
    for (let w = 1; w <= weeks; w++) {
      total += weekly;
      if (bonus && w % 4 === 0) total += Math.round(total * 0.01); // thưởng 1% mỗi 4 tuần (như lãi)
      out.push(total);
    }
    return out;
  }, [weekly, weeks, bonus]);
  const final = rows[rows.length - 1] ?? 0;
  const plain = weekly * weeks;
  const max = Math.max(...rows, 1);
  return (
    <Panel variant="feature" icon={PiggyBank} title="Thí nghiệm: Ống heo tiết kiệm" description="Bỏ ống mỗi tuần. Bật 'thưởng' để thấy tiền tự lớn thêm theo thời gian, giống lãi ngân hàng.">
      <div className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="space-y-4 text-sm">
          <label className="grid gap-1">
            <span className="flex justify-between">Mỗi tuần bỏ ống <span className="font-mono tabular-nums">{fmt(weekly)} đ</span></span>
            <input type="range" min={5000} max={100000} step={5000} value={weekly} onChange={(e) => setWeekly(+e.target.value)} className="accent-[var(--primary)]" />
          </label>
          <label className="grid gap-1">
            <span className="flex justify-between">Số tuần <span className="font-mono tabular-nums">{weeks}</span></span>
            <input type="range" min={4} max={52} step={4} value={weeks} onChange={(e) => setWeeks(+e.target.value)} className="accent-[var(--primary)]" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={bonus} onChange={(e) => setBonus(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Thưởng 1% mỗi 4 tuần
          </label>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3">
            <div><dt className="text-xs text-muted-foreground">Tự bỏ vào</dt><dd className="font-mono font-semibold tabular-nums">{fmt(plain)} đ</dd></div>
            <div><dt className="text-xs text-muted-foreground">Có được</dt><dd className="font-mono font-semibold text-el-moc tabular-nums">{fmt(final)} đ</dd></div>
          </dl>
        </div>
        <figure>
          <div className="flex h-44 items-end gap-px" role="img" aria-label={`Biểu đồ: sau ${weeks} tuần có ${fmt(final)} đồng`}>
            {rows.map((v, i) => (
              <div key={i} className={cn('flex-1 rounded-t-sm', (i + 1) % 4 === 0 && bonus ? 'bg-gold' : 'bg-primary/70')} style={{ height: `${(v / max) * 100}%` }} title={`Tuần ${i + 1}: ${fmt(v)} đ`} />
            ))}
          </div>
          <figcaption className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Tuần 1</span><span>Cột vàng: tuần có thưởng</span><span>Tuần {weeks}</span></figcaption>
        </figure>
      </div>
    </Panel>
  );
}

export function LabPage() {
  const zones = useLive({ status: 'ready', data: ZONES });
  return (
    <div className="space-y-5">
      <TrPageHeader
        title="Vạn Tượng Giới"
        plain="Khoa học, công nghệ, đời sống"
        description="Nơi kiến thức gặp đời sống: phòng thí nghiệm mô phỏng, các phòng lab công nghệ, nhiệm vụ thực tế — và một thành phố của riêng em, lớn lên theo những gì em học."
      />
      <Link to={trPath('van-tuong-gioi/thanh-pho')} className="flex flex-wrap items-center gap-4 rounded-2xl border border-t-2 border-t-gold bg-card p-4 transition-colors hover:bg-accent">
        <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-6" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">Thành phố thông minh</span>
          <span className="block text-sm text-muted-foreground">Xây trường, bệnh viện, trạm điện, trung tâm AI… Mỗi công trình mở khoá bằng bài học, bí cảnh hoặc nhiệm vụ em đã làm. 6 chỉ số phản ứng theo quyết định của em.</span>
        </span>
        <span className="text-sm font-medium text-primary">Vào thành phố</span>
      </Link>
      <DataBlock state={zones} loadingRows={6} empty={{ title: 'Chưa có khu nào' }}>
        {(list) => (
          <div className="space-y-6">
            {list.map((z) => (
              <section key={z.id} aria-labelledby={`z-${z.id}`}>
                <h2 id={`z-${z.id}`} className="text-base font-semibold">{z.title} <span className="text-sm font-normal text-muted-foreground">· {z.desc}</span></h2>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {z.items.map((it) => <li key={it.name}><ItemCard it={it} /></li>)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </DataBlock>
      <SavingsLab />
    </div>
  );
}
