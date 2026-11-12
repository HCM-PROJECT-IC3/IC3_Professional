import { StaffGate } from '@/features/auth/StaffGate';
import AdminOverview from '@/features/admin/AdminOverview';
import { BUNDLES } from '@/services/legacy/runtime';

/* Route /quan-tri — nạp lười. Vai trò: CHÉP ĐÚNG window.EDU_ALLOWED_ROLES của admin-users.html. */
export default function AdminRoute() {
  return (
    <StaffGate roles={['admin']} bundle={BUNDLES.admin}>
      <AdminOverview />
    </StaffGate>
  );
}
