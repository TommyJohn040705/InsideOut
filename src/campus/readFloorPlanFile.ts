/**
 * Reads an uploaded floor-plan document in the browser: renders it to a PNG (for display and
 * for Gemini) and, for PDFs, reads the drawing's own text layer so room numbers come with
 * their real positions on the sheet.
 */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ReadFloorPlan {
  fileDataUrl: string;
  imageDataUrl: string;
  imageSize: [number, number];
  /** Short text items on the sheet, positioned in percent of the image. Empty for images. */
  labels: { text: string; x: number; y: number }[];
  pages: number;
}

/** Long side of the rendered page, px. Big enough to read room numbers, small enough to upload. */
const MAX_SIDE = 4000;

const asDataUrl = (f: Blob) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(f); });

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('The image could not be decoded.')); i.src = src; });
}

export async function readFloorPlanFile(file: File): Promise<ReadFloorPlan> {
  const fileDataUrl = await asDataUrl(file);
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: MAX_SIDE / Math.max(base.width, base.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const text = await page.getTextContent();
    const labels: ReadFloorPlan['labels'] = [];
    for (const it of text.items as { str?: string; transform?: number[] }[]) {
      const s = (it.str || '').trim();
      if (!s || s.length > 24 || !it.transform) continue;
      const [x, y] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
      labels.push({ text: s, x: +((x / canvas.width) * 100).toFixed(2), y: +((y / canvas.height) * 100).toFixed(2) });
    }
    return { fileDataUrl: `data:application/pdf;base64,${fileDataUrl.split(',')[1]}`, imageDataUrl: canvas.toDataURL('image/png'), imageSize: [canvas.width, canvas.height], labels, pages: doc.numPages };
  }
  if (!file.type.startsWith('image/')) throw new Error(`${file.name}: use a PDF, SVG, PNG, JPEG or WebP file.`);
  const img = await loadImage(fileDataUrl);
  let w = img.naturalWidth || 2000, h = img.naturalHeight || 2000;
  if (file.type !== 'image/svg+xml') return { fileDataUrl, imageDataUrl: fileDataUrl, imageSize: [w, h], labels: [], pages: 1 };
  // SVG: rasterise for extraction; keep the vector original as the stored file.
  const k = MAX_SIDE / Math.max(w, h);
  w = Math.round(w * k); h = Math.round(h * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { fileDataUrl, imageDataUrl: c.toDataURL('image/png'), imageSize: [w, h], labels: [], pages: 1 };
}

