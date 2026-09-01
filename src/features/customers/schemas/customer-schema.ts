import type {
  AttachmentMetadata,
  CustomerCategoryDraft,
  CustomerDraft,
  CustomerFeatureState,
  CustomerTagColor,
  CustomerTagDraft,
  CouponTemplate,
  Promotion,
  VoucherCampaign,
  VoucherIssue,
  MarketingArticle,
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

function validateMarketingCollections(issues: ValidationIssue[], state: CustomerFeatureState): void {
  const customerIds = new Set(state.customers.map((item) => item.id))
  const couponIds = new Set((state.coupons ?? []).map((item) => item.id))
  const promotionIds = new Set((state.promotions ?? []).map((item) => item.id))
  const campaignIds = new Set((state.voucherCampaigns ?? []).map((item) => item.id))
  const check = (name: string, values: Array<{ id: string; enterpriseId: string }>): void => {
    const ids = values.map((item) => item.id)
    if (new Set(ids).size !== ids.length) issues.push({ path: name, message: '实体 ID 必须唯一' })
    if (values.some((item) => item.enterpriseId !== state.enterpriseId)) issues.push({ path: name, message: 'enterpriseId 必须与状态一致' })
  }
  check('coupons', state.coupons ?? [])
  check('couponInstances', state.couponInstances ?? [])
  check('promotions', state.promotions ?? [])
  check('voucherCampaigns', state.voucherCampaigns ?? [])
  check('voucherIssues', state.voucherIssues ?? [])
  check('marketingArticles', state.marketingArticles ?? [])
  const couponCodes = (state.coupons ?? []).map((item) => item.code.toLocaleLowerCase())
  if (new Set(couponCodes).size !== couponCodes.length) issues.push({ path: 'coupons.code', message: '优惠券编码必须唯一' })
  const promotionCodes = (state.promotions ?? []).map((item) => item.code.toLocaleLowerCase())
  if (new Set(promotionCodes).size !== promotionCodes.length) issues.push({ path: 'promotions.code', message: '促销编码必须唯一' })
  for (const coupon of state.coupons ?? []) {
    if (!Number.isInteger(coupon.issueQuantity) || coupon.issueQuantity < 1 || coupon.issueQuantity > 10000000) issues.push({ path: `coupons.${coupon.id}.issueQuantity`, message: '发行数量必须为 1～10000000 的整数' })
    if (!Number.isInteger(coupon.thresholdCents) || coupon.thresholdCents < 0) issues.push({ path: `coupons.${coupon.id}.thresholdCents`, message: '门槛必须为非负整数分' })
    if (coupon.discountPercent !== null && (coupon.discountPercent < 1 || coupon.discountPercent > 100)) issues.push({ path: `coupons.${coupon.id}.discountPercent`, message: '折扣必须为 1～100' })
    if (coupon.validityType === 'after-days' && (!Number.isInteger(coupon.validityDays) || coupon.validityDays! <= 0)) issues.push({ path: `coupons.${coupon.id}.validityDays`, message: '领取后有效期必须为正整数' })
    if (coupon.perCustomerLimit !== null && (!Number.isInteger(coupon.perCustomerLimit) || coupon.perCustomerLimit < 1 || coupon.perCustomerLimit > 10)) issues.push({ path: `coupons.${coupon.id}.perCustomerLimit`, message: '每人限领必须为 1～10 或不限' })
  }
  for (const promotion of state.promotions ?? []) {
    if (promotion.startsAt >= promotion.endsAt) issues.push({ path: `promotions.${promotion.id}.period`, message: '促销结束时间必须晚于开始时间' })
    if (promotion.discountPercent !== null && (promotion.discountPercent < 1 || promotion.discountPercent > 100)) issues.push({ path: `promotions.${promotion.id}.discountPercent`, message: '促销折扣必须为 1～100' })
    for (const rule of promotion.rules) if (rule.thresholdCents !== null && (!Number.isInteger(rule.thresholdCents) || rule.thresholdCents < 0)) issues.push({ path: `promotions.${promotion.id}.rules`, message: '规则门槛必须为非负整数分' })
  }
  for (const instance of state.couponInstances ?? []) if (!couponIds.has(instance.templateId) || !customerIds.has(instance.customerId)) issues.push({ path: `couponInstances.${instance.id}`, message: '优惠券实例引用不存在' })
  for (const campaign of state.voucherCampaigns ?? []) if (!couponIds.has(campaign.couponId) || campaign.quantityPerCustomer < 1 || campaign.quantityPerCustomer > 10) issues.push({ path: `voucherCampaigns.${campaign.id}`, message: '易发券活动引用或数量不合法' })
  for (const issue of state.voucherIssues ?? []) if (!campaignIds.has(issue.campaignId) || !couponIds.has(issue.couponId) || !customerIds.has(issue.customerId)) issues.push({ path: `voucherIssues.${issue.id}`, message: '发券记录引用不存在' })
  for (const article of state.marketingArticles ?? []) {
    if (!article.title.trim() || article.title.length > 50) issues.push({ path: `marketingArticles.${article.id}.title`, message: '文章标题不能为空且不超过 50 字' })
    if (article.promotionId && !promotionIds.has(article.promotionId)) issues.push({ path: `marketingArticles.${article.id}.promotionId`, message: '促销引用不存在' })
    if (article.couponId && !couponIds.has(article.couponId)) issues.push({ path: `marketingArticles.${article.id}.couponId`, message: '优惠券引用不存在' })
    if (article.publishMode === 'publish-scheduled' && !article.scheduledAt) issues.push({ path: `marketingArticles.${article.id}.scheduledAt`, message: '定时发布必须有时间' })
  }
}

export function validateCustomerDraft(draft: CustomerDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  requiredText(issues, 'code', draft.code ?? '')
  requiredText(issues, 'name', draft.name, 50)
  requiredText(issues, 'categoryId', draft.categoryId)
  requiredText(issues, 'primaryContactName', draft.primaryContactName)
  requiredText(issues, 'primaryPhone', draft.primaryPhone)
  requiredText(issues, 'cityCode', draft.cityCode)
  requiredText(issues, 'address', draft.address, 100)
  // 未分配业务员是合法状态；创建时由服务层默认当前操作人。
  nonNegative(issues, 'creditLimitCents', draft.creditLimitCents)
  optionalMax(issues, 'description', draft.description, 500)
  if (draft.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) issues.push({ path: 'email', message: '邮箱格式不正确' })
  if (draft.taxId?.trim() && draft.taxId.trim().length !== 18) issues.push({ path: 'taxId', message: '税号必须为 18 位' })
  if (draft.paymentMethods.includes('bank-transfer')) {
    const bankAccount = draft.bankAccount?.trim() ?? ''
    if (!bankAccount) issues.push({ path: 'bankAccount', message: '选择银行转账时必须填写银行卡号' })
    else if (!/^\d{16,19}$/.test(bankAccount)) issues.push({ path: 'bankAccount', message: '银行卡号必须为 16～19 位数字' })
  }
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
  const optionalCollections = [
    ['opportunities', state.opportunities ?? []],
    ['frequentProducts', state.frequentProducts ?? []],
    ['publicSeaEntries', state.publicSeaEntries ?? []],
    ['visits', state.visits ?? []],
    ['routes', state.routes ?? []],
    ['visitPlans', state.visitPlans ?? []],
    ['membershipLevels', state.membershipLevels ?? []],
    ['memberships', state.memberships ?? []],
    ['pointAccounts', state.pointAccounts ?? []],
    ['pointLedger', state.pointLedger ?? []],
    ['pointLevels', state.pointLevels ?? []],
  ] as const
  for (const [name, values] of optionalCollections) {
    const ids = values.map((value) => value.id)
    if (new Set(ids).size !== ids.length) issues.push({ path: name, message: '实体 ID 必须唯一' })
    if (values.some((value) => value.enterpriseId !== state.enterpriseId)) issues.push({ path: name, message: 'enterpriseId 必须与状态一致' })
  }
  for (const item of state.opportunities ?? []) {
    if (!customerIds.has(item.customerId)) issues.push({ path: `opportunities.${item.id}.customerId`, message: '客户不存在' })
    if (!Number.isInteger(item.amountCents) || item.amountCents < 0) issues.push({ path: `opportunities.${item.id}.amountCents`, message: '金额必须为非负整数分' })
    if (!Number.isInteger(item.probabilityPercent) || item.probabilityPercent < 0 || item.probabilityPercent > 100) issues.push({ path: `opportunities.${item.id}.probabilityPercent`, message: '概率必须为 0～100 的整数' })
  }
  for (const item of state.frequentProducts ?? []) {
    if (!customerIds.has(item.customerId)) issues.push({ path: `frequentProducts.${item.id}.customerId`, message: '客户不存在' })
    if (item.totalAmountCents !== null && (!Number.isInteger(item.totalAmountCents) || item.totalAmountCents < 0)) issues.push({ path: `frequentProducts.${item.id}.totalAmountCents`, message: '金额必须为非负整数分' })
  }
  for (const item of state.publicSeaEntries ?? []) if (!customerIds.has(item.customerId)) issues.push({ path: `publicSeaEntries.${item.id}.customerId`, message: '客户不存在' })
  for (const item of state.visits ?? []) {
    if (!customerIds.has(item.customerId)) issues.push({ path: `visits.${item.id}.customerId`, message: '客户不存在' })
    if (item.durationMinutes !== null && (!Number.isInteger(item.durationMinutes) || item.durationMinutes < 0)) issues.push({ path: `visits.${item.id}.durationMinutes`, message: '时长必须为非负整数' })
  }
  for (const item of state.routes ?? []) if (new Set(item.stops.map((stop) => stop.customerId)).size !== item.stops.length) issues.push({ path: `routes.${item.id}.stops`, message: '线路站点不能重复' })
  for (const item of state.visitPlans ?? []) if (item.routeId && !(state.routes ?? []).some((route) => route.id === item.routeId)) issues.push({ path: `visitPlans.${item.id}.routeId`, message: '线路不存在' })
  const levelIds = new Set((state.membershipLevels ?? []).map((item) => item.id))
  const membershipCustomerIds = new Set((state.memberships ?? []).map((item) => item.customerId))
  for (const item of state.memberships ?? []) {
    if (!customerIds.has(item.customerId)) issues.push({ path: `memberships.${item.id}.customerId`, message: '客户不存在' })
    if (!levelIds.has(item.levelId)) issues.push({ path: `memberships.${item.id}.levelId`, message: '会员等级不存在' })
  }
  if (membershipCustomerIds.size !== (state.memberships ?? []).length) issues.push({ path: 'memberships.customerId', message: '同一客户只能有一个当前会员等级' })
  for (const item of state.pointAccounts ?? []) {
    if (!customerIds.has(item.customerId)) issues.push({ path: `pointAccounts.${item.id}.customerId`, message: '客户不存在' })
    if (item.availablePoints < 0 || !Number.isInteger(item.availablePoints)) issues.push({ path: `pointAccounts.${item.id}.availablePoints`, message: '可用积分必须为非负整数' })
  }
  for (const item of state.pointLedger ?? []) {
    if (!customerIds.has(item.customerId)) issues.push({ path: `pointLedger.${item.id}.customerId`, message: '客户不存在' })
    if (!Number.isInteger(item.points) || item.points === 0) issues.push({ path: `pointLedger.${item.id}.points`, message: '流水积分必须为非零整数' })
    if (!Number.isInteger(item.balanceAfter) || item.balanceAfter < 0) issues.push({ path: `pointLedger.${item.id}.balanceAfter`, message: '流水余额必须为非负整数' })
  }
  if (state.pointsSettings) {
    if (state.pointsSettings.orderEarnPerYuan < 0 || state.pointsSettings.orderRedemptionCapPercent < 0 || state.pointsSettings.orderRedemptionCapPercent > 100) issues.push({ path: 'pointsSettings', message: '积分比例或抵扣上限不合法' })
    if (state.pointsSettings.mallEnabled && (!state.pointsSettings.exchangePointsRatio || state.pointsSettings.exchangePointsRatio < 0)) issues.push({ path: 'pointsSettings.exchangePointsRatio', message: '积分商城开启时兑换比例必填' })
  }
  validateMarketingCollections(issues, state)
  const channel = state.channelState
  if (channel) {
    const collections = [
      ['wecomSyncRecords', channel.wecomSyncRecords ?? []], ['wecomBroadcasts', channel.wecomBroadcasts ?? []], ['wecomTagMappings', channel.wecomTagMappings ?? []],
      ['wecomScripts', channel.wecomScripts ?? []], ['wecomWelcomeMessages', channel.wecomWelcomeMessages ?? []], ['wecomGroups', channel.wecomGroups ?? []], ['wecomMoments', channel.wecomMoments ?? []],
      ['mallCustomers', channel.mallCustomers ?? []], ['mallEmployees', channel.mallEmployees ?? []], ['mallDesigns', channel.mallDesigns ?? []], ['mallExtensions', channel.mallExtensions ?? []], ['mallAds', channel.mallAds ?? []], ['mallPopups', channel.mallPopups ?? []], ['mallMessages', channel.mallMessages ?? []],
    ] as const
    for (const [name, values] of collections) {
      const ids = values.map((value) => value.id)
      if (new Set(ids).size !== ids.length) issues.push({ path: `channelState.${name}`, message: '实体 ID 必须唯一' })
      if (values.some((value) => value.enterpriseId !== state.enterpriseId)) issues.push({ path: `channelState.${name}`, message: 'enterpriseId 必须与状态一致' })
    }
  }
  if (issues.length) throw new CustomerValidationError(issues)
}
