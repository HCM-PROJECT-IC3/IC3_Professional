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

/** Khoá localStorage mà dashboard cần nghe để tự làm mới khi tab sảnh cũ ghi bài mới. */
export const WATCH_KEYS = [RECORDS_KEY, wrongbook.BOOK_KEY, GOAL_KEY, 'eduquiz_gamestate'];
