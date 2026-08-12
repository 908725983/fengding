import { assertAuthorizationFeatureState } from '../schemas/authorization-schema'
import type { AuthorizationFeatureState } from '../types'

export interface AuthorizationRepository {
  read(): AuthorizationFeatureState
  transact<T>(mutation: (draft: AuthorizationFeatureState) => T): T
  reset(state: AuthorizationFeatureState): void
}

export class InMemoryAuthorizationRepository implements AuthorizationRepository {
  private state: AuthorizationFeatureState
  constructor(initialState: AuthorizationFeatureState) { assertAuthorizationFeatureState(initialState); this.state = structuredClone(initialState) }
  read(): AuthorizationFeatureState { return structuredClone(this.state) }
  transact<T>(mutation: (draft: AuthorizationFeatureState) => T): T {
    const draft = structuredClone(this.state); const result = mutation(draft); assertAuthorizationFeatureState(draft); this.state = draft; return structuredClone(result)
  }
  reset(state: AuthorizationFeatureState): void { assertAuthorizationFeatureState(state); this.state = structuredClone(state) }
}

