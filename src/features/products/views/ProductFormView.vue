<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, toRaw } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router'
import { validateProductDraft } from '../schemas/product-schema'
import { applyBaseUnit, createEmptyProductDraft, createEmptySkuDraft } from '../services/product-service'
import { useProductStore } from '../runtime/product-store'
import type { Product, ProductDraft, ProductMedia, ProductSkuDraft, RichTextDocument } from '../types'

const route = useRoute(); const router = useRouter(); const store = useProductStore()
const { references, selectedProduct, loading, saving, canWrite } = storeToRefs(store)
const isEdit = computed(() => Boolean(route.params.productId))
const draft = reactive<ProductDraft>(createEmptyProductDraft())
const descriptionText = ref('')
const errors = reactive<Record<string,string>>({})
const saveError = ref<string|null>(null)
const committed = ref(false); const initialSnapshot = ref('')
const dirty = computed(() => initialSnapshot.value !== '' && snapshot() !== initialSnapshot.value)

function snapshot(): string { return JSON.stringify({ draft: toRaw(draft), descriptionText: descriptionText.value }) }
function richTextFromText(value: string): RichTextDocument { return { version: 1, blocks: value.trim() ? value.split(/\n+/).map((text) => ({ type: 'paragraph' as const, text, marks: [] })) : [] } }
function productToDraft(product: Product): ProductDraft {
  const { id:_id, enterpriseId:_enterprise, status:_status, hasOrderReference:_reference, deletedAt:_deleted, createdAt:_created, updatedAt:_updated, skus, ...fields } = toRaw(product)
  return { ...structuredClone(fields), codeMode:'manual', code:product.code, skus:skus.map(({id:_skuId,enterpriseId:_skuEnt,productId:_productId,...sku}) => ({...structuredClone(sku),codeMode:'manual',code:sku.code})) }
}
function setDraft(value: ProductDraft, description?: string): void {
  Object.keys(draft).forEach((key) => delete (draft as unknown as Record<string,unknown>)[key])
  Object.assign(draft, structuredClone(value)); descriptionText.value = description ?? value.description.blocks.map((block) => block.text).join('\n')
  initialSnapshot.value = snapshot(); Object.keys(errors).forEach((key) => delete errors[key]); saveError.value = null
}
function plainDraft(): ProductDraft { const value=structuredClone(toRaw(draft)); value.description=richTextFromText(descriptionText.value); return value }
function fieldError(path:string):string|undefined{return errors[path]}
function onBaseUnitChange():void{Object.assign(draft,applyBaseUnit(structuredClone(toRaw(draft)),draft.baseUnitId))}
function addSku():void{const sku=createEmptySkuDraft();sku.specificationName='';sku.specificationValue='';draft.skus.push(sku)}
function removeSku(index:number):void{if(draft.skus.length<=1)return;draft.skus.splice(index,1)}
function moneyValue(sku:ProductSkuDraft,key:keyof ProductSkuDraft):string{const value=sku[key];return typeof value==='number'?(value/100).toFixed(2):''}
function setMoney(sku:ProductSkuDraft,key:keyof ProductSkuDraft,event:Event):void{const value=(event.target as HTMLInputElement).value;(sku as unknown as Record<string,unknown>)[key]=value===''?null:Math.round(Number(value)*100)}
function toggleTag(id:string):void{const index=draft.tagIds.indexOf(id);if(index>=0)draft.tagIds.splice(index,1);else draft.tagIds.push(id)}
function fakeMedia(kind:'sku'|'carousel',index=0):void{const sequence=kind==='sku'?index+1:draft.carouselImages.length+1;const media:ProductMedia={id:`fake-media-${kind}-${sequence}`,name:'prototype-image.webp',mimeType:'image/webp',sizeBytes:128000};if(kind==='sku')draft.skus[index]!.mainImage=media;else if(draft.carouselImages.length<5)draft.carouselImages.push(media);window.alert('原型模拟：仅保存虚构资源 ID，未上传真实文件')}
function showTutorial():void{window.alert('原型模拟：商品视频教程尚未接入')}
function clearForm():void{if(dirty.value&&!window.confirm('当前内容尚未保存，确认清空表单吗？'))return;if(isEdit.value&&selectedProduct.value)setDraft(productToDraft(selectedProduct.value));else setDraft(createEmptyProductDraft())}

async function save(saveAndNew:boolean):Promise<void>{
  Object.keys(errors).forEach((key)=>delete errors[key]);const value=plainDraft();for(const issue of validateProductDraft(value))if(!errors[issue.path])errors[issue.path]=issue.message
  if(Object.keys(errors).length){await nextTick();document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();return}
  saveError.value=null
  try{const saved=isEdit.value?await store.updateProduct(String(route.params.productId),value):await store.createProduct(value);committed.value=true;if(saveAndNew){if(isEdit.value)await router.push('/products/new');setDraft(createEmptyProductDraft());await nextTick();committed.value=false}else await router.push(`/products/${saved.id}`)}catch(caught){saveError.value=caught instanceof Error?caught.message:'商品保存失败'}
}

onBeforeRouteLeave(()=>{if(!committed.value&&dirty.value&&!window.confirm('存在未保存内容，确认离开吗？'))return false})
onMounted(async()=>{if(isEdit.value){await store.loadProduct(String(route.params.productId));if(selectedProduct.value)setDraft(productToDraft(selectedProduct.value))}else{await store.load();setDraft(createEmptyProductDraft())}})
</script>

<template>
  <section class="form-page"><header class="form-header"><div><RouterLink class="back" :to="isEdit?`/products/${route.params.productId}`:'/products'">← 返回</RouterLink><p class="eyebrow">PRD-001 · 商品档案</p><h1>{{ isEdit?'编辑商品':'新增商品' }}</h1><p>价格按 SKU 保存；最终客户价格、授权和拼套商品不属于本切片。</p></div><div v-if="canWrite" class="actions"><button class="button" type="button" @click="clearForm">清空表单</button><button class="button" type="button" @click="showTutorial">视频教程</button><button class="button" :disabled="saving" type="button" @click="save(true)">保存并新增</button><button class="button primary" :disabled="saving" type="button" @click="save(false)">{{ saving?'保存中…':'保存' }}</button></div></header>
    <div v-if="loading" class="form-state">正在加载商品资料…</div><p v-if="!canWrite&&!loading" class="form-error">当前角色只有商品只读权限，不能编辑。</p><p v-if="saveError" class="form-error" role="alert">{{ saveError }}</p>
    <form v-if="!loading&&canWrite" class="product-form" @submit.prevent="save(false)"><main>
      <section class="card"><h2>商品信息</h2><div class="grid"><label><span>商品名称 *</span><input v-model="draft.name" maxlength="80" :aria-invalid="Boolean(fieldError('name'))"><em>{{fieldError('name')}}</em></label><label><span>商品分类 *</span><select v-model="draft.categoryId" :aria-invalid="Boolean(fieldError('categoryId'))"><option value="">请选择分类</option><option v-for="item in references.categories.filter(i=>i.status==='active')" :key="item.id" :value="item.id">{{item.name}}</option></select><em>{{fieldError('categoryId')}}</em></label><label><span>基本单位 *</span><select v-model="draft.baseUnitId" :aria-invalid="Boolean(fieldError('baseUnitId'))" @change="onBaseUnitChange"><option value="">请选择单位</option><option v-for="item in references.units.filter(i=>i.status==='active')" :key="item.id" :value="item.id">{{item.name}}</option></select><em>{{fieldError('baseUnitId')}}</em></label><label><span>商品品牌</span><select v-model="draft.brandId"><option :value="null">请选择</option><option v-for="item in references.brands.filter(i=>i.status==='active')" :key="item.id" :value="item.id">{{item.name}}</option></select></label></div><p class="scope">商品编号由系统管理；页面对外只使用 SKU 编码。</p></section>
      <section class="card"><div class="section-title"><div><h2>SKU 与销售价格</h2><p>简单商品默认一条 SKU；只有存在多规格时才添加新行。</p></div><button class="button" type="button" @click="addSku">添加规格</button></div><div class="sku-card" v-for="(sku,index) in draft.skus" :key="index"><div class="sku-title"><strong>SKU {{index+1}}</strong><button type="button" :disabled="draft.skus.length<=1" @click="removeSku(index)">移除</button></div><div class="grid four"><template v-if="draft.skus.length>1"><label><span>规格名称 *</span><input v-model="sku.specificationName" :aria-invalid="Boolean(fieldError(`skus.${index}.specificationName`))"><em>{{fieldError(`skus.${index}.specificationName`)}}</em></label><label><span>规格值 *</span><input v-model="sku.specificationValue" :aria-invalid="Boolean(fieldError(`skus.${index}.specificationValue`))"><em>{{fieldError(`skus.${index}.specificationValue`)}}</em></label></template><label><span>商品编码</span><input v-model="sku.code" :disabled="sku.codeMode==='auto'" placeholder="系统自动生成" :aria-invalid="Boolean(fieldError(`skus.${index}.code`))"><em>{{fieldError(`skus.${index}.code`)}}</em></label><label><span>商品条码</span><input v-model="sku.barcode" placeholder="使用扫码时填写" :aria-invalid="Boolean(fieldError('skus.barcode'))"></label><div class="media-field"><span>主图（可选）</span><button class="button" type="button" @click="fakeMedia('sku',index)">{{sku.mainImage?'更换主图':'选择主图'}}</button></div></div><div class="price-grid compact"><label v-for="item in ([['baseOrderPriceCents','市场价'],['minimumSalePriceCents','最低售价'],['maximumSalePriceCents','最高售价']] as const)" :key="item[0]"><span>{{item[1]}}（元）</span><input :value="moneyValue(sku,item[0])" type="number" min="0" step="0.01" :aria-invalid="Boolean(fieldError(`skus.${index}.${item[0]}`))" @input="setMoney(sku,item[0],$event)"><em>{{fieldError(`skus.${index}.${item[0]}`)}}</em></label></div></div></section>
      <section class="card"><h2>库存规则（可选）</h2><div class="grid"><label><span>重量（kg）</span><input v-model.number="draft.weightKg" type="number" min="0" step="0.001"></label><label><span>产地</span><input v-model="draft.origin"></label><label><span>保质期（天）</span><input v-model.number="draft.shelfLifeDays" type="number" min="0" step="1"></label><label><span>起订量</span><input v-model.number="draft.minimumOrderQuantity" type="number" min="0" step="1"></label><label><span>订货倍数</span><input v-model.number="draft.orderMultiple" type="number" min="1" step="1" :aria-invalid="Boolean(fieldError('orderMultiple'))"><em>{{fieldError('orderMultiple')}}</em></label><label class="check"><input v-model="draft.manageProductionDate" type="checkbox">需要批次/生产日期管理</label></div></section>
      <section class="card"><h2>商品描述（可选）</h2><textarea v-model="descriptionText" rows="5" placeholder="需要展示给客户时再填写"></textarea></section>
    </main><aside>
      <section v-if="references.tags.some(i=>i.status==='active')" class="card"><h2>商品标签（可选）</h2><label v-for="tag in references.tags.filter(i=>i.status==='active')" :key="tag.id" class="check"><input type="checkbox" :checked="draft.tagIds.includes(tag.id)" @change="toggleTag(tag.id)">{{tag.name}}</label></section>
    </aside></form>
  </section>
</template>

<style scoped>
.form-page{max-width:1550px;margin:0 auto}.form-header{display:flex;gap:20px;align-items:flex-end;justify-content:space-between;margin-bottom:15px}.form-header h1{margin:3px 0}.form-header p{margin-bottom:0;color:var(--color-muted)}.back{color:var(--color-primary-strong);text-decoration:none}.actions{display:flex;gap:7px}.button{min-height:36px;padding:0 13px;color:#4d5968;background:#fff;border:1px solid var(--color-border-strong);border-radius:5px}.button.primary{color:#fff;background:var(--color-primary);border-color:var(--color-primary)}.button:disabled{opacity:.5}.form-error{padding:10px;color:var(--color-danger);background:#fff0f0}.form-state{display:grid;min-height:320px;place-items:center;background:#fff;border:1px solid var(--color-border)}.product-form{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:14px}.product-form main,.product-form aside{display:grid;align-content:start;gap:14px}.card{padding:18px;background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-md)}.card h2{margin-bottom:14px;font-size:16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 17px}.grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}.card label,.media-field{display:grid;align-content:start;gap:4px;color:var(--color-muted);font-size:12px}.card input,.card select,.card textarea{width:100%;min-height:36px;padding:6px 9px;color:var(--color-text);background:#fff;border:1px solid var(--color-border-strong);border-radius:5px}.card textarea{resize:vertical}.card [aria-invalid=true]{border-color:var(--color-danger)}.card em{min-height:14px;color:var(--color-danger);font-size:11px;font-style:normal}.section-title,.sku-title{display:flex;align-items:center;justify-content:space-between}.section-title p{margin:0;color:var(--color-muted);font-size:12px}.sku-card{margin-top:13px;padding:14px;background:#fafcfd;border:1px solid var(--color-border);border-radius:7px}.sku-title{margin-bottom:12px}.sku-title button{color:var(--color-danger);background:transparent;border:0}.price-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:12px;padding-top:12px;border-top:1px dashed var(--color-border)}.check{display:flex!important;grid-auto-flow:column;justify-content:start;align-items:center!important}.check input{width:auto;min-height:auto}.scope{margin:10px 0 0;color:var(--color-muted);font-size:12px}.unit-row{display:grid;grid-template-columns:1fr 110px;gap:8px;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--color-border)}.unit-row small{color:#8993a1}.product-form aside>.card>label{margin-top:9px}.product-form aside p{color:var(--color-muted);font-size:12px}
@media(max-width:1150px){.product-form{grid-template-columns:1fr}.product-form aside{grid-template-columns:repeat(2,minmax(0,1fr))}.grid.four,.price-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.form-header{align-items:flex-start;flex-direction:column}.actions{flex-wrap:wrap}}@media(max-width:650px){.grid,.grid.four,.price-grid,.product-form aside{grid-template-columns:1fr}.actions{display:grid;grid-template-columns:repeat(2,1fr);width:100%}}
</style>
