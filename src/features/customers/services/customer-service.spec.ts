import { beforeEach, describe, expect, it } from 'vitest'
import { customerBaseline } from '../../../../mock/handlers/customer-handler'
import { InMemoryCustomerRepository } from '../repositories/customer-repository'
import type { CustomerActor, CustomerDraft, PaymentMethod } from '../types'
import {
  CustomerDomainError,
  applyCategoryToDraft,
  changeSettlementMethod,
  createCustomerService,
  createEmptyCustomerDraft,
  getOrderEligibility,
} from './customer-service'

const admin: CustomerActor = { role: 'super-admin', actorId: 'admin-demo' }
const salesperson: CustomerActor = { role: 'salesperson', actorId: 'staff-demo-1' }
const warehouse: CustomerActor = { role: 'warehouse', actorId: 'warehouse-demo' }

function validDraft(): CustomerDraft {
  return {
    ...createEmptyCustomerDraft(),
    name: '演示新增客户',
    categoryId: 'category-retail-east',
    primaryContactName: '演示联系人',
    primaryPhone: '000-0000-0099',
    provinceCode: 'DEMO-P',
    cityCode: 'DEMO-C',
    districtCode: 'DEMO-D',
    address: '演示新增地址（非真实地址）',
    salespersonId: 'staff-demo-1',
  }
}

function existingDraft(customerId: string, repository: InMemoryCustomerRepository): CustomerDraft {
  const customer = repository.read().customers.find((item) => item.id === customerId)!
  const { id: _id, enterpriseId: _enterpriseId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = customer
  return { ...fields, codeMode: 'manual', code: customer.code }
}

describe('CUS-001 customer service', () => {
  let repository: InMemoryCustomerRepository
  let sequence: number
  let service: ReturnType<typeof createCustomerService>

  beforeEach(() => {
    repository = new InMemoryCustomerRepository(customerBaseline)
    sequence = 1
    service = createCustomerService({
      repository,
      now: () => '2026-08-11T10:00:00+08:00',
      nextId: (kind) => `${kind}-generated-${sequence++}`,
      staffNames: { 'staff-demo-1': '演示业务员甲', 'staff-demo-2': '演示业务员乙' },
    })
  })

  it('applies confirmed defaults and category payment-term linkage', () => {
    const empty = createEmptyCustomerDraft()
    expect(empty.settlementMethod).toBe('cash')
    expect(empty.businessSettings).toEqual({
      canViewInventory: false, canSelfOrder: false, canViewPrice: false, acceptsMarketing: false, autoAssignOrders: false,
    })
    const category = repository.read().categories.find((item) => item.id === 'category-retail-east')!
    const withCategory = applyCategoryToDraft(empty, category)
    expect(withCategory).toMatchObject({ categoryId: category.id, creditLimitCents: 200000, settlementMethod: 'terms', paymentTermDays: 30 })
    expect(changeSettlementMethod(withCategory, 'monthly').paymentTermDays).toBeNull()
  })

  it('auto-generates empty customer codes and atomically rejects duplicates (CUS-01)', () => {
    const autoCreated = service.createCustomer(admin, { ...validDraft(), code: '', codeMode: 'auto' })
    expect(autoCreated.code).toMatch(/^CUS-\d{6}$/)

    const created = service.createCustomer(admin, { ...validDraft(), codeMode: 'manual', code: 'CUS-TEST-001' })
    expect(created.code).toBe('CUS-TEST-001')

    const duplicate = { ...validDraft(), codeMode: 'manual' as const, code: 'cus-000001' }
    const before = repository.read()
    expect(() => service.createCustomer(admin, duplicate)).toThrowError(CustomerDomainError)
    expect(repository.read()).toEqual(before)
    expect(() => service.createCustomer(admin, { ...validDraft(), codeMode: 'manual', code: 'CUS-INACTIVE-001', status: 'inactive' })).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }))
  })

  it('requires a 16-19 digit card number when bank transfer is selected', () => {
    const base = { ...validDraft(), codeMode: 'manual' as const, code: 'CUS-BANK-001', paymentMethods: ['bank-transfer'] as PaymentMethod[] }
    expect(() => service.createCustomer(admin, { ...base, bankAccount: '1234' })).toThrowError(/银行卡号必须为 16～19 位数字/)
    expect(() => service.createCustomer(admin, { ...base, bankAccount: '1234567890123456' })).not.toThrow()
  })

  it('filters a category with descendants and matches any selected tag', () => {
    expect(service.listCustomers(admin, { categoryId: 'category-retail' }).total).toBe(2)
    expect(service.listCustomers(admin, { categoryId: 'category-retail-east' }).items.map((item) => item.id)).toEqual(['customer-1'])
    expect(service.listCustomers(admin, { tagIds: ['tag-focus', 'tag-ai'] }).items.map((item) => item.id)).toEqual(['customer-1'])
  })

  it('enforces module permission and masks sensitive values outside super admin', () => {
    expect(() => service.listCustomers(warehouse)).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
    expect(service.getCustomer(admin, 'customer-1').bankAccount).toBe('0000000000000001')
    expect(service.getCustomer(salesperson, 'customer-1').bankAccount).toBe('************0001')
    expect(service.getCustomer(salesperson, 'customer-1').taxId).toBe('**************0001')
  })

  it('allows only confirmed status transitions and requires a freeze reason', () => {
    expect(() => service.changeCustomerStatus(admin, 'customer-1', 'frozen')).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }))
    const frozen = service.changeCustomerStatus(admin, 'customer-1', 'frozen', '演示风险原因')
    expect(frozen).toMatchObject({ status: 'frozen', frozenReason: '演示风险原因' })
    expect(getOrderEligibility(frozen, 1)).toEqual({ allowed: false, reason: 'customer-not-active' })
    const active = service.changeCustomerStatus(admin, 'customer-1', 'active')
    expect(getOrderEligibility(active, 200001)).toEqual({ allowed: false, reason: 'credit-limit-exceeded' })
    expect(() => service.changeCustomerStatus(admin, 'customer-1', 'pending')).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }))
  })

  it('allows profile edits in every status while protecting sensitive fields', () => {
    service.changeCustomerStatus(admin, 'customer-1', 'frozen', '演示冻结')
    const frozenDraft = { ...existingDraft('customer-1', repository), name: '演示冻结客户已编辑' }
    expect(service.updateCustomer(admin, 'customer-1', frozenDraft).name).toBe('演示冻结客户已编辑')

    const salesDraft = { ...existingDraft('customer-1', repository), bankAccount: '9999999999999999' }
    expect(() => service.updateCustomer(salesperson, 'customer-1', salesDraft)).toThrowError(expect.objectContaining({ code: 'SENSITIVE_FIELD_FORBIDDEN' }))
  })

  it('prevents referenced category deletion and category cycles', () => {
    expect(() => service.deleteCategory(admin, 'category-retail')).toThrowError(expect.objectContaining({ code: 'REFERENCE_CONFLICT' }))
    const root = repository.read().categories.find((item) => item.id === 'category-retail')!
    expect(() => service.updateCategory(admin, root.id, { ...root, parentId: 'category-retail-east' })).toThrowError(expect.objectContaining({ code: 'REFERENCE_CONFLICT' }))
  })

  it('prevents tag deletion/type changes while referenced', () => {
    expect(() => service.deleteTag(admin, 'tag-focus')).toThrowError(expect.objectContaining({ code: 'REFERENCE_CONFLICT' }))
    const smartTag = repository.read().tags.find((item) => item.id === 'tag-ai')!
    expect(() => service.updateTag(admin, smartTag.id, { ...smartTag, type: 'manual' })).toThrowError(expect.objectContaining({ code: 'REFERENCE_CONFLICT' }))
  })

  it('keeps AI suggestions separate until human confirmation (CUS-09)', () => {
    expect(service.getCustomer(admin, 'customer-1').tagIds).toEqual(['tag-focus'])
    service.resolveSuggestions(admin, ['suggestion-1'], 'confirm')
    expect(service.getCustomer(admin, 'customer-1').tagIds).toEqual(['tag-focus', 'tag-ai'])
    expect(service.listSuggestions(admin).find((item) => item.id === 'suggestion-1')?.status).toBe('confirmed')
    expect(() => service.resolveSuggestions(admin, ['suggestion-1'], 'confirm')).toThrowError(expect.objectContaining({ code: 'SUGGESTION_NOT_PENDING' }))
  })

  it('creates deterministic immediate-analysis suggestions and rejection has no tag side effect', () => {
    const created = service.analyzeTags(admin, { scope: 'specified', customerIds: ['customer-2'] })
    expect(created).toHaveLength(1)
    expect(service.getCustomer(admin, 'customer-2').tagIds).toEqual([])
    service.resolveSuggestions(admin, [created[0]!.id], 'reject')
    expect(service.getCustomer(admin, 'customer-2').tagIds).toEqual([])
  })

  it('rejects unavailable transaction filtering instead of fabricating zero totals', () => {
    expect(() => service.listCustomers(admin, { transactionMinCents: 100 })).toThrowError(expect.objectContaining({ code: 'DATA_PROVIDER_UNAVAILABLE' }))
  })
})
