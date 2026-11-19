/* Module Learning (Tàng Kinh Các + Luyện Công Đường) — tầng dữ liệu phía trình duyệt.
   • Luật: js/techrealm/learning-core.js (cùng file Apps Script dùng) — import dạng side-effect.
   • Nội dung: data/techrealm/courses.json (file tĩnh, sinh từ data/ic3 bởi scripts/build-techrealm-courses.mjs).
   • Tiến độ: eduquiz_records của học sinh đang chọn trên máy (sảnh cũ ghi) — CHỈ ĐỌC.
   • Cấu hình lớp: trong link (?lop=…), lưu localStorage. 0 lượt Firebase, 0 lượt Apps Script. */
import '@legacy/techrealm/learning-core.js';
import { useCallback, useEffect, useState } from 'react';
import { legacyUrl } from '@/lib/utils';
import type { ExamRecord } from '@/features/student/progress';

export interface LessonSrc { ct: string; cap: string; bai: string }
export interface Link { title: string; url: string; kind?: string }
export interface Lesson { id: string; n: number; title: string; src: LessonSrc; questions: number; docs: Link[]; videos: Link[]; practice: { title: string; page: string }[]; requires: string[] }
export interface Gate { id: string; title: string; src: LessonSrc; questions: number; requires: string[] }
export interface Review { id: string; title: string; src: LessonSrc; questions: number }
export interface Course {
  id: string; domain: string; name: string; plain: string; level: string; description: string;
  source: { ct: string; cap: string } | null; lessons: Lesson[]; gates: Gate[]; reviews: Review[];
}
export interface Domain { id: string; name: string; plain: string; courseIds: string[] }
export interface Catalog { version: string; domains: Domain[]; courses: Course[] }

export interface CourseCfg { mode: 'sequential' | 'free'; minScore: number; locked: string[]; unlocked: string[]; gateAfter: Record<string, string>; extra: Record<string, { videos: Link[]; docs: Link[] }> }
export interface ClassCfg { v: 1; className: string; issuedAt: number; courses: Record<string, CourseCfg> }
export interface UnitProgress { kind: 'lesson' | 'gate' | 'review'; best: number; attempts: number; lastAt: number; bestTest: number | null; timeSec: number }
export interface Progress { units: Record<string, UnitProgress> }
export type NodeState = { state: 'done' | 'available' | 'locked'; reason?: 'teacher' | 'requires'; missing?: string[]; best?: number | null };
export interface CourseStatus {
  states: Record<string, NodeState>; lessonsDone: number; gatesDone: number; total: number; pct: number; complete: boolean;
  conditions: { id: string; label: string; current: number; target: number; met: boolean }[]; next: Lesson | Gate | null;
}
interface LearningApi {
  PASS: number; DEFAULT_COURSE_CFG: CourseCfg;
  unitIdOf(catId?: string, levelId?: string, mtKey?: string): { kind: UnitProgress['kind']; id: string } | null;
  sanitizeClassConfig(raw: unknown): ClassCfg;
  courseCfg(cfg: ClassCfg | null, courseId: string): CourseCfg;
  progressOf(records: ExamRecord[]): Progress;
  nodeStates(course: Course, p: Progress, cfg: ClassCfg | null): Record<string, NodeState>;
  courseStatus(course: Course, p: Progress, cfg: ClassCfg | null): CourseStatus;
  expPreview(course: Course, cultivationConfig: unknown): { perLesson: number; perGate: number; total: number };
}
export const Learning = (window as unknown as { EduLearning: LearningApi }).EduLearning;

/* ── Nạp courses.json (1 lần mỗi phiên trang; service worker lưu đệm cho lần sau / offline) ── */
let cache: Promise<Catalog> | null = null;
function loadCatalog(): Promise<Catalog> {
  if (!cache) {
    cache = fetch(legacyUrl('data/techrealm/courses.json')).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json() as Promise<Catalog>;
    });
    cache.catch(() => { cache = null; }); // lỗi mạng → lần sau thử lại
  }
  return cache;
}
export type Loaded<T> = { status: 'loading' } | { status: 'error'; retry: () => void } | { status: 'ready'; data: T };
export function useCatalog(): Loaded<Catalog> {
  const [state, setState] = useState<Loaded<Catalog>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setState({ status: 'loading' }); setAttempt((a) => a + 1); }, []);
  useEffect(() => {
    let alive = true;
    loadCatalog().then((data) => alive && setState({ status: 'ready', data }), () => alive && setState({ status: 'error', retry }));
    return () => { alive = false; };
  }, [attempt, retry]);
  return state;
}

/* ── Cấu hình lớp: mã hoá trong link (như đề tự soạn ?de= — js/custom-exam-codec.js: "2z" deflate / "2j" JSON) ── */
const CFG_KEY = 'tr.classConfig';
const DRAFT_KEY = 'tr.teacherDraft';
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const buf = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(buf);
}
export async function encodeClassCfg(cfg: ClassCfg): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(Learning.sanitizeClassConfig(cfg)));
  if (typeof CompressionStream === 'function') {
    try { return '2z' + b64url(await pipe(json, new CompressionStream('deflate'))); } catch { /* rơi xuống dạng không nén */ }
  }
  return '2j' + b64url(json);
}
/** Mã từ link (không tin được) → cấu hình đã làm sạch; null nếu hỏng. */
export async function decodeClassCfg(code: string): Promise<ClassCfg | null> {
  try {
    if (code.length > 20000) return null;
    const bytes = fromB64url(code.slice(2));
    const raw = code.startsWith('2z') ? await pipe(bytes, new DecompressionStream('deflate')) : code.startsWith('2j') ? bytes : null;
    return raw ? Learning.sanitizeClassConfig(JSON.parse(new TextDecoder().decode(raw))) : null;
  } catch {
    return null;
  }
}
function lsGet<T>(k: string): T | null {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function lsSet(k: string, v: unknown) {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* bị chặn: chỉ giữ trong phiên */ }
}
export const getClassCfg = () => { const c = lsGet<unknown>(CFG_KEY); return c ? Learning.sanitizeClassConfig(c) : null; };
export const setClassCfg = (c: ClassCfg | null) => lsSet(CFG_KEY, c);
export const getDraft = () => { const c = lsGet<unknown>(DRAFT_KEY); return c ? Learning.sanitizeClassConfig(c) : null; };
export const setDraft = (c: ClassCfg) => lsSet(DRAFT_KEY, c);

/** Link lớp học cho học sinh (đường dẫn tuyệt đối tới app 2.0 hiện tại). */
export function classLink(code: string) {
  return `${location.origin}${location.pathname}#/the-gioi/tang-kinh-cac?lop=${code}`;
}

/** Làm bài ở sảnh cũ — giữ nguyên chọn trường/lớp/học sinh, chế độ, đếm giờ, chấm điểm, lịch sử, offline. */
export const quizHref = (s: LessonSrc) => legacyUrl(`index.html?ct=${encodeURIComponent(s.ct)}&cap=${encodeURIComponent(s.cap)}&bai=${encodeURIComponent(s.bai)}`);
