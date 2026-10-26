/* ============================================================
   js/game-sfx.js — Hiệu ứng âm thanh DÙNG CHUNG cho các mini-game
   (Battle Quiz, Memory Game, Sudoku, ...).

   Tự tổng hợp âm bằng Web Audio API (oscillator + envelope) — KHÔNG
   cần tải file .mp3/.wav nào, nên nhẹ và luôn sẵn có kể cả offline.
   Tự tắt êm nếu trình duyệt không hỗ trợ AudioContext (vd 1 số iframe
   hạn chế) — không bao giờ ném lỗi làm hỏng trải nghiệm chơi game.

   Cách dùng ở game khác:
     <script src="js/game-sfx.js"></script>
     EduSFX.play('correct');   // 'wrong' | 'combo' | 'critical' | 'win' | 'lose' | 'flip' | 'click'
                               // lễ hội: 'boom' | 'cheer' | 'sparkle' | 'count' | 'go'
     EduSFX.music(1);          // nhạc nền chờ: 1 vui · 2 hồi hộp · 3 nước rút · 0 tắt (tắt tiếng thì im luôn)

   Tôn trọng lựa chọn của người chơi: nhớ trạng thái bật/tắt qua
   localStorage (dùng chung 1 key cho MỌI game, tắt 1 lần là tắt hết).
   ============================================================ */
(function (global) {
  'use strict';

  var MUTE_KEY = 'eduquiz_sfx_muted';
  var ctx = null;
  var muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* ignore */ }

  function getCtx() {
    if (ctx) return ctx;
    var Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch (e) { ctx = null; }
    return ctx;
  }

  // Mở khoá AudioContext ở tương tác chuột/chạm ĐẦU TIÊN — trình duyệt
  // chặn tự phát âm thanh trước khi người dùng tương tác với trang.
  function unlock() {
    var c = getCtx();
    if (c && c.state === 'suspended') c.resume().catch(function () {});
  }
  ['pointerdown', 'keydown'].forEach(function (evt) {
    global.addEventListener(evt, unlock, { once: true, passive: true });
  });

  /** 1 nốt đơn: tần số, thời lượng (giây), dạng sóng, âm lượng đỉnh. */
  function tone(freq, dur, type, peak, delay) {
    var c = getCtx();
    if (!c || muted) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak != null ? peak : 0.18, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Trượt cao độ (dùng cho combo/critical/win) — 1 oscillator, tần số đổi dần. */
  function sweep(freqFrom, freqTo, dur, type, peak, delay) {
    var c = getCtx();
    if (!c || muted) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak != null ? peak : 0.18, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Tiếng ồn trắng qua bộ lọc (pháo nổ, vỗ tay) — tự tạo, không tải file. */
  var noiseBuf = null;
  function noise(dur, filterFreq, peak, delay, q) {
    var c = getCtx();
    if (!c || muted) return;
    noiseAt(c.currentTime + (delay || 0), dur, filterFreq, peak, q, c.destination);
  }
  function noiseAt(t0, dur, filterFreq, peak, q, out) {
    var c = getCtx();
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var src = c.createBufferSource(), flt = c.createBiquadFilter(), gain = c.createGain();
    src.buffer = noiseBuf;
    flt.type = 'bandpass'; flt.frequency.value = filterFreq; flt.Q.value = q || 0.8;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt).connect(gain).connect(out);
    src.start(t0, Math.random() * 0.5, dur + 0.02);
  }
  /** Nốt tại thời điểm tuyệt đối t0 (nhạc nền xếp lịch trước vài chục ms). */
  function noteAt(t0, freq, dur, type, peak, out, freqTo) {
    var c = getCtx();
    var osc = c.createOscillator(), gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqTo) osc.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // ── Nhạc nền chờ (Gọi tên, Đấu trường): vòng hợp âm C – Am – F – G, càng về cuối càng nhanh ──
  // level 1 = vui nhộn (112 nhịp/phút) · 2 = hồi hộp (138, thêm trống) · 3 = nước rút (166, hi-hat dồn) · 0 = tắt
  var CHORDS = [[130.81, 164.81, 196.0, 261.63], [110.0, 130.81, 164.81, 220.0], [87.31, 110.0, 130.81, 174.61], [98.0, 123.47, 146.83, 196.0]];
  var ARP = [0, 2, 1, 3, 2, 1, 3, 2];
  var BPM = [0, 112, 138, 166];
  var mus = { level: 0, step: 0, next: 0, timer: 0, out: null };
  function musicTick() {
    var c = getCtx();
    if (!c || !mus.level) return;
    if (document.hidden) { mus.next = c.currentTime + 0.05; return; } // tab ẩn: dừng, quay lại thì chơi tiếp
    if (mus.next < c.currentTime) mus.next = c.currentTime + 0.03;
    var eighth = 30 / BPM[mus.level];
    while (mus.next < c.currentTime + 0.12) {
      var t = mus.next, st = mus.step, ch = CHORDS[Math.floor(st / 8) % 4], L = mus.level;
      if (!muted) {
        if (st % 4 === 0) noteAt(t, 120, 0.14, 'sine', 0.5, mus.out, 45);                       // trống trầm
        if (L >= 2 && st % 4 === 2) noiseAt(t, 0.09, 1800, 0.22, 0.9, mus.out);                // trống con
        noiseAt(t, 0.03, 8000, L >= 3 ? 0.11 : 0.07, 1.2, mus.out);                            // hi-hat
        if (L >= 3) noiseAt(t + eighth / 2, 0.025, 9000, 0.06, 1.2, mus.out);
        if (st % 8 === 0 || st % 8 === 3 || st % 8 === 6) noteAt(t, ch[0] / 2, eighth * 1.6, 'triangle', 0.32, mus.out); // bass nhún
        noteAt(t, ch[ARP[st % 8]] * (L >= 3 ? 4 : 2), eighth * 0.9, 'square', 0.045, mus.out);  // giai điệu rải
      }
      mus.next += eighth;
      mus.step = (st + 1) % 32;
    }
  }
  function music(level) {
    var c = getCtx();
    level = Math.max(0, Math.min(3, level | 0));
    if (!c || level === mus.level) return;
    if (!mus.out) { mus.out = c.createGain(); mus.out.gain.value = 0.35; mus.out.connect(c.destination); }
    if (!mus.level && level) { mus.step = 0; mus.next = c.currentTime + 0.05; clearInterval(mus.timer); mus.timer = setInterval(function () { try { musicTick(); } catch (e) { /* ignore */ } }, 30); }
    mus.level = level;
    if (!level) clearInterval(mus.timer);
  }

  var SOUNDS = {
    click:    function () { tone(520, 0.06, 'square', 0.08); },
    flip:     function () { tone(660, 0.07, 'triangle', 0.10); },
    correct:  function () { tone(660, 0.09, 'sine', 0.16); tone(880, 0.12, 'sine', 0.14, 0.07); },
    match:    function () { tone(740, 0.09, 'sine', 0.16); tone(988, 0.14, 'sine', 0.14, 0.06); },
    wrong:    function () { tone(220, 0.16, 'sawtooth', 0.14); tone(160, 0.2, 'sawtooth', 0.12, 0.09); },
    combo:    function () { sweep(500, 900, 0.18, 'triangle', 0.18); },
    critical: function () { sweep(400, 1200, 0.22, 'sawtooth', 0.2); tone(1200, 0.1, 'square', 0.1, 0.16); },
    win:      function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.16, i * 0.1); });
    },
    lose:     function () { sweep(500, 160, 0.5, 'sawtooth', 0.16); },
    // Kịch tính (Đấu trường, Gọi tên): đồng hồ tích tắc · tim đập 3 giây cuối · vụt chữ lớn · trống dồn · kèn công bố
    tick:      function () { tone(1250, 0.03, 'square', 0.06); },
    heartbeat: function () { tone(70, 0.13, 'sine', 0.32); tone(62, 0.16, 'sine', 0.26, 0.16); },
    whoosh:    function () { sweep(260, 1100, 0.22, 'sawtooth', 0.07); sweep(900, 300, 0.2, 'triangle', 0.06, 0.18); },
    drumroll:  function () { for (var i = 0; i < 18; i++) tone(170 + (i % 2) * 18, 0.05, 'triangle', 0.05 + i * 0.006, i * 0.06); },
    // Lễ hội (js/fx-party.js): pháo nổ · cả lớp vỗ tay · lấp lánh · nốt đếm 3-2-1 · "Đi!"
    boom:      function () { noise(0.5, 380, 0.22); sweep(140, 50, 0.4, 'sine', 0.2); noise(0.35, 2600, 0.05, 0.1, 0.5); },
    cheer:     function () { for (var i = 0; i < 26; i++) noise(0.05, 1500 + Math.random() * 1500, 0.06 + Math.random() * 0.05, i * 0.045 + Math.random() * 0.03, 1.4); },
    sparkle:   function () { [1568, 2093, 2637, 3136].forEach(function (f, i) { tone(f, 0.12, 'sine', 0.06, i * 0.05); }); },
    count:     function () { tone(660, 0.14, 'square', 0.09); tone(330, 0.14, 'triangle', 0.1); },
    go:        function () { tone(1046.5, 0.32, 'square', 0.1); tone(523.25, 0.32, 'triangle', 0.12); sweep(400, 1400, 0.25, 'sawtooth', 0.05); },
    fanfare:   function () {
      [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36], [783.99, 0.54], [1046.5, 0.66]].forEach(function (n) { tone(n[0], n[1] >= 0.54 ? 0.35 : 0.14, 'square', 0.09, n[1]); tone(n[0] / 2, 0.14, 'triangle', 0.08, n[1]); });
    },
  };

  function play(name) {
    try {
      var fn = SOUNDS[name];
      if (fn) fn();
    } catch (e) { /* im lặng — âm thanh chỉ là phụ, không được làm hỏng game */ }
  }

  function isMuted() { return muted; }
  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  function toggleMuted() { setMuted(!muted); return muted; }

  global.EduSFX = { play: play, music: music, isMuted: isMuted, setMuted: setMuted, toggleMuted: toggleMuted };
})(window);
