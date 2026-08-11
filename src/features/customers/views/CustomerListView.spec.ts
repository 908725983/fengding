import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CustomerListView from './CustomerListView.vue'

describe('CUS-001 customer list view', () => {
  afterEach(() => vi.useRealTimers())

  it('renders source-backed columns and explicit unavailable metrics', async () => {
    vi.useFakeTimers()
    const wrapper = mount(CustomerListView, { global: { plugins: [createPinia()] } })
    await vi.advanceTimersByTimeAsync(120)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('客户列表')
    expect(wrapper.text()).toContain('CUS-000001')
    expect(wrapper.text()).toContain('累计订单数')
    expect(wrapper.findAll('.unavailable')).toHaveLength(6)
    expect(wrapper.text()).not.toContain('真实地址')
  })
})
