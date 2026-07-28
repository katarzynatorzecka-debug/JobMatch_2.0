import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { CvExtractionResult } from '../../contracts/profile'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const minimumCharacters = 100
const minimumWords = 20

function qualityResult(text: string, pageCount: number): CvExtractionResult {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const words = normalized ? normalized.split(' ').length : 0
  const readableRatio = normalized ? (normalized.match(/[\p{L}\p{N}\s.,;:!?()\-/]/gu)?.length ?? 0) / normalized.length : 0
  const quality = normalized.length >= minimumCharacters && words >= minimumWords && readableRatio > .75 ? 'good' : normalized ? 'low' : 'empty'
  return {
    success: quality === 'good', source: 'pdf', text: normalized, characterCount: normalized.length, quality, pageCount,
    warnings: quality === 'good' ? [] : ['Nie udało się odczytać wystarczającej ilości tekstu z PDF. Wklej tekst CV ręcznie.'],
  }
}

export async function extractTextFromPdf(file: File): Promise<CvExtractionResult> {
  try {
    const document = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    const pages: string[] = []
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number)
      const content = await page.getTextContent()
      pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '))
    }
    return qualityResult(pages.join('\n'), document.numPages)
  } catch {
    return { success: false, source: 'pdf', text: '', characterCount: 0, quality: 'empty', warnings: ['Nie udało się odczytać tego PDF. Wklej tekst CV ręcznie.'] }
  }
}
