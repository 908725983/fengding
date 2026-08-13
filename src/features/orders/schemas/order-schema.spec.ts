import { describe,expect,it } from 'vitest'
import { orderBaseline } from '../../../../mock/handlers/order-handler'
import { assertOrderFeatureState, normalizeOrderQuery, OrderValidationError } from './order-schema'

describe('order schema',()=>{
  it('accepts the single baseline and all eight canonical states',()=>{expect(()=>assertOrderFeatureState(orderBaseline)).not.toThrow();expect(new Set(orderBaseline.orders.map((item)=>item.status)).size).toBe(8)})
  it('rejects broken money equation and invalid discount sign',()=>{const state=structuredClone(orderBaseline);state.orders[0]!.amounts.orderAmountCents+=1;expect(()=>assertOrderFeatureState(state)).toThrow(OrderValidationError);const other=structuredClone(orderBaseline);other.orders[0]!.amounts.productDiscountCents=1;other.orders[0]!.amounts.orderAmountCents+=1;expect(()=>assertOrderFeatureState(other)).toThrow(OrderValidationError)})
  it('normalizes pagination and rejects invalid ranges',()=>{expect(normalizeOrderQuery({keyword:' demo '})).toMatchObject({keyword:'demo',page:1,pageSize:30});expect(()=>normalizeOrderQuery({amountMinCents:100,amountMaxCents:99})).toThrow(OrderValidationError);expect(()=>normalizeOrderQuery({pageSize:20 as 30})).toThrow(OrderValidationError)})
})

