import baseline from '../fixtures/baseline.json'
import type { CustomerFeatureState } from '../../src/features/customers/types'
import { InMemoryCustomerRepository } from '../../src/features/customers/repositories/customer-repository'

const featureData = baseline.featureData as Record<string, unknown>

export const customerBaseline = structuredClone(featureData['CUS-001']) as CustomerFeatureState

export function createBaselineCustomerRepository(): InMemoryCustomerRepository {
  return new InMemoryCustomerRepository(customerBaseline)
}
