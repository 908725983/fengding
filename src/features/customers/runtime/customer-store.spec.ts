import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCustomerStore } from './customer-store'

describe('CUS-001 customer runtime scenarios', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => vi.useRealTimers())

  it('loads normal data and exposes cross-domain metrics as unavailable', async () => {
    const store = useCustomerStore()
    const loading = store.load()
    expect(store.loading).toBe(true)
    await vi.advanceTimersByTimeAsync(120)
    await loading
    expect(store.result.total).toBe(2)
    expect(store.result.items[0]).toMatchObject({ id: 'customer-2', orderCount: null, consumptionAmountCents: null, receivableBalanceCents: null })
  })

  it('reproduces empty, error, slow and permission-denied states', async () => {
    const store = useCustomerStore()

    let request = store.setScenario('empty')
    await vi.advanceTimersByTimeAsync(80)
    await request
    expect(store.isEmpty).toBe(true)

    request = store.setScenario('error')
    await vi.advanceTimersByTimeAsync(120)
    await request
    expect(store.error).toContain('服务暂时不可用')

    request = store.setScenario('slow')
    await vi.advanceTimersByTimeAsync(1799)
    expect(store.loading).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    await request
    expect(store.result.total).toBe(2)

    request = store.setScenario('permission-denied')
    await vi.advanceTimersByTimeAsync(100)
    await request
    expect(store.error).toContain('不可访问客户模块')
  })
})
