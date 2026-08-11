import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProductStore } from './product-store'

describe('PRD-001 product runtime scenarios', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('loads SPU/SKU results and partial reference failure independently', async () => {
    const store = useProductStore()
    let request = store.load(); await vi.advanceTimersByTimeAsync(120); await request
    expect(store.result.total).toBe(3)
    request = store.setView('sku'); await vi.advanceTimersByTimeAsync(120); await request
    expect(store.result.total).toBe(4)
    request = store.setScenario('partial-failure'); await vi.advanceTimersByTimeAsync(120); await request
    expect(store.result.total).toBe(4)
    expect(store.referenceError).toContain('品牌资料加载失败')
    expect(store.references.categories.length).toBeGreaterThan(0)
  })

  it('reproduces empty, error, slow and permission-denied states', async () => {
    const store = useProductStore()
    let request = store.setScenario('empty'); await vi.advanceTimersByTimeAsync(80); await request; expect(store.isEmpty).toBe(true)
    request = store.setScenario('error'); await vi.advanceTimersByTimeAsync(120); await request; expect(store.error).toContain('服务暂时不可用')
    request = store.setScenario('slow'); await vi.advanceTimersByTimeAsync(1799); expect(store.loading).toBe(true); await vi.advanceTimersByTimeAsync(1); await request; expect(store.result.total).toBe(3)
    request = store.setScenario('permission-denied'); await vi.advanceTimersByTimeAsync(100); await request; expect(store.error).toContain('不可访问商品模块')
  })
})
