<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import ProcurementSubnav from '../components/ProcurementSubnav.vue'
import ProcurementScenarioBar from '../components/ProcurementScenarioBar.vue'
import { useProcurementStore } from '../runtime/procurement-store'
import type { PurchaseStatisticsQuery, PurchaseStatisticsReportKey } from '../statistics/types'
import type { ProcurementRole } from '../types'
import type { ProcurementScenarioName } from '../../../../mock/handlers/procurement-handler'
import './procurement-views.css'
import './purchase-statistics-view.css'

const route = useRoute(); const router = useRouter(); const store = useProcurementStore()
const { statisticsPage: page, statisticsOptions: options, statisticsExporting: exporting, loading, error, scenario, actor } = storeToRefs(store)
const tabs: Array<{ key: PurchaseStatisticsReportKey; label: string }> = [
  { key: 'purchase-order-line-detail', label: '采购订单明细' },
  { key: 'purchase-order-by-supplier', label: '采购订单按供应商汇总' },
  { key: 'purchase-movement-line-detail', label: '采购出入库明细' },
  { key: 'purchase-movement-by-product', label: '出入库按商品汇总' },
  { key: 'purchase-movement-by-supplier', label: '出入库按供应商汇总' },
]
const filters = reactive({ fromDate: '2026-05-10', toDate: '2026-08-10', supplierId: '', keyword: '', page: 1, pageSize: 30 as 10 | 30 | 50 | 100 })
const currentReport = computed<PurchaseStatisticsReportKey>(() => tabs.some((item) => item.key === route.query.report) ? route.query.report as PurchaseStatisticsReportKey : 'purchase-order-line-detail')
const isSummary = computed(() => currentReport.value !== 'purchase-order-line-detail' && currentReport.value !== 'purchase-movement-line-detail')
const isMovement = computed(() => currentReport.value.startsWith('purchase-movement'))
const money = (value: number | null, state = 'available') => state !== 'available' || value === null ? '暂不可用' : `¥${(value / 100).toFixed(2)}`
const quantity = (value: number | null) => value === null ? '—' : (value / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 3 })
const dateTime = (value: string) => value.slice(0, 16).replace('T', ' ')
const movementText: Record<string, string> = { 'purchase-inbound': '采购入库', 'purchase-return-outbound': '退采出库' }
const statusText: Record<string, string> = { 'pending-review': '待审核', approved: '已审核', confirmed: '已确认' }

function hydrate() {
  filters.fromDate = String(route.query.fromDate ?? '2026-05-10'); filters.toDate = String(route.query.toDate ?? '2026-08-10')
  filters.supplierId = String(route.query.supplierId ?? ''); filters.keyword = String(route.query.keyword ?? '')
  filters.page = Math.max(1, Number(route.query.page ?? 1) || 1); const size = Number(route.query.pageSize ?? 30); filters.pageSize = [10, 30, 50, 100].includes(size) ? size as 10 | 30 | 50 | 100 : 30
}
function queryValue(report = currentReport.value): PurchaseStatisticsQuery { return { report, fromDate: filters.fromDate, toDate: filters.toDate, supplierId: filters.supplierId || undefined, keyword: filters.keyword || undefined, page: filters.page, pageSize: filters.pageSize } }
function routeQuery(report = currentReport.value) { return Object.fromEntries(Object.entries(queryValue(report)).filter(([, value]) => value !== undefined && value !== '')) }
async function applyRoute(report = currentReport.value, push = false) { await (push ? router.push({ path: '/procurement/statistics', query: routeQuery(report) }) : router.replace({ query: routeQuery(report) })) }
async function search() { filters.page = 1; await applyRoute() }
async function clearFilters() { filters.fromDate = '2026-05-10'; filters.toDate = '2026-08-10'; filters.supplierId = ''; filters.keyword = ''; filters.page = 1; filters.pageSize = 30; await applyRoute() }
async function switchReport(report: PurchaseStatisticsReportKey) { filters.page = 1; await applyRoute(report, true) }
async function setPage(value: number) { filters.page = Math.max(1, value); await applyRoute() }
async function onScenario(value: ProcurementScenarioName) { await store.setScenario(value); await store.loadPurchaseStatistics(queryValue()) }
async function onRole(value: ProcurementRole) { await store.setRole(value); await store.loadPurchaseStatistics(queryValue()) }
async function download() { const csv = await store.exportPurchaseStatistics(queryValue()); if (!csv) return; const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `${currentReport.value}-${filters.fromDate}-${filters.toDate}.csv`; link.click(); URL.revokeObjectURL(url) }
watch(() => route.fullPath, async () => { hydrate(); await store.loadPurchaseStatistics(queryValue()) }, { immediate: true })
</script>

<template>
  <section class="procurement-page purchase-statistics-page">
    <header class="procurement-header"><div><p class="eyebrow">PUR-005 · 采购分析</p><h1>采购统计</h1><p>按采购订单、实际入库与实际退采出库事实核对数量和金额。</p></div><ProcurementScenarioBar :scenario="scenario" :role="actor.role" @scenario="onScenario" @role="onRole" /></header>
    <ProcurementSubnav />
    <nav class="statistics-tabs" aria-label="采购统计报表"><button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: currentReport === tab.key }" @click="switchReport(tab.key)">{{ tab.label }}</button></nav>
    <form class="procurement-toolbar statistics-filter" @submit.prevent="search"><label>开始日期<input v-model="filters.fromDate" type="date" /></label><label>结束日期<input v-model="filters.toDate" type="date" /></label><label>供应商<select v-model="filters.supplierId"><option value="">全部供应商</option><option v-for="item in options.suppliers" :key="item.id" :value="item.id">{{ item.code ?? '—' }} · {{ item.name }}</option></select></label><label class="grow">商品 / SKU / 条码 / 规格<input v-model.trim="filters.keyword" maxlength="100" placeholder="输入商品关键字" /></label><button class="pur-button primary" type="submit">查询</button><button class="pur-button" type="button" @click="clearFilters">清空</button></form>
    <div class="statistics-toolbar"><div><strong>快照 {{ page.snapshotVersion }}</strong><span>明细与合计来自同一次读取</span></div><div><button class="pur-button" type="button" :disabled="loading" @click="store.loadPurchaseStatistics(queryValue())">刷新</button><button class="pur-button" type="button" :disabled="exporting || page.availability === 'unavailable' || !['super-admin','warehouse'].includes(actor.role)" @click="download">{{ exporting ? '导出中…' : '导出 CSV' }}</button></div></div>
    <div v-if="error" class="procurement-state error" role="alert"><strong>采购统计加载失败</strong><span>{{ error }}</span><button class="pur-button" type="button" @click="store.loadPurchaseStatistics(queryValue())">重试</button></div>
    <div v-else-if="loading" class="procurement-state"><strong>正在读取采购统计…</strong><span>慢响应期间不会用旧结果覆盖新筛选。</span></div>
    <div v-else-if="page.availability === 'unavailable'" class="procurement-state"><span class="pur-status unavailable">数据源未接入</span><strong>{{ page.message }}</strong><p>这不是空数据，不会用 0 代替缺失的历史事实。</p></div>
    <template v-else>
      <div class="statistics-totals"><span>单据笔数 <strong>{{ page.totals.documentCount }}</strong></span><span>基本单位数量 <strong>{{ quantity(page.totals.baseQuantityMilli) }}</strong></span><span>金额合计 <strong>{{ money(page.totals.amountCents, page.totals.amountState) }}</strong></span><template v-if="isMovement"><span>采购入库金额 <strong>{{ money(page.totals.purchaseOrderAmountCents, page.totals.amountState) }}</strong></span><span>退采出库金额 <strong>{{ money(page.totals.purchaseReturnAmountCents, page.totals.amountState) }}</strong></span><span>净额 <strong>{{ money(page.totals.netAmountCents, page.totals.amountState) }}</strong></span></template></div>
      <div v-if="!page.total" class="procurement-state"><strong>暂无匹配数据</strong><span>当前筛选下没有真实采购记录。</span></div>
      <div v-else class="procurement-table-wrap statistics-table-wrap"><table class="procurement-table statistics-table"><thead><tr><th v-if="!isSummary">业务时间</th><th v-if="!isSummary">单据 / 来源</th><th v-if="!isSummary">类型 / 状态</th><th>供应商</th><th>仓库</th><th>商品</th><th>规格 / 单位</th><th>{{ isMovement ? '基本单位数量' : '采购数量 / 基本数量' }}</th><th v-if="!isSummary && !isMovement">待入库 / 基本待入库</th><th v-if="isSummary">单据数</th><th class="pur-money">单价</th><th class="pur-money">金额</th></tr></thead><tbody><tr v-for="row in page.items" :key="row.id"><td v-if="!isSummary">{{ dateTime(row.occurredAt) }}</td><td v-if="!isSummary"><RouterLink v-if="row.sourcePath && row.documentId" :to="row.sourcePath"><strong>{{ row.documentNo ?? '—' }}</strong></RouterLink><span v-else>{{ row.documentNo ?? '—' }}</span><small v-if="row.sourceDocumentNo">来源 {{ row.sourceDocumentNo }}</small></td><td v-if="!isSummary"><span class="pur-status">{{ row.movementType ? movementText[row.movementType] : statusText[row.documentStatus ?? ''] ?? '—' }}</span></td><td><strong>{{ row.supplierName }}</strong><small>{{ row.supplierCode ?? '—' }}</small></td><td><span :class="{ 'statistics-unavailable': row.warehouseState === 'unavailable' }">{{ row.warehouseState === 'available' ? row.warehouseName : '暂不可用' }}</span></td><td><strong>{{ row.product.name }}</strong><small>{{ row.product.skuCode }} · {{ row.product.productCode }}</small><small v-if="row.product.barcodeState === 'available'">条码 {{ row.product.barcode ?? '—' }}</small></td><td>{{ row.product.specification }}<small>{{ row.unit.procurementUnitName }} / {{ row.unit.baseUnitState === 'available' ? row.unit.baseUnitName : '暂不可用' }}</small></td><td :class="{ 'statistics-negative': row.baseQuantityMilli < 0 }"><strong v-if="!isMovement">{{ row.packageQuantity }} {{ row.unit.procurementUnitName }}</strong><strong v-else>{{ quantity(row.baseQuantityMilli) }} {{ row.unit.baseUnitName ?? '基本单位' }}</strong><small v-if="!isMovement">{{ quantity(row.baseQuantityMilli) }} {{ row.unit.baseUnitName ?? '基本单位' }}</small></td><td v-if="!isSummary && !isMovement"><strong>{{ row.pendingPackageQuantity ?? 0 }} {{ row.unit.procurementUnitName }}</strong><small>{{ quantity(row.pendingBaseQuantityMilli) }} {{ row.unit.baseUnitName ?? '基本单位' }}</small></td><td v-if="isSummary">{{ row.documentCount }}</td><td class="pur-money">{{ money(row.unitPriceCents, row.amountState) }}</td><td class="pur-money" :class="{ 'statistics-negative': (row.amountCents ?? 0) < 0 }">{{ money(row.amountCents, row.amountState) }}</td></tr></tbody></table></div>
      <footer class="procurement-pagination"><span>共 {{ page.total }} 行 · 第 {{ page.query.page }} / {{ Math.max(1, Math.ceil(page.total / page.query.pageSize)) }} 页</span><select v-model.number="filters.pageSize" aria-label="每页条数" @change="filters.page = 1; applyRoute()"><option :value="10">10 条/页</option><option :value="30">30 条/页</option><option :value="50">50 条/页</option><option :value="100">100 条/页</option></select><button class="pur-button" type="button" :disabled="page.query.page <= 1" @click="setPage(page.query.page - 1)">上一页</button><button class="pur-button" type="button" :disabled="page.query.page * page.query.pageSize >= page.total" @click="setPage(page.query.page + 1)">下一页</button></footer>
    </template>
  </section>
</template>
