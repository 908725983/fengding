export type EntityId = string
export type InventoryRole = 'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'
export type InventoryStatus = 'normal' | 'insufficient' | 'zero' | 'overstock' | 'unavailable'
export type EntityStatus = 'enabled' | 'disabled'
export type WarehouseType = 'physical' | 'virtual'
export type BatchStatus = 'normal' | 'near-expiry' | 'expired'
export type MovementDirection = 'inbound' | 'outbound'

export interface InventoryActor { actorId: EntityId; role: InventoryRole }

export interface Warehouse {
  id: EntityId; enterpriseId: EntityId; code: string; name: string; type: WarehouseType; status: EntityStatus
  saleProhibited: boolean; contactName: string | null; phone: string | null
  provinceCode: string | null; cityCode: string | null; districtCode: string | null; address: string | null
  createdAt: string; updatedAt: string
}

export type WarehouseDraft = Omit<Warehouse, 'id' | 'enterpriseId' | 'createdAt' | 'updatedAt'>

export interface InventoryLocation {
  id: EntityId; enterpriseId: EntityId; warehouseId: EntityId; code: string; name: string
  status: EntityStatus; note: string | null; createdAt: string; updatedAt: string
}

export type LocationDraft = Omit<InventoryLocation, 'id' | 'enterpriseId' | 'createdAt' | 'updatedAt'>

export interface InventoryThreshold { warehouseId: EntityId; skuId: EntityId; safetyMinimumMilli: number; maximumMilli: number | null }
export interface OpeningBalance { month: string; warehouseId: EntityId; skuId: EntityId; quantityMilli: number }

export interface InventoryBatch {
  id: EntityId; enterpriseId: EntityId; skuId: EntityId; batchNumber: string; tracked: boolean
  productionDate: string | null; expiresOn: string | null; receivedAt: string; costPerBaseUnitCents: number
}

export interface InventoryBalance {
  id: EntityId; enterpriseId: EntityId; warehouseId: EntityId; locationId: EntityId; skuId: EntityId
  batchId: EntityId; quantityMilli: number; updatedAt: string
}

export interface InventoryMovement {
  id: EntityId; enterpriseId: EntityId; requestId: string; sourceType: string; sourceId: string
  direction: MovementDirection; warehouseId: EntityId; locationId: EntityId; skuId: EntityId; batchId: EntityId
  quantityMilli: number; balanceAfterMilli: number; costPerBaseUnitCents: number; operatorId: EntityId; occurredAt: string
}

export interface InventoryChangeLog {
  id: EntityId; enterpriseId: EntityId; action: 'warehouse.saved' | 'location.saved' | 'threshold.saved' | 'location.imported'
  targetId: EntityId; operatorId: EntityId; detail: string; createdAt: string
}

export interface InventoryFeatureState {
  schemaVersion: 1; enterpriseId: EntityId; warehouses: Warehouse[]; locations: InventoryLocation[]
  thresholds: InventoryThreshold[]; openingBalances: OpeningBalance[]; batches: InventoryBatch[]
  balances: InventoryBalance[]; movements: InventoryMovement[]; changeLogs: InventoryChangeLog[]
}

export interface InventorySkuSnapshot {
  skuId: EntityId; skuCode: string; barcode: string | null; productId: EntityId; productName: string
  specification: string; categoryId: EntityId; productStatus: 'draft' | 'on-sale' | 'off-sale'; deleted: boolean
  baseUnitId: EntityId; baseUnitName: string; inventoryUnitId: EntityId; inventoryUnitName: string
  inventoryConversionRateMilli: number; shelfLifeDays: number | null; manageProductionDate: boolean
}

export interface InventoryCatalogProvider {
  getSku(id: EntityId): InventorySkuSnapshot | null
  listSkus(): InventorySkuSnapshot[]
  sourceExists(sourceType: string, sourceId: string): boolean
}

export interface InventoryQuery {
  warehouseId?: EntityId; categoryId?: EntityId; status?: InventoryStatus; keyword?: string
  page?: number; pageSize?: 30
}

export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }

export interface InventoryStockRow {
  warehouse: Warehouse; sku: InventorySkuSnapshot | null; skuId: EntityId; openingMilli: number; currentMilli: number
  pendingOutboundMilli: null; availableMilli: null; inTransitMilli: null; safetyMinimumMilli: number
  maximumMilli: number | null; status: InventoryStatus; costPerBaseUnitCents: number | null; amountCents: number | null
}

export interface InventoryBatchRow {
  warehouse: Warehouse; location: InventoryLocation; batch: InventoryBatch; sku: InventorySkuSnapshot | null
  quantityMilli: number; amountCents: number; status: BatchStatus
}

export interface InventoryMovementRow extends InventoryMovement {
  warehouseName: string; locationName: string; batchNumber: string; productionDate: string | null; expiresOn: string | null
  sku: InventorySkuSnapshot | null; amountCents: number
}

export interface FifoAllocation { balanceId: EntityId; batchId: EntityId; batchNumber: string; locationId: EntityId; quantityMilli: number }
export interface ReferencedFifoAllocation extends FifoAllocation { referenceId: EntityId; skuId: EntityId; movementId?: EntityId }

export interface InventoryCommandBase {
  requestId: string; sourceType: string; sourceId: string; operatorId: EntityId; occurredAt: string
}

export interface ConfirmInboundInput extends InventoryCommandBase {
  warehouseId: EntityId; locationId: EntityId; skuId: EntityId; quantityMilli: number; costPerBaseUnitCents: number
  batchNumber?: string; productionDate?: string | null; expiresOn?: string | null
}

export interface ConfirmOutboundInput extends InventoryCommandBase { warehouseId: EntityId; skuId: EntityId; quantityMilli: number }
export interface ConfirmOutboundBatchInput extends InventoryCommandBase {
  warehouseId: EntityId
  lines: Array<{ referenceId: EntityId; skuId: EntityId; quantityMilli: number }>
}
export interface ReverseOutboundInput extends InventoryCommandBase {
  warehouseId: EntityId
  allocations: Array<{ movementId: EntityId; balanceId: EntityId; locationId: EntityId; batchId: EntityId; skuId: EntityId; quantityMilli: number }>
}
export interface ConfirmReturnInboundInput extends InventoryCommandBase {
  sourceType: 'customer-return'; warehouseId: EntityId; locationId: EntityId
  lines: Array<{ referenceId: EntityId; skuId: EntityId; quantityMilli: number; costPerBaseUnitCents: number; batchNumber: string; productionDate: string | null; expiresOn: string | null }>
}
export interface ReverseReturnInboundInput extends InventoryCommandBase {
  sourceType: 'customer-return-void'; warehouseId: EntityId; movementIds: EntityId[]
}

export interface LocationImportRow { warehouseCode: string; locationCode: string; locationName: string; status: EntityStatus; note: string | null }
export interface LocationImportPreview { rows: LocationImportRow[]; errors: string[] }

export interface InventoryWorkspace {
  stocks: PageResult<InventoryStockRow>; batches: InventoryBatchRow[]; movements: InventoryMovementRow[]
  warehouses: Warehouse[]; locations: InventoryLocation[]; catalogAvailable: boolean
}
