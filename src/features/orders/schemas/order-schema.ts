import type { CustomerOrder, OrderFeatureState, OrderQuery } from '../types'

export interface OrderValidationIssue { path: string; message: string }
export class OrderValidationError extends Error {
  readonly code = 'ORDER_VALIDATION_FAILED'
  constructor(readonly issues: OrderValidationIssue[]) { super(issues.map((item) => `${item.path}: ${item.message}`).join('；')); this.name = 'OrderValidationError' }
}

const statuses = new Set(['pending-order-review', 'pending-finance-review', 'approved', 'outbound-in-progress', 'outbound', 'shipped', 'completed', 'canceled'])
const settlementMethods = new Set(['cash', 'monthly', 'terms'])
const iso = (value: string) => Number.isFinite(Date.parse(value))
function required(issues: OrderValidationIssue[], path: string, value: string, max = 200): void { const clean=value.trim(); if(!clean) issues.push({path,message:'不能为空'}); else if(clean.length>max) issues.push({path,message:`不能超过 ${max} 个字符`}) }
function nonnegative(issues: OrderValidationIssue[], path: string, value: number): void { if(!Number.isSafeInteger(value)||value<0) issues.push({path,message:'必须是非负安全整数'}) }

export function validateOrder(order: CustomerOrder): OrderValidationIssue[] {
  const issues: OrderValidationIssue[]=[]
  required(issues,'id',order.id,100); required(issues,'enterpriseId',order.enterpriseId,100); required(issues,'orderNo',order.orderNo,80)
  if(!statuses.has(order.status)) issues.push({path:'status',message:'不是规范订单状态'})
  ;['orderedAt','requestedDeliveryAt','createdAt','updatedAt'].forEach((field)=>{ if(!iso(order[field as keyof CustomerOrder] as string)) issues.push({path:field,message:'必须是 ISO 时间'}) })
  required(issues,'customerSnapshot.id',order.customerSnapshot.id,100); required(issues,'customerSnapshot.code',order.customerSnapshot.code,80); required(issues,'customerSnapshot.name',order.customerSnapshot.name,100)
  required(issues,'settlementCustomerSnapshot.id',order.settlementCustomerSnapshot.id,100); if(!settlementMethods.has(order.settlementSnapshot.method)) issues.push({path:'settlementSnapshot.method',message:'结算方式无效'})
  if(order.settlementSnapshot.method==='terms' && (!Number.isSafeInteger(order.settlementSnapshot.creditTermDays)||order.settlementSnapshot.creditTermDays!<0)) issues.push({path:'settlementSnapshot.creditTermDays',message:'账期结算必须有非负整数天数'})
  if(order.settlementSnapshot.method!=='terms' && order.settlementSnapshot.creditTermDays!==null) issues.push({path:'settlementSnapshot.creditTermDays',message:'非账期结算必须为空'})
  required(issues,'shippingSnapshot.recipient',order.shippingSnapshot.recipient,80); required(issues,'shippingSnapshot.phone',order.shippingSnapshot.phone,40); required(issues,'shippingSnapshot.address',order.shippingSnapshot.address,200)
  const amounts=order.amounts; Object.entries(amounts).forEach(([key,value])=>{ if(!Number.isSafeInteger(value)) issues.push({path:`amounts.${key}`,message:'必须是安全整数分'}) })
  if(amounts.originalAmountCents<0||amounts.productDiscountCents>0||amounts.orderDiscountCents>0||amounts.freightCents<0||amounts.orderAmountCents<0) issues.push({path:'amounts',message:'原价/运费/总额须非负且优惠须为0或负数'})
  if(amounts.orderAmountCents!==amounts.originalAmountCents+amounts.productDiscountCents+amounts.orderDiscountCents+amounts.freightCents) issues.push({path:'amounts.orderAmountCents',message:'金额汇总等式不成立'})
  nonnegative(issues,'orderPrintCount',order.orderPrintCount)
  if(order.fulfillmentProjection.outboundPrintCount!==null) nonnegative(issues,'fulfillmentProjection.outboundPrintCount',order.fulfillmentProjection.outboundPrintCount)
  const lineIds=new Set<string>(); const sequences=new Set<number>()
  order.lines.forEach((line,index)=>{ const base=`lines.${index}`; if(lineIds.has(line.id)) issues.push({path:`${base}.id`,message:'行ID重复'}); lineIds.add(line.id); if(sequences.has(line.sequence)||!Number.isSafeInteger(line.sequence)||line.sequence<1) issues.push({path:`${base}.sequence`,message:'序号必须为不重复正整数'}); sequences.add(line.sequence); required(issues,`${base}.skuId`,line.skuId,100); required(issues,`${base}.skuCodeSnapshot`,line.skuCodeSnapshot,80); required(issues,`${base}.productNameSnapshot`,line.productNameSnapshot,100); if(!Number.isSafeInteger(line.quantityMilli)||line.quantityMilli<=0) issues.push({path:`${base}.quantityMilli`,message:'必须是正整数毫单位'}); if(!Number.isSafeInteger(line.discountBasisPoints)||line.discountBasisPoints<0||line.discountBasisPoints>10000) issues.push({path:`${base}.discountBasisPoints`,message:'必须在0到10000之间'}); nonnegative(issues,`${base}.originalUnitPriceCents`,line.originalUnitPriceCents); nonnegative(issues,`${base}.dealUnitPriceCents`,line.dealUnitPriceCents); nonnegative(issues,`${base}.subtotalCents`,line.subtotalCents) })
  const keys=order.customAttributes.map((item)=>item.key); if(new Set(keys).size!==keys.length) issues.push({path:'customAttributes.key',message:'属性 key 必须唯一'})
  return issues
}

export function assertOrderFeatureState(state: OrderFeatureState): void {
  const issues: OrderValidationIssue[]=[]
  if(state.schemaVersion!==1) issues.push({path:'schemaVersion',message:'必须为1'}); required(issues,'enterpriseId',state.enterpriseId,100)
  const ids=state.orders.map((item)=>item.id); const numbers=state.orders.map((item)=>item.orderNo.toLocaleLowerCase())
  if(new Set(ids).size!==ids.length) issues.push({path:'orders.id',message:'企业内必须唯一'}); if(new Set(numbers).size!==numbers.length) issues.push({path:'orders.orderNo',message:'企业内必须唯一'})
  state.orders.forEach((order,index)=>{ if(order.enterpriseId!==state.enterpriseId) issues.push({path:`orders.${index}.enterpriseId`,message:'实体企业不一致'}); validateOrder(order).forEach((issue)=>issues.push({...issue,path:`orders.${index}.${issue.path}`})) })
  const requestIds=state.printRequests.map((item)=>item.requestId); if(new Set(requestIds).size!==requestIds.length) issues.push({path:'printRequests.requestId',message:'必须唯一'})
  state.printRequests.forEach((request,index)=>{ required(issues,`printRequests.${index}.requestId`,request.requestId,100); if(!iso(request.printedAt)) issues.push({path:`printRequests.${index}.printedAt`,message:'必须是 ISO 时间'}); request.orderIds.forEach((id)=>{if(!ids.includes(id)) issues.push({path:`printRequests.${index}.orderIds`,message:'订单不存在'})}) })
  if(issues.length) throw new OrderValidationError(issues)
}

export function normalizeOrderQuery(query: OrderQuery): Required<Pick<OrderQuery,'page'|'pageSize'>> & OrderQuery {
  const issues: OrderValidationIssue[]=[]; const page=query.page??1; const pageSize=query.pageSize??30
  if(!Number.isSafeInteger(page)||page<1) issues.push({path:'page',message:'必须是正整数'}); if(![10,30,50,100].includes(pageSize)) issues.push({path:'pageSize',message:'只允许10/30/50/100'})
  if(query.statuses?.some((item)=>!statuses.has(item))) issues.push({path:'statuses',message:'包含无效状态'})
  const dates: Array<[string,string|undefined]>=[['orderedFrom',query.orderedFrom],['orderedTo',query.orderedTo],['deliveryFrom',query.deliveryFrom],['deliveryTo',query.deliveryTo]]
  dates.forEach(([path,value])=>{if(value&&!iso(value)) issues.push({path,message:'必须是 ISO 时间'})})
  if(query.orderedFrom&&query.orderedTo&&Date.parse(query.orderedFrom)>Date.parse(query.orderedTo)) issues.push({path:'orderedTo',message:'不能早于开始时间'})
  if(query.deliveryFrom&&query.deliveryTo&&Date.parse(query.deliveryFrom)>Date.parse(query.deliveryTo)) issues.push({path:'deliveryTo',message:'不能早于开始时间'})
  const amounts: Array<[string,number|undefined]>=[['amountMinCents',query.amountMinCents],['amountMaxCents',query.amountMaxCents]]
  amounts.forEach(([path,value])=>{if(value!==undefined&&(!Number.isSafeInteger(value)||value<0)) issues.push({path,message:'必须是非负整数分'})})
  if(query.amountMinCents!==undefined&&query.amountMaxCents!==undefined&&query.amountMinCents>query.amountMaxCents) issues.push({path:'amountMaxCents',message:'不能小于最低金额'})
  if(issues.length) throw new OrderValidationError(issues)
  return {...query,keyword:query.keyword?.trim()||undefined,page,pageSize}
}
