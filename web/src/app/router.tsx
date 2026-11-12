import { createHashRouter } from 'react-router';
import { AppShell } from '@/app/layouts/AppShell';
import { ViewerProvider } from '@/app/providers/ViewerProvider';
import { NotFoundPage } from '@/features/foundation/NotFoundPage';
import { OverviewPage } from '@/features/preview/OverviewPage';
import { UiGalleryPage } from '@/features/preview/UiGalleryPage';

/* HashRouter (#/…) vì GitHub Pages không có SPA fallback: F5 ở /app/#/ui
   vẫn tải đúng app/index.html, không 404. Các cổng (student/teacher/coordinator/
   admin) sẽ thêm ở Phase 4 dưới dạng lazy route — học sinh không tải mã quản trị. */
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
      { path: 'ui', element: <UiGalleryPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
