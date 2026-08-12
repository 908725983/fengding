import { describe, expect, it } from 'vitest'
import { parsePricingCsv, pricingCsvTemplate } from './pricing-csv'

const skus = [{ skuId: 'sku-1', skuCode: 'SKU-000001', baseUnitId: 'unit-piece' }]
const base = { customerId: null, formulaAnchor: 'base-order' as const, effectiveAt: '2026-08-10T11:00:00+08:00', note: null, skus }

describe('PRD-002 pricing CSV fake adapter', () => {
  it('parses a source-backed level price draft in integer cents', () => {
    const preview = parsePricingCsv('skuCode,costPrice,baseOrderPrice,tierOnePrice\nSKU-000001,7.20,12.00,10.80', { ...base, type: 'level' })
    expect(preview.errors).toEqual([])
    expect(preview.draft?.lines[0]).toEqual({ skuId: 'sku-1', unitId: 'unit-piece', changes: { costPriceCents: 720, baseOrderPriceCents: 1200, tierOnePriceCents: 1080 } })
  })

  it('rejects duplicate SKUs, illegal columns and invalid money before submission', () => {
    const preview = parsePricingCsv('skuCode,basePurchasePrice\nSKU-000001,8.123\nSKU-000001,8.00', { ...base, type: 'level' })
    expect(preview.draft).toBeNull()
    expect(preview.errors.join('；')).toContain('不允许导入 basePurchasePrice')
    expect(preview.errors.join('；')).toContain('最多两位小数')
    expect(preview.errors.join('；')).toContain('SKU 重复')
  })

  it('exposes type-specific UTF-8 templates', () => {
    expect(pricingCsvTemplate('purchase')).toContain('basePurchasePrice')
    expect(pricingCsvTemplate('purchase')).not.toContain('tierOnePrice')
    expect(pricingCsvTemplate('customer')).toContain('tierOnePrice')
  })
})
