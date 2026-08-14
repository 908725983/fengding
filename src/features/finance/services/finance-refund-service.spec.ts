import { describe, expect, it } from 'vitest'
import { financeBaseline } from '../../../../mock/handlers/finance-handler'
import { InMemoryFinanceRepository } from '../repositories/finance-repository'
import { createFinanceRefundService } from './finance-refund-service'
import { FinanceDomainError } from './finance-service'

const admin = { role: 'super-admin' as const, actorId: 'admin-demo' }
const operator = { id: admin.actorId, name: '演示管理员', role: admin.role }
function setup() { const repository = new InMemoryFinanceRepository(financeBaseline); let id = 1; const service = createFinanceRefundService({ repository, now: () => '2026-08-10T10:00:00+08:00', nextId: (kind) => `${kind}-refund-test-${id++}`, actorName: () => '演示管理员' }); return { repository, service } }

describe('ORD-005 finance credit and refund boundary', () => {
  it('creates an immutable credit, reduces outstanding first and auto-creates a TK refund for paid excess', () => {
    const { repository, service } = setup()
    const result = service.createReturnCredit({ requestId: 'credit-001', sourceType: 'customer-return', sourceId: 'return-test-001', sourceNo: 'TH-260810-00001', orderId: 'order-006', amountCents: 1000, refundPreference: 'original', occurredAt: '2026-08-10T10:00:00+08:00', operator })
    expect(result.credit.outstandingReductionCents).toBe(0); expect(result.credit.refundObligationCents).toBe(1000); expect(result.refund?.refundNo).toMatch(/^TK-260810-\d{5}$/)
    expect(repository.read().receivables.find((item) => item.orderId === 'order-006')!.amountCents).toBe(1400)
    expect(service.createReturnCredit({ requestId: 'credit-001', sourceType: 'customer-return', sourceId: 'return-test-001', sourceNo: 'TH-260810-00001', orderId: 'order-006', amountCents: 1000, refundPreference: 'original', occurredAt: '2026-08-10T10:00:00+08:00', operator }).credit.id).toBe(result.credit.id)
  })

  it('never turns writeoff discount into cash refund', () => {
    const { repository, service } = setup(); const fullAmount = repository.read().receivables.find((item) => item.orderId === 'order-007')!.amountCents
    const result = service.createReturnCredit({ requestId: 'credit-discount', sourceType: 'customer-return', sourceId: 'return-test-discount', sourceNo: 'TH-260810-00002', orderId: 'order-007', amountCents: fullAmount, refundPreference: 'original', occurredAt: '2026-08-10T10:00:00+08:00', operator })
    expect(result.credit.refundObligationCents).toBe(1200); expect(result.credit.nonRefundableDiscountCents).toBe(200); expect(result.refund?.requestedAmountCents).toBe(1200)
  })

  it('confirms all original allocations atomically and rejects invalid special accounts without side effects', () => {
    const { repository, service } = setup(); const created = service.createReturnCredit({ requestId: 'credit-confirm', sourceType: 'customer-return', sourceId: 'return-test-confirm', sourceNo: 'TH-260810-00003', orderId: 'order-006', amountCents: 1400, refundPreference: 'original', occurredAt: '2026-08-10T10:00:00+08:00', operator }); const before = repository.read()
    expect(() => service.confirmRefund(admin, { requestId: 'refund-invalid', refundId: created.refund!.id, expectedVersion: created.refund!.version, method: 'cash', cashAccountId: 'account-bank', reason: '客户要求现金退款', occurredAt: '2026-08-10T10:00:00+08:00' })).toThrow(FinanceDomainError)
    expect(repository.read()).toEqual(before)
    const paid = service.confirmRefund(admin, { requestId: 'refund-original', refundId: created.refund!.id, expectedVersion: created.refund!.version, method: 'original', occurredAt: '2026-08-10T10:00:00+08:00' })
    expect(paid.status).toBe('refunded'); expect(paid.refundedAmountCents).toBe(paid.requestedAmountCents); expect(paid.allocations.reduce((sum, item) => sum + item.amountCents, 0)).toBe(1400)
    expect(repository.read().movements.some((item) => item.kind === 'refund' && item.sourceId === paid.id)).toBe(true)
  })

  it('rejects with reason and reapplies the full remaining obligation under a new number', () => {
    const { service } = setup(); const created = service.createReturnCredit({ requestId: 'credit-reject', sourceType: 'customer-return', sourceId: 'return-test-reject', sourceNo: 'TH-260810-00004', orderId: 'order-006', amountCents: 500, refundPreference: 'balance', occurredAt: '2026-08-10T10:00:00+08:00', operator })
    const rejected = service.rejectRefund(admin, { requestId: 'refund-reject', refundId: created.refund!.id, expectedVersion: created.refund!.version, reason: '收款资料需要重新复核', occurredAt: '2026-08-10T10:00:00+08:00' })
    const reapplied = service.reapplyRefund(admin, { requestId: 'refund-reapply', refundId: rejected.id, expectedVersion: rejected.version, occurredAt: '2026-08-10T10:00:00+08:00' })
    expect(reapplied.refundNo).not.toBe(rejected.refundNo); expect(reapplied.requestedAmountCents).toBe(500); expect(reapplied.status).toBe('pending')
  })
})
