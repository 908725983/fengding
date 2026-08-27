<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import InventorySubnav from '../components/InventorySubnav.vue'
import { useInventoryStore } from '../runtime/inventory-store'
import type { InventoryStatisticsQuery, InventoryStatisticsReportKey, InventoryStatisticsSkuRow, InventoryStatisticsWarehouseRow } from '../types'
import './inventory-views.css'

const store = useInventoryStore(); const route = useRoute(); const router = useRouter()
const { statisticsPage: page, statisticsOptions: options, loading, error } = storeToRefs(store)
const tabs: Array<{ key: InventoryStatisticsReportKey; label: string }> = [
  { key: 'inventory-ledger', label: '进销存统计' },
  { key: 'warehouse-ledger', label: '按仓库进销存汇总' },
  { key: 'movement-summary', label: '出入库汇总' },
  { key: 'warehouse-receipts-issues', label: '库存收发仓库统计' },
]
const validReport = (value: unknown): InventoryStatisticsReportKey => tabs.some((item) => item.key === value) ? value as InventoryStatisticsReportKey : 'inventory-ledger'
const filters = reactive({ report: validReport(route.query.report), fromDate: String(route.query.fromDate ?? '2026-08-01'), toDate: String(route.query.toDate ?? '2026-08-10'), warehouseId: String(route.query.warehouseId ?? ''), categoryId: String(route.query.categoryId ?? ''), page: Math.max(1, Number(route.query.page ?? 1)), pageSize: [10, 30, 50, 100].includes(Number(route.query.pageSize)) ? Number(route.query.pageSize) as 10 | 30 | 50 | 100 : 30 as 10 | 30 | 50 | 100 })
const isSkuReport = computed(() => ['inventory-ledger', 'movement-summary'].includes(filters.report))
const isMovementSummary = computed(() => filters.report === 'movement-summary')
const query = (): InventoryStatisticsQuery => ({ report: filters.report, fromDate: filters.fromDate, toDate: filters.toDate, warehouseId: filters.warehouseId || undefined, categoryId: isSkuReport.value && filters.categoryId ? filters.categoryId : undefined, page: filters.page, pageSize: filters.pageSize })
function routeQuery() { const value = query(); return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== '')) }
function hydrate() { filters.report = validReport(route.query.report); filters.fromDate = String(route.query.fromDate ?? '2026-08-01'); filters.toDate = String(route.query.toDate ?? '2026-08-10'); filters.warehouseId = String(route.query.warehouseId ?? ''); filters.categoryId = String(route.query.categoryId ?? ''); filters.page = Math.max(1, Number(route.query.page ?? 1)); filters.pageSize = [10, 30, 50, 100].includes(Number(route.query.pageSize)) ? Number(route.query.pageSize) as 10 | 30 | 50 | 100 : 30 }
async function apply(push = false) { await (push ? router.push({ path: '/inventory/statistics', query: routeQuery() }) : router.replace({ path: '/inventory/statistics', query: routeQuery() })) }
async function search() { filters.page = 1; await apply() }
async function reset() { filters.fromDate = '2026-08-01'; filters.toDate = '2026-08-10'; filters.warehouseId = ''; filters.categoryId = ''; filters.page = 1; filters.pageSize = 30; await apply() }
async function switchReport(report: InventoryStatisticsReportKey) { filters.report = report; filters.page = 1; if (!['inventory-ledger', 'movement-summary'].includes(report)) filters.categoryId = ''; await apply(true) }
async function changePage(next: number) { filters.page = next; await apply() }
async function changePageSize() { filters.page = 1; await apply() }
const money = (value: number | null) => value === null ? '—' : `¥${(value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const quantity = (value: number) => (value / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 3 })
const skuRow = (value: unknown) => value as InventoryStatisticsSkuRow
const warehouseRow = (value: unknown) => value as InventoryStatisticsWarehouseRow
watch(() => route.fullPath, async () => { hydrate(); await store.loadStatistics(query()) }, { immediate: true })
</script>

<template>
  <section class="inventory-page inventory-statistics-page">
    <header class="inventory-header"><div><p class="eyebrow">INV-006 · 库存分析</p><h1>库存统计</h1><p>四张报表共用不可变库存移动、成本调整历史与结转校验。</p></div></header>
    <InventorySubnav />
    <nav class="inventory-statistics-tabs" aria-label="库存统计报表"><button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: filters.report === tab.key }" @click="switchReport(tab.key)">{{ tab.label }}</button></nav>
    <form class="inventory-statistics-filter" @submit.prevent="search"><label>开始日期<input v-model="filters.fromDate" type="date" required /></label><label>结束日期<input v-model="filters.toDate" type="date" required /></label><label>仓库<select v-model="filters.warehouseId"><option value="">全部仓库</option><option v-for="item in options.warehouses" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}{{ item.status === 'disabled' ? '（停用）' : '' }}</option></select></label><label v-if="isSkuReport">商品分类<select v-model="filters.categoryId" :disabled="options.catalogState === 'partial'"><option value="">全部分类</option><option v-for="item in options.categories" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><button class="inv-button primary" type="submit">查询</button><button class="inv-button" type="button" @click="reset">重置</button><button class="inv-button" type="button" :disabled="loading" @click="store.loadStatistics(query())">刷新</button></form>
    <div v-if="error" class="inventory-state error" role="alert"><strong>库存统计加载失败</strong><span>{{ error }}</span><button class="inv-button" type="button" @click="store.loadStatistics(query())">重试</button></div>
    <div v-else-if="loading" class="inventory-state"><strong>正在读取库存统计…</strong><span>报表与合计来自同一次 Repository 快照。</span></div>
    <template v-else>
      <div class="inventory-statistics-meta"><span>快照 {{ page.snapshotVersion || '—' }}</span><span :class="`period-${page.periodState}`">{{ page.periodState === 'closed' ? '已结转' : page.periodState === 'unclosed' ? '未结转，结果可能变化' : '本期进行中' }}</span><span v-if="page.catalogState === 'partial'">商品资料部分不可用</span><span v-if="!page.amountsVisible">当前角色金额已遮蔽</span></div>
      <p v-if="page.message" :class="page.availability === 'unavailable' ? 'inventory-statistics-unavailable' : 'inventory-warning'">{{ page.message }}</p>
      <div v-if="page.availability === 'available'" class="inventory-statistics-cards">
        <article><span>入库笔数</span><strong>{{ page.totals.inboundDocumentCount }}</strong><small>入库数量 {{ quantity(page.totals.inboundQuantityMilli) }}</small><small>入库金额 {{ money(page.totals.inboundAmountCents) }}</small></article>
        <article><span>出库笔数</span><strong>{{ page.totals.outboundDocumentCount }}</strong><small>出库数量 {{ quantity(page.totals.outboundQuantityMilli) }}</small><small>出库金额 {{ money(page.totals.outboundAmountCents) }}</small></article>
        <article><span>{{ isMovementSummary ? '净数量' : '期末数量' }}</span><strong>{{ quantity(isMovementSummary ? page.totals.netQuantityMilli : page.totals.endingQuantityMilli) }}</strong><small>{{ isMovementSummary ? '净金额' : '期末金额' }} {{ money(isMovementSummary ? page.totals.netAmountCents : page.totals.endingAmountCents) }}</small><small>跨品项基本数量合计</small></article>
        <article><span>成本调整</span><strong>{{ money(page.totals.costAdjustmentCents) }}</strong><small>仅影响期初/期末价值</small></article>
      </div>
      <div v-if="page.availability === 'unavailable'" class="inventory-state"><strong>库存统计暂不可用</strong><span>请先修复结转快照与不可变账本的冲突。</span></div>
      <div v-else-if="!page.items.length" class="inventory-state"><strong>暂无统计数据</strong><span>当前日期和筛选范围没有非零库存事实。</span></div>
      <div v-else class="inventory-table-wrap"><table class="inventory-table inventory-statistics-table"><thead><tr v-if="isSkuReport"><th>商品编码</th><th>商品名称</th><th>规格</th><th>单位</th><th v-if="!isMovementSummary" class="quantity">期初数量</th><th v-if="!isMovementSummary" class="money">期初金额</th><th class="quantity">本期入库</th><th class="money">入库金额</th><th class="quantity">本期出库</th><th class="money">出库金额</th><th class="quantity">{{ isMovementSummary ? '结存数量' : '期末数量' }}</th><th class="money">{{ isMovementSummary ? '结存金额' : '期末金额' }}</th></tr><tr v-else-if="filters.report === 'warehouse-ledger'"><th>仓库名称</th><th class="money">期初金额</th><th class="money">本期入库金额</th><th class="money">本期出库金额</th><th class="money">期末金额</th><th class="quantity">入库笔数</th><th class="quantity">出库笔数</th></tr><tr v-else><th>仓库名称</th><th class="quantity">期初库存</th><th class="quantity">本期收入</th><th class="quantity">本期发出</th><th class="quantity">期末库存</th><th class="money">收入金额</th><th class="money">发出金额</th><th class="money">库存金额</th></tr></thead><tbody><template v-if="isSkuReport"><tr v-for="item in page.items" :key="item.id"><template v-if="item.kind === 'sku'"><td><strong>{{ skuRow(item).sku?.skuCode ?? skuRow(item).skuId }}</strong></td><td>{{ skuRow(item).sku?.productName ?? '商品资料不可用' }}</td><td>{{ skuRow(item).sku?.specification ?? '—' }}</td><td>{{ skuRow(item).sku?.baseUnitName ?? '基本单位' }}</td><td v-if="!isMovementSummary" class="quantity">{{ quantity(skuRow(item).openingQuantityMilli) }}</td><td v-if="!isMovementSummary" class="money">{{ money(skuRow(item).openingAmountCents) }}</td><td class="quantity">{{ quantity(skuRow(item).inboundQuantityMilli) }}</td><td class="money">{{ money(skuRow(item).inboundAmountCents) }}</td><td class="quantity">{{ quantity(skuRow(item).outboundQuantityMilli) }}</td><td class="money">{{ money(skuRow(item).outboundAmountCents) }}</td><td class="quantity">{{ quantity(skuRow(item).endingQuantityMilli) }}</td><td class="money">{{ money(skuRow(item).endingAmountCents) }}<small v-if="skuRow(item).costAdjustmentCents">含成本调整 {{ money(skuRow(item).costAdjustmentCents) }}</small></td></template></tr></template><template v-else><tr v-for="item in page.items" :key="item.id"><template v-if="item.kind === 'warehouse'"><td><strong>{{ warehouseRow(item).warehouse.name }}</strong><small>{{ warehouseRow(item).warehouse.code }}{{ warehouseRow(item).warehouse.status === 'disabled' ? ' · 已停用' : '' }}</small></td><template v-if="filters.report === 'warehouse-ledger'"><td class="money">{{ money(warehouseRow(item).openingAmountCents) }}</td><td class="money">{{ money(warehouseRow(item).inboundAmountCents) }}</td><td class="money">{{ money(warehouseRow(item).outboundAmountCents) }}</td><td class="money">{{ money(warehouseRow(item).endingAmountCents) }}<small v-if="warehouseRow(item).costAdjustmentCents">含调整 {{ money(warehouseRow(item).costAdjustmentCents) }}</small></td><td class="quantity">{{ warehouseRow(item).inboundDocumentCount }}</td><td class="quantity">{{ warehouseRow(item).outboundDocumentCount }}</td></template><template v-else><td class="quantity">{{ quantity(warehouseRow(item).openingQuantityMilli) }}</td><td class="quantity">{{ quantity(warehouseRow(item).inboundQuantityMilli) }}</td><td class="quantity">{{ quantity(warehouseRow(item).outboundQuantityMilli) }}</td><td class="quantity">{{ quantity(warehouseRow(item).endingQuantityMilli) }}</td><td class="money">{{ money(warehouseRow(item).inboundAmountCents) }}</td><td class="money">{{ money(warehouseRow(item).outboundAmountCents) }}</td><td class="money">{{ money(warehouseRow(item).endingAmountCents) }}</td></template></template></tr></template></tbody></table></div>
      <nav v-if="page.availability === 'available' && page.total" class="inventory-pagination" aria-label="库存统计分页"><label>每页<select v-model="filters.pageSize" @change="changePageSize"><option :value="10">10</option><option :value="30">30</option><option :value="50">50</option><option :value="100">100</option></select></label><button class="inv-button" :disabled="filters.page <= 1" @click="changePage(filters.page - 1)">上一页</button><span>第 {{ filters.page }} 页 · 共 {{ page.total }} 条</span><button class="inv-button" :disabled="filters.page * filters.pageSize >= page.total" @click="changePage(filters.page + 1)">下一页</button></nav>
    </template>
  </section>
</template>
