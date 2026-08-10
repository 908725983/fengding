import { describe, expect, it } from 'vitest'
import { businessModules, findBusinessModule } from './module-catalog'

describe('business module catalog', () => {
  it('exposes exactly the eight domains with detailed specifications', () => {
    expect(businessModules).toHaveLength(8)
    expect(new Set(businessModules.map((item) => item.key)).size).toBe(8)
    expect(businessModules.every((item) => item.spec.startsWith('docs/product-specs/'))).toBe(true)
  })

  it('does not invent missing merchant or standalone analytics modules', () => {
    expect(findBusinessModule('merchant')).toBeUndefined()
    expect(findBusinessModule('analytics')).toBeUndefined()
  })
})
