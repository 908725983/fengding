import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import DirectDeliveryView from './DirectDeliveryView.vue'
import SupplierListView from './SupplierListView.vue'

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
})
