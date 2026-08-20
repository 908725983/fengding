<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ProcurementScenarioBar from '../components/ProcurementScenarioBar.vue'
import ProcurementSubnav from '../components/ProcurementSubnav.vue'
import { useReplenishmentStore } from '../runtime/replenishment-store'
import type { ProcurementRole } from '../types'
import './procurement-views.css'; import './replenishment.css'
const props = withDefaults(defineProps<{ kind: 'stock' | 'order' }>(), { kind: 'stock' })
const store = useReplenishmentStore(); const { result, loading, error, scenario, actor } = storeToRefs(store); const selected = ref<string[]>([]); const supplierByRow = ref<Record<string, string>>({})
const rows = computed(() => result.value.rows.filter((row) => row.availability === 'available'))
const toggle = (id: string) => { selected.value = selected.value.includes(id) ? selected.value.filter((item) => item !== id) : [...selected.value, id] }
function confirm() { const chosen = result.value.rows.filter((row) => selected.value.includes(row.id)); const draft = store.createDraft(chosen); window.alert(`已生成${props.kind === 'stock' ? '按库存' : '按订单'}候选草稿 ${draft.id}，请在 PUR-002 中继续`) }
onMounted(() => { store.setMode(props.kind === 'stock' ? 'combined' : 'shortage'); store.load() })
</script>
<template><section class="procurement-page"><header class="procurement-header"><div><h1>{{ kind === 'stock' ? '按库存采购' : '按订单采购' }}</h1><p>{{ kind === 'stock' ? '复用补货分析候选，选择供应商后交接给采购订单切片。' : '订单公开 provider 尚未接入；不会使用空数组或 0 伪造订单候选。' }}</p></div><ProcurementScenarioBar :scenario="scenario" :role="actor.role" @scenario="store.setScenario" @role="store.setRole" /></header><ProcurementSubnav/><div v-if="kind === 'order'" class="procurement-state"><span class="pur-status unavailable">不可用</span><strong>订单 provider 尚未接入</strong><p class="unavailable-note">按订单采购会在订单快照 provider 接入后提供状态、交货时间、仓库、客户和来源快照筛选。</p></div><template v-else><div v-if="error" class="procurement-state error">{{ error }}</div><div v-else-if="loading" class="procurement-state">正在加载库存候选…</div><div v-else-if="!rows.length" class="procurement-state"><strong>暂无可交接候选</strong><span>在途、可用库存或供应价 provider 不完整时，候选保持不可用。</span></div><div v-else class="procurement-table-wrap"><table class="procurement-table"><thead><tr><th>选择</th><th>仓库</th><th>商品 / SKU</th><th>建议采购数</th><th>供应商</th><th>供应价</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td><input type="checkbox" :checked="selected.includes(row.id)" @change="toggle(row.id)"></td><td>{{row.warehouseName}}</td><td>{{row.productName}}<small>{{row.skuCode}}</small></td><td>{{row.suggestedQuantity}} {{row.unitName}}</td><td><select v-model="supplierByRow[row.id]"><option value="">选择供应商</option><option v-for="candidate in row.supplierCandidates" :key="candidate.supplierId" :value="candidate.supplierId">{{candidate.supplierName}}</option></select></td><td>{{row.supplyPriceCents}} 分</td></tr></tbody></table></div><div class="procurement-toolbar"><span>已选择 {{selected.length}} 条</span><button class="pur-button primary" :disabled="!selected.length || !store.canWrite()" @click="confirm">生成候选草稿</button></div></template></section></template>
