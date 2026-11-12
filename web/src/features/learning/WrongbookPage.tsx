import { useMemo, useState } from 'react';
import { ArrowRight, BookX, CalendarClock, GraduationCap, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState } from '@/components/shared/States';
import { plainText } from '@/features/learning/meta';
import { StudentPicker } from '@/features/student/StudentPicker';
import { useStudent } from '@/features/student/useStudent';
import { dueItems, studentBook } from '@/features/student/progress';
import { cn, legacyUrl } from '@/lib/utils';

/* Sổ tay câu sai — ĐỌC eduquiz_wrongbook_v1 (wrongbook-store.js) trên máy, 0 mạng.
   Lặp lại ngắt quãng (hộp Leitner 1→4: ôn ngay → 1 ngày → 3 ngày → 7 ngày → thuộc).
   "Ôn ngay" mở phiên ôn của Góc học tập cũ qua link CÓ SẴN: index.html?goc=sotay&hs=<khoá>
   (learning-hub.js § openFromLink) — chấm và cập nhật hộp vẫn do code cũ làm. */

const BOX_LABEL = ['', 'Ôn ngay', 'Sau 1 ngày', 'Sau 3 ngày', 'Sau 7 ngày'];
const DAY = 864e5;
const PAGE = 20;

function dueLabel(due: number, now: number) {
  if (due <= now) return 'Đến hạn';
  const days = Math.ceil((due - now) / DAY);
  return days <= 1 ? 'Ngày mai' : `${days} ngày nữa`;
}

function Boxes({ box }: { box: number }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`Hộp ${box}/4`} title={`Hộp ${box}/4`}>
      {[1, 2, 3, 4].map((b) => (
        <i key={b} className={cn('block h-2.5 w-1.5 rounded-sm', b <= box ? 'bg-chart-1' : 'bg-muted')} />
      ))}
    </span>
  );
}

export function WrongbookPage() {
  const { students, student, pick, version } = useStudent();
  const [topic, setTopic] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const data = useMemo(() => {
    if (!student) return null;
    const now = Date.now();
    const sb = studentBook(student.key);
    const items = Object.entries(sb.items || {}).map(([k, it]) => ({ k, ...it, text: plainText(it.q?.question) || '(câu hỏi dạng hình)' }));
    const topics = [...new Set(items.map((i) => i.topic).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
    const byBox = [1, 2, 3, 4].map((b) => items.filter((i) => i.box === b).length);
    return { now, items, topics, byBox, due: dueItems(sb, now).length, mastered: sb.mastered || 0 };
  }, [student, version]);

  const list = useMemo(() => {
    if (!data) return [];
    return data.items
      .filter((i) => (!topic || i.topic === topic) && (!onlyDue || i.due <= data.now))
      .sort((a, b) => Number(b.due <= data.now) - Number(a.due <= data.now) || a.box - b.box || a.due - b.due);
  }, [data, topic, onlyDue]);

  const reviewUrl = student ? legacyUrl(`index.html?goc=sotay&hs=${encodeURIComponent(student.key)}`) : legacyUrl('index.html');

  const header = (
    <PageHeader
      title="Sổ tay câu sai"
      description={student ? `${student.name}${student.cls ? ' · Lớp ' + student.cls : ''} — câu làm sai tự vào sổ, ôn đúng lúc để nhớ lâu.` : 'Câu làm sai tự vào sổ, ôn đúng lúc để nhớ lâu.'}
      actions={student ? <StudentPicker students={students} value={student.key} onPick={pick} /> : undefined}
    />
  );

  if (!data || !data.items.length) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            title={student ? 'Sổ tay đang trống' : 'Máy này chưa có bài làm nào'}
            description={
              student
                ? data?.mastered
                  ? `Em đã thuộc hẳn ${data.mastered} câu. Làm thêm bài để sổ tay ghi câu cần ôn.`
                  : 'Làm bài ở trang luyện tập — câu sai sẽ tự vào đây.'
                : 'Tiến độ lưu ngay trên máy em làm bài, không cần đăng nhập.'
            }
            action={
              <a href={legacyUrl('index.html')} className={buttonVariants()}>
                Vào luyện tập <ArrowRight />
              </a>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <Card className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-lg font-semibold">{data.due ? `${data.due} câu đến hạn ôn hôm nay` : 'Hôm nay không có câu đến hạn'}</p>
          <p className="text-sm text-muted-foreground">
            {data.due ? 'Ôn đúng hạn giúp câu lên hộp cao hơn — sai lại thì về hộp 1.' : 'Quay lại vào ngày mai, hoặc làm thêm bài mới.'}
          </p>
        </div>
        <a href={reviewUrl} className={buttonVariants({ className: 'w-full sm:w-auto' })}>
          Ôn ngay <ArrowRight />
        </a>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Câu trong sổ" value={data.items.length} icon={BookX} tone="blue" />
        <StatCard label="Đến hạn hôm nay" value={data.due} icon={CalendarClock} tone="orange" />
        <StatCard label="Đã thuộc hẳn" value={data.mastered} hint="Qua đủ 4 hộp" icon={GraduationCap} tone="green" />
        <StatCard label="Chủ đề" value={data.topics.length || '–'} icon={Layers} tone="neutral" />
      </div>

      <Card className="p-5">
        <p className="text-sm font-medium">Các hộp ôn tập</p>
        <div className="mt-3 grid grid-cols-4 gap-2" role="list">
          {data.byBox.map((n, i) => (
            <div key={i} role="listitem" className="rounded-lg border p-3 text-center">
              <p className="text-xl font-semibold tabular-nums">{n}</p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                Hộp {i + 1}
                <span className="hidden sm:inline"> · {BOX_LABEL[i + 1]}</span>
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Câu trong sổ</CardTitle>
          <CardDescription>Câu đến hạn lên đầu. Đáp án và giải thích xem khi ôn.</CardDescription>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2 border-y px-3 py-2">
          {data.topics.length > 0 && (
            <select
              aria-label="Chủ đề"
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                setLimit(PAGE);
              }}
              className="h-9 w-full min-w-0 rounded-md border bg-card px-2 text-sm sm:w-72"
            >
              <option value="">Mọi chủ đề</option>
              {data.topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" variant={onlyDue ? 'secondary' : 'ghost'} aria-pressed={onlyDue} onClick={() => setOnlyDue((v) => !v)}>
            Chỉ câu đến hạn
          </Button>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{list.length} câu</span>
        </div>
        {list.length ? (
          <ul className="divide-y">
            {list.slice(0, limit).map((i) => (
              <li key={i.k} className={cn('flex items-start gap-3 px-5 py-3', i.due <= data.now && 'bg-step-3/5')}>
                <div className="pt-1">
                  <Boxes box={i.box} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm">{i.text}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[i.src, i.topic && !(i.src || '').includes(i.topic) ? i.topic : '', `sai ${i.wrong || 1} lần`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Badge tone={i.due <= data.now ? 'orange' : 'neutral'} className="shrink-0">
                  {dueLabel(i.due, data.now)}
                </Badge>
              </li>
            ))}
            {list.length > limit && (
              <li className="p-2">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setLimit((n) => n + PAGE)}>
                  Xem thêm {Math.min(PAGE, list.length - limit)} câu
                </Button>
              </li>
            )}
          </ul>
        ) : (
          <EmptyState compact title="Không có câu phù hợp" description="Bỏ bớt bộ lọc để xem lại." />
        )}
      </Card>
    </div>
  );
}
