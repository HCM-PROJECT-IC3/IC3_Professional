/* Cầu nối Thành phố thông minh + Nhiệm vụ đời sống → React. Luật thuần ở js/techrealm/smart-city-core.js và
   life-missions-core.js. Chỉ nạp trong gói lười của khu này. Mọi dữ liệu ở localStorage — 0 lượt mạng. */
import '@legacy/techrealm/smart-city-core.js';
import '@legacy/techrealm/life-missions-core.js';
import { useMemo } from 'react';
import { useLearner } from '../learning/components';
import { useCatalog } from '../learning/learning';

export type BuildingType = 'khu-dan-cu' | 'truong-hoc' | 'benh-vien' | 'cong-vien' | 'nha-may' | 'phong-thi-nghiem' | 'trung-tam-ai' | 'dien-mat-troi' | 'nhiet-dien';
export type IndexKey = 'energy' | 'economy' | 'environment' | 'science' | 'technology' | 'life';
export interface TypeDef { name: string; cost: number; upkeep: number; income: number; energy: number; env: number; sci: number; tech: number; pop: number; priority: number; group?: string }
export interface City { year: number; money: number; tiles: Record<string, BuildingType>; history: { year: number; money: number; net: number; population: number; indices: Record<IndexKey, number> }[]; log: { year: number; text: string }[] }
export interface Sim { indices: Record<IndexKey, number>; why: Record<IndexKey, { label: string; value: number }[]>; supply: number; demand: number; net: number; population: number; powered: Record<string, boolean> }
export interface Evidence { lessons: number; course: Record<string, number>; stars: Record<string, number>; missions: Record<string, number> }
interface CityApi {
  SIZE: number; WATER: string[]; TYPES: Record<BuildingType, TypeDef>;
  newCity(): City; simulate(s: City): Sim; goals(s: City): { id: string; label: string; met: boolean }[];
  apply(s: City, a: Record<string, unknown>, ev: Evidence): { ok: boolean; code?: string; reason?: string; state: City };
  unlockStatus(ev: Evidence, s: City): Record<BuildingType, { unlocked: boolean; label: string; progress: [number, number] | null }>;
  sanitize(raw: unknown): City;
}
export interface Appliance { id: string; name: string; watt: number; min: number; max: number; start: number; note?: string }
interface MissionApi {
  APPLIANCES: Appliance[]; TIERS: { upTo: number; price: number }[]; BUDGET: number;
  usage(h: Record<string, number>): { id: string; name: string; watt: number; hours: number; kwh: number }[];
  bill(kwh: number): { kwh: number; money: number; rows: { tier: number; kwh: number; price: number; money: number }[] };
  electricQuestions(): { id: string; text: string; options: string[]; correct: number }[];
  scoreElectric(h: Record<string, number>, first: Record<string, number>): { budgetOk: boolean; right: number; score: number; bill: { money: number } };
  BINS: Record<string, { name: string; hint: string }>;
  WASTE: { id: string; name: string; bin: string; why: string }[];
  scoreWaste(sorted: Record<string, string>): { rows: { id: string; name: string; put: string | null; bin: string; ok: boolean; why: string }[]; right: number; total: number; score: number; done: boolean };
}
const w = window as unknown as { EduSmartCity: CityApi; EduLifeMissions: MissionApi };
export const SmartCity = w.EduSmartCity;
export const Missions = w.EduLifeMissions;

function lsGet<T>(k: string, fb: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fb; } catch { return fb; } }
function lsSet(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* đầy / bị chặn */ } }

/* ── Kết quả nhiệm vụ đời sống (giữ điểm cao nhất) ── */
const MISSION_KEY = 'tr.missions.v1';
export const missionScores = () => lsGet<Record<string, { score: number; at: number }>>(MISSION_KEY, {});
export function saveMission(id: string, score: number) {
  const all = missionScores();
  const improved = !all[id] || score > all[id].score;
  if (improved) { all[id] = { score, at: Date.now() }; lsSet(MISSION_KEY, all); }
  return improved;
}

/* ── Thành phố trên máy ── */
const CITY_KEY = 'tr.city.v1';
export const loadCity = () => SmartCity.sanitize(lsGet<unknown>(CITY_KEY, null));
export const saveCity = (c: City) => lsSet(CITY_KEY, c);

/** Bằng chứng học tập trên máy: bài đã đạt (lịch sử ở sảnh), sao bí cảnh, điểm nhiệm vụ. */
export function useEvidence(): { evidence: Evidence; ready: boolean } {
  const { progress } = useLearner();
  const catalog = useCatalog();
  return useMemo(() => {
    const passed = (id: string) => (progress.units[id]?.best ?? 0) >= 70 && progress.units[id]?.kind === 'lesson';
    const course: Record<string, number> = {};
    if (catalog.status === 'ready') catalog.data.courses.forEach((c) => { course[c.id] = c.lessons.filter((l) => passed(l.id)).length; });
    const stars: Record<string, number> = {};
    const ch = lsGet<Record<string, Record<string, { stars: number }>>>('tr.challenges.v1', {});
    Object.keys(ch).forEach((cid) => Object.keys(ch[cid]).forEach((lid) => { stars[`${cid}/${lid}`] = ch[cid][lid].stars; }));
    const missions: Record<string, number> = {};
    Object.entries(missionScores()).forEach(([k, v]) => { missions[k] = v.score; });
    return { evidence: { lessons: Object.keys(progress.units).filter(passed).length, course, stars, missions }, ready: catalog.status !== 'loading' };
  }, [progress, catalog]);
}
