import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CloudOff, CloudUpload, Database, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Display';
import { GateLayout, SetPasswordScreen, SignInScreen, SignOutButton, Splash } from './auth/AuthScreens';
import { checkOwner, claimOwnership, signOut, startAuth, useAuth, type OwnerStatus } from '@/lib/sync/auth';
import { cloudConfigError, isCloudConfigured } from '@/lib/sync/client';
import { localCounts, queueKeys, serverCounts, syncEngine } from '@/lib/sync/engine';
import { db, getMeta, setMeta } from '@/lib/db/db';
import { ensureSeeded } from '@/lib/db/seed';
import { createRestorePoint, exportBackup } from '@/lib/backup/backup';
import { downloadBlob } from '@/lib/download';
import { SYNCED_TABLES, type SyncedTable } from '@/lib/sync/tables';
import { num } from '@/i18n/format';

/**
 * Everything between opening the app and seeing the studio:
 * configuration → sign-in → owner check → first download → (move existing
 * local data to the cloud) → studio, with the sync engine running.
 */
export function CloudGate({ children }: { children: ReactNode }) {
  const t = useT();
  if (!isCloudConfigured) {
    return (
      <GateLayout icon={<Database size={22} />} title={t.auth.notConfiguredTitle} lead={cloudConfigError ?? t.auth.notConfigured}>
        <p className="text-[12.5px] leading-relaxed text-ink-3" dir="ltr">
          VITE_SUPABASE_URL · VITE_SUPABASE_PUBLISHABLE_KEY
        </p>
      </GateLayout>
    );
  }
  return <AuthGate>{children}</AuthGate>;
}

function AuthGate({ children }: { children: ReactNode }) {
  const t = useT();
  useEffect(() => startAuth(), []);
  const auth = useAuth();
  if (auth.status === 'loading') return <Splash label={t.app.opening} />;
  if (auth.status === 'signed-out') return <SignInScreen expired={auth.reason === 'expired'} />;
  if (auth.recovery) return <SetPasswordScreen />;
  return (
    <OwnerGate key={auth.userId} userId={auth.userId} email={auth.email}>
      {children}
    </OwnerGate>
  );
}

function OwnerGate({ userId, email, children }: { userId: string; email: string; children: ReactNode }) {
  const t = useT();
  const [status, setStatus] = useState<OwnerStatus | 'checking'>('checking');
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setStatus('checking');
    setStatus(await checkOwner(userId));
  }, [userId]);

  useEffect(() => {
    void check();
  }, [check]);

  if (status === 'checking') return <Splash label={t.owner.checking} />;
  if (status === 'owner') return <SyncBootstrap userId={userId}>{children}</SyncBootstrap>;
  if (status === 'missing-database')
    return (
      <GateLayout icon={<Database size={22} />} title={t.owner.databaseMissingTitle} lead={t.owner.databaseMissing}>
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" onClick={() => void check()}>
            {t.gate.retry}
          </Button>
          <SignOutButton />
        </div>
      </GateLayout>
    );
  if (status === 'offline')
    return (
      <GateLayout icon={<CloudOff size={22} />} title={t.gate.offlineTitle} lead={t.gate.offline}>
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" onClick={() => void check()}>
            {t.gate.retry}
          </Button>
          <SignOutButton />
        </div>
      </GateLayout>
    );
  if (status === 'not-owner')
    return (
      <GateLayout icon={<ShieldAlert size={22} />} title={t.owner.notOwnerTitle} lead={t.owner.notOwner(email)}>
        <Button variant="primary" size="lg" className="w-full" onClick={() => void signOut()}>
          {t.owner.useOther}
        </Button>
      </GateLayout>
    );
  // unclaimed
  return (
    <GateLayout icon={<ShieldCheck size={22} />} title={t.owner.claimTitle} lead={t.owner.claimLead(email)}>
      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          size="lg"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setStatus(await claimOwnership(userId));
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t.owner.claim}
        </Button>
        <SignOutButton />
      </div>
      <p className="mt-4 text-[12px] text-ink-3">{t.gate.ownerOnlyHint}</p>
    </GateLayout>
  );
}

/* ------------------------------------------------------------------ */
/* First download, existing local data, seeding                         */
/* ------------------------------------------------------------------ */

type Phase =
  | { kind: 'starting' }
  | { kind: 'downloading'; received: number }
  | { kind: 'download-failed'; message: string }
  | { kind: 'migrate'; local: Record<SyncedTable, number>; serverHasData: boolean }
  | { kind: 'ready' };

interface LegacyMeta {
  status: 'pending' | 'done';
  keys?: Partial<Record<SyncedTable, string[]>>;
}

async function snapshotKeys(): Promise<Partial<Record<SyncedTable, string[]>>> {
  const out: Partial<Record<SyncedTable, string[]>> = {};
  for (const table of SYNCED_TABLES) out[table] = (await db.table(table).toCollection().primaryKeys()) as string[];
  return out;
}

/** True when the local data is only the untouched starting rooms (nothing the owner entered). */
async function isPristineSeed(): Promise<boolean> {
  const counts = await Promise.all([db.requirements.count(), db.references.count(), db.files.count(), db.versions.count(), db.library.count(), db.tasks.count(), db.floors.count()]);
  if (counts.some((c) => c > 0)) return false;
  const rooms = await db.rooms.toArray();
  return rooms.every((r) => r.createdAt === r.updatedAt);
}

function SyncBootstrap({ userId, children }: { userId: string; children: ReactNode }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const started = useRef(false);

  const start = useCallback(async () => {
    setPhase({ kind: 'starting' });
    const syncedUser = await getMeta<string>('syncUser');
    let legacy = await getMeta<LegacyMeta>('legacy');
    if (legacy?.status === 'pending' && !legacy.keys) {
      legacy = { status: 'pending', keys: await snapshotKeys() };
      await setMeta('legacy', legacy);
    }

    if (syncedUser === userId && legacy?.status !== 'pending') {
      // This device has synced before: open right away; changes download in the background.
      syncEngine.start();
      setPhase({ kind: 'ready' });
      return;
    }

    if (syncedUser !== userId) await setMeta('cursor', null);
    setPhase({ kind: 'downloading', received: 0 });
    let received = 0;
    try {
      received = await syncEngine.pull((n) => setPhase({ kind: 'downloading', received: n }));
    } catch (e) {
      setPhase({ kind: 'download-failed', message: (e as Error).message });
      return;
    }
    await setMeta('syncUser', userId);

    if (legacy?.status === 'pending') {
      const serverHasData = received > 0;
      if (serverHasData && (await isPristineSeed())) {
        // Only untouched starting rooms on this device: use the cloud studio instead.
        const roomKeys = legacy.keys?.rooms ?? [];
        await db.transaction('rw', db.rooms, async (tx) => {
          const { markSilent } = await import('@/lib/sync/outbox');
          markSilent(tx.idbtrans);
          await db.rooms.bulkDelete(roomKeys);
        });
        await setMeta('legacy', { status: 'done' });
      } else {
        setPhase({ kind: 'migrate', local: await localCounts(), serverHasData });
        return;
      }
    }

    if (!(await db.project.get('project'))) {
      await ensureSeeded();
    }
    syncEngine.start();
    setPhase({ kind: 'ready' });
  }, [userId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
    return () => {
      syncEngine.stop();
    };
  }, [start]);

  if (phase.kind === 'ready') return <>{children}</>;
  if (phase.kind === 'starting') return <Splash label={t.app.opening} />;
  if (phase.kind === 'downloading') return <Splash label={t.sync.downloading} detail={t.sync.downloadingCount(phase.received)} />;
  if (phase.kind === 'download-failed')
    return (
      <GateLayout icon={<CloudOff size={22} />} title={t.sync.downloadFailed} lead={t.sync.downloadFailedHint}>
        <Callout tone="danger" className="mb-4">
          <span dir="ltr">{phase.message}</span>
        </Callout>
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" onClick={() => void start()}>
            {t.gate.retry}
          </Button>
          <SignOutButton />
        </div>
      </GateLayout>
    );
  return (
    <MigrationScreen
      local={phase.local}
      serverHasData={phase.serverHasData}
      onDone={async () => {
        await setMeta('legacy', { status: 'done' });
        if (!(await db.project.get('project'))) await ensureSeeded();
        setPhase({ kind: 'ready' });
      }}
    />
  );
}

const MIGRATION_ROWS: SyncedTable[] = ['rooms', 'requirements', 'references', 'files', 'versions', 'library', 'presets', 'comparisons', 'tasks'];

function MigrationScreen({ local, serverHasData, onDone }: { local: Record<SyncedTable, number>; serverHasData: boolean; onDone: () => void }) {
  const t = useT();
  const [stage, setStage] = useState<'ask' | 'working' | 'verifying' | 'success' | 'failed'>('ask');
  const [progress, setProgress] = useState({ done: 0, total: 0, filesDone: 0, filesTotal: 0 });
  const [cloud, setCloud] = useState<Record<SyncedTable, number> | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  const label = (table: SyncedTable): string => t.tables[table];

  const run = async () => {
    setStage('working');
    try {
      await createRestorePoint(t.migrate.title);
    } catch {
      /* the data itself is untouched either way */
    }
    const legacy = await getMeta<LegacyMeta>('legacy');
    const total = await queueKeys(legacy?.keys);
    const filesTotal = await db.files.count();
    setProgress({ done: 0, total, filesDone: 0, filesTotal });
    syncEngine.start();
    // Follow the queue until everything is uploaded (or it stops making progress).
    let idleRounds = 0;
    let last = -1;
    for (;;) {
      await new Promise((r) => setTimeout(r, 700));
      const pending = await db.outbox.count();
      const pendingFiles = new Set((await db.blobs.where('pending').equals(1).toArray()).map((b) => b.fileId)).size;
      setProgress({ done: Math.max(0, total - pending), total, filesDone: Math.max(0, filesTotal - pendingFiles), filesTotal });
      if (pending === 0 && pendingFiles === 0) break;
      const marker = pending * 100_000 + pendingFiles;
      idleRounds = marker === last ? idleRounds + 1 : 0;
      last = marker;
      if (idleRounds > 60) break; // ~40 s without progress: report what is missing
      if (idleRounds % 10 === 9) void syncEngine.syncNow();
    }
    setStage('verifying');
    try {
      const [l, c] = await Promise.all([localCounts(), serverCounts()]);
      setCloud(c);
      const ok = MIGRATION_ROWS.every((tbl) => c[tbl] >= l[tbl]) && (await db.outbox.count()) === 0;
      setStage(ok ? 'success' : 'failed');
    } catch {
      setStage('failed');
    }
  };

  if (stage === 'working' || stage === 'verifying') {
    return (
      <GateLayout icon={<CloudUpload size={22} />} title={stage === 'working' ? t.migrate.working : t.migrate.verifying}>
        <div className="flex flex-col gap-3 text-[13.5px] text-ink-2">
          <ProgressBar value={progress.total ? progress.done / progress.total : 0} />
          <span>{t.migrate.workingDetail(progress.done, progress.total)}</span>
          {progress.filesTotal > 0 && (
            <>
              <ProgressBar value={progress.filesDone / progress.filesTotal} />
              <span>{t.migrate.filesDetail(progress.filesDone, progress.filesTotal)}</span>
            </>
          )}
        </div>
      </GateLayout>
    );
  }

  if (stage === 'success' || stage === 'failed') {
    return (
      <GateLayout
        icon={stage === 'success' ? <CheckCircle2 size={22} /> : <CloudOff size={22} />}
        title={stage === 'success' ? t.migrate.successTitle : t.migrate.failedTitle}
        lead={stage === 'success' ? t.migrate.success : t.migrate.failed}
      >
        {cloud && (
          <ul className="mb-6 flex flex-col gap-1 rounded-md border border-line bg-surface p-3 text-[13px] text-ink-2">
            {MIGRATION_ROWS.filter((tbl) => local[tbl] > 0).map((tbl) => (
              <li key={tbl} className="flex items-center gap-2">
                <CheckCircle2 size={14} className={cloud[tbl] >= local[tbl] ? 'text-ok' : 'text-warn'} />
                {t.migrate.tableRow(label(tbl), local[tbl], cloud[tbl])}
              </li>
            ))}
          </ul>
        )}
        <Button variant="primary" size="lg" className="w-full" onClick={onDone}>
          {t.common.continue}
        </Button>
      </GateLayout>
    );
  }

  return (
    <GateLayout icon={<CloudUpload size={22} />} title={t.migrate.title} lead={serverHasData ? t.migrate.foundMerge : t.migrate.found}>
      <ul className="mb-6 flex flex-col gap-1 rounded-md border border-line bg-surface p-3 text-[13px] text-ink-2">
        {MIGRATION_ROWS.filter((tbl) => local[tbl] > 0).map((tbl) => (
          <li key={tbl} className="flex justify-between gap-3">
            <span>{label(tbl)}</span>
            <span className="tabular text-ink">{num(local[tbl])}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" icon={CloudUpload} onClick={() => void run()}>
          {serverHasData ? t.migrate.uploadMerge : t.migrate.uploadNow}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          loading={backingUp}
          onClick={async () => {
            setBackingUp(true);
            try {
              const { blob, filename } = await exportBackup();
              downloadBlob(blob, filename);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBackingUp(false);
            }
          }}
        >
          {t.migrate.downloadBackupFirst}
        </Button>
      </div>
    </GateLayout>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}
