import { createPinia, getActivePinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CustomerMembershipPointsView from './CustomerMembershipPointsView.vue'
import { useCustomerStore } from '../runtime/customer-store'

async function settle(): Promise<void> {
  await vi.runAllTimersAsync()
  await flushPromises()
}

function mountView(mode: 'membership-levels' | 'points' | 'points-settings') {
  return mount(CustomerMembershipPointsView, {
    props: { mode },
    global: {
      plugins: [getActivePinia()!],
      stubs: {
        CustomerSubnav: true,
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  })
}

describe('CUS-003/CUS-007 membership and points views', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => vi.useRealTimers())

  it('lists membership levels and creates a new level from the form', async () => {
    const wrapper = mountView('membership-levels')
    await settle()
    expect(wrapper.text()).toContain('演示普通会员')

    const form = wrapper.find('form')
    const inputs = form.findAll('input')
    await inputs[0]!.setValue('测试银卡')
    await inputs[1]!.setValue('TEST-SILVER')
    await form.trigger('submit')
    await settle()
    expect(wrapper.text()).toContain('测试银卡')
  })

  it('adjusts an account and renders the immutable ledger entry', async () => {
    const wrapper = mountView('points')
    await settle()
    expect(wrapper.text()).toContain('1200')

    const inputs = wrapper.findAll('input')
    await inputs[1]!.setValue('25')
    await inputs[2]!.setValue('页面补偿')
    await inputs[3]!.setValue('view-request-1')
    await wrapper.get('button.button--primary').trigger('click')
    await settle()
    expect(wrapper.findAll('table')[1]!.text()).toContain('manual-adjustment')
    expect(wrapper.findAll('table')[1]!.text()).toContain('25')
  })

  it('shows conditional expiry fields and persists settings through a writable draft', async () => {
    const wrapper = mountView('points-settings')
    await settle()
    const expiry = wrapper.find('select')
    await expiry.setValue('fixed-days')
    await wrapper.vm.$nextTick()
    const expiryInput = wrapper.findAll('label').find((label) => label.text().includes('有效期天数'))!.find('input')
    await expiryInput.setValue('30')
    await wrapper.find('form').trigger('submit')
    await settle()
    expect((expiryInput.element as HTMLInputElement).value).toBe('30')
    expect(useCustomerStore().pointsSettings?.expiryDays).toBe(30)
  })

  it('surfaces slow, empty, error and permission-denied mock states', async () => {
    const store = useCustomerStore()
    let request = store.setScenario('slow')
    await vi.advanceTimersByTimeAsync(1799)
    expect(store.loading).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    await request

    request = store.setScenario('empty')
    await settle()
    expect(store.pointAccounts).toHaveLength(0)

    request = store.setScenario('error')
    await settle()
    expect(store.error).toContain('服务暂时不可用')

    request = store.setScenario('permission-denied')
    await settle()
    expect(store.error).toContain('不可访问客户模块')
    const wrapper = mountView('points')
    await settle()
    expect(wrapper.text()).toContain('当前角色不可访问客户运营')
  })
})
