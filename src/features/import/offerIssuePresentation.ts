function clean(value: string) {
  return value.replace(/^(brakuje|brak danych)\s*:\s*/i, '').replace(/[.!]+$/g, '').trim()
}
function key(value: string) { return clean(value).toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }
function sameFact(first: string, second: string) {
  const a = key(first); const b = key(second)
  if (!a || !b) return false
  if (a === b || a.includes(b) || b.includes(a)) return true
  const [aWord] = a.split(' '); const [bWord] = b.split(' ')
  return Boolean(aWord && bWord && aWord.length >= 6 && bWord.length >= 6 && (aWord.startsWith(bWord.slice(0, 6)) || bWord.startsWith(aWord.slice(0, 6))))
}

/** One user-facing issue per fact, even when a parser produced both a missing field and a warning. */
export function presentOfferIssues(input: { missingFields: string[]; warnings: string[] }) {
  const missing = [...new Set(input.missingFields.map(clean).filter(Boolean))]
  const warnings = input.warnings.flatMap((warning) => clean(warning).split(/[,;]+/).map((item) => item.trim()).filter(Boolean))
    .filter((warning, index, all) => !missing.some((item) => sameFact(item, warning)) && !all.slice(0, index).some((item) => sameFact(item, warning)))
  return { missing, warnings }
}
