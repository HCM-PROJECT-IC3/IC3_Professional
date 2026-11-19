/* Chữ hiển thị cho dữ liệu của luật tu luyện (id → tiếng Việt). Luật trả id; giao diện quyết định cách gọi. */
import { Cultivation, type Condition, type HistoryEntry } from '../engine';
import { COURSES } from '../demo/data';
import { REALMS, realmOf, type RealmId } from '../model';

const courseName = (id: string) => COURSES.find((c) => c.id === id)?.name ?? id;
const testName = (id: string) => {
  const m = /^khao-hach-(\d)$/.exec(id);
  return m ? `Khảo hạch ${realmOf(Number(m[1]) as RealmId).name}` : id;
};

/** Tên dễ đọc cho id nguồn (bài, dự án, nhiệm vụ…). Bản thật tra từ data/techrealm/*.json. */
const SOURCE_NAME: Record<string, string> = {
  'thu-moi-hoi-cho': 'Thư mời hội chợ lớp', 'on-cong-dan-so': 'Ôn chủ đề Công dân số', 'phong-K7M2QX': 'Phòng cả lớp K7M2QX',
  'bt-phan-cung': 'Bài tập phần cứng', 'bt-mat-khau': 'Bài tập mật khẩu mạnh', 'bt-luu-tru': 'Bài tập lưu trữ',
  'kiem-tra-giua-hk1': 'Kiểm tra giữa HK1', 'tuan46-a': 'Giúp bạn ôn bài', 'tuan46-b': 'Phát biểu xây dựng bài', 'tuan46-c': 'Trình bày sản phẩm',
};
const sourceName = (id = '') => {
  const lesson = /^ic3-lv(\d)\/(\d)$/.exec(id);
  if (lesson) return `IC3 cấp ${lesson[1]} · chủ đề ${lesson[2]}`;
  return SOURCE_NAME[id] ?? testName(id);
};

export function conditionLabel(c: Condition) {
  const [kind, id] = c.id.split(':');
  switch (kind) {
    case 'exp': return `Công huân đạt ${c.target.toLocaleString('vi-VN')}`;
    case 'course': return `Hoàn thành công pháp ${courseName(id)}`;
    case 'test': return `${testName(id)} đạt yêu cầu`;
    case 'projects': return `${c.target} sản phẩm Bách Công Phường được duyệt`;
    case 'quests': return `${c.target} nhiệm vụ thực hành`;
    case 'certified': return 'Chứng chỉ thật được thầy cô xác nhận';
    default: return c.label;
  }
}
export const conditionNote = (c: Condition) => (c.id.startsWith('test:') && !c.met ? 'Thầy cô mở phiên khảo hạch trên lớp' : undefined);

export const itemName = (id: string) => Cultivation.DEFAULT_ITEMS.find((i) => i.id === id)?.name ?? id;
export const achievementName = (id: string) => Cultivation.DEFAULT_ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id;

/** 1 dòng lịch sử → { loại, chi tiết }. */
export function historyLabel(h: HistoryEntry): { kind: string; detail: string } {
  switch (h.kind) {
    case 'exp': {
      const detail = h.note && h.type === 'TEACHER' ? h.note : sourceName(h.sourceId);
      return { kind: Cultivation.SOURCES[h.type!]?.label ?? h.type!, detail: h.reverseNote ? `${detail} — huỷ: ${h.reverseNote}` : detail };
    }
    case 'realm': return { kind: 'Đột phá', detail: `Lên ${REALMS[(h.realm ?? 1) - 1].name}` };
    case 'item': return { kind: 'Nhận vật phẩm', detail: `${itemName(h.itemId!)}${h.qty && h.qty > 1 ? ` ×${h.qty}` : ''}` };
    case 'achievement': return { kind: 'Thành tựu', detail: achievementName(h.achievementId!) };
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO → "dd/MM HH:mm" theo giờ Việt Nam. */
export function vnTime(iso: string) {
  const d = new Date(Date.parse(iso) + 7 * 3600e3);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
