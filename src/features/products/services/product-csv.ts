import { applyBaseUnit, createEmptyProductDraft, createEmptySkuDraft } from './product-service'
import type { ProductDraft, ProductReferenceData, ProductSkuDraft } from '../types'

export const productImportHeaders = ['SPU编码', '商品名称', '分类编码', '基本单位编码', 'SKU编码', '规格名称', '规格值', '条码', '基准进货价(元)', '基准订货价(元)'] as const

export interface ProductCsvPreview {
  drafts: ProductDraft[]
  rows: number
  errors: string[]
}

function parseRows(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []; let field = ''; let quoted = false
  const text = source.replace(/^\uFEFF/, '')
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1 }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(field.trim()); field = '' }
    else if (char === '\n') { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = '' }
    else if (char !== '\r') field += char
  }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row)
  return rows
}

function money(value: string, rowNumber: number, field: string, errors: string[]): number | null {
  if (!value) return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    errors.push(`第 ${rowNumber} 行：${field}必须是非负且最多两位小数`); return null
  }
  return Math.round(amount * 100)
}

export function parseProductCsv(source: string, references: ProductReferenceData): ProductCsvPreview {
  const rows = parseRows(source)
  if (!rows.length) return { drafts: [], rows: 0, errors: ['CSV 内容为空'] }
  const headers = rows[0] ?? []
  const missing = productImportHeaders.filter((header) => !headers.includes(header))
  if (missing.length) return { drafts: [], rows: Math.max(0, rows.length - 1), errors: [`缺少列：${missing.join('、')}`] }
  const column = Object.fromEntries(headers.map((header, index) => [header, index])) as Record<string, number>
  const errors: string[] = []; const groups = new Map<string, ProductDraft>()

  rows.slice(1).forEach((values, offset) => {
    const rowNumber = offset + 2; const value = (header: typeof productImportHeaders[number]) => values[column[header]]?.trim() ?? ''
    const spuCode = value('SPU编码'); const skuCode = value('SKU编码'); const name = value('商品名称')
    const category = references.categories.find((item) => item.code === value('分类编码') && item.status === 'active')
    const unit = references.units.find((item) => item.code === value('基本单位编码') && item.status === 'active')
    const basePurchasePriceCents = money(value('基准进货价(元)'), rowNumber, '基准进货价', errors)
    const baseOrderPriceCents = money(value('基准订货价(元)'), rowNumber, '基准订货价', errors)
    if (!spuCode) errors.push(`第 ${rowNumber} 行：SPU编码不能为空`)
    if (!skuCode) errors.push(`第 ${rowNumber} 行：SKU编码不能为空`)
    if (!name) errors.push(`第 ${rowNumber} 行：商品名称不能为空`)
    if (!category) errors.push(`第 ${rowNumber} 行：分类编码不存在或已停用`)
    if (!unit) errors.push(`第 ${rowNumber} 行：基本单位编码不存在或已停用`)
    if (!spuCode || !skuCode || !name || !category || !unit) return

    let draft = groups.get(spuCode)
    if (!draft) {
      draft = applyBaseUnit(createEmptyProductDraft(), unit.id)
      Object.assign(draft, { codeMode: 'manual', code: spuCode, name, categoryId: category.id, skus: [] })
      groups.set(spuCode, draft)
    } else if (draft.name !== name || draft.categoryId !== category.id || draft.baseUnitId !== unit.id) {
      errors.push(`第 ${rowNumber} 行：同一 SPU 的名称、分类和基本单位必须一致`); return
    }
    const sku: ProductSkuDraft = { ...createEmptySkuDraft(), codeMode: 'manual', code: skuCode,
      specificationName: value('规格名称') || '默认', specificationValue: value('规格值') || '默认规格', barcode: value('条码') || null,
      basePurchasePriceCents, baseOrderPriceCents,
    }
    draft.skus.push(sku)
  })
  return { drafts: [...groups.values()], rows: Math.max(0, rows.length - 1), errors }
}

export function productCsvTemplate(): string {
  return `${productImportHeaders.join(',')}\r\nSPU-DEMO-001,示例导入商品,DEMO-FOOD,DEMO-PIECE,SKU-DEMO-001,默认,默认规格,,5.00,8.00`
}
