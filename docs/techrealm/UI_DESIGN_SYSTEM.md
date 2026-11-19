# TechRealm — Design System

> 16/11/2026 · Áp dụng cho khu `/app/#/the-gioi/…` (mã: `web/src/features/techrealm/`).
> Cách dùng từng thành phần: [COMPONENT_GUIDE.md](COMPONENT_GUIDE.md). Kiểm thử giao diện: `tests/e2e/suites/techrealm.mjs`.

## 1. Nguyên tắc

| # | Nguyên tắc | Vì sao |
|---|---|---|
| 1 | **Tiên hiệp nằm ở ngôn từ, cấu trúc và hoạ tiết — không nằm ở hiệu ứng.** Ấn triện cảnh giới, đường mạch, vân mây vẽ bằng nét phẳng | Các lần trước, giao diện có glow, gradient, emoji 3D, tranh AI đều bị loại (06/11, 15–16/11/2026). Prompt 02 cũng yêu cầu "không lạm dụng hiệu ứng" |
| 2 | **Phẳng:** mảng màu đơn, viền mảnh 1px, bóng chỉ cho lớp nổi (menu, hộp thoại) | Đọc rõ trên màn hình phòng máy, nhẹ máy |
| 3 | **Mỗi tên tu tiên đi kèm tên thường** ("Tàng Kinh Các · Khoá học, bài học") | Học sinh lớp 3, phụ huynh, giáo viên mới đều hiểu ngay |
| 4 | **Một điểm nhấn vàng kim mỗi khối.** Vàng dành cho cảnh giới, công huân, phần thưởng | Vàng dùng nhiều sẽ thành "kiểu AI" và mất nghĩa |
| 5 | **Mọi khối dữ liệu có đủ 4 trạng thái:** đang tải, trống, lỗi (có Thử lại), có dữ liệu | Yêu cầu Master Prompt §7 |
| 6 | **0 lượt Firebase, 0 request ra ngoài** khi xem giao diện | Spark; E2E kiểm từng trang |

## 2. Màu

Token đặt trong `web/src/features/techrealm/techrealm.css`, **chỉ có hiệu lực trong phần tử `.tr`**. App 2.0 và trang cũ
không đổi màu. Theme sáng/tối dùng chung khoá `ic3_theme` với toàn site.

### 2.1 Token nền tảng

| Token | Sáng | Tối | Dùng cho | Tương phản trên `card` |
|---|---|---|---|---|
| `background` | `#f4f2ec` giấy dó | `#0a1120` | Nền trang | — |
| `card` | `#fffdf8` | `#101a2d` | Khối, thẻ | — |
| `foreground` | `#172033` mực | `#e7ecf3` | Chữ chính | 16,0 / 14,7 |
| `muted-foreground` | `#586274` | `#9aa7ba` | Chữ phụ | 6,1 / 7,1 |
| `primary` (xanh công nghệ) | `#0e7490` | `#22c3dd` | Nút chính, link, tiến độ | 5,3 / 8,2 |
| `night` (xanh đêm) | `#13203a` | `#142240` | Dải đầu trang Tổng quan | chữ `night-foreground` 14,4 |
| `gold` (vàng kim) | `#95650b` | `#e2bb5a` | Cảnh giới, công huân, phần thưởng | 5,0 / 9,5 |
| `gold-night` | `#e2bb5a` | `#e2bb5a` | Vàng **trên nền `night`** (cố định 2 theme) | 8,9 / 8,6 trên `night` |
| `violet` (tím huyền) | `#6b46c1` | `#a78bfa` | Bí cảnh, linh thạch, Đấu Trường | 6,3 / 6,4 |
| `border` | `#e0d9c9` | `#22314c` | Viền 1px | — |

Mọi cặp chữ/nền ở trên đạt WCAG AA (≥ 4,5:1), đã đo ngày 16/11/2026.

### 2.2 Năm linh căn (ngũ hành)

| Linh căn | Năng lực (chủ đề IC3) | Sáng | Tối |
|---|---|---|---|
| Kim | Công nghệ, phần cứng (1) | `#86650f` | `#e2bb5a` |
| Mộc | Sáng tạo nội dung (4) | `#2f7d55` | `#5cc98a` |
| Thủy | Giao tiếp, cộng tác (5, 6) | `#2563c9` | `#6aa5f8` |
| Hỏa | An toàn, bảo mật (7) | `#c2452a` | `#f58b6c` |
| Thổ | Công dân số, quản lý thông tin (2, 3) | `#8c6239` | `#d2a26b` |

Utility: `text-el-kim`, `bg-el-moc`… Dữ liệu vẫn lưu theo **7 chủ đề**; giao diện gộp thành 5 (`model.ts` § `ELEMENTS`).
Tất cả đạt ≥ 4,8:1 khi dùng làm chữ.

### 2.3 Phẩm cấp vật phẩm

Phàm `rar-1` (xám) → Linh `rar-2` (lục) → Huyền `rar-3` (lam) → Địa `rar-4` (tím) → Thiên `rar-5` (vàng kim).
Chỉ dùng cho viền và chữ nhãn phẩm cấp, không tô nền lớn.

### 2.4 Bảy cảnh giới

Màu nằm sẵn trong ảnh ấn (`assets/realm-1…7.svg`), không thành token: Luyện Khí `#64748b` · Trúc Cơ `#2f7d55` ·
Kim Đan `#a8760f` · Nguyên Anh `#0e7f99` · Hóa Thần `#6b46c1` · Độ Kiếp `#b5401f` · Chân Tiên nền `#13203a`, nét vàng.

### 2.5 Màu Badge dùng chung

Trong `.tr`, `--step-1/2/3` được đổi sang bảng màu TechRealm, nên `<Badge tone="blue|green|orange">` tự khớp tông.

## 3. Chữ

| Vai trò | Font | Cỡ / độ đậm |
|---|---|---|
| Chữ thường | `system-ui` (Segoe UI trên Windows), đủ dấu tiếng Việt, **0 byte tải thêm** | 14px (`text-sm`) / 400 |
| Tiêu đề trang (h1) | như trên | 24px (`text-2xl`) / 600, `tracking-tight` |
| Tiêu đề khối (h2) | như trên | 15px / 600 |
| Nhãn nhóm (tên thường trên h1) | như trên | 12px / 500, chữ in hoa, màu `primary` |
| Chữ phụ, chú thích | như trên | 11–12px, `muted-foreground` |
| **Con số** (công huân, linh thạch, điểm, mã) | `font-mono` (Cascadia Mono / Consolas) + `tabular-nums` | theo ngữ cảnh |

Không dùng font trang trí hay thư pháp: font web thêm 50–200 KB mỗi máy mới, và thư pháp khó đọc với học sinh nhỏ.

## 4. Bố cục

- **Khung:** sidebar 248px cố định từ 1024px (`lg`). Dưới 1024px, sidebar thành ngăn kéo mở bằng nút menu.
  Header 56px dính trên cùng; nội dung rộng tối đa 1280px (`max-w-7xl`); footer có công tắc trạng thái dữ liệu.
- **Lưới trang:** khối chính + cột phụ 320px (`lg:grid-cols-[minmax(0,1fr)_20rem]`); lưới thẻ 1 → 2 (`sm`) → 3 (`xl`).
- **Khoảng cách:** giữa các khối `gap-5` (20px); trong khối `p-4` (điện thoại) và `p-5` (từ 640px).
- **Bo góc:** khối `rounded-xl`, dải đầu trang `rounded-2xl`, nút `rounded-md`, nhãn `rounded`.
- **Breakpoint đã kiểm:** 375px (điện thoại), 1366px (máy phòng học). Từ 375px không trang nào tràn ngang (có E2E).
- Phần tử trong lưới luôn có `min-w-0`, nếu không chữ dài sẽ đẩy khối tràn ra (lỗi đã gặp và đã sửa ở `Panel`).

## 5. Thành phần

Chi tiết props: [COMPONENT_GUIDE.md](COMPONENT_GUIDE.md).

| Nhóm | Thành phần | Ghi chú thiết kế |
|---|---|---|
| Button | `Button` (dùng chung app 2.0): `default`, `secondary`, `outline`, `ghost`; cỡ `sm`, `default`, `icon` | Mỗi khối tối đa 1 nút `default` |
| Card | `Panel` (`default`, `feature` = viền trên vàng kim 2px), `StatTile` | `feature` dùng tối đa 2 lần mỗi trang |
| Modal | `Modal` (giữa màn hình; điện thoại thì trượt từ dưới), `Drawer` (bên phải) | Esc, bấm nền, giữ Tab, trả focus |
| Badge | `Badge` (dùng chung), `RarityTag`, `LockNote` | |
| Progress | `Meter` (nhãn + giá trị số), `ElementBars` (năm linh căn) | Không dùng biểu đồ mạng nhện: khó đọc, khó so sánh |
| Navigation | Sidebar (2 dòng: tên + tên thường; mục đang mở có vạch vàng trái), `Tabs`, `Segmented`, menu hồ sơ | |
| Nhân vật | `TrAvatar` (có khung `framed`), `RealmSeal`, `RealmTag` | |
| Trạng thái | `DataBlock` (đủ 4 trạng thái) | Dùng `LoadingState`, `EmptyState`, `ErrorState` của app 2.0 |

## 6. Chuyển động

Chỉ có 3 loại, đều ≤ 700ms và tắt hẳn khi máy bật "giảm chuyển động" (`prefers-reduced-motion` trong `globals.css`):

| Tên | Thời lượng | Dùng cho |
|---|---|---|
| `animate-tr-in` | 180ms, mờ → rõ + nhích 4px | Đổi trang, mở hộp thoại, menu |
| `animate-tr-panel` | 200ms, trượt 16px từ phải | Ngăn kéo thông báo |
| Thanh tiến độ | 700ms `ease-out` | `Meter`, `ElementBars`, công huân |

Không có hạt bay, lấp lánh, rung, phát sáng, nền chuyển động hay hiệu ứng lặp vô hạn (trừ khung chờ khi đang tải).

## 7. Icon

- **Chỉ dùng Lucide** (`lucide-react`, đã có trong app 2.0): nét 2px đồng nhất, tải theo icon thực dùng.
- **Không dùng emoji làm icon** (Windows vẽ emoji thành hình bóng 3D).
- Icon đi cùng chữ; icon đứng một mình phải có `aria-label`.
- Bảng icon ứng với menu nằm ở `layout/nav.ts`.

## 8. Hình ảnh

- Tất cả hình nằm trong `web/src/features/techrealm/assets/`, **tách khỏi component**. Component chỉ nhận ID qua sổ
  `assets/index.ts` (`REALM_SEAL`, `AVATARS`, `ART`).
- **SVG tự vẽ, phẳng:** mảng đơn sắc, không gradient, không texture, không ảnh raster, không ảnh AI. 16 file, tổng ~6 KB.
  Vite nhúng thẳng vào gói (< 4 KB/file), nên không phát sinh request riêng.

| Bộ | File | Mô tả |
|---|---|---|
| Ấn cảnh giới | `realm-1…7.svg` | Ô vuông bo góc (ấn triện) + hình học: khí → nền → đan → anh → lục giác → sét → sao tám cánh |
| Chân dung | `avatar-{nui,trang,song,lua,la,may}.svg` | Hình tròn + biểu tượng thiên nhiên |
| Nghệ thuật | `logo.svg`, `pattern-night.svg` (đường mạch + vân mây), `world-map.svg` (7 vùng + linh mạch) | |

Thêm hình mới: đúng phong cách trên, khai báo trong `assets/index.ts`, ghi vào bảng này.

## 9. Ngôn từ

- Xưng **"em"** với học sinh, như sảnh hiện tại.
- Không dùng câu cảm thán cường điệu, không nhắc tên thương hiệu khác.
- Thuật ngữ cố định: **tu vi** = điểm luyện tập (trên máy, không xác thực); **công huân** = điểm đã xác thực (tính
  cảnh giới); **linh thạch** = tiền đổi vật phẩm trang trí. Không gọi chung là "EXP" trên giao diện, để học sinh không
  nhầm hai tầng.
- Khi chưa có nội dung thì ghi "Sắp mở" hoặc "Đang soạn nội dung". Không tạo trang giả có vẻ như đã có bài.

## 10. Hiệu năng và chi phí (đo 16/11/2026)

| Mục | Kết quả |
|---|---|
| Firebase / Apps Script / request ra ngoài khi xem 11 trang | **0** (E2E kiểm `p.external.size === 0`) |
| Gói JS TechRealm (nạp lười, chỉ khi mở `/the-gioi`) | 109,5 KB, **28,7 KB gzip** |
| CSS TechRealm (nạp cùng gói) | 30,1 KB, **5,8 KB gzip** |
| CSS chung của app 2.0 | **Không đổi** (cùng mã băm `index-__RbxM45.css` với bản đã commit; E2E kiểm không chứa token `.tr`) |
| JS chung của app 2.0 | +1,9 KB (+0,03 KB gzip): mã `<Routes>` của React Router |
| Ảnh | Nhúng trong gói, 0 request |

Ý nghĩa với Firebase Hosting (10 GB/tháng): học sinh không mở TechRealm không tải thêm byte nào; mở lần đầu thì tải
thêm khoảng 35 KB gzip, sau đó trình duyệt giữ 1 năm (`/app/assets/**` immutable).
