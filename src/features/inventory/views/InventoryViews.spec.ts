import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import InventoryStockListView from './InventoryStockListView.vue'
import InventoryBatchListView from './InventoryBatchListView.vue'
import WarehouseListView from './WarehouseListView.vue'
import InventoryStocktakeView from './InventoryStocktakeView.vue'
import InventoryCostAdjustmentView from './InventoryCostAdjustmentView.vue'
import InventoryClosingView from './InventoryClosingView.vue'
import InventoryPendingOutboundView from './InventoryPendingOutboundView.vue'
import InventoryDeliveryRouteView from './InventoryDeliveryRouteView.vue'
import InventoryDeliveryVehicleView from './InventoryDeliveryVehicleView.vue'
import InventoryPickingLabelView from './InventoryPickingLabelView.vue'
import { useInventoryStore } from '../runtime/inventory-store'

async function mountView(component: object, path: string) {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/inventory/:pathMatch(.*)*', component }, { path: '/inventory/stocks/:warehouseId/:skuId', component: { template: '<div/>' } }] })
  await router.push(path); await router.isReady(); const wrapper = mount(component, { global: { plugins: [pinia, router] } }); const store = useInventoryStore(pinia); let stableIdleChecks = 0
  for (let attempt = 0; attempt < 100 && stableIdleChecks < 2; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 20)); await wrapper.vm.$nextTick(); stableIdleChecks = store.loading ? 0 : stableIdleChecks + 1 }
  return wrapper
}

describe('inventory views', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('renders category navigation, stock columns and unavailable provider state', async () => { const wrapper = await mountView(InventoryStockListView, '/inventory/stocks?categoryId=product-category-drink'); expect(wrapper.text()).toContain('库存列表'); expect(wrapper.text()).toContain('全部分类'); expect(wrapper.text()).toContain('演示食品'); expect(wrapper.text()).toContain('演示饮品'); expect(wrapper.text()).toContain('待出库'); expect(wrapper.text()).toContain('数据源未接入'); expect(wrapper.findAll('tbody tr').length).toBeGreaterThan(0); expect(wrapper.findAll('tbody tr').every((row)=>row.text().includes('演示多规格饮品'))).toBe(true) })
  it('renders near-expiry and expired batch states', async () => { const wrapper = await mountView(InventoryBatchListView, '/inventory/batches'); expect(wrapper.text()).toContain('临期'); expect(wrapper.text()).toContain('过期') })
  it('masks warehouse phone for supervisor', async () => { const wrapper = await mountView(WarehouseListView, '/inventory/warehouses'); const selects = wrapper.findAll('select'); await selects.at(-1)!.setValue('sales-supervisor'); await new Promise((resolve) => setTimeout(resolve, 180)); expect(wrapper.text()).not.toContain('000-0000-0101') })
  it('restores INV-003 query and renders closing boundary', async () => { const stocktake = await mountView(InventoryStocktakeView, '/inventory/stocktakes?status=completed&keyword=PD'); expect((stocktake.get('[aria-label="状态"]').element as HTMLSelectElement).value).toBe('completed'); expect(stocktake.text()).toContain('暂无盘点记录'); const cost = await mountView(InventoryCostAdjustmentView, '/inventory/cost-adjustments'); expect(cost.text()).toContain('成本调整单'); const closing = await mountView(InventoryClosingView, '/inventory/closings?year=2026'); expect(closing.text()).toContain('反结转当前 unavailable') })
  it('renders INV-005 picking, route, vehicle and label workspaces from the shared runtime', async () => { const pending = await mountView(InventoryPendingOutboundView, '/inventory/pending-outbound?keyword=XS'); expect(pending.text()).toContain('待分拣订单'); expect(pending.text()).toContain('从零创建并审核销售订单'); const route = await mountView(InventoryDeliveryRouteView, '/inventory/delivery-routes'); expect(route.text()).toContain('保存线路'); const vehicle = await mountView(InventoryDeliveryVehicleView, '/inventory/delivery-vehicles'); expect(vehicle.text()).toContain('保存车辆'); const label = await mountView(InventoryPickingLabelView, '/inventory/picking-labels'); expect(label.text()).toContain('分拣标签') })
})
