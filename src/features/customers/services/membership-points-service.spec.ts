import { beforeEach, describe, expect, it } from 'vitest'
import { customerBaseline } from '../../../../mock/handlers/customer-handler'
import { InMemoryCustomerRepository } from '../repositories/customer-repository'
import type { CustomerActor, MembershipLevelDraft, PointsSettingsDraft } from '../types'
import { CustomerDomainError } from './customer-service'
import { createCustomerOperationsService } from './customer-operations-service'

const admin: CustomerActor = { role: 'super-admin', actorId: 'admin-demo' }
const salesperson: CustomerActor = { role: 'salesperson', actorId: 'staff-demo-1' }

describe('CUS-003/CUS-007 membership and points', () => {
  let repository: InMemoryCustomerRepository
  let service: ReturnType<typeof createCustomerOperationsService>
  let sequence: number
  beforeEach(() => { sequence = 1; repository = new InMemoryCustomerRepository(customerBaseline); service = createCustomerOperationsService({ repository, now: () => '2026-08-26T10:00:00+08:00', nextId: (kind) => `${kind}-test-${sequence++}`, staffNames: {} }) })

  it('protects membership level codes, inactive references and one current level per customer', () => {
    const levels = service.listMembershipLevels(admin)
    expect(levels).toHaveLength(2)
    const draft: MembershipLevelDraft = { name: '演示银卡', code: 'DEMO-SILVER', icon: null, sortOrder: 3, conditionType: 'orders', conditionValue: 3, retainConditionValue: null, retainPeriodMonths: null, autoUpgrade: false, memberDiscountPercent: 98, pointsMultiplier: 1.2, benefits: { freeShipping: false, priorityShipping: false, dedicatedService: false, birthdayGift: false, birthdayCouponId: null, exclusiveProductIds: [] }, status: 'active' }
    const created = service.saveMembershipLevel(admin, draft)
    expect(() => service.saveMembershipLevel(admin, { ...draft, name: '重复编码' })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_CODE' }))
    service.assignMembership(admin, 'customer-1', created.id)
    expect(service.listMemberships(admin).find((item) => item.customerId === 'customer-1')?.levelId).toBe(created.id)
    expect(() => service.assignMembership(salesperson, 'customer-1', levels[0]!.id)).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
  })

  it('keeps point ledger immutable, requestId idempotent, and rejects overspending', () => {
    const before = service.listPointAccounts(admin).items.find((item) => item.customerId === 'customer-1')!
    const entry = service.adjustPoints(admin, 'customer-1', 'increase', 100, '演示补偿', 'req-1')
    expect(entry.points).toBe(100)
    expect(service.adjustPoints(admin, 'customer-1', 'increase', 100, '重复请求', 'req-1').id).toBe(entry.id)
    expect(service.listPointAccounts(admin).items.find((item) => item.customerId === 'customer-1')!.availablePoints).toBe(before.availablePoints + 100)
    expect(() => service.adjustPoints(admin, 'customer-1', 'decrease', 999999, '超额扣减', 'req-2')).toThrowError(CustomerDomainError)
    expect(() => service.adjustPoints(salesperson, 'customer-1', 'increase', 1, '无权限', 'req-3')).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
    expect(service.listPointLedger(admin, 'customer-1').some((item) => item.id === entry.id)).toBe(true)
  })

  it('validates settings conditionally and uses controlled expiry command', () => {
    const settings = service.getPointsSettings(admin)
    const invalid: PointsSettingsDraft = { ...settings, expiryType: 'fixed-days', expiryDays: null }
    expect(() => service.savePointsSettings(admin, invalid)).toThrowError(/固定天数/)
    expect(service.savePointsSettings(admin, { ...settings, expiryType: 'fixed-days', expiryDays: 30 }).expiryDays).toBe(30)
    expect(service.expirePoints(admin)).toBe(0)
  })
})
