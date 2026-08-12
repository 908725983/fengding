import type { EntityId, PageResult, ProductRole } from '../types'

export type AuthorizationPlanStatus = 'enabled' | 'disabled'
export type SpecialAuthorizationType = 'visible-orderable' | 'visible-only' | 'prohibited'
export type AuthorizationSourceType = 'direct-plan' | 'timed-rule' | 'special'
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface AuthorizationActor { role: ProductRole; actorId: EntityId }
export interface AuthorizationTimeRange { start: string; end: string }

export interface AuthorizationPlan {
  id: EntityId
  enterpriseId: EntityId
  code: string
  name: string
  status: AuthorizationPlanStatus
  categoryIds: EntityId[]
  brandIds: EntityId[]
  productIds: EntityId[]
  customerIds: EntityId[]
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface AuthorizationPlanDraft {
  name: string
  status: AuthorizationPlanStatus
  categoryIds: EntityId[]
  brandIds: EntityId[]
  productIds: EntityId[]
  customerIds: EntityId[]
}

export interface AuthorizationRule {
  id: EntityId
  enterpriseId: EntityId
  name: string
  weekdays: Weekday[]
  timeRanges: AuthorizationTimeRange[]
  planId: EntityId
  customerIds: EntityId[]
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface AuthorizationRuleDraft {
  name: string
  weekdays: Weekday[]
  timeRanges: AuthorizationTimeRange[]
  planId: EntityId
  customerIds: EntityId[]
}

export interface SpecialAuthorization {
  id: EntityId
  enterpriseId: EntityId
  customerId: EntityId
  productId: EntityId
  type: SpecialAuthorizationType
  startsAt: string
  endsAt: string | null
  note: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface SpecialAuthorizationBatchDraft {
  customerIds: EntityId[]
  productIds: EntityId[]
  type: SpecialAuthorizationType
  startsAt: string
  endsAt: string | null
  note: string | null
}

export interface SpecialAuthorizationDraft {
  type: SpecialAuthorizationType
  startsAt: string
  endsAt: string | null
  note: string | null
}

export interface AuthorizationChangeLog {
  id: EntityId
  enterpriseId: EntityId
  entityType: 'plan' | 'rule' | 'special'
  entityId: EntityId
  action: string
  detail: string
  createdAt: string
}

export interface AuthorizationFeatureState {
  schemaVersion: 1
  enterpriseId: EntityId
  nextPlanSequence: number
  plans: AuthorizationPlan[]
  rules: AuthorizationRule[]
  specials: SpecialAuthorization[]
  changeLogs: AuthorizationChangeLog[]
}

export interface AuthorizationPlanQuery {
  keyword?: string
  status?: AuthorizationPlanStatus
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface AuthorizationRuleQuery {
  keyword?: string
  planId?: EntityId
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface SpecialAuthorizationQuery {
  customerKeyword?: string
  type?: SpecialAuthorizationType
  effective?: 'effective' | 'future' | 'expired'
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface ProductAuthorizationReference {
  id: EntityId
  code: string
  name: string
  categoryId: EntityId
  brandId: EntityId | null
  status: 'draft' | 'on-sale' | 'off-sale'
  deletedAt: string | null
}

export interface CategoryAuthorizationReference { id: EntityId; name: string; parentId: EntityId | null; status: 'active' | 'inactive' }
export interface BrandAuthorizationReference { id: EntityId; name: string; status: 'active' | 'inactive' }
export interface CustomerAuthorizationReference { id: EntityId; code: string; name: string; categoryName: string; status: 'pending' | 'active' | 'inactive' | 'frozen' }

export interface AuthorizationCatalog {
  products: ProductAuthorizationReference[]
  categories: CategoryAuthorizationReference[]
  brands: BrandAuthorizationReference[]
  customers: CustomerAuthorizationReference[]
}

export interface AuthorizationPlanListItem extends AuthorizationPlan {
  productCount: number
  categoryNames: string[]
}

export interface AuthorizationRuleListItem extends AuthorizationRule { planName: string }
export interface SpecialAuthorizationListItem extends SpecialAuthorization { customerName: string; customerCode: string; customerCategoryName: string; productName: string; productCode: string }

export interface AuthorizationResolutionSource {
  type: AuthorizationSourceType
  id: EntityId
  label: string
}

export interface AuthorizationResolution {
  customerId: EntityId
  productId: EntityId
  visible: boolean
  orderable: boolean
  reason: 'allowed' | 'no-authorization' | 'special-visible-only' | 'special-prohibited' | 'customer-not-active' | 'product-not-on-sale'
  sources: AuthorizationResolutionSource[]
}

export interface ProductAuthorizationDetail {
  productId: EntityId
  plans: AuthorizationPlanListItem[]
  specials: SpecialAuthorizationListItem[]
}

export interface AuthorizationImportPreviewRow {
  row: number
  productCode: string
  productId: EntityId | null
  productName: string | null
  status: 'valid' | 'duplicate' | 'error'
  message: string
}

export interface AuthorizationImportPreview {
  rows: AuthorizationImportPreviewRow[]
  validCount: number
  errorCount: number
}

export interface AuthorizationWorkspaceOptions extends AuthorizationCatalog { clock: string }
export type AuthorizationPage<T> = PageResult<T>
