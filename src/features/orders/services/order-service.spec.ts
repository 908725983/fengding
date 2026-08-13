import { describe,expect,it } from 'vitest'
import { createOrderCustomerProvider, createUnavailableOrderFinanceProvider, orderBaseline } from '../../../../mock/handlers/order-handler'
import { InMemoryOrderRepository } from '../repositories/order-repository'
import type { OrderActor } from '../types'
import { createOrderService } from './order-service'

const admin:OrderActor={role:'super-admin',actorId:'admin-test'};const warehouse:OrderActor={role:'warehouse',actorId:'warehouse-test'};const finance:OrderActor={role:'finance',actorId:'finance-test'}
function setup(partial=false){const repository=new InMemoryOrderRepository(orderBaseline);let id=1;const service=createOrderService({repository,customers:createOrderCustomerProvider(partial),finance:createUnavailableOrderFinanceProvider(partial),now:()=> '2026-08-10T09:00:00+08:00',nextId:(kind)=>`${kind}-test-${id++}`});return{repository,service}}

describe('order queries',()=>{
  it('paginates 30 rows with stable newest-first ordering',()=>{const {service}=setup();const page=service.listOrders(admin);expect(page.total).toBe(32);expect(page.items).toHaveLength(30);expect(page.items[0]!.order.id).toBe('order-032');expect(page.items[29]!.order.id).toBe('order-003');expect(service.listOrders(admin,{page:2}).items.map((item)=>item.order.id)).toEqual(['order-002','order-001'])})
  it('combines filters and includes category descendants',()=>{const {service}=setup();expect(service.listOrders(admin,{customerCategoryId:'category-retail'}).total).toBe(32);expect(service.listOrders(admin,{statuses:['approved'],keyword:'CUS-000002'}).items.every((item)=>item.order.status==='approved'&&item.order.customerSnapshot.code==='CUS-000002')).toBe(true);expect(service.listOrders(admin,{amountMinCents:3700,amountMaxCents:3800}).total).toBeGreaterThan(0)})
  it('treats orderedTo as exclusive',()=>{const {service}=setup();const result=service.listOrders(admin,{orderedFrom:'2026-08-10T00:00:00+08:00',orderedTo:'2026-08-11T00:00:00+08:00'});expect(result.items.map((item)=>item.order.id)).toEqual(['order-032'])})
})

describe('order permissions and providers',()=>{
  it('masks finance and warehouse at service boundary',()=>{const {service}=setup();const warehouseOrder=service.listOrders(warehouse).items[0]!.order;expect(warehouseOrder.amounts.orderAmountCents).toBeNull();expect(warehouseOrder.lines[0]!.dealUnitPriceCents).toBeNull();const financeOrder=service.listOrders(finance).items[0]!.order;expect(financeOrder.shippingSnapshot.phone).toBeNull();expect(financeOrder.shippingSnapshot.address).toBeNull();expect(()=>service.exportOrdersCsv(warehouse)).toThrowError(expect.objectContaining({code:'PERMISSION_DENIED'}))})
  it('keeps unavailable and provider error distinct from zero',()=>{const normal=setup().service.getOrderDetail(admin,'order-001');expect(normal.financials.creditLimitCents).toMatchObject({state:'available',value:200000});expect(normal.financials.receivablesCents).toMatchObject({state:'unavailable',value:null});expect(normal.inventoryRecommendation).toMatchObject({state:'unavailable',value:null});const partial=setup(true).service.getOrderDetail(admin,'order-001');expect(partial.financials.creditLimitCents.state).toBe('error');expect(partial.financials.receivablesCents.state).toBe('error')})
})

describe('order outputs',()=>{
  it('exports selected rows before filtered results',()=>{const {service}=setup();const csv=service.exportOrdersCsv(admin,{},['order-001']);expect(csv).toContain('CA000000-260710-60001');expect(csv).not.toContain('CA000000-260711-60002');expect(csv).toContain('000-1000-0001')})
  it('prints atomically and idempotently by request id',()=>{const {service,repository}=setup();const before=repository.read().orders.find((item)=>item.id==='order-001')!.orderPrintCount;service.printOrders(admin,['order-001','order-002'],'print-1');expect(repository.read().orders.find((item)=>item.id==='order-001')!.orderPrintCount).toBe(before+1);const after=repository.read();service.printOrders(admin,['order-001','order-002'],'print-1');expect(repository.read()).toEqual(after)})
  it('does not partially print if one order is missing',()=>{const {service,repository}=setup();const before=repository.read();expect(()=>service.printOrders(admin,['order-001','missing'],'print-bad')).toThrowError(expect.objectContaining({code:'NOT_FOUND'}));expect(repository.read()).toEqual(before)})
})
