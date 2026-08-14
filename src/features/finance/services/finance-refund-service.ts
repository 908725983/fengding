import type { FinanceRepository } from '../repositories/finance-repository'
import { FinanceDomainError } from './finance-service'
import { FinanceValidationError } from '../schemas/finance-schema'
import type {
  ActorSnapshot, ConfirmCustomerRefundInput, CreateReturnCreditInput, CustomerRefund, FinanceActor, FinanceFeatureState,
  FinancePermission, FundAccount, FundMovement, ReceivableCreditAdjustment, ReapplyCustomerRefundInput,
  RefundSourceAllocation, RejectCustomerRefundInput, ReverseReturnCreditInput, WriteoffAllocation,
} from '../types'

export interface FinanceRefundServiceDependencies {
  repository: FinanceRepository; now: () => string
  nextId: (kind: 'credit' | 'refund' | 'refund-allocation' | 'movement' | 'prepayment' | 'audit') => string
  actorName?: (actor: FinanceActor) => string
}

const rolePermissions: Record<FinanceActor['role'], FinancePermission[]> = {
  'super-admin': ['finance.view-refunds', 'finance.manage-refunds'], finance: ['finance.view-refunds', 'finance.manage-refunds'],
  'sales-supervisor': [], salesperson: [], warehouse: [],
}
const permission = (actor: FinanceActor, value: FinancePermission) => { if (!(actor.permissions ?? rolePermissions[actor.role]).includes(value)) throw new FinanceDomainError('PERMISSION_DENIED', '当前角色没有退款权限') }
const actorSnapshot = (actor: FinanceActor, deps: FinanceRefundServiceDependencies): ActorSnapshot => ({ id: actor.actorId, name: deps.actorName?.(actor) ?? actor.actorId, role: actor.role })
const monthPart = (value: string) => value.slice(0, 7); const datePart = (value: string) => value.slice(0, 10)
const assertTime = (value: string, now: string) => { if (!Number.isFinite(Date.parse(value)) || value > now) throw new FinanceValidationError([{ path: 'occurredAt', message: '时间无效或晚于当前时间' }]) }
const accountById = (state: FinanceFeatureState, id: string) => { const value = state.accounts.find((item) => item.id === id); if (!value) throw new FinanceDomainError('NOT_FOUND', '资金账户不存在'); return value }
const currentBalance = (state: FinanceFeatureState, account: FundAccount) => state.movements.filter((item) => item.accountId === account.id).reduce((balance, item) => balance + (item.direction === 'income' ? item.amountCents : -item.amountCents), account.openingBalanceCents)
const activeWriteoffs = (state: FinanceFeatureState, receivableId: string) => state.receiptWriteoffs.filter((item) => item.status === 'active' && item.allocations.some((part) => part.receivableId === receivableId)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
const totals = (state: FinanceFeatureState, receivableId: string) => activeWriteoffs(state, receivableId).flatMap((item) => item.allocations.filter((part) => part.receivableId === receivableId)).reduce((sum, item) => ({ cash: sum.cash + item.cashCents, discount: sum.discount + item.discountCents }), { cash: 0, discount: 0 })
const nextRefundNo = (state: FinanceFeatureState, at: string) => { const date = datePart(at); let row = state.dailySequences.find((item) => item.date === date); if (!row) { row = { date, receivable: 1, receipt: 1, writeoff: 1, refund: 1 }; state.dailySequences.push(row) } const sequence = row.refund ?? 1; row.refund = sequence + 1; return `TK-${date.slice(2).replaceAll('-', '')}-${String(sequence).padStart(5, '0')}` }
const record = (state: FinanceFeatureState, requestId: string, kind: FinanceFeatureState['requests'][number]['kind'], targetIds: string[], at: string) => state.requests.push({ requestId, kind, targetIds, appliedAt: at })

export function createFinanceRefundService(deps: FinanceRefundServiceDependencies) {
  function makePending(state: FinanceFeatureState, credit: ReceivableCreditAdjustment, method: CustomerRefund['method'], at: string, requestId: string, operator: ActorSnapshot): CustomerRefund | null {
    const already = state.refunds.filter((item) => item.creditAdjustmentId === credit.id && item.status === 'refunded').reduce((sum, item) => sum + item.refundedAmountCents, 0)
    const remaining = credit.refundObligationCents - already; if (remaining <= 0) return null
    if (state.refunds.some((item) => item.creditAdjustmentId === credit.id && item.status === 'pending')) throw new FinanceDomainError('CONFLICT', '该贷项已有待审核退款')
    const value: CustomerRefund = { id: deps.nextId('refund'), enterpriseId: state.enterpriseId, refundNo: nextRefundNo(state, at), sourceType: credit.sourceType, sourceId: credit.sourceId, sourceNo: credit.sourceNo, creditAdjustmentId: credit.id, receivableId: credit.receivableId, orderId: credit.orderId, orderNo: credit.orderNo, customerSnapshot: structuredClone(credit.customerSnapshot), requestedAmountCents: remaining, refundedAmountCents: 0, method, status: 'pending', allocations: [], requestedAt: at, resolvedAt: null, reason: null, requestId, operatorSnapshot: operator, version: 1 }
    state.refunds.push(value); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'refund.created', targetId: value.id, operatorSnapshot: operator, detail: `创建待审核退款 ${value.refundNo}`, createdAt: at }); return value
  }

  function createReturnCredit(input: CreateReturnCreditInput): { credit: ReceivableCreditAdjustment; refund: CustomerRefund | null } {
    assertTime(input.occurredAt, deps.now()); if (!input.requestId.trim() || !input.sourceId.trim() || !input.sourceNo.trim() || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new FinanceValidationError([{ path: 'credit', message: '贷项来源和正整数金额不能为空' }])
    return deps.repository.transact((state) => {
      const replay = state.requests.find((item) => item.requestId === input.requestId); if (replay) { if (replay.kind !== 'credit-create') throw new FinanceDomainError('CONFLICT', 'requestId 已被其他操作使用'); const credit = state.creditAdjustments.find((item) => item.id === replay.targetIds[0])!; return { credit, refund: state.refunds.find((item) => item.id === replay.targetIds[1]) ?? null } }
      if (state.creditAdjustments.some((item) => item.sourceType === input.sourceType && item.sourceId === input.sourceId && item.status === 'active')) throw new FinanceDomainError('CONFLICT', '该退货来源已形成有效贷项')
      const receivable = state.receivables.find((item) => item.orderId === input.orderId); if (!receivable) throw new FinanceDomainError('NOT_FOUND', '原订单应收不存在')
      const credited = state.creditAdjustments.filter((item) => item.receivableId === receivable.id && item.status === 'active').reduce((sum, item) => sum + item.amountCents, 0)
      if (input.amountCents > receivable.amountCents - credited) throw new FinanceDomainError('INVALID_STATE', '累计贷项不能超过原应收')
      const paid = totals(state, receivable.id); const outstandingBefore = Math.max(0, receivable.amountCents - paid.cash - paid.discount - credited); const outstandingReductionCents = Math.min(input.amountCents, outstandingBefore); const excess = input.amountCents - outstandingReductionCents
      const priorObligations = state.creditAdjustments.filter((item) => item.receivableId === receivable.id && item.status === 'active').reduce((sum, item) => sum + item.refundObligationCents, 0); const refundableCash = Math.max(0, paid.cash - priorObligations); const refundObligationCents = Math.min(excess, refundableCash); const nonRefundableDiscountCents = excess - refundObligationCents
      const operatorSnapshot = { id: input.operator.id, name: input.operator.name, role: input.operator.role }
      const credit: ReceivableCreditAdjustment = { id: deps.nextId('credit'), enterpriseId: state.enterpriseId, sourceType: input.sourceType, sourceId: input.sourceId, sourceNo: input.sourceNo, receivableId: receivable.id, orderId: receivable.orderId, orderNo: receivable.orderNo, customerSnapshot: structuredClone(receivable.customerSnapshot), amountCents: input.amountCents, outstandingReductionCents, refundObligationCents, nonRefundableDiscountCents, occurredAt: input.occurredAt, requestId: input.requestId, operatorSnapshot, status: 'active', reversalInfo: null, version: 1 }
      state.creditAdjustments.push(credit); const refund = makePending(state, credit, input.refundPreference, input.occurredAt, `${input.requestId}:refund`, operatorSnapshot)
      state.version += 1; record(state, input.requestId, 'credit-create', [credit.id, ...(refund ? [refund.id] : [])], input.occurredAt); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'credit.created', targetId: credit.id, operatorSnapshot, detail: `客户退货贷项 ${input.sourceNo}：${input.amountCents}分`, createdAt: input.occurredAt }); return { credit, refund }
    })
  }

  function refundableSources(state: FinanceFeatureState, receivableId: string): Array<{ allocation: WriteoffAllocation; occurredAt: string; method: RefundSourceAllocation['method']; accountId: string | null; remaining: number }> {
    const used = new Map<string, number>(); state.refunds.filter((item) => item.status === 'refunded').flatMap((item) => item.allocations).forEach((item) => used.set(item.sourceId, (used.get(item.sourceId) ?? 0) + item.amountCents))
    const result: Array<{ allocation: WriteoffAllocation; occurredAt: string; method: RefundSourceAllocation['method']; accountId: string | null; remaining: number }> = []
    for (const writeoff of activeWriteoffs(state, receivableId)) for (const allocation of writeoff.allocations.filter((item) => item.receivableId === receivableId && item.cashCents > 0)) {
      const usedForSource = used.get(allocation.sourceId) ?? 0; const consumed = Math.min(usedForSource, allocation.cashCents); used.set(allocation.sourceId, usedForSource - consumed); const remaining = allocation.cashCents - consumed; if (remaining <= 0) continue
      if (allocation.sourceKind === 'receipt') { const receipt = state.customerReceipts.find((item) => item.id === allocation.sourceId && item.status === 'normal'); if (!receipt) throw new FinanceDomainError('CONFLICT', '原收款来源已失效'); result.push({ allocation, occurredAt: writeoff.occurredAt, method: receipt.method, accountId: receipt.accountId, remaining }) }
      else result.push({ allocation, occurredAt: writeoff.occurredAt, method: 'balance', accountId: null, remaining })
    }
    return result.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.allocation.id.localeCompare(b.allocation.id))
  }

  function appendExpense(state: FinanceFeatureState, actor: FinanceActor, accountId: string, amountCents: number, refund: CustomerRefund, requestId: string, at: string): FundMovement {
    const account = accountById(state, accountId); if (account.status !== 'enabled') throw new FinanceDomainError('INVALID_STATE', '停用账户不能退款'); if (state.periods.some((item) => item.month === monthPart(at) && item.status === 'closed') || monthPart(at) < account.openingMonth) throw new FinanceDomainError('INVALID_STATE', '退款月份已经结转或账户尚未启用')
    const latest = state.movements.filter((item) => item.accountId === account.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]; if (latest && at < latest.occurredAt) throw new FinanceDomainError('INVALID_STATE', '不可在最新流水之前补写退款')
    const after = currentBalance(state, account) - amountCents; if (after < 0) throw new FinanceDomainError('INVALID_STATE', '退款账户余额不足')
    const value: FundMovement = { id: deps.nextId('movement'), enterpriseId: state.enterpriseId, accountId, direction: 'expense', kind: 'refund', amountCents, balanceAfterCents: after, sourceId: refund.id, sourceNoSnapshot: refund.refundNo, counterpartySnapshot: refund.customerSnapshot.name, summary: `原型模拟退款 ${refund.refundNo}`, requestId, operatorSnapshot: actorSnapshot(actor, deps), occurredAt: at }; state.movements.push(value); return value
  }

  function confirmRefund(actor: FinanceActor, input: ConfirmCustomerRefundInput): CustomerRefund {
    permission(actor, 'finance.manage-refunds'); assertTime(input.occurredAt, deps.now()); const specialReason = input.method === 'original' ? null : input.reason?.trim() ?? ''; if (input.method !== 'original' && (!specialReason || specialReason.length > 200)) throw new FinanceValidationError([{ path: 'reason', message: '特殊现金或余额退款原因须为1到200字' }])
    return deps.repository.transact((state) => {
      const replay = state.requests.find((item) => item.requestId === input.requestId); if (replay) { if (replay.kind !== 'refund-confirm') throw new FinanceDomainError('CONFLICT', 'requestId 已被其他操作使用'); return state.refunds.find((item) => item.id === replay.targetIds[0])! }
      const refund = state.refunds.find((item) => item.id === input.refundId); if (!refund) throw new FinanceDomainError('NOT_FOUND', '退款单不存在'); if (refund.version !== input.expectedVersion) throw new FinanceDomainError('CONFLICT', '退款单已变化，请刷新'); if (refund.status !== 'pending') throw new FinanceDomainError('INVALID_STATE', '仅待审核退款可确认')
      const allocations: RefundSourceAllocation[] = []; let remaining = refund.requestedAmountCents
      if (input.method === 'original') {
        if (input.cashAccountId) throw new FinanceValidationError([{ path: 'cashAccountId', message: '原路退款不能改选账户' }])
        for (const source of refundableSources(state, refund.receivableId)) { if (remaining === 0) break; const amount = Math.min(remaining, source.remaining); let movement: FundMovement | null = null; if (source.method !== 'balance') { if (!source.accountId) throw new FinanceDomainError('CONFLICT', '原收款账户不可追溯'); movement = appendExpense(state, actor, source.accountId, amount, refund, `${input.requestId}:movement:${allocations.length}`, input.occurredAt) } else state.prepaymentLedger.push({ id: deps.nextId('prepayment'), enterpriseId: state.enterpriseId, customerId: refund.customerSnapshot.id, bucket: 'available', orderId: null, sourceType: 'customer-refund', sourceId: source.allocation.sourceId, amountDeltaCents: amount, occurredAt: input.occurredAt, requestId: input.requestId })
          allocations.push({ id: deps.nextId('refund-allocation'), sourceKind: source.allocation.sourceKind, sourceId: source.allocation.sourceId, accountId: source.accountId, method: source.method, amountCents: amount, movementId: movement?.id ?? null }); remaining -= amount }
        if (remaining > 0) throw new FinanceDomainError('CONFLICT', '可追溯原路退款来源不足')
      } else if (input.method === 'cash') {
        if (!input.cashAccountId) throw new FinanceValidationError([{ path: 'cashAccountId', message: '现金退款必须选择账户' }]); const account = accountById(state, input.cashAccountId); if (account.type !== 'cash') throw new FinanceDomainError('INVALID_STATE', '现金退款必须选择 cash 账户'); const movement = appendExpense(state, actor, account.id, remaining, refund, `${input.requestId}:movement`, input.occurredAt); allocations.push({ id: deps.nextId('refund-allocation'), sourceKind: 'cash-account', sourceId: account.id, accountId: account.id, method: 'cash', amountCents: remaining, movementId: movement.id }); remaining = 0
      } else {
        if (input.cashAccountId) throw new FinanceValidationError([{ path: 'cashAccountId', message: '余额退款不能选择账户' }]); state.prepaymentLedger.push({ id: deps.nextId('prepayment'), enterpriseId: state.enterpriseId, customerId: refund.customerSnapshot.id, bucket: 'available', orderId: null, sourceType: 'customer-refund', sourceId: refund.id, amountDeltaCents: remaining, occurredAt: input.occurredAt, requestId: input.requestId }); allocations.push({ id: deps.nextId('refund-allocation'), sourceKind: 'prepayment', sourceId: refund.id, accountId: null, method: 'balance', amountCents: remaining, movementId: null }); remaining = 0
      }
      refund.method = input.method; refund.status = 'refunded'; refund.refundedAmountCents = refund.requestedAmountCents; refund.allocations = allocations; refund.resolvedAt = input.occurredAt; refund.reason = specialReason || null; refund.operatorSnapshot = actorSnapshot(actor, deps); refund.version += 1; state.version += 1; record(state, input.requestId, 'refund-confirm', [refund.id], input.occurredAt); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'refund.confirmed', targetId: refund.id, operatorSnapshot: actorSnapshot(actor, deps), detail: `确认原型模拟退款 ${refund.refundNo}`, createdAt: input.occurredAt }); return refund
    })
  }

  function rejectRefund(actor: FinanceActor, input: RejectCustomerRefundInput): CustomerRefund {
    permission(actor, 'finance.manage-refunds'); assertTime(input.occurredAt, deps.now()); const reason = input.reason.trim(); if (!reason || reason.length > 200) throw new FinanceValidationError([{ path: 'reason', message: '拒绝原因须为1到200字' }])
    return deps.repository.transact((state) => { const replay = state.requests.find((item) => item.requestId === input.requestId); if (replay) return state.refunds.find((item) => item.id === replay.targetIds[0])!; const value = state.refunds.find((item) => item.id === input.refundId); if (!value) throw new FinanceDomainError('NOT_FOUND', '退款单不存在'); if (value.version !== input.expectedVersion) throw new FinanceDomainError('CONFLICT', '退款单已变化，请刷新'); if (value.status !== 'pending') throw new FinanceDomainError('INVALID_STATE', '仅待审核退款可拒绝'); value.status = 'rejected'; value.reason = reason; value.resolvedAt = input.occurredAt; value.operatorSnapshot = actorSnapshot(actor, deps); value.version += 1; state.version += 1; record(state, input.requestId, 'refund-reject', [value.id], input.occurredAt); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'refund.rejected', targetId: value.id, operatorSnapshot: actorSnapshot(actor, deps), detail: `拒绝退款 ${value.refundNo}：${reason}`, createdAt: input.occurredAt }); return value })
  }

  function reapplyRefund(actor: FinanceActor, input: ReapplyCustomerRefundInput): CustomerRefund {
    permission(actor, 'finance.manage-refunds'); assertTime(input.occurredAt, deps.now())
    return deps.repository.transact((state) => { const prior = state.requests.find((item) => item.requestId === input.requestId); if (prior) { if (prior.kind !== 'refund-reapply') throw new FinanceDomainError('CONFLICT', 'requestId 已被其他操作使用'); return state.refunds.find((item) => item.id === prior.targetIds[0])! } const rejected = state.refunds.find((item) => item.id === input.refundId); if (!rejected) throw new FinanceDomainError('NOT_FOUND', '退款单不存在'); if (rejected.version !== input.expectedVersion) throw new FinanceDomainError('CONFLICT', '退款单已变化，请刷新'); if (rejected.status !== 'rejected') throw new FinanceDomainError('INVALID_STATE', '仅已拒绝退款可重提'); const credit = state.creditAdjustments.find((item) => item.id === rejected.creditAdjustmentId)!; if (credit.status !== 'active') throw new FinanceDomainError('INVALID_STATE', '已冲销贷项不能重提退款'); const value = makePending(state, credit, rejected.method, input.occurredAt, input.requestId, actorSnapshot(actor, deps)); if (!value) throw new FinanceDomainError('INVALID_STATE', '该贷项没有剩余退款义务'); record(state, input.requestId, 'refund-reapply', [value.id], input.occurredAt); state.version += 1; return value })
  }

  function reverseReturnCredit(input: ReverseReturnCreditInput): ReceivableCreditAdjustment {
    assertTime(input.occurredAt, deps.now()); const reason = input.reason.trim(); if (!reason || reason.length > 200) throw new FinanceValidationError([{ path: 'reason', message: '贷项冲销原因须为1到200字' }])
    return deps.repository.transact((state) => { const prior = state.requests.find((item) => item.requestId === input.requestId); if (prior) { if (prior.kind !== 'credit-reverse') throw new FinanceDomainError('CONFLICT', 'requestId 已被其他操作使用'); return state.creditAdjustments.find((item) => item.id === prior.targetIds[0])! } const credit = state.creditAdjustments.find((item) => item.sourceType === input.sourceType && item.sourceId === input.sourceId && item.status === 'active'); if (!credit) throw new FinanceDomainError('NOT_FOUND', '有效退货贷项不存在'); const refunds = state.refunds.filter((item) => item.creditAdjustmentId === credit.id); if (refunds.some((item) => item.status === 'refunded')) throw new FinanceDomainError('INVALID_STATE', '退款完成后不能冲销退货贷项'); const operatorSnapshot = { id: input.operator.id, name: input.operator.name, role: input.operator.role }; credit.status = 'reversed'; credit.reversalInfo = { reason, reversedAt: input.occurredAt, reversedBy: operatorSnapshot, requestId: input.requestId }; credit.version += 1; refunds.filter((item) => item.status === 'pending').forEach((item) => { item.status = 'rejected'; item.reason = `退货入库作废：${reason}`; item.resolvedAt = input.occurredAt; item.operatorSnapshot = operatorSnapshot; item.version += 1 }); state.version += 1; record(state, input.requestId, 'credit-reverse', [credit.id, ...refunds.map((item) => item.id)], input.occurredAt); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'credit.reversed', targetId: credit.id, operatorSnapshot, detail: `冲销退货贷项 ${credit.sourceNo}：${reason}`, createdAt: input.occurredAt }); return credit })
  }

  function listRefunds(actor: FinanceActor) { permission(actor, 'finance.view-refunds'); return deps.repository.read().refunds.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt) || b.id.localeCompare(a.id)).map((item) => structuredClone(item)) }
  function getRefund(actor: FinanceActor, refundId: string) { const value = listRefunds(actor).find((item) => item.id === refundId); if (!value) throw new FinanceDomainError('NOT_FOUND', '退款单不存在'); return value }
  function getSourceResult(sourceType: ReceivableCreditAdjustment['sourceType'], sourceId: string) { const state = deps.repository.read(); const credit = state.creditAdjustments.filter((item) => item.sourceType === sourceType && item.sourceId === sourceId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)).at(-1); if (!credit) return null; return { credit: structuredClone(credit), refunds: state.refunds.filter((item) => item.creditAdjustmentId === credit.id).map((item) => structuredClone(item)) } }
  return { createReturnCredit, reverseReturnCredit, listRefunds, getRefund, confirmRefund, rejectRefund, reapplyRefund, getSourceResult }
}
