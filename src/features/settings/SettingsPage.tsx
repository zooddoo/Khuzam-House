import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Archive,
  Cloud,
  Database,
  Download,
  HardDrive,
  History,
  Languages,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import type { LengthUnit } from '@/lib/types';
import { useProject, useRestorePoints, useSettings } from '@/lib/hooks/data';
import { updateProject } from '@/lib/db/misc';
import { updateSettings } from '@/lib/db/settings';
import { db } from '@/lib/db/db';
import {
  BackupError,
  deleteRestorePoint,
  exportBackup,
  getRestorePointBlob,
  readBackup,
  restoreBackup,
  restoreFromPoint,
  type ParsedBackup,
} from '@/lib/backup/backup';
import { downloadBlob } from '@/lib/download';
import { freeUpSpace, localFileUsage } from '@/lib/files/repo';
import { deleteFilesForGood, unusedFiles } from '@/lib/db/trash';
import { localCounts, serverCounts, syncEngine, useSyncStatus } from '@/lib/sync/engine';
import { listHistory, restoreHistory, type HistoryEntry } from '@/lib/sync/history';
import { SYNCED_TABLES } from '@/lib/sync/tables';
import { useAuth } from '@/lib/sync/auth';
import { unitLabel } from '@/lib/units';
import { useI18n } from '@/i18n';
import { fmtBytes, fmtDateTime, num, timeAgo } from '@/i18n/format';
import { setPrefs } from '@/i18n/prefs';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Callout, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { Checkbox, CommitInput, Field, Segmented } from '@/components/ui/Form';
import { LengthField } from '@/components/ui/MeasureInput';
import { Dialog } from '@/components/ui/Overlay';
import { useConfirm } from '@/components/ui/Confirm';
import { EnglishField } from '@/components/translate/EnglishField';
import { SignOutButton } from '@/app/auth/AuthScreens';
import { ImageProviderSettings, TextProviderSettings } from './ProviderSettings';

function Section({
  id,
  title,
  description,
  children,
  icon: Icon,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  icon?: typeof HardDrive;
}) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-line py-8 first:border-t-0 first:pt-0 sm:py-10">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
        <div>
          <h2 className="display flex items-center gap-2 text-[24px] sm:text-[26px]">
            {Icon && <Icon size={18} strokeWidth={1.5} className="text-ink-3" />}
            {title}
          </h2>
          {description && <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">{description}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Language                                                             */
/* ------------------------------------------------------------------ */

function LanguageSection() {
  const { t, prefs } = useI18n();
  const L = t.lang;
  return (
    <div className="grid max-w-[720px] gap-5">
      <Field label={L.language}>
        <Segmented
          value={prefs.lang}
          onChange={(v) => setPrefs({ lang: v })}
          options={[
            { value: 'ar', label: <span lang="ar">{L.arabic}</span> },
            { value: 'en', label: <span lang="en">{L.english}</span> },
          ]}
        />
      </Field>
      {prefs.lang === 'ar' && (
        <Field label={L.digits}>
          <Segmented
            value={prefs.digits}
            onChange={(v) => setPrefs({ digits: v })}
            options={[
              { value: 'latn', label: L.digitsLatin },
              { value: 'arab', label: L.digitsArabic },
            ]}
          />
        </Field>
      )}
      <Field label={L.calendar}>
        <Segmented
          value={prefs.calendar}
          onChange={(v) => setPrefs({ calendar: v })}
          options={[
            { value: 'gregory', label: L.gregorian },
            { value: 'islamic-umalqura', label: L.hijri },
          ]}
        />
      </Field>
      <p className="text-[12px] text-ink-3">{L.hint}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Account & cloud                                                      */
/* ------------------------------------------------------------------ */

function CloudSection() {
  const { t } = useI18n();
  const S = t.settings;
  const auth = useAuth();
  const sync = useSyncStatus();
  const [check, setCheck] = useState<{ local: number; server: number; mismatched: string[] } | null>(null);
  const [checking, setChecking] = useState(false);

  const verify = async () => {
    setChecking(true);
    try {
      await syncEngine.syncNow();
      const [l, s] = await Promise.all([localCounts(), serverCounts()]);
      const mismatched = SYNCED_TABLES.filter((k) => (l[k] ?? 0) !== (s[k] ?? 0));
      setCheck({
        local: SYNCED_TABLES.reduce((a, k) => a + (l[k] ?? 0), 0),
        server: SYNCED_TABLES.reduce((a, k) => a + (s[k] ?? 0), 0),
        mismatched,
      });
    } catch (e) {
      toast.error(S.verifyFailed, { description: (e as Error).message });
    } finally {
      setChecking(false);
    }
  };

  const lastSync = sync.lastPullAt ?? sync.lastPushAt;
  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">{S.signedInAs}</div>
            <div className="mt-1 truncate text-[14px] text-ink" dir="ltr">
              {auth.status === 'signed-in' ? auth.email : '—'}
            </div>
          </div>
          <SignOutButton />
        </div>
      </Card>
      <Card>
        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="eyebrow">{t.sync.cloudStatus}</dt>
            <dd className={`mt-1 ${sync.error ? 'text-danger' : !sync.online ? 'text-warn' : 'text-ink'}`}>
              {sync.error ? t.sync.lastError(sync.error.message) : !sync.online ? t.sync.offline : sync.pending ? t.sync.pendingChanges(sync.pending) : t.sync.saved}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">{S.files}</dt>
            <dd className="mt-1 text-ink">{t.sync.pendingFiles(sync.uploads.queued, fmtBytes(sync.uploads.queuedBytes))}</dd>
          </div>
          <div className="sm:col-span-2">
            <dd className="text-[12px] text-ink-3">{lastSync ? t.sync.lastSynced(timeAgo(new Date(lastSync).toISOString())) : t.sync.neverSynced}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" icon={RefreshCw} onClick={() => void syncEngine.syncNow()} loading={sync.pushing || sync.pulling}>
            {t.sync.syncNow}
          </Button>
          <Button size="sm" variant="ghost" icon={ShieldCheck} onClick={verify} loading={checking}>
            {S.verify}
          </Button>
        </div>
        {check && (
          <Callout tone={check.mismatched.length ? 'warn' : 'info'} className="mt-4">
            {check.mismatched.length ? S.verifyMismatch(check.local, check.server) : S.verifyOk(check.server)}
          </Callout>
        )}
      </Card>
      <p className="text-[12px] leading-relaxed text-ink-3">{S.cloudExplain}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Device storage                                                       */
/* ------------------------------------------------------------------ */

function StorageInfo() {
  const { t } = useI18n();
  const S = t.settings;
  const confirm = useConfirm();
  const [info, setInfo] = useState<{
    usage?: number;
    quota?: number;
    persisted?: boolean;
    files: { total: number; freeable: number; pending: number };
    unused: { id: string; name: string; size: number }[];
  } | null>(null);
  const load = async () => {
    let usage: number | undefined;
    let quota: number | undefined;
    let persisted: boolean | undefined;
    try {
      const est = await navigator.storage?.estimate?.();
      usage = est?.usage;
      quota = est?.quota;
      persisted = await navigator.storage?.persisted?.();
    } catch {
      /* not available */
    }
    setInfo({ usage, quota, persisted, files: await localFileUsage(), unused: await unusedFiles() });
  };
  useEffect(() => {
    void load();
  }, []);
  if (!info) return <LoadingBlock label={S.measuring} />;
  const unusedBytes = info.unused.reduce((a, f) => a + f.size, 0);
  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="eyebrow">{S.used}</dt>
          <dd className="mt-1 tabular">{info.usage !== undefined ? fmtBytes(info.usage) : '—'}</dd>
        </div>
        <div>
          <dt className="eyebrow">{S.available}</dt>
          <dd className="mt-1 tabular">{info.quota !== undefined ? fmtBytes(info.quota) : '—'}</dd>
        </div>
        <div>
          <dt className="eyebrow">{S.cachedFiles}</dt>
          <dd className="mt-1 tabular">{fmtBytes(info.files.total)}</dd>
        </div>
        <div>
          <dt className="eyebrow">{S.waitingUpload}</dt>
          <dd className="mt-1 tabular">{fmtBytes(info.files.pending)}</dd>
        </div>
      </dl>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-[460px]">
            <div className="text-[14px] text-ink">{S.freeUp}</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{S.freeUpHint(fmtBytes(info.files.freeable))}</p>
          </div>
          <Button
            size="sm"
            disabled={!info.files.freeable}
            onClick={async () => {
              const freed = await freeUpSpace();
              toast.success(S.freed(fmtBytes(freed)));
              void load();
            }}
          >
            {S.freeUpButton}
          </Button>
        </div>
      </Card>
      {info.unused.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 max-w-[460px]">
              <div className="text-[14px] text-ink">{S.unusedTitle(info.unused.length)}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{S.unusedHint(fmtBytes(unusedBytes))}</p>
            </div>
            <Button
              size="sm"
              variant="danger"
              icon={Trash2}
              onClick={async () => {
                const r = await confirm({
                  title: S.unusedConfirmTitle,
                  tone: 'danger',
                  confirmLabel: t.trash.deleteForever.replace('…', ''),
                  typeToConfirm: t.trash.typeWord,
                  description: S.unusedConfirmBody(info.unused.length),
                });
                if (!r.confirmed) return;
                await deleteFilesForGood(info.unused.map((f) => f.id));
                toast.success(t.trash.deletedForever);
                void load();
              }}
            >
              {S.unusedDelete}
            </Button>
          </div>
        </Card>
      )}
      {info.persisted ? (
        <Callout tone="info" icon={ShieldCheck}>
          {S.persisted}
        </Callout>
      ) : (
        <Callout
          tone="neutral"
          action={
            <Button
              size="sm"
              onClick={async () => {
                const ok = await navigator.storage?.persist?.();
                toast[ok ? 'success' : 'info'](ok ? S.persistGranted : S.persistDeclined);
                void load();
              }}
            >
              {S.persistRequest}
            </Button>
          }
        >
          {S.notPersisted}
        </Callout>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cloud history                                                        */
/* ------------------------------------------------------------------ */

function HistorySection() {
  const { t, lang } = useI18n();
  const S = t.settings;
  const confirm = useConfirm();
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async (append = false) => {
    setBusy(true);
    setError(null);
    try {
      const before = append && items?.length ? items[items.length - 1].id : null;
      const next = await listHistory({ before, limit: 30 });
      setItems((prev) => (append && prev ? [...prev, ...next] : next));
      setMore(next.length === 30);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!items)
    return (
      <div className="flex flex-col items-start gap-2">
        <Button size="sm" icon={History} onClick={() => load()} loading={busy}>
          {S.historyShow}
        </Button>
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">{S.historyEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
          {items.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]" dir="auto">
                  {(lang === 'ar' ? h.label : h.labelEn) || h.recordId}
                </div>
                <div className="text-[11.5px] text-ink-3">
                  {S.historyTable[h.localTable ?? ''] ?? h.table} · {S.historyReason[h.reason] ?? h.reason} · {fmtDateTime(h.archivedAt)}
                </div>
              </div>
              <Button
                size="sm"
                icon={RotateCcw}
                disabled={!h.localTable}
                onClick={async () => {
                  const r = await confirm({ title: S.historyRestoreTitle, confirmLabel: t.common.restore, description: S.historyRestoreBody });
                  if (!r.confirmed) return;
                  try {
                    await restoreHistory(h.id);
                    toast.success(S.historyRestored);
                  } catch (e) {
                    toast.error(S.historyRestoreFailed, { description: (e as Error).message });
                  }
                }}
              >
                {t.common.restore}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
      {more && (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => load(true)} loading={busy}>
          {t.common.showMore}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Backup & restore                                                     */
/* ------------------------------------------------------------------ */

function BackupSection() {
  const { t } = useI18n();
  const S = t.settings;
  const settings = useSettings();
  const points = useRestorePoints() ?? [];
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [includeKeys, setIncludeKeys] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ file: string; backup: ParsedBackup } | null>(null);
  const [restorePoint, setRestorePoint] = useState(true);
  const [useKeys, setUseKeys] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setExporting(S.exportCollecting);
    try {
      const { blob, filename, summary, missingFiles } = await exportBackup({
        includeKeys,
        onProgress: (stage, d, total) => setExporting(stage === 'files' ? S.exportFiles(d, total) : S.exportPacking),
      });
      downloadBlob(blob, filename);
      await updateSettings((s) => void (s.lastBackupAt = new Date().toISOString()));
      toast.success(S.exportDone, { description: S.exportSummary(summary.rooms, summary.images, summary.versions, fmtBytes(blob.size)) });
      if (missingFiles.length) toast.warning(S.exportMissing(missingFiles.length), { duration: 12000 });
    } catch (e) {
      toast.error(S.exportFailed((e as Error).message));
    } finally {
      setExporting(null);
    }
  };

  const onFile = async (f: File) => {
    try {
      const backup = await readBackup(f);
      setParsed({ file: f.name, backup });
      setUseKeys(false);
      setRestorePoint(true);
    } catch (e) {
      toast.error(e instanceof BackupError ? e.message : S.readFailed((e as Error).message));
    }
  };

  const doRestore = async () => {
    if (!parsed) return;
    const r = await confirm({
      title: S.restoreConfirmTitle,
      tone: 'danger',
      confirmLabel: S.restoreConfirm,
      typeToConfirm: S.replaceWord,
      description: (
        <>
          {S.restoreConfirmBody(fmtDateTime(parsed.backup.manifest.createdAt))} {restorePoint ? S.restoreWithPoint : S.restoreWithoutPoint}
        </>
      ),
    });
    if (!r.confirmed) return;
    setRestoring(true);
    try {
      await restoreBackup(parsed.backup, { createRestorePoint: restorePoint, useBackupKeys: useKeys, reason: S.reasonBeforeFile(parsed.file) });
      toast.success(S.restored, { description: S.restoredHint });
      setParsed(null);
      navigate('/');
    } catch (e) {
      toast.error(S.restoreFailed((e as Error).message), { description: S.restoreFailedHint });
    } finally {
      setRestoring(false);
    }
  };

  const s = parsed?.backup.manifest.summary;

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[520px]">
            <div className="text-[14px] text-ink">{S.exportTitle}</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
              {S.exportLead}{' '}
              {S.lastBackup(settings?.lastBackupAt ? `${timeAgo(settings.lastBackupAt)} (${fmtDateTime(settings.lastBackupAt)})` : S.never)}
            </p>
            <div className="mt-3">
              <Checkbox checked={includeKeys} onChange={setIncludeKeys} label={S.includeKeys} description={S.includeKeysHint} />
            </div>
          </div>
          <Button variant="primary" icon={Download} onClick={doExport} loading={!!exporting}>
            {exporting ?? S.exportButton}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[520px]">
            <div className="text-[14px] text-ink">{S.importTitle}</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{S.importLead}</p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onFile(f);
            }}
          />
          <Button icon={Upload} onClick={() => fileInput.current?.click()}>
            {S.chooseBackup}
          </Button>
        </div>
      </Card>

      <div>
        <div className="eyebrow mb-3 flex items-center gap-1.5">
          <History size={12} /> {S.restorePoints}
        </div>
        {points.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">{S.restorePointsEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
            {points.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-[200px]">
                  <div className="text-[13px]" dir="auto">
                    {p.reason}
                  </div>
                  <div className="text-[11.5px] text-ink-3">
                    {fmtDateTime(p.createdAt)} · {S.pointSummary(p.summary.rooms, p.summary.images, p.summary.versions)} · {fmtBytes(p.size)}
                  </div>
                </div>
                <Button
                  size="sm"
                  icon={RotateCcw}
                  onClick={async () => {
                    const r = await confirm({
                      title: S.pointRestoreTitle,
                      tone: 'danger',
                      confirmLabel: t.common.restore,
                      typeToConfirm: S.replaceWord,
                      description: S.pointRestoreBody,
                    });
                    if (!r.confirmed) return;
                    try {
                      await restoreFromPoint(p.id);
                      toast.success(S.restored);
                      navigate('/');
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  {t.common.restore}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Download}
                  onClick={async () => {
                    const b = await getRestorePointBlob(p.id);
                    if (b) downloadBlob(b.blob, `bait-khuzam-restore-point-${p.createdAt.slice(0, 10)}.${b.ext}`);
                  }}
                >
                  {t.common.download}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  aria-label={S.pointDelete}
                  onClick={async () => {
                    const r = await confirm({ title: S.pointDelete, tone: 'danger', confirmLabel: t.common.delete });
                    if (r.confirmed) await deleteRestorePoint(p.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={!!parsed}
        onOpenChange={(o) => !o && setParsed(null)}
        title={S.restoreDialogTitle}
        description={parsed?.file}
        footer={
          <>
            <Button variant="ghost" onClick={() => setParsed(null)}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" icon={Archive} onClick={doRestore} loading={restoring}>
              {S.replaceButton}
            </Button>
          </>
        }
      >
        {parsed && s && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <dt className="text-ink-3">{S.sumCreated}</dt>
              <dd>{fmtDateTime(parsed.backup.manifest.createdAt)}</dd>
              <dt className="text-ink-3">{S.sumProject}</dt>
              <dd dir="auto">{String(s.projectName)}</dd>
              <dt className="text-ink-3">{S.sumRooms}</dt>
              <dd>{num(Number(s.rooms))}</dd>
              <dt className="text-ink-3">{S.sumRequirements}</dt>
              <dd>{num(Number(s.requirements))}</dd>
              <dt className="text-ink-3">{S.sumFiles}</dt>
              <dd>{num(Number(s.images))}</dd>
              <dt className="text-ink-3">{S.sumVersions}</dt>
              <dd>{num(Number(s.versions))}</dd>
              <dt className="text-ink-3">{S.sumLibrary}</dt>
              <dd>{num(Number(s.libraryItems))}</dd>
            </dl>
            {parsed.backup.issues.length > 0 ? (
              <Callout tone="warn" title={S.issuesTitle}>
                <ul className="list-disc ps-4">
                  {parsed.backup.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </Callout>
            ) : (
              <Callout tone="info" icon={ShieldCheck}>
                {parsed.backup.manifest.checksums === 'sha-256' ? S.allFilesChecked : S.allFilesPresent}
              </Callout>
            )}
            <Checkbox checked={restorePoint} onChange={setRestorePoint} label={S.createPoint} />
            {parsed.backup.manifest.includesApiKeys && (
              <Checkbox checked={useKeys} onChange={setUseKeys} label={S.useBackupKeys} description={S.useBackupKeysHint} />
            )}
            <Callout tone="danger">{S.replaceWarning}</Callout>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export function SettingsPage() {
  const project = useProject();
  const settings = useSettings();
  const { t } = useI18n();
  const S = t.settings;
  const trashCount = useTrashCount();
  if (!project || !settings) return <LoadingBlock />;
  const nav: [string, string][] = [
    ['language', t.lang.title],
    ['cloud', S.navCloud],
    ['safety', S.navSafety],
    ['project', S.navProject],
    ['preferences', S.navPreferences],
    ['image', S.navImage],
    ['text', S.navText],
    ['storage', S.navStorage],
  ];
  return (
    <div>
      <PageHeader eyebrow={t.app.name} title={S.title} description={S.lead} />
      <nav className="scroll-thin -mx-1 mb-8 flex gap-x-5 gap-y-2 overflow-x-auto px-1 pb-1 text-[12.5px] text-ink-3 sm:flex-wrap">
        {nav.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="touch-target shrink-0 whitespace-nowrap hover:text-ink"
          >
            {label}
          </a>
        ))}
      </nav>

      <Section id="language" title={t.lang.title} icon={Languages}>
        <LanguageSection />
      </Section>

      <Section id="cloud" title={S.cloudTitle} icon={Cloud} description={S.cloudLead}>
        <CloudSection />
      </Section>

      <Section id="safety" title={S.safetyTitle} icon={ShieldCheck} description={S.safetyLead}>
        <div className="flex flex-col gap-8">
          <Card className="max-w-[760px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 max-w-[480px]">
                <div className="text-[14px] text-ink">{t.trash.title}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{S.trashLead(trashCount ?? 0)}</p>
              </div>
              <ButtonLink to="/deleted" icon={Trash2}>
                {S.openTrash}
              </ButtonLink>
            </div>
          </Card>
          <div className="max-w-[760px]">
            <div className="eyebrow mb-2 flex items-center gap-1.5">
              <History size={12} /> {S.historyTitle}
            </div>
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-3">{S.historyLead}</p>
            <HistorySection />
          </div>
          <div>
            <div className="eyebrow mb-3 flex items-center gap-1.5">
              <HardDrive size={12} /> {S.backupTitle}
            </div>
            <BackupSection />
          </div>
        </div>
      </Section>

      <Section id="project" title={S.navProject}>
        <div className="grid max-w-[720px] gap-4 sm:grid-cols-2">
          <Field label={S.projectNameAr}>
            <CommitInput dir="rtl" value={project.nameAr ?? ''} onCommit={(v) => updateProject({ nameAr: v.trim() })} />
          </Field>
          <Field label={S.projectNameEn} hint={t.common.nameEnHint}>
            <CommitInput dir="ltr" value={project.name} onCommit={(v) => v.trim() && updateProject({ name: v.trim() })} />
          </Field>
          <Field label={S.locationAr}>
            <CommitInput dir="rtl" value={project.locationAr ?? ''} onCommit={(v) => updateProject({ locationAr: v.trim() })} />
          </Field>
          <Field label={S.locationEn}>
            <CommitInput dir="ltr" value={project.location} onCommit={(v) => updateProject({ location: v.trim() })} />
          </Field>
          <Field label={t.common.description} className="sm:col-span-2">
            <CommitInput
              dir="auto"
              multiline
              minRows={2}
              value={project.description}
              onCommit={(v) => updateProject({ description: v })}
              placeholder={S.descriptionPlaceholder}
            />
          </Field>
        </div>
      </Section>

      <Section id="preferences" title={S.navPreferences} description={S.preferencesLead}>
        <div className="grid max-w-[720px] gap-5">
          <Field label={S.defaultUnit}>
            <Segmented
              value={settings.defaultUnit}
              onChange={(u: LengthUnit) => updateSettings((s) => void (s.defaultUnit = u))}
              options={(['m', 'cm', 'mm'] as LengthUnit[]).map((u) => ({ value: u, label: unitLabel(u) }))}
            />
          </Field>
          <Field label={S.defaultCertainty} hint={S.defaultCertaintyHint}>
            <Segmented
              value={settings.defaultCertainty}
              onChange={(v) => updateSettings((s) => void (s.defaultCertainty = v))}
              options={[
                { value: 'confirmed', label: t.enums.certainty.confirmed },
                { value: 'estimated', label: t.enums.certainty.estimated },
              ]}
            />
          </Field>
          <LengthField
            label={S.defaultClearance}
            unit="cm"
            value={settings.defaultClearanceMm}
            onChange={(v) => v !== null && updateSettings((s) => void (s.defaultClearanceMm = v))}
            className="max-w-[240px]"
          />
          <Field label={S.maxUpload} hint={S.maxUploadHint}>
            <Segmented
              value={String(settings.maxUploadMb)}
              onChange={(v) => updateSettings((s) => void (s.maxUploadMb = Number(v)))}
              options={[25, 50, 100, 500].map((mb) => ({ value: String(mb), label: fmtBytes(mb * 1024 * 1024) }))}
            />
          </Field>
          <Field label={S.guidelines} hint={S.guidelinesHint}>
            <CommitInput
              dir="auto"
              multiline
              minRows={3}
              value={settings.houseGuidelines}
              onCommit={(v) => updateSettings((s) => void (s.houseGuidelines = v))}
              placeholder={S.guidelinesPlaceholder}
            />
          </Field>
          <EnglishField source={settings.houseGuidelines} />
        </div>
      </Section>

      <Section id="image" title={S.navImage} description={S.imageLead}>
        <ImageProviderSettings settings={settings} />
      </Section>

      <Section id="text" title={S.navText} description={S.textLead}>
        <TextProviderSettings settings={settings} />
      </Section>

      <Section id="storage" title={S.navStorage} icon={Database} description={S.storageLead}>
        <StorageInfo />
      </Section>

      <p className="mt-6 text-[11.5px] text-ink-4">
        <Link to="/deleted" className="hover:text-ink">
          {t.trash.title}
        </Link>
      </p>
    </div>
  );
}

function useTrashCount(): number | undefined {
  const [count, setCount] = useState<number>();
  useEffect(() => {
    let alive = true;
    const run = () => db.trash.count().then((c) => alive && setCount(c));
    void run();
    const t = setInterval(run, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return count;
}
