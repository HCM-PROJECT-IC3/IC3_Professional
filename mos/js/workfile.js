/* Tệp đang làm (kiểu GMetrix): lưu tệp đề vào máy qua File System Access và giữ "handle" để đọc lại
   mỗi lần học sinh bấm Ctrl+S trong Office — không phải tải lên lại. Chỉ Chrome/Edge trên máy tính có API này;
   trình duyệt khác dùng cách nộp tệp như cũ. Handle lưu trong IndexedDB nên cửa sổ thu gọn và trang chính dùng chung. */
(function (root) {
  'use strict';

  const supported = typeof root.showSaveFilePicker === 'function' && typeof root.showOpenFilePicker === 'function';
  const TYPES = {
    '.xlsx': { description: 'Sổ tính Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } },
    '.pptx': { description: 'Bản trình chiếu PowerPoint', accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] } },
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

  /** Lưu tệp đề vào nơi học sinh chọn và nhớ tệp đó. Phải gọi ngay trong sự kiện bấm nút.
      getBlob: hàm trả về nội dung tệp đề (từ Drive hoặc máy chủ — xem fileBlob trong app.js). */
  async function saveStarter(key, getBlob, name, ext) {
    const handle = await root.showSaveFilePicker({ suggestedName: name, types: [TYPES[ext]], id: 'mos-work' });
    const blob = await getBlob();
    const w = await handle.createWritable();
    await w.write(blob);
    await w.close();
    await putHandle(key, handle);
    return handle;
  }

  /** Chọn tệp đã có trên máy (vd em đã tải đề từ trước). */
  async function pick(key, ext) {
    const [handle] = await root.showOpenFilePicker({ types: [TYPES[ext]], id: 'mos-work' });
    await putHandle(key, handle);
    return handle;
  }

  /** 'granted' | 'prompt' | 'denied'. ask=true chỉ dùng trong sự kiện bấm nút. */
  async function permission(handle, ask) {
    const opts = { mode: 'read' };
    let p = await handle.queryPermission(opts);
    if (p === 'prompt' && ask) p = await handle.requestPermission(opts);
    return p;
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

  /** Báo mỗi lần tệp được lưu (giờ sửa đổi thay đổi). Chỉ đọc thông tin tệp trên máy, không tốn mạng. */
  function watch(handle, onSave, ms) {
    let last = null, stopped = false, busy = false;
    const tick = async () => {
      if (stopped || busy) return;
      busy = true;
      try {
        const f = await handle.getFile();
        if (last !== null && f.lastModified !== last && f.size > 0) {
          last = f.lastModified;
          await new Promise(r => setTimeout(r, 600)); // để Office ghi xong
          if (!stopped) await onSave(await read(handle));
        } else last = f.lastModified;
      } catch (e) { /* đang lưu dở hoặc tệp tạm vắng — lần sau đọc lại */ }
      busy = false;
    };
    tick();
    const t = setInterval(tick, ms || 1500);
    return () => { stopped = true; clearInterval(t); };
  }

  root.MosWorkfile = { supported, getHandle, putHandle, delHandle, saveStarter, pick, permission, read, watch };
})(window);
