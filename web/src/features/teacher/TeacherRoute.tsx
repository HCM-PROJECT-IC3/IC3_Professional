import { StaffGate } from '@/features/auth/StaffGate';
import TeacherDashboard from '@/features/teacher/TeacherDashboard';
import { BUNDLES } from '@/services/legacy/runtime';

/* Route /giao-vien — nạp lười (React.lazy trong router): học sinh không tải mã này.
   Vai trò: CHÉP ĐÚNG window.EDU_ALLOWED_ROLES của teacher-dashboard.html. */
export default function TeacherRoute() {
  return (
    <StaffGate roles={['admin', 'teacher']} bundle={BUNDLES.teacher}>
      <TeacherDashboard />
    </StaffGate>
  );
}
