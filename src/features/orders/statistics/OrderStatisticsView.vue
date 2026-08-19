<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import OrderScenarioBar from '../components/OrderScenarioBar.vue'
import OrderFulfillmentSubnav from '../components/OrderFulfillmentSubnav.vue'
import { useOrderStatisticsStore } from './store'
import type { OrderRole } from '../types'
import type { OrderStatisticsQuery, OrderStatisticsReportKey, StatisticsDimension, StatisticsMeasure, StatisticsPivotConfig } from './types'
import type { OrderScenarioName } from '../../../../mock/handlers/order-handler'
import '../views/order-views.css'
import './statistics.css'

const props = defineProps<{ area: 'order' | 'sales' }>()
const route = useRoute(); const router = useRouter(); const store = useOrderStatisticsStore()
const { page, options, loading, exporting, error, scenario, actor, access, isEmpty } = storeToRefs(store)
const pivotOpen = ref(false); const pivotDraft = ref<StatisticsPivotConfig | null>(null); const notice = ref('')

const orderTabs: Array<{ key: OrderStatisticsReportKey; label: string }> = [
  { key: 'order-line-detail', label: '订单商品明细' }, { key: 'return-line-detail', label: '退单商品明细' },
  { key: 'order-by-product', label: '商品汇总' }, { key: 'order-by-customer', label: '客户汇总' },
  { key: 'presale-line-detail', label: '预售商品明细' }, { key: 'presale-by-product', label: '预售商品汇总' },
]
const salesTabs: Array<{ key: OrderStatisticsReportKey; label: string }> = [
  { key: 'movement-line-detail', label: '订单出入库明细' }, { key: 'movement-by-product', label: '按商品汇总' }, { key: 'movement-by-customer', label: '按客户汇总' },
]
const tabs = computed(() => props.area === 'order' ? orderTabs : salesTabs)
const defaultReport = computed<OrderStatisticsReportKey>(() => props.area === 'order' ? 'order-line-detail' : 'movement-line-detail')
const filters = reactive({ fromDate: '2026-05-10', toDate: '2026-08-10', customerId: '', skuId: '', keyword: '', documentKind: 'order' as 'order' | 'return', unitMode: 'base' as 'base' | 'ordered', page: 1, pageSize: 30 as 10 | 30 | 50 | 100 })
const currentReport = computed(() => tabs.value.some((item) => item.key === route.query.report) ? route.query.report as OrderStatisticsReportKey : defaultReport.value)
const isSummary = computed(() => ['order-by-product', 'order-by-customer', 'movement-by-product', 'movement-by-customer'].includes(currentReport.value))
const configurable = computed(() => ['order-by-product', 'order-by-customer'].includes(currentReport.value))
const pivot = computed(() => configurable.value ? store.pivot(currentReport.value as StatisticsPivotConfig['report']) : null)
const showCustomer = computed(() => !isSummary.value || currentReport.value.includes('customer') || (pivot.value?.dimensions.includes('customer') ?? false))
const showProduct = computed(() => !isSummary.value || (pivot.value?.dimensions.some((item) => ['product', 'sku'].includes(item)) ?? true))
const showUnit = computed(() => !isSummary.value || (pivot.value?.dimensions.includes('unit') ?? true))
const showMeasure = (value: StatisticsMeasure) => !configurable.value || (pivot.value?.measures.includes(value) ?? true)
const money = (value: number | null, state = 'available') => state !== 'available' || value === null ? '暂不可用' : `¥${(value / 100).toFixed(2)}`
const quantity = (value: number | null) => value === null ? '—' : (value / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 3 })
const rate = (value: number | null) => value === null ? '—' : `${(value / 100).toFixed(2)}%`
const dateTime = (value: string) => value.slice(0, 16).replace('T', ' ')
const movementText = { 'sales-outbound': '销售出库', 'customer-return-inbound': '退货入库' } as const
const documentText: Record<string, string> = { 'customer-order': '客户订单', 'customer-return': '客户退单', 'sales-outbound': '销售出库', 'return-inbound': '退货入库', summary: '汇总' }

function hydrateFromRoute() {
  filters.fromDate = String(route.query.fromDate ?? '2026-05-10'); filters.toDate = String(route.query.toDate ?? '2026-08-10')
  filters.customerId = String(route.query.customerId ?? ''); filters.skuId = String(route.query.skuId ?? ''); filters.keyword = String(route.query.keyword ?? '')
  filters.documentKind = route.query.documentKind === 'return' ? 'return' : 'order'; filters.unitMode = route.query.unitMode === 'ordered' ? 'ordered' : 'base'
  filters.page = Math.max(1, Number(route.query.page ?? 1) || 1); const size = Number(route.query.pageSize ?? 30); filters.pageSize = [10, 30, 50, 100].includes(size) ? size as 10 | 30 | 50 | 100 : 30
}
function queryValue(report = currentReport.value): OrderStatisticsQuery { return { report, fromDate: filters.fromDate, toDate: filters.toDate, customerId: filters.customerId || undefined, skuId: filters.skuId || undefined, keyword: filters.keyword || undefined, documentKind: filters.documentKind, unitMode: filters.unitMode, page: filters.page, pageSize: filters.pageSize } }
function routeQuery(report = currentReport.value) { const value = queryValue(report); return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== '')) }
async function applyRoute(report = currentReport.value, replace = true) { await (replace ? router.replace({ query: routeQuery(report) }) : router.push({ path: props.area === 'order' ? '/orders/statistics' : '/orders/sales-statistics', query: routeQuery(report) })) }
async function search() { filters.page = 1; await applyRoute() }
async function clearFilters() { filters.fromDate = '2026-05-10'; filters.toDate = '2026-08-10'; filters.customerId = ''; filters.skuId = ''; filters.keyword = ''; filters.documentKind = 'order'; filters.unitMode = 'base'; filters.page = 1; filters.pageSize = 30; await applyRoute() }
async function switchReport(report: OrderStatisticsReportKey) { filters.page = 1; await applyRoute(report, false) }
async function setPage(value: number) { filters.page = Math.max(1, value); await applyRoute() }
async function onScenario(value: OrderScenarioName) { await store.setScenario(value, queryValue()) }
async function onRole(value: OrderRole) { if (value === 'warehouse' && props.area === 'order') { await store.setRole(value, { ...queryValue('movement-line-detail'), page: 1 }); await router.replace({ path: '/orders/sales-statistics', query: routeQuery('movement-line-detail') }); return } await store.setRole(value, queryValue()) }

function openPivot() { if (!configurable.value) return; pivotDraft.value = structuredClone(store.pivot(currentReport.value as StatisticsPivotConfig['report'])); pivotOpen.value = true }
function toggleDimension(value: StatisticsDimension) { if (!pivotDraft.value) return; const values = pivotDraft.value.dimensions; pivotDraft.value.dimensions = values.includes(value) ? values.filter((item) => item !== value) : [...values, value] }
function toggleMeasure(value: StatisticsMeasure) { if (!pivotDraft.value) return; const values = pivotDraft.value.measures; pivotDraft.value.measures = values.includes(value) ? values.filter((item) => item !== value) : [...values, value] }
function savePivot() { if (!pivotDraft.value) return; try { store.savePivot(pivotDraft.value); pivotOpen.value = false; notice.value = '二维表设置已保存到当前模拟用户'; setTimeout(() => { notice.value = '' }, 2400) } catch (caught) { notice.value = caught instanceof Error ? caught.message : '二维表设置无效' } }
function resetPivot() { if (!configurable.value) return; pivotDraft.value = store.resetPivot(currentReport.value as StatisticsPivotConfig['report']); notice.value = '已恢复默认二维表' }
async function download() { const csv = await store.exportCsv(queryValue()); if (!csv) return; const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${currentReport.value}-${filters.fromDate}-${filters.toDate}.csv`; anchor.click(); URL.revokeObjectURL(url); notice.value = 'CSV 已按当前筛选导出（原型模拟）' }

watch(() => route.fullPath, async () => { hydrateFromRoute(); await store.load(queryValue()) }, { immediate: true })
</script>

<template>
  <section class="order-page statistics-page">
    <header class="order-header"><div><h1>{{ area === 'order' ? '订单统计' : '销售统计' }}</h1><p>{{ area === 'order' ? '按下单与退单事实核对商品、客户、优惠和履约。' : '按当前有效库存移动核对销售出库（正）与退货入库（负）。' }}</p></div><OrderScenarioBar :scenario="scenario" :role="actor.role" @scenario="onScenario" @role="onRole" /></header>
    <OrderFulfillmentSubnav />
    <nav class="statistics-tabs" :aria-label="`${area === 'order' ? '订单' : '销售'}统计报表`"><button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: currentReport === tab.key }" @click="switchReport(tab.key)">{{ tab.label }}</button></nav>

    <div class="order-panel"><form class="order-filter statistics-filter" @submit.prevent="search"><label>开始日期<input v-model="filters.fromDate" type="date" /></label><label>结束日期<input v-model="filters.toDate" type="date" /></label><label>客户<select v-model="filters.customerId"><option value="">全部客户</option><option v-for="item in options.customers" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label><label>商品<select v-model="filters.skuId"><option value="">全部商品</option><option v-for="item in options.products" :key="item.skuId" :value="item.skuId">{{ item.skuCode }} · {{ item.name }}</option></select></label><label class="keyword">商品/单号关键字<input v-model.trim="filters.keyword" maxlength="100" placeholder="单号、客户、商品编码或名称" /></label><template v-if="configurable"><label>单据范围<select v-model="filters.documentKind"><option value="order">订单</option><option value="return">退单</option></select></label><label>单位维度<select v-model="filters.unitMode"><option value="base">按商品（基本单位）</option><option value="ordered">按下单单位</option></select></label></template><button class="order-button primary" type="submit">查询</button><button class="order-button" type="button" @click="clearFilters">清空筛选</button></form></div>

    <div class="statistics-toolbar"><div><strong>快照 {{ page.snapshotVersion }}</strong><span>刷新会整批重读明细和合计</span></div><div><button class="order-button" type="button" :disabled="loading" @click="store.load(queryValue())">刷新</button><button v-if="configurable" class="order-button" type="button" @click="openPivot">二维表设置</button><button v-if="access.canExport" class="order-button" type="button" :disabled="exporting || page.availability === 'unavailable'" @click="download">{{ exporting ? '导出中…' : '导出 CSV' }}</button></div></div>
    <p v-if="notice" class="statistics-notice" role="status">{{ notice }}</p>
    <div v-if="error" class="order-state error"><strong>统计加载失败</strong><span>{{ error }}</span><button class="order-button" type="button" @click="store.load(queryValue())">重试</button></div>
    <div v-else-if="loading" class="order-state"><strong>正在读取同一版本的明细与合计…</strong><span>慢响应期间不会用旧结果覆盖新筛选</span></div>
    <div v-else-if="page.availability === 'unavailable'" class="order-state statistics-unavailable"><strong>该报表暂不可用</strong><span>{{ page.message }}</span><small>这不是“暂无数据”，也不会显示虚构的 0。</small></div>
    <div v-else>
      <div class="statistics-totals" aria-label="筛选结果汇总"><span>单据笔数 <strong>{{ page.totals.documentCount }}</strong></span><span>基本单位数量 <strong>{{ quantity(page.totals.baseQuantityMilli) }}</strong></span><span>金额合计 <strong>{{ money(page.totals.amountCents, page.totals.amountState) }}</strong></span></div>
      <div v-if="isEmpty" class="order-state"><strong>暂无匹配数据</strong><span>当前筛选下没有真实业务记录，请调整筛选条件。</span></div>
      <div v-else class="order-table-wrap statistics-table-wrap"><table class="order-table statistics-table"><thead><tr><th v-if="!isSummary">业务时间</th><th v-if="!isSummary">单据</th><th v-if="!isSummary">类型/状态</th><th v-if="showCustomer">客户</th><th v-if="showProduct">商品</th><th v-if="!isSummary && area === 'order'">条码</th><th v-if="showUnit">规格/单位</th><th v-if="showMeasure('quantity')">数量</th><th v-if="!isSummary && area === 'order'">{{ currentReport === 'return-line-detail' ? '待入库' : '待出库' }}</th><th v-if="showMeasure('document-count') && isSummary">单据数</th><th v-if="showMeasure('average-price')" class="order-money">平均单价</th><th v-if="showMeasure('amount')" class="order-money">金额</th><th v-if="showMeasure('fulfillment-rate') && area === 'order'">出库/入库率</th><th v-if="showMeasure('discount-rate') && area === 'order'">折扣率</th><th v-if="!isSummary && area === 'sales'">套餐名称</th></tr></thead><tbody><tr v-for="row in page.items" :key="row.id"><td v-if="!isSummary">{{ dateTime(row.occurredAt) }}</td><td v-if="!isSummary"><RouterLink v-if="row.sourcePath" :to="row.sourcePath"><strong>{{ row.documentNo }}</strong></RouterLink><span v-else>{{ row.documentNo ?? '—' }}</span></td><td v-if="!isSummary"><span class="order-status">{{ row.movementType ? movementText[row.movementType] : documentText[row.documentType] }}</span><small>{{ row.documentStatus ?? '—' }}</small></td><td v-if="showCustomer"><strong>{{ row.customerName }}</strong><small>{{ row.customerCode }}</small></td><td v-if="showProduct"><strong>{{ row.product.name }}</strong><small>{{ row.product.skuCode }} · {{ row.product.productCode ?? '暂不可用' }}</small></td><td v-if="!isSummary && area === 'order'"><span v-if="row.product.barcodeState === 'available'">{{ row.product.barcode ?? '—' }}</span><span v-else class="order-unavailable">暂不可用</span></td><td v-if="showUnit">{{ row.product.specification }}<small>{{ row.unit.name }}</small></td><td v-if="showMeasure('quantity')" :class="{ 'statistics-negative': row.displayQuantityMilli < 0 }"><strong>{{ quantity(row.displayQuantityMilli) }}</strong> {{ row.unit.name }}</td><td v-if="!isSummary && area === 'order'">{{ quantity(row.pendingDisplayQuantityMilli) }} {{ row.unit.name }}</td><td v-if="showMeasure('document-count') && isSummary">{{ row.documentCount }}</td><td v-if="showMeasure('average-price')" class="order-money">{{ money(row.averageUnitPriceCents, row.amountState) }}</td><td v-if="showMeasure('amount')" class="order-money" :class="{ 'statistics-negative': (row.amountCents ?? 0) < 0 }">{{ money(row.amountCents, row.amountState) }}</td><td v-if="showMeasure('fulfillment-rate') && area === 'order'">{{ rate(row.fulfillmentRateBasisPoints) }}</td><td v-if="showMeasure('discount-rate') && area === 'order'">{{ rate(row.discountRateBasisPoints) }}</td><td v-if="!isSummary && area === 'sales'"><span class="order-unavailable">{{ row.packageState === 'available' ? row.packageName ?? '—' : '暂不可用' }}</span></td></tr></tbody></table></div>
      <footer class="order-pagination"><span>共 {{ page.total }} 行，第 {{ page.query.page }} / {{ Math.max(1, Math.ceil(page.total / page.query.pageSize)) }} 页</span><select v-model.number="filters.pageSize" aria-label="每页条数" @change="filters.page = 1; applyRoute()"><option :value="10">10条/页</option><option :value="30">30条/页</option><option :value="50">50条/页</option><option :value="100">100条/页</option></select><button class="order-button" type="button" :disabled="page.query.page <= 1" @click="setPage(page.query.page - 1)">上一页</button><button class="order-button" type="button" :disabled="page.query.page * page.query.pageSize >= page.total" @click="setPage(page.query.page + 1)">下一页</button></footer>
    </div>

    <div v-if="pivotOpen && pivotDraft" class="statistics-dialog-backdrop" @click.self="pivotOpen = false"><section class="statistics-dialog" role="dialog" aria-modal="true" aria-labelledby="pivot-title"><header><div><h2 id="pivot-title">二维表设置</h2><p>仅调整当前模拟用户的展示维度和指标，不修改业务数据。</p></div><button class="order-button" type="button" @click="pivotOpen = false">关闭</button></header><div class="statistics-config"><fieldset><legend>行维度（至少一项）</legend><label v-for="item in ([['customer','客户'],['product','商品'],['sku','SKU'],['unit','单位']] as const)" :key="item[0]"><input type="checkbox" :checked="pivotDraft.dimensions.includes(item[0])" @change="toggleDimension(item[0])" />{{ item[1] }}</label></fieldset><fieldset><legend>指标（至少一项）</legend><label v-for="item in ([['document-count','单据数'],['quantity','数量'],['amount','金额'],['average-price','平均单价'],['fulfillment-rate','履约率'],['discount-rate','折扣率']] as const)" :key="item[0]"><input type="checkbox" :checked="pivotDraft.measures.includes(item[0])" @change="toggleMeasure(item[0])" />{{ item[1] }}</label></fieldset></div><footer><button class="order-button" type="button" @click="resetPivot">恢复默认</button><button class="order-button primary" type="button" @click="savePivot">保存设置</button></footer></section></div>
  </section>
</template>
