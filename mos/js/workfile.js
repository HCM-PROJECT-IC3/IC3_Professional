/* Tệp đang làm (kiểu GMetrix): lưu tệp đề vào máy qua File System Access và giữ "handle" để đọc lại
   mỗi lần học sinh bấm Ctrl+S trong Office — không phải tải lên lại. Chỉ Chrome/Edge trên máy tính có API này;
   trình duyệt khác dùng cách nộp tệp như cũ. Handle lưu trong IndexedDB nên cửa sổ thu gọn và trang chính dùng chung. */
(function (root) {
  'use strict';

  const supported = typeof root.showSaveFilePicker === 'function' && typeof root.showOpenFilePicker === 'function';
  const folderSupported = supported && typeof root.showDirectoryPicker === 'function';
  const TYPES = {
    '.xlsx': { description: 'Sổ tính Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } },
    '.pptx': { description: 'Bản trình chiếu PowerPoint', accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] } },
    '.docx': { description: 'Tài liệu Word', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } },
  };

  let dbp = null;
  function db() {
    dbp = dbp || new Promise((res, rej) => {
      const r = indexedDB.open('mos-workfiles', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('h');
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction('h', mode);
      const req = fn(tx.objectStore('h'));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  const getHandle = key => idb('readonly', s => s.get(key)).catch(() => null);
  const putHandle = (key, h) => idb('readwrite', s => s.put(h, key)).catch(() => {});
  const delHandle = key => idb('readwrite', s => s.delete(key)).catch(() => {});

  /** Lưu tệp đề vào nơi học sinh chọn và nhớ tệp đó (tệp lẻ — không thuộc thư mục bộ đề). Phải gọi ngay trong sự kiện bấm nút.
      getBlob: hàm trả về nội dung tệp đề (từ Drive hoặc máy chủ — xem fileBlob trong app.js). */
  async function saveStarter(key, getBlob, name, ext) {
    const handle = await root.showSaveFilePicker({ suggestedName: name, types: [TYPES[ext]], id: 'mos-work' });
    const blob = await getBlob(); // (hộp lưu tệp phải mở ngay trong lúc bấm nên tải sau khi chọn chỗ lưu)
    const w = await handle.createWritable();
    await w.write(blob);
    await w.close();
    await putHandle(key, handle);
    await delHandle('in:' + key);
    return handle;
  }

  /** Chọn tệp đã có trên máy (vd em đã tải đề từ trước). */
  async function pick(key, ext) {
    const [handle] = await root.showOpenFilePicker({ types: [TYPES[ext]], id: 'mos-work' });
    await putHandle(key, handle);
    await delHandle('in:' + key);
    return handle;
  }

  /** 'granted' | 'prompt' | 'denied'. ask=true chỉ dùng trong sự kiện bấm nút.
      Tệp nằm trong thư mục bộ đề (saveSet): xin quyền 1 lần cho cả thư mục, mọi tệp trong đó dùng chung. */
  async function permission(handle, ask, dir) {
    const opts = { mode: 'read' };
    let p = await handle.queryPermission(opts);
    if (p === 'prompt' && ask && dir) {
      const d = await dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
      if (d === 'granted') p = await handle.queryPermission(opts);
    }
    if (p === 'prompt' && ask) p = await handle.requestPermission(opts);
    return p;
  }

  // Tên thư mục/tệp KHÔNG DẤU: Office mở tệp qua giao thức ms-powerpoint:ofe|u|file:///... chỉ đúng với đường dẫn không dấu
  // (đã thử: "Thư mục Đề/Bài 1.pptx" không mở được, "Thu mo.pptx" mở được và sửa được).
  const ascii = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7E]/g, '');
  const safeName = s => ascii(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'MOS';
  // Tệp rỗng (lần tải trước hỏng giữa chừng) coi như chưa có.
  async function exists(dir, name) {
    try { return (await (await dir.getFileHandle(name)).getFile()).size > 0; } catch (e) { return false; }
  }

  /** Tải cả bộ đề vào 1 thư mục (kiểu GMetrix: mọi project sẵn trên máy, mở song song bao nhiêu tệp cũng được).
      Phải gọi ngay trong sự kiện bấm nút. items: [{ key, name, getBlob, extras: [{ name, getBlob }] }].
      Tên tệp thêm "P<số>_" để 2 project dùng chung 1 tệp đề không đè nhau. Tệp đã có trong thư mục (em làm dở) thì giữ
      nguyên, trừ khi opts.fresh. opts.skip(key) → true: bỏ qua project đó (đang làm ở tệp khác). opts.onProgress(xong, tổng).
      Trả { dir, files: [{ key, handle, kept }], failed: [{ key, error }], skipped }. */
  async function saveSet(dirKey, folderName, items, opts) {
    const { onProgress, fresh, skip } = opts || {};
    // opts.parent = thư mục làm bài đã chọn từ trước → không hỏi lại.
    const parent = (opts && opts.parent) || await root.showDirectoryPicker({ id: 'mos-set', mode: 'readwrite', startIn: 'desktop' });
    const dir = await parent.getDirectoryHandle(safeName(folderName), { create: true });
    await putHandle(dirKey, dir);
    const out = { dir, files: [], failed: [], skipped: 0 };
    let done = 0;
    const total = items.length;
    const queue = items.slice();
    // Tải 3 tệp cùng lúc: nhanh hơn tải lần lượt mà không nghẽn mạng phòng máy.
    const worker = async () => {
      while (queue.length) {
        const it = queue.shift();
        try {
          if (skip && await skip(it.key)) { out.skipped++; if (onProgress) onProgress(++done, total); continue; }
          const kept = !fresh && await exists(dir, it.name);
          const blob = kept ? null : await it.getBlob(); // tải xong mới tạo tệp — tải hỏng thì không để lại tệp rỗng
          const handle = await dir.getFileHandle(it.name, { create: true });
          if (!kept) {
            const w = await handle.createWritable();
            await w.write(blob);
            await w.close();
          }
          for (const x of it.extras || []) {
            if (await exists(dir, x.name)) continue;
            try {
              const xb = await x.getBlob();
              const xw = await (await dir.getFileHandle(x.name, { create: true })).createWritable();
              await xw.write(xb);
              await xw.close();
            } catch (e) { /* tệp kèm lỗi không chặn tệp đề */ }
          }
          await putHandle(it.key, handle);
          await putHandle('in:' + it.key, dirKey);
          out.files.push({ key: it.key, handle, kept });
        } catch (e) {
          out.failed.push({ key: it.key, error: e });
        }
        if (onProgress) onProgress(++done, total);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return out;
  }

  /** Thư mục bộ đề chứa tệp này (nếu tệp được tải bằng saveSet). */
  async function dirOf(key) {
    const dk = await getHandle('in:' + key);
    return dk ? getHandle(dk) : null;
  }

  /** Đọc bản đã lưu mới nhất. Lúc Office đang ghi tệp có thể lỗi thoáng qua — thử lại vài lần. */
  async function read(handle) {
    let err;
    for (let i = 0; i < 4; i++) {
      try {
        const file = await handle.getFile();
        if (file.size > 0) return file;
      } catch (e) { err = e; }
      await new Promise(r => setTimeout(r, 400));
    }
    throw Object.assign(new Error('Không đọc được tệp đang làm — em bấm Lưu (Ctrl+S) trong Office rồi thử lại.'), { cause: err });
  }

  /** Dấu của lần lưu cuối (chỉ đọc thông tin tệp trên máy, không tốn mạng). null = chưa đọc được. */
  async function stamp(handle) {
    const f = await handle.getFile();
    return f.size > 0 ? f.lastModified + ':' + f.size : null;
  }

  // ---- Thư mục làm bài: em chọn 1 lần (vd C:\MOS), đề lưu vào <thư mục>/<bộ đề>/P1_<tệp>.
  // Trang biết đường dẫn đầy đủ (em dán 1 lần) nên mở thẳng tệp bằng Office ngay sau khi tải.
  const getWorkDir = () => getHandle('workdir');
  async function chooseWorkDir() {
    const d = await root.showDirectoryPicker({ id: 'mos-workdir', mode: 'readwrite', startIn: 'desktop' });
    await putHandle('workdir', d);
    return d;
  }
  /** Quyền ghi thư mục (sau khi mở lại trình duyệt phải xin lại — ask=true chỉ trong sự kiện bấm nút). */
  async function dirPermission(d, ask) {
    let p = await d.queryPermission({ mode: 'readwrite' });
    if (p === 'prompt' && ask) p = await d.requestPermission({ mode: 'readwrite' });
    return p;
  }
  /** Lưu 1 tệp đề vào <parent>/<folder>/<name>. fresh=false: tệp đã có (em làm dở) thì giữ nguyên. */
  async function saveInto(parent, folder, key, name, getBlob, fresh) {
    const dir = await parent.getDirectoryHandle(safeName(folder), { create: true });
    const dirKey = 'sub:' + safeName(folder);
    await putHandle(dirKey, dir);
    const kept = !fresh && await exists(dir, name);
    const blob = kept ? null : await getBlob(); // tải xong mới tạo tệp
    const handle = await dir.getFileHandle(name, { create: true });
    if (!kept) {
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
    }
    await putHandle(key, handle);
    await putHandle('in:' + key, dirKey);
    return { handle, kept };
  }

  root.MosWorkfile = { supported, folderSupported, getHandle, putHandle, delHandle, saveStarter, saveSet, dirOf, pick, permission, read, stamp,
    safeName, getWorkDir, chooseWorkDir, dirPermission, saveInto };
})(window);
