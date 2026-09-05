import { GMAIL_MAX_PARALLEL_DOWNLOADS } from './contracts.ts'

export async function mapWithConcurrency<T, R>(items: readonly T[], mapper: (item: T) => Promise<R>, limit = GMAIL_MAX_PARALLEL_DOWNLOADS) {
  const output = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await mapper(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return output
}
