/* Sổ đăng ký hình ảnh của TechRealm. Component chỉ nhận ID (vd 'nui', realm 3) và tra URL ở đây.
   Mọi hình là SVG phẳng tự vẽ: không gradient, không bóng, không ảnh raster, không ảnh AI.
   Thêm hình mới: đặt file vào thư mục này, khai báo ở đây, ghi vào docs/techrealm/UI_DESIGN_SYSTEM.md § Hình ảnh. */
import realm1 from './realm-1.svg';
import realm2 from './realm-2.svg';
import realm3 from './realm-3.svg';
import realm4 from './realm-4.svg';
import realm5 from './realm-5.svg';
import realm6 from './realm-6.svg';
import realm7 from './realm-7.svg';
import avNui from './avatar-nui.svg';
import avTrang from './avatar-trang.svg';
import avSong from './avatar-song.svg';
import avLua from './avatar-lua.svg';
import avLa from './avatar-la.svg';
import avMay from './avatar-may.svg';
import logo from './logo.svg';
import patternNight from './pattern-night.svg';
import worldMap from './world-map.svg';

export const REALM_SEAL: Record<number, string> = { 1: realm1, 2: realm2, 3: realm3, 4: realm4, 5: realm5, 6: realm6, 7: realm7 };

export const AVATARS = {
  nui: { url: avNui, label: 'Núi' },
  trang: { url: avTrang, label: 'Trăng' },
  song: { url: avSong, label: 'Sóng' },
  lua: { url: avLua, label: 'Lửa' },
  la: { url: avLa, label: 'Lá' },
  may: { url: avMay, label: 'Mây' },
} as const;
export type AvatarId = keyof typeof AVATARS;

export const ART = { logo, patternNight, worldMap };
