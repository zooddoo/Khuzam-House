import { useState } from 'react';
import type { ArchElement, Room } from '@/lib/types';
import { RoomPlanEditor } from '@/components/plan/RoomPlanEditor';
import { useT } from '@/i18n';
import { ElementDialog } from '../architecture/ElementDialog';

export function LayoutTab({ room }: { room: Room }) {
  const t = useT();
  const [editing, setEditing] = useState<ArchElement | null>(null);
  return (
    <div>
      <div className="mb-5">
        <h2 className="display text-[28px]">{t.layoutTab.title}</h2>
        <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-ink-3">{t.layoutTab.lead}</p>
      </div>
      <RoomPlanEditor room={room} onEditElement={setEditing} />
      <ElementDialog room={room} element={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
