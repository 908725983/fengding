import { assertFinanceFeatureState } from '../schemas/finance-schema'
import type { FinanceFeatureState } from '../types'

export interface FinanceRepository {
  read(): FinanceFeatureState
  transact<T>(mutation: (draft: FinanceFeatureState) => T): T
  reset(state: FinanceFeatureState): void
}

export class InMemoryFinanceRepository implements FinanceRepository {
  private state: FinanceFeatureState

  constructor(initialState: FinanceFeatureState) {
    assertFinanceFeatureState(initialState)
    this.state = structuredClone(initialState)
  }

  read(): FinanceFeatureState { return structuredClone(this.state) }

  transact<T>(mutation: (draft: FinanceFeatureState) => T): T {
    const draft = structuredClone(this.state)
    const result = mutation(draft)
    assertFinanceFeatureState(draft)
    this.state = draft
    return structuredClone(result)
  }

  reset(state: FinanceFeatureState): void {
    assertFinanceFeatureState(state)
    this.state = structuredClone(state)
  }
}
