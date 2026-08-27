import type { ProcurementFeatureState, PurchaseOrder, PurchaseReturn, PurchaseReturnDraft, SupplierDraft, SupplierProductDraft } from '../types'

export interface ProcurementValidationIssue { path: string; message: string }

export class ProcurementValidationError extends Error {
  readonly code = 'PROCUREMENT_VALIDATION_FAILED'
  constructor(readonly issues: ProcurementValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('；'))
    this.name = 'ProcurementValidationError'
  }
}

function required(issues: ProcurementValidationIssue[], path: string, value: string, max: number): void {
  if (!value.trim()) issues.push({ path, message: '不能为空' })
  if (value.trim().length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}

function optional(issues: ProcurementValidationIssue[], path: string, value: string | null, max: number): void {
  if (value !== null && value.trim().length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}

export function normalizeSupplierDraft(value: SupplierDraft): SupplierDraft {
  const clean = (text: string | null) => text?.trim() || null
  return { ...value, code: value.code.trim().toUpperCase(), name: value.name.trim(), contactName: value.contactName.trim(), contactPhone: value.contactPhone.trim(), address: clean(value.address), bankName: clean(value.bankName), bankAccount: clean(value.bankAccount), note: clean(value.note) }
}

export function validateSupplierDraft(value: SupplierDraft): ProcurementValidationIssue[] {
  const issues: ProcurementValidationIssue[] = []
  required(issues, 'code', value.code, 30); required(issues, 'name', value.name, 80)
  required(issues, 'contactName', value.contactName, 40); required(issues, 'contactPhone', value.contactPhone, 30)
  optional(issues, 'address', value.address, 200); optional(issues, 'bankName', value.bankName, 80)
  optional(issues, 'bankAccount', value.bankAccount, 50); optional(issues, 'note', value.note, 500)
  if ((value.bankName === null || !value.bankName.trim()) !== (value.bankAccount === null || !value.bankAccount.trim())) issues.push({ path: 'bankName/bankAccount', message: '开户行和银行账号必须同时填写或同时为空' })
  return issues
}

export function assertSupplierDraft(value: SupplierDraft): void { const issues = validateSupplierDraft(value); if (issues.length) throw new ProcurementValidationError(issues) }

export function assertSupplierProductDraft(value: SupplierProductDraft): void {
  const issues: ProcurementValidationIssue[] = []
  if (!value.supplierId.trim()) issues.push({ path: 'supplierId', message: '不能为空' })
  if (!value.skuId.trim()) issues.push({ path: 'skuId', message: '不能为空' })
  if (!Number.isInteger(value.supplyPriceCents) || value.supplyPriceCents <= 0) issues.push({ path: 'supplyPriceCents', message: '必须是大于 0 的整数分' })
  if (issues.length) throw new ProcurementValidationError(issues)
}

export function assertProcurementFeatureState(state: ProcurementFeatureState): void {
  if (state.schemaVersion !== 1 || !state.enterpriseId) throw new ProcurementValidationError([{ path: 'state', message: '采购数据版本无效' }])
  const codes = new Set<string>(); const names = new Set<string>(); const relationKeys = new Set<string>(); const preferred = new Set<string>()
  for (const supplier of state.suppliers) {
    assertSupplierDraft(supplier)
    const code = supplier.code.toUpperCase(); const name = supplier.name.trim()
    if (codes.has(code)) throw new ProcurementValidationError([{ path: 'suppliers.code', message: '企业内必须唯一' }])
    if (names.has(name)) throw new ProcurementValidationError([{ path: 'suppliers.name', message: '企业内必须唯一' }])
    codes.add(code); names.add(name)
    if (!Number.isInteger(supplier.version) || supplier.version < 1) throw new ProcurementValidationError([{ path: 'suppliers.version', message: '必须为正整数' }])
  }
  for (const relation of state.supplierProducts) {
    if (!Number.isInteger(relation.supplyPriceCents) || relation.supplyPriceCents <= 0) throw new ProcurementValidationError([{ path: 'supplierProducts.supplyPriceCents', message: '必须大于 0' }])
    if (!Number.isInteger(relation.procurementUnitRateMilli) || relation.procurementUnitRateMilli <= 0) throw new ProcurementValidationError([{ path: 'supplierProducts.procurementUnitRateMilli', message: '必须大于 0' }])
    const key = `${relation.supplierId}:${relation.skuId}`; if (relationKeys.has(key)) throw new ProcurementValidationError([{ path: 'supplierProducts', message: '供应商与 SKU 关系必须唯一' }]); relationKeys.add(key)
    const supplier = state.suppliers.find((item) => item.id === relation.supplierId)
    if (!supplier) throw new ProcurementValidationError([{ path: 'supplierProducts.supplierId', message: '供应商不存在' }])
    if (relation.preferred && relation.status === 'enabled' && supplier.status === 'enabled') {
      if (preferred.has(relation.skuId)) throw new ProcurementValidationError([{ path: 'supplierProducts.preferred', message: '每个 SKU 最多一个有效首选供应商' }])
      preferred.add(relation.skuId)
    }
  }
  for (const order of state.purchaseOrders ?? []) assertPurchaseOrder(order)
  const inboundCodes = new Set<string>(); const inboundRequests = new Set<string>()
  for (const inbound of state.purchaseInbounds ?? []) {
    if (!/^CGRK-\d{6}-\d{5}$/.test(inbound.code) || inboundCodes.has(inbound.code)) throw new ProcurementValidationError([{ path: 'purchaseInbounds.code', message: '入库单号格式无效或重复' }])
    if (!inbound.requestId || inboundRequests.has(inbound.requestId)) throw new ProcurementValidationError([{ path: 'purchaseInbounds.requestId', message: '入库 requestId 不能为空或重复' }])
    inboundCodes.add(inbound.code); inboundRequests.add(inbound.requestId)
    let baseQuantityMilli = 0; let goodsAmountCents = 0; let discountCents = 0; let otherFeeCents = 0; let amountCents = 0
    for (const line of inbound.lines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.baseQuantityMilli !== line.quantity * line.procurementUnitRateMilli) throw new ProcurementValidationError([{ path: 'purchaseInbounds.lines.quantity', message: '入库数量或换算无效' }])
      if (line.amountCents !== line.goodsAmountCents - line.allocatedDiscountCents + line.allocatedOtherFeeCents || (line.isGift && line.amountCents !== 0)) throw new ProcurementValidationError([{ path: 'purchaseInbounds.lines.amountCents', message: '入库净额无效' }])
      baseQuantityMilli += line.baseQuantityMilli; goodsAmountCents += line.goodsAmountCents; discountCents += line.allocatedDiscountCents; otherFeeCents += line.allocatedOtherFeeCents; amountCents += line.amountCents
    }
    if (inbound.totalBaseQuantityMilli !== baseQuantityMilli || inbound.goodsAmountCents !== goodsAmountCents || inbound.allocatedDiscountCents !== discountCents || inbound.allocatedOtherFeeCents !== otherFeeCents || inbound.amountCents !== amountCents) throw new ProcurementValidationError([{ path: 'purchaseInbounds.totals', message: '入库合计与明细不一致' }])
  }
  for (const purchaseReturn of state.purchaseReturns ?? []) assertPurchaseReturn(purchaseReturn)
}

export function assertPurchaseOrder(order: PurchaseOrder): void {
  if (!order.id || !/^PO\d{12}$/.test(order.code) || !order.enterpriseId) throw new ProcurementValidationError([{ path: 'purchaseOrders.code', message: '采购单号格式无效' }])
  if (!Number.isInteger(order.version) || order.version < 1) throw new ProcurementValidationError([{ path: 'purchaseOrders.version', message: '版本必须为正整数' }])
  if (!order.lines.length) throw new ProcurementValidationError([{ path: 'purchaseOrders.lines', message: '采购订单至少包含一行商品' }])
  for (const line of order.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.baseQuantityMilli) || line.baseQuantityMilli <= 0) throw new ProcurementValidationError([{ path: 'purchaseOrders.lines.quantity', message: '数量必须为正整数' }])
    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents <= 0 || line.amountCents !== Math.round(line.quantity * line.unitPriceCents)) throw new ProcurementValidationError([{ path: 'purchaseOrders.lines.amount', message: '采购金额无效' }])
    if (line.receivedQuantity < 0 || line.receivedQuantity > line.quantity || line.receivedBaseQuantityMilli < 0 || line.receivedBaseQuantityMilli > line.baseQuantityMilli) throw new ProcurementValidationError([{ path: 'purchaseOrders.lines.received', message: '入库数量无效' }])
  }
  if (!Number.isSafeInteger(order.orderAmountCents) || order.orderAmountCents !== order.originalAmountCents - order.productDiscountCents + order.otherFeeCents) throw new ProcurementValidationError([{ path: 'purchaseOrders.orderAmountCents', message: '订单金额公式无效' }])
}

export function assertPurchaseReturnDraft(value: PurchaseReturnDraft, currentDate: string): void {
  const issues: ProcurementValidationIssue[] = []
  if (!value.purchaseOrderId.trim()) issues.push({ path: 'purchaseOrderId', message: '必须选择原采购单' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.returnDate) || value.returnDate > currentDate) issues.push({ path: 'returnDate', message: '退单日期无效或晚于当前日期' })
  if (!value.lines.length) issues.push({ path: 'lines', message: '至少选择一行退货商品' })
  const ids = new Set<string>()
  value.lines.forEach((line, index) => {
    if (!line.purchaseOrderLineId.trim() || ids.has(line.purchaseOrderLineId)) issues.push({ path: `lines.${index}.purchaseOrderLineId`, message: '来源行不能为空且不能重复' })
    ids.add(line.purchaseOrderLineId)
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) issues.push({ path: `lines.${index}.quantity`, message: '采购单位数量必须是正整数' })
    if ((line.note?.trim().length ?? 0) > 200) issues.push({ path: `lines.${index}.note`, message: '不能超过 200 个字符' })
  })
  if ((value.note?.trim().length ?? 0) > 500) issues.push({ path: 'note', message: '不能超过 500 个字符' })
  if (issues.length) throw new ProcurementValidationError(issues)
}

export function assertPurchaseReturn(value: PurchaseReturn): void {
  if (!value.id || !/^CGTH-\d{6}-\d{5}$/.test(value.code) || !value.enterpriseId) throw new ProcurementValidationError([{ path: 'purchaseReturns.code', message: '采购退单号格式无效' }])
  if (!Number.isSafeInteger(value.version) || value.version < 1) throw new ProcurementValidationError([{ path: 'purchaseReturns.version', message: '版本必须为正整数' }])
  if (!value.lines.length) throw new ProcurementValidationError([{ path: 'purchaseReturns.lines', message: '采购退单至少包含一行商品' }])
  let totalQuantity = 0; let totalBaseQuantityMilli = 0; let goodsAmountCents = 0; let discountCents = 0; let otherFeeCents = 0; let amountCents = 0
  for (const line of value.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.baseQuantityMilli) || line.baseQuantityMilli <= 0) throw new ProcurementValidationError([{ path: 'purchaseReturns.lines.quantity', message: '数量必须为正整数' }])
    if (!Number.isSafeInteger(line.shippedQuantity) || line.shippedQuantity < 0 || line.shippedQuantity > line.quantity || line.shippedBaseQuantityMilli !== line.shippedQuantity * line.procurementUnitRateMilli) throw new ProcurementValidationError([{ path: 'purchaseReturns.lines.shippedQuantity', message: '已出库数量无效' }])
    if (!Number.isSafeInteger(line.amountCents) || line.amountCents !== line.goodsAmountCents - line.allocatedDiscountCents + line.allocatedOtherFeeCents || (line.isGift && line.amountCents !== 0)) throw new ProcurementValidationError([{ path: 'purchaseReturns.lines.amountCents', message: '退单金额无效' }])
    totalQuantity += line.quantity; totalBaseQuantityMilli += line.baseQuantityMilli; goodsAmountCents += line.goodsAmountCents; discountCents += line.allocatedDiscountCents; otherFeeCents += line.allocatedOtherFeeCents; amountCents += line.amountCents
  }
  for (const shipment of value.shipments) if (shipment.code !== undefined && !/^CGCK-\d{6}-\d{5}$/.test(shipment.code)) throw new ProcurementValidationError([{ path: 'purchaseReturns.shipments.code', message: '退采出库单号格式无效' }])
  if (value.totalQuantity !== totalQuantity || value.totalBaseQuantityMilli !== totalBaseQuantityMilli || value.goodsAmountCents !== goodsAmountCents || value.allocatedDiscountCents !== discountCents || value.allocatedOtherFeeCents !== otherFeeCents || value.amountCents !== amountCents) throw new ProcurementValidationError([{ path: 'purchaseReturns.totals', message: '退单合计与明细不一致' }])
}
