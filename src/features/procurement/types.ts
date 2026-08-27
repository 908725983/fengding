export type EntityId = string
export type ProcurementRole = 'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'
export type SupplierStatus = 'enabled' | 'disabled'
export type SupplierTradeType = 'purchase' | 'resale'
export type SupplierDeliveryMode = 'warehouse' | 'direct' | 'both'
export type BankAccountVisibility = 'full' | 'masked'

export interface ProcurementActor { role: ProcurementRole; actorId: EntityId }

export interface Supplier {
  id: EntityId
  enterpriseId: EntityId
  code: string
  name: string
  tradeType: SupplierTradeType
  deliveryMode: SupplierDeliveryMode
  contactName: string
  contactPhone: string
  address: string | null
  bankName: string | null
  bankAccount: string | null
  note: string | null
  status: SupplierStatus
  externalAccountState: 'unavailable'
  version: number
  createdAt: string
  updatedAt: string
}

export interface SupplierProductRelation {
  id: EntityId
  enterpriseId: EntityId
  supplierId: EntityId
  skuId: EntityId
  productIdSnapshot: EntityId
  productNameSnapshot: string
  productCodeSnapshot: string
  skuCodeSnapshot: string
  specificationSnapshot: string
  barcodeSnapshot: string | null
  categoryIdSnapshot: EntityId
  procurementUnitId: EntityId
  procurementUnitNameSnapshot: string
  procurementUnitRateMilli: number
  supplyPriceCents: number
  preferred: boolean
  status: SupplierStatus
  version: number
  createdAt: string
  updatedAt: string
}

export interface SupplierAuditLog {
  id: EntityId
  enterpriseId: EntityId
  targetType: 'supplier' | 'supplier-product' | 'purchase-order' | 'purchase-return'
  targetId: EntityId
  action: string
  actorId: EntityId
  detail: string
  createdAt: string
}

export interface ProcurementRequestRecord {
  requestId: string
  command: string
  targetId: EntityId
  resultVersion: number
  result: Supplier | SupplierProductRelation | Supplier[] | PurchaseOrder | PurchaseReturn
}

export interface ProcurementFeatureState {
  schemaVersion: 1
  enterpriseId: EntityId
  suppliers: Supplier[]
  supplierProducts: SupplierProductRelation[]
  auditLogs: SupplierAuditLog[]
  requests: ProcurementRequestRecord[]
  purchaseOrders?: PurchaseOrder[]
  purchaseReturns?: PurchaseReturn[]
  purchaseInbounds?: PurchaseInboundRecord[]
}

export type PurchaseOrderWorkflowStatus = 'pending-review' | 'approved' | 'voided' | 'cancelled'
export type PurchaseOrderInboundStatus = 'not-received' | 'partially-received' | 'received'
export type PurchaseOrderPaymentStatus = 'unavailable'

export interface PurchaseOrderLine {
  id: EntityId
  skuId: EntityId
  productNameSnapshot: string
  productCodeSnapshot: string
  skuCodeSnapshot: string
  specificationSnapshot: string
  barcodeSnapshot?: string | null
  categoryIdSnapshot?: EntityId | null
  categoryNameSnapshot?: string | null
  baseUnitIdSnapshot?: EntityId | null
  baseUnitNameSnapshot?: string | null
  procurementUnitId: EntityId
  procurementUnitNameSnapshot: string
  procurementUnitRateMilli: number
  quantity: number
  baseQuantityMilli: number
  unitPriceCents: number
  amountCents: number
  isGift: boolean
  note: string | null
  receivedQuantity: number
  receivedBaseQuantityMilli: number
  currentStockMilli: number | null
  supplierRelationId: EntityId
}

export interface PurchaseOrder {
  id: EntityId
  enterpriseId: EntityId
  code: string
  createdAt: string
  supplierId: EntityId
  supplierNameSnapshot: string
  warehouseId: EntityId
  warehouseNameSnapshot?: string | null
  receiverName: string | null
  receiverPhone: string | null
  receiverAddress: string | null
  workflowStatus: PurchaseOrderWorkflowStatus
  inboundStatus: PurchaseOrderInboundStatus
  paymentStatus: PurchaseOrderPaymentStatus
  lines: PurchaseOrderLine[]
  totalQuantity: number
  totalAmountCents: number
  originalAmountCents: number
  productDiscountCents: number
  otherFeeCents: number
  orderAmountCents: number
  note: string | null
  source: 'manual' | 'stock-analysis' | 'order-analysis'
  sourceOrderIds: EntityId[]
  version: number
  updatedAt: string
  auditLogIds: EntityId[]
}

export interface PurchaseOrderDraftLine {
  skuId: EntityId
  quantity: number
  unitPriceCents: number
  isGift?: boolean
  note?: string | null
  supplierRelationId?: EntityId
}

export interface PurchaseOrderDraft {
  supplierId: EntityId
  warehouseId: EntityId
  lines: PurchaseOrderDraftLine[]
  otherFeeCents?: number
  productDiscountCents?: number
  receiverName?: string | null
  receiverPhone?: string | null
  receiverAddress?: string | null
  note?: string | null
  source?: 'manual' | 'stock-analysis' | 'order-analysis'
  sourceOrderIds?: EntityId[]
}

export interface PurchaseOrderListQuery { workflowStatus?: PurchaseOrderWorkflowStatus | 'all'; inboundStatus?: PurchaseOrderInboundStatus | 'all'; warehouseId?: EntityId; keyword?: string; page?: number; pageSize?: 10 | 30 | 50 | 100 }
export interface PurchaseOrderInboundLine { lineId: EntityId; quantity: number; batchNumber?: string; productionDate?: string | null; expiresOn?: string | null; costPerBaseUnitCents?: number }
export interface PurchaseOrderInboundInput { orderId: EntityId; warehouseId: EntityId; locationId: EntityId; lines: PurchaseOrderInboundLine[]; requestId: string; operatorId: EntityId; occurredAt: string }
export interface PurchaseInboundRecordLine {
  id: EntityId
  purchaseOrderLineId: EntityId
  skuId: EntityId
  productNameSnapshot: string
  productCodeSnapshot: string
  skuCodeSnapshot: string
  specificationSnapshot: string
  barcodeSnapshot: string | null
  categoryIdSnapshot: EntityId | null
  categoryNameSnapshot: string | null
  baseUnitIdSnapshot: EntityId | null
  baseUnitNameSnapshot: string | null
  procurementUnitId: EntityId
  procurementUnitNameSnapshot: string
  procurementUnitRateMilli: number
  quantity: number
  baseQuantityMilli: number
  unitPriceCents: number
  goodsAmountCents: number
  allocatedDiscountCents: number
  allocatedOtherFeeCents: number
  amountCents: number
  isGift: boolean
}
export interface PurchaseInboundRecord {
  id: EntityId
  code: string
  requestId: string
  purchaseOrderId: EntityId
  purchaseOrderCodeSnapshot: string
  supplierId: EntityId
  supplierCodeSnapshot: string
  supplierNameSnapshot: string
  warehouseId: EntityId
  warehouseNameSnapshot: string | null
  occurredAt: string
  operatorId: EntityId
  lines: PurchaseInboundRecordLine[]
  totalBaseQuantityMilli: number
  goodsAmountCents: number
  allocatedDiscountCents: number
  allocatedOtherFeeCents: number
  amountCents: number
}
export interface PurchaseInventoryProvider {
  confirmInbound(actor: { actorId: EntityId; role: 'super-admin' | 'warehouse' }, input: { requestId: string; sourceType: string; sourceId: string; operatorId: EntityId; occurredAt: string; warehouseId: EntityId; locationId: EntityId; skuId: EntityId; quantityMilli: number; costPerBaseUnitCents: number; batchNumber?: string; productionDate?: string | null; expiresOn?: string | null }): unknown
  confirmOutboundBatch?(actor: { actorId: EntityId; role: 'super-admin' | 'warehouse' }, input: { requestId: string; sourceType: string; sourceId: string; operatorId: EntityId; occurredAt: string; warehouseId: EntityId; lines: Array<{ referenceId: EntityId; skuId: EntityId; quantityMilli: number }> }): Array<{ referenceId: EntityId; skuId: EntityId; balanceId: EntityId; batchId: EntityId; batchNumber: string; locationId: EntityId; quantityMilli: number; movementId?: EntityId }>
  snapshot?: () => unknown
  restore?: (snapshot: unknown) => void
  getWarehouse?: (actor: { actorId: EntityId; role: 'super-admin' | 'warehouse' }, warehouseId: EntityId) => { id: EntityId; name: string } | null
}
export interface PurchaseFinanceProvider {
  checkpoint(): unknown
  restore(snapshot: unknown): void
  createPayableFromInbound(input: {
    requestId: string; purchaseOrderId: EntityId; purchaseOrderNo: string; inboundId: EntityId; inboundNo: string
    supplierSnapshot: { id: EntityId; code: string; name: string; contactName: string; phone: string; paymentTermDays: number | null }
    items: Array<{ inboundLineId: EntityId; purchaseOrderLineId: EntityId; skuId: EntityId; skuCode: string; productName: string; specification: string; unitName: string; quantityMilli: number; unitPriceCents: number; subtotalCents: number; allocatedDiscountCents: number; allocatedOtherFeeCents: number; amountCents: number; isGift: boolean }>
    goodsAmountCents: number; discountCents: number; otherFeeCents: number; amountCents: number; occurredAt: string; paymentTermDays: number | null
    operator: { id: EntityId; name: string; role: ProcurementRole }
  }): unknown
  listPayablesForPurchaseOrder?(purchaseOrderId: EntityId): Array<{
    id: EntityId
    inboundId: EntityId
    occurredAt: string
    supplierId: EntityId
    items: Array<{ purchaseOrderLineId: EntityId; quantityMilli: number; subtotalCents: number; allocatedDiscountCents: number; allocatedOtherFeeCents: number; amountCents: number }>
  }>
  createPayableCredit?(input: {
    requestId: string
    sourceId: EntityId
    sourceNo: string
    supplierId: EntityId
    payableId: EntityId
    amountCents: number
    occurredAt: string
    operator: { id: EntityId; name: string; role: ProcurementRole }
  }): { id: EntityId; outstandingReductionCents: number; refundObligationCents: number }
}

export type PurchaseReturnWorkflowStatus = 'pending-review' | 'approved' | 'completed' | 'voided'
export type PurchaseReturnOutboundStatus = 'not-shipped' | 'partially-shipped' | 'shipped'
export type PurchaseReturnRefundStatus = 'not-required' | 'pending' | 'refunded'

export interface PurchaseReturnLine {
  id: EntityId
  purchaseOrderLineId: EntityId
  skuId: EntityId
  productNameSnapshot: string
  productCodeSnapshot: string
  skuCodeSnapshot: string
  specificationSnapshot: string
  barcodeSnapshot?: string | null
  categoryIdSnapshot?: EntityId | null
  categoryNameSnapshot?: string | null
  baseUnitIdSnapshot?: EntityId | null
  baseUnitNameSnapshot?: string | null
  procurementUnitId: EntityId
  procurementUnitNameSnapshot: string
  procurementUnitRateMilli: number
  quantity: number
  baseQuantityMilli: number
  shippedQuantity: number
  shippedBaseQuantityMilli: number
  unitPriceCents: number
  goodsAmountCents: number
  allocatedDiscountCents: number
  allocatedOtherFeeCents: number
  amountCents: number
  isGift: boolean
  note: string | null
}

export interface PurchaseReturnCreditAllocation {
  id: EntityId
  lineId: EntityId
  purchaseOrderLineId: EntityId
  payableId: EntityId
  quantityMilli: number
  amountCents: number
  financeCreditId: EntityId
  outstandingReductionCents: number
  refundObligationCents: number
}

export interface PurchaseReturnShipment {
  id: EntityId
  code?: string
  requestId: string
  occurredAt: string
  operatorId: EntityId
  warehouseNameSnapshot?: string | null
  lines: Array<{ lineId: EntityId; quantity: number; baseQuantityMilli: number }>
  inventoryMovementIds: EntityId[]
  credits: PurchaseReturnCreditAllocation[]
  amountCents: number
}

export interface PurchaseReturn {
  id: EntityId
  enterpriseId: EntityId
  code: string
  createdAt: string
  returnDate: string
  purchaseOrderId: EntityId
  purchaseOrderCodeSnapshot: string
  supplierId: EntityId
  supplierCodeSnapshot: string
  supplierNameSnapshot: string
  supplierContactNameSnapshot: string
  supplierContactPhoneSnapshot: string
  warehouseId: EntityId
  workflowStatus: PurchaseReturnWorkflowStatus
  outboundStatus: PurchaseReturnOutboundStatus
  refundStatus: PurchaseReturnRefundStatus
  lines: PurchaseReturnLine[]
  totalQuantity: number
  totalBaseQuantityMilli: number
  goodsAmountCents: number
  allocatedDiscountCents: number
  allocatedOtherFeeCents: number
  amountCents: number
  note: string | null
  voidInfo: { reason: string; voidedAt: string; voidedBy: EntityId } | null
  shipments: PurchaseReturnShipment[]
  createdBy: EntityId
  approvedBy: EntityId | null
  approvedAt: string | null
  version: number
  updatedAt: string
  auditLogIds: EntityId[]
}

export interface PurchaseReturnDraftLine { purchaseOrderLineId: EntityId; quantity: number; note?: string | null }
export interface PurchaseReturnDraft { purchaseOrderId: EntityId; returnDate: string; lines: PurchaseReturnDraftLine[]; note?: string | null }
export interface PurchaseReturnSourceLine extends PurchaseOrderLine { returnableQuantity: number }
export interface PurchaseReturnSource extends Omit<PurchaseOrder, 'lines'> { lines: PurchaseReturnSourceLine[] }
export interface PurchaseReturnListQuery {
  workflowStatus?: PurchaseReturnWorkflowStatus | 'all'
  dateFrom?: string
  dateTo?: string
  keyword?: string
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}
export interface PurchaseReturnOutboundInput {
  returnId: EntityId
  lines: Array<{ lineId: EntityId; quantity: number }>
  requestId: string
  expectedVersion: number
  operatorId: EntityId
  occurredAt: string
}

export interface SupplierDraft {
  code: string
  name: string
  tradeType: SupplierTradeType
  deliveryMode: SupplierDeliveryMode
  contactName: string
  contactPhone: string
  address: string | null
  bankName: string | null
  bankAccount: string | null
  note: string | null
}

export interface SupplierProductDraft { supplierId: EntityId; skuId: EntityId; supplyPriceCents: number; preferred: boolean }
export interface WriteCommand<T> { value: T; expectedVersion: number; requestId: string }

export interface SupplierListQuery {
  status?: 'all' | SupplierStatus
  keyword?: string
  skuKeyword?: string
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }

export interface SupplierListItem extends Omit<Supplier, 'bankAccount'> {
  bankAccount: string | null
  enabledProductCount: number
}

export interface SupplierDetail extends SupplierListItem { relations: SupplierProductRelation[]; auditLogs: SupplierAuditLog[] }

export interface ProcurementSkuSnapshot {
  skuId: EntityId
  productId: EntityId
  productName: string
  productCode: string
  skuCode: string
  specification: string
  barcode: string | null
  categoryId: EntityId
  baseUnitId?: EntityId
  baseUnitName?: string
  productStatus: 'draft' | 'on-sale' | 'off-sale'
  deleted: boolean
  procurementUnitId: EntityId
  procurementUnitName: string
  procurementUnitRateMilli: number
  minimumOrderQuantity: number | null
  orderMultiple: number
}

export interface ProcurementCategorySnapshot { id: EntityId; name: string; parentId: EntityId | null; status: 'active' | 'inactive' }
export interface ProcurementCatalogProvider { listSkus(): ProcurementSkuSnapshot[]; getSku(id: EntityId): ProcurementSkuSnapshot | null; listCategories(): ProcurementCategorySnapshot[] }

export interface SupplierProductListQuery { supplierId?: EntityId; categoryId?: EntityId; keyword?: string; status?: 'all' | SupplierStatus }

export interface SupplierProductListItem extends SupplierProductRelation { supplierName: string; effectiveForPurchase: boolean }

export interface PurchaseSupplyCandidate {
  supplierId: EntityId
  supplierCode: string
  supplierName: string
  deliveryMode: SupplierDeliveryMode
  relationId: EntityId
  skuId: EntityId
  supplyPriceCents: number
  procurementUnitId: EntityId
  procurementUnitName: string
  procurementUnitRateMilli: number
  preferred: boolean
}

export interface ProcurementSupplyProvider {
  listCandidates(skuId: EntityId, mode?: 'warehouse' | 'direct'): PurchaseSupplyCandidate[]
  getPreferred(skuId: EntityId, mode?: 'warehouse' | 'direct'): PurchaseSupplyCandidate | null
  listEffectiveSkuIds(supplierId: EntityId): EntityId[]
  listEnabledSuppliers(): Array<{ id: EntityId; name: string }>
}

export interface SupplierImportRow extends SupplierDraft { rowNumber: number }
export interface ImportIssue { rowNumber: number; field: string; message: string }
export interface SupplierImportPreview { valid: boolean; rows: SupplierImportRow[]; issues: ImportIssue[] }
export interface DirectDeliveryAvailability { availability: 'unavailable'; reason: 'PURCHASE_EXECUTION_PROVIDER_UNAVAILABLE'; message: string }

export interface ProcurementWorkspace {
  suppliers: PageResult<SupplierListItem>
  supplierProducts: SupplierProductListItem[]
  categories: ProcurementCategorySnapshot[]
  skus: ProcurementSkuSnapshot[]
  catalogAvailable: boolean
  directDelivery: DirectDeliveryAvailability
}

export type ReplenishmentMode = 'safety' | 'shortage' | 'combined'
export type ReplenishmentValue<T> = T | null
export type ReplenishmentAvailability = 'available' | 'unavailable'

export interface InventoryReplenishmentFact {
  warehouseId: EntityId
  warehouseCode: string
  warehouseName: string
  skuId: EntityId
  categoryId: EntityId | null
  productName: string
  productCode: string
  skuCode: string
  specification: string
  inventoryUnitName: string
  currentMilli: number
  safetyMinimumMilli: number
  maximumMilli: number | null
  availableMilli: number | null
  inTransitMilli: number | null
  pendingOutboundMilli: number | null
}

export interface InventoryReplenishmentProvider {
  snapshot(): { rows: InventoryReplenishmentFact[]; available: boolean; version: string }
}

export interface ReplenishmentRow {
  id: string
  warehouseId: EntityId
  warehouseCode: string
  warehouseName: string
  skuId: EntityId
  categoryId: EntityId | null
  productName: string
  productCode: string
  skuCode: string
  specification: string
  unitName: string
  currentQuantity: number | null
  pendingQuantity: number | null
  shortageQuantity: number | null
  safetyMinimumQuantity: number | null
  maximumQuantity: number | null
  suggestedQuantity: number | null
  suggestionSource: Array<'safety' | 'shortage'>
  supplyPriceCents: number | null
  priceState: 'available' | 'manual-required' | 'unavailable'
  estimatedAmountCents: number | null
  availability: ReplenishmentAvailability
  unavailableReason?: string
  calculatedQuantity: number | null
  manualQuantity: number | null
  quantitySource: 'calculated' | 'manual'
  supplierCandidates: PurchaseSupplyCandidate[]
}

export interface ReplenishmentSummary { inventoryTotal: number | null; shortageTotal: number | null; suggestedTotal: number | null }
export interface ReplenishmentQuery { mode: ReplenishmentMode; categoryId?: EntityId; warehouseId?: EntityId; keyword?: string }
export interface ReplenishmentResult { rows: ReplenishmentRow[]; summary: ReplenishmentSummary; availability: ReplenishmentAvailability; version: string }
export interface ReplenishmentDraftLine { rowId: string; warehouseId: EntityId; skuId: EntityId; supplierId?: EntityId; quantity: number; source: 'stock-analysis' | 'order-analysis'; sourceOrderId?: EntityId }
export interface ReplenishmentCandidateDraft { id: string; source: 'stock' | 'order'; createdAt: string; lines: ReplenishmentDraftLine[]; orderSnapshots: Array<{ orderId: string; orderCode: string; status: string }> }

export interface ReplenishmentOrderFact { orderId: EntityId; orderCode: string; skuId: EntityId; warehouseId: EntityId; quantityMilli: number; categoryId: EntityId | null; supplierId: EntityId | null; deliveryAt: string | null; status: string; outboundStatus: string; paymentStatus: string; deliveryMode: string; snapshotVersion: string }
export interface ReplenishmentOrderProvider { snapshot(): { rows: ReplenishmentOrderFact[]; available: boolean; version: string } }
