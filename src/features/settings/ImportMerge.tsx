import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, FileJson, PackageOpen, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { applyMerge, ImportError, parseImportFile, planMerge, type MergePlan, type RoomChoice } from '@/lib/import/merge';
import { roomDisplayName } from '@/lib/names';
import { useI18n } from '@/i18n';
import { num } from '@/i18n/format';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Display';
import { Checkbox, Segmented } from '@/components/ui/Form';
import { Dialog } from '@/components/ui/Overlay';
import { cn } from '@/components/ui/cn';

const INCLUDED_URL = '/import/bait-khuzam-import.json';

/** Settings card: add data from an import file (adds only, preview first). */
export function ImportMergeCard() {
  const { t, lang } = useI18n();
  const M = t.importer;
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [choices, setChoices] = useState<Record<string, RoomChoice>>({});
  const [addProject, setAddProject] = useState(true);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const open = async (text: string) => {
    setLoading(true);
    try {
      const file = parseImportFile(text);
      const p = await planMerge(file);
      setChoices(Object.fromEntries(p.rooms.filter((r) => r.existing).map((r) => [r.source.key, 'keep' as RoomChoice])));
      setAddProject(true);
      setPlan(p);
    } catch (e) {
      toast.error(M.readFailed, { description: e instanceof ImportError ? M.errors[e.message] ?? e.message : (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const loadIncluded = async () => {
    setLoading(true);
    try {
      const res = await fetch(INCLUDED_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await open(await res.text());
    } catch (e) {
      toast.error(M.readFailed, { description: (e as Error).message });
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!plan) return;
    setApplying(true);
    try {
      const r = await applyMerge(plan, choices, { reason: M.restoreReason, addProjectDetails: addProject });
      toast.success(M.done(r.roomsCreated.length, r.roomsFilled.length, r.requirements), { description: M.doneDetail(r.elements, r.library, r.tasks), duration: 10000 });
      setPlan(null);
      navigate('/rooms');
    } catch (e) {
      toast.error(M.applyFailed, { description: (e as Error).message });
    } finally {
      setApplying(false);
    }
  };

  const created = plan?.rooms.filter((r) => !r.existing || choices[r.source.key] === 'new') ?? [];
  const matched = plan?.rooms.filter((r) => r.existing) ?? [];
  const sum = (pick: (r: MergePlan['rooms'][number]) => number, rows: MergePlan['rooms']) => rows.reduce((a, r) => a + pick(r), 0);
  const active = plan ? plan.rooms.filter((r) => !r.existing || choices[r.source.key] !== 'keep') : [];

  return (
    <div className="rounded-md border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-[520px]">
          <div className="flex items-center gap-2 text-[14px] text-ink">
            <PackageOpen size={15} /> {M.title}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{M.lead}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={FileJson} onClick={loadIncluded} loading={loading}>
            {M.useIncluded}
          </Button>
          <Button icon={Upload} onClick={() => input.current?.click()}>
            {M.chooseFile}
          </Button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) await open(await f.text());
            }}
          />
        </div>
      </div>

      <Dialog
        open={!!plan}
        onOpenChange={(o) => !o && !applying && setPlan(null)}
        size="xl"
        title={M.previewTitle}
        description={plan?.file.title}
        modalLock={applying}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlan(null)} disabled={applying}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" onClick={apply} loading={applying} disabled={!active.length && !addProject}>
              {M.confirm}
            </Button>
          </>
        }
      >
        {plan && (
          <div className="flex flex-col gap-5 text-[13px]">
            <Callout tone="info">{M.safety}</Callout>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              <Stat label={M.statNewRooms} value={created.length} />
              <Stat label={M.statExisting} value={matched.length} />
              <Stat label={M.statRequirements} value={sum((r) => r.adds.requirements + r.adds.rejected, active)} />
              <Stat label={M.statFloors} value={plan.floorsToAdd.length} />
            </dl>

            {plan.file.conflicts.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-[13.5px] font-medium text-warn">
                  <AlertTriangle size={14} /> {M.conflictsTitle(plan.file.conflicts.length)}
                </h3>
                <ol className="flex list-decimal flex-col gap-1.5 ps-5 text-[12.5px] text-ink-2" dir="ltr" lang="en">
                  {plan.file.conflicts.map((c) => (
                    <li key={c.id}>
                      <span className="font-medium text-ink">{c.title}</span> — {c.detail}
                    </li>
                  ))}
                </ol>
                <p className="mt-1.5 text-[11.5px] text-ink-3">{M.conflictsHint}</p>
              </section>
            )}

            {matched.length > 0 && (
              <section>
                <h3 className="mb-1 text-[13.5px] font-medium text-ink">{M.existingTitle}</h3>
                <p className="mb-2 text-[12px] text-ink-3">{M.existingLead}</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Button size="xs" variant="ghost" onClick={() => setChoices((c) => Object.fromEntries(Object.keys(c).map((k) => [k, 'fill' as RoomChoice])))}>
                    {M.allFill}
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setChoices((c) => Object.fromEntries(Object.keys(c).map((k) => [k, 'keep' as RoomChoice])))}>
                    {M.allKeep}
                  </Button>
                </div>
                <ul className="flex flex-col gap-3">
                  {matched.map((r) => {
                    const choice = choices[r.source.key] ?? 'keep';
                    return (
                      <li key={r.source.key} className="rounded-md border border-line bg-raised p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-ink" dir="auto">
                              {roomDisplayName(r.existing)} ← {lang === 'ar' ? r.source.nameAr : r.source.name}
                            </div>
                            <div className="text-[11.5px] text-ink-3">{r.matchBy === 'name' ? M.matchedName : M.matchedType}</div>
                          </div>
                          <Segmented
                            size="sm"
                            value={choice}
                            onChange={(v) => setChoices((c) => ({ ...c, [r.source.key]: v }))}
                            options={[
                              { value: 'keep', label: M.choiceKeep },
                              { value: 'fill', label: M.choiceFill },
                              ...(r.matchBy === 'type' ? [{ value: 'new' as RoomChoice, label: M.choiceNew }] : []),
                            ]}
                          />
                        </div>
                        {r.differences.length > 0 && (
                          <table className="mt-2 w-full table-fixed text-[11.5px]">
                            <thead className="text-ink-4">
                              <tr>
                                <th className="w-[24%] text-start font-normal">{M.diffField}</th>
                                <th className="w-[38%] text-start font-normal">{M.diffMine}</th>
                                <th className="text-start font-normal">{M.diffImported}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.differences.map((d) => (
                                <tr key={d.field} className="align-top">
                                  <td className="py-0.5 pe-2 text-ink-3">{M.field[d.field]}</td>
                                  <td className="break-words py-0.5 pe-2 text-ink-2" dir="auto">
                                    {clip(d.mine)}
                                  </td>
                                  <td className="break-words py-0.5 text-ink" dir="auto">
                                    {clip(d.imported)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <p className={cn('mt-2 text-[11.5px]', choice === 'keep' ? 'text-ink-3' : 'text-ok')}>
                          {choice === 'keep'
                            ? M.keepNote
                            : choice === 'fill'
                              ? M.fillNote(r.adds.requirements, r.adds.rejected, r.adds.elements, r.adds.constraints, r.adds.tasks)
                              : M.newNote}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-[13.5px] font-medium text-ink">{M.newTitle(created.length)}</h3>
              <ul className="grid gap-1 sm:grid-cols-2">
                {plan.rooms
                  .filter((r) => !r.existing)
                  .map((r) => (
                    <li key={r.source.key} className="flex justify-between gap-2 rounded-sm px-2 py-1 odd:bg-mist/50">
                      <span className="truncate" dir="auto">
                        {lang === 'ar' ? r.source.nameAr : r.source.name}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-ink-3">
                        {r.source.requirements.length ? M.reqCount(r.source.requirements.length) : ''}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>

            <section className="flex flex-col gap-2">
              <Checkbox checked={addProject} onChange={setAddProject} label={M.projectLabel} description={M.projectHint} />
              <p className="text-[11.5px] text-ink-3">{M.extras(plan.floorsToAdd.length, plan.houseTasks)}</p>
            </section>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="display text-[24px] leading-tight tabular">{num(value)}</dd>
    </div>
  );
}

const clip = (s: string) => (s.length > 220 ? `${s.slice(0, 220)}…` : s);
