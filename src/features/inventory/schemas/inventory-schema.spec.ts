import { describe, expect, it } from 'vitest'
import { inventoryBaseline } from '../../../../mock/handlers/inventory-handler'
import { assertInventoryFeatureState, InventoryValidationError, validateLocationDraft, validateWarehouseDraft } from './inventory-schema'

describe('inventory schema', () => {
  it('accepts the single INV-001 baseline', () => { expect(() => assertInventoryFeatureState(inventoryBaseline)).not.toThrow() })
  it('requires warehouse and location identifiers within confirmed limits', () => {
    expect(validateWarehouseDraft({ code: '', name: 'A'.repeat(41), type: 'physical', status: 'enabled', saleProhibited: false, contactName: null, phone: null, provinceCode: null, cityCode: null, districtCode: null, address: null })).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'code' }), expect.objectContaining({ path: 'name' })]))
    expect(validateLocationDraft({ warehouseId: '', code: '', name: '', status: 'enabled', note: 'A'.repeat(501) })).toHaveLength(4)
  })
  it('rejects negative balances and duplicate batch keys', () => {
    const invalid = structuredClone(inventoryBaseline); invalid.balances[0]!.quantityMilli = -1; invalid.batches[1]!.batchNumber = invalid.batches[0]!.batchNumber; invalid.batches[1]!.skuId = invalid.batches[0]!.skuId
    expect(() => assertInventoryFeatureState(invalid)).toThrow(InventoryValidationError)
  })
})
