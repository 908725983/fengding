import { beforeEach, describe, expect, it } from 'vitest'
import { customerBaseline } from '../../../../mock/handlers/customer-handler'
import { InMemoryCustomerRepository } from '../repositories/customer-repository'
import type { CustomerActor, CouponTemplateDraft, MarketingArticleDraft, PromotionDraft, VoucherCampaignDraft } from '../types'
import { createCustomerOperationsService } from './customer-operations-service'

const admin: CustomerActor = { role: 'super-admin', actorId: 'admin-demo' }
const salesperson: CustomerActor = { role: 'salesperson', actorId: 'staff-demo-1' }

describe('CUS-006/CUS-010 marketing operations', () => {
  let service: ReturnType<typeof createCustomerOperationsService>
  beforeEach(() => {
    const repository = new InMemoryCustomerRepository(customerBaseline)
    let sequence = 1
    service = createCustomerOperationsService({ repository, now: () => '2026-08-27T10:00:00+08:00', nextId: (kind) => `${kind}-marketing-${sequence++}`, staffNames: {} })
  })

  it('validates coupon templates and creates immutable voucher issues', () => {
    const draft: CouponTemplateDraft = { code: 'TEST-COUPON', name: '测试满减券', type: 'threshold-discount', thresholdCents: 10000, amountCents: 1000, discountPercent: null, maxDiscountCents: null, issueQuantity: 20, validityType: 'after-days', validityDays: 30, startsAt: '2026-08-27T00:00:00+08:00', endsAt: '2026-09-30T23:59:59+08:00', scopeKind: 'all', scopeIds: [], audienceKind: 'all', audienceIds: [], perCustomerLimit: 1, newCustomerOnly: false, allowPromotionalItems: false, description: null }
    const coupon = service.saveCoupon(admin, draft)
    expect(() => service.saveCoupon(admin, { ...draft, name: '重复编码' })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_CODE' }))
    const campaignDraft: VoucherCampaignDraft = { name: '测试发券', startsAt: '2026-08-27T00:00:00+08:00', endsAt: '2026-09-30T23:59:59+08:00', couponId: coupon.id, audienceKind: 'customer', audienceIds: ['customer-1'], quantityPerCustomer: 1, channels: ['inbox'], description: null }
    const campaign = service.createVoucherCampaign(salesperson, campaignDraft)
    expect(service.issueVoucherCampaign(salesperson, campaign.id)).toBe(1)
    expect(service.listVoucherIssues(admin, campaign.id)).toHaveLength(1)
  })

  it('rejects overlapping product promotions atomically', () => {
    const draft: PromotionDraft = { code: 'PROMO-TEST-1', name: '测试促销', type: 'limited-discount', startsAt: '2026-08-27T00:00:00+08:00', endsAt: '2026-09-10T23:59:59+08:00', customerAudienceKind: 'all', customerAudienceIds: [], scopeKind: 'product', scopeIds: ['sku-demo-001'], discountMode: 'rate', discountPercent: 90, discountPriceCents: null, limitQuantity: 0, limitPeriod: 'campaign', rules: [], allowCoupon: false, allowMemberDiscount: false, showCountdown: false, showStock: false, sortWeight: 1, description: null }
    service.savePromotion(admin, draft)
    expect(() => service.savePromotion(admin, { ...draft, code: 'PROMO-TEST-2', name: '冲突促销' })).toThrowError(expect.objectContaining({ code: 'REFERENCE_CONFLICT' }))
    expect(service.listPromotions(admin).filter((item) => item.code.startsWith('PROMO-TEST'))).toHaveLength(1)
  })

  it('keeps article publishing explicit and analysis provider boundaries unavailable', () => {
    const draft: MarketingArticleDraft = { title: '测试获客文章', type: 'graphic', cover: null, summary: null, content: 'fake content', productIds: [], couponId: null, promotionId: null, publishMode: 'draft', scheduledAt: null, channels: ['h5'], readPermission: 'public' }
    const article = service.saveMarketingArticle(admin, draft)
    expect(article.status).toBe('draft')
    expect(service.publishMarketingArticle(admin, article.id).status).toBe('published')
    const analysis = service.listMarketingAnalysis(admin)
    expect(analysis.promotionOrderCount.value).toBeNull()
    expect(analysis.promotionOrderCount.unavailableReason).toContain('订单')
    expect(analysis.referral[0]?.commissionCents.value).toBeNull()
  })
})
