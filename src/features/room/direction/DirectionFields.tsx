import type { DesignDirectionFields } from '@/lib/types';
import { CommitInput, Field } from '@/components/ui/Form';
import { EnglishField } from '@/components/translate/EnglishField';
import { useT } from '@/i18n';
import { PaletteEditor } from './PaletteEditor';

type TextKey = Exclude<keyof DesignDirectionFields, 'palette'>;

export const DIRECTION_TEXT_FIELDS: { key: TextKey; multiline?: boolean }[] = [
  { key: 'style' },
  { key: 'atmosphere' },
  { key: 'materials' },
  { key: 'woodType' },
  { key: 'flooring' },
  { key: 'wallFinishes' },
  { key: 'furnitureStyle' },
  { key: 'lighting' },
  { key: 'curtains' },
  { key: 'paletteNotes' },
  { key: 'description', multiline: true },
  { key: 'avoid', multiline: true },
];

/** Editable direction fields. All are optional. Arabic text gets an English field for the prompt. */
export function DirectionFieldsEditor({ value, onChange }: { value: DesignDirectionFields; onChange: (patch: Partial<DesignDirectionFields>) => void }) {
  const t = useT();
  const D = t.direction;
  const field = (f: (typeof DIRECTION_TEXT_FIELDS)[number], multiline = false) => (
    <div key={f.key} className={multiline ? 'flex flex-col gap-1.5 md:col-span-2' : 'flex flex-col gap-1.5'}>
      <Field label={D.fields[f.key]}>
        <CommitInput multiline={multiline} minRows={multiline ? 3 : undefined} value={value[f.key]} onCommit={(v) => onChange({ [f.key]: v })} placeholder={D.placeholders[f.key]} />
      </Field>
      <EnglishField source={value[f.key]} compact={!multiline} />
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {DIRECTION_TEXT_FIELDS.filter((f) => !f.multiline).map((f) => field(f))}
      <Field label={D.palette} className="md:col-span-2">
        <PaletteEditor value={value.palette} onChange={(palette) => onChange({ palette })} />
      </Field>
      {DIRECTION_TEXT_FIELDS.filter((f) => f.multiline).map((f) => field(f, true))}
    </div>
  );
}
