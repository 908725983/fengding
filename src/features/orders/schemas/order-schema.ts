import type { CustomerOrder, OrderDraft, OrderFeatureState, OrderQuery } from '../types'

export interface OrderValidationIssue { path: string; message: string }
export class OrderValidationError extends Error {
  readonly code = 'ORDER_VALIDATION_FAILED'
  constructor(readonly issues: OrderValidationIssue[]) { super(issues.map((item) => `${item.path}: ${item.message}`).join('；')); this.name = 'OrderValidationError' }
}

const statuses = new Set(['pending-order-review', 'pending-finance-review', 'approved', 'outbound-in-progress', 'outbound', 'shipped', 'completed', 'canceled'])
const settlementMethods = new Set(['cash', 'monthly', 'terms'])
const deliveryMethods = new Set(['door-delivery', 'logistics', 'customer-pickup'])
const invoiceTypes = new Set(['none', 'vat-normal', 'vat-special'])
const attachmentTypes = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const iso = (value: string) => Number.isFinite(Date.parse(value))
function required(issues: OrderValidationIssue[], path: string, value: string, max = 200): void { const clean=value.trim(); if(!clean) issues.push({path,message:'不能为空'}); else if(clean.length>max) issues.push({path,message:`不能超过 ${max} 个字符`}) }
function nonnegative(issues: OrderValidationIssue[], path: string, value: number): void { if(!Number.isSafeInteger(value)||value<0) issues.push({path,message:'必须是非负安全整数'}) }

export function validateOrderDraft(draft: OrderDraft): OrderValidationIssue[] {
  const issues: OrderValidationIssue[]=[]
  required(issues,'customerId',draft.customerId,100); required(issues,'warehouseId',draft.warehouseId,100)
  if(!invoiceTypes.has(draft.invoiceType)) issues.push({path:'invoiceType',message:'发票类型无效'})
  if(draft.invoiceType!=='none') required(issues,'invoiceTitle',draft.invoiceTitle??'',100)
  if(!iso(draft.requestedDeliveryAt)) issues.push({path:'requestedDeliveryAt',message:'必须是有效时间'})
  if(!deliveryMethods.has(draft.deliveryMethod)) issues.push({path:'deliveryMethod',message:'请选择配送方式'})
  required(issues,'shipping.recipient',draft.shipping.recipient,80); required(issues,'shipping.phone',draft.shipping.phone,40)
  required(issues,'shipping.province',draft.shipping.province,40); required(issues,'shipping.city',draft.shipping.city,40); required(issues,'shipping.district',draft.shipping.district,40); required(issues,'shipping.address',draft.shipping.address,200)
  if(!draft.lines.length) issues.push({path:'lines',message:'至少添加一个商品'})
  const pairs=new Set<string>()
  draft.lines.forEach((line,index)=>{const base=`lines.${index}`;required(issues,`${base}.skuId`,line.skuId,100);required(issues,`${base}.unitId`,line.unitId,100);if(!Number.isSafeInteger(line.quantity)||line.quantity<1)issues.push({path:`${base}.quantity`,message:'必须是大于等于1的整数'});if(!['sale','gift'].includes(line.lineKind))issues.push({path:`${base}.lineKind`,message:'行类型无效'});if(line.manualDealUnitPriceCents!==null)nonnegative(issues,`${base}.manualDealUnitPriceCents`,line.manualDealUnitPriceCents);if(line.reason&&line.reason.trim().length>500)issues.push({path:`${base}.reason`,message:'不能超过500个字符'});const pair=`${line.skuId}:${line.unitId}:${line.lineKind}`;if(pairs.has(pair))issues.push({path:base,message:'同一SKU、单位和行类型不能重复'});pairs.add(pair)})
  nonnegative(issues,'couponDiscountCents',draft.couponDiscountCents); nonnegative(issues,'manualOrderDiscountCents',draft.manualOrderDiscountCents); nonnegative(issues,'freightCents',draft.freightCents)
  if(draft.remark&&draft.remark.trim().length>500) issues.push({path:'remark',message:'不能超过500个字符'})
  if(draft.attachments.length>10) issues.push({path:'attachments',message:'最多上传10个附件'})
  draft.attachments.forEach((item,index)=>{required(issues,`attachments.${index}.id`,item.id,100);required(issues,`attachments.${index}.name`,item.name,200);if(!attachmentTypes.has(item.mediaType))issues.push({path:`attachments.${index}.mediaType`,message:'只支持pdf/jpg/png'});if(!Number.isSafeInteger(item.sizeBytes)||item.sizeBytes<=0||item.sizeBytes>5*1024*1024)issues.push({path:`attachments.${index}.sizeBytes`,message:'单文件必须大于0且不超过5MB'})})
  const keys=draft.customAttributes.map((item)=>item.key);if(new Set(keys).size!==keys.length)issues.push({path:'customAttributes.key',message:'属性key必须唯一'})
  return issues
}
export function assertOrderDraft(draft:OrderDraft):void{const issues=validateOrderDraft(draft);if(issues.length)throw new OrderValidationError(issues)}

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
  if(!deliveryMethods.has(order.shippingSnapshot.deliveryMethod))issues.push({path:'shippingSnapshot.deliveryMethod',message:'配送方式无效'})
  const amounts=order.amounts; Object.entries(amounts).forEach(([key,value])=>{ if(!Number.isSafeInteger(value)) issues.push({path:`amounts.${key}`,message:'必须是安全整数分'}) })
  const coupon=amounts.couponDiscountCents??0;const manual=amounts.manualOrderDiscountCents??0
  if(amounts.originalAmountCents<0||amounts.productDiscountCents>0||coupon>0||manual>0||amounts.orderDiscountCents>0||amounts.freightCents<0||amounts.orderAmountCents<0) issues.push({path:'amounts',message:'原价/运费/总额须非负且优惠须为0或负数'})
  if((amounts.couponDiscountCents!==undefined||amounts.manualOrderDiscountCents!==undefined)&&amounts.orderDiscountCents!==coupon+manual)issues.push({path:'amounts.orderDiscountCents',message:'必须等于优惠券和手工整单优惠之和'})
  if(amounts.orderAmountCents!==amounts.originalAmountCents+amounts.productDiscountCents+amounts.orderDiscountCents+amounts.freightCents) issues.push({path:'amounts.orderAmountCents',message:'金额汇总等式不成立'})
  nonnegative(issues,'orderPrintCount',order.orderPrintCount);if(order.occupiedPrepaymentCents!==undefined)nonnegative(issues,'occupiedPrepaymentCents',order.occupiedPrepaymentCents)
  if(order.fulfillmentProjection.outboundPrintCount!==null) nonnegative(issues,'fulfillmentProjection.outboundPrintCount',order.fulfillmentProjection.outboundPrintCount)
  const lineIds=new Set<string>(); const sequences=new Set<number>();const pairs=new Set<string>()
  order.lines.forEach((line,index)=>{ const base=`lines.${index}`; if(lineIds.has(line.id)) issues.push({path:`${base}.id`,message:'行ID重复'}); lineIds.add(line.id); if(sequences.has(line.sequence)||!Number.isSafeInteger(line.sequence)||line.sequence<1) issues.push({path:`${base}.sequence`,message:'序号必须为不重复正整数'}); sequences.add(line.sequence); required(issues,`${base}.skuId`,line.skuId,100); required(issues,`${base}.skuCodeSnapshot`,line.skuCodeSnapshot,80); required(issues,`${base}.productNameSnapshot`,line.productNameSnapshot,100); if(!Number.isSafeInteger(line.quantityMilli)||line.quantityMilli<=0) issues.push({path:`${base}.quantityMilli`,message:'必须是正整数毫单位'}); if(!Number.isSafeInteger(line.discountBasisPoints)||line.discountBasisPoints<0||line.discountBasisPoints>10000) issues.push({path:`${base}.discountBasisPoints`,message:'必须在0到10000之间'}); nonnegative(issues,`${base}.originalUnitPriceCents`,line.originalUnitPriceCents); nonnegative(issues,`${base}.dealUnitPriceCents`,line.dealUnitPriceCents); nonnegative(issues,`${base}.subtotalCents`,line.subtotalCents);const pair=`${line.skuId}:${line.unitSnapshot.id}:${line.lineKind??'sale'}`;if(pairs.has(pair))issues.push({path:base,message:'同一SKU、单位和行类型不能重复'});pairs.add(pair) })
  const keys=order.customAttributes.map((item)=>item.key); if(new Set(keys).size!==keys.length) issues.push({path:'customAttributes.key',message:'属性 key 必须唯一'})
  if(order.remark&&order.remark.length>500)issues.push({path:'remark',message:'不能超过500个字符'})
  if(order.attachments.length>10)issues.push({path:'attachments',message:'最多10个附件'})
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
  const saveIds=(state.saveRequests??[]).map((item)=>item.requestId);if(new Set(saveIds).size!==saveIds.length)issues.push({path:'saveRequests.requestId',message:'必须唯一'});(state.saveRequests??[]).forEach((item,index)=>{required(issues,`saveRequests.${index}.requestId`,item.requestId,100);if(!ids.includes(item.orderId))issues.push({path:`saveRequests.${index}.orderId`,message:'订单不存在'});if(!iso(item.savedAt))issues.push({path:`saveRequests.${index}.savedAt`,message:'必须是ISO时间'})})
  const shareIds=(state.shares??[]).map((item)=>item.id);const hashes=(state.shares??[]).map((item)=>item.tokenHash);if(new Set(shareIds).size!==shareIds.length)issues.push({path:'shares.id',message:'必须唯一'});if(new Set(hashes).size!==hashes.length)issues.push({path:'shares.tokenHash',message:'必须唯一'});(state.shares??[]).forEach((item,index)=>{if(!ids.includes(item.orderId))issues.push({path:`shares.${index}.orderId`,message:'订单不存在'});if(!['unviewed','viewed','confirmed'].includes(item.status))issues.push({path:`shares.${index}.status`,message:'状态无效'});if(!iso(item.createdAt)||!iso(item.expiresAt))issues.push({path:`shares.${index}`,message:'分享时间无效'})})
  Object.entries(state.nextOrderSequenceByDate??{}).forEach(([day,value])=>{if(!/^\d{6}$/.test(day)||!Number.isSafeInteger(value)||value<1)issues.push({path:`nextOrderSequenceByDate.${day}`,message:'日期序列无效'})})
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
