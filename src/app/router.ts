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
import InventoryStockListView from '@/features/inventory/views/InventoryStockListView.vue'
import InventoryStockDetailView from '@/features/inventory/views/InventoryStockDetailView.vue'
import InventoryBatchListView from '@/features/inventory/views/InventoryBatchListView.vue'
import InventoryMovementListView from '@/features/inventory/views/InventoryMovementListView.vue'
import WarehouseListView from '@/features/inventory/views/WarehouseListView.vue'
import WarehouseFormView from '@/features/inventory/views/WarehouseFormView.vue'
import LocationListView from '@/features/inventory/views/LocationListView.vue'
import LocationFormView from '@/features/inventory/views/LocationFormView.vue'
import { guardInventorySubroute } from '@/features/inventory/runtime/inventory-access'
import OrderListView from '@/features/orders/views/OrderListView.vue'
import OrderDetailView from '@/features/orders/views/OrderDetailView.vue'
import OrderFormView from '@/features/orders/views/OrderFormView.vue'
import OrderShareView from '@/features/orders/views/OrderShareView.vue'
import OrderOutboundListView from '@/features/orders/views/OrderOutboundListView.vue'
import OrderOutboundDetailView from '@/features/orders/views/OrderOutboundDetailView.vue'
import OrderDifferenceListView from '@/features/orders/views/OrderDifferenceListView.vue'
import OrderDifferenceDetailView from '@/features/orders/views/OrderDifferenceDetailView.vue'
import OrderReturnListView from '@/features/orders/views/OrderReturnListView.vue'
import OrderReturnFormView from '@/features/orders/views/OrderReturnFormView.vue'
import OrderReturnDetailView from '@/features/orders/views/OrderReturnDetailView.vue'
import OrderStatisticsView from '@/features/orders/statistics/OrderStatisticsView.vue'
import { guardOrderSubroute } from '@/features/orders/runtime/order-access'
import FinanceAccountListView from '@/features/finance/views/FinanceAccountListView.vue'
import FinanceAccountSummaryView from '@/features/finance/views/FinanceAccountSummaryView.vue'
import FinanceAccountDetailView from '@/features/finance/views/FinanceAccountDetailView.vue'
import FinanceAccountFormView from '@/features/finance/views/FinanceAccountFormView.vue'
import FinanceCarryoverView from '@/features/finance/views/FinanceCarryoverView.vue'
import FinanceBankListView from '@/features/finance/views/FinanceBankListView.vue'
import FinancePaymentChannelView from '@/features/finance/views/FinancePaymentChannelView.vue'
import FinanceReceivableView from '@/features/finance/views/FinanceReceivableView.vue'
import FinanceReceiptListView from '@/features/finance/views/FinanceReceiptListView.vue'
import FinanceReceiptFormView from '@/features/finance/views/FinanceReceiptFormView.vue'
import FinanceReceiptDetailView from '@/features/finance/views/FinanceReceiptDetailView.vue'
import FinanceWriteoffListView from '@/features/finance/views/FinanceWriteoffListView.vue'
import FinanceWriteoffFormView from '@/features/finance/views/FinanceWriteoffFormView.vue'
import FinanceWriteoffDetailView from '@/features/finance/views/FinanceWriteoffDetailView.vue'
import FinanceRefundListView from '@/features/finance/views/FinanceRefundListView.vue'
import FinanceRefundDetailView from '@/features/finance/views/FinanceRefundDetailView.vue'
import { guardFinanceSubroute } from '@/features/finance/runtime/finance-access'
import SupplierListView from '@/features/procurement/views/SupplierListView.vue'
import SupplierDetailView from '@/features/procurement/views/SupplierDetailView.vue'
import SupplierFormView from '@/features/procurement/views/SupplierFormView.vue'
import SupplierProductView from '@/features/procurement/views/SupplierProductView.vue'
import DirectDeliveryView from '@/features/procurement/views/DirectDeliveryView.vue'
import { guardProcurementSubroute } from '@/features/procurement/runtime/procurement-access'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', name: 'dashboard', component: HarnessOverviewView },
    { path: '/share/orders/:token', name: 'order-share', component: OrderShareView },
    { path: '/orders', name: 'order-list', component: OrderListView },
    { path: '/orders/new', name: 'order-new', component: OrderFormView },
    { path: '/orders/outbounds', name: 'order-outbounds', component: OrderOutboundListView },
    { path: '/orders/outbounds/:outboundId', name: 'order-outbound-detail', component: OrderOutboundDetailView },
    { path: '/orders/differences', name: 'order-differences', component: OrderDifferenceListView },
    { path: '/orders/differences/:differenceId', name: 'order-difference-detail', component: OrderDifferenceDetailView },
    { path: '/orders/returns', name: 'order-returns', component: OrderReturnListView },
    { path: '/orders/returns/new', name: 'order-return-new', component: OrderReturnFormView },
    { path: '/orders/returns/:returnId/edit', name: 'order-return-edit', component: OrderReturnFormView },
    { path: '/orders/returns/:returnId', name: 'order-return-detail', component: OrderReturnDetailView },
    { path: '/orders/statistics', name: 'order-statistics', component: OrderStatisticsView, props: { area: 'order' } },
    { path: '/orders/sales-statistics', name: 'order-sales-statistics', component: OrderStatisticsView, props: { area: 'sales' } },
    { path: '/orders/:orderId/edit', name: 'order-edit', component: OrderFormView },
    { path: '/orders/:orderId', name: 'order-detail', component: OrderDetailView },
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
    { path: '/inventory', redirect: '/inventory/stocks' },
    { path: '/inventory/stocks', name: 'inventory-stocks', component: InventoryStockListView },
    { path: '/inventory/stocks/:warehouseId/:skuId', name: 'inventory-stock-detail', component: InventoryStockDetailView },
    { path: '/inventory/batches', name: 'inventory-batches', component: InventoryBatchListView },
    { path: '/inventory/movements', name: 'inventory-movements', component: InventoryMovementListView },
    { path: '/inventory/batch-movements', name: 'inventory-batch-movements', component: InventoryMovementListView, props: { batchOnly: true } },
    { path: '/inventory/warehouses', name: 'inventory-warehouses', component: WarehouseListView },
    { path: '/inventory/warehouses/new', name: 'inventory-warehouse-new', component: WarehouseFormView },
    { path: '/inventory/warehouses/:warehouseId/edit', name: 'inventory-warehouse-edit', component: WarehouseFormView },
    { path: '/inventory/locations', name: 'inventory-locations', component: LocationListView },
    { path: '/inventory/locations/new', name: 'inventory-location-new', component: LocationFormView },
    { path: '/inventory/locations/:locationId/edit', name: 'inventory-location-edit', component: LocationFormView },
    { path: '/procurement', redirect: '/procurement/suppliers' },
    { path: '/procurement/suppliers', name: 'procurement-suppliers', component: SupplierListView },
    { path: '/procurement/suppliers/new', name: 'procurement-supplier-new', component: SupplierFormView },
    { path: '/procurement/suppliers/:id/edit', name: 'procurement-supplier-edit', component: SupplierFormView },
    { path: '/procurement/suppliers/:id', name: 'procurement-supplier-detail', component: SupplierDetailView },
    { path: '/procurement/supplier-products', name: 'procurement-supplier-products', component: SupplierProductView },
    { path: '/procurement/direct-delivery', name: 'procurement-direct-delivery', component: DirectDeliveryView },
    { path: '/finance', redirect: '/finance/receivables' },
    { path: '/finance/receivables', name: 'finance-receivables', component: FinanceReceivableView, props: { mode: 'customers' } },
    { path: '/finance/receivables/documents', name: 'finance-receivable-documents', component: FinanceReceivableView, props: { mode: 'documents' } },
    { path: '/finance/receivables/products', name: 'finance-receivable-products', component: FinanceReceivableView, props: { mode: 'products' } },
    { path: '/finance/receivables/aging', name: 'finance-receivable-aging', component: FinanceReceivableView, props: { mode: 'aging' } },
    { path: '/finance/receipts', name: 'finance-receipts', component: FinanceReceiptListView },
    { path: '/finance/receipts/new', name: 'finance-receipt-new', component: FinanceReceiptFormView },
    { path: '/finance/receipts/:receiptId', name: 'finance-receipt-detail', component: FinanceReceiptDetailView },
    { path: '/finance/writeoffs', name: 'finance-writeoffs', component: FinanceWriteoffListView },
    { path: '/finance/writeoffs/new', name: 'finance-writeoff-new', component: FinanceWriteoffFormView },
    { path: '/finance/writeoffs/:writeoffId', name: 'finance-writeoff-detail', component: FinanceWriteoffDetailView },
    { path: '/finance/refunds', name: 'finance-refunds', component: FinanceRefundListView },
    { path: '/finance/refunds/:refundId', name: 'finance-refund-detail', component: FinanceRefundDetailView },
    { path: '/finance/accounts', name: 'finance-accounts', component: FinanceAccountListView },
    { path: '/finance/accounts/new', name: 'finance-account-new', component: FinanceAccountFormView },
    { path: '/finance/accounts/:accountId/edit', name: 'finance-account-edit', component: FinanceAccountFormView },
    { path: '/finance/accounts/:accountId', name: 'finance-account-detail', component: FinanceAccountDetailView },
    { path: '/finance/account-summary', name: 'finance-account-summary', component: FinanceAccountSummaryView },
    { path: '/finance/carryovers', name: 'finance-carryovers', component: FinanceCarryoverView },
    { path: '/finance/banks', name: 'finance-banks', component: FinanceBankListView },
    { path: '/finance/payment-channels', name: 'finance-payment-channels', component: FinancePaymentChannelView },
    { path: '/:module(orders|products|procurement|inventory|customers|finance|settings)', name: 'module', component: ModulePlaceholderView },
  ],
})

router.beforeEach((to) => {
  const orderResult = guardOrderSubroute(to.path)
  if (orderResult !== true) return orderResult
  const customerResult = guardCustomerSubroute(to.path)
  if (customerResult !== true) return customerResult
  const productResult = guardProductSubroute(to.path)
  if (productResult !== true) return productResult
  const inventoryResult = guardInventorySubroute(to.path)
  if (inventoryResult !== true) return inventoryResult
  const procurementResult = guardProcurementSubroute(to.path)
  if (procurementResult !== true) return procurementResult
  return guardFinanceSubroute(to.path)
})
