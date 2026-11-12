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

/* ── Điều phối (js/coordinator/data-loader.js) ── */
export interface Course {
  id: string;
  name: string;
}
export interface ClassRow {
  id: string;
  name: string;
  courseId?: string;
  teacherId?: string;
  school?: string;
}
export interface TeacherRow {
  id: string;
  name?: string;
  email?: string;
}
export interface CoordinatorRoster {
  courses: Course[];
  classes: ClassRow[];
  students: RosterStudent[];
  teachers: TeacherRow[];
}
export interface CoordinatorData extends CoordinatorRoster {
  results: QuizResult[];
  schools: string[];
  noSchoolsAssigned: boolean;
}
export interface CoordinatorFilters {
  courseId?: string;
  teacherId?: string;
  classId?: string;
  examName?: string;
  rangeDays?: '' | '7' | '30' | '90';
}
export interface CoordinatorScoped extends TeacherScoped {
  allowedClasses: ClassRow[];
}
export interface EduCoordinatorDataApi {
  scopeOf(profile: StaffProfile): { isAdmin: boolean; schools: string[]; scopeKey: string } | null;
  loadRoster(profile: StaffProfile, opts?: { forceRefresh?: boolean }): Promise<CoordinatorRoster>;
  loadResults(profile: StaffProfile, opts?: { forceRefresh?: boolean }): Promise<QuizResult[]>;
  applyFilters(data: CoordinatorData, filters: CoordinatorFilters): CoordinatorScoped;
}

export interface SchoolComparisonRow {
  schoolId: string;
  school: string;
  rosterSize: number;
  active: number;
  participation: number | null;
  submissions: number;
  avg: number | null;
  passRate: number | null;
}

export interface EduAnalyticsApi {
  schoolComparison(results: QuizResult[], students: RosterStudent[], threshold?: number): SchoolComparisonRow[];
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

/* ── Bản đệm trên máy (js/services/data-cache-service.js, IndexedDB) ── */
export interface EduDataCacheApi {
  /** persist=true: bản lưu bền (qua nhiều phiên); allowStale=true: lấy cả bản đã quá hạn. */
  getAsync<T = unknown>(key: string, persist?: boolean, allowStale?: boolean): Promise<T | null>;
}

/** Firestore Timestamp sau khi lưu vào IndexedDB còn dạng { seconds, nanoseconds }. */
export interface TsLike {
  seconds: number;
  nanoseconds?: number;
}

/** 1 doc users/{uid} như admin-users.js lưu trong bản đệm. */
export interface UserDoc {
  name?: string;
  email?: string;
  role?: Role | string;
  approved?: boolean;
  requestedRole?: string;
  schools?: string[];
  teacherCode?: string;
  createdAt?: TsLike | null;
  updatedAt?: TsLike | null;
}

declare global {
  interface Window {
    EduDataCache?: EduDataCacheApi;
    EduAuth?: EduAuthApi;
    EduTeacherData?: EduTeacherDataApi;
    EduCoordinatorData?: EduCoordinatorDataApi;
    EduAnalytics?: EduAnalyticsApi;
    EduFirebase?: EduFirebaseApi;
    EduModels?: { Roster?: { studentKeyOf(s: { name: string; className?: string }): string } };
  }
}

export function need<T>(v: T | undefined, name: string): T {
  if (!v) throw new Error(`Thiếu ${name} — file js/ cũ chưa nạp`);
  return v;
}
