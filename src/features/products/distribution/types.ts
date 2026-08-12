import type { ProductRole } from '../types'

type EntityId = string
export type DistributionStatus = 'enabled' | 'disabled'
export type CustomerScopeType = 'all' | 'criteria' | 'specified'
export type OrderChannel = 'mobile-self-order' | 'assisted-order'

export interface DistributionActor {
  role: ProductRole
  actorId: EntityId
  accessibleCustomerIds?: EntityId[]
}

export interface CustomerScope {
  type: CustomerScopeType
  provinceCodes: string[]
  cityCodes: string[]
  districtCodes: string[]
  categoryIds: EntityId[]
  tagIds: EntityId[]
  customerIds: EntityId[]
}

export interface SuggestedProductLine { skuId: EntityId; quantity: number }

export interface DistributionPlan {
  id: EntityId
  enterpriseId: EntityId
  name: string
  status: DistributionStatus
  startsAt: string
  endsAt: string
  scope: CustomerScope
  lines: SuggestedProductLine[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface OrderTemplate {
  id: EntityId
  enterpriseId: EntityId
  name: string
  status: DistributionStatus
  selfOrderEnabled: boolean
  scope: CustomerScope
  lines: SuggestedProductLine[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type DistributionPlanDraft = Pick<DistributionPlan, 'name' | 'status' | 'startsAt' | 'endsAt' | 'scope' | 'lines'>
export type OrderTemplateDraft = Pick<OrderTemplate, 'name' | 'status' | 'selfOrderEnabled' | 'scope' | 'lines'>

export interface DistributionChangeLog {
  id: EntityId
  enterpriseId: EntityId
  targetType: 'plan' | 'template'
  targetId: EntityId
  action: string
  detail: string
  createdAt: string
}

export interface DistributionFeatureState {
  schemaVersion: 1
  enterpriseId: EntityId
  plans: DistributionPlan[]
  templates: OrderTemplate[]
  changeLogs: DistributionChangeLog[]
}

export interface DistributionCustomerSnapshot {
  id: EntityId
  code: string
  name: string
  status: 'pending' | 'active' | 'inactive' | 'frozen'
  provinceCode: string
  cityCode: string
  districtCode: string
  categoryId: EntityId
  tagIds: EntityId[]
  canSelfOrder: boolean
}

export interface DistributionCustomerCategorySnapshot { id: EntityId; parentId: EntityId | null; name: string }
export interface DistributionCustomerTagSnapshot { id: EntityId; name: string }

export interface DistributionSkuSnapshot {
  skuId: EntityId
  skuCode: string
  productId: EntityId
  productCode: string
  productName: string
  specification: string
  productStatus: 'draft' | 'on-sale' | 'off-sale'
  deletedAt: string | null
  baseUnitId: EntityId
  baseUnitName: string
  minimumOrderQuantity: number | null
  orderMultiple: number
  marketPriceCents: number | null
}

export interface DistributionCatalogProvider {
  listCustomers(): DistributionCustomerSnapshot[]
  listCustomerCategories(): DistributionCustomerCategorySnapshot[]
  listCustomerTags(): DistributionCustomerTagSnapshot[]
  listSkus(): DistributionSkuSnapshot[]
  resolveAuthorization(customerId: EntityId, productId: EntityId, at: string): { orderable: boolean; reason: string }
}

export interface DistributionPlanQuery {
  status?: DistributionStatus
  activeFrom?: string
  activeTo?: string
  keyword?: string
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface OrderTemplateQuery {
  status?: DistributionStatus
  keyword?: string
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface DistributionPage<T> { items: T[]; total: number; page: number; pageSize: number }
export interface DistributionPlanListItem extends DistributionPlan { productCount: number; scopeLabel: string }
export interface OrderTemplateListItem extends OrderTemplate { productCount: number; scopeLabel: string }

export type SuggestionReason = 'quantity-normalized'
export type RejectionReason = 'customer-not-active' | 'self-order-disabled' | 'scope-not-matched' | 'plan-not-effective' | 'template-not-available' | 'product-not-on-sale' | 'not-authorized' | 'quantity-invalid' | 'sku-not-found'

export interface SuggestedOrderLine {
  skuId: EntityId
  skuCode: string
  productName: string
  specification: string
  quantity: number
  originalQuantity: number
  unitId: EntityId
  unitName: string
  marketPriceCents: number | null
  sourceIds: EntityId[]
  sourceKey: string
  reasons: SuggestionReason[]
}

export interface RejectedSuggestionLine { skuId: EntityId; sourceIds: EntityId[]; quantity: number; reason: RejectionReason; message: string }

export interface SuggestionResult {
  channel: OrderChannel
  applicable: boolean
  accepted: SuggestedOrderLine[]
  rejected: RejectedSuggestionLine[]
}

export interface DistributionStatisticsResult { status: 'unavailable'; message: string; items: never[] }
export interface DistributionWorkspaceOptions { clock: string; customers: DistributionCustomerSnapshot[]; customerCategories: DistributionCustomerCategorySnapshot[]; customerTags: DistributionCustomerTagSnapshot[]; skus: DistributionSkuSnapshot[] }
