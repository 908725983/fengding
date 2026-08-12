import { beforeEach, describe, expect, it } from 'vitest'
import { createAuthorizationMockSession } from '../../../../../mock/handlers/authorization-handler'
import type { AuthorizationActor, AuthorizationPlanDraft, AuthorizationRuleDraft } from '../types'

const admin: AuthorizationActor = { role: 'super-admin', actorId: 'admin-test' }
const supervisor: AuthorizationActor = { role: 'sales-supervisor', actorId: 'supervisor-test' }
const salesperson: AuthorizationActor = { role: 'salesperson', actorId: 'sales-test' }
const warehouse: AuthorizationActor = { role: 'warehouse', actorId: 'warehouse-test' }
const finance: AuthorizationActor = { role: 'finance', actorId: 'finance-test' }

describe('PRD-003 authorization service', () => {
  let session = createAuthorizationMockSession('normal')
  beforeEach(() => { session = createAuthorizationMockSession('normal') })

  it('resolves category descendants, brand intersection and explicit product union', () => {
    const item = session.service.listPlans(admin).items.find((plan) => plan.code === 'AUTH-000001')!
    expect(item.productCount).toBe(2)
    expect(item.categoryNames).toEqual(['演示饮品'])
  })

  it('applies domain gates before plan and special authorization', () => {
    expect(session.service.resolveAuthorization(admin, 'customer-2', 'product-1').reason).toBe('customer-not-active')
    expect(session.service.resolveAuthorization(admin, 'customer-1', 'product-2').reason).toBe('product-not-on-sale')
  })

  it('uses [start,end) and special authorization precedence', () => {
    expect(session.service.resolveAuthorization(admin, 'customer-1', 'product-1', '2026-08-10T09:59:00+08:00')).toMatchObject({ visible: true, orderable: false, reason: 'special-visible-only' })
    expect(session.service.resolveAuthorization(admin, 'customer-1', 'product-1', '2026-08-10T10:00:00+08:00')).toMatchObject({ visible: true, orderable: true, reason: 'allowed' })
  })

  it('keeps direct plan and weekly rule sources explainable', () => {
    const result = session.service.resolveAuthorization(admin, 'customer-1', 'product-1', '2026-08-10T10:00:00+08:00')
    expect(result.sources.map((item) => item.type)).toEqual(expect.arrayContaining(['direct-plan', 'timed-rule']))
  })

  it('creates automatic nonreused plan codes and protects referenced deletion', () => {
    const input: AuthorizationPlanDraft = { name: '测试授权方案', status: 'enabled', categoryIds: [], brandIds: [], productIds: ['product-1'], customerIds: ['customer-1'] }
    const plan = session.service.createPlan(admin, input)
    expect(plan.code).toBe('AUTH-000003')
    const rule: AuthorizationRuleDraft = { name: '测试规则', weekdays: [1], timeRanges: [{ start: '08:00', end: '09:00' }], planId: plan.id, customerIds: ['customer-1'] }
    session.service.createRule(admin, rule)
    expect(() => session.service.deletePlan(admin, plan.id)).toThrow('存在规则引用')
  })

  it('rejects overlapping batch specials atomically', () => {
    const before = session.repository.read().specials.length
    expect(() => session.service.createSpecialBatch(admin, { customerIds: ['customer-1'], productIds: ['product-1', 'product-3'], type: 'prohibited', startsAt: '2026-08-10T09:30:00+08:00', endsAt: '2026-08-10T11:00:00+08:00', note: null })).toThrow('不能重叠')
    expect(session.repository.read().specials.length).toBe(before)
  })

  it('edits a special while preserving its customer and product identity', () => {
    const updated = session.service.updateSpecial(admin, 'authorization-special-1', { type: 'prohibited', startsAt: '2026-08-10T09:00:00+08:00', endsAt: '2026-08-10T09:30:00+08:00', note: '调整后的禁止窗口' })
    expect(updated).toMatchObject({ customerId: 'customer-1', productId: 'product-1', type: 'prohibited', note: '调整后的禁止窗口' })
  })

  it('previews CSV and rejects an invalid batch without mutation', () => {
    const before = session.service.getPlan(admin, 'authorization-plan-1').productIds
    const preview = session.service.previewPlanProductsCsv(admin, 'authorization-plan-1', 'productCode\nSPU-000001\nSPU-000001\nUNKNOWN')
    expect(preview.rows.map((item) => item.status)).toEqual(['valid', 'duplicate', 'error'])
    expect(() => session.service.importPlanProductsCsv(admin, 'authorization-plan-1', 'productCode\nSPU-000003\nUNKNOWN')).toThrow('整批未导入')
    expect(session.service.getPlan(admin, 'authorization-plan-1').productIds).toEqual(before)
  })

  it('enforces configuration, write and resolution permissions', () => {
    expect(session.service.listPlans(supervisor).total).toBe(2)
    expect(() => session.service.createPlan(supervisor, { name: '无权', status: 'enabled', categoryIds: [], brandIds: [], productIds: [], customerIds: [] })).toThrow('不可修改')
    expect(() => session.service.listPlans(salesperson)).toThrow('不可访问商品授权配置')
    expect(session.service.resolveAuthorization(salesperson, 'customer-1', 'product-1').visible).toBe(true)
    expect(session.service.resolveAuthorization(warehouse, 'customer-1', 'product-1').visible).toBe(true)
    expect(() => session.service.resolveAuthorization(finance, 'customer-1', 'product-1')).toThrow('不可查看')
  })
})
