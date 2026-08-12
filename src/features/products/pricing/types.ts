import type { EntityId, PageResult, ProductRole, ProductStatus } from '../types'
export type { EntityId } from '../types'

export type PriceField =
  | 'costPriceCents'
  | 'basePurchasePriceCents'
  | 'baseOrderPriceCents'
  | 'tierOnePriceCents'
  | 'tierTwoPriceCents'
  | 'storePriceCents'
  | 'terminalPriceCents'
  | 'minimumSalePriceCents'
  | 'maximumSalePriceCents'

export type SalePriceField = 'baseOrderPriceCents' | 'tierOnePriceCents' | 'tierTwoPriceCents' | 'storePriceCents' | 'terminalPriceCents'
export type AdjustmentType = 'level' | 'purchase' | 'customer'
export type AdjustmentStatus = 'pending' | 'effective' | 'expired'
export type PriceTier = 'base-order' | 'tier-one' | 'tier-two' | 'store' | 'terminal'
export type FormulaAnchor = 'base-order' | 'tier-one'
export type FormulaMode = 'set' | 'increase-fixed' | 'decrease-fixed' | 'increase-percent' | 'decrease-percent'
export type StrategyAnchor = 'cost-price' | 'base-purchase-price' | 'base-order-price'
export type StrategyAmplitudeType = 'fixed' | 'percent'
export type PriceScope = 'global' | 'customer' | 'strategy'

export type PriceValues = Record<PriceField, number | null>

export interface PricingActor {
  role: ProductRole
  actorId: EntityId
}

export interface PriceAdjustmentLine {
  id: EntityId
  skuId: EntityId
  unitId: EntityId
  changes: Partial<PriceValues>
}

export interface PriceAdjustment {
  id: EntityId
  enterpriseId: EntityId
  number: string
  type: AdjustmentType
  customerId: EntityId | null
  formulaAnchor: FormulaAnchor | null
  effectiveAt: string
  status: AdjustmentStatus
  note: string | null
  lines: PriceAdjustmentLine[]
  createdBy: EntityId
  createdAt: string
  updatedAt: string
}

export interface PriceAdjustmentDraft {
  type: AdjustmentType
  customerId: EntityId | null
  formulaAnchor: FormulaAnchor | null
  effectiveAt: string
  note: string | null
  lines: Array<Omit<PriceAdjustmentLine, 'id'>>
}

export interface PriceVersion {
  id: EntityId
  enterpriseId: EntityId
  scope: PriceScope
  customerId: EntityId | null
  adjustmentId: EntityId | null
  skuId: EntityId
  unitId: EntityId
  field: PriceField
  valueCents: number | null
  effectiveAt: string
  expiredAt: string | null
}

export interface PriceHistoryEntry extends PriceVersion {
  adjustmentNumber: string
  adjustmentType: AdjustmentType | 'unit-override' | 'strategy'
  previousValueCents: number | null
  differenceCents: number | null
}

export interface UnitPriceOverride {
  id: EntityId
  enterpriseId: EntityId
  skuId: EntityId
  unitId: EntityId
  prices: Partial<PriceValues>
  updatedBy: EntityId
  updatedAt: string
}

export interface AutoPriceStrategy {
  id: EntityId
  enterpriseId: EntityId
  skuId: EntityId
  unitId: EntityId
  targetField: SalePriceField
  anchor: StrategyAnchor
  amplitudeType: StrategyAmplitudeType
  amplitude: number
  enabled: boolean
  startsAt: string
  endsAt: string | null
  lastRunAt: string | null
  lastError: string | null
}

export interface CustomerPriceTierMapping {
  categoryId: EntityId
  tier: PriceTier
}

export interface SkuCostBasis {
  skuId: EntityId
  costPriceCents: number | null
}

export interface PricingFeatureState {
  schemaVersion: 1
  enterpriseId: EntityId
  clock: string
  nextSequences: Record<AdjustmentType, number>
  adjustments: PriceAdjustment[]
  versions: PriceVersion[]
  history: PriceHistoryEntry[]
  unitOverrides: UnitPriceOverride[]
  strategies: AutoPriceStrategy[]
  categoryTierMappings: CustomerPriceTierMapping[]
  costBasis: SkuCostBasis[]
}

export interface PriceAdjustmentQuery {
  type: AdjustmentType
  number?: string
  createdFrom?: string
  createdTo?: string
  effectiveFrom?: string
  effectiveTo?: string
  status?: AdjustmentStatus
  createdBy?: EntityId
  customerId?: EntityId
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface PriceHistoryQuery {
  adjustmentNumber?: string
  adjustmentType?: AdjustmentType | 'unit-override' | 'strategy'
  skuId?: EntityId
  effectiveFrom?: string
  effectiveTo?: string
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface PricingSkuSnapshot {
  skuId: EntityId
  productId: EntityId
  productName: string
  skuCode: string
  specification: string
  productStatus: ProductStatus
  baseUnitId: EntityId
  unitRates: Record<EntityId, number>
  prices: Omit<PriceValues, 'costPriceCents'>
}

export interface PricingCustomerSnapshot {
  customerId: EntityId
  customerName: string
  status: 'pending' | 'active' | 'inactive' | 'frozen'
  categoryLineage: EntityId[]
}

export interface PricingCatalogProvider {
  getSku(skuId: EntityId): PricingSkuSnapshot | null
  getCustomer(customerId: EntityId): PricingCustomerSnapshot | null
  listSkus(): PricingSkuSnapshot[]
  listCustomers(): PricingCustomerSnapshot[]
}

export interface PricingMatrixRow {
  sku: PricingSkuSnapshot
  unitId: EntityId
  values: PriceValues
}

export interface PricingFormOptions {
  clock: string
  skus: PricingSkuSnapshot[]
  customers: PricingCustomerSnapshot[]
  matrices: Record<EntityId, PriceValues>
}

export interface ApplyAdjustmentFormulaInput {
  draft: PriceAdjustmentDraft
  field: PriceField
  mode: FormulaMode
  operand: number
  skuIds?: EntityId[]
}

export interface ResolvedPrice {
  skuId: EntityId
  unitId: EntityId
  quantity: number
  unitPriceCents: number
  source: 'customer' | 'level' | 'base-order'
  sourceReferenceId: EntityId | null
  conversionRate: number
  calculatedAt: string
}

export type PriceAdjustmentPage = PageResult<PriceAdjustment>
export type PriceHistoryPage = PageResult<PriceHistoryEntry>
