/* Kiểm thử firestore.rules trên Firestore emulator — quyền THẬT, không phải kiểm tra regex.
   Chạy (cần Java 21): cd tests/firestore-rules && npm install && npm test
   Trọng tâm: không truy cập chéo trường, không tự nâng quyền, school_admin, chuyển tiếp tên → schoolId,
   các collection đã đóng ghi. Dữ liệu mẫu ghi bằng withSecurityRulesDisabled trước mỗi test. */
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';

let env;

const USERS = {
  admin1: { role: 'admin', approved: true, name: 'Admin', email: 'a@x' },
  coordA: { role: 'coordinator', approved: true, schools: ['THCS A'], name: 'Điều phối A', email: 'c@x' },
  schoolAdminA: { role: 'school_admin', approved: true, schools: ['THCS A'], schoolIds: ['thcs-a'], name: 'QT A', email: 's@x' },
  // Hồ sơ đã chuyển hẳn sang schoolId (không còn tên trường)
  schoolAdminIdOnly: { role: 'school_admin', approved: true, schools: [], schoolIds: ['thcs-a'], name: 'QT A2', email: 's2@x' },
  teacherA: { role: 'teacher', approved: true, schools: ['THCS A'], name: 'GV A', email: 't@x' },
  teacherPending: { role: 'teacher', approved: false, name: 'GV chờ', email: 'p@x' },
  tcoord: { role: 'teaching_coordinator', approved: true, name: 'ĐP GV', email: 'tc@x' },
};

const db = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ic3',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});

after(async () => { if (env) await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    for (const [uid, data] of Object.entries(USERS)) await setDoc(doc(fs, 'users', uid), data);
    await setDoc(doc(fs, 'students_roster', 's1'), { name: 'An', className: '6A', school: 'THCS A', schoolId: 'thcs-a', teacherId: 'teacherA', status: 'active' });
    await setDoc(doc(fs, 'students_roster', 's2'), { name: 'Bình', className: '6A', school: 'THCS B', schoolId: 'thcs-b', teacherId: 'other', status: 'active' });
    // Bản ghi cũ chưa ghi bù schoolId
    await setDoc(doc(fs, 'students_roster', 's3'), { name: 'Chi', className: '6B', school: 'THCS A', teacherId: 'other', status: 'active' });
    await setDoc(doc(fs, 'quiz_results', 'r1'), { studentSchool: 'THCS A', studentName: 'An', score: 80 });
    await setDoc(doc(fs, 'quiz_results', 'r2'), { studentSchool: 'THCS B', studentName: 'Bình', score: 60 });
    await setDoc(doc(fs, 'schools', 'thcs-a'), { name: 'THCS A', status: 'active' });
    await setDoc(doc(fs, 'schools', 'thcs-b'), { name: 'THCS B', status: 'active' });
    await setDoc(doc(fs, 'questions', 'q1'), { question: 'cũ' });
  });
});

describe('users — không tự nâng quyền', () => {
  const selfProfile = (role, approved, extra = {}) => Object.assign({
    name: 'Mới', email: 'new@x', role, approved, requestedRole: role, createdAt: serverTimestamp(),
  }, extra);

  test('tự đăng ký học sinh / giáo viên chờ duyệt: được', async () => {
    await assertSucceeds(setDoc(doc(db('new1'), 'users', 'new1'), selfProfile('student', true)));
    await assertSucceeds(setDoc(doc(db('new2'), 'users', 'new2'), selfProfile('teacher', false)));
  });
  test('tự đăng ký admin / school_admin / coordinator / giáo viên đã duyệt: bị chặn', async () => {
    await assertFails(setDoc(doc(db('new3'), 'users', 'new3'), selfProfile('admin', true)));
    await assertFails(setDoc(doc(db('new4'), 'users', 'new4'), selfProfile('school_admin', true)));
    await assertFails(setDoc(doc(db('new5'), 'users', 'new5'), selfProfile('coordinator', true)));
    await assertFails(setDoc(doc(db('new6'), 'users', 'new6'), selfProfile('teacher', true)));
  });
  test('tự đăng ký kèm schools/schoolIds: bị chặn', async () => {
    await assertFails(setDoc(doc(db('new7'), 'users', 'new7'), selfProfile('teacher', false, { schoolIds: ['thcs-b'] })));
  });
  test('tự sửa tên: được; tự sửa role / schools / schoolIds: bị chặn', async () => {
    await assertSucceeds(updateDoc(doc(db('teacherA'), 'users', 'teacherA'), { name: 'Tên mới' }));
    await assertFails(updateDoc(doc(db('teacherA'), 'users', 'teacherA'), { role: 'admin' }));
    await assertFails(updateDoc(doc(db('teacherA'), 'users', 'teacherA'), { schools: ['THCS B'] }));
    await assertFails(updateDoc(doc(db('schoolAdminA'), 'users', 'schoolAdminA'), { schoolIds: ['thcs-a', 'thcs-b'] }));
  });
  test('đọc hồ sơ người khác: chỉ admin', async () => {
    await assertFails(getDoc(doc(db('coordA'), 'users', 'teacherA')));
    await assertSucceeds(getDoc(doc(db('admin1'), 'users', 'teacherA')));
  });
  test('liệt kê: nhân sự chỉ list được giáo viên đã duyệt; admin list được hết', async () => {
    const teachers = (fs) => query(collection(fs, 'users'), where('role', '==', 'teacher'), where('approved', '==', true), limit(1000));
    await assertSucceeds(getDocs(teachers(db('schoolAdminA'))));
    await assertSucceeds(getDocs(teachers(db('coordA'))));
    await assertFails(getDocs(query(collection(db('coordA'), 'users'), limit(1000))));
    await assertSucceeds(getDocs(query(collection(db('admin1'), 'users'), limit(1000))));
  });
});

describe('students_roster — cách ly theo trường', () => {
  test('điều phối A: đọc học sinh trường A, không đọc trường B', async () => {
    await assertSucceeds(getDoc(doc(db('coordA'), 'students_roster', 's1')));
    await assertFails(getDoc(doc(db('coordA'), 'students_roster', 's2')));
  });
  test('quản trị trường A: như điều phối A', async () => {
    await assertSucceeds(getDoc(doc(db('schoolAdminA'), 'students_roster', 's1')));
    await assertSucceeds(getDoc(doc(db('schoolAdminA'), 'students_roster', 's3')));
    await assertFails(getDoc(doc(db('schoolAdminA'), 'students_roster', 's2')));
  });
  test('hồ sơ chỉ có schoolIds: đọc bản ghi có schoolId, không đọc bản ghi cũ chỉ có tên', async () => {
    await assertSucceeds(getDoc(doc(db('schoolAdminIdOnly'), 'students_roster', 's1')));
    await assertFails(getDoc(doc(db('schoolAdminIdOnly'), 'students_roster', 's3')));
    await assertFails(getDoc(doc(db('schoolAdminIdOnly'), 'students_roster', 's2')));
  });
  test('query theo trường mình: được; xin trường khác: bị chặn', async () => {
    await assertSucceeds(getDocs(query(collection(db('coordA'), 'students_roster'), where('school', 'in', ['THCS A']), limit(100))));
    await assertFails(getDocs(query(collection(db('coordA'), 'students_roster'), where('school', 'in', ['THCS B']), limit(100))));
    await assertFails(getDocs(query(collection(db('coordA'), 'students_roster'), limit(100))));
  });
  test('ghi: điều phối A thêm học sinh trường A được, trường B bị chặn; giáo viên chỉ đọc', async () => {
    const st = (school) => ({ name: 'Mới', className: '6A', school, status: 'active' });
    await assertSucceeds(setDoc(doc(db('coordA'), 'students_roster', 'n1'), st('THCS A')));
    await assertFails(setDoc(doc(db('coordA'), 'students_roster', 'n2'), st('THCS B')));
    await assertFails(updateDoc(doc(db('coordA'), 'students_roster', 's1'), { school: 'THCS B' }));
    await assertFails(setDoc(doc(db('teacherA'), 'students_roster', 'n3'), st('THCS A')));
  });
  test('giáo viên: đọc học sinh mình phụ trách (teacherId), không đọc em khác', async () => {
    await assertSucceeds(getDoc(doc(db('teacherA'), 'students_roster', 's1')));
    await assertFails(getDoc(doc(db('teacherA'), 'students_roster', 's3')));
    await assertFails(getDoc(doc(db('teacherPending'), 'students_roster', 's1')));
  });
  test('điều phối giáo viên / chưa đăng nhập: không đọc roster', async () => {
    await assertFails(getDoc(doc(db('tcoord'), 'students_roster', 's1')));
    await assertFails(getDoc(doc(db(null), 'students_roster', 's1')));
  });
});

describe('quiz_results — kết quả thi', () => {
  test('đọc theo trường: A thấy r1, không thấy r2', async () => {
    await assertSucceeds(getDoc(doc(db('coordA'), 'quiz_results', 'r1')));
    await assertFails(getDoc(doc(db('coordA'), 'quiz_results', 'r2')));
    await assertSucceeds(getDoc(doc(db('teacherA'), 'quiz_results', 'r1')));
    await assertFails(getDoc(doc(db('teacherA'), 'quiz_results', 'r2')));
  });
  test('không ai ngoài Admin sửa điểm', async () => {
    await assertFails(updateDoc(doc(db('coordA'), 'quiz_results', 'r1'), { score: 100 }));
    await assertFails(updateDoc(doc(db('schoolAdminA'), 'quiz_results', 'r1'), { score: 100 }));
    await assertFails(updateDoc(doc(db('teacherA'), 'quiz_results', 'r1'), { score: 100 }));
    await assertSucceeds(updateDoc(doc(db('admin1'), 'quiz_results', 'r1'), { score: 90 }));
  });
  test('xoá: quản trị trường A xoá bài trường A, không xoá trường B', async () => {
    await assertSucceeds(deleteDoc(doc(db('schoolAdminA'), 'quiz_results', 'r1')));
    await assertFails(deleteDoc(doc(db('schoolAdminA'), 'quiz_results', 'r2')));
  });
  test('học sinh không đăng nhập không tự ghi điểm (quizResultsOpen() = false)', async () => {
    await assertFails(addDoc(collection(db(null), 'quiz_results'), { studentName: 'X', studentSchool: 'THCS A', score: 100 }));
  });
});

describe('schools — danh mục trường', () => {
  test('nhân sự đọc được; chưa đăng nhập không đọc', async () => {
    await assertSucceeds(getDoc(doc(db('teacherA'), 'schools', 'thcs-a')));
    await assertSucceeds(getDocs(query(collection(db('schoolAdminA'), 'schools'), limit(1000))));
    await assertFails(getDoc(doc(db(null), 'schools', 'thcs-a')));
    await assertFails(getDoc(doc(db('teacherPending'), 'schools', 'thcs-a')));
  });
  test('quản trị trường sửa liên hệ trường mình (theo tên hoặc schoolId)', async () => {
    await assertSucceeds(updateDoc(doc(db('schoolAdminA'), 'schools', 'thcs-a'), { phone: '028', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db('schoolAdminIdOnly'), 'schools', 'thcs-a'), { address: 'Q.1', updatedAt: serverTimestamp() }));
  });
  test('quản trị trường không đổi tên/trạng thái, không sửa trường khác', async () => {
    await assertFails(updateDoc(doc(db('schoolAdminA'), 'schools', 'thcs-a'), { name: 'Đổi', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('schoolAdminA'), 'schools', 'thcs-a'), { status: 'inactive', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('schoolAdminA'), 'schools', 'thcs-b'), { phone: '1', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('schoolAdminA'), 'schools', 'thcs-a'), { phone: '1' })); // thiếu updatedAt
  });
  test('điều phối không sửa danh mục; chỉ admin tạo/xoá', async () => {
    await assertFails(updateDoc(doc(db('coordA'), 'schools', 'thcs-a'), { phone: '1', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db('schoolAdminA'), 'schools', 'thcs-c'), { name: 'THCS C', status: 'active' }));
    await assertSucceeds(setDoc(doc(db('admin1'), 'schools', 'thcs-c'), { name: 'THCS C', status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db('admin1'), 'schools', 'thcs-d'), { name: 'THCS D', status: 'deleted' }));
    await assertFails(setDoc(doc(db('admin1'), 'schools', 'thcs-e'), { name: 'THCS E', status: 'active', hack: true }));
    await assertSucceeds(deleteDoc(doc(db('admin1'), 'schools', 'thcs-c')));
    await assertFails(deleteDoc(doc(db('schoolAdminA'), 'schools', 'thcs-a')));
  });
});

describe('collection đã đóng ghi', () => {
  test('mos_submissions: không ai tạo mới (web đã chuyển sang Apps Script)', async () => {
    await assertFails(addDoc(collection(db(null), 'mos_submissions'), { studentName: 'X', studentSchool: 'THCS A', score: 100 }));
    await assertFails(addDoc(collection(db('admin1'), 'mos_submissions'), { studentName: 'X', studentSchool: 'THCS A', score: 100 }));
  });
  test('questions: giáo viên không ghi; admin đọc và xoá được', async () => {
    await assertFails(setDoc(doc(db('teacherA'), 'questions', 'q2'), { question: 'mới' }));
    await assertFails(updateDoc(doc(db('admin1'), 'questions', 'q1'), { question: 'sửa' }));
    await assertFails(getDoc(doc(db('teacherA'), 'questions', 'q1')));
    await assertSucceeds(getDoc(doc(db('admin1'), 'questions', 'q1')));
    await assertSucceeds(deleteDoc(doc(db('admin1'), 'questions', 'q1')));
  });
});
