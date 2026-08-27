import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CustomerScenarioName } from '../../../../mock/handlers/customer-handler'
import { getApplicationMockRuntimeController } from '../../../app/runtime/app-mock-runtime'
import { CustomerDomainError } from '../services/customer-service'
import { setCurrentCustomerRole } from './customer-access'
import type { Customer, CustomerActor, CustomerCategory, CustomerCategoryDraft, CustomerChangeLog, CustomerDraft, CustomerListItem, CustomerListQuery, CustomerStatus, CustomerTag, CustomerTagDraft, CustomerTagSuggestion, ImmediateAnalysisInput, PageResult, CustomerOpportunity, CustomerFrequentProduct, PublicSeaEntry, PublicSeaRule, CustomerMapMarker, CustomerVisit, CustomerVisitRoute, CustomerVisitPlan, OpportunityDraft, FrequentProductDraft, PublicSeaRuleDraft, VisitDraft, RouteDraft, VisitPlanDraft, OpportunityStage, MembershipLevel, MembershipLevelDraft, CustomerMembership, PointAccount, PointLedgerEntry, PointsSettings, PointsSettingsDraft, PointAdjustmentType, CouponTemplate, CouponTemplateDraft, Promotion, PromotionDraft, VoucherCampaign, VoucherCampaignDraft, VoucherIssue, MarketingArticle, MarketingArticleDraft, MarketingAnalysisResult, CustomerChannelState, WecomSyncSettings, WecomBroadcast, MallSettings, MallDesign, MallExtension, MallCustomerAccount, MallEmployeeAccount, MallAd, MallPopup, MallMessage } from '../types'

export const useCustomerStore = defineStore('customers', () => {
  const runtimeController = getApplicationMockRuntimeController(); const session = runtimeController.customer
  const scenario = computed<CustomerScenarioName>(() => session.scenarioName)
  const actor = ref<CustomerActor>({ role: 'super-admin', actorId: 'admin-demo' })
  const query = ref<CustomerListQuery>({ page: 1, pageSize: 30 })
  const result = ref<PageResult<CustomerListItem>>({ items: [], total: 0, page: 1, pageSize: 30 })
  const categories = ref<CustomerCategory[]>([])
  const tags = ref<CustomerTag[]>([])
  const selectedCustomer = ref<Customer | null>(null)
  const changeLogs = ref<CustomerChangeLog[]>([])
  const suggestions = ref<CustomerTagSuggestion[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const opportunities = ref<CustomerOpportunity[]>([])
  const frequentProducts = ref<CustomerFrequentProduct[]>([])
  const publicSeaEntries = ref<PublicSeaEntry[]>([])
  const publicSeaRule = ref<PublicSeaRule | null>(null)
  const mapMarkers = ref<CustomerMapMarker[]>([])
  const visits = ref<CustomerVisit[]>([])
  const routes = ref<CustomerVisitRoute[]>([])
  const visitPlans = ref<CustomerVisitPlan[]>([])
  const membershipLevels = ref<MembershipLevel[]>([])
  const memberships = ref<CustomerMembership[]>([])
  const pointAccounts = ref<PointAccount[]>([])
  const selectedPointLedger = ref<PointLedgerEntry[]>([])
  const pointsSettings = ref<PointsSettings | null>(null)
  const coupons = ref<CouponTemplate[]>([])
  const promotions = ref<Promotion[]>([])
  const voucherCampaigns = ref<VoucherCampaign[]>([])
  const voucherIssues = ref<VoucherIssue[]>([])
  const marketingArticles = ref<MarketingArticle[]>([])
  const marketingAnalysis = ref<MarketingAnalysisResult | null>(null)
  const channelState = ref<CustomerChannelState | null>(null)

  const isEmpty = computed(() => !loading.value && !error.value && result.value.total === 0)
  const canWrite = computed(() => ['super-admin', 'sales-supervisor', 'salesperson'].includes(actor.value.role))

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await session.run(() => ({
        page: session.service.listCustomers(actor.value, query.value),
        categories: session.service.listCategories(actor.value),
        tags: session.service.listTags(actor.value),
      }))
      result.value = response.page
      categories.value = response.categories
      tags.value = response.tags
    } catch (caught) {
      if (caught instanceof CustomerDomainError || caught instanceof Error) error.value = caught.message
      else error.value = '客户数据加载失败'
      result.value = { items: [], total: 0, page: query.value.page ?? 1, pageSize: query.value.pageSize ?? 30 }
    } finally {
      loading.value = false
    }
  }

  async function setScenario(next: CustomerScenarioName): Promise<void> {
    actor.value = next === 'permission-denied'
      ? { role: 'warehouse', actorId: 'warehouse-demo' }
      : { role: 'super-admin', actorId: 'admin-demo' }
    setCurrentCustomerRole(actor.value.role)
    runtimeController.reset(next)
    await load()
  }

  async function applyQuery(next: CustomerListQuery): Promise<void> {
    query.value = { ...next, page: 1, pageSize: next.pageSize ?? 30 }
    await load()
  }

  async function resetQuery(): Promise<void> {
    query.value = { page: 1, pageSize: 30 }
    await load()
  }

  async function setPage(page: number): Promise<void> {
    query.value = { ...query.value, page: Math.max(1, page) }
    await load()
  }

  async function loadCustomer(id: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await session.run(() => ({
        customer: session.service.getCustomer(actor.value, id),
        logs: session.service.listChangeLogs(actor.value, id),
        categories: session.service.listCategories(actor.value),
        tags: session.service.listTags(actor.value),
      }))
      selectedCustomer.value = response.customer
      changeLogs.value = response.logs
      categories.value = response.categories
      tags.value = response.tags
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '客户详情加载失败'
      selectedCustomer.value = null
      changeLogs.value = []
    } finally {
      loading.value = false
    }
  }

  async function createCustomer(input: CustomerDraft): Promise<Customer> {
    const created = await session.run(() => session.service.createCustomer(actor.value, input))
    selectedCustomer.value = created
    return created
  }

  async function updateCustomer(id: string, input: CustomerDraft): Promise<Customer> {
    const updated = await session.run(() => session.service.updateCustomer(actor.value, id, input))
    selectedCustomer.value = updated
    return updated
  }

  async function changeCustomerStatus(id: string, target: CustomerStatus, reason?: string): Promise<void> {
    await session.run(() => session.service.changeCustomerStatus(actor.value, id, target, reason))
    await loadCustomer(id)
    await load()
  }

  async function loadManagement(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await session.run(() => ({
        categories: session.service.listCategories(actor.value),
        tags: session.service.listTags(actor.value),
        suggestions: session.service.listSuggestions(actor.value),
        customers: session.service.listCustomers(actor.value, { page: 1, pageSize: 100 }),
      }))
      categories.value = response.categories
      tags.value = response.tags
      suggestions.value = response.suggestions
      result.value = response.customers
    } catch (caught) { error.value = caught instanceof Error ? caught.message : '客户管理资料加载失败' }
    finally { loading.value = false }
  }

  async function saveCategory(input: CustomerCategoryDraft, id?: string): Promise<void> {
    await session.run(() => id ? session.service.updateCategory(actor.value, id, input) : session.service.createCategory(actor.value, input))
    await loadManagement()
  }

  async function deleteCategory(id: string): Promise<void> {
    await session.run(() => session.service.deleteCategory(actor.value, id))
    await loadManagement()
  }

  async function saveTag(input: CustomerTagDraft, id?: string): Promise<void> {
    await session.run(() => id ? session.service.updateTag(actor.value, id, input) : session.service.createTag(actor.value, input))
    await loadManagement()
  }

  async function deleteTag(id: string): Promise<void> {
    await session.run(() => session.service.deleteTag(actor.value, id))
    await loadManagement()
  }

  async function analyzeTags(input: ImmediateAnalysisInput): Promise<void> {
    await session.run(() => session.service.analyzeTags(actor.value, input))
    await loadManagement()
  }

  async function resolveSuggestions(ids: string[], decision: 'confirm' | 'reject'): Promise<void> {
    await session.run(() => session.service.resolveSuggestions(actor.value, ids, decision))
    await loadManagement()
  }

  async function loadOperations(): Promise<void> {
    loading.value = true; error.value = null
    try {
      const response = await session.run(() => ({
        opportunities: session.operations.listOpportunities(actor.value).items,
        frequentProducts: session.operations.listFrequentProducts(actor.value).items,
        publicSeaEntries: session.operations.listPublicSea(actor.value).items,
        publicSeaRule: session.operations.getPublicSeaRule(actor.value),
        mapMarkers: session.operations.mapMarkers(actor.value),
        visits: session.operations.listVisits(actor.value).items,
        routes: session.operations.listRoutes(actor.value),
        visitPlans: session.operations.listVisitPlans(actor.value),
        membershipLevels: session.operations.listMembershipLevels(actor.value),
        memberships: session.operations.listMemberships(actor.value),
        pointAccounts: session.operations.listPointAccounts(actor.value).items,
        pointsSettings: session.operations.getPointsSettings(actor.value),
        coupons: session.operations.listCoupons(actor.value),
        promotions: session.operations.listPromotions(actor.value),
        voucherCampaigns: session.operations.listVoucherCampaigns(actor.value),
        voucherIssues: session.operations.listVoucherIssues(actor.value),
        marketingArticles: session.operations.listMarketingArticles(actor.value),
        channelState: session.operations.listChannelState(actor.value),
      }))
      opportunities.value = response.opportunities; frequentProducts.value = response.frequentProducts; publicSeaEntries.value = response.publicSeaEntries; publicSeaRule.value = response.publicSeaRule; mapMarkers.value = response.mapMarkers; visits.value = response.visits; routes.value = response.routes; visitPlans.value = response.visitPlans; membershipLevels.value = response.membershipLevels; memberships.value = response.memberships; pointAccounts.value = response.pointAccounts; pointsSettings.value = response.pointsSettings; coupons.value = response.coupons; promotions.value = response.promotions; voucherCampaigns.value = response.voucherCampaigns; voucherIssues.value = response.voucherIssues; marketingArticles.value = response.marketingArticles; channelState.value = response.channelState
    } catch (caught) { error.value = caught instanceof Error ? caught.message : '客户运营资料加载失败' }
    finally { loading.value = false }
  }
  async function saveOpportunity(input: OpportunityDraft, id?: string): Promise<void> { await session.run(() => id ? session.operations.updateOpportunity(actor.value, id, input) : session.operations.createOpportunity(actor.value, input)); await loadOperations() }
  async function advanceOpportunity(id: string, stage: OpportunityStage, probabilityPercent?: number): Promise<void> { await session.run(() => session.operations.advanceOpportunity(actor.value, id, stage, probabilityPercent)); await loadOperations() }
  async function deleteOpportunity(id: string): Promise<void> { await session.run(() => session.operations.deleteOpportunity(actor.value, id)); await loadOperations() }
  async function addFrequentProduct(input: FrequentProductDraft): Promise<void> { await session.run(() => session.operations.addFrequentProduct(actor.value, input)); await loadOperations() }
  async function removeFrequentProduct(id: string): Promise<void> { await session.run(() => session.operations.removeFrequentProduct(actor.value, id)); await loadOperations() }
  async function quickOrder(customerId: string, skuId: string): Promise<string> { return (await session.run(() => session.operations.quickOrder(actor.value, customerId, skuId))).path }
  async function claimPublicSea(id: string): Promise<void> { await session.run(() => session.operations.claimPublicSea(actor.value, id)); await loadOperations() }
  async function assignPublicSea(id: string, salespersonId: string): Promise<void> { await session.run(() => session.operations.assignPublicSea(actor.value, id, salespersonId)); await loadOperations() }
  async function savePublicSeaRule(input: PublicSeaRuleDraft): Promise<void> { await session.run(() => session.operations.savePublicSeaRule(actor.value, input)); await loadOperations() }
  async function reclaimPublicSea(): Promise<number> { const value = await session.run(() => session.operations.reclaimPublicSea(actor.value)); await loadOperations(); return value }
  async function saveVisit(input: VisitDraft): Promise<void> { await session.run(() => session.operations.createVisit(actor.value, input)); await loadOperations() }
  async function checkInVisit(id: string): Promise<void> { await session.run(() => session.operations.checkInVisit(actor.value, id)); await loadOperations() }
  async function completeVisit(id: string, result: NonNullable<CustomerVisit['result']>): Promise<void> { await session.run(() => session.operations.completeVisit(actor.value, id, result)); await loadOperations() }
  async function saveRoute(input: RouteDraft): Promise<void> { await session.run(() => session.operations.createRoute(actor.value, input)); await loadOperations() }
  async function saveVisitPlan(input: VisitPlanDraft): Promise<void> { await session.run(() => session.operations.createVisitPlan(actor.value, input)); await loadOperations() }
  async function updateVisitPlanStatus(id: string, status: CustomerVisitPlan['status']): Promise<void> { await session.run(() => session.operations.updateVisitPlanStatus(actor.value, id, status)); await loadOperations() }
  async function saveMembershipLevel(input: MembershipLevelDraft, id?: string): Promise<void> { await session.run(() => session.operations.saveMembershipLevel(actor.value, input, id)); await loadOperations() }
  async function deleteMembershipLevel(id: string): Promise<void> { await session.run(() => session.operations.deleteMembershipLevel(actor.value, id)); await loadOperations() }
  async function assignMembership(customerId: string, levelId: string): Promise<void> { await session.run(() => session.operations.assignMembership(actor.value, customerId, levelId)); await loadOperations() }
  async function loadPointLedger(customerId: string): Promise<void> {
    try {
      selectedPointLedger.value = await session.run(() => session.operations.listPointLedger(actor.value, customerId))
    } catch (caught) {
      selectedPointLedger.value = []
      error.value = caught instanceof Error ? caught.message : '积分明细加载失败'
    }
  }
  async function adjustPoints(customerId: string, type: PointAdjustmentType, points: number, reason: string, requestId: string): Promise<void> { await session.run(() => session.operations.adjustPoints(actor.value, customerId, type, points, reason, requestId)); await loadOperations(); await loadPointLedger(customerId) }
  async function savePointsSettings(input: PointsSettingsDraft): Promise<void> { await session.run(() => session.operations.savePointsSettings(actor.value, input)); await loadOperations() }
  async function expirePoints(): Promise<number> { const value = await session.run(() => session.operations.expirePoints(actor.value)); await loadOperations(); return value }
  async function saveCoupon(input: CouponTemplateDraft, id?: string): Promise<void> { await session.run(() => session.operations.saveCoupon(actor.value, input, id)); await loadOperations() }
  async function setCouponStatus(id: string, status: 'paused' | 'ended'): Promise<void> { await session.run(() => status === 'paused' ? session.operations.pauseCoupon(actor.value, id) : session.operations.endCoupon(actor.value, id)); await loadOperations() }
  async function savePromotion(input: PromotionDraft, id?: string): Promise<void> { await session.run(() => session.operations.savePromotion(actor.value, input, id)); await loadOperations() }
  async function setPromotionStatus(id: string, status: 'paused' | 'ended'): Promise<void> { await session.run(() => status === 'paused' ? session.operations.pausePromotion(actor.value, id) : session.operations.endPromotion(actor.value, id)); await loadOperations() }
  async function createVoucherCampaign(input: VoucherCampaignDraft): Promise<void> { await session.run(() => session.operations.createVoucherCampaign(actor.value, input)); await loadOperations() }
  async function issueVoucherCampaign(id: string): Promise<number> { const count = await session.run(() => session.operations.issueVoucherCampaign(actor.value, id)); await loadOperations(); return count }
  async function loadVoucherIssues(campaignId?: string): Promise<void> { voucherIssues.value = await session.run(() => session.operations.listVoucherIssues(actor.value, campaignId)) }
  async function saveMarketingArticle(input: MarketingArticleDraft, id?: string): Promise<void> { await session.run(() => session.operations.saveMarketingArticle(actor.value, input, id)); await loadOperations() }
  async function setMarketingArticleStatus(id: string, status: 'published' | 'unpublished'): Promise<void> { await session.run(() => status === 'published' ? session.operations.publishMarketingArticle(actor.value, id) : session.operations.unpublishMarketingArticle(actor.value, id)); await loadOperations() }
  async function loadMarketingAnalysis(): Promise<void> { try { marketingAnalysis.value = await session.run(() => session.operations.listMarketingAnalysis(actor.value)) } catch (caught) { marketingAnalysis.value = null; error.value = caught instanceof Error ? caught.message : '营销分析加载失败' } }
  async function saveWecomSyncSettings(input: Omit<WecomSyncSettings, 'updatedAt'>): Promise<void> { channelState.value = { ...(channelState.value ?? {}), wecomSyncSettings: await session.run(() => session.operations.saveWecomSyncSettings(actor.value, input)) } }
  async function saveWecomBroadcast(input: Omit<WecomBroadcast, 'id' | 'enterpriseId' | 'createdAt' | 'updatedAt' | 'status'>): Promise<void> { await session.run(() => session.operations.saveWecomBroadcast(actor.value, input)); await loadOperations() }
  async function setWecomBroadcastStatus(id: string, status: 'recalled' | 'completed'): Promise<void> { await session.run(() => session.operations.setWecomBroadcastStatus(actor.value, id, status)); await loadOperations() }
  async function saveMallSettings(input: Omit<MallSettings, 'id' | 'enterpriseId' | 'updatedAt'>): Promise<void> { await session.run(() => session.operations.saveMallSettings(actor.value, input)); await loadOperations() }
  async function saveMallDesign(input: Omit<MallDesign, 'id' | 'enterpriseId' | 'updatedAt'>): Promise<void> { await session.run(() => session.operations.saveMallDesign(actor.value, input)); await loadOperations() }
  async function setMallExtension(id: string, enabled: boolean): Promise<void> { await session.run(() => session.operations.setMallExtension(actor.value, id, enabled)); await loadOperations() }
  async function saveMallCustomer(input: Omit<MallCustomerAccount, 'id' | 'enterpriseId' | 'registeredAt' | 'lastLoginAt' | 'loginCount' | 'orderCount' | 'consumptionAmountCents' | 'updatedAt'> & { password?: string }): Promise<void> { await session.run(() => session.operations.saveMallCustomer(actor.value, input)); await loadOperations() }
  async function saveMallEmployee(input: Omit<MallEmployeeAccount, 'id' | 'enterpriseId' | 'createdAt' | 'lastLoginAt' | 'updatedAt'> & { password?: string }): Promise<void> { await session.run(() => session.operations.saveMallEmployee(actor.value, input)); await loadOperations() }
  async function saveMallAd(input: Omit<MallAd, 'id' | 'enterpriseId' | 'updatedAt'>): Promise<void> { await session.run(() => session.operations.saveMallAd(actor.value, input)); await loadOperations() }
  async function saveMallPopup(input: Omit<MallPopup, 'id' | 'enterpriseId' | 'updatedAt'>): Promise<void> { await session.run(() => session.operations.saveMallPopup(actor.value, input)); await loadOperations() }
  async function saveMallMessage(input: Omit<MallMessage, 'id' | 'enterpriseId' | 'readCount' | 'updatedAt'>): Promise<void> { await session.run(() => session.operations.saveMallMessage(actor.value, input)); await loadOperations() }

  return {
    scenario, actor, query, result, categories, tags, selectedCustomer, changeLogs, suggestions, loading, error, isEmpty, canWrite,
    load, setScenario, applyQuery, resetQuery, setPage, loadCustomer, createCustomer, updateCustomer, changeCustomerStatus,
    loadManagement, saveCategory, deleteCategory, saveTag, deleteTag, analyzeTags, resolveSuggestions,
    opportunities, frequentProducts, publicSeaEntries, publicSeaRule, mapMarkers, visits, routes, visitPlans,
    loadOperations, saveOpportunity, advanceOpportunity, deleteOpportunity, addFrequentProduct, removeFrequentProduct, quickOrder,
    claimPublicSea, assignPublicSea, savePublicSeaRule, reclaimPublicSea, saveVisit, checkInVisit, completeVisit, saveRoute, saveVisitPlan, updateVisitPlanStatus,
    membershipLevels, memberships, pointAccounts, selectedPointLedger, pointsSettings, saveMembershipLevel, deleteMembershipLevel, assignMembership, loadPointLedger, adjustPoints, savePointsSettings, expirePoints,
    coupons, promotions, voucherCampaigns, voucherIssues, marketingArticles, marketingAnalysis, saveCoupon, setCouponStatus, savePromotion, setPromotionStatus, createVoucherCampaign, issueVoucherCampaign, loadVoucherIssues, saveMarketingArticle, setMarketingArticleStatus, loadMarketingAnalysis, channelState, saveWecomSyncSettings, saveWecomBroadcast, setWecomBroadcastStatus, saveMallSettings, saveMallDesign, setMallExtension, saveMallCustomer, saveMallEmployee, saveMallAd, saveMallPopup, saveMallMessage,
  }
})
