import { describe, expect, it } from 'vitest'
import { parseTags } from './tagInputUtils'

describe('tag parsing', () => {
  it.each([
    ['Bydgoszcz,Toruń', ['Bydgoszcz', 'Toruń']],
    ['Bydgoszcz, Toruń, Warszawa', ['Bydgoszcz', 'Toruń', 'Warszawa']],
    ['Nowy Sącz', ['Nowy Sącz']],
    ['Zielona Góra; Bielsko-Biała', ['Zielona Góra', 'Bielsko-Biała']],
    ['Bydgoszcz, bydgoszcz', ['Bydgoszcz']],
    [', , ', []],
  ])('parses %s', (input, expected) => expect(parseTags(input)).toEqual(expected))

  it('does not split ordinary spaces and preserves existing values', () => {
    expect(parseTags('Nowy Sącz', ['Bydgoszcz'])).toEqual(['Nowy Sącz'])
    expect(parseTags('bydgoszcz, Toruń', ['Bydgoszcz'])).toEqual(['Toruń'])
  })
})
