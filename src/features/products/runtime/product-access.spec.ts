import { describe, expect, it } from 'vitest'
import { guardProductSubroute, setCurrentProductRole } from './product-access'

describe('PRD-001 product route access', () => {
  it('keeps denial on the list surface and blocks protected subroutes', () => {
    setCurrentProductRole('finance')
    expect(guardProductSubroute('/products')).toBe(true)
    expect(guardProductSubroute('/products/new')).toBe('/products?denied=1')
    setCurrentProductRole('warehouse')
    expect(guardProductSubroute('/products/product-1')).toBe(true)
    expect(guardProductSubroute('/products/prices/level-adjustments/price-adjustment-level-1')).toBe(true)
    expect(guardProductSubroute('/products/prices/level-adjustments/new')).toBe('/products/prices/level-adjustments?denied=1')
    expect(guardProductSubroute('/products/prices/level-adjustments/price-adjustment-level-1/edit')).toBe('/products/prices/level-adjustments?denied=1')
    expect(guardProductSubroute('/products/prices/order-unit-prices/new')).toBe('/products/prices/level-adjustments?denied=1')
    expect(guardProductSubroute('/products/prices/strategies/price-strategy-1/edit')).toBe('/products/prices/level-adjustments?denied=1')
  })
})
