/* ============================================================
   js/minigame-arena-bridge.js — cầu nối mini-game ↔ Đấu trường.
   Mỗi trang mini-game (memory-game.html, battle-quiz.html...) nạp file này SAU
   game-sfx.js + gamification.js và TRƯỚC script của trò. Chỉ bật khi trang được
   Đấu trường mở trong iframe (…html?arena=1, cùng nguồn); mở bình thường thì
   EduMiniArena.live()/evt() chỉ là hàm rỗng.

   Khi bật, gửi cho trang cha (postMessage, cùng origin — không mạng):
     { src:'edu-mini', t:'ready' }                      trang đã nạp
     { src:'edu-mini', t:'evt', name }                  mỗi lần trò phát âm thanh (correct/wrong/combo/match...)
     { src:'edu-mini', t:'live', score }                điểm trực tiếp (trò tự gọi EduMiniArena.live)
     { src:'edu-mini', t:'result', game, session }      kết thúc ván (bọc EduGamification.recordGameSession)
   Thẻ XP của gamification.js bị tắt trong Đấu trường (Đấu trường có màn kết quả riêng) — XP vẫn cộng.
   ============================================================ */
(function (global) {
  'use strict';

  var on = false;
  try { on = /[?&]arena=1(&|$)/.test(global.location.search) && global.parent !== global && !!global.parent.document; } catch (e) { on = false; }
  var api = { on: on, live: function () {}, evt: function () {} };
  global.EduMiniArena = api;
  if (!on) return;

  function post(msg) {
    msg.src = 'edu-mini';
    try { global.parent.postMessage(msg, global.location.origin); } catch (e) { /* trang cha đã đóng */ }
  }
  api.live = function (score) { post({ t: 'live', score: Number(score) || 0 }); };
  api.evt = function (name) { post({ t: 'evt', name: String(name || '') }); };

  if (global.EduSFX && typeof global.EduSFX.play === 'function') {
    var play = global.EduSFX.play;
    global.EduSFX.play = function (name) { api.evt(name); return play.apply(this, arguments); };
  }
  var G = global.EduGamification;
  if (G && typeof G.recordGameSession === 'function') {
    var record = G.recordGameSession;
    G.recordGameSession = function (gameId, session) {
      var s = {};
      for (var k in session) if (Object.prototype.hasOwnProperty.call(session, k)) s[k] = session[k];
      s.showReward = false;
      var out = record.call(this, gameId, s);
      try { post({ t: 'result', game: String(gameId), session: JSON.parse(JSON.stringify(s)) }); } catch (e) { /* ignore */ }
      return out;
    };
  }
  document.documentElement.classList.add('in-arena');
  post({ t: 'ready' });
})(window);
