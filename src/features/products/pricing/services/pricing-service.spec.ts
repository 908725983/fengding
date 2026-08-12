import { beforeEach, describe, expect, it } from 'vitest'
import { createPricingMockSession } from '../../../../../mock/handlers/pricing-handler'
import type { PriceAdjustmentDraft, PricingActor } from '../types'
import { applyPriceFormula, PricingDomainError } from './pricing-service'

const admin: PricingActor = { role: 'super-admin', actorId: 'admin-demo' }
const salesperson: PricingActor = { role: 'salesperson', actorId: 'sales-demo' }
const warehouse: PricingActor = { role: 'warehouse', actorId: 'warehouse-demo' }
const finance: PricingActor = { role: 'finance', actorId: 'finance-demo' }

function futureLevelDraft(effectiveAt = '2026-08-10T11:00:00+08:00'): PriceAdjustmentDraft {
  return {
    type: 'level', customerId: null, formulaAnchor: 'base-order', effectiveAt, note: '测试调价',
    lines: [{ skuId: 'sku-1', unitId: 'unit-piece', changes: { tierTwoPriceCents: 1150 } }],
  }
}

describe('PRD-002 pricing service', () => {
  let session: ReturnType<typeof createPricingMockSession>

  beforeEach(() => { session = createPricingMockSession() })

  it('uses role-compatible read access and admin-only mutations', () => {
    expect(session.service.listAdjustments(salesperson, { type: 'level' }).total).toBe(1)
    expect(session.service.listAdjustments(warehouse, { type: 'customer' }).total).toBe(0)
    expect(() => session.service.getAdjustment(salesperson, 'price-adjustment-customer-1')).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
    expect(() => session.service.listAdjustments(finance, { type: 'level' })).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
    expect(() => session.service.createAdjustment(salesperson, futureLevelDraft())).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
  })

  it('masks cost, purchase price and customer identity according to the confirmed roles', () => {
    const supervisor: PricingActor = { role: 'sales-supervisor', actorId: 'supervisor-demo' }
    const supervisorPurchase = session.service.getAdjustment(supervisor, 'price-adjustment-purchase-2')
    expect(supervisorPurchase.lines).toEqual([])
    const salespersonLevel = session.service.getAdjustment(salesperson, 'price-adjustment-level-1')
    expect(salespersonLevel.lines[0]?.changes).toEqual({ tierOnePriceCents: 1080 })
    expect(session.service.listHistory(supervisor).items.some((item) => item.field === 'costPriceCents')).toBe(false)
    expect(session.service.listHistory(salesperson).items.every((item) => item.customerId === null)).toBe(true)
  })

  it('resolves category tier price, then switches to customer price at the controlled clock', () => {
    expect(session.service.resolvePrice(salesperson, { customerId: 'customer-1', skuId: 'sku-1', unitId: 'unit-piece', quantity: 2 }))
      .toMatchObject({ unitPriceCents: 1080, source: 'level', conversionRate: 1 })

    session.service.advanceClock(admin, '2026-08-10T10:00:00+08:00')

    expect(session.service.getAdjustment(admin, 'price-adjustment-customer-1').status).toBe('effective')
    expect(session.service.resolvePrice(salesperson, { customerId: 'customer-1', skuId: 'sku-1', unitId: 'unit-piece', quantity: 2 }))
      .toMatchObject({ unitPriceCents: 990, source: 'customer' })
    expect(session.service.listHistory(admin).items[0]).toMatchObject({ previousValueCents: 1080, valueCents: 990, differenceCents: -90 })
  })

  it('allows pending edits and deletion but freezes effective adjustments', () => {
    const created = session.service.createAdjustment(admin, futureLevelDraft())
    expect(created.status).toBe('pending')
    expect(session.service.updateAdjustment(admin, created.id, { ...futureLevelDraft(), note: '已修改' }).note).toBe('已修改')
    session.service.advanceClock(admin, '2026-08-10T11:00:00+08:00')
    expect(() => session.service.updateAdjustment(admin, created.id, futureLevelDraft('2026-08-10T12:00:00+08:00')))
      .toThrowError(expect.objectContaining({ code: 'INVALID_STATE' }))
    expect(() => session.service.deleteAdjustment(admin, created.id)).toThrowError(expect.objectContaining({ code: 'INVALID_STATE' }))

    const deletable = session.service.createAdjustment(admin, futureLevelDraft('2026-08-10T12:00:00+08:00'))
    session.service.deleteAdjustment(admin, deletable.id)
    expect(() => session.service.getAdjustment(admin, deletable.id)).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }))
  })

  it('rejects overlapping schedules atomically and does not consume a document number', () => {
    session.service.createAdjustment(admin, futureLevelDraft())
    const before = session.repository.read()
    expect(() => session.service.createAdjustment(admin, futureLevelDraft())).toThrowError(expect.objectContaining({ code: 'SCHEDULE_CONFLICT' }))
    expect(session.repository.read()).toEqual(before)
  })

  it('treats purchase and level cost changes as the same global-scope conflict', () => {
    session.service.createAdjustment(admin, {
      type: 'purchase', customerId: null, formulaAnchor: null, effectiveAt: '2026-08-10T11:00:00+08:00', note: null,
      lines: [{ skuId: 'sku-1', unitId: 'unit-piece', changes: { costPriceCents: 730 } }],
    })
    expect(() => session.service.createAdjustment(admin, {
      type: 'level', customerId: null, formulaAnchor: 'base-order', effectiveAt: '2026-08-10T11:00:00+08:00', note: null,
      lines: [{ skuId: 'sku-1', unitId: 'unit-piece', changes: { costPriceCents: 740 } }],
    })).toThrowError(expect.objectContaining({ code: 'SCHEDULE_CONFLICT' }))
  })

  it('applies purchase prices without changing the sales price path', () => {
    const before = session.service.resolvePrice(admin, { customerId: 'customer-1', skuId: 'sku-1', unitId: 'unit-piece', quantity: 1 })
    session.service.createAdjustment(admin, {
      type: 'purchase', customerId: null, formulaAnchor: null, effectiveAt: '2026-08-10T09:00:00+08:00', note: null,
      lines: [{ skuId: 'sku-1', unitId: 'unit-piece', changes: { costPriceCents: 720, basePurchasePriceCents: 820 } }],
    })
    const state = session.repository.read()
    expect(state.costBasis.find((item) => item.skuId === 'sku-1')?.costPriceCents).toBe(720)
    expect(session.service.resolvePrice(admin, { customerId: 'customer-1', skuId: 'sku-1', unitId: 'unit-piece', quantity: 1 })).toEqual(before)
  })

  it('runs automatic strategies deterministically and records the true prior value', () => {
    session.service.advanceClock(admin, '2026-08-10T10:30:00+08:00')
    const entry = session.service.listHistory(admin).items.find((item) => item.adjustmentNumber === 'STRATEGY-price-strategy-1')
    expect(entry).toMatchObject({ field: 'storePriceCents', previousValueCents: 1400, valueCents: 1320, differenceCents: -80 })
    expect(session.repository.read().strategies[0]).toMatchObject({ lastRunAt: '2026-08-10T10:30:00+08:00', lastError: null })
  })

  it('keeps a same-minute manual price and records the automatic strategy conflict', () => {
    session.service.createAdjustment(admin, {
      type: 'level', customerId: null, formulaAnchor: 'base-order', effectiveAt: '2026-08-10T10:30:00+08:00', note: null,
      lines: [{ skuId: 'sku-1', unitId: 'unit-piece', changes: { storePriceCents: 1500 } }],
    })
    session.service.advanceClock(admin, '2026-08-10T10:30:00+08:00')
    const state = session.repository.read()
    expect(state.strategies[0]).toMatchObject({ lastRunAt: '2026-08-10T10:30:00+08:00', lastError: expect.stringContaining('同一生效分钟') })
    expect(state.versions.find((item) => item.field === 'storePriceCents' && item.expiredAt === null)?.valueCents).toBe(1500)
  })

  it('rejects inactive customers, off-sale products and malformed quantities', () => {
    expect(() => session.service.resolvePrice(admin, { customerId: 'customer-2', skuId: 'sku-1', unitId: 'unit-piece', quantity: 1 }))
      .toThrowError(expect.objectContaining({ code: 'CUSTOMER_NOT_ACTIVE' }))
    expect(() => session.service.resolvePrice(admin, { customerId: 'customer-1', skuId: 'sku-2', unitId: 'unit-bottle', quantity: 1 }))
      .toThrowError(expect.objectContaining({ code: 'PRODUCT_NOT_ORDERABLE' }))
    expect(() => session.service.resolvePrice(admin, { customerId: 'customer-1', skuId: 'sku-1', unitId: 'unit-piece', quantity: 1.2345 }))
      .toThrowError(expect.objectContaining({ code: 'PRICE_UNAVAILABLE' }))
  })

  it('uses half-up cent rounding for fixed and percentage formulas', () => {
    expect(applyPriceFormula(333, 'increase-percent', 50)).toBe(500)
    expect(applyPriceFormula(1000, 'decrease-fixed', 75)).toBe(925)
    expect(() => applyPriceFormula(100, 'decrease-percent', 150)).toThrowError(PricingDomainError)
  })

  it('provides only orderable SKUs and active customers to the form', () => {
    expect(session.service.getFormOptions(admin)).toMatchObject({
      clock: '2026-08-10T09:00:00+08:00',
      skus: [{ skuId: 'sku-1' }],
      customers: [{ customerId: 'customer-1', status: 'active' }],
    })
    expect(() => session.service.getFormOptions(salesperson)).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
  })

  it('applies a selected field formula to the draft without persisting it', () => {
    const before = session.repository.read()
    const draft = futureLevelDraft()
    draft.lines[0]!.changes = { tierOnePriceCents: 1080 }
    const calculated = session.service.applyAdjustmentFormula(admin, { draft, field: 'tierOnePriceCents', mode: 'increase-percent', operand: 10 })
    expect(calculated.lines[0]!.changes.tierOnePriceCents).toBe(1188)
    expect(session.repository.read()).toEqual(before)
    expect(() => session.service.applyAdjustmentFormula(admin, { draft, field: 'basePurchasePriceCents', mode: 'set', operand: 800 }))
      .toThrowError(expect.objectContaining({ code: 'FORMULA_INVALID' }))
  })

  it('returns a complete effective matrix for form previews', () => {
    const draft = futureLevelDraft()
    const matrix = session.service.getDraftMatrix(admin, draft)[0]
    expect(matrix).toMatchObject({ sku: { skuCode: 'SKU-000001' }, unitId: 'unit-piece' })
    expect(matrix?.values).toMatchObject({ costPriceCents: 700, basePurchasePriceCents: 800, tierOnePriceCents: 1080, tierTwoPriceCents: 1150 })
    expect(session.service.getDraftMatrix(salesperson, draft)[0]?.values).toMatchObject({
      costPriceCents: null,
      basePurchasePriceCents: null,
      tierOnePriceCents: 1080,
    })
  })
})
