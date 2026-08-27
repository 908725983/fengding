<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import FinanceScenarioBar from '../components/FinanceScenarioBar.vue'
import FinanceSubnav from '../components/FinanceSubnav.vue'
import { useFinanceStore } from '../runtime/finance-store'
import type { FinanceRole } from '../types'
import type { FinanceScenarioName } from '../../../../mock/handlers/finance-handler'
import './finance-views.css'

const props = defineProps<{ mode: 'documents' | 'products' | 'aging' }>()
const store = useFinanceStore()
const { supplierPayables, supplierPayableProducts, supplierPayableAging, loading, error, scenario, actor } = storeToRefs(store)
const keyword = ref('')
const money = (value: number) => `¥${(value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
const title = computed(() => ({ documents: '供应商应付', products: '应付明细（按商品）', aging: '供应商账龄' })[props.mode])
const statusLabel = { unpaid: '未付款', 'partially-paid': '部分付款', paid: '已付款', voided: '已冲销' } as const
const totals = computed(() => supplierPayables.value.reduce((sum, item) => ({ amount: sum.amount + item.amountCents, paid: sum.paid + item.paidCents, outstanding: sum.outstanding + item.outstandingCents }), { amount: 0, paid: 0, outstanding: 0 }))
async function load() { await store.loadSupplierPayables({ keyword: keyword.value || undefined }) }
async function scenarioChange(value: FinanceScenarioName) { await store.setScenario(value); await load() }
async function roleChange(value: FinanceRole) { await store.setRole(value); await load() }
onMounted(load)
</script>

<template>
  <section class="finance-page">
    <header class="finance-header"><div><h1>{{ title }}</h1><p>应付只由有效采购入库形成；付款、核销和贷项由资金域统一投影。</p></div><FinanceScenarioBar :scenario="scenario" :role="actor.role" @scenario="scenarioChange" @role="roleChange" /></header>
    <FinanceSubnav />
    <div class="finance-tabs"><RouterLink to="/finance/payables">按单据</RouterLink><RouterLink to="/finance/payables/products">按商品</RouterLink><RouterLink to="/finance/payables/aging">账龄</RouterLink></div>
    <div v-if="props.mode !== 'aging'" class="finance-toolbar"><label>关键字<input v-model="keyword" placeholder="供应商/采购单/入库单/SKU" @keyup.enter="load"></label><button class="fin-button primary" @click="load">查询</button></div>
    <div class="finance-summary"><article><span>应付金额</span><strong>{{ money(totals.amount) }}</strong></article><article><span>已付款</span><strong class="fin-income">{{ money(totals.paid) }}</strong></article><article><span>待付款</span><strong class="fin-expense">{{ money(totals.outstanding) }}</strong></article><article><span>有效应付单</span><strong>{{ supplierPayables.length }}</strong></article></div>
    <div v-if="error" class="finance-state error"><strong>供应商应付加载失败</strong><p>{{ error }}</p><button class="fin-button" @click="load">重试</button></div>
    <div v-else-if="loading" class="finance-state">正在加载供应商应付…</div>
    <div v-else-if="props.mode === 'documents'" class="finance-table-wrap"><table class="finance-table wide-table"><thead><tr><th>形成日期/应付号</th><th>采购单/入库单</th><th>供应商</th><th class="fin-money">应付</th><th class="fin-money">已付</th><th class="fin-money">待付</th><th>账龄/状态</th></tr></thead><tbody><tr v-for="row in supplierPayables" :key="row.id"><td>{{ row.occurredAt.slice(0, 10) }}<small>{{ row.payableNo }}</small></td><td>{{ row.purchaseOrderNo }}<small>{{ row.inboundNo }}</small></td><td>{{ row.supplierSnapshot.name }}<small>{{ row.supplierSnapshot.code }}</small></td><td class="fin-money">{{ money(row.amountCents) }}</td><td class="fin-money fin-income">{{ money(row.paidCents) }}</td><td class="fin-money fin-expense">{{ money(row.outstandingCents) }}</td><td><span class="fin-status" :class="row.status">{{ statusLabel[row.status] }}</span><small>{{ row.ageDays }} 天<span v-if="row.overdue"> · 已逾期</span></small></td></tr><tr v-if="!supplierPayables.length"><td colspan="7">暂无供应商应付</td></tr></tbody></table></div>
    <div v-else-if="props.mode === 'products'" class="finance-table-wrap"><table class="finance-table"><thead><tr><th>日期/采购单</th><th>供应商</th><th>SKU</th><th>商品/规格</th><th class="fin-money">数量</th><th class="fin-money">单价</th><th class="fin-money">金额</th><th>状态</th></tr></thead><tbody><tr v-for="row in supplierPayableProducts" :key="`${row.payableId}-${row.inboundLineId}`"><td>{{ row.occurredAt.slice(0, 10) }}<small>{{ row.purchaseOrderNo }}</small></td><td>{{ row.supplier.name }}</td><td>{{ row.skuCode }}</td><td>{{ row.productName }}<small>{{ row.specification }}</small></td><td class="fin-money">{{ row.quantityMilli / 1000 }} {{ row.unitName }}</td><td class="fin-money">{{ money(row.unitPriceCents) }}</td><td class="fin-money">{{ money(row.amountCents) }}</td><td><span class="fin-status" :class="row.status">{{ statusLabel[row.status] }}</span></td></tr><tr v-if="!supplierPayableProducts.length"><td colspan="8">暂无商品应付</td></tr></tbody></table></div>
    <div v-else class="finance-table-wrap"><table class="finance-table"><thead><tr><th>供应商</th><th class="fin-money">待付总额</th><th class="fin-money">0～30天</th><th class="fin-money">31～60天</th><th class="fin-money">61～90天</th><th class="fin-money">91～180天</th><th class="fin-money">181～365天</th><th class="fin-money">365天以上</th></tr></thead><tbody><tr v-for="row in supplierPayableAging" :key="row.supplier.id"><td><strong>{{ row.supplier.name }}</strong><small>{{ row.supplier.code }}</small></td><td class="fin-money fin-expense"><strong>{{ money(row.outstandingCents) }}</strong></td><td class="fin-money">{{ money(row.bucket0To30Cents) }}</td><td class="fin-money">{{ money(row.bucket31To60Cents) }}</td><td class="fin-money">{{ money(row.bucket61To90Cents) }}</td><td class="fin-money">{{ money(row.bucket91To180Cents) }}</td><td class="fin-money">{{ money(row.bucket181To365Cents) }}</td><td class="fin-money">{{ money(row.bucketOver365Cents) }}</td></tr><tr v-if="!supplierPayableAging.length"><td colspan="8">暂无待付账龄</td></tr></tbody></table></div>
  </section>
</template>
