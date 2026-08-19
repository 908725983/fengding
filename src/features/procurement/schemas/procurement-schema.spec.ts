import { describe, expect, it } from 'vitest'
import { ProcurementValidationError, assertProcurementFeatureState, assertSupplierDraft, normalizeSupplierDraft } from './procurement-schema'
import { procurementBaseline } from '../../../../mock/handlers/procurement-handler'

describe('procurement schema', () => {
  it('normalizes supplier code and optional fields', () => {
    expect(normalizeSupplierDraft({ code: ' sup-9 ', name: ' 演示 ', tradeType: 'purchase', deliveryMode: 'both', contactName: ' 甲 ', contactPhone: ' 000 ', address: ' ', bankName: null, bankAccount: null, note: ' ' })).toMatchObject({ code: 'SUP-9', name: '演示', address: null, note: null })
  })

  it('requires bank fields as a pair and positive supply prices', () => {
    expect(() => assertSupplierDraft({ code: 'SUP-X', name: '演示', tradeType: 'purchase', deliveryMode: 'warehouse', contactName: '甲', contactPhone: '000', address: null, bankName: '演示银行', bankAccount: null, note: null })).toThrow(ProcurementValidationError)
    const state = structuredClone(procurementBaseline); state.supplierProducts[0].supplyPriceCents = 0
    expect(() => assertProcurementFeatureState(state)).toThrow(/必须大于 0/)
  })

  it('rejects duplicate effective preferred suppliers for one sku', () => {
    const state = structuredClone(procurementBaseline); state.supplierProducts[1].preferred = true
    expect(() => assertProcurementFeatureState(state)).toThrow(/最多一个有效首选/)
  })
})
