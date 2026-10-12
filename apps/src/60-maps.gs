// ====== KHOẢNG CÁCH ĐƯỜNG BỘ (tab "🚗 Hỗ trợ xăng xe" — teaching-schedule.html) ======
// Router: mapDistance. Dùng dịch vụ Maps có sẵn của Apps Script (dữ liệu Google Maps, có
// số nhà/hẻm ở Việt Nam, không cần API key hay thẻ ngân hàng) thay cho máy chủ demo
// OpenStreetMap trước đây (giới hạn 1 lượt/giây, thiếu số nhà trong hẻm).
// Hạn mức: tài khoản Gmail thường ~1.000 lượt geocode/ngày cho cả project → mỗi người
// tối đa MAPS_MAX_PER_USER_PER_DAY lượt; kết quả giữ 6 giờ trong CacheService.

/**
 * p: { origin: địa chỉ nhà giáo viên, destination: tên trường (kèm thành phố) }
 * @returns {{km:number, matchedSchoolAddress:string, approximateHome:boolean}|null}
 *   null = không định vị được nhà hoặc trường.
 */
function mapDistance_(p, who) {
  const origin = String(p.origin || '').trim();
  const destination = String(p.destination || '').trim();
  if (!origin || !destination || origin.length > 300 || destination.length > 300) {
    throw appError_('invalid-argument', 'Thiếu hoặc quá dài: địa chỉ nhà / tên trường.');
  }

  const cache = CacheService.getScriptCache();
  const key = 'dist:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, origin + '\n' + destination));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const day = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  const quotaKey = 'mapsq:' + who.uid + ':' + day;
  const used = Number(cache.get(quotaKey) || 0);
  if (used >= MAPS_MAX_PER_USER_PER_DAY) {
    throw appError_('resource-exhausted', 'Đã tính ' + used + ' khoảng cách hôm nay — giới hạn ' +
      MAPS_MAX_PER_USER_PER_DAY + '/ngày/người để giữ hạn mức bản đồ chung. Điền tay hoặc thử lại ngày mai.');
  }
  cache.put(quotaKey, String(used + 1), 24 * 60 * 60);

  const home = geocodeVn_(origin, null);
  if (!home) return remember_(cache, key, null);
  // Tìm trường QUANH nhà giáo viên (±0,3° ≈ 33 km) — trùng tên trường giữa các quận là chuyện thường.
  const school = geocodeVn_(destination, home);
  if (!school) return remember_(cache, key, null);

  const dir = Maps.newDirectionFinder()
    .setOrigin(home.lat, home.lng)
    .setDestination(school.lat, school.lng)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .setLanguage('vi')
    .getDirections();
  if (!dir || dir.status !== 'OK' || !dir.routes.length) return remember_(cache, key, null);
  const meters = dir.routes[0].legs.reduce(function (m, leg) { return m + leg.distance.value; }, 0);

  return remember_(cache, key, {
    km: Math.round(meters / 100) / 10,
    matchedSchoolAddress: school.address,
    approximateHome: home.approximate,
  });
}

/** Geocode trong Việt Nam; `near` (toạ độ) → ưu tiên kết quả quanh điểm đó. */
function geocodeVn_(address, near) {
  const geocoder = Maps.newGeocoder().setRegion('vn').setLanguage('vi');
  if (near) geocoder.setBounds(near.lat - 0.3, near.lng - 0.3, near.lat + 0.3, near.lng + 0.3);
  const res = geocoder.geocode(address);
  if (!res || res.status !== 'OK' || !res.results.length) return null;
  const r = res.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    address: r.formatted_address,
    // Không khớp tới số nhà (chỉ tới đường/phường) → báo "xấp xỉ" như bản cũ.
    approximate: !!r.partial_match || r.geometry.location_type === 'APPROXIMATE' ||
      r.geometry.location_type === 'GEOMETRIC_CENTER',
  };
}

function remember_(cache, key, value) {
  cache.put(key, JSON.stringify(value), DEDUPE_TTL_SEC);
  return value;
}
