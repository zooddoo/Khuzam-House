import { useMemo } from 'react';
import { Armchair, Columns2, FileText, Images, Layers, ListChecks, Palette, RotateCcw, Square, Trash2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n';
import { timeAgo } from '@/i18n/format';
import { useRooms, useTrash } from '@/lib/hooks/data';
import { purgeTrash, restoreFromTrash } from '@/lib/db/trash';
import { roomDisplayName } from '@/lib/names';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';
import type { TrashEntry, TrashKind } from '@/lib/types';
import type { SyncedTable } from '@/lib/sync/tables';

const KIND_ICON: Record<TrashKind, LucideIcon> = {
  room: Square,
  requirement: ListChecks,
  reference: Images,
  version: Layers,
  library: Armchair,
  comparison: Columns2,
  preset: Palette,
  floor: Layers,
  task: FileText,
};

export function RecentlyDeletedPage() {
  const { t, lang } = useI18n();
  const entries = useTrash();
  const rooms = useRooms();
  const confirm = useConfirm();
  const roomNames = useMemo(() => new Map((rooms ?? []).map((r) => [r.id, roomDisplayName(r, lang)])), [rooms, lang]);

  const labelOf = (e: TrashEntry) => (lang === 'ar' ? e.labelAr || e.label : e.label || e.labelAr || '') || t.enums.trashKind[e.kind];

  const roomOf = (e: TrashEntry): string | null => {
    if (!e.roomId || e.kind === 'room') return null;
    const live = roomNames.get(e.roomId);
    if (live) return live;
    const deletedRoom = entries?.find((x) => x.kind === 'room' && x.roomId === e.roomId);
    return deletedRoom ? labelOf(deletedRoom) : null;
  };

  const summary = (e: TrashEntry) => {
    const counts = new Map<string, number>();
    for (const r of e.records) counts.set(r.table, (counts.get(r.table) ?? 0) + 1);
    return Array.from(counts.entries())
      .filter(([, c]) => c > 0)
      .map(([table, c]) => t.trash.count(t.tables[table as SyncedTable] ?? table, c));
  };

  const restore = async (e: TrashEntry) => {
    const ok = await restoreFromTrash(e.id);
    if (ok) toast.success(t.trash.restored(labelOf(e)));
    else toast.error(t.trash.restoreFailed);
  };

  const purge = async (e: TrashEntry) => {
    const r = await confirm({ title: t.trash.deleteForeverTitle, description: t.trash.deleteForeverBody(labelOf(e)), confirmLabel: t.common.delete, tone: 'danger' });
    if (!r.confirmed) return;
    const { files } = await purgeTrash([e.id]);
    toast.success(t.trash.deletedForever, { description: t.trash.filesRemoved(files) || undefined });
  };

  const purgeAll = async () => {
    if (!entries?.length) return;
    const r = await confirm({
      title: t.trash.emptyAllTitle,
      description: t.trash.emptyAllBody(entries.length),
      confirmLabel: t.common.delete,
      tone: 'danger',
      typeToConfirm: t.trash.typeWord,
    });
    if (!r.confirmed) return;
    const { files } = await purgeTrash(entries.map((e) => e.id));
    toast.success(t.trash.deletedForever, { description: t.trash.filesRemoved(files) || undefined });
  };

  return (
    <div>
      <PageHeader
        eyebrow={t.trash.eyebrow}
        title={t.trash.title}
        description={t.trash.description}
        actions={
          entries && entries.length > 0 ? (
            <Button variant="danger" icon={Trash2} onClick={() => void purgeAll()}>
              {t.trash.emptyAll}
            </Button>
          ) : null
        }
      />
      {!entries ? (
        <LoadingBlock />
      ) : entries.length === 0 ? (
        <EmptyState icon={Trash2} title={t.trash.emptyTitle}>
          {t.trash.emptyBody}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="trash-list">
          {entries.map((e) => {
            const Icon = KIND_ICON[e.kind] ?? FileText;
            const room = roomOf(e);
            return (
              <li key={e.id} className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mist text-ink-3">
                    <Icon size={16} strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-ink" dir="auto">
                      {labelOf(e)}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-ink-3">
                      <span>{t.enums.trashKind[e.kind]}</span>
                      {room && <span dir="auto">· {t.trash.inRoom(room)}</span>}
                      <span>· {t.trash.deletedWhen(timeAgo(e.deletedAt))}</span>
                    </div>
                    <div className="mt-1 text-[11.5px] text-ink-4">{summary(e).join(' · ')}</div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="primary" size="sm" icon={RotateCcw} onClick={() => void restore(e)}>
                    {t.trash.restore}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => void purge(e)}>
                    {t.trash.deleteForever}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
