import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import type { ProductFeatureState } from '../../src/features/products/types'
import type { DeliveryStaffProvider, InventoryCatalogProvider, InventoryFeatureState, InventorySkuSnapshot, PickingOrderCoordinator, ProcessingOrderSourceProvider } from '../../src/features/inventory/types'
import { InMemoryInventoryRepository } from '../../src/features/inventory/repositories/inventory-repository'
import { createInventoryService } from '../../src/features/inventory/services/inventory-service'

const featureData = baseline.featureData as Record<string, unknown>
export const inventoryBaseline = structuredClone(featureData['INV-001']) as InventoryFeatureState
const productBaseline = structuredClone(featureData['PRD-001']) as ProductFeatureState
const knownSources = new Set(['opening:source-opening-1', 'opening:source-opening-2', 'opening:source-opening-3', 'opening:source-opening-4', 'opening:source-opening-5', 'prototype-inbound:source-inbound-1', 'prototype-outbound:source-outbound-1'])

export function createInventoryCatalogProvider(partialFailure = false, readState: () => ProductFeatureState = () => productBaseline): InventoryCatalogProvider {
  function list(): InventorySkuSnapshot[] {
    if (partialFailure) throw new Error('原型模拟：商品资料服务不可用')
    const state = readState()
    const unitMap = new Map(state.units.map((item) => [item.id, item]))
    return state.products.flatMap((product) => product.skus.map((sku) => {
      const inventoryUnit = product.sceneUnits.inventory; return {
        skuId: sku.id, skuCode: sku.code, barcode: sku.barcode, productId: product.id, productName: product.name,
        specification: `${sku.specificationName}：${sku.specificationValue}`, categoryId: product.categoryId, brandId: product.brandId,
        productStatus: product.status, deleted: product.deletedAt !== null, baseUnitId: product.baseUnitId,
        baseUnitName: unitMap.get(product.baseUnitId)?.name ?? product.baseUnitId, inventoryUnitId: inventoryUnit.unitId,
        inventoryUnitName: unitMap.get(inventoryUnit.unitId)?.name ?? inventoryUnit.unitId,
        inventoryConversionRateMilli: Math.round(inventoryUnit.conversionRate * 1000), shelfLifeDays: product.shelfLifeDays,
        manageProductionDate: product.manageProductionDate,
      }
    }))
  }
  return {
    listSkus: list,
    getSku: (id) => list().find((item) => item.skuId === id) ?? null,
    listCategories: () => {
      if (partialFailure) throw new Error('商品分类资料暂时不可用')
      return readState().categories.filter((item) => !item.deletedAt).map((item) => ({ id: item.id, name: item.name, parentId: item.parentId, status: item.status }))
    },
    sourceExists: (type, id) => type === 'sales-outbound' || type === 'sales-outbound-void' || type === 'inventory-transfer-out' || type === 'inventory-transfer-in' || type === 'inventory-other-outbound' || type === 'inventory-other-inbound' || type === 'processing-material-pick' || type === 'processing-material-return' || type === 'processing-output' || (type === 'purchase-order-inbound' && id.startsWith('purchase-order-')) || (type === 'purchase-return' && id.startsWith('purchase-return-')) || ((type === 'customer-return' || type === 'customer-return-void') && id.startsWith('return-')) || knownSources.has(`${type}:${id}`),
  }
}

export function createBaselineInventoryRepository(): InMemoryInventoryRepository { return new InMemoryInventoryRepository(inventoryBaseline) }

const browserInventoryStateKey = 'fengding:mock:inventory-state:v1'
function browserPersistenceAvailable(): boolean {
  return typeof window !== 'undefined' && !/jsdom/i.test(window.navigator.userAgent)
}

class BrowserSharedInventoryRepository extends InMemoryInventoryRepository {
  constructor(initialState: InventoryFeatureState) {
    super(BrowserSharedInventoryRepository.load(initialState))
  }

  private static load(fallback: InventoryFeatureState): InventoryFeatureState {
    if (!browserPersistenceAvailable()) return fallback
    try {
      const raw = window.localStorage.getItem(browserInventoryStateKey)
      return raw ? JSON.parse(raw) as InventoryFeatureState : fallback
    } catch {
      return fallback
    }
  }

  private persist(): void {
    if (!browserPersistenceAvailable()) return
    try { window.localStorage.setItem(browserInventoryStateKey, JSON.stringify(super.read())) } catch { /* storage is optional in the prototype */ }
  }

  override read(): InventoryFeatureState {
    const latest = BrowserSharedInventoryRepository.load(super.read())
    super.reset(latest)
    return super.read()
  }

  override transact<T>(mutation: (draft: InventoryFeatureState) => T): T {
    const result = super.transact(mutation)
    this.persist()
    return result
  }

  override reset(state: InventoryFeatureState): void {
    super.reset(state)
    this.persist()
  }
}

export type InventoryScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied' | 'partial-failure' | 'boundary' | 'concurrent'
const scenarios = { normal: normalScenario, empty: emptyScenario, error: errorScenario, slow: slowScenario, 'permission-denied': permissionScenario, 'partial-failure': normalScenario, boundary: normalScenario, concurrent: normalScenario } as const

export class InventoryMockError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = 'InventoryMockError' } }

export function createInventoryMockSession(scenarioName: InventoryScenarioName = 'normal', options: { catalogProvider?: InventoryCatalogProvider; processingOrderProvider?: ProcessingOrderSourceProvider; pickingOrderCoordinator?: PickingOrderCoordinator; deliveryStaffProvider?: DeliveryStaffProvider } = {}) {
  const state = structuredClone(inventoryBaseline)
  state.transfers = []; state.otherOutbounds = []; state.otherInbounds = []; state.stocktakes = []; state.costAdjustments = []; state.costHistories = []; state.closings = []; state.averageCosts = []; state.inventoryLocks = []; state.processingRecipes = []; state.processingPlans = []; state.processingOrders = []; state.materialPicks = []; state.materialReturns = []; state.processingRequests = []; state.pickingTasks = []; state.pickingWaves = []; state.pickingDifferences = []; state.deliveryRoutes = []; state.deliveryVehicles = []; state.deliveryTasks = []; state.pickingLabels = []; state.pickingRequests = []; state.operationLocks = scenarioName === 'boundary' ? { inventoryLocked: true, monthClosedThrough: null } : { inventoryLocked: false, monthClosedThrough: null }
  if (scenarioName === 'empty') { state.warehouses = []; state.locations = []; state.thresholds = []; state.openingBalances = []; state.batches = []; state.balances = []; state.movements = []; state.changeLogs = [] }
  const repository = scenarioName === 'normal' && browserPersistenceAvailable()
    ? new BrowserSharedInventoryRepository(state)
    : new InMemoryInventoryRepository(state)
  let sequence = 1; let processingOrderProvider = options.processingOrderProvider; let pickingOrderCoordinator = options.pickingOrderCoordinator; let deliveryStaffProvider = options.deliveryStaffProvider
  const processingOrderProviderProxy: ProcessingOrderSourceProvider = {
    listEligibleOrders: () => processingOrderProvider?.listEligibleOrders() ?? { state: 'unavailable', items: [], version: 'unavailable', message: '销售订单数据源未接入' },
    getEligibleOrder: (orderId) => processingOrderProvider?.getEligibleOrder(orderId) ?? null,
  }
  const pickingOrderCoordinatorProxy: PickingOrderCoordinator = {
    listPickingOrders: () => pickingOrderCoordinator?.listPickingOrders() ?? { state: 'unavailable', items: [], version: 'unavailable', message: '订单分拣来源未接入' },
    listDeliveryOrders: () => pickingOrderCoordinator?.listDeliveryOrders() ?? { state: 'unavailable', items: [], version: 'unavailable', message: '待配送订单来源未接入' },
    getPickingOrder: (orderId) => pickingOrderCoordinator?.getPickingOrder(orderId) ?? null,
    confirmOutbounds: (actor, inputs) => { if (!pickingOrderCoordinator) throw new InventoryMockError('DATA_PROVIDER_UNAVAILABLE', '订单出库协调接口未接入'); return pickingOrderCoordinator.confirmOutbounds(actor, inputs) },
    confirmShipments: (actor, inputs) => { if (!pickingOrderCoordinator) throw new InventoryMockError('DATA_PROVIDER_UNAVAILABLE', '订单发货协调接口未接入'); return pickingOrderCoordinator.confirmShipments(actor, inputs) },
    checkpoint: () => pickingOrderCoordinator?.checkpoint() ?? null,
    restore: (checkpoint) => { pickingOrderCoordinator?.restore(checkpoint) },
  }
  const deliveryStaffProviderProxy: DeliveryStaffProvider = { listStaff: () => deliveryStaffProvider?.listStaff() ?? [] }
  const service = createInventoryService({ repository, catalog: options.catalogProvider ?? createInventoryCatalogProvider(scenarioName === 'partial-failure'), processingOrderProvider: processingOrderProviderProxy, pickingOrderCoordinator: pickingOrderCoordinatorProxy, deliveryStaffProvider: deliveryStaffProviderProxy, now: () => baseline.clock, nextId: (kind) => `${kind}-runtime-${sequence++}` })
  const definition = scenarios[scenarioName]
  async function run<T>(operation: () => T): Promise<T> { await new Promise((resolve) => setTimeout(resolve, definition.latencyMs)); if (scenarioName === 'error') throw new InventoryMockError('MOCK_INTERNAL_ERROR', '原型模拟：库存服务暂时不可用'); return operation() }
  return { scenarioName, repository, service, run, setProcessingOrderProvider: (provider: ProcessingOrderSourceProvider) => { processingOrderProvider = provider }, setPickingOrderCoordinator: (value: PickingOrderCoordinator) => { pickingOrderCoordinator = value }, setDeliveryStaffProvider: (value: DeliveryStaffProvider) => { deliveryStaffProvider = value } }
}
