import { describe, expect, it } from 'vitest'
import {
  buildTwPropertyFallbacks,
  extractTwPropertyInitials,
  TW_FALLBACK_SELECTOR,
} from '@/content/styles/twFallbacks'

const css = [
  '@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}',
  '@property --tw-shadow-color{syntax:"*";inherits:false}',
  '@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0px}',
  '@property --tw-scale-x { syntax: "*"; inherits: false; initial-value: 1; }',
  '.shadow{box-shadow:var(--tw-shadow)}',
].join('\n')

describe('twFallbacks', () => {
  it('extracts only properties that declare an initial value', () => {
    expect(extractTwPropertyInitials(css)).toEqual([
      ['--tw-shadow', '0 0 #0000'],
      ['--tw-ring-offset-width', '0px'],
      ['--tw-scale-x', '1'],
    ])
  })

  it('builds one per-element rule with every initial value', () => {
    expect(buildTwPropertyFallbacks(css)).toBe(
      `${TW_FALLBACK_SELECTOR}{--tw-shadow:0 0 #0000;--tw-ring-offset-width:0px;--tw-scale-x:1}`,
    )
  })

  it('returns an empty string when nothing is registered', () => {
    expect(buildTwPropertyFallbacks('.a{color:red}')).toBe('')
  })
})
