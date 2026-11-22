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
    // Measure the content box (inside borders and padding). Sizing a child
    // from the border box makes it slightly wider than the space it has, which
    // can grow an auto-sized parent on every measurement (endless widening).
    const update = () => {
      const width = Math.floor(el.clientWidth - pad(el, 'Left') - pad(el, 'Right'));
      const height = Math.floor(el.clientHeight - pad(el, 'Top') - pad(el, 'Bottom'));
      setSize((s) => (s.width !== width || s.height !== height ? { width: Math.max(0, width), height: Math.max(0, height) } : s));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size] as const;
}

function pad(el: HTMLElement, side: 'Left' | 'Right' | 'Top' | 'Bottom'): number {
  return parseFloat(getComputedStyle(el)[`padding${side}`]) || 0;
}
