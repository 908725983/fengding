export type EntityId = string
export type FinanceRole = 'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'
export type FinancePermission =
  | 'finance.view-accounts' | 'finance.manage-accounts' | 'finance.view-ledger' | 'finance.carryover'
  | 'finance.manage-banks' | 'finance.manage-payment-channels'
  | 'finance.view-receivables' | 'finance.view-receivable-details' | 'finance.view-aging'
  | 'finance.view-receipts' | 'finance.manage-receipts'
  | 'finance.view-writeoffs' | 'finance.manage-writeoffs' | 'finance.export-receivables'
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

export type CustomerSettlementMethod = 'cash' | 'monthly' | 'terms'
export type ReceivableStatus = 'open' | 'partial' | 'settled'
export type CustomerReceiptStatus = 'normal' | 'void'
export type ReceiptWriteoffStatus = 'active' | 'cancelled'
export type CustomerReceiptMethod = FundAccountType | 'balance'
export type PrepaymentBucket = 'available' | 'occupied'

export interface FinanceCustomerSnapshot {
  id: EntityId; code: string; name: string; contactName: string; phone: string
}
export interface ReceivableItemSnapshot {
  orderLineId: EntityId; skuId: EntityId; skuCode: string; productName: string; specification: string
  unitName: string; quantityMilli: number; unitPriceCents: number; subtotalCents: number
}
export interface CustomerReceivable {
  id: EntityId; enterpriseId: EntityId; receivableNo: string; source: 'order-shipment'; orderId: EntityId; orderNo: string
  customerSnapshot: FinanceCustomerSnapshot; items: ReceivableItemSnapshot[]
  goodsAmountCents: number; freightCents: number; amountCents: number
  settlementMethod: CustomerSettlementMethod; paymentTermDays: number | null; dueDate: string
  occurredAt: string; requestId: string; createdBy: ActorSnapshot; version: number
}
export interface PrototypeAttachment {
  id: EntityId; name: string; mimeType: 'application/pdf' | 'image/jpeg' | 'image/png'; sizeBytes: number
}
export interface CustomerReceiptVoidInfo {
  reason: string; voidedAt: string; voidedBy: ActorSnapshot; reversalMovementId: EntityId | null
}
export interface CustomerReceipt {
  id: EntityId; enterpriseId: EntityId; receiptNo: string; customerSnapshot: FinanceCustomerSnapshot
  orderId: EntityId | null; occurredAt: string; amountCents: number; method: CustomerReceiptMethod
  accountId: EntityId | null; movementId: EntityId | null; attachment: PrototypeAttachment | null; note: string | null
  status: CustomerReceiptStatus; voidInfo: CustomerReceiptVoidInfo | null; requestId: string
  operatorSnapshot: ActorSnapshot; version: number
}
export interface CustomerPrepaymentLedgerEntry {
  id: EntityId; enterpriseId: EntityId; customerId: EntityId; bucket: PrepaymentBucket; orderId: EntityId | null
  sourceType: 'opening' | 'receipt' | 'writeoff' | 'writeoff-cancel' | 'receipt-void' | 'order-occupation' | 'order-release'
  sourceId: EntityId; amountDeltaCents: number; occurredAt: string; requestId: string
}
export interface WriteoffAllocation {
  id: EntityId; sourceKind: 'receipt' | 'prepayment'; sourceId: EntityId; receivableId: EntityId
  cashCents: number; discountCents: number
}
export interface ReceiptWriteoffCancelInfo {
  reason: string; cancelledAt: string; cancelledBy: ActorSnapshot
}
export interface ReceiptWriteoff {
  id: EntityId; enterpriseId: EntityId; writeoffNo: string; customerId: EntityId; occurredAt: string
  allocations: WriteoffAllocation[]; cashCents: number; discountCents: number; amountCents: number
  note: string | null; status: ReceiptWriteoffStatus; cancelInfo: ReceiptWriteoffCancelInfo | null
  requestId: string; operatorSnapshot: ActorSnapshot; version: number
}
export interface FinanceDailySequence { date: string; receivable: number; receipt: number; writeoff: number }
export interface FinanceRequestRecord {
  requestId: string; kind: 'account-save' | 'movement-post' | 'period-close' | 'period-reverse' | 'bank-save' | 'payment-apply'
    | 'receivable-create' | 'receipt-create' | 'receipt-void' | 'writeoff-create' | 'writeoff-cancel'
  targetIds: EntityId[]; appliedAt: string
}
export interface FinanceAuditLog {
  id: EntityId; enterpriseId: EntityId; action: 'account.saved' | 'period.closed' | 'period.reversed' | 'bank.saved' | 'payment.application-created'
    | 'receivable.created' | 'receipt.created' | 'receipt.voided' | 'writeoff.created' | 'writeoff.cancelled'
  targetId: EntityId; operatorSnapshot: ActorSnapshot; detail: string; createdAt: string
}
export interface FinanceFeatureState {
  schemaVersion: 1; enterpriseId: EntityId; version: number; bookStartMonth: string
  accounts: FundAccount[]; movements: FundMovement[]; periods: FinancePeriod[]; banks: BankProfile[]
  paymentChannels: PaymentChannel[]; paymentApplications: PaymentChannelApplication[]
  receivables: CustomerReceivable[]; customerReceipts: CustomerReceipt[]; receiptWriteoffs: ReceiptWriteoff[]
  prepaymentLedger: CustomerPrepaymentLedgerEntry[]; dailySequences: FinanceDailySequence[]
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

export interface CreateOrderReceivableInput {
  requestId: string; orderId: EntityId; orderNo: string; customerSnapshot: FinanceCustomerSnapshot
  items: ReceivableItemSnapshot[]; goodsAmountCents: number; freightCents: number; amountCents: number
  settlementMethod: CustomerSettlementMethod; paymentTermDays: number | null; occurredAt: string
  operator: { id: EntityId; name: string; role: FinanceRole }
}
export interface CreateCustomerReceiptInput {
  requestId: string; customerSnapshot: FinanceCustomerSnapshot; orderId?: EntityId | null; occurredAt: string
  amountCents: number; method: CustomerReceiptMethod; accountId?: EntityId | null
  attachment?: PrototypeAttachment | null; note?: string | null
  immediateAllocations?: Array<{ receivableId: EntityId; cashCents: number; discountCents: number; prepaymentSourceId?: EntityId }>
}
export interface CreateReceiptWriteoffInput {
  requestId: string; customerId: EntityId; occurredAt: string
  allocations: Array<Omit<WriteoffAllocation, 'id'>>; note?: string | null
}
export interface VoidCustomerReceiptInput { requestId: string; receiptId: EntityId; expectedVersion: number; reason: string }
export interface CancelReceiptWriteoffInput { requestId: string; writeoffId: EntityId; expectedVersion: number; reason: string }

export interface ReceivableProjection extends CustomerReceivable {
  receivedCents: number; outstandingCents: number; status: ReceivableStatus; ageDays: number; overdue: boolean
}
export interface CustomerReceivableSummary {
  customer: FinanceCustomerSnapshot; receivableCents: number; receivedCents: number; outstandingCents: number
  oldestAgeDays: number; lastReceiptDate: string | null
}
export interface ReceivableProductRow extends ReceivableItemSnapshot {
  receivableId: EntityId; receivableNo: string; occurredAt: string; orderId: EntityId; orderNo: string
  customer: FinanceCustomerSnapshot; status: ReceivableStatus
}
export interface ReceivableAgingRow {
  customer: FinanceCustomerSnapshot; outstandingCents: number
  bucket0To30Cents: number; bucket31To60Cents: number; bucket61To90Cents: number
  bucket91To180Cents: number; bucket181To365Cents: number; bucketOver365Cents: number
}
export interface SettlementSource {
  kind: 'receipt' | 'prepayment'; id: EntityId; label: string; customerId: EntityId
  availableCents: number; occurredAt: string; orderId: EntityId | null; bucket: PrepaymentBucket
}
export interface OrderSettlementProjection {
  receivable: ReceivableProjection; receipts: CustomerReceipt[]; writeoffs: ReceiptWriteoff[]
}

export interface FinanceAccountPeriodRow {
  account: FundAccount; month: string; openingBalanceCents: number; periodIncomeCents: number
  periodExpenseCents: number; closingBalanceCents: number; bankAccountMasked: string | null
}
export interface FinanceAccountDetail extends FinanceAccountPeriodRow { movements: FundMovement[]; bank: BankProfile | null }
export interface VisibleBankProfile extends Omit<BankProfile, 'bankAccount'> { bankAccount: string }
export interface FinancePeriodCard { month: string; status: 'unavailable' | 'open' | 'closed'; period: FinancePeriod | null }
