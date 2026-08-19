import { describe, expect, it } from 'vitest'
import { parseSupplierCsv, supplierCsvTemplate } from './procurement-csv'

describe('supplier csv', () => {
  it('parses the fixed template including quoted fields', () => {
    const result = parseSupplierCsv(supplierCsvTemplate().replace('演示导入供应商', '"演示,导入供应商"'))
    expect(result.errors).toEqual([]); expect(result.rows[0]).toMatchObject({ code: 'SUP-DEMO-001', name: '演示,导入供应商', tradeType: 'purchase', deliveryMode: 'both' })
  })
  it('rejects missing columns and unknown enums before service preview', () => {
    expect(parseSupplierCsv('供应商编码\nSUP-1').errors[0]).toContain('缺少列')
    expect(parseSupplierCsv(supplierCsvTemplate().replace(',购销,', ',未知,')).errors[0]).toContain('交易类型')
  })
})
