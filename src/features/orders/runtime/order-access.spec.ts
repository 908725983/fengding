import { beforeEach,describe,expect,it } from 'vitest'
import { guardOrderSubroute,setCurrentOrderRole } from './order-access'
describe('order route access',()=>{beforeEach(()=>setCurrentOrderRole('super-admin'));it('allows all five documented order roles',()=>{for(const role of ['super-admin','sales-supervisor','salesperson','warehouse','finance'] as const){setCurrentOrderRole(role);expect(guardOrderSubroute('/orders')).toBe(true)}});it('ignores other route trees',()=>expect(guardOrderSubroute('/products')).toBe(true))})

