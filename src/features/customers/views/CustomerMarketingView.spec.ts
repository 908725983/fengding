import { createPinia, getActivePinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CustomerMarketingView from './CustomerMarketingView.vue'
import { useCustomerStore } from '../runtime/customer-store'

async function settle(): Promise<void> { await vi.runAllTimersAsync(); await flushPromises() }
function mountView(mode: 'coupons' | 'promotions' | 'voucher-campaigns' | 'articles' | 'marketing-analysis' | 'ai-analysis' | 'referral-commission') { return mount(CustomerMarketingView, { props: { mode }, global: { plugins: [getActivePinia()!], stubs: { CustomerSubnav: true, RouterLink: { template: '<a><slot /></a>' } } } }) }

describe('CUS-006/CUS-010 marketing views', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('lists and creates a coupon through the Customer owner', async () => {
    const wrapper = mountView('coupons')
    await settle()
    expect(wrapper.text()).toContain('演示满减券')
    const inputs = wrapper.find('form').findAll('input')
    await inputs[0]!.setValue('VIEW-COUPON')
    await inputs[1]!.setValue('页面测试券')
    await wrapper.find('form').trigger('submit')
    await settle()
    expect(wrapper.text()).toContain('页面测试券')
  })

  it('renders promotion rules and unavailable analysis metrics without zero fallback', async () => {
    const promotion = mountView('promotions')
    await settle()
    expect(promotion.text()).toContain('演示限时折扣')
    const analysis = mountView('marketing-analysis')
    await settle()
    expect(analysis.text()).toContain('unavailable')
    expect(analysis.text()).toContain('订单 provider 未接入')
  })

  it('reproduces empty, error and permission-denied marketing states', async () => {
    const store = useCustomerStore()
    let request = store.setScenario('empty')
    await settle()
    expect(store.coupons).toHaveLength(0)
    const empty = mountView('coupons')
    await settle()
    expect(empty.text()).not.toContain('演示满减券')

    request = store.setScenario('error')
    await settle()
    expect(store.error).toContain('服务暂时不可用')

    request = store.setScenario('permission-denied')
    await settle()
    expect(store.error).toContain('不可访问客户模块')
    const denied = mountView('marketing-analysis')
    await settle()
    expect(denied.text()).toContain('当前角色不可访问客户运营')
  })
})
