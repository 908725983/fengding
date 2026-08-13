export type EntityId = string
export type OrderRole = 'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'
export type OrderStatus = 'pending-order-review' | 'pending-finance-review' | 'approved' | 'outbound-in-progress' | 'outbound' | 'shipped' | 'completed' | 'canceled'
export type SettlementMethod = 'cash' | 'monthly' | 'terms'
export type DeliveryMethod = 'door-delivery' | 'logistics' | 'customer-pickup'
export type InvoiceStatus = 'none' | 'pending' | 'invoiced'
export type InvoiceType = 'none' | 'vat-normal' | 'vat-special'
export type AttributeType = 'text' | 'select' | 'datetime'
export type ProviderState = 'available' | 'unavailable' | 'error'

export interface OrderActor { actorId: EntityId; role: OrderRole }
export interface NamedSnapshot { id: EntityId; name: string }
export interface CustomerSnapshot extends NamedSnapshot { code: string; categoryId: EntityId }
export interface SettlementSnapshot { method: SettlementMethod; creditTermDays: number | null }
export interface ShippingSnapshot {
  recipient: string; phone: string; province: string; city: string; district: string; address: string; deliveryMethod: DeliveryMethod
}
export interface WarehouseSnapshot extends NamedSnapshot { code: string }
export interface UnitSnapshot extends NamedSnapshot { name: string; conversionRateMilli: number }
export interface OrderAmounts {
  originalAmountCents: number; productDiscountCents: number; orderDiscountCents: number; freightCents: number; orderAmountCents: number
}
export interface OrderFulfillmentProjection { outboundPrintCount: number | null; logisticsCodes: string[] | null; hasDifference: boolean | null }
export interface OrderCustomAttribute { definitionId: EntityId; key: string; label: string; type: AttributeType; value: string | null }
export interface OrderAttachment { id: EntityId; name: string; mediaType: string; sizeBytes: number }
export interface OrderActivityLog { id: EntityId; action: 'order.created' | 'order.printed'; actor: NamedSnapshot; occurredAt: string; summary: string }
export interface OrderLine {
  id: EntityId; sequence: number; spuId: EntityId; skuId: EntityId; productCodeSnapshot: string; productNameSnapshot: string
  skuCodeSnapshot: string; specificationSnapshot: string; imageSnapshot: string | null; unitSnapshot: UnitSnapshot
  quantityMilli: number; discountBasisPoints: number; originalUnitPriceCents: number; dealUnitPriceCents: number
  subtotalCents: number; weightSubtotalGrams: number | null; reason: string | null
}
export interface CustomerOrder {
  id: EntityId; enterpriseId: EntityId; orderNo: string; status: OrderStatus; orderedAt: string
  customerSnapshot: CustomerSnapshot; settlementCustomerSnapshot: CustomerSnapshot; settlementSnapshot: SettlementSnapshot
  shippingSnapshot: ShippingSnapshot; requestedDeliveryAt: string; fulfillmentWarehouseSnapshot: WarehouseSnapshot
  fulfillmentProjection: OrderFulfillmentProjection; salespersonSnapshot: NamedSnapshot; creatorSnapshot: NamedSnapshot
  amounts: OrderAmounts; invoiceStatus: InvoiceStatus; invoiceType: InvoiceType; invoiceTitleSnapshot: string | null
  lines: OrderLine[]; customAttributes: OrderCustomAttribute[]; remark: string | null; attachments: OrderAttachment[]
  activityLogs: OrderActivityLog[]; orderPrintCount: number; createdAt: string; updatedAt: string; deletedAt: string | null
}
export interface OrderPrintRequest { requestId: string; orderIds: EntityId[]; actorId: EntityId; printedAt: string }
export interface OrderFeatureState { schemaVersion: 1; enterpriseId: EntityId; orders: CustomerOrder[]; printRequests: OrderPrintRequest[] }

export interface OrderQuery {
  statuses?: OrderStatus[]; orderedFrom?: string; orderedTo?: string; keyword?: string; customerCategoryId?: EntityId
  salespersonId?: EntityId; warehouseId?: EntityId; settlementMethod?: SettlementMethod; amountMinCents?: number
  amountMaxCents?: number; deliveryFrom?: string; deliveryTo?: string; hasDifference?: boolean; page?: number; pageSize?: 10 | 30 | 50 | 100
}
export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: 10 | 30 | 50 | 100 }
export interface VisibleAmounts { originalAmountCents: number | null; productDiscountCents: number | null; orderDiscountCents: number | null; freightCents: number | null; orderAmountCents: number | null }
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
export interface OrderCustomerProvider {
  categoryDescendants(categoryId: EntityId): EntityId[]
  getCreditLimitCents(customerId: EntityId): number | null
}
export interface OrderFinanceProvider { getCustomerSummary(customerId: EntityId): { receivablesCents: number; availablePrepaymentCents: number } | null }

