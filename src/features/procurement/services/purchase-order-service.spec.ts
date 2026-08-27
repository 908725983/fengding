import { describe, expect, it, vi } from 'vitest'
import { createInventoryMockSession } from '../../../../mock/handlers/inventory-handler'
import { createBaselineProcurementRepository, createProcurementCatalogProvider, createProcurementMockSession } from '../../../../mock/handlers/procurement-handler'
import { createProcurementService } from './procurement-service'
import type { ProcurementActor, PurchaseOrderDraft } from '../types'

const admin: ProcurementActor = { role: 'super-admin', actorId: 'admin-demo' }
const warehouse: ProcurementActor = { role: 'warehouse', actorId: 'warehouse-demo' }
const supervisor: ProcurementActor = { role: 'sales-supervisor', actorId: 'supervisor-demo' }

function draft(session: ReturnType<typeof createProcurementMockSession>): PurchaseOrderDraft {
  const supplier = session.service.listSuppliers(admin).items.find((item) => item.status === 'enabled' && item.deliveryMode !== 'direct')!
  const sku = session.service.getWorkspace(admin).skus.find((item) => item.productStatus === 'on-sale')!
  const relation = session.service.listSupplierProducts(admin, { supplierId: supplier.id }).find((item) => item.skuId === sku.skuId && item.status === 'enabled')!
  const inventory = session.inventory.getWorkspace(warehouse).warehouses.find((item) => item.status === 'enabled')!
  return { supplierId: supplier.id, warehouseId: inventory!.id, lines: [{ skuId: sku.skuId, supplierRelationId: relation.id, quantity: 2, unitPriceCents: relation.supplyPriceCents }], source: 'manual' }
}

describe('purchase order service', () => {
  it('creates a snapshotted order, uses the PO daily sequence, and is idempotent', () => {
    const session = createProcurementMockSession()
    const first = session.service.createPurchaseOrder(admin, { value: draft(session), requestId: 'po-create-1' })
    const replay = session.service.createPurchaseOrder(admin, { value: draft(session), requestId: 'po-create-1' })
    expect(first).toEqual(replay)
    expect(first.code).toMatch(/^PO\d{12}$/)
    expect(first.paymentStatus).toBe('unavailable')
    expect(first.lines[0]!.baseQuantityMilli).toBeGreaterThan(0)
    expect(session.service.listPurchaseOrders(admin).total).toBe(1)
  })

  it('always snapshots the current supplier relation price instead of trusting the draft price', () => {
    const session = createProcurementMockSession()
    const value = draft(session)
    const relation = session.service.listSupplierProducts(admin, { supplierId: value.supplierId }).find((item) => item.id === value.lines[0]!.supplierRelationId)!
    value.lines[0]!.unitPriceCents = 1

    const order = session.service.createPurchaseOrder(admin, { value, requestId: 'po-price-from-supply' })

    expect(order.lines[0]!.unitPriceCents).toBe(relation.supplyPriceCents)
    expect(order.lines[0]!.amountCents).toBe(order.lines[0]!.quantity * relation.supplyPriceCents)
  })

  it('enforces parallel workflow/inbound states and permissions', () => {
    const session = createProcurementMockSession(); const order = session.service.createPurchaseOrder(admin, { value: draft(session), requestId: 'po-state-1' })
    expect(session.service.approvePurchaseOrder(admin, order.id, order.version, 'po-approve-1').workflowStatus).toBe('approved')
    expect(() => session.service.cancelPurchaseOrder(admin, order.id, 1, 'po-cancel-stale')).toThrow(/版本|修改/)
    expect(() => session.service.approvePurchaseOrder(supervisor, order.id, 2, 'po-denied')).toThrow(/无权/)
  })

  it('rejects direct-only suppliers from warehouse purchase orders', () => {
    const session = createProcurementMockSession(); const value = draft(session); const direct = session.service.listSuppliers(admin).items.find((item) => item.deliveryMode === 'direct')!; value.supplierId = direct.id
    expect(() => session.service.createPurchaseOrder(admin, { value, requestId: 'po-direct-denied' })).toThrow(/入仓采购/)
  })

  it('partially receives into inventory, rejects over-receipt, then completes', () => {
    const session = createProcurementMockSession(); let order = session.service.createPurchaseOrder(admin, { value: draft(session), requestId: 'po-inbound-create' }); order = session.service.approvePurchaseOrder(admin, order.id, order.version, 'po-inbound-approve')
    const warehouseState = session.inventory.getWorkspace(warehouse); const location = warehouseState.locations.find((item) => item.warehouseId === order.warehouseId && item.status === 'enabled')!
    const line = order.lines[0]!
    const batch = { batchNumber: 'PO-DEMO-001', productionDate: '2026-08-01' }
    order = session.service.receivePurchaseOrder(warehouse, { orderId: order.id, warehouseId: order.warehouseId, locationId: location.id, lines: [{ lineId: line.id, quantity: 1, ...batch }], requestId: 'po-inbound-1', operatorId: warehouse.actorId, occurredAt: '2026-08-10T10:00:00+08:00' })
    expect(order.inboundStatus).toBe('partially-received')
    expect(() => session.service.receivePurchaseOrder(warehouse, { orderId: order.id, warehouseId: order.warehouseId, locationId: location.id, lines: [{ lineId: line.id, quantity: 2 }], requestId: 'po-inbound-over', operatorId: warehouse.actorId, occurredAt: '2026-08-10T10:00:00+08:00' })).toThrow(/超过/)
    order = session.service.receivePurchaseOrder(warehouse, { orderId: order.id, warehouseId: order.warehouseId, locationId: location.id, lines: [{ lineId: line.id, quantity: 1, ...batch }], requestId: 'po-inbound-2', operatorId: warehouse.actorId, occurredAt: '2026-08-10T10:00:00+08:00' })
    expect(order.inboundStatus).toBe('received')
    expect(session.inventory.listMovements(warehouse).some((item) => item.sourceId === order.id)).toBe(true)
    const payables = session.finance.listSupplierPayables({ actorId: 'finance-demo', role: 'finance' }).filter((item) => item.purchaseOrderId === order.id)
    expect(payables).toHaveLength(2); expect(payables.every((item) => item.source === 'purchase-inbound')).toBe(true)
    const replay = session.service.receivePurchaseOrder(warehouse, { orderId: order.id, warehouseId: order.warehouseId, locationId: location.id, lines: [{ lineId: line.id, quantity: 1, ...batch }], requestId: 'po-inbound-2', operatorId: warehouse.actorId, occurredAt: '2026-08-10T10:00:00+08:00' })
    expect(replay.version).toBe(order.version)
  })

  it('assigns discount and fee rounding tails to the final inbound while preserving the order total', () => {
    const session = createProcurementMockSession(); const value = draft(session); value.lines[0]!.quantity = 3; value.productDiscountCents = 2; value.otherFeeCents = 1
    let order = session.service.createPurchaseOrder(admin, { value, requestId: 'po-tail-create' }); order = session.service.approvePurchaseOrder(admin, order.id, order.version, 'po-tail-approve')
    const location = session.inventory.getWorkspace(warehouse).locations.find((item) => item.warehouseId === order.warehouseId && item.status === 'enabled')!; const line = order.lines[0]!
    order = session.service.receivePurchaseOrder(warehouse, { orderId: order.id, warehouseId: order.warehouseId, locationId: location.id, lines: [{ lineId: line.id, quantity: 1, batchNumber: 'PO-TAIL-001', productionDate: '2026-08-01' }], requestId: 'po-tail-inbound-1', operatorId: warehouse.actorId, occurredAt: '2026-08-10T10:00:00+08:00' })
    order = session.service.receivePurchaseOrder(warehouse, { orderId: order.id, warehouseId: order.warehouseId, locationId: location.id, lines: [{ lineId: line.id, quantity: 2, batchNumber: 'PO-TAIL-002', productionDate: '2026-08-01' }], requestId: 'po-tail-inbound-2', operatorId: warehouse.actorId, occurredAt: '2026-08-10T10:01:00+08:00' })
    const payables = session.finance.listSupplierPayables({ actorId: 'finance-demo', role: 'finance' }).filter((item) => item.purchaseOrderId === order.id).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    expect(payables.map((item) => [item.discountCents, item.otherFeeCents])).toEqual([[0, 0], [2, 1]])
    expect(payables.reduce((sum, item) => sum + item.amountCents, 0)).toBe(order.orderAmountCents)
  })

  it('rolls inventory, finance and purchase state back when payable creation fails', () => {
    const sourceSession = createProcurementMockSession(); const value = draft(sourceSession); const repository = createBaselineProcurementRepository(); const inventory = createInventoryMockSession(); let sequence = 1; let financeState = { writes: [] as unknown[] }
    const restoreFinance = vi.fn((snapshot: unknown) => { financeState = structuredClone(snapshot) as typeof financeState })
    const service = createProcurementService({ repository, catalog: createProcurementCatalogProvider(), inventory: { confirmInbound: (actor, input) => inventory.service.confirmInbound(actor, input), snapshot: () => inventory.repository.read(), restore: (snapshot) => inventory.repository.reset(snapshot as ReturnType<typeof inventory.repository.read>) }, finance: { checkpoint: () => structuredClone(financeState), restore: restoreFinance, createPayableFromInbound: (input) => { financeState.writes.push(structuredClone(input)); throw new Error('原型模拟：应付写入失败') } }, now: () => '2026-08-10T12:00:00+08:00', nextId: (kind) => `${kind}-rollback-${sequence++}` })
    let order = service.createPurchaseOrder(admin, { value, requestId: 'po-rollback-create' }); order = service.approvePurchaseOrder(admin, order.id, order.version, 'po-rollback-approve')
    const location = inventory.service.getWorkspace(warehouse).locations.find((item) => item.warehouseId === order.warehouseId && item.status === 'enabled')!; const beforePurchase = repository.read(); const beforeInventory = inventory.repository.read()
    expect(() => service.receivePurchaseOrder(warehouse, { orderId: order.id, warehouseId: order.warehouseId, locationId: location.id, lines: [{ lineId: order.lines[0]!.id, quantity: 1, batchNumber: 'PO-ROLLBACK-001', productionDate: '2026-08-01' }], requestId: 'po-rollback-inbound', operatorId: warehouse.actorId, occurredAt: '2026-08-10T10:00:00+08:00' })).toThrow('原型模拟：应付写入失败')
    expect(repository.read()).toEqual(beforePurchase); expect(inventory.repository.read()).toEqual(beforeInventory); expect(financeState.writes).toHaveLength(0); expect(restoreFinance).toHaveBeenCalledOnce()
  })
})
