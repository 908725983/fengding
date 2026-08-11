import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProductDetailView from './ProductDetailView.vue'

describe('PRD-001 product detail view', () => {
  afterEach(() => vi.useRealTimers())

  it('renders the product foundation tab, SKU prices, units and future boundaries', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/products', component: { template: '<div />' } },
      { path: '/products/:productId', component: ProductDetailView },
      { path: '/products/:productId/edit', component: { template: '<div />' } },
    ] })
    await router.push('/products/product-1'); await router.isReady(); vi.useFakeTimers()
    const wrapper = mount(ProductDetailView, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('演示基础商品')
    expect(wrapper.text()).toContain('基础信息')
    expect(wrapper.text()).toContain('SKU 与价格资料')
    expect(wrapper.text()).toContain('库存单位')
    expect(wrapper.text()).toContain('等级/客户价格 · PRD-002')
  })
})
