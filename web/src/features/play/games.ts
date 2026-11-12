import type { LucideIcon } from 'lucide-react';
import {
  Bird, BookOpenText, Brain, Cpu, FileSpreadsheet, Map as MapIcon, Search, Shield, Swords, Trophy, Users,
} from 'lucide-react';
import { gamification, type GameState } from '@/domain/legacy';

/* Danh mục trò chơi & mô phỏng — TRỎ VỀ TRANG CŨ (đã chạy độc lập, 0 Firebase: đo 12/11/2026).
   gameId = khoá trong eduquiz_gamestate.gameCounts (EduGamification.recordGameSession('<id>', …)). */

export interface GameEntry {
  id: string;
  title: string;
  desc: string;
  page: string;
  icon: LucideIcon;
  gameId?: string;
  skill?: string;
}

export const ARENA: GameEntry[] = [
  { id: 'journey', title: 'Hành trình IC3', desc: '7 vùng theo 7 chủ đề — trận quiz và mini-game, gom sao mở rương.', page: 'arena.html?vai=minigame', icon: MapIcon, skill: 'Một mình' },
  { id: 'solo', title: 'Đấu tự do', desc: 'Chơi bộ câu bất kỳ kiểu game: Tốc độ, Săn vàng, Đua về đích.', page: 'arena.html?vai=solo', icon: Swords, skill: 'Một mình' },
  { id: 'room', title: 'Vào phòng của lớp', desc: 'Nhập mã phòng thầy cô đưa để thi đấu cùng cả lớp.', page: 'arena.html?vai=student', icon: Users, skill: 'Cả lớp' },
];

export const MINIGAMES: GameEntry[] = [
  { id: 'flappy', title: 'Chim Vượt Ải', desc: 'Vỗ cánh né cột qua 5 màn — giữa màn là câu hỏi IC3 làm cổng kiểm tra.', page: 'mario-flappy.html', icon: Bird, gameId: 'mario-flappy', skill: 'Ôn theo chủ đề' },
  { id: 'pz', title: 'Phòng Thủ Dữ Liệu', desc: 'Thủ thành: đặt lá chắn chặn 12 loại tác nhân tấn công (worm, ransomware, phishing…).', page: 'pz-defense.html', icon: Shield, gameId: 'pz-defense', skill: 'An toàn thông tin' },
  { id: 'memory', title: 'Trí Nhớ Thiết Bị', desc: 'Lật thẻ tìm cặp: thiết bị, phần mềm văn phòng, hệ điều hành, trình duyệt, trợ lý AI.', page: 'memory-game.html', icon: Brain, gameId: 'memory-game', skill: 'Phần cứng · phần mềm' },
  { id: 'battle', title: 'Battle Quiz', desc: 'Đấu với máy: trả lời đúng để tấn công, combo càng dài đòn càng mạnh.', page: 'battle-quiz.html', icon: Trophy, gameId: 'battle-quiz', skill: 'Ôn tổng hợp' },
  { id: 'cyber', title: 'Cyber Detective', desc: 'Điều tra sự cố mất an toàn qua 6 hướng, kết luận thủ phạm: phishing, ransomware, trojan…', page: 'cyber-detective.html', icon: Search, gameId: 'cyber-detective', skill: 'An toàn thông tin' },
];

export const SIMULATORS: GameEntry[] = [
  { id: 'computer', title: 'Mô phỏng máy tính', desc: 'Làm nhiệm vụ trên cây thư mục: tạo thư mục, đổi tên, di chuyển tệp.', page: 'computer-simulator.html', icon: Cpu, gameId: 'computer-simulator', skill: 'Quản lý tệp' },
  { id: 'mos', title: 'Luyện MOS', desc: 'Word, Excel, PowerPoint — làm trên tệp mẫu, chấm theo tiêu chí.', page: 'mos/index.html', icon: FileSpreadsheet, skill: 'Tin học văn phòng' },
  { id: 'shelf', title: 'Kệ sách đề', desc: 'Bộ 7 cuốn ôn thi Tin học năm học 2026–2027.', page: 'quiz-shelf.html', icon: BookOpenText, skill: 'Thư viện đề' },
];

export const DAILY_GAME_GOAL = 3; // gamification.js § DAILY_GAME_GOAL
export const DAILY_BONUS_XP = 30; // gamification.js § XP_DAILY_QUEST_BONUS

/** Ngày theo CÙNG cách gamification.js § _today() (toISOString — ngày UTC) để khớp nhiệm vụ của trang cũ. */
const today = () => new Date().toISOString().slice(0, 10);

export interface GameStateFull extends GameState {
  gameCounts?: Record<string, number>;
  daily?: { date: string | null; games: number; done: boolean };
}

export function readGame() {
  const s = gamification.getState() as GameStateFull;
  const daily = s.daily && s.daily.date === today() ? s.daily : { date: today(), games: 0, done: false };
  return { s, daily, counts: s.gameCounts || {} };
}

/** Cách đạt từng huy hiệu — chữ hiển thị, khớp điều kiện BADGE_DEFS của gamification.js. */
export const BADGE_HOW: Record<string, string> = {
  first_quiz: 'Nộp bài đầu tiên',
  streak_3: 'Học 3 ngày liên tiếp',
  streak_7: 'Học 7 ngày liên tiếp',
  perfect_score: 'Đạt điểm tuyệt đối 1 bài',
  ten_quizzes: 'Làm 10 bài',
  first_game: 'Chơi 1 lượt mini-game',
  games_10: 'Chơi 10 lượt mini-game',
  games_50: 'Chơi 50 lượt mini-game',
  explorer: 'Chơi 5 mini-game khác nhau',
  daily_quest: 'Xong nhiệm vụ ngày 1 lần',
  daily_quest_7: 'Xong nhiệm vụ ngày 7 lần',
  level_5: 'Đạt cấp 5',
};
