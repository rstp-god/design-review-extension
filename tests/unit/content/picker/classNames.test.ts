import { describe, expect, it } from 'vitest'
import { isHashedClass, isUsableClass, isUsableId } from '@/content/picker/classNames'

describe('class name filter', () => {
  it.each([
    ['Button_root__3xK9d', 'CSS modules'],
    ['styles__root___1a2b3', 'CSS modules, base64 hash'],
    ['Card-module__abc12', 'CSS modules, module suffix'],
    ['sc-AxjAm', 'styled-components component id'],
    ['kQXhDd', 'styled-components generated class'],
    ['bvcNqR', 'styled-components generated class with vowels'],
    ['css-1a2b3c4', 'emotion'],
    ['css-1a2b3c4-Button', 'emotion with label'],
    ['e1x2y3z0', 'emotion without label'],
    ['svelte-1a2b3c4', 'Svelte scoped class'],
    ['jss123', 'JSS'],
  ])('%s is hashed (%s)', (name) => {
    expect(isHashedClass(name)).toBe(true)
    expect(isUsableClass(name)).toBe(false)
  })

  it.each([
    'card__cta',
    'product-card__price',
    'col-md-6',
    'grid-cols-12',
    'mt-10',
    'h1',
    'productCard',
    'MuiButton-root',
    'is-active',
    'btn',
    'navbar',
  ])('%s is a usable class', (name) => {
    expect(isHashedClass(name)).toBe(false)
    expect(isUsableClass(name)).toBe(true)
  })

  it.each(['w-[32px]', 'md:flex', 'bg-[#fff]', 'w-1/2', '[&>*]:p-2', '5col', '', 'a b'])(
    '%s cannot appear in a selector',
    (name) => {
      expect(isUsableClass(name)).toBe(false)
    },
  )

  it('filters ids the same way', () => {
    expect(isUsableId('search')).toBe(true)
    expect(isUsableId('react-select-2-input')).toBe(true)
    expect(isUsableId('__next')).toBe(true)
    expect(isUsableId(':r1:')).toBe(false)
    expect(isUsableId('headlessui-menu-:r5:')).toBe(false)
    expect(isUsableId('root__3xK9d')).toBe(false)
  })
})
