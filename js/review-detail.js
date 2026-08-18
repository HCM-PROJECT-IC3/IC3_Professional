/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   js/review-detail.js — MÀN HÌNH "XEM LẠI ĐÚNG/SAI" SAU KHI NỘP  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Tách riêng khỏi js/quiz-engine.js (không gộp chung) — chỉ phụ trách
 * dựng danh sách #reviewList ở màn #result: mỗi câu là 1 hàng, bấm vào
 * sẽ mở rộng (accordion) xem: câu hỏi đầy đủ, đáp án của học sinh,
 * đáp án đúng, và giải thích (q.explanation).
 *
 * Phụ thuộc: mảng `details` do gradeExam() trong quiz-engine.js tạo ra
 * (mỗi phần tử gồm { num, type, status, fullText, explanation, raw }).
 * Không đọc/ghi State trực tiếp — chỉ nhận dữ liệu qua tham số, để
 * module này có thể tái sử dụng / kiểm thử độc lập.
 */
'use strict';

/** Escape HTML để chèn text người dùng/đề bài an toàn vào innerHTML. */
function _rdEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * Dựng toàn bộ danh sách review (accordion) vào #reviewList.
 * Gọi từ showResult() trong quiz-engine.js sau khi chấm bài.
 */
function renderReviewList(details) {
  const el = document.getElementById('reviewList');
  if (!el) return;

  el.innerHTML = details.map(d => `
    <div class="review-item-wrap">
      <button type="button" class="review-item ${d.status}" onclick="toggleReviewDetail(${d.num})" aria-expanded="false">
        <span class="ri-num">${d.num}</span>
        <span class="ri-icon">${d.status === 'correct' ? '✓' : d.status === 'incorrect' ? '✗' : '–'}</span>
        <span class="ri-text">${_rdEsc(d.text)}</span>
        <span class="ri-caret">▾</span>
      </button>
      <div class="review-detail" id="rd-${d.num}" style="display:none;">
        ${_rdBuildDetailBody(d)}
      </div>
    </div>`).join('');
}

/** Mở/đóng phần chi tiết của 1 câu (accordion 1 câu/lần bấm — không đóng các câu khác). */
function toggleReviewDetail(num) {
  const panel = document.getElementById(`rd-${num}`);
  const btn   = panel?.previousElementSibling;
  if (!panel) return;
  const opening = panel.style.display === 'none';
  panel.style.display = opening ? 'block' : 'none';
  btn?.setAttribute('aria-expanded', String(opening));
  btn?.classList.toggle('open', opening);
}

/** Dựng phần nội dung chi tiết theo từng loại câu hỏi. */
function _rdBuildDetailBody(d) {
  const r = d.raw || {};
  let answerBlock = '';

  switch (d.type) {
    case 'single':
    case 'multi':
      answerBlock = _rdChoiceBlock(r);
      break;
    case 'truefalse':
      answerBlock = _rdTrueFalseBlock(r);
      break;
    case 'matching':
      answerBlock = _rdMatchingBlock(r);
      break;
    case 'hotspot':
      answerBlock = _rdHotspotBlock(r, d.imageUrl);
      break;
    case 'list':
      answerBlock = _rdListBlock(r);
      break;
    case 'classify':
      answerBlock = _rdClassifyBlock(r);
      break;
    case 'ordering':
      answerBlock = _rdOrderingBlock(r);
      break;
    case 'dragfill':
    case 'selectfill':
      answerBlock = _rdFillBlankBlock(r);
      break;
  }

  const explanation = d.explanation
    ? `<div class="rd-explain"><span class="rd-explain-icon">💡</span> ${_rdEsc(d.explanation)}</div>`
    : '';

  return `
    <div class="rd-question">${_rdEsc(d.fullText)}</div>
    ${answerBlock}
    ${explanation}
  `;
}

function _rdChoiceBlock(r) {
  const userArr = Array.isArray(r.userAns) ? r.userAns : (r.userAns != null ? [r.userAns] : []);
  const correctArr = r.correct || [];
  const opts = r.options || [];
  if (!opts.length) return '';

  return `
    <div class="rd-options">
      ${opts.map(opt => {
        const isCorrect = correctArr.includes(opt);
        const isPicked  = userArr.includes(opt);
        let cls = 'rd-opt';
        if (isCorrect) cls += ' rd-opt-correct';
        else if (isPicked) cls += ' rd-opt-wrong';
        return `<div class="${cls}">
          <span class="rd-opt-mark">${isCorrect ? '✓' : (isPicked ? '✗' : '')}</span>
          <span>${_rdEsc(opt)}</span>
          ${isPicked ? '<span class="rd-opt-tag">Bạn chọn</span>' : ''}
        </div>`;
      }).join('')}
    </div>`;
}

function _rdTrueFalseBlock(r) {
  const statements = r.statements || [];
  const ua = r.userTF || {};
  return `
    <div class="rd-tf-list">
      ${statements.map((st, j) => {
        const userVal = ua[j];
        const ok = userVal === st.answer;
        const userLabel = userVal === 'true' ? r.labelTrue : userVal === 'false' ? r.labelFalse : '(chưa chọn)';
        const correctLabel = st.answer === 'true' ? r.labelTrue : r.labelFalse;
        return `<div class="rd-tf-row ${ok ? 'rd-ok' : 'rd-bad'}">
          <span class="rd-tf-text">${_rdEsc(st.text)}</span>
          <span class="rd-tf-ans">
            ${ok ? '' : `<span class="rd-tf-user">${_rdEsc(userLabel)}</span> →`}
            <span class="rd-tf-correct">${_rdEsc(correctLabel)}</span>
          </span>
        </div>`;
      }).join('')}
    </div>`;
}

function _rdMatchingBlock(r) {
  const pairs = r.pairs || [];
  const um = r.userMatch || {};
  return `
    <div class="rd-match-list">
      ${pairs.map(p => {
        const userRight = um[p.left];
        const ok = userRight === p.right;
        return `<div class="rd-match-row ${ok ? 'rd-ok' : 'rd-bad'}">
          <span class="rd-match-left">${_rdEsc(p.left)}</span>
          <span class="rd-match-arrow">→</span>
          ${ok
            ? `<span class="rd-match-correct">${_rdEsc(p.right)}</span>`
            : `<span class="rd-match-user">${_rdEsc(userRight || '(chưa nối)')}</span>
               <span class="rd-match-correct">(đúng: ${_rdEsc(p.right)})</span>`}
        </div>`;
      }).join('')}
    </div>`;
}

function _rdListBlock(r) {
  const items = r.listItems || [];
  const ua = r.userList || {};
  return `
    <div class="rd-tf-list">
      ${items.map((it, j) => {
        const userVal = ua[j];
        const ok = userVal === it.correct;
        return `<div class="rd-tf-row ${ok ? 'rd-ok' : 'rd-bad'}">
          <span class="rd-tf-text">${_rdEsc(it.text)}</span>
          <span class="rd-tf-ans">
            ${ok ? '' : `<span class="rd-tf-user">${_rdEsc(userVal || '(chưa chọn)')}</span> →`}
            <span class="rd-tf-correct">${_rdEsc(it.correct)}</span>
          </span>
        </div>`;
      }).join('')}
    </div>`;
}

function _rdClassifyBlock(r) {
  const items = r.classifyItems || [];
  const ua = r.userClassify || {};
  return `
    <div class="rd-match-list">
      ${items.map(it => {
        const userZone = ua[it.text];
        const ok = userZone === it.zone;
        return `<div class="rd-match-row ${ok ? 'rd-ok' : 'rd-bad'}">
          <span class="rd-match-left">${_rdEsc(it.text)}</span>
          <span class="rd-match-arrow">→</span>
          ${ok
            ? `<span class="rd-match-correct">${_rdEsc(it.zone)}</span>`
            : `<span class="rd-match-user">${_rdEsc(userZone || '(chưa phân loại)')}</span>
               <span class="rd-match-correct">(đúng: ${_rdEsc(it.zone)})</span>`}
        </div>`;
      }).join('')}
    </div>`;
}

function _rdOrderingBlock(r) {
  const correctOrder = r.orderCorrect || [];
  const userOrder = r.orderUser || [];
  const ok = JSON.stringify(userOrder) === JSON.stringify(correctOrder);
  return `
    <div class="rd-ordering-cols">
      <div>
        <div class="rd-ordering-title">Thứ tự bạn chọn ${ok ? '✓' : '✗'}</div>
        ${userOrder.map((t, j) => `<div class="rd-ordering-row ${ok ? 'rd-ok' : 'rd-bad'}">${j + 1}. ${_rdEsc(t)}</div>`).join('')}
      </div>
      ${ok ? '' : `<div>
        <div class="rd-ordering-title">Thứ tự đúng</div>
        ${correctOrder.map((t, j) => `<div class="rd-ordering-row rd-ok">${j + 1}. ${_rdEsc(t)}</div>`).join('')}
      </div>`}
    </div>`;
}

function _rdFillBlankBlock(r) {
  const segments = r.segments || [];
  const blanks = r.blanks || [];
  const ua = r.userBlanks || {};
  const passage = segments.map((seg, i) => {
    if (i >= blanks.length) return _rdEsc(seg);
    const userVal = ua[i];
    const ok = userVal === blanks[i];
    const blankHtml = ok
      ? `<span class="rd-opt-mark" style="color:var(--accent5, #06d6a0);">${_rdEsc(blanks[i])}</span>`
      : `<span class="rd-match-user">${_rdEsc(userVal || '(bỏ trống)')}</span> <span class="rd-match-correct">(đúng: ${_rdEsc(blanks[i])})</span>`;
    return `${_rdEsc(seg)}${blankHtml}`;
  }).join('');
  return `<div class="rd-question" style="font-weight:500;">${passage}</div>`;
}

function _rdHotspotBlock(r, imageUrl) {
  const areas = r.areas || [];
  const userSet = new Set(r.userAreas || []);
  if (!imageUrl || !areas.length) return '';

  const boxes = areas.map(a => {
    const isCorrect = !!a.correct;
    const isPicked  = userSet.has(a.id);
    let cls = 'rd-hotspot-box';
    if (isCorrect) cls += ' rd-hotspot-correct';
    else if (isPicked) cls += ' rd-hotspot-wrong';
    return `<div class="${cls}" style="left:${a.x}%;top:${a.y}%;width:${a.w}%;height:${a.h}%;"></div>`;
  }).join('');

  return `
    <div class="rd-hotspot-wrap">
      <img src="${_rdEsc(imageUrl)}" alt="Hình minh họa" loading="lazy">
      ${boxes}
    </div>
    <div class="rd-hotspot-legend">
      <span><span class="rd-legend-dot rd-legend-correct"></span> Đáp án đúng</span>
      <span><span class="rd-legend-dot rd-legend-wrong"></span> Bạn đã bấm (sai)</span>
    </div>`;
}
