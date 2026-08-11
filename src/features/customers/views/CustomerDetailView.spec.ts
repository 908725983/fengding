import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CustomerDetailView from './CustomerDetailView.vue'

describe('CUS-001 customer detail view', () => {
  afterEach(() => vi.useRealTimers())

  it('renders confirmed detail groups, status actions and unavailable providers', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/customers', component: { template: '<div />' } },
      { path: '/customers/:customerId', component: CustomerDetailView },
      { path: '/customers/:customerId/edit', component: { template: '<div />' } },
    ] })
    await router.push('/customers/customer-1')
    await router.isReady()
    vi.useFakeTimers()
    const wrapper = mount(CustomerDetailView, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('演示客户甲')
    expect(wrapper.text()).toContain('基本信息')
    expect(wrapper.text()).toContain('财务信息')
    expect(wrapper.text()).toContain('变更日志')
    expect(wrapper.text()).toContain('只有启用客户可下单')
    expect(wrapper.findAll('.metric-grid strong').map((item) => item.text())).toEqual(['数据源未接入', '数据源未接入', '数据源未接入'])
  })
})
