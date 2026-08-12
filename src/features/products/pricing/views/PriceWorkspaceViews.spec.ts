import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import UnitPriceView from './UnitPriceView.vue'
import PriceStrategyView from './PriceStrategyView.vue'

describe('PRD-002 price workspace views', () => {
  afterEach(() => vi.useRealTimers())

  it('renders unit conversion sources, the complete matrix and the missing-order boundary', async () => {
    vi.useFakeTimers()
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/products/prices/order-unit-prices', component: UnitPriceView }] })
    await router.push('/products/prices/order-unit-prices'); await router.isReady()
    const wrapper = mount(UnitPriceView, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('显式覆盖')
    expect(wrapper.text()).toContain('基准进货价')
    expect(wrapper.text()).toContain('终端价')
    expect(wrapper.text()).toContain('数据源未接入')
  })

  it('renders strategy target, anchor, lifecycle and execution log columns', async () => {
    vi.useFakeTimers()
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/products/prices/strategies', component: PriceStrategyView }] })
    await router.push('/products/prices/strategies'); await router.isReady()
    const wrapper = mount(PriceStrategyView, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('自动调价策略')
    expect(wrapper.text()).toContain('目标售价')
    expect(wrapper.text()).toContain('调价基准')
    expect(wrapper.text()).toContain('失败日志')
    expect(wrapper.text()).toContain('DEMO-BAR-0001')
  })
})
