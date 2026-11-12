import { StaffGate } from '@/features/auth/StaffGate';
import CoordinatorDashboard from '@/features/coordinator/CoordinatorDashboard';
import { BUNDLES } from '@/services/legacy/runtime';

/* Route /dieu-phoi — nạp lười. Vai trò: CHÉP ĐÚNG window.EDU_ALLOWED_ROLES của coordinator-dashboard.html. */
export default function CoordinatorRoute() {
  return (
    <StaffGate roles={['admin', 'coordinator', 'school_admin']} bundle={BUNDLES.coordinator}>
      <CoordinatorDashboard />
    </StaffGate>
  );
}
