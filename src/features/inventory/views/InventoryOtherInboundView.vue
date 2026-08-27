<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useInventoryStore } from '../runtime/inventory-store'
import InventorySubnav from '../components/InventorySubnav.vue'
import InventoryScenarioBar from '../components/InventoryScenarioBar.vue'
import type { InventoryDocumentListQuery, InventoryOtherInboundDraft, InventoryRole } from '../types'
import type { InventoryScenarioName } from '../../../../mock/handlers/inventory-handler'
import './inventory-views.css'

const store = useInventoryStore(); const route = useRoute(); const router = useRouter()
const { otherInbounds, workspace, loading, error, saving, scenario, actor, canWrite } = storeToRefs(store)
const show = ref(false); const message = ref('')
const filters = reactive({ status: String(route.query.status ?? ''), fromDate: String(route.query.fromDate ?? ''), toDate: String(route.query.toDate ?? ''), keyword: String(route.query.keyword ?? '') })
const draft = ref<InventoryOtherInboundDraft>({ warehouseId: '', type: 'surplus', occurredAt: '2026-08-10T10:00:00+08:00', relatedDocumentNo: '', supplierId: '', lines: [{ skuId: '', quantityMilli: 1000, costPerBaseUnitCents: 0, batchNumber: '', productionDate: null, expiresOn: null }], note: '' })
const skuOptions = computed(() => workspace.value.stocks.items.filter((row, index, items) => items.findIndex((item) => item.skuId === row.skuId) === index))
const selectedSku = computed(() => skuOptions.value.find((row) => row.skuId === draft.value.lines[0].skuId)?.sku ?? null)
const query = (): InventoryDocumentListQuery => ({ status: filters.status || undefined, fromDate: filters.fromDate || undefined, toDate: filters.toDate || undefined, keyword: filters.keyword.trim() || undefined, page: 1, pageSize: 30 })
async function load() { await router.replace({ query: { status: filters.status || undefined, fromDate: filters.fromDate || undefined, toDate: filters.toDate || undefined, keyword: filters.keyword.trim() || undefined } }); await store.loadOtherInbounds(query()) }
async function save() { try { await store.createOtherInbound(draft.value); show.value = false; message.value = '其他入库单已创建' } catch (e) { message.value = e instanceof Error ? e.message : '保存失败' } }
async function remove(id: string) { const item = otherInbounds.value.find((row) => row.id === id); if (!item) return; try { await store.deleteOtherInbound(item); message.value = '待审核单据已删除' } catch (e) { message.value = e instanceof Error ? e.message : '删除失败' } }
async function changeScenario(value: InventoryScenarioName) { await store.setScenario(value); await load() }
async function changeRole(value: InventoryRole) { await store.setRole(value); await load() }
function targetLocation(warehouseId: string) { return workspace.value.locations.find((item) => item.warehouseId === warehouseId && item.status === 'enabled')?.id ?? '' }
function download() { const url = URL.createObjectURL(new Blob([store.exportOtherInbounds(query())], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'inventory-other-inbounds.csv'; anchor.click(); URL.revokeObjectURL(url) }
onMounted(async () => { await store.load(); await load() })
</script>

<template>
  <section class="inventory-page">
    <header class="inventory-header"><div><p class="eyebrow">INV-002 · 库存流转</p><h1>其他入库单</h1><p>盘盈、赠品和其他非采购入库；客户退货固定走 ORD-005。</p></div><InventoryScenarioBar :scenario="scenario" :role="actor.role" @scenario="changeScenario" @role="changeRole" /></header>
    <InventorySubnav />
    <form class="inventory-toolbar" @submit.prevent="load"><label>状态<select v-model="filters.status"><option value="">全部</option><option value="pending-review">待审核</option><option value="completed">已完成</option></select></label><label>开始日期<input v-model="filters.fromDate" type="date" /></label><label>结束日期<input v-model="filters.toDate" type="date" /></label><label>关键字<input v-model="filters.keyword" placeholder="单号 / SKU" /></label><button class="inv-button primary" type="submit">查询</button><button class="inv-button" type="button" @click="() => store.loadOtherInbounds(query())">刷新</button><button v-if="canWrite" class="inv-button" type="button" @click="download">导出 CSV</button><button v-if="canWrite" class="inv-button primary" type="button" @click="show = true">新增</button></form>
    <p v-if="message" class="inventory-warning">{{ message }}</p><div v-if="error" class="inventory-state error"><strong>其他入库加载失败</strong><span>{{ error }}</span><button class="inv-button" @click="load">重试</button></div><div v-else-if="loading" class="inventory-state">正在加载其他入库…</div><div v-else-if="!otherInbounds.length" class="inventory-state"><strong>暂无其他入库单</strong><span>当前筛选没有记录。</span></div>
    <div v-else class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th>单号</th><th>仓库</th><th>类型</th><th>关联单号</th><th>时间</th><th>状态</th><th>金额</th><th>操作</th></tr></thead><tbody><tr v-for="item in otherInbounds" :key="item.id"><td><strong>{{ item.code }}</strong></td><td>{{ workspace.warehouses.find(w => w.id === item.warehouseId)?.name ?? item.warehouseId }}</td><td>{{ { surplus: '盘盈', return: '退货', gift: '赠品', other: '其他' }[item.type] }}</td><td>{{ item.relatedDocumentNo || '—' }}</td><td>{{ item.occurredAt.slice(0, 16).replace('T', ' ') }}</td><td>{{ item.status === 'pending-review' ? '待审核' : '已完成' }}</td><td>{{ actor.role === 'sales-supervisor' ? '—' : `¥${(item.lines.reduce((sum, line) => sum + Math.round(line.quantityMilli * line.costPerBaseUnitCents / 1000), 0) / 100).toFixed(2)}` }}</td><td><button v-if="canWrite && item.status === 'pending-review'" class="inv-button" :disabled="saving" @click="store.approveOtherInbound(item, targetLocation(item.warehouseId))">审核并完成</button><button v-if="canWrite && item.status === 'pending-review'" class="inv-button" :disabled="saving" @click="remove(item.id)">删除</button></td></tr></tbody></table></div>
    <div v-if="show" class="inventory-dialog"><section><header><strong>新增其他入库</strong><button class="inv-button" @click="show = false">关闭</button></header><form class="inventory-form" @submit.prevent="save"><label>仓库<select v-model="draft.warehouseId" required><option value="">请选择</option><option v-for="w in workspace.warehouses.filter(item => item.status === 'enabled')" :key="w.id" :value="w.id">{{ w.name }}</option></select></label><label>类型<select v-model="draft.type"><option value="surplus">盘盈</option><option value="gift">赠品</option><option value="other">其他</option></select></label><label>关联单号<input v-model="draft.relatedDocumentNo" maxlength="100" /></label><label>供应商引用<input v-model="draft.supplierId" maxlength="100" /></label><label class="wide">SKU<select v-model="draft.lines[0].skuId" required><option value="">请选择</option><option v-for="row in skuOptions" :key="row.skuId" :value="row.skuId">{{ row.sku?.productName ?? row.skuId }} · {{ row.sku?.specification }}</option></select></label><label>数量（千分量）<input v-model.number="draft.lines[0].quantityMilli" type="number" min="1" required /></label><label>成本（分/基本单位）<input v-model.number="draft.lines[0].costPerBaseUnitCents" type="number" min="0" required /></label><template v-if="selectedSku?.manageProductionDate || selectedSku?.shelfLifeDays !== null"><label>批次号<input v-model="draft.lines[0].batchNumber" required /></label><label>生产日期<input v-model="draft.lines[0].productionDate" type="date" required /></label><label>有效期<input v-model="draft.lines[0].expiresOn" type="date" /></label></template><button class="inv-button primary wide" :disabled="saving" type="submit">保存</button></form></section></div>
  </section>
</template>
