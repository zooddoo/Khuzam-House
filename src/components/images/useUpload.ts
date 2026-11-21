import { useState } from 'react';
import { toast } from 'sonner';
import { addReferencesFromFiles } from '@/lib/db/references';
import { tr } from '@/i18n/messages';
import type { Reference } from '@/lib/types';

/**
 * Add picked / dropped / pasted files as references, with progress and a
 * clear message for every file that could not be added (never silent).
 * Uploading to the cloud then continues in the background, with progress
 * on each file and in the save status.
 */
export function useUploadReferences() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const upload = async (files: File[], defaults: Partial<Reference>, opts: { quiet?: boolean; imagesOnly?: boolean } = {}): Promise<Reference[]> => {
    if (!files.length) return [];
    const t = tr().files;
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    const toastId = files.length > 1 ? toast.loading(t.processing(0, files.length)) : undefined;
    try {
      const { added, errors } = await addReferencesFromFiles(files, defaults, undefined, {
        requireImage: opts.imagesOnly,
        onProgress: (done, total) => {
          setProgress({ done, total });
          if (toastId !== undefined) toast.loading(t.processing(done, total), { id: toastId });
        },
      });
      if (toastId !== undefined) toast.dismiss(toastId);
      for (const e of errors) toast.error(e, { duration: 10_000 });
      if (errors.length && added.length) toast.warning(t.someFailed(errors.length));
      if (added.length && !opts.quiet) toast.success(t.added(added.length));
      return added;
    } catch (e) {
      if (toastId !== undefined) toast.dismiss(toastId);
      toast.error(tr().files.readFailed('', (e as Error).message), { duration: 10_000 });
      return [];
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  return { upload, busy, progress };
}
