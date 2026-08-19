import { assertProcurementFeatureState } from '../schemas/procurement-schema'
import type { ProcurementFeatureState } from '../types'

export interface ProcurementRepository { read(): ProcurementFeatureState; transact<T>(mutation: (draft: ProcurementFeatureState) => T): T; reset(state: ProcurementFeatureState): void }

export class InMemoryProcurementRepository implements ProcurementRepository {
  private state: ProcurementFeatureState
  constructor(initialState: ProcurementFeatureState) { assertProcurementFeatureState(initialState); this.state = structuredClone(initialState) }
  read(): ProcurementFeatureState { return structuredClone(this.state) }
  transact<T>(mutation: (draft: ProcurementFeatureState) => T): T { const draft = structuredClone(this.state); const result = mutation(draft); assertProcurementFeatureState(draft); this.state = draft; return structuredClone(result) }
  reset(state: ProcurementFeatureState): void { assertProcurementFeatureState(state); this.state = structuredClone(state) }
}
