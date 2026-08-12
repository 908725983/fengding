import type { AuthorizationFeatureState, AuthorizationPlanDraft, AuthorizationRuleDraft, SpecialAuthorizationBatchDraft } from '../types'

export interface AuthorizationValidationIssue { path: string; message: string }
export class AuthorizationValidationError extends Error {
  readonly code = 'AUTHORIZATION_VALIDATION_FAILED'
  constructor(readonly issues: AuthorizationValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('；')); this.name = 'AuthorizationValidationError'
  }
}

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const unique = (values: string[]) => new Set(values).size === values.length
const required = (issues: AuthorizationValidationIssue[], path: string, value: string, max: number) => {
  if (!value.trim()) issues.push({ path, message: '不能为空' })
  else if (value.trim().length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}

export function validateAuthorizationPlanDraft(draft: AuthorizationPlanDraft): AuthorizationValidationIssue[] {
  const issues: AuthorizationValidationIssue[] = []
  required(issues, 'name', draft.name, 40)
  for (const [path, values] of [['categoryIds', draft.categoryIds], ['brandIds', draft.brandIds], ['productIds', draft.productIds], ['customerIds', draft.customerIds]] as const) {
    if (!unique(values)) issues.push({ path, message: '不能包含重复项' })
  }
  if (!['enabled', 'disabled'].includes(draft.status)) issues.push({ path: 'status', message: '状态无效' })
  return issues
}

export function validateAuthorizationRuleDraft(draft: AuthorizationRuleDraft): AuthorizationValidationIssue[] {
  const issues: AuthorizationValidationIssue[] = []
  required(issues, 'name', draft.name, 20); required(issues, 'planId', draft.planId, 100)
  if (!draft.weekdays.length) issues.push({ path: 'weekdays', message: '至少选择一天' })
  if (!unique(draft.weekdays.map(String)) || draft.weekdays.some((day) => day < 1 || day > 7)) issues.push({ path: 'weekdays', message: '星期必须唯一且为 1～7' })
  if (!draft.timeRanges.length) issues.push({ path: 'timeRanges', message: '至少添加一个时段' })
  const sorted = [...draft.timeRanges].sort((a, b) => a.start.localeCompare(b.start))
  sorted.forEach((range, index) => {
    if (!timePattern.test(range.start) || !timePattern.test(range.end)) issues.push({ path: `timeRanges.${index}`, message: '时间格式必须为 HH:mm' })
    else if (range.start >= range.end) issues.push({ path: `timeRanges.${index}`, message: '开始必须早于结束且不能跨日' })
    if (index && sorted[index - 1].end > range.start) issues.push({ path: `timeRanges.${index}`, message: '同日时段不能重叠' })
  })
  if (!draft.customerIds.length) issues.push({ path: 'customerIds', message: '至少选择一个客户' })
  if (!unique(draft.customerIds)) issues.push({ path: 'customerIds', message: '不能包含重复客户' })
  return issues
}

export function validateSpecialAuthorizationBatchDraft(draft: SpecialAuthorizationBatchDraft): AuthorizationValidationIssue[] {
  const issues: AuthorizationValidationIssue[] = []
  if (!draft.customerIds.length || !unique(draft.customerIds)) issues.push({ path: 'customerIds', message: '至少选择一个客户且不能重复' })
  if (!draft.productIds.length || !unique(draft.productIds)) issues.push({ path: 'productIds', message: '至少选择一个商品且不能重复' })
  if (!['visible-orderable', 'visible-only', 'prohibited'].includes(draft.type)) issues.push({ path: 'type', message: '授权类型无效' })
  if (!Number.isFinite(Date.parse(draft.startsAt))) issues.push({ path: 'startsAt', message: '开始时间无效' })
  if (draft.endsAt !== null && (!Number.isFinite(Date.parse(draft.endsAt)) || draft.endsAt <= draft.startsAt)) issues.push({ path: 'endsAt', message: '结束时间必须晚于开始时间' })
  if (draft.note !== null && draft.note.trim().length > 500) issues.push({ path: 'note', message: '不能超过 500 个字符' })
  return issues
}

export function assertAuthorizationPlanDraft(draft: AuthorizationPlanDraft): void { const issues = validateAuthorizationPlanDraft(draft); if (issues.length) throw new AuthorizationValidationError(issues) }
export function assertAuthorizationRuleDraft(draft: AuthorizationRuleDraft): void { const issues = validateAuthorizationRuleDraft(draft); if (issues.length) throw new AuthorizationValidationError(issues) }
export function assertSpecialAuthorizationBatchDraft(draft: SpecialAuthorizationBatchDraft): void { const issues = validateSpecialAuthorizationBatchDraft(draft); if (issues.length) throw new AuthorizationValidationError(issues) }

export function assertAuthorizationFeatureState(state: AuthorizationFeatureState): void {
  const issues: AuthorizationValidationIssue[] = []
  if (state.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: '必须为 1' })
  required(issues, 'enterpriseId', state.enterpriseId, 100)
  if (!Number.isInteger(state.nextPlanSequence) || state.nextPlanSequence < 1) issues.push({ path: 'nextPlanSequence', message: '必须为正整数' })
  for (const [name, items] of [['plans', state.plans], ['rules', state.rules], ['specials', state.specials], ['changeLogs', state.changeLogs]] as const) {
    if (!unique(items.map((item) => item.id))) issues.push({ path: `${name}.id`, message: 'ID 必须唯一' })
    if (items.some((item) => item.enterpriseId !== state.enterpriseId)) issues.push({ path: `${name}.enterpriseId`, message: '企业必须一致' })
  }
  if (!unique(state.plans.map((item) => item.code.toLocaleLowerCase()))) issues.push({ path: 'plans.code', message: '方案编码必须唯一' })
  if (!unique(state.plans.filter((item) => item.deletedAt === null).map((item) => item.name.trim().toLocaleLowerCase()))) issues.push({ path: 'plans.name', message: '有效方案名称必须唯一' })
  if (!unique(state.rules.filter((item) => item.deletedAt === null).map((item) => item.name.trim().toLocaleLowerCase()))) issues.push({ path: 'rules.name', message: '有效规则名称必须唯一' })
  const planIds = new Set(state.plans.map((item) => item.id))
  if (state.rules.some((item) => !planIds.has(item.planId))) issues.push({ path: 'rules.planId', message: '规则引用的方案不存在' })
  if (issues.length) throw new AuthorizationValidationError(issues)
}

