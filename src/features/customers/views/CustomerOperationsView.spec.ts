import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import CustomerOperationsView from './CustomerOperationsView.vue'

describe('CUS-002/CUS-004/CUS-005 operations views', () => {
  afterEach(() => vi.useRealTimers())

  it('renders the CRM operations routes and fake boundaries', async () => {
    vi.useFakeTimers()
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/customers/opportunities', component: CustomerOperationsView, props: { mode: 'opportunities' } },
      { path: '/customers/map', component: CustomerOperationsView, props: { mode: 'map' } },
      { path: '/customers/fieldwork/visits', component: CustomerOperationsView, props: { mode: 'visits' } },
    ] })
    await router.push('/customers/opportunities'); await router.isReady()
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('演示年度采购合作')
    await router.push('/customers/map'); await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Fake Map Adapter')
    await router.push('/customers/fieldwork/visits'); await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Fake 签到')
    expect(wrapper.text()).toContain('签到位置、距离和照片均为 fake 元数据')
  })
})
