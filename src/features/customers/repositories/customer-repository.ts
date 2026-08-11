import { assertCustomerFeatureState } from '../schemas/customer-schema'
import type { CustomerFeatureState } from '../types'

export interface CustomerRepository {
  read(): CustomerFeatureState
  transact<T>(mutation: (draft: CustomerFeatureState) => T): T
  reset(state: CustomerFeatureState): void
}

export class InMemoryCustomerRepository implements CustomerRepository {
  private state: CustomerFeatureState

  constructor(initialState: CustomerFeatureState) {
    assertCustomerFeatureState(initialState)
    this.state = structuredClone(initialState)
  }

  read(): CustomerFeatureState { return structuredClone(this.state) }

  transact<T>(mutation: (draft: CustomerFeatureState) => T): T {
    const draft = structuredClone(this.state)
    const result = mutation(draft)
    assertCustomerFeatureState(draft)
    this.state = draft
    return structuredClone(result)
  }

  reset(state: CustomerFeatureState): void {
    assertCustomerFeatureState(state)
    this.state = structuredClone(state)
  }
}
