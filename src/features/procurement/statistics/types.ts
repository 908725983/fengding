import type { ProcurementActor, ProcurementRole } from '../types'

export type PurchaseStatisticsReportKey =
  | 'purchase-order-line-detail'
  | 'purchase-order-by-supplier'
  | 'purchase-movement-line-detail'
  | 'purchase-movement-by-product'
  | 'purchase-movement-by-supplier'

export type PurchaseStatisticsMovementType = 'purchase-inbound' | 'purchase-return-outbound'
export type PurchaseStatisticsValueState = 'available' | 'unavailable'

export interface PurchaseStatisticsActor extends ProcurementActor { role: ProcurementRole }

export interface PurchaseStatisticsQuery {
  report: PurchaseStatisticsReportKey
  fromDate?: string
  toDate?: string
  supplierId?: string
  keyword?: string
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface PurchaseStatisticsProductSnapshot {
  skuId: string
  productCode: string
  skuCode: string
  name: string
  specification: string
  barcode: string | null
  barcodeState: PurchaseStatisticsValueState
  categoryId: string | null
  categoryName: string | null
  categoryState: PurchaseStatisticsValueState
}

export interface PurchaseStatisticsUnitSnapshot {
  baseUnitId: string | null
  baseUnitName: string | null
  baseUnitState: PurchaseStatisticsValueState
  procurementUnitId: string
  procurementUnitName: string
  procurementUnitRateMilli: number
}

export interface PurchaseStatisticsRow {
  id: string
  rowKind: 'order-line' | 'movement' | 'summary'
  occurredAt: string
  documentId: string | null
  documentNo: string | null
  sourceDocumentId: string | null
  sourceDocumentNo: string | null
  documentStatus: string | null
  movementType: PurchaseStatisticsMovementType | null
  supplierId: string
  supplierCode: string | null
  supplierName: string
  warehouseId: string | null
  warehouseName: string | null
  warehouseState: PurchaseStatisticsValueState
  product: PurchaseStatisticsProductSnapshot
  unit: PurchaseStatisticsUnitSnapshot
  packageQuantity: number
  baseQuantityMilli: number
  pendingPackageQuantity: number | null
  pendingBaseQuantityMilli: number | null
  unitPriceCents: number | null
  amountCents: number | null
  amountState: PurchaseStatisticsValueState
  documentCount: number
  sourcePath: string | null
}

export interface PurchaseStatisticsTotals {
  documentCount: number
  baseQuantityMilli: number
  amountCents: number | null
  amountState: PurchaseStatisticsValueState
  purchaseOrderCount: number
  purchaseReturnCount: number
  purchaseOrderAmountCents: number | null
  purchaseReturnAmountCents: number | null
  netAmountCents: number | null
}

export interface PurchaseStatisticsPage {
  report: PurchaseStatisticsReportKey
  availability: 'available' | 'unavailable'
  message: string | null
  query: PurchaseStatisticsQuery & Required<Pick<PurchaseStatisticsQuery, 'fromDate' | 'toDate' | 'page' | 'pageSize'>>
  items: PurchaseStatisticsRow[]
  total: number
  totals: PurchaseStatisticsTotals
  snapshotVersion: string
}

export interface PurchaseStatisticsAccess { canView: boolean; canExport: boolean; amountsVisible: boolean }
export interface PurchaseStatisticsFilterOptions {
  suppliers: Array<{ id: string; code: string | null; name: string }>
  products: Array<{ skuId: string; skuCode: string; name: string; specification: string }>
}
