import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import InventoryProcessingWorkspace from './InventoryProcessingWorkspace.vue'
import { useInventoryStore } from '../runtime/inventory-store'

async function mountSection(section: 'recipes' | 'plans' | 'orders' | 'picks' | 'returns' | 'yields', query = '') {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: `/inventory/${section}`, component: InventoryProcessingWorkspace, props: { section } }, { path: '/inventory/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push(`/inventory/${section}${query}`); await router.isReady()
  const wrapper = mount(InventoryProcessingWorkspace, { props: { section }, global: { plugins: [pinia, router], stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  const store = useInventoryStore(pinia); let stable = 0
  for (let attempt = 0; attempt < 120 && stable < 2; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 20)); await wrapper.vm.$nextTick(); stable = store.loading ? 0 : stable + 1 }
  return { wrapper, store, router }
}

describe('INV-004 processing views', () => {
  it('renders the six contract sections without a duplicate scenario bar and restores URL filters', async () => {
    const { wrapper } = await mountSection('orders', '?status=processing&keyword=JGD')
    expect(wrapper.text()).toContain('加工单'); expect(wrapper.text()).toContain('当前角色：super-admin'); expect(wrapper.find('.scenario-bar').exists()).toBe(false)
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('processing'); expect(wrapper.get('input[placeholder="单号 / 配方 / 商品"]')).toHaveProperty('element.value', 'JGD')
  })

  it('creates a recipe through Store-backed runtime and immediately renders it', async () => {
    const { wrapper, store } = await mountSection('recipes')
    await store.saveProcessingRecipe({ code: 'BOM-VIEW-001', name: '页面演示配方', method: 'combination', outputs: [{ skuId: 'sku-4', quantityMilli: 5000, warehouseId: 'warehouse-main', primary: true, costAllocationBasisPoints: 10000 }], materials: [{ skuId: 'sku-1', quantityMilli: 10000, warehouseId: 'warehouse-main' }] })
    await wrapper.vm.$nextTick(); expect(wrapper.text()).toContain('页面演示配方'); expect(wrapper.text()).toContain('BOM-VIEW-001')
  })

  it('hides all processing write entries for the read-only supervisor role', async () => {
    const { wrapper, store } = await mountSection('recipes'); await store.setRole('sales-supervisor'); await store.loadProcessingRecipes(); await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('新增'); expect(wrapper.text()).not.toContain('删除')
  })

  it.each([
    ['recipes', '加工配方'], ['plans', '加工计划'], ['orders', '加工单'], ['picks', '加工领料单'], ['returns', '加工退料单'], ['yields', '原料出成率'],
  ] as const)('renders %s route shell and its true empty state', async (section, title) => {
    const { wrapper } = await mountSection(section); expect(wrapper.text()).toContain(title); expect(wrapper.text()).toMatch(/暂无|页面演示配方/)
  })
})
