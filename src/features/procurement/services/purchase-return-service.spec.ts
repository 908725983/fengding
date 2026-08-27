import { describe, expect, it, vi } from 'vitest'
import { createProcurementCatalogProvider, createProcurementMockSession } from '../../../../mock/handlers/procurement-handler'
import { createProcurementService } from './procurement-service'
import type { ProcurementActor, PurchaseOrderDraft, PurchaseReturnDraft } from '../types'

const admin: ProcurementActor = { role: 'super-admin', actorId: 'admin-demo' }
const warehouse: ProcurementActor = { role: 'warehouse', actorId: 'warehouse-demo' }
const supervisor: ProcurementActor = { role: 'sales-supervisor', actorId: 'supervisor-demo' }
const financeActor = { role: 'finance' as const, actorId: 'finance-integration' }

function orderDraft(session: ReturnType<typeof createProcurementMockSession>, quantity = 3): PurchaseOrderDraft {
  const supplier = session.service.listSuppliers(admin).items.find((item) => item.status === 'enabled' && item.deliveryMode !== 'direct')!
  const relation = session.service.listSupplierProducts(admin, { supplierId: supplier.id }).find((item) => item.status === 'enabled')!
  const warehouseRow = session.inventory.getWorkspace(warehouse).warehouses.find((item) => item.status === 'enabled')!
  return { supplierId: supplier.id, warehouseId: warehouseRow.id, lines: [{ skuId: relation.skuId, supplierRelationId: relation.id, quantity, unitPriceCents: relation.supplyPriceCents }], productDiscountCents: 2, otherFeeCents: 1, source: 'manual' }
}

function createReceivedOrder(session: ReturnType<typeof createProcurementMockSession>, quantity = 3, split = false) {
  let order = session.service.createPurchaseOrder(admin, { value: orderDraft(session, quantity), requestId: `return-order-${quantity}-${split}` })
  order = session.service.approvePurchaseOrder(admin, order.id, order.version, `return-order-approve-${quantity}-${split}`)
  const location = session.inventory.getWorkspace(warehouse).locations.find((item) => item.warehouseId === order.warehouseId && item.status === 'enabled')!
  const receive = (count: number, requestId: string, minute: string) => session.service.receivePurchaseOrder(warehouse, { orderId: order.id, warehouseId: order.warehouseId, locationId: location.id, lines: [{ lineId: order.lines[0]!.id, quantity: count, batchNumber: `RETURN-${requestId}`, productionDate: '2026-08-01' }], requestId, operatorId: warehouse.actorId, occurredAt: `2026-08-10T10:${minute}:00+08:00` })
  if (split) { order = receive(1, 'return-inbound-1', '00'); order = receive(quantity - 1, 'return-inbound-2', '01') } else order = receive(quantity, `return-inbound-${quantity}`, '00')
  return order
}

function returnDraft(order: ReturnType<typeof createReceivedOrder>, quantity: number): PurchaseReturnDraft {
  return { purchaseOrderId: order.id, returnDate: '2026-08-10', lines: [{ purchaseOrderLineId: order.lines[0]!.id, quantity, note: '包装完好' }], note: '原型退采' }
}

describe('purchase return service', () => {
  it('creates immutable source snapshots, preserves amount tails and is idempotent', () => {
    const session = createProcurementMockSession(); const order = createReceivedOrder(session, 3)
    const value = returnDraft(order, 3); const first = session.service.createPurchaseReturn(admin, { value, requestId: 'purchase-return-create-1' }); const replay = session.service.createPurchaseReturn(admin, { value, requestId: 'purchase-return-create-1' })
    expect(first).toEqual(replay); expect(first.code).toMatch(/^CGTH-\d{6}-\d{5}$/); expect(first.purchaseOrderCodeSnapshot).toBe(order.code)
    expect(first.amountCents).toBe(order.orderAmountCents); expect(first.lines[0]!.allocatedDiscountCents).toBe(2); expect(first.lines[0]!.allocatedOtherFeeCents).toBe(1)
    expect(() => session.service.createPurchaseReturn(admin, { value: returnDraft(order, 1), requestId: 'purchase-return-over' })).toThrow(/不能超过/)
    expect(session.service.listPurchaseReturns(supervisor).total).toBe(1); expect(() => session.service.createPurchaseReturn(supervisor, { value, requestId: 'purchase-return-denied' })).toThrow(/无权/); expect(() => session.service.exportPurchaseReturnsCsv(supervisor)).toThrow(/无权/)
  })

  it('supports partial and complete FIFO outbound with finance credits', () => {
    const session = createProcurementMockSession(); const order = createReceivedOrder(session, 3, true)
    let value = session.service.createPurchaseReturn(admin, { value: returnDraft(order, 3), requestId: 'purchase-return-create-2' }); value = session.service.approvePurchaseReturn(admin, value.id, value.version, 'purchase-return-approve-2')
    value = session.service.shipPurchaseReturn(warehouse, { returnId: value.id, lines: [{ lineId: value.lines[0]!.id, quantity: 1 }], expectedVersion: value.version, requestId: 'purchase-return-ship-1', operatorId: warehouse.actorId, occurredAt: '2026-08-10T11:00:00+08:00' })
    expect(value.outboundStatus).toBe('partially-shipped'); expect(value.workflowStatus).toBe('approved'); expect(value.refundStatus).toBe('not-required'); expect(value.shipments[0]!.credits).toHaveLength(1)
    value = session.service.shipPurchaseReturn(warehouse, { returnId: value.id, lines: [{ lineId: value.lines[0]!.id, quantity: 2 }], expectedVersion: value.version, requestId: 'purchase-return-ship-2', operatorId: warehouse.actorId, occurredAt: '2026-08-10T11:01:00+08:00' })
    expect(value.outboundStatus).toBe('shipped'); expect(value.workflowStatus).toBe('completed'); expect(value.shipments.flatMap((item) => item.credits).map((item) => item.payableId)).toHaveLength(2)
    expect(value.shipments.reduce((sum, item) => sum + item.amountCents, 0)).toBe(value.amountCents)
    const replay = session.service.shipPurchaseReturn(warehouse, { returnId: value.id, lines: [{ lineId: value.lines[0]!.id, quantity: 2 }], expectedVersion: 1, requestId: 'purchase-return-ship-2', operatorId: warehouse.actorId, occurredAt: '2026-08-10T11:01:00+08:00' })
    expect(replay.version).toBe(value.version)
  })

  it('projects a supplier refund obligation when the payable was already settled', () => {
    const session = createProcurementMockSession(); const order = createReceivedOrder(session, 1); const payable = session.finance.listSupplierPayables(financeActor).find((item) => item.purchaseOrderId === order.id)!; const account = session.finance.listAccounts(financeActor).find((item) => item.account.status === 'enabled' && (item.account.type === 'cash' || item.account.type === 'bank'))!.account
    session.finance.createSupplierPayment(financeActor, { requestId: 'settle-payable-before-return', supplierSnapshot: payable.supplierSnapshot, occurredAt: '2026-08-10T10:30:00+08:00', amountCents: payable.amountCents, method: account.type === 'cash' ? 'cash' : 'bank', accountId: account.id, immediateAllocations: [{ payableId: payable.id, amountCents: payable.amountCents }] })
    let value = session.service.createPurchaseReturn(admin, { value: returnDraft(order, 1), requestId: 'purchase-return-refund-create' }); value = session.service.approvePurchaseReturn(admin, value.id, value.version, 'purchase-return-refund-approve'); value = session.service.shipPurchaseReturn(warehouse, { returnId: value.id, lines: [{ lineId: value.lines[0]!.id, quantity: 1 }], expectedVersion: value.version, requestId: 'purchase-return-refund-ship', operatorId: warehouse.actorId, occurredAt: '2026-08-10T11:00:00+08:00' })
    expect(value.refundStatus).toBe('pending'); expect(value.shipments[0]!.credits[0]!.refundObligationCents).toBe(value.amountCents)
  })

  it('enforces version and void boundaries', () => {
    const session = createProcurementMockSession(); const order = createReceivedOrder(session, 2); let value = session.service.createPurchaseReturn(admin, { value: returnDraft(order, 1), requestId: 'purchase-return-void-create' })
    expect(() => session.service.approvePurchaseReturn(admin, value.id, 99, 'purchase-return-stale')).toThrow(/修改/)
    value = session.service.approvePurchaseReturn(admin, value.id, value.version, 'purchase-return-void-approve'); value = session.service.voidPurchaseReturn(admin, value.id, value.version, '来源单选择错误', 'purchase-return-void')
    expect(value.workflowStatus).toBe('voided'); expect(value.voidInfo?.reason).toBe('来源单选择错误'); expect(session.service.listPurchaseReturnSources(admin)[0]!.lines[0]!.returnableQuantity).toBe(order.lines[0]!.receivedQuantity)
  })

  it('restores procurement, inventory and finance snapshots when credit creation fails', () => {
    const session = createProcurementMockSession(); const order = createReceivedOrder(session, 1); let value = session.service.createPurchaseReturn(admin, { value: returnDraft(order, 1), requestId: 'purchase-return-rollback-create' }); value = session.service.approvePurchaseReturn(admin, value.id, value.version, 'purchase-return-rollback-approve')
    const failCredit = vi.fn(() => { throw new Error('原型模拟：贷项写入失败') }); let sequence = 1
    const service = createProcurementService({ repository: session.repository, catalog: createProcurementCatalogProvider(), inventory: { confirmInbound: (actor, input) => session.inventory.confirmInbound(actor, input), confirmOutboundBatch: (actor, input) => session.inventory.confirmOutboundBatch(actor, input), snapshot: () => session.inventoryRepository.read(), restore: (snapshot) => session.inventoryRepository.reset(snapshot as ReturnType<typeof session.inventoryRepository.read>) }, finance: { checkpoint: () => session.financeRepository.read(), restore: (snapshot) => session.financeRepository.reset(snapshot as ReturnType<typeof session.financeRepository.read>), createPayableFromInbound: (input) => session.finance.createSupplierPayable(financeActor, input), listPayablesForPurchaseOrder: (purchaseOrderId) => session.finance.listSupplierPayables(financeActor).filter((item) => item.purchaseOrderId === purchaseOrderId).map((item) => ({ id: item.id, inboundId: item.inboundId, occurredAt: item.occurredAt, supplierId: item.supplierSnapshot.id, items: item.items })), createPayableCredit: failCredit }, now: () => '2026-08-10T23:59:59+08:00', nextId: (kind) => `${kind}-rollback-${sequence++}` })
    const beforePurchase = session.repository.read(); const beforeInventory = session.inventoryRepository.read(); const beforeFinance = session.financeRepository.read()
    expect(() => service.shipPurchaseReturn(warehouse, { returnId: value.id, lines: [{ lineId: value.lines[0]!.id, quantity: 1 }], expectedVersion: value.version, requestId: 'purchase-return-rollback-ship', operatorId: warehouse.actorId, occurredAt: '2026-08-10T11:00:00+08:00' })).toThrow('原型模拟：贷项写入失败')
    expect(failCredit).toHaveBeenCalledOnce(); expect(session.repository.read()).toEqual(beforePurchase); expect(session.inventoryRepository.read()).toEqual(beforeInventory); expect(session.financeRepository.read()).toEqual(beforeFinance)
  })
})
