import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import type { ProductFeatureState } from '../../src/features/products/types'
import type { InventoryCatalogProvider, InventoryFeatureState, InventorySkuSnapshot } from '../../src/features/inventory/types'
import { InMemoryInventoryRepository } from '../../src/features/inventory/repositories/inventory-repository'
import { createInventoryService } from '../../src/features/inventory/services/inventory-service'

const featureData = baseline.featureData as Record<string, unknown>
export const inventoryBaseline = structuredClone(featureData['INV-001']) as InventoryFeatureState
const productBaseline = structuredClone(featureData['PRD-001']) as ProductFeatureState
const knownSources = new Set(['opening:source-opening-1', 'opening:source-opening-2', 'opening:source-opening-3', 'opening:source-opening-4', 'opening:source-opening-5', 'prototype-inbound:source-inbound-1', 'prototype-outbound:source-outbound-1'])

export function createInventoryCatalogProvider(partialFailure = false): InventoryCatalogProvider {
  function list(): InventorySkuSnapshot[] {
    if (partialFailure) throw new Error('原型模拟：商品资料服务不可用')
    const unitMap = new Map(productBaseline.units.map((item) => [item.id, item]))
    return productBaseline.products.flatMap((product) => product.skus.map((sku) => {
      const inventoryUnit = product.sceneUnits.inventory; return {
        skuId: sku.id, skuCode: sku.code, barcode: sku.barcode, productId: product.id, productName: product.name,
        specification: `${sku.specificationName}：${sku.specificationValue}`, categoryId: product.categoryId,
        productStatus: product.status, deleted: product.deletedAt !== null, baseUnitId: product.baseUnitId,
        baseUnitName: unitMap.get(product.baseUnitId)?.name ?? product.baseUnitId, inventoryUnitId: inventoryUnit.unitId,
        inventoryUnitName: unitMap.get(inventoryUnit.unitId)?.name ?? inventoryUnit.unitId,
        inventoryConversionRateMilli: Math.round(inventoryUnit.conversionRate * 1000), shelfLifeDays: product.shelfLifeDays,
        manageProductionDate: product.manageProductionDate,
      }
    }))
  }
  return { listSkus: list, getSku: (id) => list().find((item) => item.skuId === id) ?? null, sourceExists: (type, id) => type === 'sales-outbound' || type === 'sales-outbound-void' || knownSources.has(`${type}:${id}`) }
}

export function createBaselineInventoryRepository(): InMemoryInventoryRepository { return new InMemoryInventoryRepository(inventoryBaseline) }
export type InventoryScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied' | 'partial-failure'
const scenarios = { normal: normalScenario, empty: emptyScenario, error: errorScenario, slow: slowScenario, 'permission-denied': permissionScenario, 'partial-failure': normalScenario } as const

export class InventoryMockError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = 'InventoryMockError' } }

export function createInventoryMockSession(scenarioName: InventoryScenarioName = 'normal') {
  const state = structuredClone(inventoryBaseline)
  if (scenarioName === 'empty') { state.warehouses = []; state.locations = []; state.thresholds = []; state.openingBalances = []; state.batches = []; state.balances = []; state.movements = []; state.changeLogs = [] }
  const repository = new InMemoryInventoryRepository(state); let sequence = 1
  const service = createInventoryService({ repository, catalog: createInventoryCatalogProvider(scenarioName === 'partial-failure'), now: () => baseline.clock, nextId: (kind) => `${kind}-runtime-${sequence++}` })
  const definition = scenarios[scenarioName]
  async function run<T>(operation: () => T): Promise<T> { await new Promise((resolve) => setTimeout(resolve, definition.latencyMs)); if (scenarioName === 'error') throw new InventoryMockError('MOCK_INTERNAL_ERROR', '原型模拟：库存服务暂时不可用'); return operation() }
  return { scenarioName, repository, service, run }
}
