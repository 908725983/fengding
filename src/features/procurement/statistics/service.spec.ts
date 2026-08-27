import { describe, expect, it } from 'vitest'
import { createProcurementMockSession } from '../../../../mock/handlers/procurement-handler'
import type { ProcurementActor, PurchaseOrderDraft, PurchaseReturnDraft } from '../types'
import { createPurchaseStatisticsService } from './service'

const admin: ProcurementActor = { role: 'super-admin', actorId: 'admin-demo' }
const warehouse: ProcurementActor = { role: 'warehouse', actorId: 'warehouse-demo' }
const supervisor: ProcurementActor = { role: 'sales-supervisor', actorId: 'supervisor-demo' }
const finance: ProcurementActor = { role: 'finance', actorId: 'finance-demo' }
const range = { fromDate: '2026-08-01', toDate: '2026-08-31' }

function orderDraft(session: ReturnType<typeof createProcurementMockSession>, quantity = 3): PurchaseOrderDraft {
  const supplier = session.service.listSuppliers(admin).items.find((item) => item.status === 'enabled' && item.deliveryMode !== 'direct')!
  const relation = session.service.listSupplierProducts(admin, { supplierId: supplier.id }).find((item) => item.status === 'enabled')!
  const target = session.inventory.getWorkspace(warehouse); const warehouseRow = target.warehouses.find((item) => item.status === 'enabled')!
  return { supplierId: supplier.id, warehouseId: warehouseRow.id, lines: [{ skuId: relation.skuId, supplierRelationId: relation.id, quantity, unitPriceCents: relation.supplyPriceCents }], productDiscountCents: 2, otherFeeCents: 1 }
}

function createOrder(session: ReturnType<typeof createProcurementMockSession>, quantity = 3) {
  let order = session.service.createPurchaseOrder(admin, { value: orderDraft(session, quantity), requestId: `statistics-order-${quantity}` })
  order = session.service.approvePurchaseOrder(admin, order.id, order.version, `statistics-approve-${quantity}`)
  return order
}

function receive(session: ReturnType<typeof createProcurementMockSession>, order: ReturnType<typeof createOrder>, quantity: number, requestId: string, occurredAt: string) {
  const location = session.inventory.getWorkspace(warehouse).locations.find((item) => item.warehouseId === order.warehouseId && item.status === 'enabled')!
  return session.service.receivePurchaseOrder(warehouse, { orderId: order.id, warehouseId: order.warehouseId, locationId: location.id, lines: [{ lineId: order.lines[0]!.id, quantity, batchNumber: requestId, productionDate: '2026-08-01' }], requestId, operatorId: warehouse.actorId, occurredAt })
}

describe('purchase statistics service', () => {
  it('includes pending-review and approved orders, excludes voided/cancelled, and preserves order allocation totals', () => {
    const session = createProcurementMockSession(); const approved = createOrder(session, 3)
    session.service.createPurchaseOrder(admin, { value: orderDraft(session, 1), requestId: 'statistics-pending' })
    const voided = session.service.createPurchaseOrder(admin, { value: orderDraft(session, 1), requestId: 'statistics-void' }); session.service.voidPurchaseOrder(admin, voided.id, voided.version, 'statistics-void-command')
    const page = session.statistics.query(admin, { report: 'purchase-order-line-detail', ...range, pageSize: 10 })
    expect(page.total).toBe(2); expect(page.items.map((item) => item.documentStatus).sort()).toEqual(['approved', 'pending-review'])
    expect(page.totals.amountCents).toBe(page.items.reduce((sum, item) => sum + item.amountCents!, 0))
    expect(page.items.find((item) => item.documentId === approved.id)?.pendingPackageQuantity).toBe(3)
  })

  it('uses immutable inbound and return movements with positive/negative signs and conserving totals', () => {
    const session = createProcurementMockSession(); let order = createOrder(session, 3)
    order = receive(session, order, 1, 'statistics-inbound-1', '2026-08-10T10:00:00+08:00'); order = receive(session, order, 2, 'statistics-inbound-2', '2026-08-10T10:01:00+08:00')
    const draft: PurchaseReturnDraft = { purchaseOrderId: order.id, returnDate: '2026-08-10', lines: [{ purchaseOrderLineId: order.lines[0]!.id, quantity: 1 }] }
    let purchaseReturn = session.service.createPurchaseReturn(admin, { value: draft, requestId: 'statistics-return' }); purchaseReturn = session.service.approvePurchaseReturn(admin, purchaseReturn.id, purchaseReturn.version, 'statistics-return-approve')
    purchaseReturn = session.service.shipPurchaseReturn(warehouse, { returnId: purchaseReturn.id, lines: [{ lineId: purchaseReturn.lines[0]!.id, quantity: 1 }], expectedVersion: purchaseReturn.version, requestId: 'statistics-return-ship', operatorId: warehouse.actorId, occurredAt: '2026-08-10T11:00:00+08:00' })
    const detail = session.statistics.query(admin, { report: 'purchase-movement-line-detail', ...range, pageSize: 10 })
    expect(detail.items.filter((item) => item.movementType === 'purchase-inbound')).toHaveLength(2)
    expect(detail.items.find((item) => item.movementType === 'purchase-return-outbound')?.baseQuantityMilli).toBeLessThan(0)
    expect(detail.totals.amountCents).toBe(detail.totals.netAmountCents)
    expect(detail.totals.purchaseOrderAmountCents! - detail.totals.purchaseReturnAmountCents!).toBe(detail.totals.netAmountCents)
    const summary = session.statistics.query(admin, { report: 'purchase-movement-by-supplier', ...range, pageSize: 10 })
    expect(summary.total).toBe(1); expect(summary.items[0]!.baseQuantityMilli).toBe(detail.totals.baseQuantityMilli)
  })

  it('keeps totals independent of pagination and exports the full filtered result', () => {
    const session = createProcurementMockSession(); createOrder(session, 2); session.service.createPurchaseOrder(admin, { value: orderDraft(session, 1), requestId: 'statistics-second-order' })
    const page = session.statistics.query(admin, { report: 'purchase-order-line-detail', ...range, page: 1, pageSize: 10 })
    const csv = session.statistics.exportCsv(admin, { report: 'purchase-order-line-detail', ...range, page: 99, pageSize: 10 })
    expect(page.total).toBe(2); expect(page.totals.documentCount).toBe(2); expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('marks legacy movement history unavailable instead of reconstructing it from cumulative quantities', () => {
    const session = createProcurementMockSession(); const order = createOrder(session, 1)
    session.repository.transact((draft) => { const target = draft.purchaseOrders!.find((item) => item.id === order.id)!; target.lines[0]!.receivedQuantity = 1; target.lines[0]!.receivedBaseQuantityMilli = target.lines[0]!.baseQuantityMilli; target.inboundStatus = 'received' })
    const service = createPurchaseStatisticsService({ repository: session.repository, now: () => '2026-08-10T10:00:00+08:00' })
    const page = service.query(admin, { report: 'purchase-movement-line-detail', ...range })
    expect(page.availability).toBe('unavailable'); expect(page.message).toContain('不能用累计状态伪造')
  })

  it('enforces view and export permissions', () => {
    const session = createProcurementMockSession(); createOrder(session, 1)
    expect(session.statistics.query(supervisor, { report: 'purchase-order-line-detail', ...range }).total).toBe(1)
    expect(() => session.statistics.exportCsv(supervisor, { report: 'purchase-order-line-detail', ...range })).toThrow(/不可导出/)
    expect(() => session.statistics.query(finance, { report: 'purchase-order-line-detail', ...range })).toThrow(/无权查看/)
  })
})
