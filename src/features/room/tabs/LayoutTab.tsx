import { useState } from 'react';
import type { ArchElement, Room } from '@/lib/types';
import { RoomPlanEditor } from '@/components/plan/RoomPlanEditor';
import { ElementDialog } from '../architecture/ElementDialog';

export function LayoutTab({ room }: { room: Room }) {
  const [editing, setEditing] = useState<ArchElement | null>(null);
  return (
    <div>
      <div className="mb-5">
        <h2 className="display text-[28px]">Layout</h2>
        <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-ink-3">
          A to-scale, top-down plan of this room. Place furniture with real dimensions and check clearances against doors, windows and AC units. The layout can
          be sent to the AI as a placement guide.
        </p>
      </div>
      <RoomPlanEditor room={room} onEditElement={setEditing} />
      <ElementDialog room={room} element={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
