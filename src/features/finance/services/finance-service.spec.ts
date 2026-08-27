import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { createFinanceMockSession, financeBaseline } from '../../../../mock/handlers/finance-handler'
import { InMemoryFinanceRepository } from '../repositories/finance-repository'
import type { FinanceActor } from '../types'
import { createFinanceService, FinanceDomainError } from './finance-service'

const admin: FinanceActor = { actorId: 'admin-demo', role: 'super-admin' }
const finance: FinanceActor = { actorId: 'finance-demo', role: 'finance' }
const supervisor: FinanceActor = { actorId: 'supervisor-demo', role: 'sales-supervisor' }
const salesperson: FinanceActor = { actorId: 'sales-demo', role: 'salesperson' }
const supplier = { id: 'supplier-test', code: 'SUP-TEST', name: '测试供应商', contactName: '测试联系人', phone: '000-3000-0001', paymentTermDays: null }

function setup() {
  const repository = new InMemoryFinanceRepository(financeBaseline); let sequence = 1
  const service = createFinanceService({ repository, now: () => '2026-08-10T09:00:00+08:00', nextId: (kind) => `${kind}-test-${sequence++}`, actorName: (actor) => `姓名-${actor.actorId}` })
  return { repository, service }
}

function supplierPayableInput(suffix: string, occurredAt: string, amountCents = 100, supplierSnapshot = supplier) {
  return {
    requestId: `request-payable-${suffix}`, purchaseOrderId: `purchase-order-${suffix}`, purchaseOrderNo: `CG-${suffix}`,
    inboundId: `inbound-${suffix}`, inboundNo: `RK-${suffix}`, supplierSnapshot,
    items: [{ inboundLineId: `inbound-line-${suffix}`, purchaseOrderLineId: `purchase-line-${suffix}`, skuId: 'sku-1', skuCode: 'SKU-000001', productName: '测试商品', specification: '默认', unitName: '件', quantityMilli: 1000, unitPriceCents: amountCents, subtotalCents: amountCents, allocatedDiscountCents: 0, allocatedOtherFeeCents: 0, amountCents, isGift: amountCents === 0 }],
    goodsAmountCents: amountCents, discountCents: 0, otherFeeCents: 0, amountCents, occurredAt, paymentTermDays: supplierSnapshot.paymentTermDays,
    operator: { id: 'finance-demo', name: '演示财务', role: 'finance' as const },
  }
}

describe('finance service', () => {
  it('calculates a selected month and returns frozen closed-period totals', () => {
    const { service } = setup()
    const july = service.listAccounts(supervisor, '2026-07').find((item) => item.account.id === 'account-cash')!
    const august = service.listAccounts(supervisor, '2026-08').find((item) => item.account.id === 'account-cash')!
    expect(july).toMatchObject({ openingBalanceCents: 100000, periodIncomeCents: 50000, periodExpenseCents: 20000, closingBalanceCents: 130000 })
    expect(august).toMatchObject({ openingBalanceCents: 130000, periodIncomeCents: 10000, periodExpenseCents: 5000, closingBalanceCents: 135000 })
  })

  it('lists account movements in stable chronological order', () => {
    const { service } = setup(); const detail = service.getAccountDetail(finance, 'account-cash', '2026-08')
    expect(detail.movements.map((item) => item.id)).toEqual(['finance-movement-007', 'finance-movement-008'])
  })

  it('enforces finance permissions and masks a bank account for read-only sales supervisors', () => {
    const { service } = setup()
    expect(() => service.listAccounts(salesperson)).toThrowError(FinanceDomainError)
    expect(service.getAccountDetail(supervisor, 'account-bank').bank?.bankAccount).toBe('•••• 1234')
    expect(service.getAccountDetail(finance, 'account-bank').bank?.bankAccount).toBe('6222000000001234')
    expect(() => service.listBanks(supervisor)).toThrowError(FinanceDomainError)
  })

  it('creates an account idempotently and rejects duplicate names', () => {
    const { service } = setup()
    const input = { requestId: 'request-account-1', draft: { name: '备用现金', type: 'cash' as const, status: 'enabled' as const, openingMonth: '2026-08', openingBalanceCents: 0 } }
    const first = service.saveAccount(admin, input); const replay = service.saveAccount(admin, input)
    expect(replay.id).toBe(first.id)
    expect(() => service.saveAccount(admin, { ...input, requestId: 'request-account-2' })).toThrowError(FinanceDomainError)
  })

  it('locks opening data after a movement or period snapshot and checks optimistic updates', () => {
    const { service } = setup(); const cash = financeBaseline.accounts.find((item) => item.id === 'account-cash')!
    expect(() => service.saveAccount(finance, { requestId: 'request-edit-cash', accountId: cash.id, expectedUpdatedAt: cash.updatedAt, draft: { name: cash.name, type: cash.type, status: cash.status, openingMonth: cash.openingMonth, openingBalanceCents: cash.openingBalanceCents + 1 } })).toThrowError(FinanceDomainError)
    expect(() => service.saveAccount(finance, { requestId: 'request-stale', accountId: cash.id, expectedUpdatedAt: '2026-01-01T00:00:00+08:00', draft: { name: cash.name, type: cash.type, status: 'disabled', openingMonth: cash.openingMonth, openingBalanceCents: cash.openingBalanceCents } })).toThrowError(FinanceDomainError)
  })

  it('posts immutable chronological movements idempotently and forbids a negative balance', () => {
    const { service } = setup()
    const input = { requestId: 'request-movement-1', accountId: 'account-cash', direction: 'expense' as const, kind: 'prototype' as const, amountCents: 5000, sourceId: 'source-test', sourceNo: 'TEST-001', summary: '测试支出', occurredAt: '2026-08-10T08:00:00+08:00' }
    const first = service.postMovement(finance, input); const replay = service.postMovement(finance, input)
    expect(first.balanceAfterCents).toBe(130000); expect(replay.id).toBe(first.id)
    expect(() => service.postMovement(finance, { ...input, requestId: 'request-movement-2', amountCents: 9999999 })).toThrowError(FinanceDomainError)
  })

  it('rejects movements for disabled accounts and locked periods', () => {
    const { service } = setup()
    const base = { requestId: 'request-disabled', direction: 'income' as const, kind: 'prototype' as const, amountCents: 1, sourceId: 'source-test', sourceNo: 'TEST-002', summary: '测试', occurredAt: '2026-08-10T08:00:00+08:00' }
    expect(() => service.postMovement(finance, { ...base, accountId: 'account-alipay' })).toThrowError(FinanceDomainError)
    expect(() => service.postMovement(finance, { ...base, requestId: 'request-locked', accountId: 'account-cash', occurredAt: '2026-07-30T08:00:00+08:00' })).toThrowError(FinanceDomainError)
  })

  it('closes only the next month atomically and protects concurrent requests', () => {
    const { service, repository } = setup(); const version = repository.read().version
    expect(() => service.closePeriod(finance, { requestId: 'request-close-gap', month: '2026-09', expectedStateVersion: version })).toThrowError(FinanceDomainError)
    const closed = service.closePeriod(finance, { requestId: 'request-close-aug', month: '2026-08', expectedStateVersion: version })
    expect(closed.snapshots.find((item) => item.accountId === 'account-bank')?.closingBalanceCents).toBe(565000)
    expect(service.closePeriod(finance, { requestId: 'request-close-aug', month: '2026-08', expectedStateVersion: version }).id).toBe(closed.id)
    expect(() => service.closePeriod(finance, { requestId: 'request-close-stale', month: '2026-08', expectedStateVersion: version })).toThrowError(FinanceDomainError)
  })

  it('reverses only the latest closed month with a reason and audit record', () => {
    const { service, repository } = setup(); service.closePeriod(finance, { requestId: 'request-close', month: '2026-08', expectedStateVersion: repository.read().version })
    const reversed = service.reversePeriod(finance, { requestId: 'request-reverse', month: '2026-08', reason: '复核发现演示数据需要调整', expectedStateVersion: repository.read().version })
    expect(reversed.status).toBe('reversed'); expect(reversed.reversalReason).toBe('复核发现演示数据需要调整')
    expect(repository.read().auditLogs.at(-1)?.action).toBe('period.reversed')
  })

  it('blocks reversing a period when later movements exist', () => {
    const { service, repository } = setup()
    expect(() => service.reversePeriod(finance, { requestId: 'request-reverse-july', month: '2026-07', reason: '测试阻断', expectedStateVersion: repository.read().version })).toThrowError(FinanceDomainError)
  })

  it('maintains one bank profile per bank account and normalizes the account number', () => {
    const { service } = setup()
    const account = service.saveAccount(admin, { requestId: 'request-bank-account', draft: { name: '演示银行二户', type: 'bank', status: 'enabled', openingMonth: '2026-08', openingBalanceCents: 0 } })
    const bank = service.saveBank(finance, { requestId: 'request-bank-profile', draft: { accountId: account.id, bankName: '演示银行', accountName: '演示企业', bankAccount: ' 1234 5678 ', branchName: '演示二支行', accountKind: 'corporate', status: 'enabled' } })
    expect(bank.bankAccount).toBe('12345678')
    expect(() => service.saveBank(finance, { requestId: 'request-bank-duplicate', draft: { ...bank, accountId: 'account-bank' } })).toThrowError(FinanceDomainError)
  })

  it('creates only a clearly simulated payment application and keeps the channel unopened', () => {
    const { service } = setup(); const channel = service.listPaymentChannels(finance)[0]!
    const application = service.submitPaymentApplication(finance, { requestId: 'request-payment', channelId: channel.id })
    expect(application.status).toBe('simulated-pending')
    expect(service.listPaymentChannels(finance)[0]).toMatchObject({ status: 'unopened', application: { status: 'simulated-pending' } })
  })

  it('keeps partial provider failures explicit instead of returning fictional empty data', () => {
    const session = createFinanceMockSession('partial-failure')
    expect(() => session.service.listBanks(finance)).toThrowError(FinanceDomainError)
    expect(session.service.listAccounts(finance)).toHaveLength(4)
  })

  it('derives receivable, customer summary and aging amounts only from active writeoffs', () => {
    const { service } = setup(); const documents = service.listReceivableDocuments(finance)
    expect(documents.map((item) => [item.orderId, item.status, item.outstandingCents])).toEqual([
      ['order-022', 'open', 2600], ['order-007', 'partial', 1000], ['order-006', 'settled', 0],
    ])
    const customer = service.listCustomerReceivables(finance).find((item) => item.customer.id === 'customer-1')!
    expect(customer).toMatchObject({ receivableCents: 5000, receivedCents: 1400, outstandingCents: 3600, lastReceiptDate: '2026-08-06T14:00:00+08:00' })
    const aging = service.listReceivableAging(finance).find((item) => item.customer.id === 'customer-1')!
    expect(aging.outstandingCents).toBe(3600); expect(aging.bucket0To30Cents).toBe(3600)
  })

  it('masks customer phone for read-only supervisors and preserves the same mask in CSV', () => {
    const { service } = setup(); const row = service.listReceivableDocuments(supervisor)[0]!
    expect(row.customerSnapshot.phone).toMatch(/^\d{3}\*{4}\d{4}$/)
    expect(service.exportReceivables(supervisor)).toContain(row.customerSnapshot.phone)
    expect(service.listReceivableDocuments(finance)[0]!.customerSnapshot.phone).not.toContain('****')
  })

  it('creates an order receivable idempotently with the confirmed terms due date', () => {
    const { service, repository } = setup(); const source = financeBaseline.receivables[0]!
    const input = { requestId: 'request-new-receivable', orderId: 'order-new', orderNo: 'CA-DEMO-NEW', customerSnapshot: source.customerSnapshot, items: source.items, goodsAmountCents: 1000, freightCents: 100, amountCents: 1100, settlementMethod: 'terms' as const, paymentTermDays: 30, occurredAt: '2026-08-10T08:30:00+08:00', operator: { id: 'warehouse-demo', name: '演示仓库员', role: 'warehouse' as const } }
    const first = service.createOrderReceivable(input); const replayed = service.createOrderReceivable(input)
    expect(first.receivableNo).toBe('YS-260810-00001'); expect(first.dueDate).toBe('2026-09-09'); expect(replayed.id).toBe(first.id)
    expect(repository.read().receivables.filter((item) => item.orderId === 'order-new')).toHaveLength(1)
  })

  it('confirms a cash receipt and an immediate discount writeoff in one transaction', () => {
    const { service, repository } = setup(); const customer = financeBaseline.receivables.find((item) => item.orderId === 'order-022')!.customerSnapshot
    const result = service.createReceipt(finance, { requestId: 'request-receipt-immediate', customerSnapshot: customer, orderId: 'order-022', occurredAt: '2026-08-10T09:00:00+08:00', amountCents: 900, method: 'cash', accountId: 'account-cash', note: '演示手工优惠', immediateAllocations: [{ receivableId: 'receivable-order-022', cashCents: 900, discountCents: 100 }] })
    expect(result.receipt.receiptNo).toBe('SK-260810-00001'); expect(result.writeoff?.writeoffNo).toBe('HX-260810-00001')
    expect(service.getOrderSettlement('order-022')?.receivable.outstandingCents).toBe(1600)
    expect(repository.read().movements.filter((item) => item.sourceId === result.receipt.id)).toHaveLength(1)
  })

  it('supports a balance receipt by consuming prepayment without creating a second cash movement', () => {
    const { service, repository } = setup(); const customer = financeBaseline.receivables.find((item) => item.orderId === 'order-022')!.customerSnapshot; const before = repository.read().movements.length
    const result = service.createReceipt(finance, { requestId: 'request-balance-receipt', customerSnapshot: customer, orderId: 'order-022', occurredAt: '2026-08-10T09:00:00+08:00', amountCents: 500, method: 'balance', note: '使用期初预收', immediateAllocations: [{ receivableId: 'receivable-order-022', cashCents: 500, discountCents: 0, prepaymentSourceId: 'prepayment-opening-customer-1' }] })
    expect(result.receipt.movementId).toBeNull(); expect(repository.read().movements).toHaveLength(before)
    expect(service.listSettlementSources(finance, customer.id).find((item) => item.id === 'prepayment-opening-customer-1')?.availableCents).toBe(4500)
  })

  it('creates and cancels a many-to-many writeoff while restoring each source', () => {
    const { service } = setup(); const before = service.listSettlementSources(finance, 'customer-1').find((item) => item.id === 'customer-receipt-001')!.availableCents
    const value = service.createWriteoff(finance, { requestId: 'request-writeoff-many', customerId: 'customer-1', occurredAt: '2026-08-10T09:00:00+08:00', note: '手工匹配两张应收', allocations: [
      { sourceKind: 'receipt', sourceId: 'customer-receipt-001', receivableId: 'receivable-order-007', cashCents: 200, discountCents: 0 },
      { sourceKind: 'receipt', sourceId: 'customer-receipt-001', receivableId: 'receivable-order-022', cashCents: 300, discountCents: 0 },
    ] })
    expect(value.amountCents).toBe(500); expect(service.listSettlementSources(finance, 'customer-1').find((item) => item.id === 'customer-receipt-001')!.availableCents).toBe(before - 500)
    const cancelled = service.cancelWriteoff(finance, { requestId: 'request-writeoff-many-cancel', writeoffId: value.id, expectedVersion: value.version, reason: '演示取消核销' })
    expect(cancelled.status).toBe('cancelled'); expect(service.listSettlementSources(finance, 'customer-1').find((item) => item.id === 'customer-receipt-001')!.availableCents).toBe(before)
  })

  it('voids only an unallocated current-month receipt and appends a reversal movement', () => {
    const { service, repository } = setup(); const customer = financeBaseline.receivables.find((item) => item.orderId === 'order-022')!.customerSnapshot
    const created = service.createReceipt(finance, { requestId: 'request-voidable-receipt', customerSnapshot: customer, occurredAt: '2026-08-10T09:00:00+08:00', amountCents: 100, method: 'cash', accountId: 'account-cash' }).receipt
    const voided = service.voidReceipt(finance, { requestId: 'request-void-receipt', receiptId: created.id, expectedVersion: created.version, reason: '演示录入错误' })
    expect(voided.status).toBe('void'); expect(repository.read().movements.filter((item) => item.sourceId === created.id)).toHaveLength(2)
    expect(() => service.voidReceipt(finance, { requestId: 'request-void-again', receiptId: created.id, expectedVersion: voided.version, reason: '重复' })).toThrowError(FinanceDomainError)
  })

  it('takes an explicit customer snapshot from a Vue reactive form object', () => {
    const { service } = setup(); const customer = reactive(structuredClone(financeBaseline.receivables.find((item) => item.orderId === 'order-022')!.customerSnapshot))
    const value = service.createReceipt(finance, { requestId: 'request-reactive-form', customerSnapshot: customer, occurredAt: '2026-08-10T09:00:00+08:00', amountCents: 100, method: 'cash', accountId: 'account-cash' }).receipt
    expect(value.customerSnapshot).toEqual({ ...customer }); expect(value.customerSnapshot).not.toBe(customer)
  })

  it('rejects excess allocation and discount without an audit note atomically', () => {
    const { service, repository } = setup(); const before = repository.read()
    expect(() => service.createWriteoff(finance, { requestId: 'request-excess-writeoff', customerId: 'customer-1', occurredAt: '2026-08-10T09:00:00+08:00', allocations: [{ sourceKind: 'receipt', sourceId: 'customer-receipt-001', receivableId: 'receivable-order-007', cashCents: 0, discountCents: 1001 }] })).toThrow()
    expect(repository.read()).toEqual(before)
  })

  it('forms supplier payable from an inbound snapshot and derives aging/status', () => {
    const { service, repository } = setup(); const supplier = { id: 'supplier-1', code: 'SUP-000001', name: '演示供应商', contactName: '联系人', phone: '000-0000-0001', paymentTermDays: 30 }
    const input = { requestId: 'request-payable-1', purchaseOrderId: 'purchase-order-1', purchaseOrderNo: 'CG-260810-00001', inboundId: 'inbound-1', inboundNo: 'RK-260810-00001', supplierSnapshot: supplier, items: [{ inboundLineId: 'inbound-line-1', purchaseOrderLineId: 'purchase-line-1', skuId: 'sku-1', skuCode: 'SKU-000001', productName: '演示商品', specification: '默认', unitName: '件', quantityMilli: 2000, unitPriceCents: 500, subtotalCents: 1000, allocatedDiscountCents: 100, allocatedOtherFeeCents: 0, amountCents: 900, isGift: false }], goodsAmountCents: 1000, discountCents: 100, otherFeeCents: 0, amountCents: 900, occurredAt: '2026-08-10T08:30:00+08:00', paymentTermDays: 30, operator: { id: 'finance-demo', name: '演示财务', role: 'finance' as const } }
    const payable = service.createSupplierPayable(finance, input); expect(payable.payableNo).toBe('YF-260810-00001'); expect(payable.dueDate).toBe('2026-09-09'); expect(service.createSupplierPayable(finance, input).id).toBe(payable.id)
    expect(service.listSupplierPayables(finance).find((item) => item.id === payable.id)).toMatchObject({ outstandingCents: 900, status: 'unpaid' }); expect(repository.read().payables.some((item) => item.id === payable.id)).toBe(true)
  })

  it('creates, allocates, cancels and voids a supplier payment atomically', () => {
    const { service, repository } = setup(); const supplier = { id: 'supplier-1', code: 'SUP-000001', name: '演示供应商', contactName: '联系人', phone: '000-0000-0001', paymentTermDays: null }
    const payable = service.createSupplierPayable(finance, { requestId: 'request-payable-2', purchaseOrderId: 'purchase-order-2', purchaseOrderNo: 'CG-260810-00002', inboundId: 'inbound-2', inboundNo: 'RK-260810-00002', supplierSnapshot: supplier, items: [{ inboundLineId: 'inbound-line-2', purchaseOrderLineId: 'purchase-line-2', skuId: 'sku-1', skuCode: 'SKU-000001', productName: '演示商品', specification: '默认', unitName: '件', quantityMilli: 1000, unitPriceCents: 1200, subtotalCents: 1200, allocatedDiscountCents: 0, allocatedOtherFeeCents: 0, amountCents: 1200, isGift: false }], goodsAmountCents: 1200, discountCents: 0, otherFeeCents: 0, amountCents: 1200, occurredAt: '2026-08-10T08:30:00+08:00', paymentTermDays: null, operator: { id: 'finance-demo', name: '演示财务', role: 'finance' as const } })
    const result = service.createSupplierPayment(finance, { requestId: 'request-payment-1', supplierSnapshot: supplier, occurredAt: '2026-08-10T09:00:00+08:00', amountCents: 700, method: 'cash', accountId: 'account-cash', immediateAllocations: [{ payableId: payable.id, amountCents: 700 }] }); expect(result.payment.paymentNo).toBe('FK-260810-00001'); expect(result.writeoff?.amountCents).toBe(700); expect(service.listSupplierPayables(finance)[0]).toMatchObject({ paidCents: 700, outstandingCents: 500, status: 'partially-paid' })
    expect(() => service.voidSupplierPayment(finance, { requestId: 'request-void-payment-blocked', paymentId: result.payment.id, expectedVersion: result.payment.version, reason: '仍有核销' })).toThrowError(FinanceDomainError)
    const cancelled = service.cancelSupplierPaymentWriteoff(finance, { requestId: 'request-cancel-supplier-writeoff', writeoffId: result.writeoff!.id, expectedVersion: result.writeoff!.version, reason: '演示取消' }); expect(cancelled.status).toBe('cancelled')
    const voided = service.voidSupplierPayment(finance, { requestId: 'request-void-payment', paymentId: result.payment.id, expectedVersion: result.payment.version, reason: '演示录入错误' }); expect(voided.status).toBe('void'); expect(repository.read().movements.filter((item) => item.sourceId === result.payment.id)).toHaveLength(2); expect(service.listSupplierPayables(finance)[0]!.outstandingCents).toBe(1200)
  })

  it('rejects supplier payment account mismatch and preserves state on failure', () => {
    const { service, repository } = setup(); const before = repository.read(); const supplier = { id: 'supplier-1', code: 'SUP-000001', name: '演示供应商', contactName: '联系人', phone: '000-0000-0001', paymentTermDays: null }
    expect(() => service.createSupplierPayment(finance, { requestId: 'request-bad-payment', supplierSnapshot: supplier, occurredAt: '2026-08-10T09:00:00+08:00', amountCents: 100, method: 'bank', accountId: 'account-cash' })).toThrowError(FinanceDomainError); expect(repository.read()).toEqual(before)
  })

  it('keeps supplier aging boundaries in the confirmed six buckets', () => {
    const repository = new InMemoryFinanceRepository({ ...structuredClone(financeBaseline), payables: [] }); let sequence = 1
    const now = '2026-08-20T09:00:00+08:00'; const service = createFinanceService({ repository, now: () => now, nextId: (kind) => `${kind}-aging-${sequence++}` })
    const dateDaysAgo = (days: number) => { const value = new Date(Date.UTC(2026, 7, 20 - days)); return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}T08:00:00+08:00` }
    for (const days of [0, 30, 31, 60, 61, 90, 91, 180, 181, 365, 366]) service.createSupplierPayable(finance, supplierPayableInput(`aging-${days}`, dateDaysAgo(days), 1))
    expect(service.listSupplierPayableAging(finance)[0]).toMatchObject({ outstandingCents: 11, bucket0To30Cents: 2, bucket31To60Cents: 2, bucket61To90Cents: 2, bucket91To180Cents: 2, bucket181To365Cents: 2, bucketOver365Cents: 1 })
  })

  it('rejects insufficient balance and closed-period supplier payments atomically', () => {
    const { service, repository } = setup(); const before = repository.read()
    expect(() => service.createSupplierPayment(finance, { requestId: 'request-payment-insufficient', supplierSnapshot: supplier, occurredAt: '2026-08-10T09:00:00+08:00', amountCents: Number.MAX_SAFE_INTEGER, method: 'cash', accountId: 'account-cash' })).toThrowError(expect.objectContaining({ code: 'INVALID_STATE', message: '账户余额不足' }))
    expect(repository.read()).toEqual(before)
    expect(() => service.createSupplierPayment(finance, { requestId: 'request-payment-locked', supplierSnapshot: supplier, occurredAt: '2026-07-31T09:00:00+08:00', amountCents: 1, method: 'cash', accountId: 'account-cash' })).toThrowError(expect.objectContaining({ code: 'INVALID_STATE', message: '该月份尚未启用或已经结转' }))
    expect(repository.read()).toEqual(before)
  })

  it('replays supplier payment requests and rejects a stale void without side effects', () => {
    const { service, repository } = setup(); const input = { requestId: 'request-payment-idempotent', supplierSnapshot: supplier, occurredAt: '2026-08-10T09:00:00+08:00', amountCents: 100, method: 'cash' as const, accountId: 'account-cash' }
    const first = service.createSupplierPayment(finance, input); const afterFirst = repository.read(); const replayed = service.createSupplierPayment(finance, input)
    expect(replayed).toEqual(first); expect(repository.read()).toEqual(afterFirst); expect(afterFirst.movements.filter((item) => item.sourceId === first.payment.id)).toHaveLength(1)
    expect(() => service.voidSupplierPayment(finance, { requestId: 'request-payment-stale-void', paymentId: first.payment.id, expectedVersion: 0, reason: '并发版本演示' })).toThrowError(expect.objectContaining({ code: 'CONFLICT' }))
    expect(repository.read()).toEqual(afterFirst)
  })

  it('creates a zero-value gift payable and separates excess credit as a refund obligation', () => {
    const { service } = setup(); const gift = service.createSupplierPayable(finance, supplierPayableInput('gift', '2026-08-10T08:00:00+08:00', 0))
    expect(gift).toMatchObject({ amountCents: 0, status: 'paid' }); expect(gift.items[0]).toMatchObject({ isGift: true, unitPriceCents: 0, amountCents: 0 })
    const payable = service.createSupplierPayable(finance, supplierPayableInput('credit', '2026-08-10T08:10:00+08:00', 100))
    const credit = service.createSupplierPayableCredit(finance, { requestId: 'request-credit-excess', sourceType: 'manual', sourceId: 'manual-credit-1', sourceNo: 'CT-DEMO-001', supplierId: supplier.id, payableId: payable.id, amountCents: 250, occurredAt: '2026-08-10T08:30:00+08:00', operator: { id: finance.actorId, name: '演示财务', role: finance.role } })
    expect(credit).toMatchObject({ outstandingReductionCents: 100, refundObligationCents: 150 })
    expect(service.listSupplierPayables(finance).find((item) => item.id === payable.id)).toMatchObject({ creditedCents: 100, outstandingCents: 0, status: 'paid' })
  })
})
