import { useState, type KeyboardEvent } from 'react'
import { parseTags, removeLastTag } from '../features/profile/tagInputUtils'

export function TagInput({ label, values, onChange, hint, placeholder = 'Wpisz wartość i zatwierdź Enterem lub przecinkiem' }: { label: string; values: string[]; onChange: (values: string[]) => void; hint?: string; placeholder?: string }) {
  const [input, setInput] = useState('')
  const commit = (value = input) => {
    const additions = parseTags(value, values)
    if (additions.length) onChange([...values, ...additions])
    setInput('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ';') { event.preventDefault(); commit() }
    if (event.key === 'Backspace' && !input && values.length) onChange(removeLastTag(values))
  }
  return <label className="tag-input-label">{label}{hint && <span className="field-hint">{hint}</span>}<span className="tag-input" onBlur={() => commit()}>{values.map((value) => <span className="tag" key={value}><span>{value}</span><button type="button" aria-label={`Usuń ${label.toLocaleLowerCase()} ${value}`} onClick={() => onChange(values.filter((item) => item !== value))}>×</button></span>)}<input value={input} onChange={(event) => { const next = event.target.value; if (/[;,]/.test(next)) commit(next); else setInput(next) }} onKeyDown={onKeyDown} placeholder={values.length ? '' : placeholder} /></span></label>
}
