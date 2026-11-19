import { useState } from 'react';
import { Link } from 'react-router';
import { BookX, CalendarCheck, ClipboardCheck, KeyRound, ShieldCheck, Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn, legacyUrl } from '@/lib/utils';
import { useBlock } from '../demo/DemoState';
import { RECENT_LESSONS } from '../demo/data';
import { MY_REALM } from '../demo/engineDemo';
import { REALMS } from '../model';
import { ProgressReport } from '../learning/ProgressReport';
import { DataBlock, Tabs } from '../ui/controls';
import { Panel, RealmSeal, TrPageHeader, lessonHref } from '../ui/primitives';

/* Luyện Công Đường: (1) luyện tập — mở các chức năng ĐANG CÓ của EduQuiz; (2) khảo hạch — phiên thi lên cảnh giới
   do thầy cô mở, chấm trên máy chủ (thiết kế: docs/techrealm/FIREBASE_SECURITY.md §3.4). Ở bản xem thử, ô nhập mã
   chỉ kiểm định dạng, không gửi đi đâu. */

function Entry({ icon: Icon, title, desc, href, to, cta }: { icon: LucideIcon; title: string; desc: string; href?: string; to?: string; cta: string }) {
  const cls = cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3 self-start');
  return (
    <li className="flex flex-col rounded-xl border bg-card p-4">
      <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
      {to ? <Link to={to} className={cls}>{cta}</Link> : <a href={href} className={cls}>{cta}</a>}
    </li>
  );
}

function ExamGate() {
  const next = REALMS[MY_REALM];
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const valid = /^[A-HJ-NP-Z2-9]{6}$/.test(code);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel variant="feature" icon={KeyRound} title={`Khảo hạch ${next.name}`} description="Thầy cô mở phiên trong giờ học và đọc mã phiên 6 ký tự. Mỗi phiên em làm một lượt; điểm do máy chủ chấm.">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(valid ? 'Bản xem thử: ở bản thật, đề sẽ mở tại đây sau khi máy chủ kiểm mã phiên.' : 'Mã phiên gồm 6 ký tự chữ in hoa và số (không có I, O, 0, 1).');
          }}
        >
          <label className="grid gap-1 text-sm">
            Mã phiên
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setMsg(null); }}
              inputMode="text"
              autoComplete="off"
              placeholder="VD: K7M2QX"
              aria-describedby="exam-hint"
              className="h-10 w-40 rounded-md border bg-background px-3 font-mono text-base tracking-[0.2em] uppercase"
            />
          </label>
          <Button type="submit" disabled={code.length < 6}>Vào phòng khảo hạch</Button>
        </form>
        <p id="exam-hint" className="mt-2 text-xs text-muted-foreground">Chưa có mã? Khảo hạch chỉ mở khi thầy cô mở phiên cho lớp.</p>
        {msg && <p role="status" className="mt-3 rounded-lg bg-accent p-3 text-sm">{msg}</p>}
      </Panel>
      <Panel title="Luật khảo hạch" icon={ShieldCheck}>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2"><Timer className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> Có giờ làm bài; hết giờ bài tự nộp.</li>
          <li className="flex gap-2"><ClipboardCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> Đề riêng, không có trong bài luyện; đáp án chỉ hiện sau khi nộp.</li>
          <li className="flex gap-2"><RealmSeal realm={next.id} size={16} className="mt-0.5" /> Đạt điểm yêu cầu thì nhận công huân và tiến gần {next.name}.</li>
        </ul>
      </Panel>
    </div>
  );
}

export function PracticePage() {
  const [tab, setTab] = useState<'luyen' | 'khao' | 'tien-do'>('luyen');
  const recent = useBlock(RECENT_LESSONS);
  return (
    <div className="space-y-5">
      <TrPageHeader
        title="Luyện Công Đường"
        plain="Luyện tập, khảo hạch"
        description="Luyện mỗi ngày để tăng tu vi; khi đủ điều kiện, vào khảo hạch để lên cảnh giới."
      />
      <Tabs label="Chế độ" value={tab} onChange={setTab} items={[{ id: 'luyen', label: 'Luyện tập' }, { id: 'khao', label: 'Khảo hạch' }, { id: 'tien-do', label: 'Tiến độ & lịch sử' }]} />
      {tab === 'luyen' ? (
        <div className="space-y-5">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Entry icon={CalendarCheck} title="Thử thách hôm nay" desc="5 câu chung cả lớp, tính điểm tốc độ." href={legacyUrl('index.html')} cta="Mở ở sảnh" />
            <Entry icon={BookX} title="Ôn câu sai" desc="Sổ tay tự gom câu làm sai, ôn ngắt quãng." to="/so-tay" cta="Mở sổ tay" />
            <Entry icon={ClipboardCheck} title="Thi thử" desc="Chế độ Kiểm tra: tính giờ, chấm như thi thật." href={legacyUrl('index.html')} cta="Chọn đề" />
            <Entry icon={Timer} title="Luyện MOS" desc="Word, Excel, PowerPoint trên tệp thật." href={legacyUrl('mos/index.html')} cta="Mở MOS" />
          </ul>
          <Panel title="Luyện lại bài gần đây">
            <DataBlock state={recent} empty={{ title: 'Chưa có bài gần đây' }}>
              {(list) => (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {list.map((l) => (
                    <li key={l.title}>
                      <a href={lessonHref(l.src)} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm hover:bg-muted">
                        <span className="min-w-0 truncate">{l.title}</span>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">{l.score}%</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </DataBlock>
          </Panel>
        </div>
      ) : tab === 'khao' ? (
        <ExamGate />
      ) : (
        <ProgressReport />
      )}
    </div>
  );
}
