import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import { InMemoryFinanceRepository } from '../../src/features/finance/repositories/finance-repository'
import { FinanceDomainError, createFinanceService } from '../../src/features/finance/services/finance-service'
import type { FinanceFeatureState } from '../../src/features/finance/types'
import type { OrderFeatureState } from '../../src/features/orders/types'

const featureData = baseline.featureData as Record<string, unknown>
function upgradeFinanceBaseline(source: FinanceFeatureState): FinanceFeatureState {
  const state = structuredClone(source); const orderState = structuredClone(featureData['ORD-001']) as OrderFeatureState
  state.creditAdjustments = []; state.refunds = []
  const operator = { id: 'finance-demo', name: '演示财务', role: 'finance' as const }
  const makeReceivable = (orderId: string, id: string, receivableNo: string, occurredAt: string, dueDate: string) => {
    const order = orderState.orders.find((item) => item.id === orderId)!; const goodsAmountCents = order.amounts.orderAmountCents - order.amounts.freightCents
    return { id, enterpriseId: state.enterpriseId, receivableNo, source: 'order-shipment' as const, orderId: order.id, orderNo: order.orderNo, customerSnapshot: { id: order.customerSnapshot.id, code: order.customerSnapshot.code, name: order.customerSnapshot.name, contactName: order.shippingSnapshot.recipient, phone: order.shippingSnapshot.phone }, items: order.lines.map((line) => ({ orderLineId: line.id, skuId: line.skuId, skuCode: line.skuCodeSnapshot, productName: line.productNameSnapshot, specification: line.specificationSnapshot, unitName: line.unitSnapshot.name, quantityMilli: line.quantityMilli, unitPriceCents: line.dealUnitPriceCents, subtotalCents: line.subtotalCents })), goodsAmountCents, freightCents: order.amounts.freightCents, amountCents: order.amounts.orderAmountCents, settlementMethod: order.settlementSnapshot.method, paymentTermDays: order.settlementSnapshot.creditTermDays, dueDate, occurredAt, requestId: `seed-${id}`, createdBy: operator, version: 1 }
  }
  state.receivables = [
    makeReceivable('order-006', 'receivable-order-006', 'YS-260715-00001', '2026-07-15T16:00:00+08:00', '2026-07-31'),
    makeReceivable('order-007', 'receivable-order-007', 'YS-260716-00001', '2026-07-16T17:00:00+08:00', '2026-07-16'),
    makeReceivable('order-022', 'receivable-order-022', 'YS-260731-00001', '2026-07-31T12:00:00+08:00', '2026-08-30'),
  ]
  const customer1 = state.receivables.find((item) => item.orderId === 'order-007')!.customerSnapshot; const customer2 = state.receivables.find((item) => item.orderId === 'order-006')!.customerSnapshot
  const movementCash = state.movements.find((item) => item.id === 'finance-movement-007')!; const movementBank = state.movements.find((item) => item.id === 'finance-movement-009')!
  movementCash.kind = 'receipt'; movementCash.sourceId = 'customer-receipt-002'; movementCash.sourceNoSnapshot = 'SK-260803-00001'; movementCash.counterpartySnapshot = customer2.name; movementCash.summary = '客户收款 SK-260803-00001'
  movementBank.kind = 'receipt'; movementBank.sourceId = 'customer-receipt-001'; movementBank.sourceNoSnapshot = 'SK-260806-00001'; movementBank.counterpartySnapshot = customer1.name; movementBank.summary = '客户收款 SK-260806-00001'
  state.customerReceipts = [
    { id: 'customer-receipt-001', enterpriseId: state.enterpriseId, receiptNo: 'SK-260806-00001', customerSnapshot: structuredClone(customer1), orderId: null, occurredAt: movementBank.occurredAt, amountCents: movementBank.amountCents, method: 'bank', accountId: movementBank.accountId, movementId: movementBank.id, attachment: { id: 'fake-attachment-001', name: 'demo-bank-receipt.pdf', mimeType: 'application/pdf', sizeBytes: 12000 }, note: '虚构银行收款演示', status: 'normal', voidInfo: null, requestId: 'seed-receipt-001', operatorSnapshot: operator, version: 1 },
    { id: 'customer-receipt-002', enterpriseId: state.enterpriseId, receiptNo: 'SK-260803-00001', customerSnapshot: structuredClone(customer2), orderId: 'order-006', occurredAt: movementCash.occurredAt, amountCents: movementCash.amountCents, method: 'cash', accountId: movementCash.accountId, movementId: movementCash.id, attachment: null, note: '虚构现金收款演示', status: 'normal', voidInfo: null, requestId: 'seed-receipt-002', operatorSnapshot: operator, version: 1 },
  ]
  state.receiptWriteoffs = [
    { id: 'writeoff-001', enterpriseId: state.enterpriseId, writeoffNo: 'HX-260803-00001', customerId: customer2.id, occurredAt: '2026-08-03T10:00:00+08:00', allocations: [{ id: 'allocation-001', sourceKind: 'receipt', sourceId: 'customer-receipt-002', receivableId: 'receivable-order-006', cashCents: 1400, discountCents: 0 }], cashCents: 1400, discountCents: 0, amountCents: 1400, note: '演示全额核销', status: 'active', cancelInfo: null, requestId: 'seed-writeoff-001', operatorSnapshot: operator, version: 1 },
    { id: 'writeoff-002', enterpriseId: state.enterpriseId, writeoffNo: 'HX-260806-00001', customerId: customer1.id, occurredAt: '2026-08-06T14:00:00+08:00', allocations: [{ id: 'allocation-002', sourceKind: 'receipt', sourceId: 'customer-receipt-001', receivableId: 'receivable-order-007', cashCents: 1200, discountCents: 200 }], cashCents: 1200, discountCents: 200, amountCents: 1400, note: '演示手工优惠 2.00 元', status: 'active', cancelInfo: null, requestId: 'seed-writeoff-002', operatorSnapshot: operator, version: 1 },
    { id: 'writeoff-003', enterpriseId: state.enterpriseId, writeoffNo: 'HX-260806-00002', customerId: customer1.id, occurredAt: '2026-08-06T14:00:00+08:00', allocations: [{ id: 'allocation-003', sourceKind: 'receipt', sourceId: 'customer-receipt-001', receivableId: 'receivable-order-022', cashCents: 500, discountCents: 0 }], cashCents: 500, discountCents: 0, amountCents: 500, note: '演示已取消核销', status: 'cancelled', cancelInfo: { reason: '演示取消：核销对象选择错误', cancelledAt: '2026-08-07T09:00:00+08:00', cancelledBy: operator }, requestId: 'seed-writeoff-003', operatorSnapshot: operator, version: 2 },
  ]
  state.prepaymentLedger = [
    { id: 'prepayment-ledger-001', enterpriseId: state.enterpriseId, customerId: customer1.id, bucket: 'available', orderId: null, sourceType: 'receipt', sourceId: 'customer-receipt-001', amountDeltaCents: 25000, occurredAt: movementBank.occurredAt, requestId: 'seed-receipt-001' },
    { id: 'prepayment-ledger-002', enterpriseId: state.enterpriseId, customerId: customer1.id, bucket: 'available', orderId: null, sourceType: 'writeoff', sourceId: 'customer-receipt-001', amountDeltaCents: -1200, occurredAt: '2026-08-06T14:00:00+08:00', requestId: 'seed-writeoff-002' },
    { id: 'prepayment-ledger-003', enterpriseId: state.enterpriseId, customerId: customer1.id, bucket: 'available', orderId: null, sourceType: 'writeoff', sourceId: 'customer-receipt-001', amountDeltaCents: -500, occurredAt: '2026-08-06T14:00:00+08:00', requestId: 'seed-writeoff-003' },
    { id: 'prepayment-ledger-004', enterpriseId: state.enterpriseId, customerId: customer1.id, bucket: 'available', orderId: null, sourceType: 'writeoff-cancel', sourceId: 'customer-receipt-001', amountDeltaCents: 500, occurredAt: '2026-08-07T09:00:00+08:00', requestId: 'seed-writeoff-cancel-003' },
    { id: 'prepayment-ledger-005', enterpriseId: state.enterpriseId, customerId: customer2.id, bucket: 'available', orderId: null, sourceType: 'receipt', sourceId: 'customer-receipt-002', amountDeltaCents: 10000, occurredAt: movementCash.occurredAt, requestId: 'seed-receipt-002' },
    { id: 'prepayment-ledger-006', enterpriseId: state.enterpriseId, customerId: customer2.id, bucket: 'available', orderId: null, sourceType: 'writeoff', sourceId: 'customer-receipt-002', amountDeltaCents: -1400, occurredAt: '2026-08-03T10:00:00+08:00', requestId: 'seed-writeoff-001' },
    { id: 'prepayment-ledger-007', enterpriseId: state.enterpriseId, customerId: customer1.id, bucket: 'available', orderId: null, sourceType: 'opening', sourceId: 'prepayment-opening-customer-1', amountDeltaCents: 5000, occurredAt: '2026-07-01T00:00:00+08:00', requestId: 'seed-prepayment-opening' },
    { id: 'prepayment-ledger-008', enterpriseId: state.enterpriseId, customerId: customer1.id, bucket: 'occupied', orderId: 'order-007', sourceType: 'order-occupation', sourceId: 'prepayment-order-007', amountDeltaCents: 1000, occurredAt: '2026-07-16T15:00:00+08:00', requestId: 'seed-prepayment-order-007' },
  ]
  state.dailySequences = [
    { date: '2026-07-15', receivable: 2, receipt: 1, writeoff: 1 }, { date: '2026-07-16', receivable: 2, receipt: 1, writeoff: 1 },
    { date: '2026-07-31', receivable: 2, receipt: 1, writeoff: 1 }, { date: '2026-08-03', receivable: 1, receipt: 2, writeoff: 2 },
    { date: '2026-08-06', receivable: 1, receipt: 2, writeoff: 3 },
  ]
  return state
}
export const financeBaseline = upgradeFinanceBaseline(structuredClone(featureData['FIN-003']) as FinanceFeatureState)
export function createBaselineFinanceRepository(): InMemoryFinanceRepository { return new InMemoryFinanceRepository(financeBaseline) }

export type FinanceScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied' | 'partial-failure' | 'boundary' | 'concurrent'
const scenarios = { normal: normalScenario, empty: emptyScenario, error: errorScenario, slow: slowScenario, 'permission-denied': permissionScenario, 'partial-failure': normalScenario, boundary: normalScenario, concurrent: normalScenario } as const

export class FinanceMockError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = 'FinanceMockError' } }

export function createFinanceMockSession(scenarioName: FinanceScenarioName = 'normal') {
  const state = structuredClone(financeBaseline)
  if (scenarioName === 'empty') { state.accounts = []; state.movements = []; state.periods = []; state.banks = []; state.paymentChannels = []; state.paymentApplications = []; state.receivables = []; state.customerReceipts = []; state.receiptWriteoffs = []; state.prepaymentLedger = []; state.dailySequences = []; state.requests = []; state.auditLogs = []; state.creditAdjustments = []; state.refunds = [] }
  const repository = new InMemoryFinanceRepository(state); let sequence = 1
  const unavailable = () => { throw new FinanceDomainError('DATA_PROVIDER_UNAVAILABLE', '原型模拟：第三方资料服务暂时不可用') }
  const service = createFinanceService({ repository, now: () => baseline.clock, nextId: (kind) => `${kind}-runtime-${sequence++}`, actorName: () => '演示操作员', assertBankProvider: scenarioName === 'partial-failure' ? unavailable : undefined, assertPaymentProvider: scenarioName === 'partial-failure' ? unavailable : undefined })
  const definition = scenarios[scenarioName]
  async function run<T>(operation: () => T): Promise<T> { await new Promise((resolve) => setTimeout(resolve, definition.latencyMs)); if (scenarioName === 'error') throw new FinanceMockError('MOCK_INTERNAL_ERROR', '原型模拟：资金服务暂时不可用'); return operation() }
  return { scenarioName, repository, service, run }
}
