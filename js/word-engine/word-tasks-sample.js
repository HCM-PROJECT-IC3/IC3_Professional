/* js/word-engine/word-tasks-sample.js — Task mẫu môn Word, chứng minh
   Validation Engine chấm theo STATE cuối (không theo thao tác) cho Word,
   cùng cơ chế với js/excel-engine/excel-tasks-sample.js. */
(function (root, factory) {
  var deps = typeof module === 'object' && module.exports ? {
    TaskSchema: require('../exam-engine/task-schema.js'),
    WD: require('./document-model.js')
  } : {
    TaskSchema: root.ExamEngine,
    WD: root.WordEngine.DocumentModel
  };
  var mod = factory(deps.TaskSchema, deps.WD);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  if (root) {
    root.WordTasks = root.WordTasks || {};
    root.WordTasks.sample = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function (TaskSchema, WD) {
  'use strict';

  var task = TaskSchema.defineTask({
    id: 'word-heading-bold-header',
    application: 'word',
    skill: 'Text & Paragraph Formatting',
    topic: 'Heading style, Bold, Header',
    difficulty: 'easy',
    instruction: 'Đặt style "Heading1" cho dòng tiêu đề đầu tiên, in đậm toàn bộ dòng đó, và thêm Header với nội dung "Báo cáo quý".',
    hints: [
      'Bôi đen cả dòng tiêu đề rồi chọn style Heading 1 trong Ribbon Home.',
      'Dùng Ctrl+B để in đậm sau khi đã bôi đen.',
      'Insert → Header để thêm dòng chữ vào đầu trang.'
    ],
    initialState: function () {
      var doc = WD.createDocument();
      WD.setSelection(doc, 0, 0, 0, 0);
      WD.insertText(doc, 'Bao cao ket qua kinh doanh quy 3');
      WD.setSelection(doc, 0, 0, 0, 0);
      return { doc: doc };
    },
    requirements: [
      {
        id: 'heading-style',
        label: 'Heading style',
        points: 4,
        check: function (state) { return state.doc.paragraphs[0].style === 'Heading1'; }
      },
      {
        id: 'bold',
        label: 'Bold toàn bộ tiêu đề',
        points: 3,
        check: function (state) {
          var p = state.doc.paragraphs[0];
          return p.runs.length > 0 && p.runs.every(function (r) { return r.bold; });
        }
      },
      {
        id: 'header-text',
        label: 'Header text',
        points: 3,
        check: function (state) {
          var text = state.doc.header.runs.map(function (r) { return r.text; }).join('');
          return text.trim() === 'Báo cáo quý';
        }
      }
    ]
  });

  return { task: task };
});
