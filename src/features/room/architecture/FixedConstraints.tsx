import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Room } from '@/lib/types';
import { updateRoom } from '@/lib/db/rooms';
import { Button, IconButton } from '@/components/ui/Button';
import { CommitInput, Input } from '@/components/ui/Form';
import { GroupLabel } from '@/components/ui/Display';

/** User-defined items that must never change in designs (added to the DO NOT CHANGE list). */
export function FixedConstraints({ room }: { room: Room }) {
  const [draft, setDraft] = useState('');
  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    await updateRoom(room.id, (d) => void d.fixedConstraints.push(t));
    setDraft('');
  };
  return (
    <section>
      <GroupLabel>Other things that must not change</GroupLabel>
      <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
        Anything else to keep in every design of this room — e.g. “Keep the existing marble floor” or “The staircase stays as it is”. These join the DO NOT
        CHANGE list.
      </p>
      <ul className="mb-2 flex flex-col gap-1.5">
        {room.fixedConstraints.map((c, i) => (
          <li key={`${i}-${c}`} className="flex items-center gap-2">
            <CommitInput
              value={c}
              onCommit={(v) => updateRoom(room.id, (d) => void (v.trim() ? (d.fixedConstraints[i] = v.trim()) : d.fixedConstraints.splice(i, 1)))}
            />
            <IconButton icon={Trash2} label="Remove" variant="danger" onClick={() => updateRoom(room.id, (d) => void d.fixedConstraints.splice(i, 1))} />
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a fixed constraint…" aria-label="New fixed constraint" />
        <Button type="submit" icon={Plus} disabled={!draft.trim()}>
          Add
        </Button>
      </form>
    </section>
  );
}
