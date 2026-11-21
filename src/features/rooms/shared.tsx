import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { Floor, ID, Room, RoomStatus, RoomType } from '@/lib/types';
import { ROOM_STATUSES, ROOM_TYPES, roomStatusMeta } from '@/lib/labels';
import { useFloors, useReference } from '@/lib/hooks/data';
import { addRoom, deleteRoom, duplicateRoom, patchRoom, roomDeletionImpact } from '@/lib/db/rooms';
import { computeRoomShape } from '@/lib/geometry/room';
import { ImageThumb } from '@/components/images/ImageThumb';
import { PlanPreview } from '@/components/plan/PlanPreview';
import { Dialog } from '@/components/ui/Overlay';
import { Field, Input, Select, Textarea } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { StatusLabel } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';
import { cn } from '@/components/ui/cn';
import { plural } from '@/lib/format';

export function RoomStatusLabel({ status, className }: { status: RoomStatus; className?: string }) {
  const meta = roomStatusMeta(status);
  return (
    <StatusLabel tone={meta.tone} className={className}>
      {meta.label}
    </StatusLabel>
  );
}

function initials(name: string): string {
  const words = name
    .replace(/[&’'"]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 1)).toUpperCase();
}

/** Cover image, or the room's plan, or a quiet monogram. */
export function RoomCover({ room, className }: { room: Room; className?: string }) {
  const cover = useReference(room.coverReferenceId);
  const drawable = useMemo(() => computeRoomShape(room).drawable, [room]);
  if (cover) return <ImageThumb imageId={cover.imageId} className={cn('w-full', className)} alt={room.name} />;
  if (drawable)
    return (
      <div className={cn('relative w-full overflow-hidden bg-surface', className)}>
        <div className="absolute inset-0">
          <PlanPreview room={room} minimal height="fill" className="!rounded-none !border-0" showFurniture />
        </div>
      </div>
    );
  return (
    <div className={cn('hairline-grid relative flex w-full items-center justify-center bg-mist/60', className)}>
      <span className="display text-[44px] text-ink-4/80">{initials(room.name)}</span>
    </div>
  );
}

/** Create or edit a room's basic details. */
export function RoomFormDialog({
  open,
  onOpenChange,
  room,
  defaultFloorId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  room?: Room | null;
  defaultFloorId?: ID | null;
}) {
  const floors = useFloors() ?? [];
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState<RoomType>('living');
  const [floorId, setFloorId] = useState<string>('');
  const [status, setStatus] = useState<RoomStatus>('not-started');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(room?.name ?? '');
    setType(room?.type ?? 'living');
    setFloorId(room?.floorId ?? defaultFloorId ?? '');
    setStatus(room?.status ?? 'not-started');
    setDescription(room?.description ?? '');
    setError(null);
  }, [open, room, defaultFloorId]);

  const save = async () => {
    if (!name.trim()) {
      setError('Give the room a name');
      return;
    }
    setSaving(true);
    try {
      if (room) {
        await patchRoom(room.id, {
          name: name.trim(),
          type,
          floorId: floorId || null,
          status,
          description,
          ...(floorId !== (room.floorId ?? '') ? { planPlacement: null } : {}),
        });
        toast.success('Room updated');
        onOpenChange(false);
      } else {
        const created = await addRoom({ name, type, floorId: floorId || null, description });
        toast.success(`${created.name} added`);
        onOpenChange(false);
        navigate(`/rooms/${created.id}/overview`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={room ? 'Edit room details' : 'Add a room'}
      description={room ? undefined : 'Start with the basics — dimensions, photos and requirements are added inside the room.'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {room ? 'Save' : 'Add room'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name" error={error}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Guest Bedroom" invalid={!!error} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Room type">
            <Select value={type} onChange={(e) => setType(e.target.value as RoomType)}>
              {ROOM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Floor" hint={floors.length ? undefined : 'Create floors in Floor Plans.'}>
            <Select value={floorId} onChange={(e) => setFloorId(e.target.value)}>
              <option value="">Unknown / not assigned</option>
              {floors.map((f: Floor) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {room && (
          <Field label="Design status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as RoomStatus)}>
              {ROOM_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Description" hint="Optional — how the room is used, who uses it, anything notable.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} minRows={3} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

/** Room actions shared by the gallery and workspace. */
export function useRoomActions() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  return {
    async remove(room: Room, after?: () => void) {
      const impact = await roomDeletionImpact(room.id);
      const r = await confirm({
        title: `Delete ${room.name}?`,
        tone: 'danger',
        confirmLabel: 'Delete room',
        description: (
          <>
            This permanently deletes the room, its dimensions, architecture, layout,{' '}
            {impact.requirements ? plural(impact.requirements, 'requirement') : 'requirements'} and{' '}
            {impact.versions ? plural(impact.versions, 'design version') : 'design versions'}. Export a backup first if you might need it.
          </>
        ),
        checkbox: impact.exclusiveImages
          ? {
              label: `Also delete ${plural(impact.exclusiveImages, 'image')} used only by this room`,
              description: 'Leave unchecked to keep them in the Design Library.',
              defaultChecked: true,
            }
          : undefined,
        typeToConfirm: impact.versions > 0 || impact.requirements > 3 ? 'DELETE' : undefined,
      });
      if (!r.confirmed) return;
      await deleteRoom(room.id, { deleteImages: r.checked });
      toast.success(`${room.name} deleted`);
      after?.();
    },
    async duplicate(room: Room) {
      const copy = await duplicateRoom(room.id);
      toast.success(`Created ${copy.name}`, {
        description: 'Dimensions, architecture, layout, requirements and direction were copied. Design versions were not.',
      });
      navigate(`/rooms/${copy.id}/overview`);
    },
  };
}
