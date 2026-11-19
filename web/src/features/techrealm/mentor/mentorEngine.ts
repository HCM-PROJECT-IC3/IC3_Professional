/* Cầu nối AI Sư Phụ → React. Dùng LẠI toàn bộ Trợ lý AI có sẵn (không viết client AI mới):
     backend-config (URL Apps Script) → apps-script-client → ai-core → ai-assistant → mentor-core → ai-service
   nên giữ nguyên: bản đệm trên máy, key cá nhân (BYOK), key của trường qua Apps Script (key không bao giờ tới
   trình duyệt), trần lượt mỗi máy / mỗi ngày. Chỉ nạp trong gói lười của trang AI Sư Phụ. */
import '@legacy/backend-config.js';
import '@legacy/services/apps-script-client.js';
import '@legacy/services/ai-core.js';
import '@legacy/services/ai-assistant.js';
import '@legacy/techrealm/mentor-core.js';
import '@legacy/services/ai-service.js';

export type MentorTask = 'mentorConcept' | 'mentorHint' | 'codeHelp' | 'rubricReview';
export interface AskResult { text: string; via: 'cache' | 'mine' | 'school' | 'school-cache' }
export interface RubricResult { rows: { name: string; max: number; score: number; comment: string }[]; total: number; max: number; overall: string }
interface MentorApi {
  LANGS: Record<string, string>;
  scrubPII(s: string): { text: string; removed: number };
  modeOf(inProgress: unknown, now: number): 'learn' | 'test';
  policy(mode: 'learn' | 'test', task: string): { allowed: boolean; reason?: string };
  parseRubric(text: string, criteria: { name: string; max: number }[]): RubricResult | null;
  suggestNext(input: unknown): { kind: string; title: string; why: string; href?: string }[];
}
interface AiApi {
  ask(task: string, payload: unknown, opts?: { fresh?: boolean }): Promise<AskResult>;
  testKey(key: string, model: string): Promise<true>; // ném lỗi nếu key không dùng được
  config(): { key: string; model: string };
}
interface AiCoreApi { MODELS: { id: string; name: string }[]; DEFAULT_MODEL: string }
interface AppsScriptApi { call(action: string, body: unknown, opts?: { auth?: boolean; timeoutMs?: number }): Promise<unknown> }
const w = window as unknown as { EduMentor: MentorApi; EduAI: AiApi; EduAICore: AiCoreApi; EduAppsScript?: AppsScriptApi };
export const Mentor = w.EduMentor;
export const AI = w.EduAI;
export const AICore = w.EduAICore;

/** Chế độ hiện tại trên máy: đang làm bài Kiểm tra ở sảnh (bản tự lưu chưa nộp) → 'test'. */
export function currentMode(): 'learn' | 'test' {
  try { return Mentor.modeOf(JSON.parse(localStorage.getItem('eduquiz_inprogress_v1') || 'null'), Date.now()); } catch { return 'learn'; }
}

/* ── Nhật ký trên máy: chỉ việc, thời điểm, kết quả — KHÔNG lưu nội dung hỏi/đáp ── */
const LOG_KEY = 'tr.mentor.log';
export interface LogRow { at: number; task: string; ok: boolean; via?: string; error?: string }
export function readLog(): LogRow[] { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') as LogRow[]; } catch { return []; } }
export function addLog(r: LogRow) { try { localStorage.setItem(LOG_KEY, JSON.stringify([r, ...readLog()].slice(0, 30))); } catch { /* đầy */ } }

/** Mã máy ẩn danh (cùng khoá ai-service dùng) — để máy chủ đếm lượt, không gắn với tên học sinh. */
function cid() {
  let v = '';
  try { v = localStorage.getItem('eduquiz_ai_cid') || ''; } catch { /* ignore */ }
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(v)) {
    v = 'm' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    try { localStorage.setItem('eduquiz_ai_cid', v); } catch { /* ignore */ }
  }
  return v;
}
/** Báo câu trả lời có vấn đề → Apps Script aiReport (nhật ký NhatKyAI, 10 lần/ngày/máy). */
export async function report(task: string, reason: 'sai-kien-thuc' | 'lo-dap-an' | 'khong-phu-hop' | 'khac', note: string) {
  if (!w.EduAppsScript) throw new Error('Chưa nối máy chủ trường.');
  await w.EduAppsScript.call('aiReport', { task, reason, note: Mentor.scrubPII(note).text.slice(0, 300), cid: cid() }, { auth: false, timeoutMs: 30000 });
}

/** Key cá nhân (BYOK) — cùng khoá localStorage với hộp "Cài đặt AI" của trang cũ. */
export function saveOwnKey(key: string, model: string) { try { localStorage.setItem('eduquiz_ai_v1', JSON.stringify({ key, model })); } catch { /* bị chặn */ } }
export function clearOwnKey() { try { localStorage.removeItem('eduquiz_ai_v1'); } catch { /* ignore */ } }

export function errorMessage(e: unknown): string {
  const k = (e as { kind?: string }).kind;
  if (k === 'safety') return 'AI từ chối nội dung này. Em hỏi lại theo nội dung bài học nhé.';
  if (k === 'login') return 'Việc này cần key của trường khi thầy cô đã đăng nhập, hoặc key cá nhân (mục Cài đặt).';
  if (k === 'limit') return 'Đã hết lượt AI hôm nay trên máy này. Mai thử lại nhé.';
  return (e as Error).message || 'AI Sư Phụ đang bận, thử lại sau.';
}
