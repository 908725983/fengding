<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

type NavItem = { label: string; path: string }
type NavGroup = { key: string; label: string; path: string; children: NavItem[] }

const route = useRoute()

const groups: Record<string, NavGroup[]> = {
  products: [
    { key: 'catalog', label: '商品管理', path: '/products', children: [{ label: '商品列表', path: '/products' }] },
    { key: 'prices', label: '价格管理 · PRD-002', path: '/products/prices/level-adjustments', children: [
      { label: '等级价格', path: '/products/prices/level-adjustments' }, { label: '采购价格', path: '/products/prices/purchase-adjustments' },
      { label: '客户价格', path: '/products/prices/customer-adjustments' }, { label: '价格历史', path: '/products/prices/history' },
      { label: '单位价格', path: '/products/prices/order-unit-prices' }, { label: '价格策略', path: '/products/prices/strategies' },
    ] },
    { key: 'authorization', label: '商品授权 · PRD-003', path: '/products/authorizations/plans', children: [
      { label: '授权方案', path: '/products/authorizations/plans' }, { label: '授权规则', path: '/products/authorizations/rules' }, { label: '特殊授权', path: '/products/authorizations/specials' },
    ] },
    { key: 'distribution', label: '铺货与模板 · PRD-004', path: '/products/distribution/plans', children: [
      { label: '铺货方案', path: '/products/distribution/plans' }, { label: '订单模板', path: '/products/order-templates' },
      { label: '铺货预览', path: '/products/distribution/preview' }, { label: '铺货统计', path: '/products/distribution/statistics' },
    ] },
    { key: 'references', label: '辅助资料 · PRD-005', path: '/products/references/categories', children: [
      { label: '商品分类', path: '/products/references/categories' }, { label: '品牌', path: '/products/references/brands' },
      { label: '单位', path: '/products/references/units' }, { label: '标签', path: '/products/references/tags' },
    ] },
  ],
  customers: [
    { key: 'customer-data', label: '客户管理', path: '/customers', children: [
      { label: '客户列表', path: '/customers' }, { label: '客户分类', path: '/customers/categories' }, { label: '客户标签', path: '/customers/tags' }, { label: '智能标签', path: '/customers/smart-tags' },
    ] },
    { key: 'customer-operations', label: '客户运营', path: '/customers/opportunities', children: [
      { label: '商机', path: '/customers/opportunities' }, { label: '常购商品', path: '/customers/frequent-products' }, { label: '客户地图', path: '/customers/map' }, { label: '客户公海', path: '/customers/public-sea' }, { label: '公海规则', path: '/customers/public-sea/rules' },
    ] },
    { key: 'fieldwork', label: '外勤管理', path: '/customers/fieldwork/dashboard', children: [
      { label: '外勤概览', path: '/customers/fieldwork/dashboard' }, { label: '拜访记录', path: '/customers/fieldwork/visits' }, { label: '拜访线路', path: '/customers/fieldwork/routes' }, { label: '拜访计划', path: '/customers/fieldwork/plans' },
    ] },
    { key: 'membership', label: '会员与积分', path: '/customers/membership-levels', children: [
      { label: '会员等级', path: '/customers/membership-levels' }, { label: '积分管理', path: '/customers/points' }, { label: '积分设置', path: '/customers/points/settings' },
    ] },
    { key: 'marketing', label: '营销管理', path: '/customers/coupons', children: [
      { label: '优惠券', path: '/customers/coupons' }, { label: '促销活动', path: '/customers/promotions' }, { label: '代金券活动', path: '/customers/voucher-campaigns' }, { label: '获客文章', path: '/customers/articles' }, { label: '营销分析', path: '/customers/marketing-analysis' }, { label: 'AI营销分析', path: '/customers/ai-marketing-analysis' }, { label: '推荐返佣', path: '/customers/referral-commission' },
    ] },
    { key: 'channels', label: '渠道管理', path: '/customers/wecom', children: [{ label: '企微运营', path: '/customers/wecom' }, { label: '商城运营', path: '/customers/mall' }] },
  ],
  finance: [
    { key: 'sales', label: '销售与收款', path: '/finance/receivables', children: [
      { label: '客户应收', path: '/finance/receivables' }, { label: '应收单据', path: '/finance/receivables/documents' }, { label: '应收商品', path: '/finance/receivables/products' }, { label: '账龄分析', path: '/finance/receivables/aging' }, { label: '收款管理', path: '/finance/receipts' }, { label: '收款核销', path: '/finance/writeoffs' }, { label: '客户退款', path: '/finance/refunds' },
    ] },
    { key: 'purchases', label: '采购与付款', path: '/finance/payables', children: [
      { label: '供应商应付', path: '/finance/payables' }, { label: '应付商品', path: '/finance/payables/products' }, { label: '应付账龄', path: '/finance/payables/aging' }, { label: '供应商付款', path: '/finance/supplier-payments' }, { label: '付款核销', path: '/finance/supplier-writeoffs' }, { label: '供应商退款', path: '/finance/supplier-refunds' },
    ] },
    { key: 'accounts', label: '资金账户', path: '/finance/accounts', children: [{ label: '资金账户', path: '/finance/accounts' }, { label: '银行账户', path: '/finance/banks' }, { label: '在线支付', path: '/finance/payment-channels' }] },
    { key: 'flow', label: '资金流水', path: '/finance/transfers', children: [{ label: '账户转账', path: '/finance/transfers' }, { label: '其他收支', path: '/finance/other-transactions' }, { label: '资金结转', path: '/finance/carryovers' }, { label: '收支汇总', path: '/finance/account-summary' }] },
    { key: 'analysis', label: '资金分析', path: '/finance/statistics', children: [{ label: '资金统计', path: '/finance/statistics' }, { label: '机构收款', path: '/finance/institution-receipts' }, { label: '拉新提现', path: '/finance/withdrawals' }] },
  ],
  inventory: [
    { key: 'stocks', label: '库存管理', path: '/inventory/stocks', children: [
      { label: '库存查询', path: '/inventory/stocks' }, { label: '批次库存', path: '/inventory/batches' }, { label: '出入库明细', path: '/inventory/movements' }, { label: '批次出入明细', path: '/inventory/batch-movements' },
    ] },
    { key: 'warehouses', label: '仓库与库位', path: '/inventory/warehouses', children: [{ label: '仓库管理', path: '/inventory/warehouses' }, { label: '库位管理', path: '/inventory/locations' }] },
    { key: 'stocktake', label: '盘点与调整', path: '/inventory/stocktakes', children: [{ label: '库存盘点', path: '/inventory/stocktakes' }, { label: '成本调整', path: '/inventory/cost-adjustments' }, { label: '库存结转', path: '/inventory/closings' }] },
    { key: 'picking', label: '分拣与配送', path: '/inventory/pending-outbound', children: [{ label: '待分拣订单', path: '/inventory/pending-outbound' }, { label: '按订单分拣', path: '/inventory/order-picking' }, { label: '波次分拣', path: '/inventory/wave-picking' }, { label: '配送任务', path: '/inventory/delivery-tasks' }, { label: '配送线路', path: '/inventory/delivery-routes' }, { label: '车辆管理', path: '/inventory/delivery-vehicles' }, { label: '分拣标签', path: '/inventory/picking-labels' }] },
    { key: 'processing', label: '加工管理', path: '/inventory/processing-recipes', children: [{ label: '加工配方', path: '/inventory/processing-recipes' }, { label: '加工计划', path: '/inventory/processing-plans' }, { label: '加工单', path: '/inventory/processing-orders' }, { label: '领料', path: '/inventory/material-picks' }, { label: '退料', path: '/inventory/material-returns' }, { label: '产出记录', path: '/inventory/processing-yields' }] },
    { key: 'other', label: '其他出入库', path: '/inventory/transfers', children: [{ label: '转仓单', path: '/inventory/transfers' }, { label: '其他出库', path: '/inventory/other-outbounds' }, { label: '其他入库', path: '/inventory/other-inbounds' }] },
    { key: 'statistics', label: '库存统计', path: '/inventory/statistics', children: [{ label: '库存统计', path: '/inventory/statistics' }] },
  ],
}

const moduleKey = computed(() => {
  const key = route.path.split('/')[1]
  return key === 'products' || key === 'customers' || key === 'finance' || key === 'inventory' ? key : null
})

const moduleGroups = computed(() => moduleKey.value ? groups[moduleKey.value] : [])
const activeGroup = computed(() => {
  const path = route.path
  if (moduleKey.value === 'products') {
    if (path.startsWith('/products/prices')) return 'prices'
    if (path.startsWith('/products/authorizations')) return 'authorization'
    if (path.startsWith('/products/distribution') || path.startsWith('/products/order-templates')) return 'distribution'
    if (path.startsWith('/products/references')) return 'references'
    return 'catalog'
  }
  if (moduleKey.value === 'customers') {
    if (path.startsWith('/customers/fieldwork')) return 'fieldwork'
    if (path.startsWith('/customers/membership') || path.startsWith('/customers/points')) return 'membership'
    if (path.startsWith('/customers/coupons') || path.startsWith('/customers/promotions') || path.startsWith('/customers/voucher') || path.startsWith('/customers/articles') || path.startsWith('/customers/marketing') || path.startsWith('/customers/ai-marketing') || path.startsWith('/customers/referral')) return 'marketing'
    if (path.startsWith('/customers/wecom') || path.startsWith('/customers/mall')) return 'channels'
    if (path.startsWith('/customers/opportunities') || path.startsWith('/customers/frequent-products') || path.startsWith('/customers/map') || path.startsWith('/customers/public-sea')) return 'customer-operations'
    return 'customer-data'
  }
  if (moduleKey.value === 'inventory') {
    if (path.startsWith('/inventory/warehouses') || path.startsWith('/inventory/locations')) return 'warehouses'
    if (path.startsWith('/inventory/stocktakes') || path.startsWith('/inventory/cost-adjustments') || path.startsWith('/inventory/closings')) return 'stocktake'
    if (path.startsWith('/inventory/pending-outbound') || path.startsWith('/inventory/order-picking') || path.startsWith('/inventory/wave-picking') || path.startsWith('/inventory/delivery-') || path.startsWith('/inventory/picking-labels')) return 'picking'
    if (path.startsWith('/inventory/processing-') || path.startsWith('/inventory/material-')) return 'processing'
    if (path.startsWith('/inventory/transfers') || path.startsWith('/inventory/other-')) return 'other'
    if (path.startsWith('/inventory/statistics')) return 'statistics'
    return 'stocks'
  }
  if (path.startsWith('/finance/payables') || path.startsWith('/finance/supplier-')) return 'purchases'
  if (path.startsWith('/finance/accounts') || path.startsWith('/finance/banks') || path.startsWith('/finance/payment-channels')) return 'accounts'
  if (path.startsWith('/finance/transfers') || path.startsWith('/finance/other-') || path.startsWith('/finance/carryovers') || path.startsWith('/finance/account-summary')) return 'flow'
  if (path.startsWith('/finance/statistics') || path.startsWith('/finance/institution-') || path.startsWith('/finance/withdrawals')) return 'analysis'
  return 'sales'
})
const activeChildren = computed(() => moduleGroups.value.find((group) => group.key === activeGroup.value)?.children ?? [])

function childActive(path: string): boolean { return route.path === path || route.path.startsWith(`${path}/`) }
</script>

<template>
  <nav v-if="moduleGroups.length" class="context-nav" :aria-label="`${moduleKey}模块导航`">
    <div class="context-nav__parents" role="tablist">
      <RouterLink v-for="group in moduleGroups" :key="group.key" :to="group.path" :class="{ active: activeGroup === group.key }">{{ group.label }}</RouterLink>
    </div>
    <div v-if="activeChildren.length" class="context-nav__children" role="tablist">
      <RouterLink v-for="item in activeChildren" :key="item.path" :to="item.path" :class="{ active: childActive(item.path) }">{{ item.label }}</RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.context-nav{margin:0 0 14px;background:#fff;border:1px solid var(--color-border);border-radius:6px;overflow:hidden}.context-nav__parents,.context-nav__children{display:flex;gap:4px;align-items:stretch;overflow-x:auto;padding:0 10px}.context-nav__parents{min-height:44px;border-bottom:1px solid var(--color-border)}.context-nav__children{min-height:38px;background:#fafcfd}.context-nav a{display:flex;align-items:center;flex:0 0 auto;padding:0 14px;color:var(--color-muted);font-size:13px;text-decoration:none;white-space:nowrap;border-bottom:2px solid transparent}.context-nav__parents a{font-weight:600}.context-nav a:hover{color:var(--color-primary-strong);background:var(--color-primary-soft)}.context-nav a.active{color:var(--color-primary-strong);font-weight:700;border-bottom-color:var(--color-primary)}
@media(max-width:700px){.context-nav a{padding:0 11px;font-size:12px}}
</style>
