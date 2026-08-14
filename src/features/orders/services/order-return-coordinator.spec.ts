import { describe, expect, it } from 'vitest'
import { createOrderMockSession } from '../../../../mock/handlers/order-handler'
import { OrderDomainError } from './order-service'

const admin = { role: 'super-admin' as const, actorId: 'admin-demo' }
const supervisor = { role: 'sales-supervisor' as const, actorId: 'sales-supervisor-demo' }
const warehouse = { role: 'warehouse' as const, actorId: 'warehouse-demo' }
const finance = { role: 'finance' as const, actorId: 'finance-demo' }

function approvedReturn(session: ReturnType<typeof createOrderMockSession>) {
  const line = session.returns.getReturnableLines(admin, 'order-006')[0]!
  let value = session.returns.saveReturn(admin, { requestId: 'coord-create', draft: { orderId: 'order-006', warehouseId: 'warehouse-main', returnType: 'partial', refundPreference: 'original', reason: '演示退货：客户拒收', remark: null, priceAdjustmentReason: null, lines: [{ orderLineId: line.line.id, returnQuantityMilli: line.returnableQuantityMilli }] } })
  value = session.returns.reviewReturn(supervisor, { requestId: 'coord-review', returnId: value.id, expectedVersion: value.version, action: 'approve' })
  return value
}

describe('ORD-005 inventory/finance coordinator', () => {
  it('atomically receives the exact original batch/cost and creates credit plus pending refund', () => {
    const session = createOrderMockSession('normal'); const value = approvedReturn(session); const location = session.inventoryRepository.read().locations.find((item) => item.warehouseId === value.warehouseSnapshot.id && item.status === 'enabled')!
    const beforeQuantity = session.inventoryRepository.read().balances.reduce((sum, item) => sum + item.quantityMilli, 0)
    const received = session.returnCoordinator.confirmInbound(warehouse, { requestId: 'coord-inbound', returnId: value.id, expectedVersion: value.version, locationId: location.id })
    expect(received.receivingStatus).toBe('received'); expect(received.refundStatus).toBe('pending'); expect(received.inboundProjection?.movementIds.length).toBeGreaterThan(0)
    expect(session.inventoryRepository.read().balances.reduce((sum, item) => sum + item.quantityMilli, 0) - beforeQuantity).toBe(received.items.reduce((sum, item) => sum + item.returnQuantityMilli, 0))
    const result = session.financeRefunds.getSourceResult('customer-return', received.id)!; expect(result.credit.amountCents).toBe(received.returnAmountCents); expect(result.refunds[0]?.status).toBe('pending')
  })

  it('rolls back every repository when the inbound location is invalid', () => {
    const session = createOrderMockSession('normal'); const value = approvedReturn(session); const beforeOrder = session.repository.read(); const beforeInventory = session.inventoryRepository.read(); const beforeFinance = session.financeRepository.read()
    expect(() => session.returnCoordinator.confirmInbound(warehouse, { requestId: 'coord-invalid', returnId: value.id, expectedVersion: value.version, locationId: 'missing-location' })).toThrow()
    expect(session.repository.read()).toEqual(beforeOrder); expect(session.inventoryRepository.read()).toEqual(beforeInventory); expect(session.financeRepository.read()).toEqual(beforeFinance)
  })

  it('voids inbound and reverses the pending credit before payment, preserving immutable history', () => {
    const session = createOrderMockSession('normal'); let value = approvedReturn(session); const location = session.inventoryRepository.read().locations.find((item) => item.warehouseId === value.warehouseSnapshot.id && item.status === 'enabled')!
    value = session.returnCoordinator.confirmInbound(warehouse, { requestId: 'coord-inbound-void', returnId: value.id, expectedVersion: value.version, locationId: location.id })
    const voided = session.returnCoordinator.voidInbound(warehouse, { requestId: 'coord-void', returnId: value.id, expectedVersion: value.version, reason: '演示作废：退货库位选择错误' })
    expect(voided.receivingStatus).toBe('pending'); expect(voided.status).toBe('approved'); expect(voided.refundStatus).toBe('not-created')
    const result = session.financeRefunds.getSourceResult('customer-return', voided.id)!; expect(result.credit.status).toBe('reversed'); expect(result.refunds.every((item) => item.status === 'rejected')).toBe(true)
    expect(session.inventoryRepository.read().movements.filter((item) => item.sourceType === 'customer-return-void' && item.sourceId === voided.id).length).toBeGreaterThan(0)
  })

  it('completes only after finance confirms the full refund and then forbids inbound void', () => {
    const session = createOrderMockSession('normal'); let value = approvedReturn(session); const location = session.inventoryRepository.read().locations.find((item) => item.warehouseId === value.warehouseSnapshot.id && item.status === 'enabled')!
    value = session.returnCoordinator.confirmInbound(warehouse, { requestId: 'coord-inbound-paid', returnId: value.id, expectedVersion: value.version, locationId: location.id }); const refund = session.financeRefunds.getSourceResult('customer-return', value.id)!.refunds[0]!
    session.financeRefunds.confirmRefund(finance, { requestId: 'coord-refund-paid', refundId: refund.id, expectedVersion: refund.version, method: 'original', occurredAt: '2026-08-10T10:00:00+08:00' })
    value = session.returnCoordinator.refreshRefundProjection(value.id); expect(value.refundStatus).toBe('refunded'); expect(value.status).toBe('completed')
    expect(() => session.returnCoordinator.voidInbound(warehouse, { requestId: 'coord-void-paid', returnId: value.id, expectedVersion: value.version, reason: '退款后不允许作废' })).toThrow(OrderDomainError)
  })
})
