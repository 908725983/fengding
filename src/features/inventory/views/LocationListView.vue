<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import InventorySubnav from '../components/InventorySubnav.vue'
import InventoryScenarioBar from '../components/InventoryScenarioBar.vue'
import { useInventoryStore } from '../runtime/inventory-store'
import type { EntityStatus, LocationImportRow } from '../types'
import './inventory-views.css'
import './inventory-dialog.css'

const store = useInventoryStore(); const { workspace, loading, error, scenario, actor, canWrite, saving } = storeToRefs(store)
const warehouseId = ref(''); const keyword = ref(''); const importOpen = ref(false); const previewErrors = ref<string[]>([])
const csv = ref('warehouseCode,locationCode,locationName,status,note\nDEMO-WH-01,DEMO-C-01,演示新库位,enabled,原型导入')
const rows = computed(() => workspace.value.locations.filter((item) => !warehouseId.value || item.warehouseId === warehouseId.value).filter((item) => !keyword.value || [item.code, item.name, item.note].some((value) => value?.includes(keyword.value))))
const products = (id: string) => [...new Set(workspace.value.batches.filter((item) => item.location.id === id && item.quantityMilli > 0).map((item) => item.sku?.productName ?? item.batch.skuId))].join('、') || '—'
function parse(): LocationImportRow[] { return csv.value.trim().split(/\r?\n/).slice(1).filter(Boolean).map((line) => { const [warehouseCode, locationCode, locationName, status, note = ''] = line.split(','); return { warehouseCode: warehouseCode ?? '', locationCode: locationCode ?? '', locationName: locationName ?? '', status: status as EntityStatus, note: note || null } }) }
function preview() { previewErrors.value = store.previewLocationImport(parse()).errors }
async function submit() { preview(); if (previewErrors.value.length) return; await store.importLocations(parse()); importOpen.value = false }
function download() { const selected = warehouseId.value ? rows.value.map((item) => item.id) : []; const blob = new Blob([store.exportLocations(selected)], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'inventory-locations.csv'; anchor.click(); URL.revokeObjectURL(url) }
onMounted(() => store.load())
</script>

<template>
  <section class="inventory-page"><header class="inventory-header"><div><h1>库位管理</h1><p>左侧按实体/虚拟仓分组选择；商品列由当前非零余额动态聚合。</p></div><InventoryScenarioBar :scenario="scenario" :role="actor.role" @scenario="store.setScenario" @role="store.setRole" /></header><InventorySubnav />
    <div class="warehouse-grid"><aside class="warehouse-nav"><strong>仓库导航</strong><button :class="{ active: !warehouseId }" @click="warehouseId = ''">全部仓库</button><template v-for="type in ['physical', 'virtual']" :key="type"><small>{{ type === 'physical' ? '实体仓' : '虚拟仓' }}</small><button v-for="item in workspace.warehouses.filter((warehouse) => warehouse.type === type)" :key="item.id" :class="{ active: warehouseId === item.id }" @click="warehouseId = item.id">{{ item.name }}</button></template></aside>
      <main><div class="inventory-panel inventory-filter"><label class="keyword">库位编码 / 名称<input v-model="keyword"></label><button v-if="canWrite" class="inv-button" @click="download">导出 CSV</button><button v-if="canWrite" class="inv-button" @click="importOpen = true">导入 CSV</button><RouterLink v-if="canWrite" class="inv-button primary" :to="`/inventory/locations/new${warehouseId ? `?warehouseId=${warehouseId}` : ''}`">新增库位</RouterLink></div>
        <div v-if="error" class="inventory-state error">{{ error }}</div><div v-else-if="loading" class="inventory-state">正在加载库位…</div><div v-else-if="!rows.length" class="inventory-state">暂无库位</div><div v-else class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th>仓库</th><th>库位编码</th><th>库位名称</th><th>当前存放商品</th><th>状态</th><th>备注</th><th>操作</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td>{{ workspace.warehouses.find((item) => item.id === row.warehouseId)?.name }}</td><td>{{ row.code }}</td><td>{{ row.name }}</td><td>{{ products(row.id) }}</td><td><span class="inv-status" :class="`inv-status-${row.status}`">{{ row.status === 'enabled' ? '启用' : '禁用' }}</span></td><td>{{ row.note ?? '—' }}</td><td><RouterLink v-if="canWrite" :to="`/inventory/locations/${row.id}/edit`">编辑</RouterLink><span v-else>只读</span></td></tr></tbody></table></div></main></div>
    <div v-if="importOpen" class="inventory-modal"><section class="inventory-panel inventory-modal__card"><h2>库位 CSV 导入</h2><p>列：warehouseCode, locationCode, locationName, status, note。先预览，任一错误整批拒绝。</p><textarea v-model="csv" rows="8" style="width:100%"></textarea><ul v-if="previewErrors.length" class="inventory-warning"><li v-for="item in previewErrors" :key="item">{{ item }}</li></ul><div style="display:flex;gap:8px;margin-top:12px"><button class="inv-button" @click="importOpen = false">取消</button><button class="inv-button" @click="preview">预览校验</button><button class="inv-button primary" :disabled="saving || previewErrors.length > 0" @click="submit">原子导入</button></div></section></div>
  </section>
</template>
