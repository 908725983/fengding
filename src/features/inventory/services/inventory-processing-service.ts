import type { InventoryRepository } from '../repositories/inventory-repository'
import { InventoryValidationError } from '../schemas/inventory-schema'
import type {
  CompleteProcessingOrderInput, ConfirmInboundInput, ConfirmOutboundInput, InventoryActor, InventoryCatalogProvider,
  InventoryDocumentPage, InventoryFeatureState, InventoryMovementRow, MaterialPick, MaterialPickDraft, MaterialReturn,
  MaterialReturnDraft, ProcessingListQuery, ProcessingOrder, ProcessingOrderDraft, ProcessingOrderSourceProvider,
  ProcessingPlan, ProcessingPlanDraft, ProcessingRecipe, ProcessingRecipeDraft, ProcessingRecipeSnapshot,
  ProcessingSalesOrderSnapshot, ProcessingYieldRow,
} from '../types'

export type InventoryProcessingErrorCode = 'PERMISSION_DENIED' | 'NOT_FOUND' | 'DUPLICATE' | 'INVALID_STATE' | 'CONFLICT' | 'DATA_PROVIDER_UNAVAILABLE'
export class InventoryProcessingError extends Error {
  constructor(readonly code: InventoryProcessingErrorCode, message: string) { super(message); this.name = 'InventoryProcessingError' }
}

export interface InventoryProcessingServiceDependencies {
  repository: InventoryRepository
  catalog: InventoryCatalogProvider
  orderProvider?: ProcessingOrderSourceProvider
  now: () => string
  nextId: (kind: 'log') => string
  confirmOutbound: (actor: InventoryActor, input: ConfirmOutboundInput) => InventoryMovementRow[]
  confirmInbound: (actor: InventoryActor, input: ConfirmInboundInput) => InventoryMovementRow[]
}

const readRoles = new Set(['super-admin', 'warehouse', 'sales-supervisor'])
const writeRoles = new Set(['super-admin', 'warehouse'])
const normalize = (value: string) => value.trim().toLocaleLowerCase()
const datePart = (value: string) => value.slice(0, 10)
const positiveMilli = (value: number, path = 'quantityMilli') => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new InventoryValidationError([{ path, message: '必须是正整数毫单位' }])
}
const text = (value: string | null | undefined, max: number, path: string, required = false): string | null => {
  const normalized = value?.trim() ?? ''
  if (required && !normalized) throw new InventoryValidationError([{ path, message: '不能为空' }])
  if (normalized.length > max) throw new InventoryValidationError([{ path, message: `不能超过 ${max} 个字符` }])
  return normalized || null
}
const amount = (quantityMilli: number, costPerBaseUnitCents: number) => Math.round(quantityMilli * costPerBaseUnitCents / 1000)

export function createInventoryProcessingService(deps: InventoryProcessingServiceDependencies) {
  const assertRead = (actor: InventoryActor) => { if (!readRoles.has(actor.role)) throw new InventoryProcessingError('PERMISSION_DENIED', '当前角色不可访问加工管理') }
  const assertWrite = (actor: InventoryActor) => { if (!writeRoles.has(actor.role)) throw new InventoryProcessingError('PERMISSION_DENIED', '当前角色不可修改加工业务') }
  const arrays = (state: InventoryFeatureState) => {
    state.processingRecipes ??= []; state.processingPlans ??= []; state.processingOrders ??= []
    state.materialPicks ??= []; state.materialReturns ??= []; state.processingRequests ??= []
  }
  const enabledWarehouse = (state: InventoryFeatureState, id: string) => {
    const warehouse = state.warehouses.find((item) => item.id === id)
    if (!warehouse || warehouse.status !== 'enabled') throw new InventoryProcessingError('INVALID_STATE', '仓库不存在或已禁用')
    return warehouse
  }
  const enabledLocation = (state: InventoryFeatureState, id: string, warehouseId: string) => {
    const location = state.locations.find((item) => item.id === id)
    if (!location || location.status !== 'enabled' || location.warehouseId !== warehouseId) throw new InventoryProcessingError('INVALID_STATE', '库位不存在、已禁用或不属于指定仓库')
    return location
  }
  const skuExists = (id: string) => {
    const sku = deps.catalog.getSku(id)
    if (!sku) throw new InventoryProcessingError('NOT_FOUND', `SKU 不存在：${id}`)
    return sku
  }
  const page = <T>(items: T[], query: ProcessingListQuery): InventoryDocumentPage<T> => {
    const current = Math.max(1, query.page ?? 1); const pageSize = query.pageSize ?? 30
    return { items: structuredClone(items.slice((current - 1) * pageSize, current * pageSize)), total: items.length, page: current, pageSize }
  }
  const code = (state: InventoryFeatureState, prefix: string, values: Array<{ code: string }>) => {
    const day = datePart(deps.now()).replaceAll('-', '').slice(2)
    const sequence = values.filter((item) => item.code.startsWith(`${prefix}${day}`)).length + 1
    return `${prefix}${day}-${String(sequence).padStart(5, '0')}`
  }
  const atomic = <T>(operation: () => T): T => {
    const snapshot = deps.repository.read()
    try { return operation() } catch (error) { deps.repository.reset(snapshot); throw error }
  }
  const snapshotRecipe = (recipe: ProcessingRecipe): ProcessingRecipeSnapshot => ({
    id: recipe.id, code: recipe.code, name: recipe.name, method: recipe.method, category: recipe.category, note: recipe.note,
    outputs: structuredClone(recipe.outputs), materials: structuredClone(recipe.materials), version: recipe.version,
  })
  const recipeById = (state: InventoryFeatureState, id: string) => {
    const value = state.processingRecipes?.find((item) => item.id === id)
    if (!value) throw new InventoryProcessingError('NOT_FOUND', '加工配方不存在')
    return value
  }
  const planById = (state: InventoryFeatureState, id: string) => {
    const value = state.processingPlans?.find((item) => item.id === id)
    if (!value) throw new InventoryProcessingError('NOT_FOUND', '加工计划不存在')
    return value
  }
  const orderById = (state: InventoryFeatureState, id: string) => {
    const value = state.processingOrders?.find((item) => item.id === id)
    if (!value) throw new InventoryProcessingError('NOT_FOUND', '加工单不存在')
    return value
  }
  const processingReplay = (state: InventoryFeatureState, requestId: string, kind: 'material-pick' | 'material-return' | 'processing-completion') => {
    const replay = state.processingRequests?.find((item) => item.requestId === requestId)
    if (replay && replay.kind !== kind) throw new InventoryProcessingError('DUPLICATE', 'requestId 已用于其他加工命令')
    return replay
  }

  function validateRecipeDraft(draft: ProcessingRecipeDraft, state: InventoryFeatureState, id?: string): void {
    text(draft.code, 40, 'code', true); text(draft.name, 100, 'name', true); text(draft.category, 100, 'category'); text(draft.note, 500, 'note')
    if (!['combination', 'disassembly', 'assembly'].includes(draft.method)) throw new InventoryValidationError([{ path: 'method', message: '加工方式无效' }])
    if (!draft.outputs.length || !draft.materials.length) throw new InventoryValidationError([{ path: 'lines', message: '产出和原料明细均不能为空' }])
    if (draft.outputs.filter((item) => item.primary).length !== 1) throw new InventoryValidationError([{ path: 'outputs.primary', message: '必须且只能有一条主产出' }])
    if (draft.outputs.reduce((sum, item) => sum + item.costAllocationBasisPoints, 0) !== 10000) throw new InventoryValidationError([{ path: 'outputs.costAllocationBasisPoints', message: '产出成本分摊必须合计 100%' }])
    if (new Set(draft.outputs.map((item) => item.skuId)).size !== draft.outputs.length || new Set(draft.materials.map((item) => item.skuId)).size !== draft.materials.length) throw new InventoryValidationError([{ path: 'lines.skuId', message: '同类明细 SKU 不能重复' }])
    for (const [index, line] of draft.outputs.entries()) {
      positiveMilli(line.quantityMilli, `outputs.${index}.quantityMilli`); skuExists(line.skuId); enabledWarehouse(state, line.warehouseId)
      if (!Number.isSafeInteger(line.costAllocationBasisPoints) || line.costAllocationBasisPoints < 0 || line.costAllocationBasisPoints > 10000) throw new InventoryValidationError([{ path: `outputs.${index}.costAllocationBasisPoints`, message: '必须是 0～10000 的整数基点' }])
    }
    for (const [index, line] of draft.materials.entries()) { positiveMilli(line.quantityMilli, `materials.${index}.quantityMilli`); skuExists(line.skuId); enabledWarehouse(state, line.warehouseId) }
    if (state.processingRecipes?.some((item) => item.id !== id && normalize(item.code) === normalize(draft.code))) throw new InventoryProcessingError('DUPLICATE', '配方编码企业内必须唯一')
  }

  function saveProcessingRecipe(actor: InventoryActor, draft: ProcessingRecipeDraft, id?: string): ProcessingRecipe {
    assertWrite(actor)
    return deps.repository.transact((state) => {
      arrays(state); validateRecipeDraft(draft, state, id)
      const existing = id ? state.processingRecipes!.find((item) => item.id === id) : null
      if (id && !existing) throw new InventoryProcessingError('NOT_FOUND', '加工配方不存在')
      const now = deps.now()
      const value: ProcessingRecipe = {
        id: existing?.id ?? deps.nextId('log'), enterpriseId: state.enterpriseId, code: draft.code.trim(), name: draft.name.trim(), method: draft.method,
        category: text(draft.category, 100, 'category'), note: text(draft.note, 500, 'note'), creatorId: existing?.creatorId ?? actor.actorId,
        outputs: draft.outputs.map((line, index) => ({ ...line, id: existing?.outputs[index]?.id ?? deps.nextId('log') })),
        materials: draft.materials.map((line, index) => ({ ...line, id: existing?.materials[index]?.id ?? deps.nextId('log') })),
        version: (existing?.version ?? 0) + 1, createdAt: existing?.createdAt ?? now, updatedAt: now,
      }
      if (existing) state.processingRecipes![state.processingRecipes!.indexOf(existing)] = value; else state.processingRecipes!.push(value)
      return value
    })
  }

  function deleteProcessingRecipe(actor: InventoryActor, id: string): void {
    assertWrite(actor)
    deps.repository.transact((state) => {
      arrays(state); const index = state.processingRecipes!.findIndex((item) => item.id === id)
      if (index < 0) throw new InventoryProcessingError('NOT_FOUND', '加工配方不存在')
      if (state.processingPlans!.some((item) => item.recipeSnapshot.id === id) || state.processingOrders!.some((item) => item.recipeSnapshot.id === id)) throw new InventoryProcessingError('INVALID_STATE', '配方已被计划或加工单引用，不能删除')
      state.processingRecipes!.splice(index, 1)
    })
  }

  function listProcessingRecipes(actor: InventoryActor, query: ProcessingListQuery = {}): InventoryDocumentPage<ProcessingRecipe> {
    assertRead(actor); const keyword = normalize(query.keyword ?? '')
    const rows = (deps.repository.read().processingRecipes ?? []).filter((item) => !keyword || normalize(item.code).includes(keyword) || normalize(item.name).includes(keyword) || item.outputs.some((line) => normalize(line.skuId).includes(keyword)) || item.materials.some((line) => normalize(line.skuId).includes(keyword))).filter((item) => !query.skuId || item.outputs.some((line) => line.skuId === query.skuId) || item.materials.some((line) => line.skuId === query.skuId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code))
    return page(rows, query)
  }

  function importProcessingRecipes(actor: InventoryActor, drafts: ProcessingRecipeDraft[]): ProcessingRecipe[] {
    assertWrite(actor); if (!drafts.length) throw new InventoryValidationError([{ path: 'rows', message: '导入数据不能为空' }])
    return atomic(() => drafts.map((draft) => saveProcessingRecipe(actor, draft)))
  }

  function previewProcessingRecipeImport(actor: InventoryActor, drafts: ProcessingRecipeDraft[]): { valid: boolean; errors: string[]; rows: number } {
    assertWrite(actor); const state = deps.repository.read(); arrays(state); const errors: string[] = []; const codes = new Set<string>()
    if (!drafts.length) errors.push('导入数据不能为空')
    drafts.forEach((draft, index) => {
      try { validateRecipeDraft(draft, state); const key = normalize(draft.code); if (codes.has(key)) errors.push(`第 ${index + 1} 行：本次导入配方编码重复`); codes.add(key) }
      catch (caught) { errors.push(`第 ${index + 1} 行：${caught instanceof Error ? caught.message : '校验失败'}`) }
    })
    return { valid: errors.length === 0, errors, rows: drafts.length }
  }

  function listEligibleProcessingOrders(actor: InventoryActor) {
    assertRead(actor)
    return deps.orderProvider?.listEligibleOrders() ?? { state: 'unavailable' as const, items: [], version: 'unavailable', message: '销售订单数据源未接入' }
  }
  function listProcessingCatalog(actor: InventoryActor) { assertRead(actor); return structuredClone(deps.catalog.listSkus()) }

  function createProcessingPlan(actor: InventoryActor, draft: ProcessingPlanDraft): ProcessingPlan {
    assertWrite(actor); positiveMilli(draft.plannedQuantityMilli, 'plannedQuantityMilli')
    if (!Number.isFinite(Date.parse(draft.plannedAt))) throw new InventoryValidationError([{ path: 'plannedAt', message: '计划时间无效' }])
    return deps.repository.transact((state) => {
      arrays(state); enabledWarehouse(state, draft.processingWarehouseId); const recipe = recipeById(state, draft.recipeId)
      let sourceOrder: ProcessingSalesOrderSnapshot | null = null
      if (draft.sourceType === 'sales-order') {
        if (!deps.orderProvider) throw new InventoryProcessingError('DATA_PROVIDER_UNAVAILABLE', '销售订单数据源未接入')
        if (deps.orderProvider.listEligibleOrders().state !== 'available') throw new InventoryProcessingError('DATA_PROVIDER_UNAVAILABLE', '销售订单数据源未接入')
        sourceOrder = draft.salesOrderId ? deps.orderProvider.getEligibleOrder(draft.salesOrderId) : null
        if (!sourceOrder) throw new InventoryProcessingError('INVALID_STATE', '销售订单不存在或当前不可用于加工计划')
        const sourceLine = sourceOrder.lines.find((line) => line.orderLineId === draft.salesOrderLineId)
        const primarySkuId = recipe.outputs.find((line) => line.primary)!.skuId
        if (!sourceLine || sourceLine.skuId !== primarySkuId) throw new InventoryProcessingError('INVALID_STATE', '订单行与配方主产出不匹配')
        const planned = state.processingPlans!.filter((item) => item.sourceOrder?.orderId === sourceOrder!.orderId && item.sourceOrder.lines.some((line) => line.orderLineId === sourceLine.orderLineId) && item.status !== 'cancelled').reduce((sum, item) => sum + item.plannedQuantityMilli, 0)
        if (planned + draft.plannedQuantityMilli > sourceLine.remainingQuantityMilli) throw new InventoryProcessingError('INVALID_STATE', '活动加工计划累计数量超过订单未发货剩余量')
      }
      const value: ProcessingPlan = {
        id: deps.nextId('log'), enterpriseId: state.enterpriseId, code: code(state, 'JGJH', state.processingPlans!), sourceType: draft.sourceType,
        sourceOrder: sourceOrder ? structuredClone(sourceOrder) : null, recipeSnapshot: snapshotRecipe(recipe), plannedAt: draft.plannedAt,
        plannedQuantityMilli: draft.plannedQuantityMilli, processingWarehouseId: draft.processingWarehouseId, note: text(draft.note, 500, 'note'),
        status: 'pending', completedPrimaryQuantityMilli: 0, creatorId: actor.actorId, version: 1, createdAt: deps.now(), updatedAt: deps.now(),
      }
      state.processingPlans!.push(value); return value
    })
  }

  function listProcessingPlans(actor: InventoryActor, query: ProcessingListQuery = {}): InventoryDocumentPage<ProcessingPlan> {
    assertRead(actor); const keyword = normalize(query.keyword ?? '')
    const rows = (deps.repository.read().processingPlans ?? []).filter((item) => !query.status || item.status === query.status).filter((item) => !query.fromDate || datePart(item.plannedAt) >= query.fromDate!).filter((item) => !query.toDate || datePart(item.plannedAt) <= query.toDate!).filter((item) => !query.recipeId || item.recipeSnapshot.id === query.recipeId).filter((item) => !query.creatorId || item.creatorId === query.creatorId).filter((item) => !query.skuId || item.recipeSnapshot.outputs.some((line) => line.skuId === query.skuId) || item.recipeSnapshot.materials.some((line) => line.skuId === query.skuId)).filter((item) => !keyword || normalize(item.code).includes(keyword) || normalize(item.recipeSnapshot.name).includes(keyword) || normalize(item.sourceOrder?.orderNo ?? '').includes(keyword)).sort((a, b) => b.plannedAt.localeCompare(a.plannedAt) || b.code.localeCompare(a.code))
    return page(rows, query)
  }

  function cancelProcessingPlan(actor: InventoryActor, id: string, expectedVersion: number): ProcessingPlan {
    assertWrite(actor)
    return deps.repository.transact((state) => {
      arrays(state); const value = planById(state, id)
      if (value.version !== expectedVersion) throw new InventoryProcessingError('CONFLICT', '加工计划版本已变化')
      if (value.status !== 'pending' || state.processingOrders!.some((item) => item.planId === id)) throw new InventoryProcessingError('INVALID_STATE', '只有无加工单的待处理计划可取消')
      value.status = 'cancelled'; value.version += 1; value.updatedAt = deps.now(); return value
    })
  }

  function scaled(recipe: ProcessingRecipeSnapshot, plannedQuantityMilli: number) {
    const primary = recipe.outputs.find((item) => item.primary)!
    const scale = (quantityMilli: number, path: string) => {
      const result = Math.round(quantityMilli * plannedQuantityMilli / primary.quantityMilli)
      positiveMilli(result, path)
      return result
    }
    return {
      outputs: recipe.outputs.map((line, index) => ({ id: deps.nextId('log'), recipeLineId: line.id, skuId: line.skuId, plannedQuantityMilli: scale(line.quantityMilli, `outputs.${index}.plannedQuantityMilli`), actualQuantityMilli: null, warehouseId: line.warehouseId, locationId: null, batchNumber: null, productionDate: null, expiresOn: null, costAllocationBasisPoints: line.costAllocationBasisPoints, allocatedCostCents: null, inboundMovementIds: [] })),
      materials: recipe.materials.map((line, index) => ({ id: deps.nextId('log'), recipeLineId: line.id, skuId: line.skuId, requiredQuantityMilli: scale(line.quantityMilli, `materials.${index}.requiredQuantityMilli`), warehouseId: line.warehouseId, pickedQuantityMilli: 0, returnedQuantityMilli: 0 })),
    }
  }

  function createProcessingOrder(actor: InventoryActor, draft: ProcessingOrderDraft): ProcessingOrder {
    assertWrite(actor); positiveMilli(draft.plannedQuantityMilli, 'plannedQuantityMilli')
    return deps.repository.transact((state) => {
      arrays(state); enabledWarehouse(state, draft.processingWarehouseId)
      let recipe: ProcessingRecipeSnapshot; let plan: ProcessingPlan | null = null
      if (draft.planId) {
        plan = planById(state, draft.planId)
        if (!['pending', 'processing'].includes(plan.status)) throw new InventoryProcessingError('INVALID_STATE', '加工计划状态不允许创建加工单')
        if (plan.recipeSnapshot.id !== draft.recipeId) throw new InventoryProcessingError('INVALID_STATE', '加工单配方必须与计划快照一致')
        const committed = state.processingOrders!.filter((item) => item.planId === plan!.id).reduce((sum, item) => sum + item.plannedQuantityMilli, 0)
        if (committed + draft.plannedQuantityMilli > plan.plannedQuantityMilli) throw new InventoryProcessingError('INVALID_STATE', '加工单计划数量超过计划剩余量')
        recipe = structuredClone(plan.recipeSnapshot)
      } else recipe = snapshotRecipe(recipeById(state, draft.recipeId))
      const lines = scaled(recipe, draft.plannedQuantityMilli)
      const value: ProcessingOrder = {
        id: deps.nextId('log'), enterpriseId: state.enterpriseId, code: code(state, 'JGD', state.processingOrders!), planId: plan?.id ?? null,
        recipeSnapshot: recipe, plannedQuantityMilli: draft.plannedQuantityMilli, processingWarehouseId: draft.processingWarehouseId,
        note: text(draft.note, 500, 'note'), status: 'pending-picking', outputs: lines.outputs, materials: lines.materials,
        creatorId: actor.actorId, version: 1, createdAt: deps.now(), updatedAt: deps.now(), completedAt: null, completionRequestId: null,
      }
      state.processingOrders!.push(value)
      if (plan && plan.status === 'pending') { plan.status = 'processing'; plan.version += 1; plan.updatedAt = deps.now() }
      return value
    })
  }

  function listProcessingOrders(actor: InventoryActor, query: ProcessingListQuery = {}): InventoryDocumentPage<ProcessingOrder> {
    assertRead(actor); const keyword = normalize(query.keyword ?? '')
    const rows = (deps.repository.read().processingOrders ?? []).filter((item) => !query.status || item.status === query.status).filter((item) => !query.fromDate || datePart(item.createdAt) >= query.fromDate!).filter((item) => !query.toDate || datePart(item.createdAt) <= query.toDate!).filter((item) => !query.recipeId || item.recipeSnapshot.id === query.recipeId).filter((item) => !query.creatorId || item.creatorId === query.creatorId).filter((item) => !keyword || normalize(item.code).includes(keyword) || normalize(item.recipeSnapshot.name).includes(keyword)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code)).map((item) => {
      const copy = structuredClone(item); if (actor.role === 'sales-supervisor') copy.outputs.forEach((line) => { line.allocatedCostCents = null }); return copy
    })
    return page(rows, query)
  }

  function deleteProcessingOrder(actor: InventoryActor, id: string, expectedVersion: number): void {
    assertWrite(actor)
    deps.repository.transact((state) => {
      arrays(state); const order = orderById(state, id)
      if (order.version !== expectedVersion) throw new InventoryProcessingError('CONFLICT', '加工单版本已变化')
      if (order.status !== 'pending-picking' || state.materialPicks!.some((item) => item.processingOrderId === id)) throw new InventoryProcessingError('INVALID_STATE', '只有无领料事实的待领料加工单可删除')
      state.processingOrders!.splice(state.processingOrders!.indexOf(order), 1)
      if (order.planId) { const plan = planById(state, order.planId); const remaining = state.processingOrders!.some((item) => item.planId === plan.id); if (!remaining && plan.completedPrimaryQuantityMilli === 0) { plan.status = 'pending'; plan.version += 1; plan.updatedAt = deps.now() } }
    })
  }

  function createMaterialPick(actor: InventoryActor, draft: MaterialPickDraft): MaterialPick {
    assertWrite(actor); if (!draft.lines.length) throw new InventoryValidationError([{ path: 'lines', message: '领料明细不能为空' }])
    return deps.repository.transact((state) => {
      arrays(state); enabledWarehouse(state, draft.warehouseId); const order = orderById(state, draft.processingOrderId)
      if (!['pending-picking', 'picking'].includes(order.status)) throw new InventoryProcessingError('INVALID_STATE', '加工单状态不允许创建领料单')
      if (new Set(draft.lines.map((item) => item.materialLineId)).size !== draft.lines.length) throw new InventoryValidationError([{ path: 'lines', message: '原料行不能重复' }])
      const lines = draft.lines.map((line) => {
        positiveMilli(line.actualQuantityMilli, 'actualQuantityMilli'); const material = order.materials.find((item) => item.id === line.materialLineId)
        if (!material || material.warehouseId !== draft.warehouseId) throw new InventoryProcessingError('INVALID_STATE', '领料行不属于该加工单或仓库')
        if (material.pickedQuantityMilli + line.actualQuantityMilli > material.requiredQuantityMilli) throw new InventoryProcessingError('INVALID_STATE', '累计领料数量不能超过配方需求')
        return { id: deps.nextId('log'), materialLineId: material.id, skuId: material.skuId, requiredQuantityMilli: material.requiredQuantityMilli, actualQuantityMilli: line.actualQuantityMilli, warehouseId: draft.warehouseId, movementIds: [] }
      })
      const value: MaterialPick = { id: deps.nextId('log'), enterpriseId: state.enterpriseId, code: code(state, 'JGLL', state.materialPicks!), processingOrderId: order.id, warehouseId: draft.warehouseId, occurredAt: draft.occurredAt, status: 'pending-outbound', lines, note: text(draft.note, 500, 'note'), version: 1, createdAt: deps.now(), updatedAt: deps.now(), requestId: null }
      state.materialPicks!.push(value); return value
    })
  }

  function confirmMaterialPick(actor: InventoryActor, id: string, expectedVersion: number, requestId: string): MaterialPick {
    assertWrite(actor); text(requestId, 100, 'requestId', true)
    return atomic(() => {
      const before = deps.repository.read(); arrays(before); const replay = processingReplay(before, requestId, 'material-pick')
      if (replay) return before.materialPicks!.find((item) => item.id === replay.targetId)!
      const pick = before.materialPicks!.find((item) => item.id === id); if (!pick) throw new InventoryProcessingError('NOT_FOUND', '领料单不存在')
      if (pick.status !== 'pending-outbound' || pick.version !== expectedVersion) throw new InventoryProcessingError('CONFLICT', '领料单状态或版本已变化')
      const beforeOrder = orderById(before, pick.processingOrderId)
      for (const line of pick.lines) { const material = beforeOrder.materials.find((item) => item.id === line.materialLineId); if (!material || material.pickedQuantityMilli + line.actualQuantityMilli > material.requiredQuantityMilli) throw new InventoryProcessingError('CONFLICT', '其他领料单已占用需求数量，请重新加载') }
      const movementIds = new Map<string, string[]>()
      for (const line of pick.lines) {
        const movements = deps.confirmOutbound(actor, { requestId: `${requestId}:${line.id}`, sourceType: 'processing-material-pick', sourceId: pick.id, operatorId: actor.actorId, occurredAt: pick.occurredAt, warehouseId: line.warehouseId, skuId: line.skuId, quantityMilli: line.actualQuantityMilli })
        movementIds.set(line.id, movements.map((item) => item.id))
      }
      return deps.repository.transact((state) => {
        arrays(state); const current = state.materialPicks!.find((item) => item.id === id)!; const order = orderById(state, current.processingOrderId)
        if (current.status !== 'pending-outbound' || current.version !== expectedVersion) throw new InventoryProcessingError('CONFLICT', '领料单状态或版本已变化')
        current.lines.forEach((line) => { line.movementIds = movementIds.get(line.id) ?? []; const material = order.materials.find((item) => item.id === line.materialLineId)!; material.pickedQuantityMilli += line.actualQuantityMilli })
        current.status = 'outbound'; current.requestId = requestId; current.version += 1; current.updatedAt = deps.now()
        order.status = order.materials.every((item) => item.pickedQuantityMilli >= item.requiredQuantityMilli) ? 'processing' : 'picking'; order.version += 1; order.updatedAt = deps.now()
        state.processingRequests!.push({ requestId, kind: 'material-pick', targetId: current.id, appliedAt: deps.now() }); return current
      })
    })
  }

  function listMaterialPicks(actor: InventoryActor, query: ProcessingListQuery = {}): InventoryDocumentPage<MaterialPick> {
    assertRead(actor); const keyword = normalize(query.keyword ?? '')
    const rows = (deps.repository.read().materialPicks ?? []).filter((item) => !query.status || item.status === query.status).filter((item) => !query.fromDate || datePart(item.occurredAt) >= query.fromDate!).filter((item) => !query.toDate || datePart(item.occurredAt) <= query.toDate!).filter((item) => !keyword || normalize(item.code).includes(keyword) || normalize(item.processingOrderId).includes(keyword)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.code.localeCompare(a.code))
    return page(rows, query)
  }

  function createMaterialReturn(actor: InventoryActor, draft: MaterialReturnDraft): MaterialReturn {
    assertWrite(actor); if (!draft.lines.length) throw new InventoryValidationError([{ path: 'lines', message: '退料明细不能为空' }])
    return deps.repository.transact((state) => {
      arrays(state); enabledWarehouse(state, draft.warehouseId); const order = orderById(state, draft.processingOrderId)
      if (!['picking', 'processing'].includes(order.status)) throw new InventoryProcessingError('INVALID_STATE', '加工单状态不允许退料')
      if (new Set(draft.lines.map((item) => item.pickMovementId)).size !== draft.lines.length) throw new InventoryValidationError([{ path: 'lines', message: '同一领料流水不能在一张退料单重复' }])
      const confirmedReturns = state.materialReturns!.filter((item) => item.status === 'inbound').flatMap((item) => item.lines)
      const lines = draft.lines.map((line) => {
        positiveMilli(line.quantityMilli); const material = order.materials.find((item) => item.id === line.materialLineId)
        const movement = state.movements.find((item) => item.id === line.pickMovementId && item.direction === 'outbound' && item.sourceType === 'processing-material-pick')
        if (!material || !movement || movement.skuId !== material.skuId || movement.warehouseId !== draft.warehouseId) throw new InventoryProcessingError('INVALID_STATE', '退料必须引用本加工单的原领料流水')
        const pick = state.materialPicks!.find((item) => item.id === movement.sourceId && item.processingOrderId === order.id)
        if (!pick) throw new InventoryProcessingError('INVALID_STATE', '原领料单与加工单不一致')
        const returned = confirmedReturns.filter((item) => item.pickMovementId === movement.id).reduce((sum, item) => sum + item.quantityMilli, 0)
        if (returned + line.quantityMilli > movement.quantityMilli) throw new InventoryProcessingError('INVALID_STATE', '累计退料不能超过原领料流水数量')
        enabledLocation(state, line.locationId, draft.warehouseId); const batch = state.batches.find((item) => item.id === movement.batchId)
        if (!batch) throw new InventoryProcessingError('INVALID_STATE', '原领料批次不存在')
        return { id: deps.nextId('log'), materialLineId: material.id, skuId: material.skuId, pickMovementId: movement.id, quantityMilli: line.quantityMilli, warehouseId: draft.warehouseId, locationId: line.locationId, batchId: batch.id, batchNumber: batch.batchNumber, productionDate: batch.productionDate, expiresOn: batch.expiresOn, costPerBaseUnitCents: movement.costPerBaseUnitCents, movementIds: [] }
      })
      const value: MaterialReturn = { id: deps.nextId('log'), enterpriseId: state.enterpriseId, code: code(state, 'JGTL', state.materialReturns!), processingOrderId: order.id, warehouseId: draft.warehouseId, occurredAt: draft.occurredAt, status: 'pending-inbound', lines, note: text(draft.note, 500, 'note'), version: 1, createdAt: deps.now(), updatedAt: deps.now(), requestId: null }
      state.materialReturns!.push(value); return value
    })
  }

  function confirmMaterialReturn(actor: InventoryActor, id: string, expectedVersion: number, requestId: string): MaterialReturn {
    assertWrite(actor); text(requestId, 100, 'requestId', true)
    return atomic(() => {
      const before = deps.repository.read(); arrays(before); const replay = processingReplay(before, requestId, 'material-return')
      if (replay) return before.materialReturns!.find((item) => item.id === replay.targetId)!
      const value = before.materialReturns!.find((item) => item.id === id); if (!value) throw new InventoryProcessingError('NOT_FOUND', '退料单不存在')
      if (value.status !== 'pending-inbound' || value.version !== expectedVersion) throw new InventoryProcessingError('CONFLICT', '退料单状态或版本已变化')
      for (const line of value.lines) {
        const movement = before.movements.find((item) => item.id === line.pickMovementId && item.direction === 'outbound')
        const alreadyReturned = before.materialReturns!.filter((item) => item.id !== value.id && item.status === 'inbound').flatMap((item) => item.lines).filter((item) => item.pickMovementId === line.pickMovementId).reduce((sum, item) => sum + item.quantityMilli, 0)
        if (!movement || alreadyReturned + line.quantityMilli > movement.quantityMilli) throw new InventoryProcessingError('CONFLICT', '其他退料单已占用可退数量，请重新加载')
      }
      const movementIds = new Map<string, string[]>()
      for (const line of value.lines) {
        const movements = deps.confirmInbound(actor, { requestId: `${requestId}:${line.id}`, sourceType: 'processing-material-return', sourceId: value.id, operatorId: actor.actorId, occurredAt: value.occurredAt, warehouseId: line.warehouseId, locationId: line.locationId, skuId: line.skuId, quantityMilli: line.quantityMilli, costPerBaseUnitCents: line.costPerBaseUnitCents, batchNumber: line.batchNumber, productionDate: line.productionDate, expiresOn: line.expiresOn })
        movementIds.set(line.id, movements.map((item) => item.id))
      }
      return deps.repository.transact((state) => {
        arrays(state); const current = state.materialReturns!.find((item) => item.id === id)!; const order = orderById(state, current.processingOrderId)
        if (current.status !== 'pending-inbound' || current.version !== expectedVersion) throw new InventoryProcessingError('CONFLICT', '退料单状态或版本已变化')
        current.lines.forEach((line) => { line.movementIds = movementIds.get(line.id) ?? []; order.materials.find((item) => item.id === line.materialLineId)!.returnedQuantityMilli += line.quantityMilli })
        current.status = 'inbound'; current.requestId = requestId; current.version += 1; current.updatedAt = deps.now(); order.version += 1; order.updatedAt = deps.now()
        state.processingRequests!.push({ requestId, kind: 'material-return', targetId: current.id, appliedAt: deps.now() }); return current
      })
    })
  }

  function listMaterialReturns(actor: InventoryActor, query: ProcessingListQuery = {}): InventoryDocumentPage<MaterialReturn> {
    assertRead(actor); const keyword = normalize(query.keyword ?? '')
    const rows = (deps.repository.read().materialReturns ?? []).filter((item) => !query.status || item.status === query.status).filter((item) => !query.fromDate || datePart(item.occurredAt) >= query.fromDate!).filter((item) => !query.toDate || datePart(item.occurredAt) <= query.toDate!).filter((item) => !keyword || normalize(item.code).includes(keyword) || normalize(item.processingOrderId).includes(keyword)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.code.localeCompare(a.code)).map((item) => {
      const copy = structuredClone(item); if (actor.role === 'sales-supervisor') copy.lines.forEach((line) => { line.costPerBaseUnitCents = 0 }); return copy
    })
    return page(rows, query)
  }

  function completeProcessingOrder(actor: InventoryActor, input: CompleteProcessingOrderInput): ProcessingOrder {
    assertWrite(actor); text(input.requestId, 100, 'requestId', true)
    return atomic(() => {
      let before = deps.repository.read(); arrays(before); const replay = processingReplay(before, input.requestId, 'processing-completion')
      if (replay) return before.processingOrders!.find((item) => item.id === replay.targetId)!
      let order = orderById(before, input.processingOrderId)
      if (order.status !== 'processing' || order.version !== input.expectedVersion) throw new InventoryProcessingError('CONFLICT', '加工单状态或版本不允许完工')
      if (input.outputs.length !== order.outputs.length || new Set(input.outputs.map((item) => item.outputLineId)).size !== order.outputs.length) throw new InventoryValidationError([{ path: 'outputs', message: '必须完整录入每条产出' }])
      for (const output of input.outputs) { positiveMilli(output.actualQuantityMilli, 'actualQuantityMilli'); const line = order.outputs.find((item) => item.id === output.outputLineId); if (!line) throw new InventoryProcessingError('INVALID_STATE', '产出行不属于该加工单'); enabledLocation(before, output.locationId, line.warehouseId) }
      if (input.finalReturn?.lines.length) {
        const created = createMaterialReturn(actor, { ...input.finalReturn, processingOrderId: order.id, occurredAt: input.occurredAt })
        confirmMaterialReturn(actor, created.id, created.version, `${input.requestId}:final-return`)
      }
      before = deps.repository.read(); order = orderById(before, input.processingOrderId)
      const pickIds = new Set((before.materialPicks ?? []).filter((item) => item.processingOrderId === order.id && item.status === 'outbound').map((item) => item.id))
      const outboundCost = before.movements.filter((item) => item.direction === 'outbound' && item.sourceType === 'processing-material-pick' && pickIds.has(item.sourceId)).reduce((sum, item) => sum + amount(item.quantityMilli, item.costPerBaseUnitCents), 0)
      const returnedCost = (before.materialReturns ?? []).filter((item) => item.processingOrderId === order.id && item.status === 'inbound').flatMap((item) => item.lines).reduce((sum, item) => sum + amount(item.quantityMilli, item.costPerBaseUnitCents), 0)
      const consumedCost = outboundCost - returnedCost
      if (consumedCost < 0) throw new InventoryProcessingError('INVALID_STATE', '退料成本超过领料成本')
      const primary = order.outputs.find((item) => order.recipeSnapshot.outputs.find((row) => row.id === item.recipeLineId)?.primary)!
      const allocations = new Map<string, number>(); let assigned = 0
      for (const line of order.outputs.filter((item) => item.id !== primary.id)) { const value = Math.floor(consumedCost * line.costAllocationBasisPoints / 10000); allocations.set(line.id, value); assigned += value }
      allocations.set(primary.id, consumedCost - assigned)
      const movementIds = new Map<string, string[]>()
      for (const output of input.outputs) {
        const line = order.outputs.find((item) => item.id === output.outputLineId)!; const allocated = allocations.get(line.id) ?? 0
        const costPerBaseUnitCents = output.actualQuantityMilli > 0 ? Math.round(allocated * 1000 / output.actualQuantityMilli) : 0
        const movements = deps.confirmInbound(actor, { requestId: `${input.requestId}:output:${line.id}`, sourceType: 'processing-output', sourceId: order.id, operatorId: actor.actorId, occurredAt: input.occurredAt, warehouseId: line.warehouseId, locationId: output.locationId, skuId: line.skuId, quantityMilli: output.actualQuantityMilli, costPerBaseUnitCents, batchNumber: output.batchNumber?.trim() || `PROCESS-${order.code}-${line.skuId}`, productionDate: output.productionDate ?? null, expiresOn: output.expiresOn ?? null })
        movementIds.set(line.id, movements.map((item) => item.id))
      }
      return deps.repository.transact((state) => {
        arrays(state); const current = orderById(state, input.processingOrderId)
        if (current.status !== 'processing' || current.version !== order.version) throw new InventoryProcessingError('CONFLICT', '加工单在完工过程中已变化')
        for (const output of input.outputs) { const line = current.outputs.find((item) => item.id === output.outputLineId)!; line.actualQuantityMilli = output.actualQuantityMilli; line.locationId = output.locationId; line.batchNumber = output.batchNumber?.trim() || `PROCESS-${current.code}-${line.skuId}`; line.productionDate = output.productionDate ?? null; line.expiresOn = output.expiresOn ?? null; line.allocatedCostCents = allocations.get(line.id) ?? 0; line.inboundMovementIds = movementIds.get(line.id) ?? [] }
        current.status = 'completed'; current.completedAt = input.occurredAt; current.completionRequestId = input.requestId; current.version += 1; current.updatedAt = deps.now()
        if (current.planId) { const plan = planById(state, current.planId); const actualPrimary = current.outputs.find((item) => item.id === primary.id)!.actualQuantityMilli ?? 0; plan.completedPrimaryQuantityMilli += actualPrimary; plan.status = plan.completedPrimaryQuantityMilli >= plan.plannedQuantityMilli ? 'completed' : 'processing'; plan.version += 1; plan.updatedAt = deps.now() }
        state.processingRequests!.push({ requestId: input.requestId, kind: 'processing-completion', targetId: current.id, appliedAt: deps.now() }); return current
      })
    })
  }

  function listProcessingYields(actor: InventoryActor, query: ProcessingListQuery = {}): InventoryDocumentPage<ProcessingYieldRow> {
    assertRead(actor); const state = deps.repository.read(); const keyword = normalize(query.keyword ?? '')
    const rows = (state.processingOrders ?? []).filter((item) => item.status === 'completed').filter((item) => !query.fromDate || datePart(item.createdAt) >= query.fromDate!).filter((item) => !query.toDate || datePart(item.createdAt) <= query.toDate!).filter((item) => !query.recipeId || item.recipeSnapshot.id === query.recipeId).flatMap((order) => order.outputs.flatMap((output) => order.materials.map((material) => {
      const recipeOutput = order.recipeSnapshot.outputs.find((item) => item.id === output.recipeLineId)!; const recipeMaterial = order.recipeSnapshot.materials.find((item) => item.id === material.recipeLineId)!
      const actualUsed = material.pickedQuantityMilli - material.returnedQuantityMilli
      const expected = recipeMaterial.quantityMilli > 0 ? Math.round(recipeOutput.quantityMilli * actualUsed / recipeMaterial.quantityMilli) : null
      const yieldBasisPoints = expected && output.actualQuantityMilli !== null ? Math.round(output.actualQuantityMilli * 10000 / expected) : null
      return { id: `${order.id}:${output.id}:${material.id}`, processingOrderId: order.id, processingOrderCode: order.code, createdAt: order.createdAt, recipeId: order.recipeSnapshot.id, recipeCode: order.recipeSnapshot.code, recipeName: order.recipeSnapshot.name, outputSkuId: output.skuId, materialSkuId: material.skuId, formulaMaterialQuantityMilli: recipeMaterial.quantityMilli, actualUsedQuantityMilli: actualUsed, actualOutputQuantityMilli: output.actualQuantityMilli ?? 0, expectedOutputQuantityMilli: expected, yieldBasisPoints }
    }))).filter((item) => !query.skuId || item.outputSkuId === query.skuId).filter((item) => !keyword || normalize(item.processingOrderCode).includes(keyword) || normalize(item.recipeName).includes(keyword) || normalize(item.outputSkuId).includes(keyword)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    return page(rows, query)
  }

  const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  function exportProcessingOrdersCsv(actor: InventoryActor, query: ProcessingListQuery = {}): string {
    assertWrite(actor); const rows = listProcessingOrders(actor, { ...query, page: 1, pageSize: 100 }).items
    return `\uFEFF${['code,createdAt,recipeName,plannedQuantity,actualQuantity,status', ...rows.map((item) => [item.code, item.createdAt, item.recipeSnapshot.name, item.plannedQuantityMilli / 1000, (item.outputs.find((line) => item.recipeSnapshot.outputs.find((row) => row.id === line.recipeLineId)?.primary)?.actualQuantityMilli ?? 0) / 1000, item.status].map(csv).join(','))].join('\r\n')}`
  }
  function exportProcessingYieldsCsv(actor: InventoryActor, query: ProcessingListQuery = {}): string {
    assertWrite(actor); const rows = listProcessingYields(actor, { ...query, page: 1, pageSize: 100 }).items
    return `\uFEFF${['processingOrderCode,createdAt,recipeCode,outputSkuId,materialSkuId,formulaMaterialQuantity,actualUsedQuantity,actualOutputQuantity,expectedOutputQuantity,yieldPercent', ...rows.map((item) => [item.processingOrderCode, item.createdAt, item.recipeCode, item.outputSkuId, item.materialSkuId, item.formulaMaterialQuantityMilli / 1000, item.actualUsedQuantityMilli / 1000, item.actualOutputQuantityMilli / 1000, item.expectedOutputQuantityMilli === null ? 'unavailable' : item.expectedOutputQuantityMilli / 1000, item.yieldBasisPoints === null ? 'unavailable' : (item.yieldBasisPoints / 100).toFixed(2)].map(csv).join(','))].join('\r\n')}`
  }

  return {
    saveProcessingRecipe, deleteProcessingRecipe, listProcessingRecipes, previewProcessingRecipeImport, importProcessingRecipes, listEligibleProcessingOrders, listProcessingCatalog,
    createProcessingPlan, listProcessingPlans, cancelProcessingPlan, createProcessingOrder, listProcessingOrders, deleteProcessingOrder,
    createMaterialPick, confirmMaterialPick, listMaterialPicks, createMaterialReturn, confirmMaterialReturn, listMaterialReturns,
    completeProcessingOrder, listProcessingYields, exportProcessingOrdersCsv, exportProcessingYieldsCsv,
  }
}
