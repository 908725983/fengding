import { assertPriceAdjustmentDraft, controlledSaleFields, validatePriceValues } from '../schemas/pricing-schema'
import type { PricingRepository } from '../repositories/pricing-repository'
import type {
  AdjustmentType,
  AutoPriceStrategy,
  EntityId,
  FormulaMode,
  PriceAdjustment,
  PriceAdjustmentDraft,
  PriceAdjustmentPage,
  PriceAdjustmentQuery,
  PriceField,
  PriceHistoryEntry,
  PriceHistoryPage,
  PriceHistoryQuery,
  PriceTier,
  PriceValues,
  PricingActor,
  PricingCatalogProvider,
  PricingFeatureState,
  PricingSkuSnapshot,
  ResolvedPrice,
  SalePriceField,
  StrategyAnchor,
  UnitPriceOverride,
} from '../types'

export type PricingDomainErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'INVALID_EFFECTIVE_TIME'
  | 'SCHEDULE_CONFLICT'
  | 'CUSTOMER_NOT_ACTIVE'
  | 'PRODUCT_NOT_ORDERABLE'
  | 'PRICE_UNAVAILABLE'
  | 'UNIT_UNAVAILABLE'
  | 'FORMULA_INVALID'

export class PricingDomainError extends Error {
  constructor(readonly code: PricingDomainErrorCode, message: string) { super(message); this.name = 'PricingDomainError' }
}

export interface PricingServiceDependencies {
  repository: PricingRepository
  catalog: PricingCatalogProvider
  nextId: (kind: 'adjustment' | 'line' | 'version' | 'history' | 'override' | 'strategy') => string
}

export interface ResolvePriceInput { customerId: EntityId; skuId: EntityId; unitId: EntityId; quantity: number }
export interface SaveStrategyInput extends Omit<AutoPriceStrategy, 'id' | 'enterpriseId' | 'lastRunAt' | 'lastError'> { id?: EntityId }

const readableRoles = new Set(['super-admin', 'sales-supervisor', 'salesperson', 'warehouse'])
const priceTierFields: Record<PriceTier, SalePriceField> = {
  'base-order': 'baseOrderPriceCents', 'tier-one': 'tierOnePriceCents', 'tier-two': 'tierTwoPriceCents', store: 'storePriceCents', terminal: 'terminalPriceCents',
}
const prefix: Record<AdjustmentType, string> = { level: 'LPA', purchase: 'PPA', customer: 'CPA' }

function assertRead(actor: PricingActor): void { if (!readableRoles.has(actor.role)) throw new PricingDomainError('PERMISSION_DENIED', '当前角色不可访问价格模块') }
function assertWrite(actor: PricingActor): void { if (actor.role !== 'super-admin') throw new PricingDomainError('PERMISSION_DENIED', '当前角色不可修改价格资料') }
function time(value: string): number { return Date.parse(value) }
function scopeOf(type: AdjustmentType): 'global' | 'customer' { return type === 'customer' ? 'customer' : 'global' }
function fieldEntries(changes: Partial<PriceValues>): Array<[PriceField, number | null]> { return Object.entries(changes) as Array<[PriceField, number | null]> }
function decimals(value: number): number { return (String(value).split('.')[1] ?? '').length }
function isSensitiveField(field: PriceField): boolean { return field === 'costPriceCents' || field === 'basePurchasePriceCents' }

function adjustmentForActor(item: PriceAdjustment, actor: PricingActor): PriceAdjustment {
  const result = structuredClone(item)
  if (actor.role === 'super-admin') return result
  result.lines = result.lines
    .map((line) => ({ ...line, changes: Object.fromEntries(fieldEntries(line.changes).filter(([field]) => !isSensitiveField(field))) }))
    .filter((line) => fieldEntries(line.changes).length > 0)
  if (actor.role === 'salesperson' || actor.role === 'warehouse') result.customerId = null
  return result
}

function historyForActor(item: PriceHistoryEntry, actor: PricingActor): PriceHistoryEntry | null {
  if (actor.role !== 'super-admin' && isSensitiveField(item.field)) return null
  const result = structuredClone(item)
  if (actor.role === 'salesperson' || actor.role === 'warehouse') result.customerId = null
  return result
}

function findAdjustment(state: PricingFeatureState, id: string): PriceAdjustment {
  const item = state.adjustments.find((candidate) => candidate.id === id)
  if (!item) throw new PricingDomainError('NOT_FOUND', '调价单不存在')
  return item
}

function baseValue(state: PricingFeatureState, sku: PricingSkuSnapshot, field: PriceField): number | null {
  if (field === 'costPriceCents') return state.costBasis.find((item) => item.skuId === sku.skuId)?.costPriceCents ?? null
  return sku.prices[field]
}

function versionAt(state: PricingFeatureState, options: { scope: 'global' | 'customer' | 'strategy'; customerId: string | null; skuId: string; unitId: string; field: PriceField; at: string }) {
  return state.versions
    .filter((item) => item.scope === options.scope && item.customerId === options.customerId && item.skuId === options.skuId && item.unitId === options.unitId && item.field === options.field
      && time(item.effectiveAt) <= time(options.at) && (item.expiredAt === null || time(item.expiredAt) > time(options.at)))
    .sort((a, b) => time(b.effectiveAt) - time(a.effectiveAt) || b.id.localeCompare(a.id))[0] ?? null
}

function globalVersionAt(state: PricingFeatureState, skuId: string, unitId: string, field: PriceField, at: string) {
  const candidates = [versionAt(state, { scope: 'global', customerId: null, skuId, unitId, field, at }), versionAt(state, { scope: 'strategy', customerId: null, skuId, unitId, field, at })].filter(Boolean)
  return candidates.sort((a, b) => time(b!.effectiveAt) - time(a!.effectiveAt) || b!.id.localeCompare(a!.id))[0] ?? null
}

function derivedValue(state: PricingFeatureState, sku: PricingSkuSnapshot, unitId: string, field: PriceField, at: string, customerId: string | null = null): { value: number | null; referenceId: string | null; converted: boolean } {
  const rate = sku.unitRates[unitId]
  if (!rate) throw new PricingDomainError('UNIT_UNAVAILABLE', '商品未配置该计量单位')
  const directCustomer = customerId ? versionAt(state, { scope: 'customer', customerId, skuId: sku.skuId, unitId, field, at }) : null
  const baseCustomer = customerId && unitId !== sku.baseUnitId ? versionAt(state, { scope: 'customer', customerId, skuId: sku.skuId, unitId: sku.baseUnitId, field, at }) : null
  const directGlobal = globalVersionAt(state, sku.skuId, unitId, field, at)
  const baseGlobal = unitId !== sku.baseUnitId ? globalVersionAt(state, sku.skuId, sku.baseUnitId, field, at) : null
  const override = state.unitOverrides.find((item) => item.skuId === sku.skuId && item.unitId === unitId)?.prices[field]
  const candidate = directCustomer ?? baseCustomer ?? directGlobal ?? baseGlobal
  if (candidate) return { value: candidate.valueCents === null ? null : Math.round(candidate.valueCents * (candidate.unitId === unitId ? 1 : rate)), referenceId: candidate.adjustmentId, converted: candidate.unitId !== unitId }
  if (override !== undefined) return { value: override, referenceId: null, converted: false }
  const base = baseValue(state, sku, field)
  return { value: base === null ? null : Math.round(base * rate), referenceId: null, converted: unitId !== sku.baseUnitId }
}

function matrixAt(state: PricingFeatureState, sku: PricingSkuSnapshot, unitId: string, at: string, customerId: string | null = null): PriceValues {
  return {
    costPriceCents: derivedValue(state, sku, unitId, 'costPriceCents', at, customerId).value,
    basePurchasePriceCents: derivedValue(state, sku, unitId, 'basePurchasePriceCents', at, customerId).value,
    baseOrderPriceCents: derivedValue(state, sku, unitId, 'baseOrderPriceCents', at, customerId).value,
    tierOnePriceCents: derivedValue(state, sku, unitId, 'tierOnePriceCents', at, customerId).value,
    tierTwoPriceCents: derivedValue(state, sku, unitId, 'tierTwoPriceCents', at, customerId).value,
    storePriceCents: derivedValue(state, sku, unitId, 'storePriceCents', at, customerId).value,
    terminalPriceCents: derivedValue(state, sku, unitId, 'terminalPriceCents', at, customerId).value,
    minimumSalePriceCents: derivedValue(state, sku, unitId, 'minimumSalePriceCents', at, customerId).value,
    maximumSalePriceCents: derivedValue(state, sku, unitId, 'maximumSalePriceCents', at, customerId).value,
  }
}

function validateDraftAgainstCatalog(state: PricingFeatureState, catalog: PricingCatalogProvider, draft: PriceAdjustmentDraft): void {
  if (time(draft.effectiveAt) < time(state.clock)) throw new PricingDomainError('INVALID_EFFECTIVE_TIME', '生效时间不能早于模拟当前时间')
  if (draft.type === 'customer') {
    const customer = catalog.getCustomer(draft.customerId!)
    if (!customer) throw new PricingDomainError('NOT_FOUND', '客户不存在')
    if (customer.status !== 'active') throw new PricingDomainError('CUSTOMER_NOT_ACTIVE', '只能为启用客户创建调价单')
  }
  for (const [index, line] of draft.lines.entries()) {
    const sku = catalog.getSku(line.skuId)
    if (!sku) throw new PricingDomainError('NOT_FOUND', `第 ${index + 1} 行 SKU 不存在`)
    if (!sku.unitRates[line.unitId]) throw new PricingDomainError('UNIT_UNAVAILABLE', `第 ${index + 1} 行单位未配置`)
    const current = matrixAt(state, sku, line.unitId, draft.effectiveAt, draft.customerId)
    const next = { ...current, ...line.changes }
    const issues = validatePriceValues(next, `lines.${index}.changes`)
    if (issues.length) throw new PricingDomainError('FORMULA_INVALID', issues.map((item) => `${item.path}: ${item.message}`).join('；'))
  }
}

function overlaps(a: PriceAdjustmentDraft, b: PriceAdjustment): boolean {
  if (scopeOf(a.type) !== scopeOf(b.type) || a.customerId !== b.customerId || time(a.effectiveAt) !== time(b.effectiveAt)) return false
  const fields = new Set(b.lines.flatMap((line) => fieldEntries(line.changes).map(([field]) => `${line.skuId}\u0000${line.unitId}\u0000${field}`)))
  return a.lines.some((line) => fieldEntries(line.changes).some(([field]) => fields.has(`${line.skuId}\u0000${line.unitId}\u0000${field}`)))
}

function adjustmentNumber(state: PricingFeatureState, type: AdjustmentType): string {
  const date = state.clock.slice(0, 10).replaceAll('-', '')
  const number = `${prefix[type]}-${date}-${String(state.nextSequences[type]).padStart(4, '0')}`
  state.nextSequences[type] += 1
  return number
}

function expirePreviousAdjustment(state: PricingFeatureState, adjustmentId: string | null): void {
  if (!adjustmentId) return
  const previous = state.adjustments.find((item) => item.id === adjustmentId)
  if (!previous || previous.status !== 'effective') return
  const versions = state.versions.filter((item) => item.adjustmentId === previous.id)
  if (versions.length && versions.every((item) => item.expiredAt !== null)) previous.status = 'expired'
}

function applyAdjustment(state: PricingFeatureState, dependencies: PricingServiceDependencies, adjustment: PriceAdjustment): void {
  const scope = scopeOf(adjustment.type)
  for (const line of adjustment.lines) {
    const sku = dependencies.catalog.getSku(line.skuId)!
    for (const [field, value] of fieldEntries(line.changes)) {
      const existing = scope === 'customer'
        ? versionAt(state, { scope, customerId: adjustment.customerId, skuId: line.skuId, unitId: line.unitId, field, at: adjustment.effectiveAt })
        : globalVersionAt(state, line.skuId, line.unitId, field, adjustment.effectiveAt)
      const previous = derivedValue(state, sku, line.unitId, field, adjustment.effectiveAt, scope === 'customer' ? adjustment.customerId : null).value
      if (existing) existing.expiredAt = adjustment.effectiveAt
      const versionId = dependencies.nextId('version')
      state.versions.push({ id: versionId, enterpriseId: state.enterpriseId, scope, customerId: adjustment.customerId, adjustmentId: adjustment.id,
        skuId: line.skuId, unitId: line.unitId, field, valueCents: value, effectiveAt: adjustment.effectiveAt, expiredAt: null })
      const difference = previous === null || value === null ? null : value - previous
      const history: PriceHistoryEntry = { id: dependencies.nextId('history'), enterpriseId: state.enterpriseId, scope, customerId: adjustment.customerId,
        adjustmentId: adjustment.id, adjustmentNumber: adjustment.number, adjustmentType: adjustment.type, skuId: line.skuId, unitId: line.unitId,
        field, previousValueCents: previous, valueCents: value, differenceCents: difference, effectiveAt: adjustment.effectiveAt, expiredAt: null }
      state.history.push(history)
      if (existing) {
        const oldHistory = state.history.find((item) => item.id !== history.id && item.scope === existing.scope && item.customerId === existing.customerId && item.skuId === existing.skuId && item.unitId === existing.unitId && item.field === existing.field && item.expiredAt === null)
        if (oldHistory) oldHistory.expiredAt = adjustment.effectiveAt
        expirePreviousAdjustment(state, existing.adjustmentId)
      }
      if (field === 'costPriceCents' && scope === 'global') {
        const cost = state.costBasis.find((item) => item.skuId === line.skuId)
        if (cost) cost.costPriceCents = value; else state.costBasis.push({ skuId: line.skuId, costPriceCents: value })
      }
    }
  }
  adjustment.status = 'effective'; adjustment.updatedAt = adjustment.effectiveAt
}

export function applyPriceFormula(currentCents: number | null, mode: FormulaMode, operand: number): number {
  if (!Number.isFinite(operand) || operand < 0 || (mode !== 'set' && currentCents === null)) throw new PricingDomainError('FORMULA_INVALID', '公式参数或当前价格无效')
  const current = currentCents ?? 0
  const next = mode === 'set' ? operand : mode === 'increase-fixed' ? current + operand : mode === 'decrease-fixed' ? current - operand
    : mode === 'increase-percent' ? current * (1 + operand / 100) : current * (1 - operand / 100)
  const rounded = Math.round(next)
  if (rounded < 0 || !Number.isSafeInteger(rounded)) throw new PricingDomainError('FORMULA_INVALID', '公式结果必须是非负整数分')
  return rounded
}

export function createPricingService(dependencies: PricingServiceDependencies) {
  const { repository, catalog } = dependencies

  function listAdjustments(actor: PricingActor, query: PriceAdjustmentQuery): PriceAdjustmentPage {
    assertRead(actor)
    const state = repository.read(); let items = state.adjustments.filter((item) => item.type === query.type)
    if (actor.role === 'salesperson' || actor.role === 'warehouse') items = items.filter((item) => item.status === 'effective')
    if (query.number) items = items.filter((item) => item.number.toLocaleLowerCase().includes(query.number!.trim().toLocaleLowerCase()))
    if (query.status) items = items.filter((item) => item.status === query.status)
    if (query.createdBy) items = items.filter((item) => item.createdBy === query.createdBy)
    if (query.customerId) items = items.filter((item) => item.customerId === query.customerId)
    if (query.createdFrom) items = items.filter((item) => time(item.createdAt) >= time(query.createdFrom!))
    if (query.createdTo) items = items.filter((item) => time(item.createdAt) <= time(query.createdTo!))
    if (query.effectiveFrom) items = items.filter((item) => time(item.effectiveAt) >= time(query.effectiveFrom!))
    if (query.effectiveTo) items = items.filter((item) => time(item.effectiveAt) <= time(query.effectiveTo!))
    items.sort((a, b) => time(b.createdAt) - time(a.createdAt) || b.id.localeCompare(a.id))
    const page = Math.max(1, query.page ?? 1); const pageSize = query.pageSize ?? 30; const total = items.length
    return { items: items.slice((page - 1) * pageSize, page * pageSize).map((item) => adjustmentForActor(item, actor)), total, page, pageSize }
  }

  function getAdjustment(actor: PricingActor, id: string): PriceAdjustment {
    assertRead(actor)
    const item = findAdjustment(repository.read(), id)
    if ((actor.role === 'salesperson' || actor.role === 'warehouse') && item.status !== 'effective') throw new PricingDomainError('PERMISSION_DENIED', '当前角色只能查看已生效售价')
    return adjustmentForActor(item, actor)
  }

  function createAdjustment(actor: PricingActor, input: PriceAdjustmentDraft): PriceAdjustment {
    assertWrite(actor); assertPriceAdjustmentDraft(input)
    return repository.transact((state) => {
      validateDraftAgainstCatalog(state, catalog, input)
      if (state.adjustments.some((item) => overlaps(input, item))) throw new PricingDomainError('SCHEDULE_CONFLICT', '同一作用范围和生效分钟存在重叠调价字段')
      const now = state.clock
      const adjustment: PriceAdjustment = { ...structuredClone(input), id: dependencies.nextId('adjustment'), enterpriseId: state.enterpriseId,
        number: adjustmentNumber(state, input.type), status: 'pending', createdBy: actor.actorId, createdAt: now, updatedAt: now,
        lines: input.lines.map((line) => ({ ...structuredClone(line), id: dependencies.nextId('line') })) }
      state.adjustments.push(adjustment)
      if (time(adjustment.effectiveAt) === time(state.clock)) applyAdjustment(state, dependencies, adjustment)
      return adjustment
    })
  }

  function updateAdjustment(actor: PricingActor, id: string, input: PriceAdjustmentDraft): PriceAdjustment {
    assertWrite(actor); assertPriceAdjustmentDraft(input)
    return repository.transact((state) => {
      const current = findAdjustment(state, id)
      if (current.status !== 'pending') throw new PricingDomainError('INVALID_STATE', '只有待生效调价单可编辑')
      if (current.type !== input.type) throw new PricingDomainError('INVALID_STATE', '调价单类型不可修改')
      validateDraftAgainstCatalog(state, catalog, input)
      if (state.adjustments.some((item) => item.id !== id && overlaps(input, item))) throw new PricingDomainError('SCHEDULE_CONFLICT', '同一作用范围和生效分钟存在重叠调价字段')
      Object.assign(current, structuredClone(input), { updatedAt: state.clock, lines: input.lines.map((line) => ({ ...structuredClone(line), id: dependencies.nextId('line') })) })
      if (time(current.effectiveAt) === time(state.clock)) applyAdjustment(state, dependencies, current)
      return current
    })
  }

  function deleteAdjustment(actor: PricingActor, id: string): void {
    assertWrite(actor)
    repository.transact((state) => { const current = findAdjustment(state, id); if (current.status !== 'pending') throw new PricingDomainError('INVALID_STATE', '只有待生效调价单可删除'); state.adjustments.splice(state.adjustments.indexOf(current), 1) })
  }

  function saveUnitOverride(actor: PricingActor, skuId: string, unitId: string, prices: Partial<PriceValues>): UnitPriceOverride {
    assertWrite(actor)
    return repository.transact((state) => {
      const sku = catalog.getSku(skuId); if (!sku) throw new PricingDomainError('NOT_FOUND', 'SKU 不存在')
      if (!sku.unitRates[unitId]) throw new PricingDomainError('UNIT_UNAVAILABLE', '商品未配置该计量单位')
      const nextMatrix = { ...matrixAt(state, sku, unitId, state.clock), ...prices }
      const issues = validatePriceValues(nextMatrix); if (issues.length) throw new PricingDomainError('FORMULA_INVALID', issues.map((item) => item.message).join('；'))
      let item = state.unitOverrides.find((candidate) => candidate.skuId === skuId && candidate.unitId === unitId)
      if (item) Object.assign(item, { prices: structuredClone(prices), updatedBy: actor.actorId, updatedAt: state.clock })
      else { item = { id: dependencies.nextId('override'), enterpriseId: state.enterpriseId, skuId, unitId, prices: structuredClone(prices), updatedBy: actor.actorId, updatedAt: state.clock }; state.unitOverrides.push(item) }
      return item
    })
  }

  function saveStrategy(actor: PricingActor, input: SaveStrategyInput): AutoPriceStrategy {
    assertWrite(actor)
    return repository.transact((state) => {
      const sku = catalog.getSku(input.skuId); if (!sku) throw new PricingDomainError('NOT_FOUND', 'SKU 不存在')
      if (!sku.unitRates[input.unitId]) throw new PricingDomainError('UNIT_UNAVAILABLE', '商品未配置该计量单位')
      if (!Number.isFinite(input.amplitude) || input.amplitude < 0) throw new PricingDomainError('FORMULA_INVALID', '调价幅度必须是非负数')
      if (time(input.startsAt) < time(state.clock) || (input.endsAt && time(input.endsAt) <= time(input.startsAt))) throw new PricingDomainError('INVALID_EFFECTIVE_TIME', '策略起止时间无效')
      const duplicate = state.strategies.find((item) => item.id !== input.id && item.enabled && input.enabled && item.skuId === input.skuId && item.unitId === input.unitId && item.targetField === input.targetField)
      if (duplicate) throw new PricingDomainError('SCHEDULE_CONFLICT', '同一 SKU、单位和目标售价只能有一个启用策略')
      const existing = input.id ? state.strategies.find((item) => item.id === input.id) : null
      if (input.id && !existing) throw new PricingDomainError('NOT_FOUND', '自动调价策略不存在')
      const item: AutoPriceStrategy = { ...structuredClone(input), id: existing?.id ?? dependencies.nextId('strategy'), enterpriseId: state.enterpriseId,
        lastRunAt: existing?.lastRunAt ?? null, lastError: null }
      if (existing) state.strategies[state.strategies.indexOf(existing)] = item; else state.strategies.push(item)
      return item
    })
  }

  function runStrategies(state: PricingFeatureState): void {
    for (const strategy of state.strategies.filter((item) => item.enabled && time(item.startsAt) <= time(state.clock) && (!item.endsAt || time(item.endsAt) > time(state.clock)) && item.lastRunAt !== state.clock)) {
      const sku = catalog.getSku(strategy.skuId)!
      const anchorField: PriceField = strategy.anchor === 'cost-price' ? 'costPriceCents' : strategy.anchor === 'base-purchase-price' ? 'basePurchasePriceCents' : 'baseOrderPriceCents'
      const anchor = derivedValue(state, sku, strategy.unitId, anchorField, state.clock).value
      try {
        const mode: FormulaMode = strategy.amplitudeType === 'percent' ? 'increase-percent' : 'increase-fixed'
        const value = applyPriceFormula(anchor, mode, strategy.amplitude)
        const previousValue = matrixAt(state, sku, strategy.unitId, state.clock)[strategy.targetField]
        const matrix = { ...matrixAt(state, sku, strategy.unitId, state.clock), [strategy.targetField]: value }
        const issues = validatePriceValues(matrix); if (issues.length) throw new PricingDomainError('FORMULA_INVALID', issues.map((item) => item.message).join('；'))
        const existing = globalVersionAt(state, strategy.skuId, strategy.unitId, strategy.targetField, state.clock)
        if (existing) existing.expiredAt = state.clock
        const versionId = dependencies.nextId('version')
        state.versions.push({ id: versionId, enterpriseId: state.enterpriseId, scope: 'strategy', customerId: null, adjustmentId: null, skuId: strategy.skuId,
          unitId: strategy.unitId, field: strategy.targetField, valueCents: value, effectiveAt: state.clock, expiredAt: null })
        state.history.push({ id: dependencies.nextId('history'), enterpriseId: state.enterpriseId, scope: 'strategy', customerId: null, adjustmentId: null,
          adjustmentNumber: `STRATEGY-${strategy.id}`, adjustmentType: 'strategy', skuId: strategy.skuId, unitId: strategy.unitId, field: strategy.targetField,
          previousValueCents: previousValue, valueCents: value,
          differenceCents: previousValue === null ? null : value - previousValue, effectiveAt: state.clock, expiredAt: null })
        strategy.lastError = null
      } catch (caught) { strategy.lastError = caught instanceof Error ? caught.message : '自动调价失败' }
      strategy.lastRunAt = state.clock
    }
  }

  function advanceClock(actor: PricingActor, target: string): void {
    assertWrite(actor)
    if (!Number.isFinite(time(target)) || !/:00(?:Z|[+-]\d{2}:\d{2})$/.test(target)) throw new PricingDomainError('INVALID_EFFECTIVE_TIME', '目标时间必须精确到分钟')
    repository.transact((state) => {
      if (time(target) < time(state.clock)) throw new PricingDomainError('INVALID_EFFECTIVE_TIME', '模拟时钟不能倒退')
      state.clock = target
      const due = state.adjustments.filter((item) => item.status === 'pending' && time(item.effectiveAt) <= time(target)).sort((a, b) => time(a.effectiveAt) - time(b.effectiveAt) || a.id.localeCompare(b.id))
      due.forEach((item) => applyAdjustment(state, dependencies, item))
      runStrategies(state)
    })
  }

  function resolvePrice(actor: PricingActor, input: ResolvePriceInput): ResolvedPrice {
    assertRead(actor)
    if (!Number.isFinite(input.quantity) || input.quantity <= 0 || decimals(input.quantity) > 3) throw new PricingDomainError('PRICE_UNAVAILABLE', '数量必须为正数且最多三位小数')
    const state = repository.read(); const customer = catalog.getCustomer(input.customerId); const sku = catalog.getSku(input.skuId)
    if (!customer) throw new PricingDomainError('NOT_FOUND', '客户不存在')
    if (customer.status !== 'active') throw new PricingDomainError('CUSTOMER_NOT_ACTIVE', '客户当前不可下单')
    if (!sku) throw new PricingDomainError('NOT_FOUND', 'SKU 不存在')
    if (sku.productStatus !== 'on-sale') throw new PricingDomainError('PRODUCT_NOT_ORDERABLE', '商品当前不可订')
    const rate = sku.unitRates[input.unitId]; if (!rate) throw new PricingDomainError('UNIT_UNAVAILABLE', '商品未配置该计量单位')
    const tier = customer.categoryLineage.map((id) => state.categoryTierMappings.find((item) => item.categoryId === id)?.tier).find(Boolean) ?? 'base-order'
    const field = priceTierFields[tier]
    const customerValue = derivedValue(state, sku, input.unitId, field, state.clock, customer.customerId)
    const hasCustomerVersion = Boolean(versionAt(state, { scope: 'customer', customerId: customer.customerId, skuId: sku.skuId, unitId: input.unitId, field, at: state.clock })
      ?? (input.unitId !== sku.baseUnitId ? versionAt(state, { scope: 'customer', customerId: customer.customerId, skuId: sku.skuId, unitId: sku.baseUnitId, field, at: state.clock }) : null))
    const global = derivedValue(state, sku, input.unitId, field, state.clock)
    const selected = hasCustomerVersion ? customerValue : global
    if (selected.value === null) throw new PricingDomainError('PRICE_UNAVAILABLE', '当前 SKU 没有可用价格')
    return { skuId: sku.skuId, unitId: input.unitId, quantity: input.quantity, unitPriceCents: selected.value,
      source: hasCustomerVersion ? 'customer' : tier === 'base-order' ? 'base-order' : 'level', sourceReferenceId: selected.referenceId,
      conversionRate: rate, calculatedAt: state.clock }
  }

  function listHistory(actor: PricingActor, query: PriceHistoryQuery = {}): PriceHistoryPage {
    assertRead(actor)
    let items = repository.read().history
    if (actor.role === 'salesperson' || actor.role === 'warehouse') items = items.filter((item) => item.expiredAt === null && time(item.effectiveAt) <= time(repository.read().clock))
    items = items.map((item) => historyForActor(item, actor)).filter((item): item is PriceHistoryEntry => item !== null)
    if (query.adjustmentNumber) items = items.filter((item) => item.adjustmentNumber.toLocaleLowerCase().includes(query.adjustmentNumber!.trim().toLocaleLowerCase()))
    if (query.adjustmentType) items = items.filter((item) => item.adjustmentType === query.adjustmentType)
    if (query.skuId) items = items.filter((item) => item.skuId === query.skuId)
    if (query.effectiveFrom) items = items.filter((item) => time(item.effectiveAt) >= time(query.effectiveFrom!))
    if (query.effectiveTo) items = items.filter((item) => time(item.effectiveAt) <= time(query.effectiveTo!))
    items.sort((a, b) => time(b.effectiveAt) - time(a.effectiveAt) || b.id.localeCompare(a.id))
    const page = Math.max(1, query.page ?? 1); const pageSize = query.pageSize ?? 30; const total = items.length
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize }
  }
  function getClock(actor: PricingActor): string { assertRead(actor); return repository.read().clock }

  return { listAdjustments, getAdjustment, createAdjustment, updateAdjustment, deleteAdjustment, saveUnitOverride, saveStrategy, advanceClock, resolvePrice, listHistory, getClock }
}
