import { describe, expect, it } from 'vitest'
import { createOrderMockSession } from '../../../../mock/handlers/order-handler'
import { InMemoryStatisticsPreferenceRepository } from './preference-repository'
import { createOrderStatisticsService, getOrderStatisticsAccess } from './service'
import { OrderDomainError } from '../services/order-service'

const admin = { role: 'super-admin' as const, actorId: 'admin-demo' }
const supervisor = { role: 'sales-supervisor' as const, actorId: 'sales-supervisor-demo' }
const salesperson = { role: 'salesperson' as const, actorId: 'staff-demo-1' }
const warehouse = { role: 'warehouse' as const, actorId: 'warehouse-demo' }
const finance = { role: 'finance' as const, actorId: 'finance-demo' }

function setup(scenario: Parameters<typeof createOrderMockSession>[0] = 'normal') {
  const session = createOrderMockSession(scenario, true)
  return { session, service: createOrderStatisticsService({ repository: session.repository, now: () => '2026-08-10T10:00:00+08:00' }) }
}

describe('ORD-006 statistics service', () => {
  it('builds order detail from saved snapshots and keeps full-filter totals outside pagination', () => {
    const { service } = setup()
    const page = service.query(admin, { report: 'order-line-detail', pageSize: 10 })
    expect(page.availability).toBe('available')
    expect(page.query.fromDate).toBe('2026-05-10')
    expect(page.query.toDate).toBe('2026-08-10')
    expect(page.items).toHaveLength(10)
    expect(page.total).toBeGreaterThan(page.items.length)
    expect(page.totals.documentCount).toBeGreaterThan(10)
    expect(page.items.every((row) => row.documentStatus !== 'canceled')).toBe(true)
    expect(page.items[0]!.product.name).toBe('演示基础商品')
    expect(page.items[0]!.product.barcodeState).toBe('unavailable')
  })

  it('allocates order discount to merchandise, excludes freight and preserves detail/summary totals', () => {
    const { service } = setup()
    const detail = service.query(admin, { report: 'order-line-detail', keyword: 'CA000000-260714-60005', pageSize: 30 })
    expect(detail.items).toHaveLength(1)
    expect(detail.items[0]!.originalAmountCents).toBe(3600)
    expect(detail.items[0]!.discountAmountCents).toBe(200)
    expect(detail.items[0]!.amountCents).toBe(3400)
    const allDetail = service.query(admin, { report: 'order-line-detail', pageSize: 100 })
    const summary = service.query(admin, { report: 'order-by-product', documentKind: 'order', pageSize: 100 })
    expect(summary.totals.amountCents).toBe(allDetail.totals.amountCents)
    expect(summary.totals.baseQuantityMilli).toBe(allDetail.totals.baseQuantityMilli)
  })

  it('reports pending outbound and return inbound only from current effective facts', () => {
    const { service } = setup()
    const order = service.query(admin, { report: 'order-line-detail', keyword: 'CA000000-260713-60004', pageSize: 30 }).items[0]!
    expect(order.pendingDisplayQuantityMilli).toBe(1000)
    expect(order.fulfillmentRateBasisPoints).toBe(5000)
    const returns = service.query(admin, { report: 'return-line-detail', pageSize: 100 })
    expect(returns.total).toBe(5)
    expect(returns.items.every((row) => row.documentStatus !== 'cancelled')).toBe(true)
    expect(returns.items.some((row) => row.pendingDisplayQuantityMilli === 0)).toBe(true)
    expect(returns.items.some((row) => (row.pendingDisplayQuantityMilli ?? 0) > 0)).toBe(true)
  })

  it('uses positive confirmed outbound and negative effective return inbound while excluding voided outbound', () => {
    const { service } = setup()
    const movements = service.query(admin, { report: 'movement-line-detail', pageSize: 100 })
    expect(movements.items.some((row) => row.movementType === 'sales-outbound' && row.baseQuantityMilli > 0)).toBe(true)
    expect(movements.items.some((row) => row.movementType === 'customer-return-inbound' && row.baseQuantityMilli < 0)).toBe(true)
    expect(movements.items.some((row) => row.documentNo?.includes('260819'))).toBe(false)
    expect(movements.items.every((row) => row.documentStatus !== 'voided')).toBe(true)
  })

  it('returns explicit unavailable pages for presale instead of empty or fabricated rows', () => {
    const { service } = setup()
    const page = service.query(admin, { report: 'presale-line-detail' })
    expect(page.availability).toBe('unavailable')
    expect(page.message).toContain('预售业务尚未接入')
    expect(page.items).toEqual([])
    expect(page.totals.amountState).toBe('unavailable')
  })

  it('enforces role data scope, warehouse amount masking and export permissions', () => {
    const { service } = setup()
    expect(() => service.query(warehouse, { report: 'order-line-detail' })).toThrowError(OrderDomainError)
    const warehouseRows = service.query(warehouse, { report: 'movement-line-detail', pageSize: 100 })
    expect(warehouseRows.items.every((row) => row.amountState === 'unavailable' && row.amountCents === null)).toBe(true)
    expect(warehouseRows.totals.amountCents).toBeNull()
    const ownRows = service.query(salesperson, { report: 'order-line-detail', pageSize: 100 })
    expect(ownRows.items.every((row) => row.salespersonId === salesperson.actorId)).toBe(true)
    expect(() => service.exportCsv(salesperson, { report: 'order-line-detail' })).toThrowError(OrderDomainError)
    expect(service.exportCsv(supervisor, { report: 'order-line-detail' })).toContain('documentNo')
    expect(service.exportCsv(finance, { report: 'movement-line-detail' })).toContain('\uFEFF')
  })

  it('keeps rows and totals on one snapshot version and changes it only after repository facts change', () => {
    const { session, service } = setup()
    const before = service.query(admin, { report: 'order-line-detail' })
    session.repository.transact((state) => { state.orders[0]!.updatedAt = '2026-08-10T10:01:00+08:00' })
    const after = service.query(admin, { report: 'order-line-detail' })
    expect(after.snapshotVersion).not.toBe(before.snapshotVersion)
    expect(after.items.length).toBeLessThanOrEqual(after.query.pageSize)
  })

  it('stores only governed pivot dimensions per user and supports reset', () => {
    const repository = new InMemoryStatisticsPreferenceRepository()
    repository.save('admin-demo', { report: 'order-by-product', dimensions: ['product', 'unit'], measures: ['quantity', 'amount'] })
    expect(repository.get('admin-demo', 'order-by-product')?.dimensions).toEqual(['product', 'unit'])
    expect(repository.get('other', 'order-by-product')).toBeNull()
    expect(() => repository.save('admin-demo', { report: 'order-by-product', dimensions: [], measures: ['amount'] })).toThrow()
    repository.reset('admin-demo', 'order-by-product')
    expect(repository.get('admin-demo', 'order-by-product')).toBeNull()
  })

  it('exposes the confirmed access matrix', () => {
    expect(getOrderStatisticsAccess(admin, 'order-line-detail')).toEqual({ canView: true, canExport: true, amountsVisible: true })
    expect(getOrderStatisticsAccess(warehouse, 'order-line-detail').canView).toBe(false)
    expect(getOrderStatisticsAccess(warehouse, 'movement-by-product')).toEqual({ canView: true, canExport: false, amountsVisible: false })
  })
})
