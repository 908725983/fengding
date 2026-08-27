import { describe, expect, it } from 'vitest'
import { createInventoryMockSession } from '../../../../mock/handlers/inventory-handler'
import type { InventoryActor, InventoryClosing } from '../types'

const admin: InventoryActor = { actorId: 'admin-demo', role: 'super-admin' }
const supervisor: InventoryActor = { actorId: 'supervisor-demo', role: 'sales-supervisor' }

describe('inventory statistics service', () => {
  it('uses the immutable movement ledger for inclusive opening, period and ending totals', () => {
    const session = createInventoryMockSession('normal')
    const page = session.service.queryStatistics(admin, { report: 'inventory-ledger', fromDate: '2026-08-01', toDate: '2026-08-10' })

    expect(page.availability).toBe('available')
    expect(page.totals).toMatchObject({
      openingQuantityMilli: 15_000,
      openingAmountCents: 9_500,
      inboundQuantityMilli: 60_000,
      inboundAmountCents: 31_200,
      outboundQuantityMilli: 0,
      outboundAmountCents: 0,
      endingQuantityMilli: 75_000,
      endingAmountCents: 40_700,
      inboundDocumentCount: 2,
      outboundDocumentCount: 0,
    })
    expect(page.items.every((item) => item.kind === 'sku')).toBe(true)
  })

  it('counts a multi-batch request once and includes cost changes only in ending value', () => {
    const session = createInventoryMockSession('normal')
    session.repository.transact((state) => {
      const first = state.movements.find((item) => item.id === 'movement-opening-1')!
      const second = state.movements.find((item) => item.id === 'movement-opening-2')!
      state.movements.push(
        { ...first, id: 'movement-test-out-1', requestId: 'shared-outbound', sourceType: 'sales-outbound', sourceId: 'order-test', direction: 'outbound', quantityMilli: 1_000, occurredAt: '2026-08-10T00:00:00+08:00' },
        { ...second, id: 'movement-test-out-2', requestId: 'shared-outbound', sourceType: 'sales-outbound', sourceId: 'order-test', direction: 'outbound', quantityMilli: 2_000, occurredAt: '2026-08-10T23:59:59+08:00' },
      )
      state.costHistories = [{ id: 'cost-history-test', enterpriseId: state.enterpriseId, warehouseId: 'warehouse-main', skuId: 'sku-1', previousCostPerBaseUnitCents: 700, nextCostPerBaseUnitCents: 710, quantityMilli: 50_000, valueDeltaCents: 500, reason: 'test', effectiveAt: '2026-08-10T12:00:00+08:00', operatorId: admin.actorId, sourceId: 'adjustment-test', createdAt: '2026-08-10T12:00:00+08:00' }]
    })

    const page = session.service.queryStatistics(admin, { report: 'movement-summary', fromDate: '2026-08-10', toDate: '2026-08-10' })
    expect(page.totals.outboundDocumentCount).toBe(1)
    expect(page.totals.outboundQuantityMilli).toBe(3_000)
    expect(page.totals.outboundAmountCents).toBe(2_080)
    expect(page.totals.costAdjustmentCents).toBe(500)
    expect(page.totals.endingAmountCents).toBe(39_120)
    expect(page.totals.netAmountCents).toBe(-2_080)
  })

  it('aggregates the same snapshot by warehouse and keeps totals independent from pagination', () => {
    const session = createInventoryMockSession('normal')
    const page = session.service.queryStatistics(admin, { report: 'warehouse-receipts-issues', fromDate: '2026-08-01', toDate: '2026-08-10', page: 1, pageSize: 10 })
    expect(page.items.every((item) => item.kind === 'warehouse')).toBe(true)
    expect(page.total).toBe(2)
    expect(page.totals.endingQuantityMilli).toBe(75_000)
    expect(page.items.reduce((sum, item) => sum + item.endingQuantityMilli, 0)).toBe(page.totals.endingQuantityMilli)
  })

  it('masks all money for supervisors and rejects roles without inventory access', () => {
    const session = createInventoryMockSession('normal')
    const page = session.service.queryStatistics(supervisor, { fromDate: '2026-08-01', toDate: '2026-08-10' })
    expect(page.amountsVisible).toBe(false)
    expect(page.totals.endingAmountCents).toBeNull()
    expect(page.items.every((item) => item.endingAmountCents === null)).toBe(true)
    expect(() => session.service.queryStatistics({ actorId: 'finance-demo', role: 'finance' }, {})).toThrow('当前角色无权查看库存统计')
  })

  it('preserves SKU facts during a partial catalog failure', () => {
    const session = createInventoryMockSession('partial-failure')
    const page = session.service.queryStatistics(admin, { fromDate: '2026-08-01', toDate: '2026-08-10' })
    expect(page.catalogState).toBe('partial')
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.every((item) => item.kind === 'sku' && item.sku === null)).toBe(true)
    expect(page.message).toContain('商品资料部分不可用')
  })

  it('stops instead of choosing between a conflicting closing and ledger', () => {
    const session = createInventoryMockSession('normal')
    session.repository.transact((state) => {
      const closing: InventoryClosing = { id: 'closing-conflict', enterpriseId: state.enterpriseId, month: '2026-07', status: 'completed', snapshots: [{ warehouseId: 'warehouse-main', skuId: 'sku-1', quantityMilli: 999_000, averageCostPerBaseUnitCents: 700, valueCents: 999_000, sourceVersion: 'bad' }], sourceVersion: 'bad', operatorId: admin.actorId, createdAt: '2026-08-01T00:00:00+08:00', requestId: 'closing-conflict' }
      state.closings = [closing]
    })
    const page = session.service.queryStatistics(admin, { fromDate: '2026-07-01', toDate: '2026-07-31' })
    expect(page.availability).toBe('unavailable')
    expect(page.items).toHaveLength(0)
    expect(page.message).toContain('与不可变账本不一致')
  })

  it('validates dates and provides current warehouse/category filter options', () => {
    const session = createInventoryMockSession('normal')
    expect(() => session.service.queryStatistics(admin, { fromDate: '2026-08-11', toDate: '2026-08-10' })).toThrow('开始日期不能晚于结束日期')
    const options = session.service.listStatisticsFilterOptions(admin)
    expect(options.warehouses.map((item) => item.id)).toContain('warehouse-main')
    expect(options.categories.length).toBeGreaterThan(0)
  })
})
