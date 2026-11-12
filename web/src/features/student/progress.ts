/* ============================================================
   Tiến độ học sinh — ĐỌC localStorage của sảnh cũ, 0 lượt mạng.

   Nguồn (do trang làm bài cũ GHI, app 2.0 chỉ ĐỌC — trừ mục tiêu tuần):
     eduquiz_records       lịch sử bài nộp      js/quiz-engine.js § saveRecord
     eduquiz_wrongbook_v1  sổ tay câu sai       js/services/wrongbook-store.js (import thẳng)
     eduquiz_goals_v1      mục tiêu tuần        js/learning-hub.js § GOAL_KEY
     eduquiz_gamestate     XP/cấp/huy hiệu MÁY  js/gamification.js (import thẳng)

   Các hàm thống kê dưới đây CHÉP ĐÚNG công thức của js/learning-hub.js
   (file đó đụng DOM khi nạp nên không import được). Đổi công thức ở
   learning-hub.js thì đổi cả ở đây, rồi đối chiếu lại với
   EduLearningHub.studentSummary() trên cùng dữ liệu (cách làm: web/README.md).
   ============================================================ */
import { wrongbook, type StudentBook, type WrongbookItem } from '@/domain/legacy';

export const PASS = 70; // learning-hub.js § PASS
const RECORDS_KEY = 'eduquiz_records';
const GOAL_KEY = 'eduquiz_goals_v1';
const CHOSEN_KEY = 'ic3v2.student'; // khoá MỚI của app 2.0 (không đụng khoá cũ)

export interface ExamRecord {
  id: number;
  studentName?: string;
  studentClass?: string;
  studentSchool?: string;
  category?: string;
  level?: string;
  minitest?: string;
  isRandomMix?: boolean;
  examMode?: 'practice' | 'test';
  catId?: string;
  levelId?: string;
  mtKey?: string;
  score: number;
  correct?: number;
  total?: number;
  elapsedSec?: number;
}

export interface Student {
  key: string;
  name: string;
  cls: string;
  school: string;
  last: number;
}

function lsGet<T>(k: string, fb: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fb;
  } catch {
    return fb;
  }
}

export function readRecords(): ExamRecord[] {
  const r = lsGet<unknown>(RECORDS_KEY, []);
  return Array.isArray(r) ? (r as ExamRecord[]) : [];
}

/** id = Date.now()*1000 + ngẫu nhiên (bản mới) hoặc Date.now() (bản cũ). */
export function recTime(r: Pick<ExamRecord, 'id'>): number {
  const id = Number(r.id) || 0;
  return id > 1e14 ? Math.floor(id / 1000) : id;
}

export const keyOf = (name?: string, cls?: string, school?: string) => wrongbook.keyOf(name, cls, school);

/** Mọi học sinh từng làm bài / có sổ tay trên máy này, mới nhất trước (learning-hub.js § knownStudents). */
export function knownStudents(): Student[] {
  const map = new Map<string, Student>();
  readRecords().forEach((r) => {
    if (!r.studentName) return;
    const k = keyOf(r.studentName, r.studentClass, r.studentSchool);
    const t = recTime(r);
    const cur = map.get(k);
    if (!cur) map.set(k, { key: k, name: r.studentName, cls: r.studentClass || '', school: r.studentSchool || '', last: t });
    else if (t > cur.last) cur.last = t;
  });
  Object.entries(wrongbook.book()).forEach(([k, v]) => {
    if (!map.has(k) && v?.name) map.set(k, { key: k, name: v.name, cls: v.cls || '', school: v.school || '', last: v.updated || 0 });
  });
  return [...map.values()].sort((a, b) => b.last - a.last);
}

export function studentRecords(key: string): ExamRecord[] {
  return readRecords()
    .filter((r) => keyOf(r.studentName, r.studentClass, r.studentSchool) === key)
    .sort((a, b) => recTime(a) - recTime(b));
}

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Chuỗi ngày học liên tiếp — hôm nay chưa học vẫn giữ chuỗi tới hôm qua (learning-hub.js § streakOf). */
export function streakOf(recs: ExamRecord[]) {
  const days = new Set(recs.map((r) => dayKey(recTime(r))));
  let n = 0;
  const d = new Date();
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d.getTime()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return { streak: n, days: days.size };
}

export function studentBook(key: string): StudentBook {
  return wrongbook.studentBook(key);
}

export function dueItems(sb: StudentBook, now = Date.now()): [string, WrongbookItem][] {
  return Object.entries(sb.items || {})
    .filter(([, it]) => it.due <= now)
    .sort(([, a], [, b]) => a.box - b.box || a.due - b.due);
}

export interface TopicStat {
  label: string;
  level: string;
  avg: number;
  last: number;
  best: number;
  trend: number;
  attempts: number;
}

/** Mức nắm vững từng bài: TB 3 lần gần nhất, yếu nhất trước (learning-hub.js § topicStats). */
export function topicStats(recs: ExamRecord[]): TopicStat[] {
  const groups = new Map<string, { label: string; level: string; scores: number[] }>();
  recs.forEach((r) => {
    const isMix = r.isRandomMix || /^Tổng hợp/.test(r.minitest || '');
    const label = isMix ? 'Tổng hợp (ngẫu nhiên)' : r.minitest || 'Bài làm';
    const k = `${r.level}|${label}`;
    if (!groups.has(k)) groups.set(k, { label, level: r.level || r.category || '', scores: [] });
    groups.get(k)!.scores.push(Number(r.score) || 0);
  });
  return [...groups.values()]
    .map((g) => {
      const recent = g.scores.slice(-3);
      const avg = Math.round(recent.reduce((s, x) => s + x, 0) / recent.length);
      const last = g.scores[g.scores.length - 1];
      const prev = g.scores.length > 1 ? g.scores[g.scores.length - 2] : null;
      return {
        label: g.label,
        level: g.level,
        avg,
        last,
        best: Math.max(...g.scores),
        trend: prev === null ? 0 : Math.sign(last - prev),
        attempts: g.scores.length,
      };
    })
    .sort((a, b) => a.avg - b.avg);
}

/** Thứ 2 đầu tuần, 0h (learning-hub.js § weekStart). */
export function weekStart(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function weekDone(recs: ExamRecord[]) {
  const ws = weekStart();
  return recs.filter((r) => recTime(r) >= ws).length;
}

export const GOAL_CHOICES = [3, 5, 7, 10];

export function goalOf(key: string): number {
  return lsGet<Record<string, { perWeek?: number }>>(GOAL_KEY, {})[key]?.perWeek || 0;
}

/** Ghi CÙNG định dạng với learning-hub.js § setGoal → sảnh cũ thấy ngay mục tiêu mới. */
export function setGoal(key: string, n: number) {
  const g = lsGet<Record<string, { perWeek: number }>>(GOAL_KEY, {});
  g[key] = { perWeek: n };
  try {
    localStorage.setItem(GOAL_KEY, JSON.stringify(g));
  } catch {
    /* đầy bộ nhớ / bị chặn: bỏ qua, không làm hỏng trang */
  }
}

export function getChosenStudent(): string | null {
  try {
    return localStorage.getItem(CHOSEN_KEY);
  } catch {
    return null;
  }
}

export function setChosenStudent(key: string) {
  try {
    localStorage.setItem(CHOSEN_KEY, key);
  } catch {
    /* bỏ qua */
  }
}

/* ── Lộ trình học (learning-hub.js § resolveIds, pathNames, mastery, pathLevels, buildPath) ── */

export interface MetaLevel {
  id: string;
  name: string;
  minitests: Record<string, { count: number }>;
}
export interface MetaCategory {
  id: string;
  name: string;
  levels: MetaLevel[];
}

const BAI_RE = /^Bài \d+[.:]/;
const LESSON_RE = /^(Tiết \d+$|Ôn tập\s|Luyện thi\s|Kiểm tra\s)/; // bộ theo tiết ôn/kiểm tra — không phải 1 bài

/** Tra id Chương trình/Cấp độ cho bản ghi cũ (chỉ lưu tên hiển thị). */
export function resolveIds(r: ExamRecord, cats: MetaCategory[]) {
  if (r.catId && r.levelId) return { catId: r.catId, levelId: r.levelId, mtKey: r.mtKey || '' };
  const cat = cats.find((c) => c.name === r.category);
  const lv = cat?.levels?.find((l) => l.name === r.level);
  const mtKey = lv && lv.minitests && Object.prototype.hasOwnProperty.call(lv.minitests, r.minitest || '') ? r.minitest || '' : '';
  return { catId: cat?.id || '', levelId: lv?.id || '', mtKey };
}

/** Các bài của lộ trình: bộ "Bài N" theo số bài; cấp chưa có bộ này → các chủ đề. */
export function pathNames(lv: MetaLevel): string[] {
  const names = Object.keys(lv.minitests || {});
  const bai = names.filter((n) => BAI_RE.test(n));
  if (bai.length) return bai.sort((a, b) => (parseInt(a.match(/\d+/)![0], 10) || 0) - (parseInt(b.match(/\d+/)![0], 10) || 0));
  return names.filter((n) => !LESSON_RE.test(n));
}

export type MasteryState = 'new' | 'bad' | 'warn' | 'good' | 'great';
export const STEP_LABEL: Record<MasteryState, string> = { new: 'Chưa làm', bad: 'Yếu', warn: 'Cần ôn', good: 'Đạt', great: 'Vững' };

/** Mức nắm vững 1 bài: TB 3 lần gần nhất. */
export function mastery(scores: number[]): { state: MasteryState; avg: number | null; attempts: number; best: number } {
  if (!scores.length) return { state: 'new', avg: null, attempts: 0, best: 0 };
  const recent = scores.slice(-3);
  const avg = Math.round(recent.reduce((s, x) => s + x, 0) / recent.length);
  const state: MasteryState = avg >= 90 && scores.length >= 2 ? 'great' : avg >= PASS ? 'good' : avg >= 50 ? 'warn' : 'bad';
  return { state, avg, attempts: scores.length, best: Math.max(...scores) };
}

function levelInfo(cats: MetaCategory[], catId: string, levelId: string) {
  const cat = cats.find((c) => c.id === catId);
  const lv = cat?.levels?.find((l) => l.id === levelId);
  return cat && lv ? { cat, lv } : null;
}

export interface PathLevel {
  catId: string;
  levelId: string;
  name: string;
}

/** Cấp độ em từng làm (mới nhất trước); chưa làm bài nào → mọi cấp có lộ trình (app 2.0 không có ô chọn ở sảnh). */
export function pathLevels(recs: ExamRecord[], cats: MetaCategory[]): PathLevel[] {
  const out: PathLevel[] = [];
  const add = (catId: string, levelId: string) => {
    if (!catId || !levelId || out.some((x) => x.catId === catId && x.levelId === levelId)) return;
    const info = levelInfo(cats, catId, levelId);
    if (info && pathNames(info.lv).length) out.push({ catId, levelId, name: info.lv.name || `${info.cat.name} ${levelId}` });
  };
  recs.slice().reverse().forEach((r) => {
    const ids = resolveIds(r, cats);
    add(ids.catId, ids.levelId);
  });
  cats.forEach((c) => c.levels.forEach((l) => add(c.id, l.id)));
  return out;
}

export interface PathStep {
  name: string;
  i: number;
  state: MasteryState;
  avg: number | null;
  attempts: number;
  best: number;
}

export function buildPath(recs: ExamRecord[], cats: MetaCategory[], catId: string, levelId: string) {
  const info = levelInfo(cats, catId, levelId);
  if (!info) return null;
  const byName = new Map<string, number[]>();
  recs.forEach((r) => {
    const ids = resolveIds(r, cats);
    if (ids.catId !== catId || ids.levelId !== levelId || !ids.mtKey) return;
    if (!byName.has(ids.mtKey)) byName.set(ids.mtKey, []);
    byName.get(ids.mtKey)!.push(Number(r.score) || 0);
  });
  const steps: PathStep[] = pathNames(info.lv).map((name, i) => ({ name, i, ...mastery(byName.get(name) || []) }));
  // Ưu tiên: bài đã làm nhưng còn yếu nhất → bài chưa làm kế tiếp theo mạch → bài "Đạt" thấp nhất để lên "Vững".
  const weak = steps.filter((s) => s.state === 'bad' || s.state === 'warn').sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0))[0];
  const fresh = steps.find((s) => s.state === 'new');
  const polish = steps.filter((s) => s.state === 'good').sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0))[0];
  const next = weak || fresh || polish || null;
  const passed = steps.filter((s) => s.state === 'good' || s.state === 'great').length;
  const done = steps.filter((s) => s.attempts).map((s) => s.avg ?? 0);
  return {
    catId,
    levelId,
    levelName: info.lv.name,
    steps,
    next,
    reason: !next
      ? ''
      : next === weak
        ? `Điểm TB gần đây ${next.avg}% — chưa đạt ${PASS}%, củng cố trước khi học tiếp.`
        : next === fresh
          ? passed
            ? 'Bài kế tiếp trong chương trình mà em chưa làm.'
            : 'Bắt đầu lộ trình từ bài đầu tiên.'
          : `Đã đạt (${next.avg}%) — làm lại để lên mức Vững (≥ 90%, ít nhất 2 lần).`,
    passed,
    great: steps.filter((s) => s.state === 'great').length,
    avg: done.length ? Math.round(done.reduce((s, x) => s + x, 0) / done.length) : null,
    complete: steps.length > 0 && passed === steps.length,
  };
}

/** Khoá localStorage mà dashboard cần nghe để tự làm mới khi tab sảnh cũ ghi bài mới. */
export const WATCH_KEYS = [RECORDS_KEY, wrongbook.BOOK_KEY, GOAL_KEY, 'eduquiz_gamestate'];
