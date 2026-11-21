import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * pdf.js, loaded only when a PDF is shown. Renders pages to canvas so PDFs
 * work on Android Chrome, which cannot display PDFs inside a page.
 */

type PdfJs = typeof import('pdfjs-dist');
let loading: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!loading) {
    loading = (async () => {
      const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
      pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
      return pdfjs;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

export async function openPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await blob.arrayBuffer());
  return pdfjs.getDocument({ data }).promise;
}

/** Render one page into a canvas scaled to `cssWidth` (sharp on high-DPI screens). */
export async function renderPdfPage(doc: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<void> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
  const scale = (cssWidth / base.width) * dpr;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
}

/** First page as a small WebP preview. */
export async function pdfThumbnail(blob: Blob, maxEdge = 720): Promise<{ thumb: Blob; width: number; height: number; pages: number }> {
  const doc = await openPdf(blob);
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = maxEdge / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    await page.render({ canvas, viewport }).promise;
    const thumb = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/webp', 0.85));
    return { thumb, width: Math.round(base.width), height: Math.round(base.height), pages: doc.numPages };
  } finally {
    void doc.loadingTask.destroy();
  }
}
