import { beforeEach, describe, expect, it } from 'vitest'
import { createDistributionMockSession } from '../../../../../mock/handlers/distribution-handler'
import type { DistributionActor, DistributionPlanDraft } from '../types'

const admin: DistributionActor = { role: 'super-admin', actorId: 'admin-test' }
const supervisor: DistributionActor = { role: 'sales-supervisor', actorId: 'supervisor-test' }
const salesperson: DistributionActor = { role: 'salesperson', actorId: 'sales-test', accessibleCustomerIds: ['customer-1'] }
const warehouse: DistributionActor = { role: 'warehouse', actorId: 'warehouse-test' }

describe('PRD-004 distribution service', () => {
  let session = createDistributionMockSession('normal')
  beforeEach(() => { session = createDistributionMockSession('normal'); session.setClock('2026-08-10T10:00:00+08:00') })

  it('matches region/category/tag dimensions by AND and category descendants', () => {
    const input: DistributionPlanDraft = { name: '组合范围铺货', status: 'enabled', startsAt: '2026-08-10T10:00:00+08:00', endsAt: '2026-08-11T10:00:00+08:00', scope: { type: 'criteria', provinceCodes: ['DEMO-P'], cityCodes: [], districtCodes: [], categoryIds: ['category-retail'], tagIds: ['tag-focus'], customerIds: [] }, lines: [{ skuId: 'sku-1', quantity: 1 }] }
    session.service.savePlan(admin, input)
    expect(session.service.resolveDistribution(admin, 'customer-1', 'mobile-self-order').accepted).toHaveLength(1)
  })

  it('only applies distribution to mobile self-order and remains a pure query (PRD-15)', () => {
    const before = session.repository.read()
    expect(session.service.resolveDistribution(admin, 'customer-1', 'assisted-order')).toMatchObject({ applicable: false, accepted: [] })
    const first = session.service.resolveDistribution(admin, 'customer-1', 'mobile-self-order')
    const second = session.service.resolveDistribution(admin, 'customer-1', 'mobile-self-order')
    expect(first).toEqual(second); expect(first.accepted[0]?.sourceKey).toContain('distribution-plan-1'); expect(session.repository.read()).toEqual(before)
  })

  it('filters unauthorized/off-sale products and invalid distribution quantities (PRD-16)', () => {
    const plan = session.service.getPlan(admin, 'distribution-plan-1'); plan.lines = [{ skuId: 'sku-1', quantity: 1 }, { skuId: 'sku-2', quantity: 5 }]
    session.service.savePlan(admin, plan, plan.id)
    const result = session.service.resolveDistribution(admin, 'customer-1', 'mobile-self-order')
    expect(result.accepted.map((item) => item.skuId)).toEqual(['sku-1'])
    expect(result.rejected[0]).toMatchObject({ skuId: 'sku-2', reason: 'product-not-on-sale' })
  })

  it('sums duplicate SKU quantities across active plans and revalidates the final quantity', () => {
    const existing = session.service.getPlan(admin, 'distribution-plan-1'); session.service.savePlan(admin, { ...existing, name: '第二份铺货', startsAt: '2026-08-10T10:00:00+08:00', lines: [{ skuId: 'sku-1', quantity: 1 }] })
    expect(session.service.resolveDistribution(admin, 'customer-1', 'mobile-self-order').accepted[0]).toMatchObject({ skuId: 'sku-1', quantity: 2, sourceIds: ['distribution-plan-1', 'distribution-plan-runtime-1'] })
  })

  it('normalizes template quantity upward and keeps filtered rows explainable (PRD-11)', () => {
    const result = session.service.loadTemplate(admin, 'order-template-1', 'customer-1', 'mobile-self-order')
    expect(result.accepted[0]).toMatchObject({ skuId: 'sku-1', quantity: 1 })
    expect(result.rejected[0]).toMatchObject({ skuId: 'sku-2', reason: 'product-not-on-sale' })
  })

  it('allows assisted use when self-order is disabled but rejects mobile use', () => {
    expect(session.service.loadTemplate(admin, 'order-template-2', 'customer-1', 'mobile-self-order').applicable).toBe(false)
    expect(session.service.loadTemplate(admin, 'order-template-2', 'customer-1', 'assisted-order').accepted).toHaveLength(1)
  })

  it('keeps order statistics unavailable instead of fabricating zero', () => {
    expect(session.service.getStatistics(supervisor)).toMatchObject({ status: 'unavailable', items: [] })
    expect(() => session.service.exportStatisticsCsv(supervisor)).toThrow('数据源未接入')
  })

  it('enforces configuration, write and customer-scoped consumption permissions', () => {
    expect(session.service.listPlans(supervisor).total).toBe(2)
    expect(() => session.service.changePlanStatus(supervisor, 'distribution-plan-1', 'disabled')).toThrow('不可修改')
    expect(() => session.service.listPlans(salesperson)).toThrow('不可访问')
    expect(session.service.loadTemplate(salesperson, 'order-template-1', 'customer-1', 'assisted-order').accepted).toHaveLength(1)
    expect(() => session.service.loadTemplate({ ...salesperson, accessibleCustomerIds: [] }, 'order-template-1', 'customer-1', 'assisted-order')).toThrow('本人可见客户')
    expect(() => session.service.loadTemplate(warehouse, 'order-template-1', 'customer-1', 'assisted-order')).toThrow('不可消费')
  })
})
