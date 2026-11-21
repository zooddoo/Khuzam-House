import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ArchElement, Certainty, DoorSwing, ElementType, ID, Reference, Room } from '@/lib/types';
import { computeRoomShape, findSegment, wallStartLabel } from '@/lib/geometry/room';
import { wallTitle } from '@/lib/geometry/names';
import { CERTAINTIES, ELEMENT_TYPES, elementTypeLabel, elementTypeMeta, subtypeLabel } from '@/lib/labels';
import { formatLength } from '@/lib/units';
import { createElementRecord } from '@/lib/db/factories';
import { updateRoom } from '@/lib/db/rooms';
import { useI18n } from '@/i18n';
import { num } from '@/i18n/format';
import { Dialog } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field, Input, Segmented, Select, Textarea, Toggle } from '@/components/ui/Form';
import { LengthField } from '@/components/ui/MeasureInput';
import { Callout } from '@/components/ui/Display';
import { AttachmentsSection } from '@/components/files/Attachments';
import { elementDisplayLabel } from '@/components/images/references';
import { EnglishField } from '@/components/translate/EnglishField';

export function ElementDialog({
  room,
  element,
  open,
  onOpenChange,
  defaultType = 'window',
  defaultWallId,
}: {
  room: Room;
  element: ArchElement | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultType?: ElementType;
  defaultWallId?: ID | null;
  references?: Reference[];
}) {
  const { t, lang } = useI18n();
  const E = t.element;
  const shape = useMemo(() => computeRoomShape(room), [room]);
  const [draft, setDraft] = useState<ArchElement>(() => element ?? createElementRecord(defaultType));
  /** The label as shown (translated default names). */
  const [labelText, setLabelText] = useState('');
  const unit = room.displayUnit;

  const firstWallId = shape.segments[0]?.id ?? null;
  useEffect(() => {
    if (!open) return;
    const base = element ?? createElementRecord(defaultType, { wallId: defaultWallId ?? firstWallId });
    setDraft(structuredClone(base));
    setLabelText(elementDisplayLabel(base, lang));
    // Reset only when the dialog opens for a different element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, element?.id, defaultType, defaultWallId]);

  const meta = elementTypeMeta(draft.type);
  const seg = findSegment(shape, draft.wallId);
  const set = <K extends keyof ArchElement>(k: K, v: ArchElement[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const minX = shape.drawable ? shape.bounds.minX : 0;
  const minY = shape.drawable ? shape.bounds.minY : 0;

  const changeType = (type: ElementType) => {
    const m = elementTypeMeta(type);
    const wasDefault = !labelText.trim() || labelText === elementTypeLabel(draft.type, lang) || labelText === elementTypeLabel(draft.type, 'en');
    setDraft((d) => ({
      ...d,
      type,
      subtype: m.subtypes[0] ?? '',
      label: wasDefault ? elementTypeLabel(type, 'en') : d.label,
      placement: m.wallMounted ? 'wall' : d.placement === 'wall' && !m.wallMounted ? 'free' : d.placement,
      door: type === 'door' ? (d.door ?? { hinge: 'left', swing: 'in' }) : null,
    }));
    if (wasDefault) setLabelText(elementTypeLabel(type, lang));
  };

  const warnings: string[] = [];
  if (draft.placement === 'wall' && seg && seg.length.mm !== null && draft.offset !== null && draft.offset + (draft.width ?? 0) > seg.length.mm) {
    warnings.push(E.pastEnd(wallTitle(seg, lang), formatLength(seg.length.mm, unit)));
  }
  if (draft.status === 'confirmed' && draft.placement === 'wall' && draft.offset === null) warnings.push(E.confirmedNoPosition);

  const save = async () => {
    // Default names are stored in English (they go into design prompts) and shown translated.
    const typed = labelText.trim();
    const unchanged = !typed || typed === elementDisplayLabel(draft, lang);
    const label = unchanged ? draft.label || elementTypeLabel(draft.type, 'en') : typed === elementTypeLabel(draft.type, lang) ? elementTypeLabel(draft.type, 'en') : typed;
    const clean: ArchElement = { ...draft, label, subtype: draft.subtype.trim() };
    if (clean.placement === 'free') clean.wallId = null;
    await updateRoom(room.id, (d) => {
      const i = d.elements.findIndex((e) => e.id === clean.id);
      if (i >= 0) d.elements[i] = clean;
      else d.elements.push(clean);
    });
    toast.success(element ? E.updated : E.added(elementDisplayLabel(clean, lang)));
    onOpenChange(false);
  };

  const elevationLabel = draft.type === 'window' ? E.sillHeight : draft.type === 'beam' ? E.undersideHeight : draft.type === 'door' ? E.threshold : E.bottomHeight;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={element ? E.editTitle(elementDisplayLabel(element, lang) || meta.label) : E.addTitle}
      description={E.lead}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={save}>
            {element ? t.common.save : E.add}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={E.type}>
            <Select value={draft.type} onChange={(e) => changeType(e.target.value as ElementType)}>
              {ELEMENT_TYPES.map((et) => (
                <option key={et.value} value={et.value}>
                  {et.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={E.kind}>
            <Select
              value={meta.subtypes.includes(draft.subtype) ? draft.subtype : draft.subtype ? '__custom' : ''}
              onChange={(e) => e.target.value !== '__custom' && set('subtype', e.target.value)}
            >
              {meta.subtypes.map((s) => (
                <option key={s} value={s}>
                  {subtypeLabel(s)}
                </option>
              ))}
              {draft.subtype && !meta.subtypes.includes(draft.subtype) && <option value="__custom">{draft.subtype}</option>}
            </Select>
          </Field>
          <Field label={E.label}>
            <Input value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder={meta.label} />
          </Field>
        </div>

        <Field label={E.status} hint={CERTAINTIES.find((c) => c.value === draft.status)?.hint}>
          <Segmented value={draft.status} onChange={(v: Certainty) => set('status', v)} options={CERTAINTIES.map((c) => ({ value: c.value, label: c.label }))} />
        </Field>

        {(draft.type === 'column' || draft.type === 'beam' || draft.type === 'other' || draft.type === 'electrical') && (
          <Field label={E.placement}>
            <Segmented
              value={draft.placement}
              onChange={(v) => set('placement', v)}
              options={[
                { value: 'wall', label: E.onWall },
                { value: 'free', label: draft.type === 'electrical' ? E.ceilingFloor : E.freeStanding },
              ]}
            />
          </Field>
        )}

        {draft.placement === 'wall' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={E.wall}>
              <Select value={draft.wallId ?? ''} onChange={(e) => set('wallId', e.target.value || null)}>
                <option value="">{E.notAssigned}</option>
                {shape.segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {wallTitle(s, lang)}
                  </option>
                ))}
              </Select>
            </Field>
            <LengthField
              label={E.position}
              value={draft.offset}
              unit={unit}
              allowZero
              onChange={(v) => set('offset', v)}
              hint={seg ? E.positionHint(wallStartLabel(seg), wallTitle(seg, lang)) : E.chooseWall}
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <LengthField label={E.centreWest} value={draft.x === null ? null : draft.x - minX} unit={unit} allowZero onChange={(v) => set('x', v === null ? null : v + minX)} />
            <LengthField label={E.centreNorth} value={draft.y === null ? null : draft.y - minY} unit={unit} allowZero onChange={(v) => set('y', v === null ? null : v + minY)} />
            <Field label={E.rotation}>
              <Select value={String(draft.rotation)} onChange={(e) => set('rotation', Number(e.target.value))}>
                {[0, 45, 90, 135].map((r) => (
                  <option key={r} value={r}>
                    {num(r)}°
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <LengthField label={E.width} value={draft.width} unit={unit} onChange={(v) => set('width', v)} />
          <LengthField label={draft.type === 'beam' ? E.depthVertical : E.height} value={draft.height} unit={unit} onChange={(v) => set('height', v)} />
          <LengthField label={elevationLabel} value={draft.elevation} unit={unit} allowZero onChange={(v) => set('elevation', v)} />
          {(['ac', 'projection', 'recess', 'column', 'beam', 'other'] as ElementType[]).includes(draft.type) && (
            <LengthField
              label={draft.type === 'recess' ? E.recessDepth : draft.type === 'beam' || (draft.type === 'column' && draft.placement === 'free') ? E.lengthDepth : E.projection}
              value={draft.depth}
              unit={unit}
              onChange={(v) => set('depth', v)}
            />
          )}
        </div>

        {draft.type === 'door' && draft.door && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={E.doorOperation}>
              <Segmented
                value={draft.door.swing}
                onChange={(v: DoorSwing) => set('door', { ...draft.door!, swing: v })}
                options={[
                  { value: 'in', label: E.opensIn },
                  { value: 'out', label: E.opensOut },
                  { value: 'sliding', label: E.sliding },
                  { value: 'opening', label: E.noLeaf },
                ]}
              />
            </Field>
            {(draft.door.swing === 'in' || draft.door.swing === 'out') && (
              <Field label={E.hingeSide}>
                <Segmented
                  value={draft.door.hinge}
                  onChange={(v) => set('door', { ...draft.door!, hinge: v })}
                  options={[
                    { value: 'left', label: E.left },
                    { value: 'right', label: E.right },
                  ]}
                />
              </Field>
            )}
          </div>
        )}

        <Toggle checked={draft.preserve} onChange={(v) => set('preserve', v)} label={E.preserve} description={draft.status === 'confirmed' ? E.preserveConfirmed : E.preserveOther} />

        <Field label={t.common.notes}>
          <Textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} minRows={2} placeholder={E.notesPlaceholder} />
        </Field>
        <EnglishField source={draft.notes} />
        {labelText.trim() !== elementDisplayLabel(draft, lang) && <EnglishField source={labelText} compact />}

        {warnings.map((w) => (
          <Callout key={w} tone="warn">
            {w}
          </Callout>
        ))}

        {element ? (
          <AttachmentsSection
            field="elementIds"
            value={element.id}
            title={E.filesTitle}
            defaults={{ kind: 'site-photo', roomIds: [room.id], title: '' }}
            compact
          />
        ) : (
          <p className="text-[12px] text-ink-3">{E.saveFirst}</p>
        )}
      </div>
    </Dialog>
  );
}
