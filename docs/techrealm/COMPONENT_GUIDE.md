# TechRealm — Hướng dẫn thành phần

> 16/11/2026 · Quy chuẩn màu, chữ, chuyển động: [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md).
> Mã: `web/src/features/techrealm/`. Mọi đường dẫn dưới đây tính từ thư mục đó.

## 1. Cấu trúc thư mục

```
TechRealmApp.tsx        Bảng route của khu (nạp lười từ src/app/router.tsx), import techrealm.css
techrealm.css           Token .tr + utility riêng (không lọt vào CSS chung)
model.ts                Hằng số giao diện: 7 cảnh giới, 5 linh căn, phẩm cấp, trạng thái giao dịch
assets/                 SVG + sổ đăng ký index.ts (component chỉ nhận ID)
layout/TrShell.tsx      Khung: Sidebar · Header · main · Footer · NotificationPanel · ProfileMenu
layout/nav.ts           10 mục menu (tên + tên thường + icon)
ui/primitives.tsx       RealmSeal, RealmTag, TrAvatar, Meter, ElementBars, StatTile, Panel, TrPageHeader,
                        RarityTag, LockNote, LegacyAnchor, TrLink, lessonHref, trPath
ui/controls.tsx         Tabs, Segmented, DataBlock
ui/overlay.tsx          Modal, Drawer
demo/data.ts            DỮ LIỆU MẪU (kiểu dữ liệu = hợp đồng cho bước tích hợp)
demo/DemoState.tsx      Công tắc trạng thái dữ liệu + hook useBlock
pages/*.tsx             11 trang
```

## 2. Thành phần

Thành phần dùng chung của app 2.0 (`Button`, `Badge`, `Card`, `LoadingState`, `EmptyState`, `ErrorState`) dùng nguyên.
Trong `.tr`, chúng tự đổi sang token TechRealm.

### `Panel` — khối nội dung có tiêu đề
```tsx
<Panel title="Nhiệm vụ đang thực hiện" icon={ScrollText} description="…" action={<Badge>3</Badge>} variant="feature">
  …
</Panel>
```
| Prop | Kiểu | Ghi chú |
|---|---|---|
| `title` | ReactNode | Vẽ thành `h2` |
| `description`, `icon`, `action` | tuỳ chọn | `action` nằm góc phải tiêu đề (link "Tất cả", badge) |
| `variant` | `'default' \| 'feature'` | `feature` = viền trên vàng kim. Tối đa 2 lần mỗi trang |

Có sẵn `min-w-0`, nên đặt trong lưới không bị tràn ngang.

### `DataBlock` + `useBlock` — 4 trạng thái dữ liệu
```tsx
const quests = useBlock(QUESTS);                         // mảng rỗng → 'empty'
const elements = useBlock(ME.elements, () => false);     // đối tượng: tự khai báo khi nào là rỗng
<DataBlock state={quests} empty={{ title: 'Chưa có nhiệm vụ', description: '…', action: <Button/> }}>
  {(list) => <ul>…</ul>}
</DataBlock>
```
- **Bắt buộc** cho mọi khối hiển thị dữ liệu.
- Khi tích hợp, `useBlock` nhận trạng thái thật từ service (`loading | error(retry) | empty | ready`). Component trình
  bày không đổi.
- Không gọi `useBlock` trong JSX hay điều kiện. Gọi ở đầu component, giống mọi hook khác.

### `Meter` — thanh tiến độ có nhãn
```tsx
<Meter label="Công huân tới Kim Đan" value={640} max={900} />          // hiện "640/900"
<Meter label="Nắm vững" value={45} showValue="45%" tone="moc" size="sm" />
<Meter label="" value={2} max={3} showValue={false} />                  // thanh trơn
```
`tone`: `primary | gold | violet | kim | moc | thuy | hoa | tho`. Luôn truyền `label`, vì đó là `aria-label` cho trình
đọc màn hình (kể cả khi không hiện ra).

### `ElementBars` — năm linh căn
`<ElementBars values={{ kim: 72, moc: 45, thuy: 58, hoa: 81, tho: 63 }} compact? />`, giá trị 0–100.

### `StatTile` — ô số liệu
`<StatTile icon={Gem} label="Linh thạch" value={260} hint="Đổi vật phẩm trang trí" tone="violet" />`
`tone`: `primary | gold | violet`. Giá trị hiển thị bằng font số.

### `TrPageHeader` — đầu trang
`<TrPageHeader title="Tàng Kinh Các" plain="Khoá học, bài học" description="…" actions={…} />`
Trang nào cũng phải có. `plain` là tên thường, bắt buộc.

### `RealmSeal`, `RealmTag`, `TrAvatar`, `RarityTag`, `LockNote`
```tsx
<RealmSeal realm={3} size={40} />            // ấn Kim Đan, alt "Ấn Kim Đan"
<RealmTag realm={2} />                        // ấn nhỏ + tên
<TrAvatar id="trang" size={72} framed />      // framed = viền vàng kim
<RarityTag rarity={4} />                      // "Địa"
<LockNote>Mở từ Kim Đan</LockNote>
```

### `Tabs` và `Segmented`
```tsx
<Tabs label="Loại vật phẩm" value={tab} onChange={setTab} items={[{ id: 'phap-bao', label: 'Pháp bảo', count: 2 }]} />
<Segmented label="Lọc công pháp" value={group} onChange={setGroup} items={[{ id: 'all', label: 'Tất cả' }]} />
```
- `Tabs` đổi **nội dung chính** của trang, có `role="tablist"` và phím ←/→/Home/End.
- `Segmented` là **bộ lọc** trên cùng danh sách (`role="radiogroup"`).

### `Modal` và `Drawer`
```tsx
<Modal open={!!item} onClose={() => setItem(null)} title="…" description="…" footer={<><Button variant="outline">Đóng</Button><Button>Dùng</Button></>}>
  …
</Modal>
<Drawer open={bell} onClose={…} title="Thông báo" footer={…}>…</Drawer>
```
- Vẽ vào `#tr-layer` (bên trong `.tr`) bằng portal, nên giữ đúng màu và không bị khối cha có `transform` làm lệch.
- Đóng bằng Esc hoặc bấm nền; Tab xoay vòng trong hộp; đóng xong trả focus về nút đã mở; khoá cuộn trang.
- Form trong Modal: đặt `id` cho `<form>`, nút nộp ở `footer` dùng `form="…"`.

### Link
| Hàm | Khi nào |
|---|---|
| `TrLink to="tang-kinh-cac"` / `trPath('…')` | Trang trong TechRealm |
| `lessonHref({ ct, cap, bai })` | Mở 1 bài ở sảnh cũ (`index.html?ct=&cap=&bai=`). `bai` phải là **tên đúng trong `data/ic3/meta.json`** |
| `legacyUrl('arena.html?vai=solo')` (`@/lib/utils`) | Trang cũ khác (game, MOS, Đấu Trường) |
| `<Link to="/so-tay">` | Trang của app 2.0 (ngoài TechRealm) |

E2E kiểm mọi link `../` trỏ tới file có thật.

## 3. Thêm một trang mới (checklist)

1. Tạo `pages/XxxPage.tsx`, mở đầu bằng `TrPageHeader` (có `plain`).
2. Mọi khối dữ liệu: `useBlock` + `DataBlock`, với lời trống cụ thể (nói em nên làm gì tiếp).
3. Thêm route trong `TechRealmApp.tsx`; nếu là mục menu thì thêm vào `layout/nav.ts`.
4. Màu chỉ lấy từ token (`text-gold`, `bg-el-moc`, …). **Không ghép tên class bằng chuỗi** (`` `text-rar-${n}` ``),
   vì Tailwind không quét được. Hãy dùng bảng tra viết đủ tên class (xem `RARITY_TILE` trong `BagPage.tsx`).
5. Hình mới: thêm SVG vào `assets/` và khai báo trong `assets/index.ts`.
6. Thêm trang vào mảng `PAGES` của `tests/e2e/suites/techrealm.mjs`. Bộ này tự kiểm nội dung, 0 request ra ngoài,
   không tràn ngang ở 375px, không lỗi JS.
7. `cd web && npm run build`, rồi `cd tests/e2e && node run.mjs techrealm`.

## 4. Không được

- Import `@/services/legacy/runtime`, Firebase SDK hay Apps Script client trong khu này **khi chưa có quyết định ở
  giai đoạn tích hợp** (ARCHITECTURE.md §3: chỉ service mới gọi backend, trang thì không).
- Dùng emoji làm icon, gradient, `shadow` cho thẻ thường, `blur`, hiệu ứng lặp vô hạn.
- Hiện một con số "EXP" gộp tu vi với công huân.
- Sửa `js/`, `index.html` hay trang cũ để phục vụ giao diện TechRealm.

## 5. Xem thử

```bash
cd web && npm run build                                   # build ra ../app/
cd .. && npx http-server@14.1.1 -p 8770 -c-1 -s .         # mở http://127.0.0.1:8770/app/#/the-gioi
```
- Công tắc **"Trạng thái dữ liệu"** ở chân trang chuyển giữa Có dữ liệu / Đang tải / Trống / Lỗi mạng (lưu trong tab).
- Nút mặt trăng/mặt trời nằm trong menu hồ sơ (góc phải trên).
- Ảnh chụp mọi trang: `E2E_SHOTS=<thư mục> node tests/e2e/run.mjs techrealm`.
