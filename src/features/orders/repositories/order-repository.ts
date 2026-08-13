import { assertOrderFeatureState } from '../schemas/order-schema'
import type { OrderFeatureState } from '../types'

export interface OrderRepository { read(): OrderFeatureState; transact<T>(mutation:(draft:OrderFeatureState)=>T):T; reset(state:OrderFeatureState):void }
export class InMemoryOrderRepository implements OrderRepository {
  private state: OrderFeatureState
  constructor(initialState:OrderFeatureState){assertOrderFeatureState(initialState);this.state=structuredClone(initialState)}
  read():OrderFeatureState{return structuredClone(this.state)}
  transact<T>(mutation:(draft:OrderFeatureState)=>T):T{const draft=structuredClone(this.state);const result=mutation(draft);assertOrderFeatureState(draft);this.state=draft;return structuredClone(result)}
  reset(state:OrderFeatureState):void{assertOrderFeatureState(state);this.state=structuredClone(state)}
}

