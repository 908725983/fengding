import baseline from '../fixtures/baseline.json'
import emptyScenario from '../scenarios/empty.json'
import errorScenario from '../scenarios/error.json'
import normalScenario from '../scenarios/normal.json'
import permissionScenario from '../scenarios/permission-denied.json'
import slowScenario from '../scenarios/slow.json'
import type { CustomerFeatureState } from '../../src/features/customers/types'
import type { ProductFeatureState } from '../../src/features/products/types'
import type { InventoryFeatureState } from '../../src/features/inventory/types'
import type {
  OrderAuthorizationProvider, OrderCatalogProvider, OrderCustomerProvider, OrderFeatureState, OrderFinanceProvider,
  OrderPriceProvider, OrderSkuOption, OrderStaffProvider, OrderTemplateProvider, OrderWarehouseProvider,
} from '../../src/features/orders/types'
import { InMemoryOrderRepository } from '../../src/features/orders/repositories/order-repository'
import { createOrderService } from '../../src/features/orders/services/order-service'
import { createPricingMockSession } from './pricing-handler'
import { createAuthorizationMockSession } from './authorization-handler'
import { createDistributionMockSession, distributionBaseline } from './distribution-handler'

const featureData=baseline.featureData as Record<string,unknown>
export const orderBaseline=structuredClone(featureData['ORD-001']) as OrderFeatureState
const customerBaseline=structuredClone(featureData['CUS-001']) as CustomerFeatureState
const productBaseline=structuredClone(featureData['PRD-001']) as ProductFeatureState
const inventoryBaseline=structuredClone(featureData['INV-001']) as InventoryFeatureState

export function createOrderCustomerProvider(partialFailure=false):OrderCustomerProvider{
  const fail=()=>{if(partialFailure)throw new Error('原型模拟：客户服务不可用')}
  const descendants=(id:string):string[]=>customerBaseline.categories.filter((item)=>item.parentId===id).flatMap((item)=>[item.id,...descendants(item.id)])
  const records=customerBaseline.customers.map((item)=>{const category=customerBaseline.categories.find((entry)=>entry.id===item.categoryId);return{id:item.id,code:item.code,name:item.name,status:item.status,categoryId:item.categoryId,categoryDiscountPercent:category?.discountRatePercent??100,minimumOrderAmountCents:category?.minimumOrderAmountCents??null,salespersonId:item.salespersonId,settlementMethod:item.settlementMethod,paymentTermDays:item.paymentTermDays,creditLimitCents:item.creditLimitCents,recipient:item.primaryContactName,phone:item.primaryPhone,province:item.provinceCode,city:item.cityCode,district:item.districtCode,address:item.address,invoiceTitle:item.invoiceTitle}})
  return{categoryDescendants:(id)=>{fail();return descendants(id)},getCreditLimitCents:(id)=>{fail();return customerBaseline.customers.find((item)=>item.id===id)?.creditLimitCents??null},listOrderCustomers:()=>{fail();return structuredClone(records)},getOrderCustomer:(id)=>{fail();return structuredClone(records.find((item)=>item.id===id)??null)}}
}
export function createDeterministicOrderFinanceProvider(partialFailure=false):OrderFinanceProvider{const summaries:Record<string,{receivablesCents:number;prepaymentBalanceCents:number}>={'customer-1':{receivablesCents:50000,prepaymentBalanceCents:100000},'customer-2':{receivablesCents:0,prepaymentBalanceCents:0}};return{getCustomerSummary:(id)=>{if(partialFailure)throw new Error('原型模拟：资金服务不可用');return structuredClone(summaries[id]??null)}}}
export function createUnavailableOrderFinanceProvider(partialFailure=false):OrderFinanceProvider{return{getCustomerSummary:()=>{if(partialFailure)throw new Error('原型模拟：资金服务不可用');return null}}}

export function createOrderCatalogProvider(partialFailure=false):OrderCatalogProvider{
  const units=new Map(productBaseline.units.map((item)=>[item.id,item]))
  function list():OrderSkuOption[]{if(partialFailure)throw new Error('原型模拟：商品资料服务不可用');return productBaseline.products.flatMap((product)=>product.skus.map((sku)=>{const rates=new Map<string,number>([[product.baseUnitId,1]]);Object.values(product.sceneUnits).forEach((item)=>rates.set(item.unitId,item.conversionRate));return{skuId:sku.id,spuId:product.id,productCode:product.code,productName:product.name,skuCode:sku.code,barcode:sku.barcode,specification:`${sku.specificationName}：${sku.specificationValue}`,image:sku.mainImage?.id??null,productStatus:product.status,deleted:product.deletedAt!==null,baseUnitId:product.baseUnitId,units:[...rates].map(([unitId,rate])=>({id:unitId,code:units.get(unitId)?.code??unitId,name:units.get(unitId)?.name??unitId,conversionRateMilli:Math.round(rate*1000),minimumSalePriceCents:sku.minimumSalePriceCents===null?null:Math.round(sku.minimumSalePriceCents*rate),maximumSalePriceCents:sku.maximumSalePriceCents===null?null:Math.round(sku.maximumSalePriceCents*rate)})),minimumOrderQuantityMilli:product.minimumOrderQuantity===null?null:Math.round(product.minimumOrderQuantity*1000),orderMultipleMilli:Math.round(product.orderMultiple*1000),weightPerBaseUnitGrams:product.weightKg===null?null:Math.round(product.weightKg*1000)}}))}
  return{listSkus:()=>structuredClone(list()),getSku:(id)=>structuredClone(list().find((item)=>item.skuId===id)??null)}
}
export function hashOrderShareToken(token:string):string{let value=2166136261;for(let index=0;index<token.length;index+=1){value^=token.charCodeAt(index);value=Math.imul(value,16777619)}return`fnv1a-${(value>>>0).toString(16).padStart(8,'0')}`}
export function createBaselineOrderRepository():InMemoryOrderRepository{return new InMemoryOrderRepository(orderBaseline)}
export type OrderScenarioName='normal'|'empty'|'error'|'slow'|'permission-denied'|'partial-failure'|'boundary'|'concurrent'
const scenarios={normal:normalScenario,empty:emptyScenario,error:errorScenario,slow:slowScenario,'permission-denied':permissionScenario,'partial-failure':normalScenario,boundary:normalScenario,concurrent:normalScenario} as const
export class OrderMockError extends Error{constructor(readonly code:string,message:string){super(message);this.name='OrderMockError'}}

export function createOrderMockSession(scenarioName:OrderScenarioName='normal'){
  const state=structuredClone(orderBaseline);if(scenarioName==='empty'){state.orders=[];state.printRequests=[];state.saveRequests=[];state.shares=[]}
  const repository=new InMemoryOrderRepository(state);let sequence=1;let tokenSequence=1;let concurrentApplied=false
  // PRD-003 的基线在 10:00 结束“仅可见”覆盖；ORD-002 normal 从该边界后开始，保证存在一条真实可订黄金路径。
  const orderClock=scenarioName==='boundary'?'2026-08-10T09:59:00+08:00':'2026-08-10T10:00:00+08:00'
  const pricing=createPricingMockSession('normal');const authorization=createAuthorizationMockSession('normal');const distribution=createDistributionMockSession('normal')
  const partial=scenarioName==='partial-failure'
  const catalog=createOrderCatalogProvider(partial)
  const prices:OrderPriceProvider={resolvePrice:(customerId,skuId,unitId,quantity)=>{if(partial)throw new Error('原型模拟：价格服务不可用');const value=pricing.service.resolvePrice({role:'salesperson',actorId:'order-price-provider'},{customerId,skuId,unitId,quantity});return{unitPriceCents:value.unitPriceCents,source:value.source,sourceReferenceId:value.sourceReferenceId}}}
  const authorizations:OrderAuthorizationProvider={resolveAuthorization:(customerId,productId,at)=>{if(partial)throw new Error('原型模拟：授权服务不可用');const value=authorization.service.resolveAuthorization({role:'salesperson',actorId:'order-authorization-provider'},customerId,productId,at);return{orderable:value.orderable,reason:value.reason}}}
  const warehouses:OrderWarehouseProvider={listWarehouses:()=>{if(partial)throw new Error('原型模拟：仓库服务不可用');return structuredClone(inventoryBaseline.warehouses.map(({id,code,name,status,saleProhibited,type})=>({id,code,name,status,saleProhibited,type})))},getWarehouse:(id)=>{if(partial)throw new Error('原型模拟：仓库服务不可用');const item=inventoryBaseline.warehouses.find((entry)=>entry.id===id);return item?structuredClone({id:item.id,code:item.code,name:item.name,status:item.status,saleProhibited:item.saleProhibited,type:item.type}):null}}
  const staffValues=[{id:'admin-demo',name:'演示系统管理员'},{id:'sales-supervisor-demo',name:'演示销售主管'},{id:'salesperson-demo',name:'演示业务员'},{id:'staff-demo-1',name:'演示业务员甲'},{id:'staff-demo-2',name:'演示业务员乙'}]
  const staff:OrderStaffProvider={listStaff:()=>structuredClone(staffValues),getStaff:(id)=>structuredClone(staffValues.find((item)=>item.id===id)??null)}
  const templates:OrderTemplateProvider={listTemplates:(customerId)=>{if(partial)throw new Error('原型模拟：模板服务不可用');return distributionBaseline.templates.filter((item)=>item.status==='enabled'&&(item.scope.type==='all'||item.scope.customerIds.includes(customerId))).map((item)=>({id:item.id,name:item.name}))},loadTemplate:(templateId,customerId,at)=>{if(partial)throw new Error('原型模拟：模板服务不可用');const value=distribution.service.loadTemplate({role:'sales-supervisor',actorId:'order-template-provider'},templateId,customerId,'assisted-order',at);return{accepted:value.accepted.map((item)=>({skuId:item.skuId,quantity:item.quantity,unitId:item.unitId,sourceKey:item.sourceKey})),rejected:value.rejected.map((item)=>({skuId:item.skuId,message:item.message}))}}}
  const service=createOrderService({repository,customers:createOrderCustomerProvider(partial),finance:createDeterministicOrderFinanceProvider(partial),catalog,prices,authorizations,warehouses,staff,templates,now:()=>orderClock,nextId:(kind)=>`${kind}-runtime-${sequence++}`,nextToken:()=>{const seed=hashOrderShareToken(`fengding-order-share-secret:${tokenSequence++}`);return`ord_share_${seed.slice(6)}_8f3c1d72a9b4e6f0`},hashToken:hashOrderShareToken,shareBaseUrl:'http://127.0.0.1:4173'})
  const definition=scenarios[scenarioName]
  async function run<T>(operation:()=>T):Promise<T>{await new Promise((resolve)=>setTimeout(resolve,definition.latencyMs));if(scenarioName==='error')throw new OrderMockError('MOCK_INTERNAL_ERROR','原型模拟：订单服务暂时不可用');if(scenarioName==='permission-denied')throw new OrderMockError('PERMISSION_DENIED','原型模拟：当前会话没有订单查看权限');return operation()}
  function simulateConcurrentEdit(orderId:string):void{if(scenarioName!=='concurrent'||concurrentApplied)return;repository.transact((current)=>{const order=current.orders.find((item)=>item.id===orderId);if(order)order.updatedAt='2026-08-10T10:01:00+08:00'});concurrentApplied=true}
  return{scenarioName,repository,service,run,simulateConcurrentEdit}
}
