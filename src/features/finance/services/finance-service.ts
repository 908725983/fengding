import type { FinanceRepository } from '../repositories/finance-repository'
import { assertFinanceAccountDraft, assertFinanceBankDraft, FinanceValidationError } from '../schemas/finance-schema'
import type {
  ActorSnapshot, BankProfile, CancelReceiptWriteoffInput, CloseFinancePeriodInput, CreateCustomerReceiptInput,
  CreateOrderReceivableInput, CreateReceiptWriteoffInput, CustomerPrepaymentLedgerEntry, CustomerReceivable,
  CustomerReceivableSummary, CustomerReceipt, EntityId, FinanceAccountDetail, FinanceAccountPeriodRow, FinanceActor,
  FinanceFeatureState, FinancePermission, FinancePeriod, FinancePeriodCard, FinancePeriodSnapshot, FundAccount,
  FundMovement, OrderSettlementProjection, PostFundMovementInput, ReceiptWriteoff, ReceivableAgingRow,
  ReceivableProductRow, ReceivableProjection, ReverseFinancePeriodInput, SaveFinanceAccountInput, SaveFinanceBankInput,
  SettlementSource, SubmitPaymentApplicationInput, VisibleBankProfile, VoidCustomerReceiptInput, WriteoffAllocation,
} from '../types'

export type FinanceDomainErrorCode = 'PERMISSION_DENIED' | 'NOT_FOUND' | 'DUPLICATE' | 'INVALID_STATE' | 'CONFLICT' | 'DATA_PROVIDER_UNAVAILABLE'
export class FinanceDomainError extends Error {
  constructor(readonly code: FinanceDomainErrorCode, message: string) { super(message); this.name = 'FinanceDomainError' }
}

export interface FinanceServiceDependencies {
  repository: FinanceRepository
  now: () => string
  nextId: (kind: 'account' | 'movement' | 'period' | 'bank' | 'application' | 'audit' | 'receivable' | 'receipt' | 'writeoff' | 'allocation' | 'prepayment') => string
  actorName?: (actor: FinanceActor) => string
  assertBankProvider?: () => void
  assertPaymentProvider?: () => void
}

const rolePermissions: Record<FinanceActor['role'], FinancePermission[]> = {
  'super-admin': ['finance.view-accounts', 'finance.manage-accounts', 'finance.view-ledger', 'finance.carryover', 'finance.manage-banks', 'finance.manage-payment-channels', 'finance.view-receivables', 'finance.view-receivable-details', 'finance.view-aging', 'finance.view-receipts', 'finance.manage-receipts', 'finance.view-writeoffs', 'finance.manage-writeoffs', 'finance.export-receivables'],
  finance: ['finance.view-accounts', 'finance.manage-accounts', 'finance.view-ledger', 'finance.carryover', 'finance.manage-banks', 'finance.manage-payment-channels', 'finance.view-receivables', 'finance.view-receivable-details', 'finance.view-aging', 'finance.view-receipts', 'finance.manage-receipts', 'finance.view-writeoffs', 'finance.manage-writeoffs', 'finance.export-receivables'],
  'sales-supervisor': ['finance.view-accounts', 'finance.view-ledger', 'finance.view-receivables', 'finance.view-receivable-details', 'finance.view-aging', 'finance.view-receipts', 'finance.view-writeoffs', 'finance.export-receivables'], salesperson: [], warehouse: [],
}
const normalize = (value: string) => value.trim().toLocaleLowerCase()
const normalizeBankAccount = (value: string) => value.replace(/\s+/g, '')
const monthPart = (value: string) => value.slice(0, 7)
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function permission(actor: FinanceActor, value: FinancePermission): void {
  const granted = actor.permissions ?? rolePermissions[actor.role]
  if (!granted.includes(value)) throw new FinanceDomainError('PERMISSION_DENIED', '当前角色没有该资金操作权限')
}
function actorSnapshot(actor: FinanceActor, deps: FinanceServiceDependencies): ActorSnapshot { return { id: actor.actorId, name: deps.actorName?.(actor) ?? actor.actorId, role: actor.role } }
function accountById(state: FinanceFeatureState, id: string): FundAccount { const value = state.accounts.find((item) => item.id === id); if (!value) throw new FinanceDomainError('NOT_FOUND', '资金账户不存在'); return value }
function bankById(state: FinanceFeatureState, id: string): BankProfile { const value = state.banks.find((item) => item.id === id); if (!value) throw new FinanceDomainError('NOT_FOUND', '银行资料不存在'); return value }
function activePeriod(state: FinanceFeatureState, month: string): FinancePeriod | undefined { return state.periods.find((item) => item.month === month && item.status === 'closed') }
function assertMonth(month: string, currentMonth: string): void { if (!monthPattern.test(month)) throw new FinanceValidationError([{ path: 'month', message: '必须为 YYYY-MM' }]); if (month > currentMonth) throw new FinanceDomainError('INVALID_STATE', '不能选择未来月份') }
function addMonth(month: string, delta: number): string { const [year, value] = month.split('-').map(Number); const date = new Date(Date.UTC(year!, value! - 1 + delta, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` }
function replay<T>(state: FinanceFeatureState, requestId: string, kind: FinanceFeatureState['requests'][number]['kind'], resolve: () => T): T | null { const found = state.requests.find((item) => item.requestId === requestId); if (!found) return null; if (found.kind !== kind) throw new FinanceDomainError('CONFLICT', 'requestId 已被其他操作使用'); return resolve() }
function recordRequest(state: FinanceFeatureState, requestId: string, kind: FinanceFeatureState['requests'][number]['kind'], targetIds: string[], now: string): void { state.requests.push({ requestId, kind, targetIds, appliedAt: now }) }
function currentBalance(state: FinanceFeatureState, account: FundAccount, through?: string): number {
  return state.movements.filter((item) => item.accountId === account.id && (!through || item.occurredAt <= through)).reduce((balance, item) => balance + (item.direction === 'income' ? item.amountCents : -item.amountCents), account.openingBalanceCents)
}
function monthSnapshot(state: FinanceFeatureState, account: FundAccount, month: string, now: string): FinancePeriodSnapshot {
  const frozen = activePeriod(state, month)?.snapshots.find((item) => item.accountId === account.id)
  if (frozen) return structuredClone(frozen)
  const previous = state.periods.filter((item) => item.status === 'closed' && item.month < month).sort((a, b) => b.month.localeCompare(a.month))[0]?.snapshots.find((item) => item.accountId === account.id)
  const openingBalanceCents = month === account.openingMonth ? account.openingBalanceCents : previous?.closingBalanceCents ?? account.openingBalanceCents
  const movements = state.movements.filter((item) => item.accountId === account.id && monthPart(item.occurredAt) === month && item.occurredAt <= now)
  const incomeCents = movements.filter((item) => item.direction === 'income').reduce((sum, item) => sum + item.amountCents, 0)
  const expenseCents = movements.filter((item) => item.direction === 'expense').reduce((sum, item) => sum + item.amountCents, 0)
  return { accountId: account.id, openingBalanceCents, incomeCents, expenseCents, closingBalanceCents: openingBalanceCents + incomeCents - expenseCents }
}
function maskBank(value: string): string { const normalized = normalizeBankAccount(value); return `•••• ${normalized.slice(-4)}` }
function datePart(value: string): string { return value.slice(0, 10) }
function dateParts(value: string): [number, number, number] { const [year, month, day] = datePart(value).split('-').map(Number); return [year!, month!, day!] }
function dateFromUtc(value: Date): string { return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}` }
function addDays(value: string, days: number): string { const [year, month, day] = dateParts(value); return dateFromUtc(new Date(Date.UTC(year, month - 1, day + days))) }
function monthEnd(value: string): string { const [year, month] = dateParts(value); return dateFromUtc(new Date(Date.UTC(year, month, 0))) }
function ageDays(from: string, through: string): number { const [fy, fm, fd] = dateParts(from); const [ty, tm, td] = dateParts(through); return Math.max(0, Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)) }
function assertOccurredAt(value: string, now: string, label: string): void { if (!Number.isFinite(Date.parse(value)) || value > now) throw new FinanceValidationError([{ path: label, message: '时间无效或晚于当前时间' }]) }
function nextBusinessNo(state: FinanceFeatureState, kind: 'receivable' | 'receipt' | 'writeoff', at: string): string {
  const date = datePart(at); let sequence = state.dailySequences.find((item) => item.date === date)
  if (!sequence) { sequence = { date, receivable: 1, receipt: 1, writeoff: 1 }; state.dailySequences.push(sequence) }
  const current = sequence[kind]; sequence[kind] += 1
  const prefix = kind === 'receivable' ? 'YS' : kind === 'receipt' ? 'SK' : 'HX'
  return `${prefix}-${date.slice(2).replaceAll('-', '')}-${String(current).padStart(5, '0')}`
}
function writeoffAmounts(state: FinanceFeatureState, receivableId: string): { cash: number; discount: number } {
  const allocations = state.receiptWriteoffs.filter((item) => item.status === 'active').flatMap((item) => item.allocations).filter((item) => item.receivableId === receivableId)
  return { cash: allocations.reduce((sum, item) => sum + item.cashCents, 0), discount: allocations.reduce((sum, item) => sum + item.discountCents, 0) }
}
function projectReceivable(state: FinanceFeatureState, value: CustomerReceivable, now: string): ReceivableProjection {
  const settled = writeoffAmounts(state, value.id); const receivedCents = settled.cash + settled.discount; const outstandingCents = value.amountCents - receivedCents
  return { ...structuredClone(value), receivedCents, outstandingCents, status: outstandingCents === 0 ? 'settled' : receivedCents > 0 ? 'partial' : 'open', ageDays: ageDays(value.occurredAt, now), overdue: outstandingCents > 0 && datePart(now) > value.dueDate }
}
function sourceBalance(state: FinanceFeatureState, sourceId: string): number { return state.prepaymentLedger.filter((item) => item.sourceId === sourceId).reduce((sum, item) => sum + item.amountDeltaCents, 0) }
function sourceEntry(state: FinanceFeatureState, sourceId: string): CustomerPrepaymentLedgerEntry | undefined { return state.prepaymentLedger.find((item) => item.sourceId === sourceId && item.amountDeltaCents > 0) }
function maskPhone(value: string): string { const digits = value.replace(/\D/g, ''); return digits.length >= 7 ? `${digits.slice(0, 3)}****${digits.slice(-4)}` : '***' }

export function createFinanceService(deps: FinanceServiceDependencies) {
  const currentMonth = () => monthPart(deps.now())

  function appendMovement(state: FinanceFeatureState, actor: FinanceActor, input: Omit<PostFundMovementInput, 'requestId'> & { requestId: string }): FundMovement {
    assertOccurredAt(input.occurredAt, deps.now(), 'occurredAt'); const account = accountById(state, input.accountId); const month = monthPart(input.occurredAt)
    if (account.status !== 'enabled') throw new FinanceDomainError('INVALID_STATE', '停用账户不能产生新流水')
    if (month < account.openingMonth || activePeriod(state, month)) throw new FinanceDomainError('INVALID_STATE', '该月份尚未启用或已经结转')
    const latest = state.movements.filter((item) => item.accountId === account.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]
    if (latest && input.occurredAt < latest.occurredAt) throw new FinanceDomainError('INVALID_STATE', '不可在最新流水之前补写资金流水')
    const before = currentBalance(state, account); const after = before + (input.direction === 'income' ? input.amountCents : -input.amountCents)
    if (after < 0) throw new FinanceDomainError('INVALID_STATE', '账户余额不足')
    const value: FundMovement = { id: deps.nextId('movement'), enterpriseId: state.enterpriseId, accountId: account.id, direction: input.direction, kind: input.kind, amountCents: input.amountCents, balanceAfterCents: after, sourceId: input.sourceId.trim(), sourceNoSnapshot: input.sourceNo.trim(), counterpartySnapshot: input.counterparty?.trim() || null, summary: input.summary.trim(), requestId: input.requestId, operatorSnapshot: actorSnapshot(actor, deps), occurredAt: input.occurredAt }
    state.movements.push(value); return value
  }

  function buildWriteoff(state: FinanceFeatureState, actor: FinanceActor, requestId: string, customerId: string, occurredAt: string, inputs: Array<Omit<WriteoffAllocation, 'id'>>, noteValue?: string | null): ReceiptWriteoff {
    assertOccurredAt(occurredAt, deps.now(), 'occurredAt'); if (!inputs.length) throw new FinanceValidationError([{ path: 'allocations', message: '至少需要一条核销分配' }])
    const note = noteValue?.trim() || null; const pairKeys = inputs.map((item) => `${item.sourceKind}:${item.sourceId}:${item.receivableId}`)
    if (new Set(pairKeys).size !== pairKeys.length) throw new FinanceValidationError([{ path: 'allocations', message: '同一来源与应收不能重复' }])
    const sourceTotals = new Map<string, number>(); const targetTotals = new Map<string, number>(); let discountTotal = 0
    for (const input of inputs) {
      if (!Number.isSafeInteger(input.cashCents) || input.cashCents < 0 || !Number.isSafeInteger(input.discountCents) || input.discountCents < 0 || input.cashCents + input.discountCents <= 0) throw new FinanceValidationError([{ path: 'allocations', message: '现金与优惠必须是非负整数分且合计为正' }])
      const receivable = state.receivables.find((item) => item.id === input.receivableId); if (!receivable) throw new FinanceDomainError('NOT_FOUND', '待核销应收不存在')
      if (receivable.customerSnapshot.id !== customerId) throw new FinanceDomainError('INVALID_STATE', '只能核销同一客户的应收')
      if (occurredAt < receivable.occurredAt) throw new FinanceDomainError('INVALID_STATE', '核销日期不能早于应收形成日期')
      if (input.sourceKind === 'receipt') {
        const receipt = state.customerReceipts.find((item) => item.id === input.sourceId); if (!receipt || receipt.status !== 'normal') throw new FinanceDomainError('INVALID_STATE', '收款来源不存在或已作废')
        if (receipt.customerSnapshot.id !== customerId) throw new FinanceDomainError('INVALID_STATE', '只能使用同一客户的收款')
        if (occurredAt < receipt.occurredAt) throw new FinanceDomainError('INVALID_STATE', '核销日期不能早于收款日期')
      } else {
        const entry = sourceEntry(state, input.sourceId); if (!entry || entry.customerId !== customerId) throw new FinanceDomainError('INVALID_STATE', '预收来源不存在或客户不一致')
        if (occurredAt < entry.occurredAt) throw new FinanceDomainError('INVALID_STATE', '核销日期不能早于预收来源日期')
        if (entry.bucket === 'occupied' && entry.orderId !== receivable.orderId) throw new FinanceDomainError('INVALID_STATE', '订单占用预收只能核销绑定订单')
      }
      sourceTotals.set(input.sourceId, (sourceTotals.get(input.sourceId) ?? 0) + input.cashCents)
      targetTotals.set(input.receivableId, (targetTotals.get(input.receivableId) ?? 0) + input.cashCents + input.discountCents)
      discountTotal += input.discountCents
    }
    if (discountTotal > 0 && !note) throw new FinanceValidationError([{ path: 'note', message: '使用优惠核销时备注必填' }])
    for (const [sourceId, amount] of sourceTotals) if (amount > sourceBalance(state, sourceId)) throw new FinanceDomainError('INVALID_STATE', '核销金额超过来源可用余额')
    for (const [receivableId, amount] of targetTotals) {
      const receivable = state.receivables.find((item) => item.id === receivableId)!; if (amount > projectReceivable(state, receivable, deps.now()).outstandingCents) throw new FinanceDomainError('INVALID_STATE', '核销金额超过应收待收金额')
    }
    const allocations: WriteoffAllocation[] = inputs.map((item) => ({ ...item, id: deps.nextId('allocation') }))
    const cashCents = allocations.reduce((sum, item) => sum + item.cashCents, 0); const discountCents = allocations.reduce((sum, item) => sum + item.discountCents, 0)
    const value: ReceiptWriteoff = { id: deps.nextId('writeoff'), enterpriseId: state.enterpriseId, writeoffNo: nextBusinessNo(state, 'writeoff', occurredAt), customerId, occurredAt, allocations, cashCents, discountCents, amountCents: cashCents + discountCents, note, status: 'active', cancelInfo: null, requestId, operatorSnapshot: actorSnapshot(actor, deps), version: 1 }
    state.receiptWriteoffs.push(value)
    for (const allocation of allocations.filter((item) => item.cashCents > 0)) {
      const original = sourceEntry(state, allocation.sourceId)!; state.prepaymentLedger.push({ id: deps.nextId('prepayment'), enterpriseId: state.enterpriseId, customerId, bucket: original.bucket, orderId: original.orderId, sourceType: 'writeoff', sourceId: allocation.sourceId, amountDeltaCents: -allocation.cashCents, occurredAt, requestId })
    }
    return value
  }

  function listAccounts(actor: FinanceActor, month = currentMonth()): FinanceAccountPeriodRow[] {
    permission(actor, 'finance.view-accounts'); assertMonth(month, currentMonth()); const state = deps.repository.read()
    return state.accounts.filter((item) => item.openingMonth <= month).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map((account) => {
      const snapshot = monthSnapshot(state, account, month, deps.now()); const bank = state.banks.find((item) => item.accountId === account.id)
      return { account: structuredClone(account), month, openingBalanceCents: snapshot.openingBalanceCents, periodIncomeCents: snapshot.incomeCents, periodExpenseCents: snapshot.expenseCents, closingBalanceCents: snapshot.closingBalanceCents, bankAccountMasked: bank ? maskBank(bank.bankAccount) : null }
    })
  }

  function getAccountDetail(actor: FinanceActor, accountId: string, month = currentMonth()): FinanceAccountDetail {
    permission(actor, 'finance.view-accounts'); permission(actor, 'finance.view-ledger'); const row = listAccounts(actor, month).find((item) => item.account.id === accountId)
    if (!row) throw new FinanceDomainError('NOT_FOUND', '资金账户不存在')
    const state = deps.repository.read(); const bank = state.banks.find((item) => item.accountId === accountId) ?? null
    const visibleBank = bank ? { ...structuredClone(bank), bankAccount: ['super-admin', 'finance'].includes(actor.role) ? bank.bankAccount : maskBank(bank.bankAccount) } : null
    return { ...row, movements: state.movements.filter((item) => item.accountId === accountId && monthPart(item.occurredAt) === month).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)), bank: visibleBank }
  }

  function listPeriodCards(actor: FinanceActor, year: number): FinancePeriodCard[] {
    permission(actor, 'finance.carryover'); const state = deps.repository.read(); const current = currentMonth()
    return Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, '0')}`; const closed = activePeriod(state, month); const record = closed ?? state.periods.filter((item) => item.month === month).sort((a, b) => b.version - a.version)[0] ?? null
      return { month, status: month < state.bookStartMonth || month > current ? 'unavailable' : closed ? 'closed' : 'open', period: record ? structuredClone(record) : null }
    })
  }

  function listBanks(actor: FinanceActor): VisibleBankProfile[] { permission(actor, 'finance.manage-banks'); deps.assertBankProvider?.(); return deps.repository.read().banks.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map((item) => structuredClone(item)) }
  function listPaymentChannels(actor: FinanceActor) { permission(actor, 'finance.manage-payment-channels'); deps.assertPaymentProvider?.(); const state = deps.repository.read(); return state.paymentChannels.map((channel) => ({ ...structuredClone(channel), application: state.paymentApplications.find((item) => item.channelId === channel.id) ?? null })) }

  function saveAccount(actor: FinanceActor, input: SaveFinanceAccountInput): FundAccount {
    permission(actor, 'finance.manage-accounts'); assertFinanceAccountDraft(input.draft); const now = deps.now()
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, 'account-save', () => accountById(state, state.requests.find((item) => item.requestId === input.requestId)!.targetIds[0]!)); if (prior) return prior
      assertMonth(input.draft.openingMonth, currentMonth()); if (input.draft.openingMonth < state.bookStartMonth) throw new FinanceDomainError('INVALID_STATE', '账户启用月份不能早于账套启用月')
      if (state.accounts.some((item) => item.id !== input.accountId && normalize(item.name) === normalize(input.draft.name))) throw new FinanceDomainError('DUPLICATE', '资金账户名称已存在')
      const clean = { ...input.draft, name: input.draft.name.trim() }; const existing = input.accountId ? accountById(state, input.accountId) : null
      if (existing && input.expectedUpdatedAt !== existing.updatedAt) throw new FinanceDomainError('CONFLICT', '账户已被更新，请刷新后重试')
      if (existing && (existing.type !== clean.type || existing.openingMonth !== clean.openingMonth || existing.openingBalanceCents !== clean.openingBalanceCents)) {
        if (state.movements.some((item) => item.accountId === existing.id) || state.periods.some((item) => item.snapshots.some((snapshot) => snapshot.accountId === existing.id))) throw new FinanceDomainError('INVALID_STATE', '已有流水或结转后不能修改类型或期初资料')
      }
      const value: FundAccount = existing ? { ...existing, ...clean, updatedAt: now, version: existing.version + 1 } : { ...clean, id: deps.nextId('account'), enterpriseId: state.enterpriseId, createdAt: now, updatedAt: now, version: 1 }
      if (existing) state.accounts[state.accounts.findIndex((item) => item.id === existing.id)] = value; else state.accounts.push(value)
      state.version += 1; recordRequest(state, input.requestId, 'account-save', [value.id], now); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'account.saved', targetId: value.id, operatorSnapshot: actorSnapshot(actor, deps), detail: existing ? '编辑资金账户' : '新增资金账户', createdAt: now }); return value
    })
  }

  function postMovement(actor: FinanceActor, input: PostFundMovementInput): FundMovement {
    permission(actor, 'finance.manage-accounts'); if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new FinanceValidationError([{ path: 'amountCents', message: '必须是正整数分' }]); if (!input.sourceId.trim() || !input.sourceNo.trim() || !input.summary.trim()) throw new FinanceValidationError([{ path: 'movement', message: '来源与摘要不能为空' }])
    if (!Number.isFinite(Date.parse(input.occurredAt)) || input.occurredAt > deps.now()) throw new FinanceValidationError([{ path: 'occurredAt', message: '时间无效或晚于当前时间' }])
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, 'movement-post', () => state.movements.find((item) => item.id === state.requests.find((entry) => entry.requestId === input.requestId)!.targetIds[0])!); if (prior) return prior
      const account = accountById(state, input.accountId); const month = monthPart(input.occurredAt)
      if (account.status !== 'enabled') throw new FinanceDomainError('INVALID_STATE', '停用账户不能产生新流水'); if (month < account.openingMonth || activePeriod(state, month)) throw new FinanceDomainError('INVALID_STATE', '该月份尚未启用或已经结转')
      const latest = state.movements.filter((item) => item.accountId === account.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]
      if (latest && input.occurredAt < latest.occurredAt) throw new FinanceDomainError('INVALID_STATE', '不可在最新流水之前补写资金流水')
      const before = currentBalance(state, account); const after = before + (input.direction === 'income' ? input.amountCents : -input.amountCents); if (after < 0) throw new FinanceDomainError('INVALID_STATE', '账户余额不足')
      const value: FundMovement = { id: deps.nextId('movement'), enterpriseId: state.enterpriseId, accountId: account.id, direction: input.direction, kind: input.kind, amountCents: input.amountCents, balanceAfterCents: after, sourceId: input.sourceId.trim(), sourceNoSnapshot: input.sourceNo.trim(), counterpartySnapshot: input.counterparty?.trim() || null, summary: input.summary.trim(), requestId: input.requestId, operatorSnapshot: actorSnapshot(actor, deps), occurredAt: input.occurredAt }
      state.movements.push(value); state.version += 1; recordRequest(state, input.requestId, 'movement-post', [value.id], deps.now()); return value
    })
  }

  function closePeriod(actor: FinanceActor, input: CloseFinancePeriodInput): FinancePeriod {
    permission(actor, 'finance.carryover'); assertMonth(input.month, currentMonth()); const now = deps.now()
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, 'period-close', () => state.periods.find((item) => item.id === state.requests.find((entry) => entry.requestId === input.requestId)!.targetIds[0])!); if (prior) return prior
      if (state.version !== input.expectedStateVersion) throw new FinanceDomainError('CONFLICT', '资金数据已变化，请刷新后重试')
      const latest = state.periods.filter((item) => item.status === 'closed').sort((a, b) => b.month.localeCompare(a.month))[0]
      const expected = latest ? addMonth(latest.month, 1) : state.bookStartMonth; if (input.month !== expected) throw new FinanceDomainError('INVALID_STATE', `必须按月连续结转，下一期间是 ${expected}`)
      const value: FinancePeriod = { id: deps.nextId('period'), enterpriseId: state.enterpriseId, month: input.month, status: 'closed', snapshots: state.accounts.filter((item) => item.openingMonth <= input.month).map((item) => monthSnapshot(state, item, input.month, now)), closedAt: now, closedBy: actorSnapshot(actor, deps), closeRequestId: input.requestId, reversedAt: null, reversedBy: null, reversalReason: null, reverseRequestId: null, version: 1 }
      state.periods.push(value); state.version += 1; recordRequest(state, input.requestId, 'period-close', [value.id], now); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'period.closed', targetId: value.id, operatorSnapshot: actorSnapshot(actor, deps), detail: `结转 ${input.month}`, createdAt: now }); return value
    })
  }

  function reversePeriod(actor: FinanceActor, input: ReverseFinancePeriodInput): FinancePeriod {
    permission(actor, 'finance.carryover'); const reason = input.reason.trim(); if (reason.length < 1 || reason.length > 200) throw new FinanceValidationError([{ path: 'reason', message: '必须为 1～200 个字符' }]); const now = deps.now()
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, 'period-reverse', () => state.periods.find((item) => item.id === state.requests.find((entry) => entry.requestId === input.requestId)!.targetIds[0])!); if (prior) return prior
      if (state.version !== input.expectedStateVersion) throw new FinanceDomainError('CONFLICT', '资金数据已变化，请刷新后重试')
      const latest = state.periods.filter((item) => item.status === 'closed').sort((a, b) => b.month.localeCompare(a.month))[0]
      if (!latest || latest.month !== input.month) throw new FinanceDomainError('INVALID_STATE', '只能反结转最新已结转月份')
      if (state.movements.some((item) => monthPart(item.occurredAt) > input.month)) throw new FinanceDomainError('INVALID_STATE', '存在后续资金流水，不能反结转')
      latest.status = 'reversed'; latest.reversedAt = now; latest.reversedBy = actorSnapshot(actor, deps); latest.reversalReason = reason; latest.reverseRequestId = input.requestId; latest.version += 1
      state.version += 1; recordRequest(state, input.requestId, 'period-reverse', [latest.id], now); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'period.reversed', targetId: latest.id, operatorSnapshot: actorSnapshot(actor, deps), detail: `反结转 ${input.month}：${reason}`, createdAt: now }); return latest
    })
  }

  function saveBank(actor: FinanceActor, input: SaveFinanceBankInput): BankProfile {
    permission(actor, 'finance.manage-banks'); deps.assertBankProvider?.(); assertFinanceBankDraft(input.draft); const now = deps.now()
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, 'bank-save', () => bankById(state, state.requests.find((item) => item.requestId === input.requestId)!.targetIds[0]!)); if (prior) return prior
      const account = accountById(state, input.draft.accountId); if (account.type !== 'bank') throw new FinanceDomainError('INVALID_STATE', '银行资料必须关联银行类型资金账户'); if (input.draft.status === 'enabled' && account.status !== 'enabled') throw new FinanceDomainError('INVALID_STATE', '启用银行资料必须关联启用账户')
      const clean = { ...input.draft, bankName: input.draft.bankName.trim(), accountName: input.draft.accountName.trim(), bankAccount: normalizeBankAccount(input.draft.bankAccount), branchName: input.draft.branchName.trim() }
      if (state.banks.some((item) => item.id !== input.bankId && (item.accountId === clean.accountId || normalizeBankAccount(item.bankAccount) === clean.bankAccount))) throw new FinanceDomainError('DUPLICATE', '该资金账户或银行账号已有银行资料')
      const existing = input.bankId ? bankById(state, input.bankId) : null; if (existing && input.expectedUpdatedAt !== existing.updatedAt) throw new FinanceDomainError('CONFLICT', '银行资料已被更新，请刷新后重试')
      const value: BankProfile = existing ? { ...existing, ...clean, updatedAt: now, version: existing.version + 1 } : { ...clean, id: deps.nextId('bank'), enterpriseId: state.enterpriseId, createdAt: now, updatedAt: now, version: 1 }
      if (existing) state.banks[state.banks.findIndex((item) => item.id === existing.id)] = value; else state.banks.push(value)
      state.version += 1; recordRequest(state, input.requestId, 'bank-save', [value.id], now); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'bank.saved', targetId: value.id, operatorSnapshot: actorSnapshot(actor, deps), detail: existing ? '编辑银行资料' : '新增银行资料', createdAt: now }); return value
    })
  }

  function submitPaymentApplication(actor: FinanceActor, input: SubmitPaymentApplicationInput) {
    permission(actor, 'finance.manage-payment-channels'); deps.assertPaymentProvider?.(); const now = deps.now()
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, 'payment-apply', () => state.paymentApplications.find((item) => item.id === state.requests.find((entry) => entry.requestId === input.requestId)!.targetIds[0])!); if (prior) return prior
      const channel = state.paymentChannels.find((item) => item.id === input.channelId); if (!channel) throw new FinanceDomainError('NOT_FOUND', '支付通道不存在'); if (channel.status !== 'unopened') throw new FinanceDomainError('INVALID_STATE', '支付通道已经开通'); if (state.paymentApplications.some((item) => item.channelId === channel.id)) throw new FinanceDomainError('INVALID_STATE', '已有模拟申请正在处理中')
      const value = { id: deps.nextId('application'), enterpriseId: state.enterpriseId, channelId: channel.id, status: 'simulated-pending' as const, requestId: input.requestId, applicantSnapshot: actorSnapshot(actor, deps), createdAt: now }
      state.paymentApplications.push(value); state.version += 1; recordRequest(state, input.requestId, 'payment-apply', [value.id], now); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'payment.application-created', targetId: value.id, operatorSnapshot: actorSnapshot(actor, deps), detail: `提交${channel.name}原型模拟申请，未发起外部请求`, createdAt: now }); return value
    })
  }

  function createOrderReceivable(input: CreateOrderReceivableInput): CustomerReceivable {
    assertOccurredAt(input.occurredAt, deps.now(), 'occurredAt')
    if (!input.requestId.trim() || !input.orderId.trim() || !input.orderNo.trim()) throw new FinanceValidationError([{ path: 'source', message: '请求与订单不能为空' }])
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || !Number.isSafeInteger(input.goodsAmountCents) || input.goodsAmountCents < 0 || !Number.isSafeInteger(input.freightCents) || input.freightCents < 0 || input.goodsAmountCents + input.freightCents !== input.amountCents) throw new FinanceValidationError([{ path: 'amountCents', message: '应收必须为正整数分且等于订货金额加运费' }])
    if (input.settlementMethod === 'terms' && (!Number.isSafeInteger(input.paymentTermDays) || input.paymentTermDays! < 1 || input.paymentTermDays! > 365)) throw new FinanceValidationError([{ path: 'paymentTermDays', message: '账期必须为 1～365 天' }])
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, 'receivable-create', () => state.receivables.find((item) => item.id === state.requests.find((entry) => entry.requestId === input.requestId)!.targetIds[0])!); if (prior) return prior
      if (state.receivables.some((item) => item.orderId === input.orderId)) throw new FinanceDomainError('DUPLICATE', '该订单已经形成应收')
      const formedDate = datePart(input.occurredAt); const dueDate = input.settlementMethod === 'cash' ? formedDate : input.settlementMethod === 'monthly' ? monthEnd(formedDate) : addDays(formedDate, input.paymentTermDays!)
      const value: CustomerReceivable = { id: deps.nextId('receivable'), enterpriseId: state.enterpriseId, receivableNo: nextBusinessNo(state, 'receivable', input.occurredAt), source: 'order-shipment', orderId: input.orderId, orderNo: input.orderNo.trim(), customerSnapshot: structuredClone(input.customerSnapshot), items: structuredClone(input.items), goodsAmountCents: input.goodsAmountCents, freightCents: input.freightCents, amountCents: input.amountCents, settlementMethod: input.settlementMethod, paymentTermDays: input.settlementMethod === 'terms' ? input.paymentTermDays : null, dueDate, occurredAt: input.occurredAt, requestId: input.requestId, createdBy: structuredClone(input.operator), version: 1 }
      state.receivables.push(value); state.version += 1; recordRequest(state, input.requestId, 'receivable-create', [value.id], deps.now()); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'receivable.created', targetId: value.id, operatorSnapshot: structuredClone(value.createdBy), detail: `订单 ${value.orderNo} 发货形成应收 ${value.receivableNo}`, createdAt: deps.now() }); return value
    })
  }

  function listReceivableDocuments(actor: FinanceActor, query: { keyword?: string; startDate?: string; endDate?: string } = {}): ReceivableProjection[] {
    permission(actor, 'finance.view-receivable-details'); const keyword = normalize(query.keyword ?? ''); const state = deps.repository.read()
    return state.receivables.filter((item) => (!keyword || [item.receivableNo, item.orderNo, item.customerSnapshot.code, item.customerSnapshot.name].some((value) => normalize(value).includes(keyword))) && (!query.startDate || datePart(item.occurredAt) >= query.startDate) && (!query.endDate || datePart(item.occurredAt) <= query.endDate)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id)).map((item) => {
      const projected = projectReceivable(state, item, deps.now()); if (actor.role === 'sales-supervisor') projected.customerSnapshot.phone = maskPhone(projected.customerSnapshot.phone); return projected
    })
  }

  function listCustomerReceivables(actor: FinanceActor, query: { keyword?: string; startDate?: string; endDate?: string } = {}): CustomerReceivableSummary[] {
    permission(actor, 'finance.view-receivables'); const documents = listReceivableDocuments({ ...actor, permissions: [...(actor.permissions ?? rolePermissions[actor.role]), 'finance.view-receivable-details'] }, query); const state = deps.repository.read(); const groups = new Map<string, ReceivableProjection[]>()
    documents.forEach((item) => groups.set(item.customerSnapshot.id, [...(groups.get(item.customerSnapshot.id) ?? []), item]))
    return [...groups.values()].map((items) => { const customer = structuredClone(items[0]!.customerSnapshot); const receivableIds = new Set(items.map((item) => item.id)); const lastReceiptDate = state.receiptWriteoffs.filter((item) => item.status === 'active' && item.allocations.some((part) => receivableIds.has(part.receivableId))).map((item) => item.occurredAt).sort().at(-1) ?? null; return { customer, receivableCents: items.reduce((sum, item) => sum + item.amountCents, 0), receivedCents: items.reduce((sum, item) => sum + item.receivedCents, 0), outstandingCents: items.reduce((sum, item) => sum + item.outstandingCents, 0), oldestAgeDays: Math.max(0, ...items.filter((item) => item.outstandingCents > 0).map((item) => item.ageDays)), lastReceiptDate } }).sort((a, b) => b.outstandingCents - a.outstandingCents || a.customer.id.localeCompare(b.customer.id))
  }

  function listReceivableProducts(actor: FinanceActor, query: { keyword?: string; startDate?: string; endDate?: string } = {}): ReceivableProductRow[] {
    return listReceivableDocuments(actor, query).flatMap((receivable) => receivable.items.map((item) => ({ ...structuredClone(item), receivableId: receivable.id, receivableNo: receivable.receivableNo, occurredAt: receivable.occurredAt, orderId: receivable.orderId, orderNo: receivable.orderNo, customer: structuredClone(receivable.customerSnapshot), status: receivable.status })))
  }

  function listReceivableAging(actor: FinanceActor): ReceivableAgingRow[] {
    permission(actor, 'finance.view-aging'); const documents = listReceivableDocuments({ ...actor, permissions: [...(actor.permissions ?? rolePermissions[actor.role]), 'finance.view-receivable-details'] }); const groups = new Map<string, ReceivableProjection[]>()
    documents.filter((item) => item.outstandingCents > 0).forEach((item) => groups.set(item.customerSnapshot.id, [...(groups.get(item.customerSnapshot.id) ?? []), item]))
    return [...groups.values()].map((items) => { const row: ReceivableAgingRow = { customer: structuredClone(items[0]!.customerSnapshot), outstandingCents: 0, bucket0To30Cents: 0, bucket31To60Cents: 0, bucket61To90Cents: 0, bucket91To180Cents: 0, bucket181To365Cents: 0, bucketOver365Cents: 0 }; for (const item of items) { row.outstandingCents += item.outstandingCents; if (item.ageDays <= 30) row.bucket0To30Cents += item.outstandingCents; else if (item.ageDays <= 60) row.bucket31To60Cents += item.outstandingCents; else if (item.ageDays <= 90) row.bucket61To90Cents += item.outstandingCents; else if (item.ageDays <= 180) row.bucket91To180Cents += item.outstandingCents; else if (item.ageDays <= 365) row.bucket181To365Cents += item.outstandingCents; else row.bucketOver365Cents += item.outstandingCents } return row }).sort((a, b) => b.outstandingCents - a.outstandingCents)
  }

  function exportReceivables(actor: FinanceActor): string {
    permission(actor, 'finance.export-receivables'); const rows = listCustomerReceivables(actor); const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    return ['客户编码,客户名称,联系电话,应收金额(分),已收金额(分),待收金额(分),账期天数,最后收款日期', ...rows.map((row) => [row.customer.code, row.customer.name, row.customer.phone, row.receivableCents, row.receivedCents, row.outstandingCents, row.oldestAgeDays, row.lastReceiptDate ? datePart(row.lastReceiptDate) : ''].map(escape).join(','))].join('\n')
  }

  function listSettlementSources(actor: FinanceActor, customerId: string): SettlementSource[] {
    permission(actor, 'finance.view-writeoffs'); const state = deps.repository.read(); const positives = state.prepaymentLedger.filter((item) => item.customerId === customerId && item.amountDeltaCents > 0)
    return positives.map((entry): SettlementSource => ({ kind: entry.sourceType === 'receipt' ? 'receipt' : 'prepayment', id: entry.sourceId, label: entry.sourceType === 'receipt' ? state.customerReceipts.find((item) => item.id === entry.sourceId)?.receiptNo ?? entry.sourceId : entry.bucket === 'occupied' ? `订单占用预收 ${entry.orderId}` : '可用预收', customerId, availableCents: sourceBalance(state, entry.sourceId), occurredAt: entry.occurredAt, orderId: entry.orderId, bucket: entry.bucket })).filter((item) => item.availableCents > 0).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
  }

  function listReceipts(actor: FinanceActor): Array<CustomerReceipt & { allocatedCents: number; availableCents: number }> {
    permission(actor, 'finance.view-receipts'); const state = deps.repository.read(); return state.customerReceipts.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id)).map((item) => { const value = structuredClone(item); if (actor.role === 'sales-supervisor') value.customerSnapshot.phone = maskPhone(value.customerSnapshot.phone); const availableCents = Math.max(0, sourceBalance(state, item.id)); return { ...value, allocatedCents: item.status === 'void' ? 0 : item.amountCents - availableCents, availableCents } })
  }

  function getReceipt(actor: FinanceActor, receiptId: string) { const value = listReceipts(actor).find((item) => item.id === receiptId); if (!value) throw new FinanceDomainError('NOT_FOUND', '收款单不存在'); return value }
  function listWriteoffs(actor: FinanceActor): ReceiptWriteoff[] { permission(actor, 'finance.view-writeoffs'); return deps.repository.read().receiptWriteoffs.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id)).map((item) => structuredClone(item)) }
  function getWriteoff(actor: FinanceActor, writeoffId: string): ReceiptWriteoff { const value = listWriteoffs(actor).find((item) => item.id === writeoffId); if (!value) throw new FinanceDomainError('NOT_FOUND', '核销单不存在'); return value }

  function createReceipt(actor: FinanceActor, input: CreateCustomerReceiptInput): { receipt: CustomerReceipt; writeoff: ReceiptWriteoff | null } {
    permission(actor, 'finance.manage-receipts'); assertOccurredAt(input.occurredAt, deps.now(), 'occurredAt')
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new FinanceValidationError([{ path: 'amountCents', message: '必须是正整数分' }])
    if (input.attachment && (input.attachment.sizeBytes < 1 || input.attachment.sizeBytes > 5 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(input.attachment.mimeType) || !/(mock|demo|fake|演示|虚构)/i.test(input.attachment.name))) throw new FinanceValidationError([{ path: 'attachment', message: '仅允许单个不超过 5MB 的虚构 pdf/jpg/png 元数据' }])
    return deps.repository.transact((state) => {
      const prior = replay(state, input.requestId, 'receipt-create', () => { const targets = state.requests.find((item) => item.requestId === input.requestId)!.targetIds; return { receipt: state.customerReceipts.find((item) => item.id === targets[0])!, writeoff: state.receiptWriteoffs.find((item) => item.id === targets[1]) ?? null } }); if (prior) return prior
      let account: FundAccount | null = null
      if (input.method === 'balance') { if (input.accountId) throw new FinanceValidationError([{ path: 'accountId', message: '余额方式不能选择资金账户' }]); if (!input.immediateAllocations?.length || input.immediateAllocations.some((item) => !item.prepaymentSourceId)) throw new FinanceValidationError([{ path: 'immediateAllocations', message: '余额方式必须立即选择预收来源和应收' }]) }
      else { if (!input.accountId) throw new FinanceValidationError([{ path: 'accountId', message: '真实收款方式必须选择资金账户' }]); account = accountById(state, input.accountId); if (account.type !== input.method || account.status !== 'enabled') throw new FinanceDomainError('INVALID_STATE', '收款账户必须启用且类型与收款方式一致'); if (input.method === 'bank' && !state.banks.some((item) => item.accountId === account!.id && item.status === 'enabled')) throw new FinanceDomainError('INVALID_STATE', '银行转账账户缺少启用银行资料') }
      const receiptId = deps.nextId('receipt'); const receiptNo = nextBusinessNo(state, 'receipt', input.occurredAt); let movement: FundMovement | null = null
      if (account) movement = appendMovement(state, actor, { requestId: `${input.requestId}:movement`, accountId: account.id, direction: 'income', kind: 'receipt', amountCents: input.amountCents, sourceId: receiptId, sourceNo: receiptNo, counterparty: input.customerSnapshot.name, summary: `客户收款 ${receiptNo}`, occurredAt: input.occurredAt })
      const receipt: CustomerReceipt = { id: receiptId, enterpriseId: state.enterpriseId, receiptNo, customerSnapshot: structuredClone(input.customerSnapshot), orderId: input.orderId ?? null, occurredAt: input.occurredAt, amountCents: input.amountCents, method: input.method, accountId: account?.id ?? null, movementId: movement?.id ?? null, attachment: input.attachment ? structuredClone(input.attachment) : null, note: input.note?.trim() || null, status: 'normal', voidInfo: null, requestId: input.requestId, operatorSnapshot: actorSnapshot(actor, deps), version: 1 }
      state.customerReceipts.push(receipt)
      if (account) state.prepaymentLedger.push({ id: deps.nextId('prepayment'), enterpriseId: state.enterpriseId, customerId: input.customerSnapshot.id, bucket: 'available', orderId: null, sourceType: 'receipt', sourceId: receipt.id, amountDeltaCents: receipt.amountCents, occurredAt: receipt.occurredAt, requestId: input.requestId })
      let writeoff: ReceiptWriteoff | null = null
      if (input.immediateAllocations?.length) {
        const allocations = input.immediateAllocations.map((item) => ({ sourceKind: input.method === 'balance' ? 'prepayment' as const : 'receipt' as const, sourceId: input.method === 'balance' ? item.prepaymentSourceId! : receipt.id, receivableId: item.receivableId, cashCents: item.cashCents, discountCents: item.discountCents }))
        const cash = allocations.reduce((sum, item) => sum + item.cashCents, 0); if (cash > input.amountCents || (input.method === 'balance' && cash !== input.amountCents)) throw new FinanceDomainError('INVALID_STATE', '立即核销现金金额与本次收款金额不一致')
        writeoff = buildWriteoff(state, actor, `${input.requestId}:writeoff`, input.customerSnapshot.id, input.occurredAt, allocations, input.note)
      }
      state.version += 1; recordRequest(state, input.requestId, 'receipt-create', [receipt.id, ...(writeoff ? [writeoff.id] : [])], deps.now()); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'receipt.created', targetId: receipt.id, operatorSnapshot: actorSnapshot(actor, deps), detail: `确认收款 ${receipt.receiptNo}${writeoff ? ` 并核销 ${writeoff.writeoffNo}` : ''}`, createdAt: deps.now() }); return { receipt, writeoff }
    })
  }

  function createWriteoff(actor: FinanceActor, input: CreateReceiptWriteoffInput): ReceiptWriteoff {
    permission(actor, 'finance.manage-writeoffs'); return deps.repository.transact((state) => { const prior = replay(state, input.requestId, 'writeoff-create', () => state.receiptWriteoffs.find((item) => item.id === state.requests.find((entry) => entry.requestId === input.requestId)!.targetIds[0])!); if (prior) return prior; const value = buildWriteoff(state, actor, input.requestId, input.customerId, input.occurredAt, input.allocations, input.note); state.version += 1; recordRequest(state, input.requestId, 'writeoff-create', [value.id], deps.now()); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'writeoff.created', targetId: value.id, operatorSnapshot: actorSnapshot(actor, deps), detail: `新增收款核销 ${value.writeoffNo}`, createdAt: deps.now() }); return value })
  }

  function voidReceipt(actor: FinanceActor, input: VoidCustomerReceiptInput): CustomerReceipt {
    permission(actor, 'finance.manage-receipts'); const reason = input.reason.trim(); if (reason.length < 1 || reason.length > 200) throw new FinanceValidationError([{ path: 'reason', message: '必须为 1～200 个字符' }]); const now = deps.now()
    return deps.repository.transact((state) => { const prior = replay(state, input.requestId, 'receipt-void', () => state.customerReceipts.find((item) => item.id === state.requests.find((entry) => entry.requestId === input.requestId)!.targetIds[0])!); if (prior) return prior; const receipt = state.customerReceipts.find((item) => item.id === input.receiptId); if (!receipt) throw new FinanceDomainError('NOT_FOUND', '收款单不存在'); if (receipt.version !== input.expectedVersion) throw new FinanceDomainError('CONFLICT', '收款单已变化，请刷新'); if (receipt.status !== 'normal') throw new FinanceDomainError('INVALID_STATE', '收款单已经作废'); if (monthPart(receipt.occurredAt) !== currentMonth() || activePeriod(state, monthPart(receipt.occurredAt))) throw new FinanceDomainError('INVALID_STATE', '只能作废当前开放自然月的收款'); if (state.receiptWriteoffs.some((item) => item.status === 'active' && item.allocations.some((part) => part.sourceKind === 'receipt' && part.sourceId === receipt.id))) throw new FinanceDomainError('INVALID_STATE', '存在有效核销的收款不能作废'); if (sourceBalance(state, receipt.id) !== receipt.amountCents && receipt.method !== 'balance') throw new FinanceDomainError('CONFLICT', '收款可用余额已变化，请刷新')
      let reversal: FundMovement | null = null; if (receipt.accountId) reversal = appendMovement(state, actor, { requestId: `${input.requestId}:movement`, accountId: receipt.accountId, direction: 'expense', kind: 'receipt', amountCents: receipt.amountCents, sourceId: receipt.id, sourceNo: receipt.receiptNo, counterparty: receipt.customerSnapshot.name, summary: `作废收款 ${receipt.receiptNo}：${reason}`, occurredAt: now }); if (receipt.method !== 'balance') state.prepaymentLedger.push({ id: deps.nextId('prepayment'), enterpriseId: state.enterpriseId, customerId: receipt.customerSnapshot.id, bucket: 'available', orderId: null, sourceType: 'receipt-void', sourceId: receipt.id, amountDeltaCents: -receipt.amountCents, occurredAt: now, requestId: input.requestId }); receipt.status = 'void'; receipt.voidInfo = { reason, voidedAt: now, voidedBy: actorSnapshot(actor, deps), reversalMovementId: reversal?.id ?? null }; receipt.version += 1; state.version += 1; recordRequest(state, input.requestId, 'receipt-void', [receipt.id], now); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'receipt.voided', targetId: receipt.id, operatorSnapshot: actorSnapshot(actor, deps), detail: `作废收款 ${receipt.receiptNo}：${reason}`, createdAt: now }); return receipt })
  }

  function cancelWriteoff(actor: FinanceActor, input: CancelReceiptWriteoffInput): ReceiptWriteoff {
    permission(actor, 'finance.manage-writeoffs'); const reason = input.reason.trim(); if (reason.length < 1 || reason.length > 200) throw new FinanceValidationError([{ path: 'reason', message: '必须为 1～200 个字符' }]); const now = deps.now()
    return deps.repository.transact((state) => { const prior = replay(state, input.requestId, 'writeoff-cancel', () => state.receiptWriteoffs.find((item) => item.id === state.requests.find((entry) => entry.requestId === input.requestId)!.targetIds[0])!); if (prior) return prior; const value = state.receiptWriteoffs.find((item) => item.id === input.writeoffId); if (!value) throw new FinanceDomainError('NOT_FOUND', '核销单不存在'); if (value.version !== input.expectedVersion) throw new FinanceDomainError('CONFLICT', '核销单已变化，请刷新'); if (value.status !== 'active') throw new FinanceDomainError('INVALID_STATE', '核销单已经取消'); for (const allocation of value.allocations.filter((item) => item.cashCents > 0)) { const original = sourceEntry(state, allocation.sourceId); if (!original) throw new FinanceDomainError('CONFLICT', '核销来源已变化'); state.prepaymentLedger.push({ id: deps.nextId('prepayment'), enterpriseId: state.enterpriseId, customerId: value.customerId, bucket: original.bucket, orderId: original.orderId, sourceType: 'writeoff-cancel', sourceId: allocation.sourceId, amountDeltaCents: allocation.cashCents, occurredAt: now, requestId: input.requestId }) } value.status = 'cancelled'; value.cancelInfo = { reason, cancelledAt: now, cancelledBy: actorSnapshot(actor, deps) }; value.version += 1; state.version += 1; recordRequest(state, input.requestId, 'writeoff-cancel', [value.id], now); state.auditLogs.push({ id: deps.nextId('audit'), enterpriseId: state.enterpriseId, action: 'writeoff.cancelled', targetId: value.id, operatorSnapshot: actorSnapshot(actor, deps), detail: `取消核销 ${value.writeoffNo}：${reason}`, createdAt: now }); return value })
  }

  function getOrderSettlement(orderId: string): OrderSettlementProjection | null { const state = deps.repository.read(); const receivable = state.receivables.find((item) => item.orderId === orderId); if (!receivable) return null; const writeoffs = state.receiptWriteoffs.filter((item) => item.allocations.some((part) => part.receivableId === receivable.id)); const receiptIds = new Set(writeoffs.flatMap((item) => item.allocations.filter((part) => part.sourceKind === 'receipt').map((part) => part.sourceId))); return { receivable: projectReceivable(state, receivable, deps.now()), receipts: state.customerReceipts.filter((item) => receiptIds.has(item.id) || item.orderId === orderId).map((item) => structuredClone(item)), writeoffs: writeoffs.map((item) => structuredClone(item)) } }

  return { listAccounts, getAccountDetail, listPeriodCards, listBanks, listPaymentChannels, saveAccount, postMovement, closePeriod, reversePeriod, saveBank, submitPaymentApplication, createOrderReceivable, listCustomerReceivables, listReceivableDocuments, listReceivableProducts, listReceivableAging, exportReceivables, listSettlementSources, listReceipts, getReceipt, listWriteoffs, getWriteoff, createReceipt, createWriteoff, voidReceipt, cancelWriteoff, getOrderSettlement }
}
