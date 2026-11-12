import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter } from 'react-router';
import { AppShell } from '@/app/layouts/AppShell';
import { ViewerProvider } from '@/app/providers/ViewerProvider';
import { Card } from '@/components/ui/card';
import { LoadingState } from '@/components/shared/States';
import { NotFoundPage } from '@/features/foundation/NotFoundPage';
import { OverviewPage } from '@/features/preview/OverviewPage';
import { UiGalleryPage } from '@/features/preview/UiGalleryPage';

/* HashRouter (#/…) vì GitHub Pages không có SPA fallback: F5 ở /app/#/giao-vien
   vẫn tải đúng app/index.html, không 404.
   Cổng nhân sự là lazy route: học sinh không tải mã quản trị, không nạp Firebase. */
const TeacherRoute = lazy(() => import('@/features/teacher/TeacherRoute'));
const CoordinatorRoute = lazy(() => import('@/features/coordinator/CoordinatorRoute'));
const AdminRoute = lazy(() => import('@/features/admin/AdminRoute'));

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
      { path: 'giao-vien', element: lazyPage(<TeacherRoute />) },
      { path: 'dieu-phoi', element: lazyPage(<CoordinatorRoute />) },
      { path: 'quan-tri', element: lazyPage(<AdminRoute />) },
      { path: 'ui', element: <UiGalleryPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
