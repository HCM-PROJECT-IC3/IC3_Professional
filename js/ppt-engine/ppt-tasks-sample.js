/* js/ppt-engine/ppt-tasks-sample.js — Task mẫu môn PowerPoint, cùng cơ
   chế chấm theo STATE cuối với Word/Excel. */
(function (root, factory) {
  var deps = typeof module === 'object' && module.exports ? {
    TaskSchema: require('../exam-engine/task-schema.js'),
    PM: require('./slide-model.js')
  } : {
    TaskSchema: root.ExamEngine,
    PM: root.PptEngine.SlideModel
  };
  var mod = factory(deps.TaskSchema, deps.PM);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  if (root) {
    root.PptTasks = root.PptTasks || {};
    root.PptTasks.sample = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function (TaskSchema, PM) {
  'use strict';

  var task = TaskSchema.defineTask({
    id: 'ppt-align-front-title',
    application: 'powerpoint',
    skill: 'Object Arrangement',
    topic: 'Position, Layer ordering, Text',
    difficulty: 'medium',
    instruction: 'Trên Slide 1: đặt hộp văn bản "titleBox" về toạ độ x=50, đưa nó lên lớp trên cùng (Bring to Front), và sửa nội dung thành "Chào mừng".',
    hints: [
      'Chọn object rồi kéo hoặc nhập toạ độ X trong panel Format Shape.',
      'Ribbon Format → Arrange → Bring to Front.',
      'Click đúp vào text box để sửa nội dung.'
    ],
    initialState: function () {
      var pres = PM.createPresentation();
      var slide = pres.slides[0];
      var titleBox = PM.addTextBox(slide, 'Old title', { x: 500, y: 20 }, { width: 300, height: 60 });
      titleBox.id = 'titleBox';
      var overlappingShape = PM.addShape(slide, 'rectangle', { x: 490, y: 10 }, { width: 320, height: 80 });
      overlappingShape.id = 'coverShape';
      return { pres: pres };
    },
    requirements: [
      {
        id: 'position-x',
        label: 'Vị trí X',
        points: 3,
        check: function (state) {
          var obj = PM.getObject(state.pres.slides[0], 'titleBox');
          return !!obj && obj.position.x === 50;
        }
      },
      {
        id: 'front-layer',
        label: 'Lớp trên cùng',
        points: 3,
        check: function (state) {
          var slide = state.pres.slides[0];
          var title = PM.getObject(slide, 'titleBox');
          var cover = PM.getObject(slide, 'coverShape');
          return !!title && !!cover && title.zIndex > cover.zIndex;
        }
      },
      {
        id: 'text-content',
        label: 'Nội dung text',
        points: 4,
        check: function (state) {
          var obj = PM.getObject(state.pres.slides[0], 'titleBox');
          return !!obj && obj.text === 'Chào mừng';
        }
      }
    ]
  });

  return { task: task };
});
