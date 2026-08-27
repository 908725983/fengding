export type EntityId = string
export type ProductRole = 'super-admin' | 'sales-supervisor' | 'salesperson' | 'warehouse' | 'finance'
export type ProductStatus = 'draft' | 'on-sale' | 'off-sale'
export type ReferenceStatus = 'active' | 'inactive'
export type ProductType = 'normal' | 'bundle'
export type ProductViewMode = 'spu' | 'sku'
export type ProductCodeMode = 'auto' | 'manual'
export type SceneUnitKind = 'inventory' | 'procurement' | 'distribution' | 'sales'

export interface ProductActor {
  role: ProductRole
  actorId: EntityId
}

export interface ProductMedia {
  id: EntityId
  name: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  sizeBytes: number
}

export interface RichTextMark {
  type: 'bold' | 'italic' | 'color' | 'link'
  value?: string
}

export interface RichTextBlock {
  type: 'paragraph' | 'heading' | 'list-item' | 'image'
  text: string
  marks: RichTextMark[]
  resourceId?: EntityId
}

export interface RichTextDocument {
  version: 1
  blocks: RichTextBlock[]
}

export interface ProductReference {
  id: EntityId
  enterpriseId: EntityId
  code: string
  name: string
  status: ReferenceStatus
  sortOrder?: number
  logo?: ProductMedia | null
  color?: string
  aiAllowed?: boolean
  deletedAt?: string | null
}

export interface ProductCategory extends ProductReference {
  parentId: EntityId | null
  icon?: ProductMedia | null
}

export interface ProductUnit extends ProductReference {
  type: 'basic' | 'auxiliary'
  conversionRate?: number
}

export type ProductReferenceKind = 'categories' | 'brands' | 'units' | 'tags' | 'displayCategories'
export type ProductReferenceDraft = { name: string; status?: ReferenceStatus; parentId?: EntityId | null; sortOrder?: number; icon?: ProductMedia | null; logo?: ProductMedia | null; color?: string; aiAllowed?: boolean; type?: 'basic' | 'auxiliary'; conversionRate?: number }
export interface SmartTagAnalysis { id: EntityId; productId: EntityId; productVersion: string; addTagIds: EntityId[]; removeTagIds: EntityId[]; reasons: string[]; status: 'pending' | 'confirmed' | 'failed'; createdAt: string; confirmedAt: string | null }

export interface SceneUnitSelection {
  unitId: EntityId
  conversionRate: number
}

export interface ProductSceneUnits {
  inventory: SceneUnitSelection
  procurement: SceneUnitSelection
  distribution: SceneUnitSelection
  sales: SceneUnitSelection
}

export interface ProductCustomAttributes {
  color: string | null
  grossWeight: string | null
  netWeight: string | null
  grossUnitPrice: string | null
  netUnitPrice: string | null
  supplier: string | null
}

export interface ProductSkuPrices {
  basePurchasePriceCents: number | null
  baseOrderPriceCents: number | null
  minimumSalePriceCents: number | null
  maximumSalePriceCents: number | null
  tierOnePriceCents: number | null
  tierTwoPriceCents: number | null
  storePriceCents: number | null
  terminalPriceCents: number | null
}

export interface ProductSku extends ProductSkuPrices {
  id: EntityId
  enterpriseId: EntityId
  productId: EntityId
  code: string
  shortName: string | null
  barcode: string | null
  specificationName: string
  specificationValue: string
  mainImage: ProductMedia | null
}

export interface Product {
  id: EntityId
  enterpriseId: EntityId
  code: string
  name: string
  shortName: string | null
  categoryId: EntityId
  baseUnitId: EntityId
  productType: ProductType
  displayCategoryId: EntityId | null
  brandId: EntityId | null
  tagIds: EntityId[]
  sceneUnits: ProductSceneUnits
  weightKg: number | null
  origin: string | null
  shelfLifeDays: number | null
  minimumOrderQuantity: number | null
  orderMultiple: number
  salesTaxRatePercent: number | null
  manageProductionDate: boolean
  freeShipping: boolean
  freightTemplateId: EntityId | null
  freightUnitId: EntityId
  carouselImages: ProductMedia[]
  customAttributes: ProductCustomAttributes
  description: RichTextDocument
  skus: ProductSku[]
  status: ProductStatus
  hasOrderReference: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProductSkuDraft extends ProductSkuPrices {
  codeMode: ProductCodeMode
  code: string | null
  shortName: string | null
  barcode: string | null
  specificationName: string
  specificationValue: string
  mainImage: ProductMedia | null
}

export interface ProductDraft {
  codeMode: ProductCodeMode
  code: string | null
  name: string
  shortName: string | null
  categoryId: EntityId
  baseUnitId: EntityId
  productType: ProductType
  displayCategoryId: EntityId | null
  brandId: EntityId | null
  tagIds: EntityId[]
  sceneUnits: ProductSceneUnits
  weightKg: number | null
  origin: string | null
  shelfLifeDays: number | null
  minimumOrderQuantity: number | null
  orderMultiple: number
  salesTaxRatePercent: number | null
  manageProductionDate: boolean
  freeShipping: boolean
  freightTemplateId: EntityId | null
  freightUnitId: EntityId
  carouselImages: ProductMedia[]
  customAttributes: ProductCustomAttributes
  description: RichTextDocument
  skus: ProductSkuDraft[]
}

export interface ProductChangeLog {
  id: EntityId
  enterpriseId: EntityId
  productId: EntityId
  action: 'product.created' | 'product.updated' | 'product.status-changed' | 'product.deleted' | 'product.imported'
  detail: string
  createdAt: string
}

export interface ProductFeatureState {
  schemaVersion: 1
  enterpriseId: EntityId
  nextProductSequence: number
  nextSkuSequence: number
  products: Product[]
  categories: ProductCategory[]
  brands: ProductReference[]
  units: ProductUnit[]
  tags: ProductReference[]
  displayCategories: ProductReference[]
  changeLogs: ProductChangeLog[]
  nextReferenceSequences?: Record<string, number>
  smartTagAnalyses?: SmartTagAnalysis[]
}

export interface ProductListQuery {
  view?: ProductViewMode
  categoryId?: EntityId
  brandId?: EntityId
  status?: ProductStatus
  keyword?: string
  tagIds?: EntityId[]
  supplierId?: EntityId
  priceMinCents?: number
  priceMaxCents?: number
  page?: number
  pageSize?: 10 | 30 | 50 | 100
}

export interface ProductListItem {
  rowId: EntityId
  productId: EntityId
  skuId: EntityId | null
  view: ProductViewMode
  name: string
  specification: string | null
  code: string
  barcode: string | null
  skuCount: number
  image: ProductMedia | null
  unitName: string
  basePurchasePriceMinCents: number | null
  basePurchasePriceMaxCents: number | null
  baseOrderPriceMinCents: number | null
  baseOrderPriceMaxCents: number | null
  status: ProductStatus
  createdAt: string
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ProductReferenceData {
  categories: ProductCategory[]
  brands: ProductReference[]
  units: ProductUnit[]
  tags: ProductReference[]
  displayCategories: ProductReference[]
  supplierProvider: 'available' | 'unavailable'
  suppliers?: Array<{ id: EntityId; name: string }>
  freightTemplateProvider: 'unavailable'
}

export interface ProductImportResult {
  createdIds: EntityId[]
  count: number
}
