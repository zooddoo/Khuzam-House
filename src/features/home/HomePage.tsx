import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Check, ImagePlus, Map as MapIcon, MapPin, Play, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAllRequirements, useProject, useReference, useReferences, useRooms, useSettings, useTasks, useVersions } from '@/lib/hooks/data';
import { deriveTasks } from '@/lib/tasks';
import { addTask, deleteTask, toggleTask, updateProject } from '@/lib/db/misc';
import { updateSettings } from '@/lib/db/settings';
import { roomTypeLabel, versionStatusMeta } from '@/lib/labels';
import { timeAgo } from '@/lib/format';
import { ImageThumb } from '@/components/images/ImageThumb';
import { ReferencePicker } from '@/components/images/references';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Callout, LoadingBlock, SectionHeader, StatusLabel } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Form';
import { cn } from '@/components/ui/cn';
import { RoomCover, RoomFormDialog, RoomStatusLabel } from '../rooms/shared';

export function HomePage() {
  const project = useProject();
  const rooms = useRooms();
  const reqs = useAllRequirements() ?? [];
  const refs = useReferences() ?? [];
  const versions = useVersions() ?? [];
  const tasks = useTasks() ?? [];
  const settings = useSettings();
  const cover = useReference(project?.coverReferenceId);
  const navigate = useNavigate();
  const [coverPicker, setCoverPicker] = useState(false);
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [taskRoom, setTaskRoom] = useState('');

  const derived = useMemo(() => deriveTasks(rooms ?? [], reqs, refs, versions), [rooms, reqs, refs, versions]);

  if (!project || !rooms) return <LoadingBlock />;

  const designing = rooms.filter((r) => ['designing', 'review', 'needs-revision'].includes(r.status)).length;
  const approved = rooms.filter((r) => r.status === 'approved').length;
  const recentRooms = [...rooms].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const recentVersions = versions.filter((v) => v.imageId).slice(0, 6);
  const lastRoom = settings?.lastStudioRoomId ? rooms.find((r) => r.id === settings.lastStudioRoomId) : null;
  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done).slice(-5);

  return (
    <div>
      {/* Hero */}
      <section className="relative mb-10 overflow-hidden rounded-md border border-line bg-surface">
        <div className="grid min-h-[340px] md:grid-cols-[1.1fr_1fr]">
          <div className="relative order-2 flex flex-col justify-between gap-8 p-7 sm:p-10 md:order-1">
            <div>
              <div className="eyebrow mb-4">Home design studio</div>
              <h1 className="display text-[56px] leading-[0.95] sm:text-[72px]">{project.name}</h1>
              <div className="mt-4 flex items-center gap-2 text-[13.5px] text-ink-2">
                <MapPin size={14} strokeWidth={1.6} className="text-ink-3" /> {project.location}
              </div>
              {project.description && <p className="mt-4 max-w-[460px] text-[13.5px] leading-relaxed text-ink-3">{project.description}</p>}
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-[13px]">
              <Stat value={rooms.length} label="Rooms" />
              <Stat value={designing} label="Being designed" />
              <Stat value={versions.length} label="Concepts" />
              <Stat value={approved} label="Approved" />
            </div>
          </div>
          <div className="relative order-1 min-h-[240px] md:order-2">
            {cover ? (
              <ImageThumb imageId={cover.imageId} variant="full" className="absolute inset-0 h-full w-full" alt="Project cover" />
            ) : (
              <div className="hairline-grid absolute inset-0 flex flex-col items-center justify-center gap-3 bg-mist/50 text-center">
                <span className="text-[13px] text-ink-3">No cover photo yet</span>
                <Button size="sm" icon={ImagePlus} onClick={() => setCoverPicker(true)}>
                  Add a cover photo
                </Button>
              </div>
            )}
            {cover && (
              <Button
                size="sm"
                variant="secondary"
                icon={ImagePlus}
                onClick={() => setCoverPicker(true)}
                className="absolute bottom-4 right-4 !bg-raised/90 backdrop-blur"
              >
                Change cover
              </Button>
            )}
          </div>
        </div>
      </section>

      {settings && !settings.welcomeDismissed && (
        <Callout
          tone="neutral"
          className="mb-10"
          title="Your rooms were set up from the project brief"
          action={
            <Button size="sm" variant="ghost" icon={X} onClick={() => updateSettings((s) => void (s.welcomeDismissed = true))}>
              Dismiss
            </Button>
          }
        >
          No floor plans, measurements or photos were included with the project files, so every dimension is marked <strong>Unknown</strong> and no floor is
          assigned. Earlier conceptual ideas are kept as notes inside each room’s Direction tab — they are not applied until you choose to. Add real
          measurements, photos and requirements room by room.
        </Callout>
      )}

      {/* Quick actions */}
      <section className="mb-12 flex flex-wrap gap-2">
        <Button variant="primary" icon={Plus} onClick={() => setAddRoomOpen(true)}>
          Add room
        </Button>
        <ButtonLink to="/studio" icon={Sparkles}>
          Start new design
        </ButtonLink>
        <ButtonLink to="/library/references?upload=1" icon={Upload}>
          Upload references
        </ButtonLink>
        <ButtonLink to="/floor-plans" icon={MapIcon}>
          Edit floor plan
        </ButtonLink>
        {lastRoom ? (
          <ButtonLink to={`/studio/${lastRoom.id}`} icon={Play}>
            Continue {lastRoom.name}
          </ButtonLink>
        ) : (
          <Button icon={Play} disabled title="Start a design in the Design Studio first">
            Continue last design
          </Button>
        )}
      </section>

      <div className="grid gap-12 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section>
          <SectionHeader
            title="Recently updated"
            actions={
              <Link to="/rooms" className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">
                All rooms <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {recentRooms.map((room) => (
              <Link
                key={room.id}
                to={`/rooms/${room.id}/overview`}
                className="group flex gap-4 rounded-md border border-line bg-surface p-3 transition-shadow hover:shadow-soft"
              >
                <div className="w-[120px] shrink-0 overflow-hidden rounded-sm">
                  <RoomCover room={room} className="aspect-square" />
                </div>
                <div className="min-w-0 py-1">
                  <div className="display truncate text-[22px] leading-tight group-hover:text-accent">{room.name}</div>
                  <div className="mt-1 text-[12px] text-ink-3">{roomTypeLabel(room.type)}</div>
                  <RoomStatusLabel status={room.status} className="mt-3" />
                  <div className="mt-1 text-[11.5px] text-ink-4">Updated {timeAgo(room.updatedAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="Pending design tasks" />
          <div className="rounded-md border border-line bg-surface">
            <form
              className="flex gap-2 border-b border-line p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!taskText.trim()) return;
                await addTask(taskText, taskRoom || null);
                setTaskText('');
              }}
            >
              <Input value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder="Add a task…" aria-label="New task" />
              <Select value={taskRoom} onChange={(e) => setTaskRoom(e.target.value)} className="w-[150px]" aria-label="Task room">
                <option value="">Any room</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
              <IconButton icon={Plus} label="Add task" variant="secondary" size="md" type="submit" />
            </form>
            <ul className="scroll-thin max-h-[420px] divide-y divide-line overflow-y-auto">
              {openTasks.map((t) => (
                <li key={t.id} className="group flex items-center gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    aria-label="Mark done"
                    onClick={() => toggleTask(t.id, true)}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line-strong hover:border-ink"
                  />
                  <span className="min-w-0 flex-1 text-[13px]" dir="auto">
                    {t.title}
                    {t.roomId && <span className="ml-2 text-[11.5px] text-ink-3">{rooms.find((r) => r.id === t.roomId)?.name}</span>}
                  </span>
                  <IconButton
                    icon={Trash2}
                    label="Delete task"
                    size="xs"
                    variant="danger"
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                    onClick={() => deleteTask(t.id)}
                  />
                </li>
              ))}
              {derived.slice(0, 10).map((t) => (
                <li key={t.id}>
                  <Link to={t.to} className="flex items-center gap-3 px-3 py-2.5 hover:bg-mist/60">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="min-w-0 flex-1 text-[13px]">
                      {t.title} <span className="text-ink-3">· {t.roomName}</span>
                    </span>
                    <ArrowRight size={13} className="text-ink-4" />
                  </Link>
                </li>
              ))}
              {doneTasks.map((t) => (
                <li key={t.id} className="group flex items-center gap-3 px-3 py-2 text-ink-4">
                  <button
                    type="button"
                    aria-label="Mark not done"
                    onClick={() => toggleTask(t.id, false)}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ok text-white"
                  >
                    <Check size={10} strokeWidth={3} />
                  </button>
                  <span className="min-w-0 flex-1 text-[12.5px] line-through" dir="auto">
                    {t.title}
                  </span>
                  <IconButton
                    icon={Trash2}
                    label="Delete task"
                    size="xs"
                    variant="danger"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => deleteTask(t.id)}
                  />
                </li>
              ))}
              {!openTasks.length && !derived.length && !doneTasks.length && (
                <li className="px-3 py-8 text-center text-[12.5px] text-ink-3">Nothing pending.</li>
              )}
            </ul>
          </div>
        </section>
      </div>

      <section className="mt-14">
        <SectionHeader
          title="Recent concepts"
          actions={
            <Link to="/library/concepts" className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">
              Design Library <ArrowRight size={13} />
            </Link>
          }
        />
        {recentVersions.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-strong/70 px-6 py-10 text-center text-[13px] text-ink-3">
            Concepts you generate or import appear here. Open a room and choose <strong className="text-ink-2">Redesign This Room</strong> to start.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {recentVersions.map((v) => {
              const room = rooms.find((r) => r.id === v.roomId);
              const meta = versionStatusMeta(v.status);
              return (
                <button key={v.id} type="button" onClick={() => navigate(`/library/concepts/${v.id}`)} className="group text-left">
                  <ImageThumb imageId={v.imageId} className="aspect-[4/3] w-full rounded-md border border-line" />
                  <div className="mt-2 truncate text-[13px] group-hover:text-accent">
                    {room?.name} · v{v.number}
                  </div>
                  <StatusLabel tone={meta.tone} className="mt-0.5">
                    {meta.label}
                  </StatusLabel>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-14">
        <SectionHeader title="All rooms" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {rooms.map((room) => (
            <Link key={room.id} to={`/rooms/${room.id}/overview`} className="group">
              <div className="overflow-hidden rounded-md border border-line">
                <RoomCover room={room} className="aspect-[4/3]" />
              </div>
              <div className="mt-2 truncate text-[13.5px] group-hover:text-accent">{room.name}</div>
              <RoomStatusLabel status={room.status} className={cn('mt-0.5')} />
            </Link>
          ))}
        </div>
      </section>

      <ReferencePicker
        open={coverPicker}
        onOpenChange={setCoverPicker}
        single
        title="Project cover photo"
        confirmLabel="Use as cover"
        uploadDefaults={{ kind: 'site-photo', title: 'Project cover' }}
        onPick={async (ids) => {
          await updateProject({ coverReferenceId: ids[0] ?? null });
          toast.success('Cover updated');
        }}
      />
      <RoomFormDialog open={addRoomOpen} onOpenChange={setAddRoomOpen} />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="display text-[34px] leading-none tabular">{value}</div>
      <div className="mt-1 text-[11.5px] uppercase tracking-[0.12em] text-ink-3">{label}</div>
    </div>
  );
}
