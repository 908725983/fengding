import type { CustomerReturn, CustomerReturnDraft, OrderFeatureState } from '../types'
import type { OrderValidationIssue } from './order-schema'

const statuses = new Set(['pending-review', 'returned', 'approved', 'completed', 'cancelled'])
const receivingStatuses = new Set(['pending', 'received'])
const refundStatuses = new Set(['not-created', 'pending', 'refunded', 'rejected', 'not-required'])
const returnTypes = new Set(['whole', 'partial'])
const refundPreferences = new Set(['original', 'balance', 'cash'])
const iso = (value: string) => Number.isFinite(Date.parse(value))

export function validateCustomerReturnDraft(draft: CustomerReturnDraft): OrderValidationIssue[] {
  const issues: OrderValidationIssue[] = []
  if (!draft.orderId.trim()) issues.push({ path: 'orderId', message: '原订单不能为空' })
  if (!draft.warehouseId.trim()) issues.push({ path: 'warehouseId', message: '退货仓库不能为空' })
  if (!returnTypes.has(draft.returnType)) issues.push({ path: 'returnType', message: '退货类型无效' })
  if (!refundPreferences.has(draft.refundPreference)) issues.push({ path: 'refundPreference', message: '退款偏好无效' })
  const reason = draft.reason.trim()
  if (!reason || reason.length > 200) issues.push({ path: 'reason', message: '退货原因须为1到200字' })
  if ((draft.remark?.trim().length ?? 0) > 500) issues.push({ path: 'remark', message: '备注不能超过500字' })
  if ((draft.priceAdjustmentReason?.trim().length ?? 0) > 200) issues.push({ path: 'priceAdjustmentReason', message: '改价原因不能超过200字' })
  if (!draft.lines.length) issues.push({ path: 'lines', message: '至少选择一行退货商品' })
  const ids = new Set<string>()
  draft.lines.forEach((line, index) => {
    const base = `lines.${index}`
    if (!line.orderLineId.trim() || ids.has(line.orderLineId)) issues.push({ path: `${base}.orderLineId`, message: '订单行必须存在且不重复' })
    ids.add(line.orderLineId)
    if (!Number.isSafeInteger(line.returnQuantityMilli) || line.returnQuantityMilli <= 0) issues.push({ path: `${base}.returnQuantityMilli`, message: '退货数量必须是正整数毫单位' })
    if (line.returnAmountCents !== undefined && (!Number.isSafeInteger(line.returnAmountCents) || line.returnAmountCents < 0)) issues.push({ path: `${base}.returnAmountCents`, message: '退货金额必须是非负整数分' })
  })
  return issues
}

export function validateCustomerReturn(value: CustomerReturn): OrderValidationIssue[] {
  const issues: OrderValidationIssue[] = []
  const required = (path: string, input: string, max = 200) => { const clean = input.trim(); if (!clean || clean.length > max) issues.push({ path, message: `不能为空且不能超过${max}字` }) }
  const money = (path: string, input: number) => { if (!Number.isSafeInteger(input) || input < 0) issues.push({ path, message: '必须是非负整数分' }) }
  required('id', value.id); required('returnNo', value.returnNo); required('orderId', value.orderId); required('reason', value.reason, 200)
  if (!/^TH-\d{6}-\d{5}$/.test(value.returnNo)) issues.push({ path: 'returnNo', message: '退单编号格式无效' })
  if (!statuses.has(value.status)) issues.push({ path: 'status', message: '退单状态无效' })
  if (!receivingStatuses.has(value.receivingStatus)) issues.push({ path: 'receivingStatus', message: '收货状态无效' })
  if (!refundStatuses.has(value.refundStatus)) issues.push({ path: 'refundStatus', message: '退款状态无效' })
  if (!returnTypes.has(value.returnType)) issues.push({ path: 'returnType', message: '退货类型无效' })
  if (!refundPreferences.has(value.refundPreference)) issues.push({ path: 'refundPreference', message: '退款偏好无效' })
  if (!['customer-return', 'short-shipment-refund'].includes(value.sourceKind)) issues.push({ path: 'sourceKind', message: '来源类型无效' })
  if (!value.items.length) issues.push({ path: 'items', message: '退货商品不能为空' })
  const lineIds = new Set<string>()
  value.items.forEach((item, index) => {
    const base = `items.${index}`
    if (lineIds.has(item.orderLineId)) issues.push({ path: `${base}.orderLineId`, message: '订单行重复' })
    lineIds.add(item.orderLineId)
    for (const [key, amount] of Object.entries({ originalOrderQuantityMilli: item.originalOrderQuantityMilli, effectiveOutboundQuantityMilli: item.effectiveOutboundQuantityMilli, reservedReturnQuantityMilli: item.reservedReturnQuantityMilli, returnQuantityMilli: item.returnQuantityMilli })) {
      if (!Number.isSafeInteger(amount) || amount < 0) issues.push({ path: `${base}.${key}`, message: '数量必须是非负整数毫单位' })
    }
    if (item.returnQuantityMilli <= 0 || item.returnQuantityMilli > item.effectiveOutboundQuantityMilli) issues.push({ path: `${base}.returnQuantityMilli`, message: '退货数量超出有效出库量' })
    money(`${base}.originalDealUnitPriceCents`, item.originalDealUnitPriceCents); money(`${base}.allocatedOrderDiscountCents`, item.allocatedOrderDiscountCents); money(`${base}.defaultReturnAmountCents`, item.defaultReturnAmountCents); money(`${base}.returnAmountCents`, item.returnAmountCents)
    if (item.returnAmountCents > item.defaultReturnAmountCents) issues.push({ path: `${base}.returnAmountCents`, message: '退货金额不能提高默认权益' })
  })
  money('grossAmountCents', value.grossAmountCents); money('allocatedOrderDiscountCents', value.allocatedOrderDiscountCents); money('returnAmountCents', value.returnAmountCents)
  if (value.returnAmountCents !== value.items.reduce((sum, item) => sum + item.returnAmountCents, 0)) issues.push({ path: 'returnAmountCents', message: '必须等于行金额之和' })
  if ((value.priceAdjustmentReason !== null) !== value.items.some((item) => item.returnAmountCents < item.defaultReturnAmountCents)) issues.push({ path: 'priceAdjustmentReason', message: '改价与原因必须同时存在' })
  if (value.priceAdjustmentReason !== null && (!value.priceAdjustmentReason.trim() || value.priceAdjustmentReason.trim().length > 200)) issues.push({ path: 'priceAdjustmentReason', message: '改价原因须为1到200字' })
  if (![value.createdAt, value.updatedAt, ...value.activityLogs.map((item) => item.occurredAt)].every(iso)) issues.push({ path: 'timestamps', message: '时间格式无效' })
  if (!Number.isSafeInteger(value.reviewRound) || value.reviewRound < 1 || !Number.isSafeInteger(value.version) || value.version < 1) issues.push({ path: 'version', message: '轮次和版本须为正整数' })
  if (value.status === 'completed' && !(value.receivingStatus === 'received' && ['refunded', 'not-required'].includes(value.refundStatus))) issues.push({ path: 'status', message: '退单完成条件不成立' })
  if (value.receivingStatus === 'received' && !value.inboundProjection) issues.push({ path: 'inboundProjection', message: '已收货必须有入库投影' })
  if (value.refundStatus !== 'not-created' && value.refundStatus !== 'not-required' && !value.refundProjection) issues.push({ path: 'refundProjection', message: '退款状态必须有资金投影' })
  return issues
}

export function validateReturnState(state: OrderFeatureState): OrderValidationIssue[] {
  const issues: OrderValidationIssue[] = []
  const returns = state.returns ?? []
  const ids = returns.map((item) => item.id); const numbers = returns.map((item) => item.returnNo.toLowerCase())
  if (new Set(ids).size !== ids.length) issues.push({ path: 'returns.id', message: '必须唯一' })
  if (new Set(numbers).size !== numbers.length) issues.push({ path: 'returns.returnNo', message: '企业内必须唯一' })
  returns.forEach((item, index) => {
    if (!state.orders.some((order) => order.id === item.orderId)) issues.push({ path: `returns.${index}.orderId`, message: '原订单不存在' })
    validateCustomerReturn(item).forEach((issue) => issues.push({ ...issue, path: `returns.${index}.${issue.path}` }))
  })
  const requestIds = (state.returnRequests ?? []).map((item) => item.requestId)
  if (new Set(requestIds).size !== requestIds.length) issues.push({ path: 'returnRequests.requestId', message: '必须唯一' })
  ;(state.returnRequests ?? []).forEach((item, index) => {
    if (!ids.includes(item.returnId) || !item.requestId.trim() || !iso(item.appliedAt)) issues.push({ path: `returnRequests.${index}`, message: '请求记录无效' })
  })
  Object.entries(state.nextReturnSequenceByDate ?? {}).forEach(([day, next]) => { if (!/^\d{6}$/.test(day) || !Number.isSafeInteger(next) || next < 1) issues.push({ path: `nextReturnSequenceByDate.${day}`, message: '日期序列无效' }) })
  return issues
}
