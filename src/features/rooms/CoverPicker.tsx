import { toast } from 'sonner';
import type { Room } from '@/lib/types';
import { setRoomCover } from '@/lib/db/rooms';
import { ReferencePicker } from '@/components/images/references';
import { roomDisplayName } from '@/lib/names';
import { useI18n } from '@/i18n';

/** Choose (or upload) a cover photo for a room. */
export function CoverPicker({ room, onClose }: { room: Room | null; onClose: () => void }) {
  const { t, lang } = useI18n();
  return (
    <ReferencePicker
      open={!!room}
      onOpenChange={(o) => !o && onClose()}
      single
      imagesOnly
      title={room ? t.roomForm.coverFor(roomDisplayName(room, lang)) : t.roomForm.cover}
      confirmLabel={t.roomForm.useAsCover}
      preferRoomId={room?.id}
      uploadDefaults={room ? { kind: 'site-photo', roomIds: [room.id] } : undefined}
      onPick={async (ids) => {
        if (!room || !ids[0]) return;
        await setRoomCover(room.id, ids[0]);
        toast.success(t.roomForm.coverUpdated);
        onClose();
      }}
    />
  );
}
