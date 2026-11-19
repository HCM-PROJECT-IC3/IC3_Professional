/* Cầu nối luật tu luyện → React. Hai file js/techrealm/*.js là IIFE thuần, gắn API vào window (giống cách
   src/domain/legacy.ts nạp js/core/*). Đây là CÙNG mã mà scripts/build-apps-script.js chép vào apps/Code.gs,
   nên giao diện và máy chủ luôn tính giống nhau. Ở trình duyệt chỉ dùng để HIỂN THỊ — sổ cái thật do Apps Script ghi. */
import '@legacy/techrealm/cultivation-core.js';
import '@legacy/techrealm/cultivation-service.js';
import type { RealmId } from './model';

export type SourceType = 'LESSON' | 'EXERCISE' | 'TEST' | 'QUEST' | 'PROJECT' | 'TEACHER' | 'ACTIVITY';
export type Actor = { kind: 'system' | 'teacher' | 'admin' | 'learner'; uid?: string };
export interface Condition { id: string; label: string; current: number; target: number; met: boolean }
export interface HistoryEntry {
  txId: string; kind: 'exp' | 'realm' | 'item' | 'achievement'; at: string; by: string;
  type?: SourceType; sourceId?: string; amount?: number; status?: 'confirmed' | 'pending' | 'rejected' | 'reversed';
  realm?: number; itemId?: string; qty?: number; achievementId?: string; note?: string; reverseNote?: string;
}
export interface Profile {
  learnerId: string; exp: number; pendingExp: number;
  realm: { id: RealmId; name: string; plain: string };
  stage: { realm: number; stage: string; index: number; from: number; to: number | null; progress: number; peak: boolean };
  next: { from: number; to: RealmId | null; eligible: boolean; conditions: Condition[] };
  elements: Record<'kim' | 'moc' | 'thuy' | 'hoa' | 'tho', { score: number; samples: number } | null>;
  items: Record<string, number>; achievements: Record<string, string>; activityMinutes: number; history: HistoryEntry[];
}
export type Result = { ok: boolean; duplicate?: boolean; code?: string; reason?: string; to?: RealmId; items?: { itemId: string; qty: number }[] };
export interface CultivationService {
  recordEvent(event: { type: SourceType; learnerId: string; evidence: Record<string, unknown> }, actor: Actor): Result;
  recordAssessment(learnerId: string, attemptId: string, topics: Record<string, number>, actor: Actor): Result;
  breakthrough(learnerId: string, actor: Actor): Result;
  reverse(learnerId: string, txId: string, actor: Actor, note: string): Result;
  profile(learnerId: string): Profile;
}
interface CoreApi {
  DEFAULT_CONFIG: unknown;
  SOURCES: Record<SourceType, { label: string }>;
  DEFAULT_ITEMS: { id: string; name: string; kind: string; rarity: number; desc: string }[];
  DEFAULT_ACHIEVEMENTS: { id: string; name: string }[];
}
interface ServiceApi {
  create(opts: { store: unknown; clock?: () => string; config?: unknown }): CultivationService;
  createMemoryStore(seed?: unknown[]): { rows: unknown[] };
}

const w = window as unknown as { EduCultivation: CoreApi; EduCultivationService: ServiceApi };
export const Cultivation = w.EduCultivation;
export const CultivationServiceApi = w.EduCultivationService;
