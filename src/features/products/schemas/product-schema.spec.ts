import { describe, expect, it } from 'vitest'
import { productBaseline } from '../../../../mock/handlers/product-handler'
import { createEmptyProductDraft, applyBaseUnit } from '../services/product-service'
import { assertProductFeatureState, validateProductDraft } from './product-schema'

describe('PRD-001 executable schemas', () => {
  it('accepts the deterministic product baseline', () => {
    expect(() => assertProductFeatureState(productBaseline)).not.toThrow()
  })

  it('reports product, SKU, price and unit field paths', () => {
    const draft = applyBaseUnit(createEmptyProductDraft(), 'unit-piece')
    draft.skus[0]!.minimumSalePriceCents = 1000
    draft.skus[0]!.baseOrderPriceCents = 999
    draft.sceneUnits.procurement.conversionRate = 1.1234567
    const paths = validateProductDraft(draft).map((issue) => issue.path)
    expect(paths).toEqual(expect.arrayContaining(['name', 'categoryId', 'skus.0.baseOrderPriceCents', 'sceneUnits.procurement.conversionRate']))
  })
})
