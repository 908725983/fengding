<script setup lang="ts">
import { ref } from 'vue'
import type { DistributionSkuSnapshot, SuggestedProductLine } from '../types'
const lines = defineModel<SuggestedProductLine[]>({ required: true })
const props = defineProps<{ skus: DistributionSkuSnapshot[]; max: number; mode: 'plan'|'template'; disabled?: boolean }>()
const selectedSkuId = ref('')
function sku(id:string){return props.skus.find((item)=>item.skuId===id)}
function add(){if(!selectedSkuId.value||lines.value.some(x=>x.skuId===selectedSkuId.value)||lines.value.length>=props.max)return;const item=sku(selectedSkuId.value);lines.value=[...lines.value,{skuId:selectedSkuId.value,quantity:item?Math.ceil(Math.max(item.minimumOrderQuantity??1,1)/item.orderMultiple)*item.orderMultiple:1}];selectedSkuId.value=''}
function remove(index:number){lines.value=lines.value.filter((_,i)=>i!==index)}
function money(cents:number|null){return cents===null?'—':`¥ ${(cents/100).toFixed(2)}`}
</script>
<template><fieldset class="line-editor" :disabled="disabled"><legend>商品明细 *（SKU 粒度，{{lines.length}} / {{max}}）</legend><div class="line-picker"><select v-model="selectedSkuId"><option value="">选择商品 SKU</option><option v-for="item in skus.filter(x=>x.deletedAt===null)" :key="item.skuId" :value="item.skuId">{{item.skuCode}} · {{item.productName}} · {{item.specification}}</option></select><button class="button" type="button" :disabled="!selectedSkuId||lines.length>=max" @click="add">添加商品</button></div><div v-if="!lines.length" class="line-empty">至少添加 1 个 SKU</div><div v-for="(line,index) in lines" :key="line.skuId" class="line-row"><div><strong>{{sku(line.skuId)?.productName??'引用的 SKU 已不可用'}}</strong><small>{{sku(line.skuId)?.skuCode??line.skuId}} · {{sku(line.skuId)?.specification??'—'}} · {{sku(line.skuId)?.baseUnitName??'—'}} · 市场价 {{money(sku(line.skuId)?.marketPriceCents??null)}}</small></div><label><span>数量</span><input v-model.number="line.quantity" type="number" min="1" step="1"></label><button class="link danger" type="button" @click="remove(index)">移除</button></div><p class="hint">{{mode==='plan'?'铺货数量必须满足起订量和订货倍数，不合法行会在解析时跳过并说明原因。':'模板加载时会把数量向上归一到合法起订量与订货倍数，并标注调整。'}}</p></fieldset></template>
