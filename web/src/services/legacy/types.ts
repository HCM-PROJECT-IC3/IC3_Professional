/* Kiểu cho các API cũ (js/*) mà cổng nhân sự dùng. Chỉ mô tả phần app 2.0 gọi tới. */
import type { Role } from '@/domain/legacy';

export interface FirebaseUserLite {
  uid: string;
  email: string | null;
}

export interface StaffProfile {
  uid: string;
  role: Role;
  name?: string;
  email?: string;
  approved?: boolean;
  schools?: string[];
}

export interface EduAuthApi {
  onAuthReady(cb: (user: FirebaseUserLite | null, profile: StaffProfile | null) => void): void;
  logoutUser(): Promise<void>;
  ROLE_LABEL: Record<string, string>;
}

export interface RosterStudent {
  id?: string;
  name: string;
  className?: string;
  school?: string;
  mssv?: string;
}

export interface QuizResult {
  id?: string;
  studentName?: string;
  studentClass?: string;
  studentSchool?: string;
  testName?: string;
  score?: number;
  submittedAtMs?: number | null;
  timeSpent?: number;
}

export interface ExamHistory {
  studentKey: string;
  studentName: string;
  studentClass: string;
  attemptsCount: number;
  avgScore: number | null;
  bestScore: number | null;
  latestScore: number | null;
  latestSubmittedAtMs: number | null;
}

export interface TeacherData {
  schools: string[];
  students: RosterStudent[];
  results: QuizResult[];
  noSchoolsAssigned: boolean;
}

export interface TeacherFilters {
  school?: string;
  classId?: string;
  examName?: string;
  rangeDays?: '' | '7' | '30' | '90';
}

export interface TeacherScoped {
  filteredResults: QuizResult[];
  filteredStudents: RosterStudent[];
  examHistories: ExamHistory[];
}

export interface EduTeacherDataApi {
  loadAll(profile: StaffProfile, opts?: { forceRefresh?: boolean }): Promise<TeacherData>;
  applyFilters(data: TeacherData, filters: TeacherFilters): TeacherScoped;
}

export interface EduAnalyticsApi {
  avgScore(results: QuizResult[]): number | null;
  passRate(results: QuizResult[], threshold?: number): number | null;
  topStudents(h: ExamHistory[], topN?: number, minScore?: number): ExamHistory[];
  studentsNeedingSupport(h: ExamHistory[], threshold?: number): ExamHistory[];
  compareNatural(a: string, b: string): number;
}

export interface EduFirebaseApi {
  QUOTA_HINT?: string;
  isQuotaOrOffline?(err: unknown): boolean;
}

declare global {
  interface Window {
    EduAuth?: EduAuthApi;
    EduTeacherData?: EduTeacherDataApi;
    EduAnalytics?: EduAnalyticsApi;
    EduFirebase?: EduFirebaseApi;
    EduModels?: { Roster?: { studentKeyOf(s: { name: string; className?: string }): string } };
  }
}

export function need<T>(v: T | undefined, name: string): T {
  if (!v) throw new Error(`Thiếu ${name} — file js/ cũ chưa nạp`);
  return v;
}
