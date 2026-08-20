import { describe, expect, it } from 'vitest'
import { createReplenishmentService, ReplenishmentDomainError } from './replenishment-service'
import type { InventoryReplenishmentProvider, ProcurementCatalogProvider, ProcurementSupplyProvider } from '../types'

const fact = (overrides: Partial<ReturnType<InventoryReplenishmentProvider['snapshot']>['rows'][number]> = {}) => ({
  warehouseId: 'wh-1', warehouseCode: 'WH1', warehouseName: '主仓', skuId: 'sku-1', categoryId: 'cat-1', productName: '苹果', productCode: 'prd-1', skuCode: 'SKU-1', specification: '箱', inventoryUnitName: '箱', currentMilli: 2000, safetyMinimumMilli: 5000, maximumMilli: 10000, availableMilli: -1000, inTransitMilli: 1000, pendingOutboundMilli: null, ...overrides,
})
const catalog: ProcurementCatalogProvider = { listSkus: () => [{ skuId: 'sku-1', productId: 'prd-1', productName: '苹果', productCode: 'prd-1', skuCode: 'SKU-1', specification: '箱', barcode: null, categoryId: 'cat-1', productStatus: 'on-sale', deleted: false, procurementUnitId: 'unit-box', procurementUnitName: '箱', procurementUnitRateMilli: 1000, minimumOrderQuantity: 3, orderMultiple: 2 }], getSku: (id) => id === 'sku-1' ? catalog.listSkus()[0] : null, listCategories: () => [] }
const supply: ProcurementSupplyProvider = { listCandidates: () => [{ supplierId: 'sup-1', supplierCode: 'SUP', supplierName: '供应商', deliveryMode: 'warehouse', relationId: 'rel-1', skuId: 'sku-1', supplyPriceCents: 1200, procurementUnitId: 'unit-box', procurementUnitName: '箱', procurementUnitRateMilli: 1000, preferred: true }], getPreferred: () => null, listEffectiveSkuIds: () => ['sku-1'], listEnabledSuppliers: () => [{ id: 'sup-1', name: '供应商' }] }
function service(rows = [fact()]) { return createReplenishmentService({ inventory: { snapshot: () => ({ rows, available: true, version: 'v1' }) }, catalog, supply, now: () => '2026-08-20T00:00:00+08:00', nextId: (kind) => `${kind}-1` }) }

describe('replenishment service', () => {
  it('uses max combined formula and rounds to procurement constraints', () => {
    const result = service().analyze({ role: 'super-admin', actorId: 'a' }, { mode: 'combined' }); const row = result.rows[0]
    expect(row.suggestionSource).toEqual(['safety']); expect(row.calculatedQuantity).toBe(8); expect(row.estimatedAmountCents).toBe(9600)
  })
  it('keeps unavailable in-transit facts distinct from zero', () => {
    const row = service([fact({ inTransitMilli: null })]).analyze({ role: 'super-admin', actorId: 'a' }, { mode: 'safety' }).rows[0]
    expect(row.availability).toBe('unavailable'); expect(row.suggestedQuantity).toBeNull(); expect(row.unavailableReason).toContain('在途')
  })
  it('rejects unauthorized access and invalid manual quantities', () => {
    expect(() => service().analyze({ role: 'finance', actorId: 'f' }, { mode: 'combined' })).toThrow(ReplenishmentDomainError)
    const row = service().analyze({ role: 'super-admin', actorId: 'a' }, { mode: 'combined' }).rows[0]
    expect(() => service().applyManualQuantity({ role: 'super-admin', actorId: 'a' }, row, 5)).toThrow('采购倍数')
  })
  it('creates a candidate draft without persistence side effects', () => {
    const actor = { role: 'super-admin' as const, actorId: 'a' }; const row = service().analyze(actor, { mode: 'combined' }).rows[0]; const draft = service().createStockDraft(actor, [row], [{ row }])
    expect(draft.source).toBe('stock'); expect(draft.lines[0].quantity).toBe(8); expect(draft.orderSnapshots).toEqual([])
  })
})
