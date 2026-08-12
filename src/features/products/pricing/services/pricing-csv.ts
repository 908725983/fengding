import type { AdjustmentType, FormulaAnchor, PriceAdjustmentDraft, PriceField, PriceValues } from '../types'

export const pricingCsvHeaders = ['skuCode', 'costPrice', 'basePurchasePrice', 'baseOrderPrice', 'tierOnePrice', 'tierTwoPrice', 'storePrice', 'terminalPrice'] as const

const csvToField: Record<string, PriceField> = {
  costPrice: 'costPriceCents', basePurchasePrice: 'basePurchasePriceCents', baseOrderPrice: 'baseOrderPriceCents',
  tierOnePrice: 'tierOnePriceCents', tierTwoPrice: 'tierTwoPriceCents', storePrice: 'storePriceCents', terminalPrice: 'terminalPriceCents',
}

export interface PricingCsvSkuOption { skuId: string; skuCode: string; baseUnitId: string }
export interface PricingCsvPreview { rows: number; draft: PriceAdjustmentDraft | null; errors: string[] }

function parseLine(line: string): string[] {
  const values: string[] = []; let value = ''; let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!
    if (character === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1 }
    else if (character === '"') quoted = !quoted
    else if (character === ',' && !quoted) { values.push(value); value = '' }
    else value += character
  }
  values.push(value)
  return values.map((item) => item.trim())
}

function cents(value: string, row: number, header: string, errors: string[]): number | null | undefined {
  if (!value) return undefined
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || !/^\d+(?:\.\d{1,2})?$/.test(value)) { errors.push(`第 ${row} 行 ${header} 必须是非负、最多两位小数的金额`); return undefined }
  return Math.round(amount * 100)
}

export function pricingCsvTemplate(type: AdjustmentType): string {
  const fields = type === 'purchase' ? pricingCsvHeaders.slice(0, 3) : [pricingCsvHeaders[0], pricingCsvHeaders[1], ...pricingCsvHeaders.slice(3)]
  return `${fields.join(',')}\nSKU-000001,${type === 'purchase' ? '7.20,8.20' : '7.20,12.00,10.80,11.80,13.80,15.80'}`
}

export function parsePricingCsv(source: string, options: {
  type: AdjustmentType; customerId: string | null; formulaAnchor: FormulaAnchor | null; effectiveAt: string; note: string | null; skus: PricingCsvSkuOption[]
}): PricingCsvPreview {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  const errors: string[] = []
  if (lines.length < 2) return { rows: 0, draft: null, errors: ['CSV 至少需要表头和一行数据'] }
  const headers = parseLine(lines[0]!)
  if (!headers.includes('skuCode')) errors.push('CSV 缺少 skuCode 列')
  const supported = new Set(pricingCsvHeaders)
  headers.forEach((header) => { if (!supported.has(header as typeof pricingCsvHeaders[number])) errors.push(`不支持的列：${header}`) })
  const allowed = options.type === 'purchase' ? new Set(['skuCode', 'costPrice', 'basePurchasePrice']) : new Set(['skuCode', 'costPrice', 'baseOrderPrice', 'tierOnePrice', 'tierTwoPrice', 'storePrice', 'terminalPrice'])
  headers.forEach((header) => { if (!allowed.has(header)) errors.push(`${options.type} 调价不允许导入 ${header}`) })
  const seen = new Set<string>()
  const rows = lines.slice(1).map((line, index) => {
    const rowNumber = index + 2; const values = parseLine(line); const record = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? '']))
    const sku = options.skus.find((item) => item.skuCode.toLocaleLowerCase() === record.skuCode?.toLocaleLowerCase())
    if (!sku) errors.push(`第 ${rowNumber} 行 SKU 编码不存在或商品未上架：${record.skuCode || '空'}`)
    else if (seen.has(sku.skuId)) errors.push(`第 ${rowNumber} 行 SKU 重复：${record.skuCode}`)
    if (sku) seen.add(sku.skuId)
    const changes: Partial<PriceValues> = {}
    for (const [header, field] of Object.entries(csvToField)) {
      if (!(header in record)) continue
      const value = cents(record[header] ?? '', rowNumber, header, errors)
      if (value !== undefined) changes[field] = value
    }
    if (!Object.keys(changes).length) errors.push(`第 ${rowNumber} 行至少填写一个可修改价格`)
    return sku ? { skuId: sku.skuId, unitId: sku.baseUnitId, changes } : null
  }).filter((item): item is NonNullable<typeof item> => item !== null)
  const draft: PriceAdjustmentDraft = { type: options.type, customerId: options.customerId, formulaAnchor: options.formulaAnchor, effectiveAt: options.effectiveAt, note: options.note, lines: rows }
  return { rows: lines.length - 1, draft: errors.length ? null : draft, errors }
}
