import { describe, expect, it } from 'vitest'
import { createOrderMockSession } from '../../../../mock/handlers/order-handler'
import { OrderDomainError } from './order-service'
import type { CustomerReturnDraft } from '../types'

const admin = { role: 'super-admin' as const, actorId: 'admin-demo' }
const supervisor = { role: 'sales-supervisor' as const, actorId: 'sales-supervisor-demo' }

function draftFor(session: ReturnType<typeof createOrderMockSession>, orderId = 'order-006'): CustomerReturnDraft {
  const lines = session.returns.getReturnableLines(admin, orderId)
  return { orderId, warehouseId: 'warehouse-main', returnType: 'partial' as const, refundPreference: 'original' as const, reason: '演示客户拒收：包装外观异常', remark: '完全虚构的退货场景', priceAdjustmentReason: null, lines: [{ orderLineId: lines[0]!.line.id, returnQuantityMilli: lines[0]!.returnableQuantityMilli }] }
}

describe('ORD-005 order return domain', () => {
  it('lists only shipped/completed orders with effective outbound and creates an idempotent TH document', () => {
    const session = createOrderMockSession('normal')
    const eligible = session.returns.listEligibleOrders(admin)
    expect(eligible.some((item) => item.id === 'order-006')).toBe(true)
    const input = { requestId: 'return-create-001', draft: draftFor(session) }
    const first = session.returns.saveReturn(admin, input); const repeated = session.returns.saveReturn(admin, input)
    expect(first.returnNo).toMatch(/^TH-260810-\d{5}$/); expect(repeated.id).toBe(first.id)
    expect(first.status).toBe('pending-review'); expect(first.returnAmountCents).toBeGreaterThanOrEqual(0)
    expect(session.repository.read().returns).toHaveLength(1)
  })

  it('reserves returnable milli-units atomically and releases them only after cancellation', () => {
    const session = createOrderMockSession('normal'); const draft = draftFor(session)
    const first = session.returns.saveReturn(admin, { requestId: 'return-reserve-001', draft })
    expect(session.returns.getReturnableLines(admin, draft.orderId)[0]!.returnableQuantityMilli).toBe(0)
    expect(() => session.returns.saveReturn(admin, { requestId: 'return-reserve-002', draft })).toThrow(OrderDomainError)
    session.returns.cancelReturn(admin, { requestId: 'return-cancel-001', returnId: first.id, expectedVersion: first.version, reason: '客户撤销退货申请' })
    expect(session.returns.getReturnableLines(admin, draft.orderId)[0]!.returnableQuantityMilli).toBe(draft.lines[0]!.returnQuantityMilli)
  })

  it('keeps reservation through return/resubmit and locks approved business fields', () => {
    const session = createOrderMockSession('normal'); const draft = draftFor(session)
    let value = session.returns.saveReturn(admin, { requestId: 'return-flow-001', draft })
    value = session.returns.reviewReturn(supervisor, { requestId: 'return-flow-002', returnId: value.id, expectedVersion: value.version, action: 'return', reason: '请补充退货说明' })
    expect(value.status).toBe('returned'); expect(session.returns.getReturnableLines(admin, draft.orderId)[0]!.returnableQuantityMilli).toBe(0)
    value = session.returns.saveReturn(supervisor, { requestId: 'return-flow-003', returnId: value.id, expectedVersion: value.version, draft: { ...draft, reason: '已补充：客户拒收且包装外观异常' } })
    expect(value.reviewRound).toBe(2)
    value = session.returns.reviewReturn(supervisor, { requestId: 'return-flow-004', returnId: value.id, expectedVersion: value.version, action: 'approve' })
    expect(value.status).toBe('approved')
    expect(() => session.returns.saveReturn(supervisor, { requestId: 'return-flow-005', returnId: value.id, expectedVersion: value.version, draft })).toThrow(OrderDomainError)
  })

  it('requires price permission/reason and masks all money for warehouse', () => {
    const session = createOrderMockSession('normal'); const draft = draftFor(session); const preview = session.returns.saveReturn(admin, { requestId: 'return-price-base', draft })
    const session2 = createOrderMockSession('normal'); const lowerDraft = draftFor(session2); lowerDraft.lines[0]!.returnAmountCents = Math.max(0, preview.items[0]!.defaultReturnAmountCents - 1)
    expect(() => session2.returns.saveReturn(admin, { requestId: 'return-price-no-reason', draft: lowerDraft })).toThrow(OrderDomainError)
    lowerDraft.priceAdjustmentReason = '主管与客户确认降低一分钱退款权益'
    const lowered = session2.returns.saveReturn(admin, { requestId: 'return-price-ok', draft: lowerDraft })
    const masked = session2.returns.getReturn({ role: 'warehouse', actorId: 'warehouse-demo' }, lowered.id).value
    expect(masked.returnAmountCents).toBe(0); expect(masked.items.every((item) => item.returnAmountCents === 0)).toBe(true)
  })
})
