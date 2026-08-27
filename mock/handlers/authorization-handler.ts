import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import type { CustomerFeatureState } from '../../src/features/customers/types'
import type { ProductFeatureState } from '../../src/features/products/types'
import { InMemoryAuthorizationRepository } from '../../src/features/products/authorization/repositories/authorization-repository'
import { createAuthorizationService } from '../../src/features/products/authorization/services/authorization-service'
import type { AuthorizationCatalog, AuthorizationFeatureState } from '../../src/features/products/authorization/types'

const featureData = baseline.featureData as Record<string, unknown>
export const authorizationBaseline = structuredClone(featureData['PRD-003']) as AuthorizationFeatureState
const productBaseline = structuredClone(featureData['PRD-001']) as ProductFeatureState
const customerBaseline = structuredClone(featureData['CUS-001']) as CustomerFeatureState

export function createBaselineAuthorizationCatalog(): AuthorizationCatalog {
  return {
    products: productBaseline.products.map((item) => ({ id: item.id, code: item.code, name: item.name, categoryId: item.categoryId, brandId: item.brandId, status: item.status, deletedAt: item.deletedAt })),
    categories: productBaseline.categories.map((item) => ({ id: item.id, name: item.name, parentId: item.parentId, status: item.status })),
    brands: productBaseline.brands.map((item) => ({ id: item.id, name: item.name, status: item.status })),
    customers: customerBaseline.customers.map((item) => ({ id: item.id, code: item.code, name: item.name, categoryName: customerBaseline.categories.find((category) => category.id === item.categoryId)?.name ?? item.categoryId, status: item.status })),
  }
}

export type AuthorizationScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied'
const scenarioDefinitions = { normal: normalScenario, empty: emptyScenario, error: errorScenario, slow: slowScenario, 'permission-denied': permissionScenario } as const
export class AuthorizationMockError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = 'AuthorizationMockError' } }

export function createAuthorizationMockSession(scenarioName: AuthorizationScenarioName = 'normal', catalogProvider?: () => AuthorizationCatalog) {
  const state = structuredClone(authorizationBaseline)
  if (scenarioName === 'empty') { state.plans = []; state.rules = []; state.specials = []; state.changeLogs = [] }
  const repository = new InMemoryAuthorizationRepository(state)
  const catalog = createBaselineAuthorizationCatalog()
  let sequence = 1
  let clock = baseline.clock
  const service = createAuthorizationService({ repository, getCatalog: () => catalogProvider ? catalogProvider() : catalog, now: () => clock, nextId: (kind) => `authorization-${kind}-runtime-${sequence++}` })
  const definition = scenarioDefinitions[scenarioName]
  async function run<T>(operation: () => T): Promise<T> { await new Promise((resolve) => setTimeout(resolve, definition.latencyMs)); if (scenarioName === 'error') throw new AuthorizationMockError('MOCK_INTERNAL_ERROR', '原型模拟：商品授权服务暂时不可用'); return operation() }
  function setClock(value: string): void { if (value < clock) throw new AuthorizationMockError('CLOCK_REWIND', '模拟时钟不能倒退'); clock = value }
  return { scenarioName, repository, catalog, service, run, setClock, getClock: () => clock }
}
