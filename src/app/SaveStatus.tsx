import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CloudAlert, CloudCheck, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { db } from '@/lib/db/db';
import { saveStateOf, syncEngine, useSyncStatus } from '@/lib/sync/engine';
import { useT } from '@/i18n';
import { fmtBytes, fmtPercent, fmtTime, timeAgo } from '@/i18n/format';
import { Popover } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

/**
 * "Saved" / "Saving…" / "Not saved — retry" — always visible, so it is clear
 * whether the latest changes have reached the cloud.
 */
export function SaveStatus({ className, compact }: { className?: string; compact?: boolean }) {
  const t = useT();
  const s = useSyncStatus();
  const state = saveStateOf(s);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const pendingFiles = useLiveQuery(async () => {
    const rows = await db.blobs.where('pending').equals(1).toArray();
    const files = new Set(rows.map((r) => r.fileId));
    return { count: files.size, bytes: rows.reduce((n, r) => n + (r.blob?.size ?? 0), 0) };
  }, []);

  const active = s.uploads.active;
  const loaded = active.reduce((n, a) => n + a.loaded, 0);
  const total = active.reduce((n, a) => n + a.total, 0) + s.uploads.queuedBytes;
  const uploading = active.length > 0;

  const label =
    state === 'saved'
      ? t.sync.saved
      : state === 'saving'
        ? uploading && total > 0
          ? t.sync.uploading(fmtPercent(loaded / total))
          : t.sync.saving
        : t.sync.notSaved;

  const Icon = state === 'saved' ? CloudCheck : state === 'saving' ? Loader2 : state === 'offline' ? CloudOff : CloudAlert;
  const tone = state === 'saved' ? 'text-ok' : state === 'saving' ? 'text-ink-3' : 'text-danger';

  const trigger = (
    <button
      type="button"
      data-testid="save-status"
      data-state={state}
      aria-live="polite"
      className={cn(
        'touch-target inline-flex h-9 max-w-full items-center gap-1.5 rounded-sm px-2 text-[12.5px] font-medium transition-colors hover:bg-mist',
        state === 'error' || state === 'offline' ? 'bg-danger-soft/60 text-danger' : 'text-ink-2',
        className,
      )}
    >
      <Icon size={15} strokeWidth={1.75} className={cn('shrink-0', tone, state === 'saving' && 'animate-spin')} />
      <span className={cn('truncate', compact && state === 'saved' && 'sr-only')}>{label}</span>
    </button>
  );

  return (
    <Popover trigger={trigger} align="end" className="w-[min(340px,calc(100vw-2rem))]">
      <div className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink-2">
        <div className="font-medium text-ink">{t.sync.cloudStatus}</div>
        {state === 'saved' && <p>{t.sync.savedAt(s.lastPushAt ? fmtTime(s.lastPushAt) : s.lastPullAt ? fmtTime(s.lastPullAt) : '—')}</p>}
        {state === 'offline' && <p>{t.sync.offline}</p>}
        {state !== 'saved' && s.pending > 0 && <p>{t.sync.notSavedDetail(s.pending)}</p>}
        <ul className="flex flex-col gap-0.5 text-ink-3">
          <li>{t.sync.pendingChanges(s.pending)}</li>
          <li>{t.sync.pendingFiles(pendingFiles?.count ?? 0, fmtBytes(pendingFiles?.bytes ?? 0))}</li>
          {active.map((a) => (
            <li key={a.fileId} className="truncate" dir="auto">
              {a.name} · {fmtPercent(a.total ? a.loaded / a.total : 0)}
            </li>
          ))}
          <li>{s.lastPullAt ? t.sync.lastSynced(timeAgo(new Date(s.lastPullAt).toISOString())) : t.sync.neverSynced}</li>
        </ul>
        {s.error && <p className="rounded-sm bg-danger-soft/60 px-2 py-1.5 text-danger">{s.error.kind === 'auth' ? t.sync.sessionExpired : t.sync.lastError(s.error.message)}</p>}
        {Object.keys(s.fileErrors).length > 0 && (
          <p className="rounded-sm bg-danger-soft/60 px-2 py-1.5 text-danger">
            {Object.values(s.fileErrors).includes('too-large') ? t.sync.uploadRejectedSize : t.sync.permissionDenied}
          </p>
        )}
        <Button size="sm" variant={state === 'saved' ? 'secondary' : 'primary'} icon={RefreshCw} onClick={() => void syncEngine.syncNow()}>
          {state === 'saved' ? t.sync.syncNow : t.sync.retryNow}
        </Button>
      </div>
    </Popover>
  );
}
