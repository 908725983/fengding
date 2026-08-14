<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useOrderStore } from "../runtime/order-store";
import type { OrderStatus } from "../types";
import "./order-views.css";
const route = useRoute();
const store = useOrderStore();
const { sharedOrder, loading, saving, error } = storeToRefs(store);
const token = computed(() => String(route.params.token));
const money = (value: number) => `¥${(value / 100).toFixed(2)}`;
const statusLabels: Record<OrderStatus, string> = {
  "pending-order-review": "待订单审核",
  "pending-finance-review": "待财务审核",
  approved: "已审核（待出库）",
  "outbound-in-progress": "出库中",
  outbound: "已出库（待发货）",
  shipped: "已发货（待签收）",
  completed: "已完成",
  canceled: "已取消",
};
onMounted(() => store.viewShare(token.value));
</script>
<template>
  <main class="order-share-page">
    <header>
      <span class="order-share-brand">蜂订</span><small>客户订单安全分享</small>
    </header>
    <section v-if="loading" class="order-share-card">
      <strong>正在验证分享链接…</strong>
    </section>
    <section v-else-if="error || !sharedOrder" class="order-share-card error">
      <h1>链接无法访问</h1>
      <p>{{ error ?? "分享已失效" }}</p>
      <small>链接可能已过期、被重发替换，或订单已取消。</small>
    </section>
    <template v-else
      ><section class="order-share-card">
        <p class="eyebrow">{{ sharedOrder.orderNo }}</p>
        <h1>{{ sharedOrder.customerName }}</h1>
        <div class="order-share-meta">
          <span class="order-status">{{
            statusLabels[sharedOrder.status]
          }}</span
          ><span>{{
            sharedOrder.shareStatus === "confirmed"
              ? "已确认查看"
              : "已安全查看"
          }}</span>
        </div>
      </section>
      <section class="order-share-card">
        <h2>商品明细</h2>
        <article
          v-for="line in sharedOrder.lines"
          :key="`${line.skuCode}-${line.unitName}`"
          class="order-share-line"
        >
          <div>
            <strong>{{ line.productName }}</strong
            ><small>{{ line.skuCode }} · {{ line.specification }}</small>
          </div>
          <div>
            <span>{{ line.quantityMilli / 1000 }} {{ line.unitName }}</span
            ><strong>{{ money(line.subtotalCents) }}</strong>
          </div>
        </article>
      </section>
      <section class="order-share-card">
        <h2>金额</h2>
        <dl class="order-share-amounts">
          <div>
            <dt>原价</dt>
            <dd>{{ money(sharedOrder.amounts.originalAmountCents) }}</dd>
          </div>
          <div>
            <dt>商品优惠</dt>
            <dd>{{ money(sharedOrder.amounts.productDiscountCents) }}</dd>
          </div>
          <div>
            <dt>整单优惠</dt>
            <dd>{{ money(sharedOrder.amounts.orderDiscountCents) }}</dd>
          </div>
          <div>
            <dt>运费</dt>
            <dd>{{ money(sharedOrder.amounts.freightCents) }}</dd>
          </div>
          <div class="total">
            <dt>订单金额</dt>
            <dd>{{ money(sharedOrder.amounts.orderAmountCents) }}</dd>
          </div>
        </dl>
      </section>
      <section class="order-share-card">
        <h2>交付</h2>
        <p>
          {{
            {
              "door-delivery": "送货上门",
              logistics: "物流配送",
              "customer-pickup": "客户自提",
            }[sharedOrder.deliveryMethod]
          }}
          · {{ sharedOrder.requestedDeliveryAt.slice(0, 16).replace("T", " ") }}
        </p>
        <p class="order-share-safe">
          为保护隐私，本页面不展示电话、详细地址、信用/预收和内部操作日志。
        </p>
        <button
          v-if="sharedOrder.shareStatus !== 'confirmed'"
          class="order-button primary order-share-confirm"
          :disabled="saving"
          @click="store.confirmShare(token)"
        >
          {{ saving ? "确认中…" : "确认已查看" }}
        </button>
        <p v-else class="order-share-confirmed">
          ✓ 已确认查看；该动作不会审核订单或推进履约状态。
        </p>
      </section></template
    >
  </main>
</template>
