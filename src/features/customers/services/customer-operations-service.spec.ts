import { beforeEach, describe, expect, it } from 'vitest'
import { customerBaseline } from '../../../../mock/handlers/customer-handler'
import { InMemoryCustomerRepository } from '../repositories/customer-repository'
import type { CustomerActor, OpportunityDraft, VisitDraft } from '../types'
import { createCustomerOperationsService } from './customer-operations-service'

const admin: CustomerActor = { role: 'super-admin', actorId: 'admin-demo' }
const salesperson: CustomerActor = { role: 'salesperson', actorId: 'staff-demo-1' }
const warehouse: CustomerActor = { role: 'warehouse', actorId: 'warehouse-demo' }

describe('CRM operations CUS-002/CUS-004/CUS-005', () => {
  let repository: InMemoryCustomerRepository
  let sequence: number
  let service: ReturnType<typeof createCustomerOperationsService>
  beforeEach(() => { repository = new InMemoryCustomerRepository(customerBaseline); sequence = 1; service = createCustomerOperationsService({ repository, now: () => '2026-08-25T10:00:00+08:00', nextId: (kind) => `${kind}-test-${sequence++}`, staffNames: {} }) })

  it('creates opportunities, preserves probability override, and protects terminal state', () => {
    const input: OpportunityDraft = { customerId: 'customer-1', name: '演示商机', amountCents: 10001, stage: 'lead', probabilityPercent: 17, expectedCloseDate: null, ownerId: 'staff-demo-1', source: 'manual', description: null }
    const created = service.createOpportunity(admin, input)
    expect(created.probabilityPercent).toBe(17)
    expect(service.advanceOpportunity(admin, created.id, 'qualified').probabilityPercent).toBe(30)
    const won = service.advanceOpportunity(admin, created.id, 'won', 88)
    expect(won.status).toBe('won')
    expect(won.probabilityPercent).toBe(88)
    expect(() => service.advanceOpportunity(admin, created.id, 'lost')).toThrow(/终态/)
    expect(() => service.deleteOpportunity(admin, created.id)).toThrow(/成交商机/)
  })

  it('keeps frequent product quick order side-effect free and enforces duplicate key', () => {
    const before = repository.read().customers
    const existing = service.listFrequentProducts(admin).items[0]!
    expect(service.quickOrder(admin, existing.customerId, existing.skuId).path).toContain('/orders/new')
    expect(repository.read().customers).toEqual(before)
    expect(() => service.addFrequentProduct(admin, { customerId: existing.customerId, skuId: existing.skuId, source: 'manual', purchaseCount: null, lastPurchasedAt: null, averageQuantity: null, totalQuantity: null, totalAmountCents: null, note: null, active: true })).toThrow(/已存在/)
  })

  it('claims public sea idempotently and enforces permissions', () => {
    const entry = service.listPublicSea(admin).items[0]!
    const claimed = service.claimPublicSea(salesperson, entry.id)
    expect(claimed.status).toBe('protected')
    expect(service.claimPublicSea(salesperson, entry.id).id).toBe(entry.id)
    expect(() => service.claimPublicSea(warehouse, entry.id)).toThrow(/不可修改客户运营/)
    expect(() => service.savePublicSeaRule(salesperson, { noOrderDays: 1, noVisitDays: 1, newCustomerInactiveDays: 1, dailyClaimLimit: 1, monthlyClaimLimit: 1, protectionDays: 1, excludedCategoryIds: [], excludedTagIds: [] })).toThrow(/不可管理/)
  })

  it('requires fake check-in before completing a visit and keeps real GPS out', () => {
    const input: VisitDraft = { customerId: 'customer-1', salespersonId: 'staff-demo-1', visitAt: '2026-08-25T10:00:00+08:00', checkInAt: null, checkOutAt: null, durationMinutes: null, type: 'onsite', result: null, status: 'planned', placedOrder: false, orderId: null, fakeLongitude: null, fakeLatitude: null, checkInDistanceMeters: null, photo: null, note: null, nextPlan: null }
    const created = service.createVisit(salesperson, input)
    expect(() => service.completeVisit(salesperson, created.id, 'positive')).toThrow(/先使用 fake 签到/)
    const checked = service.checkInVisit(salesperson, created.id)
    expect(checked.fakeLongitude).toBe(121.4737)
    expect(checked.fakeLatitude).toBe(31.2304)
    expect(service.completeVisit(salesperson, created.id, 'positive').status).toBe('completed')
  })
})
