import { createRouter, createWebHistory } from 'vue-router'
import HarnessOverviewView from '@/features/dashboard/views/HarnessOverviewView.vue'
import ModulePlaceholderView from '@/shared/views/ModulePlaceholderView.vue'
import CustomerListView from '@/features/customers/views/CustomerListView.vue'
import CustomerDetailView from '@/features/customers/views/CustomerDetailView.vue'
import CustomerFormView from '@/features/customers/views/CustomerFormView.vue'
import CustomerCategoryView from '@/features/customers/views/CustomerCategoryView.vue'
import CustomerTagView from '@/features/customers/views/CustomerTagView.vue'
import CustomerSmartTagView from '@/features/customers/views/CustomerSmartTagView.vue'
import { guardCustomerSubroute } from '@/features/customers/runtime/customer-access'
import ProductListView from '@/features/products/views/ProductListView.vue'
import ProductDetailView from '@/features/products/views/ProductDetailView.vue'
import ProductFormView from '@/features/products/views/ProductFormView.vue'
import { guardProductSubroute } from '@/features/products/runtime/product-access'
import PriceAdjustmentListView from '@/features/products/pricing/views/PriceAdjustmentListView.vue'
import PriceHistoryView from '@/features/products/pricing/views/PriceHistoryView.vue'
import PriceAdjustmentFormView from '@/features/products/pricing/views/PriceAdjustmentFormView.vue'
import PriceAdjustmentDetailView from '@/features/products/pricing/views/PriceAdjustmentDetailView.vue'
import UnitPriceView from '@/features/products/pricing/views/UnitPriceView.vue'
import PriceStrategyView from '@/features/products/pricing/views/PriceStrategyView.vue'
import AuthorizationPlanListView from '@/features/products/authorization/views/AuthorizationPlanListView.vue'
import AuthorizationPlanFormView from '@/features/products/authorization/views/AuthorizationPlanFormView.vue'
import AuthorizationRuleListView from '@/features/products/authorization/views/AuthorizationRuleListView.vue'
import AuthorizationRuleFormView from '@/features/products/authorization/views/AuthorizationRuleFormView.vue'
import SpecialAuthorizationView from '@/features/products/authorization/views/SpecialAuthorizationView.vue'
import DistributionPlanListView from '@/features/products/distribution/views/DistributionPlanListView.vue'
import DistributionPlanFormView from '@/features/products/distribution/views/DistributionPlanFormView.vue'
import OrderTemplateListView from '@/features/products/distribution/views/OrderTemplateListView.vue'
import OrderTemplateFormView from '@/features/products/distribution/views/OrderTemplateFormView.vue'
import DistributionPreviewView from '@/features/products/distribution/views/DistributionPreviewView.vue'
import DistributionStatisticsView from '@/features/products/distribution/views/DistributionStatisticsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', name: 'dashboard', component: HarnessOverviewView },
    { path: '/customers', name: 'customer-list', component: CustomerListView },
    { path: '/customers/new', name: 'customer-new', component: CustomerFormView },
    { path: '/customers/categories', name: 'customer-categories', component: CustomerCategoryView },
    { path: '/customers/tags', name: 'customer-tags', component: CustomerTagView },
    { path: '/customers/smart-tags', name: 'customer-smart-tags', component: CustomerSmartTagView },
    { path: '/customers/:customerId/edit', name: 'customer-edit', component: CustomerFormView },
    { path: '/customers/:customerId', name: 'customer-detail', component: CustomerDetailView },
    { path: '/products', name: 'product-list', component: ProductListView },
    { path: '/products/new', name: 'product-new', component: ProductFormView },
    { path: '/products/prices/level-adjustments', name: 'price-level-adjustments', component: PriceAdjustmentListView, props: { type: 'level' } },
    { path: '/products/prices/level-adjustments/new', name: 'price-level-new', component: PriceAdjustmentFormView, props: { type: 'level' } },
    { path: '/products/prices/level-adjustments/:adjustmentId/edit', name: 'price-level-edit', component: PriceAdjustmentFormView, props: { type: 'level' } },
    { path: '/products/prices/level-adjustments/:adjustmentId', name: 'price-level-detail', component: PriceAdjustmentDetailView, props: { type: 'level' } },
    { path: '/products/prices/purchase-adjustments', name: 'price-purchase-adjustments', component: PriceAdjustmentListView, props: { type: 'purchase' } },
    { path: '/products/prices/purchase-adjustments/new', name: 'price-purchase-new', component: PriceAdjustmentFormView, props: { type: 'purchase' } },
    { path: '/products/prices/purchase-adjustments/:adjustmentId/edit', name: 'price-purchase-edit', component: PriceAdjustmentFormView, props: { type: 'purchase' } },
    { path: '/products/prices/purchase-adjustments/:adjustmentId', name: 'price-purchase-detail', component: PriceAdjustmentDetailView, props: { type: 'purchase' } },
    { path: '/products/prices/customer-adjustments', name: 'price-customer-adjustments', component: PriceAdjustmentListView, props: { type: 'customer' } },
    { path: '/products/prices/customer-adjustments/new', name: 'price-customer-new', component: PriceAdjustmentFormView, props: { type: 'customer' } },
    { path: '/products/prices/customer-adjustments/:adjustmentId/edit', name: 'price-customer-edit', component: PriceAdjustmentFormView, props: { type: 'customer' } },
    { path: '/products/prices/customer-adjustments/:adjustmentId', name: 'price-customer-detail', component: PriceAdjustmentDetailView, props: { type: 'customer' } },
    { path: '/products/prices/history', name: 'price-history', component: PriceHistoryView },
    { path: '/products/prices/order-unit-prices', name: 'price-unit-prices', component: UnitPriceView },
    { path: '/products/prices/strategies', name: 'price-strategies', component: PriceStrategyView },
    { path: '/products/authorizations/plans', name: 'authorization-plans', component: AuthorizationPlanListView },
    { path: '/products/authorizations/plans/new', name: 'authorization-plan-new', component: AuthorizationPlanFormView },
    { path: '/products/authorizations/plans/:planId/edit', name: 'authorization-plan-edit', component: AuthorizationPlanFormView },
    { path: '/products/authorizations/rules', name: 'authorization-rules', component: AuthorizationRuleListView },
    { path: '/products/authorizations/rules/new', name: 'authorization-rule-new', component: AuthorizationRuleFormView },
    { path: '/products/authorizations/rules/:ruleId/edit', name: 'authorization-rule-edit', component: AuthorizationRuleFormView },
    { path: '/products/authorizations/specials', name: 'authorization-specials', component: SpecialAuthorizationView },
    { path: '/products/distribution/plans', name: 'distribution-plans', component: DistributionPlanListView },
    { path: '/products/distribution/plans/new', name: 'distribution-plan-new', component: DistributionPlanFormView },
    { path: '/products/distribution/plans/:planId/edit', name: 'distribution-plan-edit', component: DistributionPlanFormView },
    { path: '/products/order-templates', name: 'order-templates', component: OrderTemplateListView },
    { path: '/products/order-templates/new', name: 'order-template-new', component: OrderTemplateFormView },
    { path: '/products/order-templates/:templateId/edit', name: 'order-template-edit', component: OrderTemplateFormView },
    { path: '/products/distribution/preview', name: 'distribution-preview', component: DistributionPreviewView },
    { path: '/products/distribution/statistics', name: 'distribution-statistics', component: DistributionStatisticsView },
    { path: '/products/:productId/edit', name: 'product-edit', component: ProductFormView },
    { path: '/products/:productId', name: 'product-detail', component: ProductDetailView },
    { path: '/:module(orders|products|procurement|inventory|customers|finance|settings)', name: 'module', component: ModulePlaceholderView },
  ],
})

router.beforeEach((to) => {
  const customerResult = guardCustomerSubroute(to.path)
  if (customerResult !== true) return customerResult
  return guardProductSubroute(to.path)
})
