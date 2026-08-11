import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CustomerCategoryView from './CustomerCategoryView.vue'
import CustomerTagView from './CustomerTagView.vue'
import CustomerSmartTagView from './CustomerSmartTagView.vue'

describe('CUS-001 category, tag and smart-tag views', () => {
  afterEach(() => vi.useRealTimers())

  it('renders confirmed management contracts', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/customers', component: { template: '<div />' } },
      { path: '/customers/categories', component: CustomerCategoryView },
      { path: '/customers/tags', component: CustomerTagView },
      { path: '/customers/smart-tags', component: CustomerSmartTagView },
    ] })
    await router.push('/customers/categories')
    await router.isReady()
    vi.useFakeTimers()
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('演示华东零售')
    expect(wrapper.text()).toContain('默认账期')

    await router.push('/customers/tags')
    await vi.advanceTimersByTimeAsync(120)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('演示重点')
    expect(wrapper.findAll('.color-choice')).toHaveLength(5)

    await router.push('/customers/smart-tags')
    await vi.advanceTimersByTimeAsync(120)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('人工确认前不会修改客户有效标签')
    expect(wrapper.text()).toContain('待人工确认')
    expect(wrapper.text()).toContain('定时分析 · 规划中')
  })
})
