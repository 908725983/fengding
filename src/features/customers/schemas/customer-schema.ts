import type {
  AttachmentMetadata,
  CustomerCategoryDraft,
  CustomerDraft,
  CustomerFeatureState,
  CustomerTagColor,
  CustomerTagDraft,
} from '../types'

export interface ValidationIssue { path: string; message: string }

export class CustomerValidationError extends Error {
  readonly code = 'CUSTOMER_VALIDATION_FAILED'
  constructor(readonly issues: ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('；'))
    this.name = 'CustomerValidationError'
  }
}

const tagColors = new Set<CustomerTagColor>(['#F5222D', '#FA8C16', '#52C41A', '#1890FF', '#8C8C8C'])
const attachmentTypes = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function requiredText(issues: ValidationIssue[], path: string, value: string, max?: number): void {
  const normalized = value.trim()
  if (!normalized) issues.push({ path, message: '不能为空' })
  if (max !== undefined && normalized.length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}

function optionalMax(issues: ValidationIssue[], path: string, value: string | null, max: number): void {
  if (value !== null && value.trim().length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}

function nonNegative(issues: ValidationIssue[], path: string, value: number | null): void {
  if (value !== null && (!Number.isFinite(value) || value < 0)) issues.push({ path, message: '必须是非负数' })
}

function integerRange(issues: ValidationIssue[], path: string, value: number | null, min: number, max?: number): void {
  if (value === null || !Number.isInteger(value) || value < min || (max !== undefined && value > max)) {
    issues.push({ path, message: max === undefined ? `必须是大于等于 ${min} 的整数` : `必须是 ${min}～${max} 的整数` })
  }
}

function validateAttachment(issues: ValidationIssue[], attachment: AttachmentMetadata, index: number): void {
  if (!attachment.name.trim()) issues.push({ path: `attachments.${index}.name`, message: '文件名不能为空' })
  if (!attachmentTypes.has(attachment.mimeType)) issues.push({ path: `attachments.${index}.mimeType`, message: '仅支持 PDF、JPG、PNG' })
  if (!Number.isInteger(attachment.sizeBytes) || attachment.sizeBytes <= 0 || attachment.sizeBytes > 5 * 1024 * 1024) {
    issues.push({ path: `attachments.${index}.sizeBytes`, message: '单文件必须大于 0 且不超过 5MB' })
  }
}

export function validateCustomerDraft(draft: CustomerDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (draft.codeMode === 'manual') requiredText(issues, 'code', draft.code ?? '')
  requiredText(issues, 'name', draft.name, 50)
  requiredText(issues, 'categoryId', draft.categoryId)
  requiredText(issues, 'primaryContactName', draft.primaryContactName)
  requiredText(issues, 'primaryPhone', draft.primaryPhone)
  requiredText(issues, 'provinceCode', draft.provinceCode)
  requiredText(issues, 'cityCode', draft.cityCode)
  requiredText(issues, 'districtCode', draft.districtCode)
  requiredText(issues, 'address', draft.address, 100)
  requiredText(issues, 'salespersonId', draft.salespersonId)
  nonNegative(issues, 'creditLimitCents', draft.creditLimitCents)
  optionalMax(issues, 'description', draft.description, 500)
  if (draft.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) issues.push({ path: 'email', message: '邮箱格式不正确' })
  if (draft.taxId?.trim() && draft.taxId.trim().length !== 18) issues.push({ path: 'taxId', message: '税号必须为 18 位' })
  if ((draft.longitude === null) !== (draft.latitude === null)) issues.push({ path: 'longitude/latitude', message: '经纬度必须同时存在或同时为空' })
  if (draft.longitude !== null && (draft.longitude < -180 || draft.longitude > 180)) issues.push({ path: 'longitude', message: '经度必须在 -180～180' })
  if (draft.latitude !== null && (draft.latitude < -90 || draft.latitude > 90)) issues.push({ path: 'latitude', message: '纬度必须在 -90～90' })
  if (draft.settlementMethod === 'terms') integerRange(issues, 'paymentTermDays', draft.paymentTermDays, 1, 365)
  if (draft.settlementMethod !== 'terms' && draft.paymentTermDays !== null) issues.push({ path: 'paymentTermDays', message: '非账期结算时必须清空' })
  if (draft.establishedDate !== null && Number.isNaN(Date.parse(draft.establishedDate))) issues.push({ path: 'establishedDate', message: '日期格式不正确' })
  nonNegative(issues, 'storeArea', draft.storeArea)
  if (draft.employeeCount !== null) integerRange(issues, 'employeeCount', draft.employeeCount, 0)
  draft.attachments.forEach((attachment, index) => validateAttachment(issues, attachment, index))
  if (new Set(draft.tagIds).size !== draft.tagIds.length) issues.push({ path: 'tagIds', message: '不能包含重复标签' })
  if (draft.status === 'frozen' && !draft.frozenReason?.trim()) issues.push({ path: 'frozenReason', message: '冻结状态必须填写原因' })
  if (draft.status !== 'frozen' && draft.frozenReason !== null) issues.push({ path: 'frozenReason', message: '非冻结状态不能保留冻结原因' })
  return issues
}

export function assertCustomerDraft(draft: CustomerDraft): void {
  const issues = validateCustomerDraft(draft)
  if (issues.length) throw new CustomerValidationError(issues)
}

export function validateCategoryDraft(draft: CustomerCategoryDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  requiredText(issues, 'name', draft.name, 20)
  requiredText(issues, 'code', draft.code)
  integerRange(issues, 'discountRatePercent', draft.discountRatePercent, 1, 100)
  nonNegative(issues, 'minimumOrderAmountCents', draft.minimumOrderAmountCents)
  nonNegative(issues, 'defaultCreditLimitCents', draft.defaultCreditLimitCents)
  if (draft.defaultPaymentTermDays !== null) integerRange(issues, 'defaultPaymentTermDays', draft.defaultPaymentTermDays, 1, 365)
  if (!Number.isInteger(draft.sortOrder)) issues.push({ path: 'sortOrder', message: '必须是整数' })
  if (draft.icon !== null) validateAttachment(issues, draft.icon, 0)
  return issues
}

export function assertCategoryDraft(draft: CustomerCategoryDraft): void {
  const issues = validateCategoryDraft(draft)
  if (issues.length) throw new CustomerValidationError(issues)
}

export function validateTagDraft(draft: CustomerTagDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  requiredText(issues, 'name', draft.name, 10)
  requiredText(issues, 'code', draft.code)
  if (!tagColors.has(draft.color)) issues.push({ path: 'color', message: '必须使用预设颜色' })
  if (!Number.isInteger(draft.sortOrder)) issues.push({ path: 'sortOrder', message: '必须是整数' })
  return issues
}

export function assertTagDraft(draft: CustomerTagDraft): void {
  const issues = validateTagDraft(draft)
  if (issues.length) throw new CustomerValidationError(issues)
}

export function assertCustomerFeatureState(state: CustomerFeatureState): void {
  const issues: ValidationIssue[] = []
  if (state.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: '必须为 1' })
  requiredText(issues, 'enterpriseId', state.enterpriseId)
  integerRange(issues, 'nextCustomerSequence', state.nextCustomerSequence, 1)
  const collections = [
    ['customers', state.customers], ['categories', state.categories], ['tags', state.tags],
    ['suggestions', state.suggestions], ['changeLogs', state.changeLogs],
  ] as const
  for (const [name, values] of collections) {
    const ids = values.map((value) => value.id)
    if (new Set(ids).size !== ids.length) issues.push({ path: name, message: '实体 ID 必须唯一' })
    if (values.some((value) => value.enterpriseId !== state.enterpriseId)) issues.push({ path: name, message: 'enterpriseId 必须与状态一致' })
  }
  const codes = state.customers.map((customer) => customer.code.toLocaleLowerCase())
  if (new Set(codes).size !== codes.length) issues.push({ path: 'customers.code', message: '客户编码必须唯一' })
  const categoryIds = new Set(state.categories.map((category) => category.id))
  const tagIds = new Set(state.tags.map((tag) => tag.id))
  const customerIds = new Set(state.customers.map((customer) => customer.id))
  for (const customer of state.customers) {
    if (!categoryIds.has(customer.categoryId)) issues.push({ path: `customers.${customer.id}.categoryId`, message: '分类不存在' })
    if (customer.tagIds.some((tagId) => !tagIds.has(tagId))) issues.push({ path: `customers.${customer.id}.tagIds`, message: '标签不存在' })
  }
  for (const suggestion of state.suggestions) {
    if (!customerIds.has(suggestion.customerId)) issues.push({ path: `suggestions.${suggestion.id}.customerId`, message: '客户不存在' })
    if (!tagIds.has(suggestion.tagId)) issues.push({ path: `suggestions.${suggestion.id}.tagId`, message: '标签不存在' })
  }
  if (issues.length) throw new CustomerValidationError(issues)
}
