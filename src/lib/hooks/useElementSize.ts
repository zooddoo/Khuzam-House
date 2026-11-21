import { useLayoutEffect, useState } from 'react';

/**
 * Observe an element's size. Returns a callback ref, so measuring starts
 * whenever the element mounts — including elements rendered after a loading
 * or empty state.
 */
export function useElementSize<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.width - r.width) > 0.5 || Math.abs(s.height - r.height) > 0.5 ? { width: r.width, height: r.height } : s));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size] as const;
}
