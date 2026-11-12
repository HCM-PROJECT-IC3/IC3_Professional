/* ============================================================
   Cầu nối Domain cũ → React.

   Các file js/core/*.js là IIFE thuần, tự gắn API vào window
   (window.EduRBAC, window.EduGrading). Ta CHỈ import dạng side-effect
   để Vite gói chúng vào bundle — KHÔNG sửa file gốc, KHÔNG viết lại
   logic. Một nguồn sự thật duy nhất cho phân quyền và luật chấm,
   dùng chung giữa giao diện cũ, giao diện React và Apps Script.
   ============================================================ */
import '@legacy/core/rbac.js';
import '@legacy/core/grading.js';
// Học sinh (local-first, 0 mạng). Nạp 2 file này KHÔNG ghi gì: chỉ đăng ký hàm
// (+ 1 listener "storage" của gamification). App 2.0 CHỈ gọi hàm ĐỌC bên dưới —
// ghi XP/sổ tay vẫn là việc của trang làm bài cũ (quiz-engine.js, arena).
import '@legacy/services/wrongbook-store.js';
import '@legacy/gamification.js';

export type Role =
  | 'admin'
  | 'coordinator'
  | 'school_admin'
  | 'teaching_coordinator'
  | 'teacher'
  | 'student';

export interface EduRBACApi {
  ROLES: Readonly<Record<string, Role>>;
  PERMISSIONS: Record<string, Role[]>;
  can(role: Role | string | null | undefined, permission: string): boolean;
  permissionsOf(role: Role | string): string[];
}

export type QuestionStatus = 'correct' | 'incorrect' | 'skipped';

export interface EduGradingApi {
  questionStatus(question: unknown, answer: unknown): QuestionStatus;
  correctAnswerOf(question: unknown): unknown;
}

/** 1 câu trong Sổ tay câu sai (js/services/wrongbook-store.js) — hộp Leitner 1→4. */
export interface WrongbookItem {
  /** Bản gọn của câu hỏi (wrongbook-store.js § slim) — question là HTML: CHỈ hiện chữ thuần, không innerHTML. */
  q?: { question?: string; type?: string };
  /** Nguồn: "Cấp độ › Bài" lúc làm sai. */
  src?: string;
  box: number;
  due: number;
  added?: number;
  right?: number;
  wrong?: number;
  topic?: string;
}
export interface StudentBook {
  name?: string;
  cls?: string;
  school?: string;
  items: Record<string, WrongbookItem>;
  mastered: number;
  updated?: number;
}
export interface EduWrongbookApi {
  BOOK_KEY: string;
  keyOf(name?: string, cls?: string, school?: string): string;
  book(): Record<string, StudentBook>;
  studentBook(key: string): StudentBook;
}

/** Trạng thái XP của MÁY (js/gamification.js, key "eduquiz_gamestate") — không tách theo học sinh. */
export interface GameState {
  xp: number;
  totalQuizzes: number;
  perfectScores: number;
  streak: number;
  lastPlayedDate: string | null;
  badges: string[];
  totalGameSessions: number;
  dailyQuestsDone: number;
}
export interface EduGamificationReadApi {
  getState(): GameState;
  levelForXp(xp: number): number;
  xpToNextLevel(xp: number): number | null;
  BADGE_DEFS: { id: string; label: string }[];
}

declare global {
  interface Window {
    EduRBAC?: EduRBACApi;
    EduGrading?: EduGradingApi;
    EduWrongbook?: EduWrongbookApi;
    EduGamification?: EduGamificationReadApi;
  }
}

function required<T>(value: T | undefined, name: string): T {
  if (!value) throw new Error(`Domain cũ chưa nạp: ${name}`);
  return value;
}

export const rbac = required(window.EduRBAC, 'EduRBAC');
export const grading = required(window.EduGrading, 'EduGrading');
export const wrongbook = required(window.EduWrongbook, 'EduWrongbook');
export const gamification = required(window.EduGamification, 'EduGamification');
