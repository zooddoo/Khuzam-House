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
import { UploadButton } from '@/components/images/Dropzone';
import { useUploadReferences } from '@/components/images/useUpload';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, CommitInput, Field, Toggle } from '@/components/ui/Form';
import { MeasureInput } from '@/components/ui/MeasureInput';
import { EmptyState, GroupLabel, StatusLabel } from '@/components/ui/Display';
import { ElementDialog } from '../architecture/ElementDialog';
import { elementSummary } from './ArchitectureTab';

const DESIGN_FIELDS: { key: keyof WallDesign; label: string; placeholder: string }[] = [
  { key: 'cladding', label: 'Cladding / finish', placeholder: 'e.g. Vertical oak slats full height' },
  { key: 'tv', label: 'TV', placeholder: 'e.g. 75″ TV centred, concealed cables' },
  { key: 'artwork', label: 'Artwork', placeholder: 'e.g. Large abstract canvas above sofa' },
  { key: 'lighting', label: 'Lighting', placeholder: 'e.g. Wall washer, two sconces' },
  { key: 'furniture', label: 'Furniture against this wall', placeholder: 'e.g. Low sideboard 240 cm' },
  { key: 'other', label: 'Other', placeholder: 'Anything else for this wall' },
];

function WallImages({ room, wallKey, title, images, kind }: { room: Room; wallKey: string; title: string; images: Reference[]; kind: Reference['kind'] }) {
  const lightbox = useLightbox();
  const { upload, busy } = useUploadReferences();
  const [picker, setPicker] = useState(false);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="eyebrow">{title}</span>
        <div className="flex gap-1.5">
          <UploadButton size="sm" loading={busy} onFiles={(files) => upload(files, { kind, roomIds: [room.id], wallKeys: [wallKey] })}>
            Upload
          </UploadButton>
          <Button size="sm" variant="ghost" icon={Library} onClick={() => setPicker(true)}>
            Link
          </Button>
        </div>
      </div>
      {images.length === 0 ? (
        <p className="rounded-sm border border-dashed border-line-strong/70 px-3 py-4 text-center text-[12px] text-ink-3">None yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((r) => (
            <div key={r.id} className="group relative">
              <ImageThumb
                imageId={r.imageId}
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
                label="Unlink from this wall"
                size="xs"
                variant="overlay"
                className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={async () => {
                  await unlinkReferences([r.id], 'wallKeys', wallKey);
                  toast.success('Unlinked from wall');
                }}
              />
              {r.title && <div className="mt-1 truncate text-[11.5px] text-ink-3">{r.title}</div>}
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
  const shape = useMemo(() => computeRoomShape(room), [room]);
  const settings = useSettings();
  const [wallId, setWallId] = useState<string | null>(shape.segments[0]?.id ?? null);
  const [editing, setEditing] = useState<ArchElement | null>(null);
  const [adding, setAdding] = useState(false);
  const seg = shape.segments.find((s) => s.id === wallId) ?? shape.segments[0];

  if (!seg) {
    return <EmptyState title="No walls defined yet">Define the room shape in the Dimensions tab — walls appear here automatically.</EmptyState>;
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
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Walls">
        {shape.segments.map((s) => (
          <Chip key={s.id} active={s.id === seg.id} onClick={() => setWallId(s.id)}>
            {s.name}
            <span className="text-[11px] opacity-70 tabular">{formatLength(s.length.mm, room.displayUnit, { unknown: '?' })}</span>
          </Chip>
        ))}
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="display text-[30px]">{seg.name} wall</h2>
              <span className="text-[12px] text-ink-3">Seen from inside the room · start = {wallStartLabel(seg)}</span>
            </div>
            <WallElevation room={room} seg={seg} height={320} onElementClick={(id) => setEditing(room.elements.find((e) => e.id === id) ?? null)} />
          </div>

          <section>
            <GroupLabel
              actions={
                <Button size="xs" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
                  Add on this wall
                </Button>
              }
            >
              Elements on this wall
            </GroupLabel>
            {elements.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">No doors, windows, AC units or points recorded on this wall.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {elements.map((el) => (
                  <li key={el.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(el)}
                      className="flex w-full items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-left hover:border-line-strong"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px]">{el.label}</span>
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
            <GroupLabel>Design intentions for this wall</GroupLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              {DESIGN_FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <CommitInput
                    multiline
                    minRows={1}
                    value={wall?.design[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onCommit={(v) => idx >= 0 && updateRoom(room.id, (d) => void (d.walls[idx].design[f.key] = v))}
                  />
                </Field>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-ink-3">These notes are included in the redesign prompt as wall-specific instructions.</p>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <PlanPreview room={room} height={240} highlightWallId={seg.id} onWallClick={(s) => setWallId(s.id)} />
          <section className="rounded-md border border-line bg-surface p-4">
            <GroupLabel>Wall details</GroupLabel>
            <div className="flex flex-col gap-3">
              <Field label="Name">
                <CommitInput
                  value={seg.name}
                  onCommit={(v) =>
                    idx >= 0 &&
                    updateRoom(room.id, (d) => {
                      d.walls[idx].name = v.trim() || d.walls[idx].name;
                      d.walls[idx].autoName = !v.trim();
                    })
                  }
                />
              </Field>
              <div className="text-[12.5px] text-ink-2">
                Length: <span className="tabular">{formatLength(seg.length.mm, room.displayUnit)}</span>
                {room.geometry.shape !== 'custom' && <span className="text-ink-4"> · edit in Dimensions</span>}
              </div>
              {wall && (
                <>
                  <Toggle
                    checked={!wall.heightOverride}
                    onChange={(v) => updateRoom(room.id, (d) => void (d.walls[idx].heightOverride = !v))}
                    label="Same height as the ceiling"
                    description={!wall.heightOverride ? `Currently ${formatLength(h.mm, room.displayUnit)}` : undefined}
                  />
                  {wall.heightOverride && (
                    <MeasureInput
                      label="Wall height"
                      value={wall.height}
                      unit={room.displayUnit}
                      defaultCertainty={settings?.defaultCertainty}
                      onChange={(m) => updateRoom(room.id, (d) => void (d.walls[idx].height = m))}
                    />
                  )}
                  <Field label="Notes">
                    <CommitInput
                      multiline
                      minRows={2}
                      value={wall.notes}
                      onCommit={(v) => updateRoom(room.id, (d) => void (d.walls[idx].notes = v))}
                      placeholder="Condition, fixed items, things to keep…"
                    />
                  </Field>
                </>
              )}
            </div>
          </section>
          <WallImages room={room} wallKey={wallKey} title="Photos of this wall" images={photos} kind="site-photo" />
          <WallImages room={room} wallKey={wallKey} title="Design references for this wall" images={designRefs} kind="inspiration" />
        </aside>
      </div>

      <ElementDialog room={room} element={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} references={references} />
      <ElementDialog room={room} element={null} open={adding} defaultType="window" defaultWallId={seg.id} onOpenChange={setAdding} references={references} />
    </div>
  );
}
