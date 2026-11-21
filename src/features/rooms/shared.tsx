import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { Floor, ID, Room, RoomStatus, RoomType } from '@/lib/types';
import { ROOM_STATUSES, ROOM_TYPES, roomStatusMeta, roomTypeLabel } from '@/lib/labels';
import { useFloors, useReference } from '@/lib/hooks/data';
import { addRoom, deleteRoom, duplicateRoom, patchRoom, roomDeletionImpact } from '@/lib/db/rooms';
import { computeRoomShape } from '@/lib/geometry/room';
import { floorDisplayName, roomDisplayName } from '@/lib/names';
import { hasArabic } from '@/i18n/arabic';
import { useI18n } from '@/i18n';
import { ImageThumb } from '@/components/images/ImageThumb';
import { PlanPreview } from '@/components/plan/PlanPreview';
import { Dialog } from '@/components/ui/Overlay';
import { Field, Input, Select, Textarea } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { StatusLabel } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';
import { cn } from '@/components/ui/cn';

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
  if (hasArabic(name)) return (words.find((w) => w !== 'غرفة' && w !== 'ال') ?? words[0] ?? '؟').replace(/^ال/, '').slice(0, 1);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 1)).toUpperCase();
}

/** Cover photo, or the room's plan, or a quiet monogram. */
export function RoomCover({ room, className }: { room: Room; className?: string }) {
  const { lang } = useI18n();
  const cover = useReference(room.coverReferenceId);
  const drawable = useMemo(() => computeRoomShape(room).drawable, [room]);
  const name = roomDisplayName(room, lang);
  if (cover) return <ImageThumb imageId={cover.imageId} className={cn('w-full', className)} alt={name} />;
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
      <span className="display text-[40px] text-ink-4/80">{initials(name)}</span>
    </div>
  );
}

/** Create or edit a room's basic details (Arabic and English names). */
export function RoomFormDialog({ open, onOpenChange, room, defaultFloorId }: { open: boolean; onOpenChange: (o: boolean) => void; room?: Room | null; defaultFloorId?: ID | null }) {
  const { t, lang } = useI18n();
  const floors = useFloors() ?? [];
  const navigate = useNavigate();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [type, setType] = useState<RoomType>('living');
  const [floorId, setFloorId] = useState<string>('');
  const [status, setStatus] = useState<RoomStatus>('not-started');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNameAr(room?.nameAr ?? '');
    setNameEn(room?.name ?? '');
    setType(room?.type ?? 'living');
    setFloorId(room?.floorId ?? defaultFloorId ?? '');
    setStatus(room?.status ?? 'not-started');
    setDescription(room?.description ?? '');
    setError(null);
  }, [open, room, defaultFloorId]);

  const save = async () => {
    if (!nameAr.trim() && !nameEn.trim()) {
      setError(t.roomForm.nameRequired);
      return;
    }
    setSaving(true);
    try {
      if (room) {
        await patchRoom(room.id, {
          name: nameEn.trim(),
          nameAr: nameAr.trim() || undefined,
          type,
          floorId: floorId || null,
          status,
          description,
          ...(floorId !== (room.floorId ?? '') ? { planPlacement: null } : {}),
        });
        toast.success(t.roomForm.updated);
        onOpenChange(false);
      } else {
        const created = await addRoom({ name: nameEn, nameAr, type, floorId: floorId || null, description });
        toast.success(t.roomForm.added(roomDisplayName(created, lang)));
        onOpenChange(false);
        navigate(`/rooms/${created.id}/overview`);
      }
    } finally {
      setSaving(false);
    }
  };

  const arField = (
    <Field label={t.common.nameAr} error={error} key="ar">
      <Input dir="rtl" lang="ar" autoFocus={lang === 'ar'} value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={t.roomForm.nameArPlaceholder} invalid={!!error} />
    </Field>
  );
  const enField = (
    <Field label={t.common.nameEn} hint={t.roomForm.nameEnHint} key="en">
      <Input dir="ltr" lang="en" autoFocus={lang === 'en'} value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder={t.roomForm.nameEnPlaceholder} />
    </Field>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={room ? t.roomForm.editTitle : t.roomForm.addTitle}
      description={room ? undefined : t.roomForm.addLead}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {room ? t.common.save : t.roomForm.add}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">{lang === 'ar' ? [arField, enField] : [enField, arField]}</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.roomForm.type}>
            <Select value={type} onChange={(e) => setType(e.target.value as RoomType)}>
              {ROOM_TYPES.map((rt) => (
                <option key={rt.value} value={rt.value}>
                  {rt.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.roomForm.floor} hint={floors.length ? undefined : t.roomForm.floorHint}>
            <Select value={floorId} onChange={(e) => setFloorId(e.target.value)}>
              <option value="">{t.roomForm.noFloor}</option>
              {floors.map((f: Floor) => (
                <option key={f.id} value={f.id}>
                  {floorDisplayName(f, lang)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {room && (
          <Field label={t.roomForm.status}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as RoomStatus)}>
              {ROOM_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t.common.description} hint={t.roomForm.descriptionHint}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} minRows={3} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

/** Room actions shared by the gallery and workspace. */
export function useRoomActions() {
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const navigate = useNavigate();
  return {
    async remove(room: Room, after?: () => void) {
      const impact = await roomDeletionImpact(room.id);
      const name = roomDisplayName(room, lang) || roomTypeLabel(room.type);
      const r = await confirm({
        title: t.roomForm.deleteTitle(name),
        tone: 'danger',
        confirmLabel: t.roomForm.deleteConfirm,
        description: t.roomForm.deleteBody(impact.requirements, impact.versions),
        typeToConfirm: impact.versions > 0 || impact.requirements > 3 ? t.roomForm.typeWord : undefined,
      });
      if (!r.confirmed) return;
      await deleteRoom(room.id);
      toast.success(t.roomForm.deleted(name), { description: t.trash.moveHint });
      after?.();
    },
    async duplicate(room: Room) {
      const copy = await duplicateRoom(room.id);
      toast.success(t.roomForm.duplicated(roomDisplayName(copy, lang)), { description: t.roomForm.duplicatedHint });
      navigate(`/rooms/${copy.id}/overview`);
    },
  };
}
