import { useMemo, useState } from 'react';
import { useStorageVersion } from '@/hooks/useStorageVersion';
import { WATCH_KEYS, getChosenStudent, knownStudents, setChosenStudent, type Student } from '@/features/student/progress';

/** Học sinh đang xem trên máy này (máy trường dùng chung → chọn đúng tên).
 *  Dùng chung cho Góc học tập, Lộ trình học, Sổ tay câu sai. Tự làm mới khi tab sảnh cũ ghi bài mới. */
export function useStudent() {
  const version = useStorageVersion(WATCH_KEYS);
  const students = useMemo(() => knownStudents(), [version]);
  const [chosen, setChosen] = useState<string | null>(getChosenStudent);
  const student: Student | undefined = students.find((s) => s.key === chosen) ?? students[0];
  const pick = (key: string) => {
    setChosen(key);
    setChosenStudent(key);
  };
  return { students, student, pick, version };
}
