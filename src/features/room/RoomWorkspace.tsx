import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import {
  Box,
  BrickWall,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  MoreHorizontal,
  Palette,
  Pencil,
  Ruler,
  Sofa,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useFloors, useRequirements, useRoom, useRoomReferences, useVersions } from '@/lib/hooks/data';
import { ROOM_STATUSES, roomStatusMeta, roomTypeLabel } from '@/lib/labels';
import { areaSummary, computeRoomShape, dimensionSummary } from '@/lib/geometry/room';
import { patchRoom } from '@/lib/db/rooms';
import { ButtonLink, IconButton } from '@/components/ui/Button';
import { LinkTabs } from '@/components/ui/Tabs';
import { Menu } from '@/components/ui/Overlay';
import { Dot, EmptyState, LoadingBlock } from '@/components/ui/Display';
import { RoomFormDialog, useRoomActions } from '../rooms/shared';
import { OverviewTab } from './tabs/OverviewTab';
import { RequirementsTab } from './tabs/RequirementsTab';
import { DimensionsTab } from './tabs/DimensionsTab';
import { ArchitectureTab } from './tabs/ArchitectureTab';
import { LayoutTab } from './tabs/LayoutTab';
import { WallsTab } from './tabs/WallsTab';
import { DirectionTab } from './tabs/DirectionTab';
import { PhotosTab } from './tabs/PhotosTab';
import { VersionsTab } from './tabs/VersionsTab';
import { useI18n, type Messages } from '@/i18n';
import { floorDisplayName, roomDisplayName, roomSecondaryName } from '@/lib/names';

type TabId = keyof Messages['room']['tabs'];

const TABS: { id: TabId; icon: LucideIcon }[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'requirements', icon: ClipboardList },
  { id: 'dimensions', icon: Ruler },
  { id: 'architecture', icon: Box },
  { id: 'layout', icon: Sofa },
  { id: 'walls', icon: BrickWall },
  { id: 'direction', icon: Palette },
  { id: 'photos', icon: ImageIcon },
  { id: 'versions', icon: History },
];

export function RoomWorkspace() {
  const { t, lang } = useI18n();
  const { roomId = '', tab = 'overview' } = useParams();
  const room = useRoom(roomId);
  const floors = useFloors() ?? [];
  const reqs = useRequirements(roomId) ?? [];
  const refs = useRoomReferences(roomId) ?? [];
  const versions = useVersions(roomId) ?? [];
  const navigate = useNavigate();
  const actions = useRoomActions();
  const [editing, setEditing] = useState(false);

  if (room === undefined) return <LoadingBlock />;
  if (room === null)
    return (
      <EmptyState title={t.room.notFound} action={<ButtonLink to="/rooms">{t.room.backToRooms}</ButtonLink>}>
        {t.room.notFoundHint}
      </EmptyState>
    );
  if (!TABS.some((x) => x.id === tab)) return <Navigate to={`/rooms/${room.id}/overview`} replace />;

  const shape = computeRoomShape(room);
  const floorName = floorDisplayName(floors.find((f) => f.id === room.floorId), lang) || t.room.floorUnknown;
  const name = roomDisplayName(room, lang);
  const secondary = roomSecondaryName(room, lang);
  const status = roomStatusMeta(room.status);
  const badges: Record<string, number> = {
    requirements: reqs.length,
    photos: refs.length,
    versions: versions.length,
    architecture: room.elements.length,
    layout: room.layout.items.length,
  };

  return (
    <div>
      <nav className="mb-3 flex items-center gap-1 text-[12px] text-ink-3" aria-label={t.room.breadcrumb}>
        <Link to="/rooms" className="hover:text-ink">
          {t.nav.rooms}
        </Link>
        <ChevronRight size={12} className="rtl:-scale-x-100" />
        <span className="truncate text-ink-2">{name}</span>
      </nav>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="display truncate text-[36px] sm:text-[52px]">{name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
            {secondary && (
              <>
                <span dir="auto" className="text-ink-2">
                  {secondary}
                </span>
                <span className="text-ink-4">·</span>
              </>
            )}
            <span>{roomTypeLabel(room.type)}</span>
            <span className="text-ink-4">·</span>
            <span>{floorName}</span>
            <span className="text-ink-4">·</span>
            <span className="tabular">{dimensionSummary(room)}</span>
            <span className="text-ink-4">·</span>
            <span className="tabular">{areaSummary(shape)}</span>
            <span className="text-ink-4">·</span>
            <Menu
              align="start"
              trigger={
                <button
                  type="button"
                  className="touch-target inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-ink-2 hover:bg-mist"
                  aria-label={t.room.changeStatus}
                >
                  <Dot tone={status.tone} /> {status.label} <ChevronDown size={12} />
                </button>
              }
              items={[
                { heading: t.room.statusHeading },
                ...ROOM_STATUSES.map((s) => ({
                  label: s.label,
                  hint: s.value === room.status ? t.room.current : undefined,
                  onSelect: () => patchRoom(room.id, { status: s.value }),
                })),
              ]}
            />
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <ButtonLink to={`/studio/${room.id}`} variant="primary" size="lg" icon={Sparkles} className="flex-1 sm:flex-none">
            {t.room.redesign}
          </ButtonLink>
          <Menu
            trigger={<IconButton icon={MoreHorizontal} label={t.room.actions} variant="secondary" size="md" />}
            items={[
              { label: t.room.editDetails, icon: Pencil, onSelect: () => setEditing(true) },
              { label: t.room.duplicate, icon: Copy, onSelect: () => actions.duplicate(room) },
              'separator',
              { label: t.room.delete, icon: Trash2, danger: true, onSelect: () => actions.remove(room, () => navigate('/rooms')) },
            ]}
          />
        </div>
      </header>

      <LinkTabs base={`/rooms/${room.id}`} tabs={TABS.map((x) => ({ ...x, label: t.room.tabs[x.id], badge: badges[x.id] }))} className="mb-6 sm:mb-8" />

      {tab === 'overview' && <OverviewTab room={room} requirements={reqs} references={refs} versions={versions} />}
      {tab === 'requirements' && <RequirementsTab room={room} requirements={reqs} references={refs} />}
      {tab === 'dimensions' && <DimensionsTab room={room} />}
      {tab === 'architecture' && <ArchitectureTab room={room} references={refs} />}
      {tab === 'layout' && <LayoutTab room={room} />}
      {tab === 'walls' && <WallsTab room={room} references={refs} />}
      {tab === 'direction' && <DirectionTab room={room} references={refs} />}
      {tab === 'photos' && <PhotosTab room={room} references={refs} />}
      {tab === 'versions' && <VersionsTab room={room} versions={versions} />}

      <RoomFormDialog open={editing} onOpenChange={setEditing} room={room} />
    </div>
  );
}
