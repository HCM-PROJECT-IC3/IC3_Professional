/* ============================================================
   js/arena/arena-room.js — "Phòng cả lớp" trong Đấu trường (arena.html).
   Thay live-quiz.html cũ (mỗi câu trả lời = 1 lượt ghi Firestore, mỗi lần
   chuyển câu = 1 lượt đọc × cả lớp → chỉ đủ ~3 phòng/ngày với gói Spark).

   Cách chạy — 0 lượt Firebase:
     • Máy NGƯỜI DẪN (giáo viên, máy chiếu) giữ trạng thái phòng và tự chấm điểm
       (logic thuần: js/arena/arena-room-core.js).
     • Học sinh nối THẲNG vào máy người dẫn bằng WebRTC (PeerJS, js/vendor/peerjs.min.js).
       Máy chủ trung gian của PeerJS chỉ giúp 2 máy "bắt tay" lúc đầu (miễn phí, không
       lưu gì); câu hỏi/câu trả lời đi trực tiếp giữa các máy (mạng chặn kết nối trực
       tiếp thì đi qua máy TURN mặc định của PeerJS). Đổi máy chủ: EduBackend.arenaRoom.
     • Đáp án đúng chỉ gửi xuống SAU khi chốt câu → không xem trộm được.
     • Rớt mạng / tải lại trang: học sinh tự nối lại (giữ điểm theo mã máy lưu ở
       localStorage); máy người dẫn tải lại trang vẫn điều khiển tiếp (trạng thái
       phòng lưu ở localStorage).
   Lưu kết quả: trên máy người dẫn (lịch sử 20 phòng + tải CSV), và — tuỳ chọn — 1 lượt
   gọi Apps Script cho CẢ phòng (tab NhatKyDauTruong, apps/src/47-arena.gs).
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduArenaCore;
  const R = global.EduArenaRoomCore;
  const A = global.EduArena.api;
  const $ = (id) => document.getElementById(id);
  const esc = A.esc;
  const SHAPES = A.SHAPES;
  const HOST_KEY = 'eduquiz_arena_room_host';     // phòng đang điều khiển (khôi phục khi tải lại trang)
  const HIST_KEY = 'eduquiz_arena_room_history';  // 20 phòng gần nhất: tóm tắt + CSV
  const CID_KEY = 'eduquiz_arena_room_cid';       // mã máy học sinh (vào lại phòng giữ điểm)
  const AWARD_KEY = 'eduquiz_arena_room_awarded'; // phòng đã nhận xu (không nhận 2 lần khi nối lại)
  const JOIN_SS = 'eduquiz_arena_room_join';      // sessionStorage: tải lại trang → tự vào lại phòng
  const PEERJS = 'js/vendor/peerjs.min.js';
  const QRLIB = 'js/vendor/qrcode.min.js';
  const HOST_TTL_MS = 3 * 60 * 60 * 1000;
  const AUTO_NEXT_MS = 6000;
  const JOIN_TIMEOUT_MS = 15000;
  const UNIT = { speed: 'điểm', race: 'bước' };
  const MODE_LABEL = { speed: '⚡ Tốc độ', race: '🏁 Đua về đích' };

  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const cryptoRng = () => global.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
  function loadPeer() { return global.Peer ? Promise.resolve() : global.EduLazyLoad.loadScripts([PEERJS]); }
  // Máy chủ ICE mặc định của PeerJS (1 STUN + TURN miễn phí của PeerJS). Giữ lại khi người dùng
  // khai báo thêm TURN riêng ở EduBackend.arenaRoom.turn — nếu khai thẳng peer.config.iceServers thì
  // PeerJS BỎ mặc định, dễ làm hỏng kết nối mạng bình thường.
  const DEFAULT_ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ];
  function peerOptions() {
    const cfg = (global.EduBackend && global.EduBackend.arenaRoom) || {};
    const opts = Object.assign({ debug: 0 }, cfg.peer || {});
    const extra = Array.isArray(cfg.turn) ? cfg.turn.filter((x) => x && x.urls) : [];
    if (extra.length && !(opts.config && opts.config.iceServers)) {
      opts.config = Object.assign({}, opts.config || {}, { iceServers: extra.concat(DEFAULT_ICE) });
    }
    return opts;
  }
  /** Vẽ mã QR của link vào phòng (thư viện nạp lười, chỉ khi người dẫn mở sảnh phòng). Lỗi → bỏ qua, vẫn có mã + link. */
  function drawQr(link) {
    const box = $('arRoomQr');
    if (!box) return;
    const paint = () => {
      const cur = $('arRoomQr');
      if (!cur || !global.qrcode) return;
      try {
        const qr = global.qrcode(0, 'M');
        qr.addData(link);
        qr.make();
        cur.innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
        const svg = cur.querySelector('svg');
        if (svg) { svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); }
        cur.hidden = false;
      } catch (e) { cur.hidden = true; }
    };
    if (global.qrcode) { paint(); return; }
    global.EduLazyLoad.loadScripts([QRLIB]).then(paint, () => { box.hidden = true; });
  }
  function send(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) { /* kết nối vừa đóng */ } }
  function body() { return $('arRoomBody'); }
  function setNet(msg) { const n = $('arRoomNet'); n.hidden = !msg; n.textContent = msg || ''; }
  function openRoomScreen(label) {
    $('arRoomCode').textContent = label;
    setNet('');
    A.show('arRoom');
  }

  // ============================================================
  // NGƯỜI DẪN
  // ============================================================
  const H = { peer: null, room: null, conns: new Map(), timer: 0, tick: 0, auto: 0, closing: 0, lobbyT: 0, saveT: 0, ready: false };

  function hostCreate() {
    A.saveNick();
    const src = A.deckSource();
    const deck = C.buildDeck(src.questions || [], A.rng);
    if (!deck.length) { A.toast('Chọn bộ câu hỏi có câu trắc nghiệm trước nhé.'); return; }
    const mode = A.prefs.mode === 'race' ? 'race' : 'speed';
    const room = R.createRoom({
      code: R.makeCode(cryptoRng), mode, deck, count: A.prefs.count, secs: A.prefs.secs,
      maxPlayers: A.prefs.roomMax || 60, title: src.title, setKey: src.key,
    });
    startHosting(room, false);
  }

  async function startHosting(room, resumed) {
    H.room = room;
    H.ready = false;
    openRoomScreen('Phòng ' + room.code);
    body().innerHTML = `<div class="ar-card ar-center"><p><i class="fa-solid fa-spinner fa-spin"></i> Đang mở phòng <b>${room.code}</b>...</p></div>`;
    try { await loadPeer(); } catch (e) { hostFail('Không tải được thư viện kết nối (js/vendor/peerjs.min.js) — kiểm tra mạng rồi thử lại.'); return; }
    persist();
    let tries = 0;
    const open = () => {
      const peer = new global.Peer(R.peerId(room.code), peerOptions());
      H.peer = peer;
      peer.on('open', () => { H.ready = true; setNet(''); renderHost(); });
      peer.on('connection', onConn);
      // Mất kết nối máy chủ trung gian: các học sinh đã nối vẫn chơi được; nối lại để nhận người mới.
      peer.on('disconnected', () => {
        if (peer.destroyed || H.peer !== peer) return;
        setNet('⚠️ Mất kết nối máy chủ trung gian — người đã vào vẫn chơi được, đang nối lại để nhận người mới...');
        setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* thử lại lần sau */ } }, 2000);
      });
      peer.on('error', (e) => {
        if (H.peer !== peer) return;
        if (e.type === 'unavailable-id') {
          peer.destroy();
          // Phòng mới chưa ai vào: đổi mã khác. Tải lại trang: máy chủ còn giữ mã cũ vài giây → chờ rồi giành lại.
          if (!resumed && room.phase === 'lobby' && !room.order.length) { room.code = R.makeCode(cryptoRng); persist(); open(); return; }
          if (++tries <= 20) { setNet(`Đang giành lại mã phòng ${room.code}... (${tries})`); setTimeout(open, 2500); return; }
          hostFail(`Mã phòng ${room.code} đang mở ở tab hoặc máy khác. Đóng tab đó rồi bấm "Tiếp tục điều khiển" lại.`);
        } else if (e.type === 'browser-incompatible') {
          hostFail('Trình duyệt này không hỗ trợ WebRTC. Dùng Chrome, Edge, Firefox hoặc Safari bản mới.');
        } else if (!H.ready && ['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
          peer.destroy();
          if (++tries <= 5) { setNet('Chưa nối được máy chủ trung gian — đang thử lại...'); setTimeout(open, 3000); return; }
          hostFail('Không nối được máy chủ trung gian (0.peerjs.com). Kiểm tra Internet. Nếu mạng trường chặn: thử phát 4G/Wi-Fi khác cho máy giáo viên, hoặc nhờ quản trị khai báo máy chủ riêng (js/backend-config.js → arenaRoom).');
        }
      });
    };
    open();
  }
  function hostFail(msg) {
    setNet('');
    body().innerHTML = `<div class="ar-card ar-center"><p>⚠️ ${esc(msg)}</p>
      <div class="ar-row ar-center-row"><button type="button" class="ar-btn" data-act="resume"><i class="fa-solid fa-rotate-right"></i> Thử lại</button>
      <button type="button" class="ar-btn ar-btn-ghost" data-act="home">Về Đấu trường</button></div></div>`;
  }

  function persist() {
    clearTimeout(H.saveT);
    if (H.room && H.room.phase !== 'end') store.set(HOST_KEY, { at: Date.now(), room: H.room });
  }
  function persistSoon() { clearTimeout(H.saveT); H.saveT = setTimeout(persist, 800); }

  function onConn(conn) {
    conn.on('data', (msg) => onHostMsg(conn, msg));
    conn.on('close', () => onHostClose(conn));
    conn.on('error', () => onHostClose(conn));
  }
  function broadcast(build) { H.conns.forEach((conn, cid) => { const m = build(cid); if (m) send(conn, m); }); }
  function roomInfo() { const r = H.room; return { code: r.code, mode: r.mode, title: r.title, total: r.total, goal: r.goal, secs: r.secs }; }
  function topN(n) { return R.leaderboard(H.room).slice(0, n).map((r) => ({ name: r.name, face: r.face, value: r.value, streak: r.streak })); }
  function lobbyMsg() {
    const ids = R.activeIds(H.room);
    return { t: 'lobby', count: ids.length, players: ids.slice(0, 80).map((id) => ({ name: H.room.players[id].name, face: H.room.players[id].face })) };
  }
  function questionMsg(cid) {
    const m = R.publicQuestion(H.room, Date.now());
    m.answered = H.room.answers[cid] ? H.room.answers[cid].k : null;
    const mine = H.room.players[cid];
    if (mine && mine.cards && H.room.mode === 'speed') m.cards = { x2: mine.cards.x2, shield: mine.cards.shield };
    return m;
  }
  function revealMsg(cid) {
    const r = H.room, L = r.last, q = R.current(r);
    return { t: 'reveal', i: L.i, total: r.total, mode: r.mode, goal: r.goal, correctIdx: L.correctIdx, text: q.text, options: q.options,
      expl: L.expl, counts: L.counts, you: L.results[cid] || null, top: topN(5), last: R.isDone(r) };
  }
  function endMsg(cid) { return { t: 'end', you: R.personalEnd(H.room, cid), top: topN(5), mode: H.room.mode, code: H.room.code }; }
  function stateFor(cid) {
    const ph = H.room.phase;
    return ph === 'lobby' ? lobbyMsg() : ph === 'q' ? questionMsg(cid) : ph === 'reveal' ? revealMsg(cid) : endMsg(cid);
  }

  function onHostMsg(conn, msg) {
    const room = H.room;
    if (!room || !msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      const res = R.join(room, { cid: msg.cid, name: msg.name, face: msg.face });
      if (!res.ok) { send(conn, { t: 'deny', reason: res.reason }); setTimeout(() => conn.close(), 800); return; }
      const cid = res.player.cid;
      const old = H.conns.get(cid);
      if (old && old !== conn) { old.arReplaced = true; try { old.close(); } catch (e) { /* ignore */ } }
      conn.arCid = cid;
      H.conns.set(cid, conn);
      send(conn, { t: 'welcome', room: roomInfo(), you: { name: res.player.name, face: res.player.face } });
      send(conn, stateFor(cid));
      if (!res.rejoin) A.sfx('click');
      lobbyChanged();
      persistSoon();
      return;
    }
    const cid = conn.arCid;
    if (!cid || H.conns.get(cid) !== conn) return;
    if (msg.t === 'ans') {
      const r = R.submit(room, cid, msg.i, msg.k, Date.now());
      if (r.ok) {
        send(conn, { t: 'got', i: msg.i, k: msg.k });
        hostTick();
        persistSoon();
        if (r.allIn) closeSoon();
      } else if (r.reason === 'dupe') send(conn, { t: 'got', i: msg.i, k: room.answers[cid].k });
      else if (r.reason === 'late') send(conn, { t: 'late', i: msg.i });
    } else if (msg.t === 'bye') {
      H.conns.delete(cid);
      R.leave(room, cid);
      lobbyChanged();
      persistSoon();
      if (room.phase === 'q' && R.allAnswered(room)) closeSoon();
    }
  }
  function onHostClose(conn) {
    const cid = conn.arCid;
    if (!cid || conn.arReplaced || H.conns.get(cid) !== conn) return;
    H.conns.delete(cid);
    if (!H.room) return;
    R.setOnline(H.room, cid, false);
    lobbyChanged();
    if (H.room.phase === 'q' && R.allAnswered(H.room)) closeSoon();
  }
  /** Danh sách người chơi đổi → vẽ lại màn người dẫn + báo sảnh chờ (gom lại, không gửi dồn dập). */
  function lobbyChanged() {
    if (!H.room) return;
    if (H.room.phase === 'lobby') renderHostLobby();
    else renderHostPlayers();
    clearTimeout(H.lobbyT);
    H.lobbyT = setTimeout(() => { if (H.room && H.room.phase === 'lobby') { const m = lobbyMsg(); broadcast(() => m); } }, 400);
  }

  // ── Điều khiển trận ──
  function hostNext() {
    const room = H.room;
    if (!room || !R.canAdvance(room)) return;
    clearTimeout(H.auto);
    if (room.phase === 'lobby' && !R.activeIds(room).length) { A.toast('Chưa có học sinh nào vào phòng.'); return; }
    if (room.phase !== 'lobby' && R.isDone(room)) { hostFinish(); return; }
    R.openNext(room, Date.now());
    broadcast(questionMsg);
    persist();
    clearTimeout(H.timer);
    H.timer = setTimeout(closeQuestion, room.secs * 1000 + R.ANSWER_GRACE_MS);
    A.sfx('click');
    renderHost();
  }
  function closeSoon() {
    if (H.closing) return;
    H.closing = setTimeout(closeQuestion, 600); // chờ chút để "got" kịp tới máy học sinh
  }
  function closeQuestion() {
    clearTimeout(H.timer); clearTimeout(H.closing); H.closing = 0;
    const room = H.room;
    if (!room || room.phase !== 'q') return;
    R.reveal(room);
    broadcast(revealMsg);
    persist();
    A.sfx('flip');
    renderHost();
    if (A.prefs.roomAuto) H.auto = setTimeout(hostNext, AUTO_NEXT_MS);
  }
  function hostFinish() {
    const room = H.room;
    clearTimeout(H.timer); clearTimeout(H.auto);
    R.finish(room, Date.now());
    broadcast(endMsg);
    store.del(HOST_KEY);
    addHistory(room);
    A.sfx('win');
    if (global.EduFX) global.EduFX.confetti({ count: 140 });
    renderHost();
  }
  function hostKick(cid) {
    const room = H.room;
    const p = room && room.players[cid];
    if (!p || !confirm(`Mời ${p.name} ra khỏi phòng?`)) return;
    R.kick(room, cid);
    const conn = H.conns.get(cid);
    send(conn, { t: 'kick' });
    H.conns.delete(cid);
    setTimeout(() => { try { conn && conn.close(); } catch (e) { /* ignore */ } }, 400);
    lobbyChanged();
    persistSoon();
    if (room.phase === 'q' && R.allAnswered(room)) closeSoon();
  }
  function hostStop(ask) {
    if (ask && H.room && H.room.phase !== 'end' && !confirm('Đóng phòng? Học sinh sẽ bị ngắt khỏi phòng' + (H.room.phase !== 'lobby' ? ' và trận đang chơi không được lưu.' : '.'))) return false;
    clearTimeout(H.timer); clearTimeout(H.auto); clearTimeout(H.closing); clearInterval(H.tick); H.closing = 0;
    broadcast(() => ({ t: 'closed' }));
    const peer = H.peer;
    setTimeout(() => { try { peer && peer.destroy(); } catch (e) { /* ignore */ } }, 500);
    H.peer = null; H.room = null; H.conns = new Map();
    store.del(HOST_KEY);
    return true;
  }

  // ── Vẽ màn người dẫn ──
  function joinLink(code) { return location.origin + location.pathname + '?phong=' + code; }
  function renderHost() {
    const room = H.room;
    if (!room) return;
    clearInterval(H.tick);
    $('arRoomCode').textContent = 'Phòng ' + room.code;
    if (room.phase === 'lobby') renderHostLobby();
    else if (room.phase === 'q') renderHostQuestion();
    else if (room.phase === 'reveal') renderHostReveal();
    else renderHostEnd();
  }
  function renderHostLobby() {
    const room = H.room;
    const ids = R.activeIds(room);
    const link = joinLink(room.code);
    body().innerHTML = `<div class="ar-room-lobby">
      <div class="ar-card ar-room-join-info">
        <p class="ar-muted">Học sinh mở <b>Đấu trường</b> → <b>Phòng cả lớp</b> → nhập mã:</p>
        <div class="ar-room-bigcode" aria-label="Mã phòng">${room.code.split('').map((ch) => `<span>${ch}</span>`).join('')}</div>
        <div class="ar-room-qr" id="arRoomQr" role="img" aria-label="Mã QR để vào phòng ${room.code}" hidden></div>
        <p class="ar-hint ar-room-qr-hint">Hoặc quét mã QR bằng camera điện thoại</p>
        <p class="ar-room-link"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(link.replace(/^https?:\/\//, ''))}</a>
          <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-act="copy"><i class="fa-regular fa-copy"></i> Chép link</button></p>
        <p class="ar-hint">${MODE_LABEL[room.mode]} · ${room.mode === 'race' ? `về đích sau ${room.goal} bước` : `${room.total} câu`} · ${room.secs} giây/câu · ${esc(room.title)}</p>
        ${room.mode === 'speed' ? '<p class="ar-hint">🎁 Đúng liền 3 câu → thẻ 🃏 x2 · liền 6 câu → thẻ 🛡️ Khiên (tự dùng, cứ 3 câu đúng nhận 1 thẻ)</p>' : ''}
        ${H.ready ? '' : '<p class="ar-hint"><i class="fa-solid fa-spinner fa-spin"></i> Đang mở cổng kết nối...</p>'}
      </div>
      <div class="ar-card">
        <div class="ar-row"><h2 class="ar-h2"><i class="fa-solid fa-users"></i> Người chơi <span class="ar-muted">${ids.length}/${room.max}</span></h2>
          <div class="ar-row">
            <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-act="close"><i class="fa-solid fa-xmark"></i> Đóng phòng</button>
            <button type="button" class="ar-btn ar-btn-play" data-act="next" ${ids.length ? '' : 'disabled'}><i class="fa-solid fa-play"></i> Bắt đầu</button>
          </div></div>
        <div class="ar-room-players" id="arRoomPlayers">${ids.length ? playerChips(ids) : '<p class="ar-muted ar-center">Đang chờ học sinh vào phòng...</p>'}</div>
      </div></div>`;
    drawQr(link);
  }
  function playerChips(ids) {
    return ids.map((id) => {
      const p = H.room.players[id];
      return `<span class="ar-room-chip${p.online ? '' : ' is-off'}" title="${p.online ? 'Đang kết nối' : 'Mất kết nối'}"><span aria-hidden="true">${esc(p.face)}</span> ${esc(p.name)}
        <button type="button" data-kick="${esc(id)}" aria-label="Mời ${esc(p.name)} ra khỏi phòng" title="Mời ra khỏi phòng">×</button></span>`;
    }).join('');
  }
  function renderHostPlayers() {
    const box = $('arRoomPlayers');
    if (box) box.innerHTML = playerChips(R.activeIds(H.room));
    hostTick();
  }
  function hostBar(extra) {
    const room = H.room;
    return `<div class="ar-hud">
      <span class="ar-pill">${room.mode === 'race' ? `Câu ${room.i + 1}` : `Câu ${room.i + 1}/${room.total}`}</span>
      <span class="ar-pill ar-pill-main" id="arRAnswered"></span>
      <span class="ar-pill" id="arROnline"></span>
      ${extra}
    </div>`;
  }
  function questionBlock(q, opts) {
    return `<div class="ar-q">${esc(q.text)}</div>${q.img ? `<img class="ar-qimg" src="${esc(q.img)}" alt="">` : ''}
      <div class="ar-answers n${q.options.length}">${q.options.map((o, k) => {
        const cls = opts && opts.reveal ? (k === q.correctIdx ? ' is-correct' : ' is-dim') : '';
        const bar = opts && opts.counts ? `<span class="ar-room-count"><i style="width:${opts.total ? Math.round((opts.counts[k] / opts.total) * 100) : 0}%"></i><b>${opts.counts[k]}</b></span>` : '';
        return `<div class="ar-ans c${k}${cls}"><span class="ar-shape" aria-hidden="true">${SHAPES[k]}</span><span class="ar-ans-text">${esc(o)}</span>${bar}</div>`;
      }).join('')}</div>`;
  }
  function renderHostQuestion() {
    const room = H.room;
    body().innerHTML = hostBar(`<span class="ar-pill" id="arRSecs"></span>
        <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-act="reveal"><i class="fa-solid fa-forward"></i> Chốt ngay</button>`)
      + `<div class="ar-timer"><i id="arRTimer"></i></div>
      <div class="ar-room-stage">${questionBlock(R.current(room))}</div>
      <div class="ar-card ar-room-mini"><div class="ar-room-players" id="arRoomPlayers">${playerChips(R.activeIds(room))}</div></div>`;
    hostTick();
    H.tick = setInterval(hostTick, 200);
  }
  function hostTick() {
    const room = H.room;
    if (!room) return;
    const ids = R.activeIds(room);
    const online = ids.filter((id) => room.players[id].online).length;
    const a = $('arRAnswered'), o = $('arROnline');
    if (a) a.textContent = room.phase === 'q' ? `✋ ${R.answeredCount(room)}/${online} đã trả lời` : `👥 ${ids.length} người chơi`;
    if (o) o.textContent = `🟢 ${online}/${ids.length} đang kết nối`;
    if (room.phase !== 'q') return;
    const left = Math.max(0, room.secs * 1000 - (Date.now() - room.qStartAt));
    const bar = $('arRTimer'), s = $('arRSecs');
    if (bar) { bar.style.width = (left / (room.secs * 1000)) * 100 + '%'; bar.classList.toggle('is-low', left < room.secs * 250); }
    if (s) s.textContent = `⏱ ${Math.ceil(left / 1000)} giây`;
    document.querySelectorAll('#arRoomPlayers .ar-room-chip').forEach((chip) => {
      const id = chip.querySelector('[data-kick]').dataset.kick;
      chip.classList.toggle('is-done', !!room.answers[id]);
    });
  }
  function boardHtml(rows, unit, meName) {
    return `<ol class="ar-board">${rows.map((r, i) => `<li class="${meName && r.name === meName ? 'is-me' : ''}"><span class="ar-board-rank">${i + 1}</span>
      <span class="ar-board-face">${esc(r.face)}</span><span class="ar-board-name">${esc(r.name)}${r.streak >= 3 ? ` <span class="ar-board-streak" title="Đúng liên tiếp ${r.streak} câu">🔥${r.streak}</span>` : ''}</span><b>${fmt(r.value)}</b><small>${unit}</small></li>`).join('')}</ol>`;
  }
  function lanesHtml(rows, goal, meName) {
    return `<div class="ar-track">${rows.map((p) => `<div class="ar-lane${meName && p.name === meName ? ' is-me' : ''}"><span class="ar-lane-name">${esc(p.name)}</span>
      <div class="ar-lane-road"><span class="ar-runner" style="left:calc(${(p.value / goal) * 100}% - ${(p.value / goal) * 2}rem)">${esc(p.face)}</span><span class="ar-flag" aria-hidden="true">🏁</span></div></div>`).join('')}</div>`;
  }
  function renderHostReveal() {
    const room = H.room, L = room.last, q = R.current(room);
    const done = R.isDone(room);
    const rows = R.leaderboard(room).slice(0, 10);
    body().innerHTML = hostBar(`<label class="ar-room-auto"><input type="checkbox" id="arRAuto" ${A.prefs.roomAuto ? 'checked' : ''}> Tự chuyển câu sau ${AUTO_NEXT_MS / 1000} giây</label>
        <button type="button" class="ar-btn ar-btn-play" data-act="next">${done ? '🏆 Xem kết quả' : 'Câu tiếp ▶'} <kbd>Enter</kbd></button>`)
      + `<div class="ar-stage">
        <div class="ar-qbox">${questionBlock(q, { reveal: true, counts: L.counts, total: L.answered })}
          ${L.expl ? `<div class="ar-feedback is-ok"><div class="ar-fb-expl">💡 ${esc(L.expl)}</div></div>` : ''}
          <p class="ar-hint ar-center">${L.answered} người trả lời · ${L.counts[L.correctIdx]} người đúng</p></div>
        <aside class="ar-side"><h3>${MODE_LABEL[room.mode]}</h3>${room.mode === 'race' ? lanesHtml(rows, room.goal) : boardHtml(rows, UNIT[room.mode])}</aside>
      </div>`;
    hostTick();
  }
  function podiumHtml(top, unit, meName) {
    const order = [1, 0, 2].filter((i) => top[i]);
    return `<div class="ar-podium">${order.map((i) => `<div class="ar-pod p${i + 1}${meName && top[i].name === meName ? ' is-me' : ''}" style="--d:${(2 - i) * 0.35}s">
      <span class="ar-pod-face">${esc(top[i].face)}</span><b class="ar-pod-name">${esc(top[i].name)}</b>
      <span class="ar-pod-val">${fmt(top[i].value)} ${unit}</span><div class="ar-pod-block">${i + 1}</div></div>`).join('')}</div>`;
  }
  function renderHostEnd() {
    const room = H.room;
    const board = R.leaderboard(room);
    const n = R.asked(room);
    const sum = R.summary(room);
    const hard = sum.perQuestion.map((x, i) => Object.assign({ i }, x)).filter((x) => x.of).sort((a, b) => a.correct / a.of - b.correct / b.of).slice(0, 3);
    body().innerHTML = `<div class="ar-card ar-end">
      <h2 class="ar-h2 ar-center">🏆 Kết quả phòng ${room.code}</h2>
      ${podiumHtml(board.slice(0, 3), UNIT[room.mode])}
      <div class="ar-row ar-center-row">
        <button type="button" class="ar-btn ar-btn-play" data-act="csv"><i class="fa-solid fa-file-csv"></i> Tải bảng điểm (Excel)</button>
        <button type="button" class="ar-btn" data-act="sheet"><i class="fa-solid fa-table"></i> Lưu lên Google Sheet</button>
        <button type="button" class="ar-btn ar-btn-ghost" data-act="home"><i class="fa-solid fa-plus"></i> Phòng mới</button>
      </div>
      <p class="ar-hint ar-center">Đã lưu trên máy này (mục “Lịch sử phòng”). Google Sheet: tab NhatKyDauTruong — cần đăng nhập tài khoản giáo viên.</p>
      ${hard.length ? `<h3 class="ar-h3">Câu cả lớp hay sai</h3><ol class="ar-room-hard">${hard.map((x) => `<li><b>C${x.i + 1}.</b> ${esc(x.text)} <span class="ar-muted">— ${x.correct}/${x.of} đúng</span></li>`).join('')}</ol>` : ''}
      <h3 class="ar-h3">Bảng xếp hạng đầy đủ</h3>
      <div class="ar-room-table-wrap"><table class="ar-room-table"><thead><tr><th>Hạng</th><th>Biệt danh</th><th>${UNIT[room.mode]}</th><th>Đúng</th><th>Chuỗi</th></tr></thead>
      <tbody>${board.map((r, i) => { const p = room.players[r.cid]; return `<tr><td>${i + 1}</td><td>${esc(r.face)} ${esc(r.name)}</td><td>${fmt(r.value)}</td><td>${p.correct}/${n}</td><td>${p.bestStreak}</td></tr>`; }).join('')}</tbody></table></div>
    </div>`;
  }

  // ── Lưu kết quả: lịch sử trên máy + CSV + Google Sheet ──
  function addHistory(room) {
    const list = store.get(HIST_KEY, []);
    const entry = { id: room.code + ':' + room.endedAt, at: room.endedAt, code: room.code, mode: room.mode, title: room.title, players: R.activeIds(room).length, summary: R.summary(room), csv: R.toCsv(room), synced: false };
    list.unshift(entry);
    // Bộ nhớ trình duyệt đầy → bỏ bớt phòng cũ nhất cho tới khi lưu được.
    while (list.length > 20 || (!store.set(HIST_KEY, list) && list.length > 1)) list.pop();
    H.lastEntry = entry; // giữ trong bộ nhớ: tải CSV / lưu Sheet được cả khi localStorage đầy
    renderHistory();
  }
  function findEntry(id) { return store.get(HIST_KEY, []).find((e) => e.id === id); }
  function downloadCsv(entry) {
    const blob = new Blob([entry.csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dau-truong-phong-${entry.code}-${new Date(entry.at).toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function saveToSheet(entry, btn) {
    if (!entry) return;
    if (entry.synced) { A.toast('Phòng này đã lưu lên Google Sheet rồi.'); return; }
    if (!global.EduBackend || !global.EduBackend.appsScriptUrl) { A.toast('Chưa cấu hình Apps Script (js/backend-config.js) — dùng nút tải CSV.'); return; }
    if (btn) btn.disabled = true;
    try {
      await global.EduLazyLoad.loadScripts(['js/services/firebase-loader.js', 'js/services/apps-script-client.js']);
      // Chỉ nạp Firebase Auth để lấy ID token cho Apps Script — KHÔNG đọc/ghi Firestore.
      const F = await global.EduFirebaseLoader.ensure();
      const user = F.auth.currentUser || await new Promise((res) => { const un = F.auth.onAuthStateChanged((u) => { un(); res(u); }); });
      if (!user || user.isAnonymous) {
        if (confirm('Cần đăng nhập tài khoản giáo viên để lưu lên Google Sheet. Kết quả vẫn nằm trong “Lịch sử phòng” trên máy này.\n\nMở trang đăng nhập (tab mới)?')) {
          global.open('login.html?next=' + encodeURIComponent('arena.html'), '_blank', 'noopener');
        }
        return;
      }
      const res = await global.EduAppsScript.call('arenaRoomLog', { summary: entry.summary });
      entry.synced = true;
      const list = store.get(HIST_KEY, []);
      const e = list.find((x) => x.id === entry.id);
      if (e) { e.synced = true; store.set(HIST_KEY, list); }
      renderHistory();
      A.toast(res && res.duplicate ? 'Phòng này đã có trên Google Sheet.' : `Đã lưu ${res ? res.written : ''} dòng vào Google Sheet (tab NhatKyDauTruong).`);
    } catch (err) {
      A.toast(err.code === 'permission-denied' ? 'Tài khoản này không có quyền lưu kết quả.' : err.code === 'not-found'
        ? 'Apps Script chưa có chức năng này — cần deploy bản mới (apps/Code.gs).' : 'Chưa lưu được: ' + (err.message || err) + ' — thử lại sau, hoặc tải CSV.');
    } finally { if (btn) btn.disabled = false; }
  }
  function renderHistory() {
    const box = $('arRoomHist');
    const list = store.get(HIST_KEY, []);
    box.hidden = !list.length;
    if (!list.length) return;
    const open = box.open;
    box.innerHTML = `<summary><i class="fa-solid fa-clock-rotate-left"></i> Lịch sử phòng trên máy này (${list.length})</summary>
      <ul class="ar-room-hist">${list.map((e) => `<li><div><b>${esc(e.code)}</b> · ${MODE_LABEL[e.mode] || ''} · ${e.players} người
        <small>${new Date(e.at).toLocaleString('vi-VN')} · ${esc(e.title)}</small></div>
        <span class="ar-row"><button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-hcsv="${esc(e.id)}"><i class="fa-solid fa-file-csv"></i> CSV</button>
        <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-hsheet="${esc(e.id)}" ${e.synced ? 'disabled title="Đã lưu lên Google Sheet"' : ''}>${e.synced ? '✓ Đã lưu Sheet' : '<i class="fa-solid fa-table"></i> Lưu Sheet'}</button></span></li>`).join('')}</ul>`;
    box.open = open;
  }

  // ============================================================
  // HỌC SINH
  // ============================================================
  const P = { peer: null, conn: null, code: '', joined: false, stopped: true, retry: 0, retryT: 0, room: null, me: null, q: null, myK: null, timer: 0, sentAt: 0 };

  function myCid() {
    let id = store.get(CID_KEY, '');
    if (!/^[a-z0-9]{12,40}$/.test(id)) {
      id = Array.from(global.crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');
      store.set(CID_KEY, id);
    }
    return id;
  }
  async function playerJoin(raw) {
    const code = R.normCode(raw);
    if (code.length !== R.CODE_LEN) { A.toast(`Mã phòng gồm ${R.CODE_LEN} ký tự.`); $('arJoinCode').focus(); return; }
    if (!A.saveNick()) { A.toast('Nhập biệt danh trước khi vào phòng nhé!'); $('arNick').focus(); return; }
    playerStop(false);
    Object.assign(P, { code, joined: false, stopped: false, retry: 0, room: null, me: null, q: null, myK: null });
    try { sessionStorage.setItem(JOIN_SS, code); } catch (e) { /* ignore */ }
    history.replaceState(null, '', location.pathname + '?phong=' + code);
    openRoomScreen('Phòng ' + code);
    playerStatus(`<i class="fa-solid fa-spinner fa-spin"></i> Đang nối tới phòng <b>${code}</b>...`);
    try { await loadPeer(); } catch (e) { playerError('Không tải được thư viện kết nối — kiểm tra mạng rồi thử lại.'); return; }
    if (P.stopped) return;
    connectPlayer();
  }
  function connectPlayer() {
    clearTimeout(P.retryT);
    if (P.stopped) return;
    const go = () => {
      if (P.stopped) return;
      const conn = P.peer.connect(R.peerId(P.code), { reliable: true, serialization: 'json' });
      P.conn = conn;
      const t = setTimeout(() => { if (!conn.open) { try { conn.close(); } catch (e) { /* ignore */ } playerLost(conn); } }, JOIN_TIMEOUT_MS);
      conn.on('open', () => {
        clearTimeout(t);
        send(conn, { t: 'hello', v: 1, cid: myCid(), name: A.nickName(), face: A.avatar() });
      });
      conn.on('data', (m) => { if (conn === P.conn) onPlayerMsg(m); });
      conn.on('close', () => { clearTimeout(t); playerLost(conn); });
      conn.on('error', () => { clearTimeout(t); playerLost(conn); });
    };
    if (P.peer && !P.peer.destroyed && P.peer.open) { go(); return; }
    try { if (P.peer) P.peer.destroy(); } catch (e) { /* ignore */ }
    const peer = new global.Peer(peerOptions());
    P.peer = peer;
    peer.on('open', go);
    peer.on('disconnected', () => { if (!peer.destroyed && !P.stopped) setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } }, 1500); });
    peer.on('error', (e) => {
      if (P.peer !== peer || P.stopped) return;
      if (e.type === 'peer-unavailable' && !P.joined && P.retry >= 1) {
        playerError(`Không tìm thấy phòng ${P.code}. Kiểm tra lại mã — hoặc giáo viên chưa mở / đã đóng phòng.`);
      } else if (e.type === 'browser-incompatible') {
        playerError('Trình duyệt này không hỗ trợ WebRTC. Dùng Chrome, Edge, Firefox hoặc Safari bản mới.');
      } else {
        if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) { try { peer.destroy(); } catch (x) { /* ignore */ } }
        playerLost(P.conn, true);
      }
    });
  }
  function playerLost(conn, force) {
    if (P.stopped || (!force && conn !== P.conn)) return;
    P.conn = null;
    P.retry++;
    if (!P.joined && P.retry > 4) {
      playerError('Không nối được tới máy giáo viên. Máy em và máy giáo viên đều cần có Internet; nếu mạng trường chặn, thử Wi-Fi khác hoặc 4G.');
      return;
    }
    if (P.retry > 60) { playerError('Mất kết nối với phòng quá lâu. Bấm "Thử lại" khi mạng ổn định.'); return; }
    if (P.joined) setNet('⚠️ Mất kết nối — đang nối lại... (điểm của em vẫn được giữ)');
    clearTimeout(P.retryT);
    P.retryT = setTimeout(connectPlayer, Math.min(8000, 1200 * P.retry));
  }
  function playerStop(sayBye) {
    P.stopped = true;
    clearTimeout(P.retryT); clearInterval(P.timer);
    if (sayBye) send(P.conn, { t: 'bye' });
    const peer = P.peer, conn = P.conn;
    P.peer = null; P.conn = null;
    setTimeout(() => { try { conn && conn.close(); } catch (e) { /* ignore */ } try { peer && peer.destroy(); } catch (e) { /* ignore */ } }, sayBye ? 300 : 0);
    try { sessionStorage.removeItem(JOIN_SS); } catch (e) { /* ignore */ }
  }
  function playerStatus(html) { body().innerHTML = `<div class="ar-card ar-center ar-room-wait">${html}</div>`; }
  function playerError(msg) {
    playerStop(false);
    setNet('');
    body().innerHTML = `<div class="ar-card ar-center"><p>⚠️ ${esc(msg)}</p>
      <div class="ar-row ar-center-row"><button type="button" class="ar-btn" data-act="rejoin"><i class="fa-solid fa-rotate-right"></i> Thử lại</button>
      <button type="button" class="ar-btn ar-btn-ghost" data-act="home">Về Đấu trường</button></div></div>`;
  }

  function onPlayerMsg(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome':
        P.joined = true; P.retry = 0; P.room = m.room; P.me = m.you;
        setNet('');
        $('arRoomCode').textContent = `Phòng ${m.room.code} · ${m.you.face} ${m.you.name}`;
        break;
      case 'deny': {
        const why = { full: 'Phòng đã đủ người.', kicked: 'Em đã được mời ra khỏi phòng này.', ended: 'Phòng này đã kết thúc.', name: 'Biệt danh không hợp lệ.' }[m.reason] || 'Không vào được phòng.';
        playerError(why);
        break;
      }
      case 'lobby': renderPlayerLobby(m); break;
      case 'q': renderPlayerQuestion(m); break;
      case 'got':
        if (P.q && m.i === P.q.i) { P.myK = m.k; lockAnswers(m.k, 'Đã gửi ✓ — chờ cả lớp...'); }
        break;
      case 'late':
        if (P.q && m.i === P.q.i) lockAnswers(null, '⏰ Hết giờ — câu trả lời tới muộn.');
        break;
      case 'reveal': renderPlayerReveal(m); break;
      case 'end': renderPlayerEnd(m); break;
      case 'kick': playerError('Em đã được giáo viên mời ra khỏi phòng.'); break;
      case 'closed': playerError('Giáo viên đã đóng phòng.'); break;
      default: break;
    }
  }
  function renderPlayerLobby(m) {
    clearInterval(P.timer);
    const me = P.me || { face: A.avatar(), name: A.nickName() };
    playerStatus(`<div class="ar-room-me"><span>${esc(me.face)}</span><b>${esc(me.name)}</b></div>
      <h2 class="ar-h2 ar-center">Đã vào phòng! Chờ giáo viên bắt đầu...</h2>
      <div class="waiting-dots" aria-hidden="true"><i></i><i></i><i></i></div>
      <p class="ar-muted">${m.count} người trong phòng</p>
      <div class="ar-room-faces">${m.players.map((p) => `<span title="${esc(p.name)}">${esc(p.face)}</span>`).join('')}</div>
      <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-act="leave">Rời phòng</button>`);
  }
  function renderPlayerQuestion(m) {
    clearInterval(P.timer);
    P.q = m;
    P.myK = m.answered;
    P.qStart = performance.now() - (m.secs * 1000 - m.ms);
    body().innerHTML = `<div class="ar-hud"><span class="ar-pill">${m.mode === 'race' ? `Câu ${m.i + 1}` : `Câu ${m.i + 1}/${m.total}`}</span>
        <span class="ar-pill" id="arPSecs"></span>${holdingsText(m.cards) ? `<span class="ar-pill" title="Thẻ thưởng đang giữ — tự dùng ở câu phù hợp">${holdingsText(m.cards)}</span>` : ''}</div>
      <div class="ar-timer"><i id="arPTimer"></i></div>
      <div class="ar-q">${esc(m.text)}</div>${m.img ? `<img class="ar-qimg" src="${esc(m.img)}" alt="">` : ''}
      <div class="ar-answers n${m.options.length}" id="arPAnswers">${m.options.map((o, k) => `<button type="button" class="ar-ans c${k}" data-pk="${k}">
        <span class="ar-shape" aria-hidden="true">${SHAPES[k]}</span><span class="ar-ans-text">${esc(o)}</span><kbd>${k + 1}</kbd></button>`).join('')}</div>
      <p class="ar-room-status" id="arPStatus" aria-live="polite"></p>`;
    if (P.myK !== null && P.myK !== undefined) lockAnswers(P.myK, 'Đã gửi ✓ — chờ cả lớp...');
    const tick = () => {
      const left = Math.max(0, m.secs * 1000 - (performance.now() - P.qStart));
      const bar = $('arPTimer'), s = $('arPSecs');
      if (!bar) { clearInterval(P.timer); return; }
      bar.style.width = (left / (m.secs * 1000)) * 100 + '%';
      bar.classList.toggle('is-low', left < m.secs * 250);
      s.textContent = `⏱ ${Math.ceil(left / 1000)}`;
      if (left <= 0) { clearInterval(P.timer); if (P.myK == null) lockAnswers(null, '⏰ Hết giờ! Chờ đáp án...'); }
    };
    tick();
    P.timer = setInterval(tick, 150);
  }
  function lockAnswers(k, msg) {
    document.querySelectorAll('#arPAnswers .ar-ans').forEach((b) => {
      b.disabled = true;
      b.classList.toggle('is-picked', +b.dataset.pk === k);
      b.classList.toggle('is-dim', k !== null && +b.dataset.pk !== k);
    });
    const s = $('arPStatus');
    if (s) s.textContent = msg;
  }
  function playerAnswer(k) {
    const q = P.q;
    if (!q || P.myK != null || !P.conn) return;
    const left = q.secs * 1000 - (performance.now() - P.qStart);
    if (left < -R.ANSWER_GRACE_MS || k < 0 || k >= q.options.length) return;
    P.myK = k;
    A.sfx('click');
    lockAnswers(k, 'Đang gửi...');
    send(P.conn, { t: 'ans', i: q.i, k });
    // Không thấy xác nhận (gói tin lạc khi mạng chập chờn) → gửi lại 1 lần; máy người dẫn tự bỏ bản trùng.
    const conn = P.conn, i = q.i;
    setTimeout(() => { if (P.q && P.q.i === i && conn === P.conn && $('arPStatus') && $('arPStatus').textContent === 'Đang gửi...') send(conn, { t: 'ans', i, k }); }, 3000);
  }
  const CARD_LABEL = { x2: '🃏 Thẻ x2', shield: '🛡️ Thẻ Khiên' };
  /** Dòng thông báo thẻ thưởng ở màn kết quả câu (chỉ chế độ Tốc độ). */
  function cardNoteHtml(y) {
    const out = [];
    if (y.used === 'x2') out.push('<span class="ar-tag">🃏 Thẻ x2 — điểm nhân đôi!</span>');
    if (y.used === 'shield') out.push('<span class="ar-tag up">🛡️ Khiên giữ chuỗi cho em</span>');
    if (y.card) out.push(`<span class="ar-tag up">🎁 Nhận ${CARD_LABEL[y.card] || 'thẻ'} — ${y.card === 'x2' ? 'câu đúng kế tiếp nhân đôi điểm' : 'bảo vệ chuỗi khi trả lời sai'}</span>`);
    const held = y.cards ? holdingsText(y.cards) : '';
    return (out.length || held) ? `<p class="ar-room-cards">${out.join(' ')}${held ? ` <span class="ar-muted">Đang giữ: ${held}</span>` : ''}</p>` : '';
  }
  function holdingsText(c) {
    const parts = [];
    if (c && c.x2 > 0) parts.push(`🃏 x2 ×${c.x2}`);
    if (c && c.shield > 0) parts.push(`🛡️ Khiên ×${c.shield}`);
    return parts.join(' · ');
  }
  function renderPlayerReveal(m) {
    clearInterval(P.timer);
    P.q = null;
    const y = m.you || { ok: false, k: null, pts: 0, bonus: 0, step: 0, rank: 0, value: 0, streak: 0 };
    const head = y.ok ? '✅ Chính xác!' : y.k === null ? '⏰ Em chưa trả lời kịp' : '❌ Chưa đúng';
    const gain = m.mode === 'race'
      ? (y.ok ? (y.step === 2 ? '⚡ Tăng tốc! +2 bước' : '+1 bước') : 'Đứng yên')
      : (y.ok ? `+${fmt(y.pts + y.bonus)} điểm${y.bonus ? ` <span class="ar-tag">🔥 chuỗi ${y.streak} +${y.bonus}</span>` : ''}` : '+0 điểm');
    body().innerHTML = `<div class="ar-feedback ${y.ok ? 'is-ok' : 'is-bad'} ar-room-result">
        <div class="ar-room-result-head">${head}</div>
        <div class="ar-fb-head">${gain}${y.up > 0 ? ` <span class="ar-tag up">▲ lên ${y.up} hạng</span>` : ''}</div>
        ${m.mode === 'speed' ? cardNoteHtml(y) : ''}
        ${y.rank ? `<p class="ar-room-rank">Hạng <b>${y.rank}</b> · ${fmt(y.value)} ${UNIT[m.mode]}${m.mode === 'race' ? `/${m.goal}` : ''}</p>` : ''}
        ${!y.ok ? `<div class="ar-fb-ans">Đáp án đúng: <b>${SHAPES[m.correctIdx]} ${esc(m.options[m.correctIdx])}</b></div>` : ''}
        ${m.expl ? `<div class="ar-fb-expl">💡 ${esc(m.expl)}</div>` : ''}
      </div>
      <div class="ar-side ar-room-top5"><h3>Top 5</h3>${boardHtml(m.top, UNIT[m.mode], P.me && P.me.name)}</div>
      <p class="ar-hint ar-center">${m.last ? 'Câu cuối — chờ giáo viên công bố kết quả...' : 'Chờ giáo viên chuyển câu tiếp...'}</p>`;
    A.sfx(y.ok ? (y.streak >= 3 ? 'combo' : 'correct') : 'wrong');
  }
  function renderPlayerEnd(m) {
    clearInterval(P.timer);
    const y = m.you;
    try { sessionStorage.removeItem(JOIN_SS); } catch (e) { /* ignore */ }
    if (!y) { playerStatus('<p>Trận đã kết thúc.</p><button type="button" class="ar-btn" data-act="home">Về Đấu trường</button>'); return; }
    // Xu thưởng (tính ở máy em như chơi 1 người) — mỗi phòng chỉ nhận 1 lần dù nối lại nhiều lần.
    const awarded = store.get(AWARD_KEY, []);
    const key = m.code + ':' + myCid();
    let coins = 0;
    if (!awarded.includes(key)) {
      coins = C.coinsFor({ correct: y.correct, place: y.rank, players: y.players });
      const prof = A.profile();
      prof.coins += coins;
      prof.games = (prof.games || 0) + 1;
      A.save();
      store.set(AWARD_KEY, awarded.concat(key).slice(-50));
      A.refreshWallet();
      try {
        const pct = y.total ? Math.round((y.correct / y.total) * 100) : 0;
        global.EduGamification && global.EduGamification.recordGameSession('arena-room-' + m.mode, {
          score: pct, scoreType: 'percent', accuracy: pct, correctAnswers: y.correct, wrongAnswers: y.total - y.correct, showReward: false,
        });
      } catch (e) { /* XP chỉ là phần thêm */ }
    }
    body().innerHTML = `<div class="ar-card ar-end">
      <h2 class="ar-h2 ar-center">${y.rank === 1 ? '🏆 Em vô địch cả phòng!' : `Em về hạng ${y.rank}/${y.players}`}</h2>
      ${podiumHtml(m.top.slice(0, 3), UNIT[m.mode], P.me && P.me.name)}
      <div class="ar-end-stats">
        <div><b>${y.correct}/${y.total}</b><span>câu đúng</span></div>
        <div><b>${y.bestStreak}</b><span>chuỗi đúng dài nhất</span></div>
        <div><b>${fmt(y.value)}</b><span>${UNIT[m.mode]}</span></div>
        <div class="is-coin"><b>+${coins} 🪙</b><span>xu (đang có ${A.profile().coins})</span></div>
      </div>
      <div class="ar-row ar-center-row"><button type="button" class="ar-btn" data-act="home"><i class="fa-solid fa-gamepad"></i> Về Đấu trường</button>
        <button type="button" class="ar-btn ar-btn-pack" data-act="packs"><span aria-hidden="true">🥚</span> Mở hộp</button></div></div>`;
    playerStop(false);
    A.sfx(y.rank === 1 ? 'win' : y.rank <= 3 ? 'match' : 'flip');
    if (y.rank <= 3 && global.EduFX) global.EduFX.confetti({ count: y.rank === 1 ? 140 : 70 });
  }

  // ============================================================
  // MÀN CHỌN: thẻ "Phòng cả lớp" + sự kiện chung
  // ============================================================
  function paintHostCard() {
    const mode = A.prefs.mode;
    $('arRoomModeNote').textContent = mode === 'gold'
      ? '💰 Săn vàng chỉ chơi 1 người — phòng cả lớp sẽ chơi ⚡ Tốc độ.'
      : `Dùng bộ câu, chế độ (${MODE_LABEL[mode]}), số câu và giây mỗi câu đã chọn ở trên.`;
    $('arHostBtn').disabled = !(A.deckSource().questions || []).length || $('arPlay').disabled;
    document.querySelectorAll('#arRoomMax button').forEach((b) => b.classList.toggle('is-on', +b.dataset.v === (A.prefs.roomMax || 60)));
    const saved = store.get(HOST_KEY, null);
    const box = $('arRoomResume');
    const ok = saved && saved.room && Date.now() - saved.at < HOST_TTL_MS && saved.room.phase !== 'end' && !H.room;
    box.hidden = !ok;
    if (ok) {
      const r = saved.room;
      box.innerHTML = `<span>⏸️ Phòng <b>${esc(r.code)}</b> đang dở: ${r.order.length} người${r.i >= 0 ? `, câu ${r.i + 1}/${r.total}` : ', chưa bắt đầu'}.</span>
        <span class="ar-row"><button type="button" class="ar-btn ar-btn-sm" data-act="resume">Tiếp tục điều khiển</button>
        <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-act="drop">Bỏ phòng này</button></span>`;
    }
  }
  function resumeHost() {
    const saved = store.get(HOST_KEY, null);
    const room = saved && R.restore(saved.room);
    if (!room) { store.del(HOST_KEY); paintHostCard(); A.toast('Không khôi phục được phòng cũ.'); return; }
    startHosting(room, true);
  }
  function goHome() {
    if (H.room && !hostStop(true)) return;
    if (!P.stopped && P.joined && !confirm('Rời phòng? Điểm đã có vẫn được giữ nếu em vào lại bằng mã phòng.')) return;
    if (!P.stopped) playerStop(true);
    setNet('');
    A.show('arHome');
    A.refreshWallet();
    paintHostCard();
    if (location.search.includes('phong=')) history.replaceState(null, '', location.pathname);
  }

  function onAction(act, el) {
    switch (act) {
      case 'next': hostNext(); break;
      case 'reveal': closeQuestion(); break;
      case 'close': if (hostStop(true)) goHome(); break;
      case 'copy': {
        const link = joinLink(H.room.code);
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => A.toast('Đã chép link vào phòng — gửi cho cả lớp!'), () => prompt('Link vào phòng:', link));
        break;
      }
      case 'csv': if (H.lastEntry) downloadCsv(H.lastEntry); break;
      case 'sheet': saveToSheet(H.lastEntry, el); break;
      case 'home': goHome(); break;
      case 'packs': goHome(); $('arOpenPacks').click(); break;
      case 'resume': resumeHost(); break;
      case 'drop': if (confirm('Bỏ phòng đang dở? Điểm của phòng này sẽ mất.')) { store.del(HOST_KEY); paintHostCard(); } break;
      case 'rejoin': playerJoin(P.code); break;
      case 'leave': goHome(); break;
      default: break;
    }
  }

  function init() {
    $('arHostBtn').addEventListener('click', hostCreate);
    $('arJoinBtn').addEventListener('click', () => playerJoin($('arJoinCode').value));
    $('arJoinCode').addEventListener('input', (e) => { e.target.value = R.normCode(e.target.value); });
    $('arJoinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); playerJoin(e.target.value); } });
    $('arRoomMax').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      A.prefs.roomMax = +b.dataset.v; A.save(); paintHostCard();
    });
    $('arRoomCard').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) onAction(b.dataset.act, b); });
    $('arRoomHist').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-hcsv], [data-hsheet]');
      const entry = btn && findEntry(btn.dataset.hcsv || btn.dataset.hsheet);
      if (!entry) return;
      if (btn.dataset.hcsv) downloadCsv(entry); else saveToSheet(entry, btn);
    });
    $('arRoom').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) { onAction(b.dataset.act, b); return; }
      const k = e.target.closest('[data-kick]');
      if (k) { hostKick(k.dataset.kick); return; }
      const a = e.target.closest('[data-pk]');
      if (a) playerAnswer(+a.dataset.pk);
    });
    $('arRoom').addEventListener('change', (e) => { if (e.target.id === 'arRAuto') { A.prefs.roomAuto = e.target.checked; A.save(); } });
    $('arRoomLeave').addEventListener('click', goHome);
    document.addEventListener('keydown', (e) => {
      if ($('arRoom').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const n = parseInt(e.key, 10);
      if (P.q && !P.stopped && n >= 1 && n <= P.q.options.length) { e.preventDefault(); playerAnswer(n - 1); return; }
      if (H.room && (e.key === 'Enter' || e.key === ' ') && R.canAdvance(H.room) && !e.target.closest('button')) { e.preventDefault(); hostNext(); }
    });
    document.addEventListener('arena:deck', paintHostCard);
    // Người dẫn lỡ đóng/tải lại tab giữa trận: trình duyệt hỏi lại (trạng thái vẫn được lưu để khôi phục).
    global.addEventListener('beforeunload', (e) => {
      if (H.room && H.room.phase !== 'lobby' && H.room.phase !== 'end') { persist(); e.preventDefault(); e.returnValue = ''; }
    });

    paintHostCard();
    renderHistory();
    // Link mời arena.html?phong=MÃ — điền sẵn mã; tải lại trang khi đang trong phòng → tự vào lại.
    const code = R.normCode(new URLSearchParams(location.search).get('phong') || '');
    if (code.length === R.CODE_LEN) {
      $('arJoinCode').value = code;
      let again = '';
      try { again = sessionStorage.getItem(JOIN_SS) || ''; } catch (e) { /* ignore */ }
      if (again === code && A.nickName() && $('arNick').value.trim()) playerJoin(code);
      else { $('arRoomCard').scrollIntoView({ block: 'center' }); ($('arNick').value.trim() ? $('arJoinBtn') : $('arNick')).focus(); }
    }
  }
  init();

  global.EduArenaRoom = { _host: () => H, _player: () => P };
})(window);
