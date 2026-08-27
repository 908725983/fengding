export type EntityId = string
export type CustomerRole = 'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'
export type CustomerStatus = 'pending' | 'active' | 'inactive' | 'frozen'
export type RecordStatus = 'active' | 'inactive'
export type CustomerType = 'enterprise' | 'individual'
export type CustomerSource = 'online-registration' | 'offline-development' | 'referral' | 'other'
export type ImportanceLevel = 'A' | 'B' | 'C'
export type SettlementMethod = 'cash' | 'monthly' | 'terms'
export type PaymentMethod = 'bank-transfer' | 'cheque' | 'cash' | 'wechat' | 'alipay'
export type AddressLabel = 'company' | 'warehouse' | 'delivery'
export type CustomerTagType = 'manual' | 'smart'
export type CustomerTagColor = '#F5222D' | '#FA8C16' | '#52C41A' | '#1890FF' | '#8C8C8C'
export type AiSuggestionAction = 'add' | 'remove'
export type AiSuggestionStatus = 'pending' | 'confirmed' | 'rejected'
export type AnalysisScope = 'all' | 'conditions' | 'specified'
export type OpportunityStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
export type OpportunityStatus = 'open' | 'won' | 'lost'
export type CustomerSourceType = 'manual' | 'auto'
export type PublicSeaStatus = 'available' | 'claimed' | 'assigned' | 'protected'
export type VisitType = 'onsite' | 'phone' | 'video'
export type VisitResult = 'positive' | 'neutral' | 'negative' | 'no-contact'
export type VisitStatus = 'planned' | 'in-progress' | 'completed' | 'cancelled'
export type RouteStatus = 'draft' | 'active' | 'stopped'
export type VisitPlanStatus = 'pending' | 'running' | 'completed' | 'incomplete'
export type MembershipConditionType = 'amount' | 'orders' | 'points'
export type MembershipStatus = 'active' | 'inactive'
export type PointLedgerType = 'earn' | 'redeem' | 'expire' | 'refund' | 'adjust'
export type PointAdjustmentType = 'increase' | 'decrease'
export type PointExpiryType = 'never' | 'fixed-days' | 'yearly'
export type MarketingStatus = 'not-started' | 'active' | 'ended' | 'paused'
export type CouponType = 'threshold-discount' | 'percentage' | 'direct-discount' | 'free-shipping'
export type CouponValidityType = 'after-days' | 'date-range'
export type MarketingScopeKind = 'all' | 'category' | 'brand' | 'tag' | 'product'
export type MarketingAudienceKind = 'all' | 'category' | 'tag' | 'customer'
export type PromotionType = 'limited-discount' | 'threshold-discount' | 'threshold-gift' | 'buy-gift'
export type PromotionDiscountMode = 'rate' | 'price'
export type PromotionLimitPeriod = 'campaign' | 'day' | 'order'
export type VoucherChannel = 'sms' | 'wechat' | 'inbox'
export type ArticleType = 'graphic' | 'video'
export type ArticlePublishMode = 'publish-now' | 'publish-scheduled' | 'draft'
export type ArticlePublishChannel = 'wechat' | 'mini-program' | 'h5' | 'app'
export type ArticleReadPermission = 'public' | 'registered' | 'followed'
export type ChannelRecordStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'recalled' | 'active' | 'inactive' | 'published' | 'disabled'
export type WecomFrequency = 'realtime' | 'hourly' | 'daily'
export type WecomSyncResult = 'success' | 'partial-failure' | 'failed'
export type WecomAudience = 'all' | 'selected'
export type WecomSyncDirection = 'bidirectional' | 'wecom-to-system' | 'system-to-wecom'
export type MallRole = 'manager' | 'clerk'

export interface WecomSyncSettings { enabled: boolean; frequency: WecomFrequency; scope: string[]; autoCreateCustomer: boolean; autoMapStaff: boolean; updatedAt: string }
export interface WecomSyncRecord { id: EntityId; enterpriseId: string; occurredAt: string; type: 'create' | 'update'; createdCount: number; updatedCount: number; failedCount: number; status: WecomSyncResult }
export interface WecomBroadcast { id: EntityId; enterpriseId: string; title: string; employeeIds: string[]; audience: WecomAudience; customerIds: string[]; content: string; image: AttachmentMetadata | null; link: string | null; sendMode: 'now' | 'scheduled'; scheduledAt: string | null; status: ChannelRecordStatus; createdAt: string; updatedAt: string }
export interface WecomTagMapping { id: EntityId; enterpriseId: string; wecomTag: string; systemTagId: string; direction: WecomSyncDirection; status: 'active' | 'inactive'; updatedAt: string }
export interface WecomScript { id: EntityId; enterpriseId: string; title: string; content: string; category: string; productIds: string[]; couponId: string | null; usageCount: number; status: 'active' | 'inactive'; updatedAt: string }
export interface WecomWelcomeMessage { id: EntityId; enterpriseId: string; type: 'text' | 'graphic'; content: string; image: AttachmentMetadata | null; link: string | null; employeeIds: string[]; status: 'active' | 'inactive'; updatedAt: string }
export interface WecomGroup { id: EntityId; enterpriseId: string; name: string; ownerId: string; memberCount: number; createdAt: string; tags: string[] }
export interface WecomMoment { id: EntityId; enterpriseId: string; content: string; imageCount: number; employeeIds: string[]; publishAt: string; scheduled: boolean; status: ChannelRecordStatus; updatedAt: string }

export interface MallCustomerAccount { id: EntityId; enterpriseId: string; customerId: string | null; name: string; account: string; phone: string; channel: 'app' | 'mini-program' | 'h5'; registeredAt: string; lastLoginAt: string | null; loginCount: number; orderCount: number | null; consumptionAmountCents: number | null; status: 'active' | 'disabled'; updatedAt: string }
export interface MallEmployeeAccount { id: EntityId; enterpriseId: string; customerId: string; name: string; phone: string; role: MallRole; permissions: string[]; createdAt: string; lastLoginAt: string | null; status: 'active' | 'disabled'; updatedAt: string }
export interface MallDesign { id: EntityId; enterpriseId: string; name: string; components: Array<{ type: string; title?: string; productIds?: string[]; content?: string }>; status: 'draft' | 'published'; updatedAt: string }
export interface MallExtension { id: EntityId; enterpriseId: string; key: string; name: string; enabled: boolean; updatedAt: string }
export interface MallAd { id: EntityId; enterpriseId: string; title: string; position: string; image: AttachmentMetadata | null; linkType: string | null; link: string | null; startsAt: string; endsAt: string; sortOrder: number; status: 'active' | 'inactive'; updatedAt: string }
export interface MallPopup { id: EntityId; enterpriseId: string; title: string; image: AttachmentMetadata | null; frequency: 'always' | 'daily' | 'once'; startsAt: string; endsAt: string; channels: string[]; status: 'active' | 'inactive'; updatedAt: string }
export interface MallMessage { id: EntityId; enterpriseId: string; title: string; type: 'system' | 'marketing' | 'order'; content: string; audience: 'all' | 'selected'; customerIds: string[]; sendMode: 'now' | 'scheduled'; scheduledAt: string | null; status: ChannelRecordStatus; readCount: number; updatedAt: string }
export interface MallSettings { id: EntityId; enterpriseId: string; name: string; introduction: string | null; displayMode: 'list' | 'large' | 'double'; searchEnabled: boolean; categoryEnabled: boolean; salesVisible: boolean; stockVisible: boolean; reviewVisible: boolean; cartEnabled: boolean; favoriteEnabled: boolean; shareEnabled: boolean; reviewEnabled: boolean; serviceEnabled: boolean; paymentMethods: string[]; minimumPaymentCents: number; paymentTimeoutMinutes: number; updatedAt: string }

export interface CustomerChannelState {
  wecomSyncSettings?: WecomSyncSettings
  wecomSyncRecords?: WecomSyncRecord[]
  wecomBroadcasts?: WecomBroadcast[]
  wecomTagMappings?: WecomTagMapping[]
  wecomScripts?: WecomScript[]
  wecomWelcomeMessages?: WecomWelcomeMessage[]
  wecomGroups?: WecomGroup[]
  wecomMoments?: WecomMoment[]
  mallCustomers?: MallCustomerAccount[]
  mallEmployees?: MallEmployeeAccount[]
  mallDesigns?: MallDesign[]
  mallExtensions?: MallExtension[]
  mallAds?: MallAd[]
  mallPopups?: MallPopup[]
  mallMessages?: MallMessage[]
  mallSettings?: MallSettings
}

export interface AttachmentMetadata {
  id: EntityId
  name: string
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png'
  sizeBytes: number
}

export interface CustomerBusinessSettings {
  canViewInventory: boolean
  canSelfOrder: boolean
  canViewPrice: boolean
  acceptsMarketing: boolean
  autoAssignOrders: boolean
}

export const defaultCustomerBusinessSettings = (): CustomerBusinessSettings => ({
  canViewInventory: false,
  canSelfOrder: false,
  canViewPrice: false,
  acceptsMarketing: false,
  autoAssignOrders: false,
})

export interface Customer {
  id: EntityId
  enterpriseId: EntityId
  code: string
  name: string
  categoryId: EntityId
  customerType: CustomerType | null
  source: CustomerSource | null
  importanceLevel: ImportanceLevel | null
  primaryContactName: string
  primaryPhone: string
  backupPhone: string | null
  provinceCode: string
  cityCode: string
  districtCode: string
  address: string
  addressLabel: AddressLabel | null
  longitude: number | null
  latitude: number | null
  email: string | null
  wechatId: string | null
  salespersonId: EntityId
  creditLimitCents: number | null
  settlementMethod: SettlementMethod
  paymentTermDays: number | null
  paymentMethods: PaymentMethod[]
  bankName: string | null
  bankAccount: string | null
  taxId: string | null
  invoiceTitle: string | null
  description: string | null
  remark: string | null
  attachments: AttachmentMetadata[]
  tagIds: EntityId[]
  businessSettings: CustomerBusinessSettings
  legalRepresentative: string | null
  registeredCapital: string | null
  establishedDate: string | null
  businessScope: string | null
  storeArea: number | null
  employeeCount: number | null
  status: CustomerStatus
  frozenReason: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomerCategory {
  id: EntityId
  enterpriseId: EntityId
  name: string
  code: string
  parentId: EntityId | null
  discountRatePercent: number
  minimumOrderAmountCents: number | null
  defaultCreditLimitCents: number | null
  defaultPaymentTermDays: number | null
  sortOrder: number
  icon: AttachmentMetadata | null
  status: RecordStatus
  remark: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomerTag {
  id: EntityId
  enterpriseId: EntityId
  name: string
  code: string
  color: CustomerTagColor
  type: CustomerTagType
  sortOrder: number
  description: string | null
  status: RecordStatus
  createdAt: string
  updatedAt: string
}

export interface CustomerTagSuggestion {
  id: EntityId
  enterpriseId: EntityId
  customerId: EntityId
  tagId: EntityId
  action: AiSuggestionAction
  status: AiSuggestionStatus
  createdAt: string
  resolvedAt: string | null
}

export interface CustomerChangeLog {
  id: EntityId
  enterpriseId: EntityId
  customerId: EntityId
  action: string
  detail: string
  createdAt: string
}

export interface CustomerOpportunity {
  id: EntityId
  enterpriseId: EntityId
  customerId: EntityId
  name: string
  amountCents: number
  stage: OpportunityStage
  probabilityPercent: number
  expectedCloseDate: string | null
  ownerId: EntityId
  source: CustomerSourceType
  description: string | null
  status: OpportunityStatus
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export interface CustomerFrequentProduct {
  id: EntityId
  enterpriseId: EntityId
  customerId: EntityId
  skuId: EntityId
  source: CustomerSourceType
  purchaseCount: number | null
  lastPurchasedAt: string | null
  averageQuantity: number | null
  totalQuantity: number | null
  totalAmountCents: number | null
  note: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface PublicSeaRule {
  id: EntityId
  enterpriseId: EntityId
  noOrderDays: number
  noVisitDays: number
  newCustomerInactiveDays: number
  dailyClaimLimit: number
  monthlyClaimLimit: number
  protectionDays: number
  excludedCategoryIds: EntityId[]
  excludedTagIds: EntityId[]
  updatedAt: string
}

export interface PublicSeaEntry {
  id: EntityId
  enterpriseId: EntityId
  customerId: EntityId
  enteredAt: string
  reason: string
  claimedById: EntityId | null
  claimedAt: string | null
  protectionUntil: string | null
  status: PublicSeaStatus
  updatedAt: string
}

export interface CustomerMapMarker {
  customerId: EntityId
  longitude: number
  latitude: number
  clusterKey: string
  label: string
}

export interface CustomerVisit {
  id: EntityId
  enterpriseId: EntityId
  customerId: EntityId
  salespersonId: EntityId
  visitAt: string
  checkInAt: string | null
  checkOutAt: string | null
  durationMinutes: number | null
  type: VisitType
  result: VisitResult | null
  status: VisitStatus
  placedOrder: boolean
  orderId: EntityId | null
  fakeLongitude: number | null
  fakeLatitude: number | null
  checkInDistanceMeters: number | null
  photo: AttachmentMetadata | null
  note: string | null
  nextPlan: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomerRouteStop { customerId: EntityId; sortOrder: number; plannedMinutes: number }
export interface CustomerVisitRoute {
  id: EntityId
  enterpriseId: EntityId
  code: string
  name: string
  salespersonId: EntityId
  stops: CustomerRouteStop[]
  estimatedDistanceKm: number
  estimatedMinutes: number
  status: RouteStatus
  createdAt: string
  updatedAt: string
}

export interface CustomerVisitPlan {
  id: EntityId
  enterpriseId: EntityId
  date: string
  salespersonId: EntityId
  routeId: EntityId | null
  customerIds: EntityId[]
  plannedStartTime: string | null
  plannedMinutes: number | null
  purpose: string
  note: string | null
  status: VisitPlanStatus
  reminder: string | null
  createdAt: string
  updatedAt: string
}

export interface MembershipBenefits {
  freeShipping: boolean
  priorityShipping: boolean
  dedicatedService: boolean
  birthdayGift: boolean
  birthdayCouponId: EntityId | null
  exclusiveProductIds: EntityId[]
}

export interface MembershipLevel {
  id: EntityId
  enterpriseId: EntityId
  name: string
  code: string
  icon: AttachmentMetadata | null
  sortOrder: number
  conditionType: MembershipConditionType
  conditionValue: number
  retainConditionValue: number | null
  retainPeriodMonths: number | null
  autoUpgrade: boolean
  memberDiscountPercent: number
  pointsMultiplier: number
  benefits: MembershipBenefits
  status: MembershipStatus
  createdAt: string
  updatedAt: string
}

export interface CustomerMembership {
  id: EntityId
  enterpriseId: EntityId
  customerId: EntityId
  levelId: EntityId
  assignedAt: string
  source: 'manual' | 'automatic'
  pendingReview: boolean
  updatedAt: string
}

export interface PointAccount {
  id: EntityId
  enterpriseId: EntityId
  customerId: EntityId
  totalEarned: number
  totalRedeemed: number
  totalExpired: number
  totalRefunded: number
  totalAdjusted: number
  availablePoints: number
  expiringWithin30Days: number
  lastChangedAt: string | null
}

export interface PointLedgerEntry {
  id: EntityId
  enterpriseId: EntityId
  customerId: EntityId
  type: PointLedgerType
  points: number
  balanceAfter: number
  source: string
  reason: string | null
  occurredAt: string
  expiresAt: string | null
  requestId: string | null
}

export interface PointsSettings {
  id: EntityId
  enterpriseId: EntityId
  enabled: boolean
  orderEarnPerYuan: number
  orderEarnCapPerOrder: number
  dailyEarnCap: number
  signInPoints: number
  consecutiveSignInBonus: number
  reviewPoints: number
  photoReviewBonus: number
  referralPoints: number
  referralFirstOrderBonus: number
  registrationPoints: number
  profileCompletionPoints: number
  redemptionPointsPerYuan: number
  orderRedemptionCapPercent: number
  minimumRedemptionPoints: number
  mallEnabled: boolean
  exchangePointsRatio: number | null
  expiryType: PointExpiryType
  expiryDays: number | null
  yearlyExpiryDate: string | null
  expiryReminderDays: number
  ruleDescription: string | null
  showRuleInMall: boolean
  updatedAt: string
}

export interface PointLevel {
  id: EntityId
  enterpriseId: EntityId
  name: string
  upgradePoints: number
  discountPercent: number | null
  icon: AttachmentMetadata | null
  status: MembershipStatus
}

export interface CouponTemplate {
  id: EntityId
  enterpriseId: EntityId
  code: string
  name: string
  type: CouponType
  thresholdCents: number
  amountCents: number | null
  discountPercent: number | null
  maxDiscountCents: number | null
  issueQuantity: number
  claimedQuantity: number
  usedQuantity: number
  validityType: CouponValidityType
  validityDays: number | null
  startsAt: string
  endsAt: string
  scopeKind: MarketingScopeKind
  scopeIds: EntityId[]
  audienceKind: MarketingAudienceKind
  audienceIds: EntityId[]
  perCustomerLimit: number | null
  newCustomerOnly: boolean
  allowPromotionalItems: boolean
  description: string | null
  status: MarketingStatus
  createdAt: string
  updatedAt: string
}

export interface CouponInstance {
  id: EntityId
  enterpriseId: EntityId
  templateId: EntityId
  customerId: EntityId
  issuedAt: string
  expiresAt: string
  usedAt: string | null
  orderId: EntityId | null
  status: 'unused' | 'used' | 'expired'
}

export interface PromotionRule {
  id: EntityId
  thresholdCents: number | null
  discountCents: number | null
  giftSkuId: EntityId | null
  giftQuantity: number | null
  buySkuId: EntityId | null
  buyQuantity: number | null
}

export interface Promotion {
  id: EntityId
  enterpriseId: EntityId
  code: string
  name: string
  type: PromotionType
  startsAt: string
  endsAt: string
  customerAudienceKind: MarketingAudienceKind
  customerAudienceIds: EntityId[]
  scopeKind: 'all' | 'category' | 'product'
  scopeIds: EntityId[]
  discountMode: PromotionDiscountMode | null
  discountPercent: number | null
  discountPriceCents: number | null
  limitQuantity: number
  limitPeriod: PromotionLimitPeriod
  rules: PromotionRule[]
  allowCoupon: boolean
  allowMemberDiscount: boolean
  showCountdown: boolean
  showStock: boolean
  sortWeight: number
  orderCount: number | null
  orderAmountCents: number | null
  status: MarketingStatus
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface VoucherCampaign {
  id: EntityId
  enterpriseId: string
  name: string
  startsAt: string
  endsAt: string
  couponId: EntityId
  audienceKind: MarketingAudienceKind
  audienceIds: EntityId[]
  quantityPerCustomer: number
  channels: VoucherChannel[]
  description: string | null
  issuedCount: number
  claimedCount: number
  usedCount: number
  status: 'active' | 'ended'
  createdAt: string
  updatedAt: string
}

export interface VoucherIssue {
  id: EntityId
  enterpriseId: string
  campaignId: EntityId
  couponId: EntityId
  customerId: EntityId
  channels: VoucherChannel[]
  issuedAt: string
  status: 'issued' | 'claimed' | 'used' | 'expired'
}

export interface MarketingArticle {
  id: EntityId
  enterpriseId: string
  title: string
  type: ArticleType
  cover: AttachmentMetadata | null
  summary: string | null
  content: string
  productIds: EntityId[]
  couponId: EntityId | null
  promotionId: EntityId | null
  publishMode: ArticlePublishMode
  scheduledAt: string | null
  channels: ArticlePublishChannel[]
  readPermission: ArticleReadPermission
  publishedAt: string | null
  viewCount: number | null
  acquiredCustomerCount: number | null
  shareCount: number | null
  status: 'published' | 'draft' | 'unpublished'
  createdAt: string
  updatedAt: string
}

export interface MarketingMetricValue { value: number | null; unavailableReason: string | null }
export interface MarketingAnalysisResult {
  couponClaimRate: MarketingMetricValue
  couponUseRate: MarketingMetricValue
  promotionOrderCount: MarketingMetricValue
  promotionOrderAmountCents: MarketingMetricValue
  acquisitionConversionRate: MarketingMetricValue
  pointsUseRate: MarketingMetricValue
  activities: Array<{ id: EntityId; name: string; type: 'coupon' | 'promotion' | 'acquisition'; customerCount: MarketingMetricValue; productCount: MarketingMetricValue; orderAmountCents: MarketingMetricValue; orderCount: MarketingMetricValue; averageOrderCents: MarketingMetricValue; grossMarginPercent: MarketingMetricValue }>
  ai: { activityCount: MarketingMetricValue; customerCount: MarketingMetricValue; productCount: MarketingMetricValue; totalCostCents: MarketingMetricValue; activities: Array<Record<string, string | number | null>> }
  referral: Array<{ referrer: string | null; acquisitionCount: MarketingMetricValue; newCustomerAmountCents: MarketingMetricValue; commissionCents: MarketingMetricValue; status: string | null }>
}

export interface CustomerFeatureState {
  schemaVersion: 1
  enterpriseId: EntityId
  nextCustomerSequence: number
  customers: Customer[]
  categories: CustomerCategory[]
  tags: CustomerTag[]
  suggestions: CustomerTagSuggestion[]
  changeLogs: CustomerChangeLog[]
  opportunities?: CustomerOpportunity[]
  frequentProducts?: CustomerFrequentProduct[]
  publicSeaEntries?: PublicSeaEntry[]
  publicSeaRule?: PublicSeaRule
  visits?: CustomerVisit[]
  routes?: CustomerVisitRoute[]
  visitPlans?: CustomerVisitPlan[]
  membershipLevels?: MembershipLevel[]
  memberships?: CustomerMembership[]
  pointAccounts?: PointAccount[]
  pointLedger?: PointLedgerEntry[]
  pointsSettings?: PointsSettings
  pointLevels?: PointLevel[]
  coupons?: CouponTemplate[]
  couponInstances?: CouponInstance[]
  promotions?: Promotion[]
  voucherCampaigns?: VoucherCampaign[]
  voucherIssues?: VoucherIssue[]
  marketingArticles?: MarketingArticle[]
  channelState?: CustomerChannelState
}

export interface CustomerListQuery {
  categoryId?: EntityId
  tagIds?: EntityId[]
  salespersonId?: EntityId
  status?: CustomerStatus
  keyword?: string
  regionCodes?: string[]
  registeredFrom?: string
  registeredTo?: string
  transactionMinCents?: number
  transactionMaxCents?: number
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface CustomerListItem extends Customer {
  categoryName: string
  salespersonName: string
  orderCount: null
  consumptionAmountCents: null
  receivableBalanceCents: null
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface CustomerDraft extends Omit<Customer, 'id' | 'enterpriseId' | 'code' | 'createdAt' | 'updatedAt'> {
  codeMode: 'auto' | 'manual'
  code: string | null
}

export type CustomerCategoryDraft = Omit<CustomerCategory, 'id' | 'enterpriseId' | 'createdAt' | 'updatedAt'>
export type CustomerTagDraft = Omit<CustomerTag, 'id' | 'enterpriseId' | 'createdAt' | 'updatedAt'>

export interface ImmediateAnalysisInput {
  scope: AnalysisScope
  conditions?: CustomerListQuery
  customerIds?: EntityId[]
}

export interface CustomerActor {
  role: CustomerRole
  actorId: EntityId
}

export interface OpportunityDraft extends Omit<CustomerOpportunity, 'id' | 'enterpriseId' | 'createdAt' | 'updatedAt' | 'closedAt' | 'status'> { status?: OpportunityStatus }
export interface FrequentProductDraft extends Omit<CustomerFrequentProduct, 'id' | 'enterpriseId' | 'createdAt' | 'updatedAt'> {}
export interface PublicSeaRuleDraft extends Omit<PublicSeaRule, 'id' | 'enterpriseId' | 'updatedAt'> {}
export interface VisitDraft extends Omit<CustomerVisit, 'id' | 'enterpriseId' | 'createdAt' | 'updatedAt'> {}
export interface RouteDraft extends Omit<CustomerVisitRoute, 'id' | 'enterpriseId' | 'createdAt' | 'updatedAt'> {}
export interface VisitPlanDraft extends Omit<CustomerVisitPlan, 'id' | 'enterpriseId' | 'createdAt' | 'updatedAt'> {}
export interface MembershipLevelDraft extends Omit<MembershipLevel, 'id' | 'enterpriseId' | 'createdAt' | 'updatedAt'> {}
export interface PointsSettingsDraft extends Omit<PointsSettings, 'id' | 'enterpriseId' | 'updatedAt'> {}
export interface CouponTemplateDraft extends Omit<CouponTemplate, 'id' | 'enterpriseId' | 'claimedQuantity' | 'usedQuantity' | 'status' | 'createdAt' | 'updatedAt'> {}
export interface PromotionDraft extends Omit<Promotion, 'id' | 'enterpriseId' | 'orderCount' | 'orderAmountCents' | 'status' | 'createdAt' | 'updatedAt'> {}
export interface VoucherCampaignDraft extends Omit<VoucherCampaign, 'id' | 'enterpriseId' | 'issuedCount' | 'claimedCount' | 'usedCount' | 'status' | 'createdAt' | 'updatedAt'> {}
export interface MarketingArticleDraft extends Omit<MarketingArticle, 'id' | 'enterpriseId' | 'publishedAt' | 'viewCount' | 'acquiredCustomerCount' | 'shareCount' | 'status' | 'createdAt' | 'updatedAt'> {}

export interface CustomerOrderEligibility {
  allowed: boolean
  reason: 'ok' | 'customer-not-active' | 'credit-limit-exceeded'
}
