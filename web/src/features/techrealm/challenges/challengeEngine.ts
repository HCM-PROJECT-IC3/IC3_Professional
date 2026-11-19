/* Cầu nối khung bí cảnh → React. CÙNG mã với apps/Code.gs (máy chủ chạy lại nhật ký để chấm), nên điểm người chơi
   thấy = điểm máy chủ sẽ tính. Chỉ nạp trong gói lười của trò chơi. */
import '@legacy/techrealm/challenge-core.js';
import '@legacy/techrealm/thanh-pho-mat-dien-core.js';
import { useCallback, useRef, useState } from 'react';

export type Action = { t: number; type: string; [k: string]: unknown };
export interface Question { id: string; text: string; options: string[]; correct: number }
export interface Answer { first: number; tries: number; solved: boolean }
export interface Result { score: number; stars: 0 | 1 | 2 | 3; completed: boolean; parts: { accuracy: number; solving: number; application: number; time: number; attempts: number } }
export interface Eval { completed: boolean; accuracy: number; solving: number; application: number; attempts: number; minAttempts: number }
export interface Replay { ok: boolean; state: unknown; eval: Eval; durationSec: number; result: Result }
interface Level { id: string; title: string; par: number; boss?: boolean; init(r: unknown): unknown; apply(s: unknown, a: Action): unknown; evaluate(s: unknown): Eval }
interface ChallengeApi {
  rng(seed: number): unknown;
  get(id: string): { id: string; title: string; levels: Level[]; data: Record<string, unknown> } | null;
  levelOf(cid: string, lid: string): Level | null;
  replay(cid: string, lid: string, seed: number, actions: Action[]): Replay;
  clone<T>(o: T): T;
}
export const Challenge = (window as unknown as { EduChallenge: ChallengeApi }).EduChallenge;

/** 1 lượt chơi 1 màn: trạng thái + nhật ký (t = ms từ lúc bắt đầu). Mọi thay đổi đi qua level.apply. */
export function useLevelRun<S>(challengeId: string, levelId: string) {
  const level = Challenge.levelOf(challengeId, levelId)!;
  const make = () => {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    return { seed, state: level.init(Challenge.rng(seed)) as S, log: [] as Action[] };
  };
  const [run, setRun] = useState(make);
  const start = useRef(performance.now());
  const dispatch = useCallback((a: Omit<Action, 't'>) => {
    setRun((r) => {
      if ((r.state as { done?: boolean }).done) return r;
      const act = { ...a, t: Math.round(performance.now() - start.current) } as Action;
      return { ...r, state: level.apply(Challenge.clone(r.state), act) as S, log: r.log.concat(act) };
    });
  }, [level]);
  const restart = useCallback(() => { start.current = performance.now(); setRun(make()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { level, ...run, dispatch, restart };
}

/* ── Tiến độ bí cảnh trên máy (tu vi luyện tập + nhật ký tốt nhất để gửi máy chủ xác thực khi lớp bật công huân) ── */
const KEY = 'tr.challenges.v1';
export interface LevelBest { score: number; stars: number; at: number; seed: number; actions: Action[] }
type Store = Record<string, Record<string, LevelBest>>;
function read(): Store { try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Store; } catch { return {}; } }
export function bestOf(challengeId: string): Record<string, LevelBest> { return read()[challengeId] ?? {}; }
/** Lưu nếu tốt hơn lần trước. Trả { improved, tuVi } — tu vi = phần điểm tăng thêm / 2 (chỉ trên máy). */
export function saveBest(challengeId: string, levelId: string, b: LevelBest) {
  const all = read();
  const cur = (all[challengeId] ??= {})[levelId];
  if (cur && cur.score >= b.score) return { improved: false, tuVi: 0 };
  all[challengeId][levelId] = b;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* đầy / bị chặn */ }
  return { improved: true, tuVi: Math.round((b.score - (cur?.score ?? 0)) / 2) };
}
