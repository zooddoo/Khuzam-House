import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, Check, Copy, Download, FileText, ImageDown, Pencil, RotateCcw, Settings, Share2, Sparkles, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignVersion } from '@/lib/types';
import type { GenerationPackage, PlannedImage } from '@/lib/ai/prompt';
import type { ActiveImageProvider } from '@/lib/ai/providers/registry';
import type { GenerationJob } from '@/lib/ai/jobs';
import { imageRoleLabel } from '@/lib/labels';
import { fmtDuration } from '@/i18n/format';
import { num } from '@/i18n/format';
import { useT } from '@/i18n';
import { copyText } from '@/lib/download';
import { ImageThumb } from '@/components/images/ImageThumb';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Callout, Spinner } from '@/components/ui/Display';
import { Dialog } from '@/components/ui/Overlay';
import { Textarea } from '@/components/ui/Form';
import { cn } from '@/components/ui/cn';

export function PromptDialog({
  open,
  onOpenChange,
  generated,
  override,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  generated: string;
  override: string | null;
  onSave: (v: string | null) => void;
}) {
  const t = useT();
  const T = t.studio;
  const [text, setText] = useState(override ?? generated);
  useEffect(() => {
    if (open) setText(override ?? generated);
  }, [open, override, generated]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={T.promptTitle}
      description={T.promptDialogLead}
      footer={
        <>
          {override !== null && (
            <Button
              variant="ghost"
              icon={RotateCcw}
              onClick={() => {
                onSave(null);
                onOpenChange(false);
              }}
              className="me-auto"
            >
              {T.useGenerated}
            </Button>
          )}
          <Button
            icon={Copy}
            onClick={async () => {
              if (await copyText(text)) toast.success(T.promptCopied);
              else toast.error(t.common.copyFailed);
            }}
          >
            {t.common.copy}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onSave(text.trim() === generated.trim() ? null : text);
              onOpenChange(false);
            }}
          >
            {text.trim() === generated.trim() ? t.common.close : T.useEdited}
          </Button>
        </>
      }
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        minRows={18}
        maxRows={40}
        className="font-mono text-[12px] leading-relaxed"
        aria-label={T.promptTitle}
        dir="ltr"
        lang="en"
      />
      <p className="mt-2 text-[11.5px] text-ink-3 tabular">{T.characters(text.length)}</p>
    </Dialog>
  );
}

export function StudioPanel({
  active,
  pkg,
  generatedPrompt,
  job,
  onGenerate,
  onCancel,
  onSavePromptOnly,
  onMove,
  promptOverride,
  onPromptOverride,
  recent,
  onOpenVersion,
  onDismissJob,
  onDownloadImages,
  onShare,
  canShare,
  onImport,
  preparingImages,
}: {
  active: ActiveImageProvider | null;
  pkg: GenerationPackage;
  generatedPrompt: string;
  job: GenerationJob | undefined;
  onGenerate: () => void;
  onCancel: () => void;
  onSavePromptOnly: () => void;
  onMove: (key: string, dir: -1 | 1) => void;
  promptOverride: string | null;
  onPromptOverride: (v: string | null) => void;
  recent: DesignVersion[];
  onOpenVersion: (id: string) => void;
  onDismissJob: () => void;
  onDownloadImages: () => void;
  onShare: () => void;
  canShare: boolean;
  onImport: () => void;
  preparingImages: boolean;
}) {
  const t = useT();
  const T = t.studio;
  const [promptOpen, setPromptOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const running = job?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const sent = pkg.images.filter((p) => p.sent).sort((a, b) => a.index - b.index);
  const described = pkg.images.filter((p) => !p.sent);
  const blocker = pkg.warnings.find((w) => w.level === 'blocker');
  const ready = !!active?.ready && !blocker;
  const must = pkg.activeRequirements.filter((r) => r.priority === 'must').length;
  const jobVersions = job?.status === 'done' ? recent.filter((v) => job.versionIds.includes(v.id)) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-line bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="eyebrow">{T.imageGeneration}</span>
          <Link to="/settings" className="touch-target text-ink-3 hover:text-ink" aria-label={T.imageGenerationSettings}>
            <Settings size={14} />
          </Link>
        </div>
        {active?.ready ? (
          <>
            <div className="text-[13.5px] text-ink">{active.provider.label}</div>
            <div className="text-[12px] text-ink-3">{active.model}</div>
            <ul className="mt-3 flex flex-col gap-1 text-[11.5px] text-ink-2">
              <li>
                {active.capabilities.imageInput ? T.acceptsImages(active.capabilities.maxImages) : T.textOnly}
              </li>
              <li>{T.preserve[active.capabilities.preservation]}</li>
            </ul>
          </>
        ) : (
          <Callout tone="neutral" className="!px-3 !py-2.5">
            <div className="font-medium text-ink">{T.noApiTitle}</div>
            <div className="mt-1">{T.noApiBody}</div>
            {active?.problem && <div className="mt-1 text-[11.5px] text-ink-3">{active.problem}</div>}
            <div className="mt-2">
              <ButtonLink to="/settings" size="xs" variant="secondary">
                {T.setUpProvider}
              </ButtonLink>
            </div>
          </Callout>
        )}
      </div>

      <div className="rounded-md border border-line bg-surface p-4">
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="display text-[26px] leading-none tabular">{num(pkg.activeRequirements.length)}</div>
            <div className="mt-1 text-[10.5px] uppercase tracking-wider text-ink-3">{T.statRequirements}</div>
          </div>
          <div>
            <div className="display text-[26px] leading-none tabular">{num(must)}</div>
            <div className="mt-1 text-[10.5px] uppercase tracking-wider text-ink-3">{T.statMust}</div>
          </div>
          <div>
            <div className="display text-[26px] leading-none tabular">{num(active?.ready ? sent.length : pkg.images.length)}</div>
            <div className="mt-1 text-[10.5px] uppercase tracking-wider text-ink-3">{active?.ready ? T.statSent : T.statImages}</div>
          </div>
        </div>

        {sent.length > 0 && (
          <div className="mb-3">
            <div className="eyebrow mb-1.5">{T.sendingOrder}</div>
            <ol className="flex flex-col gap-1">
              {sent.map((p, i) => (
                <OrderRow key={p.key} p={p} first={i === 0} last={i === sent.length - 1} onMove={(d) => onMove(p.key, d)} />
              ))}
            </ol>
          </div>
        )}
        {described.length > 0 &&
          (active?.ready ? (
            <p className="mb-3 text-[11.5px] text-ink-3">{T.describedInText(described.length)}</p>
          ) : (
            <p className="mb-3 text-[11.5px] text-ink-3">{T.numberedForElsewhere(described.length)}</p>
          ))}

        {pkg.warnings.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1.5">
            {pkg.warnings.map((w, i) => (
              <li
                key={i}
                className={cn(
                  'flex gap-2 text-[11.5px] leading-snug',
                  w.level === 'blocker' ? 'text-danger' : w.level === 'warning' ? 'text-warn' : 'text-ink-3',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                    w.level === 'blocker' ? 'bg-danger' : w.level === 'warning' ? 'bg-warn' : 'bg-ink-4',
                  )}
                />
                {w.message}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          {running ? (
            <div className="rounded-md border border-line bg-raised p-3">
              <div className="flex items-center gap-2 text-[13px] text-ink">
                <Spinner size={15} /> {job?.stage}
              </div>
              <div className="mt-1 text-[11.5px] text-ink-3 tabular">
                {T.elapsed(fmtDuration(now - (job?.startedAt ?? now)))}
              </div>
              <Button size="sm" variant="ghost" icon={Square} className="mt-2" onClick={onCancel}>
                {t.common.cancel}
              </Button>
            </div>
          ) : active?.ready ? (
            <Button variant="primary" size="lg" icon={Sparkles} disabled={!ready} onClick={onGenerate} title={blocker?.message}>
              {T.generate}
            </Button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button
              size={active?.ready ? 'sm' : 'md'}
              variant={active?.ready ? 'secondary' : 'primary'}
              icon={Copy}
              disabled={!!pkg.untranslated.length}
              title={pkg.untranslated.length ? T.translateFirst : undefined}
              onClick={async () => {
                if (await copyText(pkg.prompt)) toast.success(T.promptCopied);
                else toast.error(t.common.copyFailed);
              }}
            >
              {T.copyPrompt}
            </Button>
            <Button size={active?.ready ? 'sm' : 'md'} icon={promptOverride !== null ? Pencil : FileText} onClick={() => setPromptOpen(true)}>
              {promptOverride !== null ? T.editedPrompt : T.viewPrompt}
            </Button>
          </div>
          {pkg.images.length > 0 && (
            <div className={cn('grid gap-2', canShare ? 'grid-cols-2' : 'grid-cols-1')}>
              <Button size="sm" icon={ImageDown} loading={preparingImages} onClick={onDownloadImages}>
                {T.downloadImages}
              </Button>
              {canShare && (
                <Button size="sm" icon={Share2} disabled={preparingImages || !!pkg.untranslated.length} onClick={onShare}>
                  {T.share}
                </Button>
              )}
            </div>
          )}
          <Button size="sm" icon={Download} variant={active?.ready ? 'ghost' : 'secondary'} onClick={onImport} disabled={running || !!pkg.untranslated.length}>
            {T.importGenerated}
          </Button>
          <Button size="sm" variant="ghost" onClick={onSavePromptOnly} disabled={running}>
            {T.savePromptOnly}
          </Button>
          {!active?.ready && <p className="text-[11.5px] leading-relaxed text-ink-3">{T.noApiSteps}</p>}
          <p className="text-[11px] text-ink-4 tabular">
            {T.characters(pkg.prompt.length)}
            {pkg.truncated ? ` · ${T.shortened}` : ''}
          </p>
        </div>
      </div>

      {job?.status === 'error' && job.error && (
        <Callout
          tone="danger"
          title={job.error.message}
          action={
            <Button size="xs" variant="ghost" icon={X} onClick={onDismissJob}>
              {t.common.dismiss}
            </Button>
          }
        >
          {job.error.hint ?? T.nothingSaved}
        </Callout>
      )}
      {job?.status === 'cancelled' && (
        <Callout
          tone="neutral"
          action={
            <Button size="xs" variant="ghost" icon={X} onClick={onDismissJob}>
              {t.common.dismiss}
            </Button>
          }
        >
          {T.cancelledNothingSaved}
        </Callout>
      )}
      {jobVersions.length > 0 && (
        <div className="rounded-md border border-ok/40 bg-ok-soft/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-ok">
              <Check size={14} /> {T.savedAs(jobVersions.map((v) => `v${num(v.number)}`).join('، '))}
            </span>
            <IconButton icon={X} label={t.common.dismiss} size="xs" onClick={onDismissJob} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {jobVersions.map((v) => (
              <button key={v.id} type="button" onClick={() => onOpenVersion(v.id)} className="overflow-hidden rounded-sm border border-line text-start">
                <ImageThumb imageId={v.imageId} className="aspect-[3/2] w-full" />
                <div className="px-2 py-1 text-[11.5px]">{T.review(v.number)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="rounded-md border border-line bg-surface p-4">
          <div className="eyebrow mb-2">{T.recentVersions}</div>
          <div className="grid grid-cols-3 gap-2">
            {recent.slice(0, 6).map((v) => (
              <button key={v.id} type="button" onClick={() => onOpenVersion(v.id)} className="text-start">
                {v.imageId ? (
                  <ImageThumb imageId={v.imageId} className="aspect-square w-full rounded-sm border border-line" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-sm border border-dashed border-line text-ink-4">
                    <FileText size={14} />
                  </div>
                )}
                <div className="mt-0.5 text-[11px] text-ink-3">v{num(v.number)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <PromptDialog open={promptOpen} onOpenChange={setPromptOpen} generated={generatedPrompt} override={promptOverride} onSave={onPromptOverride} />
    </div>
  );
}

function OrderRow({ p, first, last, onMove }: { p: PlannedImage; first: boolean; last: boolean; onMove: (d: -1 | 1) => void }) {
  const T = useT().studio;
  return (
    <li className="flex items-center gap-2">
      <span className="w-4 text-end text-[11px] text-ink-4 tabular">{num(p.index)}</span>
      {p.imageId ? (
        <ImageThumb imageId={p.imageId} className="h-9 w-12 shrink-0 rounded-[2px]" />
      ) : (
        <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-[2px] bg-mist text-[9px] text-ink-3">{T.planTag}</div>
      )}
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-2" title={p.label}>
        {imageRoleLabel(p.role)}
        {p.requirementTitle ? ` · ${p.requirementTitle}` : ''}
        {p.intent === 'avoid' ? ` · ${T.avoidTag}` : ''}
      </span>
      <IconButton
        icon={ArrowUp}
        label={T.moveEarlier}
        size="xs"
        disabled={first || p.role === 'base-photo' || p.role === 'previous-version'}
        onClick={() => onMove(-1)}
        tooltip={false}
      />
      <IconButton
        icon={ArrowDown}
        label={T.moveLater}
        size="xs"
        disabled={last || p.role === 'base-photo' || p.role === 'previous-version'}
        onClick={() => onMove(1)}
        tooltip={false}
      />
    </li>
  );
}
