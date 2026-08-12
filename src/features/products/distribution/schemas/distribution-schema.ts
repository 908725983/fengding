import type { CustomerScope, DistributionFeatureState, DistributionPlanDraft, OrderTemplateDraft, SuggestedProductLine } from '../types'

export interface DistributionValidationIssue { path: string; message: string }
export class DistributionValidationError extends Error {
  readonly code = 'DISTRIBUTION_VALIDATION_FAILED'
  constructor(readonly issues: DistributionValidationIssue[]) { super(issues.map((item) => `${item.path}: ${item.message}`).join('；')); this.name = 'DistributionValidationError' }
}

const unique = (values: string[]) => new Set(values).size === values.length
const validTime = (value: string) => Number.isFinite(Date.parse(value)) && /:00(?:Z|[+-]\d{2}:\d{2})$/.test(value)

function scopeIssues(scope: CustomerScope): DistributionValidationIssue[] {
  const issues: DistributionValidationIssue[] = []
  if (!['all', 'criteria', 'specified'].includes(scope.type)) issues.push({ path: 'scope.type', message: '范围类型无效' })
  const groups = [scope.provinceCodes, scope.cityCodes, scope.districtCodes, scope.categoryIds, scope.tagIds, scope.customerIds]
  if (groups.some((items) => !unique(items))) issues.push({ path: 'scope', message: '范围条件不能包含重复值' })
  if (scope.type === 'criteria' && groups.slice(0, 5).every((items) => !items.length)) issues.push({ path: 'scope', message: '按条件时至少选择一个区域、分类或标签' })
  if (scope.type === 'specified' && (!scope.customerIds.length || scope.customerIds.length > 100)) issues.push({ path: 'scope.customerIds', message: '指定客户必须为 1～100 个' })
  return issues
}

function lineIssues(lines: SuggestedProductLine[], max: number): DistributionValidationIssue[] {
  const issues: DistributionValidationIssue[] = []
  if (!lines.length || lines.length > max) issues.push({ path: 'lines', message: `商品明细必须为 1～${max} 行` })
  if (!unique(lines.map((item) => item.skuId))) issues.push({ path: 'lines.skuId', message: 'SKU 不能重复' })
  lines.forEach((line, index) => {
    if (!line.skuId.trim()) issues.push({ path: `lines.${index}.skuId`, message: 'SKU 不能为空' })
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) issues.push({ path: `lines.${index}.quantity`, message: '数量必须为正整数' })
  })
  return issues
}

function commonName(name: string): DistributionValidationIssue[] {
  const size = name.trim().length
  return size < 1 || size > 20 ? [{ path: 'name', message: '名称必须为 1～20 个字符' }] : []
}

export function validateDistributionPlanDraft(draft: DistributionPlanDraft): DistributionValidationIssue[] {
  const issues = [...commonName(draft.name), ...scopeIssues(draft.scope), ...lineIssues(draft.lines, 20)]
  if (!['enabled', 'disabled'].includes(draft.status)) issues.push({ path: 'status', message: '状态无效' })
  if (!validTime(draft.startsAt) || !validTime(draft.endsAt) || draft.endsAt <= draft.startsAt) issues.push({ path: 'startsAt', message: '起止时间必须精确到分钟且结束晚于开始' })
  return issues
}

export function validateOrderTemplateDraft(draft: OrderTemplateDraft): DistributionValidationIssue[] {
  const issues = [...commonName(draft.name), ...scopeIssues(draft.scope), ...lineIssues(draft.lines, 200)]
  if (!['enabled', 'disabled'].includes(draft.status)) issues.push({ path: 'status', message: '状态无效' })
  if (typeof draft.selfOrderEnabled !== 'boolean') issues.push({ path: 'selfOrderEnabled', message: '自主下单开关无效' })
  return issues
}

export function assertDistributionPlanDraft(draft: DistributionPlanDraft): void { const issues = validateDistributionPlanDraft(draft); if (issues.length) throw new DistributionValidationError(issues) }
export function assertOrderTemplateDraft(draft: OrderTemplateDraft): void { const issues = validateOrderTemplateDraft(draft); if (issues.length) throw new DistributionValidationError(issues) }

export function assertDistributionFeatureState(state: DistributionFeatureState): void {
  const issues: DistributionValidationIssue[] = []
  if (state.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: '必须为 1' })
  if (!state.enterpriseId.trim()) issues.push({ path: 'enterpriseId', message: '不能为空' })
  for (const plan of state.plans) issues.push(...validateDistributionPlanDraft(plan).map((item) => ({ ...item, path: `plans.${plan.id}.${item.path}` })))
  for (const template of state.templates) issues.push(...validateOrderTemplateDraft(template).map((item) => ({ ...item, path: `templates.${template.id}.${item.path}` })))
  const ids = [...state.plans.map((item) => item.id), ...state.templates.map((item) => item.id), ...state.changeLogs.map((item) => item.id)]
  if (!unique(ids)) issues.push({ path: 'id', message: '实体 ID 必须唯一' })
  if ([...state.plans, ...state.templates, ...state.changeLogs].some((item) => item.enterpriseId !== state.enterpriseId)) issues.push({ path: 'enterpriseId', message: '实体企业不一致' })
  if (issues.length) throw new DistributionValidationError(issues)
}
