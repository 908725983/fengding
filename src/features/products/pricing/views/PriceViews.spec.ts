import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import PriceAdjustmentListView from './PriceAdjustmentListView.vue'
import PriceHistoryView from './PriceHistoryView.vue'

function routerAt(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  return router.push(path).then(() => router.isReady()).then(() => router)
}

describe('PRD-002 pricing list views', () => {
  afterEach(() => vi.useRealTimers())

  it('renders customer adjustment columns and baseline state without inventing orders', async () => {
    const router = await routerAt('/products/prices/customer-adjustments'); vi.useFakeTimers()
    const wrapper = mount(PriceAdjustmentListView, { props: { type: 'customer' }, global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('客户调价单')
    expect(wrapper.text()).toContain('CPA-20260810-0001')
    expect(wrapper.text()).toContain('演示客户甲')
    expect(wrapper.text()).toContain('待生效')
    expect(wrapper.text()).not.toContain('相关订单 1')
  })

  it('renders immutable field-level price history with SKU references', async () => {
    const router = await routerAt('/products/prices/history'); vi.useFakeTimers()
    const wrapper = mount(PriceHistoryView, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('历史调价')
    expect(wrapper.text()).toContain('SKU-000001')
    expect(wrapper.text()).toContain('演示基础商品')
    expect(wrapper.text()).toContain('一批价')
  })
})
