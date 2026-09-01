import { describe, expect, it } from 'vitest'
import { customerBaseline } from '../../../../mock/handlers/customer-handler'
import { assertCustomerFeatureState, validateCustomerDraft } from './customer-schema'
import { createEmptyCustomerDraft } from '../services/customer-service'

describe('CUS-001 executable schemas', () => {
  it('accepts the deterministic baseline fixture', () => {
    expect(() => assertCustomerFeatureState(customerBaseline)).not.toThrow()
  })

  it('reports field paths and conditional settlement validation', () => {
    const issues = validateCustomerDraft({ ...createEmptyCustomerDraft(), settlementMethod: 'terms', paymentTermDays: null })
    expect(issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      'code', 'name', 'categoryId', 'primaryContactName', 'primaryPhone', 'cityCode', 'address', 'paymentTermDays',
    ]))
  })
})
