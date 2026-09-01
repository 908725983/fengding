import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import DirectDeliveryView from './DirectDeliveryView.vue'
import SupplierListView from './SupplierListView.vue'
import PurchaseOrderView from './PurchaseOrderView.vue'
import PurchaseReturnView from './PurchaseReturnView.vue'

async function mountView(component: object, path: string) { const pinia = createPinia(); const router = createRouter({ history: createMemoryHistory(), routes: [{ path, component }, { path: '/procurement/:pathMatch(.*)*', component: { template: '<div />' } }] }); await router.push(path); await router.isReady(); const wrapper = mount(component, { global: { plugins: [pinia, router] } }); await new Promise((resolve) => setTimeout(resolve, 180)); await wrapper.vm.$nextTick(); return wrapper }

describe('procurement views', () => {
  it('renders supplier list and its source boundaries', async () => {
    const wrapper = await mountView(SupplierListView, '/procurement/suppliers')
    expect(wrapper.text()).toContain('演示华北食品供应商'); expect(wrapper.text()).toContain('未接入'); expect(wrapper.text()).not.toContain('6222000000004321')
  })
  it('renders direct delivery as unavailable rather than zero totals', async () => {
    const wrapper = await mountView(DirectDeliveryView, '/procurement/direct-delivery')
    expect(wrapper.text()).toContain('采购直送执行数据尚未接入'); expect(wrapper.text()).toContain('不可用'); expect(wrapper.text()).not.toContain('¥0.00')
  })
  it('renders the purchase order workspace and opens a usable create form', async () => {
    const wrapper = await mountView(PurchaseOrderView, '/procurement/purchase-orders')
    expect(wrapper.text()).toContain('采购订单')
    const button = wrapper.findAll('button').find((item) => item.text() === '新增采购订单')!
    await button.trigger('click')
    expect(wrapper.text()).toContain('采购单价（供应商供货价，元）')
    const priceInput = wrapper.find('input[readonly]')
    expect(priceInput.exists()).toBe(true)
    expect(priceInput.attributes('readonly')).toBeDefined()
  })
  it('renders purchase returns with explicit source and cross-domain boundaries', async () => {
    const wrapper = await mountView(PurchaseReturnView, '/procurement/purchase-returns')
    expect(wrapper.text()).toContain('采购退单')
    expect(wrapper.text()).toContain('先完成采购订单实际入库')
    expect(wrapper.text()).toContain('新增采购退单')
  })
})
