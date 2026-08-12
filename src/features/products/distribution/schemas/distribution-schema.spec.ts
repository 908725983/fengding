import { describe, expect, it } from 'vitest'
import { distributionBaseline } from '../../../../../mock/handlers/distribution-handler'
import { assertDistributionFeatureState, validateDistributionPlanDraft, validateOrderTemplateDraft } from './distribution-schema'
import { createEmptyDistributionPlanDraft, createEmptyOrderTemplateDraft } from '../services/distribution-service'

describe('PRD-004 executable schemas', () => {
  it('accepts the deterministic baseline', () => { expect(() => assertDistributionFeatureState(distributionBaseline)).not.toThrow() })
  it('enforces minute ranges, scope limits and 20/200 line boundaries', () => {
    const plan = createEmptyDistributionPlanDraft('2026-08-10T09:00:00+08:00'); plan.startsAt = plan.endsAt; plan.scope.type = 'specified'; plan.scope.customerIds = Array.from({ length: 101 }, (_, index) => `c-${index}`); plan.lines = Array.from({ length: 21 }, (_, index) => ({ skuId: `s-${index}`, quantity: 1 }))
    expect(validateDistributionPlanDraft(plan).map((item) => item.path)).toEqual(expect.arrayContaining(['startsAt', 'scope.customerIds', 'lines']))
    const template = createEmptyOrderTemplateDraft(); template.lines = Array.from({ length: 201 }, (_, index) => ({ skuId: `s-${index}`, quantity: 1 }))
    expect(validateOrderTemplateDraft(template).map((item) => item.path)).toContain('lines')
  })
})
