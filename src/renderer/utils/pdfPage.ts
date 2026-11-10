// Renders one page of a PDF to an image for showing markup over it. Same
// approach as the share page (studiosharevideoplayer/src/utils/pdfPageLoader.ts):
// pdf.js only rasterizes; markup coordinates are in unscaled PDF points.

const RENDER_SCALE = 1.5

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      return lib
    })
  }
  return pdfjsPromise
}

export type RenderedPdfPage = {
  imageUrl: string
  /** Page size in PDF points (scale 1), the space PDF markup is drawn in. */
  width: number
  height: number
  pageCount: number
}

export async function renderPdfPage(data: ArrayBuffer, pageNumber: number): Promise<RenderedPdfPage> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  try {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.numPages) {
      throw new Error(`This PDF has ${doc.numPages} page${doc.numPages === 1 ? '' : 's'}; page ${pageNumber} isn't in it.`)
    }
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error("This window can't render PDF pages.")
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const base = page.getViewport({ scale: 1 })
    return { imageUrl: canvas.toDataURL('image/png'), width: base.width, height: base.height, pageCount: doc.numPages }
  } finally {
    doc.destroy()
  }
}
