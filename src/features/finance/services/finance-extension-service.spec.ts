import { describe, expect, it } from 'vitest'
import { createFinanceMockSession } from '../../../../mock/handlers/finance-handler'
import type { FinanceActor } from '../types'

const admin: FinanceActor = { actorId: 'admin-demo', role: 'super-admin' }
const supervisor: FinanceActor = { actorId: 'supervisor-demo', role: 'sales-supervisor' }
const salesperson: FinanceActor = { actorId: 'sales-demo', role: 'salesperson' }
const occurredAt = '2026-08-10T09:00:00+08:00'

describe('finance extension service', () => {
  it('keeps a pending transfer off-ledger and posts an atomic balanced pair on approval', () => {
    const session = createFinanceMockSession()
    const before = session.repository.read()
    const created = session.service.createTransfer(admin, { requestId: 'transfer-create-1', fromAccountId: 'account-cash', toAccountId: 'account-bank', amountCents: 1234, occurredAt, note: '演示内部调拨' })
    expect(created).toMatchObject({ status: 'pending-review', movementIds: [] })
    expect(session.repository.read().movements).toHaveLength(before.movements.length)

    const approved = session.service.approveTransfer(admin, { requestId: 'transfer-approve-1', transferId: created.id, expectedVersion: created.version })
    expect(approved).toMatchObject({ status: 'completed' })
    expect(approved.movementIds).toHaveLength(2)
    const movements = session.repository.read().movements.filter((item) => approved.movementIds.includes(item.id))
    expect(movements.map((item) => [item.kind, item.direction, item.amountCents])).toEqual([
      ['transfer-out', 'expense', 1234], ['transfer-in', 'income', 1234],
    ])
    expect(session.service.approveTransfer(admin, { requestId: 'transfer-approve-1', transferId: created.id, expectedVersion: created.version }).id).toBe(created.id)
  })

  it('rolls back both transfer sides when the source balance is insufficient', () => {
    const session = createFinanceMockSession()
    const created = session.service.createTransfer(admin, { requestId: 'transfer-create-poor', fromAccountId: 'account-cash', toAccountId: 'account-bank', amountCents: 999_999_999, occurredAt })
    const checkpoint = session.repository.read()
    expect(() => session.service.approveTransfer(admin, { requestId: 'transfer-approve-poor', transferId: created.id, expectedVersion: created.version })).toThrow('账户余额不足')
    expect(session.repository.read()).toEqual(checkpoint)
  })

  it('posts other income only after approval and groups approved items', () => {
    const session = createFinanceMockSession()
    const pending = session.service.createOtherTransaction(admin, { requestId: 'other-create-1', direction: 'income', occurredAt, counterparty: '演示往来单位', itemId: 'finance-item-income-1', amountCents: 880, accountId: 'account-cash' })
    expect(pending.movementId).toBeNull()
    const approved = session.service.reviewOtherTransaction(admin, { requestId: 'other-review-1', transactionId: pending.id, expectedVersion: 1, decision: 'approve' })
    expect(approved).toMatchObject({ status: 'approved' })
    expect(session.repository.read().movements.find((item) => item.id === approved.movementId)).toMatchObject({ kind: 'other-income', direction: 'income', amountCents: 880 })
    expect(session.service.summarizeOtherTransactions(admin)).toEqual([{ itemId: 'finance-item-income-1', itemName: '押金退回', incomeCents: 880, expenseCents: 0, netCents: 880 }])
  })

  it('confirms a supplier refund obligation in full and prevents duplicate receipt', () => {
    const session = createFinanceMockSession()
    const credit = session.service.createSupplierPayableCredit(admin, { requestId: 'supplier-credit-refund', sourceType: 'purchase-return', sourceId: 'return-test', sourceNo: 'CT-TEST', supplierId: 'supplier-1', payableId: 'payable-demo-002', amountCents: 1000, occurredAt, operator: { id: 'admin-demo', name: '管理员', role: 'super-admin' } })
    expect(credit.refundObligationCents).toBe(100)
    const receipt = session.service.confirmSupplierRefund(admin, { requestId: 'supplier-refund-1', creditId: credit.id, accountId: 'account-cash', occurredAt })
    expect(receipt.amountCents).toBe(100)
    expect(session.service.listSupplierRefundObligations(admin).find((item) => item.credit.id === credit.id)).toMatchObject({ receivedCents: 100, outstandingCents: 0, status: 'refunded' })
    expect(() => session.service.confirmSupplierRefund(admin, { requestId: 'supplier-refund-2', creditId: credit.id, accountId: 'account-cash', occurredAt })).toThrow('已确认到账')
    const detail = session.service.getSupplierRefundDetail(admin, credit.id)
    expect(detail).toMatchObject({ receipt: { creditId: credit.id, amountCents: 100 }, accountName: '现金账户' })
    expect(detail.movement?.sourceId).toBe(detail.receipt?.id)
  })

  it('keeps the original refund immutable while creating a linked shortfall correction', () => {
    const session = createFinanceMockSession()
    const created = session.service.createReturnCredit({ requestId: 'customer-credit-original', sourceType: 'customer-return', sourceId: 'return-correction-source', sourceNo: 'TH-CORRECT-001', orderId: 'order-006', amountCents: 1000, refundPreference: 'original', occurredAt, operator: { id: admin.actorId, name: '管理员', role: admin.role } })
    const original = session.service.confirmRefund(admin, { requestId: 'customer-refund-original', refundId: created.refund!.id, expectedVersion: created.refund!.version, method: 'original', occurredAt })
    const originalSnapshot = structuredClone(original)
    const correction = session.service.correctRefund(admin, { requestId: 'customer-refund-correction', refundId: original.id, expectedVersion: original.version, expectedAmountCents: 1200, sourceNo: 'TH-CORRECT-001-A', occurredAt, operator: { id: admin.actorId, name: '管理员', role: admin.role }, reason: '原路退款少退 2.00 元' })
    expect(correction.credit).toMatchObject({ amountCents: 200, refundObligationCents: 200, correctionOfRefundId: original.id })
    expect(correction.refund).toMatchObject({ requestedAmountCents: 200, status: 'pending', correctionOfRefundId: original.id })
    expect(session.service.getRefund(admin, original.id)).toEqual(originalSnapshot)
    const movements = session.repository.read().movements.filter((item) => item.sourceId === original.id)
    expect(movements).toHaveLength(1)
  })

  it('creates a pending other-income recovery linked to an overpaid refund', () => {
    const session = createFinanceMockSession()
    const created = session.service.createReturnCredit({ requestId: 'customer-credit-overpaid', sourceType: 'customer-return', sourceId: 'return-overpaid-source', sourceNo: 'TH-OVERPAID-001', orderId: 'order-006', amountCents: 1000, refundPreference: 'original', occurredAt, operator: { id: admin.actorId, name: '管理员', role: admin.role } })
    const original = session.service.confirmRefund(admin, { requestId: 'customer-refund-overpaid', refundId: created.refund!.id, expectedVersion: created.refund!.version, method: 'original', occurredAt })
    const recovery = session.service.createRefundRecovery(admin, { requestId: 'customer-refund-recovery', refundId: original.id, expectedVersion: original.version, amountCents: 300, occurredAt, itemId: 'finance-item-income-1', accountId: 'account-cash', reason: '原退款多退追回' })
    expect(recovery).toMatchObject({ direction: 'income', amountCents: 300, status: 'pending-review', correctionOfId: original.id, movementId: null })
    const approved = session.service.reviewOtherTransaction(admin, { requestId: 'customer-refund-recovery-review', transactionId: recovery.id, expectedVersion: recovery.version, decision: 'approve' })
    expect(approved.movementId).toBeTruthy()
    expect(session.repository.read().movements.find((item) => item.id === approved.movementId)).toMatchObject({ kind: 'other-income', amountCents: 300, sourceId: recovery.id })
  })

  it('uses canonical receipts and receivables for monthly statistics', () => {
    const session = createFinanceMockSession()
    const methods = session.service.getMethodStatistics(supervisor, '2026-08')
    expect(methods.totalCents).toBe(35000)
    expect(methods.rows.find((item) => item.method === 'cash')).toMatchObject({ amountCents: 10000, receiptCount: 1 })
    expect(methods.rows.reduce((sum, item) => sum + (item.ratioBasisPoints ?? 0), 0)).toBe(10000)
    const orders = session.service.getOrderPaymentStatistics(supervisor, '2026-07')
    expect(orders.rows).toHaveLength(3)
    expect(orders.receivableCents).toBe(6400)
    expect(orders.receivedCents).toBe(2800)
    expect(orders.outstandingCents).toBe(3600)
  })

  it('keeps management and export permissions out of supervisor and salesperson roles', () => {
    const session = createFinanceMockSession()
    expect(() => session.service.createTransfer(supervisor, { requestId: 'forbidden-transfer', fromAccountId: 'account-cash', toAccountId: 'account-bank', amountCents: 1, occurredAt })).toThrow('没有该资金操作权限')
    expect(() => session.service.exportStatisticsCsv(supervisor, 'methods', '2026-08')).toThrow('没有该资金操作权限')
    expect(() => session.service.getMethodStatistics(salesperson, '2026-08')).toThrow('没有该资金操作权限')
    expect(() => session.service.getInstitutionReceipts(admin)).toThrow('第三方资料服务暂时不可用')
  })
})
