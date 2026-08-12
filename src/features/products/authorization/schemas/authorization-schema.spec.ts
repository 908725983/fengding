import { describe, expect, it } from 'vitest'
import { validateAuthorizationPlanDraft, validateAuthorizationRuleDraft, validateSpecialAuthorizationBatchDraft } from './authorization-schema'

describe('PRD-003 authorization schema', () => {
  it('validates plan identity and unique ranges', () => {
    expect(validateAuthorizationPlanDraft({ name: '', status: 'enabled', categoryIds: ['a', 'a'], brandIds: [], productIds: [], customerIds: [] }).map((item) => item.path)).toEqual(expect.arrayContaining(['name', 'categoryIds']))
  })

  it('rejects empty, overlapping and overnight weekly periods', () => {
    const issues = validateAuthorizationRuleDraft({ name: '规则', weekdays: [1], timeRanges: [{ start: '09:00', end: '11:00' }, { start: '10:00', end: '12:00' }, { start: '23:00', end: '01:00' }], planId: 'plan', customerIds: ['customer'] })
    expect(issues.map((item) => item.message).join()).toContain('重叠')
    expect(issues.map((item) => item.message).join()).toContain('不能跨日')
  })

  it('validates atomic special authorization input', () => {
    const issues = validateSpecialAuthorizationBatchDraft({ customerIds: [], productIds: [], type: 'visible-only', startsAt: 'bad', endsAt: null, note: 'x'.repeat(501) })
    expect(issues.map((item) => item.path)).toEqual(expect.arrayContaining(['customerIds', 'productIds', 'startsAt', 'note']))
  })
})

