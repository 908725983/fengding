import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useFinanceStore } from '../../features/finance/runtime/finance-store'
import { useOrderStore } from '../../features/orders/runtime/order-store'
import { getApplicationMockRuntimeController } from './app-mock-runtime'

describe('application Mock Runtime controller', () => {
  it('shares one controller per Pinia while isolating different app instances', () => {
    const firstPinia = createPinia()
    const secondPinia = createPinia()
    const first = getApplicationMockRuntimeController(firstPinia)
    const sameFirst = getApplicationMockRuntimeController(firstPinia)
    const second = getApplicationMockRuntimeController(secondPinia)

    expect(sameFirst).toBe(first)
    expect(second).not.toBe(first)
    expect(second.runtime.value.runtimeId).not.toBe(first.runtime.value.runtimeId)
    expect(first.customer.repository).toBe(first.runtime.value.customer.repository)
    expect(first.product.repository).toBe(first.runtime.value.product.repository)
    expect(first.order.financeRepository).toBe(first.finance.repository)
    expect(first.procurement.inventoryRepository).toBe(first.inventory.repository)
  })

  it('atomically redirects every stable domain proxy after a scenario reset', () => {
    const controller = getApplicationMockRuntimeController(createPinia())
    const orderProxy = controller.order
    const inventoryProxy = controller.inventory
    const financeRepositoryBefore = orderProxy.financeRepository
    const runtimeIdBefore = controller.runtime.value.runtimeId

    const next = controller.reset('empty')

    expect(controller.order).toBe(orderProxy)
    expect(controller.inventory).toBe(inventoryProxy)
    expect(next.runtimeId).not.toBe(runtimeIdBefore)
    expect(orderProxy.financeRepository).not.toBe(financeRepositoryBefore)
    expect(orderProxy.financeRepository).toBe(controller.finance.repository)
    expect(inventoryProxy.repository).toBe(controller.procurement.inventoryRepository)
    expect(controller.runtime.value.scenario).toBe('empty')
  })

  it('keeps the visible scenario synchronized across stores after an app-level reset', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const orderStore = useOrderStore()
    const financeStore = useFinanceStore()

    getApplicationMockRuntimeController(pinia).reset('slow')

    expect(orderStore.scenario).toBe('slow')
    expect(financeStore.scenario).toBe('slow')
  })

  it('makes newly on-sale product SKUs available to assisted sales orders', () => {
    const controller = getApplicationMockRuntimeController(createPinia())
    controller.product.repository.transact((state) => {
      state.products.find((item) => item.id === 'product-2')!.status = 'on-sale'
    })

    const skuIds = controller.order.service
      .listOrderableSkus({ role: 'super-admin', actorId: 'admin-demo' }, 'customer-1')
      .map((item) => item.skuId)

    expect(skuIds).toEqual(expect.arrayContaining(['sku-1', 'sku-2', 'sku-3']))
  })
})
