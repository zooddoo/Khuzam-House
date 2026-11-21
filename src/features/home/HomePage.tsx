import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Check, ImagePlus, Map as MapIcon, MapPin, Play, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAllRequirements, useProject, useReference, useReferences, useRooms, useSettings, useTasks, useVersions } from '@/lib/hooks/data';
import { deriveTasks } from '@/lib/tasks';
import { addTask, deleteTask, toggleTask, updateProject } from '@/lib/db/misc';
import { updateSettings } from '@/lib/db/settings';
import { roomTypeLabel, versionStatusMeta } from '@/lib/labels';
import { projectDisplayName, projectLocation, roomDisplayName, roomSecondaryName } from '@/lib/names';
import { useI18n } from '@/i18n';
import { num, timeAgo } from '@/i18n/format';
import { ImageThumb } from '@/components/images/ImageThumb';
import { ReferencePicker } from '@/components/images/references';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Callout, LoadingBlock, SectionHeader, StatusLabel } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Form';
import { RoomCover, RoomFormDialog, RoomStatusLabel } from '../rooms/shared';

export function HomePage() {
  const { t, lang } = useI18n();
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

  const roomName = (id: string | null) => roomDisplayName(rooms.find((r) => r.id === id), lang);
  const designing = rooms.filter((r) => ['designing', 'review', 'needs-revision'].includes(r.status)).length;
  const approved = rooms.filter((r) => r.status === 'approved').length;
  const recentRooms = [...rooms].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const recentVersions = versions.filter((v) => v.imageId).slice(0, 6);
  const lastRoom = settings?.lastStudioRoomId ? rooms.find((r) => r.id === settings.lastStudioRoomId) : null;
  const openTasks = tasks.filter((x) => !x.done);
  const doneTasks = tasks.filter((x) => x.done).slice(-5);

  return (
    <div>
      {/* Hero */}
      <section className="relative mb-8 overflow-hidden rounded-md border border-line bg-surface sm:mb-10">
        <div className="grid md:min-h-[340px] md:grid-cols-[1.1fr_1fr]">
          <div className="relative order-2 flex flex-col justify-between gap-6 p-5 sm:gap-8 sm:p-10 md:order-1">
            <div>
              <div className="eyebrow mb-3 sm:mb-4">{t.home.eyebrow}</div>
              <h1 className="display text-[44px] leading-[0.98] sm:text-[72px]">{projectDisplayName(project, lang)}</h1>
              <div className="mt-3 flex items-center gap-2 text-[13.5px] text-ink-2 sm:mt-4">
                <MapPin size={14} strokeWidth={1.6} className="shrink-0 text-ink-3" /> {projectLocation(project, lang)}
              </div>
              {project.description && (
                <p className="mt-4 max-w-[460px] text-[13.5px] leading-relaxed text-ink-3" dir="auto">
                  {project.description}
                </p>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3 text-[13px] sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-3">
              <Stat value={rooms.length} label={t.home.rooms} />
              <Stat value={designing} label={t.home.designing} />
              <Stat value={versions.length} label={t.home.concepts} />
              <Stat value={approved} label={t.home.approved} />
            </div>
          </div>
          <div className="relative order-1 min-h-[190px] sm:min-h-[240px] md:order-2">
            {cover ? (
              <ImageThumb imageId={cover.imageId} variant="full" className="absolute inset-0 h-full w-full" alt={t.home.coverAlt} />
            ) : (
              <div className="hairline-grid absolute inset-0 flex flex-col items-center justify-center gap-3 bg-mist/50 text-center">
                <span className="text-[13px] text-ink-3">{t.home.noCover}</span>
                <Button size="sm" icon={ImagePlus} onClick={() => setCoverPicker(true)}>
                  {t.home.addCover}
                </Button>
              </div>
            )}
            {cover && (
              <Button size="sm" variant="secondary" icon={ImagePlus} onClick={() => setCoverPicker(true)} className="absolute bottom-3 end-3 !bg-raised/90 backdrop-blur">
                {t.home.changeCover}
              </Button>
            )}
          </div>
        </div>
      </section>

      {settings && !settings.welcomeDismissed && (
        <Callout
          tone="neutral"
          className="mb-8 sm:mb-10"
          title={t.home.welcomeTitle}
          action={
            <Button size="sm" variant="ghost" icon={X} onClick={() => updateSettings((s) => void (s.welcomeDismissed = true))}>
              {t.common.dismiss}
            </Button>
          }
        >
          {t.home.welcomeBody}
        </Callout>
      )}

      {/* Quick actions */}
      <section className="mb-10 grid grid-cols-2 gap-2 sm:mb-12 sm:flex sm:flex-wrap">
        <Button variant="primary" icon={Plus} onClick={() => setAddRoomOpen(true)}>
          {t.home.addRoom}
        </Button>
        <ButtonLink to="/studio" icon={Sparkles}>
          {t.home.newDesign}
        </ButtonLink>
        <ButtonLink to="/library/references?upload=1" icon={Upload}>
          {t.home.uploadRefs}
        </ButtonLink>
        <ButtonLink to="/floor-plans" icon={MapIcon}>
          {t.home.editFloorPlan}
        </ButtonLink>
        {lastRoom ? (
          <ButtonLink to={`/studio/${lastRoom.id}`} icon={Play} className="col-span-2 sm:col-span-1">
            <span className="truncate">{t.home.continueRoom(roomDisplayName(lastRoom, lang))}</span>
          </ButtonLink>
        ) : (
          <Button icon={Play} disabled title={t.home.continueHint} className="col-span-2 sm:col-span-1">
            {t.home.continueLast}
          </Button>
        )}
      </section>

      <div className="grid gap-12 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section>
          <SectionHeader
            title={t.home.recentlyUpdated}
            actions={
              <Link to="/rooms" className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">
                {t.home.allRooms} <ArrowRight size={13} className="rtl:-scale-x-100" />
              </Link>
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
            {recentRooms.map((room) => (
              <Link key={room.id} to={`/rooms/${room.id}/overview`} className="group flex gap-4 rounded-md border border-line bg-surface p-3 transition-shadow hover:shadow-soft">
                <div className="w-[96px] shrink-0 overflow-hidden rounded-sm sm:w-[120px]">
                  <RoomCover room={room} className="aspect-square" />
                </div>
                <div className="min-w-0 py-1">
                  <div className="display truncate text-[22px] leading-tight group-hover:text-accent">{roomDisplayName(room, lang)}</div>
                  <div className="mt-1 truncate text-[12px] text-ink-3">
                    {roomSecondaryName(room, lang) || roomTypeLabel(room.type)}
                  </div>
                  <RoomStatusLabel status={room.status} className="mt-2" />
                  <div className="mt-1 text-[11.5px] text-ink-4">{t.home.updated(timeAgo(room.updatedAt))}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title={t.home.tasksTitle} />
          <div className="rounded-md border border-line bg-surface">
            <form
              className="flex flex-wrap gap-2 border-b border-line p-3 sm:flex-nowrap"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!taskText.trim()) return;
                await addTask(taskText, taskRoom || null);
                setTaskText('');
              }}
            >
              <Input value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder={t.home.addTaskPlaceholder} aria-label={t.home.newTask} className="min-w-0 flex-1" />
              <div className="flex flex-1 gap-2 sm:flex-none">
                <Select value={taskRoom} onChange={(e) => setTaskRoom(e.target.value)} className="w-full sm:w-[150px]" aria-label={t.home.taskRoom}>
                  <option value="">{t.home.anyRoom}</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {roomDisplayName(r, lang)}
                    </option>
                  ))}
                </Select>
                <IconButton icon={Plus} label={t.home.addTask} variant="secondary" size="md" type="submit" />
              </div>
            </form>
            <ul className="scroll-thin max-h-[420px] divide-y divide-line overflow-y-auto">
              {openTasks.map((task) => (
                <li key={task.id} className="group flex items-center gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    aria-label={t.home.markDone}
                    onClick={() => toggleTask(task.id, true)}
                    className="touch-target flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong hover:border-ink"
                  />
                  <span className="min-w-0 flex-1 text-[13px]">
                    <span dir="auto">{task.title}</span>
                    {task.roomId && <span className="ms-2 text-[11.5px] text-ink-3">{roomName(task.roomId)}</span>}
                  </span>
                  <IconButton
                    icon={Trash2}
                    label={t.home.deleteTask}
                    size="xs"
                    variant="danger"
                    className="opacity-100 group-hover:opacity-100 focus:opacity-100 sm:opacity-0"
                    onClick={() => deleteTask(task.id)}
                  />
                </li>
              ))}
              {derived.slice(0, 10).map((d) => (
                <li key={d.id}>
                  <Link to={d.to} className="flex min-h-11 items-center gap-3 px-3 py-2.5 hover:bg-mist/60">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="min-w-0 flex-1 text-[13px]">
                      {d.title} <span className="text-ink-3">· {d.roomName}</span>
                    </span>
                    <ArrowRight size={13} className="text-ink-4 rtl:-scale-x-100" />
                  </Link>
                </li>
              ))}
              {doneTasks.map((task) => (
                <li key={task.id} className="group flex items-center gap-3 px-3 py-2 text-ink-4">
                  <button
                    type="button"
                    aria-label={t.home.markNotDone}
                    onClick={() => toggleTask(task.id, false)}
                    className="touch-target flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok text-white"
                  >
                    <Check size={10} strokeWidth={3} />
                  </button>
                  <span className="min-w-0 flex-1 text-[12.5px] line-through" dir="auto">
                    {task.title}
                  </span>
                  <IconButton
                    icon={Trash2}
                    label={t.home.deleteTask}
                    size="xs"
                    variant="danger"
                    className="opacity-100 group-hover:opacity-100 sm:opacity-0"
                    onClick={() => deleteTask(task.id)}
                  />
                </li>
              ))}
              {!openTasks.length && !derived.length && !doneTasks.length && <li className="px-3 py-8 text-center text-[12.5px] text-ink-3">{t.home.nothingPending}</li>}
            </ul>
          </div>
        </section>
      </div>

      <section className="mt-12 sm:mt-14">
        <SectionHeader
          title={t.home.recentConcepts}
          actions={
            <Link to="/library/concepts" className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">
              {t.home.library} <ArrowRight size={13} className="rtl:-scale-x-100" />
            </Link>
          }
        />
        {recentVersions.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-strong/70 px-6 py-10 text-center text-[13px] text-ink-3">{t.home.conceptsEmpty}</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {recentVersions.map((v) => {
              const meta = versionStatusMeta(v.status);
              return (
                <button key={v.id} type="button" onClick={() => navigate(`/library/concepts/${v.id}`)} className="group text-start">
                  <ImageThumb imageId={v.imageId} className="aspect-[4/3] w-full rounded-md border border-line" />
                  <div className="mt-2 truncate text-[13px] group-hover:text-accent">
                    {roomName(v.roomId)} · {t.versions.short(v.number)}
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

      <section className="mt-12 sm:mt-14">
        <SectionHeader title={t.home.allRooms} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {rooms.map((room) => (
            <Link key={room.id} to={`/rooms/${room.id}/overview`} className="group">
              <div className="overflow-hidden rounded-md border border-line">
                <RoomCover room={room} className="aspect-[4/3]" />
              </div>
              <div className="mt-2 truncate text-[13.5px] group-hover:text-accent">{roomDisplayName(room, lang)}</div>
              <RoomStatusLabel status={room.status} className="mt-0.5" />
            </Link>
          ))}
        </div>
      </section>

      <ReferencePicker
        open={coverPicker}
        onOpenChange={setCoverPicker}
        single
        imagesOnly
        title={t.home.coverTitle}
        confirmLabel={t.home.useAsCover}
        uploadDefaults={{ kind: 'site-photo', title: t.home.coverCaption }}
        onPick={async (ids) => {
          await updateProject({ coverReferenceId: ids[0] ?? null });
          toast.success(t.home.coverUpdated);
        }}
      />
      <RoomFormDialog open={addRoomOpen} onOpenChange={setAddRoomOpen} />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0">
      <div className="display text-[28px] leading-none tabular sm:text-[34px]">{num(value)}</div>
      <div className="eyebrow mt-1 truncate">{label}</div>
    </div>
  );
}
