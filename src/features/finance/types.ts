export type EntityId = string
export type FinanceRole = 'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'
export type FinancePermission = 'finance.view-accounts' | 'finance.manage-accounts' | 'finance.view-ledger' | 'finance.carryover' | 'finance.manage-banks' | 'finance.manage-payment-channels'
export type FundAccountType = 'cash' | 'bank' | 'wechat' | 'alipay'
export type FinanceEntityStatus = 'enabled' | 'disabled'
export type FundMovementDirection = 'income' | 'expense'
export type FundMovementKind = 'receipt' | 'payment' | 'transfer-in' | 'transfer-out' | 'refund' | 'other-income' | 'other-expense' | 'prototype'

export interface FinanceActor { actorId: EntityId; role: FinanceRole; permissions?: FinancePermission[] }
export interface ActorSnapshot { id: EntityId; name: string; role: FinanceRole }

export interface FundAccount {
  id: EntityId; enterpriseId: EntityId; name: string; type: FundAccountType; status: FinanceEntityStatus
  openingMonth: string; openingBalanceCents: number; createdAt: string; updatedAt: string; version: number
}
export interface FundMovement {
  id: EntityId; enterpriseId: EntityId; accountId: EntityId; direction: FundMovementDirection; kind: FundMovementKind
  amountCents: number; balanceAfterCents: number; sourceId: EntityId; sourceNoSnapshot: string
  counterpartySnapshot: string | null; summary: string; requestId: string; operatorSnapshot: ActorSnapshot; occurredAt: string
}
export interface FinancePeriodSnapshot {
  accountId: EntityId; openingBalanceCents: number; incomeCents: number; expenseCents: number; closingBalanceCents: number
}
export interface FinancePeriod {
  id: EntityId; enterpriseId: EntityId; month: string; status: 'closed' | 'reversed'; snapshots: FinancePeriodSnapshot[]
  closedAt: string; closedBy: ActorSnapshot; closeRequestId: string; reversedAt: string | null
  reversedBy: ActorSnapshot | null; reversalReason: string | null; reverseRequestId: string | null; version: number
}
export interface BankProfile {
  id: EntityId; enterpriseId: EntityId; accountId: EntityId; bankName: string; accountName: string; bankAccount: string
  branchName: string; accountKind: 'corporate' | 'personal'; status: FinanceEntityStatus
  createdAt: string; updatedAt: string; version: number
}
export interface PaymentChannel {
  id: EntityId; enterpriseId: EntityId; code: 'weiqifu' | 'unionpay'; name: string; description: string
  status: 'unopened' | 'opened'; openedAt: string | null; updatedAt: string; version: number
}
export interface PaymentChannelApplication {
  id: EntityId; enterpriseId: EntityId; channelId: EntityId; status: 'simulated-pending'; requestId: string
  applicantSnapshot: ActorSnapshot; createdAt: string
}
export interface FinanceRequestRecord {
  requestId: string; kind: 'account-save' | 'movement-post' | 'period-close' | 'period-reverse' | 'bank-save' | 'payment-apply'
  targetIds: EntityId[]; appliedAt: string
}
export interface FinanceAuditLog {
  id: EntityId; enterpriseId: EntityId; action: 'account.saved' | 'period.closed' | 'period.reversed' | 'bank.saved' | 'payment.application-created'
  targetId: EntityId; operatorSnapshot: ActorSnapshot; detail: string; createdAt: string
}
export interface FinanceFeatureState {
  schemaVersion: 1; enterpriseId: EntityId; version: number; bookStartMonth: string
  accounts: FundAccount[]; movements: FundMovement[]; periods: FinancePeriod[]; banks: BankProfile[]
  paymentChannels: PaymentChannel[]; paymentApplications: PaymentChannelApplication[]
  requests: FinanceRequestRecord[]; auditLogs: FinanceAuditLog[]
}

export interface FinanceAccountDraft { name: string; type: FundAccountType; status: FinanceEntityStatus; openingMonth: string; openingBalanceCents: number }
export interface SaveFinanceAccountInput { requestId: string; accountId?: EntityId; expectedUpdatedAt?: string; draft: FinanceAccountDraft }
export interface PostFundMovementInput {
  requestId: string; accountId: EntityId; direction: FundMovementDirection; kind: FundMovementKind; amountCents: number
  sourceId: EntityId; sourceNo: string; counterparty?: string | null; summary: string; occurredAt: string
}
export interface CloseFinancePeriodInput { requestId: string; month: string; expectedStateVersion: number }
export interface ReverseFinancePeriodInput { requestId: string; month: string; reason: string; expectedStateVersion: number }
export interface FinanceBankDraft {
  accountId: EntityId; bankName: string; accountName: string; bankAccount: string; branchName: string
  accountKind: 'corporate' | 'personal'; status: FinanceEntityStatus
}
export interface SaveFinanceBankInput { requestId: string; bankId?: EntityId; expectedUpdatedAt?: string; draft: FinanceBankDraft }
export interface SubmitPaymentApplicationInput { requestId: string; channelId: EntityId }

export interface FinanceAccountPeriodRow {
  account: FundAccount; month: string; openingBalanceCents: number; periodIncomeCents: number
  periodExpenseCents: number; closingBalanceCents: number; bankAccountMasked: string | null
}
export interface FinanceAccountDetail extends FinanceAccountPeriodRow { movements: FundMovement[]; bank: BankProfile | null }
export interface VisibleBankProfile extends Omit<BankProfile, 'bankAccount'> { bankAccount: string }
export interface FinancePeriodCard { month: string; status: 'unavailable' | 'open' | 'closed'; period: FinancePeriod | null }

