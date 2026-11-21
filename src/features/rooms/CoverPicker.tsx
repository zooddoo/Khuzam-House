import { toast } from 'sonner';
import type { Room } from '@/lib/types';
import { setRoomCover } from '@/lib/db/rooms';
import { ReferencePicker } from '@/components/images/references';

/** Choose (or upload) a cover image for a room. */
export function CoverPicker({ room, onClose }: { room: Room | null; onClose: () => void }) {
  return (
    <ReferencePicker
      open={!!room}
      onOpenChange={(o) => !o && onClose()}
      single
      title={room ? `Cover image for ${room.name}` : 'Cover image'}
      confirmLabel="Use as cover"
      preferRoomId={room?.id}
      uploadDefaults={room ? { kind: 'site-photo', roomIds: [room.id] } : undefined}
      onPick={async (ids) => {
        if (!room || !ids[0]) return;
        await setRoomCover(room.id, ids[0]);
        toast.success('Cover updated');
        onClose();
      }}
    />
  );
}
