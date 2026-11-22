import { useMemo, useState } from 'react';
import { Box, Copy, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ArchElement, ElementType, Reference, Room } from '@/lib/types';
import { computeRoomShape, elementIssues, findSegment, wallStartLabel } from '@/lib/geometry/room';
import { certaintyMeta, ELEMENT_TYPES, elementTypeMeta } from '@/lib/labels';
import { formatLength } from '@/lib/units';
import { copyName, newId } from '@/lib/ids';
import { wallTitle } from '@/lib/geometry/names';
import { subtypeLabel } from '@/lib/labels';
import { tr } from '@/i18n/messages';
import { useI18n } from '@/i18n';
import { elementDisplayLabel } from '@/components/images/references';
import { updateRoom } from '@/lib/db/rooms';
import { PlanPreview } from '@/components/plan/PlanPreview';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Form';
import { Menu } from '@/components/ui/Overlay';
import { Callout, EmptyState, GroupLabel, StatusLabel } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';
import { cn } from '@/components/ui/cn';
import { ElementDialog } from '../architecture/ElementDialog';
import { FixedConstraints } from '../architecture/FixedConstraints';

export function elementSummary(el: ArchElement, room: Room): string {
  const a = tr().arch;
  const unit = room.displayUnit;
  const bits: string[] = [];
  if (el.width !== null || el.height !== null)
    bits.push(`${formatLength(el.width, unit, { unknown: '?' })} × ${formatLength(el.height, unit, { unknown: '?' })}`);
  if (el.elevation !== null && el.type !== 'door') bits.push(el.type === 'window' ? a.sill(formatLength(el.elevation, unit)) : a.at(formatLength(el.elevation, unit)));
  if (el.placement === 'wall') bits.push(el.offset === null ? a.positionUnknown : a.fromStart(formatLength(el.offset, unit)));
  if (el.type === 'door' && el.door)
    bits.push(
      el.door.swing === 'in'
        ? a.opensIn(el.door.hinge === 'left' ? a.hingeLeft : a.hingeRight)
        : el.door.swing === 'out'
          ? a.opensOut
          : el.door.swing === 'sliding'
            ? a.sliding
            : a.opening,
    );
  return bits.join(' · ');
}

export function ArchitectureTab({ room, references }: { room: Room; references: Reference[] }) {
  const { t, lang } = useI18n();
  const A = t.arch;
  const shape = useMemo(() => computeRoomShape(room), [room]);
  const issues = useMemo(() => elementIssues(room, shape), [room, shape]);
  const confirm = useConfirm();
  const [editing, setEditing] = useState<ArchElement | null>(null);
  const [creating, setCreating] = useState<ElementType | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byWall = shape.segments.map((s) => ({
      key: s.id,
      title: wallTitle(s, lang),
      subtitle: s.start ? A.measuredFrom(wallStartLabel(s)) : '',
      items: room.elements.filter((e) => e.placement === 'wall' && e.wallId === s.id),
    }));
    const free = room.elements.filter((e) => e.placement === 'free');
    const orphan = room.elements.filter((e) => e.placement === 'wall' && !findSegment(shape, e.wallId));
    return [
      ...byWall,
      { key: 'free', title: A.free, subtitle: '', items: free },
      { key: 'orphan', title: A.orphan, subtitle: A.orphanHint, items: orphan },
    ].filter((g) => g.items.length);
  }, [room, shape, A, lang]);

  const remove = async (el: ArchElement) => {
    const r = await confirm({
      title: A.deleteTitle(elementDisplayLabel(el, lang)),
      tone: 'danger',
      confirmLabel: t.common.delete,
      description: A.deleteBody,
    });
    if (!r.confirmed) return;
    await updateRoom(room.id, (d) => void (d.elements = d.elements.filter((e) => e.id !== el.id)));
    toast.success(A.deleted);
  };
  const duplicate = async (el: ArchElement) => {
    await updateRoom(room.id, (d) => void d.elements.push({ ...structuredClone(el), id: newId('el'), label: copyName(el.label) }));
  };

  const counts = {
    confirmed: room.elements.filter((e) => e.status === 'confirmed').length,
    estimated: room.elements.filter((e) => e.status === 'estimated').length,
    unknown: room.elements.filter((e) => e.status === 'unknown').length,
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:gap-10">
      <div className="flex flex-col gap-7">
        <div>
          <h2 className="display text-[28px]">{A.title}</h2>
          <p className="mt-1 max-w-[620px] text-[12.5px] leading-relaxed text-ink-3">{A.lead}</p>
        </div>
        <div>
          <div className="eyebrow mb-2">{A.add}</div>
          <div className="flex flex-wrap gap-1.5">
            {ELEMENT_TYPES.map((et) => (
              <Chip key={et.value} onClick={() => setCreating(et.value)}>
                <Plus size={12} /> {et.label}
              </Chip>
            ))}
          </div>
        </div>

        {room.elements.length === 0 ? (
          <EmptyState icon={Box} title={A.emptyTitle}>
            {A.emptyBody}
          </EmptyState>
        ) : (
          groups.map((g) => (
            <section key={g.key}>
              <GroupLabel actions={g.subtitle ? <span className="text-[11px] text-ink-4">{g.subtitle}</span> : undefined}>{g.title}</GroupLabel>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((el) => {
                  const cm = certaintyMeta(el.status);
                  const photos = references.filter((r) => r.elementIds.includes(el.id)).length;
                  return (
                    <li
                      key={el.id}
                      onMouseEnter={() => setSelected(el.id)}
                      onMouseLeave={() => setSelected(null)}
                      className={cn(
                        'flex items-center gap-3 rounded-md border bg-surface px-3 py-2.5',
                        selected === el.id ? 'border-line-strong' : 'border-line',
                      )}
                    >
                      <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing(el)}>
                        <div className="flex flex-wrap items-center gap-x-2 text-[13.5px] text-ink">
                          <span dir="auto">{el.label ? elementDisplayLabel(el, lang) : elementTypeMeta(el.type).label}</span>
                          {el.subtype && el.subtype !== el.label && <span className="text-[12px] text-ink-3">{subtypeLabel(el.subtype)}</span>}
                          {el.preserve && el.status === 'confirmed' && <Lock size={12} className="text-ok" aria-label={A.preserved} />}
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-ink-3 tabular">{elementSummary(el, room) || A.unknownSize}</div>
                      </button>
                      {photos > 0 && <span className="hidden text-[11px] text-ink-3 sm:inline">{A.files(photos)}</span>}
                      <StatusLabel tone={cm.tone}>{cm.label}</StatusLabel>
                      <Menu
                        trigger={<IconButton icon={MoreHorizontal} label={A.actions} />}
                        items={[
                          { label: t.common.edit, icon: Pencil, onSelect: () => setEditing(el) },
                          { label: t.common.duplicate, icon: Copy, onSelect: () => duplicate(el) },
                          'separator',
                          { label: t.common.deleteEllipsis, icon: Trash2, danger: true, onSelect: () => remove(el) },
                        ]}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
        <FixedConstraints room={room} />
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
        <PlanPreview room={room} height={320} selectedElementId={selected} onElementClick={(el) => setEditing(el)} showFurniture={false} />
        <div className="flex flex-wrap gap-4 text-[12px] text-ink-3">
          <span>{A.confirmedCount(counts.confirmed)}</span>
          <span>{A.estimatedCount(counts.estimated)}</span>
          <span>{A.unknownCount(counts.unknown)}</span>
        </div>
        {issues.map((i, k) => (
          <Callout key={k} tone={i.level === 'error' ? 'danger' : 'warn'}>
            {i.message}
          </Callout>
        ))}
        {!shape.drawable && <Callout tone="neutral">{A.notDrawable}</Callout>}
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => setCreating('window')} className="self-start">
          {A.addElement}
        </Button>
      </aside>

      <ElementDialog room={room} element={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} references={references} />
      <ElementDialog
        room={room}
        element={null}
        open={!!creating}
        defaultType={creating ?? 'window'}
        onOpenChange={(o) => !o && setCreating(null)}
        references={references}
      />
    </div>
  );
}
