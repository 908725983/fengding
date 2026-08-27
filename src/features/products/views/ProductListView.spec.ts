import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import ProductListView from './ProductListView.vue'

describe('PRD-001 product list view', () => {
  afterEach(() => vi.useRealTimers())

  it('renders source-backed SKU rows, category tree and future-slice boundaries', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/products'); await router.isReady(); vi.useFakeTimers()
    const wrapper = mount(ProductListView, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('商品列表')
    expect(wrapper.text()).toContain('SKU-000001')
    expect(wrapper.text()).toContain('演示食品')
    expect(wrapper.text()).toContain('价格管理 · PRD-002')
    expect(wrapper.text()).toContain('¥ 5.00')
    expect(wrapper.text()).not.toContain('真实商品')
  })
})
