/* ════════════════════════════════════════════════════════════
   js/computer-simulator.js — Mini-game "Computer Simulator" (mục 11
   yêu cầu gốc). Học sinh thao tác trên 1 "máy tính ảo" (cây thư mục
   mô phỏng) để hoàn thành nhiệm vụ: Tạo thư mục, Đổi tên, Di chuyển,
   Sao chép, Xoá, Tìm kiếm file — đúng các kỹ năng "File Management"
   thuộc chủ đề IC3 "1. Căn bản về công nghệ" / "3. Quản lý thông tin".

   PHẠM VI PHASE 8 (có chủ đích, không code hết cùng lúc): chỉ 6 thao
   tác quản lý TỆP TIN mà spec liệt kê (Create Folder/Rename/Move/Copy/
   Delete/Search) — đây cũng chính là VÍ DỤ MISSION mẫu trong yêu cầu
   gốc (IC3 → Level 1 → Documents/Images). 4 thao tác còn lại
   (Download/Upload/Open Browser/Email/Password management) cần mô
   phỏng ứng dụng khác hẳn (trình duyệt/hộp thư) — để lại cho 1 phase
   mở rộng sau, không ép vào chung 1 file.

   Kiến trúc chia 2 lớp rõ ràng:
   - FS: các hàm THUẦN (pure) thao tác trên cây thư mục trong bộ nhớ —
     không đụng DOM, test độc lập được bằng Node thường (xem cách file
     này được require trong môi trường test).
   - UI: state + render + event handler, chỉ gọi vào FS, không tự ý
     thao tác trực tiếp lên cây.
   ════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // LỚP FS — thao tác cây thư mục thuần, không phụ thuộc DOM.
  // ────────────────────────────────────────────────────────────
  var FS = {};
  var _idCounter = 1;
  function _nextId() { return 'n' + (_idCounter++); }

  FS.folder = function (name, children) {
    return { id: _nextId(), name: name, type: 'folder', children: children || [] };
  };
  FS.file = function (name) {
    return { id: _nextId(), name: name, type: 'file' };
  };

  /** Nhân bản sâu 1 node, sinh id MỚI cho toàn bộ cây con (dùng khi Sao chép). */
  FS.cloneDeep = function (node) {
    var copy = { id: _nextId(), name: node.name, type: node.type };
    if (node.type === 'folder') copy.children = node.children.map(FS.cloneDeep);
    return copy;
  };

  FS.findById = function (root, id) {
    if (root.id === id) return root;
    if (root.type !== 'folder') return null;
    for (var i = 0; i < root.children.length; i++) {
      var found = FS.findById(root.children[i], id);
      if (found) return found;
    }
    return null;
  };

  /** Tìm node cha trực tiếp chứa node có id cho trước (null nếu id là root hoặc không tìm thấy). */
  FS.findParentOf = function (root, id) {
    if (root.type !== 'folder') return null;
    for (var i = 0; i < root.children.length; i++) {
      if (root.children[i].id === id) return root;
      var found = FS.findParentOf(root.children[i], id);
      if (found) return found;
    }
    return null;
  };

  FS.findChildByName = function (folderNode, name) {
    if (!folderNode || folderNode.type !== 'folder') return null;
    for (var i = 0; i < folderNode.children.length; i++) {
      if (folderNode.children[i].name === name) return folderNode.children[i];
    }
    return null;
  };

  /** Đi theo 1 đường dẫn tên thư mục từ root (vd. ['IC3','Level 1']) → trả node cuối hoặc null. */
  FS.findByPath = function (root, pathNames) {
    var cur = root;
    for (var i = 0; i < pathNames.length; i++) {
      cur = FS.findChildByName(cur, pathNames[i]);
      if (!cur) return null;
    }
    return cur;
  };

  /** true nếu node `id` nằm trong (hoặc chính là) cây con của `node` — dùng để chặn Di chuyển 1 thư mục vào chính nó/con cháu nó. */
  FS._containsId = function (node, id) {
    if (!node || !node.id) return false;
    if (node.id === id) return true;
    if (node.type !== 'folder') return false;
    for (var i = 0; i < node.children.length; i++) {
      if (FS._containsId(node.children[i], id)) return true;
    }
    return false;
  };

  FS.removeNode = function (root, id) {
    var parent = FS.findParentOf(root, id);
    if (!parent) return false;
    var idx = parent.children.findIndex(function (c) { return c.id === id; });
    if (idx === -1) return false;
    parent.children.splice(idx, 1);
    return true;
  };

  FS.addChild = function (folderNode, node) {
    folderNode.children.push(node);
  };

  FS.renameNode = function (node, newName) {
    node.name = newName;
  };

  /** Tìm tất cả node (file+folder) có tên khớp 1 phần, không phân biệt hoa/thường — trả kèm đường dẫn hiển thị. Root ảo ("Máy tính của tôi") không bao giờ được tính là kết quả — chỉ tìm trong `root.children` trở xuống. */
  FS.searchAll = function (root, query) {
    var q = (query || '').trim().toLowerCase();
    var results = [];
    if (!q) return results;
    function walk(node, path) {
      if (node.name.toLowerCase().indexOf(q) !== -1) {
        results.push({ node: node, path: path.length ? path.join(' / ') : '/' });
      }
      if (node.type === 'folder') {
        node.children.forEach(function (child) { walk(child, path.concat([node.name])); });
      }
    }
    root.children.forEach(function (child) { walk(child, []); });
    return results;
  };

  // ────────────────────────────────────────────────────────────
  // 5 NHIỆM VỤ — mỗi nhiệm vụ tự dựng cây ban đầu + tự kiểm tra kết
  // quả bằng hàm `check(root)` RIÊNG (không dùng 1 thuật toán so
  // sánh cây cứng nhắc chung, vì tiêu chí đúng/sai của mỗi nhiệm vụ
  // khác nhau — có nhiệm vụ cần "còn tồn tại", có nhiệm vụ cần
  // "không còn tồn tại nữa").
  // ────────────────────────────────────────────────────────────
  function buildInitial1() {
    return FS.folder('Máy tính của tôi', [
      FS.file('Ghi_chu.txt'),
      FS.folder('Anh', []),
    ]);
  }
  function buildInitial2() {
    return FS.folder('Máy tính của tôi', [
      FS.file('Ghi_chu.txt'),
    ]);
  }
  function buildInitial3() {
    return FS.folder('Máy tính của tôi', [
      FS.file('BaoCao(1).docx'),
      FS.file('Anh_bia.png'),
      FS.folder('Documents', []),
    ]);
  }
  function buildInitial4() {
    return FS.folder('Máy tính của tôi', [
      FS.folder('Images', [FS.file('Logo_Truong.png')]),
      FS.folder('Backup', []),
    ]);
  }
  function buildInitial5() {
    return FS.folder('Máy tính của tôi', [
      FS.file('notes.txt'),
      FS.file('temp1.tmp'),
      FS.file('temp2.tmp'),
      FS.file('cache.tmp'),
      FS.folder('Documents', []),
    ]);
  }

  var MISSIONS = [
    {
      id: 'mission-1',
      title: 'Tạo thư mục bài tập',
      instruction: 'Tạo 1 thư mục mới tên chính xác "Bai_Tap" ngay trong "Máy tính của tôi" (thư mục gốc).',
      buildInitial: buildInitial1,
      check: function (root) {
        var f = FS.findChildByName(root, 'Bai_Tap');
        if (!f) return { passed: false, message: 'Chưa tìm thấy thư mục "Bai_Tap" ở thư mục gốc.' };
        if (f.type !== 'folder') return { passed: false, message: '"Bai_Tap" phải là 1 THƯ MỤC, không phải file.' };
        return { passed: true, message: 'Chính xác! Đã tạo đúng thư mục "Bai_Tap".' };
      },
    },
    {
      id: 'mission-2',
      title: 'Tạo cấu trúc thư mục lồng nhau',
      instruction: 'Tạo cấu trúc: IC3 → Level 1 → (2 thư mục con: Documents và Images).',
      buildInitial: buildInitial2,
      check: function (root) {
        var ic3 = FS.findChildByName(root, 'IC3');
        if (!ic3 || ic3.type !== 'folder') return { passed: false, message: 'Chưa có thư mục "IC3" ở gốc.' };
        var level1 = FS.findChildByName(ic3, 'Level 1');
        if (!level1 || level1.type !== 'folder') return { passed: false, message: 'Trong "IC3" chưa có thư mục con "Level 1".' };
        var docs = FS.findChildByName(level1, 'Documents');
        var imgs = FS.findChildByName(level1, 'Images');
        if (!docs || docs.type !== 'folder') return { passed: false, message: 'Trong "Level 1" chưa có thư mục con "Documents".' };
        if (!imgs || imgs.type !== 'folder') return { passed: false, message: 'Trong "Level 1" chưa có thư mục con "Images".' };
        return { passed: true, message: 'Chính xác! Cấu trúc IC3 → Level 1 → (Documents, Images) đã đúng.' };
      },
    },
    {
      id: 'mission-3',
      title: 'Đổi tên và sắp xếp file',
      instruction: 'Đổi tên file "BaoCao(1).docx" thành "BaoCao_Cuoi_Ky.docx", sau đó DI CHUYỂN file đó vào thư mục "Documents".',
      buildInitial: buildInitial3,
      check: function (root) {
        var stillOld = FS.findChildByName(root, 'BaoCao(1).docx');
        if (stillOld) return { passed: false, message: 'File "BaoCao(1).docx" (tên cũ) vẫn còn ở thư mục gốc — cần đổi tên rồi di chuyển hẳn đi.' };
        var docs = FS.findChildByName(root, 'Documents');
        if (!docs || docs.type !== 'folder') return { passed: false, message: 'Thiếu thư mục "Documents" ở gốc.' };
        var renamed = FS.findChildByName(docs, 'BaoCao_Cuoi_Ky.docx');
        if (!renamed) return { passed: false, message: 'Chưa thấy file "BaoCao_Cuoi_Ky.docx" trong thư mục "Documents".' };
        var pic = FS.findChildByName(root, 'Anh_bia.png');
        if (!pic) return { passed: false, message: '"Anh_bia.png" không được di chuyển/xoá khỏi thư mục gốc.' };
        return { passed: true, message: 'Chính xác! Đã đổi tên và di chuyển đúng file vào Documents.' };
      },
    },
    {
      id: 'mission-4',
      title: 'Sao lưu ảnh quan trọng',
      instruction: 'SAO CHÉP file "Logo_Truong.png" từ thư mục "Images" sang thư mục "Backup" (giữ nguyên bản gốc trong Images).',
      buildInitial: buildInitial4,
      check: function (root) {
        var images = FS.findChildByName(root, 'Images');
        var backup = FS.findChildByName(root, 'Backup');
        if (!images || !backup) return { passed: false, message: 'Thiếu thư mục "Images" hoặc "Backup" ở gốc.' };
        var origStillThere = FS.findChildByName(images, 'Logo_Truong.png');
        if (!origStillThere) return { passed: false, message: 'Bản gốc "Logo_Truong.png" trong "Images" đã biến mất — đây phải là SAO CHÉP (giữ bản gốc), không phải di chuyển.' };
        var copyThere = FS.findChildByName(backup, 'Logo_Truong.png');
        if (!copyThere) return { passed: false, message: 'Chưa thấy "Logo_Truong.png" trong thư mục "Backup".' };
        return { passed: true, message: 'Chính xác! Đã sao chép đúng, giữ nguyên bản gốc trong Images.' };
      },
    },
    {
      id: 'mission-5',
      title: 'Dọn dẹp file rác',
      instruction: 'Dùng công cụ Tìm kiếm để tìm tất cả file có đuôi ".tmp", sau đó XOÁ toàn bộ chúng. Giữ lại "notes.txt" và thư mục "Documents".',
      buildInitial: buildInitial5,
      check: function (root) {
        var stillHasTmp = root.children.some(function (c) { return c.type === 'file' && /\.tmp$/i.test(c.name); });
        if (stillHasTmp) return { passed: false, message: 'Vẫn còn ít nhất 1 file ".tmp" chưa được xoá.' };
        var notes = FS.findChildByName(root, 'notes.txt');
        if (!notes) return { passed: false, message: '"notes.txt" đã bị xoá nhầm — chỉ được xoá file ".tmp".' };
        var docs = FS.findChildByName(root, 'Documents');
        if (!docs) return { passed: false, message: 'Thư mục "Documents" đã bị xoá nhầm — chỉ được xoá file ".tmp".' };
        return { passed: true, message: 'Chính xác! Đã dọn sạch toàn bộ file rác, không xoá nhầm gì khác.' };
      },
    },
  ];

  global.EduComputerSim = global.EduComputerSim || {};
  global.EduComputerSim.FS = FS;
  global.EduComputerSim.MISSIONS = MISSIONS;

  // ────────────────────────────────────────────────────────────
  // LỚP UI — chỉ chạy khi có DOM thật (trang cyber-detective kiểu
  // mẫu, bọc điều kiện để phần FS/MISSIONS ở trên vẫn require được
  // trong môi trường test không có `document`).
  // ────────────────────────────────────────────────────────────
  if (typeof document === 'undefined') return;

  var state = {
    root: null,
    currentFolderId: null,
    selectedId: null,
    mission: null,
    creatingFolder: false,
    renamingId: null,
    pendingAction: null, // 'move' | 'copy' — đang mở overlay chọn thư mục đích
    submitted: false,
    sessionStartedAtMs: 0,
    mistakeCount: 0,
  };

  var el = {};
  function qs(id) { return document.getElementById(id); }

  function cacheEls() {
    el.missionTitle = qs('csMissionTitle');
    el.missionInstruction = qs('csMissionInstruction');
    el.restartBtn = qs('csRestartBtn');
    el.breadcrumb = qs('csBreadcrumb');
    el.content = qs('csContent');
    el.newFolderBtn = qs('csNewFolderBtn');
    el.renameBtn = qs('csRenameBtn');
    el.moveBtn = qs('csMoveBtn');
    el.copyBtn = qs('csCopyBtn');
    el.deleteBtn = qs('csDeleteBtn');
    el.searchInput = qs('csSearchInput');
    el.searchResults = qs('csSearchResults');
    el.checkBtn = qs('csCheckBtn');
    el.feedback = qs('csFeedback');
    el.missionOverlay = qs('csMissionOverlay');
    el.missionList = qs('csMissionList');
    el.pickerOverlay = qs('csPickerOverlay');
    el.pickerTree = qs('csPickerTree');
    el.pickerConfirmBtn = qs('csPickerConfirmBtn');
    el.pickerTitle = qs('csPickerTitle');
    el.resultOverlay = qs('csResultOverlay');
    el.resultIcon = qs('csResultIcon');
    el.resultTitle = qs('csResultTitle');
    el.resultDesc = qs('csResultDesc');
    el.nextMissionBtn = qs('csNextMissionBtn');
  }

  function buildMissionOverlay() {
    el.missionList.innerHTML = '';
    MISSIONS.forEach(function (m) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cs-mission-btn';
      btn.textContent = '💻 ' + m.title;
      btn.addEventListener('click', function () { startMission(m); });
      el.missionList.appendChild(btn);
    });
  }

  function startMission(missionDef) {
    state.mission = missionDef;
    state.root = missionDef.buildInitial();
    state.currentFolderId = state.root.id;
    state.selectedId = null;
    state.submitted = false;
    state.mistakeCount = 0;
    state.sessionStartedAtMs = Date.now();

    el.missionOverlay.hidden = true;
    el.resultOverlay.hidden = true;
    el.missionTitle.textContent = missionDef.title;
    el.missionInstruction.textContent = missionDef.instruction;
    el.feedback.textContent = '';
    el.searchInput.value = '';
    el.searchResults.innerHTML = '';
    render();
  }

  function currentFolder() { return FS.findById(state.root, state.currentFolderId); }

  function render() {
    renderBreadcrumb();
    renderContent();
    updateToolbarState();
  }

  function pathToFolder(id) {
    // Trả mảng node từ root tới id (bao gồm cả 2 đầu).
    var chain = [];
    function walk(node, targetId, acc) {
      var next = acc.concat([node]);
      if (node.id === targetId) { chain = next; return true; }
      if (node.type !== 'folder') return false;
      for (var i = 0; i < node.children.length; i++) {
        if (walk(node.children[i], targetId, next)) return true;
      }
      return false;
    }
    walk(state.root, id, []);
    return chain;
  }

  function renderBreadcrumb() {
    var chain = pathToFolder(state.currentFolderId);
    el.breadcrumb.innerHTML = '';
    chain.forEach(function (node, idx) {
      var span = document.createElement('span');
      span.className = 'cs-breadcrumb-item';
      span.textContent = node.name;
      span.addEventListener('click', function () { state.currentFolderId = node.id; state.selectedId = null; render(); });
      el.breadcrumb.appendChild(span);
      if (idx < chain.length - 1) {
        var sep = document.createElement('span');
        sep.className = 'cs-breadcrumb-sep';
        sep.textContent = '›';
        el.breadcrumb.appendChild(sep);
      }
    });
  }

  function renderContent() {
    var folder = currentFolder();
    el.content.innerHTML = '';
    folder.children.slice().sort(function (a, b) {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'vi');
    }).forEach(function (node) {
      el.content.appendChild(renderItem(node));
    });

    if (state.creatingFolder) {
      el.content.appendChild(renderNewFolderInput());
    }
  }

  function renderItem(node) {
    var item = document.createElement('div');
    item.className = 'cs-item' + (node.id === state.selectedId ? ' is-selected' : '');
    item.dataset.id = node.id;

    if (state.renamingId === node.id) {
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'cs-rename-input';
      input.value = node.name;
      item.innerHTML = '<div class="cs-item-icon">' + (node.type === 'folder' ? '📁' : '📄') + '</div>';
      item.appendChild(input);
      setTimeout(function () { input.focus(); input.select(); }, 0);
      function confirmRename() {
        var val = input.value.trim();
        if (val) FS.renameNode(node, val);
        state.renamingId = null;
        render();
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') confirmRename();
        if (e.key === 'Escape') { state.renamingId = null; render(); }
      });
      input.addEventListener('blur', confirmRename);
      return item;
    }

    item.innerHTML =
      '<div class="cs-item-icon">' + (node.type === 'folder' ? '📁' : '📄') + '</div>' +
      '<div class="cs-item-name">' + escapeHtml(node.name) + '</div>';
    item.addEventListener('click', function () { state.selectedId = node.id; render(); });
    if (node.type === 'folder') {
      item.addEventListener('dblclick', function () {
        state.currentFolderId = node.id;
        state.selectedId = null;
        render();
      });
    }
    return item;
  }

  function renderNewFolderInput() {
    var item = document.createElement('div');
    item.className = 'cs-item is-editing';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'cs-rename-input';
    input.value = 'Thư mục mới';
    item.innerHTML = '<div class="cs-item-icon">📁</div>';
    item.appendChild(input);
    setTimeout(function () { input.focus(); input.select(); }, 0);
    function confirmCreate() {
      var val = input.value.trim();
      state.creatingFolder = false;
      if (val) {
        FS.addChild(currentFolder(), FS.folder(val, []));
      }
      render();
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') confirmCreate();
      if (e.key === 'Escape') { state.creatingFolder = false; render(); }
    });
    input.addEventListener('blur', confirmCreate);
    return item;
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function updateToolbarState() {
    var hasSelection = !!state.selectedId;
    el.renameBtn.disabled = !hasSelection;
    el.moveBtn.disabled = !hasSelection;
    el.copyBtn.disabled = !hasSelection;
    el.deleteBtn.disabled = !hasSelection;
  }

  // ── Toolbar actions ──

  function onNewFolder() {
    state.creatingFolder = true;
    render();
  }
  function onRename() {
    if (!state.selectedId) return;
    state.renamingId = state.selectedId;
    render();
  }
  function onDelete() {
    if (!state.selectedId) return;
    FS.removeNode(state.root, state.selectedId);
    state.selectedId = null;
    render();
  }
  function onMove() { openPicker('move'); }
  function onCopy() { openPicker('copy'); }

  function openPicker(action) {
    if (!state.selectedId) return;
    state.pendingAction = action;
    el.pickerTitle.textContent = action === 'move' ? 'Chọn thư mục ĐÍCH để DI CHUYỂN đến' : 'Chọn thư mục ĐÍCH để SAO CHÉP đến';
    el.pickerTree.innerHTML = '';
    el.pickerTree.dataset.chosenId = '';
    buildPickerTree(state.root, el.pickerTree, 0);
    el.pickerConfirmBtn.disabled = true;
    el.pickerOverlay.hidden = false;
  }

  function buildPickerTree(node, container, depth) {
    if (node.type !== 'folder') return;
    // Không cho chọn chính node đang di chuyển hoặc con cháu của nó (chống vòng lặp vô hạn).
    var forbidden = state.pendingAction === 'move' && FS._containsId(FS.findById(state.root, state.selectedId) || {}, node.id);
    var row = document.createElement('div');
    row.className = 'cs-picker-row' + (forbidden ? ' is-disabled' : '');
    row.style.paddingLeft = (depth * 16) + 'px';
    row.textContent = '📁 ' + node.name;
    if (!forbidden) {
      row.addEventListener('click', function () {
        container.querySelectorAll('.cs-picker-row').forEach(function (r) { r.classList.remove('is-chosen'); });
        row.classList.add('is-chosen');
        container.dataset.chosenId = node.id;
        el.pickerConfirmBtn.disabled = false;
      });
    }
    container.appendChild(row);
    node.children.forEach(function (child) { buildPickerTree(child, container, depth + 1); });
  }

  function confirmPicker() {
    var targetId = el.pickerTree.dataset.chosenId;
    if (!targetId) return;
    var targetFolder = FS.findById(state.root, targetId);
    var sourceNode = FS.findById(state.root, state.selectedId);
    if (state.pendingAction === 'move') {
      FS.removeNode(state.root, state.selectedId);
      FS.addChild(targetFolder, sourceNode);
    } else if (state.pendingAction === 'copy') {
      FS.addChild(targetFolder, FS.cloneDeep(sourceNode));
    }
    el.pickerOverlay.hidden = true;
    state.pendingAction = null;
    render();
  }

  // ── Search ──
  function onSearchInput() {
    var q = el.searchInput.value;
    el.searchResults.innerHTML = '';
    if (!q.trim()) return;
    var results = FS.searchAll(state.root, q);
    if (!results.length) {
      var empty = document.createElement('div');
      empty.className = 'cs-search-empty';
      empty.textContent = 'Không tìm thấy kết quả nào.';
      el.searchResults.appendChild(empty);
      return;
    }
    results.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'cs-search-row';
      row.innerHTML =
        '<span class="cs-search-icon">' + (r.node.type === 'folder' ? '📁' : '📄') + '</span>' +
        '<span class="cs-search-name">' + escapeHtml(r.node.name) + '</span>' +
        '<span class="cs-search-path">' + escapeHtml(r.path || '/') + '</span>' +
        '<button type="button" class="cs-search-del-btn" title="Xoá mục này">🗑️</button>';
      row.querySelector('.cs-search-del-btn').addEventListener('click', function () {
        FS.removeNode(state.root, r.node.id);
        if (state.selectedId === r.node.id) state.selectedId = null;
        onSearchInput(); // làm mới danh sách kết quả sau khi xoá
        render();
      });
      el.searchResults.appendChild(row);
    });
  }

  // ── Kiểm tra kết quả nhiệm vụ ──
  function onCheck() {
    if (state.submitted) return;
    var result = state.mission.check(state.root);
    if (result.passed) {
      state.submitted = true;
      finishMission(true);
    } else {
      state.mistakeCount += 1;
      el.feedback.textContent = '❌ ' + result.message;
      el.feedback.className = 'cs-feedback is-wrong';
    }
  }

  function finishMission(success) {
    // Điểm: 100 nếu không mắc lỗi kiểm tra nào (nộp đúng ngay lần đầu),
    // trừ dần theo số lần kiểm tra sai (khuyến khích đọc kỹ nhiệm vụ
    // trước khi nộp, không phải bấm "Kiểm tra" liên tục để dò).
    var scorePct = Math.max(40, 100 - state.mistakeCount * 15);
    el.resultIcon.textContent = '🏆';
    el.resultTitle.textContent = 'Hoàn thành nhiệm vụ!';
    el.resultDesc.textContent =
      state.mission.check(state.root).message + '\n' +
      'Số lần kiểm tra chưa đúng: ' + state.mistakeCount + '\n' +
      'Điểm: ' + scorePct;
    el.resultOverlay.hidden = false;
    recordSessionIfPossible(scorePct);
  }

  /**
   * (Phase 3/4/6/7/8) Ghi 1 lượt chơi vào js/gamification.js §
   * recordGameSession — cùng pattern các mini-game trước. Im lặng bỏ
   * qua nếu thiếu EduGamification hoặc chưa chọn học sinh nào.
   */
  function recordSessionIfPossible(scorePct) {
    try {
      if (typeof EduGamification === 'undefined' || !EduGamification.recordGameSession) return;
      var student = null;
      try { student = JSON.parse(localStorage.getItem('eduquiz_current_student') || 'null'); }
      catch (e) { student = null; }
      if (!student || !student.name || !student.class) return;

      EduGamification.recordGameSession('computer-simulator', {
        score: scorePct,
        scoreType: 'percent',
        accuracy: scorePct,
        correctAnswers: 1,
        wrongAnswers: state.mistakeCount,
        topic: '1. Căn bản về công nghệ',
        difficulty: null,
        durationSec: Math.max(0, Math.round((Date.now() - state.sessionStartedAtMs) / 1000)),
        studentName: student.name,
        studentClass: student.class,
        studentSchool: student.school || '',
      });
    } catch (e) { /* ghi XP là phụ — không được làm hỏng màn kết quả */ }
  }

  function init() {
    cacheEls();
    buildMissionOverlay();

    el.newFolderBtn.addEventListener('click', onNewFolder);
    el.renameBtn.addEventListener('click', onRename);
    el.moveBtn.addEventListener('click', onMove);
    el.copyBtn.addEventListener('click', onCopy);
    el.deleteBtn.addEventListener('click', onDelete);
    el.searchInput.addEventListener('input', onSearchInput);
    el.checkBtn.addEventListener('click', onCheck);
    el.pickerConfirmBtn.addEventListener('click', confirmPicker);
    document.getElementById('csPickerCancelBtn').addEventListener('click', function () {
      el.pickerOverlay.hidden = true;
      state.pendingAction = null;
    });

    el.restartBtn.addEventListener('click', function () {
      el.resultOverlay.hidden = true;
      el.missionOverlay.hidden = false;
    });
    el.nextMissionBtn.addEventListener('click', function () {
      el.resultOverlay.hidden = true;
      el.missionOverlay.hidden = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : global);
