import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import type { CustomerFeatureState } from '../../src/features/customers/types'
import type { ProductFeatureState } from '../../src/features/products/types'
import { InMemoryPricingRepository } from '../../src/features/products/pricing/repositories/pricing-repository'
import { createPricingService } from '../../src/features/products/pricing/services/pricing-service'
import type { PricingCatalogProvider, PricingCustomerSnapshot, PricingFeatureState, PricingSkuSnapshot } from '../../src/features/products/pricing/types'

const featureData = baseline.featureData as Record<string, unknown>
export const pricingBaseline = structuredClone(featureData['PRD-002']) as PricingFeatureState
const productBaseline = structuredClone(featureData['PRD-001']) as ProductFeatureState
const customerBaseline = structuredClone(featureData['CUS-001']) as CustomerFeatureState

export function createBaselinePricingCatalog(): PricingCatalogProvider {
  const skuSnapshots = productBaseline.products.flatMap((product) => product.skus.map((sku): PricingSkuSnapshot => {
        const unitRates: Record<string, number> = { [product.baseUnitId]: 1 }
        for (const scene of Object.values(product.sceneUnits)) unitRates[scene.unitId] = scene.conversionRate
        const { basePurchasePriceCents, baseOrderPriceCents, minimumSalePriceCents, maximumSalePriceCents, tierOnePriceCents, tierTwoPriceCents, storePriceCents, terminalPriceCents } = sku
        return { skuId: sku.id, productId: product.id, productName: product.name, skuCode: sku.code,
          specification: `${sku.specificationName}：${sku.specificationValue}`, productStatus: product.status, baseUnitId: product.baseUnitId, unitRates,
          prices: { basePurchasePriceCents, baseOrderPriceCents, minimumSalePriceCents, maximumSalePriceCents, tierOnePriceCents, tierTwoPriceCents, storePriceCents, terminalPriceCents } }
  }))
  const customerSnapshots = customerBaseline.customers.map((customer): PricingCustomerSnapshot => {
      const categoryLineage: string[] = []; let categoryId: string | null = customer.categoryId
      while (categoryId) { categoryLineage.push(categoryId); categoryId = customerBaseline.categories.find((item) => item.id === categoryId)?.parentId ?? null }
      return { customerId: customer.id, customerName: customer.name, status: customer.status, categoryLineage }
  })
  return {
    getSku: (skuId) => structuredClone(skuSnapshots.find((item) => item.skuId === skuId) ?? null),
    getCustomer: (customerId) => structuredClone(customerSnapshots.find((item) => item.customerId === customerId) ?? null),
    listSkus: () => structuredClone(skuSnapshots),
    listCustomers: () => structuredClone(customerSnapshots),
  }
}

export type PricingScenarioName = 'normal' | 'empty' | 'error' | 'slow' | 'permission-denied'

const scenarioDefinitions = {
  normal: normalScenario, empty: emptyScenario, error: errorScenario, slow: slowScenario, 'permission-denied': permissionScenario,
} as const

export class PricingMockError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'PricingMockError' }
}

export function createPricingMockSession(scenarioName: PricingScenarioName = 'normal') {
  const state = structuredClone(pricingBaseline)
  if (scenarioName === 'empty') {
    state.adjustments = []; state.versions = []; state.history = []; state.unitOverrides = []; state.strategies = []
  }
  const repository = new InMemoryPricingRepository(state)
  const catalog = createBaselinePricingCatalog()
  let sequence = 1
  const service = createPricingService({ repository, catalog, nextId: (kind) => `price-${kind}-runtime-${sequence++}` })
  const definition = scenarioDefinitions[scenarioName]

  async function run<T>(operation: () => T): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, definition.latencyMs))
    if (scenarioName === 'error') throw new PricingMockError('MOCK_INTERNAL_ERROR', '原型模拟：价格服务暂时不可用')
    return operation()
  }

  return { scenarioName, repository, catalog, service, run }
}
