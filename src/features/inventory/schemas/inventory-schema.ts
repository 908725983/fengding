import type { InventoryFeatureState, LocationDraft, WarehouseDraft } from '../types'

export interface InventoryValidationIssue { path: string; message: string }
export class InventoryValidationError extends Error {
  readonly code = 'INVENTORY_VALIDATION_FAILED'
  constructor(readonly issues: InventoryValidationIssue[]) { super(issues.map((item) => `${item.path}: ${item.message}`).join('；')); this.name = 'InventoryValidationError' }
}

function required(issues: InventoryValidationIssue[], path: string, value: string, max = 40): void {
  const text = value.trim()
  if (!text) issues.push({ path, message: '不能为空' })
  else if (text.length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}
function optional(issues: InventoryValidationIssue[], path: string, value: string | null, max: number): void {
  if (value !== null && value.trim().length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}
function milli(issues: InventoryValidationIssue[], path: string, value: number, allowZero = true): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) issues.push({ path, message: `必须是${allowZero ? '非负' : '正'}整数毫单位` })
}

export function validateWarehouseDraft(draft: WarehouseDraft): InventoryValidationIssue[] {
  const issues: InventoryValidationIssue[] = []
  required(issues, 'code', draft.code); required(issues, 'name', draft.name)
  optional(issues, 'contactName', draft.contactName, 40); optional(issues, 'phone', draft.phone, 40)
  optional(issues, 'provinceCode', draft.provinceCode, 40); optional(issues, 'cityCode', draft.cityCode, 40); optional(issues, 'districtCode', draft.districtCode, 40); optional(issues, 'address', draft.address, 200)
  return issues
}
export function assertWarehouseDraft(draft: WarehouseDraft): void { const issues = validateWarehouseDraft(draft); if (issues.length) throw new InventoryValidationError(issues) }

export function validateLocationDraft(draft: LocationDraft): InventoryValidationIssue[] {
  const issues: InventoryValidationIssue[] = []
  required(issues, 'warehouseId', draft.warehouseId, 100); required(issues, 'code', draft.code); required(issues, 'name', draft.name); optional(issues, 'note', draft.note, 500)
  return issues
}
export function assertLocationDraft(draft: LocationDraft): void { const issues = validateLocationDraft(draft); if (issues.length) throw new InventoryValidationError(issues) }

export function assertInventoryFeatureState(state: InventoryFeatureState): void {
  const issues: InventoryValidationIssue[] = []
  if (state.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: '必须为 1' })
  required(issues, 'enterpriseId', state.enterpriseId, 100)
  const collections = [state.warehouses, state.locations, state.batches, state.balances, state.movements, state.changeLogs]
  for (const collection of collections) {
    const ids = collection.map((item) => item.id)
    if (new Set(ids).size !== ids.length) issues.push({ path: 'entity.id', message: '同集合 ID 必须唯一' })
    if (collection.some((item) => item.enterpriseId !== state.enterpriseId)) issues.push({ path: 'enterpriseId', message: '实体企业不一致' })
  }
  const normalized = (value: string) => value.trim().toLocaleLowerCase()
  if (new Set(state.warehouses.map((item) => normalized(item.code))).size !== state.warehouses.length) issues.push({ path: 'warehouses.code', message: '企业内必须唯一' })
  if (new Set(state.warehouses.map((item) => normalized(item.name))).size !== state.warehouses.length) issues.push({ path: 'warehouses.name', message: '企业内必须唯一' })
  const warehouseIds = new Set(state.warehouses.map((item) => item.id)); const locationIds = new Set(state.locations.map((item) => item.id)); const batchIds = new Set(state.batches.map((item) => item.id))
  for (const warehouse of state.warehouses) validateWarehouseDraft(warehouse).forEach((issue) => issues.push({ ...issue, path: `warehouses.${warehouse.id}.${issue.path}` }))
  for (const location of state.locations) {
    validateLocationDraft(location).forEach((issue) => issues.push({ ...issue, path: `locations.${location.id}.${issue.path}` }))
    if (!warehouseIds.has(location.warehouseId)) issues.push({ path: `locations.${location.id}.warehouseId`, message: '仓库不存在' })
  }
  const locationKeys = state.locations.flatMap((item) => [`${item.warehouseId}|code|${normalized(item.code)}`, `${item.warehouseId}|name|${normalized(item.name)}`])
  if (new Set(locationKeys).size !== locationKeys.length) issues.push({ path: 'locations', message: '仓内编码和名称必须分别唯一' })
  const batchKeys = state.batches.map((item) => `${item.skuId}|${normalized(item.batchNumber)}`)
  if (new Set(batchKeys).size !== batchKeys.length) issues.push({ path: 'batches.batchNumber', message: 'SKU 批次号必须唯一' })
  for (const batch of state.batches) {
    required(issues, `batches.${batch.id}.batchNumber`, batch.batchNumber, 80)
    if (batch.productionDate && Date.parse(batch.productionDate) > Date.parse(batch.receivedAt)) issues.push({ path: `batches.${batch.id}.productionDate`, message: '不能晚于入库时间' })
    if (batch.productionDate && batch.expiresOn && batch.expiresOn < batch.productionDate) issues.push({ path: `batches.${batch.id}.expiresOn`, message: '不能早于生产日期' })
    if (!Number.isSafeInteger(batch.costPerBaseUnitCents) || batch.costPerBaseUnitCents < 0) issues.push({ path: `batches.${batch.id}.costPerBaseUnitCents`, message: '必须是非负整数分' })
  }
  const balanceKeys = state.balances.map((item) => `${item.warehouseId}|${item.locationId}|${item.skuId}|${item.batchId}`)
  if (new Set(balanceKeys).size !== balanceKeys.length) issues.push({ path: 'balances', message: '余额粒度必须唯一' })
  for (const balance of state.balances) {
    milli(issues, `balances.${balance.id}.quantityMilli`, balance.quantityMilli)
    const location = state.locations.find((item) => item.id === balance.locationId); const batch = state.batches.find((item) => item.id === balance.batchId)
    if (!warehouseIds.has(balance.warehouseId)) issues.push({ path: `balances.${balance.id}.warehouseId`, message: '仓库不存在' })
    if (!locationIds.has(balance.locationId) || location?.warehouseId !== balance.warehouseId) issues.push({ path: `balances.${balance.id}.locationId`, message: '库位不属于仓库' })
    if (!batchIds.has(balance.batchId) || batch?.skuId !== balance.skuId) issues.push({ path: `balances.${balance.id}.batchId`, message: '批次不属于 SKU' })
  }
  const processingEntities = [...(state.processingRecipes ?? []), ...(state.processingPlans ?? []), ...(state.processingOrders ?? []), ...(state.materialPicks ?? []), ...(state.materialReturns ?? [])]
  if (new Set(processingEntities.map((item) => item.id)).size !== processingEntities.length) issues.push({ path: 'processing.id', message: '加工实体 ID 必须唯一' })
  if (processingEntities.some((item) => item.enterpriseId !== state.enterpriseId)) issues.push({ path: 'processing.enterpriseId', message: '加工实体企业不一致' })
  const recipeCodes = (state.processingRecipes ?? []).map((item) => normalized(item.code))
  if (new Set(recipeCodes).size !== recipeCodes.length) issues.push({ path: 'processingRecipes.code', message: '配方编码必须唯一' })
  for (const recipe of state.processingRecipes ?? []) {
    required(issues, `processingRecipes.${recipe.id}.code`, recipe.code, 40); required(issues, `processingRecipes.${recipe.id}.name`, recipe.name, 100)
    if (!recipe.outputs.length || !recipe.materials.length) issues.push({ path: `processingRecipes.${recipe.id}.lines`, message: '产出和原料不能为空' })
    if (recipe.outputs.filter((item) => item.primary).length !== 1) issues.push({ path: `processingRecipes.${recipe.id}.outputs.primary`, message: '必须且只能有一条主产出' })
    if (recipe.outputs.reduce((sum, item) => sum + item.costAllocationBasisPoints, 0) !== 10000) issues.push({ path: `processingRecipes.${recipe.id}.outputs.costAllocationBasisPoints`, message: '成本分摊必须合计 100%' })
    recipe.outputs.forEach((item) => milli(issues, `processingRecipes.${recipe.id}.outputs.${item.id}.quantityMilli`, item.quantityMilli, false))
    recipe.materials.forEach((item) => milli(issues, `processingRecipes.${recipe.id}.materials.${item.id}.quantityMilli`, item.quantityMilli, false))
  }
  for (const item of state.thresholds) {
    milli(issues, `thresholds.${item.warehouseId}.${item.skuId}.safetyMinimumMilli`, item.safetyMinimumMilli)
    if (item.maximumMilli !== null) { milli(issues, 'thresholds.maximumMilli', item.maximumMilli); if (item.maximumMilli <= item.safetyMinimumMilli) issues.push({ path: 'thresholds.maximumMilli', message: '必须大于安全下限' }) }
  }
  for (const item of state.openingBalances) { if (!/^\d{4}-\d{2}$/.test(item.month)) issues.push({ path: 'openingBalances.month', message: '必须为 YYYY-MM' }); milli(issues, 'openingBalances.quantityMilli', item.quantityMilli) }
  const requestDirections = new Map<string, string>()
  for (const movement of state.movements) {
    milli(issues, `movements.${movement.id}.quantityMilli`, movement.quantityMilli, false); milli(issues, `movements.${movement.id}.balanceAfterMilli`, movement.balanceAfterMilli)
    const existing = requestDirections.get(movement.requestId); if (existing && existing !== movement.direction) issues.push({ path: `movements.${movement.id}.requestId`, message: '同 requestId 方向不一致' }); requestDirections.set(movement.requestId, movement.direction)
  }
  for (const collection of [state.transfers ?? [], state.otherOutbounds ?? [], state.otherInbounds ?? []]) {
    const ids = collection.map((item) => item.id); if (new Set(ids).size !== ids.length) issues.push({ path: 'documents.id', message: '库存单据 ID 必须唯一' })
    for (const item of collection) { if (item.enterpriseId !== state.enterpriseId) issues.push({ path: `documents.${item.id}.enterpriseId`, message: '实体企业不一致' }); for (const line of item.lines) { milli(issues, `documents.${item.id}.quantityMilli`, line.quantityMilli, false); if (!Number.isSafeInteger(line.costPerBaseUnitCents) || line.costPerBaseUnitCents < 0) issues.push({ path: `documents.${item.id}.cost`, message: '成本必须是非负整数分' }) } }
  }
  for (const item of state.averageCosts ?? []) {
    if (!Number.isSafeInteger(item.costPerBaseUnitCents) || item.costPerBaseUnitCents < 0) issues.push({ path: 'averageCosts.cost', message: '必须是非负整数分' })
    if (!Number.isSafeInteger(item.version) || item.version < 1) issues.push({ path: 'averageCosts.version', message: '版本必须为正整数' })
  }
  for (const item of state.stocktakes ?? []) {
    if (item.enterpriseId !== state.enterpriseId) issues.push({ path: `stocktakes.${item.id}.enterpriseId`, message: '实体企业不一致' })
    for (const line of item.lines) { milli(issues, `stocktakes.${item.id}.bookQuantityMilli`, line.bookQuantityMilli); if (line.countedQuantityMilli !== null) milli(issues, `stocktakes.${item.id}.countedQuantityMilli`, line.countedQuantityMilli); if (line.costPerBaseUnitCents !== null && (!Number.isSafeInteger(line.costPerBaseUnitCents) || line.costPerBaseUnitCents < 0)) issues.push({ path: `stocktakes.${item.id}.cost`, message: '必须是非负整数分' }) }
  }
  for (const item of state.costAdjustments ?? []) {
    if (!Number.isSafeInteger(item.nextCostPerBaseUnitCents) || item.nextCostPerBaseUnitCents < 0) issues.push({ path: `costAdjustments.${item.id}.nextCost`, message: '必须是非负整数分' })
  }
  for (const item of state.closings ?? []) {
    if (!/^\d{4}-\d{2}$/.test(item.month)) issues.push({ path: `closings.${item.id}.month`, message: '必须为 YYYY-MM' })
    for (const snapshot of item.snapshots) {
      milli(issues, `closings.${item.id}.quantity`, snapshot.quantityMilli)
      if (!Number.isSafeInteger(snapshot.averageCostPerBaseUnitCents) || snapshot.averageCostPerBaseUnitCents < 0) issues.push({ path: `closings.${item.id}.cost`, message: '必须是非负整数分' })
      if (!snapshot.sourceVersion) issues.push({ path: `closings.${item.id}.sourceVersion`, message: '来源版本不能为空' })
    }
  }
  const pickingEntities = [...(state.pickingTasks ?? []), ...(state.pickingWaves ?? []), ...(state.pickingDifferences ?? []), ...(state.deliveryRoutes ?? []), ...(state.deliveryVehicles ?? []), ...(state.deliveryTasks ?? []), ...(state.pickingLabels ?? [])]
  if (new Set(pickingEntities.map((item) => item.id)).size !== pickingEntities.length) issues.push({ path: 'pickingDelivery.id', message: '分拣配送实体 ID 必须唯一' })
  if (pickingEntities.some((item) => item.enterpriseId !== state.enterpriseId)) issues.push({ path: 'pickingDelivery.enterpriseId', message: '分拣配送实体企业不一致' })
  for (const task of state.pickingTasks ?? []) for (const line of task.lines) { milli(issues, `pickingTasks.${task.id}.${line.id}.expectedQuantityMilli`, line.expectedQuantityMilli, false); if (line.actualQuantityMilli !== null) milli(issues, `pickingTasks.${task.id}.${line.id}.actualQuantityMilli`, line.actualQuantityMilli) }
  for (const wave of state.pickingWaves ?? []) for (const line of wave.allocations) { milli(issues, `pickingWaves.${wave.id}.${line.orderLineId}.expectedQuantityMilli`, line.expectedQuantityMilli, false); if (line.actualQuantityMilli !== null) milli(issues, `pickingWaves.${wave.id}.${line.orderLineId}.actualQuantityMilli`, line.actualQuantityMilli) }
  const routeCodes = (state.deliveryRoutes ?? []).map((item) => normalized(item.code)); if (new Set(routeCodes).size !== routeCodes.length) issues.push({ path: 'deliveryRoutes.code', message: '线路编码必须唯一' })
  const plates = (state.deliveryVehicles ?? []).map((item) => normalized(item.plateNumber)); if (new Set(plates).size !== plates.length) issues.push({ path: 'deliveryVehicles.plateNumber', message: '车牌号必须唯一' })
  for (const vehicle of state.deliveryVehicles ?? []) if (!Number.isSafeInteger(vehicle.capacityKg) || vehicle.capacityKg <= 0) issues.push({ path: `deliveryVehicles.${vehicle.id}.capacityKg`, message: '必须为正整数千克' })
  for (const label of state.pickingLabels ?? []) milli(issues, `pickingLabels.${label.id}.quantityMilli`, label.quantityMilli, false)
  if (issues.length) throw new InventoryValidationError(issues)
}
