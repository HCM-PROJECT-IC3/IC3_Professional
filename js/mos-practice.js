/* ============================================================
   js/mos-practice.js — Bộ điều khiển trang mos-practice.html
   (chọn dự án → tải đề → nộp file → chấm bằng js/mos-grading-engine.js
   → lưu kết quả qua js/mos-submissions.js). Không có logic chấm điểm ở
   đây — chỉ nối UI với 2 module trên + js/lobby-roster.js (đã tự chạy
   độc lập, đổ 3 select Trường/Lớp/Họ và tên).
   ============================================================ */
(function () {
  'use strict';

  let currentProject = null;
  let isGrading = false;

  // ── Theme toggle (giống hệt pattern ở js/dashboard.js) ─────
  (function initTheme() {
    const saved = localStorage.getItem('ic3_theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ic3_theme', next);
    });
  })();

  // Mỗi "subject" (excel/powerpoint) dùng 1 engine + 1 cách nạp file khác
  // nhau (ExcelJS đọc model workbook trực tiếp; PowerPoint chưa có
  // thư viện đọc-model nên tự đọc XML bằng JSZip, xem
  // js/mos-grading-engine-pptx.js). Cả 2 engine trả về CÙNG hình dạng kết
  // quả nên renderResult() bên dưới dùng chung cho cả 2 môn.
  const SUBJECTS = {
    excel: {
      ext: '.xlsx',
      label: 'Excel',
      async grade(file, tasks) {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        return MosGradingEngine.gradeWorkbook(workbook, tasks);
      },
    },
    powerpoint: {
      ext: '.pptx',
      label: 'PowerPoint',
      async grade(file, tasks) {
        const buffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buffer);
        return MosGradingEnginePptx.gradePptx(zip, tasks);
      },
    },
  };

  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function getProjects() {
    return (window.MosTasks && window.MosTasks.projects) || [];
  }

  // ── Bước 2: danh sách dự án ─────────────────────────────────
  function renderProjectList() {
    const list = document.getElementById('mosProjectList');
    const projects = getProjects();
    if (!list) return;
    if (projects.length === 0) {
      list.innerHTML = `<p style="color:var(--muted)">Chưa có dự án nào — sẽ bổ sung thêm ở các phiên bản sau.</p>`;
      return;
    }
    list.innerHTML = projects.map(p => {
      const subj = SUBJECTS[p.subject];
      return `
      <div class="mos-project-item" data-id="${escHtml(p.id)}">
        <div>
          <div class="mos-project-item-title">${escHtml(p.title)}</div>
          <div class="mos-project-item-meta">${subj ? escHtml(subj.label) + ' · ' : ''}${p.tasks.length} task · ${escHtml(p.tietLabel)}</div>
        </div>
        <span class="mos-project-item-arrow">chọn →</span>
      </div>`;
    }).join('');
    list.querySelectorAll('.mos-project-item').forEach(el => {
      el.addEventListener('click', () => selectProject(el.dataset.id));
    });
  }

  function selectProject(id) {
    const projects = getProjects();
    currentProject = projects.find(p => p.id === id) || null;
    if (!currentProject) return;

    document.querySelectorAll('.mos-project-item').forEach(el => {
      el.classList.toggle('is-selected', el.dataset.id === id);
    });

    const subj = SUBJECTS[currentProject.subject];

    document.getElementById('mosProjectTitle').textContent = currentProject.title;
    document.getElementById('mosDownloadBtn').setAttribute('href', currentProject.starterFile);
    document.getElementById('mosDownloadBtn').setAttribute('download', currentProject.starterFile.split('/').pop());
    document.getElementById('mosDownloadBtn').textContent =
      `⬇️ Tải file đề bài${subj ? ' (' + subj.ext + ')' : ''}`;
    document.getElementById('mosUploadLabel').textContent =
      `📤 Chọn file ${subj ? subj.ext : ''} đã làm để nộp bài`;
    document.querySelectorAll('#mosSubjectName, #mosSubjectName2').forEach(el => {
      el.textContent = subj ? subj.label : 'Office';
    });

    renderTaskList(currentProject.tasks);

    document.getElementById('mosStep3').hidden = false;
    document.getElementById('mosStep4').hidden = true;
    document.getElementById('mosUploadStatus').textContent = '';
    document.getElementById('mosUploadStatus').className = 'mos-upload-status';
    document.getElementById('mosFileInput').value = '';
    document.getElementById('mosStep3').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderTaskList(tasks) {
    const el = document.getElementById('mosTaskList');
    el.innerHTML = tasks.map(t => `
      <div class="mos-task-item">
        <span class="mos-task-num">${t.id}.</span>
        <span>${escHtml(t.label)}</span>
      </div>
    `).join('');
  }

  // ── Bước 3: nộp file → chấm ─────────────────────────────────
  function currentStudent() {
    const school = document.getElementById('studentSchool')?.value || '';
    const className = document.getElementById('studentClass')?.value || '';
    const name = document.getElementById('studentName')?.value || '';
    return { school, className, name };
  }

  function setUploadStatus(msg, kind) {
    const el = document.getElementById('mosUploadStatus');
    el.textContent = msg;
    el.className = 'mos-upload-status' + (kind ? ' is-' + kind : '');
  }

  async function handleFileChosen(file) {
    if (!currentProject || isGrading) return;

    const student = currentStudent();
    if (!student.school || !student.className || !student.name) {
      setUploadStatus('⚠ Vui lòng chọn Trường / Lớp / Họ và tên ở Bước 1 trước khi nộp bài.', 'error');
      document.getElementById('mosFileInput').value = '';
      document.getElementById('mosStep1').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const subj = SUBJECTS[currentProject.subject];
    if (!subj) {
      setUploadStatus('⚠ Môn học của dự án này chưa được hỗ trợ.', 'error');
      return;
    }
    if (!file.name.toLowerCase().endsWith(subj.ext)) {
      setUploadStatus(`⚠ Chỉ chấp nhận file ${subj.ext} (đúng định dạng đề bài đã tải về).`, 'error');
      return;
    }

    isGrading = true;
    setUploadStatus('⏳ Đang đọc và chấm điểm file...', 'busy');

    let graded = null;
    try {
      graded = await subj.grade(file, currentProject.tasks);
      renderResult(graded);

      setUploadStatus('✅ Đã chấm xong — xem kết quả bên dưới.', '');
    } catch (err) {
      console.error('[MosPractice] Lỗi khi đọc/chấm file:', err);
      setUploadStatus(`❌ Không đọc được file — hãy chắc chắn đây đúng là file ${subj.ext} bạn đã lưu từ ${subj.label}. (` + err.message + ')', 'error');
    } finally {
      // QUAN TRỌNG: mở khoá isGrading NGAY SAU KHI chấm xong (không chờ lưu
      // Firestore) — nếu không, mạng chậm/Firestore treo sẽ khoá cứng nút nộp
      // bài, học sinh không nộp lại được dù đã chọn file mới (bug thật đã gặp
      // khi test: lưu Firestore bị chặn mạng → isGrading kẹt true mãi mãi →
      // lần nộp file thứ 2 trở đi bị handleFileChosen() bỏ qua trong im lặng).
      isGrading = false;
    }
    if (!graded) return;

    // Lưu kết quả CHẠY NỀN, không chặn học sinh thao tác tiếp — quiz_results
    // (js/firestore-results.js) cũng theo đúng nguyên tắc này: lưu báo cáo
    // không bao giờ được chặn trải nghiệm học sinh.
    window.saveMosSubmission({
      studentName: student.name,
      studentClass: student.className,
      studentSchool: student.school,
      projectId: currentProject.id,
      projectTitle: currentProject.title,
      ...graded,
    }).then(saveRes => {
      if (!saveRes.success) {
        console.warn('[MosPractice] Không lưu được kết quả lên Firestore:', saveRes.message);
      }
    });
  }

  // ── Bước 4: hiển thị kết quả ────────────────────────────────
  function renderResult(graded) {
    const summaryEl = document.getElementById('mosResultSummary');
    const listEl = document.getElementById('mosResultList');

    summaryEl.innerHTML = graded.autoTotal > 0
      ? `<span class="mos-result-score">${graded.score}%</span>
         <span class="mos-result-score-label">${graded.passedCount}/${graded.autoTotal} task tự động đúng
           ${graded.manualCount ? ` · +${graded.manualCount} task cần giáo viên xem thủ công` : ''}</span>`
      : `<span class="mos-result-score-label">Toàn bộ ${graded.manualCount} task của dự án này cần giáo viên xem thủ công — chưa có điểm tự động.</span>`;

    listEl.innerHTML = graded.results.map(r => {
      const cls = r.manual ? 'is-manual' : (r.passed ? 'is-pass' : 'is-fail');
      const icon = r.manual ? '👀' : (r.passed ? '✅' : '❌');
      return `
        <div class="mos-result-item ${cls}">
          <span class="mos-result-icon">${icon}</span>
          <div>
            <div>Task ${r.id}. ${escHtml(r.label)}</div>
            <div class="mos-result-note">${escHtml(r.note)}</div>
          </div>
        </div>`;
    }).join('');

    document.getElementById('mosStep4').hidden = false;
    document.getElementById('mosStep4').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Init ─────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    renderProjectList();
    document.getElementById('mosFileInput').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (file) handleFileChosen(file);
    });

    // Đến từ nút "MOS Practice" trong form chọn bài ở index.html
    // (?subject=excel|powerpoint) — tự chọn sẵn dự án đầu tiên đúng môn đó
    // thay vì bắt học sinh tự tìm lại trong danh sách (Bước 2).
    const wantedSubject = new URLSearchParams(location.search).get('subject');
    if (wantedSubject) {
      const match = getProjects().find(p => p.subject === wantedSubject);
      if (match) selectProject(match.id);
    }
  });
})();
