import { describe,expect,it } from 'vitest'
import { orderBaseline } from '../../../../mock/handlers/order-handler'
import { InMemoryOrderRepository } from './order-repository'

describe('order repository',()=>{
  it('isolates reads and commits valid transactions',()=>{const repository=new InMemoryOrderRepository(orderBaseline);const read=repository.read();read.orders[0]!.customerSnapshot.name='被篡改';expect(repository.read().orders[0]!.customerSnapshot.name).not.toBe('被篡改');repository.transact((draft)=>{draft.orders[0]!.remark='事务更新'});expect(repository.read().orders[0]!.remark).toBe('事务更新')})
  it('rolls back invalid transactions',()=>{const repository=new InMemoryOrderRepository(orderBaseline);const before=repository.read();expect(()=>repository.transact((draft)=>{draft.orders[0]!.amounts.orderAmountCents=-1})).toThrow();expect(repository.read()).toEqual(before)})
})

