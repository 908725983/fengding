import { createPinia,setActivePinia } from 'pinia'
import { beforeEach,describe,expect,it } from 'vitest'
import { useOrderStore } from './order-store'
describe('order store',()=>{beforeEach(()=>setActivePinia(createPinia()));it('loads normal and empty states',async()=>{const store=useOrderStore();await store.load();expect(store.result.total).toBe(32);await store.setScenario('empty');expect(store.isEmpty).toBe(true)});it('keeps provider partial failure local to detail',async()=>{const store=useOrderStore();await store.setScenario('partial-failure');expect(store.result.total).toBe(32);await store.loadDetail('order-001');expect(store.detail?.financials.creditLimitCents.state).toBe('error')});it('does not expose output to warehouse or finance',async()=>{const store=useOrderStore();await store.setRole('warehouse');expect(store.canOutput).toBe(false);expect(store.result.items[0]?.order.amounts.orderAmountCents).toBeNull()})})

