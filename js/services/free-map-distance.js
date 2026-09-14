/* ============================================================
   js/services/free-map-distance.js
   Tính khoảng cách đường bộ (km) từ ĐỊA CHỈ NHÀ THẬT của giáo viên (cột
   "Địa chỉ nhà" ở tab "👤 Giáo viên", dùng NGUYÊN VĂN) tới TRƯỜNG mà giáo
   viên đó đi dạy — dùng cho tab "🚗 Hỗ trợ xăng xe"
   (js/teaching-schedule-travel.js).

   THAY Google Maps (API trả phí, bắt buộc gắn thẻ ngân hàng dù có hạn
   mức miễn phí hàng tháng) bằng 2 dịch vụ MIỄN PHÍ HOÀN TOÀN, KHÔNG CẦN
   API KEY, KHÔNG CẦN THẺ NGÂN HÀNG:
     - Nominatim (OpenStreetMap) — geocode địa chỉ + tìm trường theo tên.
       https://nominatim.org/release-docs/latest/api/Search/
     - OSRM demo server (Open Source Routing Machine) — tính khoảng cách
       lái xe thật giữa 2 toạ độ. https://project-osrm.org/

   ĐÁNH ĐỔI so với Google Maps (cần biết trước khi dùng):
   - Dữ liệu bản đồ OpenStreetMap ở Việt Nam ĐẦY ĐỦ nhưng KHÔNG có dữ liệu
     tới TỪNG SỐ NHÀ trong hẻm/ngách (chỉ có tới cấp con đường/khu phố), và
     đôi khi không nhận chữ "Quận "/"Huyện " đứng trước tên quận/huyện —
     tra thẳng cả địa chỉ đầy đủ (có số nhà kiểu "861/18/25A..." hoặc
     "Quận Tân Phú") thường THẤT BẠI dù các phần còn lại hoàn toàn đúng.
     Đã thêm 2 PHƯƠNG ÁN dự phòng tự động khi tra nguyên văn thất bại: (2)
     bỏ cụm số nhà/hẻm ở đầu (stripHouseNumber()), (3) bỏ tiếp chữ "Quận/
     Huyện/Thị xã" (stripDistrictWord()) rồi tra lại — xem geocode(). Kết
     quả từ phương án 2/3 là toạ độ XẤP XỈ theo con đường/khu phố (đủ
     chính xác cho việc tính bậc hỗ trợ 11km/15km, không cần đúng tuyệt
     đối từng căn nhà), được đánh dấu `approximateHome: true` để travel.js
     báo hiệu cho người dùng biết.
   - Server OSRM/Nominatim dùng ở đây là SERVER DEMO CÔNG CỘNG (miễn phí,
     không phải hạ tầng riêng) — có "Usage Policy" giới hạn: TỐI ĐA 1 yêu
     cầu/giây, không dùng cho khối lượng lớn liên tục. Code dưới đây tự
     giãn cách ĐỦ CHẬM (xem STAGGER_MS) để tuân thủ — vì vậy quét nhiều
     giáo viên/nhiều trường sẽ CHẬM HƠN rõ rệt so với Google (vài giây/1
     dòng, có thể tới 2-3 lần gọi/dòng nếu phải thử cả 3 phương án geocode
     + tìm trường), đổi lại KHÔNG TỐN ĐỒNG NÀO.
   - Nếu sau này cần nhanh + chính xác hơn cho khối lượng lớn, có thể tự
     host Nominatim/OSRM (miễn phí phần mềm, nhưng tốn tiền server) hoặc
     quay lại Google Maps (js/services/google-maps-distance.js vẫn còn
     trong lịch sử git nếu cần).

   Nạp file này TRƯỚC js/teaching-schedule-travel.js.
   ============================================================ */
(function (global) {
  'use strict';

  const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
  const OSRM_BASE = 'https://router.project-osrm.org';
  // Nominatim yêu cầu TỐI ĐA 1 request/giây — 1100ms để có biên an toàn.
  const STAGGER_MS = 1100;
  const geocodeCache = new Map(); // địa chỉ → {lat,lon} | null, tránh gọi lại cho cùng 1 giáo viên khi dò nhiều trường

  let lastCallAt = 0;
  /** Đợi đủ STAGGER_MS kể từ lần gọi Nominatim TRƯỚC ĐÓ (không phải chờ cố
   * định mỗi lần) — chỉ chờ thêm nếu lần gọi trước còn quá gần. */
  async function throttle() {
    const wait = STAGGER_MS - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  }

  async function nominatimSearch(params) {
    await throttle();
    const url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=1&${params}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'vi' } });
    if (!res.ok) throw new Error(`Nominatim lỗi HTTP ${res.status}`);
    return res.json();
  }

  /** Bỏ CỤM SỐ NHÀ/HẺM/NGÁCH ở đầu địa chỉ (vd "861/18/25A ", "82/4/32k ",
   * "42A, Đường " ) — đây là phần OpenStreetMap Việt Nam THƯỜNG KHÔNG có
   * dữ liệu tới từng số nhà trong hẻm (khác nhà mặt tiền đường lớn), nên
   * để nguyên cụm số này trong câu truy vấn hay khiến Nominatim trả về
   * KHÔNG TÌM THẤY dù tên đường/phường/thành phố phía sau hoàn toàn đúng.
   * Bỏ cụm số → tìm theo TÊN ĐƯỜNG/PHƯỜNG còn lại vẫn định vị được (kết
   * quả xê dịch trong phạm vi con đường/khu phố đó, đủ chính xác cho mục
   * đích tính hỗ trợ xăng xe theo bậc 11km/15km, không cần chính xác tới
   * từng căn nhà). CHỈ dùng làm phương án 2 khi địa chỉ ĐẦY ĐỦ tra thẳng
   * thất bại — ưu tiên địa chỉ đầy đủ trước vì chính xác hơn khi tra được. */
  function stripHouseNumber(address) {
    return address.replace(/^\d+[A-Za-zĐđ]?(?:[\/\-]\d+[A-Za-zĐđ]?)*\s*,?\s*(?:Đ\.|Đường)?\s*/i, '').trim();
  }

  /** Bỏ chữ "Quận "/"Huyện "/"Thị xã " đứng trước tên quận/huyện — Nominatim
   * hay KHÔNG khớp được khi câu truy vấn giữ nguyên chữ này (vd "Quận Tân
   * Phú" thất bại nhưng "Tân Phú" một mình lại ra đúng kết quả), có lẽ do
   * dữ liệu OSM lưu tên hành chính KHÔNG kèm tiền tố loại đơn vị. Dùng làm
   * PHƯƠNG ÁN 3, sau khi đã bỏ số nhà/hẻm ở phương án 2 mà vẫn thất bại. */
  function stripDistrictWord(address) {
    return address.replace(/\b(Quận|Huyện|Thị xã)\s+/gi, '').trim();
  }

  /** Toạ độ thật của 1 địa chỉ — cache theo chuỗi (KHÔNG chỉnh sửa/viết
   * lại địa chỉ ở PHƯƠNG ÁN 1, dùng đúng nguyên văn cột "Địa chỉ nhà"; chỉ
   * rút gọn dần ở phương án 2/3 nếu phương án trước thất bại, xem
   * stripHouseNumber()/stripDistrictWord()). Trả về null nếu không định vị
   * được ở CẢ 3 cách, kèm cờ `approximate: true` nếu phải dùng phương án 2
   * hoặc 3 (địa chỉ đã rút gọn) — để nơi gọi báo hiệu đây là toạ độ XẤP XỈ
   * theo con đường/khu phố, không phải đúng số nhà, tránh ngộ nhận độ
   * chính xác. */
  async function geocode(address) {
    if (geocodeCache.has(address)) return geocodeCache.get(address);

    const exact = await nominatimSearch(`q=${encodeURIComponent(address)}&countrycodes=vn`);
    if (exact && exact[0]) {
      const result = { lat: Number(exact[0].lat), lon: Number(exact[0].lon), approximate: false };
      geocodeCache.set(address, result);
      return result;
    }

    let result = null;
    const candidates = [];
    const noHouseNumber = stripHouseNumber(address);
    if (noHouseNumber && noHouseNumber !== address) candidates.push(noHouseNumber);
    const noDistrictWord = stripDistrictWord(noHouseNumber || address);
    if (noDistrictWord && !candidates.includes(noDistrictWord) && noDistrictWord !== address) candidates.push(noDistrictWord);

    for (const candidate of candidates) {
      const approx = await nominatimSearch(`q=${encodeURIComponent(candidate)}&countrycodes=vn`);
      if (approx && approx[0]) {
        result = { lat: Number(approx[0].lat), lon: Number(approx[0].lon), approximate: true };
        break;
      }
    }
    geocodeCache.set(address, result);
    return result;
  }

  /** DÒ đúng trường thật theo tên, ưu tiên kết quả GẦN toạ độ `near`
   * (khung tìm kiếm ~30km quanh nhà giáo viên, qua tham số `viewbox` +
   * `bounded=1` của Nominatim — tương đương locationBias của Google) —
   * trả về {lat, lon, address} hoặc null nếu không tìm thấy nơi nào khớp
   * tên (kể cả sau khi thử lại KHÔNG giới hạn vùng). */
  async function findSchoolPlace(schoolName, near) {
    // ~0.27 độ vĩ/kinh ≈ 30km ở vĩ độ Việt Nam — đủ khung "quanh nhà".
    const DEG = 0.27;
    if (near) {
      const viewbox = `${near.lon - DEG},${near.lat + DEG},${near.lon + DEG},${near.lat - DEG}`;
      const near1 = await nominatimSearch(`q=${encodeURIComponent(schoolName)}&viewbox=${viewbox}&bounded=1&countrycodes=vn`);
      if (near1 && near1[0]) return { lat: Number(near1[0].lat), lon: Number(near1[0].lon), address: near1[0].display_name };
    }
    // Không tìm thấy trong bán kính 30km quanh nhà (hoặc chưa geocode được
    // nhà) — thử lại KHÔNG giới hạn vùng, chấp nhận rủi ro trùng tên ở nơi
    // khác xa hơn còn hơn là không tính được gì.
    const wide = await nominatimSearch(`q=${encodeURIComponent(schoolName)}&countrycodes=vn`);
    if (wide && wide[0]) return { lat: Number(wide[0].lat), lon: Number(wide[0].lon), address: wide[0].display_name };
    return null;
  }

  /** Khoảng cách lái xe thật (km, làm tròn 1 số lẻ) giữa 2 toạ độ, qua
   * OSRM demo server — KHÔNG throttle riêng (OSRM demo không công bố giới
   * hạn nghiêm ngặt như Nominatim, nhưng vẫn nên dùng vừa phải). */
  async function routeDistanceKm(from, to) {
    const url = `${OSRM_BASE}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM lỗi HTTP ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes[0]) return null;
    return Math.round((data.routes[0].distance / 1000) * 10) / 10; // mét → km
  }

  /**
   * Tính khoảng cách đường bộ từ ĐỊA CHỈ NHÀ giáo viên tới TRƯỜNG (tên
   * ngắn, tự do). Trả về null nếu không định vị được 1 trong 2 nơi —
   * KHÔNG throw để bên gọi có thể bỏ qua từng cặp lỗi mà không chặn cả
   * loạt còn lại.
   * @param {string} origin Địa chỉ nhà giáo viên — dùng NGUYÊN VĂN.
   * @param {string} destination Tên trường.
   * @returns {Promise<{km: number, matchedSchoolAddress: string|null, approximateHome: boolean}|null>}
   */
  async function computeDistanceKm(origin, destination) {
    if (!origin || !destination) throw new Error('Thiếu địa chỉ nhà hoặc tên trường.');
    const home = await geocode(origin);
    if (!home) return null;
    const school = await findSchoolPlace(destination, home);
    if (!school) return null;
    const km = await routeDistanceKm(home, school);
    if (km === null) return null;
    return { km, matchedSchoolAddress: school.address, approximateHome: home.approximate };
  }

  // Không cần API key/nạp thư viện gì thêm (chỉ fetch() thẳng tới 2 server
  // công cộng) — 3 hàm dưới đây giữ lại CHỈ ĐỂ khớp interface cũ (đã có
  // nơi gọi ensureLoaded() trước khi dùng), làm no-op vô hại.
  function ensureLoaded() { return Promise.resolve(); }
  function getApiKey() { return null; }
  function forgetApiKey() { /* không có key để quên */ }

  global.EduFreeMapDistance = { computeDistanceKm, ensureLoaded, getApiKey, forgetApiKey };
})(window);
