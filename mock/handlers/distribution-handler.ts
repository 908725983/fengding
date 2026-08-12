import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import type { CustomerFeatureState } from '../../src/features/customers/types'
import type { ProductFeatureState } from '../../src/features/products/types'
import type { DistributionCatalogProvider, DistributionFeatureState, DistributionSkuSnapshot } from '../../src/features/products/distribution/types'
import { InMemoryDistributionRepository } from '../../src/features/products/distribution/repositories/distribution-repository'
import { createDistributionService } from '../../src/features/products/distribution/services/distribution-service'
import { createAuthorizationMockSession } from './authorization-handler'

const featureData = baseline.featureData as Record<string, unknown>
export const distributionBaseline = structuredClone(featureData['PRD-004']) as DistributionFeatureState
const productBaseline = structuredClone(featureData['PRD-001']) as ProductFeatureState
const customerBaseline = structuredClone(featureData['CUS-001']) as CustomerFeatureState

export function createBaselineDistributionCatalog(): DistributionCatalogProvider {
  const authorization = createAuthorizationMockSession('normal')
  const units = Object.fromEntries(productBaseline.units.map((item) => [item.id, item.name]))
  const skus = productBaseline.products.flatMap((product) => product.skus.map((sku): DistributionSkuSnapshot => ({
    skuId: sku.id, skuCode: sku.code, productId: product.id, productCode: product.code, productName: product.name,
    specification: `${sku.specificationName}：${sku.specificationValue}`, productStatus: product.status, deletedAt: product.deletedAt,
    baseUnitId: product.baseUnitId, baseUnitName: units[product.baseUnitId] ?? product.baseUnitId,
    minimumOrderQuantity: product.minimumOrderQuantity, orderMultiple: product.orderMultiple, marketPriceCents: sku.baseOrderPriceCents,
  })))
  return {
    listCustomers: () => structuredClone(customerBaseline.customers.map((item) => ({ id: item.id, code: item.code, name: item.name, status: item.status, provinceCode: item.provinceCode, cityCode: item.cityCode, districtCode: item.districtCode, categoryId: item.categoryId, tagIds: item.tagIds, canSelfOrder: item.businessSettings.canSelfOrder }))),
    listCustomerCategories: () => structuredClone(customerBaseline.categories.map((item) => ({ id: item.id, parentId: item.parentId, name: item.name }))),
    listSkus: () => structuredClone(skus),
    resolveAuthorization: (customerId, productId, at) => { const result = authorization.service.resolveAuthorization({ role: 'salesperson', actorId: 'distribution-provider' }, customerId, productId, at); return { orderable: result.orderable, reason: result.reason } },
  }
}

export type DistributionScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied'
const definitions = { normal: normalScenario, empty: emptyScenario, error: errorScenario, slow: slowScenario, 'permission-denied': permissionScenario } as const
export class DistributionMockError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = 'DistributionMockError' } }

export function createDistributionMockSession(scenarioName: DistributionScenarioName = 'normal') {
  const state = structuredClone(distributionBaseline); if (scenarioName === 'empty') { state.plans = []; state.templates = []; state.changeLogs = [] }
  const repository = new InMemoryDistributionRepository(state); const catalog = createBaselineDistributionCatalog(); let sequence = 1; let clock = baseline.clock
  const service = createDistributionService({ repository, catalog, now: () => clock, nextId: (kind) => `distribution-${kind}-runtime-${sequence++}` })
  async function run<T>(operation: () => T): Promise<T> { await new Promise((resolve) => setTimeout(resolve, definitions[scenarioName].latencyMs)); if (scenarioName === 'error') throw new DistributionMockError('MOCK_INTERNAL_ERROR', '原型模拟：铺货与模板服务暂时不可用'); return operation() }
  function setClock(value: string): void { if (Date.parse(value) < Date.parse(clock)) throw new DistributionMockError('CLOCK_REWIND', '模拟时钟不能倒退'); clock = value }
  return { scenarioName, repository, catalog, service, run, setClock, getClock: () => clock }
}
