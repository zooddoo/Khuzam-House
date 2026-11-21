import { useMemo, useState } from 'react';
import { Library, Link2Off, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { ArchElement, Reference, Room, WallDesign } from '@/lib/types';
import { computeRoomShape, effectiveWallHeight, wallStartLabel } from '@/lib/geometry/room';
import { formatLength } from '@/lib/units';
import { certaintyMeta } from '@/lib/labels';
import { updateRoom } from '@/lib/db/rooms';
import { linkReferences, unlinkReferences } from '@/lib/db/references';
import { useSettings } from '@/lib/hooks/data';
import { WallElevation } from '@/components/plan/WallElevation';
import { PlanPreview } from '@/components/plan/PlanPreview';
import { ImageThumb } from '@/components/images/ImageThumb';
import { useLightbox } from '@/components/images/Lightbox';
import { ReferencePicker } from '@/components/images/references';
import { PickerButtons, UploadButton } from '@/components/images/Dropzone';
import { wallTitle } from '@/lib/geometry/names';
import { useI18n, useT } from '@/i18n';
import { elementDisplayLabel } from '@/components/images/references';
import { EnglishField } from '@/components/translate/EnglishField';
import { useUploadReferences } from '@/components/images/useUpload';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, CommitInput, Field, Toggle } from '@/components/ui/Form';
import { MeasureInput } from '@/components/ui/MeasureInput';
import { EmptyState, GroupLabel, StatusLabel } from '@/components/ui/Display';
import { ElementDialog } from '../architecture/ElementDialog';
import { elementSummary } from './ArchitectureTab';

const DESIGN_FIELDS: (keyof WallDesign)[] = ['cladding', 'tv', 'artwork', 'lighting', 'furniture', 'other'];

function WallImages({ room, wallKey, title, images, kind }: { room: Room; wallKey: string; title: string; images: Reference[]; kind: Reference['kind'] }) {
  const t = useT();
  const lightbox = useLightbox();
  const { upload, busy } = useUploadReferences();
  const [picker, setPicker] = useState(false);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="eyebrow">{title}</span>
        <div className="flex gap-1.5">
          <span className="hidden sm:inline-flex">
            <UploadButton size="sm" loading={busy} onFiles={(files) => upload(files, { kind, roomIds: [room.id], wallKeys: [wallKey] })}>
              {t.walls.upload}
            </UploadButton>
          </span>
          <Button size="sm" variant="ghost" icon={Library} onClick={() => setPicker(true)}>
            {t.walls.link}
          </Button>
        </div>
      </div>
      <PickerButtons className="mb-2 sm:hidden" disabled={busy} onFiles={(files) => void upload(files, { kind, roomIds: [room.id], wallKeys: [wallKey] })} />
      {images.length === 0 ? (
        <p className="rounded-sm border border-dashed border-line-strong/70 px-3 py-4 text-center text-[12px] text-ink-3">{t.walls.none}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((r) => (
            <div key={r.id} className="group relative">
              <ImageThumb
                imageId={r.imageId}
                showName
                className="aspect-[4/3] w-full rounded-sm border border-line"
                onClick={() =>
                  lightbox(
                    images.map((x) => ({ imageId: x.imageId, title: x.title, description: x.explanation })),
                    images.indexOf(r),
                  )
                }
              />
              <IconButton
                icon={Link2Off}
                label={t.walls.unlink}
                size="xs"
                variant="overlay"
                className="absolute end-1.5 top-1.5 opacity-100 group-hover:opacity-100 focus:opacity-100 sm:opacity-0"
                onClick={async () => {
                  await unlinkReferences([r.id], 'wallKeys', wallKey);
                  toast.success(t.walls.unlinked);
                }}
              />
              {r.title && (
                <div className="mt-1 truncate text-[11.5px] text-ink-3" dir="auto">
                  {r.title}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <ReferencePicker
        open={picker}
        onOpenChange={setPicker}
        preferRoomId={room.id}
        excludeIds={images.map((i) => i.id)}
        title={title}
        uploadDefaults={{ kind, roomIds: [room.id], wallKeys: [wallKey] }}
        onPick={async (ids) => {
          await linkReferences(ids, 'wallKeys', wallKey);
          await linkReferences(ids, 'roomIds', room.id);
        }}
      />
    </div>
  );
}

export function WallsTab({ room, references }: { room: Room; references: Reference[] }) {
  const { t, lang } = useI18n();
  const W = t.walls;
  const shape = useMemo(() => computeRoomShape(room), [room]);
  const settings = useSettings();
  const [wallId, setWallId] = useState<string | null>(shape.segments[0]?.id ?? null);
  const [editing, setEditing] = useState<ArchElement | null>(null);
  const [adding, setAdding] = useState(false);
  const seg = shape.segments.find((s) => s.id === wallId) ?? shape.segments[0];

  if (!seg) {
    return <EmptyState title={W.emptyTitle}>{W.emptyBody}</EmptyState>;
  }
  const idx = room.walls.findIndex((w) => w.id === seg.id);
  const wall = room.walls[idx];
  const wallKey = `${room.id}:${seg.id}`;
  const linked = references.filter((r) => r.wallKeys.includes(wallKey));
  const photos = linked.filter((r) => r.kind === 'site-photo');
  const designRefs = linked.filter((r) => r.kind !== 'site-photo');
  const elements = room.elements.filter((e) => e.placement === 'wall' && e.wallId === seg.id);
  const h = effectiveWallHeight(wall, room.ceilingHeight);

  return (
    <div className="flex flex-col gap-8">
      <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label={W.wallsAria}>
        {shape.segments.map((s) => (
          <Chip key={s.id} active={s.id === seg.id} onClick={() => setWallId(s.id)} className="shrink-0">
            {wallTitle(s, lang)}
            <span className="text-[11px] opacity-70 tabular">{formatLength(s.length.mm, room.displayUnit, { unknown: '?' })}</span>
          </Chip>
        ))}
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="display text-[28px] sm:text-[30px]">{wallTitle(seg, lang)}</h2>
              <span className="text-[12px] text-ink-3">{W.seenFrom(wallStartLabel(seg))}</span>
            </div>
            <WallElevation room={room} seg={seg} height={300} onElementClick={(id) => setEditing(room.elements.find((e) => e.id === id) ?? null)} />
          </div>

          <section>
            <GroupLabel
              actions={
                <Button size="xs" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
                  {W.addOnWall}
                </Button>
              }
            >
              {W.elementsOnWall}
            </GroupLabel>
            {elements.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">{W.noElements}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {elements.map((el) => (
                  <li key={el.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(el)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-start hover:border-line-strong"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px]" dir="auto">
                          {elementDisplayLabel(el, lang)}
                        </span>
                        <span className="block truncate text-[11.5px] text-ink-3 tabular">{elementSummary(el, room)}</span>
                      </span>
                      <StatusLabel tone={certaintyMeta(el.status).tone}>{certaintyMeta(el.status).label}</StatusLabel>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <GroupLabel>{W.intentions}</GroupLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              {DESIGN_FIELDS.map((key) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <Field label={W.fields[key]}>
                    <CommitInput
                      multiline
                      minRows={1}
                      value={wall?.design[key] ?? ''}
                      placeholder={W.placeholders[key]}
                      onCommit={(v) => idx >= 0 && updateRoom(room.id, (d) => void (d.walls[idx].design[key] = v))}
                    />
                  </Field>
                  <EnglishField source={wall?.design[key] ?? ''} compact />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-ink-3">{W.intentionsHint}</p>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <PlanPreview room={room} height={240} highlightWallId={seg.id} onWallClick={(s) => setWallId(s.id)} />
          <section className="rounded-md border border-line bg-surface p-4">
            <GroupLabel>{W.details}</GroupLabel>
            <div className="flex flex-col gap-3">
              <Field label={W.name}>
                <CommitInput
                  value={wallTitle(seg, lang)}
                  onCommit={(v) =>
                    idx >= 0 &&
                    v.trim() !== wallTitle(seg, lang) &&
                    updateRoom(room.id, (d) => {
                      d.walls[idx].name = v.trim() || d.walls[idx].name;
                      d.walls[idx].autoName = !v.trim();
                    })
                  }
                />
              </Field>
              <div className="text-[12.5px] text-ink-2">
                <span className="tabular">{W.length(formatLength(seg.length.mm, room.displayUnit))}</span>
                {room.geometry.shape !== 'custom' && <span className="text-ink-4">{W.editInDims}</span>}
              </div>
              {wall && (
                <>
                  <Toggle
                    checked={!wall.heightOverride}
                    onChange={(v) => updateRoom(room.id, (d) => void (d.walls[idx].heightOverride = !v))}
                    label={W.sameHeight}
                    description={!wall.heightOverride ? W.currently(formatLength(h.mm, room.displayUnit)) : undefined}
                  />
                  {wall.heightOverride && (
                    <MeasureInput
                      label={W.height}
                      value={wall.height}
                      unit={room.displayUnit}
                      defaultCertainty={settings?.defaultCertainty}
                      onChange={(m) => updateRoom(room.id, (d) => void (d.walls[idx].height = m))}
                    />
                  )}
                  <Field label={t.common.notes}>
                    <CommitInput
                      multiline
                      minRows={2}
                      value={wall.notes}
                      onCommit={(v) => updateRoom(room.id, (d) => void (d.walls[idx].notes = v))}
                      placeholder={W.notesPlaceholder}
                    />
                  </Field>
                  <EnglishField source={wall.notes} compact />
                </>
              )}
            </div>
          </section>
          <WallImages room={room} wallKey={wallKey} title={W.photos} images={photos} kind="site-photo" />
          <WallImages room={room} wallKey={wallKey} title={W.designRefs} images={designRefs} kind="inspiration" />
        </aside>
      </div>

      <ElementDialog room={room} element={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} references={references} />
      <ElementDialog room={room} element={null} open={adding} defaultType="window" defaultWallId={seg.id} onOpenChange={setAdding} references={references} />
    </div>
  );
}
