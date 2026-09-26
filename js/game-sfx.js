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

  global.EduSFX = { play: play, isMuted: isMuted, setMuted: setMuted, toggleMuted: toggleMuted };
})(window);
