import { useState, type FormEvent } from 'react';
import { FileUp, FolderKanban, Hammer, MessageSquareText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBlock } from '../demo/DemoState';
import { PROJECTS, SUBMISSIONS, SUBMISSION_STATUS, type Project } from '../demo/data';
import { MY_REALM } from '../demo/engineDemo';
import { realmOf } from '../model';
import { DataBlock, Tabs } from '../ui/controls';
import { Modal } from '../ui/overlay';
import { LockNote, Panel, TrPageHeader } from '../ui/primitives';

/* Bách Công Phường: dự án → nộp sản phẩm → thầy cô chấm theo tiêu chí → portfolio.
   Bản xem thử KHÔNG tải tệp lên đâu cả; bản thật gửi qua Apps Script vào Google Drive (ARCHITECTURE.md §5.3). */

const MAX_MB = 5;
type Tab = 'du-an' | 'bai-nop' | 'portfolio';

function SubmitDialog({ project, onClose, onDone }: { project: Project | null; onClose: () => void; onDone: (file: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return setError('Chọn tệp sản phẩm trước khi nộp.');
    if (file.size > MAX_MB * 1024 * 1024) return setError(`Tệp lớn hơn ${MAX_MB} MB. Hãy nén hoặc xuất PDF nhẹ hơn.`);
    onDone(file.name);
    setFile(null);
    setError(null);
  };
  return (
    <Modal
      open={!!project}
      onClose={onClose}
      title={project ? `Nộp: ${project.name}` : ''}
      description={project ? `Định dạng nhận: ${project.format} · tối đa ${MAX_MB} MB` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="tr-submit"><FileUp /> Nộp sản phẩm</Button>
        </>
      }
    >
      <form id="tr-submit" onSubmit={submit} className="space-y-4 text-sm">
        <label className="grid gap-1.5">
          Tệp sản phẩm
          <input
            type="file"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
            aria-invalid={!!error}
            aria-describedby="tr-file-err"
            className="block w-full rounded-md border bg-background text-sm file:mr-3 file:border-0 file:bg-muted file:px-3 file:py-2"
          />
        </label>
        <label className="grid gap-1.5">
          Em làm gì trong sản phẩm này? <span className="text-xs text-muted-foreground">(không bắt buộc, tối đa 1.000 ký tự)</span>
          <textarea maxLength={1000} rows={3} className="rounded-md border bg-background p-2" />
        </label>
        {error && <p id="tr-file-err" role="alert" className="text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">Bản xem thử: tệp không được gửi đi. Sản phẩm chỉ thầy cô của lớp xem được.</p>
      </form>
    </Modal>
  );
}

export function WorkshopPage() {
  const [tab, setTab] = useState<Tab>('du-an');
  const [submitting, setSubmitting] = useState<Project | null>(null);
  const [subs, setSubs] = useState(SUBMISSIONS);
  const projects = useBlock(PROJECTS);
  const mine = useBlock(subs);
  const portfolio = useBlock(subs.filter((s) => s.portfolio));
  const projectOf = (id: string) => PROJECTS.find((p) => p.id === id)!;

  return (
    <div className="space-y-5">
      <TrPageHeader
        title="Bách Công Phường"
        plain="Dự án, sản phẩm"
        description="Làm sản phẩm thật từ kiến thức đã học. Sản phẩm được thầy cô duyệt sẽ cộng công huân và vào portfolio của em."
      />
      <Tabs
        label="Bách Công Phường"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'du-an', label: 'Dự án', count: PROJECTS.length },
          { id: 'bai-nop', label: 'Bài nộp của em', count: subs.length },
          { id: 'portfolio', label: 'Portfolio' },
        ]}
      />

      {tab === 'du-an' && (
        <DataBlock state={projects} empty={{ title: 'Chưa có dự án', description: 'Thầy cô sẽ giao dự án cho lớp ở đây.' }}>
          {(list) => (
            <ul className="grid gap-3 md:grid-cols-2">
              {list.map((p) => {
                const locked = MY_REALM < p.minRealm;
                return (
                  <li key={p.id} className="flex flex-col rounded-xl border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-gold/12 text-gold"><Hammer className="size-5" aria-hidden /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-tight">{p.name}</p>
                        <p className="text-sm text-muted-foreground">{p.plain}</p>
                      </div>
                      <span className="font-mono text-sm text-gold tabular-nums">+{p.reward}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">{p.skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                      <span className="text-xs text-muted-foreground">{p.format}{p.due && ` · hạn ${p.due}`}</span>
                      {locked ? <LockNote>{realmOf(p.minRealm).name}</LockNote> : <Button size="sm" onClick={() => setSubmitting(p)}><FileUp /> Nộp</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DataBlock>
      )}

      {tab === 'bai-nop' && (
        <Panel title="Bài nộp của em" icon={FolderKanban}>
          <DataBlock state={mine} empty={{ title: 'Em chưa nộp sản phẩm nào', action: <Button size="sm" onClick={() => setTab('du-an')}>Xem dự án</Button> }}>
            {(list) => (
              <ul className="divide-y">
                {list.map((s) => {
                  const st = SUBMISSION_STATUS[s.status];
                  return (
                    <li key={s.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{projectOf(s.projectId).name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{s.file} · {s.when}</p>
                        {s.feedback && (
                          <p className="mt-1.5 flex gap-1.5 text-sm"><MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{s.feedback}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {s.score && <span className="font-mono text-sm tabular-nums">{s.score}</span>}
                        {s.status === 'needs-work' && <Button size="sm" variant="outline" onClick={() => setSubmitting(projectOf(s.projectId))}>Nộp lại</Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </DataBlock>
        </Panel>
      )}

      {tab === 'portfolio' && (
        <DataBlock state={portfolio} empty={{ title: 'Portfolio còn trống', description: 'Sản phẩm được duyệt mà em chọn hiển thị sẽ nằm ở đây.' }}>
          {(list) => (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((s) => (
                <li key={s.id} className="overflow-hidden rounded-xl border bg-card">
                  <div className={cn('grid aspect-[4/3] place-items-center bg-muted text-muted-foreground')}>
                    <Hammer className="size-8" aria-hidden />
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium">{projectOf(s.projectId).name}</p>
                    <p className="text-xs text-muted-foreground">Duyệt {s.when} · {s.score}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataBlock>
      )}

      <SubmitDialog
        project={submitting}
        onClose={() => setSubmitting(null)}
        onDone={(file) => {
          const p = submitting!;
          setSubs([{ id: `s${Date.now()}`, projectId: p.id, file, when: 'Vừa xong', status: 'submitted', portfolio: false }, ...subs.filter((s) => s.projectId !== p.id || s.status === 'approved')]);
          setSubmitting(null);
          setTab('bai-nop');
        }}
      />
    </div>
  );
}
