import { assertPricingFeatureState } from '../schemas/pricing-schema'
import type { PricingFeatureState } from '../types'

export interface PricingRepository {
  read(): PricingFeatureState
  transact<T>(mutation: (draft: PricingFeatureState) => T): T
  reset(state: PricingFeatureState): void
}

export class InMemoryPricingRepository implements PricingRepository {
  private state: PricingFeatureState

  constructor(initialState: PricingFeatureState) {
    assertPricingFeatureState(initialState)
    this.state = structuredClone(initialState)
  }

  read(): PricingFeatureState { return structuredClone(this.state) }

  transact<T>(mutation: (draft: PricingFeatureState) => T): T {
    const draft = structuredClone(this.state)
    const result = mutation(draft)
    assertPricingFeatureState(draft)
    this.state = draft
    return structuredClone(result)
  }

  reset(state: PricingFeatureState): void {
    assertPricingFeatureState(state)
    this.state = structuredClone(state)
  }
}
