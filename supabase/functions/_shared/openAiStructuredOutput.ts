export type OpenAiDiagnosticCode = 'OPENAI_REFUSAL' | 'OPENAI_INCOMPLETE' | 'OPENAI_EMPTY_OUTPUT' | 'OPENAI_SCHEMA_MISMATCH'
export type OpenAiReadResult = { ok: true; value: unknown; diagnostics: { responseId?: string; outputTypes: string[]; contentTypes: string[]; keys: string[] } } | { ok: false; code: OpenAiDiagnosticCode; diagnostics: { responseId?: string; outputTypes: string[]; contentTypes: string[]; keys: string[] } }

export function readOpenAiStructuredOutput(payload: unknown): OpenAiReadResult {
  const response = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const output = Array.isArray(response.output) ? response.output : []
  const outputTypes = output.map((item) => typeof item === 'object' && item ? String((item as Record<string, unknown>).type ?? 'unknown') : 'unknown')
  const content = output.flatMap((item) => typeof item === 'object' && item && Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : [])
  const contentTypes = content.map((item) => typeof item === 'object' && item ? String((item as Record<string, unknown>).type ?? 'unknown') : 'unknown')
  const diagnostics = { responseId: typeof response.id === 'string' ? response.id : undefined, outputTypes, contentTypes, keys: Object.keys(response).sort() }
  if (response.status === 'incomplete' || response.incomplete_details) return { ok: false, code: 'OPENAI_INCOMPLETE', diagnostics }
  if (content.some((item) => typeof item === 'object' && item && (item as Record<string, unknown>).type === 'refusal')) return { ok: false, code: 'OPENAI_REFUSAL', diagnostics }
  const text = content.find((item) => typeof item === 'object' && item && (item as Record<string, unknown>).type === 'output_text') as Record<string, unknown> | undefined
  if (!text || typeof text.text !== 'string' || !text.text.trim()) return { ok: false, code: 'OPENAI_EMPTY_OUTPUT', diagnostics }
  try { return { ok: true, value: JSON.parse(text.text), diagnostics } } catch { return { ok: false, code: 'OPENAI_SCHEMA_MISMATCH', diagnostics } }
}
