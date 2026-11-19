import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter } from 'react-router';
import { AppShell } from '@/app/layouts/AppShell';
import { ViewerProvider } from '@/app/providers/ViewerProvider';
import { Card } from '@/components/ui/card';
import { LoadingState } from '@/components/shared/States';
import { NotFoundPage } from '@/features/foundation/NotFoundPage';
import { OverviewPage } from '@/features/preview/OverviewPage';

/* HashRouter (#/…) vì GitHub Pages không có SPA fallback: F5 ở /app/#/giao-vien
   vẫn tải đúng app/index.html, không 404.
   Cổng nhân sự là lazy route: học sinh không tải mã quản trị, không nạp Firebase. */
const TeacherRoute = lazy(() => import('@/features/teacher/TeacherRoute'));
const CompetencyRoute = lazy(() => import('@/features/teacher/CompetencyRoute'));
const CoordinatorRoute = lazy(() => import('@/features/coordinator/CoordinatorRoute'));
const AdminRoute = lazy(() => import('@/features/admin/AdminRoute'));
/* Trang học sinh ngoài Tổng quan: tải khi mở (18/11/2026) — gói đầu nhỏ hơn, máy phòng tin mở app nhanh hơn. */
const LearningPathPage = lazy(() => import('@/features/learning/LearningPathPage').then((m) => ({ default: m.LearningPathPage })));
const WrongbookPage = lazy(() => import('@/features/learning/WrongbookPage').then((m) => ({ default: m.WrongbookPage })));
const AchievementsPage = lazy(() => import('@/features/play/AchievementsPage').then((m) => ({ default: m.AchievementsPage })));
const GameHubPage = lazy(() => import('@/features/play/GameHubPage').then((m) => ({ default: m.GameHubPage })));
const UiGalleryPage = lazy(() => import('@/features/preview/UiGalleryPage').then((m) => ({ default: m.UiGalleryPage })));
/* TechRealm — khu riêng, khung riêng (không nằm trong AppShell), gói riêng. Bản xem thử giao diện. */
const TechRealmApp = lazy(() => import('@/features/techrealm/TechRealmApp'));

const lazyPage = (node: ReactNode) => (
  <Suspense
    fallback={
      <Card className="p-6">
        <LoadingState />
      </Card>
    }
  >
    {node}
  </Suspense>
);

export const router = createHashRouter([
  {
    path: '/',
    element: (
      <ViewerProvider>
        <AppShell />
      </ViewerProvider>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'lo-trinh', element: lazyPage(<LearningPathPage />) },
      { path: 'so-tay', element: lazyPage(<WrongbookPage />) },
      { path: 'tro-choi', element: lazyPage(<GameHubPage />) },
      { path: 'thanh-tich', element: lazyPage(<AchievementsPage />) },
      { path: 'giao-vien', element: lazyPage(<TeacherRoute />) },
      { path: 'giao-vien/nang-luc', element: lazyPage(<CompetencyRoute />) },
      { path: 'dieu-phoi', element: lazyPage(<CoordinatorRoute />) },
      { path: 'quan-tri', element: lazyPage(<AdminRoute />) },
      { path: 'ui', element: lazyPage(<UiGalleryPage />) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/the-gioi/*',
    element: (
      <Suspense fallback={<div className="p-6"><LoadingState /></div>}>
        <TechRealmApp />
      </Suspense>
    ),
  },
]);
