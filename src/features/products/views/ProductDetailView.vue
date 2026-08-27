<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useProductStore } from '../runtime/product-store'
import type { ProductStatus } from '../types'
import ProductAuthorizationPanel from '../authorization/components/ProductAuthorizationPanel.vue'

const route = useRoute()
const router = useRouter()
const store = useProductStore()
const { selectedProduct: product, references, changeLogs, loading, error, canWrite } = storeToRefs(store)
const actionError = ref<string | null>(null)
const activeTab = ref(route.query.tab === 'authorization' ? 'authorization' : 'description')
const statusLabels = { draft: '草稿', 'on-sale': '上架', 'off-sale': '下架' } as const
const categoryName = computed(() => references.value.categories.find((item) => item.id === product.value?.categoryId)?.name ?? '—')
const brandName = computed(() => references.value.brands.find((item) => item.id === product.value?.brandId)?.name ?? '—')
const unitName = (id: string) => references.value.units.find((item) => item.id === id)?.name ?? '—'
const tagNames = computed(() => references.value.tags.filter((tag) => product.value?.tagIds.includes(tag.id)).map((tag) => tag.name))

function money(value: number | null): string { return value === null ? '—' : `¥ ${(value / 100).toFixed(2)}` }
function display(value: string | number | null): string { return value === null || value === '' ? '—' : String(value) }

async function changeStatus(target: ProductStatus): Promise<void> {
  if (!product.value || !window.confirm(`确认将商品状态改为“${statusLabels[target]}”吗？`)) return
  actionError.value = null
  try { await store.changeStatus(product.value.id, target) }
  catch (caught) { actionError.value = caught instanceof Error ? caught.message : '状态操作失败' }
}

async function remove(): Promise<void> {
  if (!product.value || !window.confirm(`确认删除商品“${product.value.name}”吗？该操作会标记删除，编码不会复用。`)) return
  actionError.value = null
  try { await store.deleteProduct(product.value.id); await router.push('/products') }
  catch (caught) { actionError.value = caught instanceof Error ? caught.message : '删除失败' }
}

onMounted(() => store.loadProduct(String(route.params.productId)))
</script>

<template>
  <section class="detail-page">
    <div v-if="loading" class="detail-state">正在加载商品详情…</div>
    <div v-else-if="error || !product" class="detail-state error"><strong>无法打开商品详情</strong><p>{{ error ?? '商品不存在' }}</p><RouterLink to="/products">返回商品列表</RouterLink></div>
    <template v-else>
      <header class="detail-header"><div><RouterLink class="back" to="/products">← 商品列表</RouterLink><p class="eyebrow">{{ product.code }}</p><h1>{{ product.name }}</h1><p>{{ categoryName }} · {{ product.skus.length }} 个 SKU · {{ unitName(product.baseUnitId) }}</p></div><div class="actions"><RouterLink v-if="canWrite" class="button" :to="`/products/${product.id}/edit`">编辑资料</RouterLink><button v-if="canWrite && (product.status === 'draft' || product.status === 'off-sale')" class="button primary" type="button" @click="changeStatus('on-sale')">上架</button><button v-if="canWrite && product.status === 'on-sale'" class="button" type="button" @click="changeStatus('off-sale')">下架</button><button v-if="canWrite && product.status !== 'on-sale'" class="button danger" type="button" @click="remove">删除</button></div></header>
      <p v-if="actionError" class="action-error" role="alert">{{ actionError }}</p>
      <nav class="tabs"><button :class="{active:activeTab==='description'}" type="button" @click="activeTab='description'">商品描述</button><button :class="{active:activeTab==='authorization'}" type="button" @click="activeTab='authorization'">商品授权</button></nav>
      <ProductAuthorizationPanel v-if="activeTab==='authorization'" :product-id="product.id" class="authorization-tab" />
      <div v-else class="detail-grid"><main>
        <section class="card"><h2>基础信息</h2><dl class="fields"><div><dt>SPU 编码</dt><dd>{{ product.code }}</dd></div><div><dt>状态</dt><dd><span class="status" :class="`status-${product.status}`">{{ statusLabels[product.status] }}</span></dd></div><div><dt>商品名称</dt><dd>{{ product.name }}</dd></div><div><dt>商品简称</dt><dd>{{ display(product.shortName) }}</dd></div><div><dt>商品分类</dt><dd>{{ categoryName }}</dd></div><div><dt>商品品牌</dt><dd>{{ brandName }}</dd></div><div><dt>基本单位</dt><dd>{{ unitName(product.baseUnitId) }}</dd></div><div><dt>商品类型</dt><dd>普通商品</dd></div><div><dt>标签</dt><dd>{{ tagNames.join('、') || '—' }}</dd></div><div><dt>创建时间</dt><dd>{{ product.createdAt }}</dd></div></dl></section>
        <section class="card"><h2>SKU 与价格资料</h2><div class="sku-wrap"><table><thead><tr><th>规格</th><th>SKU 编码</th><th>条码</th><th>基准进货价</th><th>市场价</th><th>售价范围</th><th>四级订货价</th></tr></thead><tbody><tr v-for="sku in product.skus" :key="sku.id"><td>{{ sku.specificationName }}：{{ sku.specificationValue }}</td><td class="mono">{{ sku.code }}</td><td>{{ display(sku.barcode) }}</td><td>{{ money(sku.basePurchasePriceCents) }}</td><td>{{ money(sku.baseOrderPriceCents) }}</td><td>{{ money(sku.minimumSalePriceCents) }}～{{ money(sku.maximumSalePriceCents) }}</td><td>{{ [sku.tierOnePriceCents, sku.tierTwoPriceCents, sku.storePriceCents, sku.terminalPriceCents].map(money).join(' / ') }}</td></tr></tbody></table></div><p class="scope">这里只展示价格资料；客户最终价解析属于 PRD-002。</p></section>
        <section class="card"><h2>商品图片</h2><div class="images"><div v-for="sku in product.skus" :key="sku.id"><span>图</span><small>{{ sku.specificationValue }} · {{ sku.mainImage?.name ?? '占位图' }}</small></div><div v-for="image in product.carouselImages" :key="image.id"><span>轮</span><small>{{ image.name }}</small></div><em v-if="!product.carouselImages.length">轮播图暂无</em></div><p class="scope">原型只保存 fake 资源 ID，不上传真实文件；MP4 规划中。</p></section>
        <section class="card"><h2>商品描述</h2><div class="description"><template v-for="(block,index) in product.description.blocks" :key="index"><h3 v-if="block.type === 'heading'">{{ block.text }}</h3><li v-else-if="block.type === 'list-item'">{{ block.text }}</li><p v-else-if="block.type === 'paragraph'">{{ block.text }}</p><span v-else>原型图片：{{ block.resourceId }}</span></template><em v-if="!product.description.blocks.length">暂无描述</em></div></section>
      </main><aside>
        <section class="card"><h2>四维场景单位</h2><dl class="unit-list"><div v-for="(label,key) in { inventory:'库存', procurement:'采购', distribution:'分销', sales:'销售' }" :key="key"><dt>{{ label }}单位</dt><dd>{{ unitName(product.sceneUnits[key as keyof typeof product.sceneUnits].unitId) }} <small>× {{ product.sceneUnits[key as keyof typeof product.sceneUnits].conversionRate }} 基本单位</small></dd></div></dl></section>
        <section class="card"><h2>辅助与物流</h2><dl class="side-fields"><div><dt>重量</dt><dd>{{ product.weightKg === null ? '—' : `${product.weightKg} kg` }}</dd></div><div><dt>产地</dt><dd>{{ display(product.origin) }}</dd></div><div><dt>保质期</dt><dd>{{ product.shelfLifeDays === null ? '—' : `${product.shelfLifeDays} 天` }}</dd></div><div><dt>起订量</dt><dd>{{ display(product.minimumOrderQuantity) }}</dd></div><div><dt>订货倍数</dt><dd>{{ product.orderMultiple }}</dd></div><div><dt>销售税率</dt><dd>{{ product.salesTaxRatePercent === null ? '—' : `${product.salesTaxRatePercent}%` }}</dd></div><div><dt>包邮</dt><dd>{{ product.freeShipping ? '是' : '否' }}</dd></div><div><dt>运费模板</dt><dd>数据源未接入</dd></div></dl></section>
        <section class="card"><h2>操作日志</h2><ol class="logs"><li v-for="log in changeLogs" :key="log.id"><strong>{{ log.detail }}</strong><time>{{ log.createdAt }}</time></li><li v-if="!changeLogs.length">暂无操作日志</li></ol></section>
      </aside></div>
    </template>
  </section>
</template>

<style scoped>
.detail-page{max-width:1500px;margin:0 auto}.detail-header{display:flex;gap:20px;align-items:flex-end;justify-content:space-between;margin-bottom:15px}.detail-header h1{margin:3px 0}.detail-header p{margin-bottom:0;color:var(--color-muted)}.back{color:var(--color-primary-strong);text-decoration:none}.actions{display:flex;gap:8px}.button{display:inline-flex;min-height:36px;align-items:center;padding:0 13px;color:#4d5968;background:#fff;border:1px solid var(--color-border-strong);border-radius:5px;text-decoration:none}.button.primary{color:#fff;background:var(--color-primary);border-color:var(--color-primary)}.button.danger{color:var(--color-danger);border-color:#efbcbc}.action-error{padding:10px;color:var(--color-danger);background:#fff0f0}.tabs{display:flex;gap:22px;min-height:44px;align-items:center;padding:0 15px;background:#fff;border:1px solid var(--color-border)}.tabs button{align-self:stretch;padding:0;color:var(--color-muted);background:none;border:0;border-bottom:2px solid transparent;cursor:pointer}.tabs button.active{color:var(--color-primary-strong);border-bottom-color:var(--color-primary)}.tabs span{color:var(--color-muted);font-size:12px}.authorization-tab{margin-top:14px}.detail-grid{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:14px;margin-top:14px}.detail-grid main,.detail-grid aside{display:grid;align-content:start;gap:14px}.card{padding:18px;background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-md)}.card h2{margin-bottom:15px;font-size:16px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 22px;margin:0}.fields dt,.unit-list dt,.side-fields dt{color:var(--color-muted);font-size:12px}.fields dd,.unit-list dd,.side-fields dd{margin:3px 0 0}.status{padding:3px 8px;border-radius:999px;font-size:12px}.status-draft{color:#697586;background:#eef1f5}.status-on-sale{color:var(--color-success);background:var(--color-success-soft)}.status-off-sale{color:var(--color-warning);background:#fff7e6}.sku-wrap{overflow-x:auto}.sku-wrap table{width:100%;min-width:900px;border-collapse:collapse}.sku-wrap th,.sku-wrap td{padding:9px;text-align:left;border-bottom:1px solid var(--color-border)}.sku-wrap th{font-size:12px;background:var(--color-table-head)}.mono{font-family:"Cascadia Code",Consolas,monospace}.scope{margin:12px 0 0;color:var(--color-muted);font-size:12px}.images{display:flex;gap:10px;flex-wrap:wrap}.images div{display:grid;gap:5px;width:105px}.images span{display:grid;height:78px;place-items:center;color:#82909f;background:#eef2f5;border-radius:6px}.images small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.images em,.description em{color:var(--color-muted);font-style:normal}.description p{margin-bottom:8px}.unit-list,.side-fields{display:grid;gap:12px;margin:0}.unit-list div,.side-fields div{padding-bottom:10px;border-bottom:1px solid var(--color-border)}.unit-list small{color:var(--color-muted)}.logs{display:grid;gap:10px;padding-left:18px;margin:0}.logs strong,.logs time{display:block}.logs strong{font-size:12px}.logs time{color:var(--color-muted);font-size:11px}.detail-state{display:grid;min-height:350px;place-items:center;align-content:center;gap:8px;background:#fff;border:1px solid var(--color-border)}.detail-state.error{color:var(--color-danger)}.detail-state p{margin:0}.detail-state a{color:var(--color-primary-strong)}
@media(max-width:1050px){.detail-grid{grid-template-columns:1fr}.detail-header{align-items:flex-start;flex-direction:column}.tabs{overflow-x:auto}.tabs>*{flex:0 0 auto}}@media(max-width:650px){.fields{grid-template-columns:1fr}.actions{flex-wrap:wrap}}
</style>
