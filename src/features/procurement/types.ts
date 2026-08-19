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
  targetType: 'supplier' | 'supplier-product'
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
  result: Supplier | SupplierProductRelation | Supplier[]
}

export interface ProcurementFeatureState {
  schemaVersion: 1
  enterpriseId: EntityId
  suppliers: Supplier[]
  supplierProducts: SupplierProductRelation[]
  auditLogs: SupplierAuditLog[]
  requests: ProcurementRequestRecord[]
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
  productStatus: 'draft' | 'on-sale' | 'off-sale'
  deleted: boolean
  procurementUnitId: EntityId
  procurementUnitName: string
  procurementUnitRateMilli: number
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
