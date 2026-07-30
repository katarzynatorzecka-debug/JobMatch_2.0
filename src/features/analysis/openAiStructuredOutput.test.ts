import { describe, expect, it } from 'vitest'
import { readOpenAiStructuredOutput } from '../../../supabase/functions/_shared/openAiStructuredOutput'

const output = { id: 'resp_test', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ overallScore: 70 }) }] }] }
describe('OpenAI structured output reader', () => {
  it('reads valid structured output from output content', () => { const result = readOpenAiStructuredOutput(output); expect(result.ok).toBe(true); if (result.ok) expect(result.value).toEqual({ overallScore: 70 }) })
  it('identifies refusal', () => expect(readOpenAiStructuredOutput({ ...output, output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'blocked' }] }] })).toMatchObject({ ok: false, code: 'OPENAI_REFUSAL' }))
  it('identifies incomplete response', () => expect(readOpenAiStructuredOutput({ ...output, status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } })).toMatchObject({ ok: false, code: 'OPENAI_INCOMPLETE' }))
  it('identifies empty output', () => expect(readOpenAiStructuredOutput({ ...output, output: [] })).toMatchObject({ ok: false, code: 'OPENAI_EMPTY_OUTPUT' }))
  it('identifies malformed JSON as schema mismatch', () => expect(readOpenAiStructuredOutput({ ...output, output: [{ type: 'message', content: [{ type: 'output_text', text: '{bad' }] }] })).toMatchObject({ ok: false, code: 'OPENAI_SCHEMA_MISMATCH' }))
})
