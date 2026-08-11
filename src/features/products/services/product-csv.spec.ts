import { describe, expect, it } from 'vitest'
import { productBaseline } from '../../../../mock/handlers/product-handler'
import { parseProductCsv, productCsvTemplate } from './product-csv'

const references = {
  categories: productBaseline.categories, brands: productBaseline.brands, units: productBaseline.units,
  tags: productBaseline.tags, displayCategories: productBaseline.displayCategories,
  supplierProvider: 'unavailable' as const, freightTemplateProvider: 'unavailable' as const,
}

describe('PRD-001 UTF-8 CSV adapter', () => {
  it('groups multiple SKU rows under one SPU and converts yuan to cents', () => {
    const source = `${productCsvTemplate()}\r\nSPU-DEMO-001,示例导入商品,DEMO-FOOD,DEMO-PIECE,SKU-DEMO-002,包装,大包装,,6.25,9.90`
    const preview = parseProductCsv(source, references)
    expect(preview.errors).toEqual([])
    expect(preview.drafts).toHaveLength(1)
    expect(preview.drafts[0]?.skus).toHaveLength(2)
    expect(preview.drafts[0]?.skus[1]?.baseOrderPriceCents).toBe(990)
  })

  it('reports row errors without producing a committable preview', () => {
    const preview = parseProductCsv(productCsvTemplate().replace('DEMO-FOOD', 'UNKNOWN').replace('5.00', '-1'), references)
    expect(preview.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('分类编码不存在或已停用'), expect.stringContaining('基准进货价必须是非负'),
    ]))
  })
})
