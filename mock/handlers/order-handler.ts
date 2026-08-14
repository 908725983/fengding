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
import { createOrderFulfillmentService } from '../../src/features/orders/services/order-fulfillment-service'
import { createOrderReturnService } from '../../src/features/orders/services/order-return-service'
import { InMemoryInventoryRepository } from '../../src/features/inventory/repositories/inventory-repository'
import { createInventoryService } from '../../src/features/inventory/services/inventory-service'
import { createPricingMockSession } from './pricing-handler'
import { createAuthorizationMockSession } from './authorization-handler'
import { createDistributionMockSession, distributionBaseline } from './distribution-handler'
import { createInventoryCatalogProvider } from './inventory-handler'
import { financeBaseline } from './finance-handler'
import { InMemoryFinanceRepository } from '../../src/features/finance/repositories/finance-repository'
import { createFinanceService } from '../../src/features/finance/services/finance-service'
import { createFinanceRefundService } from '../../src/features/finance/services/finance-refund-service'
import { createOrderReturnCoordinator } from '../../src/features/orders/services/order-return-coordinator'
import type { FinanceFeatureState } from '../../src/features/finance/types'

const featureData=baseline.featureData as Record<string,unknown>
function upgradeOrderReviewBaseline(source:OrderFeatureState):OrderFeatureState{
  const state=structuredClone(source)
  state.reviewRequests=[]
  state.outbounds=[];state.differences=[];state.shipments=[];state.receipts=[];state.receivables=[];state.fulfillmentRequests=[];state.nextOutboundSequenceByDate={};state.nextDifferenceSequenceByDate={}
  state.returns=[];state.returnRequests=[];state.nextReturnSequenceByDate={}
  state.orders.forEach((order)=>{order.reviewRound=1;order.reviewRecords=[];order.specialPrice??=false;order.specialPriceReason??=null;order.specialPriceEvidence??=[]})
  for(const id of ['order-009','order-010']){const order=state.orders.find((item)=>item.id===id);if(order){order.specialPrice=true;order.specialPriceReason='演示特价审批：客户专项价格申请（虚构数据）';order.specialPriceEvidence=[]}}
  for(const id of ['order-002','order-010']){const order=state.orders.find((item)=>item.id===id);if(order){const occurredAt=order.orderedAt;order.reviewRecords=[{id:`review-baseline-${id}`,round:1,stage:'order',outcome:'approved',actorSnapshot:{id:'sales-supervisor-demo',name:'演示销售主管',role:'sales-supervisor'},reason:null,fromStatus:'pending-order-review',toStatus:'pending-finance-review',specialPrice:order.specialPrice??false,releasedPrepaymentCents:0,occurredAt,requestId:`baseline-review-${id}`}];order.activityLogs.push({id:`activity-review-${id}`,action:'order.review-approved',actor:{id:'sales-supervisor-demo',name:'演示销售主管'},occurredAt,summary:'业务审核通过'})}}
  return state
}
export const orderBaseline=upgradeOrderReviewBaseline(structuredClone(featureData['ORD-001']) as OrderFeatureState)
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

export function createOrderMockSession(scenarioName:OrderScenarioName='normal',seedReturnData=false){
  const state=structuredClone(orderBaseline);if(scenarioName==='empty'){state.orders=[];state.printRequests=[];state.saveRequests=[];state.shares=[];state.returns=[];state.returnRequests=[];state.nextReturnSequenceByDate={}}
  const repository=new InMemoryOrderRepository(state);let sequence=1;let tokenSequence=1;let concurrentApplied=false
  // PRD-003 的基线在 10:00 结束“仅可见”覆盖；ORD-002 normal 从该边界后开始，保证存在一条真实可订黄金路径。
  const orderClock=scenarioName==='boundary'?'2026-08-10T09:59:00+08:00':'2026-08-10T10:00:00+08:00'
  const pricing=createPricingMockSession('normal');const authorization=createAuthorizationMockSession('normal');const distribution=createDistributionMockSession('normal')
  const partial=scenarioName==='partial-failure'
  const catalog=createOrderCatalogProvider(partial)
  const prices:OrderPriceProvider={resolvePrice:(customerId,skuId,unitId,quantity)=>{if(partial)throw new Error('原型模拟：价格服务不可用');const value=pricing.service.resolvePrice({role:'salesperson',actorId:'order-price-provider'},{customerId,skuId,unitId,quantity});return{unitPriceCents:value.unitPriceCents,source:value.source,sourceReferenceId:value.sourceReferenceId}}}
  const authorizations:OrderAuthorizationProvider={resolveAuthorization:(customerId,productId,at)=>{if(partial)throw new Error('原型模拟：授权服务不可用');const value=authorization.service.resolveAuthorization({role:'salesperson',actorId:'order-authorization-provider'},customerId,productId,at);return{orderable:value.orderable,reason:value.reason}}}
  const warehouses:OrderWarehouseProvider={listWarehouses:()=>{if(partial)throw new Error('原型模拟：仓库服务不可用');return structuredClone(inventoryBaseline.warehouses.map(({id,code,name,status,saleProhibited,type})=>({id,code,name,status,saleProhibited,type})))},getWarehouse:(id)=>{if(partial)throw new Error('原型模拟：仓库服务不可用');const item=inventoryBaseline.warehouses.find((entry)=>entry.id===id);return item?structuredClone({id:item.id,code:item.code,name:item.name,status:item.status,saleProhibited:item.saleProhibited,type:item.type}):null}}
  const staffValues=[{id:'admin-demo',name:'演示系统管理员'},{id:'sales-supervisor-demo',name:'演示销售主管'},{id:'salesperson-demo',name:'演示业务员'},{id:'warehouse-demo',name:'演示仓库员'},{id:'finance-demo',name:'演示财务员'},{id:'staff-demo-1',name:'演示业务员甲'},{id:'staff-demo-2',name:'演示业务员乙'}]
  const staff:OrderStaffProvider={listStaff:()=>structuredClone(staffValues),getStaff:(id)=>structuredClone(staffValues.find((item)=>item.id===id)??null)}
  const templates:OrderTemplateProvider={listTemplates:(customerId)=>{if(partial)throw new Error('原型模拟：模板服务不可用');return distributionBaseline.templates.filter((item)=>item.status==='enabled'&&(item.scope.type==='all'||item.scope.customerIds.includes(customerId))).map((item)=>({id:item.id,name:item.name}))},loadTemplate:(templateId,customerId,at)=>{if(partial)throw new Error('原型模拟：模板服务不可用');const value=distribution.service.loadTemplate({role:'sales-supervisor',actorId:'order-template-provider'},templateId,customerId,'assisted-order',at);return{accepted:value.accepted.map((item)=>({skuId:item.skuId,quantity:item.quantity,unitId:item.unitId,sourceKey:item.sourceKey})),rejected:value.rejected.map((item)=>({skuId:item.skuId,message:item.message}))}}}
  const service=createOrderService({repository,customers:createOrderCustomerProvider(partial),finance:createDeterministicOrderFinanceProvider(partial),catalog,prices,authorizations,warehouses,staff,templates,now:()=>orderClock,nextId:(kind)=>`${kind}-runtime-${sequence++}`,nextToken:()=>{const seed=hashOrderShareToken(`fengding-order-share-secret:${tokenSequence++}`);return`ord_share_${seed.slice(6)}_8f3c1d72a9b4e6f0`},hashToken:hashOrderShareToken,shareBaseUrl:'http://127.0.0.1:4173'})
  const inventoryRepository=new InMemoryInventoryRepository(structuredClone(inventoryBaseline));let inventorySequence=1
  const inventory=createInventoryService({repository:inventoryRepository,catalog:createInventoryCatalogProvider(false),now:()=>orderClock,nextId:(kind)=>`${kind}-order-runtime-${inventorySequence++}`})
  const financeRepository=new InMemoryFinanceRepository(structuredClone(financeBaseline));let financeSequence=1
  const financeService=createFinanceService({repository:financeRepository,now:()=>orderClock,nextId:(kind)=>`${kind}-order-finance-${financeSequence++}`,actorName:(actor)=>staff.getStaff(actor.actorId)?.name??actor.actorId})
  const financeRefunds=createFinanceRefundService({repository:financeRepository,now:()=>orderClock,nextId:(kind)=>`${kind}-order-refund-${financeSequence++}`,actorName:(actor)=>staff.getStaff(actor.actorId)?.name??actor.actorId})
  let seeding=true
  const financeReceivables={checkpoint:()=>financeRepository.read(),rollback:(checkpoint:unknown)=>financeRepository.reset(checkpoint as FinanceFeatureState),createFromShipment:({order,occurredAt,requestId,actor,actorName}:Parameters<NonNullable<Parameters<typeof createOrderFulfillmentService>[0]['financeReceivables']>['createFromShipment']>[0])=>{const existing=financeService.getOrderSettlement(order.id);if(existing){const value=existing.receivable;return{id:value.id,orderId:value.orderId,orderNo:value.orderNo,customerSnapshot:{id:value.customerSnapshot.id,code:value.customerSnapshot.code,name:value.customerSnapshot.name,categoryId:order.customerSnapshot.categoryId},amountCents:value.amountCents,occurredAt:value.occurredAt,requestId:value.requestId,source:'order-shipment' as const,status:value.status,receivedCents:value.receivedCents,outstandingCents:value.outstandingCents,receiptCount:existing.receipts.length,writeoffCount:existing.writeoffs.length}}const value=financeService.createOrderReceivable({requestId,orderId:order.id,orderNo:order.orderNo,customerSnapshot:{id:order.customerSnapshot.id,code:order.customerSnapshot.code,name:order.customerSnapshot.name,contactName:order.shippingSnapshot.recipient,phone:order.shippingSnapshot.phone},items:order.lines.map((line)=>({orderLineId:line.id,skuId:line.skuId,skuCode:line.skuCodeSnapshot,productName:line.productNameSnapshot,specification:line.specificationSnapshot,unitName:line.unitSnapshot.name,quantityMilli:line.quantityMilli,unitPriceCents:line.dealUnitPriceCents,subtotalCents:line.subtotalCents})),goodsAmountCents:order.amounts.orderAmountCents-order.amounts.freightCents,freightCents:order.amounts.freightCents,amountCents:order.amounts.orderAmountCents,settlementMethod:order.settlementSnapshot.method,paymentTermDays:order.settlementSnapshot.creditTermDays,occurredAt,operator:{id:actor.actorId,name:actorName,role:actor.role}});return{id:value.id,orderId:value.orderId,orderNo:value.orderNo,customerSnapshot:structuredClone(order.customerSnapshot),amountCents:value.amountCents,occurredAt:value.occurredAt,requestId:value.requestId,source:'order-shipment' as const,status:'open' as const,receivedCents:0,outstandingCents:value.amountCents,receiptCount:0,writeoffCount:0}},getByOrder:(orderId:string)=>{const settlement=financeService.getOrderSettlement(orderId);if(!settlement)return null;const value=settlement.receivable;const order=repository.read().orders.find((item)=>item.id===orderId);return{id:value.id,orderId:value.orderId,orderNo:value.orderNo,customerSnapshot:order?structuredClone(order.customerSnapshot):{id:value.customerSnapshot.id,code:value.customerSnapshot.code,name:value.customerSnapshot.name,categoryId:'unknown'},amountCents:value.amountCents,occurredAt:value.occurredAt,requestId:value.requestId,source:'order-shipment' as const,status:value.status,receivedCents:value.receivedCents,outstandingCents:value.outstandingCents,receiptCount:settlement.receipts.length,writeoffCount:settlement.writeoffs.length}}}
  const financeReceivablesWithRefund={...financeReceivables,createShortShipmentCredit:({difference,order,occurredAt,requestId,actor,actorName}:Parameters<NonNullable<Parameters<typeof createOrderFulfillmentService>[0]['financeReceivables']>['createShortShipmentCredit']>[0])=>{financeRefunds.createReturnCredit({requestId,sourceType:'short-shipment-refund',sourceId:difference.id,sourceNo:difference.differenceNo,orderId:order.id,amountCents:difference.differenceAmountCents,refundPreference:'original',occurredAt,operator:{id:actor.actorId,name:actorName,role:actor.role}})}}
  const fulfillment=createOrderFulfillmentService({repository,inventoryRepository,inventory,staff,now:()=>orderClock,nextId:(kind)=>`${kind}-runtime-${sequence++}`,inventoryGate:()=>seeding?'available':scenarioName==='partial-failure'?'unavailable':scenarioName==='boundary'?'locked':'available',financeGate:()=>seeding?'available':scenarioName==='partial-failure'?'unavailable':'available',financeReceivables:financeReceivablesWithRefund})
  if(scenarioName!=='empty')seedFulfillmentBaseline(repository,fulfillment)
  const returns=createOrderReturnService({repository,now:()=>orderClock,nextId:(kind)=>`${kind}-runtime-${sequence++}`,actorName:(actor)=>staff.getStaff(actor.actorId)?.name??actor.actorId,getWarehouse:(id)=>{const value=inventoryRepository.read().warehouses.find((item)=>item.id===id);return value?{id:value.id,code:value.code,name:value.name,status:value.status}:null}})
  const returnCoordinator=createOrderReturnCoordinator({orderRepository:repository,inventoryRepository,financeRepository,inventory,financeRefunds,now:()=>orderClock,nextId:(kind)=>`${kind}-runtime-${sequence++}`,actorName:(actor)=>staff.getStaff(actor.actorId)?.name??actor.actorId,inventoryGate:()=>seeding?'available':scenarioName==='partial-failure'?'unavailable':'available',financeGate:()=>seeding?'available':scenarioName==='partial-failure'?'unavailable':'available'})
  if(seedReturnData&&scenarioName!=='empty')seedReturnBaseline(repository,inventoryRepository,returns,returnCoordinator,financeRefunds)
  seeding=false
  const definition=scenarios[scenarioName]
  async function run<T>(operation:()=>T):Promise<T>{await new Promise((resolve)=>setTimeout(resolve,definition.latencyMs));if(scenarioName==='error')throw new OrderMockError('MOCK_INTERNAL_ERROR','原型模拟：订单服务暂时不可用');if(scenarioName==='permission-denied')throw new OrderMockError('PERMISSION_DENIED','原型模拟：当前会话没有订单查看权限');return operation()}
  function simulateConcurrentEdit(orderId:string):void{if(scenarioName!=='concurrent'||concurrentApplied)return;repository.transact((current)=>{const order=current.orders.find((item)=>item.id===orderId);if(order)order.updatedAt='2026-08-10T10:01:00+08:00'});concurrentApplied=true}
  return{scenarioName,repository,inventoryRepository,financeRepository,financeService,financeRefunds,service,fulfillment,returns,returnCoordinator,run,simulateConcurrentEdit}
}

function seedReturnBaseline(repository:InMemoryOrderRepository,inventoryRepository:InMemoryInventoryRepository,returns:ReturnType<typeof createOrderReturnService>,coordinator:ReturnType<typeof createOrderReturnCoordinator>,financeRefunds:ReturnType<typeof createFinanceRefundService>):void{
  const admin={role:'super-admin' as const,actorId:'admin-demo'},supervisor={role:'sales-supervisor' as const,actorId:'sales-supervisor-demo'},warehouse={role:'warehouse' as const,actorId:'warehouse-demo'},finance={role:'finance' as const,actorId:'finance-demo'}
  const line=returns.getReturnableLines(admin,'order-006')[0]!;const quantity=Math.max(1,Math.floor(line.returnableQuantityMilli/10));let index=1
  const create=(label:string)=>returns.saveReturn(admin,{requestId:`baseline-return-create-${index++}`,draft:{orderId:'order-006',warehouseId:'warehouse-main',returnType:'partial',refundPreference:'original',reason:`虚构退货场景：${label}`,remark:'ORD-005 可重置演示数据',priceAdjustmentReason:null,lines:[{orderLineId:line.line.id,returnQuantityMilli:quantity}]}})
  create('待审核')
  let value=create('审核退回');returns.reviewReturn(supervisor,{requestId:'baseline-return-rejected',returnId:value.id,expectedVersion:value.version,action:'return',reason:'虚构审核意见：请补充包装照片'})
  value=create('待入库');returns.reviewReturn(supervisor,{requestId:'baseline-return-approved',returnId:value.id,expectedVersion:value.version,action:'approve'})
  value=create('已完成');value=returns.reviewReturn(supervisor,{requestId:'baseline-return-complete-approved',returnId:value.id,expectedVersion:value.version,action:'approve'});const location=inventoryRepository.read().locations.find((item)=>item.warehouseId==='warehouse-main'&&item.status==='enabled')!;value=coordinator.confirmInbound(warehouse,{requestId:'baseline-return-complete-inbound',returnId:value.id,expectedVersion:value.version,locationId:location.id});const completedRefund=financeRefunds.getSourceResult('customer-return',value.id)?.refunds[0];if(completedRefund){financeRefunds.confirmRefund(finance,{requestId:'baseline-return-complete-refund',refundId:completedRefund.id,expectedVersion:completedRefund.version,method:'original',occurredAt:'2026-08-10T10:00:00+08:00'});coordinator.refreshRefundProjection(value.id)}
  value=create('已取消');returns.cancelReturn(admin,{requestId:'baseline-return-cancelled',returnId:value.id,expectedVersion:value.version,reason:'虚构场景：客户撤销申请'})
  value=create('待退款');value=returns.reviewReturn(supervisor,{requestId:'baseline-return-refund-approved',returnId:value.id,expectedVersion:value.version,action:'approve'});coordinator.confirmInbound(warehouse,{requestId:'baseline-return-refund-inbound',returnId:value.id,expectedVersion:value.version,locationId:location.id})
  void repository
}

function seedFulfillmentBaseline(repository:InMemoryOrderRepository,fulfillment:ReturnType<typeof createOrderFulfillmentService>):void{
  const actor={role:'super-admin' as const,actorId:'admin-demo'}
  const reset=(id:string)=>repository.transact((state)=>{const order=state.orders.find((item)=>item.id===id);if(order){order.status='approved';order.updatedAt='2026-08-10T10:00:00+08:00';order.fulfillmentProjection={outboundPrintCount:0,logisticsCodes:[],hasDifference:false}}})
  for(const id of ['order-004','order-005','order-006','order-007','order-011','order-019'])reset(id)
  const runOutbound=(id:string,quantity:number,requestId:string,finishShort=false)=>{const order=repository.read().orders.find((item)=>item.id===id)!;return fulfillment.confirmOutbound(actor,{requestId,orderId:id,expectedUpdatedAt:order.updatedAt,warehouseId:'warehouse-main',lines:quantity>0?[{orderLineId:order.lines[0]!.id,quantity}]:[],finishShort,reason:finishShort?'演示短装：剩余库存待确认（虚构数据）':null})}
  runOutbound('order-004',1,'baseline-fulfillment-order-004')
  runOutbound('order-005',3,'baseline-fulfillment-order-005')
  runOutbound('order-006',1,'baseline-fulfillment-order-006');let order=repository.read().orders.find((item)=>item.id==='order-006')!;fulfillment.confirmShipment(actor,{requestId:'baseline-shipment-order-006',orderId:order.id,expectedUpdatedAt:order.updatedAt,logisticsCode:'MOCK-SF-20260810006'})
  runOutbound('order-007',2,'baseline-fulfillment-order-007');order=repository.read().orders.find((item)=>item.id==='order-007')!;fulfillment.confirmShipment(actor,{requestId:'baseline-shipment-order-007',orderId:order.id,expectedUpdatedAt:order.updatedAt,logisticsCode:'MOCK-SF-20260810007'});order=repository.read().orders.find((item)=>item.id==='order-007')!;fulfillment.confirmReceipt(actor,{requestId:'baseline-receipt-order-007',orderId:order.id,expectedUpdatedAt:order.updatedAt,signedAt:'2026-08-10T10:00:00+08:00',signer:'演示签收人'})
  runOutbound('order-011',1,'baseline-difference-order-011',true)
  const voided=runOutbound('order-019',2,'baseline-outbound-order-019').outbound!;order=repository.read().orders.find((item)=>item.id==='order-019')!;fulfillment.voidOutbound(actor,{requestId:'baseline-void-order-019',outboundId:voided.id,expectedOrderUpdatedAt:order.updatedAt,reason:'演示作废：复核后重新备货'})
}
