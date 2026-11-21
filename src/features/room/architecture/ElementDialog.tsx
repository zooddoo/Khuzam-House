import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ArchElement, Certainty, DoorSwing, ElementType, ID, Reference, Room } from '@/lib/types';
import { computeRoomShape, findSegment, wallStartLabel } from '@/lib/geometry/room';
import { CERTAINTIES, ELEMENT_TYPES, elementTypeMeta } from '@/lib/labels';
import { formatLength } from '@/lib/units';
import { createElementRecord } from '@/lib/db/factories';
import { updateRoom } from '@/lib/db/rooms';
import { linkReferences } from '@/lib/db/references';
import { Dialog } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field, Input, Segmented, Select, Textarea, Toggle } from '@/components/ui/Form';
import { LengthField } from '@/components/ui/MeasureInput';
import { Callout } from '@/components/ui/Display';
import { ImageThumb } from '@/components/images/ImageThumb';
import { ReferencePicker } from '@/components/images/references';
import { useLightbox } from '@/components/images/Lightbox';

export function ElementDialog({
  room,
  element,
  open,
  onOpenChange,
  defaultType = 'window',
  defaultWallId,
  references = [],
}: {
  room: Room;
  element: ArchElement | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultType?: ElementType;
  defaultWallId?: ID | null;
  references?: Reference[];
}) {
  const shape = useMemo(() => computeRoomShape(room), [room]);
  const [draft, setDraft] = useState<ArchElement>(() => element ?? createElementRecord(defaultType));
  const [picker, setPicker] = useState(false);
  const lightbox = useLightbox();
  const unit = room.displayUnit;

  const firstWallId = shape.segments[0]?.id ?? null;
  useEffect(() => {
    if (!open) return;
    const base = element ?? createElementRecord(defaultType, { wallId: defaultWallId ?? firstWallId });
    setDraft(structuredClone(base));
    // Reset only when the dialog opens for a different element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, element?.id, defaultType, defaultWallId]);

  const meta = elementTypeMeta(draft.type);
  const seg = findSegment(shape, draft.wallId);
  const set = <K extends keyof ArchElement>(k: K, v: ArchElement[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const photos = element ? references.filter((r) => r.elementIds.includes(element.id)) : [];
  const minX = shape.drawable ? shape.bounds.minX : 0;
  const minY = shape.drawable ? shape.bounds.minY : 0;

  const changeType = (t: ElementType) => {
    const m = elementTypeMeta(t);
    setDraft((d) => ({
      ...d,
      type: t,
      subtype: m.subtypes[0] ?? '',
      label: d.label === elementTypeMeta(d.type).label || !d.label ? m.label : d.label,
      placement: m.wallMounted ? 'wall' : d.placement === 'wall' && !m.wallMounted ? 'free' : d.placement,
      door: t === 'door' ? (d.door ?? { hinge: 'left', swing: 'in' }) : null,
    }));
  };

  const warnings: string[] = [];
  if (draft.placement === 'wall' && seg && seg.length.mm !== null && draft.offset !== null && draft.offset + (draft.width ?? 0) > seg.length.mm) {
    warnings.push(`This extends past the end of the ${seg.name} wall (${formatLength(seg.length.mm, unit)}).`);
  }
  if (draft.status === 'confirmed' && draft.placement === 'wall' && draft.offset === null)
    warnings.push('Marked confirmed, but its position along the wall is unknown.');

  const save = async () => {
    const clean: ArchElement = { ...draft, label: draft.label.trim() || meta.label, subtype: draft.subtype.trim() };
    if (clean.placement === 'free') clean.wallId = null;
    await updateRoom(room.id, (d) => {
      const i = d.elements.findIndex((e) => e.id === clean.id);
      if (i >= 0) d.elements[i] = clean;
      else d.elements.push(clean);
    });
    toast.success(element ? 'Element updated' : `${clean.label} added`);
    onOpenChange(false);
  };

  const elevationLabel =
    draft.type === 'window'
      ? 'Sill height above floor'
      : draft.type === 'beam'
        ? 'Underside height above floor'
        : draft.type === 'door'
          ? 'Threshold height'
          : 'Height above floor (bottom)';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={element ? `Edit ${element.label || meta.label}` : 'Add an architectural element'}
      description="Fixed parts of the room — tracked separately from furniture. Confirmed elements are kept unchanged in every design unless you allow a change."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {element ? 'Save' : 'Add element'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type">
            <Select value={draft.type} onChange={(e) => changeType(e.target.value as ElementType)}>
              {ELEMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kind">
            <Input list="subtypes" value={draft.subtype} onChange={(e) => set('subtype', e.target.value)} />
            <datalist id="subtypes">
              {meta.subtypes.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Label">
            <Input value={draft.label} onChange={(e) => set('label', e.target.value)} placeholder={meta.label} />
          </Field>
        </div>

        <Field label="Confirmation status" hint={CERTAINTIES.find((c) => c.value === draft.status)?.hint}>
          <Segmented
            value={draft.status}
            onChange={(v: Certainty) => set('status', v)}
            options={CERTAINTIES.map((c) => ({ value: c.value, label: c.label }))}
          />
        </Field>

        {(draft.type === 'column' || draft.type === 'beam' || draft.type === 'other' || draft.type === 'electrical') && (
          <Field label="Placement">
            <Segmented
              value={draft.placement}
              onChange={(v) => set('placement', v)}
              options={[
                { value: 'wall', label: 'On a wall' },
                { value: 'free', label: draft.type === 'electrical' ? 'Ceiling / floor point' : 'Free-standing' },
              ]}
            />
          </Field>
        )}

        {draft.placement === 'wall' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Wall">
              <Select value={draft.wallId ?? ''} onChange={(e) => set('wallId', e.target.value || null)}>
                <option value="">Not assigned</option>
                {shape.segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <LengthField
              label="Position along the wall"
              value={draft.offset}
              unit={unit}
              allowZero
              onChange={(v) => set('offset', v)}
              hint={seg ? `Distance from the ${wallStartLabel(seg)} of the ${seg.name} wall to the element's edge.` : 'Choose a wall first.'}
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <LengthField
              label="Centre from west side"
              value={draft.x === null ? null : draft.x - minX}
              unit={unit}
              allowZero
              onChange={(v) => set('x', v === null ? null : v + minX)}
            />
            <LengthField
              label="Centre from north side"
              value={draft.y === null ? null : draft.y - minY}
              unit={unit}
              allowZero
              onChange={(v) => set('y', v === null ? null : v + minY)}
            />
            <Field label="Rotation">
              <Select value={String(draft.rotation)} onChange={(e) => set('rotation', Number(e.target.value))}>
                {[0, 45, 90, 135].map((r) => (
                  <option key={r} value={r}>
                    {r}°
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-4">
          <LengthField label="Width" value={draft.width} unit={unit} onChange={(v) => set('width', v)} />
          <LengthField label={draft.type === 'beam' ? 'Depth (vertical)' : 'Height'} value={draft.height} unit={unit} onChange={(v) => set('height', v)} />
          <LengthField label={elevationLabel} value={draft.elevation} unit={unit} allowZero onChange={(v) => set('elevation', v)} />
          {(['ac', 'projection', 'recess', 'column', 'beam', 'other'] as ElementType[]).includes(draft.type) && (
            <LengthField
              label={
                draft.type === 'recess'
                  ? 'Recess depth'
                  : draft.type === 'beam' || (draft.type === 'column' && draft.placement === 'free')
                    ? 'Length / depth'
                    : 'Projection into room'
              }
              value={draft.depth}
              unit={unit}
              onChange={(v) => set('depth', v)}
            />
          )}
        </div>

        {draft.type === 'door' && draft.door && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Door operation">
              <Segmented
                value={draft.door.swing}
                onChange={(v: DoorSwing) => set('door', { ...draft.door!, swing: v })}
                options={[
                  { value: 'in', label: 'Opens in' },
                  { value: 'out', label: 'Opens out' },
                  { value: 'sliding', label: 'Sliding' },
                  { value: 'opening', label: 'No leaf' },
                ]}
              />
            </Field>
            {(draft.door.swing === 'in' || draft.door.swing === 'out') && (
              <Field label="Hinge side (seen from inside)">
                <Segmented
                  value={draft.door.hinge}
                  onChange={(v) => set('door', { ...draft.door!, hinge: v })}
                  options={[
                    { value: 'left', label: 'Left' },
                    { value: 'right', label: 'Right' },
                  ]}
                />
              </Field>
            )}
          </div>
        )}

        <Toggle
          checked={draft.preserve}
          onChange={(v) => set('preserve', v)}
          label="Keep unchanged in designs"
          description={
            draft.status === 'confirmed'
              ? 'Added to the DO NOT CHANGE list sent with every redesign.'
              : 'Only confirmed elements are locked. Estimated and unknown ones are described as approximate so the AI does not treat a guess as fact.'
          }
        />

        <Field label="Notes">
          <Textarea
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            minRows={2}
            placeholder="e.g. Window frame is aluminium; AC drain on the left"
          />
        </Field>

        {warnings.map((w) => (
          <Callout key={w} tone="warn">
            {w}
          </Callout>
        ))}

        {element && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">Photos & references</span>
              <Button size="sm" onClick={() => setPicker(true)}>
                Add photo
              </Button>
            </div>
            {photos.length ? (
              <div className="flex flex-wrap gap-2">
                {photos.map((p) => (
                  <ImageThumb
                    key={p.id}
                    imageId={p.imageId}
                    className="h-20 w-28 rounded-sm border border-line"
                    onClick={() =>
                      lightbox(
                        photos.map((x) => ({ imageId: x.imageId, title: x.title })),
                        photos.indexOf(p),
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-ink-3">No photos of this element yet.</p>
            )}
            <ReferencePicker
              open={picker}
              onOpenChange={setPicker}
              title={`Photos of ${element.label}`}
              preferRoomId={room.id}
              excludeIds={photos.map((p) => p.id)}
              uploadDefaults={{ kind: 'site-photo', roomIds: [room.id], elementIds: [element.id], title: element.label }}
              onPick={async (ids) => {
                await linkReferences(ids, 'elementIds', element.id);
                await linkReferences(ids, 'roomIds', room.id);
              }}
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
