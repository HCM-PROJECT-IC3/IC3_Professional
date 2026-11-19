import { StaffGate } from '@/features/auth/StaffGate';
import CompetencyReport from '@/features/teacher/CompetencyReport';
import { BUNDLES } from '@/services/legacy/runtime';

/* Route /giao-vien/nang-luc — cùng cổng, cùng gói mã cũ với /giao-vien (TeacherRoute). Nạp lười: học sinh không tải. */
export default function CompetencyRoute() {
  return (
    <StaffGate roles={['admin', 'teacher']} bundle={BUNDLES.teacher}>
      <CompetencyReport />
    </StaffGate>
  );
}
