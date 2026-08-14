import type { FinanceRepository } from '../repositories/finance-repository'
import { assertFinanceAccountDraft, assertFinanceBankDraft, FinanceValidationError } from '../schemas/finance-schema'
import type {
  ActorSnapshot, BankProfile, CloseFinancePeriodInput, EntityId, FinanceAccountDetail, FinanceAccountPeriodRow,
  FinanceActor, FinanceFeatureState, FinancePermission, FinancePeriod, FinancePeriodCard, FinancePeriodSnapshot,
  FundAccount, FundMovement, PostFundMovementInput, ReverseFinancePeriodInput, SaveFinanceAccountInput,
  SaveFinanceBankInput, SubmitPaymentApplicationInput, VisibleBankProfile,
} from '../types'

export type FinanceDomainErrorCode = 'PERMISSION_DENIED' | 'NOT_FOUND' | 'DUPLICATE' | 'INVALID_STATE' | 'CONFLICT' | 'DATA_PROVIDER_UNAVAILABLE'
export class FinanceDomainError extends Error {
  constructor(readonly code: FinanceDomainErrorCode, message: string) { super(message); this.name = 'FinanceDomainError' }
}

export interface FinanceServiceDependencies {
  repository: FinanceRepository
  now: () => string
  nextId: (kind: 'account' | 'movement' | 'period' | 'bank' | 'application' | 'audit') => string
  actorName?: (actor: FinanceActor) => string
  assertBankProvider?: () => void
  assertPaymentProvider?: () => void
}

const rolePermissions: Record<FinanceActor['role'], FinancePermission[]> = {
  'super-admin': ['finance.view-accounts', 'finance.manage-accounts', 'finance.view-ledger', 'finance.carryover', 'finance.manage-banks', 'finance.manage-payment-channels'],
  finance: ['finance.view-accounts', 'finance.manage-accounts', 'finance.view-ledger', 'finance.carryover', 'finance.manage-banks', 'finance.manage-payment-channels'],
  'sales-supervisor': ['finance.view-accounts', 'finance.view-ledger'], salesperson: [], warehouse: [],
}
const normalize = (value: string) => value.trim().toLocaleLowerCase()
const normalizeBankAccount = (value: string) => value.replace(/\s+/g, '')
const monthPart = (value: string) => value.slice(0, 7)
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/

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

export function createFinanceService(deps: FinanceServiceDependencies) {
  const currentMonth = () => monthPart(deps.now())

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

  return { listAccounts, getAccountDetail, listPeriodCards, listBanks, listPaymentChannels, saveAccount, postMovement, closePeriod, reversePeriod, saveBank, submitPaymentApplication }
}
