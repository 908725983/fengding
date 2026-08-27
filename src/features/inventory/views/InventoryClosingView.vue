<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useInventoryStore } from '../runtime/inventory-store'
import InventorySubnav from '../components/InventorySubnav.vue'
import InventoryScenarioBar from '../components/InventoryScenarioBar.vue'
import type { InventoryRole } from '../types'
import type { InventoryScenarioName } from '../../../../mock/handlers/inventory-handler'
import './inventory-views.css'

const store = useInventoryStore(); const route = useRoute(); const router = useRouter()
const { closings, loading, saving, error, actor, scenario } = storeToRefs(store)
const year = ref(Number(route.query.year ?? 2026)); const message = ref('')
const months = computed(() => Array.from({ length: 12 }, (_, index) => `${year.value}-${String(index + 1).padStart(2, '0')}`))
const closed = (month: string) => closings.value.items.find((item) => item.month === month)
const canClose = (month: string) => actor.value.role === 'super-admin' && month === closings.value.nextClosableMonth && month < closings.value.currentMonth
const unavailableReason = (month: string) => month >= closings.value.currentMonth ? '月份尚未结束' : closings.value.nextClosableMonth ? `请先结转 ${closings.value.nextClosableMonth}` : '暂无可结转库存事实'
async function reload() { await router.replace({ query: { year: String(year.value) } }); await store.loadClosings(year.value) }
async function close(month: string) { try { await store.closeMonth(month, `closing-${month}`); message.value = `${month} 已结转` } catch (e) { message.value = e instanceof Error ? e.message : '结转失败' } }
async function role(value: InventoryRole) { await store.setRole(value); await reload() }; async function scene(value: InventoryScenarioName) { await store.setScenario(value); await reload() }
onMounted(async () => { const hadYearQuery = Boolean(route.query.year); await reload(); if (!hadYearQuery && closings.value.nextClosableMonth && Number(closings.value.nextClosableMonth.slice(0, 4)) !== year.value) { year.value = Number(closings.value.nextClosableMonth.slice(0, 4)); await reload() } })
</script>
<template>
  <section class="inventory-page"><header class="inventory-header"><div><p class="eyebrow">INV-003 · 期间快照</p><h1>库存结转</h1><p>只允许按自然月连续结转；保存月末数量、移动均价、价值和来源版本，反结转当前 unavailable。</p></div><InventoryScenarioBar :scenario="scenario" :role="actor.role" @scenario="scene" @role="role" /></header><InventorySubnav />
    <div class="inventory-toolbar"><label>年份<input v-model.number="year" type="number" min="2020" max="2100" @change="reload" /></label><button class="inv-button" @click="reload">刷新</button><span v-if="closings.nextClosableMonth" class="status-muted">下一可结转月份：{{ closings.nextClosableMonth }}</span></div><p v-if="message" class="inventory-warning">{{ message }}</p><div v-if="error" class="inventory-state error"><strong>结转加载失败</strong><span>{{ error }}</span><button class="inv-button" @click="reload">重试</button></div><div v-else-if="loading" class="inventory-state">正在加载结转记录…</div><div v-else class="inventory-month-grid"><article v-for="month in months" :key="month" class="inventory-month-card"><strong>{{ month }}</strong><span v-if="closed(month)" class="status-success">已结转 · {{ closed(month)!.snapshots.length }} 个库存快照</span><span v-else class="status-muted">未结转</span><button v-if="canClose(month)" class="inv-button primary" :disabled="saving" @click="close(month)">开始结转</button><span v-else-if="!closed(month)" class="status-muted">{{ actor.role === 'super-admin' ? unavailableReason(month) : '仅管理员可操作' }}</span><span v-else class="status-muted">反结转 unavailable</span></article></div>
  </section>
</template>
