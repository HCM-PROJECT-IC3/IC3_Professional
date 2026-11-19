# TechRealm — Challenge System (khung Bí cảnh)

> 17/11/2026 · Nội dung các bí cảnh: [GAME_DESIGN.md](GAME_DESIGN.md). Luật EXP: [CULTIVATION_SYSTEM.md](CULTIVATION_SYSTEM.md).

## 0. Tóm tắt

- Mỗi màn chơi là **máy trạng thái thuần, tất định**: `init(rng(seed))` → `apply(state, action)` → `evaluate(state)`.
- Giao diện React **chỉ gửi thao tác** vào đúng các hàm đó. Trạng thái trên màn hình chính là trạng thái máy chủ dựng lại.
- **Xác nhận phần thưởng bằng chạy lại:** trình duyệt gửi `{ seed, actions }`, không gửi điểm. Apps Script chạy lại
  bằng **cùng file** (`scripts/build-apps-script.js` chép nguyên văn `challenge-core.js` + luật bí cảnh vào
  `apps/Code.gs`) và tự tính điểm. Sửa điểm trong gói tin vô tác dụng. E2E kiểm: điểm hiện trên màn hình = điểm Node
  chạy lại nhật ký đã lưu.
- **Trò chơi tách khỏi phần học tập:** gói lười riêng (`PowerCityGame`, 14 KB gzip), không có trong gói TechRealm hay
  gói chung (đã kiểm từng file build).
- **0 lượt Firebase, 0 lượt Apps Script khi chơi.** Hook xác nhận `trRewardChallenge_` đã viết và test, chưa nối, công
  tắc `TR_REWARDS` tắt (cần mã học tập, GĐ4).

## 1. Thành phần

| Tầng | File | Vai trò |
|---|---|---|
| Khung | `js/techrealm/challenge-core.js` | `rng` có hạt giống, đăng ký bí cảnh, `replay`, `validateLog`, `score`, `rewardEvent` |
| Luật bí cảnh | `js/techrealm/thanh-pho-mat-dien-core.js` | 4 màn (mạch điện, phân phối, dữ liệu, Boss) |
| Cầu nối trình duyệt | `web/.../challenges/challengeEngine.ts` | `useLevelRun` (hạt giống `crypto.getRandomValues`, nhật ký có thời điểm), lưu kỷ lục |
| Giao diện | `web/.../challenges/PowerCityGame.tsx` | Cốt truyện, bản đồ, màn chơi, câu hỏi, kết quả |
| Máy chủ | `apps/src/79-tr-ledger.gs` § `trRewardChallenge_` | Chạy lại → sự kiện `CHALLENGE` → CultivationService |
| Luật EXP | `js/techrealm/cultivation-core.js` § `CHALLENGE` | Mức thưởng theo điểm máy chủ, Boss cộng thêm, 1 lần/màn |

## 2. Hợp đồng một màn chơi

```js
{
  id: 'mach-dien', title: '…', par: 150 /* giây chuẩn */, boss?: true,
  init(rng)            → state   // JSON thuần; dùng rng.int/pick/shuffle — KHÔNG Math.random, KHÔNG Date
  apply(state, action) → state   // nhận bản sao, trả trạng thái mới; thao tác không hợp lệ thì bỏ qua (không ném lỗi)
  evaluate(state)      → { completed, accuracy 0–1, solving 0–1, application 0–1, attempts, minAttempts }
}
```
- `state.done = true` thì màn kết thúc. Thao tác sau đó bị bỏ qua.
- Action: `{ t: ms từ lúc bắt đầu, type: '…', …tham số }`. Trình duyệt tự gắn `t`.
- Không dùng `?.` / `??`, không DOM, không mạng (chạy được trên Apps Script; `check-architecture` R1 kiểm).

## 3. Cơ chế đánh giá (Prompt 05 §4)

| Tiêu chí | Trọng số | Đo bằng |
|---|---|---|
| Hoàn thành nhiệm vụ | Điều kiện | `completed`. Chưa xong thì tổng bị giới hạn **40/100** (vẫn ghi nhận cố gắng) |
| Độ chính xác | 40 | Tỉ lệ làm đúng ngay lần đầu (mạch, kế hoạch chia điện, đợt Boss không quá tải, câu đọc số liệu) |
| Khả năng giải quyết vấn đề | 25 | Chất lượng lời giải: số lần thử so với tối thiểu, mức dùng điện so với **tối ưu** (vét cạn, luôn tính cả nơi thiết yếu) |
| Vận dụng kiến thức | 20 | Câu hỏi vận dụng đúng ngay lần đầu |
| Thời gian | 10 | Đủ điểm nếu ≤ thời gian chuẩn (`par`), giảm dần tới 0 ở 3 × `par` |
| Số lần thử | 5 | Trừ dần theo số lần thử vượt mức tối thiểu |

**Sao:** ≥ 85 điểm = 3 sao, ≥ 65 = 2 sao, hoàn thành = 1 sao, chưa hoàn thành = 0 sao.
Thời gian chỉ chiếm 10%. Học sinh chậm mà đúng vẫn đạt 3 sao.

## 4. Xác nhận phần thưởng

```
Trình duyệt: { lid, challengeId, levelId, seed, actions }   (điểm có gửi kèm cũng bị bỏ qua)
Apps Script: trRewardChallenge_  (TR_REWARDS = 'on')
  → EduChallenge.rewardEvent
      validateLog: mảng ≤ 600 thao tác, thời điểm tăng dần, ≤ 2 giờ, mỗi thao tác ≤ 200 ký tự,
                   trung bình ≥ 120 ms/thao tác (chặn nhật ký sinh bằng máy)
      replay(seed, actions) bằng luật chép trong Code.gs → điểm MÁY CHỦ
      chưa hoàn thành → không có sự kiện
  → CultivationService.recordEvent({ type: 'CHALLENGE', challengeId: '<bí cảnh>/<màn>', score, boss }, actor: system)
      mức: ≥ 85 → 30 · ≥ 65 → 20 · ≥ 50 → 10 · Boss +40 · 1 lần/màn · tối đa 150/ngày (Admin chỉnh qua TR_CONFIG)
```

| Gian lận | Bị chặn bởi |
|---|---|
| Sửa điểm trong gói tin | Máy chủ không đọc điểm, tự chạy lại |
| Gửi nhật ký "hoàn hảo" tự viết | Phải là chuỗi thao tác hợp lệ sinh ra đúng trạng thái. Viết được thì cũng là đã giải được đề; còn nhịp bấm máy (< 120 ms) thì bị chặn |
| Đổi hạt giống để lấy đề dễ | Các biến thể đề cùng độ khó (test 200 hạt giống: luôn giải được, đáp án duy nhất). Khi cần chặt hơn: máy chủ cấp hạt giống theo phiên (như mã phiên khảo hạch) |
| Gửi lại nhiều lần để cộng nhiều | `txId` tất định theo màn → chỉ 1 lần |
| Chép nhật ký của bạn | Nhật ký gắn với hạt giống. Dùng nguyên của bạn thì được điểm của bạn, nhưng chỉ được 1 lần/màn/học sinh. Muốn chặn hẳn thì dùng hạt giống do máy chủ cấp (như trên) |

**Lưu trên máy** (`localStorage tr.challenges.v1`): kỷ lục mỗi màn `{ score, stars, at, seed, actions }`. Nhật ký kỷ lục
được giữ để gửi máy chủ xác nhận khi lớp bật công huân, kể cả những màn đã chơi trước đó.

## 5. Thêm một bí cảnh mới (checklist)

1. Viết thiết kế vào GAME_DESIGN.md §3 (cốt truyện, NPC, bản đồ, 3 màn + Boss, kiến thức).
2. `js/techrealm/<ten>-core.js`: các màn theo hợp đồng §2, rồi `EduChallenge.register({ id, title, levels })`.
3. Thêm file vào `SHARED` trong `scripts/build-apps-script.js` (để máy chủ chạy lại được).
4. Test trong `js/techrealm/__tests__/`, theo mẫu `challenge-core.test.js`:
   - "người chơi bằng code" giải từng màn;
   - quét ≥ 200 hạt giống: luôn giải được, đáp án duy nhất, phương án không trùng;
   - kiểm nội dung kiến thức đúng;
   - nhật ký giả bị từ chối;
   - chạy lại ra đúng điểm.
5. Giao diện: `web/.../challenges/<Ten>Game.tsx`, nạp lười trong `TechRealmApp.tsx`; hình vào `assets/<ten>.ts` (sổ riêng).
6. Bật thẻ trong `pages/ChallengesPage.tsx` § `STORY` (`ready: true`).
7. E2E: chơi 1 màn qua giao diện, so điểm hiển thị với điểm chạy lại bằng Node.

## 6. Kiểm thử

| Bộ | Nội dung | Số kiểm tra |
|---|---|---|
| `js/techrealm/__tests__/challenge-core.test.js` | Hạt giống; nhật ký giả; vật lý mạch (kín/hở/công tắc/song song, vật dẫn); 4 màn giải tối ưu / giải ẩu / bỏ dở; mức tối ưu luôn gồm nơi thiết yếu; 200 hạt giống × 4 màn; chống gian lận; nối luật EXP | 31 |
| `js/techrealm/__tests__/cultivation-core.test.js` | Nguồn `CHALLENGE`: chỉ máy chủ ghi, bậc thưởng, Boss +40 | +3 |
| `apps/__tests__/tr-ledger.test.js` | `Code.gs` thật chạy lại nhật ký: thưởng theo điểm máy chủ (không theo 100 gửi kèm), trùng, nhật ký cắt, nhịp bấm máy | +4 |
| `tests/e2e/suites/techrealm.mjs` | 5 thẻ bí cảnh; bản đồ khoá/mở; chơi màn 1 bằng giao diện (có 1 lần sai); **điểm màn hình = điểm Node chạy lại**; mở màn 2; 375px; 0 request ra ngoài | +11 |

Đã cài lỗi thử để chắc test bắt được: bỏ giới hạn 40 điểm khi chưa xong, bỏ điều kiện công tắc, bỏ ràng buộc nơi
thiết yếu khi tính tối ưu. Cả 3 đều bị bắt. Test cũng tìm ra **1 lỗi nội dung thật, đã sửa**: ở 9/200 hạt giống,
chỗ rò điện không đủ nổi bật để học sinh nhận ra.

## 7. Chưa làm

1. Nối `trRewardChallenge_` vào route (cần mã học tập, GĐ4) và gửi các kỷ lục đang chờ.
2. Hạt giống do máy chủ cấp cho chế độ "thi đấu" (nếu cần chặn chép nhật ký).
3. Bí cảnh 2–5 (thiết kế ở GAME_DESIGN.md §3).
4. Âm thanh: chưa có, vì phòng máy thường tắt loa. Nếu thêm, phải có nút tắt và mặc định tắt.
