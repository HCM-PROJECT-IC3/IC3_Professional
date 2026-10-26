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
  const K = global.EduArenaKinds;
  const FX = global.EduArenaFX;
  const D = global.EduArenaDrama;     // chữ lớn giữa màn hình (js/arena/arena-drama.js)
  const RH = global.EduArenaRoomHype; // không khí gameshow: lời bình, vinh danh, câu trend (js/arena/arena-room-hype.js)
  const LF = global.EduArenaLobbyFun; // trò khởi động lúc chờ: phản xạ, nối từ, ghép chữ, thả cảm xúc (js/arena/arena-lobby-fun.js)
  const SUSPENSE_MS = 900;            // chốt câu → trống dồn rồi mới lộ đáp án (màn chiếu + máy học sinh, tính tại chỗ)
  const reduced = () => FX.reduced();
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
  const JOIN_TIMEOUT_MS = 12000;
  const UNIT = { speed: 'điểm', race: 'bước', survival: 'điểm', tug: 'lực kéo', spell: 'sát thương', heist: 'đá quý' };
  const MODE_LABEL = { speed: '⚡ Tốc độ', race: '🏁 Đua về đích', survival: '❤️ Sinh tồn', tug: '🪢 Kéo co', spell: '🔮 Đấu phép', heist: '🔐 Giải mã' };

  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const cryptoRng = () => global.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
  function loadPeer() { return global.Peer ? Promise.resolve() : global.EduLazyLoad.loadScripts([PEERJS]); }
  // STUN: tìm địa chỉ công khai để 2 máy nối THẲNG (cùng mạng hoặc mạng dễ tính) — 0 lượt Firebase.
  // 2 máy khác mạng (4G ↔ Wi-Fi trường) không nối thẳng được; TURN miễn phí của PeerJS đã chết
  // (10/2026) → học sinh đó tự chuyển sang ĐƯỜNG DỰ PHÒNG qua Firestore (js/arena/arena-relay.js).
  const STUN_ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
  function roomCfg() { return (global.EduBackend && global.EduBackend.arenaRoom) || {}; }
  /** Luôn khai iceServers đầy đủ (PeerJS bỏ máy chủ mặc định — giờ đã chết — khi có danh sách riêng). */
  function peerOptions() {
    const cfg = roomCfg();
    const opts = Object.assign({ debug: 0 }, cfg.peer || {});
    const extra = Array.isArray(cfg.turn) ? cfg.turn.filter((x) => x && x.urls) : [];
    if (!(opts.config && opts.config.iceServers)) {
      opts.config = Object.assign({}, opts.config || {}, { iceServers: extra.concat(STUN_ICE) });
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
  const H = { peer: null, room: null, conns: new Map(), timer: 0, tick: 0, auto: 0, closing: 0, lobbyT: 0, saveT: 0, ready: false, relay: null, relayCode: '', relayErr: null, slots: null };
  /** Không khí màn chiếu (chỉ ở máy người dẫn, không gửi đi đâu). */
  function resetHype() { Object.assign(H, { feed: [], newCid: '', firstAns: null, prev: null, story: null, pending: '', seen: {}, lastSec: -1, suspense: false, reflex: {}, fun: { chain: {}, word: {} }, reacts: 0 }); }
  resetHype();

  /** Chỉ tài khoản giáo viên đã xác minh (js/arena/arena-teacher.js) mới tạo/khôi phục phòng. */
  function teacherOk() {
    if (global.EduArenaTeacher && global.EduArenaTeacher.ok()) return true;
    A.toast('Cần đăng nhập tài khoản giáo viên để tạo phòng.');
    A.setRole('teacher', true);
    return false;
  }
  function hostCreate() {
    if (!teacherOk()) return;
    A.saveNick();
    const src = A.deckSource();
    const deck = C.buildDeck(src.questions || [], A.rng, 0, A.kinds());
    if (!deck.length) { A.toast('Chọn bộ câu hỏi có câu trắc nghiệm trước nhé.'); return; }
    const mode = R.ROOM_MODES.includes(A.effMode()) ? A.effMode() : 'speed';
    // Số câu thật (0 = "Tất cả", không vượt số câu bộ có → không lặp câu). Đua về đích cần tới 2× số
    // bước: hết bộ mới trộn lại, không lặp liền nhau (trước: deck[i % n] lặp đúng thứ tự cũ).
    const count = C.playCount(A.prefs.count, deck.length);
    const room = R.createRoom({
      code: R.makeCode(cryptoRng), mode, deck: mode === 'race' ? C.extendDeck(deck, count * 2, A.rng) : deck.slice(0, count), count, secs: A.prefs.secs,
      maxPlayers: A.prefs.roomMax || 60, title: src.title, setKey: src.key,
    });
    startHosting(room, false);
  }

  async function startHosting(room, resumed) {
    H.room = room;
    resetHype();
    H.ropeShown = undefined;
    H.ready = false;
    openRoomScreen('Phòng ' + room.code);
    body().innerHTML = `<div class="ar-card ar-center"><p><i class="fa-solid fa-spinner fa-spin"></i> Đang mở phòng <b>${room.code}</b>...</p></div>`;
    try { await loadPeer(); } catch (e) { hostFail('Không tải được thư viện kết nối (js/vendor/peerjs.min.js) — kiểm tra mạng rồi thử lại.'); return; }
    persist();
    startRelay(room); // mở ngay, không chờ 0.peerjs.com (mạng trường chặn máy chủ bắt tay thì vẫn có đường này)
    let tries = 0;
    const open = () => {
      const peer = new global.Peer(R.peerId(room.code), peerOptions());
      H.peer = peer;
      peer.on('open', () => { H.ready = true; setNet(''); startRelay(room); renderHost(); });
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
  /** Đường dự phòng Firestore cho học sinh không nối thẳng được (mở khi mã phòng đã chốt). */
  function startRelay(room) {
    if (!global.EduArenaRelay || roomCfg().relay === false || (H.relay && H.relayCode === room.code)) return;
    if (H.relay) { H.relay.close(); H.relay = null; }
    H.relayCode = room.code;
    H.relayErr = null;
    H.slots = newRelaySlots();
    global.EduArenaRelay.host(room.code, onConn, () => !!H.room && H.room.phase === 'lobby')
      .then((relay) => { if (H.room === room && H.relayCode === room.code) H.relay = relay; else relay.close(); })
      .catch((e) => {
        console.warn('[Phòng cả lớp] Không mở được đường dự phòng:', e);
        if (H.room !== room) return;
        H.relayErr = e;
        if (room.phase === 'lobby') renderHost();
      });
  }
  // ── Hạn mức đường dự phòng: Firestore DÙNG CHUNG cả dự án (dashboard, lịch dạy, đăng nhập…) ──
  // Mỗi em dự phòng ~21 ghi + ~66 đọc/trận 20 câu. Nhiều giáo viên cùng mở phòng không được ăn hết
  // hạn mức: (1) trần mỗi phòng relayRoomMax (mặc định 25 em); (2) trần chung mỗi ngày đếm ở Apps
  // Script (arenaRelayTicket, apps/src/47-arena.gs) — máy người dẫn xin gói 5 chỗ CHỈ khi có em cần
  // (phòng cả lớp chung Wi-Fi: 0 lượt gọi). Apps Script cũ chưa có API / lỗi mạng → tối đa 10 em/phòng.
  const relayRoomMax = () => Math.max(1, Number(roomCfg().relayRoomMax) || 25);
  function newRelaySlots() {
    return global.EduArenaRelay.slots({
      roomMax: relayRoomMax(),
      fetchChunk: async (n) => {
        await global.EduLazyLoad.loadScripts(['js/services/apps-script-client.js']);
        return global.EduAppsScript.call('arenaRelayTicket', { slots: n }, { timeoutMs: 15000 });
      },
    });
  }
  function relayStatusHtml() {
    if (H.relayErr) {
      return `<p class="ar-hint ar-room-norelay">⚠️ Chưa mở được đường dự phòng (${esc(H.relayErr.code || H.relayErr.message || 'lỗi')}): học sinh <b>dùng 4G hoặc Wi-Fi khác</b> máy thầy cô có thể không vào được — cho cả lớp dùng <b>chung Wi-Fi</b> với máy này, hoặc nhờ quản trị publish firestore.rules mới.</p>`;
    }
    const st = H.slots && H.slots.state;
    if (!st || (!st.cids.size && !st.out)) return '';
    const left = st.info ? ` · hôm nay cả hệ thống còn ${Math.max(0, st.info.cap - st.info.used)}/${st.info.cap} chỗ` : '';
    return `<p class="ar-hint ar-room-relayinfo">🛰️ ${st.cids.size} em vào qua đường dự phòng (Firebase)${left}.${st.out ? ' <b>Đã hết chỗ</b> — em nào chưa vào được hãy dùng chung Wi-Fi với máy này.' : ''}</p>`;
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
  function topN(n) { return R.leaderboard(H.room).slice(0, n).map((r) => ({ name: r.name, face: r.face, value: r.value, streak: r.streak, hp: r.hp, team: r.team, mp: r.mp })); }
  /** Dây kéo co + sĩ số 2 đội (máy người dẫn). */
  function hostRope() {
    const n = R.teamCounts(H.room);
    const cur = H.room.rope || 0;
    const from = H.ropeShown === undefined ? cur : H.ropeShown; // dây trượt từ vị trí đang chiếu tới vị trí mới
    H.ropeShown = cur;
    return A.ropeHtml(cur, `${n.red} bạn`, `${n.blue} bạn`, from);
  }
  function lobbyMsg() {
    const ids = R.activeIds(H.room);
    return { t: 'lobby', count: ids.length, players: ids.slice(0, 80).map((id) => ({ name: H.room.players[id].name, face: H.room.players[id].face })) };
  }
  function questionMsg(cid) {
    const m = R.publicQuestion(H.room, Date.now());
    m.answered = H.room.answers[cid] ? H.room.answers[cid].k : null;
    const mine = H.room.players[cid];
    if (mine && mine.cards && H.room.mode === 'speed') m.cards = { x2: mine.cards.x2, shield: mine.cards.shield };
    if (mine && H.room.mode === 'survival') m.hp = mine.hp;
    if (mine && H.room.mode === 'tug') Object.assign(m, { team: mine.team, rope: H.room.rope || 0 });
    if (mine && H.room.mode === 'spell') Object.assign(m, { mp: mine.hp, shield: !!mine.shield, note: mine.note || null });
    if (mine && H.room.mode === 'heist') Object.assign(m, { gems: mine.gems, threat: C.vaultThreat(H.room.crack, mine), hnote: mine.note || null });
    return m;
  }
  function revealMsg(cid) {
    const r = H.room, L = r.last, q = R.current(r);
    return { t: 'reveal', i: L.i, total: r.total, mode: r.mode, goal: r.goal, correctIdx: L.correctIdx, text: q.text, options: q.options,
      kind: L.kind, correct: L.correct, left: q.left, right: L.right,
      expl: L.expl, counts: L.counts, you: L.results[cid] || null, top: topN(5), last: R.isDone(r),
      rope: r.rope || 0, delta: L.delta || 0, teams: r.mode === 'tug' ? R.teamCounts(r) : undefined,
      heistDone: r.mode === 'heist' && r.offers[cid] ? r.offers[cid].done : undefined };
  }
  function endMsg(cid) { return { t: 'end', you: R.personalEnd(H.room, cid), top: topN(5), mode: H.room.mode, code: H.room.code }; }
  function stateFor(cid) {
    const ph = H.room.phase;
    return ph === 'lobby' ? lobbyMsg() : ph === 'q' ? questionMsg(cid) : ph === 'reveal' ? revealMsg(cid) : endMsg(cid);
  }

  function onHostMsg(conn, msg) {
    const room = H.room;
    if (!room || !msg || typeof msg !== 'object') return;
    if (msg.t === 'hello' && conn.relay && !conn.arRelayOk) {
      if (conn.arRelayWait) return; // hello lặp lại trong lúc đang xin chỗ
      conn.arRelayWait = true;
      (H.slots ? H.slots.take(String(msg.cid || '')) : Promise.resolve(false)).then((ok) => {
        conn.arRelayWait = false;
        if (H.room !== room) return;
        if (!ok) { send(conn, { t: 'deny', reason: 'relay-full' }); setTimeout(() => conn.close(), 800); if (room.phase === 'lobby') renderHostLobby(); return; }
        conn.arRelayOk = true;
        onHostMsg(conn, msg);
      });
      return;
    }
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
      if (!res.rejoin) {
        A.sfx('click');
        H.newCid = cid;
        H.feed = [RH.joinLine(res.player.name, res.player.face, room.order.length)].concat(H.feed).slice(0, 4);
      }
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
        if (!H.firstAns) { const p = room.players[cid]; H.firstAns = { face: p.face, name: p.name, ms: room.answers[cid].ms }; }
        hostTick();
        persistSoon();
        if (r.allIn) closeSoon();
      } else if (r.reason === 'dupe') send(conn, { t: 'got', i: msg.i, k: room.answers[cid].k });
      else if (r.reason === 'late') send(conn, { t: 'late', i: msg.i });
    } else if (msg.t === 'spell') {
      if (R.pickSpell(room, cid, msg.i, msg.id)) {
        send(conn, { t: 'spellok', i: msg.i, id: msg.id });
        const el = $('arRSpells');
        if (el) el.textContent = `${R.pickedCount(room)}/${Object.keys(room.offers).length}`;
        persistSoon();
      }
    } else if (msg.t === 'heist') {
      const res = R.heistAct(room, cid, msg.i, msg.act, msg.to, msg.sym);
      // Không hợp lệ (bấm 2 lần, gói tin lặp): gửi lại kết quả đã có để máy em không treo ở "Đang gửi".
      send(conn, { t: 'heistok', i: msg.i, r: res || (room.offers[cid] && room.offers[cid].done) || null });
      if (res) {
        const el = $('arRSpells'), lg = $('arRHeistLog');
        if (el) el.textContent = `${R.pickedCount(room)}/${Object.keys(room.offers).length}`;
        if (lg && (res.opened || res.act === 'rekey')) { lg.innerHTML = heistLogHtml(room.heistLog); FX.flash(lg.firstElementChild, 'fx-bump'); }
        persistSoon();
      }
    } else if (msg.t === 'react' || msg.t === 'reflex' || msg.t === 'fun') {
      // Sảnh chờ: thả cảm xúc / kỷ lục phản xạ — CHỈ nhận từ học sinh nối thẳng (đường dự phòng không gửi, 0 Firebase),
      // chỉ ở sảnh, có giới hạn tần suất; biểu tượng theo số thứ tự cố định (không nhận chữ tự gõ).
      const now = Date.now();
      const gate = 'arFun_' + msg.t; // cảm xúc và kỷ lục giới hạn riêng (mỗi loại ≤ 1 lần/giây/em)
      if (room.phase !== 'lobby' || conn.relay || now - (conn[gate] || 0) < 1000) return;
      conn[gate] = now;
      const chip = [...document.querySelectorAll('#arRoomPlayers [data-kick]')].find((b) => b.dataset.kick === cid);
      if (msg.t === 'react') {
        const e = LF.REACTS[msg.e];
        if (!Number.isInteger(msg.e) || !e) return;
        H.reacts++;
        if (chip) FX.float(chip.closest('.ar-room-chip'), e, 'info');
        const n = $('arRoomReacts'); if (n) n.textContent = `🎉 ${fmt(H.reacts)} lượt thả cảm xúc`;
      } else if (msg.t === 'fun') {
        // Kỷ lục Nối từ / Ghép chữ (số từ, 1–300)
        const n = Math.round(Number(msg.n)), best = H.fun[msg.g];
        if (!best || !(n >= 1 && n <= 300) || (best[cid] && best[cid] >= n)) return;
        best[cid] = n;
        const box = $('arRoomReflex');
        if (box) { box.innerHTML = reflexHtml(); FX.flash(box, 'fx-bump'); }
        if (chip) FX.float(chip.closest('.ar-room-chip'), `${LF.GAMES[msg.g].icon} ${n} từ`, 'gold');
      } else {
        const ms = Math.round(Number(msg.ms));
        if (!(ms >= 100 && ms <= 1500) || (H.reflex[cid] && H.reflex[cid] <= ms)) return;
        H.reflex[cid] = ms;
        const box = $('arRoomReflex');
        if (box) { box.innerHTML = reflexHtml(); FX.flash(box, 'fx-bump'); }
        if (chip) FX.float(chip.closest('.ar-room-chip'), `⚡ ${ms} ms`, 'gold');
      }
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
    R.resolveSpells(room); // Đấu phép: phép đã chọn nổ trước khi xét "còn ai trụ lại"
    if (room.phase !== 'lobby' && R.isDone(room)) { hostFinish(); return; }
    R.openNext(room, Date.now());
    broadcast(questionMsg);
    persist();
    clearTimeout(H.timer);
    H.timer = setTimeout(closeQuestion, room.secs * 1000 + R.ANSWER_GRACE_MS);
    H.firstAns = null; H.lastSec = -1; H.suspense = false;
    const big = RH.openBanner(room, H.pending);
    H.pending = '';
    if (big && D) { D.banner(big.title, { tone: big.tone, icon: big.icon, sub: big.sub, ms: 1400 }); A.sfx('whoosh'); } else A.sfx('click');
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
    H.prev = RH.snap(room);
    R.reveal(room);
    broadcast(revealMsg);
    persist();
    H.story = RH.revealStory(room, H.prev);
    if (H.story.climax && !H.seen[H.story.climax]) { H.seen[H.story.climax] = true; H.pending = H.story.climax; $('arRoom').classList.add('is-climax'); }
    $('arRoom').classList.remove('is-tense');
    // Trống dồn: màn chiếu giữ câu hỏi + "Đáp án là..." một nhịp rồi mới lật đáp án (học sinh cũng tự dồn trống ở máy mình)
    H.suspense = !reduced();
    renderHost();
    if (H.suspense) {
      A.sfx('drumroll');
      const i = room.i;
      setTimeout(() => {
        if (H.room !== room || room.phase !== 'reveal' || room.i !== i || !H.suspense) return;
        H.suspense = false;
        renderHost();
        hypeRevealFx();
      }, SUSPENSE_MS);
    } else hypeRevealFx();
    if (A.prefs.roomAuto) H.auto = setTimeout(hostNext, AUTO_NEXT_MS + (H.suspense ? SUSPENSE_MS : 0));
  }
  function hostFinish() {
    const room = H.room;
    clearTimeout(H.timer); clearTimeout(H.auto);
    R.finish(room, Date.now());
    broadcast(endMsg);
    // Kết quả đã gửi → 20 giây sau đóng đường dự phòng: các em dự phòng thôi nghe document phòng
    setTimeout(() => { if (H.room === room && H.relay) { H.relay.close(); H.relay = null; } }, 20000);
    store.del(HOST_KEY);
    addHistory(room);
    $('arRoom').classList.remove('is-climax', 'is-tense');
    renderHost();
    // Bục vinh danh lên dần hạng 3 → 2 → 1 (CSS .is-slow), trống dồn rồi mới pháo hoa
    A.sfx('drumroll');
    setTimeout(() => { if (H.room !== room) return; A.sfx('win'); if (global.EduFX) global.EduFX.confetti({ count: 160 }); }, reduced() ? 0 : 2000);
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
    if (H.relay) { H.relay.close(); H.relay = null; }
    H.relayCode = ''; H.relayErr = null;
    H.peer = null; H.room = null; H.conns = new Map();
    $('arRoom').classList.remove('is-climax', 'is-tense');
    resetHype();
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
    else if (room.phase === 'reveal') { if (H.suspense) renderHostSuspense(); else renderHostReveal(); }
    else renderHostEnd();
    FX.settle(body()); // dây kéo co trượt từ vị trí cũ
  }
  function renderHostLobby() {
    const room = H.room;
    const ids = R.activeIds(room);
    const link = joinLink(room.code);
    body().innerHTML = `<div class="ar-room-lobby">
      <div class="ar-card ar-room-join-info">
        <p class="ar-muted ar-room-how">Học sinh <b>quét mã QR</b> hoặc mở link bên dưới — mã phòng đã điền sẵn, em chỉ cần nhập <b>họ và tên</b>.<br>Hoặc mở <b>Đấu trường</b> → tab <b>Học sinh</b> → nhập mã:</p>
        <div class="ar-room-bigcode" aria-label="Mã phòng">${room.code.split('').map((ch) => `<span>${ch}</span>`).join('')}</div>
        <div class="ar-room-qr" id="arRoomQr" role="img" aria-label="Mã QR để vào phòng ${room.code}" hidden></div>
        <p class="ar-hint ar-room-qr-hint">Hoặc quét mã QR bằng camera điện thoại</p>
        <p class="ar-room-link"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(link.replace(/^https?:\/\//, ''))}</a>
          <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-act="copy"><i class="fa-regular fa-copy"></i> Chép link</button></p>
        <p class="ar-hint">${MODE_LABEL[room.mode]} · ${room.mode === 'race' ? `về đích sau ${room.goal} bước` : `${room.total} câu`} · ${room.secs} giây/câu · ${esc(room.title)}</p>
        ${room.mode === 'speed' ? '<p class="ar-hint">🎁 Đúng liền 3 câu → thẻ 🃏 x2 · liền 6 câu → thẻ 🛡️ Khiên (tự dùng, cứ 3 câu đúng nhận 1 thẻ)</p>' : ''}
        ${room.mode === 'survival' ? `<p class="ar-hint">❤️ Mỗi em có ${C.LIVES} tim · sai hoặc bỏ trống mất 1 tim · đúng liền ${C.HEAL_EVERY} câu hồi 1 tim · hết tim bị loại. Người trụ lại cuối cùng thắng!</p>` : ''}
        ${room.mode === 'spell' ? `<p class="ar-hint">🔮 Mỗi em ${C.SPELL_HP} máu · trả lời đúng được chọn 1 trong 3 phép (tấn công, khiên, hồi máu) lúc xem đáp án · phép nổ khi sang câu sau, ai trả lời nhanh nổ trước và mạnh hơn · người trụ lại cuối cùng thắng</p>` : ''}
        ${room.mode === 'heist' ? `<p class="ar-hint">🔐 Mỗi em có 1 két khoá mã ${C.VAULT_LEN} ký hiệu · trả lời đúng được chọn ngay 1 việc: ⛏️ đào đá quý (nhanh được nhiều hơn) · 🔓 đoán 1 ký hiệu két của bạn, mở đủ ${C.VAULT_LEN} ô lấy ${C.HEIST_STEAL * 100}% đá quý · 🔁 đổi mã khi bị dòm ngó · nhiều đá quý nhất thắng</p>` : ''}
        ${room.mode === 'tug' ? '<p class="ar-hint">🪢 Máy tự chia 2 đội Đỏ – Xanh đều người theo lượt vào phòng · đúng kéo 1, đúng trong nửa đầu thời gian kéo 2 · dây chạm vạch 1 bên → đội đó thắng ngay</p>' : ''}
        ${H.ready ? '' : '<p class="ar-hint"><i class="fa-solid fa-spinner fa-spin"></i> Đang mở cổng kết nối...</p>'}
        ${relayStatusHtml()}
      </div>
      <div class="ar-card">
        <div class="ar-row"><h2 class="ar-h2"><i class="fa-solid fa-users"></i> Người chơi <span class="ar-muted">${ids.length}/${room.max}</span></h2>
          <div class="ar-row">
            <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-act="close"><i class="fa-solid fa-xmark"></i> Đóng phòng</button>
            <button type="button" class="ar-btn ar-btn-play" data-act="next" ${ids.length ? '' : 'disabled'}><i class="fa-solid fa-play"></i> Bắt đầu</button>
          </div></div>
        ${H.feed.length ? `<ul class="ar-room-feed" aria-live="polite">${H.feed.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        <div class="ar-room-players" id="arRoomPlayers">${ids.length ? playerChips(ids) : '<p class="ar-muted ar-center">Đang chờ học sinh vào phòng...</p>'}</div>
        <div class="ar-room-fun"><div class="ar-room-reflex" id="arRoomReflex">${reflexHtml()}</div>
          <p class="ar-room-reacts" id="arRoomReacts" aria-live="polite">${H.reacts ? `🎉 ${fmt(H.reacts)} lượt thả cảm xúc` : ''}</p></div>
        ${ids.length >= 2 ? `<p class="ar-room-crowd">${ids.length >= 20 ? '🎉 Đông vui quá!' : '👀 Còn chờ ai nữa không?'} ${ids.length} chiến binh đã sẵn sàng — ${esc(RH.TAGLINE[room.mode] || '')}</p>` : ''}
      </div></div>`;
    drawQr(link);
    H.newCid = '';
  }
  /** Màn chiếu ở sảnh: kỷ lục các trò khởi động của học sinh (Phản xạ · Nối từ · Ghép chữ), mỗi trò top 3. */
  function reflexHtml() {
    const room = H.room;
    const ok = (id) => room.players[id] && !room.players[id].kicked;
    const medal = ['🥇', '🥈', '🥉'];
    const list = (map, asc, unit) => Object.keys(map).filter(ok).sort((a, b) => (asc ? map[a] - map[b] : map[b] - map[a])).slice(0, 3)
      .map((id, i) => `<li><span>${medal[i]} ${esc(room.players[id].face)} ${esc(room.players[id].name)}</span><b>${map[id]} ${unit}</b></li>`).join('');
    const boards = [
      ['⚡ Tay nhanh nhất', list(H.reflex, true, 'ms')],
      [`${LF.GAMES.chain.icon} ${LF.GAMES.chain.name}`, list(H.fun.chain, false, 'từ')],
      [`${LF.GAMES.word.icon} ${LF.GAMES.word.name}`, list(H.fun.word, false, 'từ')],
    ].filter((b) => b[1]);
    if (!boards.length) return '<small class="ar-muted">🎮 Học sinh đang chờ có thể chơi <b>Phản xạ · Nối từ · Ghép chữ</b> — kỷ lục hiện ở đây!</small>';
    return `<b>🏆 Kỷ lục sảnh chờ</b><div class="ar-room-boards">${boards.map(([t, li]) => `<div><small>${t}</small><ol>${li}</ol></div>`).join('')}</div>`;
  }
  function playerChips(ids) {
    return ids.map((id) => {
      const p = H.room.players[id];
      const out = (H.room.mode === 'survival' || H.room.mode === 'spell') && H.room.i >= 0 && p.hp <= 0;
      return `<span class="ar-room-chip${p.online ? '' : ' is-off'}${out ? ' is-out' : ''}${id === H.newCid ? ' is-new' : ''}${p.team ? ' team-' + p.team : ''}" title="${p.online ? 'Đang kết nối' : 'Mất kết nối'}${p.team ? ' · ' + C.TEAMS[p.team].name : ''}"><span aria-hidden="true">${esc(p.face)}</span> ${esc(p.name)}
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
      <span class="ar-pill ar-pill-live" id="arRFirst" hidden></span>
      ${extra}
    </div>`;
  }
  function questionBlock(q, opts) {
    const head = `<div class="ar-q">${esc(q.text)}</div>${q.img ? `<img class="ar-qimg" src="${esc(q.img)}" alt="">` : ''}`;
    if (C.kindOf(q) !== 'choice') return head + `<div class="ar-kind">${K.viewHtml(q, opts)}</div>`;
    return `${head}
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
      ${room.mode === 'tug' ? hostRope() : ''}
      ${room.mode === 'spell' ? spellLogHtml(room.spellLog) : ''}
      ${room.mode === 'heist' ? heistLogHtml(room.heistLog) : ''}
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
    const f = $('arRFirst');
    if (f && H.firstAns) { f.hidden = false; f.textContent = `⚡ ${H.firstAns.face} ${H.firstAns.name} chốt đầu tiên · ${(H.firstAns.ms / 1000).toFixed(1).replace('.', ',')} giây`; }
    // 5 giây cuối: tích tắc trên loa máy chiếu; 3 giây cuối: tim đập + viền đỏ
    const sec = Math.ceil(left / 1000);
    if (left > 0 && sec <= 5 && sec !== H.lastSec) { H.lastSec = sec; A.sfx(sec <= 3 ? 'heartbeat' : 'tick'); }
    $('arRoom').classList.toggle('is-tense', left > 0 && sec <= 3);
    document.querySelectorAll('#arRoomPlayers .ar-room-chip').forEach((chip) => {
      const id = chip.querySelector('[data-kick]').dataset.kick;
      chip.classList.toggle('is-done', !!room.answers[id]);
    });
  }
  function boardHtml(rows, unit, meName) {
    return `<ol class="ar-board">${rows.map((r, i) => `<li class="${meName && r.name === meName ? 'is-me' : ''}"><span class="ar-board-rank">${i + 1}</span>
      <span class="ar-board-face">${esc(r.face)}</span><span class="ar-board-name">${esc(r.name)}${r.team ? ` <span class="ar-team-dot is-${r.team}" title="${C.TEAMS[r.team].name}"></span>` : ''}${r.hp !== undefined && r.hp !== null ? ` <span class="ar-board-hp" title="${r.hp} tim">${C.hearts(r.hp)}</span>` : ''}${r.mp !== undefined && r.mp !== null ? ` <span class="ar-hpbar" title="${r.mp} máu"><i style="width:${r.mp}%"></i></span>` : ''}${r.streak >= 3 ? ` <span class="ar-board-streak" title="Đúng liên tiếp ${r.streak} câu">🔥${r.streak}</span>` : ''}</span><b>${fmt(r.value)}</b><small>${unit}</small></li>`).join('')}</ol>`;
  }
  function lanesHtml(rows, goal, meName) {
    return `<div class="ar-track">${rows.map((p) => `<div class="ar-lane${meName && p.name === meName ? ' is-me' : ''}"><span class="ar-lane-name">${esc(p.name)}</span>
      <div class="ar-lane-road"><span class="ar-runner" style="left:calc(${(p.value / goal) * 100}% - ${(p.value / goal) * 2}rem)">${esc(p.face)}</span><span class="ar-flag" aria-hidden="true">🏁</span></div></div>`).join('')}</div>`;
  }
  /** Các đòn phép vừa nổ (màn chiếu): ưu tiên đòn hạ gục, tối đa 6 dòng. */
  function spellLine(e) {
    const S = C.SPELLS[e.spell];
    if (S.kind === 'shield') return `${S.icon} ${esc(e.face)} ${esc(e.by)} dựng Khiên phép`;
    if (S.kind === 'heal') return `${S.icon} ${esc(e.face)} ${esc(e.by)} ${e.heal ? `hồi ${e.heal} máu` : 'dùng Hồi phục khi đang đầy máu'}`;
    return `${S.icon} ${esc(e.face)} ${esc(e.by)} dùng ${S.name}: ${e.hits.map((h) => (h.blocked ? `${esc(h.name)} chặn bằng 🛡️` : `${esc(h.name)} −${h.amount}${h.ko ? ' 💥 bị hạ!' : ''}`)).join(', ') || 'trượt'}`;
  }
  function spellLogHtml(log) {
    if (!log || !log.length) return '';
    const top = log.slice().sort((a, b) => (b.hits.some((h) => h.ko) - a.hits.some((h) => h.ko))).slice(0, 6);
    return `<div class="ar-card ar-spell-log"><b>🔮 Phép vừa nổ</b><ul>${top.map((e) => `<li${e.hits.some((h) => h.ko) ? ' class="is-ko"' : ''}>${spellLine(e)}</li>`).join('')}</ul>${log.length > 6 ? `<small class="ar-muted">… và ${log.length - 6} phép khác</small>` : ''}</div>`;
  }
  /** Két vừa bị phá / đổi mã (màn chiếu) — phá két trước, tối đa 6 dòng. */
  const SYM = (k) => `<span class="ar-sym c${k}">${SHAPES[k]}</span>`;
  const locks = (n) => '🔓'.repeat(n) + '🔒'.repeat(C.VAULT_LEN - n);
  function heistLogHtml(log) {
    if (!log || !log.length) return '';
    const top = log.slice().sort((a, b) => (b.act === 'crack') - (a.act === 'crack')).slice(0, 6);
    return `<div class="ar-card ar-spell-log ar-heist-log"><b>🔐 Két vừa bị phá</b><ul>${top.map((e) => (e.act === 'crack'
      ? `<li class="is-ko">💥 ${esc(e.face)} ${esc(e.by)} phá két của ${esc(e.name)} — lấy ${fmt(e.take)} 💎</li>`
      : `<li>🔁 ${esc(e.face)} ${esc(e.by)} đổi mã két</li>`)).join('')}</ul>${log.length > 6 ? `<small class="ar-muted">… và ${log.length - 6} việc khác</small>` : ''}</div>`;
  }
  /** Màn chiếu lúc trống dồn: câu hỏi còn đó, đáp án chưa lật. */
  function renderHostSuspense() {
    const room = H.room;
    body().innerHTML = hostBar('')
      + `${room.mode === 'tug' ? hostRope() : ''}<div class="ar-room-stage is-drum">${questionBlock(R.current(room))}
        <div class="ar-room-drum" role="status"><span aria-hidden="true">🥁</span> Đáp án là...</div></div>`;
    hostTick();
  }
  /** Dải "gameshow" trên màn chiếu sau mỗi câu: cả lớp làm thế nào · bình luận viên · vinh danh. */
  function storyHtml() {
    const st = H.story;
    if (!st) return '';
    return `<div class="ar-room-hype">
      <p class="ar-room-mood">${esc(st.mood)}</p>
      ${st.mc ? `<p class="ar-caster"><i class="fa-solid fa-microphone-lines" aria-hidden="true"></i> ${esc(st.mc)}</p>` : ''}
      ${st.shouts.length ? `<div class="ar-room-shouts">${st.shouts.map((x, k) => `<span class="ar-room-shout" style="--k:${k}"><b>${x.icon} ${esc(x.label)}</b> ${esc(x.text)}</span>`).join('')}</div>` : ''}
    </div>`;
  }
  function hypeRevealFx() {
    const room = H.room, L = room && room.last;
    if (!L) return;
    const pct = L.answered ? (L.right || 0) / L.answered : 0;
    A.sfx(pct >= 0.5 ? 'correct' : 'flip');
    if (pct >= 0.8 && L.answered >= 3 && global.EduFX) global.EduFX.confetti({ count: 60 });
    const ok = body().querySelector('.ar-ans.is-correct');
    if (ok) FX.flash(ok, 'fx-correct');
  }
  function renderHostReveal() {
    const room = H.room, L = room.last, q = R.current(room);
    const done = R.isDone(room);
    const rows = R.leaderboard(room).slice(0, 10);
    body().innerHTML = hostBar(`<label class="ar-room-auto"><input type="checkbox" id="arRAuto" ${A.prefs.roomAuto ? 'checked' : ''}> Tự chuyển câu sau ${AUTO_NEXT_MS / 1000} giây</label>
        <button type="button" class="ar-btn ar-btn-play" data-act="next">${done ? '🏆 Xem kết quả' : 'Câu tiếp ▶'} <kbd>Enter</kbd></button>`)
      + `${room.mode === 'tug' ? hostRope() : ''}${storyHtml()}<div class="ar-stage">
        <div class="ar-qbox">${questionBlock(q, { reveal: true, counts: L.counts, total: L.answered })}
          ${L.expl ? `<div class="ar-feedback is-ok"><div class="ar-fb-expl">💡 ${esc(L.expl)}</div></div>` : ''}
          <p class="ar-hint ar-center">${L.answered} người trả lời · ${L.right ?? L.counts[L.correctIdx]} người đúng${room.mode === 'survival' ? ` · ❤️ còn ${R.activeIds(room).filter((id) => room.players[id].hp > 0).length} người trụ lại` : ''}${room.mode === 'spell' ? ` · 🔮 <b id="arRSpells">${R.pickedCount(room)}/${Object.keys(room.offers || {}).length}</b> em đã chọn phép (sang câu sau thì phép nổ)` : ''}${room.mode === 'heist' ? ` · 🔐 <b id="arRSpells">${R.pickedCount(room)}/${Object.keys(room.offers || {}).length}</b> em đã chọn việc (chưa chọn thì tự đào)` : ''}</p>
          ${room.mode === 'heist' ? `<div id="arRHeistLog">${heistLogHtml(room.heistLog)}</div>` : ''}</div>
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
  /** Danh hiệu cuối trận (màn chiếu): Chuỗi dài nhất · Chính xác nhất · Tia chớp · Bứt phá. */
  function awardsHtml(list) {
    if (!list.length) return '';
    return `<div class="ar-room-awards">${list.map((a, k) => `<div class="ar-room-award" style="--k:${k}"><span class="ar-room-award-ico" aria-hidden="true">${a.icon}</span>
      <small>${esc(a.label)}</small><b>${esc(a.face)} ${esc(a.name)}</b><span class="ar-muted">${esc(a.detail)}</span></div>`).join('')}</div>`;
  }
  function renderHostEnd() {
    const room = H.room;
    const board = R.leaderboard(room);
    const n = R.asked(room);
    const sum = R.summary(room);
    const hard = sum.perQuestion.map((x, i) => Object.assign({ i }, x)).filter((x) => x.of).sort((a, b) => a.correct / a.of - b.correct / b.of).slice(0, 3);
    const won = room.mode === 'tug' ? C.tugWinner(room.rope) : '';
    body().innerHTML = `<div class="ar-card ar-end">
      <h2 class="ar-h2 ar-center">${room.mode === 'tug' ? (won ? `🏆 ${C.TEAMS[won].icon} ${C.TEAMS[won].name} thắng! ·` : '🤝 Hai đội hoà ·')
        : room.mode === 'spell' && board[0] && board[0].mp > 0 ? `🏆 ${esc(board[0].face)} ${esc(board[0].name)} trụ lại cuối cùng! ·`
        : room.mode === 'heist' && board[0] && board[0].value > 0 ? `🏆 ${esc(board[0].face)} ${esc(board[0].name)} là Vua giải mã! ·` : '🏆'} Kết quả phòng ${room.code}</h2>
      ${room.mode === 'tug' ? hostRope() : ''}
      ${podiumHtml(board.slice(0, 3), UNIT[room.mode]).replace('class="ar-podium"', 'class="ar-podium is-slow"')}
      ${awardsHtml(RH.endAwards(room))}
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
  // log/imgs: câu hỏi + đáp án em đã gặp (ghi lúc công bố đáp án) → "Xem lại câu sai" + "Luyện lại" ở cuối trận.
  const P = { peer: null, conn: null, code: '', joined: false, stopped: true, retry: 0, retryT: 0, room: null, me: null, q: null, myK: null, timer: 0, sentAt: 0, log: [], imgs: {} };

  function machineId() {
    let id = store.get(CID_KEY, '');
    if (!/^[a-z0-9]{12,40}$/.test(id)) {
      id = Array.from(global.crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');
      store.set(CID_KEY, id);
    }
    return id;
  }
  /** Mã người chơi gắn với họ tên: phòng máy nhiều em dùng chung 1 trình duyệt vẫn là những người khác nhau. */
  function myCid() { return R.cidFor(machineId(), A.nickName()); }
  async function playerJoin(raw) {
    P.ropeShown = undefined;
    const code = R.normCode(raw);
    const name = A.setNick($('arJoinName').value);
    if (name.length < 2) { A.toast('Em nhập họ và tên của mình nhé!'); $('arJoinName').focus(); return; }
    if (code.length !== R.CODE_LEN) { A.toast(`Mã phòng gồm ${R.CODE_LEN} ký tự.`); $('arJoinCode').focus(); return; }
    playerStop(false);
    if (code !== P.code) { P.log = []; P.imgs = {}; } // vào lại đúng phòng cũ (rớt mạng) thì giữ nhật ký
    Object.assign(P, { code, joined: false, stopped: false, retry: 0, room: null, me: null, q: null, myK: null, viaRelay: relayRemembered(code) });
    try { sessionStorage.setItem(JOIN_SS, code); } catch (e) { /* ignore */ }
    history.replaceState(null, '', location.pathname + '?phong=' + code);
    openRoomScreen('Phòng ' + code);
    playerStatus(`<i class="fa-solid fa-spinner fa-spin"></i> Đang nối tới phòng <b>${code}</b>...`);
    try { await loadPeer(); } catch (e) { playerError('Không tải được thư viện kết nối — kiểm tra mạng rồi thử lại.'); return; }
    if (P.stopped) return;
    connectPlayer();
  }
  /** Gắn kết nối (WebRTC hoặc đường dự phòng — cùng giao diện) vào màn học sinh. */
  function attachPlayerConn(conn, timeoutMs) {
    P.conn = conn;
    const t = setTimeout(() => { if (!conn.open) { try { conn.close(); } catch (e) { /* ignore */ } playerLost(conn); } }, timeoutMs);
    conn.on('open', () => {
      clearTimeout(t);
      send(conn, { t: 'hello', v: 1, cid: myCid(), name: A.nickName(), face: A.avatar() });
    });
    conn.on('data', (m) => { if (conn === P.conn) onPlayerMsg(m); });
    conn.on('close', () => { clearTimeout(t); playerLost(conn); });
    conn.on('error', (e) => {
      clearTimeout(t);
      if (conn.relay && e && e.type === 'peer-unavailable' && !P.joined && conn === P.conn) {
        playerError(`Không tìm thấy phòng ${P.code}. Kiểm tra lại mã — hoặc giáo viên chưa mở / đã đóng phòng.`);
        return;
      }
      playerLost(conn);
    });
  }
  // Đã vào phòng này qua đường dự phòng (cùng tab) → tải lại trang vào thẳng đường đó, khỏi chờ
  // 12 giây thử nối thẳng lần nữa. sessionStorage: đổi mạng/mở tab mới thì thử nối thẳng lại từ đầu.
  const RELAY_SS = 'ar_relay_room';
  function relayRemembered(code) { try { return sessionStorage.getItem(RELAY_SS) === code; } catch (e) { return false; } }
  function rememberRelay(code) { try { sessionStorage.setItem(RELAY_SS, code); } catch (e) { /* ignore */ } }
  /** Đường dự phòng qua Firestore (js/arena/arena-relay.js) — chỉ khi nối thẳng không được. */
  async function relayConnect() {
    if (P.stopped) return;
    if (!P.joined) playerStatus('<i class="fa-solid fa-spinner fa-spin"></i> Mạng của em không nối thẳng được tới máy giáo viên — đang vào phòng qua <b>đường dự phòng</b>...');
    let conn;
    try {
      conn = await global.EduArenaRelay.connect(P.code);
    } catch (e) {
      if (P.stopped) return;
      const off = e && (e.code === 'auth/operation-not-allowed' || e.code === 'auth/admin-restricted-operation');
      if (off) { playerError('Đường dự phòng chưa bật (Firebase Authentication → Anonymous). Báo thầy cô — trong lúc chờ, dùng chung Wi-Fi với máy giáo viên rồi bấm Thử lại.'); return; }
      playerLost(null, true);
      return;
    }
    if (P.stopped) { conn.close(); return; }
    attachPlayerConn(conn, JOIN_TIMEOUT_MS);
  }
  function connectPlayer() {
    clearTimeout(P.retryT);
    if (P.stopped) return;
    if (P.viaRelay) { relayConnect(); return; }
    const go = () => {
      if (P.stopped) return;
      attachPlayerConn(P.peer.connect(R.peerId(P.code), { reliable: true, serialization: 'json' }), JOIN_TIMEOUT_MS);
    };
    if (P.peer && !P.peer.destroyed && P.peer.open) { go(); return; }
    try { if (P.peer) P.peer.destroy(); } catch (e) { /* ignore */ }
    const peer = new global.Peer(peerOptions());
    P.peer = peer;
    peer.on('open', go);
    peer.on('disconnected', () => { if (!peer.destroyed && !P.stopped) setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } }, 1500); });
    peer.on('error', (e) => {
      if (P.peer !== peer || P.stopped) return;
      if (e.type === 'peer-unavailable' && !P.joined && P.retry >= 1 && !global.EduArenaRelay) {
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
    // Nối thẳng thất bại (mạng khác nhau / máy chủ bắt tay bị chặn) → chuyển ngay sang đường dự phòng
    // qua Firestore, không phí thêm 4 lượt thử WebRTC. Học sinh nối thẳng được thì 0 lượt Firebase.
    if (!P.joined && !P.viaRelay && global.EduArenaRelay) {
      P.viaRelay = true;
      P.retry = 0;
      try { if (P.peer) P.peer.destroy(); } catch (e) { /* ignore */ }
      P.peer = null;
      clearTimeout(P.retryT);
      P.retryT = setTimeout(connectPlayer, 200);
      return;
    }
    if (!P.joined && P.retry > 4) {
      playerError('Không vào được phòng — cả đường nối thẳng lẫn đường dự phòng đều lỗi. Kiểm tra Internet của máy em và máy giáo viên rồi bấm Thử lại, hoặc dùng chung Wi-Fi với máy giáo viên.');
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
  function playerStatus(html) { if (LF) LF.unmount(); body().innerHTML = `<div class="ar-card ar-center ar-room-wait">${html}</div>`; }
  function playerError(msg) {
    playerStop(false);
    setNet('');
    body().innerHTML = `<div class="ar-card ar-center"><p>⚠️ ${esc(msg)}</p>
      <div class="ar-row ar-center-row"><button type="button" class="ar-btn" data-act="rejoin"><i class="fa-solid fa-rotate-right"></i> Thử lại</button>
      <button type="button" class="ar-btn ar-btn-ghost" data-act="home">Về Đấu trường</button></div></div>`;
  }

  function onPlayerMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t !== 'reveal' && m.t !== 'got' && m.t !== 'late' && m.t !== 'spellok' && m.t !== 'heistok') clearTimeout(P.revealT); // câu mới / kết thúc tới giữa lúc trống dồn
    switch (m.t) {
      case 'welcome':
        P.joined = true; P.retry = 0; P.room = m.room; P.me = m.you;
        if (P.conn && P.conn.relay) rememberRelay(P.code);
        setNet('');
        $('arRoomCode').textContent = `Phòng ${m.room.code} · ${m.you.face} ${m.you.name}`;
        break;
      case 'deny': {
        const why = { 'relay-full': 'Mạng của em không nối thẳng được tới máy giáo viên và đường dự phòng hôm nay đã hết chỗ (để dành Firebase cho việc khác của trường). Em dùng chung Wi-Fi với máy giáo viên rồi bấm Thử lại nhé.', full: 'Phòng đã đủ người.', kicked: 'Em đã được mời ra khỏi phòng này.', ended: 'Phòng này đã kết thúc.', name: 'Họ tên không hợp lệ — em nhập lại nhé.' }[m.reason] || 'Không vào được phòng.';
        playerError(why);
        break;
      }
      case 'lobby': renderPlayerLobby(m); break;
      case 'q': if (LF) LF.unmount(); renderPlayerQuestion(m); break;
      case 'got':
        if (P.q && m.i === P.q.i) { P.myK = m.k; lockAnswers(m.k, 'Đã gửi ✓ — chờ cả lớp...'); }
        break;
      case 'late':
        if (P.q && m.i === P.q.i) lockAnswers(null, '⏰ Hết giờ — câu trả lời tới muộn.');
        break;
      case 'reveal': playerRevealSoon(m); break;
      case 'spellok': {
        document.querySelectorAll('[data-spell]').forEach((b) => b.classList.toggle('is-picked', b.dataset.spell === m.id));
        const s = $('arPSpell');
        if (s) s.textContent = `Đã chọn ${C.SPELLS[m.id].icon} ${C.SPELLS[m.id].name} ✓ — đổi ý được tới khi sang câu sau.`;
        break;
      }
      case 'heistok': heistDone(m); break;
      case 'end': if (LF) LF.unmount(); renderPlayerEnd(m); break;
      case 'kick': playerError('Em đã được giáo viên mời ra khỏi phòng.'); break;
      case 'closed': playerError('Giáo viên đã đóng phòng.'); break;
      default: break;
    }
  }
  function renderPlayerLobby(m) {
    clearInterval(P.timer);
    // Đã ở sảnh (bạn mới vào phòng) → chỉ cập nhật sĩ số, KHÔNG vẽ lại để trò khởi động đang chơi không bị mất
    const cnt = $('arPLobbyCount');
    if (cnt) {
      cnt.textContent = `${m.count} người trong phòng`;
      $('arPLobbyFaces').innerHTML = m.players.map((p) => `<span title="${esc(p.name)}">${esc(p.face)}</span>`).join('');
      return;
    }
    const me = P.me || { face: A.avatar(), name: A.nickName() };
    const mode = P.room && P.room.mode;
    playerStatus(`<div class="ar-room-me"><span>${esc(me.face)}</span><b>${esc(me.name)}</b></div>
      <h2 class="ar-h2 ar-center">Đã vào phòng! Chờ giáo viên bắt đầu...</h2>
      <p class="ar-room-cheer t-fire">${esc(global.EduArenaHype.say('wait', (me.name || '').length))}</p>
      ${mode ? `<p class="ar-hint">${esc(MODE_LABEL[mode] || '')} — ${esc(RH.TAGLINE[mode] || '')}</p>` : ''}
      <div class="waiting-dots" aria-hidden="true"><i></i><i></i><i></i></div>
      <p class="ar-muted" id="arPLobbyCount">${m.count} người trong phòng</p>
      <div class="ar-room-faces" id="arPLobbyFaces">${m.players.map((p) => `<span title="${esc(p.name)}">${esc(p.face)}</span>`).join('')}</div>
      <div id="arPFun"></div>
      <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-act="leave">Rời phòng</button>`);
    if (LF) {
      const direct = P.conn && !P.conn.relay; // đường dự phòng (Firestore) → không gửi gì từ sảnh
      LF.mount($('arPFun'), {
        name: me.name,
        send: direct ? (msg) => { if (P.conn && !P.conn.relay) send(P.conn, msg); } : null,
        sfx: A.sfx,
      });
    }
  }
  function renderPlayerQuestion(m) {
    clearInterval(P.timer);
    P.q = m;
    P.myK = m.answered;
    if (m.img) P.imgs[m.i] = m.img;
    P.qStart = performance.now() - (m.secs * 1000 - m.ms);
    P.ansMs = null;
    const streak = P.lastY && P.lastY.i === m.i - 1 ? P.lastY.streak : 0;
    body().innerHTML = `<div class="ar-hud"><span class="ar-pill">${m.mode === 'race' ? `Câu ${m.i + 1}` : `Câu ${m.i + 1}/${m.total}`}</span>
        <span class="ar-pill" id="arPSecs"></span>${streak >= 2 ? `<span class="ar-pill ar-pill-fire">🔥 Chuỗi ${streak}</span>` : ''}${m.team ? `<span class="ar-pill ar-pill-team is-${m.team}">${C.TEAMS[m.team].icon} ${C.TEAMS[m.team].name}</span>` : ''}${m.gems !== undefined ? `<span class="ar-pill" title="Đá quý · số ô két em đã bị mở">💎 ${fmt(m.gems)} · két em ${locks(m.threat || 0)}</span>` : ''}${m.mp !== undefined ? `<span class="ar-pill" title="Máu còn lại"><span class="ar-hpbar"><i style="width:${m.mp}%"></i></span> ${m.mp} máu${m.shield ? ' · 🛡️' : ''}</span>` : ''}${m.hp !== undefined ? `<span class="ar-pill ar-pill-hp" title="Số tim còn lại">${C.hearts(m.hp)}</span>` : ''}${holdingsText(m.cards) ? `<span class="ar-pill" title="Thẻ thưởng đang giữ — tự dùng ở câu phù hợp">${holdingsText(m.cards)}</span>` : ''}</div>
      <div class="ar-timer"><i id="arPTimer"></i></div>
      ${m.note ? spellNoteHtml(m.note, m.mp) : ''}
      ${m.hnote ? heistNoteHtml(m.hnote, m.threat) : ''}
      <div class="ar-q">${esc(m.text)}</div>${m.img ? `<img class="ar-qimg" src="${esc(m.img)}" alt="">` : ''}
      <div class="ar-answers n${m.options.length}" id="arPAnswers">${C.kindOf(m) !== 'choice' ? '' : m.options.map((o, k) => `<button type="button" class="ar-ans c${k}" data-pk="${k}">
        <span class="ar-shape" aria-hidden="true">${SHAPES[k]}</span><span class="ar-ans-text">${esc(o)}</span><kbd>${k + 1}</kbd></button>`).join('')}</div>
      <p class="ar-room-status" id="arPStatus" aria-live="polite"></p>`;
    // Chọn nhiều / Sắp xếp / Ghép đôi — js/arena/arena-kinds.js
    P.picker = C.kindOf(m) !== 'choice' ? K.mount($('arPAnswers'), m, { onAnswer: playerAnswer }) : null;
    if (P.myK !== null && P.myK !== undefined) lockAnswers(P.myK, 'Đã gửi ✓ — chờ cả lớp...');
    const note = body().querySelector('.ar-spell-note');
    if (note) FX.flash(note, (m.note && (m.note.taken || m.note.ko)) || (m.hnote && m.hnote.robbed.length) ? 'fx-hit' : 'fx-bump');
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
    // Chữ lớn ngắn (máy em tự biết — không cần gói tin thêm): câu đầu, câu cuối
    if (D && P.bannerAt !== m.i && m.ms > m.secs * 1000 - 1500) {
      P.bannerAt = m.i;
      if (m.i === 0) D.banner('BẮT ĐẦU!', { tone: 'speed', icon: 'fa-play', sub: RH.TAGLINE[m.mode] || '', ms: 1000 });
      else if (m.mode !== 'race' && m.total > 1 && m.i === m.total - 1) D.banner('CÂU CUỐI!', { tone: 'final', icon: 'fa-flag-checkered', sub: 'Dồn hết sức nào!', ms: 1000 });
    }
  }
  function lockAnswers(k, msg) {
    if (P.picker) P.picker.lock();
    else document.querySelectorAll('#arPAnswers .ar-ans').forEach((b) => {
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
    if (left < -R.ANSWER_GRACE_MS || !C.isAnswer(q, k)) return;
    P.myK = k;
    P.ansMs = performance.now() - P.qStart;
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
  /** Dòng kết quả câu ở chế độ Sinh tồn: điểm + tim mất/hồi/bị loại. */
  function survivalNote(y) {
    if (y.wasOut) return `👻 Em đã bị loại — vẫn trả lời để luyện tập nhé! <span class="ar-tag">${C.hearts(0)}</span>`;
    const parts = [y.ok ? `+${fmt(y.pts)} điểm` : '+0 điểm'];
    if (y.healed) parts.push('<span class="ar-tag up">💚 Hồi 1 tim!</span>');
    if (y.out) parts.push('<span class="ar-tag">💀 Hết tim — em bị loại!</span>');
    else if (y.lost) parts.push('<span class="ar-tag">💔 Mất 1 tim</span>');
    parts.push(`<span class="ar-room-hp">${C.hearts(y.hp)}</span>`);
    return parts.join(' ');
  }
  /** Kết quả phép lượt trước của riêng em (gửi kèm câu hỏi). */
  function spellNoteHtml(n, mp) {
    const parts = [];
    if (n.spell) parts.push(`${C.SPELLS[n.spell].icon} Phép của em: ${n.dealt ? `gây ${n.dealt} sát thương` : C.SPELLS[n.spell].kind === 'heal' ? `hồi ${n.healed} máu` : n.shield ? 'dựng khiên' : 'bị chặn'}${n.healed && C.SPELLS[n.spell].kind === 'drain' ? `, hồi ${n.healed} máu` : ''}`);
    if (n.taken) parts.push(`💢 Em bị đánh −${n.taken} máu`);
    if (n.blocked) parts.push('🛡️ Khiên đã chặn 1 đòn');
    if (n.ko) parts.push(`💥 Em bị ${esc(n.ko)} hạ — vẫn trả lời để luyện tập nhé`);
    return parts.length ? `<p class="ar-spell-note${mp <= 0 ? ' is-out' : ''}">${parts.join(' · ')}</p>` : '';
  }
  /** Giải mã: chuyện xảy ra với két em ở lượt trước (gửi kèm câu hỏi). */
  function heistNoteHtml(n, threat) {
    const parts = [];
    n.robbed.forEach((r) => parts.push(`💥 ${esc(r.by)} phá két em, lấy ${fmt(r.take)} 💎`));
    if (threat > 0 && n.threat) parts.push(`⚠️ Có bạn đã mở ${threat}/${C.VAULT_LEN} ô két em — trả lời đúng rồi chọn 🔁 Đổi mã!`);
    if (n.auto) parts.push(`⛏️ Em chưa chọn việc nên máy tự đào +${n.auto} 💎`);
    return parts.length ? `<p class="ar-spell-note${n.robbed.length ? ' is-out' : ''}">${parts.join(' · ')}</p>` : '';
  }
  /** Giải mã: 3 bước chọn ngay trên màn xem đáp án — việc → két → ký hiệu. Số trên nút = phím tắt. */
  function heistPanel(step) {
    const H2 = P.heist, box = $('arPHeist');
    if (!H2 || !box) return;
    const btn = (val, icon, name, sub, k, off) => `<button type="button" class="ar-chest" data-heist="${val}" data-hot="${k}"${off ? ' disabled' : ''}>
      <span aria-hidden="true">${icon}</span>${name ? `<b>${name}</b>` : ''}${sub ? `<small>${sub}</small>` : ''}<kbd>${k}</kbd></button>`;
    const back = '<button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-heist="back">↩ Chọn việc khác</button>';
    const c = H2.choices;
    if (step === 'acts') {
      box.innerHTML = `<div class="ar-chests ar-heist">${btn('mine', '⛏️', 'Đào đá quý', 'Trả lời càng nhanh đào càng nhiều', 1)}
        ${btn('crack', '🔓', 'Phá két', c.targets.length ? `Đoán 1 ký hiệu két của bạn — mở đủ ${C.VAULT_LEN} ô lấy ${C.HEIST_STEAL * 100}% đá quý` : 'Chưa có bạn nào để phá', 2, !c.targets.length)}
        ${btn('rekey', '🔁', 'Đổi mã két', c.threat ? `Có bạn đã mở ${c.threat}/${C.VAULT_LEN} ô két em!` : 'Chưa ai mở được ô nào', 3, !c.threat)}</div>
        <p class="ar-hint">Chưa chọn — sang câu sau mà chưa chọn thì máy tự đào.</p>`;
    } else if (step === 'targets') {
      box.innerHTML = `<p class="ar-pick-prompt">🔓 Chọn két muốn phá:</p><div class="ar-chests ar-targets">${c.targets.map((t, k) => btn('t' + k, esc(t.face), esc(t.name), `${fmt(t.gems)} 💎 · ${locks(t.pos)}`, k + 1)).join('')}</div>${back}`;
    } else {
      const t = c.targets[H2.to];
      box.innerHTML = `<p class="ar-pick-prompt">Ô ${t.pos + 1}/${C.VAULT_LEN} két của ${esc(t.name)} là ký hiệu nào?${t.wrong.length ? ` <small>(đã loại ${t.wrong.map(SYM).join(' ')})</small>` : ''}</p>
        <div class="ar-chests ar-syms">${Array.from({ length: C.VAULT_SYMS }, (_, k) => btn('s' + k, SYM(k), '', '', k + 1, t.wrong.includes(k))).join('')}</div>${back}`;
    }
  }
  function playerHeist(btn) {
    const H2 = P.heist;
    if (!H2 || H2.sent || !P.conn || P.stopped || btn.disabled) return;
    const v = btn.dataset.heist;
    A.sfx('click');
    if (v === 'back') { heistPanel('acts'); return; }
    if (v === 'crack') { heistPanel('targets'); return; }
    if (v[0] === 't') { H2.to = +v.slice(1); heistPanel('syms'); return; }
    const msg = { t: 'heist', i: H2.i, act: v };
    if (v[0] === 's') Object.assign(msg, { act: 'crack', to: H2.choices.targets[H2.to].cid, sym: +v.slice(1) });
    H2.sent = true;
    $('arPHeist').querySelectorAll('button').forEach((b) => { b.disabled = true; });
    send(P.conn, msg);
  }
  /** Kết quả việc em vừa chọn (máy người dẫn chấm) + hiệu ứng. */
  function heistDone(m) {
    const box = $('arPHeist');
    if (!box || !P.heist || m.i !== P.heist.i) return;
    const r = m.r;
    P.heist.sent = true;
    if ($('arPHeistHead')) $('arPHeistHead').textContent = 'Lượt của em:';
    if (!r) { box.innerHTML = '<p class="ar-spell-note">Lượt này không thực hiện được — chờ câu sau nhé.</p>'; return; }
    const total = ` <span class="ar-muted">· Em đang có ${fmt(r.total)} 💎</span>`;
    const line = r.act === 'mine' ? `⛏️ Em đào được <b>${fmt(r.gems)} 💎</b>`
      : r.act === 'rekey' ? '🔁 Em đã đổi mã két — mọi người phải đoán lại từ đầu'
      : r.opened && !r.take ? `🔓 Em mở được két của ${esc(r.name)} — nhưng két đang trống, chưa có đá quý nào`
      : r.opened ? `💥 Em phá được két của ${esc(r.name)} — lấy <b>${fmt(r.take)} 💎</b>!`
      : r.hit ? `✅ Đúng ô ${r.pos}! Két ${esc(r.name)}: ${locks(r.pos)}`
      : `✖️ Ô đó không phải ${SYM(r.sym)} — câu sau thử ký hiệu khác`;
    box.innerHTML = `<p class="ar-spell-note ar-heist-res${r.act === 'crack' && !r.hit ? ' is-out' : ''}">${line}${total}</p>`;
    const el = box.firstElementChild;
    if (r.act === 'mine') { FX.float(el, `+${r.gems} 💎`, 'gem'); FX.burst(el, ['💎', '✨'], 6); A.sfx('match'); }
    else if (r.act === 'rekey') { FX.flash(el, 'fx-shield'); A.sfx('flip'); }
    else if (r.opened && r.take) { FX.flash(el, 'fx-bump'); FX.float(el, `+${r.take} 💎`, 'gem'); FX.burst(el, ['💎', '🪙', '✨'], 10); A.sfx('critical'); if (global.EduFX) global.EduFX.confetti({ count: 60 }); }
    else if (r.hit) { FX.flash(el, 'fx-unlock'); if (r.opened) { A.sfx('flip'); return; } FX.float(el, '🔓', 'info'); A.sfx('correct'); }
    else { FX.flash(el, 'fx-wrong'); A.sfx('wrong'); }
  }
  /** Đấu phép: em chọn 1 phép trong lúc xem đáp án (gửi máy người dẫn; đổi ý được). */
  function playerSpell(btn) {
    if (!P.conn || P.stopped) return;
    A.sfx('click');
    btn.classList.add('is-picked');
    send(P.conn, { t: 'spell', i: +btn.dataset.i, id: btn.dataset.spell });
  }
  const teamTag = (t) => (C.TEAMS[t] ? ` · ${C.TEAMS[t].icon} ${C.TEAMS[t].name}` : '');
  /** Đang ở màn câu hỏi của chính câu này → trống dồn một nhịp rồi mới lật (cùng nhịp với màn chiếu). */
  function playerRevealSoon(m) {
    clearTimeout(P.revealT);
    if (!P.q || P.q.i !== m.i || reduced()) { renderPlayerReveal(m); return; }
    clearInterval(P.timer);
    if (P.picker) P.picker.lock();
    document.querySelectorAll('#arPAnswers .ar-ans').forEach((b) => { b.disabled = true; });
    const ans = $('arPAnswers');
    if (ans) ans.classList.add('is-drum');
    const st = $('arPStatus');
    if (st) { st.innerHTML = '<span class="ar-room-drum is-inline"><span aria-hidden="true">🥁</span> Đáp án là...</span>'; }
    A.sfx('drumroll');
    P.revealT = setTimeout(() => renderPlayerReveal(m), SUSPENSE_MS);
  }
  function renderPlayerReveal(m) {
    clearInterval(P.timer);
    P.q = null; P.picker = null;
    const y = m.you || { ok: false, k: null, pts: 0, bonus: 0, step: 0, rank: 0, value: 0, streak: 0 };
    if (m.you && m.text && Array.isArray(m.options)) {
      P.log[m.i] = { q: { kind: m.kind, text: m.text, options: m.options, correctIdx: m.correctIdx, correct: m.correct, left: m.left, expl: m.expl || '', img: P.imgs[m.i] || '' }, chosen: y.k, ok: !!y.ok };
    }
    const head = y.ok ? '✅ Chính xác!' : y.k === null ? '⏰ Em chưa trả lời kịp' : '❌ Chưa đúng';
    const fast = y.ok && P.ansMs != null && P.ansMs < (P.room ? P.room.secs : 20) * 300;
    const cheer = m.you ? RH.studentCheer(m, y, fast) : { text: '', tone: '' };
    const rival = m.you ? RH.studentRival(m, y) : '';
    P.lastY = { i: m.i, streak: y.streak || 0 };
    const gain = m.mode === 'survival' ? survivalNote(y)
      : m.mode === 'heist'
      ? (y.ok ? '<span id="arPHeistHead">Chọn 1 việc:</span>' : `Lượt này không được chọn việc · 💎 ${fmt(y.gems || 0)}`)
      : m.mode === 'spell'
      ? (y.wasOut ? '👻 Em đã bị hạ — vẫn trả lời để luyện tập nhé!' : y.ok ? 'Chọn 1 phép — phép nổ khi sang câu sau:' : 'Lượt này không có phép')
      : m.mode === 'tug'
      ? (y.ok ? `+${y.pts} lực kéo${teamTag(y.team)}${y.pts === 2 ? ' <span class="ar-tag up">⚡ nhanh — kéo gấp đôi</span>' : ''}`
        : `Nhịp này em chưa kéo được${teamTag(y.team)}`)
      : m.mode === 'race'
      ? (y.ok ? (y.step === 2 ? '⚡ Tăng tốc! +2 bước' : '+1 bước') : 'Đứng yên')
      : (y.ok ? `+${fmt(y.pts + y.bonus)} điểm${y.bonus ? ` <span class="ar-tag">🔥 chuỗi ${y.streak} +${y.bonus}</span>` : ''}` : '+0 điểm');
    body().innerHTML = `<div class="ar-feedback ${y.ok ? 'is-ok' : 'is-bad'} ar-room-result">
        <div class="ar-room-result-head">${head}</div>
        ${cheer.text ? `<p class="ar-room-cheer t-${cheer.tone}">${esc(cheer.text)}</p>` : ''}
        <div class="ar-fb-head">${gain}${y.up > 0 ? ` <span class="ar-tag up">▲ lên ${y.up} hạng</span>` : ''}</div>
        ${m.mode === 'speed' ? cardNoteHtml(y) : ''}
        ${m.mode === 'spell' && y.spells ? `<div class="ar-chests ar-spells ar-room-spells">${y.spells.map((id, k) => `<button type="button" class="ar-chest s-${id}" data-spell="${id}" data-i="${m.i}">
          <span aria-hidden="true">${C.SPELLS[id].icon}</span><b>${C.SPELLS[id].name}</b><small>${esc(id === 'heal' && y.mp >= C.SPELL_HP ? 'Em đang đầy máu — chọn phép khác lợi hơn' : C.SPELLS[id].tip)}</small><kbd>${k + 1}</kbd></button>`).join('')}</div>
          <p class="ar-hint" id="arPSpell">Chưa chọn — sang câu sau mà chưa chọn thì dùng ${C.SPELLS[y.spells[0]].icon} ${C.SPELLS[y.spells[0]].name}.</p>` : ''}
        ${m.mode === 'heist' && y.heist ? '<div class="ar-room-spells" id="arPHeist"></div>' : ''}
        ${m.mode === 'tug' && m.teams ? A.ropeHtml(m.rope, `${m.teams.red} bạn`, `${m.teams.blue} bạn`, P.ropeShown ?? m.rope) : ''}
        ${y.rank ? `<p class="ar-room-rank">Hạng <b>${y.rank}</b> · ${fmt(y.value)} ${UNIT[m.mode]}${m.mode === 'race' ? `/${m.goal}` : ''}</p>` : ''}
        ${rival ? `<p class="ar-rival ar-room-rival">${esc(rival)}</p>` : ''}
        ${!y.ok ? (C.kindOf(m) === 'choice' ? `<div class="ar-fb-ans">Đáp án đúng: <b>${SHAPES[m.correctIdx]} ${esc(m.options[m.correctIdx])}</b></div>`
          : `<div class="ar-fb-ans">${y.k != null ? `<span class="ar-tag">em đúng ${C.partial(m, y.k).right}/${C.partial(m, y.k).of}</span> ` : ''}Đáp án đúng:<ul class="ar-fb-list">${C.answerLines(m).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`) : ''}
        ${m.expl ? `<div class="ar-fb-expl">💡 ${esc(m.expl)}</div>` : ''}
      </div>
      <div class="ar-side ar-room-top5"><h3>Top 5</h3>${boardHtml(m.top, UNIT[m.mode], P.me && P.me.name)}</div>
      <p class="ar-hint ar-center">${m.last ? 'Câu cuối — chờ giáo viên công bố kết quả...' : 'Chờ giáo viên chuyển câu tiếp...'}</p>`;
    A.sfx(y.out && !y.wasOut ? 'lose' : y.ok ? (y.streak >= 3 ? 'combo' : 'correct') : 'wrong');
    // Hiệu ứng: đúng → khung nảy + số bay lên; sai → rung; dây kéo co trượt; lên hạng → dòng của em sáng.
    if (m.mode === 'tug') P.ropeShown = m.rope;
    P.heist = m.mode === 'heist' && y.heist ? { i: m.i, choices: y.heist, to: 0, sent: false } : null;
    if (P.heist) { heistPanel('acts'); if (m.heistDone) heistDone({ i: m.i, r: m.heistDone }); }
    const box = body().querySelector('.ar-room-result');
    FX.settle(box);
    if (y.ok) {
      FX.flash(box, 'fx-correct');
      const gain = m.mode === 'race' ? `+${y.step}` : m.mode === 'tug' ? `💪 +${y.pts}` : m.mode === 'spell' ? '🔮' : m.mode === 'heist' ? '🔐' : `+${fmt(y.pts + (y.bonus || 0))}`;
      FX.float(box.querySelector('.ar-room-result-head'), gain, 'up');
    } else if (global.EduFX) global.EduFX.shake(box);
    if (y.up > 0) FX.flash(body().querySelector('.ar-room-top5 li.is-me'), 'fx-rankup');
    const ch = body().querySelector('.ar-room-cheer');
    if (ch) FX.flash(ch, 'fx-caster');
    if (y.ok && (y.streak === 5 || (y.streak >= 8 && y.streak % 4 === 0)) && D) D.banner(`CHUỖI ${y.streak} CÂU!`, { tone: 'fire', icon: 'fa-fire', sub: cheer.text, ms: 1300 });
    else if (y.ok && y.rank === 1 && y.up > 0 && D) D.banner('EM DẪN ĐẦU!', { tone: 'up', icon: 'fa-crown', sub: 'Giữ vững ngôi đầu nhé!', ms: 1300 });
  }
  function endTitle(mode, y) {
    if (mode === 'spell') {
      if (!(y.mp > 0)) return `💥 Em bị hạ — hạng ${y.rank}/${y.players}. Lần sau cố lên nhé!`;
      if (y.rank === 1) return '🏆 Em là pháp sư trụ lại cuối cùng!';
    }
    if (mode === 'heist' && y.rank === 1 && y.value > 0) return '🏆 Em là Vua giải mã của cả phòng!';
    if (mode === 'tug') {
      if (!y.won) return '🤝 Hai đội hoà — trận kéo co rất sát!';
      return y.won === y.team ? `🏆 ${C.TEAMS[y.team].name} của em thắng!` : `${C.TEAMS[y.won].icon} ${C.TEAMS[y.won].name} thắng lần này — đội em cố lên nhé!`;
    }
    if (mode === 'survival' && !(y.hp > 0)) return `💀 Em đã bị loại — hạng ${y.rank}/${y.players}. Lần sau cố lên nhé!`;
    if (y.rank === 1) return mode === 'survival' ? '🏆 Em là người sống sót cuối cùng!' : '🏆 Em vô địch cả phòng!';
    return `Em về hạng ${y.rank}/${y.players}`;
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
      A.addDaily(y.correct);
      A.refreshWallet();
      try {
        const pct = y.total ? Math.round((y.correct / y.total) * 100) : 0;
        global.EduGamification && global.EduGamification.recordGameSession('arena-room-' + m.mode, {
          score: pct, scoreType: 'percent', accuracy: pct, correctAnswers: y.correct, wrongAnswers: y.total - y.correct, showReward: false,
        });
      } catch (e) { /* XP chỉ là phần thêm */ }
    }
    const seen = P.log.filter(Boolean);
    const wrong = seen.filter((x) => !x.ok);
    const booked = A.toBook(P.me ? P.me.name : A.nickName(), seen, 'Phòng cả lớp · ' + ((P.room && P.room.title) || ''));
    const ec = RH.endCheer(m.mode, y);
    body().innerHTML = `<div class="ar-card ar-end">
      <h2 class="ar-h2 ar-center">${endTitle(m.mode, y)}</h2>
      ${ec.text ? `<p class="ar-room-cheer t-gold ar-center">${esc(ec.text)}</p>` : ''}
      ${ec.badges.length ? `<div class="ar-room-badges">${ec.badges.map((b, k) => `<span class="ar-room-badge" style="--k:${k}">${esc(b)}</span>`).join('')}</div>` : ''}
      ${podiumHtml(m.top.slice(0, 3), UNIT[m.mode], P.me && P.me.name)}
      <div class="ar-end-stats">
        <div><b>${y.correct}/${y.total}</b><span>câu đúng</span></div>
        <div><b>${y.bestStreak}</b><span>chuỗi đúng dài nhất</span></div>
        <div><b>${fmt(y.value)}</b><span>${UNIT[m.mode]}</span></div>
        ${m.mode === 'survival' ? `<div><b>${C.hearts(y.hp || 0)}</b><span>${y.hp > 0 ? 'em trụ đến cuối!' : 'tim còn lại'}</span></div>` : ''}
        ${m.mode === 'spell' ? `<div><b>${y.mp || 0}</b><span>máu còn lại</span></div>` : ''}
        ${m.mode === 'heist' ? `<div><b>${y.opened || 0}</b><span>két em phá được</span></div>` : ''}
        <div class="is-coin"><b>+${coins} 🪙</b><span>xu (đang có ${A.profile().coins})</span></div>
        ${A.dailyStat()}
      </div>
      ${wrong.length ? '' : y.total && y.correct === y.total ? '<p class="ar-center ar-room-perfect">🌟 Em không sai câu nào — xuất sắc!</p>' : ''}
      <div class="ar-row ar-center-row">${wrong.length ? '<button type="button" class="ar-btn ar-btn-play ar-btn-practice" data-act="practice"></button>' : ''}
        <button type="button" class="ar-btn" data-act="home"><i class="fa-solid fa-gamepad"></i> Về Đấu trường</button>
        <button type="button" class="ar-btn ar-btn-pack" data-act="packs"><span aria-hidden="true">🥚</span> Mở hộp</button></div>
      ${A.bookNoteHtml(booked)}
      ${wrong.length ? `<details class="ar-review" open>${A.reviewHtml(wrong)}</details>` : ''}</div>`;
    const pb = body().querySelector('[data-act="practice"]');
    if (pb) A.paintPracticeBtn(pb, wrong.length);
    playerStop(false);
    const out = (m.mode === 'survival' && !(y.hp > 0)) || (m.mode === 'spell' && !(y.mp > 0)); // bị loại: không bắn pháo hoa dù đứng hạng cao
    A.sfx(out ? 'lose' : y.rank === 1 ? 'win' : y.rank <= 3 ? 'match' : 'flip');
    if (!out && y.rank <= 3 && global.EduFX) global.EduFX.confetti({ count: y.rank === 1 ? 140 : 70 });
  }

  // ============================================================
  // MÀN CHỌN: thẻ "Phòng cả lớp" + sự kiện chung
  // ============================================================
  function paintHostCard() {
    const mode = A.effMode();
    $('arRoomModeNote').textContent = `Phòng sẽ chơi ${MODE_LABEL[mode] || MODE_LABEL.speed} với bộ câu, số câu và giây mỗi câu đã chọn ở trên.`;
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
    if (!teacherOk()) return;
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
    if (location.search.includes('phong=')) { history.replaceState(null, '', location.pathname); A.setInvite(false); }
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
      case 'practice': A.practice(P.log); break;
      case 'leave': goHome(); break;
      default: break;
    }
  }

  /** Tick xanh từng ô + nút "Vào phòng" sáng lên khi đã nhập đủ — học sinh biết ngay mình còn thiếu gì. */
  function paintJoinReady() {
    const nameOk = $('arJoinName').value.trim().length >= 2;
    const codeOk = R.normCode($('arJoinCode').value).length === R.CODE_LEN;
    $('arJoinNameField').classList.toggle('is-filled', nameOk);
    $('arJoinCodeField').classList.toggle('is-filled', codeOk);
    $('arJoinBtn').classList.toggle('is-ready', nameOk && codeOk);
  }

  function init() {
    $('arHostBtn').addEventListener('click', hostCreate);
    // Học sinh: Họ và tên → Mã phòng → Vào phòng (Enter ở ô tên chuyển sang ô mã nếu mã chưa đủ).
    $('arJoinForm').addEventListener('submit', (e) => { e.preventDefault(); playerJoin($('arJoinCode').value); });
    $('arJoinName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && R.normCode($('arJoinCode').value).length < R.CODE_LEN) { e.preventDefault(); $('arJoinCode').focus(); }
    });
    $('arJoinCode').addEventListener('input', (e) => { e.target.value = R.normCode(e.target.value); $('arJoinFromLink').hidden = true; paintJoinReady(); });
    $('arJoinName').addEventListener('input', paintJoinReady);
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
      if (a) { playerAnswer(+a.dataset.pk); return; }
      const sp = e.target.closest('[data-spell]');
      if (sp) { playerSpell(sp); return; }
      const hb = e.target.closest('[data-heist]');
      if (hb) playerHeist(hb);
    });
    $('arRoom').addEventListener('change', (e) => { if (e.target.id === 'arRAuto') { A.prefs.roomAuto = e.target.checked; A.save(); } });
    $('arRoomLeave').addEventListener('click', goHome);
    document.addEventListener('keydown', (e) => {
      if ($('arRoom').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const n = parseInt(e.key, 10);
      if (P.q && !P.stopped && P.picker) {
        if (n >= 1 && n <= P.q.options.length) { e.preventDefault(); P.picker.key(n); return; }
        if (e.key === 'Enter' && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); P.picker.submit(); return; }
      }
      if (P.q && !P.stopped && !P.picker && n >= 1 && n <= P.q.options.length) { e.preventDefault(); playerAnswer(n - 1); return; }
      const sp = !P.q && n >= 1 && document.querySelectorAll('#arRoomBody [data-spell]')[n - 1];
      if (sp) { e.preventDefault(); playerSpell(sp); return; }
      const hb = !P.q && n >= 1 && document.querySelector(`#arPHeist [data-hot="${n}"]`);
      if (hb) { e.preventDefault(); playerHeist(hb); return; }
      if (H.room && (e.key === 'Enter' || e.key === ' ') && R.canAdvance(H.room) && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); hostNext(); }
    });
    document.addEventListener('arena:deck', paintHostCard);
    document.addEventListener('arena:role', paintHostCard);
    document.addEventListener('arena:mode', paintHostCard);
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
      $('arJoinFromLink').hidden = false;
      let again = '';
      try { again = sessionStorage.getItem(JOIN_SS) || ''; } catch (e) { /* ignore */ }
      if (again === code && A.nickName() !== 'Em' && $('arNick').value.trim()) { A.setNick($('arNick').value); $('arJoinName').value = A.nickName(); playerJoin(code); }
      else $('arJoinName').focus(); // học sinh chỉ cần gõ họ tên rồi Enter
    } else if (new URLSearchParams(location.search).get('phong')) {
      A.toast('Mã phòng trong link chưa đúng — nhập lại mã nhé.'); $('arJoinCode').focus();
    }
    paintJoinReady();
  }
  init();

  global.EduArenaRoom = { _host: () => H, _player: () => P };
})(window);
