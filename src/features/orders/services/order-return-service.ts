import type { OrderRepository } from '../repositories/order-repository'
import { OrderValidationError } from '../schemas/order-schema'
import { validateCustomerReturnDraft } from '../schemas/order-return-schema'
import { OrderDomainError } from './order-service'
import type {
  CancelCustomerReturnInput, CustomerOrder, CustomerReturn, CustomerReturnActivityLog, CustomerReturnDraft,
  CustomerReturnItem, CustomerReturnListRow, CustomerReturnQuery, NamedSnapshot, OrderActor, OrderPermission,
  PageResult, ReviewCustomerReturnInput, SaveCustomerReturnInput, WarehouseSnapshot,
} from '../types'

export interface OrderReturnServiceDependencies {
  repository: OrderRepository
  now: () => string
  nextId: (kind: 'return' | 'return-line' | 'return-activity') => string
  actorName: (actor: OrderActor) => string
  getWarehouse: (id: string) => { id: string; code: string; name: string; status: 'enabled' | 'disabled' } | null
}

const defaults: Record<OrderActor['role'], OrderPermission[]> = {
  'super-admin': ['orders.view-return', 'orders.create-return', 'orders.edit-return', 'orders.edit-return-price', 'orders.review-return', 'orders.void-return', 'orders.print-return', 'orders.export-return', 'orders.confirm-return-receipt', 'orders.void-return-receipt'],
  'sales-supervisor': ['orders.view-return', 'orders.edit-return', 'orders.edit-return-price', 'orders.review-return', 'orders.void-return', 'orders.print-return', 'orders.export-return'],
  salesperson: ['orders.view-return', 'orders.create-return'],
  warehouse: ['orders.view-return', 'orders.confirm-return-receipt', 'orders.void-return-receipt'],
  finance: ['orders.view-return'],
}
const permissionSet = (actor: OrderActor) => new Set(actor.permissions ?? defaults[actor.role])
const assertPermission = (actor: OrderActor, permission: OrderPermission, message: string) => { if (!permissionSet(actor).has(permission)) throw new OrderDomainError('PERMISSION_DENIED', message) }
const actorSnapshot = (deps: OrderReturnServiceDependencies, actor: OrderActor): NamedSnapshot & { role: OrderActor['role'] } => ({ id: actor.actorId, name: deps.actorName(actor), role: actor.role })
const dayKey = (at: string) => { const match = at.match(/^\d{4}-(\d{2})-(\d{2})/); if (!match) throw new OrderDomainError('INVALID_STATE', '模拟时钟格式无效'); return `${at.slice(2, 4)}${match[1]}${match[2]}` }
const cleanReason = (value: string | null | undefined, label: string) => { const clean = value?.trim() ?? ''; if (!clean || clean.length > 200) throw new OrderDomainError('INVALID_SELECTION', `${label}须为1到200字`); return clean }
const effectiveOutboundByLine = (state: ReturnType<OrderRepository['read']>, orderId: string) => {
  const result = new Map<string, number>()
  for (const outbound of (state.outbounds ?? []).filter((item) => item.orderId === orderId && item.status === 'confirmed')) {
    for (const line of outbound.lines) result.set(line.orderLineId, (result.get(line.orderLineId) ?? 0) + line.quantityMilli)
  }
  return result
}
const activeReturns = (state: ReturnType<OrderRepository['read']>, orderId: string, excludeId?: string) => (state.returns ?? []).filter((item) => item.orderId === orderId && item.id !== excludeId && item.status !== 'cancelled')
const priorQuantity = (values: CustomerReturn[], orderLineId: string) => values.reduce((sum, item) => sum + (item.items.find((line) => line.orderLineId === orderLineId)?.returnQuantityMilli ?? 0), 0)
const priorDiscount = (values: CustomerReturn[], orderLineId: string) => values.reduce((sum, item) => sum + (item.items.find((line) => line.orderLineId === orderLineId)?.allocatedOrderDiscountCents ?? 0), 0)
const grossAtQuantity = (order: CustomerOrder, orderLineId: string, quantityMilli: number) => { const line = order.lines.find((item) => item.id === orderLineId)!; return (line.lineKind ?? 'sale') === 'gift' ? 0 : Math.floor(quantityMilli * line.dealUnitPriceCents / line.unitSnapshot.conversionRateMilli) }

export function createOrderReturnService(deps: OrderReturnServiceDependencies) {
  const canSeeOrder = (actor: OrderActor, order: CustomerOrder) => actor.role !== 'salesperson' || order.salespersonSnapshot.id === actor.actorId
  const raw = (actor: OrderActor, returnId: string) => {
    assertPermission(actor, 'orders.view-return', '当前角色不可查看退单')
    const state = deps.repository.read(); const value = (state.returns ?? []).find((item) => item.id === returnId)
    const order = value ? state.orders.find((item) => item.id === value.orderId) : null
    if (!value || !order || !canSeeOrder(actor, order)) throw new OrderDomainError('NOT_FOUND', '退单不存在')
    return value
  }
  const visible = (actor: OrderActor, value: CustomerReturn) => {
    const copy = structuredClone(value)
    if (actor.role === 'warehouse') {
      copy.grossAmountCents = 0; copy.allocatedOrderDiscountCents = 0; copy.returnAmountCents = 0; copy.priceAdjustmentReason = null; copy.refundProjection = null
      copy.items = copy.items.map((item) => ({ ...item, originalDealUnitPriceCents: 0, allocatedOrderDiscountCents: 0, defaultReturnAmountCents: 0, returnAmountCents: 0 }))
    }
    return copy
  }
  const actions = (actor: OrderActor, value: CustomerReturn) => ({
    canEdit: ['pending-review', 'returned'].includes(value.status) && permissionSet(actor).has('orders.edit-return'),
    canReview: value.status === 'pending-review' && permissionSet(actor).has('orders.review-return'),
    canCancel: ['pending-review', 'returned'].includes(value.status) && permissionSet(actor).has('orders.void-return'),
    amountsVisible: actor.role !== 'warehouse',
  })
  function listReturns(actor: OrderActor, query: CustomerReturnQuery = {}): PageResult<CustomerReturnListRow> {
    assertPermission(actor, 'orders.view-return', '当前角色不可查看退单')
    const page = query.page ?? 1; const pageSize = query.pageSize ?? 30
    if (!Number.isSafeInteger(page) || page < 1 || ![10, 30, 50, 100].includes(pageSize)) throw new OrderDomainError('INVALID_SELECTION', '分页参数无效')
    const state = deps.repository.read(); const key = query.keyword?.trim().toLowerCase(); const orderNo = query.orderNo?.trim().toLowerCase()
    const values = (state.returns ?? []).filter((item) => { const order = state.orders.find((entry) => entry.id === item.orderId)!; return canSeeOrder(actor, order) })
      .filter((item) => !query.statuses?.length || query.statuses.includes(item.status))
      .filter((item) => !query.createdFrom || item.createdAt >= query.createdFrom).filter((item) => !query.createdTo || item.createdAt < query.createdTo)
      .filter((item) => !orderNo || item.orderNoSnapshot.toLowerCase().includes(orderNo))
      .filter((item) => !key || [item.returnNo, item.customerSnapshot.name, ...item.items.map((line) => line.productNameSnapshot)].some((text) => text.toLowerCase().includes(key)))
      .filter((item) => !query.returnType || item.returnType === query.returnType).filter((item) => !query.warehouseId || item.warehouseSnapshot.id === query.warehouseId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    const start = (page - 1) * pageSize
    return { items: values.slice(start, start + pageSize).map((value) => ({ value: visible(actor, value), ...actions(actor, value) })), total: values.length, page, pageSize }
  }
  function getReturn(actor: OrderActor, returnId: string) { const value = raw(actor, returnId); return { value: visible(actor, value), ...actions(actor, value) } }
  function listEligibleOrders(actor: OrderActor) {
    assertPermission(actor, 'orders.create-return', '当前角色不可创建退单')
    const state = deps.repository.read()
    return state.orders.filter((order) => ['shipped', 'completed'].includes(order.status) && canSeeOrder(actor, order) && [...effectiveOutboundByLine(state, order.id).values()].some((quantity) => quantity > 0)).map((order) => structuredClone(order))
  }
  function getReturnableLines(actor: OrderActor, orderId: string, excludeReturnId?: string) {
    assertPermission(actor, 'orders.create-return', '当前角色不可创建退单')
    const state = deps.repository.read(); const order = state.orders.find((item) => item.id === orderId && item.deletedAt === null)
    if (!order || !canSeeOrder(actor, order)) throw new OrderDomainError('NOT_FOUND', '原订单不存在')
    if (!['shipped', 'completed'].includes(order.status)) throw new OrderDomainError('INVALID_STATE', '仅已发货或已完成订单可创建退单')
    const outbound = effectiveOutboundByLine(state, orderId); const active = activeReturns(state, orderId, excludeReturnId)
    return order.lines.map((line) => ({ line: structuredClone(line), effectiveOutboundQuantityMilli: outbound.get(line.id) ?? 0, reservedReturnQuantityMilli: priorQuantity(active, line.id), returnableQuantityMilli: Math.max(0, (outbound.get(line.id) ?? 0) - priorQuantity(active, line.id)) })).filter((item) => item.effectiveOutboundQuantityMilli > 0)
  }
  function buildItems(state: ReturnType<OrderRepository['read']>, actor: OrderActor, draft: CustomerReturnDraft, existing?: CustomerReturn): { order: CustomerOrder; warehouse: WarehouseSnapshot; items: CustomerReturnItem[] } {
    const draftIssues = validateCustomerReturnDraft(draft); if (draftIssues.length) throw new OrderValidationError(draftIssues)
    const order = state.orders.find((item) => item.id === draft.orderId && item.deletedAt === null)
    if (!order || !canSeeOrder(actor, order)) throw new OrderDomainError('NOT_FOUND', '原订单不存在')
    if (!['shipped', 'completed'].includes(order.status)) throw new OrderDomainError('INVALID_STATE', '仅已发货或已完成订单可创建退单')
    const warehouseValue = deps.getWarehouse(draft.warehouseId); if (!warehouseValue || warehouseValue.status !== 'enabled') throw new OrderDomainError('INVALID_STATE', '请选择启用退货仓库')
    const warehouse = { id: warehouseValue.id, code: warehouseValue.code, name: warehouseValue.name }
    const outbound = effectiveOutboundByLine(state, order.id); const prior = activeReturns(state, order.id, existing?.id)
    const sourceLines = draft.returnType === 'whole' ? order.lines.filter((line) => (outbound.get(line.id) ?? 0) - priorQuantity(prior, line.id) > 0).map((line) => ({ orderLineId: line.id, returnQuantityMilli: (outbound.get(line.id) ?? 0) - priorQuantity(prior, line.id) })) : draft.lines
    if (!sourceLines.length) throw new OrderDomainError('INVALID_STATE', '原订单没有可退数量')
    const saleGrossTotal = order.lines.filter((line) => (line.lineKind ?? 'sale') === 'sale').reduce((sum, line) => sum + line.subtotalCents, 0)
    const orderDiscountTotal = Math.max(0, -(order.amounts.couponDiscountCents ?? 0) - (order.amounts.manualOrderDiscountCents ?? 0))
    const items = sourceLines.map((draftLine) => {
      const line = order.lines.find((item) => item.id === draftLine.orderLineId); if (!line) throw new OrderDomainError('INVALID_SELECTION', '退货商品不属于原订单')
      const effective = outbound.get(line.id) ?? 0; const priorQty = priorQuantity(prior, line.id); const available = effective - priorQty
      if (!Number.isSafeInteger(draftLine.returnQuantityMilli) || draftLine.returnQuantityMilli <= 0 || draftLine.returnQuantityMilli > available) throw new OrderDomainError('CONFLICT', `${line.productNameSnapshot}可退数量已变化，请刷新`)
      const previousGross = grossAtQuantity(order, line.id, priorQty); const cumulativeGross = grossAtQuantity(order, line.id, priorQty + draftLine.returnQuantityMilli); const gross = cumulativeGross - previousGross
      const previousDiscount = priorDiscount(prior, line.id)
      const cumulativeDiscount = saleGrossTotal === 0 || (line.lineKind ?? 'sale') === 'gift' ? 0 : Math.min(orderDiscountTotal, Math.floor(orderDiscountTotal * cumulativeGross / saleGrossTotal))
      const allocatedDiscount = Math.max(0, cumulativeDiscount - previousDiscount); const defaultAmount = Math.max(0, gross - allocatedDiscount)
      const requested = draft.lines.find((item) => item.orderLineId === line.id)?.returnAmountCents; const returnAmount = requested ?? defaultAmount
      if (returnAmount > defaultAmount) throw new OrderDomainError('INVALID_SELECTION', '退货金额不能提高默认可退权益')
      return { id: existing?.items.find((item) => item.orderLineId === line.id)?.id ?? deps.nextId('return-line'), orderLineId: line.id, skuId: line.skuId, skuCodeSnapshot: line.skuCodeSnapshot, productNameSnapshot: line.productNameSnapshot, specificationSnapshot: line.specificationSnapshot, unitSnapshot: structuredClone(line.unitSnapshot), lineKind: line.lineKind ?? 'sale', originalOrderQuantityMilli: line.quantityMilli, effectiveOutboundQuantityMilli: effective, reservedReturnQuantityMilli: priorQty, returnQuantityMilli: draftLine.returnQuantityMilli, originalDealUnitPriceCents: line.dealUnitPriceCents, allocatedOrderDiscountCents: allocatedDiscount, defaultReturnAmountCents: defaultAmount, returnAmountCents: returnAmount }
    })
    const changedPrice = items.some((item) => item.returnAmountCents < item.defaultReturnAmountCents)
    if (changedPrice) cleanReason(draft.priceAdjustmentReason, '改价原因'); else if (draft.priceAdjustmentReason?.trim()) throw new OrderDomainError('INVALID_SELECTION', '未降低退货金额时不能填写改价原因')
    return { order, warehouse, items }
  }
  function saveReturn(actor: OrderActor, input: SaveCustomerReturnInput): CustomerReturn {
    const requestId = input.requestId.trim(); if (!requestId) throw new OrderDomainError('INVALID_SELECTION', '请求ID不能为空')
    const snapshot = deps.repository.read(); const priorRequest = (snapshot.returnRequests ?? []).find((item) => item.requestId === requestId)
    if (priorRequest) return getReturn(actor, priorRequest.returnId).value
    const existing = input.returnId ? (snapshot.returns ?? []).find((item) => item.id === input.returnId) : undefined
    assertPermission(actor, existing ? 'orders.edit-return' : 'orders.create-return', existing ? '当前角色不可修改退单' : '当前角色不可创建退单')
    if (existing && !['pending-review', 'returned'].includes(existing.status)) throw new OrderDomainError('INVALID_STATE', '当前退单状态不可修改')
    if (existing && existing.version !== input.expectedVersion) throw new OrderDomainError('CONFLICT', '退单已变化，请刷新')
    if (existing && existing.orderId !== input.draft.orderId) throw new OrderDomainError('INVALID_SELECTION', '修改退单不能更换原订单')
    const built = buildItems(snapshot, actor, input.draft, existing); const now = deps.now()
    if (built.items.some((item) => item.returnAmountCents !== item.defaultReturnAmountCents)) assertPermission(actor, 'orders.edit-return-price', '当前角色不可修改退货金额')
    return deps.repository.transact((state) => {
      state.returns ??= []; state.returnRequests ??= []; state.nextReturnSequenceByDate ??= {}
      const repeated = state.returnRequests.find((item) => item.requestId === requestId); if (repeated) return state.returns.find((item) => item.id === repeated.returnId)!
      if (existing) { const current = state.returns.find((item) => item.id === existing.id); if (!current || current.version !== input.expectedVersion) throw new OrderDomainError('CONFLICT', '退单已变化，请刷新') }
      buildItems(state, actor, input.draft, existing)
      const action = existing?.status === 'returned' ? 'resubmitted' : existing ? 'updated' : 'created'; const actorValue = actorSnapshot(deps, actor)
      let value: CustomerReturn
      if (existing) {
        value = state.returns.find((item) => item.id === existing.id)!
        Object.assign(value, { warehouseSnapshot: built.warehouse, returnType: input.draft.returnType, refundPreference: input.draft.refundPreference, reason: input.draft.reason.trim(), remark: input.draft.remark?.trim() || null, priceAdjustmentReason: input.draft.priceAdjustmentReason?.trim() || null, items: built.items, grossAmountCents: built.items.reduce((sum, item) => sum + item.defaultReturnAmountCents + item.allocatedOrderDiscountCents, 0), allocatedOrderDiscountCents: built.items.reduce((sum, item) => sum + item.allocatedOrderDiscountCents, 0), returnAmountCents: built.items.reduce((sum, item) => sum + item.returnAmountCents, 0), status: 'pending-review', reviewRound: existing.status === 'returned' ? existing.reviewRound + 1 : existing.reviewRound, updatedAt: now, version: existing.version + 1 })
      } else {
        const day = dayKey(now); const sequence = state.nextReturnSequenceByDate[day] ?? 1; state.nextReturnSequenceByDate[day] = sequence + 1
        value = { id: deps.nextId('return'), enterpriseId: state.enterpriseId, returnNo: `TH-${day}-${String(sequence).padStart(5, '0')}`, sourceKind: 'customer-return', orderId: built.order.id, orderNoSnapshot: built.order.orderNo, customerSnapshot: structuredClone(built.order.customerSnapshot), salespersonSnapshot: structuredClone(built.order.salespersonSnapshot), warehouseSnapshot: built.warehouse, returnType: input.draft.returnType, refundPreference: input.draft.refundPreference, reason: input.draft.reason.trim(), remark: input.draft.remark?.trim() || null, priceAdjustmentReason: input.draft.priceAdjustmentReason?.trim() || null, items: built.items, grossAmountCents: built.items.reduce((sum, item) => sum + item.defaultReturnAmountCents + item.allocatedOrderDiscountCents, 0), allocatedOrderDiscountCents: built.items.reduce((sum, item) => sum + item.allocatedOrderDiscountCents, 0), returnAmountCents: built.items.reduce((sum, item) => sum + item.returnAmountCents, 0), status: 'pending-review', receivingStatus: 'pending', refundStatus: 'not-created', inboundProjection: null, refundProjection: null, reviewRound: 1, activityLogs: [], createdAt: now, createdBy: actorValue, updatedAt: now, version: 1 }
        state.returns.push(value)
      }
      const log: CustomerReturnActivityLog = { id: deps.nextId('return-activity'), action, actorSnapshot: actorValue, occurredAt: now, summary: action === 'created' ? '创建并提交客户退单' : action === 'resubmitted' ? '修改后重新提交客户退单' : '修改客户退单', reason: value.priceAdjustmentReason, requestId }
      value.activityLogs.push(log); state.returnRequests.push({ requestId, action, returnId: value.id, appliedAt: now }); return value
    })
  }
  function previewReturn(actor: OrderActor, draft: CustomerReturnDraft, returnId?: string) {
    const state = deps.repository.read(); const existing = returnId ? (state.returns ?? []).find((item) => item.id === returnId) : undefined
    assertPermission(actor, existing ? 'orders.edit-return' : 'orders.create-return', existing ? '当前角色不可修改退单' : '当前角色不可创建退单')
    const built = buildItems(state, actor, draft, existing); return { items: structuredClone(built.items), grossAmountCents: built.items.reduce((sum, item) => sum + item.defaultReturnAmountCents + item.allocatedOrderDiscountCents, 0), allocatedOrderDiscountCents: built.items.reduce((sum, item) => sum + item.allocatedOrderDiscountCents, 0), returnAmountCents: built.items.reduce((sum, item) => sum + item.returnAmountCents, 0) }
  }
  function reviewReturn(actor: OrderActor, input: ReviewCustomerReturnInput): CustomerReturn {
    assertPermission(actor, 'orders.review-return', '当前角色不可审核退单'); const reason = input.action === 'return' ? cleanReason(input.reason, '退回原因') : null; const now = deps.now()
    return deps.repository.transact((state) => { state.returnRequests ??= []; const replay = state.returnRequests.find((item) => item.requestId === input.requestId); if (replay) return state.returns!.find((item) => item.id === replay.returnId)!; const value = state.returns?.find((item) => item.id === input.returnId); if (!value) throw new OrderDomainError('NOT_FOUND', '退单不存在'); if (value.version !== input.expectedVersion) throw new OrderDomainError('CONFLICT', '退单已变化，请刷新'); if (value.status !== 'pending-review') throw new OrderDomainError('INVALID_STATE', '仅待审核退单可审核'); const action = input.action === 'approve' ? 'approved' : 'returned'; value.status = action; value.updatedAt = now; value.version += 1; value.activityLogs.push({ id: deps.nextId('return-activity'), action, actorSnapshot: actorSnapshot(deps, actor), occurredAt: now, summary: action === 'approved' ? '审核通过客户退单' : '退回客户退单', reason, requestId: input.requestId }); state.returnRequests.push({ requestId: input.requestId, action, returnId: value.id, appliedAt: now }); return value })
  }
  function cancelReturn(actor: OrderActor, input: CancelCustomerReturnInput): CustomerReturn {
    assertPermission(actor, 'orders.void-return', '当前角色不可取消退单'); const reason = cleanReason(input.reason, '取消原因'); const now = deps.now()
    return deps.repository.transact((state) => { state.returnRequests ??= []; const replay = state.returnRequests.find((item) => item.requestId === input.requestId); if (replay) return state.returns!.find((item) => item.id === replay.returnId)!; const value = state.returns?.find((item) => item.id === input.returnId); if (!value) throw new OrderDomainError('NOT_FOUND', '退单不存在'); if (value.version !== input.expectedVersion) throw new OrderDomainError('CONFLICT', '退单已变化，请刷新'); if (!['pending-review', 'returned'].includes(value.status)) throw new OrderDomainError('INVALID_STATE', '当前状态不可取消'); value.status = 'cancelled'; value.updatedAt = now; value.version += 1; value.activityLogs.push({ id: deps.nextId('return-activity'), action: 'cancelled', actorSnapshot: actorSnapshot(deps, actor), occurredAt: now, summary: '取消客户退单并释放可退量', reason, requestId: input.requestId }); state.returnRequests.push({ requestId: input.requestId, action: 'cancelled', returnId: value.id, appliedAt: now }); return value })
  }
  return { listReturns, getReturn, listEligibleOrders, getReturnableLines, previewReturn, saveReturn, reviewReturn, cancelReturn }
}
