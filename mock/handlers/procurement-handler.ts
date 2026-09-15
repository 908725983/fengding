import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import type { ProductFeatureState } from '../../src/features/products/types'
import type { ProcurementCatalogProvider, ProcurementFeatureState, ProcurementSkuSnapshot } from '../../src/features/procurement/types'
import { InMemoryProcurementRepository } from '../../src/features/procurement/repositories/procurement-repository'
import { createProcurementService } from '../../src/features/procurement/services/procurement-service'
import { createReplenishmentService } from '../../src/features/procurement/services/replenishment-service'
import { createPurchaseStatisticsService } from '../../src/features/procurement/statistics/service'
import { createInventoryMockSession } from './inventory-handler'
import { createFinanceMockSession } from './finance-handler'
import { createRuntimeSequence } from '../runtime/application-browser-persistence'

const featureData = baseline.featureData as Record<string, unknown>
export const procurementBaseline = structuredClone(featureData['PUR-004']) as ProcurementFeatureState
const productBaseline = structuredClone(featureData['PRD-001']) as ProductFeatureState

export function createProcurementCatalogProvider(
  partialFailure = false,
  readState: () => ProductFeatureState = () => productBaseline,
): ProcurementCatalogProvider {
  const listSkus = (): ProcurementSkuSnapshot[] => {
    if (partialFailure) throw new Error('原型模拟：商品资料服务不可用')
    const state = readState()
    const units = new Map(state.units.map((item) => [item.id, item.name]))
    return state.products.flatMap((product) => product.skus.map((sku) => ({
      skuId: sku.id, productId: product.id, productName: product.name, productCode: product.code, skuCode: sku.code,
      specification: `${sku.specificationName}：${sku.specificationValue}`, barcode: sku.barcode, categoryId: product.categoryId,
      baseUnitId: product.baseUnitId, baseUnitName: units.get(product.baseUnitId) ?? product.baseUnitId,
      productStatus: product.status, deleted: product.deletedAt !== null, procurementUnitId: product.sceneUnits.procurement.unitId,
      procurementUnitName: units.get(product.sceneUnits.procurement.unitId) ?? product.sceneUnits.procurement.unitId,
      procurementUnitRateMilli: Math.round(product.sceneUnits.procurement.conversionRate * 1000),
      minimumOrderQuantity: product.minimumOrderQuantity,
      orderMultiple: product.orderMultiple,
    })))
  }
  return {
    listSkus,
    getSku: (id) => listSkus().find((item) => item.skuId === id) ?? null,
    listCategories: () => { if (partialFailure) throw new Error('原型模拟：商品分类服务不可用'); return readState().categories.map(({ id, name, parentId, status }) => ({ id, name, parentId, status })) },
  }
}

export function createBaselineProcurementRepository(): InMemoryProcurementRepository { return new InMemoryProcurementRepository(procurementBaseline) }
export type ProcurementScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied' | 'partial-failure' | 'unavailable' | 'boundary' | 'concurrent'
const scenarios = { normal: normalScenario, empty: emptyScenario, error: errorScenario, slow: slowScenario, 'permission-denied': permissionScenario, 'partial-failure': normalScenario, unavailable: normalScenario, boundary: normalScenario, concurrent: normalScenario } as const

export class ProcurementMockError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = 'ProcurementMockError' } }

export interface ProcurementMockSharedDependencies {
  inventory: Pick<ReturnType<typeof createInventoryMockSession>, 'repository' | 'service'>
  finance: Pick<ReturnType<typeof createFinanceMockSession>, 'repository' | 'service'>
  catalog?: ProcurementCatalogProvider
}

export function createProcurementMockSession(scenarioName: ProcurementScenarioName = 'normal', shared?: ProcurementMockSharedDependencies) {
  const state = structuredClone(procurementBaseline)
  if (scenarioName === 'empty') { state.suppliers = []; state.supplierProducts = []; state.auditLogs = []; state.requests = []; state.purchaseOrders = []; state.purchaseReturns = []; state.purchaseInbounds = [] }
  const repository = new InMemoryProcurementRepository(state); const nextSequence = createRuntimeSequence()
  const inventorySession = shared?.inventory ?? createInventoryMockSession(scenarioName === 'empty' ? 'empty' : scenarioName === 'error' ? 'error' : scenarioName === 'slow' ? 'slow' : scenarioName === 'partial-failure' ? 'partial-failure' : 'normal')
  const financeSession = shared?.finance ?? createFinanceMockSession(scenarioName === 'empty' ? 'empty' : scenarioName === 'error' ? 'error' : scenarioName === 'slow' ? 'slow' : scenarioName === 'partial-failure' ? 'partial-failure' : 'normal', '2026-08-10T23:59:59+08:00')
  const catalog = shared?.catalog ?? createProcurementCatalogProvider(scenarioName === 'partial-failure')
  const financeActor = { actorId: 'finance-integration', role: 'finance' as const }
  const service = createProcurementService({ repository, catalog, inventory: { confirmInbound: (actor, input) => inventorySession.service.confirmInbound(actor, input), confirmOutboundBatch: (actor, input) => inventorySession.service.confirmOutboundBatch(actor, input), snapshot: () => inventorySession.repository.read(), restore: (snapshot) => inventorySession.repository.reset(snapshot as any), getWarehouse: (actor, warehouseId) => { const value = inventorySession.service.getWorkspace(actor).warehouses.find((item) => item.id === warehouseId); return value ? { id: value.id, name: value.name } : null } }, finance: { checkpoint: () => financeSession.repository.read(), restore: (snapshot) => financeSession.repository.reset(snapshot as any), createPayableFromInbound: (input) => financeSession.service.createSupplierPayable(financeActor, input), listPayablesForPurchaseOrder: (purchaseOrderId) => financeSession.service.listSupplierPayables(financeActor).filter((item) => item.purchaseOrderId === purchaseOrderId).map((item) => ({ id: item.id, inboundId: item.inboundId, occurredAt: item.occurredAt, supplierId: item.supplierSnapshot.id, items: item.items.map((line) => ({ purchaseOrderLineId: line.purchaseOrderLineId, quantityMilli: line.quantityMilli, subtotalCents: line.subtotalCents, allocatedDiscountCents: line.allocatedDiscountCents, allocatedOtherFeeCents: line.allocatedOtherFeeCents, amountCents: line.amountCents })) })), createPayableCredit: (input) => { if (scenarioName === 'unavailable') throw new ProcurementMockError('DATA_PROVIDER_UNAVAILABLE', '原型模拟：供应商贷项提供方尚未接入'); return financeSession.service.createSupplierPayableCredit(financeActor, { ...input, sourceType: 'purchase-return' }) } }, now: () => baseline.clock, nextId: (kind) => `${kind}-runtime-${nextSequence()}` })
  const replenishment = createReplenishmentService({ inventory: inventorySession.service.createReplenishmentProvider(), catalog, supply: service.createSupplyProvider(), now: () => baseline.clock, nextId: (kind) => `${kind}-runtime-${nextSequence()}` })
  const statistics = createPurchaseStatisticsService({ repository, now: () => baseline.clock, unavailableMessage: scenarioName === 'unavailable' ? '原型模拟：采购统计历史移动数据源尚未接入。' : null })
  const definition = scenarios[scenarioName]
  async function run<T>(operation: () => T): Promise<T> { await new Promise((resolve) => setTimeout(resolve, definition.latencyMs)); if (scenarioName === 'error') throw new ProcurementMockError('MOCK_INTERNAL_ERROR', '原型模拟：采购供应商服务暂时不可用'); return operation() }
  return { scenarioName, repository, service, replenishment, statistics, inventory: inventorySession.service, finance: financeSession.service, inventoryRepository: inventorySession.repository, financeRepository: financeSession.repository, run }
}
