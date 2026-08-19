import type { CustomerReturnStatus, OrderActor, OrderStatus, ProviderState } from '../types'

export type OrderStatisticsReportKey =
  | 'order-line-detail'
  | 'return-line-detail'
  | 'order-by-product'
  | 'order-by-customer'
  | 'presale-line-detail'
  | 'presale-by-product'
  | 'movement-line-detail'
  | 'movement-by-product'
  | 'movement-by-customer'

export type StatisticsDocumentKind = 'order' | 'return'
export type StatisticsUnitMode = 'base' | 'ordered'
export type StatisticsMovementType = 'sales-outbound' | 'customer-return-inbound'
export type StatisticsDimension = 'customer' | 'product' | 'sku' | 'unit'
export type StatisticsMeasure = 'document-count' | 'quantity' | 'amount' | 'average-price' | 'fulfillment-rate' | 'discount-rate'
export type StatisticsPermission =
  | 'orders.view-statistics'
  | 'orders.export-statistics'
  | 'orders.view-order-line-statistics'
  | 'orders.view-order-summary-statistics'
  | 'orders.view-return-line-statistics'
  | 'orders.view-return-summary-statistics'

export interface OrderStatisticsActor extends OrderActor { statisticsPermissions?: StatisticsPermission[] }

export interface OrderStatisticsQuery {
  report: OrderStatisticsReportKey
  documentKind?: StatisticsDocumentKind
  unitMode?: StatisticsUnitMode
  fromDate?: string
  toDate?: string
  customerId?: string
  skuId?: string
  keyword?: string
  orderStatuses?: OrderStatus[]
  returnStatuses?: CustomerReturnStatus[]
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface StatisticsProductSnapshot {
  spuId: string | null
  skuId: string
  productCode: string | null
  skuCode: string
  name: string
  specification: string
  image: string | null
  barcode: string | null
  barcodeState: ProviderState
  physicalCode: string | null
  physicalCodeState: ProviderState
}

export interface StatisticsUnitSnapshot { id: string; name: string; conversionRateMilli: number }

export interface OrderStatisticsRow {
  id: string
  rowKind: 'order-line' | 'return-line' | 'movement' | 'summary'
  occurredAt: string
  documentId: string | null
  documentNo: string | null
  documentType: 'customer-order' | 'customer-return' | 'sales-outbound' | 'return-inbound' | 'summary'
  documentStatus: string | null
  movementType: StatisticsMovementType | null
  customerId: string
  customerCode: string
  customerName: string
  salespersonId: string
  product: StatisticsProductSnapshot
  unit: StatisticsUnitSnapshot
  baseQuantityMilli: number
  displayQuantityMilli: number
  pendingDisplayQuantityMilli: number | null
  originalAmountCents: number | null
  discountAmountCents: number | null
  amountCents: number | null
  averageUnitPriceCents: number | null
  fulfillmentRateBasisPoints: number | null
  discountRateBasisPoints: number | null
  documentCount: number
  packageName: string | null
  packageState: ProviderState
  amountState: ProviderState
  sourcePath: string | null
}

export interface OrderStatisticsTotals {
  documentCount: number
  baseQuantityMilli: number
  amountCents: number | null
  amountState: ProviderState
}

export interface OrderStatisticsPage {
  report: OrderStatisticsReportKey
  availability: 'available' | 'unavailable'
  message: string | null
  query: Required<Pick<OrderStatisticsQuery, 'report' | 'documentKind' | 'unitMode' | 'fromDate' | 'toDate' | 'page' | 'pageSize'>> & OrderStatisticsQuery
  items: OrderStatisticsRow[]
  total: number
  totals: OrderStatisticsTotals
  snapshotVersion: string
}

export interface StatisticsPivotConfig {
  report: 'order-by-product' | 'order-by-customer'
  dimensions: StatisticsDimension[]
  measures: StatisticsMeasure[]
}

export interface StatisticsPreferenceRecord {
  actorId: string
  report: StatisticsPivotConfig['report']
  config: StatisticsPivotConfig
}

export interface OrderStatisticsAccess {
  canView: boolean
  canExport: boolean
  amountsVisible: boolean
}

export interface OrderStatisticsFilterOptions {
  customers: Array<{ id: string; code: string; name: string }>
  products: Array<{ skuId: string; skuCode: string; name: string; specification: string }>
}
