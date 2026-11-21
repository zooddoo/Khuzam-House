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

const TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'requirements', label: 'Requirements', icon: ClipboardList },
  { id: 'dimensions', label: 'Dimensions', icon: Ruler },
  { id: 'architecture', label: 'Architecture', icon: Box },
  { id: 'layout', label: 'Layout', icon: Sofa },
  { id: 'walls', label: 'Walls', icon: BrickWall },
  { id: 'direction', label: 'Direction', icon: Palette },
  { id: 'photos', label: 'Photos & references', icon: ImageIcon },
  { id: 'versions', label: 'Versions', icon: History },
];

export function RoomWorkspace() {
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
      <EmptyState title="Room not found" action={<ButtonLink to="/rooms">Back to My Rooms</ButtonLink>}>
        It may have been deleted.
      </EmptyState>
    );
  if (!TABS.some((t) => t.id === tab)) return <Navigate to={`/rooms/${room.id}/overview`} replace />;

  const shape = computeRoomShape(room);
  const floorName = floors.find((f) => f.id === room.floorId)?.name ?? 'Floor unknown';
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
      <nav className="mb-3 flex items-center gap-1 text-[12px] text-ink-3" aria-label="Breadcrumb">
        <Link to="/rooms" className="hover:text-ink">
          My Rooms
        </Link>
        <ChevronRight size={12} />
        <span className="text-ink-2">{room.name}</span>
      </nav>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="display truncate text-[42px] sm:text-[52px]">{room.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
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
                  className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-ink-2 hover:bg-mist"
                  aria-label="Change design status"
                >
                  <Dot tone={status.tone} /> {status.label} <ChevronDown size={12} />
                </button>
              }
              items={[
                { heading: 'Design status' },
                ...ROOM_STATUSES.map((s) => ({
                  label: s.label,
                  hint: s.value === room.status ? 'current' : undefined,
                  onSelect: () => patchRoom(room.id, { status: s.value }),
                })),
              ]}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink to={`/studio/${room.id}`} variant="primary" size="lg" icon={Sparkles}>
            Redesign This Room
          </ButtonLink>
          <Menu
            trigger={<IconButton icon={MoreHorizontal} label="Room actions" variant="secondary" size="md" />}
            items={[
              { label: 'Edit details', icon: Pencil, onSelect: () => setEditing(true) },
              { label: 'Duplicate room', icon: Copy, onSelect: () => actions.duplicate(room) },
              'separator',
              { label: 'Delete room', icon: Trash2, danger: true, onSelect: () => actions.remove(room, () => navigate('/rooms')) },
            ]}
          />
        </div>
      </header>

      <LinkTabs base={`/rooms/${room.id}`} tabs={TABS.map((t) => ({ ...t, badge: badges[t.id] }))} className="mb-8" />

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
