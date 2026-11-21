import { useEffect, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignVersion, GenerationSettings, Reference, Room } from '@/lib/types';
import type { GenerationPackage } from '@/lib/ai/prompt';
import { importExternalResult } from '@/lib/ai/generate';
import { describeError } from '@/lib/ai/http';
import { isAcceptedImage } from '@/lib/images/ingest';
import { Dialog } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Form';
import { PickerButtons } from '@/components/images/Dropzone';
import { useT } from '@/i18n';

/**
 * Save an image made in another tool from this room's prompt. The version keeps
 * the exact prompt, settings, inputs, requirement and dimension snapshots.
 */
export function ImportResultDialog({
  open,
  onOpenChange,
  room,
  pkg,
  settings,
  references,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  room: Room;
  pkg: GenerationPackage;
  settings: GenerationSettings;
  references: Reference[];
  onSaved: (v: DesignVersion) => void;
}) {
  const t = useT();
  const T = t.studio;
  const [files, setFiles] = useState<File[]>([]);
  const [tool, setTool] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setTitle('');
      setNotes('');
    }
  }, [open]);
  useEffect(() => {
    if (!files[0]) return setPreview(null);
    const u = URL.createObjectURL(files[0]);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [files]);

  const pick = (list: File[]) => {
    const images = list.filter(isAcceptedImage);
    if (!images.length) {
      toast.error(T.importNotImage);
      return;
    }
    setFiles(images);
  };

  const save = async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      let last: DesignVersion | null = null;
      for (const file of files) {
        last = await importExternalResult({ room, pkg, settings, references, file, tool, title: title.trim(), notes: notes.trim() });
      }
      toast.success(T.importSaved(files.length, last?.number ?? 0));
      onOpenChange(false);
      if (last) onSaved(last);
    } catch (e) {
      toast.error(T.importFailed, { description: describeError(e).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={T.importTitle}
      description={T.importLead}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" icon={ImagePlus} disabled={!files.length} loading={busy} onClick={save}>
            {T.importSave(files.length)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {preview ? (
          <div className="overflow-hidden rounded-md border border-line bg-mist">
            <img src={preview} alt="" className="max-h-[300px] w-full object-contain" />
            {files.length > 1 && <div className="px-3 py-1.5 text-[12px] text-ink-3">{T.importMore(files.length - 1)}</div>}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-line-strong p-6 text-center text-[12.5px] text-ink-3">{T.importPick}</div>
        )}
        <PickerButtons onFiles={pick} imagesOnly />
        <Field label={T.importTool} hint={T.importToolHint}>
          <Input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="ChatGPT, Midjourney…" dir="auto" />
        </Field>
        <Field label={t.common.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" />
        </Field>
        <Field label={t.common.notes}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} minRows={2} dir="auto" />
        </Field>
        <p className="text-[11.5px] leading-relaxed text-ink-3">{T.importKeeps}</p>
      </div>
    </Dialog>
  );
}
