import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Columns2, History, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignVersion, Room, VersionStatus } from '@/lib/types';
import { VERSION_STATUSES } from '@/lib/labels';
import { importDesignImage } from '@/lib/db/versions';
import { isAcceptedImage } from '@/lib/images/ingest';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Chip, Field, Input, Textarea } from '@/components/ui/Form';
import { Dialog } from '@/components/ui/Overlay';
import { EmptyState } from '@/components/ui/Display';
import { Dropzone } from '@/components/images/Dropzone';
import { VersionCard, VersionDetail } from '../../versions/VersionDetail';
import { useT } from '@/i18n';
import { num } from '@/i18n/format';

function ImportDialog({ room, open, onOpenChange }: { room: Room; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const V = t.versionsTab;
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const v = await importDesignImage(room.id, file, title.trim(), notes.trim());
      toast.success(V.imported(t.versions.short(v.number)));
      onOpenChange(false);
      setFile(null);
      setTitle('');
      setNotes('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={V.importTitle}
      description={V.importLead}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={!file} loading={busy} onClick={save}>
            {V.import}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Dropzone
          multiple={false}
          imagesOnly
          onFiles={(f) => (isAcceptedImage(f[0]) ? setFile(f[0]) : toast.error(V.unsupported))}
          label={file ? V.selected(file.name) : V.drop}
        />
        <Field label={t.common.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={V.titlePlaceholder} />
        </Field>
        <Field label={t.common.notes}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} minRows={2} />
        </Field>
      </div>
    </Dialog>
  );
}

export function VersionsTab({ room, versions }: { room: Room; versions: DesignVersion[] }) {
  const t = useT();
  const V = t.versionsTab;
  const navigate = useNavigate();
  const [filter, setFilter] = useState<VersionStatus | 'all'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const list = useMemo(() => versions.filter((v) => filter === 'all' || v.status === filter), [versions, filter]);
  const open = versions.find((v) => v.id === openId) ?? null;

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="display text-[28px]">{V.title}</h2>
          <p className="mt-1 max-w-[640px] text-[12.5px] leading-relaxed text-ink-3">{V.lead}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.length >= 1 && (
            <Button variant="primary" icon={Columns2} onClick={() => navigate(`/library/compare?items=${selected.map((id) => `ver:${id}`).join(',')}`)}>
              {V.compare(selected.length)}
            </Button>
          )}
          <Button icon={Upload} onClick={() => setImporting(true)}>
            {V.importDesign}
          </Button>
          <ButtonLink to={`/studio/${room.id}`} icon={Sparkles}>
            {V.newVersion}
          </ButtonLink>
        </div>
      </div>

      {versions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            {V.all} <span className="opacity-60">{num(versions.length)}</span>
          </Chip>
          {VERSION_STATUSES.map((s) => {
            const count = versions.filter((v) => v.status === s.value).length;
            if (!count) return null;
            return (
              <Chip key={s.value} active={filter === s.value} onClick={() => setFilter(s.value)}>
                {s.label} <span className="opacity-60">{num(count)}</span>
              </Chip>
            );
          })}
        </div>
      )}

      {versions.length === 0 ? (
        <EmptyState
          icon={History}
          title={V.emptyTitle}
          action={
            <>
              <ButtonLink to={`/studio/${room.id}`} variant="primary" icon={Sparkles}>
                {V.redesign}
              </ButtonLink>
              <Button icon={Upload} onClick={() => setImporting(true)}>
                {V.importADesign}
              </Button>
            </>
          }
        >
          {V.emptyBody}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <VersionCard key={v.id} v={v} onOpen={() => setOpenId(v.id)} selected={selected.includes(v.id)} onSelect={() => toggle(v.id)} />
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <p className="text-[12px] text-ink-3">{V.selectedHint(selected.length)}</p>
      )}
      <VersionDetail version={open} room={room} onClose={() => setOpenId(null)} />
      <ImportDialog room={room} open={importing} onOpenChange={setImporting} />
    </div>
  );
}
