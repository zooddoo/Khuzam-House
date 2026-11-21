import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../ui/cn';

export interface View {
  scale: number;
  x: number;
  y: number;
}

export const IDENTITY: View = { scale: 1, x: 0, y: 0 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function zoomAt(view: View, factor: number, cx: number, cy: number, min = 1, max = 10): View {
  const scale = clamp(view.scale * factor, min, max);
  const k = scale / view.scale;
  if (scale === 1) return { ...IDENTITY };
  return { scale, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k };
}

/**
 * Zoom and pan surface. Controlled, so several panes can share one view
 * (synchronized comparison). Wheel / pinch zoom, drag to pan, double-click toggles zoom.
 */
export function ZoomPan({
  view,
  onChange,
  children,
  className,
  max = 10,
  disabled,
}: {
  view: View;
  onChange: (v: View) => void;
  children: ReactNode;
  className?: string;
  max?: number;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; view: View; cx: number; cy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      onChangeRef.current(zoomAt(viewRef.current, factor, e.clientX - rect.left, e.clientY - rect.top, 1, max));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [disabled, max]);

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div
      ref={ref}
      className={cn(
        'relative h-full w-full touch-none select-none overflow-hidden',
        view.scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
        className,
      )}
      onPointerDown={(e) => {
        if (disabled) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, local(e));
        if (pointers.current.size === 2) {
          const [a, b] = Array.from(pointers.current.values());
          pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), view: viewRef.current, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
          drag.current = null;
        } else {
          drag.current = { ...local(e), view: viewRef.current };
        }
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, local(e));
        if (pinch.current && pointers.current.size === 2) {
          const [a, b] = Array.from(pointers.current.values());
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          onChange(zoomAt(pinch.current.view, d / pinch.current.dist, pinch.current.cx, pinch.current.cy, 1, max));
        } else if (drag.current && viewRef.current.scale > 1) {
          const p = local(e);
          onChange({ ...drag.current.view, x: drag.current.view.x + (p.x - drag.current.x), y: drag.current.view.y + (p.y - drag.current.y) });
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        if (pointers.current.size === 0) drag.current = null;
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        pinch.current = null;
        drag.current = null;
      }}
      onDoubleClick={(e) => {
        if (disabled) return;
        const p = local(e);
        onChange(view.scale > 1 ? { ...IDENTITY } : zoomAt(view, 2.5, p.x, p.y, 1, max));
      }}
    >
      <div className="h-full w-full origin-top-left will-change-transform" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        {children}
      </div>
    </div>
  );
}
