import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, BookOpen, CheckCircle2, Circle, Clock, Gem, Sparkles } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/States';
import { cn } from '@/lib/utils';
import { useLive } from '../demo/DemoState';
import { Cultivation } from '../engine';
import { ClassBanner, CourseTree, LearnerBar, LessonDrawer, useClassConfig, useLearner, type TreeNode } from '../learning/components';
import { Learning, quizHref, useCatalog } from '../learning/learning';
import { DataBlock } from '../ui/controls';
import { Meter, Panel, TrPageHeader, trPath } from '../ui/primitives';

/* Trang 1 công pháp: thông tin khoá, điều kiện hoàn thành, EXP thưởng (xem trước theo luật tu luyện), cây bài học. */
export function CoursePage() {
  const { courseId } = useParams();
  const catalog = useCatalog();
  const learner = useLearner();
  const klass = useClassConfig();
  const [pick, setPick] = useState<TreeNode | null>(null);
  const state = useLive(catalog, () => false);

  return (
    <DataBlock state={state} loadingRows={6} empty={{ title: 'Chưa có dữ liệu' }}>
      {(cat) => {
        const course = cat.courses.find((c) => c.id === courseId);
        if (!course) {
          return <EmptyState title="Không thấy công pháp này" description="Có thể link đã cũ." action={<Link to={trPath('tang-kinh-cac')} className={buttonVariants({ variant: 'outline' })}><ArrowLeft /> Về Tàng Kinh Các</Link>} />;
        }
        const status = Learning.courseStatus(course, learner.progress, klass.cfg);
        const exp = Learning.expPreview(course, Cultivation.DEFAULT_CONFIG);
        const cfg = Learning.courseCfg(klass.cfg, course.id);
        const timeSec = course.lessons.concat(course.gates as never[]).reduce((a, n) => a + (learner.progress.units[n.id]?.timeSec ?? 0), 0);
        const docs = course.lessons.reduce((a, l) => a + l.docs.length, 0);
        return (
          <div className="space-y-5">
            <Link to={trPath('tang-kinh-cac')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Tàng Kinh Các</Link>
            <TrPageHeader title={course.name} plain={`${course.plain} · ${course.level}`} description={course.description} />
            <ClassBanner {...klass} />
            <LearnerBar {...learner} />

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <Panel title="Cây công pháp" description={cfg.mode === 'free' ? 'Thầy cô cho học tự do: mọi bài đều mở.' : `Đạt ${cfg.minScore} điểm ở bài trước để mở bài sau.`}>
                <CourseTree course={course} status={status} cfg={klass.cfg} onPick={setPick} selected={pick?.node.id} />
                {course.reviews.length > 0 && (
                  <details className="mt-5 rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-medium">Đề ôn tập ({course.reviews.length}) — không bắt buộc</summary>
                    <ul className="mt-2 space-y-1 text-sm">
                      {course.reviews.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">{r.title}</span>
                          <a href={quizHref(r.src)} className="shrink-0 text-primary hover:underline">Ôn ({r.questions} câu)</a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Panel>

              <div className="space-y-5">
                <Panel variant="feature" title="Tiến độ" icon={Sparkles}>
                  <Meter label="Hoàn thành công pháp" value={status.pct} showValue={`${status.pct}%`} tone={status.complete ? 'moc' : 'primary'} />
                  <ul className="mt-4 space-y-2 text-sm">
                    {status.conditions.map((c) => (
                      <li key={c.id} className="flex items-start gap-2">
                        {c.met ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-el-moc" aria-label="Đã đạt" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Chưa đạt" />}
                        <span className="min-w-0 flex-1">{c.label}</span>
                        <span className="font-mono text-xs tabular-nums">{c.current}/{c.target}</span>
                      </li>
                    ))}
                  </ul>
                  {timeSec > 0 && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3.5" aria-hidden /> Đã học {Math.round(timeSec / 60)} phút</p>}
                  {status.next && (
                    <a href={quizHref(status.next.src)} className={cn(buttonVariants({ size: 'sm' }), 'mt-4 w-full')}>
                      <BookOpen /> Học tiếp: {'n' in status.next ? `Bài ${status.next.n}` : 'Kiểm tra'}
                    </a>
                  )}
                </Panel>
                <Panel title="Công huân thưởng" icon={Gem} description="Theo bảng thưởng hiện hành; chỉ bài Kiểm tra được máy chủ chấm lại mới được cộng.">
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground">Mỗi bài học</dt><dd className="font-mono font-semibold text-gold">+{exp.perLesson}</dd></div>
                    <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground">Mỗi bài kiểm tra</dt><dd className="font-mono font-semibold text-gold">+{exp.perGate}</dd></div>
                  </dl>
                  <p className="mt-2 text-sm">Cả công pháp: <span className="font-mono font-semibold text-gold">+{exp.total.toLocaleString('vi-VN')}</span></p>
                </Panel>
                <Panel title="Học liệu">
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>{course.lessons.length} bài học · {course.gates.length} bài kiểm tra · {course.reviews.length} đề ôn</li>
                    <li>{docs} tài liệu bài giảng</li>
                    <li>Video: thầy cô thêm cho lớp trong Quản lý công pháp</li>
                  </ul>
                </Panel>
              </div>
            </div>
            <LessonDrawer course={course} pick={pick} status={status} progress={learner.progress} cfg={klass.cfg} onClose={() => setPick(null)} />
          </div>
        );
      }}
    </DataBlock>
  );
}
