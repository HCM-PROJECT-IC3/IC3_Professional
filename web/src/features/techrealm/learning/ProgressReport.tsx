import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Download, History, LineChart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { recTime, type ExamRecord } from '@/features/student/progress';
import { useLive } from '../demo/DemoState';
import { DataBlock, Segmented } from '../ui/controls';
import { Meter, Panel, trPath } from '../ui/primitives';
import { LearnerBar, useLearner } from './components';
import { Learning, useCatalog } from './learning';

/* Báo cáo tiến độ + lịch sử học tập của 1 học sinh trên máy (eduquiz_records — sảnh cũ ghi). Xuất CSV ngay trên máy.
   Báo cáo CẢ LỚP vẫn ở dashboard giáo viên (đọc Google Sheet bài nộp) — không làm lại ở đây. */

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (t: number) => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mmss = (s?: number) => (s ? `${Math.floor(s / 60)}:${pad(s % 60)}` : '');

function toCsv(rows: ExamRecord[]) {
  const head = ['Thời gian', 'Chương trình', 'Cấp độ', 'Bài', 'Chế độ', 'Điểm', 'Đúng/Tổng', 'Thời gian làm'];
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [fmt(recTime(r)), r.category, r.level, r.minitest, r.examMode === 'test' ? 'Kiểm tra' : 'Ôn luyện', r.score, r.total ? `${r.correct ?? ''}/${r.total}` : '', mmss(r.elapsedSec)].map(q).join(','));
  return '﻿' + [head.map(q).join(',')].concat(lines).join('\r\n'); // BOM: Excel đọc đúng tiếng Việt
}

export function ProgressReport() {
  const learner = useLearner();
  const catalog = useCatalog();
  const [mode, setMode] = useState<'all' | 'practice' | 'test'>('all');
  const history = useMemo(() => learner.records.slice().sort((a, b) => recTime(b) - recTime(a)), [learner.records]);
  const shown = history.filter((r) => mode === 'all' || (r.examMode ?? 'test') === mode);
  const courses = useLive(catalog, () => false);
  const hist = useLive({ status: 'ready', data: shown });

  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(shown)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich-su-hoc-tap-${(learner.student?.name ?? 'hoc-sinh').replace(/\s+/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-5">
      <LearnerBar {...learner} />
      <Panel title="Tiến độ theo công pháp" icon={LineChart} description="Tính từ lịch sử bài làm trên máy này. Đạt điểm đạt ở mỗi bài để hoàn thành công pháp.">
        <DataBlock state={courses} empty={{ title: 'Chưa có công pháp' }}>
          {(cat) => {
            const active = cat.courses.map((c) => ({ c, s: Learning.courseStatus(c, learner.progress, null) }))
              .filter(({ c }) => c.lessons.concat(c.gates as never[]).some((n) => learner.progress.units[n.id]));
            if (!active.length) return <p className="text-sm text-muted-foreground">Em chưa làm bài nào thuộc công pháp. <Link to={trPath('tang-kinh-cac')} className="text-primary hover:underline">Vào Tàng Kinh Các</Link></p>;
            return (
              <ul className="divide-y">
                {active.map(({ c, s }) => (
                  <li key={c.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center">
                    <div className="min-w-0">
                      <Link to={trPath(`tang-kinh-cac/${c.id}`)} className="font-medium hover:underline">{c.name}</Link>
                      <p className="text-xs text-muted-foreground">{c.plain} · {s.lessonsDone}/{c.lessons.length} bài{c.gates.length ? ` · ${s.gatesDone}/${c.gates.length} kiểm tra` : ''}</p>
                    </div>
                    <Meter label="Hoàn thành" value={s.pct} showValue={`${s.pct}%`} size="sm" tone={s.complete ? 'moc' : 'primary'} />
                  </li>
                ))}
              </ul>
            );
          }}
        </DataBlock>
      </Panel>

      <Panel title="Lịch sử học tập" icon={History} description={`${history.length} bài đã nộp trên máy này.`}
        action={<Button size="sm" variant="outline" onClick={download} disabled={!shown.length}><Download /> Xuất CSV</Button>}>
        <Segmented label="Chế độ" value={mode} onChange={setMode} items={[{ id: 'all', label: 'Tất cả' }, { id: 'practice', label: 'Ôn luyện' }, { id: 'test', label: 'Kiểm tra' }]} />
        <div className="mt-3">
          <DataBlock state={hist} empty={{ title: 'Chưa có bài làm', description: 'Bài em nộp ở sảnh luyện tập sẽ hiện ở đây.' }}>
            {(rows) => (
              <ul className="divide-y text-sm">
                {rows.slice(0, 100).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2">
                    <span className="w-12 shrink-0 rounded-md bg-muted py-1 text-center font-mono tabular-nums">{r.score}%</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.minitest}</p>
                      <p className="truncate text-xs text-muted-foreground">{fmt(recTime(r))} · {r.category} {r.level}{r.elapsedSec ? ` · ${mmss(r.elapsedSec)}` : ''}</p>
                    </div>
                    <Badge tone={r.examMode === 'practice' ? 'neutral' : 'orange'}>{r.examMode === 'practice' ? 'Ôn luyện' : 'Kiểm tra'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </DataBlock>
        </div>
      </Panel>
    </div>
  );
}
