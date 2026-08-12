import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import PriceAdjustmentFormView from './PriceAdjustmentFormView.vue'
import PriceAdjustmentDetailView from './PriceAdjustmentDetailView.vue'

function createTestRouter(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/products/prices/level-adjustments', component: { template: '<div />' } },
    { path: '/products/prices/level-adjustments/new', component: PriceAdjustmentFormView, props: { type: 'level' } },
    { path: '/products/prices/level-adjustments/:adjustmentId', component: PriceAdjustmentDetailView, props: { type: 'level' } },
  ] })
  return router.push(path).then(() => router.isReady()).then(() => router)
}

describe('PRD-002 adjustment workflow views', () => {
  afterEach(() => vi.useRealTimers())

  it('adds a source-backed SKU and exposes the full level price matrix', async () => {
    const router = await createTestRouter('/products/prices/level-adjustments/new'); vi.useFakeTimers()
    const wrapper = mount(PriceAdjustmentFormView, { props: { type: 'level' }, global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(120); await wrapper.vm.$nextTick()
    await wrapper.get('select[aria-label="选择上架 SKU"]').setValue('sku-1')
    const addButton = wrapper.findAll('button').find((node) => node.text().includes('加入明细'))
    await addButton!.trigger('click')
    expect(wrapper.text()).toContain('SKU-000001')
    expect(wrapper.text()).toContain('成本价（元）')
    expect(wrapper.text()).toContain('终端价（元）')
    expect(wrapper.text()).not.toContain('basePurchasePriceCents')
  })

  it('renders pending detail operations and the missing-order provider boundary', async () => {
    const router = await createTestRouter('/products/prices/level-adjustments/price-adjustment-level-1'); vi.useFakeTimers()
    const wrapper = mount(PriceAdjustmentDetailView, { props: { type: 'level' }, global: { plugins: [createPinia(), router] } })
    await vi.advanceTimersByTimeAsync(240); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('LPA-20260810-0001')
    expect(wrapper.text()).toContain('已生效')
    expect(wrapper.text()).toContain('数据源未接入')
    expect(wrapper.text()).not.toContain('编辑待生效单据')
  })
})
