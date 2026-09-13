/* ============================================================
   js/services/google-maps-distance.js
   Tính khoảng cách đường bộ (km) từ ĐỊA CHỈ NHÀ THẬT của giáo viên (cột
   "Địa chỉ nhà" ở tab "👤 Giáo viên", dùng ĐÚNG NGUYÊN VĂN, không chỉnh
   sửa) tới TRƯỜNG mà giáo viên đó đi dạy — dùng cho tab "🚗 Hỗ trợ xăng
   xe" (js/teaching-schedule-travel.js) để TỰ ĐỘNG điền khoảng cách thay
   vì Điều phối giáo viên phải tự tra Google Maps rồi gõ tay từng ô.

   "Trường" trong teaching_schedule chỉ là 1 TÊN NGẮN tự do (vd "THCS Mạch
   Kiếm Hùng", "TiH Tân Tạo A" — không phải địa chỉ đầy đủ), nên tính
   thẳng bằng DistanceMatrixService (chỉ nhận địa chỉ/toạ độ) dễ bắt nhầm
   trường trùng tên ở khu vực khác. Quy trình 2 bước để "DÒ" đúng trường
   thật gần nhà giáo viên:
     1. Geocode địa chỉ nhà → lấy toạ độ (lat/lng) thật của giáo viên.
     2. Dùng Places API (findPlaceFromQuery) tìm ĐÚNG trường theo tên,
        ƯU TIÊN kết quả GẦN toạ độ nhà đó (locationBias, bán kính 30km —
        đủ phủ cả TP.HCM) thay vì để Google trả bừa kết quả trùng tên ở
        tỉnh khác xa hàng trăm km.
     3. Tính khoảng cách lái xe thật (DistanceMatrixService) từ toạ độ
        nhà → place_id trường đã xác định ở bước 2 (place_id chính xác
        hơn nhiều so với truyền thẳng chuỗi tên trường).
   Bước 2 thất bại (không tìm thấy nơi nào khớp tên) → rơi về tính thẳng
   theo chuỗi "tên trường, Thành phố Hồ Chí Minh, Việt Nam" như trước,
   không chặn hẳn nếu API Places lỗi/không định vị được.

   CẦN 1 GOOGLE MAPS API KEY CỦA RIÊNG BẠN (không đi kèm sẵn trong code —
   dịch vụ TRẢ PHÍ của Google, phải tự tạo trên Google Cloud Console):
     1. console.cloud.google.com → tạo project (hoặc dùng project có sẵn).
     2. Bật CẢ 3 API: "Distance Matrix API", "Geocoding API", "Places API"
        (APIs & Services → Library) — thiếu 1 trong 3 sẽ báo lỗi khi dùng
        đúng bước cần API đó.
     3. Bật thanh toán (Billing) — Google cấp free tier hàng tháng, dùng
        cho vài trăm/vài ngàn lượt tính khoảng cách 1 lần/tuần là gần như
        luôn nằm trong free tier.
     4. Credentials → Create credentials → API key. NÊN giới hạn key này
        (Application restrictions → HTTP referrers) chỉ cho domain đang
        host trang này, tránh bị người khác lấy key dùng ké.
   Hỏi 1 lần qua prompt(), lưu ở localStorage trình duyệt (KHÔNG gửi đi
   đâu khác ngoài Google) — giống hệt cách đã làm với GitHub token ở
   js/github-publish.js.
   ============================================================ */
(function (global) {
  'use strict';

  const API_KEY_STORAGE = 'ic3_gmaps_api_key';
  const HCMC_CENTER = { lat: 10.7769, lng: 106.7009 }; // tâm TP.HCM — dùng làm điểm neo dự phòng nếu chưa geocode được nhà
  let loadPromise = null;
  const geocodeCache = new Map(); // địa chỉ nhà → {lat,lng} — 1 giáo viên tra nhiều trường, khỏi geocode lại mỗi lần

  function getApiKey(forcePrompt) {
    let key = !forcePrompt && localStorage.getItem(API_KEY_STORAGE);
    if (!key) {
      key = (prompt(
        'Dán Google Maps API Key (đã bật "Distance Matrix API" + "Geocoding API" + "Places API" + Billing trên Google Cloud Console).\n\n' +
        'Xem hướng dẫn tạo key trong chú thích đầu file js/services/google-maps-distance.js.\n\n' +
        'Key chỉ lưu trong trình duyệt này (localStorage), không gửi đi đâu ngoài Google.'
      ) || '').trim();
      if (key) localStorage.setItem(API_KEY_STORAGE, key);
    }
    return key;
  }

  function forgetApiKey() {
    localStorage.removeItem(API_KEY_STORAGE);
    loadPromise = null; // buộc nạp lại script với key mới ở lần gọi sau
  }

  /** Nạp Google Maps JavaScript API (kèm thư viện "places") — chỉ 1 lần,
   * dùng chung mọi lần gọi sau — trả về Promise resolve khi đã sẵn sàng,
   * reject nếu thiếu key hoặc script tải lỗi (key sai/hết quyền). */
  function ensureLoaded(forcePromptKey) {
    if (global.google && global.google.maps && global.google.maps.DistanceMatrixService && global.google.maps.places) {
      return Promise.resolve();
    }
    if (loadPromise && !forcePromptKey) return loadPromise;

    const key = getApiKey(forcePromptKey);
    if (!key) return Promise.reject(new Error('Chưa có Google Maps API Key.'));

    loadPromise = new Promise((resolve, reject) => {
      const callbackName = '__eduGmapsLoaded_' + Date.now();
      global[callbackName] = () => {
        delete global[callbackName];
        resolve();
      };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=${callbackName}`;
      script.async = true;
      script.onerror = () => {
        delete global[callbackName];
        loadPromise = null;
        reject(new Error('Không tải được Google Maps JS API — kiểm tra lại API Key/mạng.'));
      };
      document.head.appendChild(script);
    });
    return loadPromise;
  }

  /** Toạ độ thật của 1 địa chỉ — cache theo chuỗi địa chỉ (KHÔNG chỉnh
   * sửa/viết lại địa chỉ, dùng đúng nguyên văn cột "Địa chỉ nhà"). Trả về
   * null nếu Google không định vị được (địa chỉ ghi thiếu/sai). */
  async function geocode(address) {
    if (geocodeCache.has(address)) return geocodeCache.get(address);
    const geocoder = new global.google.maps.Geocoder();
    const result = await new Promise((resolve) => {
      geocoder.geocode({ address, region: 'vn' }, (results, status) => {
        if (status !== 'OK' || !results || !results[0]) { resolve(null); return; }
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      });
    });
    geocodeCache.set(address, result);
    return result;
  }

  /** DÒ đúng trường thật theo tên, ưu tiên kết quả GẦN toạ độ `nearLatLng`
   * (bán kính 30km — đủ phủ cả TP.HCM và vùng ven) — trả về place_id +
   * địa chỉ đầy đủ Google tìm được, hoặc null nếu không tìm thấy nơi nào
   * khớp tên (khi đó bên gọi tự rơi về tính theo chuỗi tên trường thô). */
  async function findSchoolPlace(schoolName, nearLatLng) {
    const map = new global.google.maps.Map(document.createElement('div')); // PlacesService bắt buộc cần 1 Map hoặc HTMLDivElement, không cần gắn vào DOM thật
    const service = new global.google.maps.places.PlacesService(map);
    const center = nearLatLng || HCMC_CENTER;
    return new Promise((resolve) => {
      service.findPlaceFromQuery({
        query: schoolName,
        fields: ['place_id', 'formatted_address', 'name'],
        locationBias: new global.google.maps.Circle({ center, radius: 30000 }),
      }, (results, status) => {
        if (status !== global.google.maps.places.PlacesServiceStatus.OK || !results || !results[0]) {
          resolve(null);
          return;
        }
        resolve(results[0]);
      });
    });
  }

  /**
   * Tính khoảng cách đường bộ (km, làm tròn 1 chữ số thập phân) từ ĐỊA
   * CHỈ NHÀ giáo viên tới TRƯỜNG (tên ngắn, tự do). Trả về null nếu
   * Google không định vị được 1 trong 2 nơi — KHÔNG throw để bên gọi có
   * thể bỏ qua từng cặp lỗi mà không chặn cả loạt còn lại.
   * @param {string} origin Địa chỉ nhà giáo viên — dùng NGUYÊN VĂN.
   * @param {string} destination Tên trường (đã được gọi nơi khác nới rộng
   *   thêm thành phố nếu cần, xem expandSchoolQuery() trong travel.js).
   */
  async function computeDistanceKm(origin, destination) {
    if (!origin || !destination) throw new Error('Thiếu địa chỉ nhà hoặc tên trường.');
    await ensureLoaded(false);

    // Bước 1: toạ độ thật của nhà giáo viên (dùng làm điểm neo DÒ trường +
    // điểm xuất phát tính khoảng cách — chính xác hơn để nguyên chuỗi địa
    // chỉ, vì đã xác nhận Google định vị ra được toạ độ cụ thể).
    const homeLatLng = await geocode(origin);

    // Bước 2: DÒ đúng trường thật gần nhà (Places), rơi về chuỗi tên
    // trường thô nếu không tìm thấy.
    const place = await findSchoolPlace(destination, homeLatLng);
    const destinationParam = place ? { placeId: place.place_id } : destination;
    const originParam = homeLatLng ? new global.google.maps.LatLng(homeLatLng.lat, homeLatLng.lng) : origin;

    const service = new global.google.maps.DistanceMatrixService();
    return new Promise((resolve, reject) => {
      service.getDistanceMatrix({
        origins: [originParam],
        destinations: [destinationParam],
        travelMode: global.google.maps.TravelMode.DRIVING,
        unitSystem: global.google.maps.UnitSystem.METRIC,
      }, (response, status) => {
        if (status === 'REQUEST_DENIED') {
          // Key sai/thiếu quyền/chưa bật billing — xoá key lỗi để lần bấm
          // sau prompt lại ngay, không lặp lại lỗi im lặng nhiều lần.
          forgetApiKey();
          reject(new Error('Google Maps từ chối yêu cầu (kiểm tra lại API Key: đã bật Distance Matrix + Geocoding + Places API + Billing chưa?).'));
          return;
        }
        if (status !== 'OK') { reject(new Error('Lỗi Google Maps: ' + status)); return; }
        const el = response.rows[0] && response.rows[0].elements[0];
        if (!el || el.status !== 'OK') { resolve(null); return; } // không định vị được 1 trong 2 địa chỉ
        resolve({
          km: Math.round((el.distance.value / 1000) * 10) / 10, // mét → km, làm tròn 1 số lẻ
          matchedSchoolAddress: place ? place.formatted_address : null, // để UI hiện ra đã dò trúng trường nào, dễ soát lại
        });
      });
    });
  }

  global.EduGoogleMapsDistance = { computeDistanceKm, ensureLoaded, getApiKey, forgetApiKey };
})(window);
