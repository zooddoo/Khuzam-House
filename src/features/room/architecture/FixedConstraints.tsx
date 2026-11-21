import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Room } from '@/lib/types';
import { updateRoom } from '@/lib/db/rooms';
import { Button, IconButton } from '@/components/ui/Button';
import { CommitInput, Input } from '@/components/ui/Form';
import { GroupLabel } from '@/components/ui/Display';
import { useT } from '@/i18n';
import { EnglishField } from '@/components/translate/EnglishField';

/** User-defined items that must never change in designs (added to the DO NOT CHANGE list). */
export function FixedConstraints({ room }: { room: Room }) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    await updateRoom(room.id, (d) => void d.fixedConstraints.push(text));
    setDraft('');
  };
  return (
    <section>
      <GroupLabel>{t.arch.fixedTitle}</GroupLabel>
      <p className="mb-3 text-[12px] leading-relaxed text-ink-3">{t.arch.fixedHelp}</p>
      <ul className="mb-2 flex flex-col gap-1.5">
        {room.fixedConstraints.map((c, i) => (
          <li key={`${i}-${c}`} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <CommitInput
                value={c}
                onCommit={(v) => updateRoom(room.id, (d) => void (v.trim() ? (d.fixedConstraints[i] = v.trim()) : d.fixedConstraints.splice(i, 1)))}
              />
              <IconButton icon={Trash2} label={t.common.remove} variant="danger" onClick={() => updateRoom(room.id, (d) => void d.fixedConstraints.splice(i, 1))} />
            </div>
            <EnglishField source={c} compact />
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.arch.fixedPlaceholder} aria-label={t.arch.fixedAria} />
        <Button type="submit" icon={Plus} disabled={!draft.trim()}>
          {t.common.add}
        </Button>
      </form>
    </section>
  );
}
