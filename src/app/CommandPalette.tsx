import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Armchair, FileText, Image as ImageIcon, LayoutGrid, Plus, Search, Settings, Sparkles, Upload, type LucideIcon } from 'lucide-react';
import { useAllRequirements, useLibrary, useReferences, useRooms, useVersions } from '@/lib/hooks/data';
import { categoryLabel, referenceKindLabel, roomTypeLabel } from '@/lib/labels';
import { cn } from '@/components/ui/cn';
import { truncate } from '@/lib/format';

interface Result {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  to: string;
}

function matches(needle: string, ...fields: (string | undefined)[]): boolean {
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return needle.split(/\s+/).every((w) => hay.includes(w));
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const rooms = useRooms() ?? [];
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
    const needle = q.trim().toLowerCase();
    const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? 'Room';
    const actions: Result[] = [
      { id: 'a-add-room', group: 'Actions', title: 'Add a room', icon: Plus, to: '/rooms?new=1' },
      { id: 'a-studio', group: 'Actions', title: 'Start a new design', icon: Sparkles, to: '/studio' },
      { id: 'a-upload', group: 'Actions', title: 'Upload references', icon: Upload, to: '/library/references?upload=1' },
      { id: 'a-settings', group: 'Actions', title: 'Settings & backup', icon: Settings, to: '/settings' },
    ];
    if (!needle)
      return [
        ...actions,
        ...rooms
          .slice(0, 8)
          .map((r) => ({ id: r.id, group: 'Rooms', title: r.name, subtitle: roomTypeLabel(r.type), icon: LayoutGrid, to: `/rooms/${r.id}/overview` })),
      ];
    const out: Result[] = [];
    out.push(...actions.filter((a) => matches(needle, a.title)));
    for (const r of rooms)
      if (matches(needle, r.name, roomTypeLabel(r.type), r.description))
        out.push({ id: r.id, group: 'Rooms', title: r.name, subtitle: roomTypeLabel(r.type), icon: LayoutGrid, to: `/rooms/${r.id}/overview` });
    for (const r of reqs)
      if (matches(needle, r.title, r.description, r.notes, r.group))
        out.push({
          id: r.id,
          group: 'Requirements',
          title: r.title || 'Untitled requirement',
          subtitle: `${roomName(r.roomId)} · ${categoryLabel(r.category)}`,
          icon: FileText,
          to: `/rooms/${r.roomId}/requirements?focus=${r.id}`,
        });
    for (const r of refs)
      if (matches(needle, r.title, r.explanation, r.notes, r.tags.join(' '), referenceKindLabel(r.kind)))
        out.push({
          id: r.id,
          group: 'Images',
          title: r.title || 'Untitled image',
          subtitle: referenceKindLabel(r.kind),
          icon: ImageIcon,
          to: `/library/references?open=${r.id}`,
        });
    for (const v of versions)
      if (matches(needle, v.title, v.notes, roomName(v.roomId)))
        out.push({
          id: v.id,
          group: 'Design versions',
          title: `${roomName(v.roomId)} · v${v.number}`,
          subtitle: v.title,
          icon: Sparkles,
          to: `/library/concepts/${v.id}`,
        });
    for (const l of library)
      if (matches(needle, l.name, l.brand, l.category, l.material, l.color, l.notes))
        out.push({
          id: l.id,
          group: 'Materials & furniture',
          title: l.name,
          subtitle: [l.brand, l.category].filter(Boolean).join(' · '),
          icon: Armchair,
          to: `/materials/${l.kind === 'material' ? 'materials' : 'furniture'}?open=${l.id}`,
        });
    return out.slice(0, 60);
  }, [q, rooms, reqs, refs, versions, library]);

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
          className="fixed left-1/2 top-[12vh] z-[75] w-[calc(100vw-2rem)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-md border border-line bg-surface shadow-pop outline-none animate-rise-in"
        >
          <RadixDialog.Title className="sr-only">Search the project</RadixDialog.Title>
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
              placeholder="Search rooms, requirements, images, versions, furniture…"
              className="h-13 min-w-0 flex-1 bg-transparent py-4 text-[14.5px] outline-none placeholder:text-ink-4"
            />
          </div>
          <div ref={listRef} className="scroll-thin max-h-[56vh] overflow-y-auto p-1.5" role="listbox">
            {results.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-ink-3">No matches for “{q}”.</div>}
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
                    className={cn('flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left', i === active ? 'bg-mist' : '')}
                  >
                    <Icon size={15} strokeWidth={1.6} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink" dir="auto">
                        {truncate(r.title, 90)}
                      </span>
                      {r.subtitle && <span className="block truncate text-[11.5px] text-ink-3">{r.subtitle}</span>}
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
