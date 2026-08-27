import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import InventoryTransferView from './InventoryTransferView.vue'
import InventoryOtherOutboundView from './InventoryOtherOutboundView.vue'
import InventoryOtherInboundView from './InventoryOtherInboundView.vue'

async function wait(ms = 320) { await new Promise((resolve) => setTimeout(resolve, ms)) }
async function waitUntil(predicate: () => boolean, timeoutMs = 2000) { const started = Date.now(); while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error('等待页面状态稳定超时'); await wait(40) } }
async function mountView(component: object, path: string) {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path, component }, { path: '/inventory/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push(path); await router.isReady()
  const wrapper = mount(component, { global: { plugins: [pinia, router] } }); await wrapper.vm.$nextTick(); await waitUntil(() => wrapper.text().includes('暂无')); await wrapper.vm.$nextTick()
  return { wrapper, router }
}

describe('INV-002 movement views', () => {
  it.each([
    [InventoryTransferView, '/inventory/transfers', '转仓单'],
    [InventoryOtherOutboundView, '/inventory/other-outbounds', '其他出库单'],
    [InventoryOtherInboundView, '/inventory/other-inbounds', '其他入库单'],
  ])('renders %s filters, empty state and commands', async (component, path, title) => {
    const { wrapper } = await mountView(component, path); expect(wrapper.text()).toContain(title); expect(wrapper.text()).toContain('关键字'); expect(wrapper.text()).toContain('导出 CSV'); expect(wrapper.text()).toContain('暂无')
  })

  it('restores transfer filters from URL and writes changed filters back', async () => {
    const { wrapper, router } = await mountView(InventoryTransferView, '/inventory/transfers?status=approved&keyword=ZZ')
    const selects = wrapper.findAll('form.inventory-toolbar select'); const inputs = wrapper.findAll('form.inventory-toolbar input'); expect((selects[0].element as HTMLSelectElement).value).toBe('approved'); expect((inputs[2].element as HTMLInputElement).value).toBe('ZZ')
    await inputs[2].setValue('SKU-1'); await wrapper.find('form.inventory-toolbar').trigger('submit'); await wait(); expect(router.currentRoute.value.query.keyword).toBe('SKU-1')
  })

  it('hides write and export commands for the read-only supervisor', async () => {
    const { wrapper } = await mountView(InventoryOtherOutboundView, '/inventory/other-outbounds'); const roleSelect = wrapper.findAll('.scenario-bar select').at(-1)!; await roleSelect.setValue('sales-supervisor'); await wait(360)
    expect(wrapper.text()).not.toContain('导出 CSV'); expect(wrapper.text()).not.toContain('新增')
  })

  it('does not expose customer return as a generic inbound type', async () => {
    const { wrapper } = await mountView(InventoryOtherInboundView, '/inventory/other-inbounds'); await wrapper.findAll('button').find((button) => button.text() === '新增')!.trigger('click'); expect(wrapper.find('.inventory-dialog').text()).not.toContain('退货（由 ORD-005 处理）')
  })
})
