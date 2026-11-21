import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Copy, ImageIcon, LayoutGrid, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import type { Room, RoomStatus } from '@/lib/types';
import { ROOM_STATUSES, roomTypeLabel } from '@/lib/labels';
import { useFloors, useRooms, useVersions } from '@/lib/hooks/data';
import { areaSummary, computeRoomShape, dimensionSummary } from '@/lib/geometry/room';
import { num, timeAgo } from '@/i18n/format';
import { matchesSearch } from '@/i18n/arabic';
import { useI18n } from '@/i18n';
import { floorDisplayName, roomDisplayName, roomSecondaryName } from '@/lib/names';
import { PageHeader, EmptyState, LoadingBlock } from '@/components/ui/Display';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Menu } from '@/components/ui/Overlay';
import { RoomCover, RoomFormDialog, RoomStatusLabel, useRoomActions } from './shared';
import { CoverPicker } from './CoverPicker';

type Sort = 'manual' | 'name' | 'updated' | 'status';

export function RoomsPage() {
  const { t, lang } = useI18n();
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
    const statusOrder = ROOM_STATUSES.map((s) => s.value);
    const floorIds = new Set(floors.map((f) => f.id));
    return rooms
      .filter((r) => (status === 'all' ? true : r.status === status))
      .filter((r) => (floor === 'all' ? true : floor === 'none' ? !r.floorId || !floorIds.has(r.floorId) : r.floorId === floor))
      .filter((r) => !q.trim() || matchesSearch(`${r.name} ${r.nameAr ?? ''} ${roomTypeLabel(r.type)} ${roomTypeLabel(r.type, 'en')} ${r.description}`, q))
      .sort((a, b) =>
        sort === 'name'
          ? roomDisplayName(a, lang).localeCompare(roomDisplayName(b, lang), lang)
          : sort === 'updated'
            ? b.updatedAt.localeCompare(a.updatedAt)
            : sort === 'status'
              ? statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
              : a.order - b.order,
      );
  }, [rooms, floors, q, status, floor, sort, lang]);

  if (!rooms) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        eyebrow={t.rooms.eyebrow}
        title={t.rooms.title}
        description={t.rooms.description}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            {t.rooms.add}
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 min-w-[220px] flex-1 sm:max-w-[320px]">
          <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.rooms.search} className="ps-8" aria-label={t.rooms.search} />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as RoomStatus | 'all')} className="sm:w-[180px]" aria-label={t.rooms.filterStatus}>
          <option value="all">{t.rooms.allStatuses}</option>
          {ROOM_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select value={floor} onChange={(e) => setFloor(e.target.value)} className="sm:w-[170px]" aria-label={t.rooms.filterFloor}>
          <option value="all">{t.rooms.allFloors}</option>
          <option value="none">{t.rooms.noFloor}</option>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {floorDisplayName(f, lang)}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="col-span-2 sm:w-[160px]" aria-label={t.rooms.sort}>
          <option value="manual">{t.rooms.sortDefault}</option>
          <option value="name">{t.rooms.sortName}</option>
          <option value="updated">{t.rooms.sortUpdated}</option>
          <option value="status">{t.rooms.sortStatus}</option>
        </Select>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title={t.rooms.emptyTitle}
          action={
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              {t.rooms.addFirst}
            </Button>
          }
        >
          {t.rooms.emptyBody}
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState
          compact
          title={t.rooms.noMatch}
          action={
            <Button
              onClick={() => {
                setQ('');
                setStatus('all');
                setFloor('all');
              }}
            >
              {t.rooms.clearFilters}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((room) => {
            const shape = computeRoomShape(room);
            const floorName = floorDisplayName(floors.find((f) => f.id === room.floorId), lang);
            const name = roomDisplayName(room, lang);
            const secondary = roomSecondaryName(room, lang);
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
                      {name}
                    </Link>
                    <div className="mt-1 truncate text-[12.5px] text-ink-3">
                      {secondary && (
                        <span dir="auto" className="me-1">
                          {secondary} ·
                        </span>
                      )}
                      {roomTypeLabel(room.type)} · {floorName || t.rooms.floorUnknown}
                    </div>
                  </div>
                  <Menu
                    trigger={<IconButton icon={MoreHorizontal} label={t.rooms.actionsFor(name)} size="md" />}
                    items={[
                      { label: t.rooms.open, icon: LayoutGrid, onSelect: () => navigate(`/rooms/${room.id}/overview`) },
                      { label: t.rooms.redesign, icon: Sparkles, onSelect: () => navigate(`/studio/${room.id}`) },
                      { label: t.rooms.editDetails, icon: Pencil, onSelect: () => setEditing(room) },
                      { label: t.rooms.changeCover, icon: ImageIcon, onSelect: () => setCoverFor(room) },
                      { label: t.common.duplicate, icon: Copy, onSelect: () => actions.duplicate(room) },
                      'separator',
                      { label: t.common.deleteEllipsis, icon: Trash2, danger: true, onSelect: () => actions.remove(room) },
                    ]}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[12.5px]">
                  <dt className="text-ink-3">{t.rooms.dimensions}</dt>
                  <dd className="truncate text-end text-ink-2 tabular">{dimensionSummary(room)}</dd>
                  <dt className="text-ink-3">{t.rooms.area}</dt>
                  <dd className="text-end text-ink-2 tabular">{areaSummary(shape)}</dd>
                  <dt className="text-ink-3">{t.rooms.status}</dt>
                  <dd className="flex justify-end">
                    <RoomStatusLabel status={room.status} />
                  </dd>
                  <dt className="text-ink-3">{t.rooms.versions}</dt>
                  <dd className="text-end text-ink-2 tabular">{num(count)}</dd>
                  <dt className="text-ink-3">{t.rooms.updated}</dt>
                  <dd className="text-end text-ink-2">{timeAgo(room.updatedAt)}</dd>
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
