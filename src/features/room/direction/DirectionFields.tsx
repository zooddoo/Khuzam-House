import type { DesignDirectionFields } from '@/lib/types';
import { CommitInput, Field } from '@/components/ui/Form';
import { PaletteEditor } from './PaletteEditor';

export const DIRECTION_TEXT_FIELDS: { key: Exclude<keyof DesignDirectionFields, 'palette'>; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: 'style', label: 'Interior style', placeholder: 'e.g. Warm minimalist' },
  { key: 'atmosphere', label: 'Atmosphere', placeholder: 'e.g. Calm, quiet, softly lit' },
  { key: 'materials', label: 'Materials', placeholder: 'e.g. Oak, linen, honed limestone' },
  { key: 'woodType', label: 'Wood type', placeholder: 'e.g. Light oak, rift-sawn' },
  { key: 'flooring', label: 'Flooring', placeholder: 'e.g. Large-format beige porcelain' },
  { key: 'wallFinishes', label: 'Wall finishes', placeholder: 'e.g. Limewash; oak cladding on the TV wall' },
  { key: 'furnitureStyle', label: 'Furniture style', placeholder: 'e.g. Low, soft, rounded edges' },
  { key: 'lighting', label: 'Lighting', placeholder: 'e.g. Warm 2700K, hidden coves, few pendants' },
  { key: 'curtains', label: 'Curtains', placeholder: 'e.g. Sheer linen + blackout, ceiling-mounted' },
  { key: 'paletteNotes', label: 'Palette notes', placeholder: 'e.g. Mostly neutral; one muted accent' },
  { key: 'description', label: 'Description', placeholder: 'Describe the direction in your own words', multiline: true },
  { key: 'avoid', label: 'Avoid in this room', placeholder: 'e.g. High gloss, busy patterns, grey tones', multiline: true },
];

/** Editable direction fields. All are optional. */
export function DirectionFieldsEditor({ value, onChange }: { value: DesignDirectionFields; onChange: (patch: Partial<DesignDirectionFields>) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {DIRECTION_TEXT_FIELDS.filter((f) => !f.multiline).map((f) => (
        <Field key={f.key} label={f.label}>
          <CommitInput value={value[f.key]} onCommit={(v) => onChange({ [f.key]: v })} placeholder={f.placeholder} />
        </Field>
      ))}
      <Field label="Color palette" className="md:col-span-2">
        <PaletteEditor value={value.palette} onChange={(palette) => onChange({ palette })} />
      </Field>
      {DIRECTION_TEXT_FIELDS.filter((f) => f.multiline).map((f) => (
        <Field key={f.key} label={f.label} className="md:col-span-2">
          <CommitInput multiline minRows={3} value={value[f.key]} onCommit={(v) => onChange({ [f.key]: v })} placeholder={f.placeholder} />
        </Field>
      ))}
    </div>
  );
}
