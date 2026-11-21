import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Archive, Database, Download, HardDrive, History, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
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
import { formatBytes, formatDateTime, timeAgo } from '@/lib/format';
import { UNIT_LABEL } from '@/lib/units';
import { Button } from '@/components/ui/Button';
import { Callout, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { Checkbox, CommitInput, Field, Segmented } from '@/components/ui/Form';
import { LengthField } from '@/components/ui/MeasureInput';
import { Dialog } from '@/components/ui/Overlay';
import { useConfirm } from '@/components/ui/Confirm';
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
    <section id={id} className="scroll-mt-6 border-t border-line py-10 first:border-t-0 first:pt-0">
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div>
          <h2 className="display flex items-center gap-2 text-[26px]">
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

function StorageInfo() {
  const [info, setInfo] = useState<{
    usage?: number;
    quota?: number;
    persisted?: boolean;
    images: number;
    imageBytes: number;
    rooms: number;
    refs: number;
    versions: number;
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
    let imageBytes = 0;
    let images = 0;
    await db.images.each((img) => {
      images++;
      imageBytes += img.size + (img.thumb?.size ?? 0) + (img.display?.size ?? 0);
    });
    setInfo({
      usage,
      quota,
      persisted,
      images,
      imageBytes,
      rooms: await db.rooms.count(),
      refs: await db.references.count(),
      versions: await db.versions.count(),
    });
  };
  useEffect(() => {
    load();
  }, []);
  if (!info) return <LoadingBlock label="Measuring storage…" />;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="eyebrow">Used</dt>
          <dd className="mt-1 tabular">{info.usage !== undefined ? formatBytes(info.usage) : '—'}</dd>
        </div>
        <div>
          <dt className="eyebrow">Available</dt>
          <dd className="mt-1 tabular">{info.quota !== undefined ? formatBytes(info.quota) : '—'}</dd>
        </div>
        <div>
          <dt className="eyebrow">Images</dt>
          <dd className="mt-1 tabular">
            {info.images} · {formatBytes(info.imageBytes)}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Records</dt>
          <dd className="mt-1 tabular">
            {info.rooms} rooms · {info.refs} refs · {info.versions} versions
          </dd>
        </div>
      </dl>
      {info.persisted ? (
        <Callout tone="info" icon={ShieldCheck}>
          Persistent storage is granted: the browser will not clear this project to free space. Clearing site data manually still deletes it — keep backups.
        </Callout>
      ) : (
        <Callout
          tone="warn"
          title="Storage is not marked persistent"
          action={
            <Button
              size="sm"
              onClick={async () => {
                const ok = await navigator.storage?.persist?.();
                toast[ok ? 'success' : 'error'](
                  ok ? 'Persistent storage granted' : 'The browser declined. Bookmarking the site or installing it can help; keep regular backups.',
                );
                load();
              }}
            >
              Request persistent storage
            </Button>
          }
        >
          Under heavy disk pressure the browser could clear local data. Request persistence and export backups regularly.
        </Callout>
      )}
    </div>
  );
}

function BackupSection() {
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
    setExporting('Collecting project data…');
    try {
      const { blob, filename, summary } = await exportBackup({ includeKeys, onProgress: (d, t) => setExporting(`Packing images ${d}/${t}…`) });
      downloadBlob(blob, filename);
      await updateSettings((s) => void (s.lastBackupAt = new Date().toISOString()));
      toast.success('Backup downloaded', {
        description: `${summary.rooms} rooms, ${summary.images} images, ${summary.versions} versions · ${formatBytes(blob.size)}`,
      });
    } catch (e) {
      toast.error(`Backup failed: ${(e as Error).message}`);
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
      toast.error(e instanceof BackupError ? e.message : `Could not read the backup: ${(e as Error).message}`);
    }
  };

  const doRestore = async () => {
    if (!parsed) return;
    const r = await confirm({
      title: 'Replace all current project data?',
      tone: 'danger',
      confirmLabel: 'Replace project',
      typeToConfirm: 'REPLACE',
      description: (
        <>
          Every room, requirement, image, version and library item currently in the studio will be replaced by the backup from{' '}
          <strong>{formatDateTime(parsed.backup.manifest.createdAt)}</strong>.{' '}
          {restorePoint
            ? 'A restore point of the current data is created first, so you can go back.'
            : 'No restore point will be created — the current data cannot be recovered unless you exported it.'}
        </>
      ),
    });
    if (!r.confirmed) return;
    setRestoring(true);
    try {
      await restoreBackup(parsed.backup, { createRestorePoint: restorePoint, useBackupKeys: useKeys, reason: `Before restoring ${parsed.file}` });
      toast.success('Backup restored');
      setParsed(null);
      navigate('/');
    } catch (e) {
      toast.error(`Restore failed: ${(e as Error).message}`, { description: 'The project was left as it was.' });
    } finally {
      setRestoring(false);
    }
  };

  const s = parsed?.backup.manifest.summary;

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-md border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[14px] text-ink">Export a backup</div>
            <p className="mt-1 max-w-[520px] text-[12.5px] leading-relaxed text-ink-3">
              A single .zip with all project data and every original image (unmodified, with checksums). Last backup:{' '}
              {settings?.lastBackupAt ? `${timeAgo(settings.lastBackupAt)} (${formatDateTime(settings.lastBackupAt)})` : 'never'}.
            </p>
            <div className="mt-3">
              <Checkbox
                checked={includeKeys}
                onChange={setIncludeKeys}
                label="Include API keys"
                description="Off by default. Anyone with the file could use your keys."
              />
            </div>
          </div>
          <Button variant="primary" icon={Download} onClick={doExport} loading={!!exporting}>
            {exporting ?? 'Export backup'}
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[14px] text-ink">Restore from a backup file</div>
            <p className="mt-1 max-w-[520px] text-[12.5px] leading-relaxed text-ink-3">
              The file is checked first and a summary is shown. Nothing changes until you confirm.
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onFile(f);
            }}
          />
          <Button icon={Upload} onClick={() => fileInput.current?.click()}>
            Choose backup file
          </Button>
        </div>
      </div>

      <div>
        <div className="eyebrow mb-3 flex items-center gap-1.5">
          <History size={12} /> Restore points
        </div>
        {points.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">Created automatically before a backup is restored. The last five are kept in this browser.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
            {points.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px]">{p.reason}</div>
                  <div className="text-[11.5px] text-ink-3">
                    {formatDateTime(p.createdAt)} · {p.summary.rooms} rooms · {p.summary.images} images · {p.summary.versions} versions · {formatBytes(p.size)}
                  </div>
                </div>
                <Button
                  size="sm"
                  icon={RotateCcw}
                  onClick={async () => {
                    const r = await confirm({
                      title: 'Return to this restore point?',
                      tone: 'danger',
                      confirmLabel: 'Restore',
                      typeToConfirm: 'REPLACE',
                      description: 'The current project is replaced by this restore point. A new restore point of the current state is created first.',
                    });
                    if (!r.confirmed) return;
                    try {
                      await restoreFromPoint(p.id);
                      toast.success('Restored');
                      navigate('/');
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Download}
                  onClick={async () => {
                    const b = await getRestorePointBlob(p.id);
                    if (b) downloadBlob(b, `bait-khuzam-restore-point-${p.createdAt.slice(0, 10)}.zip`);
                  }}
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  aria-label="Delete restore point"
                  onClick={async () => {
                    const r = await confirm({ title: 'Delete this restore point?', tone: 'danger', confirmLabel: 'Delete' });
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
        title="Restore this backup?"
        description={parsed?.file}
        footer={
          <>
            <Button variant="ghost" onClick={() => setParsed(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Archive} onClick={doRestore} loading={restoring}>
              Replace current project…
            </Button>
          </>
        }
      >
        {parsed && s && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <dt className="text-ink-3">Created</dt>
              <dd>{formatDateTime(parsed.backup.manifest.createdAt)}</dd>
              <dt className="text-ink-3">Project</dt>
              <dd>{String(s.projectName)}</dd>
              <dt className="text-ink-3">Rooms</dt>
              <dd>{String(s.rooms)}</dd>
              <dt className="text-ink-3">Requirements</dt>
              <dd>{String(s.requirements)}</dd>
              <dt className="text-ink-3">Images</dt>
              <dd>{String(s.images)}</dd>
              <dt className="text-ink-3">Design versions</dt>
              <dd>{String(s.versions)}</dd>
              <dt className="text-ink-3">Library items</dt>
              <dd>{String(s.libraryItems)}</dd>
            </dl>
            {parsed.backup.issues.length > 0 ? (
              <Callout tone="warn" title="Some items could not be verified">
                <ul className="list-disc pl-4">
                  {parsed.backup.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </Callout>
            ) : (
              <Callout tone="info" icon={ShieldCheck}>
                All images are present{parsed.backup.manifest.checksums === 'sha-256' ? ' and passed their checksums' : ''}.
              </Callout>
            )}
            <Checkbox checked={restorePoint} onChange={setRestorePoint} label="Create a restore point of the current project first (recommended)" />
            {parsed.backup.manifest.includesApiKeys && (
              <Checkbox
                checked={useKeys}
                onChange={setUseKeys}
                label="Use the API keys stored in the backup"
                description="Otherwise the keys on this device are kept."
              />
            )}
            <Callout tone="danger">Restoring replaces all current data. This cannot be undone without a restore point or another backup.</Callout>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export function SettingsPage() {
  const project = useProject();
  const settings = useSettings();
  if (!project || !settings) return <LoadingBlock />;
  return (
    <div>
      <PageHeader
        eyebrow="Bait Khuzam"
        title="Settings & Backup"
        description="Project details, units, AI providers, storage and backups. Everything stays on this device."
      />
      <nav className="mb-10 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-3">
        {[
          ['project', 'Project'],
          ['preferences', 'Preferences'],
          ['image', 'Image generation'],
          ['text', 'AI text assistant'],
          ['storage', 'Storage'],
          ['backup', 'Backup & restore'],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="hover:text-ink"
          >
            {label}
          </a>
        ))}
      </nav>

      <Section id="project" title="Project">
        <div className="grid max-w-[720px] gap-4 sm:grid-cols-2">
          <Field label="Project name">
            <CommitInput value={project.name} onCommit={(v) => v.trim() && updateProject({ name: v.trim() })} />
          </Field>
          <Field label="Location">
            <CommitInput value={project.location} onCommit={(v) => updateProject({ location: v.trim() })} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <CommitInput
              multiline
              minRows={2}
              value={project.description}
              onCommit={(v) => updateProject({ description: v })}
              placeholder="A sentence about the house and the project"
            />
          </Field>
        </div>
      </Section>

      <Section id="preferences" title="Preferences" description="Defaults for new rooms and measurements. Existing rooms keep their own settings.">
        <div className="grid max-w-[720px] gap-5">
          <Field label="Default display unit">
            <Segmented
              value={settings.defaultUnit}
              onChange={(u: LengthUnit) => updateSettings((s) => void (s.defaultUnit = u))}
              options={(['m', 'cm', 'mm'] as LengthUnit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }))}
            />
          </Field>
          <Field label="New measurements you type are marked" hint="You can change any value's status next to the field.">
            <Segmented
              value={settings.defaultCertainty}
              onChange={(v) => updateSettings((s) => void (s.defaultCertainty = v))}
              options={[
                { value: 'confirmed', label: 'Confirmed' },
                { value: 'estimated', label: 'Estimated' },
              ]}
            />
          </Field>
          <LengthField
            label="Default walking clearance for new rooms"
            unit="cm"
            value={settings.defaultClearanceMm}
            onChange={(v) => v !== null && updateSettings((s) => void (s.defaultClearanceMm = v))}
            className="max-w-[240px]"
          />
          <Field
            label="House-wide guidelines (optional)"
            hint="Never applied automatically. A room uses these only if you switch them on in that room's Direction tab — every room keeps its own independent design by default."
          >
            <CommitInput
              multiline
              minRows={3}
              value={settings.houseGuidelines}
              onCommit={(v) => updateSettings((s) => void (s.houseGuidelines = v))}
              placeholder="e.g. Use the same oak tone for all doors"
            />
          </Field>
        </div>
      </Section>

      <Section
        id="image"
        title="Image generation"
        description="Choose an image API to redesign rooms. Without one, everything else works and prompts can be copied or saved."
      >
        <ImageProviderSettings settings={settings} />
      </Section>

      <Section id="text" title="AI text assistant">
        <TextProviderSettings settings={settings} />
      </Section>

      <Section
        id="storage"
        title="Storage"
        icon={Database}
        description="The project lives in this browser's local database (IndexedDB). Images are stored as original files."
      >
        <StorageInfo />
      </Section>

      <Section id="backup" title="Backup & restore" icon={HardDrive}>
        <BackupSection />
      </Section>
    </div>
  );
}
