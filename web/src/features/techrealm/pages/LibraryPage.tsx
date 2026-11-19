import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { FileText, LibraryBig, Swords } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useLive } from '../demo/DemoState';
import { ClassBanner, LearnerBar, useClassConfig, useLearner } from '../learning/components';
import { Learning, useCatalog, type Course } from '../learning/learning';
import { DataBlock, Segmented } from '../ui/controls';
import { Meter, TrPageHeader, trPath } from '../ui/primitives';

/* Tàng Kinh Các — kho học liệu 12 lĩnh vực. Khoá học: data/techrealm/courses.json (sinh từ ngân hàng câu hỏi).
   Tiến độ: lịch sử bài làm của học sinh đang chọn trên máy (eduquiz_records) — 0 lượt mạng ngoài 1 file tĩnh. */

function CourseCard({ c, pct, done, started }: { c: Course; pct: number; done: boolean; started: boolean }) {
  const docs = c.lessons.reduce((a, l) => a + l.docs.length, 0);
  return (
    <Link to={trPath(`tang-kinh-cac/${c.id}`)} className="flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/60 hover:bg-accent">
      <span className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><LibraryBig className="size-5" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-tight">{c.name}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{c.plain} · {c.level}</span>
        </span>
        {done && <Badge tone="green">Hoàn thành</Badge>}
      </span>
      <span className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</span>
      <span className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{c.lessons.length} bài</span>
        {c.gates.length > 0 && <span className="inline-flex items-center gap-1"><Swords className="size-3" aria-hidden />{c.gates.length} kiểm tra</span>}
        {docs > 0 && <span className="inline-flex items-center gap-1"><FileText className="size-3" aria-hidden />{docs} tài liệu</span>}
      </span>
      <span className="mt-auto block pt-3">
        {started ? <Meter label="Tiến độ" value={pct} showValue={`${pct}%`} size="sm" tone={done ? 'moc' : 'primary'} /> : <span className="text-xs text-muted-foreground">Chưa bắt đầu</span>}
      </span>
    </Link>
  );
}

export function LibraryPage() {
  const catalog = useCatalog();
  const learner = useLearner();
  const klass = useClassConfig();
  const [domain, setDomain] = useState('all');
  const state = useLive(catalog, (d) => d.courses.length === 0);
  const statusOf = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof Learning.courseStatus>>();
    return (c: Course) => {
      if (!cache.has(c.id)) cache.set(c.id, Learning.courseStatus(c, learner.progress, klass.cfg));
      return cache.get(c.id)!;
    };
  }, [learner.progress, klass.cfg]);

  return (
    <div className="space-y-5">
      <TrPageHeader
        title="Tàng Kinh Các"
        plain="Khoá học, bài học"
        description="Kho công pháp của 12 lĩnh vực. Mỗi công pháp là một cây bài học: đạt bài trước để mở bài sau, làm bài ngay ở sảnh luyện tập quen thuộc."
      />
      <ClassBanner {...klass} />
      <LearnerBar {...learner} />
      <DataBlock state={state} loadingRows={5} empty={{ title: 'Chưa có công pháp nào', description: 'Kho học liệu đang được cập nhật.' }}>
        {(cat) => {
          const items = [{ id: 'all', label: 'Tất cả' }].concat(cat.domains.map((d) => ({ id: d.id, label: d.name })));
          const domains = domain === 'all' ? cat.domains : cat.domains.filter((d) => d.id === domain);
          return (
            <div className="space-y-6">
              <Segmented label="Lĩnh vực" items={items} value={domain} onChange={setDomain} />
              {domains.map((d) => {
                const courses = d.courseIds.map((id) => cat.courses.find((c) => c.id === id)!).filter(Boolean);
                if (domain === 'all' && !courses.length) return null;
                return (
                  <section key={d.id} aria-labelledby={`dm-${d.id}`}>
                    <h2 id={`dm-${d.id}`} className="text-base font-semibold">{d.name} <span className="text-sm font-normal text-muted-foreground">· {d.plain}</span></h2>
                    {courses.length ? (
                      <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {courses.map((c) => {
                          const s = statusOf(c);
                          const started = c.lessons.some((l) => learner.progress.units[l.id]);
                          return <li key={c.id}><CourseCard c={c} pct={s.pct} done={s.complete} started={started} /></li>;
                        })}
                      </ul>
                    ) : (
                      <p className={cn('mt-3 rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground')}>
                        Sắp mở — lĩnh vực này đang được soạn nội dung. Công pháp mới sẽ hiện ở đây khi có bài học và bài kiểm tra.
                      </p>
                    )}
                  </section>
                );
              })}
              {domain === 'all' && (
                <p className="text-sm text-muted-foreground">
                  Sắp mở: {cat.domains.filter((d) => !d.courseIds.length).map((d) => d.name).join(', ')}.
                </p>
              )}
            </div>
          );
        }}
      </DataBlock>
    </div>
  );
}
