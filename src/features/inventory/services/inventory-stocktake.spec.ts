import { describe, expect, it } from 'vitest'
import { createInventoryMockSession } from '../../../../mock/handlers/inventory-handler'
import type { InventoryActor } from '../types'

const admin: InventoryActor = { actorId: 'admin-demo', role: 'super-admin' }
const warehouse: InventoryActor = { actorId: 'warehouse-demo', role: 'warehouse' }
const supervisor: InventoryActor = { actorId: 'supervisor-demo', role: 'sales-supervisor' }
const finance: InventoryActor = { actorId: 'finance-demo', role: 'finance' }

describe('INV-003 stocktake, cost and closing', () => {
  it('starts a scoped stocktake, distinguishes zero and completes atomically', () => {
    const session = createInventoryMockSession(); const workspace = session.service.getWorkspace(admin); const warehouseId = workspace.warehouses[0]!.id
    let stocktake = session.service.createStocktake(admin, { warehouseId, type: 'full', scopeKind: 'all', operatorId: admin.actorId, occurredAt: '2026-08-10T10:00:00+08:00' })
    stocktake = session.service.startStocktake(warehouse, stocktake); expect(stocktake.status).toBe('counting'); expect(stocktake.lines.length).toBeGreaterThan(0)
    stocktake = session.service.saveStocktakeCounts(warehouse, { ...stocktake, lines: stocktake.lines.map((item) => ({ ...item, countedQuantityMilli: item.bookQuantityMilli })) }); expect(stocktake.status).toBe('pending-review')
    const completed = session.service.approveStocktake(admin, stocktake); expect(completed.status).toBe('completed'); expect(session.service.listStocktakes(admin).items[0]!.status).toBe('completed')
  })

  it('blocks writes for locked scoped SKU and records cost history', () => {
    const session = createInventoryMockSession(); const row = session.service.getWorkspace(admin).stocks.items.find((item) => item.currentMilli > 0)!; let stocktake = session.service.createStocktake(admin, { warehouseId: row.warehouse.id, type: 'full', scopeKind: 'skus', scopeSkuIds: [row.skuId], operatorId: admin.actorId, occurredAt: '2026-08-10T08:00:00+08:00' }); stocktake = session.service.startStocktake(admin, stocktake)
    expect(() => session.service.confirmOutbound(admin, { requestId: 'locked-stocktake', sourceType: 'prototype-outbound', sourceId: 'source-outbound-1', operatorId: admin.actorId, occurredAt: '2026-08-10T08:00:00+08:00', warehouseId: row.warehouse.id, skuId: row.skuId, quantityMilli: 1000 })).toThrow(/盘点锁定/)
    session.service.saveStocktakeCounts(admin, { ...stocktake, lines: stocktake.lines.map((line) => ({ ...line, countedQuantityMilli: line.bookQuantityMilli })) }); const done = session.service.listStocktakes(admin).items[0]!; session.service.approveStocktake(admin, done)
    const adjustment = session.service.createCostAdjustment(admin, { warehouseId: row.warehouse.id, skuId: row.skuId, nextCostPerBaseUnitCents: (row.costPerBaseUnitCents ?? 0) + 1, reason: 'market', effectiveAt: '2026-08-10T09:00:00+08:00' }); expect(session.service.approveCostAdjustment(admin, adjustment).status).toBe('effective')
  })

  it('rejects future cost effectiveness and non-admin closing', () => {
    const session = createInventoryMockSession(); const row = session.service.getWorkspace(admin).stocks.items.find((item) => item.currentMilli > 0)!; expect(() => session.service.createCostAdjustment(admin, { warehouseId: row.warehouse.id, skuId: row.skuId, nextCostPerBaseUnitCents: 999, reason: 'other', reasonNote: '测试', effectiveAt: '2026-08-11T10:00:00+08:00' })).toThrow(/预约/); expect(() => session.service.closeMonth(warehouse, '2026-07', 'close-1')).toThrow(/管理员/)
  })

  it('does not let a scoped lock block a different SKU and releases its own lock after a delta', () => {
    const session = createInventoryMockSession(); const rows = session.service.getWorkspace(admin).stocks.items.filter((item) => item.currentMilli > 0)
    const first = rows[0]!; const other = rows.find((item) => item.warehouse.id === first.warehouse.id && item.skuId !== first.skuId)!
    let stocktake = session.service.createStocktake(admin, { warehouseId: first.warehouse.id, type: 'sample', scopeKind: 'skus', scopeSkuIds: [first.skuId], operatorId: admin.actorId, occurredAt: '2026-08-10T08:00:00+08:00' })
    stocktake = session.service.startStocktake(admin, stocktake)
    const otherSku = other.sku!; const otherLocation = session.service.getWorkspace(admin).locations.find((item) => item.warehouseId === other.warehouse.id && item.status === 'enabled')!
    expect(() => session.service.confirmInbound(admin, { requestId: 'different-sku-inbound', sourceType: 'prototype-inbound', sourceId: 'source-inbound-1', operatorId: admin.actorId, occurredAt: '2026-08-10T08:00:00+08:00', warehouseId: other.warehouse.id, locationId: otherLocation.id, skuId: other.skuId, quantityMilli: 1, costPerBaseUnitCents: 100, ...(otherSku.manageProductionDate || otherSku.shelfLifeDays !== null ? { batchNumber: 'LOCK-TEST', productionDate: '2026-08-01' } : {}) })).not.toThrow(/盘点锁定/)
    const line = stocktake.lines[0]!; session.service.saveStocktakeCounts(admin, { ...stocktake, lines: [{ ...line, countedQuantityMilli: Math.max(0, line.bookQuantityMilli - 1) }] })
    const pending = session.service.listStocktakes(admin).items[0]!; const completed = session.service.approveStocktake(admin, pending)
    expect(completed.status).toBe('completed'); expect(session.repository.read().inventoryLocks).toHaveLength(0)
    expect(() => session.service.confirmOutbound(admin, { requestId: 'same-sku-after-stocktake', sourceType: 'prototype-outbound', sourceId: 'source-outbound-1', operatorId: admin.actorId, occurredAt: '2026-08-10T08:00:00+08:00', warehouseId: first.warehouse.id, skuId: first.skuId, quantityMilli: 1 })).not.toThrow()
  })

  it('rolls back all stocktake lines when a later adjustment cannot be applied', () => {
    const session = createInventoryMockSession(); const rows = session.service.getWorkspace(admin).stocks.items.filter((item) => item.warehouse.id === 'warehouse-main'); const first = rows[0]!; const second = rows.find((item) => item.skuId !== first.skuId)!; let stocktake = session.service.createStocktake(admin, { warehouseId: first.warehouse.id, type: 'sample', scopeKind: 'skus', scopeSkuIds: [first.skuId, second.skuId], operatorId: admin.actorId, occurredAt: '2026-08-10T08:00:00+08:00' }); stocktake = session.service.startStocktake(admin, stocktake)
    const before = session.repository.read(); session.service.saveStocktakeCounts(admin, { ...stocktake, lines: stocktake.lines.map((line) => ({ ...line, countedQuantityMilli: line.bookQuantityMilli + 1 })) })
    session.repository.transact((state) => { state.stocktakes![0]!.lines[1]!.costPerBaseUnitCents = null })
    const pending = session.service.listStocktakes(admin).items[0]!; expect(() => session.service.approveStocktake(admin, pending)).toThrow(/缺少成本/)
    const after = session.repository.read(); expect(after.movements).toHaveLength(before.movements.length); expect(after.stocktakes?.[0]?.status).toBe('pending-review'); expect(after.inventoryLocks).toHaveLength(2)
  })

  it('updates the warehouse SKU moving average on a confirmed inbound', () => {
    const session = createInventoryMockSession(); const row = session.service.getWorkspace(admin).stocks.items.find((item) => item.currentMilli > 0)!; const location = session.service.getWorkspace(admin).locations.find((item) => item.warehouseId === row.warehouse.id && item.status === 'enabled')!
    const state = session.repository.read(); const quantity = state.balances.filter((item) => item.warehouseId === row.warehouse.id && item.skuId === row.skuId).reduce((sum, item) => sum + item.quantityMilli, 0); const previous = row.costPerBaseUnitCents!
    session.service.confirmInbound(admin, { requestId: 'moving-average-inbound', sourceType: 'prototype-inbound', sourceId: 'source-inbound-1', operatorId: admin.actorId, occurredAt: '2026-08-10T08:00:00+08:00', warehouseId: row.warehouse.id, locationId: location.id, skuId: row.skuId, quantityMilli: 1000, costPerBaseUnitCents: previous + 100, ...(row.sku?.manageProductionDate || row.sku?.shelfLifeDays !== null ? { batchNumber: 'AVG-TEST', productionDate: '2026-08-01' } : {}) })
    const average = session.repository.read().averageCosts?.find((item) => item.warehouseId === row.warehouse.id && item.skuId === row.skuId)!; expect(average.costPerBaseUnitCents).toBe(Math.round((quantity * previous + 1000 * (previous + 100)) / (quantity + 1000)))
  })

  it('requires the earliest fact month and consecutive close requests', () => {
    const session = createInventoryMockSession(); expect(() => session.service.closeMonth(admin, '2026-01', 'close-gap')).toThrow(/最早库存事实|连续/)
    const first = session.service.closeMonth(admin, '2025-12', 'close-2025-12'); expect(first.items.some((item) => item.month === '2025-12')).toBe(true)
    expect(() => session.service.closeMonth(admin, '2025-12', 'different-request')).toThrow(/requestId/)
    expect(session.service.closeMonth(admin, '2025-12', 'close-2025-12').items.some((item) => item.month === '2025-12')).toBe(true)
    expect(() => session.service.createCostAdjustment(admin, { warehouseId: 'warehouse-main', skuId: 'sku-1', nextCostPerBaseUnitCents: 999, reason: 'market', effectiveAt: '2025-12-31T10:00:00+08:00' })).toThrow(/已结转/)
  })

  it('accepts a real zero count without trusting client-owned snapshot fields', () => {
    const session = createInventoryMockSession(); const row = session.service.getWorkspace(admin).stocks.items.find((item) => item.currentMilli > 0)!
    let stocktake = session.service.createStocktake(admin, { warehouseId: row.warehouse.id, type: 'sample', scopeKind: 'skus', scopeSkuIds: [row.skuId], operatorId: admin.actorId, occurredAt: '2026-08-10T08:00:00+08:00' }); stocktake = session.service.startStocktake(admin, stocktake)
    const original = stocktake.lines[0]!
    const submitted = { ...stocktake, lines: [{ ...original, skuId: 'tampered-sku', bookQuantityMilli: 0, countedQuantityMilli: 0, costPerBaseUnitCents: null }] }
    const saved = session.service.saveStocktakeCounts(admin, submitted)
    expect(saved.lines[0]).toMatchObject({ skuId: original.skuId, bookQuantityMilli: original.bookQuantityMilli, countedQuantityMilli: 0, deltaQuantityMilli: -original.bookQuantityMilli, costPerBaseUnitCents: original.costPerBaseUnitCents })
  })

  it('includes customer return inbound in the moving average without rewriting batch history', () => {
    const session = createInventoryMockSession(); const state = session.repository.read(); const balance = state.balances.find((item) => item.quantityMilli > 0)!; const batch = state.batches.find((item) => item.id === balance.batchId)!; const previousQuantity = state.balances.filter((item) => item.warehouseId === balance.warehouseId && item.skuId === balance.skuId).reduce((sum, item) => sum + item.quantityMilli, 0); const previousCost = session.service.getWorkspace(admin).stocks.items.find((item) => item.warehouse.id === balance.warehouseId && item.skuId === balance.skuId)!.costPerBaseUnitCents!; const batchesBefore = structuredClone(state.batches); const movementsBefore = structuredClone(state.movements)
    session.service.confirmReturnInbound(admin, { requestId: 'return-average', sourceType: 'customer-return', sourceId: 'return-average', operatorId: admin.actorId, occurredAt: '2026-08-10T08:30:00+08:00', warehouseId: balance.warehouseId, locationId: balance.locationId, lines: [{ referenceId: 'line-1', skuId: balance.skuId, quantityMilli: 1000, costPerBaseUnitCents: batch.costPerBaseUnitCents, batchNumber: batch.batchNumber, productionDate: batch.productionDate, expiresOn: batch.expiresOn }] })
    const after = session.repository.read(); const average = after.averageCosts!.find((item) => item.warehouseId === balance.warehouseId && item.skuId === balance.skuId)!
    expect(average.costPerBaseUnitCents).toBe(Math.round((previousQuantity * previousCost + 1000 * batch.costPerBaseUnitCents) / (previousQuantity + 1000)))
    expect(after.batches).toEqual(batchesBefore); expect(after.movements.slice(0, movementsBefore.length)).toEqual(movementsBefore)
  })

  it('replays a historical month end instead of copying the current balance', () => {
    const session = createInventoryMockSession(); const result = session.service.closeMonth(admin, '2025-12', 'close-history-dec'); const closing = result.items.find((item) => item.month === '2025-12')!
    expect(closing.snapshots.find((item) => item.warehouseId === 'warehouse-main' && item.skuId === 'sku-2')).toMatchObject({ quantityMilli: 2000, averageCostPerBaseUnitCents: 250, valueCents: 500, sourceVersion: expect.stringContaining('movement:') })
    expect(closing.snapshots.some((item) => item.skuId === 'sku-1')).toBe(false)
    expect(session.repository.read().openingBalances.find((item) => item.month === '2026-01' && item.skuId === 'sku-2')?.quantityMilli).toBe(2000)
    const january = session.service.closeMonth(admin, '2026-01', 'close-history-jan').items.find((item) => item.month === '2026-01')!
    expect(january.snapshots.find((item) => item.skuId === 'sku-2')?.quantityMilli).toBe(2000)
    expect(() => session.service.closeMonth(admin, '2026-08', 'close-current')).toThrow(/已结束月份/)
  })

  it('rechecks closed-month and positive-stock rules when approving a cost adjustment', () => {
    const session = createInventoryMockSession(); const row = session.service.getWorkspace(admin).stocks.items.find((item) => item.currentMilli > 0)!; const adjustment = session.service.createCostAdjustment(admin, { warehouseId: row.warehouse.id, skuId: row.skuId, nextCostPerBaseUnitCents: row.costPerBaseUnitCents! + 1, reason: 'market', effectiveAt: '2026-08-10T08:00:00+08:00' })
    session.repository.transact((state) => { state.operationLocks = { inventoryLocked: false, monthClosedThrough: '2026-08' } })
    expect(() => session.service.approveCostAdjustment(admin, adjustment)).toThrow(/已结转/)
    expect(session.repository.read().costHistories).toHaveLength(0)
  })

  it('enforces the INV-003 read, mask, export and closing role matrix', () => {
    const session = createInventoryMockSession(); const row = session.service.getWorkspace(admin).stocks.items.find((item) => item.currentMilli > 0)!; let stocktake = session.service.createStocktake(admin, { warehouseId: row.warehouse.id, type: 'sample', scopeKind: 'skus', scopeSkuIds: [row.skuId], operatorId: admin.actorId, occurredAt: '2026-08-10T08:00:00+08:00' }); stocktake = session.service.startStocktake(admin, stocktake)
    expect(session.service.listStocktakes(supervisor).items[0]!.lines[0]!.costPerBaseUnitCents).toBeNull()
    expect(() => session.service.exportStocktakesCsv(supervisor)).toThrow(/权限|不可修改/)
    expect(() => session.service.listStocktakes(finance)).toThrow(/不可访问/)
    expect(() => session.service.closeMonth(warehouse, '2025-12', 'warehouse-close')).toThrow(/管理员/)
    expect(() => session.service.listClosings(warehouse, 2026)).not.toThrow()
  })
})
