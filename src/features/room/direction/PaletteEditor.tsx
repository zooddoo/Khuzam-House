import { Plus, Trash2 } from 'lucide-react';
import type { PaletteColor } from '@/lib/types';
import { newId } from '@/lib/ids';
import { Button, IconButton } from '@/components/ui/Button';
import { CommitInput } from '@/components/ui/Form';

const HEX = /^#[0-9a-f]{6}$/i;

export function PaletteEditor({ value, onChange }: { value: PaletteColor[]; onChange: (p: PaletteColor[]) => void }) {
  const update = (id: string, patch: Partial<PaletteColor>) => onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex h-10 overflow-hidden rounded-sm border border-line">
          {value.map((c) => (
            <div key={c.id} className="flex-1" style={{ background: HEX.test(c.hex) ? c.hex : '#ccc' }} title={`${c.name} ${c.hex}`} />
          ))}
        </div>
      )}
      {value.map((c) => (
        <div key={c.id} className="grid grid-cols-[36px_96px_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
          <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-sm border border-line" style={{ background: c.hex }}>
            <input
              type="color"
              value={HEX.test(c.hex) ? c.hex : '#cccccc'}
              onChange={(e) => update(c.id, { hex: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Pick color"
            />
          </label>
          <CommitInput
            value={c.hex}
            onCommit={(v) => HEX.test(v.trim()) && update(c.id, { hex: v.trim() })}
            className="font-mono text-[12px]"
            aria-label="Hex value"
          />
          <CommitInput value={c.name} onCommit={(v) => update(c.id, { name: v })} placeholder="Name" aria-label="Color name" />
          <CommitInput value={c.role} onCommit={(v) => update(c.id, { role: v })} placeholder="Use (walls, wood…)" aria-label="Color role" />
          <IconButton icon={Trash2} label="Remove color" variant="danger" onClick={() => onChange(value.filter((x) => x.id !== c.id))} />
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        icon={Plus}
        className="self-start"
        onClick={() => onChange([...value, { id: newId('c'), hex: '#d9c8b0', name: '', role: '' }])}
      >
        Add color
      </Button>
    </div>
  );
}
