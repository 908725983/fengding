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

export interface CustomerFeatureState {
  schemaVersion: 1
  enterpriseId: EntityId
  nextCustomerSequence: number
  customers: Customer[]
  categories: CustomerCategory[]
  tags: CustomerTag[]
  suggestions: CustomerTagSuggestion[]
  changeLogs: CustomerChangeLog[]
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

export interface CustomerOrderEligibility {
  allowed: boolean
  reason: 'ok' | 'customer-not-active' | 'credit-limit-exceeded'
}
