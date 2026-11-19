import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { LoadingState } from '@/components/shared/States';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/shared/States';
import { buttonVariants } from '@/components/ui/button';
import { TrShell } from './layout/TrShell';
import { AchievementsPage } from './pages/AchievementsPage';
import { ArenaPage } from './pages/ArenaPage';
import { BagPage } from './pages/BagPage';
import { ChallengesPage } from './pages/ChallengesPage';
import { CharacterPage } from './pages/CharacterPage';
import { CoursePage } from './pages/CoursePage';
import { TeacherCoursesPage } from './pages/TeacherCoursesPage';
import { LabPage } from './pages/LabPage';
import { LibraryPage } from './pages/LibraryPage';
import { OverviewPage } from './pages/OverviewPage';
import { PracticePage } from './pages/PracticePage';
import { WorkshopPage } from './pages/WorkshopPage';
import { WorldPage } from './pages/WorldPage';
import { TrLink } from './ui/primitives';
import './techrealm.css';

/* Trò chơi bí cảnh: gói lười RIÊNG (không nằm trong phần học tập / quản lý). */
const PowerCityGame = lazy(() => import('./challenges/PowerCityGame'));
/* Thành phố thông minh + nhiệm vụ đời sống: gói lười riêng. */
const SmartCityPage = lazy(() => import('./city/SmartCityPage'));
const LifeMissionPage = lazy(() => import('./city/LifeMissionPage'));
/* AI Sư Phụ: gói lười riêng (kéo theo trợ lý AI cũ + Apps Script client — chỉ nạp khi mở trang). */
const MentorPage = lazy(() => import('./mentor/MentorPage'));
const SectHubPage = lazy(() => import('./pages/SectHubPage'));

/* Khu TechRealm (/app/#/the-gioi/…). Nạp lười thành 1 gói riêng từ src/app/router.tsx: người không mở khu này
   không tải mã của nó. Không import Firebase, runtime cũ hay Apps Script — 0 lượt mạng ngoài tải gói. */
export default function TechRealmApp() {
  return (
    <Routes>
      <Route element={<TrShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="ban-do" element={<WorldPage />} />
        <Route path="tang-kinh-cac" element={<LibraryPage />} />
        <Route path="tang-kinh-cac/:courseId" element={<CoursePage />} />
        <Route path="quan-ly-cong-phap" element={<TeacherCoursesPage />} />
        <Route path="luyen-cong" element={<PracticePage />} />
        <Route path="bi-canh" element={<ChallengesPage />} />
        <Route path="bi-canh/thanh-pho-mat-dien" element={<Suspense fallback={<LoadingState />}><PowerCityGame /></Suspense>} />
        <Route path="bach-cong-phuong" element={<WorkshopPage />} />
        <Route path="van-tuong-gioi" element={<LabPage />} />
        <Route path="van-tuong-gioi/thanh-pho" element={<Suspense fallback={<LoadingState />}><SmartCityPage /></Suspense>} />
        <Route path="van-tuong-gioi/:missionId" element={<Suspense fallback={<LoadingState />}><LifeMissionPage /></Suspense>} />
        <Route path="su-phu" element={<Suspense fallback={<LoadingState />}><MentorPage /></Suspense>} />
        <Route path="tong-mon" element={<Suspense fallback={<LoadingState />}><SectHubPage /></Suspense>} />
        <Route path="dau-truong" element={<ArenaPage />} />
        <Route path="tui-can-khon" element={<BagPage />} />
        <Route path="thanh-tuu" element={<AchievementsPage />} />
        <Route path="nhan-vat" element={<CharacterPage />} />
        <Route
          path="*"
          element={
            <EmptyState
              title="Lạc đường rồi"
              description="Vùng đất này chưa có trên bản đồ."
              action={<TrLink to="" className={buttonVariants({ variant: 'outline' })}><Compass /> Về Tổng quan</TrLink>}
            />
          }
        />
      </Route>
    </Routes>
  );
}
