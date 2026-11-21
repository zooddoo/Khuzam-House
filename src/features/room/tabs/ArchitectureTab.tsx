import { useMemo, useState } from 'react';
import { Box, Copy, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ArchElement, ElementType, Reference, Room } from '@/lib/types';
import { computeRoomShape, elementIssues, findSegment, wallStartLabel } from '@/lib/geometry/room';
import { certaintyMeta, ELEMENT_TYPES, elementTypeMeta } from '@/lib/labels';
import { formatLength } from '@/lib/units';
import { newId } from '@/lib/ids';
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
  const unit = room.displayUnit;
  const bits: string[] = [];
  if (el.width !== null || el.height !== null)
    bits.push(`${formatLength(el.width, unit, { unknown: '?' })} × ${formatLength(el.height, unit, { unknown: '?' })}`);
  if (el.elevation !== null && el.type !== 'door') bits.push(`${el.type === 'window' ? 'sill' : 'at'} ${formatLength(el.elevation, unit)}`);
  if (el.placement === 'wall') bits.push(el.offset === null ? 'position unknown' : `${formatLength(el.offset, unit)} from start`);
  if (el.type === 'door' && el.door)
    bits.push(el.door.swing === 'in' ? `opens in · ${el.door.hinge} hinge` : el.door.swing === 'out' ? 'opens out' : el.door.swing);
  return bits.join(' · ');
}

export function ArchitectureTab({ room, references }: { room: Room; references: Reference[] }) {
  const shape = useMemo(() => computeRoomShape(room), [room]);
  const issues = useMemo(() => elementIssues(room, shape), [room, shape]);
  const confirm = useConfirm();
  const [editing, setEditing] = useState<ArchElement | null>(null);
  const [creating, setCreating] = useState<ElementType | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byWall = shape.segments.map((s) => ({
      key: s.id,
      title: `${s.name} wall`,
      subtitle: s.start ? `Positions measured from its ${wallStartLabel(s)}` : '',
      items: room.elements.filter((e) => e.placement === 'wall' && e.wallId === s.id),
    }));
    const free = room.elements.filter((e) => e.placement === 'free');
    const orphan = room.elements.filter((e) => e.placement === 'wall' && !findSegment(shape, e.wallId));
    return [
      ...byWall,
      { key: 'free', title: 'Free-standing & ceiling', subtitle: '', items: free },
      { key: 'orphan', title: 'Not on a current wall', subtitle: 'Reassign these elements to a wall', items: orphan },
    ].filter((g) => g.items.length);
  }, [room, shape]);

  const remove = async (el: ArchElement) => {
    const r = await confirm({
      title: `Delete ${el.label}?`,
      tone: 'danger',
      confirmLabel: 'Delete',
      description: 'It will no longer be preserved or shown in designs and plans.',
    });
    if (!r.confirmed) return;
    await updateRoom(room.id, (d) => void (d.elements = d.elements.filter((e) => e.id !== el.id)));
    toast.success('Element deleted');
  };
  const duplicate = async (el: ArchElement) => {
    await updateRoom(room.id, (d) => void d.elements.push({ ...structuredClone(el), id: newId('el'), label: `${el.label} (copy)` }));
  };

  const counts = {
    confirmed: room.elements.filter((e) => e.status === 'confirmed').length,
    estimated: room.elements.filter((e) => e.status === 'estimated').length,
    unknown: room.elements.filter((e) => e.status === 'unknown').length,
  };

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-7">
        <div>
          <h2 className="display text-[28px]">Architecture</h2>
          <p className="mt-1 max-w-[620px] text-[12.5px] leading-relaxed text-ink-3">
            Doors, windows, AC units, columns and other fixed elements. Confirmed elements are preserved in every design; estimated or unknown ones are never
            presented to the AI as facts.
          </p>
        </div>
        <div>
          <div className="eyebrow mb-2">Add</div>
          <div className="flex flex-wrap gap-1.5">
            {ELEMENT_TYPES.map((t) => (
              <Chip key={t.value} onClick={() => setCreating(t.value)}>
                <Plus size={12} /> {t.label}
              </Chip>
            ))}
          </div>
        </div>

        {room.elements.length === 0 ? (
          <EmptyState icon={Box} title="No elements recorded">
            Record the doors, windows and AC units first — they matter most for keeping designs true to the real room.
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
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(el)}>
                        <div className="flex items-center gap-2 text-[13.5px] text-ink">
                          {el.label || elementTypeMeta(el.type).label}
                          {el.subtype && el.subtype !== el.label && <span className="text-[12px] text-ink-3">{el.subtype}</span>}
                          {el.preserve && el.status === 'confirmed' && <Lock size={12} className="text-ok" aria-label="Preserved in designs" />}
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-ink-3 tabular">{elementSummary(el, room) || 'Size and position unknown'}</div>
                      </button>
                      {photos > 0 && (
                        <span className="text-[11px] text-ink-3">
                          {photos} photo{photos > 1 ? 's' : ''}
                        </span>
                      )}
                      <StatusLabel tone={cm.tone}>{cm.label}</StatusLabel>
                      <Menu
                        trigger={<IconButton icon={MoreHorizontal} label="Element actions" />}
                        items={[
                          { label: 'Edit', icon: Pencil, onSelect: () => setEditing(el) },
                          { label: 'Duplicate', icon: Copy, onSelect: () => duplicate(el) },
                          'separator',
                          { label: 'Delete', icon: Trash2, danger: true, onSelect: () => remove(el) },
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
        <PlanPreview room={room} height={380} selectedElementId={selected} onElementClick={(el) => setEditing(el)} showFurniture={false} />
        <div className="flex flex-wrap gap-4 text-[12px] text-ink-3">
          <span>
            <strong className="text-ink">{counts.confirmed}</strong> confirmed
          </span>
          <span>
            <strong className="text-ink">{counts.estimated}</strong> estimated (dashed on plan)
          </span>
          <span>
            <strong className="text-ink">{counts.unknown}</strong> unknown (dotted)
          </span>
        </div>
        {issues.map((i, k) => (
          <Callout key={k} tone={i.level === 'error' ? 'danger' : 'warn'}>
            {i.message}
          </Callout>
        ))}
        {!shape.drawable && <Callout tone="neutral">Elements can be recorded now; they appear on the plan once the room dimensions are known.</Callout>}
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => setCreating('window')} className="self-start">
          Add element
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
