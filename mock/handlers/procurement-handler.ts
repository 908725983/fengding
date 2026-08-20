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
import { createInventoryMockSession } from './inventory-handler'

const featureData = baseline.featureData as Record<string, unknown>
export const procurementBaseline = structuredClone(featureData['PUR-004']) as ProcurementFeatureState
const productBaseline = structuredClone(featureData['PRD-001']) as ProductFeatureState

export function createProcurementCatalogProvider(partialFailure = false): ProcurementCatalogProvider {
  const listSkus = (): ProcurementSkuSnapshot[] => {
    if (partialFailure) throw new Error('原型模拟：商品资料服务不可用')
    const units = new Map(productBaseline.units.map((item) => [item.id, item.name]))
    return productBaseline.products.flatMap((product) => product.skus.map((sku) => ({
      skuId: sku.id, productId: product.id, productName: product.name, productCode: product.code, skuCode: sku.code,
      specification: `${sku.specificationName}：${sku.specificationValue}`, barcode: sku.barcode, categoryId: product.categoryId,
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
    listCategories: () => { if (partialFailure) throw new Error('原型模拟：商品分类服务不可用'); return productBaseline.categories.map(({ id, name, parentId, status }) => ({ id, name, parentId, status })) },
  }
}

export function createBaselineProcurementRepository(): InMemoryProcurementRepository { return new InMemoryProcurementRepository(procurementBaseline) }
export type ProcurementScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied' | 'partial-failure' | 'boundary' | 'concurrent'
const scenarios = { normal: normalScenario, empty: emptyScenario, error: errorScenario, slow: slowScenario, 'permission-denied': permissionScenario, 'partial-failure': normalScenario, boundary: normalScenario, concurrent: normalScenario } as const

export class ProcurementMockError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = 'ProcurementMockError' } }

export function createProcurementMockSession(scenarioName: ProcurementScenarioName = 'normal') {
  const state = structuredClone(procurementBaseline)
  if (scenarioName === 'empty') { state.suppliers = []; state.supplierProducts = []; state.auditLogs = []; state.requests = [] }
  const repository = new InMemoryProcurementRepository(state); let sequence = 1
  const service = createProcurementService({ repository, catalog: createProcurementCatalogProvider(scenarioName === 'partial-failure'), now: () => baseline.clock, nextId: (kind) => `${kind}-runtime-${sequence++}` })
  const inventorySession = createInventoryMockSession(scenarioName === 'empty' ? 'empty' : scenarioName === 'error' ? 'error' : scenarioName === 'slow' ? 'slow' : scenarioName === 'partial-failure' ? 'partial-failure' : 'normal')
  const replenishment = createReplenishmentService({ inventory: inventorySession.service.createReplenishmentProvider(), catalog: createProcurementCatalogProvider(scenarioName === 'partial-failure'), supply: service.createSupplyProvider(), now: () => baseline.clock, nextId: (kind) => `${kind}-runtime-${sequence++}` })
  const definition = scenarios[scenarioName]
  async function run<T>(operation: () => T): Promise<T> { await new Promise((resolve) => setTimeout(resolve, definition.latencyMs)); if (scenarioName === 'error') throw new ProcurementMockError('MOCK_INTERNAL_ERROR', '原型模拟：采购供应商服务暂时不可用'); return operation() }
  return { scenarioName, repository, service, replenishment, run }
}
