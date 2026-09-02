import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import type { ProductFeatureState } from '../../src/features/products/types'
import { assertProductFeatureState } from '../../src/features/products/schemas/product-schema'
import { InMemoryProductRepository } from '../../src/features/products/repositories/product-repository'
import { createProductService, type ProductServiceDependencies } from '../../src/features/products/services/product-service'
import { createProcurementMockSession } from './procurement-handler'

const featureData = baseline.featureData as Record<string, unknown>
export const productBaseline = structuredClone(featureData['PRD-001']) as ProductFeatureState

export function createBaselineProductRepository(): InMemoryProductRepository {
  return new InMemoryProductRepository(productBaseline)
}

const browserProductStateKey = 'fengding:mock:product-state:v1'
function browserPersistenceAvailable(): boolean {
  return typeof window !== 'undefined' && !/jsdom/i.test(window.navigator.userAgent)
}

class BrowserSharedProductRepository extends InMemoryProductRepository {
  constructor(initialState: ProductFeatureState) {
    super(BrowserSharedProductRepository.load(initialState))
  }

  private static load(fallback: ProductFeatureState): ProductFeatureState {
    if (!browserPersistenceAvailable()) return fallback
    try {
      const raw = window.localStorage.getItem(browserProductStateKey)
      if (!raw) return fallback
      const persisted = JSON.parse(raw) as ProductFeatureState
      assertProductFeatureState(persisted)
      return persisted
    } catch {
      return fallback
    }
  }

  private persist(): void {
    if (!browserPersistenceAvailable()) return
    try { window.localStorage.setItem(browserProductStateKey, JSON.stringify(super.read())) } catch { /* storage is optional in the prototype */ }
  }

  override read(): ProductFeatureState {
    const latest = BrowserSharedProductRepository.load(super.read())
    super.reset(latest)
    return super.read()
  }

  override transact<T>(mutation: (draft: ProductFeatureState) => T): T {
    const result = super.transact(mutation)
    this.persist()
    return result
  }

  override reset(state: ProductFeatureState): void {
    super.reset(state)
    this.persist()
  }
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

export function createProductMockSession(scenarioName: ProductScenarioName = 'normal', supplierProvider?: ProductServiceDependencies['supplierProvider']) {
  const state = structuredClone(productBaseline)
  if (scenarioName === 'empty') {
    state.products = []
    state.changeLogs = []
  }
  const repository = scenarioName === 'normal' && browserPersistenceAvailable()
    ? new BrowserSharedProductRepository(state)
    : new InMemoryProductRepository(state)
  let sequence = 1
  const effectiveSupplierProvider = supplierProvider ?? createProcurementMockSession('normal').service.createSupplyProvider()
  const service = createProductService({ repository, supplierProvider: effectiveSupplierProvider, now: () => baseline.clock, nextId: (kind) => `${kind}-runtime-${sequence++}` })
  const definition = scenarioDefinitions[scenarioName]

  async function run<T>(operation: () => T): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, definition.latencyMs))
    if (scenarioName === 'error') throw new ProductMockError('MOCK_INTERNAL_ERROR', '原型模拟：商品服务暂时不可用')
    return operation()
  }

  return { scenarioName, repository, service, run }
}
