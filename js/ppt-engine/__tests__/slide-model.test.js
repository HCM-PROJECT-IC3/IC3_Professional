var PM = require('../slide-model.js');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
function approxEq(label, actual, expected, tol) {
  var pass = Math.abs(actual - expected) <= (tol || 0.001);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + actual + (pass ? '' : '  (expected ~' + expected + ')'));
  if (!pass) failures++;
}

var pres = PM.createPresentation();
assertEq('starts with 1 slide', pres.slides.length, 1);

var slide2 = PM.addSlide(pres, null, 'Title and Content');
assertEq('2 slides after add', pres.slides.length, 2);

var slide = pres.slides[0];
var box1 = PM.addTextBox(slide, 'Hello', { x: 0, y: 0 }, { width: 100, height: 50 });
var img1 = PM.addImage(slide, 'pic.png', { x: 200, y: 0 }, { width: 50, height: 50 });
var shape1 = PM.addShape(slide, 'oval', { x: 10, y: 10 }, { width: 30, height: 30 }, { fillColor: 'red' });
assertEq('3 objects on slide', slide.objects.length, 3);

PM.setPosition(slide, box1.id, 15, 25);
assertEq('position set', [box1.position.x, box1.position.y], [15, 25]);

PM.setSize(slide, box1.id, 120, 60);
assertEq('size set', [box1.size.width, box1.size.height], [120, 60]);

PM.setRotation(slide, box1.id, 370);
assertEq('rotation normalized', box1.rotation, 10);
PM.setRotation(slide, box1.id, -30);
assertEq('negative rotation normalized', box1.rotation, 330);

PM.setStyle(slide, shape1.id, { fillColor: 'blue' });
assertEq('style updated', shape1.style.fillColor, 'blue');

PM.setText(slide, box1.id, 'Updated');
assertEq('text updated', box1.text, 'Updated');

// Layer ordering
assertEq('initial zIndex order', [box1.zIndex, img1.zIndex, shape1.zIndex], [1, 2, 3]);
PM.bringToFront(slide, box1.id);
assertEq('bringToFront gives highest z', box1.zIndex, 4);
PM.sendToBack(slide, img1.id);
assertEq('sendToBack gives lowest z', img1.zIndex < shape1.zIndex && img1.zIndex < box1.zIndex, true);

// bringForward/sendBackward swap with neighbor
var s2 = PM.createSlide();
var a = PM.addTextBox(s2, 'A', { x: 0, y: 0 }, { width: 10, height: 10 });
var b = PM.addTextBox(s2, 'B', { x: 0, y: 0 }, { width: 10, height: 10 });
var c = PM.addTextBox(s2, 'C', { x: 0, y: 0 }, { width: 10, height: 10 });
assertEq('initial order a<b<c', [a.zIndex, b.zIndex, c.zIndex], [1, 2, 3]);
PM.bringForward(s2, a.id);
assertEq('a moved forward swaps with b', [a.zIndex, b.zIndex], [2, 1]);
// Sau bringForward(a): a=2,b=1,c=3 -> thứ tự z tăng dần: b(1) < a(2) < c(3).
// sendBackward(c) hoán đổi với LÁNG GIỀNG liền kề theo z (là a, không phải b).
PM.sendBackward(s2, c.id);
assertEq('c moved backward swaps with its z-neighbor (a)', [a.zIndex, c.zIndex], [3, 2]);
assertEq('b (unrelated neighbor) unaffected', b.zIndex, 1);

// Alignment
var s3 = PM.createSlide();
var o1 = PM.addTextBox(s3, '1', { x: 0, y: 0 }, { width: 20, height: 20 });
var o2 = PM.addTextBox(s3, '2', { x: 50, y: 30 }, { width: 20, height: 20 });
PM.alignObjects(s3, [o1.id, o2.id], 'left');
assertEq('align left', [o1.position.x, o2.position.x], [0, 0]);
PM.alignObjects(s3, [o1.id, o2.id], 'top');
assertEq('align top', [o1.position.y, o2.position.y], [0, 0]);

// Distribution (3 objects horizontally)
var s4 = PM.createSlide();
var d1 = PM.addTextBox(s4, '1', { x: 0, y: 0 }, { width: 10, height: 10 });
var d2 = PM.addTextBox(s4, '2', { x: 40, y: 0 }, { width: 10, height: 10 });
var d3 = PM.addTextBox(s4, '3', { x: 90, y: 0 }, { width: 10, height: 10 });
PM.distributeObjects(s4, [d1.id, d2.id, d3.id], 'horizontal');
// total span = (90+10)-0=100; totalObjSize=30; gap=(100-30)/2=35
// d1 stays at 0 (first), cursor=10; d2.x should = 10+35=45
approxEq('distribute middle object x', d2.position.x, 45);

// Group / Ungroup
var s5 = PM.createSlide();
var g1 = PM.addTextBox(s5, '1', { x: 0, y: 0 }, { width: 10, height: 10 });
var g2 = PM.addTextBox(s5, '2', { x: 0, y: 0 }, { width: 10, height: 10 });
var groupId = PM.groupObjects(s5, [g1.id, g2.id]);
assertEq('grouped', [g1.groupId, g2.groupId], [groupId, groupId]);
PM.ungroupObjects(s5, groupId);
assertEq('ungrouped', [g1.groupId, g2.groupId], [null, null]);

// Table / Chart
var s6 = PM.createSlide();
var table = PM.addTable(s6, 2, 3, { x: 0, y: 0 }, { width: 200, height: 100 });
assertEq('table dims', [table.rows, table.cols], [2, 3]);
var chart = PM.addChart(s6, 'bar', 'Sheet1!A1:B3', { x: 0, y: 0 }, { width: 200, height: 150 });
assertEq('chart type', chart.chartType, 'bar');

// Slide layout / transition / theme
PM.setSlideLayout(pres, 0, 'Blank');
assertEq('slide layout changed', pres.slides[0].layout, 'Blank');
PM.setSlideTransition(pres, 0, { type: 'fade', duration: 1 });
assertEq('transition changed', pres.slides[0].transition, { type: 'fade', duration: 1 });
PM.setTheme(pres, 'Facet');
assertEq('theme changed', pres.theme, 'Facet');

// Delete slide / object
PM.deleteObject(slide, shape1.id);
assertEq('object deleted', slide.objects.some(function (o) { return o.id === shape1.id; }), false);
PM.deleteSlide(pres, 1);
assertEq('slide deleted', pres.slides.length, 1);

console.log('\n' + (failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
