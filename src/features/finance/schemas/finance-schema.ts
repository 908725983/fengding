import type { FinanceAccountDraft, FinanceBankDraft, FinanceFeatureState } from '../types'

export interface FinanceValidationIssue { path: string; message: string }
export class FinanceValidationError extends Error {
  readonly code = 'FINANCE_VALIDATION_FAILED'
  constructor(readonly issues: FinanceValidationIssue[]) { super(issues.map((item) => `${item.path}: ${item.message}`).join('；')); this.name = 'FinanceValidationError' }
}

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const accountTypes = new Set(['cash', 'bank', 'wechat', 'alipay'])
const entityStatuses = new Set(['enabled', 'disabled'])
const directions = new Set(['income', 'expense'])
const kinds = new Set(['receipt', 'payment', 'transfer-in', 'transfer-out', 'refund', 'other-income', 'other-expense', 'prototype'])
const requestKinds = new Set(['account-save', 'movement-post', 'period-close', 'period-reverse', 'bank-save', 'payment-apply'])

function required(issues: FinanceValidationIssue[], path: string, value: unknown, max = 100): void {
  if (typeof value !== 'string' || !value.trim()) issues.push({ path, message: '不能为空' })
  else if (value.trim().length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}
function money(issues: FinanceValidationIssue[], path: string, value: number, positive = false): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) issues.push({ path, message: `必须是${positive ? '正' : '非负'}整数分` })
}
function iso(issues: FinanceValidationIssue[], path: string, value: string | null): void { if (value !== null && !Number.isFinite(Date.parse(value))) issues.push({ path, message: '必须是 ISO 日期时间' }) }
function unique<T>(issues: FinanceValidationIssue[], path: string, values: T[]): void { if (new Set(values).size !== values.length) issues.push({ path, message: '必须唯一' }) }
const normalize = (value: string) => value.trim().toLocaleLowerCase()
const normalizeBankAccount = (value: string) => value.replace(/\s+/g, '')

export function validateFinanceAccountDraft(draft: FinanceAccountDraft): FinanceValidationIssue[] {
  const issues: FinanceValidationIssue[] = []
  required(issues, 'name', draft.name, 80)
  if (!accountTypes.has(draft.type)) issues.push({ path: 'type', message: '账户类型无效' })
  if (!entityStatuses.has(draft.status)) issues.push({ path: 'status', message: '状态无效' })
  if (!monthPattern.test(draft.openingMonth)) issues.push({ path: 'openingMonth', message: '必须为 YYYY-MM' })
  money(issues, 'openingBalanceCents', draft.openingBalanceCents)
  return issues
}
export function assertFinanceAccountDraft(draft: FinanceAccountDraft): void { const issues = validateFinanceAccountDraft(draft); if (issues.length) throw new FinanceValidationError(issues) }

export function validateFinanceBankDraft(draft: FinanceBankDraft): FinanceValidationIssue[] {
  const issues: FinanceValidationIssue[] = []
  required(issues, 'accountId', draft.accountId); required(issues, 'bankName', draft.bankName, 100); required(issues, 'accountName', draft.accountName, 100)
  required(issues, 'bankAccount', draft.bankAccount, 64); required(issues, 'branchName', draft.branchName, 120)
  const normalized = normalizeBankAccount(draft.bankAccount)
  if (normalized.length < 4 || normalized.length > 64) issues.push({ path: 'bankAccount', message: '去空格后长度必须为 4～64' })
  if (!['corporate', 'personal'].includes(draft.accountKind)) issues.push({ path: 'accountKind', message: '账户类型无效' })
  if (!entityStatuses.has(draft.status)) issues.push({ path: 'status', message: '状态无效' })
  return issues
}
export function assertFinanceBankDraft(draft: FinanceBankDraft): void { const issues = validateFinanceBankDraft(draft); if (issues.length) throw new FinanceValidationError(issues) }

export function assertFinanceFeatureState(state: FinanceFeatureState): void {
  const issues: FinanceValidationIssue[] = []
  if (state.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: '必须为 1' })
  required(issues, 'enterpriseId', state.enterpriseId)
  if (!Number.isSafeInteger(state.version) || state.version < 1) issues.push({ path: 'version', message: '必须是正整数' })
  if (!monthPattern.test(state.bookStartMonth)) issues.push({ path: 'bookStartMonth', message: '必须为 YYYY-MM' })
  for (const collection of [state.accounts, state.movements, state.periods, state.banks, state.paymentChannels, state.paymentApplications, state.auditLogs]) {
    unique(issues, 'entity.id', collection.map((item) => item.id))
    if (collection.some((item) => item.enterpriseId !== state.enterpriseId)) issues.push({ path: 'enterpriseId', message: '实体企业不一致' })
  }
  unique(issues, 'accounts.name', state.accounts.map((item) => normalize(item.name)))
  const accountIds = new Set(state.accounts.map((item) => item.id))
  for (const account of state.accounts) {
    validateFinanceAccountDraft(account).forEach((issue) => issues.push({ ...issue, path: `accounts.${account.id}.${issue.path}` }))
    if (!Number.isSafeInteger(account.version) || account.version < 1) issues.push({ path: `accounts.${account.id}.version`, message: '必须是正整数' })
    iso(issues, `accounts.${account.id}.createdAt`, account.createdAt); iso(issues, `accounts.${account.id}.updatedAt`, account.updatedAt)
  }
  const running = new Map(state.accounts.map((item) => [item.id, item.openingBalanceCents]))
  const sortedMovements = [...state.movements].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
  for (const movement of sortedMovements) {
    if (!accountIds.has(movement.accountId)) issues.push({ path: `movements.${movement.id}.accountId`, message: '账户不存在' })
    if (!directions.has(movement.direction)) issues.push({ path: `movements.${movement.id}.direction`, message: '方向无效' })
    if (!kinds.has(movement.kind)) issues.push({ path: `movements.${movement.id}.kind`, message: '单据类型无效' })
    money(issues, `movements.${movement.id}.amountCents`, movement.amountCents, true); money(issues, `movements.${movement.id}.balanceAfterCents`, movement.balanceAfterCents)
    required(issues, `movements.${movement.id}.sourceId`, movement.sourceId); required(issues, `movements.${movement.id}.sourceNoSnapshot`, movement.sourceNoSnapshot)
    required(issues, `movements.${movement.id}.summary`, movement.summary, 200); required(issues, `movements.${movement.id}.requestId`, movement.requestId)
    iso(issues, `movements.${movement.id}.occurredAt`, movement.occurredAt)
    const before = running.get(movement.accountId) ?? 0; const expected = before + (movement.direction === 'income' ? movement.amountCents : -movement.amountCents)
    if (movement.balanceAfterCents !== expected) issues.push({ path: `movements.${movement.id}.balanceAfterCents`, message: '与逐笔余额不一致' })
    if (expected < 0) issues.push({ path: `movements.${movement.id}`, message: '账户余额不能为负' }); running.set(movement.accountId, expected)
  }
  const closedMonths = state.periods.filter((item) => item.status === 'closed').map((item) => item.month); unique(issues, 'periods.closedMonth', closedMonths)
  for (const period of state.periods) {
    if (!monthPattern.test(period.month)) issues.push({ path: `periods.${period.id}.month`, message: '必须为 YYYY-MM' })
    if (!['closed', 'reversed'].includes(period.status)) issues.push({ path: `periods.${period.id}.status`, message: '状态无效' })
    unique(issues, `periods.${period.id}.snapshots`, period.snapshots.map((item) => item.accountId))
    for (const snapshot of period.snapshots) {
      if (!accountIds.has(snapshot.accountId)) issues.push({ path: `periods.${period.id}.accountId`, message: '账户不存在' })
      money(issues, 'period.openingBalanceCents', snapshot.openingBalanceCents); money(issues, 'period.incomeCents', snapshot.incomeCents); money(issues, 'period.expenseCents', snapshot.expenseCents); money(issues, 'period.closingBalanceCents', snapshot.closingBalanceCents)
      if (snapshot.closingBalanceCents !== snapshot.openingBalanceCents + snapshot.incomeCents - snapshot.expenseCents) issues.push({ path: `periods.${period.id}.snapshot`, message: '期末公式不一致' })
    }
    iso(issues, `periods.${period.id}.closedAt`, period.closedAt); iso(issues, `periods.${period.id}.reversedAt`, period.reversedAt)
    if (period.status === 'reversed' && (!period.reversedAt || !period.reversalReason || !period.reverseRequestId)) issues.push({ path: `periods.${period.id}.reversal`, message: '反结转审计不完整' })
  }
  unique(issues, 'banks.accountId', state.banks.map((item) => item.accountId)); unique(issues, 'banks.bankAccount', state.banks.map((item) => normalizeBankAccount(item.bankAccount)))
  for (const bank of state.banks) {
    validateFinanceBankDraft(bank).forEach((issue) => issues.push({ ...issue, path: `banks.${bank.id}.${issue.path}` }))
    if (state.accounts.find((item) => item.id === bank.accountId)?.type !== 'bank') issues.push({ path: `banks.${bank.id}.accountId`, message: '必须关联银行类型资金账户' })
    if (!Number.isSafeInteger(bank.version) || bank.version < 1) issues.push({ path: `banks.${bank.id}.version`, message: '必须是正整数' })
  }
  unique(issues, 'paymentChannels.code', state.paymentChannels.map((item) => item.code)); unique(issues, 'requests.requestId', state.requests.map((item) => item.requestId))
  for (const request of state.requests) { required(issues, 'requests.requestId', request.requestId); if (!requestKinds.has(request.kind)) issues.push({ path: `requests.${request.requestId}.kind`, message: '请求类型无效' }) }
  if (issues.length) throw new FinanceValidationError(issues)
}
