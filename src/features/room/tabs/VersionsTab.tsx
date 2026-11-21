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

function ImportDialog({ room, open, onOpenChange }: { room: Room; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const v = await importDesignImage(room.id, file, title.trim(), notes.trim());
      toast.success(`Imported as v${v.number}`);
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
      title="Import a design"
      description="Add a design created elsewhere (for example by a designer) as a version of this room. It is labelled “Imported”, not “Generated”."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!file} loading={busy} onClick={save}>
            Import
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Dropzone
          multiple={false}
          onFiles={(f) => (isAcceptedImage(f[0]) ? setFile(f[0]) : toast.error('Unsupported file'))}
          label={file ? `Selected: ${file.name}` : 'Drop the design image here, or click to browse'}
        />
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Designer option B" />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} minRows={2} />
        </Field>
      </div>
    </Dialog>
  );
}

export function VersionsTab({ room, versions }: { room: Room; versions: DesignVersion[] }) {
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
          <h2 className="display text-[28px]">Design versions</h2>
          <p className="mt-1 max-w-[640px] text-[12.5px] leading-relaxed text-ink-3">
            Every generation is saved as its own version with the prompt, settings, images and snapshots used. Approving a version never changes earlier ones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.length >= 1 && (
            <Button variant="primary" icon={Columns2} onClick={() => navigate(`/library/compare?items=${selected.map((id) => `ver:${id}`).join(',')}`)}>
              Compare {selected.length}
            </Button>
          )}
          <Button icon={Upload} onClick={() => setImporting(true)}>
            Import design
          </Button>
          <ButtonLink to={`/studio/${room.id}`} icon={Sparkles}>
            New version
          </ButtonLink>
        </div>
      </div>

      {versions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All <span className="opacity-60">{versions.length}</span>
          </Chip>
          {VERSION_STATUSES.map((s) => {
            const n = versions.filter((v) => v.status === s.value).length;
            if (!n) return null;
            return (
              <Chip key={s.value} active={filter === s.value} onClick={() => setFilter(s.value)}>
                {s.label} <span className="opacity-60">{n}</span>
              </Chip>
            );
          })}
        </div>
      )}

      {versions.length === 0 ? (
        <EmptyState
          icon={History}
          title="No versions yet"
          action={
            <>
              <ButtonLink to={`/studio/${room.id}`} variant="primary" icon={Sparkles}>
                Redesign this room
              </ButtonLink>
              <Button icon={Upload} onClick={() => setImporting(true)}>
                Import a design
              </Button>
            </>
          }
        >
          Generate a concept in the Design Studio, or import a design you already have.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <VersionCard key={v.id} v={v} onOpen={() => setOpenId(v.id)} selected={selected.includes(v.id)} onSelect={() => toggle(v.id)} />
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <p className="text-[12px] text-ink-3">{selected.length} selected for comparison (up to 4). Add site photos or references on the comparison screen.</p>
      )}
      <VersionDetail version={open} room={room} onClose={() => setOpenId(null)} />
      <ImportDialog room={room} open={importing} onOpenChange={setImporting} />
    </div>
  );
}
