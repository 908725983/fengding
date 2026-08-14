import type { FinanceRepository } from '../../finance/repositories/finance-repository'
import type { createFinanceRefundService } from '../../finance/services/finance-refund-service'
import type { InventoryRepository } from '../../inventory/repositories/inventory-repository'
import type { createInventoryService } from '../../inventory/services/inventory-service'
import type { OrderRepository } from '../repositories/order-repository'
import { OrderDomainError } from './order-service'
import type { CustomerReturn, OrderActor, ReturnInboundProjection, ReturnRefundProjection } from '../types'

export interface OrderReturnCoordinatorDependencies {
  orderRepository: OrderRepository; inventoryRepository: InventoryRepository; financeRepository: FinanceRepository
  inventory: ReturnType<typeof createInventoryService>; financeRefunds: ReturnType<typeof createFinanceRefundService>
  now: () => string; nextId: (kind: 'return-activity') => string; actorName: (actor: OrderActor) => string
}
export interface ConfirmReturnInboundInput { requestId: string; returnId: string; expectedVersion: number; locationId: string }
export interface VoidReturnInboundInput { requestId: string; returnId: string; expectedVersion: number; reason: string }

const canReceive = (actor: OrderActor) => ['super-admin', 'warehouse'].includes(actor.role) && (!actor.permissions || actor.permissions.includes('orders.confirm-return-receipt'))
const canVoid = (actor: OrderActor) => ['super-admin', 'warehouse'].includes(actor.role) && (!actor.permissions || actor.permissions.includes('orders.void-return-receipt'))
const actorSnapshot = (deps: OrderReturnCoordinatorDependencies, actor: OrderActor) => ({ id: actor.actorId, name: deps.actorName(actor) })

export function createOrderReturnCoordinator(deps: OrderReturnCoordinatorDependencies) {
  function current(returnId: string): CustomerReturn { const value = deps.orderRepository.read().returns?.find((item) => item.id === returnId); if (!value) throw new OrderDomainError('NOT_FOUND', '退单不存在'); return value }
  function returnInboundLines(value: CustomerReturn) {
    const orderState = deps.orderRepository.read(); const inventoryState = deps.inventoryRepository.read()
    const outbounds = (orderState.outbounds ?? []).filter((item) => item.orderId === value.orderId && item.status === 'confirmed').sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt) || a.id.localeCompare(b.id))
    return value.items.flatMap((item) => {
      let skip = item.reservedReturnQuantityMilli; let remaining = item.returnQuantityMilli; const lines: Array<{ referenceId: string; skuId: string; quantityMilli: number; costPerBaseUnitCents: number; batchNumber: string; productionDate: string | null; expiresOn: string | null }> = []
      const allocations = outbounds.flatMap((outbound) => outbound.lines.filter((line) => line.orderLineId === item.orderLineId).flatMap((line) => line.allocations))
      for (const allocation of allocations) {
        if (skip >= allocation.quantityMilli) { skip -= allocation.quantityMilli; continue }
        const available = allocation.quantityMilli - skip; const quantityMilli = Math.min(remaining, available); skip = 0
        const movement = inventoryState.movements.find((entry) => entry.id === allocation.movementId && entry.direction === 'outbound'); const batch = inventoryState.batches.find((entry) => entry.id === allocation.batchId)
        if (!movement || !batch) throw new OrderDomainError('CONFLICT', '原出库批次或成本流水不可追溯')
        lines.push({ referenceId: `${item.id}:${allocation.movementId}:${lines.length}`, skuId: item.skuId, quantityMilli, costPerBaseUnitCents: movement.costPerBaseUnitCents, batchNumber: batch.batchNumber, productionDate: batch.productionDate, expiresOn: batch.expiresOn }); remaining -= quantityMilli
        if (remaining === 0) break
      }
      if (remaining > 0) throw new OrderDomainError('CONFLICT', '原出库分配不足，不能精确退货入库')
      return lines
    })
  }
  function confirmInbound(actor: OrderActor, input: ConfirmReturnInboundInput): CustomerReturn {
    if (!canReceive(actor)) throw new OrderDomainError('PERMISSION_DENIED', '当前角色不可确认退货入库')
    const beforeOrder = deps.orderRepository.read(); const replay = (beforeOrder.returnRequests ?? []).find((item) => item.requestId === input.requestId); if (replay) return current(replay.returnId)
    const value = current(input.returnId); if (value.version !== input.expectedVersion) throw new OrderDomainError('CONFLICT', '退单已变化，请刷新'); if (value.status !== 'approved' || value.receivingStatus !== 'pending') throw new OrderDomainError('INVALID_STATE', '仅已审核待收货退单可确认入库')
    const beforeInventory = deps.inventoryRepository.read(); const beforeFinance = deps.financeRepository.read(); const at = deps.now()
    try {
      const movements = deps.inventory.confirmReturnInbound({ actorId: actor.actorId, role: actor.role }, { requestId: `${input.requestId}:inventory`, sourceType: 'customer-return', sourceId: value.id, operatorId: actor.actorId, occurredAt: at, warehouseId: value.warehouseSnapshot.id, locationId: input.locationId, lines: returnInboundLines(value) })
      const finance = deps.financeRefunds.createReturnCredit({ requestId: `${input.requestId}:finance`, sourceType: 'customer-return', sourceId: value.id, sourceNo: value.returnNo, orderId: value.orderId, amountCents: value.returnAmountCents, refundPreference: value.refundPreference, occurredAt: at, operator: { id: actor.actorId, name: deps.actorName(actor), role: actor.role } })
      return deps.orderRepository.transact((state) => { state.returnRequests ??= []; const target = state.returns!.find((item) => item.id === value.id)!; if (target.version !== input.expectedVersion || target.receivingStatus !== 'pending') throw new OrderDomainError('CONFLICT', '退单已变化，请刷新'); const inboundProjection: ReturnInboundProjection = { sourceNo: target.returnNo, movementIds: movements.map((item) => item.id), warehouseId: target.warehouseSnapshot.id, locationId: input.locationId, receivedAt: at, receivedBy: actorSnapshot(deps, actor), voidInfo: null }; const refundProjection: ReturnRefundProjection = { adjustmentId: finance.credit.id, refundId: finance.refund?.id ?? null, refundNo: finance.refund?.refundNo ?? null, requestedAmountCents: finance.refund?.requestedAmountCents ?? 0, creditAmountCents: finance.credit.amountCents, obligationAmountCents: finance.credit.refundObligationCents, refundedAmountCents: 0, status: finance.refund ? 'pending' : 'not-required' }; target.inboundProjection = inboundProjection; target.refundProjection = refundProjection; target.receivingStatus = 'received'; target.refundStatus = refundProjection.status; if (target.refundStatus === 'not-required') target.status = 'completed'; target.updatedAt = at; target.version += 1; target.activityLogs.push({ id: deps.nextId('return-activity'), action: 'received', actorSnapshot: { ...actorSnapshot(deps, actor), role: actor.role }, occurredAt: at, summary: finance.refund ? `退货入库完成，已生成待退款 ${finance.refund.refundNo}` : '退货入库完成，应收贷项已结清且无需退款', reason: null, requestId: input.requestId }); state.returnRequests.push({ requestId: input.requestId, action: 'received', returnId: target.id, appliedAt: at }); return target })
    } catch (cause) { deps.orderRepository.reset(beforeOrder); deps.inventoryRepository.reset(beforeInventory); deps.financeRepository.reset(beforeFinance); throw cause }
  }
  function voidInbound(actor: OrderActor, input: VoidReturnInboundInput): CustomerReturn {
    if (!canVoid(actor)) throw new OrderDomainError('PERMISSION_DENIED', '当前角色不可作废退货入库'); const reason = input.reason.trim(); if (!reason || reason.length > 200) throw new OrderDomainError('INVALID_SELECTION', '作废原因须为1到200字')
    const beforeOrder = deps.orderRepository.read(); const replay = (beforeOrder.returnRequests ?? []).find((item) => item.requestId === input.requestId); if (replay) return current(replay.returnId)
    const value = current(input.returnId); if (value.version !== input.expectedVersion) throw new OrderDomainError('CONFLICT', '退单已变化，请刷新'); if (value.receivingStatus !== 'received' || !value.inboundProjection || value.inboundProjection.voidInfo) throw new OrderDomainError('INVALID_STATE', '当前退货入库不可作废'); if (value.refundStatus === 'refunded') throw new OrderDomainError('INVALID_STATE', '退款完成后禁止作废退货入库')
    const beforeInventory = deps.inventoryRepository.read(); const beforeFinance = deps.financeRepository.read(); const at = deps.now()
    try {
      deps.financeRefunds.reverseReturnCredit({ requestId: `${input.requestId}:finance`, sourceType: 'customer-return', sourceId: value.id, reason, occurredAt: at, operator: { id: actor.actorId, name: deps.actorName(actor), role: actor.role } })
      const reversals = deps.inventory.reverseReturnInbound({ actorId: actor.actorId, role: actor.role }, { requestId: `${input.requestId}:inventory`, sourceType: 'customer-return-void', sourceId: value.id, operatorId: actor.actorId, occurredAt: at, warehouseId: value.warehouseSnapshot.id, movementIds: value.inboundProjection.movementIds })
      return deps.orderRepository.transact((state) => { state.returnRequests ??= []; const target = state.returns!.find((item) => item.id === value.id)!; if (target.version !== input.expectedVersion || !target.inboundProjection) throw new OrderDomainError('CONFLICT', '退单已变化，请刷新'); target.inboundProjection.voidInfo = { reason, voidedAt: at, voidedBy: actorSnapshot(deps, actor), reversalMovementIds: reversals.map((item) => item.id) }; target.receivingStatus = 'pending'; target.refundStatus = 'not-created'; target.refundProjection = null; target.status = 'approved'; target.updatedAt = at; target.version += 1; target.activityLogs.push({ id: deps.nextId('return-activity'), action: 'receipt-voided', actorSnapshot: { ...actorSnapshot(deps, actor), role: actor.role }, occurredAt: at, summary: '作废退货入库并冲销待退款贷项', reason, requestId: input.requestId }); state.returnRequests.push({ requestId: input.requestId, action: 'receipt-voided', returnId: target.id, appliedAt: at }); return target })
    } catch (cause) { deps.orderRepository.reset(beforeOrder); deps.inventoryRepository.reset(beforeInventory); deps.financeRepository.reset(beforeFinance); throw cause }
  }
  function refreshRefundProjection(returnId: string): CustomerReturn {
    const value = current(returnId); const result = deps.financeRefunds.getSourceResult('customer-return', returnId); if (!result) return value; const latest = result.refunds.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id)).at(-1) ?? null; const at = deps.now()
    return deps.orderRepository.transact((state) => { const target = state.returns!.find((item) => item.id === returnId)!; target.refundProjection = { adjustmentId: result.credit.id, refundId: latest?.id ?? null, refundNo: latest?.refundNo ?? null, requestedAmountCents: latest?.requestedAmountCents ?? 0, creditAmountCents: result.credit.amountCents, obligationAmountCents: result.credit.refundObligationCents, refundedAmountCents: latest?.refundedAmountCents ?? 0, status: latest?.status ?? (result.credit.refundObligationCents === 0 ? 'not-required' : 'not-created') }; target.refundStatus = target.refundProjection.status; if (target.receivingStatus === 'received' && ['refunded', 'not-required'].includes(target.refundStatus)) target.status = 'completed'; target.updatedAt = at; target.version += 1; return target })
  }
  return { confirmInbound, voidInbound, refreshRefundProjection }
}
