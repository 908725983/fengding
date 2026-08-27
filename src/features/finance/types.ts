export type EntityId = string
export type FinanceRole = 'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'
export type FinancePermission =
  | 'finance.view-accounts' | 'finance.manage-accounts' | 'finance.view-ledger' | 'finance.carryover'
  | 'finance.manage-banks' | 'finance.manage-payment-channels'
  | 'finance.view-receivables' | 'finance.view-receivable-details' | 'finance.view-aging'
  | 'finance.view-receipts' | 'finance.manage-receipts'
  | 'finance.view-writeoffs' | 'finance.manage-writeoffs' | 'finance.export-receivables'
  | 'finance.view-refunds' | 'finance.manage-refunds'
  | 'finance.view-payables' | 'finance.view-payable-details' | 'finance.view-payable-aging'
  | 'finance.view-supplier-payments' | 'finance.manage-supplier-payments'
  | 'finance.view-supplier-writeoffs' | 'finance.manage-supplier-writeoffs'
  | 'finance.export-payables'
  | 'finance.view-transfers' | 'finance.manage-transfers'
  | 'finance.view-other-transactions' | 'finance.manage-other-transactions'
  | 'finance.view-supplier-refunds' | 'finance.manage-supplier-refunds'
  | 'finance.view-statistics' | 'finance.export-statistics' | 'finance.view-institutions'
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
  orderedAt?: string | null; occurredAt: string; requestId: string; createdBy: ActorSnapshot; version: number
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
  sourceType: 'opening' | 'receipt' | 'writeoff' | 'writeoff-cancel' | 'receipt-void' | 'order-occupation' | 'order-release' | 'customer-refund'
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
export type RefundStatus = 'pending' | 'refunded' | 'rejected'
export type RefundMethod = 'original' | 'cash' | 'balance'
export type RefundSourceKind = 'receipt' | 'prepayment' | 'cash-account'
export interface ReceivableCreditAdjustment {
  id: EntityId; enterpriseId: EntityId; sourceType: 'customer-return' | 'short-shipment-refund'; sourceId: EntityId; sourceNo: string
  receivableId: EntityId; orderId: EntityId; orderNo: string; customerSnapshot: FinanceCustomerSnapshot
  amountCents: number; outstandingReductionCents: number; refundObligationCents: number; nonRefundableDiscountCents: number; occurredAt: string
  requestId: string; operatorSnapshot: ActorSnapshot; status: 'active' | 'reversed'
  reversalInfo: { reason: string; reversedAt: string; reversedBy: ActorSnapshot; requestId: string } | null; version: number
  correctionOfRefundId?: EntityId | null
}
export interface RefundSourceAllocation {
  id: EntityId; sourceKind: RefundSourceKind; sourceId: EntityId; accountId: EntityId | null
  method: CustomerReceiptMethod; amountCents: number; movementId: EntityId | null
}
export interface CustomerRefund {
  id: EntityId; enterpriseId: EntityId; refundNo: string; sourceType: 'customer-return' | 'short-shipment-refund'; sourceId: EntityId; sourceNo: string
  creditAdjustmentId: EntityId; receivableId: EntityId; orderId: EntityId; orderNo: string; customerSnapshot: FinanceCustomerSnapshot
  requestedAmountCents: number; refundedAmountCents: number; method: RefundMethod; status: RefundStatus
  allocations: RefundSourceAllocation[]; requestedAt: string; resolvedAt: string | null; reason: string | null
  requestId: string; operatorSnapshot: ActorSnapshot; version: number
  correctionOfRefundId?: EntityId | null
}
export interface FinanceSupplierSnapshot {
  id: EntityId; code: string; name: string; contactName: string; phone: string; paymentTermDays: number | null
}
export interface SupplierPayableItemSnapshot {
  inboundLineId: EntityId; purchaseOrderLineId: EntityId; skuId: EntityId; skuCode: string; productName: string
  specification: string; unitName: string; quantityMilli: number; unitPriceCents: number; subtotalCents: number
  allocatedDiscountCents: number; allocatedOtherFeeCents: number; amountCents: number; isGift: boolean
}
export type SupplierPayableStatus = 'unpaid' | 'partially-paid' | 'paid' | 'voided'
export interface SupplierPayable {
  id: EntityId; enterpriseId: EntityId; payableNo: string; source: 'purchase-inbound'; purchaseOrderId: EntityId
  purchaseOrderNo: string; inboundId: EntityId; inboundNo: string; supplierSnapshot: FinanceSupplierSnapshot
  items: SupplierPayableItemSnapshot[]; goodsAmountCents: number; discountCents: number; otherFeeCents: number
  amountCents: number; occurredAt: string; dueDate: string; status: SupplierPayableStatus
  requestId: string; createdBy: ActorSnapshot; version: number
}
export type SupplierPaymentMethod = 'cash' | 'bank'
export type SupplierPaymentStatus = 'normal' | 'void'
export interface SupplierPaymentVoidInfo { reason: string; voidedAt: string; voidedBy: ActorSnapshot; reversalMovementId: EntityId | null }
export interface SupplierPayment {
  id: EntityId; enterpriseId: EntityId; paymentNo: string; supplierSnapshot: FinanceSupplierSnapshot
  occurredAt: string; amountCents: number; method: SupplierPaymentMethod; accountId: EntityId; movementId: EntityId
  attachment: PrototypeAttachment | null; note: string | null; status: SupplierPaymentStatus
  voidInfo: SupplierPaymentVoidInfo | null; requestId: string; operatorSnapshot: ActorSnapshot; version: number
}
export interface SupplierPaymentWriteoffAllocation { id: EntityId; paymentId: EntityId; payableId: EntityId; amountCents: number }
export type SupplierPaymentWriteoffStatus = 'active' | 'cancelled'
export interface SupplierPaymentWriteoffCancelInfo { reason: string; cancelledAt: string; cancelledBy: ActorSnapshot }
export interface SupplierPaymentWriteoff {
  id: EntityId; enterpriseId: EntityId; writeoffNo: string; supplierId: EntityId; occurredAt: string
  allocations: SupplierPaymentWriteoffAllocation[]; amountCents: number; status: SupplierPaymentWriteoffStatus
  cancelInfo: SupplierPaymentWriteoffCancelInfo | null; requestId: string; operatorSnapshot: ActorSnapshot; version: number
}
export type SupplierPayableCreditSource = 'purchase-return' | 'manual'
export interface SupplierPayableCredit {
  id: EntityId; enterpriseId: EntityId; sourceType: SupplierPayableCreditSource; sourceId: EntityId; sourceNo: string
  supplierId: EntityId; payableId: EntityId | null; amountCents: number; outstandingReductionCents: number
  refundObligationCents: number; occurredAt: string; requestId: string; operatorSnapshot: ActorSnapshot
  status: 'active' | 'reversed'; reversalInfo: { reason: string; reversedAt: string; reversedBy: ActorSnapshot } | null; version: number
}
export type FinanceTransferStatus = 'pending-review' | 'completed' | 'cancelled'
export interface FinanceTransfer {
  id: EntityId; enterpriseId: EntityId; transferNo: string; occurredAt: string; fromAccountId: EntityId; toAccountId: EntityId
  amountCents: number; attachment: PrototypeAttachment | null; note: string | null; status: FinanceTransferStatus
  sourceTransferId: EntityId | null; movementIds: EntityId[]; requestId: string; operatorSnapshot: ActorSnapshot
  reviewedAt: string | null; reviewedBy: ActorSnapshot | null; cancelReason: string | null; version: number
}
export type FinanceOtherDirection = 'income' | 'expense'
export interface FinanceIncomeExpenseItem {
  id: EntityId; enterpriseId: EntityId; direction: FinanceOtherDirection; name: string; status: FinanceEntityStatus
  createdAt: string; updatedAt: string; version: number
}
export type FinanceOtherTransactionStatus = 'pending-review' | 'approved' | 'rejected'
export interface FinanceOtherTransaction {
  id: EntityId; enterpriseId: EntityId; documentNo: string; direction: FinanceOtherDirection; occurredAt: string
  counterpartySnapshot: string; itemId: EntityId; itemNameSnapshot: string; amountCents: number; accountId: EntityId
  attachment: PrototypeAttachment | null; note: string | null; status: FinanceOtherTransactionStatus; correctionOfId: EntityId | null
  movementId: EntityId | null; requestId: string; operatorSnapshot: ActorSnapshot; reviewedAt: string | null
  reviewedBy: ActorSnapshot | null; rejectionReason: string | null; version: number
}
export interface SupplierRefundReceipt {
  id: EntityId; enterpriseId: EntityId; receiptNo: string; creditId: EntityId; supplierId: EntityId; sourceNo: string
  amountCents: number; method: SupplierPaymentMethod; accountId: EntityId; movementId: EntityId; occurredAt: string
  requestId: string; operatorSnapshot: ActorSnapshot; version: number
}
export interface SupplierRefundDetail {
  obligation: SupplierRefundObligation
  receipt: SupplierRefundReceipt | null
  accountName: string | null
  movement: FundMovement | null
  audit: FinanceAuditLog[]
}
export interface SupplierRefundObligation {
  credit: SupplierPayableCredit; supplier: FinanceSupplierSnapshot | null; receivedCents: number; outstandingCents: number
  status: 'pending' | 'refunded'
}
export interface FinanceMethodStatisticRow { method: Exclude<CustomerReceiptMethod, 'balance'>; amountCents: number; receiptCount: number; ratioBasisPoints: number | null }
export interface FinanceOrderPaymentStatisticRow {
  receivableId: EntityId; orderedAt: string | null; orderNo: string; returnNos: string[]; customerSnapshot: FinanceCustomerSnapshot
  goodsAmountCents: number; freightCents: number; netReceivableCents: number; netReceivedCents: number; outstandingCents: number
}
export interface FinanceOrderPaymentStatistics { rows: FinanceOrderPaymentStatisticRow[]; receivableCents: number; receivedCents: number; outstandingCents: number; snapshotVersion: number }
export interface FinanceOtherSummaryRow { itemId: EntityId; itemName: string; incomeCents: number; expenseCents: number; netCents: number }
export interface FinanceLedgerStatisticRow { occurredAt: string; accountName: string; kind: FundMovementKind; sourceNo: string; counterparty: string | null; direction: FundMovementDirection; amountCents: number; balanceAfterCents: number }
export interface SupplierPayableProjection extends SupplierPayable {
  paidCents: number; creditedCents: number; outstandingCents: number; ageDays: number; overdue: boolean
}
export interface SupplierPayableAgingRow {
  supplier: FinanceSupplierSnapshot; outstandingCents: number; bucket0To30Cents: number; bucket31To60Cents: number
  bucket61To90Cents: number; bucket91To180Cents: number; bucket181To365Cents: number; bucketOver365Cents: number
}
export interface SupplierPayableProductRow extends SupplierPayableItemSnapshot {
  payableId: EntityId; payableNo: string; purchaseOrderNo: string; occurredAt: string; supplier: FinanceSupplierSnapshot; status: SupplierPayableStatus
}
export interface CreateSupplierPayableInput {
  requestId: string; purchaseOrderId: EntityId; purchaseOrderNo: string; inboundId: EntityId; inboundNo: string
  supplierSnapshot: FinanceSupplierSnapshot; items: SupplierPayableItemSnapshot[]; goodsAmountCents: number
  discountCents: number; otherFeeCents: number; amountCents: number; occurredAt: string; paymentTermDays: number | null
  operator: { id: EntityId; name: string; role: FinanceRole }
}
export interface CreateSupplierPaymentInput {
  requestId: string; supplierSnapshot: FinanceSupplierSnapshot; occurredAt: string; amountCents: number
  method: SupplierPaymentMethod; accountId: EntityId; attachment?: PrototypeAttachment | null; note?: string | null
  immediateAllocations?: Array<{ payableId: EntityId; amountCents: number }>
}
export interface VoidSupplierPaymentInput { requestId: string; paymentId: EntityId; expectedVersion: number; reason: string }
export interface CreateSupplierPaymentWriteoffInput {
  requestId: string; supplierId: EntityId; occurredAt: string; allocations: Array<Omit<SupplierPaymentWriteoffAllocation, 'id'>>
}
export interface CancelSupplierPaymentWriteoffInput { requestId: string; writeoffId: EntityId; expectedVersion: number; reason: string }
export interface CreateSupplierPayableCreditInput {
  requestId: string; sourceType: SupplierPayableCreditSource; sourceId: EntityId; sourceNo: string; supplierId: EntityId
  payableId?: EntityId | null; amountCents: number; occurredAt: string; operator: { id: EntityId; name: string; role: FinanceRole }
}
export interface FinanceDailySequence { date: string; receivable: number; receipt: number; writeoff: number; refund?: number; payable?: number; payment?: number; transfer?: number; otherReceipt?: number; otherPayment?: number; supplierRefund?: number }
export interface FinanceRequestRecord {
  requestId: string; kind: 'account-save' | 'movement-post' | 'period-close' | 'period-reverse' | 'bank-save' | 'payment-apply'
    | 'receivable-create' | 'receipt-create' | 'receipt-void' | 'writeoff-create' | 'writeoff-cancel' | 'credit-create' | 'credit-reverse' | 'refund-confirm' | 'refund-reject' | 'refund-reapply' | 'refund-correct'
    | 'payable-create' | 'supplier-payment-create' | 'supplier-payment-void' | 'supplier-writeoff-create' | 'supplier-writeoff-cancel' | 'supplier-credit-create'
    | 'transfer-create' | 'transfer-approve' | 'transfer-cancel' | 'other-item-save' | 'other-create' | 'other-review' | 'supplier-refund-confirm'
  targetIds: EntityId[]; appliedAt: string
}
export interface FinanceAuditLog {
  id: EntityId; enterpriseId: EntityId; action: 'account.saved' | 'period.closed' | 'period.reversed' | 'bank.saved' | 'payment.application-created'
    | 'receivable.created' | 'receipt.created' | 'receipt.voided' | 'writeoff.created' | 'writeoff.cancelled' | 'credit.created' | 'credit.reversed' | 'refund.created' | 'refund.confirmed' | 'refund.rejected'
    | 'payable.created' | 'supplier-payment.created' | 'supplier-payment.voided' | 'supplier-writeoff.created' | 'supplier-writeoff.cancelled' | 'supplier-credit.created'
    | 'transfer.created' | 'transfer.approved' | 'transfer.cancelled' | 'other-item.saved' | 'other.created' | 'other.approved' | 'other.rejected' | 'supplier-refund.confirmed'
  targetId: EntityId; operatorSnapshot: ActorSnapshot; detail: string; createdAt: string
}
export interface FinanceFeatureState {
  schemaVersion: 1; enterpriseId: EntityId; version: number; bookStartMonth: string
  accounts: FundAccount[]; movements: FundMovement[]; periods: FinancePeriod[]; banks: BankProfile[]
  paymentChannels: PaymentChannel[]; paymentApplications: PaymentChannelApplication[]
  receivables: CustomerReceivable[]; customerReceipts: CustomerReceipt[]; receiptWriteoffs: ReceiptWriteoff[]
  prepaymentLedger: CustomerPrepaymentLedgerEntry[]; dailySequences: FinanceDailySequence[]
  requests: FinanceRequestRecord[]; auditLogs: FinanceAuditLog[]
  creditAdjustments: ReceivableCreditAdjustment[]; refunds: CustomerRefund[]
  payables: SupplierPayable[]; supplierPayments: SupplierPayment[]; supplierPaymentWriteoffs: SupplierPaymentWriteoff[]; supplierPayableCredits: SupplierPayableCredit[]
  transfers: FinanceTransfer[]; incomeExpenseItems: FinanceIncomeExpenseItem[]; otherTransactions: FinanceOtherTransaction[]; supplierRefundReceipts: SupplierRefundReceipt[]
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
  settlementMethod: CustomerSettlementMethod; paymentTermDays: number | null; orderedAt?: string | null; occurredAt: string
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
export interface CreateReturnCreditInput {
  requestId: string; sourceType: 'customer-return' | 'short-shipment-refund'; sourceId: EntityId; sourceNo: string
  orderId: EntityId; amountCents: number; refundPreference: RefundMethod; occurredAt: string; operator: { id: EntityId; name: string; role: FinanceRole }
}
export interface ConfirmCustomerRefundInput { requestId: string; refundId: EntityId; expectedVersion: number; method: RefundMethod; cashAccountId?: EntityId | null; reason?: string | null; occurredAt: string }
export interface RejectCustomerRefundInput { requestId: string; refundId: EntityId; expectedVersion: number; reason: string; occurredAt: string }
export interface ReapplyCustomerRefundInput { requestId: string; refundId: EntityId; expectedVersion: number; occurredAt: string }
export interface CorrectCustomerRefundInput {
  requestId: string; refundId: EntityId; expectedVersion: number; expectedAmountCents: number
  sourceNo: string; occurredAt: string; operator: { id: EntityId; name: string; role: FinanceRole }; reason: string
}
export interface CreateRefundRecoveryInput {
  requestId: string; refundId: EntityId; expectedVersion: number; amountCents: number
  occurredAt: string; itemId: EntityId; accountId: EntityId; reason: string
}
export interface ReverseReturnCreditInput { requestId: string; sourceType: 'customer-return'; sourceId: EntityId; reason: string; occurredAt: string; operator: { id: EntityId; name: string; role: FinanceRole } }

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

export interface CreateFinanceTransferInput { requestId: string; fromAccountId: EntityId; toAccountId: EntityId; amountCents: number; occurredAt: string; attachment?: PrototypeAttachment | null; note?: string | null; sourceTransferId?: EntityId | null }
export interface ReviewFinanceTransferInput { requestId: string; transferId: EntityId; expectedVersion: number }
export interface CancelFinanceTransferInput { requestId: string; transferId: EntityId; expectedVersion: number; reason: string }
export interface SaveFinanceIncomeExpenseItemInput { requestId: string; itemId?: EntityId; expectedVersion?: number; direction: FinanceOtherDirection; name: string; status: FinanceEntityStatus }
export interface CreateFinanceOtherTransactionInput { requestId: string; direction: FinanceOtherDirection; occurredAt: string; counterparty: string; itemId: EntityId; amountCents: number; accountId: EntityId; attachment?: PrototypeAttachment | null; note?: string | null; correctionOfId?: EntityId | null }
export interface ReviewFinanceOtherTransactionInput { requestId: string; transactionId: EntityId; expectedVersion: number; decision: 'approve' | 'reject'; reason?: string | null }
export interface ConfirmSupplierRefundInput { requestId: string; creditId: EntityId; accountId: EntityId; occurredAt: string }
