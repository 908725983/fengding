import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePricingStore } from './pricing-store'

describe('PRD-002 pricing runtime scenarios', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('loads adjustment and history pages with source-backed references', async () => {
    const store = usePricingStore()
    let request = store.loadAdjustments('customer'); await vi.advanceTimersByTimeAsync(120); await request
    expect(store.adjustments.total).toBe(1)
    expect(store.customerName('customer-1')).toBe('演示客户甲')
    request = store.loadHistory(); await vi.advanceTimersByTimeAsync(120); await request
    expect(store.history.total).toBeGreaterThan(0)
    expect(store.skuSnapshot('sku-1')).toMatchObject({ skuCode: 'SKU-000001', productName: '演示基础商品' })
  })

  it('reproduces empty, error, slow, denied, partial and exact-minute boundary states', async () => {
    const store = usePricingStore()
    let request = store.setScenario('empty'); await vi.advanceTimersByTimeAsync(80); await request; expect(store.isEmpty).toBe(true)
    request = store.setScenario('error'); await vi.advanceTimersByTimeAsync(120); await request; expect(store.error).toContain('价格服务暂时不可用')
    request = store.setScenario('slow'); await vi.advanceTimersByTimeAsync(1799); expect(store.loading).toBe(true); await vi.advanceTimersByTimeAsync(1); await request
    request = store.setScenario('permission-denied'); await vi.advanceTimersByTimeAsync(100); await request; expect(store.error).toContain('不可访问价格模块')
    request = store.setScenario('partial-failure'); await vi.advanceTimersByTimeAsync(120); await request; expect(store.referenceError).toContain('客户资料加载失败')
    request = store.loadAdjustments('customer'); await vi.advanceTimersByTimeAsync(120); await request
    request = store.setScenario('boundary'); await vi.advanceTimersByTimeAsync(120); await request
    expect(store.clock).toBe('2026-08-10T10:00:00+08:00')
    expect(store.adjustments.items[0]).toMatchObject({ status: 'effective' })
  })

  it('creates, edits, advances and deletes through the asynchronous runtime boundary', async () => {
    const store = usePricingStore()
    let request = store.loadFormOptions(); await vi.advanceTimersByTimeAsync(120); await request
    expect(store.formOptions.skus.map((item) => item.skuId)).toEqual(['sku-1'])
    const draft = { type: 'level' as const, customerId: null, formulaAnchor: 'base-order' as const, effectiveAt: '2026-08-10T11:00:00+08:00', note: null,
      lines: [{ skuId: 'sku-1', unitId: 'unit-piece', changes: { tierTwoPriceCents: 1150 } }] }
    const createRequest = store.createAdjustment(draft); await vi.advanceTimersByTimeAsync(120); const created = await createRequest
    const updateRequest = store.updateAdjustment(created.id, { ...draft, note: '已修改' }); await vi.advanceTimersByTimeAsync(120); expect((await updateRequest).note).toBe('已修改')
    const clockRequest = store.advanceClock('2026-08-10T11:00:00+08:00'); await vi.advanceTimersByTimeAsync(240); await clockRequest
    expect(store.clock).toBe('2026-08-10T11:00:00+08:00')
    const secondCreate = store.createAdjustment({ ...draft, effectiveAt: '2026-08-10T12:00:00+08:00' }); await vi.advanceTimersByTimeAsync(120); const deletable = await secondCreate
    const deleteRequest = store.deleteAdjustment(deletable.id); await vi.advanceTimersByTimeAsync(120); await deleteRequest
    expect(store.selectedAdjustment).toBeNull()
  })

  it('loads and saves unit prices and strategies through the workspace boundary', async () => {
    const store = usePricingStore()
    let request = store.loadWorkspace('unit-prices'); await vi.advanceTimersByTimeAsync(120); await request
    expect(store.unitPrices.some((item) => item.explicitOverride)).toBe(true)
    const unitSave = store.saveUnitOverride('sku-1', 'unit-piece', { terminalPriceCents: 1550 }); await vi.advanceTimersByTimeAsync(240); await unitSave
    expect(store.unitPrices.find((item) => item.sku.skuId === 'sku-1' && item.unitId === 'unit-piece')?.values.terminalPriceCents).toBe(1550)
    const strategySave = store.saveStrategy({ skuId: 'sku-1', unitId: 'unit-piece', targetField: 'terminalPriceCents', anchor: 'base-order-price',
      amplitudeType: 'percent', amplitude: 20, enabled: true, startsAt: '2026-08-10T11:00:00+08:00', endsAt: null })
    await vi.advanceTimersByTimeAsync(240); const strategy = await strategySave
    expect(store.strategies.some((item) => item.id === strategy.id)).toBe(true)
  })
})
