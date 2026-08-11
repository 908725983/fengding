import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProductFormView from './ProductFormView.vue'

describe('PRD-001 product form view', () => {
  afterEach(() => vi.useRealTimers())

  it('renders the confirmed complete form and applies the base unit to four scenes', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/products', component: { template: '<div />' } },
      { path: '/products/new', component: ProductFormView },
      { path: '/products/:productId', component: { template: '<div />' } },
    ] })
    await router.push('/products/new'); await router.isReady(); vi.useFakeTimers()
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('规格属性与价格')
    expect(wrapper.text()).toContain('默认单位')
    expect(wrapper.text()).toContain('固定自定义属性')
    expect(wrapper.text()).toContain('采购设置属于后续切片')
    const selects = wrapper.findAll('select')
    const baseUnit = selects.find((item) => item.text().includes('请选择单位'))
    expect(baseUnit).toBeTruthy()
    await baseUnit!.setValue('unit-piece')
    const unitValues = wrapper.findAll('.unit-row select').map((item) => (item.element as HTMLSelectElement).value)
    expect(unitValues).toEqual(['unit-piece', 'unit-piece', 'unit-piece', 'unit-piece'])
  })
})
