import PostalMime from 'postal-mime'
import type { EmlExtractionResult } from '../../contracts/import'
import { htmlToSafeText, MAX_EML_FILE_SIZE, normalizeWhitespace } from './importUtils'

export async function extractRfc822Content(raw: ArrayBuffer, maxBytes = MAX_EML_FILE_SIZE): Promise<EmlExtractionResult> {
  if (raw.byteLength === 0) return { success: false, text: '', characterCount: 0, warnings: [], error: 'Wiadomość jest pusta.' }
  if (raw.byteLength > maxBytes) return { success: false, text: '', characterCount: 0, warnings: [], error: 'Wiadomość jest zbyt duża.' }
  try {
    const parser = new PostalMime()
    const message = await parser.parse(raw)
    const htmlText = message.html ? htmlToSafeText(message.html) : ''
    const plainText = message.text ? normalizeWhitespace(message.text) : ''
    // RocketJobs transactional emails have a deliberately structured text alternative.
    // Prefer it when available; HTML remains a safe fallback for layouts without it.
    const text = /rocketjobs\.pl\/oferta(?:-pracy)?\//i.test(plainText) ? plainText : (htmlText.length >= plainText.length * 0.45 ? htmlText : plainText)
    if (!text) return { success: false, text: '', characterCount: 0, warnings: [], error: 'Nie znaleziono treści raportu w pliku EML.' }
    return { success: true, text, characterCount: text.length, warnings: htmlText ? [] : ['Użyto tekstowej wersji wiadomości.'] }
  } catch {
    return { success: false, text: '', characterCount: 0, warnings: [], error: 'Nie udało się odczytać tego pliku EML.' }
  }
}

export async function extractEmlContent(file: Pick<File, 'arrayBuffer'>): Promise<EmlExtractionResult> {
  try {
    return await extractRfc822Content(await file.arrayBuffer())
  } catch {
    return { success: false, text: '', characterCount: 0, warnings: [], error: 'Nie udało się odczytać tego pliku EML.' }
  }
}
