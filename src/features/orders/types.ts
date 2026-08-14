export type EntityId = string
export type OrderRole = 'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'
export type OrderPermission = 'orders.create' | 'orders.edit' | 'orders.edit-price' | 'orders.add-gift' | 'orders.share'
export type OrderStatus = 'pending-order-review' | 'pending-finance-review' | 'approved' | 'outbound-in-progress' | 'outbound' | 'shipped' | 'completed' | 'canceled'
export type SettlementMethod = 'cash' | 'monthly' | 'terms'
export type DeliveryMethod = 'door-delivery' | 'logistics' | 'customer-pickup'
export type InvoiceStatus = 'none' | 'pending' | 'invoiced'
export type InvoiceType = 'none' | 'vat-normal' | 'vat-special'
export type AttributeType = 'text' | 'select' | 'datetime'
export type ProviderState = 'available' | 'unavailable' | 'error'
export type OrderLineKind = 'sale' | 'gift'
export type ShareStatus = 'unviewed' | 'viewed' | 'confirmed'
export type ShareDurationDays = 1 | 7 | 30

export interface OrderActor { actorId: EntityId; role: OrderRole; permissions?: OrderPermission[] }
export interface NamedSnapshot { id: EntityId; name: string }
export interface CustomerSnapshot extends NamedSnapshot { code: string; categoryId: EntityId }
export interface SettlementSnapshot { method: SettlementMethod; creditTermDays: number | null }
export interface ShippingSnapshot {
  recipient: string; phone: string; province: string; city: string; district: string; address: string; deliveryMethod: DeliveryMethod
}
export interface WarehouseSnapshot extends NamedSnapshot { code: string }
export interface UnitSnapshot extends NamedSnapshot { name: string; conversionRateMilli: number }
export interface OrderAmounts {
  originalAmountCents: number; productDiscountCents: number; couponDiscountCents?: number; manualOrderDiscountCents?: number
  orderDiscountCents: number; freightCents: number; orderAmountCents: number
}
export interface OrderFulfillmentProjection { outboundPrintCount: number | null; logisticsCodes: string[] | null; hasDifference: boolean | null }
export interface OrderCustomAttribute { definitionId: EntityId; key: string; label: string; type: AttributeType; value: string | null }
export interface OrderAttachment { id: EntityId; name: string; mediaType: 'application/pdf' | 'image/jpeg' | 'image/png'; sizeBytes: number }
export interface OrderPriceAdjustmentSnapshot { stage: 'pre-marketing' | 'category-discount' | 'membership' | 'promotion' | 'coupon' | 'manual'; label: string; amountCents: number; sourceId: string | null }
export interface OrderActivityLog { id: EntityId; action: 'order.created' | 'order.updated' | 'order.printed' | 'order.share-created' | 'order.share-viewed' | 'order.share-confirmed'; actor: NamedSnapshot; occurredAt: string; summary: string }
export interface OrderLine {
  id: EntityId; sequence: number; spuId: EntityId; skuId: EntityId; productCodeSnapshot: string; productNameSnapshot: string
  skuCodeSnapshot: string; specificationSnapshot: string; imageSnapshot: string | null; unitSnapshot: UnitSnapshot
  quantityMilli: number; discountBasisPoints: number; originalUnitPriceCents: number; dealUnitPriceCents: number
  subtotalCents: number; weightSubtotalGrams: number | null; reason: string | null
  lineKind?: OrderLineKind; sourceKeys?: string[]; pricingAdjustments?: OrderPriceAdjustmentSnapshot[]
}
export interface CustomerOrder {
  id: EntityId; enterpriseId: EntityId; orderNo: string; status: OrderStatus; orderedAt: string
  customerSnapshot: CustomerSnapshot; settlementCustomerSnapshot: CustomerSnapshot; settlementSnapshot: SettlementSnapshot
  shippingSnapshot: ShippingSnapshot; requestedDeliveryAt: string; fulfillmentWarehouseSnapshot: WarehouseSnapshot
  fulfillmentProjection: OrderFulfillmentProjection; salespersonSnapshot: NamedSnapshot; creatorSnapshot: NamedSnapshot
  amounts: OrderAmounts; invoiceStatus: InvoiceStatus; invoiceType: InvoiceType; invoiceTitleSnapshot: string | null
  lines: OrderLine[]; customAttributes: OrderCustomAttribute[]; remark: string | null; attachments: OrderAttachment[]
  activityLogs: OrderActivityLog[]; orderPrintCount: number; createdAt: string; updatedAt: string; deletedAt: string | null
  specialPrice?: boolean; occupiedPrepaymentCents?: number
}
export interface OrderPrintRequest { requestId: string; orderIds: EntityId[]; actorId: EntityId; printedAt: string }
export interface OrderSaveRequest { requestId: string; orderId: EntityId; savedAt: string }
export interface OrderShare {
  id: EntityId; orderId: EntityId; tokenHash: string; status: ShareStatus; createdAt: string; expiresAt: string
  viewedAt: string | null; confirmedAt: string | null; revokedAt: string | null; createdBy: EntityId
}
export interface OrderFeatureState {
  schemaVersion: 1; enterpriseId: EntityId; orders: CustomerOrder[]; printRequests: OrderPrintRequest[]
  nextOrderSequenceByDate?: Record<string, number>; saveRequests?: OrderSaveRequest[]; shares?: OrderShare[]
}

export interface OrderQuery {
  statuses?: OrderStatus[]; orderedFrom?: string; orderedTo?: string; keyword?: string; customerCategoryId?: EntityId
  salespersonId?: EntityId; warehouseId?: EntityId; settlementMethod?: SettlementMethod; amountMinCents?: number
  amountMaxCents?: number; deliveryFrom?: string; deliveryTo?: string; hasDifference?: boolean; page?: number; pageSize?: 10 | 30 | 50 | 100
}
export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: 10 | 30 | 50 | 100 }
export interface VisibleAmounts { originalAmountCents: number | null; productDiscountCents: number | null; couponDiscountCents?: number | null; manualOrderDiscountCents?: number | null; orderDiscountCents: number | null; freightCents: number | null; orderAmountCents: number | null }
export interface VisibleOrderLine extends Omit<OrderLine, 'discountBasisPoints' | 'originalUnitPriceCents' | 'dealUnitPriceCents' | 'subtotalCents'> {
  discountBasisPoints: number | null; originalUnitPriceCents: number | null; dealUnitPriceCents: number | null; subtotalCents: number | null
}
export interface VisibleShippingSnapshot extends Omit<ShippingSnapshot, 'phone' | 'address'> { phone: string | null; address: string | null }
export interface VisibleOrder extends Omit<CustomerOrder, 'amounts' | 'shippingSnapshot' | 'lines'> {
  amounts: VisibleAmounts; shippingSnapshot: VisibleShippingSnapshot; lines: VisibleOrderLine[]
}
export interface OrderListRow { order: VisibleOrder; logisticsSummary: string | null }
export interface OrderProviderValue<T> { state: ProviderState; value: T | null; message: string }
export interface OrderFinancialCards {
  creditLimitCents: OrderProviderValue<number>; receivablesCents: OrderProviderValue<number>
  availablePrepaymentCents: OrderProviderValue<number>; occupiedPrepaymentCents: OrderProviderValue<number>
}
export interface OrderDetailResult { order: VisibleOrder; financials: OrderFinancialCards; inventoryRecommendation: OrderProviderValue<never> }

export interface OrderCustomerRecord {
  id: EntityId; code: string; name: string; status: 'pending' | 'active' | 'inactive' | 'frozen'; categoryId: EntityId
  categoryDiscountPercent: number; minimumOrderAmountCents: number | null; salespersonId: EntityId
  settlementMethod: SettlementMethod; paymentTermDays: number | null; creditLimitCents: number | null
  recipient: string; phone: string; province: string; city: string; district: string; address: string; invoiceTitle: string | null
}
export interface OrderCustomerProvider {
  categoryDescendants(categoryId: EntityId): EntityId[]
  getCreditLimitCents(customerId: EntityId): number | null
  listOrderCustomers(): OrderCustomerRecord[]
  getOrderCustomer(customerId: EntityId): OrderCustomerRecord | null
}
export interface OrderFinanceSummary { receivablesCents: number; prepaymentBalanceCents: number }
export interface OrderFinanceProvider { getCustomerSummary(customerId: EntityId): OrderFinanceSummary | null }

export interface OrderUnitOption { id: EntityId; code: string; name: string; conversionRateMilli: number; minimumSalePriceCents: number | null; maximumSalePriceCents: number | null }
export interface OrderSkuOption {
  skuId: EntityId; spuId: EntityId; productCode: string; productName: string; skuCode: string; barcode: string | null
  specification: string; image: string | null; productStatus: 'draft' | 'on-sale' | 'off-sale'; deleted: boolean
  baseUnitId: EntityId; units: OrderUnitOption[]; minimumOrderQuantityMilli: number | null; orderMultipleMilli: number
  weightPerBaseUnitGrams: number | null
}
export interface OrderCatalogProvider { listSkus(): OrderSkuOption[]; getSku(skuId: EntityId): OrderSkuOption | null }
export interface OrderPriceResolution { unitPriceCents: number; source: 'customer' | 'level' | 'base-order'; sourceReferenceId: string | null }
export interface OrderPriceProvider { resolvePrice(customerId: EntityId, skuId: EntityId, unitId: EntityId, quantity: number): OrderPriceResolution }
export interface OrderAuthorizationProvider { resolveAuthorization(customerId: EntityId, productId: EntityId, at: string): { orderable: boolean; reason: string } }
export interface OrderWarehouseOption { id: EntityId; code: string; name: string; status: 'enabled' | 'disabled'; saleProhibited: boolean; type: 'physical' | 'virtual' }
export interface OrderWarehouseProvider { listWarehouses(): OrderWarehouseOption[]; getWarehouse(id: EntityId): OrderWarehouseOption | null }
export interface OrderStaffProvider { listStaff(): NamedSnapshot[]; getStaff(id: EntityId): NamedSnapshot | null }
export interface OrderTemplateOption { id: EntityId; name: string }
export interface OrderTemplateLine { skuId: EntityId; quantity: number; unitId: EntityId; sourceKey: string }
export interface OrderTemplateLoadResult { accepted: OrderTemplateLine[]; rejected: Array<{ skuId: EntityId; message: string }> }
export interface OrderTemplateProvider { listTemplates(customerId: EntityId): OrderTemplateOption[]; loadTemplate(templateId: EntityId, customerId: EntityId, at: string): OrderTemplateLoadResult }

export interface OrderLineDraft {
  id?: EntityId; skuId: EntityId; unitId: EntityId; quantity: number; lineKind: OrderLineKind
  manualDealUnitPriceCents: number | null; reason: string | null; sourceKeys: string[]
}
export interface OrderDraft {
  customerId: EntityId; warehouseId: EntityId; salespersonId: EntityId; invoiceType: InvoiceType; invoiceTitle: string | null
  requestedDeliveryAt: string; deliveryMethod: DeliveryMethod | ''; shipping: Omit<ShippingSnapshot, 'deliveryMethod'>
  lines: OrderLineDraft[]; specialPrice: boolean; couponDiscountCents: number; manualOrderDiscountCents: number
  freightCents: number; customAttributes: OrderCustomAttribute[]; remark: string | null; attachments: OrderAttachment[]
}
export interface OrderFormOptions {
  customers: OrderCustomerRecord[]; warehouses: OrderWarehouseOption[]; staff: NamedSnapshot[]; templates: OrderTemplateOption[]
  marketing: { membership: 'unavailable'; promotion: 'unavailable'; coupon: 'unavailable' }
}
export interface OrderCustomerContext { customer: OrderCustomerRecord; receivablesCents: number; availablePrepaymentCents: number }
export interface OrderDraftPreview { lines: OrderLine[]; amounts: OrderAmounts; occupiedPrepaymentCents: number; quantityTotal: number; weightTotalGrams: number; warnings: string[] }
export interface SaveOrderInput { requestId: string; draft: OrderDraft; orderId?: EntityId; expectedUpdatedAt?: string }
export interface PastedOrderPreview { lines: OrderLineDraft[]; errors: string[] }

export interface OrderShareResult { shareId: EntityId; token: string; url: string; qrValue: string; status: ShareStatus; expiresAt: string }
export interface SharedOrderView {
  orderNo: string; customerName: string; status: OrderStatus; lines: Array<{ productName: string; skuCode: string; specification: string; quantityMilli: number; unitName: string; subtotalCents: number }>
  amounts: OrderAmounts; deliveryMethod: DeliveryMethod; requestedDeliveryAt: string; shareStatus: ShareStatus; expiresAt: string
}
