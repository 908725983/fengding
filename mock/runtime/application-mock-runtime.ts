import { createCustomerMockSession, type CustomerScenarioName } from '../handlers/customer-handler'
import { createFinanceMockSession, type FinanceScenarioName } from '../handlers/finance-handler'
import { createInventoryCatalogProvider, createInventoryMockSession, type InventoryScenarioName } from '../handlers/inventory-handler'
import { createOrderCatalogProvider, createOrderCustomerProvider, createOrderMockSession, orderStaffValues, type OrderScenarioName } from '../handlers/order-handler'
import { createProductMockSession, type ProductScenarioName } from '../handlers/product-handler'
import { createProcurementCatalogProvider, createProcurementMockSession, type ProcurementScenarioName } from '../handlers/procurement-handler'
import { createSettingsMockSession, type SettingsScenarioName } from '../handlers/settings-handler'
import { createAuthorizationMockSession } from '../handlers/authorization-handler'
import type { AuthorizationCatalog } from '../../src/features/products/authorization/types'

export type ApplicationMockScenarioName = FinanceScenarioName

let runtimeSequence = 1
const orderDemoSeeds = new Map<'normal' | 'empty', { orderState: ReturnType<typeof createOrderMockSession>['repository'] extends { read(): infer T } ? T : never; financeState: ReturnType<typeof createOrderMockSession>['financeRepository'] extends { read(): infer T } ? T : never }>()

function orderDemoSeed(kind: 'normal' | 'empty') {
  const existing = orderDemoSeeds.get(kind)
  if (existing) return existing
  const session = createOrderMockSession(kind, kind === 'normal')
  const seed = { orderState: session.repository.read(), financeState: session.financeRepository.read() }
  orderDemoSeeds.set(kind, seed)
  return seed
}

function orderScenario(value: ApplicationMockScenarioName): OrderScenarioName {
  return value === 'unavailable' ? 'normal' : value
}

function inventoryScenario(value: ApplicationMockScenarioName): InventoryScenarioName {
  return value === 'unavailable' ? 'normal' : value
}

function procurementScenario(value: ApplicationMockScenarioName): ProcurementScenarioName {
  return value
}
function settingsScenario(value: ApplicationMockScenarioName): SettingsScenarioName { return ['normal', 'empty', 'error', 'slow', 'permission-denied', 'partial-failure'].includes(value) ? value as SettingsScenarioName : 'normal' }

function customerScenario(value: ApplicationMockScenarioName): CustomerScenarioName {
  return ['normal', 'empty', 'error', 'slow', 'permission-denied', 'partial-failure'].includes(value) ? value as CustomerScenarioName : 'normal'
}

function productScenario(value: ApplicationMockScenarioName): ProductScenarioName {
  return ['normal', 'empty', 'error', 'slow', 'permission-denied'].includes(value) ? value as ProductScenarioName : 'normal'
}

export function createApplicationMockRuntime(scenario: ApplicationMockScenarioName = 'normal') {
  const runtimeId = `app-runtime-${runtimeSequence++}`
  const orderSeed = orderDemoSeed(scenario === 'empty' ? 'empty' : 'normal')
  const customer = createCustomerMockSession(customerScenario(scenario))
  let product!: ReturnType<typeof createProductMockSession>
  const inventory = createInventoryMockSession(inventoryScenario(scenario), { catalogProvider: createInventoryCatalogProvider(scenario === 'partial-failure', () => product.repository.read()) })
  const settings = createSettingsMockSession(settingsScenario(scenario), { warehouseProvider: inventory.service.createWarehouseProvider() })
  const finance = createFinanceMockSession(scenario, '2026-08-10T23:59:59+08:00', orderSeed.financeState)
  const procurementCatalog = createProcurementCatalogProvider(scenario === 'partial-failure', () => product.repository.read())
  const procurement = createProcurementMockSession(procurementScenario(scenario), { inventory, finance, catalog: procurementCatalog })
  product = createProductMockSession(productScenario(scenario), procurement.service.createSupplyProvider())
  const authorization = createAuthorizationMockSession('normal', (): AuthorizationCatalog => ({
    products: product.repository.read().products.map((item) => ({ id: item.id, code: item.code, name: item.name, categoryId: item.categoryId, brandId: item.brandId, status: item.status, deletedAt: item.deletedAt })),
    categories: product.repository.read().categories.map((item) => ({ id: item.id, name: item.name, parentId: item.parentId, status: item.status })),
    brands: product.repository.read().brands.map((item) => ({ id: item.id, name: item.name, status: item.status })),
    customers: customer.repository.read().customers.map((item) => ({ id: item.id, code: item.code, name: item.name, categoryName: customer.repository.read().categories.find((category) => category.id === item.categoryId)?.name ?? item.categoryId, status: item.status })),
  }))
  const partial = scenario === 'partial-failure'
  const sharedOrderCatalog = createOrderCatalogProvider(partial, () => product.repository.read())
  const sharedOrderAuthorizations = {
    resolveAuthorization: (customerId: string, productId: string, at: string) => {
      if (partial) throw new Error('原型模拟：授权服务不可用')
      const value = authorization.service.resolveAuthorization({ role: 'salesperson', actorId: 'order-authorization-provider' }, customerId, productId, at)
      return { orderable: value.orderable, reason: value.reason }
    },
  }
  const order = createOrderMockSession(orderScenario(scenario), false, { inventory, finance, customers: createOrderCustomerProvider(partial, () => customer.repository.read()), catalog: sharedOrderCatalog, authorizations: sharedOrderAuthorizations }, { initialState: orderSeed.orderState, seedDemoData: false, idNamespace: 'app' })
  const processingOrderProvider = {
    listEligibleOrders: () => {
      if (partial) return { state: 'unavailable' as const, items: [], version: 'unavailable', message: '原型模拟：销售订单数据源不可用' }
      const state = order.repository.read()
      const items = state.orders.filter((item) => ['approved', 'outbound-in-progress', 'outbound'].includes(item.status) && !item.deletedAt).map((item) => {
        const effectiveOutbounds = (state.outbounds ?? []).filter((outbound) => outbound.orderId === item.id && outbound.status === 'confirmed')
        const lines = item.lines.filter((line) => (line.lineKind ?? 'sale') === 'sale').map((line) => {
          const fulfilledQuantityMilli = effectiveOutbounds.flatMap((outbound) => outbound.lines).filter((outboundLine) => outboundLine.orderLineId === line.id).reduce((sum, outboundLine) => sum + outboundLine.quantityMilli, 0)
          return { orderLineId: line.id, skuId: line.skuId, productName: line.productNameSnapshot, skuCode: line.skuCodeSnapshot, orderedQuantityMilli: line.quantityMilli, fulfilledQuantityMilli, remainingQuantityMilli: Math.max(0, line.quantityMilli - fulfilledQuantityMilli) }
        }).filter((line) => line.remainingQuantityMilli > 0)
        return { orderId: item.id, orderNo: item.orderNo, status: item.status, customerName: item.customerSnapshot.name, updatedAt: item.updatedAt, lines }
      }).filter((item) => item.lines.length > 0)
      return { state: 'available' as const, items, version: `orders:${items.map((item) => `${item.orderId}:${item.updatedAt}`).join('|')}`, message: null }
    },
    getEligibleOrder(orderId: string) { return this.listEligibleOrders().items.find((item) => item.orderId === orderId) ?? null },
  }
  inventory.setProcessingOrderProvider(processingOrderProvider)
  const pickingSnapshot = (item: ReturnType<typeof order.repository.read>['orders'][number], remainingOnly: boolean) => {
    const state = order.repository.read()
    const effective = (state.outbounds ?? []).filter((outbound) => outbound.orderId === item.id && outbound.status === 'confirmed')
    const lines = item.lines.map((line) => {
      const fulfilledQuantityMilli = effective.flatMap((outbound) => outbound.lines).filter((entry) => entry.orderLineId === line.id).reduce((sum, entry) => sum + entry.quantityMilli, 0)
      const sku = sharedOrderCatalog.getSku(line.skuId)
      const productRow = product.repository.read().products.find((entry) => entry.skus.some((skuRow) => skuRow.id === line.skuId))
      return { orderLineId: line.id, skuId: line.skuId, skuCode: line.skuCodeSnapshot, productName: line.productNameSnapshot, specification: line.specificationSnapshot, unitId: line.unitSnapshot.id, unitName: line.unitSnapshot.name, conversionRateMilli: line.unitSnapshot.conversionRateMilli, categoryId: productRow?.categoryId ?? null, orderedQuantityMilli: line.quantityMilli, fulfilledQuantityMilli, remainingQuantityMilli: Math.max(0, line.quantityMilli - fulfilledQuantityMilli), weightPerBaseUnitGrams: sku?.weightPerBaseUnitGrams ?? null }
    }).filter((line) => !remainingOnly || line.remainingQuantityMilli > 0)
    return { orderId: item.id, orderNo: item.orderNo, status: item.status, customerName: item.customerSnapshot.name, warehouseId: item.fulfillmentWarehouseSnapshot.id, warehouseName: item.fulfillmentWarehouseSnapshot.name, requestedDeliveryAt: item.requestedDeliveryAt, deliveryMethod: item.shippingSnapshot.deliveryMethod, updatedAt: item.updatedAt, province: item.shippingSnapshot.province, city: item.shippingSnapshot.city, district: item.shippingSnapshot.district, address: item.shippingSnapshot.address, urgency: null, lines }
  }
  const pickingOrderCoordinator = {
    listPickingOrders: () => {
      if (partial) return { state: 'unavailable' as const, items: [], version: 'unavailable', message: '原型模拟：订单分拣来源不可用' }
      const state = order.repository.read(); const pendingDifferenceOrders = new Set((state.differences ?? []).filter((item) => item.status === 'pending-confirmation').map((item) => item.orderId))
      const items = state.orders.filter((item) => ['approved', 'outbound-in-progress'].includes(item.status) && !item.deletedAt && !pendingDifferenceOrders.has(item.id)).map((item) => pickingSnapshot(item, true)).filter((item) => item.lines.length)
      return { state: 'available' as const, items, version: `picking:${items.map((item) => `${item.orderId}:${item.updatedAt}`).join('|')}`, message: null }
    },
    listDeliveryOrders: () => {
      if (partial) return { state: 'unavailable' as const, items: [], version: 'unavailable', message: '原型模拟：待配送订单来源不可用' }
      const state = order.repository.read(); const shipped = new Set((state.shipments ?? []).map((item) => item.orderId))
      const items = state.orders.filter((item) => item.status === 'outbound' && item.shippingSnapshot.deliveryMethod === 'door-delivery' && !item.deletedAt && !shipped.has(item.id)).map((item) => pickingSnapshot(item, false))
      return { state: 'available' as const, items, version: `delivery:${items.map((item) => `${item.orderId}:${item.updatedAt}`).join('|')}`, message: null }
    },
    getPickingOrder(orderId: string) { return this.listPickingOrders().items.find((item) => item.orderId === orderId) ?? null },
    confirmOutbounds(actor: { actorId: string; role: 'super-admin' | 'warehouse' | 'sales-supervisor' | 'salesperson' | 'finance' }, inputs: Array<{ requestId: string; orderId: string; expectedUpdatedAt: string; warehouseId: string; lines: Array<{ orderLineId: string; quantityMilli: number; conversionRateMilli: number }>; finishShort: boolean; reason: string | null }>) {
      return inputs.map((input) => { const result = order.fulfillment.confirmOutbound(actor, { requestId: input.requestId, orderId: input.orderId, expectedUpdatedAt: input.expectedUpdatedAt, warehouseId: input.warehouseId, lines: input.lines.filter((line) => line.quantityMilli > 0).map((line) => ({ orderLineId: line.orderLineId, quantity: line.quantityMilli / line.conversionRateMilli })), finishShort: input.finishShort, reason: input.reason }); const current = order.repository.read().orders.find((item) => item.id === input.orderId)!; return { orderId: input.orderId, outboundId: result.outbound?.id ?? null, differenceId: result.difference?.id ?? null, updatedAt: current.updatedAt } })
    },
    confirmShipments(actor: { actorId: string; role: 'super-admin' | 'warehouse' | 'sales-supervisor' | 'salesperson' | 'finance' }, inputs: Array<{ requestId: string; orderId: string; expectedUpdatedAt: string; remark: string | null }>) {
      return inputs.map((input) => { const shipment = order.fulfillment.confirmShipment(actor, { requestId: input.requestId, orderId: input.orderId, expectedUpdatedAt: input.expectedUpdatedAt, logisticsCode: null, remark: input.remark }); const current = order.repository.read().orders.find((item) => item.id === input.orderId)!; return { orderId: input.orderId, shipmentId: shipment.id, updatedAt: current.updatedAt } })
    },
    checkpoint: () => ({ order: order.repository.read(), finance: finance.repository.read() }),
    restore(checkpoint: unknown) { const value = checkpoint as { order: ReturnType<typeof order.repository.read>; finance: ReturnType<typeof finance.repository.read> }; order.repository.reset(value.order); finance.repository.reset(value.finance) },
  }
  inventory.setPickingOrderCoordinator(pickingOrderCoordinator)
  inventory.setDeliveryStaffProvider({ listStaff: () => structuredClone(orderStaffValues) })

  return {
    runtimeId,
    scenario,
    clock: '2026-08-10T10:00:00+08:00',
    customer,
    product,
    order,
    inventory,
    procurement,
    finance,
    settings,
    authorization,
  }
}

export type ApplicationMockRuntime = ReturnType<typeof createApplicationMockRuntime>
