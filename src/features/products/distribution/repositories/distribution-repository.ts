import { assertDistributionFeatureState } from '../schemas/distribution-schema'
import type { DistributionFeatureState } from '../types'

export interface DistributionRepository { read(): DistributionFeatureState; transact<T>(mutation: (draft: DistributionFeatureState) => T): T; reset(state: DistributionFeatureState): void }

export class InMemoryDistributionRepository implements DistributionRepository {
  private state: DistributionFeatureState
  constructor(initialState: DistributionFeatureState) { assertDistributionFeatureState(initialState); this.state = structuredClone(initialState) }
  read(): DistributionFeatureState { return structuredClone(this.state) }
  transact<T>(mutation: (draft: DistributionFeatureState) => T): T { const draft = structuredClone(this.state); const result = mutation(draft); assertDistributionFeatureState(draft); this.state = draft; return structuredClone(result) }
  reset(state: DistributionFeatureState): void { assertDistributionFeatureState(state); this.state = structuredClone(state) }
}
