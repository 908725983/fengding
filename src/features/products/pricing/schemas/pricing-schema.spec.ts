import { describe, expect, it } from 'vitest'
import { pricingBaseline } from '../../../../../mock/handlers/pricing-handler'
import type { PriceAdjustmentDraft } from '../types'
import {
  assertPricingFeatureState,
  validatePriceAdjustmentDraft,
  validatePriceValues,
} from './pricing-schema'

const validLevelDraft: PriceAdjustmentDraft = {
  type: 'level',
  customerId: null,
  formulaAnchor: 'base-order',
  effectiveAt: '2026-08-10T11:00:00+08:00',
  note: null,
  lines: [{ skuId: 'sku-1', unitId: 'unit-piece', changes: { tierOnePriceCents: 1050 } }],
}

describe('PRD-002 pricing schema', () => {
  it('accepts the deterministic baseline fixture', () => {
    expect(() => assertPricingFeatureState(pricingBaseline)).not.toThrow()
  })

  it('rejects duplicate rows and fields unavailable to the adjustment type', () => {
    const draft: PriceAdjustmentDraft = {
      ...validLevelDraft,
      type: 'purchase',
      formulaAnchor: null,
      lines: [
        { skuId: 'sku-1', unitId: 'unit-piece', changes: { tierOnePriceCents: 1000 } },
        { skuId: 'sku-1', unitId: 'unit-piece', changes: { costPriceCents: 650 } },
      ],
    }
    expect(validatePriceAdjustmentDraft(draft)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'lines.0.changes.tierOnePriceCents' }),
      expect.objectContaining({ path: 'lines.1' }),
    ]))
  })

  it('enforces sale bounds independently from purchase price', () => {
    expect(validatePriceValues({ basePurchasePriceCents: 5000, minimumSalePriceCents: 900, maximumSalePriceCents: 1200 })).toEqual([])
    expect(validatePriceValues({ tierOnePriceCents: 800, minimumSalePriceCents: 900, maximumSalePriceCents: 1200 }))
      .toContainEqual(expect.objectContaining({ path: 'prices.tierOnePriceCents' }))
  })

  it('rejects inconsistent history and pending states loaded from JSON', () => {
    const invalid = structuredClone(pricingBaseline)
    invalid.adjustments.find((item) => item.status === 'pending')!.effectiveAt = invalid.clock
    invalid.history[0]!.differenceCents = 999
    expect(() => assertPricingFeatureState(invalid)).toThrowError(expect.objectContaining({ code: 'PRICING_VALIDATION_FAILED' }))
  })
})
