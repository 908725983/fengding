import type {
  ProductDraft,
  ProductFeatureState,
  ProductMedia,
  ProductSkuDraft,
  RichTextDocument,
  SceneUnitSelection,
} from '../types'

export interface ProductValidationIssue { path: string; message: string }

export class ProductValidationError extends Error {
  readonly code = 'PRODUCT_VALIDATION_FAILED'
  constructor(readonly issues: ProductValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('；'))
    this.name = 'ProductValidationError'
  }
}

const mediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const sceneKeys = ['inventory', 'procurement', 'distribution', 'sales'] as const
const priceKeys = [
  'basePurchasePriceCents', 'baseOrderPriceCents', 'minimumSalePriceCents', 'maximumSalePriceCents',
  'tierOnePriceCents', 'tierTwoPriceCents', 'storePriceCents', 'terminalPriceCents',
] as const
const controlledSalePriceKeys = ['baseOrderPriceCents', 'tierOnePriceCents', 'tierTwoPriceCents', 'storePriceCents', 'terminalPriceCents'] as const

function requiredText(issues: ProductValidationIssue[], path: string, value: string, max: number): void {
  const normalized = value.trim()
  if (!normalized) issues.push({ path, message: '不能为空' })
  else if (normalized.length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}

function optionalText(issues: ProductValidationIssue[], path: string, value: string | null, max: number): void {
  if (value !== null && value.trim().length > max) issues.push({ path, message: `不能超过 ${max} 个字符` })
}

function decimalPlaces(value: number): number {
  const [, fraction = ''] = String(value).split('.')
  return fraction.length
}

function nonNegativeDecimal(issues: ProductValidationIssue[], path: string, value: number | null, places: number): void {
  if (value !== null && (!Number.isFinite(value) || value < 0 || decimalPlaces(value) > places)) {
    issues.push({ path, message: `必须是非负数且最多 ${places} 位小数` })
  }
}

function money(issues: ProductValidationIssue[], path: string, value: number | null): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) issues.push({ path, message: '必须是非负整数分' })
}

function validateMedia(issues: ProductValidationIssue[], path: string, media: ProductMedia): void {
  if (!media.name.trim()) issues.push({ path: `${path}.name`, message: '文件名不能为空' })
  if (!mediaTypes.has(media.mimeType)) issues.push({ path: `${path}.mimeType`, message: '仅支持 JPG、PNG、WEBP' })
  if (!Number.isInteger(media.sizeBytes) || media.sizeBytes <= 0 || media.sizeBytes > 500 * 1024) {
    issues.push({ path: `${path}.sizeBytes`, message: '单文件必须大于 0 且不超过 500KB' })
  }
}

function validateRichText(issues: ProductValidationIssue[], document: RichTextDocument): void {
  if (document.version !== 1) issues.push({ path: 'description.version', message: '必须为 1' })
  document.blocks.forEach((block, index) => {
    if (/<\/?[a-z][\s\S]*>/i.test(block.text)) issues.push({ path: `description.blocks.${index}.text`, message: '不能包含原始 HTML' })
    for (const mark of block.marks) {
      if (mark.type === 'link' && mark.value && !/^https?:\/\//i.test(mark.value)) {
        issues.push({ path: `description.blocks.${index}.marks`, message: '链接仅允许 http/https' })
      }
    }
    if (block.type === 'image' && !block.resourceId) issues.push({ path: `description.blocks.${index}.resourceId`, message: 'fake 图片必须有资源 ID' })
  })
}

function validateSceneUnit(issues: ProductValidationIssue[], path: string, value: SceneUnitSelection): void {
  requiredText(issues, `${path}.unitId`, value.unitId, 100)
  if (!Number.isFinite(value.conversionRate) || value.conversionRate <= 0 || decimalPlaces(value.conversionRate) > 6) {
    issues.push({ path: `${path}.conversionRate`, message: '必须为正数且最多 6 位小数' })
  }
}

function validateSku(issues: ProductValidationIssue[], sku: ProductSkuDraft, index: number): void {
  const path = `skus.${index}`
  if (sku.codeMode === 'manual') requiredText(issues, `${path}.code`, sku.code ?? '', 32)
  requiredText(issues, `${path}.specificationName`, sku.specificationName, 40)
  requiredText(issues, `${path}.specificationValue`, sku.specificationValue, 80)
  optionalText(issues, `${path}.shortName`, sku.shortName, 20)
  optionalText(issues, `${path}.barcode`, sku.barcode, 64)
  if (sku.mainImage) validateMedia(issues, `${path}.mainImage`, sku.mainImage)
  for (const key of priceKeys) money(issues, `${path}.${key}`, sku[key])
  if (sku.minimumSalePriceCents !== null && sku.maximumSalePriceCents !== null && sku.minimumSalePriceCents > sku.maximumSalePriceCents) {
    issues.push({ path: `${path}.minimumSalePriceCents`, message: '最低售价不能高于最高售价' })
  }
  for (const key of controlledSalePriceKeys) {
    const value = sku[key]
    if (value === null) continue
    if (sku.minimumSalePriceCents !== null && value < sku.minimumSalePriceCents) issues.push({ path: `${path}.${key}`, message: '不能低于最低售价' })
    if (sku.maximumSalePriceCents !== null && value > sku.maximumSalePriceCents) issues.push({ path: `${path}.${key}`, message: '不能高于最高售价' })
  }
}

export function validateProductDraft(draft: ProductDraft): ProductValidationIssue[] {
  const issues: ProductValidationIssue[] = []
  if (draft.codeMode === 'manual') requiredText(issues, 'code', draft.code ?? '', 32)
  requiredText(issues, 'name', draft.name, 80)
  optionalText(issues, 'shortName', draft.shortName, 20)
  requiredText(issues, 'categoryId', draft.categoryId, 100)
  requiredText(issues, 'baseUnitId', draft.baseUnitId, 100)
  if (draft.productType !== 'normal') issues.push({ path: 'productType', message: '拼套商品当前规划中' })
  if (!draft.skus.length) issues.push({ path: 'skus', message: '至少需要一个 SKU' })
  draft.skus.forEach((sku, index) => validateSku(issues, sku, index))
  const manualCodes = draft.skus.filter((sku) => sku.codeMode === 'manual').map((sku) => sku.code!.trim().toLocaleLowerCase())
  if (new Set(manualCodes).size !== manualCodes.length) issues.push({ path: 'skus.code', message: 'SKU 编码不能重复' })
  const barcodes = draft.skus.map((sku) => sku.barcode?.trim().toLocaleLowerCase()).filter((value): value is string => Boolean(value))
  if (new Set(barcodes).size !== barcodes.length) issues.push({ path: 'skus.barcode', message: 'SKU 条码不能重复' })
  for (const key of sceneKeys) validateSceneUnit(issues, `sceneUnits.${key}`, draft.sceneUnits[key])
  nonNegativeDecimal(issues, 'weightKg', draft.weightKg, 3)
  if (draft.shelfLifeDays !== null && (!Number.isInteger(draft.shelfLifeDays) || draft.shelfLifeDays < 0)) issues.push({ path: 'shelfLifeDays', message: '必须是非负整数天' })
  if (draft.minimumOrderQuantity !== null && (!Number.isInteger(draft.minimumOrderQuantity) || draft.minimumOrderQuantity < 0)) issues.push({ path: 'minimumOrderQuantity', message: '必须是非负整数' })
  nonNegativeDecimal(issues, 'salesTaxRatePercent', draft.salesTaxRatePercent, 2)
  if (draft.salesTaxRatePercent !== null && draft.salesTaxRatePercent > 100) issues.push({ path: 'salesTaxRatePercent', message: '不能超过 100' })
  if (draft.carouselImages.length > 5) issues.push({ path: 'carouselImages', message: '最多 5 张' })
  draft.carouselImages.forEach((media, index) => validateMedia(issues, `carouselImages.${index}`, media))
  validateRichText(issues, draft.description)
  if (new Set(draft.tagIds).size !== draft.tagIds.length) issues.push({ path: 'tagIds', message: '不能包含重复标签' })
  return issues
}

export function assertProductDraft(draft: ProductDraft): void {
  const issues = validateProductDraft(draft)
  if (issues.length) throw new ProductValidationError(issues)
}

export function assertProductFeatureState(state: ProductFeatureState): void {
  const issues: ProductValidationIssue[] = []
  if (state.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: '必须为 1' })
  requiredText(issues, 'enterpriseId', state.enterpriseId, 100)
  for (const [path, value] of [['nextProductSequence', state.nextProductSequence], ['nextSkuSequence', state.nextSkuSequence]] as const) {
    if (!Number.isInteger(value) || value < 1) issues.push({ path, message: '必须是大于等于 1 的整数' })
  }
  const collections = [state.products, state.categories, state.brands, state.units, state.tags, state.displayCategories, state.changeLogs]
  for (const collection of collections) {
    const ids = collection.map((item) => item.id)
    if (new Set(ids).size !== ids.length) issues.push({ path: 'entity.id', message: '同集合实体 ID 必须唯一' })
    if (collection.some((item) => item.enterpriseId !== state.enterpriseId)) issues.push({ path: 'enterpriseId', message: '实体企业必须与状态一致' })
  }
  const productCodes = state.products.map((item) => item.code.toLocaleLowerCase())
  const skuCodes = state.products.flatMap((item) => item.skus.map((sku) => sku.code.toLocaleLowerCase()))
  const barcodes = state.products.flatMap((item) => item.skus.map((sku) => sku.barcode?.toLocaleLowerCase()).filter((value): value is string => Boolean(value)))
  if (new Set(productCodes).size !== productCodes.length) issues.push({ path: 'products.code', message: 'SPU 编码必须唯一' })
  if (new Set(skuCodes).size !== skuCodes.length) issues.push({ path: 'products.skus.code', message: 'SKU 编码必须唯一' })
  if (new Set(barcodes).size !== barcodes.length) issues.push({ path: 'products.skus.barcode', message: 'SKU 条码必须唯一' })
  const categoryIds = new Set(state.categories.map((item) => item.id))
  const brandIds = new Set(state.brands.map((item) => item.id))
  const unitIds = new Set(state.units.map((item) => item.id))
  const tagIds = new Set(state.tags.map((item) => item.id))
  const displayCategoryIds = new Set(state.displayCategories.map((item) => item.id))
  for (const product of state.products) {
    if (!categoryIds.has(product.categoryId)) issues.push({ path: `products.${product.id}.categoryId`, message: '分类不存在' })
    if (product.brandId && !brandIds.has(product.brandId)) issues.push({ path: `products.${product.id}.brandId`, message: '品牌不存在' })
    if (!unitIds.has(product.baseUnitId) || !unitIds.has(product.freightUnitId)) issues.push({ path: `products.${product.id}.unitId`, message: '单位不存在' })
    if (Object.values(product.sceneUnits).some((scene) => !unitIds.has(scene.unitId))) issues.push({ path: `products.${product.id}.sceneUnits`, message: '场景单位不存在' })
    if (product.tagIds.some((id) => !tagIds.has(id))) issues.push({ path: `products.${product.id}.tagIds`, message: '标签不存在' })
    if (product.displayCategoryId && !displayCategoryIds.has(product.displayCategoryId)) issues.push({ path: `products.${product.id}.displayCategoryId`, message: '展示分类不存在' })
    if (product.skus.some((sku) => sku.productId !== product.id || sku.enterpriseId !== state.enterpriseId)) issues.push({ path: `products.${product.id}.skus`, message: 'SKU 归属不正确' })
    const { id: _id, enterpriseId: _enterpriseId, code: _code, status: _status, hasOrderReference: _hasOrderReference, deletedAt: _deletedAt, createdAt: _createdAt, updatedAt: _updatedAt, ...draftFields } = product
    const draft: ProductDraft = {
      ...draftFields,
      codeMode: 'manual', code: product.code,
      skus: product.skus.map(({ id: _skuId, enterpriseId: _skuEnterprise, productId: _productId, ...sku }) => ({ ...sku, codeMode: 'manual', code: sku.code })),
    }
    issues.push(...validateProductDraft(draft).map((issue) => ({ ...issue, path: `products.${product.id}.${issue.path}` })))
  }
  if (issues.length) throw new ProductValidationError(issues)
}
