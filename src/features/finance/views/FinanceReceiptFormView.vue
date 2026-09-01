<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import FinanceSubnav from "../components/FinanceSubnav.vue";
import { useFinanceStore } from "../runtime/finance-store";
import type { CustomerReceiptMethod } from "../types";
import "./finance-views.css";
import "./finance-receivable-views.css";
const store = useFinanceStore();
const route = useRoute();
const router = useRouter();
const { receivableDocuments, accounts, settlementSources, saving, error } =
  storeToRefs(store);
const form = reactive({
  customerId: String(route.query.customerId ?? ""),
  orderId: String(route.query.orderId ?? ""),
  occurredAt: "2026-08-10T10:00",
  amountYuan: "",
  method: "bank" as CustomerReceiptMethod,
  accountId: "account-bank",
  immediate: false,
  receivableId: "",
  cashYuan: "",
  discountYuan: "",
  prepaymentSourceId: "",
  note: "",
});
const localError = ref("");
const customers = computed(() => [
  ...new Map(
    receivableDocuments.value.map((r) => [
      r.customerSnapshot.id,
      r.customerSnapshot,
    ]),
  ).values(),
]);
const targets = computed(() =>
  receivableDocuments.value.filter(
    (r) => r.customerSnapshot.id === form.customerId && r.outstandingCents > 0,
  ),
);
const matchingAccounts = computed(() =>
  accounts.value.filter(
    (r) => r.account.status === "enabled" && r.account.type === form.method,
  ),
);
const yuan = (v: string) => Math.round(Number(v) * 100);
watch(
  () => form.customerId,
  async () => {
    form.receivableId = targets.value[0]?.id ?? "";
    if (form.method === "balance" && form.customerId)
      await store.loadSettlementSources(form.customerId);
  },
);
watch(
  () => form.method,
  async () => {
    form.accountId = matchingAccounts.value[0]?.account.id ?? "";
    if (form.method === "balance") {
      form.immediate = true;
      if (form.customerId) await store.loadSettlementSources(form.customerId);
    }
  },
);
async function submit() {
  localError.value = "";
  const customer = customers.value.find((v) => v.id === form.customerId);
  if (!customer) {
    localError.value = "请选择客户";
    return;
  }
  try {
    const immediate = form.immediate
      ? [
          {
            receivableId: form.receivableId,
            cashCents: yuan(form.cashYuan || form.amountYuan),
            discountCents: yuan(form.discountYuan || "0"),
            ...(form.method === "balance"
              ? { prepaymentSourceId: form.prepaymentSourceId }
              : {}),
          },
        ]
      : undefined;
    const value = await store.createReceipt({
      customerSnapshot: customer,
      orderId: form.orderId || null,
      occurredAt: `${form.occurredAt}:00+08:00`,
      amountCents: yuan(form.amountYuan),
      method: form.method,
      accountId: form.method === "balance" ? null : form.accountId || null,
      attachment: null,
      note: form.note || null,
      immediateAllocations: immediate,
    });
    await router.push(`/finance/receipts/${value.receipt.id}`);
  } catch (caught) {
    localError.value = caught instanceof Error ? caught.message : "保存失败";
  }
}
onMounted(async () => {
  await Promise.all([store.loadReceivables(), store.loadAccounts()]);
  if (!form.customerId) form.customerId = customers.value[0]?.id ?? "";
  form.receivableId = targets.value[0]?.id ?? "";
});
</script>
<template>
  <section class="finance-page">
    <header class="finance-header">
      <div>
        <h1>新增收款单</h1>
        <p>
          真实收款必须选择同类型的启用账户；预收余额只在核销时使用。
        </p>
      </div>
    </header>
    <FinanceSubnav />
    <div class="finance-panel">
      <form class="finance-form" @submit.prevent="submit">
        <label
          >客户<select v-model="form.customerId" required>
            <option value="">请选择</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">
              {{ c.code }} · {{ c.name }}
            </option>
          </select></label
        ><label
          >关联订单<select v-model="form.orderId">
            <option value="">不指定</option>
            <option v-for="r in targets" :key="r.id" :value="r.orderId">
              {{ r.orderNo }} · 待收 ¥{{
                (r.outstandingCents / 100).toFixed(2)
              }}
            </option>
          </select></label
        ><label
          >收款日期<input
            v-model="form.occurredAt"
            type="datetime-local"
            max="2026-08-10T23:59"
            required /></label
        ><label
          >收款金额（元）<input
            v-model="form.amountYuan"
            type="number"
            min="0.01"
            step="0.01"
            required /></label
        ><label
          >收款方式<select v-model="form.method">
            <option value="cash">现金</option>
            <option value="bank">银行转账</option>
            <option value="wechat">微信</option>
            <option value="alipay">支付宝</option>
          </select></label
        ><label
          >收款账户<select v-model="form.accountId" required>
            <option
              v-for="row in matchingAccounts"
              :key="row.account.id"
              :value="row.account.id"
            >
              {{ row.account.name }}
            </option>
          </select></label
        ><label class="check-row"
          ><input v-model="form.immediate" type="checkbox" />
          是否立即核销（默认否）</label
        ><template v-if="form.immediate"
          ><label
            >待核销应收<select v-model="form.receivableId" required>
              <option v-for="r in targets" :key="r.id" :value="r.id">
                {{ r.receivableNo }} · {{ r.orderNo }} · 待收 ¥{{
                  (r.outstandingCents / 100).toFixed(2)
                }}
              </option>
            </select></label
          ><label
            >现金/预收核销（元）<input
              v-model="form.cashYuan"
              type="number"
              min="0"
              step="0.01"
              placeholder="默认等于收款金额" /></label
          ><label
            >优惠金额（元）<input
              v-model="form.discountYuan"
              type="number"
              min="0"
              step="0.01"
              value="0" /></label></template
        ><label class="wide"
          >备注<textarea
            v-model="form.note"
            rows="3"
            :required="Number(form.discountYuan) > 0"
            placeholder="使用优惠时必填"
          ></textarea>
        </label>
        <p v-if="localError || error" class="finance-warning wide">
          {{ localError || error }}
        </p>
        <div class="finance-actions">
          <button class="fin-button primary" :disabled="saving">
            {{ saving ? "正在确认…" : "保存并确认" }}</button
          ><button class="fin-button" type="button" @click="router.back()">
            取消
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
