import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Check, Circle, ImagePlus, Lightbulb } from 'lucide-react';
import type { DesignVersion, Reference, Requirement, Room } from '@/lib/types';
import { computeRoomShape, dimensionSummary } from '@/lib/geometry/room';
import { formatArea, formatLength, isKnown } from '@/lib/units';
import { fmtDateTime, num } from '@/i18n/format';
import { useI18n } from '@/i18n';
import { floorDisplayName, roomDisplayName } from '@/lib/names';
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
  const { t, lang } = useI18n();
  const o = t.overview;
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
      label: o.dimensions,
      done: shape.drawable,
      detail: shape.drawable ? dimensionSummary(room) : shape.missing.length ? o.missing(shape.missing.join('، ')) : t.common.unknown,
      to: 'dimensions',
    },
    ...(kind === 'interior'
      ? [
          {
            label: o.ceiling,
            done: isKnown(room.ceilingHeight),
            detail: isKnown(room.ceilingHeight) ? formatLength(room.ceilingHeight.mm, room.displayUnit) : t.common.unknown,
            to: 'dimensions',
          },
        ]
      : []),
    { label: o.sitePhotos, done: sitePhotos.length > 0, detail: sitePhotos.length ? o.photos(sitePhotos.length) : o.noneYet, to: 'photos' },
    {
      label: o.elements,
      done: room.elements.length > 0,
      detail: room.elements.length ? o.elementsDetail(room.elements.length, confirmedEls) : o.noneRecorded,
      to: 'architecture',
    },
    { label: o.requirements, done: requirements.length > 0, detail: requirements.length ? o.requirementsDetail(requirements.length, must) : o.noneYet, to: 'requirements' },
    { label: o.direction, done: !directionIsEmpty(d), detail: d.style || (directionIsEmpty(d) ? o.notSet : o.custom), to: 'direction' },
    { label: o.layout, done: room.layout.items.length > 0, detail: room.layout.items.length ? o.items(room.layout.items.length) : o.optional, to: 'layout' },
  ];
  const concept = lang === 'ar' ? room.preliminaryConceptAr || room.preliminaryConcept : room.preliminaryConcept;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] lg:gap-10">
      <div className="flex flex-col gap-10">
        <div className="group relative overflow-hidden rounded-md border border-line">
          <RoomCover room={room} className="aspect-[16/9]" />
          <Button size="sm" icon={ImagePlus} onClick={() => setCoverOpen(true)} className="absolute bottom-3 end-3 !bg-raised/90 backdrop-blur">
            {room.coverReferenceId ? o.changeCover : o.setCover}
          </Button>
        </div>

        {concept && directionIsEmpty(d) && (
          <Callout
            tone="neutral"
            icon={Lightbulb}
            title={o.earlierIdea}
            action={
              <Link to={`/rooms/${room.id}/direction`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline">
                {o.reviewInDirection} <ArrowRight size={12} className="rtl:-scale-x-100" />
              </Link>
            }
          >
            {o.earlierIdeaBody(concept)}
          </Callout>
        )}

        <section>
          <GroupLabel>{o.description}</GroupLabel>
          <CommitInput
            multiline
            minRows={3}
            value={room.description}
            onCommit={(v) => patchRoom(room.id, { description: v })}
            placeholder={o.descriptionPlaceholder}
            aria-label={o.descriptionAria}
          />
        </section>

        <section>
          <GroupLabel
            actions={
              <Link to={`/rooms/${room.id}/direction`} className="text-[12px] text-ink-3 hover:text-ink">
                {o.editDirection}
              </Link>
            }
          >
            {o.direction}
          </GroupLabel>
          {directionIsEmpty(d) ? (
            <p className="text-[13px] text-ink-3">{o.noDirection}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="display text-[30px]" dir="auto">
                {d.style || o.customDirection}
              </div>
              {d.atmosphere && (
                <p className="text-[13.5px] text-ink-2" dir="auto">
                  {d.atmosphere}
                </p>
              )}
              {d.palette.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {d.palette.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-sm border border-line bg-raised py-1 pe-2.5 ps-1">
                      <span className="h-6 w-6 rounded-[2px] border border-black/5" style={{ background: c.hex }} />
                      <span className="text-[12px] text-ink-2" dir="auto">
                        {c.name || c.hex}
                      </span>
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
            <GroupLabel>{o.approvedDesign(t.versions.short(approved.number))}</GroupLabel>
            <ImageThumb
              imageId={approved.imageId}
              variant="full"
              className="aspect-[3/2] w-full rounded-md border border-line"
              onClick={() => lightbox([{ imageId: approved.imageId!, title: `${roomDisplayName(room, lang)} · ${t.versions.short(approved.number)}`, description: approved.notes }])}
            />
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-8">
        <div className="rounded-md border border-line bg-surface p-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <KeyValue label={o.type}>{roomTypeLabel(room.type)}</KeyValue>
            <KeyValue label={o.floor}>{floorDisplayName(floors.find((f) => f.id === room.floorId), lang) || t.common.unknown}</KeyValue>
            <KeyValue label={o.area}>
              <span className="tabular">{shape.area.mm2 === null ? t.common.unknown : `${shape.area.certainty === 'estimated' ? '≈ ' : ''}${formatArea(shape.area.mm2)}`}</span>
            </KeyValue>
            <KeyValue label={o.perimeter}>
              <span className="tabular">{formatLength(shape.perimeter.mm, room.displayUnit)}</span>
            </KeyValue>
            {kind === 'interior' && (
              <KeyValue label={o.ceilingShort}>
                <span className="tabular">{formatLength(room.ceilingHeight.mm, room.displayUnit)}</span>
              </KeyValue>
            )}
            <KeyValue label={o.status}>
              <RoomStatusLabel status={room.status} />
            </KeyValue>
            <KeyValue label={o.versions}>{num(versions.length)}</KeyValue>
            <KeyValue label={o.lastModified} className="col-span-2">
              <span className="text-[12.5px]">{fmtDateTime(room.updatedAt)}</span>
            </KeyValue>
          </div>
        </div>

        <div>
          <GroupLabel>{o.forAi}</GroupLabel>
          <ul className="flex flex-col">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link to={`/rooms/${room.id}/${c.to}`} className="flex min-h-12 items-center gap-3 border-b border-line py-2.5 hover:bg-mist/40">
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', c.done ? 'bg-ok text-white' : 'text-ink-4')}>
                    {c.done ? <Check size={11} strokeWidth={3} /> : <Circle size={14} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-ink">{c.label}</span>
                    <span className="block truncate text-[11.5px] text-ink-3">{c.detail}</span>
                  </span>
                  <ArrowRight size={13} className="text-ink-4 rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">{o.forAiHint}</p>
        </div>
      </aside>
      <CoverPicker room={coverOpen ? room : null} onClose={() => setCoverOpen(false)} />
    </div>
  );
}
