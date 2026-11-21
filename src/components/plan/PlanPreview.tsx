import { tr } from '@/i18n/messages';
import { useMemo } from 'react';
import { Ruler } from 'lucide-react';
import type { ArchElement, Room } from '@/lib/types';
import { computeRoomShape, type WallSegment } from '@/lib/geometry/room';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { cn } from '../ui/cn';
import { PlanSvg } from './PlanSvg';
import { fitView, planBounds } from './planMath';

/** Static, auto-fitted plan of a room. Shows a clear placeholder when dimensions are unknown. */
export function PlanPreview({
  room,
  className,
  height = 260,
  highlightWallId,
  selectedElementId,
  showFurniture = true,
  minimal,
  onElementClick,
  onWallClick,
  emptyLabel,
}: {
  room: Room;
  className?: string;
  /** Pixel height, or 'fill' to take the parent's height. */
  height?: number | 'fill';
  highlightWallId?: string | null;
  selectedElementId?: string | null;
  showFurniture?: boolean;
  minimal?: boolean;
  onElementClick?: (el: ArchElement) => void;
  onWallClick?: (seg: WallSegment) => void;
  emptyLabel?: string;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const shape = useMemo(() => computeRoomShape(room), [room]);
  const h = height === 'fill' ? size.height : height;
  const view = useMemo(() => fitView(planBounds(shape), size.width || 1, h || 1, minimal ? 8 : 24), [shape, size.width, h, minimal]);

  return (
    <div
      ref={ref}
      className={cn('relative w-full overflow-hidden rounded-md border border-line bg-surface', className)}
      style={{ height: height === 'fill' ? '100%' : height }}
    >
      {!shape.drawable ? (
        <div className="hairline-grid absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-[12.5px] text-ink-3">
          <Ruler size={18} strokeWidth={1.5} className="text-ink-4" />
          <span>{emptyLabel ?? tr().plan.previewEmpty}</span>
          {shape.missing.length > 0 && !minimal && <span className="text-[11.5px] text-ink-4">Missing: {shape.missing.join(', ')}</span>}
        </div>
      ) : (
        size.width > 0 &&
        h > 0 && (
          <PlanSvg
            room={room}
            shape={shape}
            items={room.layout.items}
            unit={room.displayUnit}
            view={view}
            width={size.width}
            height={h}
            highlightWallId={highlightWallId}
            selectedElementId={selectedElementId}
            showFurniture={showFurniture}
            showGrid={!minimal}
            showDims={!minimal}
            showLabels={!minimal}
            showCompass={!minimal}
            showScale={!minimal}
            minimal={minimal}
            onElementPointerDown={onElementClick ? (_e, el) => onElementClick(el) : undefined}
            onWallPointerDown={onWallClick ? (_e, sg) => onWallClick(sg) : undefined}
          />
        )
      )}
    </div>
  );
}
