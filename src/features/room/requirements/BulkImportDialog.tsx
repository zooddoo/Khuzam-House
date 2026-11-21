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
import { useI18n } from '@/i18n';
import { roomDisplayName } from '@/lib/names';



export function BulkImportDialog({ room, open, onOpenChange }: { room: Room; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, lang } = useI18n();
  const b = t.bulk;
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
    if (!out.length) toast.error(b.nothingFound);
  };

  const parseAI = async () => {
    if (!settings) return;
    setAiBusy(true);
    setAiError(null);
    abort.current = new AbortController();
    try {
      const out = await structureWithAI(text, { roomName: room.name || room.nameAr || '', roomType: roomTypeLabel(room.type, 'en') }, settings.textProvider, abort.current.signal);
      setRows(out);
      if (!out.length) toast.error(b.modelFoundNone);
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
      valid.map((r) => ({ ...r, title: r.title.trim(), description: r.description.trim(), source: b.pastedSource })),
    );
    toast.success(b.addedTo(valid.length, roomDisplayName(room, lang)));
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      modalLock
      title={b.title}
      description={b.lead}
      footer={
        rows ? (
          <>
            <Button variant="ghost" onClick={() => setRows(null)} className="me-auto">
              {b.back}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" disabled={!rows.filter((r) => r.title.trim()).length} onClick={doImport}>
              {b.add(rows.filter((r) => r.title.trim()).length)}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setText(b.example)} className="me-auto">
              {b.showExample}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button icon={Sparkles} disabled={!text.trim() || !ai?.ready} loading={aiBusy} onClick={parseAI} title={ai?.ready ? b.usesAi(ai.label) : b.aiOptional}>
              {b.withAi}
            </Button>
            <Button variant="primary" icon={Wand2} disabled={!text.trim()} onClick={parseLocal}>
              {b.split}
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
            placeholder={b.placeholder}
            aria-label={b.textAria}
          />
          <div className="flex flex-wrap items-end gap-4">
            <Field label={b.defaultPriority}>
              <Segmented value={defaultPriority} onChange={setDefaultPriority} options={PRIORITIES.map((p) => ({ value: p.value, label: p.short }))} />
            </Field>
            <p className="max-w-[440px] text-[11.5px] leading-relaxed text-ink-3">
              {b.help} {ai?.ready ? b.helpAi(ai.label) : b.helpNoAi}
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
          {rows.length === 0 && <div className="p-6 text-center text-[13px] text-ink-3">{b.nothingHere}</div>}
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_150px_130px_auto_auto] md:items-start">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Input value={r.title} onChange={(e) => update(i, { title: e.target.value })} aria-label={t.reqs.fieldTitle} />
                {r.description && (
                  <Textarea
                    value={r.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    minRows={1}
                    maxRows={5}
                    className="!text-[12.5px]"
                    aria-label={t.reqs.fieldDescription}
                  />
                )}
                {(r.group || r.notes) && (
                  <div className="text-[11.5px] text-ink-3">
                    {r.group && <>{b.group(r.group)} </>}
                    {r.notes}
                  </div>
                )}
              </div>
              <Select value={r.category} onChange={(e) => update(i, { category: e.target.value as RequirementCategory })} aria-label={t.reqs.fieldCategory}>
                {REQUIREMENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <Select value={r.priority} onChange={(e) => update(i, { priority: e.target.value as Priority })} aria-label={t.reqs.fieldPriority}>
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
                  { value: 'want', label: t.reqs.want },
                  { value: 'avoid', label: t.reqs.dontWant },
                ]}
                className="mt-1"
              />
              <IconButton icon={Trash2} label={t.common.remove} variant="danger" onClick={() => setRows((rs) => (rs ? rs.filter((_, j) => j !== i) : rs))} />
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
