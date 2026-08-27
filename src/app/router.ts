import { createRouter, createWebHistory } from 'vue-router'
import HarnessOverviewView from '@/features/dashboard/views/HarnessOverviewView.vue'
import ModulePlaceholderView from '@/shared/views/ModulePlaceholderView.vue'
import CustomerListView from '@/features/customers/views/CustomerListView.vue'
import CustomerDetailView from '@/features/customers/views/CustomerDetailView.vue'
import CustomerFormView from '@/features/customers/views/CustomerFormView.vue'
import CustomerCategoryView from '@/features/customers/views/CustomerCategoryView.vue'
import CustomerTagView from '@/features/customers/views/CustomerTagView.vue'
import CustomerSmartTagView from '@/features/customers/views/CustomerSmartTagView.vue'
import CustomerOperationsView from '@/features/customers/views/CustomerOperationsView.vue'
import CustomerMembershipPointsView from '@/features/customers/views/CustomerMembershipPointsView.vue'
import CustomerMarketingView from '@/features/customers/views/CustomerMarketingView.vue'
import CustomerChannelView from '@/features/customers/views/CustomerChannelView.vue'
import { guardCustomerSubroute } from '@/features/customers/runtime/customer-access'
import ProductListView from '@/features/products/views/ProductListView.vue'
import ProductDetailView from '@/features/products/views/ProductDetailView.vue'
import ProductFormView from '@/features/products/views/ProductFormView.vue'
import ProductReferenceView from '@/features/products/views/ProductReferenceView.vue'
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
import InventoryTransferView from '@/features/inventory/views/InventoryTransferView.vue'
import InventoryOtherOutboundView from '@/features/inventory/views/InventoryOtherOutboundView.vue'
import InventoryOtherInboundView from '@/features/inventory/views/InventoryOtherInboundView.vue'
import InventoryStocktakeView from '@/features/inventory/views/InventoryStocktakeView.vue'
import InventoryCostAdjustmentView from '@/features/inventory/views/InventoryCostAdjustmentView.vue'
import InventoryClosingView from '@/features/inventory/views/InventoryClosingView.vue'
import InventoryProcessingRecipeView from '@/features/inventory/views/InventoryProcessingRecipeView.vue'
import InventoryProcessingPlanView from '@/features/inventory/views/InventoryProcessingPlanView.vue'
import InventoryProcessingOrderView from '@/features/inventory/views/InventoryProcessingOrderView.vue'
import InventoryMaterialPickView from '@/features/inventory/views/InventoryMaterialPickView.vue'
import InventoryMaterialReturnView from '@/features/inventory/views/InventoryMaterialReturnView.vue'
import InventoryProcessingYieldView from '@/features/inventory/views/InventoryProcessingYieldView.vue'
import InventoryPendingOutboundView from '@/features/inventory/views/InventoryPendingOutboundView.vue'
import InventoryOrderPickingView from '@/features/inventory/views/InventoryOrderPickingView.vue'
import InventoryWavePickingView from '@/features/inventory/views/InventoryWavePickingView.vue'
import InventoryDeliveryTaskView from '@/features/inventory/views/InventoryDeliveryTaskView.vue'
import InventoryDeliveryRouteView from '@/features/inventory/views/InventoryDeliveryRouteView.vue'
import InventoryDeliveryVehicleView from '@/features/inventory/views/InventoryDeliveryVehicleView.vue'
import InventoryPickingLabelView from '@/features/inventory/views/InventoryPickingLabelView.vue'
import InventoryStatisticsView from '@/features/inventory/views/InventoryStatisticsView.vue'
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
import FinancePayableView from '@/features/finance/views/FinancePayableView.vue'
import FinanceSupplierPaymentView from '@/features/finance/views/FinanceSupplierPaymentView.vue'
import FinanceSupplierWriteoffView from '@/features/finance/views/FinanceSupplierWriteoffView.vue'
import FinanceReceiptListView from '@/features/finance/views/FinanceReceiptListView.vue'
import FinanceReceiptFormView from '@/features/finance/views/FinanceReceiptFormView.vue'
import FinanceReceiptDetailView from '@/features/finance/views/FinanceReceiptDetailView.vue'
import FinanceWriteoffListView from '@/features/finance/views/FinanceWriteoffListView.vue'
import FinanceWriteoffFormView from '@/features/finance/views/FinanceWriteoffFormView.vue'
import FinanceWriteoffDetailView from '@/features/finance/views/FinanceWriteoffDetailView.vue'
import FinanceRefundListView from '@/features/finance/views/FinanceRefundListView.vue'
import FinanceRefundDetailView from '@/features/finance/views/FinanceRefundDetailView.vue'
import FinanceExtensionView from '@/features/finance/views/FinanceExtensionView.vue'
import { guardFinanceSubroute } from '@/features/finance/runtime/finance-access'
import SettingsCompanyView from '@/features/settings/views/SettingsCompanyView.vue'
import SettingsDepartmentView from '@/features/settings/views/SettingsDepartmentView.vue'
import SettingsAnnouncementView from '@/features/settings/views/SettingsAnnouncementView.vue'
import SettingsRegionView from '@/features/settings/views/SettingsRegionView.vue'
import SettingsWarehouseView from '@/features/settings/views/SettingsWarehouseView.vue'
import SettingsRoleView from '@/features/settings/views/SettingsRoleView.vue'
import SettingsEmployeeView from '@/features/settings/views/SettingsEmployeeView.vue'
import SettingsLogView from '@/features/settings/views/SettingsLogView.vue'
import { guardSettingsSubroute } from '@/features/settings/runtime/settings-access'
import SupplierListView from '@/features/procurement/views/SupplierListView.vue'
import SupplierDetailView from '@/features/procurement/views/SupplierDetailView.vue'
import SupplierFormView from '@/features/procurement/views/SupplierFormView.vue'
import SupplierProductView from '@/features/procurement/views/SupplierProductView.vue'
import DirectDeliveryView from '@/features/procurement/views/DirectDeliveryView.vue'
import PurchaseStatisticsView from '@/features/procurement/views/PurchaseStatisticsView.vue'
import { guardProcurementSubroute } from '@/features/procurement/runtime/procurement-access'
import ReplenishmentView from '@/features/procurement/views/ReplenishmentView.vue'
import QuickPurchaseView from '@/features/procurement/views/QuickPurchaseView.vue'
import PurchaseOrderView from '@/features/procurement/views/PurchaseOrderView.vue'
import PurchaseReturnView from '@/features/procurement/views/PurchaseReturnView.vue'

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
    { path: '/customers/opportunities', name: 'customer-opportunities', component: CustomerOperationsView, props: { mode: 'opportunities' } },
    { path: '/customers/frequent-products', name: 'customer-frequent-products', component: CustomerOperationsView, props: { mode: 'frequent-products' } },
    { path: '/customers/map', name: 'customer-map', component: CustomerOperationsView, props: { mode: 'map' } },
    { path: '/customers/public-sea', name: 'customer-public-sea', component: CustomerOperationsView, props: { mode: 'public-sea' } },
    { path: '/customers/public-sea/rules', name: 'customer-public-sea-rules', component: CustomerOperationsView, props: { mode: 'public-sea-rules' } },
    { path: '/customers/fieldwork/dashboard', name: 'customer-fieldwork-dashboard', component: CustomerOperationsView, props: { mode: 'fieldwork-dashboard' } },
    { path: '/customers/fieldwork/visits', name: 'customer-fieldwork-visits', component: CustomerOperationsView, props: { mode: 'visits' } },
    { path: '/customers/fieldwork/routes', name: 'customer-fieldwork-routes', component: CustomerOperationsView, props: { mode: 'routes' } },
    { path: '/customers/fieldwork/plans', name: 'customer-fieldwork-plans', component: CustomerOperationsView, props: { mode: 'plans' } },
    { path: '/customers/membership-levels', name: 'customer-membership-levels', component: CustomerMembershipPointsView, props: { mode: 'membership-levels' } },
    { path: '/customers/points', name: 'customer-points', component: CustomerMembershipPointsView, props: { mode: 'points' } },
    { path: '/customers/points/settings', name: 'customer-points-settings', component: CustomerMembershipPointsView, props: { mode: 'points-settings' } },
    { path: '/customers/coupons', name: 'customer-coupons', component: CustomerMarketingView, props: { mode: 'coupons' } },
    { path: '/customers/promotions', name: 'customer-promotions', component: CustomerMarketingView, props: { mode: 'promotions' } },
    { path: '/customers/voucher-campaigns', name: 'customer-voucher-campaigns', component: CustomerMarketingView, props: { mode: 'voucher-campaigns' } },
    { path: '/customers/articles', name: 'customer-articles', component: CustomerMarketingView, props: { mode: 'articles' } },
    { path: '/customers/marketing-analysis', name: 'customer-marketing-analysis', component: CustomerMarketingView, props: { mode: 'marketing-analysis' } },
    { path: '/customers/ai-marketing-analysis', name: 'customer-ai-marketing-analysis', component: CustomerMarketingView, props: { mode: 'ai-analysis' } },
    { path: '/customers/referral-commission', name: 'customer-referral-commission', component: CustomerMarketingView, props: { mode: 'referral-commission' } },
    { path: '/customers/wecom', name: 'customer-wecom', component: CustomerChannelView, props: { mode: 'wecom' } },
    { path: '/customers/mall', name: 'customer-mall', component: CustomerChannelView, props: { mode: 'mall' } },
    { path: '/customers/:customerId/edit', name: 'customer-edit', component: CustomerFormView },
    { path: '/customers/:customerId', name: 'customer-detail', component: CustomerDetailView },
    { path: '/products', name: 'product-list', component: ProductListView },
    { path: '/products/new', name: 'product-new', component: ProductFormView },
    { path: '/products/references/categories', name: 'product-reference-categories', component: ProductReferenceView, props: { kind: 'categories' } },
    { path: '/products/references/brands', name: 'product-reference-brands', component: ProductReferenceView, props: { kind: 'brands' } },
    { path: '/products/references/units', name: 'product-reference-units', component: ProductReferenceView, props: { kind: 'units' } },
    { path: '/products/references/tags', name: 'product-reference-tags', component: ProductReferenceView, props: { kind: 'tags' } },
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
    { path: '/inventory/transfers', name: 'inventory-transfers', component: InventoryTransferView },
    { path: '/inventory/other-outbounds', name: 'inventory-other-outbounds', component: InventoryOtherOutboundView },
    { path: '/inventory/other-inbounds', name: 'inventory-other-inbounds', component: InventoryOtherInboundView },
    { path: '/inventory/stocktakes', name: 'inventory-stocktakes', component: InventoryStocktakeView },
    { path: '/inventory/cost-adjustments', name: 'inventory-cost-adjustments', component: InventoryCostAdjustmentView },
    { path: '/inventory/closings', name: 'inventory-closings', component: InventoryClosingView },
    { path: '/inventory/processing-recipes', name: 'inventory-processing-recipes', component: InventoryProcessingRecipeView },
    { path: '/inventory/processing-plans', name: 'inventory-processing-plans', component: InventoryProcessingPlanView },
    { path: '/inventory/processing-orders', name: 'inventory-processing-orders', component: InventoryProcessingOrderView },
    { path: '/inventory/material-picks', name: 'inventory-material-picks', component: InventoryMaterialPickView },
    { path: '/inventory/material-returns', name: 'inventory-material-returns', component: InventoryMaterialReturnView },
    { path: '/inventory/processing-yields', name: 'inventory-processing-yields', component: InventoryProcessingYieldView },
    { path: '/inventory/pending-outbound', name: 'inventory-pending-outbound', component: InventoryPendingOutboundView },
    { path: '/inventory/order-picking', name: 'inventory-order-picking', component: InventoryOrderPickingView },
    { path: '/inventory/wave-picking', name: 'inventory-wave-picking', component: InventoryWavePickingView },
    { path: '/inventory/delivery-tasks', name: 'inventory-delivery-tasks', component: InventoryDeliveryTaskView },
    { path: '/inventory/delivery-routes', name: 'inventory-delivery-routes', component: InventoryDeliveryRouteView },
    { path: '/inventory/delivery-vehicles', name: 'inventory-delivery-vehicles', component: InventoryDeliveryVehicleView },
    { path: '/inventory/picking-labels', name: 'inventory-picking-labels', component: InventoryPickingLabelView },
    { path: '/inventory/statistics', name: 'inventory-statistics', component: InventoryStatisticsView },
    { path: '/procurement', redirect: '/procurement/suppliers' },
    { path: '/procurement/replenishment', name: 'procurement-replenishment', component: ReplenishmentView },
    { path: '/procurement/purchase-orders', name: 'procurement-purchase-orders', component: PurchaseOrderView },
    { path: '/procurement/purchase-returns', name: 'procurement-purchase-returns', component: PurchaseReturnView },
    { path: '/procurement/purchase-returns/new', name: 'procurement-purchase-return-new', component: PurchaseReturnView },
    { path: '/procurement/purchase-returns/:returnId', name: 'procurement-purchase-return-detail', component: PurchaseReturnView },
    { path: '/procurement/statistics', name: 'procurement-statistics', component: PurchaseStatisticsView },
    { path: '/procurement/quick-purchase/stock', name: 'procurement-quick-stock', component: QuickPurchaseView, props: { kind: 'stock' } },
    { path: '/procurement/quick-purchase/order', name: 'procurement-quick-order', component: QuickPurchaseView, props: { kind: 'order' } },
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
    { path: '/finance/payables', name: 'finance-payables', component: FinancePayableView, props: { mode: 'documents' } },
    { path: '/finance/payables/products', name: 'finance-payable-products', component: FinancePayableView, props: { mode: 'products' } },
    { path: '/finance/payables/aging', name: 'finance-payable-aging', component: FinancePayableView, props: { mode: 'aging' } },
    { path: '/finance/supplier-payments', name: 'finance-supplier-payments', component: FinanceSupplierPaymentView },
    { path: '/finance/supplier-writeoffs', name: 'finance-supplier-writeoffs', component: FinanceSupplierWriteoffView },
    { path: '/finance/receipts', name: 'finance-receipts', component: FinanceReceiptListView },
    { path: '/finance/receipts/new', name: 'finance-receipt-new', component: FinanceReceiptFormView },
    { path: '/finance/receipts/:receiptId', name: 'finance-receipt-detail', component: FinanceReceiptDetailView },
    { path: '/finance/writeoffs', name: 'finance-writeoffs', component: FinanceWriteoffListView },
    { path: '/finance/writeoffs/new', name: 'finance-writeoff-new', component: FinanceWriteoffFormView },
    { path: '/finance/writeoffs/:writeoffId', name: 'finance-writeoff-detail', component: FinanceWriteoffDetailView },
    { path: '/finance/refunds', name: 'finance-refunds', component: FinanceRefundListView },
    { path: '/finance/refunds/:refundId', name: 'finance-refund-detail', component: FinanceRefundDetailView },
    { path: '/finance/supplier-refunds', name: 'finance-supplier-refunds', component: FinanceExtensionView, props: { mode: 'supplier-refunds' } },
    { path: '/finance/transfers', name: 'finance-transfers', component: FinanceExtensionView, props: { mode: 'transfers' } },
    { path: '/finance/other-transactions', name: 'finance-other-transactions', component: FinanceExtensionView, props: { mode: 'other' } },
    { path: '/finance/institution-receipts', name: 'finance-institution-receipts', component: FinanceExtensionView, props: { mode: 'institutions' } },
    { path: '/finance/statistics', name: 'finance-statistics', component: FinanceExtensionView, props: { mode: 'statistics' } },
    { path: '/finance/withdrawals', name: 'finance-withdrawals', component: FinanceExtensionView, props: { mode: 'withdrawals' } },
    { path: '/finance/accounts', name: 'finance-accounts', component: FinanceAccountListView },
    { path: '/finance/accounts/new', name: 'finance-account-new', component: FinanceAccountFormView },
    { path: '/finance/accounts/:accountId/edit', name: 'finance-account-edit', component: FinanceAccountFormView },
    { path: '/finance/accounts/:accountId', name: 'finance-account-detail', component: FinanceAccountDetailView },
    { path: '/finance/account-summary', name: 'finance-account-summary', component: FinanceAccountSummaryView },
    { path: '/finance/carryovers', name: 'finance-carryovers', component: FinanceCarryoverView },
    { path: '/finance/banks', name: 'finance-banks', component: FinanceBankListView },
    { path: '/finance/payment-channels', name: 'finance-payment-channels', component: FinancePaymentChannelView },
    { path: '/settings', redirect: '/settings/company' },
    { path: '/settings/company', name: 'settings-company', component: SettingsCompanyView },
    { path: '/settings/departments', name: 'settings-departments', component: SettingsDepartmentView },
    { path: '/settings/announcements', name: 'settings-announcements', component: SettingsAnnouncementView },
    { path: '/settings/regions', name: 'settings-regions', component: SettingsRegionView },
    { path: '/settings/warehouses', name: 'settings-warehouses', component: SettingsWarehouseView },
    { path: '/settings/roles', name: 'settings-roles', component: SettingsRoleView },
    { path: '/settings/employees', name: 'settings-employees', component: SettingsEmployeeView },
    { path: '/settings/logs', name: 'settings-logs', component: SettingsLogView },
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
  const financeResult = guardFinanceSubroute(to.path)
  if (financeResult !== true) return financeResult
  return guardSettingsSubroute(to.path)
})
