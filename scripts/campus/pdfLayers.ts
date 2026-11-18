/**
 * Draws only some drawing layers of a Plant Operations floor-plan PDF (Node only: pdfjs + @napi-rs/canvas).
 * About half the PDFs keep their CAD layers (B-BP-WALL, A-WALL, B-BP-STAIR, ...): drawing just the
 * walls gives exact walls with doorways as real gaps, and no text, key map or title block.
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

// Walls, glass, columns and railings block walking; doors, text, site plan, demolished walls do not.
const WALL = /WALL|WINDOW|GLAZ|COLUMN|CURT|HRAL|HANDRAIL|RAIL|STAIR/i;
const NOT_WALL = /RETAIN|SITE|X-SP01|^B-SP|TEXT|DEMO|DOOR|HATCH/i;
const STAIR = /STAIR/i;

export interface LayerRender { gray: Uint8Array; layers: string[] }

/** Renders the chosen layers at w x h (the stored plan image size). Null when the PDF has no layers or none match. */
export async function renderLayers(pdf: Uint8Array, w: number, h: number, which: 'walls' | 'stairs'): Promise<LayerRender | null> {
  const doc = await getDocument({ data: pdf, verbosity: 0 }).promise;
  try {
    const oc = await doc.getOptionalContentConfig();
    const on: string[] = [];
    for (const [id, g] of oc as unknown as Iterable<[string, { name: string }]>) {
      const v = which === 'stairs' ? STAIR.test(g.name) && !/TEXT/i.test(g.name) : WALL.test(g.name) && !NOT_WALL.test(g.name);
      oc.setVisibility(id, v);
      if (v) on.push(g.name);
    }
    if (!on.length) return null;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: w / page.getViewport({ scale: 1 }).width });
    if (Math.abs(vp.height - h) > 3) return null; // not the same sheet shape as the stored image
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    await page.render({ canvasContext: g as unknown as CanvasRenderingContext2D, viewport: vp, optionalContentConfigPromise: Promise.resolve(oc) } as any).promise;
    const d = g.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) gray[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    return { gray, layers: on };
  } finally {
    await doc.destroy();
  }
}
