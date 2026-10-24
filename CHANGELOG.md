# EduQuiz — Ghi chú nâng cấp (Tháng 7/2026)

## Đấu trường: Bốc thẻ bài trong trận — cả 10 chế độ (24/10/2026) — 0 Firebase

- **Mốc bốc thẻ**: cứ mỗi 3 câu, đúng **từ 2/3 câu** thì hiện nút **Bốc thẻ bài!** (nhấp nháy vàng); dưới 2 câu đúng thì lỡ lượt bốc. Bàn bài phủ toàn màn hình: chia 3 lá úp → tráo 4 lần → em chọn 1 lá (bấm hoặc phím 1/2/3) → lật ra, 2 lá kia lật theo → **Nhận thẻ** (Enter) → chữ lớn báo hiệu ứng.
- **8 lá** (rút theo độ hiếm, luôn 3 lá khác nhau, chỉ ra lá dùng được ở trận đó): **50:50** · **Thêm giờ** (chỉ khi có giới hạn giờ) · **Nhân đôi** (chỉ Tốc độ/Sinh tồn/Mặt Trăng) — 3 lá này thành vật phẩm bấm dùng (phím Q/W/E), nay có ở **mọi chế độ**, không ra khi đã giữ đủ 3 vật phẩm · **Khiên chuỗi** (sai 1 câu vẫn giữ chuỗi đúng) · **Câu vàng** (câu kế tiếp thành Câu hỏi vàng +5 xu) · **Đặt cược** (câu kế tiếp: đúng +8 xu, sai −3 xu thưởng) · **Túi xu** +3 · lá hiếm **Kho báu** +10.
- Thanh trên có ô đen-vàng báo thẻ đang hiệu lực (Khiên chuỗi · Đặt cược · Câu vàng kế tiếp); xu từ thẻ + thử thách gom vào ô "xu thưởng", cộng vào ví khi xong trận.
- Logic thuần ở `js/arena/arena-core.js` (`CARDS`, `cardCheckpoint`, `drawCards`) + 4 test mới; bàn bài `js/arena/arena-cards.js`; nối vào `arena.js` (`drawCard`, `applyCard`, `paintBonus`, `paintCardFx`). Mỗi mốc chỉ bốc 1 lần; bỏ cuộc giữa lúc bốc vẫn an toàn.
- Đã chạy bằng Chrome thời gian thật với đề giáo viên tự soạn (`?de=`) ở Kéo co: 3 lần bốc trong 1 trận (Túi xu, Thêm giờ...), vật phẩm hiện và dùng được ở chế độ trước đây không có — 0 lỗi JS; `check-js` và test đạt.

## Đấu trường + Gọi tên: kịch tính, thử thách, hoạt ảnh lúc chơi (24/10/2026) — 0 Firebase

**Đấu trường (Chơi một mình, cả 10 chế độ)** — `js/arena/arena-drama.js` + `arena.js`
- **Câu hỏi hiện ra**: thẻ câu hỏi phóng to vào, các ô đáp án bật lên lần lượt; **giờ chỉ bắt đầu tính khi đã hiện xong** (chưa bấm được trong lúc hiện).
- **Căng thẳng giây cuối**: 5 giây cuối có tiếng tích tắc, 3 giây cuối tiếng tim đập + viền đỏ nhấp nháy, thanh giờ rung.
- **Chữ lớn giữa màn hình**: CÂU CUỐI! (chế độ biết trước số câu) · EM DẪN ĐẦU! · BỊ VƯỢT MẶT! · CHUỖI 3 / 5 / 8 CÂU!
- **Thử thách có thưởng xu**: mỗi trận 1–2 **Câu hỏi VÀNG** (viền vàng, vệt sáng lướt) và 1 **Thử thách tốc độ** (đếm 5 giây trên thẻ) — đúng được **+5 xu**, xu bay lên ô "xu thưởng" trên thanh trên; cộng vào ví khi xong trận (bỏ cuộc thì mất, như xu thường), màn kết quả có dòng "xu thử thách". Vật phẩm Thêm giờ không kéo dài Thử thách tốc độ. Không có ở lượt Luyện câu sai.
- Màn kết quả: các con số đếm dần lên.

**Gọi tên (cả 11 trò)** — `np-games.js` + `js/name-picker/np-challenge.js`
- 5 giây cuối tích tắc, 3 giây cuối tim đập + viền sân khấu đỏ nhấp nháy.
- **Soi đèn trước khi công bố**: sân khấu tối dần, vòng sáng thu lại quanh người được gọi + tiếng trống dồn, nhân vật nhún lên → khung tên + kèn công bố (trò mà người được gọi đã biến mất như UFO thì bỏ qua soi đèn).
- **Bốc thử thách** (nút vàng trên khung tên): chia 3 lá bài úp → tráo 4 lần → bạn được gọi chọn 1 lá (bấm hoặc phím 1/2/3) → lật ra; 2 lá còn lại lật theo. 3 loại lá: **Hỏi nhanh IC3** (22 câu: phím tắt, thiết bị nhập/xuất, CPU/RAM, hệ điều hành, đuôi tệp, Excel, mật khẩu mạnh, lừa đảo trực tuyến, bản quyền... — có nút "Xem đáp án" cho giáo viên), **Thử thách vui**, **Thẻ may mắn** (miễn lượt, được nhờ bạn, được gọi bạn tiếp theo).
- Âm thanh mới (tạo bằng Web Audio, không tải tệp): tick · heartbeat · whoosh · drumroll · fanfare (`js/game-sfx.js`).
- Đã chạy bằng Chrome thời gian thật: Đấu trường Tốc độ (Câu hỏi vàng, câu hiện ra, 3 giây cuối), Gọi tên Trộm trứng (soi đèn → khung tên → bốc thử thách → xem đáp án) và 6 trò khác — 0 lỗi JS; `check-js` và test đạt.

## Gọi tên Vui: thêm trò thứ 11 — 🔮 Đua bi (marble race) (24/10/2026) — 0 Firebase

- **Bản nâng cấp "kịch tính"**: đường đua khó hơn với 6 loại bất ngờ — **Trộn bi** (phễu rung, bi đảo chỗ 3 lần trước khi thả) · **cối xay** hất bi ngược lại · **bệ tăng tốc** (bi phát sáng lao vút) · **MÁY TRỘN** (bi bị hút vào trống quay, xoay vòng một lúc rồi ra theo thứ tự mới) · **LÒ XO TUNG BI** (bi bị bắn lên trời: rơi ngược về dốc trên hoặc bay tắt qua bẫy) · **BẪY SẬP** (nắp mở theo nhịp, bi rơi xuống **ống hút** chạy vòng về đầu dốc). Bi đuổi kịp thì nhảy qua đầu bi khác.
- **Dải tin nhanh** báo từng bất ngờ, lời thoại trên bi ("Bị hất văng!", "Áaa! Rơi bẫy!", "Bay tắt luôn!"); **28% cuối chạy chậm + máy quay zoom** theo 2 bi dẫn đầu, **chụp ảnh về đích** (loé sáng), các bi lăn vào **máng đích** xếp theo thứ tự về.
- Cả trận được **mô phỏng trước theo đúng luật đường đua** (thử tối đa 12 trận, giữ trận nhiều lần đổi người dẫn đầu và có cú vượt cuối trận), rồi mới gán tên: người được gọi nhận đường bi về nhất, Lật kèo nhận bi dẫn đầu gần đích — bất ngờ nào cũng "thật", không dựng.
- Đã chạy bằng Chrome thời gian thật (script CDP): 16 bi/15 giây có Lật kèo, 30 bi/8 giây, 5 bi/20 giây — 0 lỗi JS, người được gọi luôn về nhất. Sửa lỗi khung hình đầu đọc mốc âm (rAF sớm hơn lúc bắt đầu).
- Trò "đua bi" đang hot trên mạng xã hội: mỗi bạn là 1 viên bi màu riêng, nằm sẵn trong **phễu**; "Thả bi!" → cửa phễu mở, bi lăn xuống **đường ván zigzag 4 dốc** gắn trên tấm ván gỗ đục lỗ, đập thành chắn ở khúc quặt rồi rơi xuống dốc dưới, qua **cối xay** (dốc 2) và **2 nấm nảy** (dốc 3) thì bị hất lên. Bi **lăn thật** (quay theo quãng đường, đổi chiều theo hướng dốc), ánh sáng trên bi giữ cố định.
- **Bảng xếp hạng trực tiếp** 5 bạn dẫn đầu ở góc phải; 3 bi dẫn đầu hiện tên trên đầu (đông thì là số thứ tự), bi dẫn đầu có vòng vàng, đổi người dẫn đầu thì "X vượt lên!".
- Giữ luật chung của trang: người được gọi chọn trước, bi đó về nhất đúng lúc hết giờ; **Lật kèo** — bi dẫn đầu khoe "Về nhất chắc rồi!" rồi bị vượt phút chót. Về đích: bi thắng lăn qua vạch, các bi khác lăn nốt và xếp hàng sau vạch.
- Tối đa 30 bi/lượt (lớp đông hơn thì chọn 1 nhóm, luôn có người được gọi). Cảnh mới `pegboard` trong `np-art.js` (không trùng trò nào). Chọn trò xếp 6 cột (11 trò = 2 hàng).
- Đã chạy thử trong Chromium: 12 bi và 25 bi (có Lật kèo) — bi ra phễu, lăn hết 4 dốc, bảng xếp hạng cập nhật, bi người được gọi về nhất; `check-js` và test đạt.

## Đấu trường + mini-game: sửa Kéo co, mỗi trò 1 nền riêng, bỏ nền lặp (24/10/2026) — 0 Firebase

- **Kéo co sai tư thế**: trước 2 đội quay lưng vào dây và ngả về giữa (như đang chạy trốn). Nay mỗi đội **quay mặt vào dây** (Đỏ nhìn phải, Xanh nhìn trái), **ngả người ra sau**, 2 tay vươn trước nắm dây; dây trượt thì lùi chân, không nhún chạy. Tên các bạn giãn ra, không đè nhau. Tranh bìa thẻ Kéo co sửa theo.
- **10 chế độ = 10 nền khác nhau**: thêm 2 cảnh mới vào `np-art.js` — `castle` (sân đấu phép trước lâu đài, đuốc, vòng phép) cho **Đấu phép**, `island` (đảo hoang: biển, bãi cát, dừa) cho **Sinh tồn**. Trước Sinh tồn/Đào hoá thạch chung rừng, Đấu phép/Lên Mặt Trăng chung vũ trụ. Tranh bìa Đào hoá thạch cắt lên phần núi lửa.
- **Bỏ nền soi gương 2 bên** (màn rộng thấy 2 núi lửa, 2 cụm lau sậy...). Nay 2 bên là chính cảnh đó **làm mờ + tối**, tranh chính mờ dần ở mép — không lộ hình lặp.
- **Câu cá**: cá bơi trong ao nằm **sau lưng** các bạn đứng trên bờ (trước đè lên mặt, như đang đứng dưới nước).
- **6 mini-game hết chung 1 nền xanh đen**: `js/game-backdrop.js` + `css/game-backdrop.css` — Đấu boss: lâu đài · Thám tử mạng: phố đêm · Chim vượt ải: bầu trời · Trí nhớ: lớp học · Phòng thủ: nông trại · Phân loại: tiệc. Tranh mờ nhẹ + phủ tối nên thẻ/chữ vẫn rõ; bỏ viền xám nhạt quanh trò ở chế độ sáng.

## Đấu trường: thẻ chọn chế độ có tranh bìa kiểu thẻ game (24/10/2026) — 0 Firebase

- 11 thẻ chế độ bỏ icon emoji, thay bằng **tranh bìa** vẽ bằng SVG (`js/arena/arena-covers.js`): cảnh nền của trang Gọi tên + nhân vật/đạo cụ riêng từng chế độ (sân bóng + tia sét, 3 rương vàng + gà, đường chạy + cờ đích, 3 tim, ao cá, 2 đội kéo co, cầu lửa giữa vũ trụ, két sắt + đá quý, khủng long canh bãi đào, tên lửa bay lên Mặt Trăng, bảng ô 100–600).
- Thân thẻ màu đặc của chế độ, bóng nổi; rê chuột / đang chọn thì tranh phóng nhẹ và **nhân vật cử động** (chạy, kéo dây, cá giãy, cầu lửa bay, tên lửa phụt lửa). Máy đặt giảm chuyển động: đứng yên.
- Điện thoại: 2 cột, chỉ hiện tranh + tên; thẻ đang chọn hiện thêm mô tả.
- Id gradient/filter trong tranh bìa được đổi tên riêng, không đè lên cảnh trong trận (cùng dùng np-art).
- **Sửa dải sân khấu trong trận bị cắt trên màn hình rộng**: trước khớp theo chiều ngang nên ở máy tính chỉ thấy dải đất dưới chân (mất trời, hành tinh, Mặt Trăng). Nay dải rộng thì khớp theo chiều cao → thấy trọn tranh; khung chơi đặt giữa. Dải cao hơn một chút ở máy tính (tối đa 320px, Đua/Mặt Trăng 360px). Điện thoại giữ như cũ.

## Đấu trường: đủ 10 chế độ Chơi một mình — thêm 🦖 Đào hoá thạch và 🚀 Lên Mặt Trăng (24/10/2026) — 0 Firebase

- **🦖 Đào hoá thạch** (kiểu Blooket Deceptive Dinos): trả lời đúng được chọn 1 việc — ⛏️ **Đào thật** (chọn 1 trong 3 tảng đá, lật ra 0–120 🦴) · 🤫 **Ăn gian** (được ×3 nhưng 2 lượt tới ai kiểm tra trúng là mất 40%) · 🔍 **Kiểm tra 1 bạn** (bạn đó đang ăn gian → lấy 40% hoá thạch của bạn đó; trung thực → em mất lượt). Bảng xếp hạng ghi "vừa đào +N" làm manh mối (đào nhiều bất thường có 🤨). Bạn máy cũng ăn gian và kiểm tra lẫn nhau, có thể bắt quả tang em.
  - Cảnh: chân núi lửa bốc khói (tranh Gọi tên), **khủng long đứng canh** bên phải — thỉnh thoảng lè lưỡi "Hít hít...", "Ai ăn gian đấy?"; bắt quả tang thì đớp + rướn người, bong bóng "Gừm! Bắt quả tang!"; người bị bắt rung đỏ "🚨 −N 🦴". Đào được thì nhảy lên, 🦴/🪨 bùng ra (bộ xương 120 → 🦖 + pháo giấy). Chỉ em thấy 🤫 trên đầu mình khi đang ăn gian.
- **🚀 Lên Mặt Trăng** (kiểu leo đỉnh Mastery Peak của Wayground): đúng thì tên lửa bay lên theo tốc độ trả lời (384 nghìn km, như khoảng cách thật); đúng liền 3 câu **tầng đẩy ×1,5**, 5 câu **×2**; sai/hết giờ chết máy tụt 30 nghìn km nhưng **không tụt dưới trạm đã qua** (3 trạm, mỗi 1/4 đường). Ai chạm Mặt Trăng trước thắng (tối đa 2× số câu). Có vật phẩm ✂️ 50:50 · ⏳ Thêm giờ · ✖️2 (bay thêm 1 lần) như Tốc độ/Sinh tồn.
  - Cảnh: vũ trụ có Mặt Trăng lớn phía trên (tranh Gọi tên), bệ phóng, vạch 3 trạm + vạch Mặt Trăng; mỗi người là 1 **tên lửa** màu riêng (em màu đỏ, vòng vàng), **phụt lửa khi bay**, tụt thì rung + 💨, chạm Mặt Trăng thì ⭐ bùng ra + "Tới nơi rồi!"; 🔥×1,5/×2 trên đầu khi có tầng đẩy. Dải sân khấu chế độ này cao hơn (bay dọc).
- **Bong bóng lời thoại** kiểu trang Gọi tên dùng chung cho sân khấu (`EduArenaScene.talk`) — dùng ở 2 chế độ mới (bị lộ "Ối, bị lộ rồi!", "Mình trung thực mà!").
- Vai Giáo viên (Phòng cả lớp) không hiện 2 chế độ này (chỉ chơi một mình, như Săn vàng/Câu cá); link `?mode=dino` / `?mode=moon` mở thẳng ở Chơi một mình.
- Logic thuần ở `js/arena/arena-core.js` (`rollRocks`, `digRock`, `inspect`, `tickCheat`, `botDino`, `moonStep`, `moonOrder`...) + 13 test mới; cảnh ở `js/arena/arena-scene.js`; không thêm file, không ảnh ngoài.
- Đã chạy trong Chromium: chơi hết trận **cả 10 chế độ** (1280×900), 2 chế độ mới thêm ở điện thoại 390×844 nền tối, 1600×900 và giảm chuyển động; vai Giáo viên chỉ hiện 7 chế độ phòng; 0 lỗi JS, 0 request ra ngoài, không cuộn ngang. `check-js` và mọi unit test đạt.

## Đấu trường: sân khấu có tranh, nhân vật chuyển động trong trận (24/10/2026) — 0 Firebase

- **Dải sân khấu có tranh** phía trên câu hỏi ở cả 8 chế độ Chơi một mình (`js/arena/arena-scene.js`, dùng chung tranh SVG của trang Gọi tên `js/name-picker/np-art.js`). Mỗi người chơi là 1 bạn nhỏ đồng phục (em có vòng vàng + nhãn "⭐ Em", bạn máy có tên + biểu tượng); thay cho đường đua / dây kéo co dạng chữ cũ.

  | Chế độ | Cảnh | Chuyển động |
  |---|---|---|
  | ⚡ Tốc độ | Sân bóng | Xếp theo hạng — đổi hạng thì **chạy nghiêng** sang chỗ mới; được điểm nhảy lên + "+850" |
  | 🏁 Đua về đích | Đường chạy có vạch đích | Mỗi bạn 1 làn, chạy tới trước theo số bước (+1 / ⚡ +2) |
  | 🪢 Kéo co | Đồi cỏ | 2 đội nghiêng người kéo dây; dây lệch → cả 2 đội **trượt** theo, mỗi nhịp kéo cả đội rướn người |
  | 🎣 Câu cá | Bờ ao | Cá bơi lững thững; ai câu được thì 1 con cá **bay vòng cung** lên tay bạn đó, bắn bọt nước |
  | 💰 Săn vàng | Nông trại | Được vàng: nhảy + 🪙 bùng ra; bị lấy vàng: rung đỏ |
  | ❤️ Sinh tồn | Rừng | Tim trên đầu mỗi bạn; mất tim rung đỏ "💔"; bị loại thì nằm xám mờ |
  | 🔮 Đấu phép | Vũ trụ | Thanh máu trên đầu; trúng phép rung đỏ "−25"; bị hạ thì xám mờ |
  | 🔐 Giải mã | Phố | Được đá quý: nhảy + 💎 bùng ra |
- Em trả lời đúng → nhân vật của em nhảy lên; sai/hết giờ → mặt hoảng, lắc người. Nhân vật đứng thì nhún nhẹ, đi thì đổi sang **dáng chạy nghiêng** (vung chân tay); mây trôi, nắng xoay, sao lấp lánh.
- Sân khấu tự co theo chiều cao màn hình (máy chiếu vẫn đủ chỗ cho câu hỏi) và tự xếp nhân vật trong phần nhìn thấy; điện thoại thu gọn. Máy đặt giảm chuyển động: vẫn có cảnh, bỏ chuyển động. Lượt "Luyện câu sai" giữ gọn, không có cảnh.
- Chỉ thêm 1 file JS (~12 KB) + CSS; không ảnh ngoài, không mạng. `arena.js` chỉ gọi 4 chỗ: vào trận (`mount`), sau mỗi lần cập nhật bảng xếp hạng (`sync` tự so trước/sau), em trả lời (`mood`), kết thúc/bỏ cuộc (`clear`).
- Đã chạy trong Chromium: 8 chế độ (máy tính, điện thoại, giảm chuyển động), chơi hết trận cả 8 chế độ, Phòng cả lớp không ảnh hưởng; 0 lỗi JS, 0 request ra ngoài. `check-js` 173/173 và mọi unit test đạt.

## Gọi tên học sinh: làm lại theo "Gọi Tên Vui" — 10 trò có tranh minh hoạ + nhân vật chuyển động (24/10/2026) — 0 Firebase

- **Thay toàn bộ 5 trò cũ** (vòng quay, thẻ tên phẳng) bằng **10 trò có cảnh vẽ**, cùng thứ tự với trang tham khảo: 🥚 Trộm trứng (gà mẹ ngủ, các bạn lén lấy trứng, gà thức dậy rượt) · 🏁 Đường đua (mỗi bạn 1 làn, "Đi!") · 🎣 Câu cá (cá bơi, lưỡi câu thả xuống, cá cắn hụt, con cuối bị kéo lên) · 🎈 Bóng bay (chim mổ nổ từng quả, "Ơ, không nổ!") · 🦖 Khủng long (các bạn cầm bánh, khủng long "Hít hít...", ăn mất bánh 1 bạn) · 🚀 Tên lửa (đếm ngược, phóng, chạm Mặt Trăng trước) · 🔦 Đèn pin (lớp tắt đèn, vệt sáng đi tìm) · 🎁 Hộp quà (hộp đổi chỗ, mở thử hộp trống) · 🟥 Thẻ đỏ (trọng tài rút thẻ vàng rồi thẻ đỏ) · 🛸 UFO (phố cổ lúc hoàng hôn, tia hút thử rồi bắt cóc).
- **Tranh tự vẽ bằng SVG** (`js/name-picker/np-art.js`, ~30 KB, không tải ảnh ngoài, không lấy ảnh của trang tham khảo): 10 cảnh nền 1000×600 (trời, nắng xoay, mây trôi, đồi, hàng rào, chuồng gà; đường chạy có khán đài; ao sen + cầu gỗ; núi lửa bốc khói; vũ trụ có Mặt Trăng, sao lấp lánh; lớp học; phòng tiệc; sân bóng trước trường; phố có mái hiên, đèn lồng, xe buýt chạy ngang). Học sinh mặc **đồng phục áo trắng, khăn quàng đỏ, quần/váy xanh** — 8 kiểu (trai/gái, tóc buộc, mũ, kính), mỗi bạn giữ 1 kiểu cố định.
- **Chuyển động**: nhân vật đi/chạy bằng CSS transition (vung chân tay, nhún), mặt hoảng/khóc khi bị bắt, người thắng nhảy lên; gà mẹ ngủ/thức, khủng long đớp, chim vỗ cánh, cá quẫy đuôi, tên lửa phụt lửa, nắp hộp quà bật, đèn UFO nhấp nháy + tia hút. Lời thoại bong bóng ("Nhầm rồi, đi tiếp!", "Thẻ vàng thôi!", "Tuột mất rồi!"...), đồng hồ đếm ngược góc trái (đỏ, đập nhịp 3 giây cuối), chữ "Đi!".
- **Lật kèo** ở cả 10 trò: bắt được 1 bạn → khung tên "Bắt được rồi!" bị **đóng dấu NHẦM RỒI!**, tên gạch đỏ → chuyển sang bạn khác. Đường đua/Tên lửa: bạn đang dẫn đầu "Về nhất chắc rồi!" rồi "Ơ... bị vượt rồi!".
- **Bố cục giống trang tham khảo**: nền giấy kem, viền nét, nút đỏ cam "Bắt đầu!", lưới 10 thẻ trò có hình; tuỳ chọn "nghỉ lượt sau", "Lật kèo", "mỗi lượt đổi trò"; thanh **Thời gian chọn 5–30 giây**; thẻ **Người chơi** (Lớp có sẵn · Dán danh sách · Số thứ tự 2–50) và **Đã được gọi**. Khung tên kết quả nằm ngay trên sân khấu (Gọi tiếp · Bạn này vắng — gọi bạn khác · Đóng). Bấm vào sân khấu hoặc Space để gọi; F toàn màn hình (chỉ sân khấu, giữ tỉ lệ 5:3). Có chế độ tối.
- Lớp đông: mỗi trò có giới hạn nhân vật trên sân khấu (Đường đua/Tên lửa 20, Khủng long/Hộp quà 24, Câu cá 30, Bóng bay 40; trò khác cả lớp) — luôn có người được gọi trong nhóm. Điện thoại: khung tên, nút, đồng hồ tự to lên để bấm được.
- **Không còn tên đè nhau khi lớp đông**: trên 24 bạn thì nhãn dưới chân là **huy hiệu số thứ tự** trong danh sách lớp (như trang tham khảo), khung kết quả ghi "Số thứ tự 16 · 8A1 · Trường"; nhân vật đi lang thang/chạy trốn chỉ tới chỗ còn trống; Tên lửa xếp tên so le 2 hàng; UFO mở rộng vùng chạy xuống lòng đường khi đông. Đo trên lớp 44 bạn: cảnh chờ 0 cặp nhãn đè nhau ở cả 10 trò (trước: hàng chục), giữa trận chỉ còn 0–2 lần chạm thoáng qua khi nhân vật chạy cắt nhau.
- So ảnh cạnh nhau với trang tham khảo (cùng 20 bạn, 20 giây, chụp ở giây thứ 2,5) rồi bổ sung tiền cảnh: bụi cây, cỏ, đá, hoa; ao thêm lá sen, cỏ lau; phố thêm ban công, đèn lồng, chậu hoa, cột đèn; bóng bay to hơn khi ≤ 20 bạn.
- **Vẽ lại toàn bộ tranh theo nét của trang tham khảo** (`np-art.js`): mọi hình có **viền nâu sẫm** + mảng sáng/tối; học sinh **chibi đầu to, mắt to long lanh**, có **2 dáng** — đứng chính diện và **chạy nghiêng sải chân, tay vươn trước** (tự đổi dáng khi di chuyển/bị bắt), **đĩa màu dưới chân** (cam: nữ · xanh: nam) như tranh mẫu; cây tán nhiều lớp; chuồng gà 3D mái ngói; đất/cỏ/sàn gỗ có vân; ao có ánh nước; vũ trụ có tinh vân mờ; khán đài có khán giả; phố có cây hoa, cột đèn. Vẫn là SVG tự vẽ, không tải ảnh ngoài.
- Giữ nguyên: nguồn tên (roster tĩnh / dán / số), vắng hôm nay, không gọi trùng, lịch sử — chỉ localStorage trên máy giáo viên.
- Đã chạy trong Chromium: cả 10 trò thường + Lật kèo (máy tính 1280×1000, điện thoại 390×844 nền tối, giảm chuyển động), vắng → gọi bạn khác, dán từ Excel, số thứ tự, toàn màn hình; 0 lỗi JS, **0 request ra ngoài**, không cuộn ngang. `check-js` 172/172 và mọi unit test đạt.

## Trang mới: Gọi tên học sinh — `goi-ten.html` (24/10/2026) — 0 Firebase, 0 Apps Script

- Gọi tên ngẫu nhiên trên máy chiếu, lấy ý tưởng từ trang "Gọi Tên Vui" (dựng lại từ đầu trong dự án, không chép mã). Lối vào: sảnh → dải **Dành cho thầy cô** → **Gọi tên học sinh**.
- **Nguồn tên** (bảng bên phải):
  - **Lớp có sẵn**: chọn Trường → Lớp từ `data/roster/students-active.json` (file tĩnh sẵn có, như ô chọn tên ở sảnh). Bấm tên để đánh dấu **vắng hôm nay** — tự bỏ đánh dấu sang ngày mai.
  - **Tự dán**: mỗi dòng 1 tên, dán thẳng từ Excel/Word/Zalo; tự bỏ số thứ tự, cột STT/lớp khi dán từ Excel, tên trùng; 1 dòng có dấu phẩy cũng tách được.
  - **Số thứ tự**: 2–60 bạn.
- **5 trò** (+ "Mỗi lần 1 trò"): 🎡 Vòng quay (tên dưới kim cập nhật khi quay) · 🎰 Xổ số · 🔦 Đèn pin (sân khấu tối, đèn nhảy chậm dần) · 🏁 Đường đua (6 bạn, đổi người dẫn đầu, người được gọi bứt lên về nhất) · 🎈 Bóng bay (8 bạn, bóng nổ dần, quả cuối còn lại).
- **Cách gọi**: không gọi lại bạn đã được gọi (hết lượt tự sang vòng mới); **Lật kèo** — dừng ở 1 bạn, hiện "Ơ... khoan đã!" rồi chuyển sang bạn khác; thời gian hồi hộp 3/5/8/12 giây.
- **Màn công bố**: tên thật to + lớp/trường, pháo giấy. Nút **Gọi tiếp** (Space), **Bạn này vắng — gọi bạn khác** (bỏ khỏi "Đã gọi", đánh dấu vắng, gọi ngay bạn khác), **Đóng** (Esc).
- **Đã gọi**: danh sách theo giờ, bỏ từng bạn hoặc **Làm lại từ đầu**. Có nút ẩn bảng bên (sân khấu rộng hết màn hình), toàn màn hình (phím F), sáng/tối, tắt tiếng.
- **Dữ liệu**: người được gọi chọn trước bằng `Math.random`, trò chơi chỉ diễn tới kết quả đó. Danh sách dán vào, vắng, đã gọi, cài đặt chỉ lưu `localStorage` (`eduquiz_goiten_v1`) trên máy giáo viên — không gửi đi đâu, không đụng dữ liệu bài làm/roster.
- File mới: `goi-ten.html`, `css/name-picker.css`, `js/name-picker/name-picker-core.js` (logic thuần) + `name-picker.js` (giao diện), test `js/name-picker/__tests__/name-picker-core.test.js` (20 test).
- Đã chạy trong Chromium (1600×900, điện thoại 390×844 nền tối, giảm chuyển động): đủ 5 trò, Lật kèo cả 5 trò, bạn vắng không bao giờ được gọi, không gọi trùng, vắng → gọi bạn khác, dán từ Excel, số thứ tự; **0 request ra ngoài, 0 Firebase/Apps Script**; không cuộn ngang. `check-js` 170/170 và mọi unit test đạt.

## Đấu trường: Mở hộp Linh vật có thử thách + hiệu ứng, bớt khoảng trống (24/10/2026) — 0 Firebase

- **Màn mở hộp toàn màn hình** (trước đây là khung nhỏ dưới danh sách hộp, dễ bị khuất): hộp rung → ánh sáng đổi sang màu độ hiếm (hồi hộp, Sử thi trở lên rung lâu hơn) → nổ hạt → thẻ Linh vật lật ra, Sử thi trở lên có vệt sáng quét qua + pháo hoa. Bấm/Space để mở nhanh, Esc để đóng. Ngay trên thẻ có nút **Mở tiếp**, **Làm ảnh đại diện**, **Đóng**. Máy đặt giảm chuyển động: hiện thẻ ngay.
- **Thử thách mới** (logic thuần ở `arena-core.js`, có unit test):
  - 🎯 **Nhiệm vụ hôm nay**: đúng 20 câu trong Đấu trường (Chơi một mình + Phòng cả lớp, cộng dồn) → 1 🎟️ vé mở hộp miễn phí, mỗi ngày 1 lần. Màn kết thúc ván hiện "8/20 câu đúng hôm nay".
  - 🛡️ **Bảo hiểm Sử thi**: 9 hộp liền không ra Sử thi trở lên → hộp thứ 10 chắc chắn Sử thi trở lên.
  - 📚 **Đủ bộ**: có đủ 9 Linh vật của 1 hộp → thưởng 60 xu (1 lần), hộp và bộ sưu tập gắn 🏆.
  - ★ **Lên sao**: trùng Linh vật vẫn hoàn xu như cũ, thêm sao (★ 1 con · ★★ 3 con · ★★★ 6 con), thẻ báo "Lên sao!".
- **Bớt khoảng trống / phần thừa**:
  - Bộ sưu tập: ô giãn đủ chiều ngang (trước dư ~6 cột trống bên phải ở màn rộng).
  - Trận đấu (máy tính): cột xếp hạng kéo dài bằng khu câu hỏi, các dòng giãn ra; ô đáp án lấp tới đáy (không còn mảng trống dưới nút Chốt). Đơn vị ("đá quý", "điểm"…) ghi 1 lần ở tiêu đề thay vì lặp ở mỗi dòng.
  - Câu Chọn nhiều đã ghi "(Chọn 2)" thì bỏ dòng "☑️ Chọn 2 đáp án đúng rồi bấm Chốt" (nút Chốt vẫn hiện 0/2).
  - Dòng hướng dẫn đầu màn Mở hộp gọn lại thành 1 dòng dưới danh sách hộp, thay bằng 3 ô tiến độ (nhiệm vụ · bảo hiểm · sưu tập).
- Dữ liệu vẫn chỉ ở localStorage theo biệt danh (thêm `pity`, `tickets`, `daily`, `sets`, `opened` vào hồ sơ; hồ sơ cũ dùng tiếp được).
- Đã chạy trong Chromium ở 1893×920 (đúng cỡ ảnh báo), 390×844 và chế độ giảm chuyển động: mở ~14 hộp liên tiếp tới khi đủ bộ, bảo hiểm, lên sao, nhiệm vụ ngày cộng qua 6 ván Chơi một mình + Phòng cả lớp Giải mã; hiệu ứng tự dọn (0 phần tử sót). `check-js` 167/167 và mọi unit test đạt.

## Đấu trường: Giải mã cho cả lớp trong Phòng cả lớp (23/10/2026) — 0 Firebase

- **🔐 Giải mã** nay chơi được ở **Phòng cả lớp** (vai Giáo viên) — cả 6 chế độ phòng: Tốc độ, Đua, Sinh tồn, Kéo co, Đấu phép, Giải mã. Mỗi em có 1 két khoá mã 3 ký hiệu; **mã két chỉ nằm trên máy giáo viên**, không bao giờ gửi cho học sinh.
- Chốt câu: em nào trả lời đúng chọn ngay 1 việc trên màn xem đáp án (bấm hoặc phím 1–3), **có kết quả liền**:
  - ⛏️ Đào đá quý — trả lời nhanh đào nhiều hơn (tới ×1,5).
  - 🔓 Phá két — chọn 1 trong 3 két máy giáo viên gợi ý (két em đang phá dở luôn đứng đầu, còn lại bốc ngẫu nhiên cố định theo mã phòng + câu, ưu tiên bạn có đá quý → cả lớp không dồn phá 1 người), rồi đoán ký hiệu ô đang mở; ký hiệu đã đoán sai bị khoá lại. Mở đủ 3 ô lấy 50% đá quý, két đó tự đổi mã. Két trống thì báo "két đang trống", không bắn pháo hoa.
  - 🔁 Đổi mã — chỉ bấm được khi đã có bạn mở được ô két em.
  - Không chọn kịp → sang câu sau máy tự đào.
- **Máy học sinh**: HUD "💎 52 · két em 🔓🔓🔒"; đầu câu sau báo "HS Chi phá két em, lấy 40 💎", "Có bạn đã mở 2/3 ô két em — chọn 🔁 Đổi mã!", "máy tự đào +22 💎". Hiệu ứng: đá quý bùng ra, ô két rung mở, đoán sai rung đỏ.
- **Màn chiếu**: số em đã chọn việc, khung "Két vừa bị phá" cập nhật ngay khi có em phá được két; màn kết quả "… là Vua giải mã!". CSV thêm cột Két phá được.
- Học sinh chỉ gửi tên việc + két + ký hiệu; máy giáo viên kiểm tra (đúng câu, đúng két được gợi ý, mỗi câu 1 việc) và tự chấm → không gian lận được.
- Có unit test mới cho Giải mã trong phòng. Đã chạy trong Chromium: phòng 1 giáo viên + 4 học sinh (PeerJS giả lập) với 3 kiểu chơi khác nhau, máy tính và điện thoại; chạy lại phòng Đấu phép, Kéo co, Bảng điểm và Giải mã/Tốc độ/Đấu phép Chơi một mình. `check-js` 167/167 và mọi unit test đạt.

## Đấu trường: hiệu ứng chuyển động cho mọi chế độ chơi (23/10/2026)

- **`js/arena/arena-fx.js` mới** (~130 dòng, Web Animations API, không thư viện): số bay lên (viên bo tròn nền trắng, đọc được trên mọi màu ô), vật bay theo đường cong, hạt bùng, lớp CSS tự gỡ, bảng xếp hạng trượt (FLIP), nút dây trượt. Phần tử hiệu ứng tự dọn sau ~1 giây (đã đo: 0 phần tử sót).
- **Chung**: trả lời đúng → ô đúng nảy, điểm "+850" bay lên từ ô em chọn, ô điểm trên HUD nảy; chuỗi ≥ 3 → 🔥 nảy; **bảng xếp hạng trượt lên/xuống** khi đổi hạng, dòng của em sáng viền vàng khi lên hạng.
- **Đua về đích**: nhân vật nhảy và trượt tới chỗ mới. Trước đây cả đường đua vẽ lại mỗi câu nên nhân vật nhảy cóc; transition sẵn có chưa từng chạy. **Kéo co**: nút dây trượt, cả dây giật về phía đội vừa kéo, tên đội đó nảy.
- **Đấu phép**: phép (🔥 ⚡ 🌀) bay từ người dùng tới mục tiêu; trúng đích thì dòng đỏ rung kèm "−25"; bị hạ thì nổ tia lửa; khiên/hồi máu sáng xanh. Đòn của bạn máy nối tiếp nhau, không chồng lên. Em bị đánh thì ô máu rung.
- **Giải mã**: đào → "+20 💎" và đá quý bùng ra; đoán đúng ô → dòng két rung mở 🔓; đoán sai → dòng báo rung; phá được két → 5 viên 💎 bay từ két bị phá sang người phá (cả khi bạn máy phá két em).
- **Săn vàng**: rương mở → vàng bùng ra + "+50"; mất vàng → rương rung đỏ; lấy vàng của bạn → 🪙 bay từ dòng bạn đó về em. **Câu cá**: cá lên kèm bọt nước 💦.
- **Bảng điểm**: các ô xuất hiện lần lượt khi mở bảng; ô vừa chọn **phóng to** thành khung câu hỏi; đáp án đúng nảy; chấm xong thẻ đội nảy, "+300"/"−150" bay lên, đội đúng có sao.
- **Phòng cả lớp**: dây kéo co trên màn chiếu/máy học sinh trượt từ vị trí cũ sang mới; kết quả câu ở máy học sinh nảy (đúng) hoặc rung (sai), số bay lên; dòng kết quả phép lượt trước sáng/đỏ lên.
- Máy đặt **giảm chuyển động** (Windows/macOS/điện thoại): bỏ mọi chuyển động, chỉ còn đổi màu (đã thử bằng `reducedMotion: 'reduce'`).
- Đã chạy lại cả 8 chế độ Chơi một mình, Bảng điểm, phòng Kéo co và phòng Đấu phép (PeerJS giả lập); `check-js` 167/167 và mọi unit test đạt.

## Đấu trường: Đấu phép cho cả lớp trong Phòng cả lớp (23/10/2026) — 0 Firebase

- **🔮 Đấu phép** nay chơi được ở **Phòng cả lớp** (vai Giáo viên). Mỗi em có 100 máu. Chốt câu: em nào trả lời đúng (và chưa bị hạ) nhận 3 phép do **máy giáo viên** bốc, rồi chọn 1 phép ngay trên màn xem đáp án (bấm hoặc phím 1–3, đổi ý được). Phép **nổ khi giáo viên sang câu sau**: em nào trả lời nhanh hơn thì phép nổ trước và mạnh hơn (tới ×1,5). Em không kịp chọn thì máy tự dùng phép đầu tiên.
- Cầu lửa và Hút máu đánh 1 bạn còn trụ, chọn ngẫu nhiên nhưng cố định theo mã phòng + câu, nên cả lớp không dồn đánh 1 người và máy tính lại vẫn ra cùng kết quả. Sấm sét đánh tất cả. Khiên chặn trọn 1 đòn. Mỗi câu chỉ nổ 1 lần.
- **Học sinh không gửi được gì ngoài tên phép**, và chỉ được chọn trong 3 phép đã cấp. Máy giáo viên tự tính sát thương như các chế độ phòng khác, nên không gian lận được.
- **Màn chiếu**: khung "Phép vừa nổ" (ưu tiên đòn hạ gục, tối đa 6 dòng), thanh máu trên bảng xếp hạng, số em đã chọn phép, và tên người trụ lại cuối cùng ở màn kết quả.
- **Máy học sinh**: thanh máu trên HUD, dòng kết quả phép lượt trước ("Phép của em gây 30 sát thương · Em bị đánh −25 máu · Khiên đã chặn 1 đòn"). Em bị hạ vẫn trả lời tiếp để luyện tập.
- Kết thúc khi còn ≤ 1 người trụ lại hoặc hết câu. CSV thêm cột Máu còn lại và Bị hạ ở câu.
- Nút Hồi phục ghi rõ "Em đang đầy máu — chọn phép khác lợi hơn" khi em đang đầy máu (cả Chơi một mình).
- Có unit test mới cho Đấu phép trong phòng. Đã chạy trong Chromium: phòng 1 giáo viên + 4 học sinh (PeerJS giả lập), cùng toàn bộ chế độ trước đó. `check-js` 166/166 và mọi unit test đạt.

## Đấu trường: 4 chế độ kiểu Wayground — Kéo co · Đấu phép · Giải mã · Bảng điểm (23/10/2026) — 0 Firebase

- **🪢 Kéo co** (Chơi một mình + Phòng cả lớp): 2 đội Đỏ – Xanh. Mỗi câu: sai/bỏ trống kéo 0, đúng kéo 1, đúng trong nửa đầu thời gian kéo 2. Dây dịch theo chênh lệch lực kéo **trung bình** của 2 đội (× 30 vạch) nên đội đông không được lợi; dây chạm vạch 100 → đội đó thắng ngay, hết câu thì đội đang được dây thắng. Phòng cả lớp: máy giáo viên tự chia đội xen kẽ theo lượt vào (luôn cân người); người rớt mạng mà không trả lời thì không kéo đội xuống. Màn chiếu, màn học sinh và màn kết thúc đều có sợi dây; CSV thêm cột Đội + dòng kết quả. Chơi một mình: em + 2 bạn máy đấu 3 bạn máy.
- **🔮 Đấu phép** (kiểu WayArena, Chơi một mình): mỗi người 100 máu. Trả lời đúng được chọn 1 trong 3 phép ngẫu nhiên: 🔥 Cầu lửa, ⚡ Sấm sét (đánh tất cả), 🌀 Hút máu, 🛡️ Khiên phép (chặn trọn 1 đòn), 💚 Hồi phục. Trả lời nhanh phép mạnh tới ×1,5. Bạn máy cũng thi triển (máu thấp thì ưu tiên hồi/khiên). Bị hạ là thua; xếp hạng: còn trụ → bị hạ muộn → máu → sát thương.
- **🔐 Giải mã** (kiểu "Những người giải mã", Chơi một mình): két mỗi người khoá bằng mã 3 ký hiệu ▲ ◆ ● ■. Trả lời đúng chọn: ⛏️ Đào đá quý, 🔓 Phá két 1 bạn (đoán ký hiệu ô đang mở, ký hiệu đoán sai được ghi lại; mở đủ 3 ô lấy 50% đá quý), hoặc 🔁 Đổi mã khi có người đã mở được ô két em (mọi tiến độ phá két em về 0). Bạn máy cũng phá két em — có cảnh báo "đã mở 2/3 ô".
- **🧩 Bảng điểm** (kiểu Board Battle, vai Giáo viên, `js/arena/arena-board.js` mới): chiếu bảng ô 100…500 (số ô = Số câu), 2–6 đội đặt tên được; đội đến lượt chọn ô, cả lớp trả lời ra giấy/bảng con, giáo viên bấm **Hiện đáp án** rồi bấm các đội trả lời đúng (phím 1–6, Enter). Ô ✖️2 gấp đôi điểm, ô ⚠️ Rủi ro trừ một nửa nếu sai — chỉ lộ khi mở ô. Có nút toàn màn hình, bảng kết quả và "câu nhiều đội sai nhất". Học sinh không cần máy: chạy hoàn toàn trên máy giáo viên, không mạng, không Firebase.
- Logic thuần ở `js/arena/arena-core.js` (+ `arena-room-core.js` cho Kéo co trong phòng), có unit test. Vai Giáo viên chỉ hiện các chế độ chơi được ở phòng (Tốc độ, Đua, Sinh tồn, Kéo co) + Bảng điểm; Đấu phép, Giải mã chỉ ở Chơi một mình.
- Đã chạy trong Chromium (chặn mạng ngoài): 3 chế độ Chơi một mình chơi tới hết trận ở máy tính và điện thoại nền tối; Bảng điểm 10 ô; Phòng Kéo co 1 giáo viên + 4 học sinh (PeerJS giả lập giữa các tab). `check-js` 166/166 + toàn bộ unit test đạt.

## Sảnh: hết khoảng trống ở màn rộng + lối vào cho thầy cô rõ ràng (23/10/2026)

- **Nguyên nhân khoảng trống**: mọi nút phụ (Thử thách hôm nay, đếm ngược, Góc học tập, Đấu trường, Lịch sử, Tải sẵn offline) nằm trong cột 3 → ở màn 3 cột, cột 3 dài gấp đôi, cột 1–2 để trống cả mảng lớn.
- **`index.html`**: khối nút phụ tách khỏi cột 3 thành `.lobby-col-more` (vẫn trong `.lobby-card`, nên các module tìm `.lobby-card .lobby-extras` không phải sửa). Bố cục (`style.css`, khối "SẢNH: KHỐI VIỆC THÊM…" cuối file):
  - ≥ 1400 px: 1 hàng ngang dưới cả 3 cột — Thử thách · Đếm ngược · 4 nút phụ. Chế độ Kiểm tra (cột 3 cao hơn): khối này lên ngay dưới cột 1–2.
  - 960–1399 px: 2 hàng dưới cả 2 cột; cột 1–2 vẫn liền nhau như trước.
  - < 960 px (điện thoại): thứ tự như cũ.
  - Đo ở 1888×916 (đúng cỡ ảnh báo lỗi): 3 cột kết thúc cùng 1 đường, thẻ thấp hơn ~100 px, vừa 1 màn hình. Không có cuộn ngang ở 1888 / 1366 / 1100 / 390 px.
- **Dải "Dành cho thầy cô"** ở cuối thẻ thay cho 2 nút nhỏ mờ (opacity .8, chữ .78rem) nằm lẻ dưới thẻ: nhãn + 2 nút viền rõ "Đăng nhập trang quản lý" và "Gom kết quả học sinh gửi", cao 2,6rem, có viền focus khi dùng bàn phím; điện thoại xếp dọc, rộng hết. Giữ `id="adminEntryLink"` nên `quiz-engine.js` vẫn ẩn khi làm bài và hiện lại ở sảnh (đã thử).
- Dòng trạng thái "Tải sẵn offline" rỗng không còn chừa khoảng trống.
- Đã chạy lại: Thử thách hôm nay, làm bài → nộp → thẻ thưởng, chế độ Kiểm tra, quay về sảnh; `check-js` + unit test đạt.

## Rà soát toàn trang + bớt ~830 KB thư viện tải sẵn + đếm ngược kỳ thi (23/10/2026) — 0 Firebase

- **Rà 30 trang HTML** trong Chromium (chặn mạng ngoài, giả lập đăng nhập cho trang quản trị): không có lỗi JS, không file 404.
- **Lịch giảng dạy (`teaching-schedule.html`)**: jsPDF + AutoTable + 2 font tiếng Việt (NotoSans, Tinos) — ~1,3 MB, ~575 KB nén — **không nạp lúc mở trang nữa**, chỉ tải khi bấm xuất PDF lần đầu (Lịch tuần, Phiếu công tác, Thời khoá biểu). Thêm `EduLazyLoad.lazyCall(srcs, fn)` vào `js/services/lazy-script-loader.js`; 3 file `js/export/*-pdf.js` chỉ đổi dòng xuất API. Danh sách thư viện + thứ tự (jsPDF → AutoTable → font) khai ở `window.EduPdfVendorScripts` trong trang. Đã kiểm: gọi xuất → nạp đủ 4 file, `getFontList()` có NotoSans + Tinos. Lần bấm đầu chậm hơn ~1 giây (tải thư viện), các lần sau như cũ.
- **Luyện MOS (`mos-practice.html`)**: ExcelJS (~925 KB, 252 KB nén) và JSZip chỉ tải khi chấm file Excel/PowerPoint lần đầu. Đã chấm thử file đề mẫu cả 2 môn qua giao diện.
- **Giữ nguyên (có lý do)**: `data/roster/students-active.json` 324 KB nhưng nén còn 23 KB; SheetJS + MSAL ở Lịch giảng dạy (MSAL phải có sẵn để nhận phản hồi đăng nhập Microsoft khi trang mở lại sau chuyển hướng).
- **Đếm ngược kỳ thi** ở sảnh (`js/exam-countdown.js`, hàng nhỏ dưới "Thử thách hôm nay"): "Còn 10 ngày · Thi IC3 GS6 · 2/11", "Tuần này đã ôn 3/5 ngày" (đếm ngày có bài nộp hoặc có làm Thử thách của học sinh đang chọn) và gợi ý theo số ngày còn lại (≤ 14 ngày: nước rút làm bài Kiểm tra; ≤ 3 ngày: ôn Sổ tay câu sai). Ngày thi do thầy cô khai trong `js/backend-config.js` → `examSeason` theo Chương trình (cả trường cùng thấy, học sinh không sửa được); chưa khai thì học sinh tự đặt bằng nút bút (lưu `eduquiz_examdate` theo học sinh + chương trình). Còn ≤ 14 ngày số ngày tô đỏ. Chỉ đọc localStorage + cấu hình tĩnh.
- `check-js`, toàn bộ unit test, Thử thách hôm nay và lượt dò 30 trang chạy lại đều đạt.

## Soạn đề: hoàn tác, phím tắt, in nhiều mã đề, tải Word, nhập từ Excel (23/10/2026) — 0 Firebase

Tất cả trong `js/exam-builder.js` (+ `css/exam-builder.css`, `ic3-dashboard.html`), chạy trên máy giáo viên.

- **Hoàn tác / Làm lại** (nút ↶ ↷ trên thanh trên, Ctrl+Z · Ctrl+Y · Ctrl+Shift+Z): mọi thao tác — gõ chữ (gõ liền nhau gộp thành 1 bước), thêm/xoá/nhân bản/kéo câu, đổi dạng, sửa cài đặt đề, thêm từ ngân hàng/nhập nhanh. Tối đa 80 bước, chỉ trong bộ nhớ trang (mở đề khác hoặc tạo đề mới thì làm sạch). Hoàn tác xong con trỏ quay về đúng ô đang gõ.
- **Phím tắt**: Ctrl+S lưu · Ctrl+Enter thêm câu cùng dạng ngay sau câu đang soạn · Ctrl+D nhân bản · Alt+↑/↓ sang câu trước/sau · Alt+Shift+↑/↓ đưa câu lên/xuống · `?` mở bảng phím tắt (cũng có trong menu ⋯). Không chạy khi đang mở Xem trước/Ngân hàng/hộp thoại; mũi tên trong danh sách câu giữ cách cũ.
- **In đề · trộn mã đề · tải Word** (menu ⋯): chọn Đề cho học sinh / Đề kèm đáp án; tên trường in góc trên; **1–8 mã đề** (mã đầu tiên tuỳ chọn, mặc định 101), **trộn thứ tự câu** và **trộn đáp án A–D** (tự bật khi tăng số mã; câu Đúng/Sai giữ thứ tự); mỗi mã sang trang mới, có ô "Mã đề", dòng "— Hết —"; **trang bảng đáp án** theo từng mã (B, AC, Đ/S, nối cặp "1b 2a", sắp xếp "c→a→b"). **Tải Word** lưu cùng nội dung thành `.doc` để sửa tiếp trong Word. Cảnh báo nếu còn câu chưa hoàn chỉnh. Tên trường + mã đầu nhớ theo máy (`ic3_print_prefs`).
- **Nhập từ Excel** (Nhập nhanh): bôi đen ô trong Excel/Google Sheets rồi dán, hoặc **Chọn file .xlsx/.csv**, hoặc **Tải file mẫu** (.xlsx có sẵn 3 câu ví dụ; mất mạng thì mẫu .csv). Mỗi dòng: Câu hỏi · Đáp án A–F · Đáp án đúng (B, "A, C", Đúng/Sai) · Giải thích; có dòng tiêu đề thì đọc theo tên cột. Dòng sai báo số dòng bỏ qua kèm lý do. ExcelJS chỉ tải khi bấm (`js/services/lazy-script-loader.js` nay nạp ở dashboard). Cách dán từ Word (dấu *) giữ nguyên.
- **Sửa lỗi**: đổi câu Đúng/Sai sang Nối cặp/Sắp xếp bị điền sẵn "Đúng", "Sai" vào vế trái — nay để trống. Cột đáp án bên phải trong khung soạn bị cắt mép khi đáp án dài (lưới `1fr` giãn theo nội dung) — nay chia đều 2 cột.
- Chạy thử trong Chromium (giả lập đăng nhập giáo viên, chặn Firebase/mạng ngoài): gõ → hoàn tác → làm lại; đổi dạng; 3 lần hoàn tác xoá câu vừa thêm; dán bảng 4 dòng (đọc 3, bỏ 1 dòng lỗi); tải mẫu .xlsx rồi chọn lại chính file đó (đọc 3 câu); bảng phím tắt; in 2 mã đề (đáp án trộn khác nhau, bảng đáp án đúng) + tải Word. `check-js`, toàn bộ unit test đạt.

## Giao diện phẳng kiểu phần mềm thi — bỏ các chi tiết "đúc khuôn AI" (23/10/2026)

Mục tiêu: trông như phần mềm thi chuyên nghiệp (Certiport/IIG) thay vì mẫu giao diện tạo tự động. Không đổi chức năng, không thêm lượt Firebase/Apps Script.

- **Token chung `css/theme.css` (nạp ở cả 24 trang)**: bóng neumorphism (đôi sáng/tối, không viền) → bề mặt phẳng viền mảnh; `--glow-*` → bóng rất nhẹ; `--gradient-hero`/`--gradient-cta` → 1 màu navy; `--shine` tắt; `--lobby-bg` → nền phẳng; `--shadow-card` bỏ bóng "khối 3D" lệch 4px. Tên biến giữ nguyên nên 8 file CSS đang dùng không phải sửa. Chip "eyebrow" thôi nhún.
- **Trang học sinh (`style.css`, khối "GIAO DIỆN PHẲNG KIỂU PHẦN MỀM THI" cuối file)**: bỏ nền loang pastel trôi ở sảnh, chữ "EduQuiz IC3" tô gradient chuyển màu, nút tím→tím phát sáng (Bắt đầu, Câu tiếp, số câu, ô câu đang chọn), thanh tiến độ gradient chạy, mọi thứ nhấc lên khi rê chuột, icon Bắt đầu nhấp nháy.
- **Màn Kết quả**: bỏ icon to nhún nhảy, viền cầu vồng trên thẻ, chữ % gradient, quầng tím nền (style inline trong `index.html`). Sửa lỗi cũ: số % **nằm giữa vòng tròn** (chú thích nói vậy nhưng thiếu CSS nên vòng và số đứng cạnh nhau). Thứ bậc nút rõ: "Làm lại / Chọn bài khác" là nút chính navy; "Luyện lại câu sai" và "Ôn bằng thẻ ghi nhớ" là nút viền màu. Câu nhận xét viết lại kiểu giáo viên ("Đúng 9/14 câu. Khá. Xem lại các câu sai bên dưới.") thay vì khen chung chung và xưng "Bạn" lệch với "em" ở mọi chỗ khác.
- **Emoji làm icon → Font Awesome** cho đồng bộ: Thử thách hôm nay, Thẻ ghi nhớ, thẻ phần thưởng XP, nút Chữ to, dòng nhắc sảnh, thông báo Góc học tập, lưu mã kết quả. Mã chia sẻ Thử thách vẫn giữ ô 🟩🟥 (để dán vào Zalo), trên màn hình là ô màu vẽ bằng CSS.
- **Thử thách hôm nay**: nút sảnh thành thẻ trắng có vạch cam bên trái (hết nền gradient cam + tia sét nhấp nháy); hộp chơi tiêu đề phẳng; thanh thời gian 1 màu; luật chơi ghi rõ con số (500 điểm/câu đúng, +100 khi đúng liền).
- **Đăng nhập (`css/login.css`)**: bỏ nền loang trôi, logo nhún, nút gradient xanh lá→cam→navy phát sáng. **Giữ bộ 3 màu IIG** (từng được chọn theo logo) dưới dạng 3 sọc màu đặc trên đầu thẻ, nút navy đặc. **Màn chờ đăng nhập (`js/auth-guard.js`)**: nền phẳng, thẻ trắng viền mảnh, giữ ảnh minh hoạ.
- Không đổi: Đấu trường và các mini-game (phong cách game có chủ đích), màu 4 đáp án kiểu Kahoot trong Thử thách hôm nay, chế độ Chữ to vẫn dùng lời thân thiện cho học sinh tiểu học.
- Chụp kiểm tra trong Chromium (chặn mọi request ra ngoài): sảnh sáng/tối, làm bài, Kết quả, Thử thách hôm nay (1366×768, 390×844 tối), đăng nhập, màn chờ đăng nhập, Đấu trường, gom kết quả. `check-js` và toàn bộ unit test đạt.

## ⚡ Thử thách hôm nay + thẻ phần thưởng sau mỗi bài (23/10/2026) — 0 Firebase, 0 Apps Script

- **⚡ Thử thách hôm nay** (`js/daily-challenge.js`, `css/daily-challenge.css`): nút cam nổi bật hàng đầu khu nút phụ ở sảnh. Mỗi ngày 5 câu trắc nghiệm 1 đáp án (không ảnh) chọn theo **ngày + Chương trình/Cấp độ đang chọn** bằng hạt giống cố định → **cả lớp cùng đề trong ngày** (cùng thứ tự đáp án), so điểm với nhau được.
  - 20 giây/câu, thanh thời gian chạy; điểm theo tốc độ 500–1.000/câu + thưởng chuỗi đúng liền (tối đa +300). Đáp án 4 màu kiểu Kahoot, phím A–D/1–4, Enter qua câu, 🔊 nghe câu hỏi. Sau mỗi câu: đúng/sai + đáp án đúng + lời giải.
  - Kết quả: tổng điểm, lưới 🟩🟥, số giây, **chuỗi ngày 🔥**, kỷ lục, +XP; nút **📋 Chép kết quả gửi nhóm lớp** (kiểu Wordle, vd. "⚡ EduQuiz · Thử thách #53 (23/10) / IC3 LV3 · 4/5 câu · 3.420 điểm / 🟩🟩🟥🟩🟩 🔥5 ngày"); trình duyệt chặn clipboard thì khung kết quả bôi đen được để chép tay.
  - Chỉ lượt đầu trong ngày tính điểm/chuỗi/XP; làm lại = luyện tập. **Thoát giữa chừng** phải xác nhận và các câu chưa làm tính sai (không xem trước đề rồi làm lại được). Nút ở sảnh hiện "Đã xong hôm nay: 4/5 · 3.420 điểm" + 🔥 chuỗi.
  - Lưu `localStorage` `eduquiz_daily` theo học sinh đang chọn ở sảnh (chưa chọn tên → "Khách"), giữ 40 kết quả gần nhất mỗi em. Ngày tính theo giờ máy (không dùng UTC). Câu lấy từ file tĩnh `data/ic3` qua bộ tải sẵn có của `quiz-engine.js`; đã tải sẵn offline thì chơi được khi mất mạng. XP ghi qua `EduGamification.recordGameSession('daily-challenge')` (tính như 1 lượt game cho nhiệm vụ ngày).
- **Thẻ phần thưởng sau khi nộp bài** (`js/gamification.js`, `js/quiz-engine.js`): trước đây chỉ mini-game có thẻ +XP; bài thi chỉ có thông báo nhỏ khi được huy hiệu. Nay nộp bài (không tính lượt "Luyện lại câu sai") hiện thẻ +XP, thanh cấp độ chạy, 🎉 lên cấp, huy hiệu mới và **🔥 chuỗi ngày học liên tiếp**. `recordResult` trả thêm `prevXp`, `kind`, `streakUp` (tương thích ngược).
- `index.html` nạp thêm `js/game-sfx.js` (4,6 KB, âm thanh tự tổng hợp, tôn trọng nút tắt tiếng chung) để có tiếng đúng/sai/combo; CSS thử thách tải không chặn render như `learning-hub.css`.
- Chạy thử trong Chromium (chặn mọi request ra ngoài): 1366×768 sáng, 390×844 tối; đủ 5 câu bằng phím, hết giờ tự chấm, chuỗi 4 → 5 khi hôm qua đã làm, mở lại trong ngày hiện kết quả cũ, thoát giữa chừng, nộp bài thường → thẻ thưởng. `check-js`, `validate-data`, toàn bộ unit test đạt. Font: thêm Segoe UI/system-ui dự phòng vì offline không có font Google và "sans-serif" đậm trên Windows ra Arial Black làm xấu dấu tiếng Việt.

## Trang làm bài "Chữ to" cho học sinh tiểu học + Thẻ ghi nhớ (23/10/2026)

- **Chế độ Chữ to** (`js/kid-mode.js`, `css/kid-mode.css`): tự bật khi lớp ≤ 5 (hoặc chương trình Spark); nút **🔠 Chữ to** trên thanh trên cùng cho bật/tắt tay (nhớ theo máy, `localStorage` `eduquiz_kidmode`; bấm về đúng mặc định theo lớp thì xoá ưu tiên).
  - Chữ câu hỏi ~1,5rem, đáp án ~1,3rem, ô đáp án cao ~4,4rem, chữ A/B/C/D to; Đúng/Sai, nối cột, điền chỗ trống, dòng hướng dẫn đầu câu cũng to hơn.
  - **Đáp án đang chọn tô đặc màu + nhãn "✓ Em chọn"** (trước chỉ viền nhạt, các em khó nhận ra mình đã chọn chưa).
  - **Dòng nhắc dưới đáp án**: "👉 Em đã chọn: (B) Máy quét" / "👆 Em hãy bấm vào 1 đáp án" / "còn 1 đáp án nữa" / "đã trả lời 2/4 dòng" — mọi dạng câu, cả chế độ Kiểm tra (không lộ đúng/sai).
  - **🔊 Nghe câu hỏi**: đọc to câu hỏi + đáp án bằng giọng tiếng Việt của máy (Web Speech, không cần mạng ở Windows/Android có giọng vi-VN).
  - **Ôn luyện → Kiểm tra đáp án**: tô xanh "✓ Đáp án đúng" / đỏ "✗ Em chọn" ngay trên đáp án (bỏ danh sách đáp án lặp lại bên dưới), lời khen/động viên to, thẻ **⭐ Nhớ nhé** ghi câu hỏi ➜ đáp án đúng + nút 🔊 Nghe lại, tự cuộn tới kết quả. Đổi đáp án thì tô cũ tự xoá.
  - Dạng "Bấm vào hình" giữ chữ vừa phải để ảnh không bị thu nhỏ.
- **🃏 Thẻ ghi nhớ ở màn Kết quả** (`js/memory-cards.js`): mỗi câu sai/bỏ qua thành 1 thẻ lật — mặt trước câu hỏi (em tự nhớ lại), lật ra đáp án đúng + giải thích + 🔊. "😊 Em nhớ rồi" bỏ thẻ, "🤔 Chưa nhớ" đưa thẻ xuống cuối xấp để gặp lại; cuối buổi báo số thẻ nhớ ngay lần đầu và nhắc ôn tiếp ở Sổ tay câu sai (lặp lại ngắt quãng nhiều ngày). Dùng cho mọi lớp. Phím Esc/nút ✕ đóng.
- `js/quiz-engine.js` chỉ thêm 2 tín hiệu: `edu:quiz-updated` (cuối `updateSidebar`) và `edu:answer-checked` (`_renderCheckResult` / khi ẩn kết quả). Không đổi chấm điểm, không thêm lượt Firebase/Apps Script, không ghi gì mới ngoài 1 khoá ưu tiên.
- Đã chạy thử trong Chromium (học sinh lớp 3 và 4, 1366×768 và 390×844, sáng/tối): chọn đáp án, kiểm tra đúng/sai, mọi dạng câu trong bài Tổng hợp, nộp bài → ôn hết 10 thẻ, bật/tắt Chữ to. `check-js` và toàn bộ unit test đạt.

## Trang gom kết quả: "Câu cả lớp hay sai" + tạo đề ôn — chạy offline (23/10/2026)

- **Mục mới "4. Câu cả lớp hay sai"** ở `gom-ket-qua.html`: mã kết quả `EQR1` vốn đã mang uid câu sai (trường `w`, ≤ 30 câu/bài) nhưng trước đây trang gom bỏ qua. Nay bấm **🔍 Phân tích câu sai** → 15 câu sai nhiều nhất theo bộ lọc lớp/bài đang chọn, mỗi câu có số lượt sai, số học sinh, % bài, bấm mở xem đáp án đúng + giải thích. Đổi bộ lọc hoặc thêm mã thì tự tính lại; bấm sắp xếp cột bảng điểm thì giữ nguyên.
- **📝 Tạo đề ôn**: dựng link đề `index.html?de=…` từ ≤ 20 câu sai nhiều nhất (cùng cấp độ với câu đứng đầu), chép sẵn vào clipboard và hiện ô link để chép tay khi trình duyệt chặn clipboard. Giống nút cùng tên ở dashboard giáo viên.
- **0 Firebase, 0 Apps Script, không cần đăng nhập**: đếm trên máy (`EduResultPack.wrongStats`, có test), nội dung câu tra từ file tĩnh `data/ic3`. File khối (~1 MB) chỉ tải khi bấm Phân tích. Mất mạng mà máy chưa tải sẵn ngân hàng câu hỏi thì vẫn hiện uid + số lượt sai, kèm dòng giải thích. Dữ liệu học sinh (uid trong mã) đưa lên trang đều được escape.
- **Tách `js/services/question-bank-lookup.js`** (tra uid → câu + hiển thị đáp án gọn) khỏi `js/teacher/wrong-questions.js` để dashboard giáo viên và trang gom dùng chung; dashboard giữ nguyên hành vi.
- Test: thêm 5 kiểm tra `wrongStats` trong `result-pack.test.js` (uid lặp trong 1 bài chỉ tính 1, 1 em nộp 2 lần vẫn tính 1 HS, thứ tự xếp hạng). Đã chạy thử trong Chrome: gom 4 mã → phân tích → lọc lớp → tạo đề ôn → link mở đúng đề ở trang làm bài; tải lại trang vẫn khôi phục; Xoá hết thì mục 4 trở về trạng thái ban đầu. Dashboard giáo viên vẫn tra được câu. `check-js`, `validate-data`, toàn bộ unit test, test Apps Script đều đạt.

## Cài như ứng dụng (PWA) + trang gom kết quả giữ dữ liệu (21/10/2026)

- **Cài lên màn hình chính** (`manifest.webmanifest`, `img/pwa/*`, gắn vào `index.html` và `arena.html`): Chrome báo đủ điều kiện cài (không lỗi manifest/installability). Icon từ `favicon.svg`: 192/512 bo góc, bản maskable 512 và `apple-touch-icon` 180 nền tràn (dấu tick nằm trong vùng an toàn 80%). Có lối tắt "Đấu trường". Kết hợp nút "Tải sẵn để dùng offline": cài rồi mở từ màn hình chính vẫn chạy khi mất mạng. Nút tải sẵn nay cũng lưu `gom-ket-qua.html`, manifest và icon.
- **`gom-ket-qua.html` giữ dữ liệu khi đóng tab** (`js/gom-ket-qua.js`): các mã đã gom lưu vào `localStorage` của trình duyệt giáo viên (tối đa 2.000 bài) và nạp lại khi mở lần sau. Chỉ lưu **mã gốc** và kiểm tra lại từng mã mỗi lần nạp (dữ liệu bị sửa tay hoặc hỏng JSON bị bỏ qua, không vỡ trang). Nút "Xoá hết, làm lại" xoá cả bộ nhớ; trang có dòng nhắc dùng máy chung thì xoá sau khi tải CSV. `localStorage` bị chặn → vẫn dùng được và cảnh báo nhớ tải CSV.
- `EduResultPack.parseMany` trả thêm `codes` (mã gốc từng dòng) — tương thích ngược; thêm 1 kiểm tra trong `result-pack.test.js`.
- README cập nhật: tải sẵn offline/PWA, mã kết quả + trang gom, QR, thẻ thưởng, cấu hình TURN.

## Tải trang sảnh nhanh hơn: hiện nội dung sớm ~0,9 giây (21/10/2026)

Đo bằng Lighthouse mobile (giả lập Slow 4G + CPU chậm 4×) trên máy chủ tĩnh có gzip, mạng ngoài bị chặn nên **không đo được font Google/icon CDN**; số đo chỉ để so sánh trước/sau, chạy 3 lần lấy trung vị.

| Chỉ số | Trước | Sau |
|---|---|---|
| Performance | 79 | ~87 (85–89) |
| FCP | 3,3 s | 1,7 s |
| Speed Index | 4,8 s | ~2,8 s |
| CLS | 0 | 0,009 |
| Accessibility / Best Practices / SEO | 100 / 96 / 100 | 100 / 96 / 100 |

- **Nguyên nhân chính**: các hiệu ứng mở trang (`moPageEnter` của `body` ở `css/motion.css`, `lobbyFadeIn` của `#lobby`, `cardRise`/`lobbyRise` của thẻ form, logo, link giáo viên) đều bắt đầu từ `opacity:0` nên trình duyệt chưa tính là đã hiển thị nội dung cho tới khi chạy xong (~0,9 s). `index.html` có khối `<style>` cuối `<head>` tắt các hiệu ứng mờ dần này; chỉ còn thẻ form trượt nhẹ lên (chỉ `transform`, không đụng opacity), tắt hẳn khi `prefers-reduced-motion`. Các trang khác không đổi.
- **CSS không cần cho lần vẽ đầu tải không chặn** (`review-detail`, `learning-hub`, `result-pack`, `motion`): `media="print"` + `onload` đổi sang `all`, có `<noscript>` dự phòng. Vị trí trong DOM giữ nguyên nên thứ tự cascade không đổi. `style.css`, `theme.css`, `accessibility.css`, `a11y-assistant.css` vẫn chặn render như cũ.
- **`global-error-handler.js` thêm `defer`**: vẫn chạy đầu tiên trong dãy script defer và `index.html` không có script nội tuyến chạy sớm hơn, nên vẫn bắt lỗi của mọi script còn lại; bỏ ~0,3 s chặn render.
- **Chống dịch chuyển bố cục** (`style.css` § `#lobby::after`): lớp nền blob màu đổi `absolute` → `fixed`. Khi nội dung hiện sớm hơn, lobby cao lên lúc JS đổ danh sách vào ô chọn làm lớp nền 120% này đổi kích thước (CLS 0,13). Giao diện nhìn như cũ.
- Nút "Tải sẵn để dùng offline" nằm trọn 1 hàng thay vì lẻ 1 cột.
- **Chưa làm (có chủ ý)**: tách `style.css` (36 KB gzip, ~86% chưa dùng ở sảnh) thành phần sảnh + phần bài thi, và minify JS/CSS. Tách CSS làm đổi thứ tự cascade nên cần so sánh giao diện từng dạng câu hỏi trước khi đưa lên; minify chỉ giảm vài KB gzip. Lighthouse sau đây vẫn báo "chưa nén" và "cache ngắn" (GitHub Pages cố định `max-age=600`).
- Đã kiểm tra lại: toàn bộ unit test, `check-js`, 27 + 12 kiểm tra trình duyệt cũ, và một lượt thật sảnh → làm bài → nộp → màn kết quả (CSS tải không chặn vẫn áp dụng, bảng xuất mã hiển thị đúng).

## Phòng thi P2P: QR, offline-first, gom kết quả, thẻ thưởng (19/10/2026)

- **QR vào phòng** (`js/arena/arena-room.js`, `js/vendor/qrcode.min.js` — qrcode-generator 1.4.4, MIT): sảnh phòng của giáo viên hiện mã QR của link `arena.html?phong=MÃ`; học sinh quét bằng camera điện thoại. Thư viện chỉ nạp khi mở sảnh phòng. Đã quét thử bằng bộ giải mã QR thật.
- **TURN riêng** (`js/backend-config.js` → `arenaRoom.turn`): mạng trường chặn WebRTC thì khai thêm máy TURN; danh sách được GỘP với STUN/TURN mặc định của PeerJS (không đè mất). Để trống = chạy y như trước. Thông báo lỗi khi không nối được máy chủ trung gian nay có gợi ý cách xử lý.
- **Tải sẵn để dùng offline** (`js/offline-pack.js`, `sw.js`, nút ở sảnh `index.html`): tải trọn ngân hàng câu hỏi của khối đang chọn + từng bài + ảnh trong câu hỏi + khung trang (index, arena) vào Cache Storage. Mất mạng vẫn mở trang, làm bài, chơi Đấu trường tự chơi. `CACHE_VERSION` v1 → v2 (xoá cache cũ). Font Google/icon CDN không lưu được (offline dùng font hệ thống). `arena.html` nay cũng đăng ký Service Worker.
- **Xuất kết quả thành mã/file** (`js/services/result-pack.js`, `js/result-pack-ui.js`): nộp bài xong, máy học sinh tự lưu mã `EQR1.…` (60 bài gần nhất, chỉ localStorage); màn Kết quả có nút Chép mã / Tải file / Tải tất cả. Không đổi đường nộp hiện có (Sheet/Firestore, hàng đợi gửi lại).
- **Trang giáo viên gom kết quả** (`gom-ket-qua.html`, `js/gom-ket-qua.js`): dán mã hoặc chọn nhiều file → bảng điểm (sắp xếp, lọc lớp/bài, tô đỏ < 50%) + tải CSV. Chạy hoàn toàn trên máy, không mạng, không đăng nhập; tên học sinh đưa lên trang bằng `textContent` (không chèn HTML); CSV chặn công thức độc. Link từ sảnh index.
  - **Giới hạn trung thực**: mã chỉ có CRC32 để bắt lỗi chép sai/thiếu — KHÔNG chống học sinh cố tình tự tạo mã giả. Kỳ kiểm tra cần chống gian lận vẫn dùng đường nộp có tài khoản hoặc Phòng cả lớp.
- **Thẻ thưởng + chuỗi trong Phòng cả lớp, chế độ Tốc độ** (`js/arena/arena-room-core.js`): đúng liền 3 câu → thẻ 🃏 x2 (câu đúng kế tiếp nhân đôi điểm), liền 6 → 🛡️ Khiên (câu sai kế tiếp không mất chuỗi), cứ 3 câu đúng nhận 1 thẻ luân phiên. Máy giáo viên cấp và áp dụng, học sinh không gửi thêm gì nên không gian lận được. Bảng xếp hạng hiện 🔥 chuỗi từ 3. Phòng lưu từ bản cũ tự có túi thẻ rỗng. Chế độ Đua không đổi.
- **Sảnh `index.html`**: thêm `role="main"` và gắn `for=` cho 7 nhãn ô chọn (a11y). Ảnh `img/` đã tối ưu sẵn (thử nén chỉ giảm 1,5%) nên giữ nguyên, không đánh đổi chất lượng.
- Test: thêm `js/services/__tests__/result-pack.test.js` (27 kiểm tra) và 13 kiểm tra thẻ thưởng trong `arena-room-core.test.js`; `validate-data`, `check-js` (158 file), toàn bộ unit test đều đạt. Đã chạy thử trong Chromium: tải sẵn → tắt hẳn máy chủ → vẫn mở trang/đọc câu hỏi/ảnh từ cache; xuất mã → trang gom → CSV; QR → giải mã đúng link; giao diện thẻ thưởng.

## Bài nộp chỉ lưu Google Sheet + vá giới hạn Apps Script (15/10/2026)

- **Mặc định `quizResults.firestore: 'off'`** (`js/backend-config.js`): học sinh làm bài/nộp bài không nạp Firebase → 0 lượt ghi Firestore, 0 lượt reCAPTCHA (trần 10.000/tháng). Dashboard giáo viên / điều phối / tab Báo cáo tự đọc Google Sheet qua Apps Script.
- **Sheet đủ dữ liệu như Firestore**: cột mới **P – ChiTiet** trong `NhatKyNopBai` (số câu sai / bỏ qua, giây làm bài, chương trình / cấp / bài, hết giờ, 6 bộ đếm vi phạm nâng cao). `listResults_` dùng cột này khi có. Dữ liệu lạ bị lọc (`cleanDetail_`).
- **Deploy lệch thứ tự vẫn an toàn**: Apps Script bản cũ chưa có `listResults` → dashboard tự đọc Firestore cho phiên đó.
- **Vá giới hạn Apps Script**: (1) PropertiesService 50.000 lượt/ngày — trước đây mỗi bài nộp đọc 1 lượt, nay qua CacheService; (2) trần 10 triệu ô/file **tính cả ô trống** — cắt 26 → đúng số cột, và mọi tab nhật ký (bài nộp, MOS, hoạt động, Đấu trường) tự sang file mới khi tab > 300.000 dòng hoặc file > 8 triệu ô; (3) dashboard làm mới chỉ đọc khối nhỏ (200 dòng, tăng dần) thay vì 5.000 dòng; (4) hàng đợi gửi lại rải ±50% + trễ ngẫu nhiên khi có mạng lại để không dồn cục vào 30 lượt chạy song song.
- **Sửa lỗi dashboard kẹt ở "Đang kiểm tra đăng nhập..."** (`js/auth-guard.js`): khi Firebase xác nhận đăng nhập trước `DOMContentLoaded` (phiên có sẵn, máy nhanh), lớp phủ bị gắn vào SAU khi đã gỡ → che kín dashboard mãi.
- **"Học sinh xuất sắc" chỉ gồm em đạt ≥ 80%** (`EduAnalytics.topStudents`): trước đây lấy top 20 bất kể điểm — lớp ít học sinh thì em 40% (đang ở "cần hỗ trợ") vẫn hiện là "xuất sắc", cả trên dashboard lẫn file Excel/PDF xuất ra.
- Đã chạy thử dashboard giáo viên, điều phối và tab Báo cáo (admin) ở chế độ đọc Sheet (Firebase + Apps Script giả lập): số liệu đúng, kết quả bài làm 0 lượt đọc Firestore; Apps Script cũ → tự đọc Firestore.
- **Khoá ghi công khai `quiz_results`** (`firestore.rules` → `quizResultsOpen()` = false): web không còn ghi vào đây, nhưng trước đây ai cầm apiKey công khai cũng ghi rác được (đốt 20.000 lượt ghi/ngày + 1 GiB). Test CI `js/services/__tests__/backend-consistency.test.js` báo đỏ nếu `quizResults.firestore` và công tắc rules lệch nhau. Lưu ý: ở chế độ Firestore cũ, `examMode` và 6 bộ đếm vi phạm chưa từng được lưu (js/firestore-results.js lọc bỏ) — chế độ Sheet giờ đủ hơn.
- **Hàm `kiemTraSauDeploy`** (menu 🎯 Công cụ IC3 → 🩺 Kiểm tra sau khi deploy): ghi 1 bài mẫu, đọc lại kiểm cột ChiTiet, số cột, mức dùng ô của file, bộ đệm Properties, rồi tự xoá bài mẫu.
- **`node scripts/check-deployed-backend.js`**: so phiên bản Apps Script đang chạy thật (GET `?action=ping`, chỉ đọc) với `BACKEND_VERSION` trong code. Ngày 15/10/2026: đang chạy **2026-10-14**, code **2026-10-15** → cần deploy. Bản 2026-10-14 đã có `listResults`, nên push web trước cũng không mất dữ liệu (chỉ thiếu cột ChiTiet và nút lưu Sheet của Phòng cả lớp).
- **Thứ tự deploy:** (1) dán apps/Code.gs → Save → Run `kiemTraSauDeploy` (đủ ✅) → Deploy *New version*; (2) publish `firestore.rules`; (3) push web.
- **Cần deploy Apps Script bản mới (apps/Code.gs) TRƯỚC khi push web.** Nếu lỡ push web trước: bài nộp vẫn lưu Sheet đủ (Apps Script cũ bỏ qua cột mới), dashboard tạm đọc Firestore.

## Rà soát toàn dự án — sửa lỗi (10/2026)

- **Bảo mật — trang đăng nhập**: `login.html?next=` trước đây chuyển tới BẤT KỲ địa chỉ nào sau khi đăng nhập → link `?next=javascript:...` chạy mã trong phiên giáo viên/admin, hoặc đưa sang web lừa đảo. Nay chỉ nhận trang cùng tên miền (`js/login.js` § safeNext).
- **Phần tử "đã ẩn" vẫn hiện** (lỗi lặp lại khắp dự án): JS ẩn bằng `el.hidden = true` nhưng CSS `display:flex/grid` của class đè mất. Thêm `[hidden]{display:none!important}` vào `css/theme.css`, `css/motion.css`, `css/exam-simulator.css` (phủ cả 29 trang). Sửa 11 chỗ đang sai: đồng hồ "50:00" vẫn hiện ở chế độ **Ôn luyện** (không giới hạn giờ), khung KPI/biểu đồ/danh sách theo dõi rỗng hiện trước khi tải xong ở dashboard giáo viên + điều phối, ô lọc trường ở dashboard giáo viên, bước 3–4 của MOS Practice hiện sớm, khung "so với lần trước" ở kết quả, đầu bảng ngân hàng câu ở Soạn đề, hồ sơ/ô đăng bài ở portfolio, ô ảnh câu hỏi ở Đấu trường.
- **Mô phỏng Máy tính** (`js/computer-simulator.js`): bấm Kiểm tra / Thư mục mới / Xoá / Tìm kiếm trước khi chọn nhiệm vụ (bàn phím đi xuyên lớp phủ) → lỗi `null`; xoá chính thư mục đang mở từ ô Tìm kiếm → trang trắng. Thêm chặn + tự quay về thư mục gốc.
- Đã kiểm tra, không phát hiện lỗi: 29 trang tải không lỗi JS/không file 404; 648 ảnh câu hỏi đều có; link đề `?de=` chứa mã độc ở mọi trường không chạy được ở index/arena/mos-practice; dashboard escape dữ liệu học sinh gửi lên; rules `users` không cho tự nâng quyền; luồng làm bài → nộp (Ôn luyện + Kiểm tra) đưa bài vào hàng đợi gửi lại khi Apps Script lỗi; 16 trò chơi/mô phỏng chạy thử ngẫu nhiên không lỗi.

## Phòng cả lớp trong Đấu trường — nhiều học sinh cùng chơi, 0 lượt Firebase (10/2026)

- **Gộp `live-quiz.html` vào `arena.html`**: thẻ mới "Phòng cả lớp" ở màn chọn. Giáo viên chọn bộ câu (ngân hàng hoặc đề `?de=`), chế độ ⚡ Tốc độ / 🏁 Đua về đích, số câu, giây/câu, số người tối đa (30–80) → "Tạo phòng" → máy chiếu hiện mã 6 ký tự + link `arena.html?phong=MÃ`. Học sinh dùng biệt danh + Linh vật của Đấu trường, không cần tài khoản.
- **Chạy ngang hàng WebRTC** (`js/arena/arena-room.js`, PeerJS 1.5.4 tự host ở `js/vendor/peerjs.min.js`): máy giáo viên giữ trạng thái và tự chấm (cùng công thức điểm Kahoot/Đua của Đấu trường 1 người — `js/arena/arena-room-core.js`, có test). **0 lượt đọc/ghi Firebase** — trước đây mỗi câu trả lời 1 lượt ghi, mỗi lần chuyển câu 1 lượt đọc × cả lớp (chỉ đủ ~3 phòng 40 HS/ngày với gói Spark). Máy chủ bắt tay mặc định `0.peerjs.com`; đổi ở `EduBackend.arenaRoom`.
- **Công bằng hơn**: đáp án đúng chỉ gửi xuống sau khi chốt câu (live-quiz cũ gửi sẵn câu kế tiếp trong document phòng); thời gian trả lời đo bằng đồng hồ máy giáo viên; mọi người đang kết nối đã trả lời → chốt sớm.
- **Bền với mạng trường**: học sinh rớt mạng / tải lại trang tự nối lại và giữ điểm (mã máy lưu localStorage); máy giáo viên tải lại trang → "Tiếp tục điều khiển" khôi phục phòng (học sinh tự nối lại). Đã thử thật 50 học sinh cùng vào 1 phòng (vào đủ trong ~12 giây, nhận đủ 50/50 câu trả lời mỗi câu).
- **Lưu kết quả**: trên máy giáo viên (Lịch sử 20 phòng, tải CSV có Đ/S từng câu + tỉ lệ cả lớp đúng từng câu + đáp án), và tuỳ chọn **1 lượt Apps Script cho cả phòng** → tab `NhatKyDauTruong` (API mới `arenaRoomLog`, cần đăng nhập giáo viên, chống ghi trùng). Học sinh nhận xu Linh vật theo hạng như chơi 1 người.
- **Cần deploy Apps Script bản mới** (apps/Code.gs, `BACKEND_VERSION` 2026-10-15) TRƯỚC khi push web, nếu muốn dùng nút "Lưu lên Google Sheet" — CSV/lịch sử trên máy chạy được ngay không cần deploy.
- `live-quiz.html` chỉ còn chuyển hướng (giữ `?de=`); bỏ `js/live-quiz.js`, `css/live-quiz.css`. Nút "Chơi trực tiếp" ở Soạn đề và ô "Thử thách cùng lớp" ở Khu Vui Chơi mở Phòng cả lớp. Không còn cần Anonymous Auth.

## Đối chiếu ngân hàng câu hỏi với đáp án gốc "All Key" (10/2026)

- **Nguồn đối chiếu**: 6 file iSpring `All Key/*.quiz` (IC3 LV1–3, Spark LV1–3, NH2025-2026 — kể cả nhóm "Cập nhật/Bổ sung 10/04/2026"), 830 câu. Đọc `document.json` trong file .quiz (chỉ đọc), so từng câu với `data/ic3` theo nội dung câu hỏi + lựa chọn (chuẩn hóa chính tả kĩ/kỹ, lí/lý…; nhận cả câu được dịch/biên tập lại) và so đáp án theo từng dạng (trắc nghiệm, Đúng/Sai nhiều dòng, ghép nối, sắp xếp). **Mọi ca lệch/thiếu đều được đọc tay** trước khi sửa.
- **Thêm 19 câu còn thiếu** (vào bộ "Theo chủ đề" đúng PPCT, kèm giải thích): IC3 LV1 9 (hạ tầng mạng, chuẩn bị họp số, nguyên tắc mật khẩu, HĐH di động, in nhiều trang chiếu/tờ, khô mắt, lợi ích cộng tác, 2 bản mới câu duyệt web ẩn danh), IC3 LV2 3 (Webinar, đồng tác giả = đồng bộ, bản mới nguyên tắc thiết kế phần cứng), IC3 LV3 3 (Excel/Access, toán tử Boolean AND/OR/NOT, ngụy biện bản 2), Spark LV1–3 4.
- **Sửa 14 câu lệch đáp án / phiên bản cũ** (giữ nguyên uid, sửa ở mọi bản sao trong bộ chủ đề/Bài/Tiết, viết lại giải thích) — vd IC3 LV1 `t6__q2` (nhìn vào camera), `t3__q13` (thêm "xuất bản trước 1924", chọn 2); IC3 LV2 `t4__q15`/`t4__q32` (tạo Macro bằng viết lệnh là Đúng), `t6__q42` (thiếu dòng 4, nhãn Có/Không bị đảo); IC3 LV3 `t6__q41`, `t6__q44`, `t3__q23`, `t7__q20` (bỏ lựa chọn nhiễu "dùng trình quản lý mật khẩu" vốn là biện pháp tốt), `t2__q2` (thiếu cặp thứ 4); Spark LV3 `t6__q7` (lựa chọn đúng dính chữ ": Đây là lựa chọn tốt nhất." — lộ đáp án).
- Câu có **nhiều phiên bản trong khoá** (vd duyệt web ẩn danh 4 bản, nguyên tắc thiết kế 2 bản) → giữ bản cũ, thêm bản mới thành câu riêng (không ghi đè).
- Kết quả: khớp 633 → 664/830; phần còn lại đã rà: câu có sẵn nhưng diễn đạt khác, câu dạng ảnh (chọn vùng/kéo thả hình — so được câu, không so được đáp án), hoặc các ca cần giáo viên quyết (dưới).
- Quyết định + nguồn từng câu ở **`data/ic3/allkey-sync.json`**; áp dụng `node scripts/apply-allkey-sync.js` → `python scripts/split-minitests.py`; CI `--check`.
- **Cần giáo viên xác nhận (chưa sửa — khoá có vẻ sai hoặc mâu thuẫn với data có giải thích):** IC3 LV2 `t3__q8` (khoá: "Tổ chức tài trợ nghiên cứu" KHÔNG ảnh hưởng độ tin cậy, "Mức độ phổ biến" CÓ — ngược logic); IC3 LV2 `t4__q1` (khoá: lưu trữ đám mây kém an toàn hơn cục bộ = Đúng); IC3 LV1 `t1__q30` ↔ câu khoá Test3#8 (khoá nói phần mềm độc quyền kém an toàn hơn nguồn mở, data nói ngược lại); IC3 LV3 khoá BaiOnSo3#31 ghi "Hai kỹ năng… (Chọn 3)".
- **Chưa thêm được (cần ảnh gốc):** IC3 LV1 Test2#40 (kéo hình hướng trang), Spark LV1 Test 3#9 (chọn thẻ có lệnh Close/Quit), Test 3#18 (vị trí ô địa chỉ email lớp trưởng).

## Bộ "Theo chủ đề" đúng chủ đề, không trùng lặp — bám PPCT (10/2026)

- **Rà soát 1.102 câu** của 7 chủ đề × 6 cấp (Spark/IC3 LV1–3). Chuẩn đối chiếu = **PPCT 2026–2027 của từng cấp** (bảng "Bài N → Chủ đề IC3" trong `Tài Liệu Bàn Giao/…/PPCT_*.xlsx`) + ngân hàng câu "Củng cố" theo bài (`Quiz/*_CungCo.xlsx`, đã có trong bộ "Theo tên bài"): so nội dung từng câu chủ đề với câu Củng cố của các bài thuộc mỗi chủ đề, **đọc từng câu lệch rõ** rồi mới quyết định (không chuyển tự động).
- **176 câu chuyển đúng chủ đề** — vd Spark LV1 "6. Hợp tác, cộng tác" trước có 25 câu nhưng chỉ 5 câu về cộng tác (còn lại: người lạ hỏi địa chỉ, thời gian dùng màn hình → An toàn; email/tin nhắn/video chat → Giao tiếp; dấu trang/lịch sử duyệt web → Quản lý thông tin…). Ranh giới theo PPCT từng cấp (vd "Sở hữu trí tuệ" là Sáng tạo nội dung ở IC3 LV3 nhưng Quản lý thông tin ở Spark LV3).
- **45 câu trùng bị bỏ khỏi bộ chủ đề** (cùng câu hỏi + đáp án, chỉ đổi dạng câu/thứ tự — phần lớn là bản `_new`/`_new2` của câu gốc); câu vẫn còn trong bộ "Ôn tập cuối kỳ" (Tiết). Trong đó `spark__lv3__t2__q74_new2` có **đáp án bị đảo ngược** so với `t4__q5` (cùng 3 tình huống "ẩn danh") — bỏ bản sai.
- Kết quả: 0 câu trùng / 0 câu ở 2 chủ đề (trước: 50 cặp gần trùng); câu khớp nội dung nhất với đúng chủ đề 54% → 69%.
- Mọi quyết định + lý do nằm ở **`data/ic3/topic-reassign.json`** (sửa/hoàn tác được); áp dụng bằng **`node scripts/apply-topic-reassign.js`** rồi `python scripts/split-minitests.py`. CI: `apply-topic-reassign.js --check` + `validate-data.js` báo lỗi nếu 1 câu nằm ở 2 chủ đề hoặc có câu trùng nội dung trong bộ chủ đề.
- Link đề giáo viên cũ (`?de=` trỏ "chủ đề cũ + uid") vẫn mở đủ câu: `custom-exam-codec.js` tìm theo uid trong cả cấp độ khi không thấy ở chủ đề cũ.
- **Cần giáo viên xem lại** (cùng câu hỏi nhưng đáp án khác nhau, chưa sửa): IC3 LV3 `t1__q192` ↔ `t4__q7` (sửa từ điển/AutoCorrect trong Word), `t6__q14` ↔ `t6__q18` (trao đổi với khách hàng).

## Form sảnh không lãng phí khoảng trống (10/2026)

- **Mỗi bước 1 cột** (`index.html`: `.lobby-col-1/2/3`, `style.css` § FORM KHÔNG LÃNG PHÍ KHOẢNG TRỐNG):
  - **≥ 1400px — 3 cột** [1 Em là ai?] [2 Chọn bài] [3 Cách làm bài + Bắt đầu]: form rộng tới 1520px, cao chỉ ~460px (1 cột trước đây ~945px); 3 cột cao gần bằng nhau (393/358/399px). Cột giữa rộng nhất cho 5 nhóm bài + tên bài dài.
  - **Màn rộng + cao (≥1400×850, máy chiếu)**: phóng to chữ/ô chọn/nút Bắt đầu để dùng khoảng trống dọc, đọc rõ từ cuối lớp.
  - **960–1399px — 2 cột** [1 + 2] | [3]: thêm thẻ **"Bài em sắp làm"** (tên bài, cấp độ, số câu, chế độ/thời gian, tên học sinh — `js/lobby-form-ux.js`) lấp phần trống cột phải, giúp kiểm tra lại trước khi bấm Bắt đầu; ẩn khi chọn Kiểm tra (ô thời gian + cam kết đã đủ). Phần dư chiều cao dồn xuống cuối (trước bị hở giữa bước 1 và 2). Tablet ngang 1024px giờ 2 cột thay vì 1 cột hẹp giữa màn.
  - **< 960px — 1 cột**, không có thẻ tóm tắt (không dài thêm trên điện thoại).
- Đã đo trên Chrome headless ở 1918×914, 1600×900, 1366×768, 1024×768, 960×600, 820×1180, 390×844: không tràn ngang, nút Bắt đầu thấy ngay không cần cuộn trên mọi màn ≥ 960px.

## Sảnh chỉ còn form — bỏ chi tiết thừa, responsive (10/2026)

- **Gỡ khối trang trí bên trái** (bàn phím 3D xoay + chữ tự gõ + "Kéo để xoay") và nút chuyển "Giới thiệu ⇄ Làm bài" khỏi `index.html`; bỏ nạp `js/carousel-3d.js`, `js/carousel-keyboard-cards.js` (vòng `requestAnimationFrame` chạy liên tục — nặng cho máy trường). File vẫn còn trong repo, không trang nào khác dùng.
- **Nền tĩnh**: tắt "bong bóng" trôi phía sau và chữ thương hiệu đổi màu liên tục.
- **Form nằm giữa trang**; màn ≥ 1100px chia **2 cột** (trái: 1 Em là ai? + 2 Chọn bài · phải: 3 Cách làm bài + Bắt đầu + nút phụ) → cả form vừa 1 màn hình 1366×768 / 1918×914, không cần cuộn; màn hẹp hơn: 1 cột. 5 nhóm bài luôn 1 hàng ở màn rộng.
- "Chuyển tài khoản" → link nhỏ "🔑 Giáo viên / Quản trị" dưới form (giữ `id="adminEntryLink"`).
- `js/main.js`: luôn mở form — máy từng lưu `ic3_lobby_view = 'intro'` trước đây sẽ bị ẩn mất form ở màn hẹp.
- Đã thử 1918×914, 1366×768, 1024×768, 768×1024, 390×844, 360×640 (sáng/tối): form luôn hiện, bước 1 không bị che, không tràn ngang; màn rộng thấy nút Bắt đầu không cần cuộn.

## Form chọn bài ở sảnh to, rõ, ít rối (10/2026)

- **3 bước có số** thay cho 2 nhãn nhỏ: **1 Em là ai?** (Trường/Lớp/Họ tên) → **2 Chọn bài** (Chương trình/Cấp độ/Bài luyện tập) → **3 Cách làm bài** (Ôn luyện/Kiểm tra, thời gian, cam kết). "Chế độ làm bài" chuyển xuống sau phần chọn bài (chọn *bài gì* rồi mới *làm thế nào*). Mỗi bước hiện ✓ xanh khi xong (`js/lobby-form-ux.js`).
- **Dòng nhắc dưới nút Bắt đầu**: "👉 Chọn Trường / Lớp / Họ và tên / Tick ô cam kết… để bắt đầu" → "✅ Sẵn sàng" — học sinh biết ngay vì sao nút còn mờ. Chỉ đọc form, quy tắc bật nút vẫn ở `quiz-engine.js § refreshMeta()`.
- **To hơn, tương phản hơn** (`style.css` § FORM SẢNH TO, RÕ): thẻ rộng 680px, nhãn 0.95rem màu chữ chính (trước: tím đậm trên nền tối gần như không đọc được), ô chọn cao ~50px chữ 1.05rem, nút đang chọn **tô đặc màu tím chữ trắng**, Ôn luyện/Kiểm tra thành 2 thẻ lớn (tên to + chú thích), 5 nhóm bài 1 hàng, nút Bắt đầu 1.3rem. Góc học tập · Đấu trường · Lịch sử gom 1 hàng ô nhỏ bên dưới để nút Bắt đầu nổi bật nhất.
- **Sửa lỗi có sẵn**: (1) panel căn giữa dọc làm phần đầu form tràn lên trên và **không cuộn tới được** khi màn hình thấp (1366×768, máy chiếu) — nay luôn thấy bước 1, nút Bắt đầu nằm trong màn hình ở 1366×768 và 1906×918; (2) mở link đề giáo viên, ô Chương trình/Cấp độ lẽ ra bị ẩn nhưng vẫn hiện (`display:grid` thắng `[hidden]`) — nay ẩn đúng, khung tên đề nằm ngay trong bước 2.
- Đã thử trên Chrome headless (sáng/tối, 1906×918, 1366×768, 390px): đi đủ các bước, dòng nhắc và ✓ đúng, nhãn "Kiểm tra · N phút/bài" vẫn đổi theo thời gian, không tràn ngang.

## Đấu trường — chơi bộ câu hỏi kiểu Kahoot / Blooket (10/2026) — 0 lượt Firebase

- **Trang mới `arena.html`** (`js/arena/arena.js`, `css/arena.css`; logic thuần `js/arena/arena-core.js`): học sinh chơi 1 bộ câu với 3–5 đối thủ máy (Dễ/Vừa/Khó), ngay trên máy mình — không tài khoản, không gửi gì ra ngoài.
  - **⚡ Tốc độ** (kiểu Kahoot): 4–6 ô màu + hình ▲◆●■ (phím 1–6), điểm 500–1000 theo tốc độ, thưởng chuỗi đúng (+100…+500), bảng xếp hạng sau mỗi câu, "▲ lên hạng", **bóng ma kỷ lục** (👻 chạy lại điểm lần tốt nhất của chính em trên cùng bộ câu), bục vinh quang.
  - **💰 Săn vàng** (kiểu Blooket Gold Quest): đúng → chọn 1 trong 3 rương (+vàng, ×2, ×3, mất 25/50%, lấy 10/25% của người giàu nhất, đổi vàng); đối thủ máy cũng mở rương và có thể cướp/đổi vàng của em.
  - **🏁 Đua về đích** (kiểu Blooket Racing): đúng → +1 bước, 3 câu đúng liền → tăng tốc +2; đường đua hiển thị trực tiếp.
  - Sai thì hiện đáp án đúng + giải thích; cuối trận xem lại câu sai. Âm thanh/hiệu ứng dùng chung `game-sfx.js`/`game-fx.js`, XP qua `EduGamification`.
- **Linh vật** (kiểu "Blook"): xu kiếm theo số câu đúng + thứ hạng (tối đa 60/ván) → mở 4 hộp (Phần cứng, Internet, An toàn, Thú cưng; 36 linh vật, 5 độ hiếm Thường → Bí ẩn), trùng thì hoàn xu; chọn làm ảnh đại diện trong trận. Lưu localStorage `eduquiz_arena_v1` theo biệt danh; hồ sơ mới 0 xu (đổi biệt danh không "cày" được xu).
- **Nguồn câu**: ngân hàng `data/ic3` (Chương trình/Cấp độ/Bài, hoặc trộn mọi chủ đề) hoặc **link đề giáo viên** `arena.html?de=…` (cùng mã đề của Soạn đề, có cả câu tự soạn). Câu trắc nghiệm 1 đáp án dùng nguyên; Đúng/Sai nhiều mệnh đề → mỗi mệnh đề 1 câu; dạng kéo-thả/chọn vùng bỏ qua (~73% câu ngân hàng chơi được).
- **Lối vào**: nút "🏟️ Đấu trường" ở sảnh `index.html` (`js/arena/arena-entry.js`, mang theo bài đang chọn / đề đang mở); nút "Đấu trường" trong Soạn đề (`ic3-dashboard.html`) chép link giao bài về nhà kiểu Blooket Homework.
- Test: `js/arena/__tests__/arena-core.test.js` (đổi câu, điểm Kahoot, rương, đua, xếp hạng, xu, tỉ lệ độ hiếm, ngân hàng thật). Đã chạy thử 3 chế độ + mở hộp + link đề trên Chrome headless (chặn mọi máy chủ ngoài: 0 yêu cầu ra ngoài), 390px không tràn ngang.

## "Câu cả lớp hay sai" lưu trên Google Sheet (10/2026) — 0 lượt Firebase

⚠️ **Deploy Apps Script TRƯỚC khi push web:** dán `apps/Code.gs` → Save → Deploy → Manage deployments → ✏️ → *New version* (giữ URL). Không đổi `firestore.rules`. Bản Apps Script cũ vẫn nhận bài từ web mới (bỏ qua trường `wrong`), chỉ là chưa có dữ liệu câu sai và nút Phân tích báo cần deploy.

- **Bài nộp gửi kèm câu sai — chỉ lên Sheet** (`js/services/result-submitter.js → wrongUids`, `js/googleSheet.js`, `js/quiz-engine.js`): uid các câu trả lời sai (bỏ câu bỏ trống, câu tự soạn; tối đa 30, có cả uid MOS có dấu). Firestore `quiz_results` **không** thêm trường nào → không thêm dung lượng/lượt ghi, không phải sửa rules.
- **Apps Script** (`apps/src/30-submissions.gs`, `40-results.gs`, `10-router.gs`; `BACKEND_VERSION` 2026-10-14): cột mới **O – CauSai** (`a,b,c`; `-` = không sai câu nào; trống = bài từ web cũ) — tab cũ tự thêm tiêu đề; kiểm tra dữ liệu (≤ 30 uid, cấm ký tự HTML/xuống dòng) vì `submitExam` công khai. API mới **`wrongStats`** (admin/điều phối/giáo viên đã duyệt, cùng quyền theo trường như `listResults`): tổng hợp ngay trên server → trả ≤ 60 câu sai nhiều nhất kèm số lượt sai, số học sinh khác nhau, bài thi. `listResults` trả thêm `wrong`.
- **Dashboard giáo viên → "❌ Câu cả lớp hay sai"** (`js/teacher/wrong-questions.js`, `EduSheetResults.wrongStats`): theo bộ lọc Trường/Lớp/Bài thi/Thời gian; chỉ gọi Apps Script khi bấm **🔍 Phân tích** (không tự gọi lúc mở trang). Nội dung câu + đáp án + giải thích tra từ file tĩnh `data/ic3/*.json`. **📝 Tạo đề ôn**: link đề (`index.html?de=…`) gồm ≤ 20 câu hay sai nhất cùng cấp độ, tự chép vào clipboard — đề nằm trong link. Chạy được cả khi dashboard đọc kết quả từ Firestore (câu sai luôn đọc từ Sheet).
- Chi phí Firebase: 0 lượt cho dữ liệu; Apps Script chỉ đọc hồ sơ người gọi để xác thực (dùng chung bộ nhớ 1 giờ với `listResults`).
- Test: `apps/__tests__/code-gs.test.js` (+15 kiểm tra CauSai/wrongStats), `result-submitter.test.js` (câu sai chỉ vào payload Sheet), `sheet-results-api.test.js` (gộp nhiều Apps Script). Đã chạy thử trên Chrome headless (chặn mọi máy chủ ngoài): payload gửi Apps Script có `wrong`, thẻ dashboard hiện đúng câu/đáp án, link đề ôn 20/20 câu mở được trên `index.html`.

## Lộ trình học thích ứng, giấy chứng nhận, thi đua lớp theo tuần (10/2026) — 0 lượt Firebase

- **Góc học tập → tab "Lộ trình"** (`js/learning-hub.js`, `css/learning-hub.css`): đi theo đúng thứ tự "Bài N" của cấp độ (cấp chưa có bộ "Bài N" → theo chủ đề), mỗi bài có mức Chưa làm / Yếu / Cần ôn / Đạt / Vững (TB 3 lần gần nhất, như tab "Theo bài"). **Bài nên làm tiếp** chọn theo thứ tự: bài đã làm còn yếu nhất → bài chưa làm kế tiếp theo mạch → bài "Đạt" thấp nhất để lên "Vững"; nút "Làm bài" chọn sẵn đúng bài ở sảnh. Đổi cấp độ trong tab (các cấp đã làm + cấp đang chọn ở sảnh). Tab Tổng quan có thêm gợi ý lộ trình.
- **Giấy chứng nhận hoàn thành lộ trình**: đạt mọi bài của 1 cấp độ → vẽ bằng canvas ngay trên máy (font hệ thống, đúng dấu tiếng Việt; không tải thư viện/font), tải về PNG. Ghi rõ là chứng nhận tự luyện, không thay chứng chỉ IC3/MOS của Certiport.
- **Dashboard giáo viên → "🏅 Thi đua lớp tuần này"** (`teacher-dashboard.html`, `js/teacher/dashboard.js`, `EduAnalytics.classLeaderboard`): xếp hạng lớp từ thứ Hai theo *điểm TB × % học sinh của lớp đã làm bài* (roster), tính trên kết quả dashboard **đã tải sẵn** — không đọc thêm Firestore/Sheet. Nút "📽 Trình chiếu" mở bảng toàn màn hình để chiếu đầu giờ (Esc để đóng). Theo bộ lọc đang chọn.
- Test: `js/services/__tests__/analytics-class-race.test.js` (CI tự chạy). Đã chạy thử Lộ trình/chứng nhận/thi đua trên Chrome headless với mọi máy chủ ngoài bị chặn: 0 yêu cầu ra ngoài, không tràn ngang ở 390px.

## Chia việc rõ giữa Firebase và Apps Script (10/2026)

Sơ đồ đầy đủ: **`docs/architecture/BACKEND-MAP.md`** (dữ liệu nào nằm ở đâu, vì sao, công tắc cấu hình, thứ tự deploy).

- **Kết quả MOS Practice → Google Sheet** (tab `NhatKyMOS`, API `mosSubmit`, `apps/src/35-mos.gs`): trước mỗi bài ghi 1 lượt Firestore `mos_submissions` mà không trang nào đọc lại; nay giáo viên mở Sheet là xem được, 0 lượt Firebase, trang MOS không nạp Firebase nữa. Bật lại Firestore: `mosResults.firestore: true` trong `js/backend-config.js`.
- **Nhật ký hoạt động bật lại qua Apps Script** (tab `NhatKyHoatDong`, `apps/src/45-activity.gs`): đăng nhập (1 dòng/phiên tab), xem chi tiết học sinh, sửa roster... — trước phải tắt vì mỗi lần mở dashboard tốn 1 lượt ghi Firebase. Apps Script tự ghi (không bỏ qua được) khi đẩy câu hỏi, cập nhật roster, xoá bài nộp; ai làm lấy từ tài khoản đã xác thực.
- **roster-manager: nút "🚀 Cập nhật cho học sinh"** (chỉ Admin, API `publishRoster`): đưa `data/roster/students-active.json` lên trang làm bài qua Apps Script, thay cho tải file + commit + push tay. Chỉ Admin vì file dùng chung cho mọi trường.
- Test: `apps/__tests__/code-gs.test.js` 73 kiểm tra; `js/services/__tests__/apps-script-client.test.js` thêm phần MOS.

## Backend chỉ còn Apps Script + Firebase; vá API Apps Script công khai (10/2026)

- **Bảo mật — `apps/Code.gs`:** `getRoster`/`getScores`/`getDashboard` trước chạy bằng GET **không cần đăng nhập** (ai có URL Web App đọc được danh sách học sinh kèm email và điểm; `getDashboard` còn tin tham số `role` do web tự khai) và `writeReport` cho bất kỳ ai ghi tab TongHop. Nay mọi API qua doPost + Firebase ID token + bảng quyền theo vai trò (`routes_()`), điều phối chỉ thấy trường mình; GET chỉ còn kiểm tra sống. `submitExam` (công khai) kiểm tra dữ liệu (mã bài, độ dài, điểm 0–100…); bài sai bị bỏ khỏi hàng đợi thay vì gửi lại 30 ngày.
- **Apps Script tách module** `apps/src/00-config … 90-utils.gs` (mỗi file 1 nhiệm vụ) → `node scripts/build-apps-script.js` gộp thành `apps/Code.gs` để dán; CI kiểm tra đã gộp + chạy `apps/__tests__/code-gs.test.js` (61 kiểm tra với Google/Firebase/GitHub giả lập).
- **Tính km xăng xe qua Apps Script** (`mapDistance`, `js/services/apps-script-map-distance.js`): dịch vụ Maps có sẵn của Google — có số nhà/hẻm, không cần API key/thẻ, không còn giới hạn 1 lượt/giây; 150 lượt/ngày/người, nhớ kết quả 6 giờ; hết lượt thì dừng loạt tính. Gỡ `js/services/free-map-distance.js` (OpenStreetMap/OSRM).
- **Đẩy câu hỏi lên GitHub qua Apps Script** (`githubPublish`/`githubReadFile`, chỉ admin, chỉ ghi `data/` `img/`): token GitHub nằm ở Script Properties `GITHUB_TOKEN`, không còn dán vào trình duyệt (token cũ trong localStorage tự bị xoá). `js/github-publish.js` giữ nguyên hàm cho image-manager.
- **`js/services/apps-script-client.js`** (mới): 1 chỗ gọi Apps Script cho mọi trang quản trị (ID token, timeout, mã lỗi kiểu Firestore) — dashboard, bản đồ, GitHub dùng chung.
- **Deploy:** dán `apps/Code.gs` → Save → Run `doGet` (cấp quyền Maps + kết nối ngoài) → New version; thêm `GITHUB_TOKEN` trong Script Properties.

## Dashboard đọc kết quả từ Google Sheet — không cần Firebase cho bài nộp (10/2026)

- **`apps/Code.gs`** — API mới `listResults` / `deleteResults` (doPost): xác thực bằng Firebase ID token (đọc `users/{uid}` qua Firestore REST bằng chính token người xem, giữ 1 giờ), phân quyền theo trường giống `firestore.rules`, quét tab nhật ký từ cuối lên và dừng ở bài cũ hơn lần tải trước. Ghi bài: thêm dấu ' cho giá trị Sheet hay tự đổi (số câu "7/24", lớp "3/12", thời gian "5:05" từng bị thành ngày/giờ; tên bắt đầu "=" thành công thức), cột mới **N – CheDo**, cột giờ nộp định dạng `HH:mm:ss d/M/yyyy`. Dữ liệu cũ bị đổi định dạng vẫn đọc ra đúng. **Deploy lại + Run `doGet` 1 lần để cấp quyền `UrlFetchApp`.**
- **`js/services/sheet-results-api.js`** (mới) + **`js/backend-config.js → dashboard.readFrom`** (`auto` / `sheet` / `firestore`): teacher-dashboard, coordinator-dashboard (qua `student-result-repository.js`) và tab Báo cáo của ic3-dashboard đọc/xoá kết quả từ Sheet khi bật; `auto` = đọc Sheet khi Firestore không nhận mọi bài. Hỗ trợ nhiều Apps Script theo trường (`sheetEndpoints`).
- Test: `js/services/__tests__/sheet-results-api.test.js`; `Code.gs` chạy thử với SpreadsheetApp/Firestore giả lập (36 kiểm tra: quyền, token giả/hết hạn, tải tăng dần, phục hồi dữ liệu cũ, xoá).

## Tách trang học sinh khỏi Firebase cho mùa ôn thi (10/2026)

Phân tích đầy đủ: **`docs/architecture/SCALING-SPARK.md`** (vì sao hàng trăm nghìn bài/ngày không thể nằm trên Firestore Spark, các cách chia đã cân nhắc, điểm nghẽn reCAPTCHA / Apps Script / GitHub Pages).

- **`js/backend-config.js`** (mới): nơi duy nhất chọn đích lưu bài nộp — `quizResults.firestore`: `all` (mặc định, như cũ) / `test-only` (chỉ bài Kiểm tra lên Firestore) / `off` (chỉ Google Sheet, 0 lượt ghi Firebase); `sheetEndpoints` chia Google Sheet theo trường; `sheetJitterMs` rải lượt gửi Sheet 0–4 s.
- **`js/services/result-submitter.js`** (mới): dựng payload + gửi + xếp hàng gửi lại — tách khỏi `quiz-engine.js` (bỏ ~90 dòng). Sheet và Firestore dùng chung 1 mã bài → gửi lại không trùng ở cả 2 nơi.
- **`js/services/firebase-loader.js`** (mới): `index.html` và `mos-practice.html` không còn tải Firebase SDK lúc mở trang (~300 KB + 1 lượt reCAPTCHA/học sinh); chỉ nạp khi ghi Firestore hoặc máy có sẵn phiên đăng nhập giáo viên/admin (Khu Vui Chơi vẫn cho vào thẳng).
- **`js/googleSheet.js`**: dùng mã bài cố định; trước đây học sinh làm lại cùng 1 bài trong cùng phiên bị bỏ qua không gửi Sheet. **`pending-sync-queue.js`**: bài Sheet có mã cố định được giữ tới khi gửi được (trước bỏ sau ~35 phút).
- **`apps/Code.gs`** (phải deploy lại — *New version*, giữ URL): chống trùng bằng CacheService thay cho đọc lại toàn bộ cột mã bài mỗi lượt nộp trong lúc giữ khoá; tự tạo file nhật ký mới khi vượt 300.000 dòng (trần 10 triệu ô/file), danh sách ở tab `DanhMucNhatKy`.
- Test mới `js/services/__tests__/result-submitter.test.js` (CI tự chạy).

## CI tự kiểm tra + lộ trình phát triển (10/2026)

- **`.github/workflows/ci.yml`** (GitHub Actions, mỗi lần push `main` / Pull Request — chỉ kiểm tra, không deploy, không Firebase): `scripts/validate-data.js` (ngân hàng `data/ic3`: JSON hỏng, file thiếu, đáp án đúng không có trong lựa chọn, uid trùng trong minitest, thiếu ảnh, dạng câu lạ... → chặn; số câu meta lệch, chưa có giải thích → cảnh báo) + `scripts/check-js.js` (cú pháp 133 file JS, kể cả ES module) + 7 unit test mô phỏng Word/Excel/PowerPoint. Hiện tại: 6.071 câu / 324 file minitest / 604 ảnh hợp lệ, 133/133 JS, 7/7 test.
- **`docs/ROADMAP-PHAT-TRIEN.md`**: việc cần làm theo từng ngưỡng tăng trưởng (học sinh/ngày, phòng trực tiếp, phân tích câu sai, đồng bộ nhiều thiết bị, đa đơn vị, ngân hàng lớn, lưu trữ dài hạn), chi phí Firebase ước lượng và file cần sửa.

## Dọn dự án nhẹ hơn, chống lag/mất mạng, mục tiêu tuần (10/2026)

**Nhẹ hơn (~5,6 MB):**
- Gỡ `quiz_data.json` (3 MB, bản gộp cũ 04/09 — lỗi thời so với `data/ic3`). Trang làm bài không còn dự phòng tải file này (lỗi meta.json → DEMO_DATA như trước).
- **Phòng thử thách** (`live-quiz.js`) trước đây tải nguyên `quiz_data.json` 3 MB mỗi lần tạo phòng và dùng câu hỏi cũ → giờ chỉ tải đúng file chủ đề nhỏ trong `data/ic3/minitests` (1 chủ đề = 6 file; "Tổng hợp" = 42 file, 452 câu không trùng uid; chủ đề ít nhất 23 câu ≥ 15 câu/phòng).
- Ảnh động màn chờ/từ chối: GIF → WebP động (`loading` 512 KB → 121 KB, `404` 1,37 MB → 424 KB); trang đăng nhập chỉ tải ảnh 404 khi đăng nhập lỗi (trước đây tải 1,3 MB mỗi lần mở).
- 10 ảnh câu hỏi > 1000px thu về 1000px (giữ tỉ lệ → toạ độ % câu "chọn vùng" không đổi; cùng tên file), 3,0 MB → 2,0 MB, đã so chất lượng bằng mắt. Ảnh khác giữ nguyên (lượng tử màu làm xấu ảnh chụp).
- Gỡ file không còn dùng: `data/manual_review/*` (đã gộp), 4 script chỉ chạy trên `quiz_data.json` (`split-quiz-data.py`, `merge_hotspot_questions.py`, `add_hotspot_distractors.py`, `generate_explanations.py`), `tkb-import/*.xlsx` (file nhập TKB 1 lần, chứa tên/lịch giáo viên thật — đang công khai trên GitHub Pages). Tất cả còn trong lịch sử git.

**Bền hơn:** `sw.js` + `js/sw-register.js` (nạp ở `index.html`, `login.html`, `ic3-dashboard.html`) — chỉ xử lý GET cùng tên miền (Firebase/Google/CDN đi thẳng mạng, 0 lượt Firebase thêm). HTML/JS/CSS/JSON: mạng trước, mạng chậm > 4 s (trang) / 2,5 s (file) hoặc mất mạng → dùng bản lưu; ảnh: hiện bản lưu ngay rồi cập nhật ngầm (≤ 400 file). Đo: mất mạng hẳn vẫn mở trang với dữ liệu thật và làm được bài đã mở; mạng 8 s/file → trang hiện sau ~9 s. Đổi `CACHE_VERSION` trong `sw.js` để xoá bản lưu cũ trên mọi máy.

**Hứng thú hơn:** *Mục tiêu tuần* trong Góc học tập (3/5/7/10 bài/tuần, thanh tiến độ ở Góc học tập + ngay trên nút ở sảnh, chúc mừng khi đạt) — `localStorage` `eduquiz_goals_v1`.

## Trình chiếu lớp học, thẻ ghi nhớ, giao bài có hạn nộp (10/2026) — 0 lượt Firebase

- **Trình chiếu lớp học** (Soạn đề → "Trình chiếu", `js/exam-builder.js` § TRÌNH CHIẾU): chiếu đề toàn màn hình kiểu Kahoot, chữ to cho máy chiếu, đếm ngược 10/20/30/60 giây hoặc không giới hạn (hết giờ tự hiện đáp án), 0–6 nhóm thi đua đặt tên được, giáo viên cộng điểm nhóm trả lời đúng (bấm hoặc phím 1–6), Space = hiện đáp án / câu sau, bảng xếp hạng cuối + chơi lại. Thay cho phòng "Chơi trực tiếp" khi hạn mức ghi Firebase đã gần hết — ghi chú ở `docs/FIREBASE-CHECKLIST.md` § 6; thông báo hết lượt ở `live-quiz.js` gợi ý dùng Trình chiếu.
- **Thẻ ghi nhớ** (Góc học tập → Sổ tay câu sai → "Thẻ ghi nhớ"): lật thẻ câu hỏi ↔ đáp án + giải thích cho mọi dạng câu (trắc nghiệm, đúng/sai, nối, sắp xếp, phân loại, điền...), tự đánh giá "Đã nhớ"/"Chưa nhớ" (phím Space, 1, 2) → cập nhật hộp Leitner như khi ôn bằng bài làm.
- **Giao bài có hạn nộp** (Cài đặt đề → "Hạn nộp"): hạn nằm trong link (`custom-exam-codec.js`, trường `h` tính bằng phút); trang làm bài hiện hạn, quá hạn vẫn làm được nhưng tên bài thêm "(nộp muộn)" → giáo viên thấy ngay trong Báo cáo kết quả. Thẻ đề trên carousel hiện hạn.

## Góc học tập cho học sinh + sửa tràn ngang trên điện thoại (10/2026)

- **Góc học tập** (`js/learning-hub.js`, `css/learning-hub.css`, nút ở sảnh `index.html` kèm số câu đến hạn): 3 tab — *Tổng quan* (số bài, điểm TB 10 bài gần nhất, chuỗi ngày học, biểu đồ xu hướng SVG, gợi ý hôm nay), *Theo bài* (TB 3 lần gần nhất, xu hướng ↑↓, yếu → vững, "Ôn ngay" chọn sẵn đúng bài qua `window.lobbySelectMinitest`), *Sổ tay câu sai* (tự gom câu sai qua mọi bài, hộp Leitner 1→4: ngay / 1 / 3 / 7 ngày → thuộc; sai lại về hộp 1; tối đa 200 câu/học sinh). Tách theo Họ tên + Lớp + Trường (máy trường dùng chung). 0 lượt Firebase — localStorage `eduquiz_wrongbook_v1`.
- **`quiz-engine.js`:** phát sự kiện `edu:exam-graded` sau khi chấm; `startWrongbookReview()` (phiên ôn không tính điểm, như "Luyện lại câu sai": không ghi lịch sử/XP/Sheet/Firestore); lịch sử máy lưu thêm `catId`/`levelId`/`mtKey`.
- **Tràn ngang trên điện thoại (390px):** `ic3-dashboard.html` 101px → 0 (thanh trên chỉ còn icon "Xem trang học sinh", nền trang trí `#section-my-sets::before`), `login.html` 39px → 0 (`html { overflow-x: clip }`), `image-manager.html` 138px → 0 (select bộ lọc). Đã quét 21 trang, đều 0px.

## Soạn đề từ ngân hàng câu hỏi + nhập lịch Excel tiết kiệm lượt (10/2026)

- **Soạn đề** (`ic3-dashboard.html` tab mới, `js/exam-builder.js`, `css/exam-builder.css`): duyệt `data/ic3` theo Chương trình → Cấp độ → Bài/Tiết/Chủ đề, xem đáp án + giải thích, thêm từng câu / ngẫu nhiên N câu / ma trận đề (chia đều, không trùng uid), sắp xếp kéo-thả, thời gian Kiểm tra, trộn câu, in đề (có/không đáp án). Lưu thành bộ đề trên carousel (localStorage `ic3_custom_sets`, bản nháp `ic3_exam_builder_draft`); nút "Tạo bộ đề mới" → "Soạn đề mới", tạo bằng link ngoài vẫn còn.
- **Soạn đề kiểu Kahoot** (viết lại `js/exam-builder.js` + `css/exam-builder.css`): danh sách câu bên trái (kéo thả, nhân bản, xoá, phím ↑↓/Alt+↑↓), khung soạn giữa với ô đáp án 6 màu + hình, ảnh minh hoạ (tải lên tự nén ≤ ~30KB / dán Ctrl+V / kéo thả / link https), giải thích; bảng phải đổi dạng câu + tình trạng đề (câu lỗi, số câu chơi trực tiếp được, độ dài link). 5 dạng tự soạn: trắc nghiệm, nhiều đáp án, Đúng/Sai, sắp xếp, nối cặp. Cài đặt đề (tên, mô tả, màu bìa + biểu tượng, cấp học, thời gian, trộn câu), Xem trước kiểu Kahoot, Nhập nhanh từ văn bản (`*` = đáp án đúng), câu ngân hàng → "Chuyển thành câu tự soạn", Mở đề từ link (sửa trên máy khác).
- **Chơi trực tiếp** (`live-quiz.html?de=...`): phòng thi đấu dùng đề tự soạn (câu 1 đáp án / Đúng-Sai, 5–15 câu). Không đổi `firestore.rules`, số lượt Firebase như phòng thường.
- **Link v2** (`js/custom-exam-codec.js`): nén deflate, chứa cả câu tự soạn; link v1 cũ vẫn mở được. Câu tự soạn được escape khi mở rộng cho trang làm bài, ảnh chỉ nhận https/`img/`/data:image.
- **Link làm bài** `index.html?de=...` (`js/custom-exam-codec.js`): link chứa tham chiếu câu (minitest + uid), trang làm bài tải file tĩnh, khoá Chương trình/Cấp độ/thời gian theo đề. **0 lượt đọc/ghi Firestore** cho soạn/mở đề; kết quả vẫn vào `quiz_results` như bài thường.
- **Nhập lịch từ Excel** (`teaching-schedule.js`): chọn tuần cần nhập (mặc định tuần mới + hiện tại), so với dữ liệu hiện có rồi chỉ ghi document thay đổi, hiện ô TKB lớp khác Excel *trước* khi ghi (1 lần ghi, bỏ nút ghi đè riêng), cập nhật màn hình tại chỗ thay vì `loadEverything()`.

## 0000000. Rà soát bảo mật/hạn mức theo `docs/AUDIT-PROMPT.md` (10/2026)

⚠️ Chỉ đổi `firestore.rules` — phải **publish** (`firebase deploy --only firestore:rules --project data-ic3`).

- **Thêm `docs/AUDIT-PROMPT.md`:** prompt kiểm tra chuẩn hoá 3 mảng (bảo mật, lượt đọc/ghi Firebase, UX/UI) kèm bối cảnh dự án, tiêu chí mức độ và mẫu báo cáo — dùng lại mỗi đợt deploy.
- **`questions`:** bỏ đọc công khai (không trang nào còn dùng; trước đây ai cầm apiKey cũng kéo được ~1.100 doc/lần).
- **`gvlab_posts` / `likes` / `comments` / `gvlab_certs`:** query danh sách công khai bắt buộc `limit` (50 / 200 / 200 / 100 — client dùng 12 / — / 200 / 60). `likes` chỉ editor ghi, đúng schema `{createdAt}` (trước đây mọi tài khoản kể cả Anonymous Auth của live-quiz ghi được dữ liệu tuỳ ý). `comments` giới hạn field + 300 ký tự; bài đăng giới hạn caption 500 ký tự; `likeCount` chỉ đổi ±1/lần.
- **`gvlab_chat`:** tính năng đã gỡ khỏi `portfolio.js` → đóng ghi; admin vẫn đọc/xoá để dọn dữ liệu cũ.
- **`quiz_results` / `mos_submissions`:** `expireAt` phải < 400 ngày tới (chặn né TTL để chiếm dung lượng 1 GiB).
- **`courses` / `classes` / 6 collection `teaching_*`:** query danh sách bắt buộc `limit ≤ 10.000` (client đã luôn có limit).
- **A11y:** thêm `aria-label` cho 3 nút chỉ có icon (menu + đóng modal ở `ic3-dashboard.html`, đóng Lịch sử ở `index.html`).

## 000000. Hạn mức Spark cho hàng nghìn học sinh/ngày (10/2026)

⚠️ Phải publish `firestore.rules` + `firestore.indexes.json` cùng lúc deploy code — xem `docs/FIREBASE-CHECKLIST.md` § 1.

- **Phòng thử thách** (`live-quiz.js`): mỗi câu chỉ ghi document phòng 1 lần (lần chốt câu i mang luôn câu i+1 + `phaseAt` giờ máy chủ; máy học sinh tự mở câu sau màn đáp án). Rules câu trả lời bỏ `get()`/`exists()` (2 lượt đọc/câu trả lời) — người dẫn tự kiểm tra người chơi, câu, khung giờ theo giờ máy chủ. 1 listener câu trả lời cả ván; ngừng nghe trước khi xoá; xoá phòng theo id đã biết (không đọc để xoá); học sinh ngừng nghe khi ván xong; tự đóng khi hết hạn; tối đa 60 người/phòng; `expiresAt` trên `players`/`answers` cho TTL. Đo 1 host + 6 HS × 5 câu: 160 → 101 lượt đọc (chưa kể rules); 40 HS × 20 câu ≈ 4.500 → 1.870.
- **Bài nộp** (`firestore-results.js`, `mos-submissions.js`, `pending-sync-queue.js`): mã document tạo ở máy (`EduFirebase.createOnce`) → gửi lại không tạo bài trùng; chờ quá 20 giây (hết lượt ghi/mất mạng) thì vào hàng đợi; hàng đợi **không bỏ bài** sau 8 lần thử nữa (giữ tới 30 ngày). TTL `quiz_results` 365 → **45 ngày** (dung lượng 1 GiB), thêm TTL `mos_submissions`.
- **Dashboard:** cache tải tăng dần giữ 7 ngày (trước 12 giờ → mỗi ngày đọc lại 1.000–10.000 bài); roster giữ 12 giờ ("Làm mới" chỉ đọc lại roster khi bản lưu > 30 phút); giáo viên 1 trường chỉ đọc bài của lớp mình (`studentClass in`); hết lượt/mất mạng → dùng bản lưu kể cả quá hạn, có thông báo; `fromCache` không còn bị lưu nhầm thành dữ liệu rỗng. Báo cáo IC3: xoá bài cập nhật luôn cache.
- **Rules:** query danh sách `quiz_results`/`students_roster`/`mos_submissions` bắt buộc `limit ≤ 10.000`, `users` ≤ 1.000, `gvlab_profiles` ≤ 500; thêm `limit()` cho mọi query còn thiếu. `firestore.indexes.json`: tắt index field không lọc (~5,3 → ~1,9 KB/bài) + khai báo 5 TTL policy; thêm `firebase.json`.
- **Giám sát:** console in `[trang] N lượt đọc Firestore — <nguồn>` mỗi lần tải dữ liệu (`EduFirebase.countReads/countSnap`).

## 00000. Trang làm bài: luyện lại câu sai, kết quả theo chủ đề, phím tắt (0 lượt Firebase thêm)

- **🔁 Luyện lại N câu sai** ở màn kết quả: mở phiên Ôn luyện chỉ gồm các câu sai/bỏ qua (xáo lại đáp án, có "Kiểm tra đáp án", không đếm giờ). Phiên này **không** ghi Firestore, Google Sheet, lịch sử hay XP và không autosave — bài thật vẫn chỉ ghi đúng 1 lần lúc nộp. Làm xong có thể luyện tiếp phần còn sai; về sảnh trả lại chế độ Ôn luyện/Kiểm tra đã chọn.
- **📊 Kết quả theo chủ đề** (bài Tổng hợp): đúng/tổng từng chủ đề, xếp chủ đề yếu nhất lên đầu, gợi ý chủ đề nên ôn (< 70%). Câu bài Tổng hợp được gắn `_topic` lúc trộn.
- **Phím tắt khi làm bài:** ← → chuyển câu, 1–9 / A–E chọn đáp án (câu 1 hoặc nhiều đáp án), F gắn cờ; không chạy khi đang gõ chữ, đang mở ảnh phóng to/mini-game. Gợi ý hiện 1 lần trên máy có chuột.

## 0000. Quản lý câu hỏi: sửa thẳng data/ic3 (đủ 6.071 mục), bỏ Firestore

- **Vì sao trang chỉ hiện 1.102 câu:** collection Firestore `questions` được nhập 1 lần từ `quiz_data.json` cũ (04/09, 3.160 mục) với id = `uid`; các bản chép cùng uid (Tiết 1–8 dùng lại câu của chủ đề) bị gộp → 1.102 doc. Mọi câu thêm sau đó (Spark, Bài 1–35, MOS) không có trên Firestore, trong khi `data/ic3/` (học sinh dùng) có 6.071 mục / 4.013 câu khác nhau.
- **Rủi ro đã chặn:** nút "📤 Xuất ra data/ic3" cũ đẩy bản Firestore đó **đè** lên `data/ic3/` → học sinh mất phần lớn câu hỏi. Nút cũng không ghi `data/ic3/minitests/*.json` (file quiz-engine ưu tiên tải) nên câu đã sửa có thể không tới học sinh.
- `image-manager.js` viết lại phần dữ liệu: đọc thẳng `data/ic3/` (qua GitHub API nếu có token → luôn mới nhất), **0 lượt đọc/ghi Firestore**. Sửa/thêm/xoá/gắn ảnh lưu **bản nháp** IndexedDB (F5/đóng tab vẫn còn). "🚀 Đẩy thay đổi cho học sinh" chỉ commit file thật sự đổi (khối, minitest tách nhỏ, manifest, `meta.json` + version mới, ảnh "file riêng" vào `img/`), định dạng giống hệt file cũ; **từ chối đẩy** nếu GitHub đã đổi kể từ lúc mở trang. Sửa 1 câu cập nhật luôn các bản chép cùng uid trong khối. Thống kê hiện số mục + số câu khác nhau.
- `github-publish.js`: sửa lỗi tràn stack khi mã hoá file ~1MB (mọi lần đẩy data/ic3 trước đây đều rơi về tải zip); thêm `fetchRaw`, `gitBlobSha`, kiểm tra `expectedShas`, hỗ trợ file nhị phân.
- Bỏ `js/services/collection-sync-service.js` (không còn dùng). Collection Firestore `questions` không còn trang nào đọc — có thể xoá trong Console khi muốn.

## 000. Sửa cache bị tràn — nguyên nhân các đỉnh 4K–6K lượt đọc/giờ

- **Quản lý câu hỏi** (`image-manager.js`): ngân hàng ~6.071 câu (~5 triệu ký tự) vượt trần ~5 triệu ký tự của sessionStorage → cache ghi hỏng âm thầm → **mỗi lần mở trang đọc lại ~6.071 lượt** (khớp đỉnh 6K). Giờ giữ bản sao IndexedDB + đồng bộ delta theo `updatedAt` (`js/services/collection-sync-service.js`): mở lại ≈ 1 lượt đọc. Mọi lần ghi câu hỏi đặt `updatedAt`; nhập/tải JSON lên không còn đọc lại toàn bộ; đọc lại toàn bộ mỗi 7 ngày (bắt câu bị xoá ở máy khác) hoặc khi xuất file tĩnh. `updatedAt` không đưa vào file xuất.
- `data-cache-service.js`: thêm `getAsync/setAsync` (IndexedDB, không giới hạn ~5MB); `set()` giờ báo console khi tràn quota thay vì im lặng. Chuyển sang IndexedDB: báo cáo `quiz_results` (tới 10.000 bài ≈ 4,5 triệu ký tự), kết quả gần đây giáo viên/điều phối, roster điều phối/giáo viên, danh sách tài khoản + tra cứu admin, roster-manager (nay dùng chung mọi tab).
- Ghi chú: Battle Quiz bản cũ (trước commit mini-game) đọc tới 300 câu/chủ đề/giờ/học sinh — đã bỏ ở bản trước.
- `auth-guard.js`: sửa lỗi kẹt màn "Đang kiểm tra đăng nhập..." khi auth trả lời trước DOMContentLoaded (`showDenied` tìm `#edu-guard-card` trong overlay chưa gắn vào trang).

## 00. Mini-game: hấp dẫn hơn, không dùng Firebase

- Gỡ Firebase SDK + App Check khỏi `battle-quiz`, `pz-defense`, `cyber-detective`, `computer-simulator`. Trước đây mỗi lượt chơi ghi `game_sessions` nhưng rules chỉ cho admin ghi → luôn bị từ chối, vẫn tốn request. Giờ 7 game = 0 request Firebase.
- `battle-quiz.js`: câu hỏi lấy từ `data/ic3/minitests` (file tĩnh, bỏ đọc collection `questions` và `quiz_data.json` cũ). "Bảng xếp hạng" (học sinh không đọc được) → **Kỷ lục của bạn**: top 10 ván trên máy, báo "Kỷ lục mới". Mỗi ván tối thiểu 10 XP; XP màn kết quả khớp XP thật được cộng.
- `gamification.js`: thẻ phần thưởng cuối ván (+XP, thanh cấp độ chạy, LÊN CẤP + pháo giấy, huy hiệu mới); **nhiệm vụ hằng ngày** chơi 3 ván → +30 XP; 6 huy hiệu mới (10/50 lượt, Nhà thám hiểm 5 game, nhiệm vụ ngày ×1/×7, cấp 5). Không còn ghi Firestore.
- Mọi game cộng XP kể cả khi chưa chọn tên ở sảnh; Memory Game bắt đầu cộng XP (theo số sao). Thêm âm thanh/pháo giấy chung cho các game chưa có.
- `index.html`: thêm dải Cấp/XP/huy hiệu/nhiệm vụ hôm nay ở đầu Khu Vui Chơi (trước đây `#lobbyGameStrip` không tồn tại nên học sinh không thấy XP); tự cập nhật khi đóng game.

## 0. Giảm lượt đọc Firestore: hồ sơ Social, hồ sơ đăng nhập, tra cứu admin

- Mới `js/services/profile-cache-service.js` (`EduProfileCache`): cache `gvlab_profiles` trong IndexedDB + đồng bộ delta theo `updatedAt`. `portfolio.js`, `teaching-schedule.js` không còn đọc lại toàn bộ hồ sơ (kèm avatar base64 ~300KB/hồ sơ) mỗi lần mở trang: trong 2 phút = 0 lượt đọc, sau đó chỉ đọc hồ sơ có thay đổi (~1 lượt), đọc lại toàn bộ mỗi 24 giờ. Avatar trên topbar (`dashboard-page.js`, `teacher/dashboard.js`, `teaching-schedule.js`) dùng chung cache.
- `auth.js`: hồ sơ `users/{uid}` lưu thêm sessionStorage 5 phút — chuyển qua lại giữa các trang quản trị không tốn 1 lượt đọc/trang. Xoá khi đăng xuất.
- `teaching-schedule.js`: map Mã NV → tài khoản cache localStorage 30 phút (admin đổi Mã NV thì tự xoá).
- `admin-users.js`: danh sách trường/lớp/GV (suy từ ~1.466 học sinh) lưu localStorage 30 phút, mở lại trang không đọc lại cả roster. Vòng tự sửa "Trường được xem" chỉ chạy với dữ liệu roster vừa đọc; gán lớp xong thì đọc lại roster.

## 0a. Thử thách cùng lớp: sửa rò timer, hiện kết quả cá nhân

- `js/live-quiz.js`: vòng đếm giờ không còn nhân đôi theo mỗi snapshot (dùng 1 handle, dọn khi rời phòng).
- Màn "Đáp án" báo riêng cho từng học sinh: chính xác / chưa đúng / chưa trả lời kịp.
- Danh sách người chơi tự xếp theo điểm khi phòng đã bắt đầu.

## 0b. Thử thách cùng lớp: chống spam tạo phòng

- `firestore.rules`: thêm `live_hosts/{uid}`; tạo phòng phải kèm ghi `lastCreatedAt` trong cùng batch, cách lần trước ≥ 30 giây. Cần **publish lại rules**.
- `js/live-quiz.js`: tạo phòng bằng batch (host doc + room).

## 0c. Rà soát quota Firestore cho hàng nghìn học sinh/ngày

- Dashboard giáo viên/điều phối: tải kết quả tăng dần (`listRecentCached`), không đọc lại 1.000 bài mỗi lần làm mới.
- `autosave-service.js`: tắt backup Firestore của bài thi MOS (collection `mos_exam_sessions` chưa có rule nên luôn bị từ chối; nếu bật lại dễ ghi ~135 lượt/HS). Khi bật lại: throttle 5 phút + chỉ ghi khi snapshot đổi. IndexedDB vẫn lưu mỗi lần.
- Ước tính 1.000 HS/ngày: ghi ≈ 1 lượt/bài nộp (quiz_results/mos_submissions); đọc phía học sinh ≈ 0 (dữ liệu câu hỏi/roster là file tĩnh).

## 0d. Quản lý học sinh / Lịch giảng dạy: bớt đọc-ghi thừa

- `roster-manager.js`: thêm/sửa/xoá 1 khoá học-lớp-học sinh không còn đọc lại toàn bộ roster (~1.600 lượt đọc/lần) mà chỉ đọc lại 1 bản ghi và cập nhật cache. Nạp Excel bỏ qua học sinh không đổi (trước đây ghi lại tất cả). Cache trang 15 phút.
- `teaching-schedule.js`: lưu lịch của 1 giáo viên chỉ đọc lại đúng document đó, không tải lại lịch cả đội.

## 0e. Rà soát đọc/ghi: báo cáo IC3, quản lý câu hỏi, tài khoản, Social

- `dashboard.js` (Báo cáo IC3): tải tăng dần thay vì đọc lại tới 10.000 `quiz_results` mỗi lần cache hết hạn; cache localStorage.
- `image-manager.js`: sau mỗi lần sửa/xoá/thêm câu hỏi cập nhật cache tại chỗ (trước đây xoá cache → lần mở sau đọc lại cả ngân hàng câu hỏi); TTL 30 phút.
- `admin-users.js`: thao tác ghi chỉ đọc lại danh sách tài khoản, giữ danh sách trường/lớp/GV (suy ra từ ~1.466 học sinh) 30 phút.
- `portfolio.js`: feed Social 30→12 bài, chứng chỉ 200→60 (mỗi bài mang ảnh base64, trang công khai tốn băng thông).

## 0f. Hình ảnh câu hỏi nhẹ hơn, tải ổn định hơn

- 34/46 ảnh câu hỏi trong `img/` được thu về tối đa 1200px rộng và nén lại (11,8MB → 8,1MB). Tên file và tỉ lệ ảnh giữ nguyên nên vùng bấm (`regions`, tính theo %) vẫn đúng. Bản gốc lưu ngoài repo.
- `quiz-engine.js`: tải trước ảnh của câu kế tiếp; ảnh lỗi không còn bị ẩn lặng lẽ mà hiện thông báo + nút "Tải lại hình"; bỏ `loading="lazy"` cho ảnh của câu đang làm.

## 0g. Nén thêm ảnh

- `img/cpu.png`, `mainboard.png`, `ssd.png` → tối đa 900px; 14 ảnh `img/portfolio/*.jpg` → 1280px, chất lượng 80; `img/anim/loading.gif` 1,4MB → 0,5MB (màn "đang kiểm tra đăng nhập" của mọi trang nhân sự). `404.gif` giữ nguyên (chỉ giảm ~15%, không đáng đổi chất lượng).

## 0h. Đăng nhập: hết "tự reload", bớt đọc hồ sơ lặp

- `auth-guard.js`: chỉ bắn `edu:ready` một lần cho mỗi tài khoản (trước đây onAuthStateChanged bắn lại làm dashboard quay về "Đang tải...").
- `auth.js` `onAuthReady()`: không gọi lại callback khi cùng uid; hồ sơ `users/{uid}` dùng chung giữa các nơi trên cùng 1 trang (cache 5 phút, chỉ hồ sơ đã tồn tại) — mỗi lần mở trang giảm 2-3 lượt đọc xuống 1.

## 0i. Khi hết hạn mức Firebase trong ngày

- Dashboard giáo viên/điều phối và Báo cáo IC3: nếu không tải được bài nộp mới (hết lượt đọc, mất mạng) thì vẫn hiện dữ liệu đã lưu kèm thông báo, thay vì lỗi trắng.
- Phòng chơi trực tiếp: báo rõ "hết lượt miễn phí hôm nay, thử lại sau khoảng 14-15h (giờ VN)".
- `teaching-schedule.js`: ảnh đại diện giáo viên đọc 1 lần thay vì listener realtime trên toàn bộ `gvlab_profiles` (mỗi hồ sơ kèm avatar base64 tới ~300KB).
- Đã kiểm tra: bài nộp của học sinh không mất khi hết lượt ghi (SDK giữ trong IndexedDB và tự gửi lại; có thêm bản Google Sheet).

## 0j. Phòng chơi: tải bảng điểm

- Màn kết thúc của người dẫn có nút "Tải bảng điểm (Excel/CSV)": đủ mọi người chơi (không chỉ top 10), xếp hạng theo điểm, mở được bằng Excel (UTF-8 có BOM). Tạo ngay trên máy, không tốn lượt Firebase.
- Âm thanh + pháo giấy (dùng lại `js/game-sfx.js`, `js/game-fx.js`): tiếng bấm khi chọn đáp án, âm đúng/sai khi xem đáp án, pháo giấy khi kết thúc cho top 3 và người dẫn. Phát 1 lần mỗi khoảnh khắc; tôn trọng nút tắt tiếng chung của các mini-game.
- Kết thúc ván: máy người dẫn tự xoá subcollection `answers` (xoá theo uid đã biết, không tốn lượt đọc) vì TTL không dọn subcollection.
- Chuỗi đúng liên tiếp: từ câu đúng thứ 2 liên tiếp thưởng +100/câu (tối đa +500), hiện "🔥 Chuỗi N câu đúng" + âm combo. Lưu trong map `streaks` của document phòng (cần publish lại rules).

## 0 (mới nhất). Click trực tiếp trên ảnh cho câu nối cột (thay vì đọc chữ)

### Tính năng mới: `q.regions` — vùng bấm trên ảnh cho câu "matching"
Thêm khả năng: với câu nối cột (`type: "matching"`) có ảnh, cột trái có
thể hiển thị dưới dạng **ảnh + vùng bấm** thay vì danh sách chữ — học
sinh bấm thẳng vào đúng vị trí trên ảnh (vd. bấm vào đầu cắm USB-C)
thay vì đọc tên rồi tìm trong danh sách.

**Cách bật cho 1 câu hỏi**: thêm field `regions` vào object câu hỏi
trong `quiz_data.json` (rồi chạy `python3 scripts/split-quiz-data.py`
để đồng bộ ra `data/ic3/*.json`):
```json
{
  "uid": "thcs__k6__mt1__q35",
  "type": "matching",
  "imageUrl": "img/Picture38.png",
  "pairs": [...],
  "regions": [
    { "value": "USB",       "x": 1,  "y": 3, "w": 18, "h": 93 },
    { "value": "Micro USB", "x": 23, "y": 3, "w": 15, "h": 93 },
    { "value": "LIGHTNING", "x": 63, "y": 3, "w": 14, "h": 93 },
    { "value": "USB-C",     "x": 83, "y": 3, "w": 16, "h": 93 }
  ]
}
```
- `x, y, w, h`: % theo **kích thước ảnh gốc** (0-100), góc trên-trái.
- `value`: phải khớp **chính xác** 1 chuỗi trong `pairs[].left`.
- Item nào trong `pairs[].left` KHÔNG có `value` tương ứng trong
  `regions` vẫn tự động hiện dạng chữ bên dưới ảnh (không mất đáp án).
- Không có `regions` → câu hỏi hiện dạng chữ như cũ, không đổi gì.

**Cách click hoạt động**: giống hệt cơ chế đang có (nhấn chip đáp án
bên phải → nhấn vào vùng trên ảnh để đặt đáp án) — không đổi cách chấm
điểm, chỉ đổi cách chọn "ô đích" bên trái từ đọc-chữ sang bấm-ảnh.

### Đã áp dụng cho: `thcs__k6__mt1__q35` (câu đầu nối USB — Khối 6)
Toạ độ được đo **bằng phân tích pixel thật** (không ước lượng bằng
mắt): dùng Python phát hiện 5 cụm điểm ảnh tối màu (5 đầu cắm) trên
nền trắng, ra đúng 5 khoảng cột tách biệt rõ ràng, rồi ánh xạ 4/5 đầu
cắm khớp với 4 đáp án theo hình dạng chuẩn (USB-A hình chữ nhật to,
Micro USB hình thang nhỏ, Lightning dẹt bo tròn, USB-C oval đối xứng).
Đầu cắm còn lại (Mini USB, cột "C") không khớp đáp án nào — đây là
**nhiễu có chủ đích** trong ảnh gốc, không gán vùng bấm cho nó.

### CHƯA áp dụng cho 7 câu còn lại — lý do cụ thể từng câu:

| Câu | Ảnh | Vấn đề |
|---|---|---|
| `thcs__k6__mt1__q3` | Picture56.png | **Ảnh sai hoàn toàn với nội dung câu hỏi** — ảnh là màn hình Windows Settings (System/Accounts/Personalization/Ease of Access), còn câu hỏi hỏi về Android/iOS/MacOS/Windows/Chrome OS → hãng phát triển. Khả năng cao bị gán nhầm ảnh từ lúc trích xuất dữ liệu gốc (Word/PDF → ảnh rời). **Cần bạn kiểm tra và gán lại đúng ảnh trong `image-manager.html`.** |
| `thcs__k6__mt1__q4`, `thcs__k6__mt3__q10` | Picture18.jpg | Ảnh có 6 icon (Edge/Word/Excel/PowerPoint/Mail/Calendar) nhưng câu hỏi có đáp án "Hệ thống quản lý cơ sở dữ liệu" — **không có icon nào trong ảnh khớp** (thiếu icon Access). Nếu ép chọn 1 icon bất kỳ sẽ dạy sai. |
| `thcs__k7__mt1__q3`, `thcs__k7__mt4__q12` | Picture29.png | Ảnh chỉ **63×60px** (kích thước 1 icon đơn) — không đủ lớn để tách 4 vùng bấm riêng biệt cho 4 đáp án. |
| `tih__k4__mt1__q35`, `tih__k4__mt4__q13` | Picture50.png | Ảnh là ảnh chụp màn hình Word (Track Changes) với 4 mũi tên A/B/C/D trỏ vào các nút — **nội dung không khớp** với đáp án của câu (câu hỏi về cấu trúc đoạn văn giới thiệu con vật). Cùng loại vấn đề như Picture56 — nhiều khả năng gán nhầm ảnh. |

→ Cả 7 câu này **vẫn hoạt động bình thường ở dạng chữ** (không bị hỏng
gì), chỉ là chưa có trải nghiệm "bấm trên ảnh". Muốn làm thêm câu nào,
gửi mình: câu nào + ảnh nào + đáp án nào tương ứng vùng nào trên ảnh
(hoặc xác nhận lại ảnh đúng nếu là ảnh bị gán nhầm) — mình sẽ đo toạ độ
bằng phân tích pixel như đã làm với câu USB.

---

## 0b. Câu có ảnh (loại 1 đáp án / nhiều đáp án): ẩn nhãn A/B/C/D

Với câu hỏi loại `single` (1 đáp án) và `multi` (nhiều đáp án) **có ảnh
minh hoạ** (`imageUrl`/`image_file`), nút đáp án giờ **không hiện vòng
tròn chữ cái A/B/C/D** nữa — chỉ còn nội dung đáp án, học sinh click
thẳng vào nội dung để chọn (hành vi click/chấm điểm không đổi, chỉ ẩn
nhãn chữ). Câu hỏi **không có ảnh** vẫn hiện A/B/C/D như cũ.

Lưu ý: ngân hàng câu hỏi hiện tại không có câu nào dùng ảnh làm **đáp
án** (ảnh chỉ minh hoạ ngữ cảnh, đáp án luôn là văn bản) — nên đây là
thay đổi giao diện (ẩn nhãn chữ), không phải đổi cách chấm điểm.

Loại `truefalse` (Đúng/Sai) và `matching` (nối cột) không dùng nhãn
A/B/C/D nên không bị ảnh hưởng.

---

## 0b. Dọn trùng lặp còn sót + sửa lỗi HTML thật (validate bằng công cụ)

Sau khi soát lại toàn bộ project bằng `node --check` (JS), `json.load`
(tất cả file JSON), đối chiếu ID giữa từng cặp JS ↔ HTML, và
`html-validate` (bộ validate HTML thật, không đoán):

**🗑️ Xoá 6 file dữ liệu trùng lặp 100% ở `data/` gốc** — đã đối chiếu
md5 từng cặp và xác nhận **giống hệt byte-by-byte** với bản đã tổ chức
trong `data/ic3/raw/`: `minitest_K3_questions.xlsx/csv`,
`minitest_k4_question_bank.xlsx`, `minitest_k5_questions.xlsx`,
`Minitest_K6_QuestionBank.xlsx`, `QuizData_K7_4Minitests.xlsx`,
`QuizData_K8_4Minitest.xlsx`. Đây là hậu quả của việc merge zip cũ +
zip mới vào cùng 1 thư mục — giờ `data/` chỉ còn duy nhất `data/ic3/`.

**✅ Sửa 49/68 lỗi HTML thật** (chạy `html-validate index.html
ic3-dashboard.html image-manager.html`), gồm 3 nhóm lặp lại nhiều lần:
- Thêm `type="button"` cho **32 thẻ `<button>`** thiếu (mặc định trình
  duyệt coi là `type="submit"`, có thể vô tình submit form/reload trang).
- Thêm `scope="col"` cho 5 thẻ `<th>` trong bảng báo cáo (dashboard) —
  yêu cầu WCAG cho accessibility (screen reader đọc đúng cột).
- Mã hoá ký tự `&` thô thành `&amp;` (2 chỗ) và thêm `aria-label` cho
  9 nút toggle chỉ có icon, không có chữ (dùng đúng text của `<label>`
  đứng cạnh, vd. `aria-label="Chặn tự sửa điểm"`).

**⚠️ 19 lỗi còn lại (`no-inline-style`) — CỐ Ý CHƯA SỬA:** đây là các
thuộc tính `style="..."` viết trực tiếp trên thẻ HTML (chủ yếu ở
`ic3-dashboard.html`). Đây là **quy tắc phong cách** (nhiều dự án không
bật rule này), không phải lỗi làm hỏng chức năng. Chuyển hết sang class
CSS cần thời gian kiểm thử kỹ (một số style là layout 1 lần, tách ra
class mới có thể tạo thêm rủi ro). Nếu bạn muốn dọn nốt, nhắn mình làm
tiếp — nhưng ưu tiên thấp hơn các lỗi chức năng đã sửa ở trên.

**🔗 Đã xác minh liên kết JS ↔ HTML bằng script đối chiếu ID** (không
đoán): `js/quiz-engine.js` ↔ `index.html`, `js/dashboard.js` ↔
`ic3-dashboard.html`, `js/image-manager.js` ↔ `image-manager.html` —
**khớp 100%**, kể cả các ID tưởng như "thiếu" (`newSetName`,
`newSetLink`...) thực chất được `dashboard.js` tự tạo động qua
`innerHTML` khi mở modal "Tạo bộ đề mới", không phải lỗi.

---

## 0b. Cập nhật trước đó: sửa lỗi nghiêm trọng + gắn kết các trang

**🔴 Lỗi nghiêm trọng đã sửa:** `index.html` và `ic3-dashboard.html` có
dấu xung đột merge Git chưa giải quyết (`<<<<<<< HEAD ... =======
... >>>>>>>`) — khiến 2 file này không phải HTML hợp lệ (bản code cũ
monolithic và bản refactor mới nằm chồng lên nhau). Đây là nguyên nhân
VS Code báo lỗi đỏ trên 2 file. Đã resolve bằng cách giữ đúng nhánh
HEAD (bản refactor mới, khớp mục 1-5 bên dưới), loại bỏ hoàn toàn bản
code cũ trùng lặp.

**📁 Tách hoàn toàn HTML / CSS / JS (MỚI):** trước đây `ic3-dashboard.html`
và `image-manager.html` mỗi file có ~700-1500 dòng CSS/JS viết thẳng
trong `<style>`/`<script>` nội tuyến. Đã tách ra:
- `css/dashboard.css` + `js/dashboard.js` ← từ `ic3-dashboard.html`
- `css/image-manager.css` + `js/image-manager.js` ← từ `image-manager.html`
- `js/main.js` ← đoạn script khởi tạo nhỏ còn lại trong `index.html`

Giờ cả 3 trang `.html` chỉ còn phần khung (markup), không còn CSS/JS
viết tay bên trong — sửa giao diện thì vào `css/`, sửa hành vi thì vào
`js/`, không phải kéo lên xuống trong 1 file HTML dài cả nghìn dòng nữa.

**🧹 Dọn file rác trùng lặp ở gốc dự án:** phát hiện `googleSheet.js`,
`quiz-engine-upgrade.js`, `Code.gs` ở thư mục gốc là **bản cũ, không
còn được bất kỳ trang nào gọi tới** (bản đang dùng thật nằm ở
`js/googleSheet.js`, `js/quiz-engine.js`, `apps/Code.gs`) — đã chuyển
vào `legacy/` để đối chiếu khi cần, không xóa hẳn. Riêng `quiz_schema.sql`
ở gốc trùng **y hệt** `docs/quiz_schema.sql` (chỉ khác xuống dòng
CRLF/LF) nên đã xóa bản trùng, giữ lại bản trong `docs/`.

**🎨 Gắn kết giao diện — `css/theme.css` (MỚI):** Trước đây 3 trang
`index.html` (qua `style.css`), `ic3-dashboard.html`, `image-manager.html`
mỗi trang tự khai báo bộ biến màu `:root` riêng — `ic3-dashboard.html`
dùng tông tím khác hẳn (`#6366f1`) so với 2 trang kia (`#6c63ff`), tên
biến cũng khác (`--bg-main` vs `--bg`). Đã gộp thành 1 file
`css/theme.css` là **nguồn duy nhất** cho màu thương hiệu, bo góc, đổ
bóng dùng chung. `ic3-dashboard.html` giữ lại vài token riêng của nó
(đổ bóng thẻ 3D, màu tag khối lớp) vì đặc thù layout, còn lại đều tham
chiếu `css/theme.css`.
→ **Muốn đổi màu thương hiệu toàn nền tảng: chỉ sửa `css/theme.css`.**

**🔗 Liên kết điều hướng:** `image-manager.html` có nút "← Dashboard"
quay về `ic3-dashboard.html`; `ic3-dashboard.html` có nút "🎓 Xem trang
học sinh" mở `index.html` ở tab mới. `index.html` (trang học sinh) cố
tình KHÔNG có link sang khu quản trị, tránh học sinh vô tình mở nhầm.

**Cấu trúc file/thư mục mới nhất:**
```
EduQuiz/
├─ index.html              (chỉ markup — trang học sinh)
├─ ic3-dashboard.html       (chỉ markup — dashboard giáo viên)
├─ image-manager.html       (chỉ markup — công cụ quản lý ảnh)
├─ quiz_data.json
│
├─ css/
│  ├─ theme.css              (★ token màu/bo góc/đổ bóng DÙNG CHUNG)
│  ├─ dashboard.css          (★ MỚI — CSS riêng dashboard)
│  └─ image-manager.css      (★ MỚI — CSS riêng image-manager)
├─ style.css                 (CSS riêng của index.html, nạp SAU theme.css)
│
├─ js/
│  ├─ quiz-engine.js         (engine DUY NHẤT cho index.html)
│  ├─ gamification.js        (XP / streak / huy hiệu)
│  ├─ googleSheet.js         (gửi kết quả lên Google Sheet)
│  ├─ main.js                (★ MỚI — khởi tạo index.html)
│  ├─ dashboard.js           (★ MỚI — hành vi ic3-dashboard.html)
│  └─ image-manager.js       (★ MỚI — hành vi image-manager.html)
│
├─ legacy/                   (bản cũ giữ để đối chiếu/rollback — KHÔNG dùng)
│  ├─ quiz-engine.old.js
│  ├─ googleSheet.old.js
│  ├─ quiz-engine-upgrade.old.js
│  └─ Code.old.gs
│
└─ (data/, img/, apps/, docs/, scripts/ — không đổi, xem mục 1 gốc)
```

---

File này ghi lại **những gì đã thay đổi** so với bản gốc, **vì sao**, và
**những việc cần làm tiếp** — dựa trên bản phân tích 4 khía cạnh
(UX, Content, Storage, Maintainability) đã trao đổi trước đó.

> ⚠️ Đây là bản refactor có kiểm chứng logic + syntax-check kỹ, nhưng
> **chưa được test trên trình duyệt thật** (môi trường build không có
> GUI browser). Trước khi đưa lên GitHub Pages, hãy mở `index.html`
> bằng 1 local server (vd. `npx serve .` hoặc VS Code Live Server) và
> thử làm hết 1 bài thi để chắc chắn mọi thứ chạy đúng như log console
> mô tả bên dưới.

---

## 1. Cấu trúc thư mục mới

```
EduQuiz/
├─ index.html              (trang làm bài — học sinh)
├─ ic3-dashboard.html       (dashboard — không đổi, chưa có dữ liệu động)
├─ image-manager.html       (công cụ quản lý ảnh — vẫn chỉnh quiz_data.json)
├─ style.css
├─ quiz_data.json           (★ vẫn giữ — xem mục 3 "Vì sao giữ file này")
│
├─ js/
│  ├─ quiz-engine.js         (★ engine DUY NHẤT — hợp nhất từ bản "upgrade")
│  ├─ gamification.js        (★ MỚI — XP / streak / huy hiệu)
│  └─ googleSheet.js         (gửi kết quả lên Google Sheet, không đổi logic)
│
├─ apps/
│  └─ Code.gs                (Google Apps Script — thêm LockService + doGet leaderboard)
│
├─ data/
│  └─ ic3/
│     ├─ meta.json           (★ MỚI — nhẹ, chỉ số lượng câu hỏi, cho lobby)
│     ├─ THCS__LV1.json      (★ MỚI — câu hỏi đầy đủ Khối 6)
│     ├─ THCS__LV2.json      (Khối 7) · THCS__LV3.json (Khối 8)
│     ├─ TIH__LV1.json       (Khối 3) · TIH__LV2.json (Khối 4) · TIH__LV3.json (Khối 5)
│     └─ raw/                (file Excel/CSV gốc, đổi tên thống nhất k3..k8)
│
├─ img/                      (giữ nguyên, phẳng — xem mục 4)
│
├─ scripts/
│  └─ split-quiz-data.py     (★ MỚI — sinh lại data/ic3/*.json từ quiz_data.json)
│
├─ legacy/
│  └─ quiz-engine.old.js     (bản engine cũ, giữ lại để đối chiếu/rollback)
│
└─ docs/
   └─ quiz_schema.sql        (schema tham khảo, không đổi)
```

## 2. Đã làm gì, theo đúng 4 mục đã phân tích

### (A) Hợp nhất 2 bản engine trùng lặp
Dự án gốc có `quiz-engine.js` (bản cũ, đang được `index.html` dùng) và
`quiz-engine-upgrade.js` (bản mới hơn, nhiều tính năng hơn nhưng
**chưa từng được gắn vào `index.html`**). Hai file này trùng lặp phần lớn
logic (anti-cheat, lưu lịch sử, theme...).

→ Đã chọn bản "upgrade" làm nền (nhiều tính năng hơn, tách bạch rõ với
`googleSheet.js`), đặt tên lại thành `js/quiz-engine.js` duy nhất, và
**gắn nó vào `index.html`** — đây là lần đầu tiên các cải tiến trong bản
upgrade thực sự chạy trên trang. Bản cũ được giữ ở `legacy/` để đối chiếu,
không xoá hẳn để có thể rollback.

### (B) Tải dữ liệu theo khối (lazy-load) — tối ưu tốc độ
Trước đây `fetch('quiz_data.json')` tải nguyên **~1MB** ngay khi mở trang,
dù học sinh chỉ làm 1 khối/1 minitest.

→ `js/quiz-engine.js` giờ tải `data/ic3/meta.json` (~3KB) trước để dựng
3 dropdown ở lobby. Chỉ khi bấm "Bắt đầu thi", nó mới tải đúng 1 file
của khối đang chọn (`data/ic3/THCS__LV1.json` ≈ 70-140KB) — nhỏ hơn
7-15 lần so với trước.

Có **3 lớp fallback** để không bao giờ làm trang trắng:
`meta.json` lỗi → tự tải nguyên `quiz_data.json` như cũ → vẫn lỗi →
dùng `DEMO_DATA` có sẵn trong code.

### (C) Gamification cơ bản (không cần backend mới)
`js/gamification.js` là module độc lập, tự quản lý state riêng trong
`localStorage['eduquiz_gamestate']`, không đụng vào logic chấm điểm/anti-cheat
hiện có:
- **XP**: +10/câu đúng, +50/bài hoàn thành, +100 nếu đạt điểm tuyệt đối.
- **Cấp độ**: tính theo ngưỡng XP (10 cấp).
- **Streak**: số ngày làm bài liên tiếp (dựa theo ngày hệ thống của máy học sinh).
- **Huy hiệu**: "Bài đầu tiên", "3/7 ngày liên tiếp", "Điểm tuyệt đối", "10 bài đã làm".

Hiển thị ở lobby (`#lobbyGameStrip`) và có toast báo khi mở khoá huy hiệu mới.
Đây là bản MVP — xem mục 5 để mở rộng lên bảng xếp hạng thật.

### (D) Bảng xếp hạng (leaderboard) — endpoint mới trong Apps Script
`apps/Code.gs` thêm hàm `doGet(e)`: gọi `APPS_SCRIPT_URL + '?action=leaderboard&limit=10'`
(có thể thêm `&class=6A1`) để lấy top điểm cao từ chính Sheet đang lưu kết quả —
**không cần thêm database mới**. Đây mới là *backend endpoint*; front-end
hiển thị bảng xếp hạng (vd. trên `ic3-dashboard.html`) là bước tiếp theo,
xem mục 5.

Cũng đã thêm `LockService` vào `doPost()` để tránh mất dữ liệu khi
nhiều học sinh nộp bài cùng lúc (bản gốc chưa có khoá ghi).

### (E) Chuẩn hoá nguồn dữ liệu thô
File Excel/CSV gốc (`Minitest_K6_QuestionBank.xlsx`, `QuizData_K7_4Minitests.xlsx`...)
được copy và **đổi tên** vào `data/ic3/raw/k3_questions.xlsx` ... `k8_questions.xlsx`
— quy ước tên thống nhất. **Lưu ý quan trọng**: các file này hiện chỉ mang tính
lưu trữ/tham khảo — ứng dụng KHÔNG đọc trực tiếp từ Excel (xem mục 3), vì
cấu trúc cột giữa các khối khác nhau hoàn toàn (đã kiểm tra thực tế, K5 có
1 sheet/câu hỏi kiểu bảng, còn K6/K7/K8 chỉ có sheet tổng hợp thống kê).
Chuẩn hoá triệt để cấu trúc cột cần làm thủ công cho từng khối — xem mục 5.

---

## 3. Vì sao vẫn giữ `quiz_data.json` ở gốc?

`image-manager.html` (công cụ quản lý ảnh) đọc/ghi trực tiếp file này và
đã hoạt động tốt. Việc bẻ nó ra nhiều file nhỏ sẽ đòi hỏi viết lại toàn bộ
tool đó (615+ dòng) — rủi ro cao hơn lợi ích trong lần refactor này.
→ Quyết định: **giữ `quiz_data.json` làm "nguồn sự thật" mà admin chỉnh sửa**,
còn `data/ic3/*.json` là **bản build phái sinh** để app học sinh tải nhanh hơn.

### Quy trình cập nhật câu hỏi/ảnh (không cần sửa code)
1. Mở `image-manager.html` → sửa câu hỏi/ảnh như bình thường → "Xuất quiz_data.json".
2. Thay file `quiz_data.json` ở gốc dự án bằng file vừa xuất.
3. Chạy: `python3 scripts/split-quiz-data.py`
4. Commit cả `quiz_data.json` lẫn toàn bộ `data/ic3/*.json` mới sinh ra.

Nếu quên bước 3, học sinh vẫn thấy dữ liệu **cũ** (vì app đọc từ `data/ic3/`,
không đọc trực tiếp `quiz_data.json` nữa) — image-manager.html giờ tự nhắc
điều này ngay trong toast lúc xuất file.

---

## 4. Vì sao KHÔNG tách `img/` thành thư mục con theo khối?

Đã cân nhắc, nhưng `image-manager.html` build đường dẫn ảnh dạng phẳng
(`img/<filename>`) ở nhiều chỗ trong code. Tách thư mục sẽ phải sửa tool
đó + toàn bộ `image_file` trong `quiz_data.json` cùng lúc — dễ gây lệch
dữ liệu nếu làm vội. Việc này để ở mục 5 (bước tiếp theo) khi có thời gian
kiểm thử kỹ hơn.

Việc **đã làm ngay** được: không tải ảnh thừa — quiz chỉ tải ảnh của câu
đang hiển thị (`loading="lazy"` sẵn có ở thẻ `<img>` do engine sinh ra
qua `_buildImageBlock`) — nếu chưa có, kiểm tra và thêm `loading="lazy"`
là việc nhỏ, nên làm sớm.

---

## 5. Việc nên làm tiếp (chưa làm trong lần này, để tránh phá vỡ hệ thống đang chạy)

| Việc | Vì sao chưa làm | Độ ưu tiên |
|---|---|---|
| Nén ảnh trong `img/` (4.8MB → ~1-1.5MB) | Cần công cụ nén ảnh (sharp/imagemin), không có sẵn trong môi trường build này | Cao |
| Hiển thị bảng xếp hạng trên `ic3-dashboard.html` bằng endpoint `doGet` mới | Cần `SHEET_ID` thật của bạn để test được — hiện `Code.gs` vẫn để placeholder | Cao |
| Chuẩn hoá cột Excel nguồn theo đúng `docs/quiz_schema.sql` cho cả 6 khối | Cấu trúc 5 file Excel gốc khác nhau hoàn toàn, cần bạn xác nhận layout chuẩn muốn dùng trước khi viết parser | Trung bình |
| Tổ chức lại `img/` theo khối | Phụ thuộc việc sửa `image-manager.html` cùng lúc | Trung bình |
| Đưa vào Vite, giữ vanilla JS | An toàn để làm độc lập, không phụ thuộc các việc trên | Trung bình |
| Cá nhân hoá "ôn lại phần yếu" dựa trên lịch sử `localStorage` | Cần thêm thống kê chi tiết theo dạng câu hỏi vào `saveRecord()` | Thấp |

---

## 6. Kiểm thử trước khi deploy

```bash
# Chạy local server ở thư mục gốc EduQuiz/ rồi mở http://localhost:5000
npx serve . -l 5000
```

Checklist thủ công:
- [ ] Mở `index.html`, console không có lỗi đỏ, thấy log
      `[EduQuiz] ✅ meta.json nạp thành công (lazy-load câu hỏi theo khối)!`
- [ ] Chọn Category → Level → Minitest, số câu hiện đúng ở khung thống kê
- [ ] Bấm "Bắt đầu thi": nút chuyển sang "⏳ Đang tải câu hỏi..." rồi vào bài
      đúng minitest đã chọn (kiểm tra vài câu đầu khớp với `data/ic3/*.json`)
- [ ] Làm hết bài, nộp bài, thấy toast huy hiệu "🎉 Bài đầu tiên"
- [ ] Bấm "Về Lobby", dải XP/Streak ở góc trái cập nhật số mới
- [ ] Mở lại `image-manager.html`, vẫn tải và sửa `quiz_data.json` bình thường
- [ ] Dán `SHEET_ID` thật + deploy lại `apps/Code.gs`, chạy `testDoPost()` để
      chắc chắn `LockService` không làm hỏng luồng ghi cũ
