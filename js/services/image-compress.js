/* ============================================================
   js/services/image-compress.js — nén ảnh NGAY TRÊN TRÌNH DUYỆT trước khi đẩy lên GitHub.

   Vì sao: mọi tệp đã commit nằm trong lịch sử git mãi mãi (xoá/thay sau cũng không bớt).
   Đo 01/11/2026: 92 MB trong ~142 MB lịch sử repo là các bản ảnh cũ chưa nén, trong khi
   bản hiện tại của img/ chỉ ~19 MB. Ảnh chụp màn hình tải lên nguyên bản (vài MB/ảnh,
   nhúng base64 còn +33% và lặp lại mỗi lần sửa file câu hỏi) làm repo phình nhanh nhất.

   Cách nén: thu cạnh dài về tối đa MAX_SIDE px, mã hoá WebP chất lượng QUALITY (đủ nét cho
   chữ trong ảnh chụp màn hình). Giữ NGUYÊN ảnh gốc khi: GIF (có thể là ảnh động), SVG,
   trình duyệt không mã hoá được WebP, hoặc bản nén không nhỏ hơn đáng kể.
   ============================================================ */
(function (global) {
  'use strict';

  const MAX_SIDE = 1600;
  const QUALITY = 0.9;
  const MIN_SAVING = 0.1;   // nén phải bớt ≥ 10% mới dùng
  const COMPRESSIBLE = /^image\/(png|jpeg|webp|bmp)$/;

  /** Kích thước sau khi thu nhỏ (giữ tỉ lệ, không phóng to). */
  function fitSize(w, h, max) {
    const m = max || MAX_SIDE;
    const k = Math.min(1, m / Math.max(w, h));
    return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
  }

  /** Dùng bản nén hay giữ gốc. */
  function useCompressed(originalBytes, compressedBytes, compressedType) {
    return compressedType === 'image/webp' && compressedBytes > 0 && compressedBytes <= originalBytes * (1 - MIN_SAVING);
  }

  function readDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function decode(file) {
    if (global.createImageBitmap) return global.createImageBitmap(file);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally { URL.revokeObjectURL(url); }
  }

  /**
   * @param {File} file ảnh người dùng chọn
   * @returns {Promise<{dataUrl, ext, before, after, compressed, width?, height?}>}
   *   ext: đuôi tệp nên dùng ('webp' khi đã nén, không thì đuôi gốc).
   */
  async function compress(file) {
    const origExt = (String(file.name || '').split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const keep = async () => ({ dataUrl: await readDataUrl(file), ext: origExt, before: file.size, after: file.size, compressed: false });
    if (!COMPRESSIBLE.test(file.type || '')) return keep();
    let bmp;
    try { bmp = await decode(file); } catch (e) { return keep(); }
    const size = fitSize(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, size.width, size.height);
    if (bmp.close) bmp.close();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', QUALITY));
    if (!blob || !useCompressed(file.size, blob.size, blob.type)) return keep();
    return { dataUrl: await readDataUrl(blob), ext: 'webp', before: file.size, after: blob.size, compressed: true,
      width: size.width, height: size.height };
  }

  /** "2,4 MB" / "310 KB" cho thông báo. */
  function fmtBytes(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }

  global.EduImageCompress = { compress, fitSize, useCompressed, fmtBytes, MAX_SIDE };
})(typeof window !== 'undefined' ? window : globalThis);
