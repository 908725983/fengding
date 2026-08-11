import type {
  AdjustmentType,
  PriceAdjustmentDraft,
  PriceField,
  PricingFeatureState,
  PriceValues,
} from '../types'

export interface PricingValidationIssue { path: string; message: string }

export class PricingValidationError extends Error {
  readonly code = 'PRICING_VALIDATION_FAILED'
  constructor(readonly issues: PricingValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('；'))
    this.name = 'PricingValidationError'
  }
}

export const priceFields = [
  'costPriceCents', 'basePurchasePriceCents', 'baseOrderPriceCents', 'tierOnePriceCents', 'tierTwoPriceCents',
  'storePriceCents', 'terminalPriceCents', 'minimumSalePriceCents', 'maximumSalePriceCents',
] as const satisfies readonly PriceField[]

export const controlledSaleFields = ['baseOrderPriceCents', 'tierOnePriceCents', 'tierTwoPriceCents', 'storePriceCents', 'terminalPriceCents'] as const

const allowedChanges: Record<AdjustmentType, Set<PriceField>> = {
  purchase: new Set(['costPriceCents', 'basePurchasePriceCents']),
  level: new Set(['costPriceCents', 'baseOrderPriceCents', 'tierOnePriceCents', 'tierTwoPriceCents', 'storePriceCents', 'terminalPriceCents']),
  customer: new Set(['costPriceCents', 'baseOrderPriceCents', 'tierOnePriceCents', 'tierTwoPriceCents', 'storePriceCents', 'terminalPriceCents']),
}

function required(issues: PricingValidationIssue[], path: string, value: string | null, max = 100): void {
  if (!value?.trim()) issues.push({ path, message: '不能为空' })
  else if (value.trim().length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}

function timestamp(issues: PricingValidationIssue[], path: string, value: string): void {
  if (!Number.isFinite(Date.parse(value)) || !/:00(?:Z|[+-]\d{2}:\d{2})$/.test(value)) issues.push({ path, message: '必须是精确到分钟的 ISO 时间' })
}

function money(issues: PricingValidationIssue[], path: string, value: number | null | undefined): void {
  if (value !== null && value !== undefined && (!Number.isSafeInteger(value) || value < 0)) issues.push({ path, message: '必须是非负整数分或空值' })
}

export function validatePriceValues(values: Partial<PriceValues>, path = 'prices'): PricingValidationIssue[] {
  const issues: PricingValidationIssue[] = []
  for (const key of priceFields) money(issues, `${path}.${key}`, values[key])
  const minimum = values.minimumSalePriceCents
  const maximum = values.maximumSalePriceCents
  if (minimum !== undefined && maximum !== undefined && minimum !== null && maximum !== null && minimum > maximum) {
    issues.push({ path: `${path}.minimumSalePriceCents`, message: '最低售价不能高于最高售价' })
  }
  for (const key of controlledSaleFields) {
    const value = values[key]
    if (value === undefined || value === null) continue
    if (minimum !== undefined && minimum !== null && value < minimum) issues.push({ path: `${path}.${key}`, message: '不能低于最低售价' })
    if (maximum !== undefined && maximum !== null && value > maximum) issues.push({ path: `${path}.${key}`, message: '不能高于最高售价' })
  }
  return issues
}

export function validatePriceAdjustmentDraft(draft: PriceAdjustmentDraft): PricingValidationIssue[] {
  const issues: PricingValidationIssue[] = []
  timestamp(issues, 'effectiveAt', draft.effectiveAt)
  if (draft.note !== null && draft.note.trim().length > 500) issues.push({ path: 'note', message: '不能超过 500 个字符' })
  if (draft.type === 'customer') required(issues, 'customerId', draft.customerId)
  else if (draft.customerId !== null) issues.push({ path: 'customerId', message: '仅客户调价单可指定客户' })
  if (draft.type === 'purchase' && draft.formulaAnchor !== null) issues.push({ path: 'formulaAnchor', message: '进价调价单不使用售价公式锚点' })
  if (draft.type !== 'purchase' && draft.formulaAnchor === null) issues.push({ path: 'formulaAnchor', message: '等级/客户调价必须选择公式锚点' })
  if (!draft.lines.length) issues.push({ path: 'lines', message: '至少需要一条调价明细' })
  const rowKeys = new Set<string>()
  draft.lines.forEach((line, index) => {
    required(issues, `lines.${index}.skuId`, line.skuId)
    required(issues, `lines.${index}.unitId`, line.unitId)
    const rowKey = `${line.skuId}\u0000${line.unitId}`
    if (rowKeys.has(rowKey)) issues.push({ path: `lines.${index}`, message: '同一 SKU 和单位不能重复' })
    rowKeys.add(rowKey)
    const entries = Object.entries(line.changes) as Array<[PriceField, number | null]>
    if (!entries.length) issues.push({ path: `lines.${index}.changes`, message: '至少修改一个价格字段' })
    for (const [field, value] of entries) {
      if (!allowedChanges[draft.type].has(field)) issues.push({ path: `lines.${index}.changes.${field}`, message: '该调价类型不能修改此字段' })
      money(issues, `lines.${index}.changes.${field}`, value)
    }
  })
  return issues
}

export function assertPriceAdjustmentDraft(draft: PriceAdjustmentDraft): void {
  const issues = validatePriceAdjustmentDraft(draft)
  if (issues.length) throw new PricingValidationError(issues)
}

export function assertPricingFeatureState(state: PricingFeatureState): void {
  const issues: PricingValidationIssue[] = []
  if (state.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: '必须为 1' })
  required(issues, 'enterpriseId', state.enterpriseId)
  timestamp(issues, 'clock', state.clock)
  for (const [type, value] of Object.entries(state.nextSequences)) if (!Number.isInteger(value) || value < 1) issues.push({ path: `nextSequences.${type}`, message: '必须是大于等于 1 的整数' })
  for (const [name, collection] of Object.entries({ adjustments: state.adjustments, versions: state.versions, history: state.history, unitOverrides: state.unitOverrides, strategies: state.strategies })) {
    const ids = collection.map((item) => item.id)
    if (new Set(ids).size !== ids.length) issues.push({ path: `${name}.id`, message: 'ID 必须唯一' })
    if (collection.some((item) => item.enterpriseId !== state.enterpriseId)) issues.push({ path: `${name}.enterpriseId`, message: '企业必须与状态一致' })
  }
  const numbers = state.adjustments.map((item) => item.number)
  if (new Set(numbers).size !== numbers.length) issues.push({ path: 'adjustments.number', message: '调价单号必须唯一' })
  state.adjustments.forEach((item, index) => {
    const { id: _id, enterpriseId: _enterprise, number: _number, status: _status, createdBy: _createdBy, createdAt: _createdAt, updatedAt: _updatedAt, lines, ...draft } = item
    issues.push(...validatePriceAdjustmentDraft({ ...draft, lines: lines.map(({ id: _lineId, ...line }) => line) }).map((issue) => ({ ...issue, path: `adjustments.${index}.${issue.path}` })))
    timestamp(issues, `adjustments.${index}.createdAt`, item.createdAt)
    timestamp(issues, `adjustments.${index}.updatedAt`, item.updatedAt)
    if (item.status === 'pending' && Date.parse(item.effectiveAt) <= Date.parse(state.clock)) issues.push({ path: `adjustments.${index}.status`, message: '待生效单据的生效时间必须晚于当前时钟' })
    if (item.status !== 'pending' && Date.parse(item.effectiveAt) > Date.parse(state.clock)) issues.push({ path: `adjustments.${index}.status`, message: '已生效/失效单据不能晚于当前时钟' })
  })
  state.versions.forEach((item, index) => {
    if (!(priceFields as readonly string[]).includes(item.field)) issues.push({ path: `versions.${index}.field`, message: '不是支持的价格字段' })
    money(issues, `versions.${index}.valueCents`, item.valueCents)
    timestamp(issues, `versions.${index}.effectiveAt`, item.effectiveAt)
    if (item.expiredAt) {
      timestamp(issues, `versions.${index}.expiredAt`, item.expiredAt)
      if (Date.parse(item.expiredAt) <= Date.parse(item.effectiveAt)) issues.push({ path: `versions.${index}.expiredAt`, message: '必须晚于生效时间' })
    }
    if (item.scope === 'customer' && !item.customerId) issues.push({ path: `versions.${index}.customerId`, message: '客户价格必须指定客户' })
    if (item.scope !== 'customer' && item.customerId !== null) issues.push({ path: `versions.${index}.customerId`, message: '仅客户价格可指定客户' })
  })
  state.history.forEach((item, index) => {
    money(issues, `history.${index}.previousValueCents`, item.previousValueCents)
    money(issues, `history.${index}.valueCents`, item.valueCents)
    if (item.differenceCents !== null && (!Number.isSafeInteger(item.differenceCents)
      || item.previousValueCents === null || item.valueCents === null
      || item.differenceCents !== item.valueCents - item.previousValueCents)) {
      issues.push({ path: `history.${index}.differenceCents`, message: '必须等于新价格减原价格，空值变化时必须为空' })
    }
  })
  state.unitOverrides.forEach((item, index) => issues.push(...validatePriceValues(item.prices, `unitOverrides.${index}.prices`)))
  if (new Set(state.unitOverrides.map((item) => `${item.skuId}\u0000${item.unitId}`)).size !== state.unitOverrides.length) issues.push({ path: 'unitOverrides', message: '同一 SKU 和单位只能有一个显式覆盖' })
  state.strategies.forEach((item, index) => {
    if (!Number.isFinite(item.amplitude) || item.amplitude < 0) issues.push({ path: `strategies.${index}.amplitude`, message: '必须是非负数' })
    timestamp(issues, `strategies.${index}.startsAt`, item.startsAt)
    if (item.endsAt) { timestamp(issues, `strategies.${index}.endsAt`, item.endsAt); if (Date.parse(item.endsAt) <= Date.parse(item.startsAt)) issues.push({ path: `strategies.${index}.endsAt`, message: '必须晚于开始时间' }) }
    if (item.lastRunAt) timestamp(issues, `strategies.${index}.lastRunAt`, item.lastRunAt)
  })
  const enabledStrategyKeys = state.strategies.filter((item) => item.enabled).map((item) => `${item.skuId}\u0000${item.unitId}\u0000${item.targetField}`)
  if (new Set(enabledStrategyKeys).size !== enabledStrategyKeys.length) issues.push({ path: 'strategies', message: '同一 SKU、单位和目标售价只能有一个启用策略' })
  if (new Set(state.categoryTierMappings.map((item) => item.categoryId)).size !== state.categoryTierMappings.length) issues.push({ path: 'categoryTierMappings.categoryId', message: '客户分类价格层级不能重复' })
  if (new Set(state.costBasis.map((item) => item.skuId)).size !== state.costBasis.length) issues.push({ path: 'costBasis.skuId', message: 'SKU 成本基准不能重复' })
  state.costBasis.forEach((item, index) => money(issues, `costBasis.${index}.costPriceCents`, item.costPriceCents))
  if (issues.length) throw new PricingValidationError(issues)
}
