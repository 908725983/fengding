import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import OrderStatisticsView from './OrderStatisticsView.vue'
import { useOrderStatisticsStore } from './store'

async function mountStatistics(path: string, area: 'order' | 'sales') {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/orders/statistics', component: OrderStatisticsView, props: { area: 'order' } },
    { path: '/orders/sales-statistics', component: OrderStatisticsView, props: { area: 'sales' } },
    { path: '/orders/:pathMatch(.*)*', component: { template: '<div />' } },
  ] })
  await router.push(path); await router.isReady()
  const wrapper = mount(OrderStatisticsView, { props: { area }, global: { plugins: [pinia, router] } })
  const store = useOrderStatisticsStore()
  await vi.waitFor(() => expect(store.loading).toBe(false), { timeout: 5000 }); await flushPromises()
  return { wrapper, router, store }
}

describe('ORD-006 statistics view', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders order line detail with governed filters, totals and unavailable fields', async () => {
    const { wrapper } = await mountStatistics('/orders/statistics?report=order-line-detail', 'order')
    expect(wrapper.text()).toContain('订单统计')
    expect(wrapper.text()).toContain('订单商品明细')
    expect(wrapper.text()).toContain('单据笔数')
    expect(wrapper.text()).toContain('演示基础商品')
    expect(wrapper.text()).toContain('待出库')
    expect(wrapper.text()).toContain('暂不可用')
    expect(wrapper.find('.statistics-table-wrap').exists()).toBe(true)
  })

  it('switches to a summary report and opens the constrained pivot dialog', async () => {
    const { wrapper, router } = await mountStatistics('/orders/statistics?report=order-line-detail', 'order')
    const summary = wrapper.findAll('.statistics-tabs button').find((item) => item.text() === '商品汇总')!
    await summary.trigger('click'); await new Promise((resolve) => setTimeout(resolve, 260)); await flushPromises()
    expect(router.currentRoute.value.query.report).toBe('order-by-product')
    const pivot = wrapper.findAll('button').find((item) => item.text() === '二维表设置')!
    await pivot.trigger('click')
    expect(wrapper.text()).toContain('行维度（至少一项）')
    expect(wrapper.text()).toContain('不修改业务数据')
  })

  it('persists a pivot draft and applies the selected row dimension', async () => {
    const { wrapper } = await mountStatistics('/orders/statistics?report=order-by-product', 'order')
    await wrapper.findAll('.statistics-tabs button').find((item) => item.text() === '商品汇总')!.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 260)); await flushPromises()
    await wrapper.findAll('button').find((item) => item.text() === '二维表设置')!.trigger('click')
    const customer = wrapper.find('input[type="checkbox"]')
    await customer.setValue(true)
    await wrapper.findAll('button').find((item) => item.text() === '保存设置')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.find('thead').text()).toContain('客户')
    expect(wrapper.text()).toContain('二维表设置已保存到当前模拟用户')
  })

  it('distinguishes presale unavailable from an empty result', async () => {
    const { wrapper } = await mountStatistics('/orders/statistics?report=presale-line-detail', 'order')
    expect(wrapper.text()).toContain('该报表暂不可用')
    expect(wrapper.text()).toContain('不使用普通订单伪造预售')
    expect(wrapper.text()).not.toContain('暂无匹配数据')
  })

  it('renders positive outbound and negative return inbound in sales statistics', async () => {
    const { wrapper } = await mountStatistics('/orders/sales-statistics?report=movement-line-detail', 'sales')
    expect(wrapper.text()).toContain('销售统计')
    expect(wrapper.text()).toContain('销售出库')
    expect(wrapper.text()).toContain('退货入库')
    expect(wrapper.findAll('.statistics-negative').length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('套餐名称')
  })

  it('masks warehouse amounts and refuses order-statistics data through the service layer', async () => {
    const { wrapper, store } = await mountStatistics('/orders/sales-statistics?report=movement-line-detail', 'sales')
    await store.setRole('warehouse', { report: 'movement-line-detail', fromDate: '2026-05-10', toDate: '2026-08-10', pageSize: 30 })
    await flushPromises()
    expect(wrapper.text()).toContain('暂不可用')
    expect(store.access.amountsVisible).toBe(false)
    await store.load({ report: 'order-line-detail' })
    expect(store.error).toContain('不可查看')
  })
})
