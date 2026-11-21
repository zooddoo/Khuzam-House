import { useState } from 'react';
import { toast } from 'sonner';
import { addReferencesFromFiles } from '@/lib/db/references';
import type { Reference } from '@/lib/types';

/** Upload helper with progress state and user-facing messages. */
export function useUploadReferences() {
  const [busy, setBusy] = useState(false);
  const upload = async (files: File[], defaults: Partial<Reference>, opts: { quiet?: boolean } = {}): Promise<Reference[]> => {
    if (!files.length) return [];
    setBusy(true);
    const t = files.length > 1 ? toast.loading(`Processing ${files.length} images…`) : undefined;
    try {
      const { added, errors } = await addReferencesFromFiles(files, defaults);
      if (t) toast.dismiss(t);
      if (errors.length) errors.forEach((e) => toast.error(e));
      if (added.length && !opts.quiet) toast.success(added.length === 1 ? 'Image added' : `${added.length} images added`);
      return added;
    } catch (e) {
      if (t) toast.dismiss(t);
      toast.error(`Upload failed: ${(e as Error).message}`);
      return [];
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}
