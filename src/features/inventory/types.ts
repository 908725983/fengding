export type EntityId = string
export type InventoryRole = 'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'
export type InventoryStatus = 'normal' | 'insufficient' | 'zero' | 'overstock' | 'unavailable'
export type EntityStatus = 'enabled' | 'disabled'
export type WarehouseType = 'physical' | 'virtual'
export type BatchStatus = 'normal' | 'near-expiry' | 'expired'
export type MovementDirection = 'inbound' | 'outbound'
export type InventoryTransferStatus = 'pending-review' | 'approved' | 'shipped' | 'received' | 'rejected'
export type InventoryOtherStatus = 'pending-review' | 'approved' | 'completed' | 'rejected'
export type InventoryOtherOutboundType = 'damage' | 'consume' | 'gift' | 'other'
export type InventoryOtherInboundType = 'surplus' | 'return' | 'gift' | 'other'
export type InventoryStocktakeStatus = 'pending' | 'counting' | 'pending-review' | 'completed'
export type InventoryStocktakeType = 'full' | 'sample'
export type InventoryStocktakeScopeKind = 'all' | 'category' | 'brand' | 'skus'
export type InventoryCostAdjustmentStatus = 'pending-review' | 'effective'

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
export interface InventoryAverageCost { warehouseId: EntityId; skuId: EntityId; costPerBaseUnitCents: number; version: number; updatedAt: string }
export interface InventoryCostHistory { id: EntityId; enterpriseId: EntityId; warehouseId: EntityId; skuId: EntityId; previousCostPerBaseUnitCents: number; nextCostPerBaseUnitCents: number; quantityMilli: number; valueDeltaCents: number; reason: string; effectiveAt: string; operatorId: EntityId; sourceId: EntityId; createdAt: string }
export interface InventoryStocktakeLine { id: EntityId; skuId: EntityId; bookQuantityMilli: number; countedQuantityMilli: number | null; deltaQuantityMilli: number | null; costPerBaseUnitCents: number | null; note: string | null }
export interface InventoryStocktake {
  id: EntityId; enterpriseId: EntityId; code: string; warehouseId: EntityId; type: InventoryStocktakeType
  scopeKind: InventoryStocktakeScopeKind; scopeValue: string | null; scopeSkuIds: EntityId[]; operatorId: EntityId; occurredAt: string
  status: InventoryStocktakeStatus; lines: InventoryStocktakeLine[]; version: number; snapshotVersion: string | null
  createdAt: string; updatedAt: string; adjustmentRequestId: string | null
}
export interface InventoryCostAdjustment {
  id: EntityId; enterpriseId: EntityId; code: string; warehouseId: EntityId; skuId: EntityId
  previousCostPerBaseUnitCents: number; nextCostPerBaseUnitCents: number; reason: 'purchase-price' | 'market' | 'other'
  reasonNote: string | null; effectiveAt: string; note: string | null; status: InventoryCostAdjustmentStatus
  version: number; createdAt: string; updatedAt: string; historyId: EntityId | null
}
export interface InventoryClosingSnapshot {
  warehouseId: EntityId; skuId: EntityId; quantityMilli: number
  averageCostPerBaseUnitCents: number; valueCents: number; sourceVersion: string
}
export interface InventoryClosing { id: EntityId; enterpriseId: EntityId; month: string; status: 'completed'; snapshots: InventoryClosingSnapshot[]; sourceVersion: string; operatorId: EntityId; createdAt: string; requestId: string }

export type ProcessingRecipeMethod = 'combination' | 'disassembly' | 'assembly'
export type ProcessingPlanStatus = 'pending' | 'processing' | 'completed' | 'cancelled'
export type ProcessingOrderStatus = 'pending-picking' | 'picking' | 'processing' | 'completed'
export type MaterialPickStatus = 'pending-outbound' | 'outbound'
export type MaterialReturnStatus = 'pending-inbound' | 'inbound'

export interface ProcessingRecipeOutputLine {
  id: EntityId; skuId: EntityId; quantityMilli: number; warehouseId: EntityId
  primary: boolean; costAllocationBasisPoints: number
}
export interface ProcessingRecipeMaterialLine { id: EntityId; skuId: EntityId; quantityMilli: number; warehouseId: EntityId }
export interface ProcessingRecipe {
  id: EntityId; enterpriseId: EntityId; code: string; name: string; method: ProcessingRecipeMethod
  category: string | null; note: string | null; outputs: ProcessingRecipeOutputLine[]; materials: ProcessingRecipeMaterialLine[]
  creatorId: EntityId; version: number; createdAt: string; updatedAt: string
}
export interface ProcessingRecipeDraft {
  code: string; name: string; method: ProcessingRecipeMethod; category?: string | null; note?: string | null
  outputs: Array<Omit<ProcessingRecipeOutputLine, 'id'>>; materials: Array<Omit<ProcessingRecipeMaterialLine, 'id'>>
}
export interface ProcessingRecipeSnapshot extends Omit<ProcessingRecipe, 'enterpriseId' | 'creatorId' | 'createdAt' | 'updatedAt'> {}

export interface ProcessingSalesOrderLineSnapshot {
  orderLineId: EntityId; skuId: EntityId; productName: string; skuCode: string
  orderedQuantityMilli: number; fulfilledQuantityMilli: number; remainingQuantityMilli: number
}
export interface ProcessingSalesOrderSnapshot {
  orderId: EntityId; orderNo: string; status: string; customerName: string; updatedAt: string
  lines: ProcessingSalesOrderLineSnapshot[]
}
export interface ProcessingOrderSourceProvider {
  listEligibleOrders(): { state: 'available' | 'unavailable'; items: ProcessingSalesOrderSnapshot[]; version: string; message: string | null }
  getEligibleOrder(orderId: EntityId): ProcessingSalesOrderSnapshot | null
}

export interface ProcessingPlan {
  id: EntityId; enterpriseId: EntityId; code: string; sourceType: 'direct' | 'sales-order'; sourceOrder: ProcessingSalesOrderSnapshot | null
  recipeSnapshot: ProcessingRecipeSnapshot; plannedAt: string; plannedQuantityMilli: number; processingWarehouseId: EntityId
  note: string | null; status: ProcessingPlanStatus; completedPrimaryQuantityMilli: number; creatorId: EntityId
  version: number; createdAt: string; updatedAt: string
}
export interface ProcessingPlanDraft {
  sourceType: 'direct' | 'sales-order'; salesOrderId?: EntityId | null; salesOrderLineId?: EntityId | null
  recipeId: EntityId; plannedAt: string; plannedQuantityMilli: number; processingWarehouseId: EntityId; note?: string | null
}
export interface ProcessingOrderOutputLine {
  id: EntityId; recipeLineId: EntityId; skuId: EntityId; plannedQuantityMilli: number; actualQuantityMilli: number | null
  warehouseId: EntityId; locationId: EntityId | null; batchNumber: string | null; productionDate: string | null
  expiresOn: string | null; costAllocationBasisPoints: number; allocatedCostCents: number | null; inboundMovementIds: EntityId[]
}
export interface ProcessingOrderMaterialLine {
  id: EntityId; recipeLineId: EntityId; skuId: EntityId; requiredQuantityMilli: number; warehouseId: EntityId
  pickedQuantityMilli: number; returnedQuantityMilli: number
}
export interface ProcessingOrder {
  id: EntityId; enterpriseId: EntityId; code: string; planId: EntityId | null; recipeSnapshot: ProcessingRecipeSnapshot
  plannedQuantityMilli: number; processingWarehouseId: EntityId; note: string | null; status: ProcessingOrderStatus
  outputs: ProcessingOrderOutputLine[]; materials: ProcessingOrderMaterialLine[]; creatorId: EntityId
  version: number; createdAt: string; updatedAt: string; completedAt: string | null; completionRequestId: string | null
}
export interface ProcessingOrderDraft { planId?: EntityId | null; recipeId: EntityId; plannedQuantityMilli: number; processingWarehouseId: EntityId; note?: string | null }

export interface MaterialPickLine { id: EntityId; materialLineId: EntityId; skuId: EntityId; requiredQuantityMilli: number; actualQuantityMilli: number; warehouseId: EntityId; movementIds: EntityId[] }
export interface MaterialPick {
  id: EntityId; enterpriseId: EntityId; code: string; processingOrderId: EntityId; warehouseId: EntityId; occurredAt: string
  status: MaterialPickStatus; lines: MaterialPickLine[]; note: string | null; version: number; createdAt: string; updatedAt: string; requestId: string | null
}
export interface MaterialPickDraft { processingOrderId: EntityId; warehouseId: EntityId; occurredAt: string; lines: Array<{ materialLineId: EntityId; actualQuantityMilli: number }>; note?: string | null }

export interface MaterialReturnLine {
  id: EntityId; materialLineId: EntityId; skuId: EntityId; pickMovementId: EntityId; quantityMilli: number; warehouseId: EntityId
  locationId: EntityId; batchId: EntityId; batchNumber: string; productionDate: string | null; expiresOn: string | null
  costPerBaseUnitCents: number; movementIds: EntityId[]
}
export interface MaterialReturn {
  id: EntityId; enterpriseId: EntityId; code: string; processingOrderId: EntityId; warehouseId: EntityId; occurredAt: string
  status: MaterialReturnStatus; lines: MaterialReturnLine[]; note: string | null; version: number; createdAt: string; updatedAt: string; requestId: string | null
}
export interface MaterialReturnDraft { processingOrderId: EntityId; warehouseId: EntityId; occurredAt: string; lines: Array<{ materialLineId: EntityId; pickMovementId: EntityId; quantityMilli: number; locationId: EntityId }>; note?: string | null }
export interface CompleteProcessingOrderInput {
  requestId: string; processingOrderId: EntityId; expectedVersion: number; occurredAt: string
  outputs: Array<{ outputLineId: EntityId; actualQuantityMilli: number; locationId: EntityId; batchNumber?: string | null; productionDate?: string | null; expiresOn?: string | null }>
  finalReturn?: MaterialReturnDraft | null
}
export interface ProcessingRequestRecord { requestId: string; kind: 'material-pick' | 'material-return' | 'processing-completion'; targetId: EntityId; appliedAt: string }

export interface ProcessingListQuery {
  status?: string; fromDate?: string; toDate?: string; keyword?: string; recipeId?: string; skuId?: string
  creatorId?: string; page?: number; pageSize?: 10 | 30 | 50 | 100
}
export interface ProcessingYieldRow {
  id: string; processingOrderId: EntityId; processingOrderCode: string; createdAt: string; recipeId: EntityId; recipeCode: string; recipeName: string
  outputSkuId: EntityId; materialSkuId: EntityId; formulaMaterialQuantityMilli: number; actualUsedQuantityMilli: number
  actualOutputQuantityMilli: number; expectedOutputQuantityMilli: number | null; yieldBasisPoints: number | null
}

export type PickingTaskStatus = 'pending' | 'picking' | 'completed' | 'cancelled'
export type PickingWaveStatus = 'pending' | 'picking' | 'completed' | 'cancelled'
export type PickingDifferenceStatus = 'pending' | 'continue-picking' | 'accepted-short'
export type DeliveryTaskStatus = 'pending' | 'delivering' | 'completed' | 'cancelled'
export type DeliveryRouteStatus = 'enabled' | 'disabled'
export type DeliveryVehicleStatus = 'idle' | 'dispatching' | 'maintenance'
export type DeliveryVehicleType = 'van' | 'truck-4.2m' | 'truck-7.6m' | 'truck-9.6m' | 'other'
export type PickingLabelType = 'product' | 'box' | 'order'

export interface PickingOrderLineSnapshot {
  orderLineId: EntityId; skuId: EntityId; skuCode: string; productName: string; specification: string
  unitId: EntityId; unitName: string; conversionRateMilli: number; categoryId: EntityId | null
  orderedQuantityMilli: number; fulfilledQuantityMilli: number; remainingQuantityMilli: number; weightPerBaseUnitGrams: number | null
}
export interface PickingOrderSnapshot {
  orderId: EntityId; orderNo: string; status: string; customerName: string; warehouseId: EntityId; warehouseName: string
  requestedDeliveryAt: string; deliveryMethod: 'door-delivery' | 'logistics' | 'customer-pickup'; updatedAt: string
  province: string; city: string; district: string; address: string; urgency: null; lines: PickingOrderLineSnapshot[]
}
export interface PickingOrderProviderResult { state: 'available' | 'unavailable'; items: PickingOrderSnapshot[]; version: string; message: string | null }
export interface PendingPickingOrderRow { order: PickingOrderSnapshot; pickingStatus: 'pending' | 'picking' | 'picked'; ownerType: 'task' | 'wave' | null; ownerId: EntityId | null }
export interface PickingOutboundCommand {
  requestId: string; orderId: EntityId; expectedUpdatedAt: string; warehouseId: EntityId
  lines: Array<{ orderLineId: EntityId; quantityMilli: number; conversionRateMilli: number }>; finishShort: boolean; reason: string | null
}
export interface PickingShipmentCommand { requestId: string; orderId: EntityId; expectedUpdatedAt: string; remark: string | null }
export interface PickingOrderCoordinator {
  listPickingOrders(): PickingOrderProviderResult
  listDeliveryOrders(): PickingOrderProviderResult
  getPickingOrder(orderId: EntityId): PickingOrderSnapshot | null
  confirmOutbounds(actor: InventoryActor, inputs: PickingOutboundCommand[]): Array<{ orderId: EntityId; outboundId: EntityId | null; differenceId: EntityId | null; updatedAt: string }>
  confirmShipments(actor: InventoryActor, inputs: PickingShipmentCommand[]): Array<{ orderId: EntityId; shipmentId: EntityId; updatedAt: string }>
  checkpoint(): unknown
  restore(checkpoint: unknown): void
}
export interface DeliveryStaffProvider { listStaff(): Array<{ id: EntityId; name: string }> }

export interface PickingTaskLine {
  id: EntityId; orderLineId: EntityId; skuId: EntityId; skuCode: string; productName: string; specification: string
  unitName: string; conversionRateMilli: number; expectedQuantityMilli: number; actualQuantityMilli: number | null
  suggestedLocationIds: EntityId[]; status: 'pending' | 'picked' | 'difference'
}
export interface PickingTask {
  id: EntityId; enterpriseId: EntityId; code: string; orderSnapshot: PickingOrderSnapshot; warehouseId: EntityId
  status: PickingTaskStatus; pickerId: EntityId | null; lines: PickingTaskLine[]; version: number
  createdAt: string; updatedAt: string; completedAt: string | null; cancelledAt: string | null
  outboundId: EntityId | null; orderDifferenceId: EntityId | null
}
export interface PickingDifference {
  id: EntityId; enterpriseId: EntityId; code: string; ownerType: 'task' | 'wave'; ownerId: EntityId; orderId: EntityId
  lines: Array<{ orderLineId: EntityId; skuId: EntityId; expectedQuantityMilli: number; actualQuantityMilli: number; differenceQuantityMilli: number }>
  reason: string; status: PickingDifferenceStatus; orderDifferenceId: EntityId | null; createdAt: string; resolvedAt: string | null; version: number
}
export interface PickingWaveAllocation {
  orderId: EntityId; orderLineId: EntityId; skuId: EntityId; expectedQuantityMilli: number; actualQuantityMilli: number | null
}
export interface PickingWave {
  id: EntityId; enterpriseId: EntityId; code: string; strategy: 'time' | 'area' | 'route' | 'category'; warehouseId: EntityId
  cutoffAt: string; routeId: EntityId | null; area: string | null; categoryId: EntityId | null; orders: PickingOrderSnapshot[]
  allocations: PickingWaveAllocation[]; status: PickingWaveStatus; pickerId: EntityId | null; version: number
  createdAt: string; updatedAt: string; completedAt: string | null; cancelledAt: string | null
  outboundResults: Array<{ orderId: EntityId; outboundId: EntityId | null; differenceId: EntityId | null }>
}
export interface PickingWaveDraft {
  strategy: PickingWave['strategy']; warehouseId: EntityId; orderIds: EntityId[]; cutoffAt: string
  routeId?: EntityId | null; area?: string | null; categoryId?: EntityId | null
}
export interface DeliveryRouteStop { id: EntityId; name: string; province: string; city: string; district: string; address: string; sequence: number }
export interface DeliveryRoute {
  id: EntityId; enterpriseId: EntityId; code: string; name: string; province: string; city: string; district: string
  stops: DeliveryRouteStop[]; defaultDriverId: EntityId | null; defaultVehicleId: EntityId | null; estimatedMinutes: number | null
  status: DeliveryRouteStatus; note: string | null; version: number; createdAt: string; updatedAt: string
}
export interface DeliveryRouteDraft {
  name: string; province: string; city: string; district: string; stops: Array<Omit<DeliveryRouteStop, 'id' | 'sequence'>>
  defaultDriverId?: EntityId | null; defaultVehicleId?: EntityId | null; estimatedMinutes?: number | null
  status: DeliveryRouteStatus; note?: string | null
}
export interface DeliveryVehicle {
  id: EntityId; enterpriseId: EntityId; plateNumber: string; type: DeliveryVehicleType; otherType: string | null
  capacityKg: number; defaultDriverId: EntityId | null; status: DeliveryVehicleStatus; note: string | null
  version: number; createdAt: string; updatedAt: string
}
export interface DeliveryVehicleDraft { plateNumber: string; type: DeliveryVehicleType; otherType?: string | null; capacityKg: number; defaultDriverId?: EntityId | null; status: 'idle' | 'maintenance'; note?: string | null }
export interface DeliveryTask {
  id: EntityId; enterpriseId: EntityId; code: string; routeSnapshot: DeliveryRoute; driverSnapshot: { id: EntityId; name: string }
  vehicleSnapshot: DeliveryVehicle; orders: PickingOrderSnapshot[]; plannedDepartureAt: string; actualDepartureAt: string | null
  completedAt: string | null; note: string | null; status: DeliveryTaskStatus; shipmentIds: EntityId[]
  version: number; createdAt: string; updatedAt: string; cancelledAt: string | null
}
export interface DeliveryTaskDraft { routeId: EntityId; driverId: EntityId; vehicleId: EntityId; orderIds: EntityId[]; plannedDepartureAt: string; note?: string | null }
export interface PickingLabel {
  id: EntityId; enterpriseId: EntityId; code: string; sourceType: 'task' | 'wave'; sourceId: EntityId; type: PickingLabelType
  orderId: EntityId; orderNo: string; skuId: EntityId | null; productName: string | null; quantityMilli: number
  locationText: string | null; barcode: string; templateId: string; printCount: number; createdAt: string; lastPrintedAt: string | null; version: number
}
export interface PickingLabelDraft {
  sourceType: 'task' | 'wave'; sourceId: EntityId; type: PickingLabelType; orderId: EntityId
  skuId?: EntityId | null; productName?: string | null; quantityMilli: number; locationText?: string | null; templateId: string
}
export interface PickingRequestRecord { requestId: string; kind: 'picking-outbound' | 'wave-outbound' | 'delivery-start' | 'label-print'; targetId: EntityId; appliedAt: string }
export interface PickingListQuery { status?: string; fromDate?: string; toDate?: string; keyword?: string; warehouseId?: string; page?: number; pageSize?: 10 | 30 | 50 | 100 }

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
  transfers?: InventoryTransfer[]; otherOutbounds?: InventoryOtherOutbound[]; otherInbounds?: InventoryOtherInbound[]
  stocktakes?: InventoryStocktake[]; costAdjustments?: InventoryCostAdjustment[]; costHistories?: InventoryCostHistory[]; closings?: InventoryClosing[]
  averageCosts?: InventoryAverageCost[]; inventoryLocks?: Array<{ stocktakeId: EntityId; warehouseId: EntityId; skuId: EntityId }>
  processingRecipes?: ProcessingRecipe[]; processingPlans?: ProcessingPlan[]; processingOrders?: ProcessingOrder[]
  materialPicks?: MaterialPick[]; materialReturns?: MaterialReturn[]; processingRequests?: ProcessingRequestRecord[]
  pickingTasks?: PickingTask[]; pickingWaves?: PickingWave[]; pickingDifferences?: PickingDifference[]
  deliveryRoutes?: DeliveryRoute[]; deliveryVehicles?: DeliveryVehicle[]; deliveryTasks?: DeliveryTask[]
  pickingLabels?: PickingLabel[]; pickingRequests?: PickingRequestRecord[]
  operationLocks?: { inventoryLocked: boolean; monthClosedThrough: string | null }
}

export interface InventoryDocumentLine { id: EntityId; skuId: EntityId; quantityMilli: number; batchId?: EntityId; batchNumber?: string | null; productionDate?: string | null; expiresOn?: string | null; costPerBaseUnitCents: number; note: string | null }
export interface InventoryTransfer {
  id: EntityId; enterpriseId: EntityId; code: string; sourceWarehouseId: EntityId; targetWarehouseId: EntityId; occurredAt: string
  status: InventoryTransferStatus; lines: InventoryDocumentLine[]; note: string | null; version: number; createdAt: string; updatedAt: string
  outboundRequestId: string | null; inboundRequestId: string | null; outboundMovementIds: EntityId[]
}
export interface InventoryOtherOutbound {
  id: EntityId; enterpriseId: EntityId; code: string; warehouseId: EntityId; type: InventoryOtherOutboundType; occurredAt: string
  status: InventoryOtherStatus; lines: InventoryDocumentLine[]; note: string | null; version: number; createdAt: string; updatedAt: string
}
export interface InventoryOtherInbound {
  id: EntityId; enterpriseId: EntityId; code: string; warehouseId: EntityId; type: InventoryOtherInboundType; occurredAt: string
  relatedDocumentNo: string | null; supplierId: string | null; status: InventoryOtherStatus; lines: InventoryDocumentLine[]; note: string | null
  version: number; createdAt: string; updatedAt: string
}
export interface InventoryDocumentListQuery { status?: string; fromDate?: string; toDate?: string; keyword?: string; page?: number; pageSize?: 10 | 30 | 50 | 100 }
export interface InventoryDocumentPage<T> { items: T[]; total: number; page: number; pageSize: number }
export interface InventoryDocumentDraftLine { skuId: string; quantityMilli: number; costPerBaseUnitCents: number; batchNumber?: string | null; productionDate?: string | null; expiresOn?: string | null; note?: string | null }
export interface InventoryTransferDraft { sourceWarehouseId: string; targetWarehouseId: string; occurredAt: string; lines: InventoryDocumentDraftLine[]; note?: string | null }
export interface InventoryOtherOutboundDraft { warehouseId: string; type: InventoryOtherOutboundType; occurredAt: string; lines: InventoryDocumentDraftLine[]; note?: string | null }
export interface InventoryOtherInboundDraft { warehouseId: string; type: InventoryOtherInboundType; occurredAt: string; relatedDocumentNo?: string | null; supplierId?: string | null; lines: InventoryDocumentDraftLine[]; note?: string | null }
export interface InventoryStocktakeDraft { warehouseId: string; type: InventoryStocktakeType; scopeKind?: InventoryStocktakeScopeKind; scopeValue?: string | null; scopeSkuIds?: string[]; operatorId: string; occurredAt: string }
export interface InventoryStocktakePage extends InventoryDocumentPage<InventoryStocktake> {}
export interface InventoryCostAdjustmentDraft { warehouseId: string; skuId: string; nextCostPerBaseUnitCents: number; reason: 'purchase-price' | 'market' | 'other'; reasonNote?: string | null; effectiveAt: string; note?: string | null }
export interface InventoryCostAdjustmentPage extends InventoryDocumentPage<InventoryCostAdjustment> {}
export interface InventoryClosingPage { year: number; items: InventoryClosing[]; sourceVersion: string; nextClosableMonth: string | null; currentMonth: string }

export interface InventorySkuSnapshot {
  skuId: EntityId; skuCode: string; barcode: string | null; productId: EntityId; productName: string
  specification: string; categoryId: EntityId; brandId: EntityId | null; productStatus: 'draft' | 'on-sale' | 'off-sale'; deleted: boolean
  baseUnitId: EntityId; baseUnitName: string; inventoryUnitId: EntityId; inventoryUnitName: string
  inventoryConversionRateMilli: number; shelfLifeDays: number | null; manageProductionDate: boolean
}

export interface InventoryCategorySnapshot {
  id: EntityId; name: string; parentId: EntityId | null; status: 'active' | 'inactive'
}

export interface InventoryCatalogProvider {
  getSku(id: EntityId): InventorySkuSnapshot | null
  listSkus(): InventorySkuSnapshot[]
  listCategories?(): InventoryCategorySnapshot[]
  sourceExists(sourceType: string, sourceId: string): boolean
}

export type InventoryStatisticsReportKey = 'inventory-ledger' | 'warehouse-ledger' | 'movement-summary' | 'warehouse-receipts-issues'
export interface InventoryStatisticsQuery {
  report?: InventoryStatisticsReportKey; fromDate?: string; toDate?: string; warehouseId?: EntityId; categoryId?: EntityId
  page?: number; pageSize?: 10 | 30 | 50 | 100
}
export interface InventoryStatisticsSkuRow {
  kind: 'sku'; id: string; skuId: EntityId; sku: InventorySkuSnapshot | null
  openingQuantityMilli: number; openingAmountCents: number | null
  inboundQuantityMilli: number; inboundAmountCents: number | null
  outboundQuantityMilli: number; outboundAmountCents: number | null
  endingQuantityMilli: number; endingAmountCents: number | null; costAdjustmentCents: number | null
}
export interface InventoryStatisticsWarehouseRow {
  kind: 'warehouse'; id: string; warehouse: Warehouse
  openingQuantityMilli: number; openingAmountCents: number | null
  inboundQuantityMilli: number; inboundAmountCents: number | null; inboundDocumentCount: number
  outboundQuantityMilli: number; outboundAmountCents: number | null; outboundDocumentCount: number
  endingQuantityMilli: number; endingAmountCents: number | null; costAdjustmentCents: number | null
}
export type InventoryStatisticsRow = InventoryStatisticsSkuRow | InventoryStatisticsWarehouseRow
export interface InventoryStatisticsTotals {
  openingQuantityMilli: number; openingAmountCents: number | null
  inboundQuantityMilli: number; inboundAmountCents: number | null; inboundDocumentCount: number
  outboundQuantityMilli: number; outboundAmountCents: number | null; outboundDocumentCount: number
  endingQuantityMilli: number; endingAmountCents: number | null; netQuantityMilli: number; netAmountCents: number | null
  costAdjustmentCents: number | null
}
export interface InventoryStatisticsPage {
  report: InventoryStatisticsReportKey
  query: Required<Pick<InventoryStatisticsQuery, 'report' | 'fromDate' | 'toDate' | 'page' | 'pageSize'>> & Pick<InventoryStatisticsQuery, 'warehouseId' | 'categoryId'>
  items: InventoryStatisticsRow[]; total: number; totals: InventoryStatisticsTotals
  snapshotVersion: string; availability: 'available' | 'unavailable'; catalogState: 'available' | 'partial'
  periodState: 'current' | 'closed' | 'unclosed'; message: string | null; amountsVisible: boolean
}
export interface InventoryStatisticsFilterOptions {
  warehouses: Array<{ id: EntityId; code: string; name: string; status: EntityStatus }>
  categories: Array<{ id: EntityId; name: string }>; catalogState: 'available' | 'partial'
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
  warehouses: Warehouse[]; locations: InventoryLocation[]; categories: InventoryCategorySnapshot[]; catalogAvailable: boolean
}
