import { useEffect, useRef, useState } from 'react';
import { Sparkles, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Priority, RequirementCategory, Room } from '@/lib/types';
import { PRIORITIES, REQUIREMENT_CATEGORIES, roomTypeLabel } from '@/lib/labels';
import { parseRequirementsText, type ParsedRequirement } from '@/lib/ai/text/parse';
import { structureWithAI, textProviderReady } from '@/lib/ai/text/structure';
import { describeError } from '@/lib/ai/http';
import { addRequirements } from '@/lib/db/requirements';
import { useSettings } from '@/lib/hooks/data';
import { Dialog } from '@/components/ui/Overlay';
import { Button, IconButton } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Display';
import { Field, Input, Segmented, Select, Textarea } from '@/components/ui/Form';

const EXAMPLE = `Storage:
- Must have a full-height cabinet for board games
- Hidden storage for cushions (preferred)

Furniture:
- A reading corner beside the window with two chairs and a small table
- No glossy surfaces

Lighting:
- Warm indirect lighting, dimmable`;

export function BulkImportDialog({ room, open, onOpenChange }: { room: Room; open: boolean; onOpenChange: (o: boolean) => void }) {
  const settings = useSettings();
  const [text, setText] = useState('');
  const [defaultPriority, setDefaultPriority] = useState<Priority>('preferred');
  const [rows, setRows] = useState<ParsedRequirement[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<{ message: string; hint: string | null } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const ai = settings ? textProviderReady(settings.textProvider) : null;

  useEffect(() => {
    if (open) {
      setText('');
      setRows(null);
      setAiError(null);
    } else abort.current?.abort();
  }, [open]);

  const parseLocal = () => {
    const out = parseRequirementsText(text, { priority: defaultPriority });
    setRows(out);
    setAiError(null);
    if (!out.length) toast.error('No requirements found in the text.');
  };

  const parseAI = async () => {
    if (!settings) return;
    setAiBusy(true);
    setAiError(null);
    abort.current = new AbortController();
    try {
      const out = await structureWithAI(text, { roomName: room.name, roomType: roomTypeLabel(room.type) }, settings.textProvider, abort.current.signal);
      setRows(out);
      if (!out.length) toast.error('The model found no requirements in the text.');
    } catch (e) {
      setAiError(describeError(e));
    } finally {
      setAiBusy(false);
    }
  };

  const update = (i: number, patch: Partial<ParsedRequirement>) => setRows((r) => (r ? r.map((x, j) => (j === i ? { ...x, ...patch } : x)) : r));

  const doImport = async () => {
    if (!rows?.length) return;
    const valid = rows.filter((r) => r.title.trim());
    await addRequirements(
      room.id,
      valid.map((r) => ({ ...r, title: r.title.trim(), description: r.description.trim(), source: 'Pasted notes' })),
    );
    toast.success(`${valid.length} requirement${valid.length > 1 ? 's' : ''} added to ${room.name}`);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      modalLock
      title="Paste multiple requirements"
      description="Paste a list or free-form notes (English or Arabic). Review the result before adding — nothing is added until you confirm."
      footer={
        rows ? (
          <>
            <Button variant="ghost" onClick={() => setRows(null)} className="mr-auto">
              Back to text
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!rows.filter((r) => r.title.trim()).length} onClick={doImport}>
              Add {rows.filter((r) => r.title.trim()).length} requirement{rows.length === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setText(EXAMPLE)} className="mr-auto">
              Show an example
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              icon={Sparkles}
              disabled={!text.trim() || !ai?.ready}
              loading={aiBusy}
              onClick={parseAI}
              title={ai?.ready ? `Uses ${ai.label}` : 'Optional: configure an AI text model in Settings'}
            >
              Structure with AI
            </Button>
            <Button variant="primary" icon={Wand2} disabled={!text.trim()} onClick={parseLocal}>
              Split into requirements
            </Button>
          </>
        )
      }
    >
      {!rows ? (
        <div className="flex flex-col gap-4">
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            minRows={10}
            maxRows={22}
            placeholder={'- Must have…\n- I’d like…\n- No…'}
            aria-label="Requirements text"
          />
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Priority when none is mentioned">
              <Segmented value={defaultPriority} onChange={setDefaultPriority} options={PRIORITIES.map((p) => ({ value: p.value, label: p.short }))} />
            </Field>
            <p className="max-w-[440px] text-[11.5px] leading-relaxed text-ink-3">
              “Split into requirements” works offline: bullets and lines become requirements, headings become categories or groups, and words like “must”,
              “optional” or “no …” set priority and exclusions.{' '}
              {ai?.ready ? `“Structure with AI” uses ${ai.label}.` : 'AI structuring is optional and needs a text model in Settings.'}
            </p>
          </div>
          {aiError && (
            <Callout tone="danger" title={aiError.message}>
              {aiError.hint}
            </Callout>
          )}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-line rounded-md border border-line">
          {rows.length === 0 && <div className="p-6 text-center text-[13px] text-ink-3">Nothing found. Go back and adjust the text.</div>}
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_150px_130px_auto_auto] md:items-start">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Input value={r.title} onChange={(e) => update(i, { title: e.target.value })} aria-label="Title" />
                {r.description && (
                  <Textarea
                    value={r.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    minRows={1}
                    maxRows={5}
                    className="text-[12.5px]"
                    aria-label="Description"
                  />
                )}
                {(r.group || r.notes) && (
                  <div className="text-[11.5px] text-ink-3">
                    {r.group && <>Group: {r.group}. </>}
                    {r.notes}
                  </div>
                )}
              </div>
              <Select value={r.category} onChange={(e) => update(i, { category: e.target.value as RequirementCategory })} aria-label="Category">
                {REQUIREMENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <Select value={r.priority} onChange={(e) => update(i, { priority: e.target.value as Priority })} aria-label="Priority">
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
              <Segmented
                size="sm"
                value={r.kind}
                onChange={(v) => update(i, { kind: v })}
                options={[
                  { value: 'want', label: 'Want' },
                  { value: 'avoid', label: 'Don’t want' },
                ]}
                className="mt-1"
              />
              <IconButton icon={Trash2} label="Remove" variant="danger" onClick={() => setRows((rs) => (rs ? rs.filter((_, j) => j !== i) : rs))} />
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
