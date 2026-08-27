import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import CustomerListView from './CustomerListView.vue'

describe('CUS-001 customer list view', () => {
  afterEach(() => vi.useRealTimers())

  it('renders source-backed columns and explicit unavailable metrics', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/customers')
    await router.isReady()
    vi.useFakeTimers()
    const wrapper = mount(CustomerListView, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('客户列表')
    expect(wrapper.text()).toContain('CUS-000001')
    expect(wrapper.text()).toContain('累计订单数')
    expect(wrapper.findAll('.unavailable')).toHaveLength(6)
    expect(wrapper.get('button.table-action--button').text()).toContain('审核启用')
    expect(wrapper.text()).not.toContain('真实地址')
  })

  it('approves a pending customer from the list and refreshes its status', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/customers'); await router.isReady(); vi.useFakeTimers()
    const wrapper = mount(CustomerListView, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await wrapper.get('button.table-action--button').trigger('click')
    await vi.runAllTimersAsync(); await wrapper.vm.$nextTick()
    expect(wrapper.find('.customer-status--pending').exists()).toBe(false)
    expect(wrapper.find('.customer-status--active').exists()).toBe(true)
    vi.mocked(window.confirm).mockRestore()
  })
})
