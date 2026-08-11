import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CustomerFormView from './CustomerFormView.vue'

describe('CUS-001 customer form view', () => {
  afterEach(() => vi.useRealTimers())

  it('uses confirmed defaults and applies category payment-term linkage', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/customers', component: { template: '<div />' } },
      { path: '/customers/new', component: CustomerFormView },
      { path: '/customers/:customerId', component: { template: '<div />' } },
    ] })
    await router.push('/customers/new')
    await router.isReady()
    vi.useFakeTimers()
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120)
    await wrapper.vm.$nextTick()

    expect((wrapper.get('[data-test="settlement"]').element as HTMLSelectElement).value).toBe('cash')
    expect((wrapper.get('[data-test="payment-term"]').element as HTMLInputElement).disabled).toBe(true)
    await wrapper.get('[data-test="category"]').setValue('category-retail-east')
    expect((wrapper.get('[data-test="settlement"]').element as HTMLSelectElement).value).toBe('terms')
    expect((wrapper.get('[data-test="payment-term"]').element as HTMLInputElement).value).toBe('30')
    expect(wrapper.text()).toContain('动态自定义字段不属于本切片')
  })
})
