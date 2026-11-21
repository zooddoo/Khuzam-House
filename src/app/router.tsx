import { createBrowserRouter, Navigate, useRouteError, isRouteErrorResponse, Link } from 'react-router';
import { AppShell } from './AppShell';
import { HomePage } from '@/features/home/HomePage';
import { RoomsPage } from '@/features/rooms/RoomsPage';
import { RoomWorkspace } from '@/features/room/RoomWorkspace';
import { FloorPlansPage } from '@/features/floorplans/FloorPlansPage';
import { DesignStudioPage } from '@/features/studio/DesignStudioPage';
import { DesignLibraryPage } from '@/features/library/DesignLibraryPage';
import { MaterialsPage } from '@/features/materials/MaterialsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { RecentlyDeletedPage } from '@/features/trash/RecentlyDeletedPage';
import { useT } from '@/i18n';

function RouteError() {
  const t = useT();
  const err = useRouteError();
  const message = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : t.common.somethingWrong;
  return (
    <div className="mx-auto max-w-[620px] px-6 py-24">
      <div className="eyebrow mb-2">{t.app.routeErrorEyebrow}</div>
      <h1 className="display text-[34px] sm:text-[40px]">{t.app.routeErrorTitle}</h1>
      <p className="mt-3 text-[13.5px] text-ink-2" dir="auto">
        {message}
      </p>
      <p className="mt-2 text-[12.5px] text-ink-3">{t.app.routeErrorHint}</p>
      <Link to="/" className="mt-6 inline-block text-[13px] text-accent underline underline-offset-4">
        {t.app.goHome}
      </Link>
    </div>
  );
}

function NotFound() {
  const t = useT();
  return (
    <div className="py-24 text-center">
      <h1 className="display text-[34px] sm:text-[40px]">{t.app.notFound}</h1>
      <Link to="/" className="mt-4 inline-block text-[13px] text-accent underline underline-offset-4">
        {t.app.goHome}
      </Link>
    </div>
  );
}

// Links saved from the earlier version used "#/rooms/…" addresses.
if (typeof window !== 'undefined' && window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', window.location.hash.slice(1));
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'rooms', element: <RoomsPage /> },
      { path: 'rooms/:roomId', element: <Navigate to="overview" replace /> },
      { path: 'rooms/:roomId/:tab', element: <RoomWorkspace /> },
      { path: 'floor-plans', element: <FloorPlansPage /> },
      { path: 'floor-plans/:floorId', element: <FloorPlansPage /> },
      { path: 'studio', element: <DesignStudioPage /> },
      { path: 'studio/:roomId', element: <DesignStudioPage /> },
      { path: 'library', element: <Navigate to="concepts" replace /> },
      { path: 'library/:tab', element: <DesignLibraryPage /> },
      { path: 'library/:tab/:itemId', element: <DesignLibraryPage /> },
      { path: 'materials', element: <Navigate to="furniture" replace /> },
      { path: 'materials/:tab', element: <MaterialsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'deleted', element: <RecentlyDeletedPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
