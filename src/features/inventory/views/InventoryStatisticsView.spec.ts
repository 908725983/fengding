import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import InventoryStatisticsView from './InventoryStatisticsView.vue'
import { useInventoryStore } from '../runtime/inventory-store'

async function setup(query = '') {
  const pinia = createPinia(); const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/inventory/statistics', component: InventoryStatisticsView }, { path: '/inventory/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push(`/inventory/statistics${query}`); await router.isReady()
  const wrapper = mount(InventoryStatisticsView, { global: { plugins: [pinia, router], stubs: { InventorySubnav: true } } }); await new Promise((resolve) => setTimeout(resolve, 280)); await flushPromises()
  return { wrapper, router, store: useInventoryStore(pinia) }
}

describe('InventoryStatisticsView', () => {
  it('shows four reports and restores filters from the URL', async () => {
    const { wrapper } = await setup('?report=movement-summary&fromDate=2026-08-01&toDate=2026-08-10&warehouseId=warehouse-main&pageSize=10')
    expect(wrapper.findAll('.inventory-statistics-tabs button')).toHaveLength(4)
    expect(wrapper.find('.inventory-statistics-tabs .active').text()).toBe('出入库汇总')
    expect((wrapper.get('input[type="date"]').element as HTMLInputElement).value).toBe('2026-08-01')
    expect(wrapper.text()).toContain('跨品项基本数量合计')
    expect(wrapper.text()).not.toContain('导出 CSV')
  })

  it('switches report through URL query and renders warehouse columns', async () => {
    const { wrapper, router } = await setup('?fromDate=2026-08-01&toDate=2026-08-10')
    await wrapper.findAll('.inventory-statistics-tabs button')[1].trigger('click'); await new Promise((resolve) => setTimeout(resolve, 280)); await flushPromises()
    expect(router.currentRoute.value.query.report).toBe('warehouse-ledger')
    expect(wrapper.text()).toContain('入库笔数')
    expect(wrapper.text()).toContain('演示中心仓')
  })

  it('shows partial product data and masks money for sales supervisors', async () => {
    const { wrapper, store } = await setup('?fromDate=2026-08-01&toDate=2026-08-10')
    await store.setScenario('partial-failure'); await store.loadStatistics({ fromDate: '2026-08-01', toDate: '2026-08-10' }); await flushPromises()
    expect(wrapper.text()).toContain('商品资料部分不可用')
    expect(wrapper.text()).toContain('商品资料不可用')
    await store.setRole('sales-supervisor'); await store.loadStatistics({ fromDate: '2026-08-01', toDate: '2026-08-10' }); await flushPromises()
    expect(wrapper.text()).toContain('当前角色金额已遮蔽')
  })

  it('renders permission and empty states without stale rows', async () => {
    const { wrapper, store } = await setup('?fromDate=2026-08-01&toDate=2026-08-10')
    await store.setRole('finance'); await store.loadStatistics({ fromDate: '2026-08-01', toDate: '2026-08-10' }); await flushPromises()
    expect(wrapper.text()).toContain('当前角色无权查看库存统计')
    await store.setScenario('empty'); await store.loadStatistics({ fromDate: '2026-08-01', toDate: '2026-08-10' }); await flushPromises()
    expect(wrapper.text()).toContain('暂无统计数据')
  })
})
