export function normalizeTags(values: string[], existing: string[] = []): string[] {
  const result = [...existing]
  const known = new Set(existing.map((value) => value.trim().toLocaleLowerCase()))
  values.forEach((value) => {
    const trimmed = value.trim().replace(/\s+/g, ' ')
    const key = trimmed.toLocaleLowerCase()
    if (trimmed && !known.has(key)) { result.push(trimmed); known.add(key) }
  })
  return result
}

export function parseTags(value: string, existing: string[] = []): string[] {
  return normalizeTags(value.split(/[;,]/), existing).slice(existing.length)
}

export function removeLastTag(values: string[]) { return values.slice(0, -1) }
