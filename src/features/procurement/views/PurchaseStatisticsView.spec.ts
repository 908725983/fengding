import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import PurchaseStatisticsView from './PurchaseStatisticsView.vue'
import { useProcurementStore } from '../runtime/procurement-store'

async function mountView(query = '') {
  const pinia = createPinia(); const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/procurement/statistics', component: PurchaseStatisticsView }, { path: '/procurement/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push(`/procurement/statistics${query}`); await router.isReady(); const wrapper = mount(PurchaseStatisticsView, { global: { plugins: [pinia, router] } })
  const store = useProcurementStore(pinia); await vi.waitFor(() => expect(store.loading).toBe(false), { timeout: 5000 }); await wrapper.vm.$nextTick()
  return { wrapper, router, store }
}

describe('PurchaseStatisticsView', () => {
  it('renders five reports, restores URL filters, and shows the real empty state', async () => {
    const { wrapper } = await mountView('?report=purchase-movement-by-product&keyword=牛奶&pageSize=10')
    expect(wrapper.findAll('.statistics-tabs button')).toHaveLength(5); expect(wrapper.find('.statistics-tabs .active').text()).toContain('按商品汇总')
    expect((wrapper.find('input[placeholder="输入商品关键字"]').element as HTMLInputElement).value).toBe('牛奶')
    expect(wrapper.text()).toContain('暂无匹配数据'); expect(wrapper.text()).toContain('快照 purstat-0-0-0-empty')
  })

  it('distinguishes unavailable from empty data', async () => {
    const { wrapper, store } = await mountView('?report=purchase-movement-line-detail')
    await store.setScenario('unavailable'); await store.loadPurchaseStatistics({ report: 'purchase-movement-line-detail', fromDate: '2026-05-10', toDate: '2026-08-10' }); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('数据源未接入'); expect(wrapper.text()).toContain('不会用 0 代替')
  })

  it('shows permission denial and disables export for the read-only supervisor', async () => {
    const { wrapper, store } = await mountView()
    await store.setRole('sales-supervisor'); await store.loadPurchaseStatistics({ report: 'purchase-order-line-detail', fromDate: '2026-05-10', toDate: '2026-08-10' }); await wrapper.vm.$nextTick()
    expect(wrapper.findAll('button').find((item) => item.text().includes('导出 CSV'))?.attributes('disabled')).toBeDefined()
    await store.setRole('finance'); await store.loadPurchaseStatistics({ report: 'purchase-order-line-detail', fromDate: '2026-05-10', toDate: '2026-08-10' }); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('当前角色无权查看采购统计')
  })

  it('drops stale slow responses when a newer query finishes', async () => {
    const { store } = await mountView(); await store.setScenario('slow')
    const first = store.loadPurchaseStatistics({ report: 'purchase-order-line-detail', fromDate: '2026-05-10', toDate: '2026-08-10', keyword: 'first' })
    const second = store.loadPurchaseStatistics({ report: 'purchase-order-by-supplier', fromDate: '2026-05-10', toDate: '2026-08-10', keyword: 'second' })
    await Promise.all([first, second]); expect(store.statisticsPage.report).toBe('purchase-order-by-supplier')
  })
})
