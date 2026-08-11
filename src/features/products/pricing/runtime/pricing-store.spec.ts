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
})
