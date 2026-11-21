import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Copy, ImageIcon, LayoutGrid, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import type { Room, RoomStatus } from '@/lib/types';
import { ROOM_STATUSES, roomTypeLabel } from '@/lib/labels';
import { useFloors, useRooms, useVersions } from '@/lib/hooks/data';
import { areaSummary, computeRoomShape, dimensionSummary } from '@/lib/geometry/room';
import { timeAgo } from '@/lib/format';
import { PageHeader, EmptyState, LoadingBlock } from '@/components/ui/Display';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Menu } from '@/components/ui/Overlay';
import { RoomCover, RoomFormDialog, RoomStatusLabel, useRoomActions } from './shared';
import { CoverPicker } from './CoverPicker';

type Sort = 'manual' | 'name' | 'updated' | 'status';

export function RoomsPage() {
  const rooms = useRooms();
  const floors = useFloors() ?? [];
  const versions = useVersions() ?? [];
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const actions = useRoomActions();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<RoomStatus | 'all'>('all');
  const [floor, setFloor] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('manual');
  const [editing, setEditing] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);
  const [coverFor, setCoverFor] = useState<Room | null>(null);

  useEffect(() => {
    if (params.get('new') === '1') {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const versionCount = useMemo(() => {
    const m = new Map<string, number>();
    versions.forEach((v) => m.set(v.roomId, (m.get(v.roomId) ?? 0) + 1));
    return m;
  }, [versions]);

  const list = useMemo(() => {
    if (!rooms) return [];
    const needle = q.trim().toLowerCase();
    const statusOrder = ROOM_STATUSES.map((s) => s.value);
    return rooms
      .filter((r) => (status === 'all' ? true : r.status === status))
      .filter((r) => (floor === 'all' ? true : floor === 'none' ? !r.floorId : r.floorId === floor))
      .filter((r) => !needle || `${r.name} ${roomTypeLabel(r.type)} ${r.description}`.toLowerCase().includes(needle))
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name)
          : sort === 'updated'
            ? b.updatedAt.localeCompare(a.updatedAt)
            : sort === 'status'
              ? statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
              : a.order - b.order,
      );
  }, [rooms, q, status, floor, sort]);

  if (!rooms) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        eyebrow="Bait Khuzam"
        title="My Rooms"
        description="Every room has its own design identity — its own dimensions, requirements, direction and versions."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Add room
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rooms" className="pl-8" aria-label="Search rooms" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as RoomStatus | 'all')} className="w-[180px]" aria-label="Filter by status">
          <option value="all">All statuses</option>
          {ROOM_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select value={floor} onChange={(e) => setFloor(e.target.value)} className="w-[170px]" aria-label="Filter by floor">
          <option value="all">All floors</option>
          <option value="none">No floor assigned</option>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-[160px]" aria-label="Sort rooms">
          <option value="manual">Default order</option>
          <option value="name">Name</option>
          <option value="updated">Recently updated</option>
          <option value="status">Status</option>
        </Select>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No rooms yet"
          action={
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              Add your first room
            </Button>
          }
        >
          Add the rooms and outdoor spaces of the house. Each one gets its own design workspace.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState
          compact
          title="No rooms match these filters"
          action={
            <Button
              onClick={() => {
                setQ('');
                setStatus('all');
                setFloor('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((room) => {
            const shape = computeRoomShape(room);
            const floorName = floors.find((f) => f.id === room.floorId)?.name;
            const count = versionCount.get(room.id) ?? 0;
            return (
              <article key={room.id} className="group">
                <Link
                  to={`/rooms/${room.id}/overview`}
                  className="block overflow-hidden rounded-md border border-line bg-surface transition-shadow hover:shadow-soft"
                >
                  <RoomCover room={room} className="aspect-[4/3]" />
                </Link>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/rooms/${room.id}/overview`} className="display block truncate text-[26px] leading-tight text-ink hover:text-accent">
                      {room.name}
                    </Link>
                    <div className="mt-1 truncate text-[12.5px] text-ink-3">
                      {roomTypeLabel(room.type)} · {floorName ?? 'Floor unknown'}
                    </div>
                  </div>
                  <Menu
                    trigger={<IconButton icon={MoreHorizontal} label={`Actions for ${room.name}`} />}
                    items={[
                      { label: 'Open workspace', icon: LayoutGrid, onSelect: () => navigate(`/rooms/${room.id}/overview`) },
                      { label: 'Redesign this room', icon: Sparkles, onSelect: () => navigate(`/studio/${room.id}`) },
                      { label: 'Edit details', icon: Pencil, onSelect: () => setEditing(room) },
                      { label: 'Change cover', icon: ImageIcon, onSelect: () => setCoverFor(room) },
                      { label: 'Duplicate', icon: Copy, onSelect: () => actions.duplicate(room) },
                      'separator',
                      { label: 'Delete', icon: Trash2, danger: true, onSelect: () => actions.remove(room) },
                    ]}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[12.5px]">
                  <dt className="text-ink-3">Dimensions</dt>
                  <dd className="truncate text-right text-ink-2 tabular">{dimensionSummary(room)}</dd>
                  <dt className="text-ink-3">Area</dt>
                  <dd className="text-right text-ink-2 tabular">{areaSummary(shape)}</dd>
                  <dt className="text-ink-3">Status</dt>
                  <dd className="flex justify-end">
                    <RoomStatusLabel status={room.status} />
                  </dd>
                  <dt className="text-ink-3">Versions</dt>
                  <dd className="text-right text-ink-2 tabular">{count}</dd>
                  <dt className="text-ink-3">Updated</dt>
                  <dd className="text-right text-ink-2">{timeAgo(room.updatedAt)}</dd>
                </dl>
              </article>
            );
          })}
        </div>
      )}

      <RoomFormDialog open={creating} onOpenChange={setCreating} />
      <RoomFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} room={editing} />
      <CoverPicker room={coverFor} onClose={() => setCoverFor(null)} />
    </div>
  );
}
