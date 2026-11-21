import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Armchair, FileText, Image as ImageIcon, LayoutGrid, Plus, Search, Settings, Sparkles, Trash2, Upload, type LucideIcon } from 'lucide-react';
import { useAllRequirements, useFilesMap, useLibrary, useReferences, useRooms, useVersions } from '@/lib/hooks/data';
import { categoryLabel, referenceKindLabel, roomTypeLabel } from '@/lib/labels';
import { cn } from '@/components/ui/cn';
import { truncate } from '@/lib/format';
import { matchesSearch } from '@/i18n/arabic';
import { useI18n } from '@/i18n';
import { roomDisplayName } from '@/lib/names';

interface Result {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  to: string;
}

/** Every word must appear (Arabic letter variants and diacritics are ignored). */
function matches(needle: string, ...fields: (string | undefined)[]): boolean {
  return matchesSearch(fields.filter(Boolean).join(' '), needle);
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const rooms = useRooms() ?? [];
  const files = useFilesMap();
  const reqs = useAllRequirements() ?? [];
  const refs = useReferences() ?? [];
  const library = useLibrary() ?? [];
  const versions = useVersions() ?? [];
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const needle = q.trim();
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const roomName = (id: string) => roomDisplayName(roomById.get(id), lang) || t.common.room;
    const actions: Result[] = [
      { id: 'a-add-room', group: t.search.actions, title: t.search.addRoom, icon: Plus, to: '/rooms?new=1' },
      { id: 'a-studio', group: t.search.actions, title: t.search.newDesign, icon: Sparkles, to: '/studio' },
      { id: 'a-upload', group: t.search.actions, title: t.search.uploadRefs, icon: Upload, to: '/library/references?upload=1' },
      { id: 'a-settings', group: t.search.actions, title: t.search.settings, icon: Settings, to: '/settings' },
      { id: 'a-deleted', group: t.search.actions, title: t.search.deleted, icon: Trash2, to: '/deleted' },
    ];
    const roomResult = (r: (typeof rooms)[number]): Result => ({
      id: r.id,
      group: t.search.rooms,
      title: roomDisplayName(r, lang),
      subtitle: roomTypeLabel(r.type),
      icon: LayoutGrid,
      to: `/rooms/${r.id}/overview`,
    });
    if (!needle) return [...actions, ...rooms.slice(0, 8).map(roomResult)];
    const out: Result[] = [];
    out.push(...actions.filter((a) => matches(needle, a.title)));
    for (const r of rooms) if (matches(needle, r.name, r.nameAr, roomTypeLabel(r.type), roomTypeLabel(r.type, 'en'), r.description)) out.push(roomResult(r));
    for (const r of reqs)
      if (matches(needle, r.title, r.description, r.notes, r.group))
        out.push({
          id: r.id,
          group: t.search.requirements,
          title: r.title || t.search.untitledRequirement,
          subtitle: `${roomName(r.roomId)} · ${categoryLabel(r.category)}`,
          icon: FileText,
          to: `/rooms/${r.roomId}/requirements?focus=${r.id}`,
        });
    for (const r of refs) {
      const f = files?.get(r.imageId);
      if (matches(needle, r.title, r.explanation, r.notes, r.tags.join(' '), referenceKindLabel(r.kind), f?.name, f ? t.enums.fileKind[f.kind] : ''))
        out.push({
          id: r.id,
          group: t.search.files,
          title: r.title || f?.name || t.search.untitledFile,
          subtitle: [referenceKindLabel(r.kind), f && f.kind !== 'image' ? t.enums.fileKind[f.kind] : ''].filter(Boolean).join(' · '),
          icon: ImageIcon,
          to: `/library/references?open=${r.id}`,
        });
    }
    for (const v of versions)
      if (matches(needle, v.title, v.notes, roomName(v.roomId)))
        out.push({
          id: v.id,
          group: t.search.versions,
          title: `${roomName(v.roomId)} · ${t.versions.short(v.number)}`,
          subtitle: v.title,
          icon: Sparkles,
          to: `/library/concepts/${v.id}`,
        });
    for (const l of library)
      if (matches(needle, l.name, l.brand, l.category, l.material, l.color, l.notes))
        out.push({
          id: l.id,
          group: t.search.library,
          title: l.name,
          subtitle: [l.brand, l.category].filter(Boolean).join(' · '),
          icon: Armchair,
          to: `/materials/${l.kind === 'material' ? 'materials' : 'furniture'}?open=${l.id}`,
        });
    return out.slice(0, 60);
  }, [q, rooms, reqs, refs, versions, library, files, t, lang]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (r: Result) => {
    onOpenChange(false);
    navigate(r.to);
  };

  let lastGroup = '';
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[75] bg-ink/30 backdrop-blur-[2px] animate-fade-in" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[8vh] z-[75] w-[calc(100vw-1.5rem)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-md border border-line bg-surface shadow-pop outline-none animate-rise-in"
        >
          <RadixDialog.Title className="sr-only">{t.search.title}</RadixDialog.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search size={16} className="text-ink-3" />
            <input
              autoFocus
              dir="auto"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(results.length - 1, a + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === 'Enter' && results[active]) {
                  e.preventDefault();
                  go(results[active]);
                }
              }}
              placeholder={t.search.placeholder}
              className="h-13 min-w-0 flex-1 bg-transparent py-4 text-[15px] outline-none placeholder:text-ink-4"
            />
          </div>
          <div ref={listRef} className="scroll-thin max-h-[56vh] overflow-y-auto p-1.5" role="listbox">
            {results.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-ink-3">{t.search.noMatches(q)}</div>}
            {results.map((r, i) => {
              const header = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              const Icon = r.icon;
              return (
                <div key={`${r.group}-${r.id}`}>
                  {header && <div className="eyebrow px-3 pb-1 pt-3">{header}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(r)}
                    className={cn('flex min-h-11 w-full items-center gap-3 rounded-sm px-3 py-2 text-start', i === active ? 'bg-mist' : '')}
                  >
                    <Icon size={15} strokeWidth={1.6} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink" dir="auto">
                        {truncate(r.title, 90)}
                      </span>
                      {r.subtitle && (
                        <span className="block truncate text-[11.5px] text-ink-3" dir="auto">
                          {r.subtitle}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
