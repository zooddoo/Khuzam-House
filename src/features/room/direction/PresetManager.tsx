import { useState } from 'react';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignDirectionFields, DirectionPreset } from '@/lib/types';
import { usePresets } from '@/lib/hooks/data';
import { deletePreset, resetPreset, savePreset } from '@/lib/db/misc';
import { emptyDirectionFields } from '@/lib/db/factories';
import { Dialog } from '@/components/ui/Overlay';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/Confirm';
import { DirectionFieldsEditor } from './DirectionFields';
import { useI18n } from '@/i18n';
import { presetDisplayName, presetSummary } from '@/lib/names';

export function PaletteStrip({ fields, className = 'h-2' }: { fields: DesignDirectionFields; className?: string }) {
  if (!fields.palette.length) return <div className={`${className} rounded-full bg-mist`} />;
  return (
    <div className={`flex overflow-hidden rounded-full ${className}`} dir="ltr">
      {fields.palette.map((c) => (
        <div key={c.id} className="flex-1" style={{ background: c.hex }} />
      ))}
    </div>
  );
}

/** View, edit, reset and create design presets. Presets are starting points only. */
export function PresetManager({ open, onOpenChange, seed }: { open: boolean; onOpenChange: (o: boolean) => void; seed?: DesignDirectionFields | null }) {
  const { t, lang } = useI18n();
  const T = t.presets;
  const presets = usePresets() ?? [];
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ id?: string; name: string; summary: string; fields: DesignDirectionFields } | null>(null);

  const startNew = (fields?: DesignDirectionFields) => setEditing({ name: '', summary: '', fields: structuredClone(fields ?? emptyDirectionFields()) });

  return (
    <>
      <Dialog
        open={open && !editing}
        onOpenChange={onOpenChange}
        size="lg"
        title={T.title}
        description={T.lead}
        footer={
          <>
            {seed && (
              <Button onClick={() => startNew(seed)} className="me-auto">
                {T.saveRoom}
              </Button>
            )}
            <Button variant="primary" icon={Plus} onClick={() => startNew()}>
              {T.new}
            </Button>
          </>
        }
      >
        <ul className="flex flex-col divide-y divide-line">
          {presets.map((p: DirectionPreset) => (
            <li key={p.id} className="flex items-center gap-4 py-3">
              <div className="w-24 shrink-0">
                <PaletteStrip fields={p.fields} className="h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px]" dir="auto">
                  {presetDisplayName(p, lang)}
                </div>
                <div className="truncate text-[12px] text-ink-3" dir="auto">
                  {presetSummary(p, lang)}
                </div>
              </div>
              <IconButton
                icon={Pencil}
                label={T.edit}
                onClick={() => setEditing({ id: p.id, name: p.name, summary: p.summary, fields: structuredClone(p.fields) })}
              />
              {p.builtIn && (
                <IconButton
                  icon={RotateCcw}
                  label={T.reset}
                  onClick={async () => {
                    const r = await confirm({ title: T.resetTitle(presetDisplayName(p, lang)), description: T.resetBody, confirmLabel: t.common.reset });
                    if (r.confirmed && (await resetPreset(p.id))) toast.success(T.resetDone);
                  }}
                />
              )}
              <IconButton
                icon={Trash2}
                label={T.delete}
                variant="danger"
                onClick={async () => {
                  const r = await confirm({ title: T.deleteTitle(presetDisplayName(p, lang)), tone: 'danger', confirmLabel: t.common.delete, description: T.deleteBody });
                  if (r.confirmed) await deletePreset(p.id);
                }}
              />
            </li>
          ))}
        </ul>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        size="lg"
        title={editing?.id ? T.edit : T.new}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!editing?.name.trim()) {
                  toast.error(T.nameRequired);
                  return;
                }
                await savePreset({ ...editing, name: editing.name.trim() });
                toast.success(T.saved);
                setEditing(null);
              }}
            >
              {T.save}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={T.name}>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label={T.summary}>
                <Input value={editing.summary} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} />
              </Field>
            </div>
            <DirectionFieldsEditor value={editing.fields} onChange={(patch) => setEditing((e) => (e ? { ...e, fields: { ...e.fields, ...patch } } : e))} />
          </div>
        )}
      </Dialog>
    </>
  );
}
