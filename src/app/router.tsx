import { createHashRouter, Navigate, useRouteError, isRouteErrorResponse, Link } from 'react-router';
import { AppShell } from './AppShell';
import { HomePage } from '@/features/home/HomePage';
import { RoomsPage } from '@/features/rooms/RoomsPage';
import { RoomWorkspace } from '@/features/room/RoomWorkspace';
import { FloorPlansPage } from '@/features/floorplans/FloorPlansPage';
import { DesignStudioPage } from '@/features/studio/DesignStudioPage';
import { DesignLibraryPage } from '@/features/library/DesignLibraryPage';
import { MaterialsPage } from '@/features/materials/MaterialsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

function RouteError() {
  const err = useRouteError();
  const message = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : 'Unexpected error';
  return (
    <div className="mx-auto max-w-[620px] px-6 py-24">
      <div className="eyebrow mb-2">Something went wrong</div>
      <h1 className="display text-[40px]">This view could not be displayed</h1>
      <p className="mt-3 text-[13.5px] text-ink-2">{message}</p>
      <p className="mt-2 text-[12.5px] text-ink-3">Your data is stored locally and is not affected. Try going back to the home screen.</p>
      <Link to="/" className="mt-6 inline-block text-[13px] text-accent underline underline-offset-4">
        Go to Home
      </Link>
    </div>
  );
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="display text-[40px]">Page not found</h1>
      <Link to="/" className="mt-4 inline-block text-[13px] text-accent underline underline-offset-4">
        Go to Home
      </Link>
    </div>
  );
}

export const router = createHashRouter([
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
      { path: '*', element: <NotFound /> },
    ],
  },
]);
