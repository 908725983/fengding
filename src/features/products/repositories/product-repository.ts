import { assertProductFeatureState } from '../schemas/product-schema'
import type { ProductFeatureState } from '../types'

export interface ProductRepository {
  read(): ProductFeatureState
  transact<T>(mutation: (draft: ProductFeatureState) => T): T
  reset(state: ProductFeatureState): void
}

export class InMemoryProductRepository implements ProductRepository {
  private state: ProductFeatureState

  constructor(initialState: ProductFeatureState) {
    assertProductFeatureState(initialState)
    this.state = structuredClone(initialState)
  }

  read(): ProductFeatureState { return structuredClone(this.state) }

  transact<T>(mutation: (draft: ProductFeatureState) => T): T {
    const draft = structuredClone(this.state)
    const result = mutation(draft)
    assertProductFeatureState(draft)
    this.state = draft
    return structuredClone(result)
  }

  reset(state: ProductFeatureState): void {
    assertProductFeatureState(state)
    this.state = structuredClone(state)
  }
}
