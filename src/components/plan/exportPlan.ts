import { createElement } from 'react';
import type { Room } from '@/lib/types';
import type { Lang } from '@/i18n/prefs';
import { computeRoomShape } from '@/lib/geometry/room';
import { PlanSvg } from './PlanSvg';
import { tr } from '@/i18n/messages';
import { fitView, planBounds } from './planMath';

/** Render a room plan to an SVG string (no interactivity). */
export async function renderPlanSvg(room: Room, width = 1600, height = 1100, lang?: Lang): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const shape = computeRoomShape(room);
  const view = fitView(planBounds(shape), width, height, 60);
  return renderToStaticMarkup(
    createElement(PlanSvg, {
      room,
      shape,
      items: room.layout.items,
      unit: room.displayUnit,
      view,
      width,
      height,
      showGrid: true,
      showDims: true,
      showLabels: true,
      lang,
    }),
  );
}

/** Render a room plan to a PNG blob. Used for downloads and as an optional AI reference image. */
export async function renderPlanPng(room: Room, width = 1600, height = 1100, lang?: Lang): Promise<Blob> {
  const svg = await renderPlanSvg(room, width, height, lang);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(tr().plan.renderFailed));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(tr().plan.renderFailed);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(tr().plan.renderFailed))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
