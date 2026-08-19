import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import type { ProductFeatureState } from '../../src/features/products/types'
import { InMemoryProductRepository } from '../../src/features/products/repositories/product-repository'
import { createProductService } from '../../src/features/products/services/product-service'
import { createProcurementMockSession } from './procurement-handler'

const featureData = baseline.featureData as Record<string, unknown>
export const productBaseline = structuredClone(featureData['PRD-001']) as ProductFeatureState

export function createBaselineProductRepository(): InMemoryProductRepository {
  return new InMemoryProductRepository(productBaseline)
}

export type ProductScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied'

const scenarioDefinitions = {
  normal: normalScenario, empty: emptyScenario, error: errorScenario, slow: slowScenario, 'permission-denied': permissionScenario,
} as const

export class ProductMockError extends Error {
  constructor(readonly code: string, message: string) {
    super(message); this.name = 'ProductMockError'
  }
}

export function createProductMockSession(scenarioName: ProductScenarioName = 'normal') {
  const state = structuredClone(productBaseline)
  if (scenarioName === 'empty') {
    state.products = []
    state.changeLogs = []
  }
  const repository = new InMemoryProductRepository(state)
  let sequence = 1
  const supplierProvider = createProcurementMockSession('normal').service.createSupplyProvider()
  const service = createProductService({ repository, supplierProvider, now: () => baseline.clock, nextId: (kind) => `${kind}-runtime-${sequence++}` })
  const definition = scenarioDefinitions[scenarioName]

  async function run<T>(operation: () => T): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, definition.latencyMs))
    if (scenarioName === 'error') throw new ProductMockError('MOCK_INTERNAL_ERROR', '原型模拟：商品服务暂时不可用')
    return operation()
  }

  return { scenarioName, repository, service, run }
}
