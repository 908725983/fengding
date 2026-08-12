import { assertInventoryFeatureState } from '../schemas/inventory-schema'
import type { InventoryFeatureState } from '../types'

export interface InventoryRepository { read(): InventoryFeatureState; transact<T>(mutation: (draft: InventoryFeatureState) => T): T; reset(state: InventoryFeatureState): void }

export class InMemoryInventoryRepository implements InventoryRepository {
  private state: InventoryFeatureState
  constructor(initialState: InventoryFeatureState) { assertInventoryFeatureState(initialState); this.state = structuredClone(initialState) }
  read(): InventoryFeatureState { return structuredClone(this.state) }
  transact<T>(mutation: (draft: InventoryFeatureState) => T): T { const draft = structuredClone(this.state); const result = mutation(draft); assertInventoryFeatureState(draft); this.state = draft; return structuredClone(result) }
  reset(state: InventoryFeatureState): void { assertInventoryFeatureState(state); this.state = structuredClone(state) }
}
