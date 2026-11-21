import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, Check, Copy, FileText, Pencil, RotateCcw, Settings, Sparkles, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignVersion } from '@/lib/types';
import type { GenerationPackage, PlannedImage } from '@/lib/ai/prompt';
import type { ActiveImageProvider } from '@/lib/ai/providers/registry';
import type { GenerationJob } from '@/lib/ai/jobs';
import { IMAGE_ROLE_LABEL } from '@/lib/labels';
import { formatDuration } from '@/lib/format';
import { copyText } from '@/lib/download';
import { ImageThumb } from '@/components/images/ImageThumb';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Callout, Spinner } from '@/components/ui/Display';
import { Dialog } from '@/components/ui/Overlay';
import { Textarea } from '@/components/ui/Form';
import { cn } from '@/components/ui/cn';

const PRESERVE_TEXT: Record<string, string> = {
  strong: 'Keeps the structure of your photo closely',
  moderate: 'Usually keeps composition — not guaranteed',
  limited: 'Architecture may drift',
  none: 'Cannot see your photos',
};

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
  const [text, setText] = useState(override ?? generated);
  useEffect(() => {
    if (open) setText(override ?? generated);
  }, [open, override, generated]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Prompt"
      description="This is exactly what will be sent with the images. You can edit it for this generation; the edited text is saved with the version."
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
              className="mr-auto"
            >
              Use generated prompt
            </Button>
          )}
          <Button
            icon={Copy}
            onClick={async () => {
              if (await copyText(text)) toast.success('Prompt copied');
              else toast.error('Could not copy');
            }}
          >
            Copy
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onSave(text.trim() === generated.trim() ? null : text);
              onOpenChange(false);
            }}
          >
            {text.trim() === generated.trim() ? 'Close' : 'Use edited prompt'}
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
        aria-label="Prompt text"
      />
      <p className="mt-2 text-[11.5px] text-ink-3 tabular">{text.length.toLocaleString()} characters</p>
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
}) {
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
          <span className="eyebrow">Image generation</span>
          <Link to="/settings" className="text-ink-3 hover:text-ink" aria-label="Image generation settings">
            <Settings size={14} />
          </Link>
        </div>
        {active?.ready ? (
          <>
            <div className="text-[13.5px] text-ink">{active.provider.label}</div>
            <div className="text-[12px] text-ink-3">{active.model}</div>
            <ul className="mt-3 flex flex-col gap-1 text-[11.5px] text-ink-2">
              <li>
                {active.capabilities.imageInput
                  ? `Accepts up to ${active.capabilities.maxImages} image${active.capabilities.maxImages === 1 ? '' : 's'}`
                  : 'Text only — photos cannot be sent'}
              </li>
              <li>{PRESERVE_TEXT[active.capabilities.preservation]}</li>
            </ul>
          </>
        ) : (
          <Callout tone="neutral" className="!px-3 !py-2.5">
            {active ? active.problem : 'Image generation is not set up.'} The prompt builder still works: copy the prompt or save it as a prompt-only version.
            <div className="mt-2">
              <ButtonLink to="/settings" size="xs" variant="secondary">
                Set up a provider
              </ButtonLink>
            </div>
          </Callout>
        )}
      </div>

      <div className="rounded-md border border-line bg-surface p-4">
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="display text-[26px] leading-none tabular">{pkg.activeRequirements.length}</div>
            <div className="mt-1 text-[10.5px] uppercase tracking-wider text-ink-3">Requirements</div>
          </div>
          <div>
            <div className="display text-[26px] leading-none tabular">{must}</div>
            <div className="mt-1 text-[10.5px] uppercase tracking-wider text-ink-3">Must have</div>
          </div>
          <div>
            <div className="display text-[26px] leading-none tabular">{sent.length}</div>
            <div className="mt-1 text-[10.5px] uppercase tracking-wider text-ink-3">Images sent</div>
          </div>
        </div>

        {sent.length > 0 && (
          <div className="mb-3">
            <div className="eyebrow mb-1.5">Sending order</div>
            <ol className="flex flex-col gap-1">
              {sent.map((p, i) => (
                <OrderRow key={p.key} p={p} first={i === 0} last={i === sent.length - 1} onMove={(d) => onMove(p.key, d)} />
              ))}
            </ol>
          </div>
        )}
        {described.length > 0 &&
          (active?.ready ? (
            <p className="mb-3 text-[11.5px] text-ink-3">{described.length} more image(s) will be described in text.</p>
          ) : (
            <p className="mb-3 text-[11.5px] text-ink-3">
              {described.length} image(s) selected. The prompt numbers them so you can attach them in order if you use it elsewhere.
            </p>
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
                {formatDuration(now - (job?.startedAt ?? now))} elapsed · image models often take 30–120 s. You can keep working elsewhere.
              </div>
              <Button size="sm" variant="ghost" icon={Square} className="mt-2" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="lg"
              icon={Sparkles}
              disabled={!ready}
              onClick={onGenerate}
              title={!active?.ready ? 'Set up an image provider in Settings' : blocker?.message}
            >
              Generate design
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              icon={Copy}
              onClick={async () => {
                if (await copyText(pkg.prompt)) toast.success('Prompt copied');
                else toast.error('Could not copy');
              }}
            >
              Copy prompt
            </Button>
            <Button size="sm" icon={promptOverride !== null ? Pencil : FileText} onClick={() => setPromptOpen(true)}>
              {promptOverride !== null ? 'Edited prompt' : 'View prompt'}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={onSavePromptOnly} disabled={running}>
            Save as prompt-only version
          </Button>
          <p className="text-[11px] text-ink-4 tabular">
            {pkg.prompt.length.toLocaleString()} characters{pkg.truncated ? ' · shortened to fit the model' : ''}
          </p>
        </div>
      </div>

      {job?.status === 'error' && job.error && (
        <Callout
          tone="danger"
          title={job.error.message}
          action={
            <Button size="xs" variant="ghost" icon={X} onClick={onDismissJob}>
              Dismiss
            </Button>
          }
        >
          {job.error.hint ?? 'Nothing was saved. Adjust the settings and try again.'}
        </Callout>
      )}
      {job?.status === 'cancelled' && (
        <Callout
          tone="neutral"
          action={
            <Button size="xs" variant="ghost" icon={X} onClick={onDismissJob}>
              Dismiss
            </Button>
          }
        >
          Generation cancelled. Nothing was saved.
        </Callout>
      )}
      {jobVersions.length > 0 && (
        <div className="rounded-md border border-ok/40 bg-ok-soft/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-ok">
              <Check size={14} /> Saved as {jobVersions.map((v) => `v${v.number}`).join(', ')}
            </span>
            <IconButton icon={X} label="Dismiss" size="xs" onClick={onDismissJob} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {jobVersions.map((v) => (
              <button key={v.id} type="button" onClick={() => onOpenVersion(v.id)} className="overflow-hidden rounded-sm border border-line text-left">
                <ImageThumb imageId={v.imageId} className="aspect-[3/2] w-full" />
                <div className="px-2 py-1 text-[11.5px]">Review v{v.number}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="rounded-md border border-line bg-surface p-4">
          <div className="eyebrow mb-2">Recent versions</div>
          <div className="grid grid-cols-3 gap-2">
            {recent.slice(0, 6).map((v) => (
              <button key={v.id} type="button" onClick={() => onOpenVersion(v.id)} className="text-left">
                {v.imageId ? (
                  <ImageThumb imageId={v.imageId} className="aspect-square w-full rounded-sm border border-line" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-sm border border-dashed border-line text-ink-4">
                    <FileText size={14} />
                  </div>
                )}
                <div className="mt-0.5 text-[11px] text-ink-3">v{v.number}</div>
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
  return (
    <li className="flex items-center gap-2">
      <span className="w-4 text-right text-[11px] text-ink-4 tabular">{p.index}</span>
      {p.imageId ? (
        <ImageThumb imageId={p.imageId} className="h-9 w-12 shrink-0 rounded-[2px]" />
      ) : (
        <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-[2px] bg-mist text-[9px] text-ink-3">PLAN</div>
      )}
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-2" title={p.label}>
        {IMAGE_ROLE_LABEL[p.role]}
        {p.requirementTitle ? ` · ${p.requirementTitle}` : ''}
        {p.intent === 'avoid' ? ' · avoid' : ''}
      </span>
      <IconButton
        icon={ArrowUp}
        label="Move earlier"
        size="xs"
        disabled={first || p.role === 'base-photo' || p.role === 'previous-version'}
        onClick={() => onMove(-1)}
        tooltip={false}
      />
      <IconButton
        icon={ArrowDown}
        label="Move later"
        size="xs"
        disabled={last || p.role === 'base-photo' || p.role === 'previous-version'}
        onClick={() => onMove(1)}
        tooltip={false}
      />
    </li>
  );
}
