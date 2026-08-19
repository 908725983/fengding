import type { SupplierImportRow, SupplierTradeType, SupplierDeliveryMode } from '../types'

export const supplierImportHeaders = ['供应商编码', '供应商名称', '交易类型', '供货方式', '联系人', '联系电话', '地址', '开户行', '银行账号', '备注'] as const

function parseRows(source: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false; const text = source.replace(/^\uFEFF/, '')
  for (let index = 0; index < text.length; index += 1) { const char = text[index]; if (quoted) { if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1 } else if (char === '"') quoted = false; else field += char } else if (char === '"') quoted = true; else if (char === ',') { row.push(field.trim()); field = '' } else if (char === '\n') { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = '' } else if (char !== '\r') field += char }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row); return rows
}

export function parseSupplierCsv(source: string): { rows: SupplierImportRow[]; errors: string[] } {
  const values = parseRows(source); if (!values.length) return { rows: [], errors: ['CSV 内容为空'] }
  const headers = values[0] ?? []; const missing = supplierImportHeaders.filter((header) => !headers.includes(header)); if (missing.length) return { rows: [], errors: [`缺少列：${missing.join('、')}`] }
  const column = Object.fromEntries(headers.map((header, index) => [header, index])) as Record<string, number>; const rows: SupplierImportRow[] = []; const errors: string[] = []
  values.slice(1).forEach((cells, offset) => { const rowNumber = offset + 2; const value = (header: typeof supplierImportHeaders[number]) => cells[column[header]]?.trim() ?? ''; const tradeMap: Record<string, SupplierTradeType> = { '购销': 'purchase', '代销': 'resale', purchase: 'purchase', resale: 'resale' }; const deliveryMap: Record<string, SupplierDeliveryMode> = { '入仓': 'warehouse', '直送': 'direct', '均可': 'both', warehouse: 'warehouse', direct: 'direct', both: 'both' }; const tradeType = tradeMap[value('交易类型')]; const deliveryMode = deliveryMap[value('供货方式')]; if (!tradeType) errors.push(`第 ${rowNumber} 行：交易类型必须是购销或代销`); if (!deliveryMode) errors.push(`第 ${rowNumber} 行：供货方式必须是入仓、直送或均可`); if (tradeType && deliveryMode) rows.push({ rowNumber, code: value('供应商编码'), name: value('供应商名称'), tradeType, deliveryMode, contactName: value('联系人'), contactPhone: value('联系电话'), address: value('地址') || null, bankName: value('开户行') || null, bankAccount: value('银行账号') || null, note: value('备注') || null }) })
  return { rows, errors }
}

export function supplierCsvTemplate(): string { return `${supplierImportHeaders.join(',')}\r\nSUP-DEMO-001,演示导入供应商,购销,均可,演示联系人,000-3000-0001,,,仅用于原型` }
