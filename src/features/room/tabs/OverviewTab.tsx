import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Check, Circle, ImagePlus, Lightbulb } from 'lucide-react';
import type { DesignVersion, Reference, Requirement, Room } from '@/lib/types';
import { computeRoomShape, dimensionSummary } from '@/lib/geometry/room';
import { formatArea, formatLength, isKnown } from '@/lib/units';
import { formatDateTime } from '@/lib/format';
import { roomTypeLabel, spaceKind } from '@/lib/labels';
import { directionIsEmpty } from '@/lib/db/factories';
import { patchRoom } from '@/lib/db/rooms';
import { useFloors, useVersion } from '@/lib/hooks/data';
import { ImageThumb } from '@/components/images/ImageThumb';
import { useLightbox } from '@/components/images/Lightbox';
import { Button } from '@/components/ui/Button';
import { Callout, GroupLabel, KeyValue } from '@/components/ui/Display';
import { CommitInput } from '@/components/ui/Form';
import { cn } from '@/components/ui/cn';
import { RoomCover, RoomStatusLabel } from '../../rooms/shared';
import { CoverPicker } from '../../rooms/CoverPicker';

export function OverviewTab({
  room,
  requirements,
  references,
  versions,
}: {
  room: Room;
  requirements: Requirement[];
  references: Reference[];
  versions: DesignVersion[];
}) {
  const shape = useMemo(() => computeRoomShape(room), [room]);
  const floors = useFloors() ?? [];
  const approved = useVersion(room.approvedVersionId);
  const lightbox = useLightbox();
  const [coverOpen, setCoverOpen] = useState(false);
  const kind = spaceKind(room.type);
  const sitePhotos = references.filter((r) => r.kind === 'site-photo' && r.roomIds.includes(room.id));
  const must = requirements.filter((r) => r.priority === 'must' && r.status !== 'rejected').length;
  const confirmedEls = room.elements.filter((e) => e.status === 'confirmed').length;
  const d = room.direction;

  const checklist: { label: string; done: boolean; detail: string; to: string }[] = [
    {
      label: 'Dimensions',
      done: shape.drawable,
      detail: shape.drawable ? dimensionSummary(room) : shape.missing.length ? `Missing ${shape.missing.join(', ').toLowerCase()}` : 'Unknown',
      to: 'dimensions',
    },
    ...(kind === 'interior'
      ? [
          {
            label: 'Ceiling height',
            done: isKnown(room.ceilingHeight),
            detail: isKnown(room.ceilingHeight) ? formatLength(room.ceilingHeight.mm, room.displayUnit) : 'Unknown',
            to: 'dimensions',
          },
        ]
      : []),
    {
      label: 'Site photos',
      done: sitePhotos.length > 0,
      detail: sitePhotos.length ? `${sitePhotos.length} photo${sitePhotos.length > 1 ? 's' : ''}` : 'None yet',
      to: 'photos',
    },
    {
      label: 'Doors, windows & fixed elements',
      done: room.elements.length > 0,
      detail: room.elements.length ? `${room.elements.length} recorded · ${confirmedEls} confirmed` : 'None recorded',
      to: 'architecture',
    },
    {
      label: 'Requirements',
      done: requirements.length > 0,
      detail: requirements.length ? `${requirements.length} · ${must} must-have` : 'None yet',
      to: 'requirements',
    },
    { label: 'Design direction', done: !directionIsEmpty(d), detail: d.style || (directionIsEmpty(d) ? 'Not set' : 'Custom'), to: 'direction' },
    {
      label: 'Furniture layout',
      done: room.layout.items.length > 0,
      detail: room.layout.items.length ? `${room.layout.items.length} items` : 'Optional',
      to: 'layout',
    },
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
      <div className="flex flex-col gap-10">
        <div className="group relative overflow-hidden rounded-md border border-line">
          <RoomCover room={room} className="aspect-[16/9]" />
          <Button size="sm" icon={ImagePlus} onClick={() => setCoverOpen(true)} className="absolute bottom-3 right-3 !bg-raised/90 backdrop-blur">
            {room.coverReferenceId ? 'Change cover' : 'Set cover photo'}
          </Button>
        </div>

        {room.preliminaryConcept && directionIsEmpty(d) && (
          <Callout
            tone="neutral"
            icon={Lightbulb}
            title="Earlier conceptual idea (not applied)"
            action={
              <Link to={`/rooms/${room.id}/direction`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline">
                Review in Direction <ArrowRight size={12} />
              </Link>
            }
          >
            “{room.preliminaryConcept}” — from earlier discussions. It is a starting point only and is not used in designs unless you adopt it.
          </Callout>
        )}

        <section>
          <GroupLabel>Description</GroupLabel>
          <CommitInput
            multiline
            minRows={3}
            value={room.description}
            onCommit={(v) => patchRoom(room.id, { description: v })}
            placeholder="How is this space used? Who uses it? What matters most here?"
            aria-label="Room description"
          />
        </section>

        <section>
          <GroupLabel
            actions={
              <Link to={`/rooms/${room.id}/direction`} className="text-[12px] text-ink-3 hover:text-ink">
                Edit direction
              </Link>
            }
          >
            Design direction
          </GroupLabel>
          {directionIsEmpty(d) ? (
            <p className="text-[13px] text-ink-3">No direction set for this room yet. Each room's direction is independent of every other room.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="display text-[30px]">{d.style || 'Custom direction'}</div>
              {d.atmosphere && <p className="text-[13.5px] text-ink-2">{d.atmosphere}</p>}
              {d.palette.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {d.palette.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-sm border border-line bg-raised py-1 pl-1 pr-2.5">
                      <span className="h-6 w-6 rounded-[2px] border border-black/5" style={{ background: c.hex }} />
                      <span className="text-[12px] text-ink-2">{c.name || c.hex}</span>
                    </div>
                  ))}
                </div>
              )}
              {d.description && (
                <p className="text-[13px] leading-relaxed text-ink-2" dir="auto">
                  {d.description}
                </p>
              )}
            </div>
          )}
        </section>

        {approved?.imageId && (
          <section>
            <GroupLabel>Approved design · v{approved.number}</GroupLabel>
            <ImageThumb
              imageId={approved.imageId}
              variant="full"
              className="aspect-[3/2] w-full rounded-md border border-line"
              onClick={() => lightbox([{ imageId: approved.imageId!, title: `${room.name} · v${approved.number}`, description: approved.notes }])}
            />
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-8">
        <div className="rounded-md border border-line bg-surface p-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <KeyValue label="Type">{roomTypeLabel(room.type)}</KeyValue>
            <KeyValue label="Floor">{floors.find((f) => f.id === room.floorId)?.name ?? 'Unknown'}</KeyValue>
            <KeyValue label="Area">
              <span className="tabular">
                {shape.area.mm2 === null ? 'Unknown' : `${shape.area.certainty === 'estimated' ? '≈ ' : ''}${formatArea(shape.area.mm2)}`}
              </span>
            </KeyValue>
            <KeyValue label="Perimeter">
              <span className="tabular">{formatLength(shape.perimeter.mm, room.displayUnit)}</span>
            </KeyValue>
            {kind === 'interior' && (
              <KeyValue label="Ceiling">
                <span className="tabular">{formatLength(room.ceilingHeight.mm, room.displayUnit)}</span>
              </KeyValue>
            )}
            <KeyValue label="Status">
              <RoomStatusLabel status={room.status} />
            </KeyValue>
            <KeyValue label="Versions">{versions.length}</KeyValue>
            <KeyValue label="Last modified" className="col-span-2">
              <span className="text-[12.5px]">{formatDateTime(room.updatedAt)}</span>
            </KeyValue>
          </div>
        </div>

        <div>
          <GroupLabel>Information for the AI</GroupLabel>
          <ul className="flex flex-col">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link to={`/rooms/${room.id}/${c.to}`} className="flex items-center gap-3 border-b border-line py-2.5 hover:bg-mist/40">
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', c.done ? 'bg-ok text-white' : 'text-ink-4')}>
                    {c.done ? <Check size={11} strokeWidth={3} /> : <Circle size={14} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-ink">{c.label}</span>
                    <span className="block truncate text-[11.5px] text-ink-3">{c.detail}</span>
                  </span>
                  <ArrowRight size={13} className="text-ink-4" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
            The more confirmed information a room has, the closer generated designs stay to the real space. Nothing missing is invented.
          </p>
        </div>
      </aside>
      <CoverPicker room={coverOpen ? room : null} onClose={() => setCoverOpen(false)} />
    </div>
  );
}
