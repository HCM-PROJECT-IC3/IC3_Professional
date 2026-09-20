/* ════════════════════════════════════════════════════════════
   js/ppt-engine/slide-model.js — MOS Exam Simulator (PowerPoint)

   Slide Object Model THẬT — Validator đọc state này (vị trí/kích
   thước/xoay/lớp/định dạng từng object) để chấm bài. Cấu trúc:

   Presentation {
     slides: [Slide],
     theme, transitions default,
     activeSlideIndex
   }
   Slide { id, layout, theme, transition, objects: [SlideObject], background }
   SlideObject { id, type, text?, src?, position:{x,y}, size:{width,height},
                 rotation, zIndex, style, groupId? }
   ════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  if (root) {
    root.PptEngine = root.PptEngine || {};
    root.PptEngine.SlideModel = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function () {
  'use strict';

  var uidCounter = 0;
  function uid(prefix) { return prefix + (++uidCounter); }

  function createPresentation() {
    return {
      slides: [createSlide('Title Slide')],
      theme: 'Office',
      activeSlideIndex: 0,
      presentationMode: false
    };
  }

  function createSlide(layout) {
    return {
      id: uid('slide'),
      layout: layout || 'Title and Content',
      transition: { type: 'none', duration: 0 },
      background: { fillColor: '#FFFFFF' },
      objects: [],
      notes: ''
    };
  }

  function addSlide(pres, atIndex, layout) {
    var slide = createSlide(layout);
    var idx = atIndex == null ? pres.slides.length : atIndex;
    pres.slides.splice(idx, 0, slide);
    return slide;
  }
  function deleteSlide(pres, index) {
    if (pres.slides.length <= 1) throw new Error('Presentation must keep at least 1 slide');
    pres.slides.splice(index, 1);
    if (pres.activeSlideIndex >= pres.slides.length) pres.activeSlideIndex = pres.slides.length - 1;
  }
  function setSlideLayout(pres, index, layout) { pres.slides[index].layout = layout; }
  function setSlideTransition(pres, index, transition) { Object.assign(pres.slides[index].transition, transition); }
  function setTheme(pres, theme) { pres.theme = theme; }

  function nextZIndex(slide) {
    return slide.objects.reduce(function (max, o) { return Math.max(max, o.zIndex); }, 0) + 1;
  }

  function addObject(slide, def) {
    var obj = Object.assign({
      id: uid('obj'),
      type: 'text',
      text: '',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 50 },
      rotation: 0,
      zIndex: nextZIndex(slide),
      style: {},
      groupId: null
    }, def);
    slide.objects.push(obj);
    return obj;
  }
  function addTextBox(slide, text, position, size) {
    return addObject(slide, { type: 'text', text: text, position: position, size: size });
  }
  function addImage(slide, src, position, size) {
    return addObject(slide, { type: 'image', src: src, position: position, size: size });
  }
  function addShape(slide, shapeType, position, size, style) {
    return addObject(slide, { type: 'shape', shapeType: shapeType, position: position, size: size, style: style || {} });
  }
  function addTable(slide, rows, cols, position, size) {
    var cells = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) row.push('');
      cells.push(row);
    }
    return addObject(slide, { type: 'table', rows: rows, cols: cols, cells: cells, position: position, size: size });
  }
  function addChart(slide, chartType, dataRange, position, size) {
    return addObject(slide, { type: 'chart', chartType: chartType, dataRange: dataRange, position: position, size: size });
  }
  function deleteObject(slide, objectId) {
    slide.objects = slide.objects.filter(function (o) { return o.id !== objectId; });
  }
  function getObject(slide, objectId) {
    return slide.objects.filter(function (o) { return o.id === objectId; })[0] || null;
  }

  function setPosition(slide, objectId, x, y) {
    var o = getObject(slide, objectId); if (!o) return;
    o.position.x = x; o.position.y = y;
  }
  function setSize(slide, objectId, width, height) {
    var o = getObject(slide, objectId); if (!o) return;
    o.size.width = width; o.size.height = height;
  }
  function setRotation(slide, objectId, degrees) {
    var o = getObject(slide, objectId); if (!o) return;
    o.rotation = ((degrees % 360) + 360) % 360;
  }
  function setStyle(slide, objectId, styleChanges) {
    var o = getObject(slide, objectId); if (!o) return;
    Object.assign(o.style, styleChanges);
  }
  function setText(slide, objectId, text) {
    var o = getObject(slide, objectId); if (!o) return;
    o.text = text;
  }

  // ────────────────────────────────────────────────────────────
  // Layer ordering
  // ────────────────────────────────────────────────────────────
  function bringToFront(slide, objectId) {
    var maxZ = nextZIndex(slide);
    var o = getObject(slide, objectId); if (o) o.zIndex = maxZ;
  }
  function sendToBack(slide, objectId) {
    var minZ = slide.objects.reduce(function (min, x) { return Math.min(min, x.zIndex); }, 0);
    var o = getObject(slide, objectId); if (o) o.zIndex = minZ - 1;
  }
  function bringForward(slide, objectId) {
    var sorted = slide.objects.slice().sort(function (a, b) { return a.zIndex - b.zIndex; });
    var idx = sorted.findIndex(function (o) { return o.id === objectId; });
    if (idx !== -1 && idx < sorted.length - 1) {
      var tmp = sorted[idx].zIndex;
      sorted[idx].zIndex = sorted[idx + 1].zIndex;
      sorted[idx + 1].zIndex = tmp;
    }
  }
  function sendBackward(slide, objectId) {
    var sorted = slide.objects.slice().sort(function (a, b) { return a.zIndex - b.zIndex; });
    var idx = sorted.findIndex(function (o) { return o.id === objectId; });
    if (idx > 0) {
      var tmp = sorted[idx].zIndex;
      sorted[idx].zIndex = sorted[idx - 1].zIndex;
      sorted[idx - 1].zIndex = tmp;
    }
  }

  // ────────────────────────────────────────────────────────────
  // Alignment / Distribution (theo bounding box của các object được chọn)
  // ────────────────────────────────────────────────────────────
  function alignObjects(slide, objectIds, mode) {
    var objs = objectIds.map(function (id) { return getObject(slide, id); }).filter(Boolean);
    if (!objs.length) return;
    switch (mode) {
      case 'left': {
        var minX = Math.min.apply(Math, objs.map(function (o) { return o.position.x; }));
        objs.forEach(function (o) { o.position.x = minX; });
        break;
      }
      case 'right': {
        var maxRight = Math.max.apply(Math, objs.map(function (o) { return o.position.x + o.size.width; }));
        objs.forEach(function (o) { o.position.x = maxRight - o.size.width; });
        break;
      }
      case 'center-h': {
        var avgCenterX = objs.reduce(function (s, o) { return s + o.position.x + o.size.width / 2; }, 0) / objs.length;
        objs.forEach(function (o) { o.position.x = avgCenterX - o.size.width / 2; });
        break;
      }
      case 'top': {
        var minY = Math.min.apply(Math, objs.map(function (o) { return o.position.y; }));
        objs.forEach(function (o) { o.position.y = minY; });
        break;
      }
      case 'bottom': {
        var maxBottom = Math.max.apply(Math, objs.map(function (o) { return o.position.y + o.size.height; }));
        objs.forEach(function (o) { o.position.y = maxBottom - o.size.height; });
        break;
      }
      case 'center-v': {
        var avgCenterY = objs.reduce(function (s, o) { return s + o.position.y + o.size.height / 2; }, 0) / objs.length;
        objs.forEach(function (o) { o.position.y = avgCenterY - o.size.height / 2; });
        break;
      }
    }
  }

  /** Phân bố đều khoảng cách theo trục ngang/dọc giữa >=3 object. */
  function distributeObjects(slide, objectIds, axis) {
    var objs = objectIds.map(function (id) { return getObject(slide, id); }).filter(Boolean);
    if (objs.length < 3) return;
    var key = axis === 'horizontal' ? 'x' : 'y';
    var sizeKey = axis === 'horizontal' ? 'width' : 'height';
    objs.sort(function (a, b) { return a.position[key] - b.position[key]; });
    var first = objs[0], last = objs[objs.length - 1];
    var totalSpan = (last.position[key] + last.size[sizeKey]) - first.position[key];
    var totalObjectSize = objs.reduce(function (s, o) { return s + o.size[sizeKey]; }, 0);
    var gap = (totalSpan - totalObjectSize) / (objs.length - 1);
    var cursor = first.position[key] + first.size[sizeKey];
    for (var i = 1; i < objs.length - 1; i++) {
      objs[i].position[key] = cursor + gap;
      cursor = objs[i].position[key] + objs[i].size[sizeKey];
    }
  }

  // ────────────────────────────────────────────────────────────
  // Group / Ungroup
  // ────────────────────────────────────────────────────────────
  function groupObjects(slide, objectIds) {
    var groupId = uid('grp');
    objectIds.forEach(function (id) {
      var o = getObject(slide, id);
      if (o) o.groupId = groupId;
    });
    return groupId;
  }
  function ungroupObjects(slide, groupId) {
    slide.objects.forEach(function (o) { if (o.groupId === groupId) o.groupId = null; });
  }

  return {
    createPresentation: createPresentation,
    createSlide: createSlide,
    addSlide: addSlide,
    deleteSlide: deleteSlide,
    setSlideLayout: setSlideLayout,
    setSlideTransition: setSlideTransition,
    setTheme: setTheme,
    addObject: addObject,
    addTextBox: addTextBox,
    addImage: addImage,
    addShape: addShape,
    addTable: addTable,
    addChart: addChart,
    deleteObject: deleteObject,
    getObject: getObject,
    setPosition: setPosition,
    setSize: setSize,
    setRotation: setRotation,
    setStyle: setStyle,
    setText: setText,
    bringToFront: bringToFront,
    sendToBack: sendToBack,
    bringForward: bringForward,
    sendBackward: sendBackward,
    alignObjects: alignObjects,
    distributeObjects: distributeObjects,
    groupObjects: groupObjects,
    ungroupObjects: ungroupObjects
  };
});
