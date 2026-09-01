<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRoute, useRouter } from "vue-router";
import ProcurementScenarioBar from "../components/ProcurementScenarioBar.vue";
import ProcurementSubnav from "../components/ProcurementSubnav.vue";
import { useProcurementStore } from "../runtime/procurement-store";
import type {
  ProcurementRole,
  PurchaseReturn,
  PurchaseReturnListQuery,
} from "../types";
import "./procurement-views.css";
import "./purchase-return-view.css";

const store = useProcurementStore();
const route = useRoute();
const router = useRouter();
const {
  purchaseReturns,
  purchaseReturnTotal,
  purchaseReturnSources,
  selectedPurchaseReturn,
  loading,
  saving,
  error,
  scenario,
  actor,
  canWrite,
} = storeToRefs(store);
const mode = computed(() =>
  route.name === "procurement-purchase-return-new"
    ? "new"
    : route.name === "procurement-purchase-return-detail"
      ? "detail"
      : "list",
);
const workflowStatus = ref(
  (route.query.status as PurchaseReturnListQuery["workflowStatus"]) ?? "all",
);
const dateFrom = ref(String(route.query.from ?? ""));
const dateTo = ref(String(route.query.to ?? ""));
const keyword = ref(String(route.query.keyword ?? ""));
const sourceId = ref("");
const lineQuantities = reactive<Record<string, number>>({});
const lineNotes = reactive<Record<string, string>>({});
const returnDate = ref("2026-08-10");
const note = ref("");
const formError = ref("");
const actionMessage = ref("");
const showShip = ref(false);
const shipQuantities = reactive<Record<string, number>>({});
const source = computed(
  () =>
    purchaseReturnSources.value.find((item) => item.id === sourceId.value) ??
    null,
);
const workflowLabels: Record<PurchaseReturn["workflowStatus"], string> = {
  "pending-review": "待审核",
  approved: "已审核",
  completed: "已完成",
  voided: "已作废",
};
const outboundLabels: Record<PurchaseReturn["outboundStatus"], string> = {
  "not-shipped": "未出库",
  "partially-shipped": "部分出库",
  shipped: "已出库",
};
const refundLabels: Record<PurchaseReturn["refundStatus"], string> = {
  "not-required": "无需退款",
  pending: "待退款",
  refunded: "已退款",
};
function queryValue(): PurchaseReturnListQuery {
  return {
    workflowStatus: workflowStatus.value,
    dateFrom: dateFrom.value || undefined,
    dateTo: dateTo.value || undefined,
    keyword: keyword.value || undefined,
    page: 1,
    pageSize: 30,
  };
}
async function search() {
  await router.replace({
    query: {
      status: workflowStatus.value === "all" ? undefined : workflowStatus.value,
      from: dateFrom.value || undefined,
      to: dateTo.value || undefined,
      keyword: keyword.value || undefined,
    },
  });
  await store.loadPurchaseReturns(queryValue());
}
function selectSource() {
  Object.keys(lineQuantities).forEach((key) => delete lineQuantities[key]);
  Object.keys(lineNotes).forEach((key) => delete lineNotes[key]);
  source.value?.lines.forEach((line) => {
    lineQuantities[line.id] = 0;
    lineNotes[line.id] = "";
  });
}
async function save() {
  formError.value = "";
  if (!source.value) {
    formError.value = "请选择已有实际入库的采购单";
    return;
  }
  const lines = source.value.lines
    .filter((line) => (lineQuantities[line.id] ?? 0) > 0)
    .map((line) => ({
      purchaseOrderLineId: line.id,
      quantity: lineQuantities[line.id]!,
      note: lineNotes[line.id] || null,
    }));
  try {
    const created = await store.createPurchaseReturn({
      purchaseOrderId: source.value.id,
      returnDate: returnDate.value,
      lines,
      note: note.value || null,
    });
    await router.push(`/procurement/purchase-returns/${created.id}`);
  } catch (caught) {
    formError.value =
      caught instanceof Error ? caught.message : "保存采购退单失败";
  }
}
async function runAction(operation: () => Promise<void>) {
  formError.value = "";
  actionMessage.value = "";
  try {
    await operation();
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : "操作失败";
  }
}
async function approve() {
  if (selectedPurchaseReturn.value)
    await runAction(() =>
      store.approvePurchaseReturn(selectedPurchaseReturn.value!),
    );
}
async function voidReturn() {
  if (!selectedPurchaseReturn.value) return;
  const reason = window.prompt("请输入作废原因（1-200字）", "来源单选择错误");
  if (reason)
    await runAction(() =>
      store.voidPurchaseReturn(selectedPurchaseReturn.value!, reason),
    );
}
function openShip() {
  if (!selectedPurchaseReturn.value) return;
  Object.keys(shipQuantities).forEach((key) => delete shipQuantities[key]);
  selectedPurchaseReturn.value.lines.forEach((line) => {
    shipQuantities[line.id] = 0;
  });
  showShip.value = true;
}
async function ship() {
  if (!selectedPurchaseReturn.value) return;
  const lines = selectedPurchaseReturn.value.lines
    .filter((line) => (shipQuantities[line.id] ?? 0) > 0)
    .map((line) => ({ lineId: line.id, quantity: shipQuantities[line.id]! }));
  await runAction(async () => {
    await store.shipPurchaseReturn(selectedPurchaseReturn.value!, lines);
    showShip.value = false;
  });
}
function download() {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob(["\uFEFF", store.exportPurchaseReturns(queryValue())], {
      type: "text/csv;charset=utf-8",
    }),
  );
  link.download = "采购退单.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}
function fakePrint() {
  actionMessage.value = "打印预览已生成（原型模拟，不连接真实打印机）";
}
async function changeScenario(value: typeof scenario.value) {
  await store.setScenario(value);
  await loadCurrent();
}
async function changeRole(value: ProcurementRole) {
  await store.setRole(value);
  await loadCurrent();
}
async function loadCurrent() {
  if (mode.value === "detail")
    await store.loadPurchaseReturn(String(route.params.returnId));
  else await store.loadPurchaseReturns(queryValue());
}
onMounted(loadCurrent);
</script>

<template>
  <section class="procurement-page">
    <header class="procurement-header">
      <div>
        <h1>
          {{
            mode === "new"
              ? "新增采购退单"
              : mode === "detail"
                ? "采购退单详情"
                : "采购退单"
          }}
        </h1>
        <p>关联实际入库采购单，退采出库与供应商应付贷项保持原子一致。</p>
      </div>
      <ProcurementScenarioBar
        :scenario="scenario"
        :role="actor.role"
        @scenario="changeScenario"
        @role="changeRole"
      />
    </header>
    <ProcurementSubnav />

    <template v-if="mode === 'list'">
      <form class="procurement-toolbar" @submit.prevent="search">
        <label
          >退单状态<select v-model="workflowStatus">
            <option value="all">全部</option>
            <option value="pending-review">待审核</option>
            <option value="approved">已审核</option>
            <option value="completed">已完成</option>
            <option value="voided">已作废</option>
          </select></label
        ><label>开始日期<input v-model="dateFrom" type="date" /></label
        ><label>结束日期<input v-model="dateTo" type="date" /></label
        ><label class="grow"
          >退单号 / 供应商 / 商品 / 制单人<input
            v-model="keyword"
            type="search" /></label
        ><button class="pur-button" type="submit">查询</button>
        <div class="actions">
          <button
            v-if="canWrite"
            class="pur-button"
            type="button"
            @click="download"
          >
            导出</button
          ><RouterLink
            v-if="canWrite"
            class="pur-button primary"
            to="/procurement/purchase-returns/new"
            >新增采购退单</RouterLink
          >
        </div>
      </form>
      <p v-if="scenario === 'unavailable'" class="procurement-warning">
        供应商贷项提供方尚未接入；已有退单可查看，但退采出库不会被伪装成成功。
      </p>
      <div v-if="error" class="procurement-state error" role="alert">
        {{ error }}<button class="pur-button" @click="search">重试</button>
      </div>
      <div v-else-if="loading" class="procurement-state">正在加载采购退单…</div>
      <div v-else-if="!purchaseReturns.length" class="procurement-state">
        <strong>暂无采购退单</strong
        ><span>先完成采购订单实际入库，再创建采购退单。</span>
      </div>
      <div v-else class="procurement-table-wrap">
        <table class="procurement-table">
          <thead>
            <tr>
              <th>退单号</th>
              <th>创建时间</th>
              <th>供应商</th>
              <th>原采购单</th>
              <th>退单状态</th>
              <th>出库状态</th>
              <th>退款状态</th>
              <th>金额</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in purchaseReturns" :key="row.id">
              <td>
                <RouterLink :to="`/procurement/purchase-returns/${row.id}`"
                  ><strong>{{ row.code }}</strong></RouterLink
                >
              </td>
              <td>{{ row.createdAt }}</td>
              <td>{{ row.supplierNameSnapshot }}</td>
              <td>{{ row.purchaseOrderCodeSnapshot }}</td>
              <td>
                <span class="pur-status" :class="row.workflowStatus">{{
                  workflowLabels[row.workflowStatus]
                }}</span>
              </td>
              <td>
                <span class="pur-status" :class="row.outboundStatus">{{
                  outboundLabels[row.outboundStatus]
                }}</span>
              </td>
              <td>
                <span class="pur-status" :class="row.refundStatus">{{
                  refundLabels[row.refundStatus]
                }}</span>
              </td>
              <td class="pur-money">
                ¥{{ (row.amountCents / 100).toFixed(2) }}
              </td>
              <td>{{ row.note ?? "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="procurement-pagination">
        共 {{ purchaseReturnTotal }} 条 · 每页 30 条
      </div>
    </template>

    <template v-else-if="mode === 'new'">
      <div v-if="error" class="procurement-state error">{{ error }}</div>
      <div v-else-if="loading" class="procurement-state">
        正在加载可退采购单…
      </div>
      <form
        v-else
        class="procurement-form purchase-return-form"
        @submit.prevent="save"
      >
        <label class="wide"
          >原采购单 *<select v-model="sourceId" @change="selectSource">
            <option value="">请选择已有实际入库的采购单</option>
            <option
              v-for="item in purchaseReturnSources"
              :key="item.id"
              :value="item.id"
            >
              {{ item.code }} · {{ item.supplierNameSnapshot }} ·
              {{ item.inboundStatus === "received" ? "已入库" : "部分入库" }}
            </option>
          </select></label
        ><label
          >退单日期 *<input
            v-model="returnDate"
            type="date"
            max="2026-08-10" /></label
        ><label
          >目标仓库<input
            :value="source?.warehouseId ?? '选择原采购单后锁定'"
            disabled
        /></label>
        <div v-if="source" class="procurement-table-wrap wide">
          <table class="procurement-table">
            <thead>
              <tr>
                <th>商品 / SKU</th>
                <th>采购单位</th>
                <th>有效入库</th>
                <th>当前可退</th>
                <th>本次退货 *</th>
                <th>原成交价</th>
                <th>行备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in source.lines" :key="line.id">
                <td>
                  {{ line.productNameSnapshot
                  }}<small
                    >{{ line.skuCodeSnapshot }} ·
                    {{ line.specificationSnapshot }}</small
                  >
                </td>
                <td>{{ line.procurementUnitNameSnapshot }}</td>
                <td>{{ line.receivedQuantity }}</td>
                <td>{{ line.returnableQuantity }}</td>
                <td>
                  <input
                    v-model.number="lineQuantities[line.id]"
                    type="number"
                    min="0"
                    :max="line.returnableQuantity"
                    step="1"
                  />
                </td>
                <td class="pur-money">
                  {{
                    line.isGift
                      ? "赠品 ¥0.00"
                      : `¥${(line.unitPriceCents / 100).toFixed(2)}`
                  }}
                </td>
                <td><input v-model="lineNotes[line.id]" maxlength="200" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="procurement-warning wide">
          只列出已审核且存在实际入库可退量的入仓采购单；直送退单当前不可用。
        </p>
        <label class="wide"
          >整单备注<textarea v-model="note" maxlength="500" rows="3" />
        </label>
        <p v-if="formError" class="procurement-warning wide" role="alert">
          {{ formError }}
        </p>
        <div class="procurement-actions">
          <RouterLink class="pur-button" to="/procurement/purchase-returns"
            >取消</RouterLink
          ><button
            class="pur-button primary"
            type="submit"
            :disabled="saving || !canWrite"
          >
            保存采购退单
          </button>
        </div>
      </form>
    </template>

    <template v-else>
      <div v-if="error" class="procurement-state error">{{ error }}</div>
      <div v-else-if="loading" class="procurement-state">
        正在加载采购退单详情…
      </div>
      <template v-else-if="selectedPurchaseReturn"
        ><div class="purchase-return-hero">
          <div>
            <strong>{{ selectedPurchaseReturn.code }}</strong
            ><span
              >{{ selectedPurchaseReturn.supplierNameSnapshot }} · 原采购单
              {{ selectedPurchaseReturn.purchaseOrderCodeSnapshot }}</span
            >
          </div>
          <div class="purchase-return-badges">
            <span
              class="pur-status"
              :class="selectedPurchaseReturn.workflowStatus"
              >{{ workflowLabels[selectedPurchaseReturn.workflowStatus] }}</span
            ><span
              class="pur-status"
              :class="selectedPurchaseReturn.outboundStatus"
              >{{ outboundLabels[selectedPurchaseReturn.outboundStatus] }}</span
            ><span
              class="pur-status"
              :class="selectedPurchaseReturn.refundStatus"
              >{{ refundLabels[selectedPurchaseReturn.refundStatus] }}</span
            >
          </div>
          <div class="purchase-return-actions">
            <button
              v-if="
                canWrite &&
                selectedPurchaseReturn.workflowStatus === 'pending-review'
              "
              class="pur-button primary"
              :disabled="saving"
              @click="approve"
            >
              审核</button
            ><button
              v-if="
                canWrite && selectedPurchaseReturn.workflowStatus === 'approved'
              "
              class="pur-button primary"
              :disabled="saving"
              @click="openShip"
            >
              退采出库</button
            ><button
              v-if="
                canWrite &&
                ['pending-review', 'approved'].includes(
                  selectedPurchaseReturn.workflowStatus,
                ) &&
                !selectedPurchaseReturn.shipments.length
              "
              class="pur-button danger"
              :disabled="saving"
              @click="voidReturn"
            >
              作废</button
            ><button
              v-if="canWrite"
              class="pur-button"
              title="生成原型打印预览"
              @click="fakePrint"
            >
              打印（原型模拟）
            </button>
          </div>
        </div>
        <p v-if="actionMessage" class="procurement-warning">
          {{ actionMessage }}
        </p>
        <p v-if="formError" class="procurement-warning" role="alert">
          {{ formError }}
        </p>
        <p
          v-if="selectedPurchaseReturn.refundStatus === 'pending'"
          class="procurement-warning"
        >
          已形成供应商退款义务；实际到账与“已退款”由 FIN-004 负责，当前不可用。
        </p>
        <div class="procurement-summary purchase-return-summary">
          <article>
            <span>退单数量</span
            ><strong>{{ selectedPurchaseReturn.totalQuantity }}</strong>
          </article>
          <article>
            <span>商品金额</span
            ><strong
              >¥{{
                (selectedPurchaseReturn.goodsAmountCents / 100).toFixed(2)
              }}</strong
            >
          </article>
          <article>
            <span>优惠回退</span
            ><strong
              >-¥{{
                (selectedPurchaseReturn.allocatedDiscountCents / 100).toFixed(2)
              }}</strong
            >
          </article>
          <article>
            <span>其他费用回退</span
            ><strong
              >¥{{
                (selectedPurchaseReturn.allocatedOtherFeeCents / 100).toFixed(2)
              }}</strong
            >
          </article>
          <article>
            <span>退单金额</span
            ><strong
              >¥{{
                (selectedPurchaseReturn.amountCents / 100).toFixed(2)
              }}</strong
            >
          </article>
        </div>
        <div class="procurement-table-wrap">
          <table class="procurement-table">
            <thead>
              <tr>
                <th>商品 / SKU</th>
                <th>采购单位</th>
                <th>退单数量</th>
                <th>已出库</th>
                <th>原成交价</th>
                <th>优惠 / 费用</th>
                <th>退单金额</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in selectedPurchaseReturn.lines" :key="line.id">
                <td>
                  {{ line.productNameSnapshot
                  }}<small
                    >{{ line.skuCodeSnapshot }} ·
                    {{ line.specificationSnapshot }}</small
                  >
                </td>
                <td>
                  {{ line.procurementUnitNameSnapshot
                  }}<small>基本单位千分量 {{ line.baseQuantityMilli }}</small>
                </td>
                <td>{{ line.quantity }}</td>
                <td>{{ line.shippedQuantity }}</td>
                <td class="pur-money">
                  ¥{{ (line.unitPriceCents / 100).toFixed(2) }}
                </td>
                <td class="pur-money">
                  -¥{{ (line.allocatedDiscountCents / 100).toFixed(2) }} / +¥{{ (line.allocatedOtherFeeCents / 100).toFixed(2) }}
                </td>
                <td class="pur-money">
                  ¥{{ (line.amountCents / 100).toFixed(2) }}
                </td>
                <td>{{ line.note ?? "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <section class="procurement-panel purchase-return-log">
          <h2>出库与贷项追踪</h2>
          <p v-if="!selectedPurchaseReturn.shipments.length">
            尚未出库，不存在库存流水或供应商贷项。
          </p>
          <div
            v-for="shipment in selectedPurchaseReturn.shipments"
            :key="shipment.id"
          >
            <strong
              >{{ shipment.occurredAt }} · ¥{{
                (shipment.amountCents / 100).toFixed(2)
              }}</strong
            ><span
              >库存流水 {{ shipment.inventoryMovementIds.length }} 条 · Finance
              贷项 {{ shipment.credits.length }} 条</span
            >
          </div>
        </section></template
      >
    </template>

    <div
      v-if="showShip && selectedPurchaseReturn"
      class="procurement-dialog"
      role="dialog"
      aria-modal="true"
    >
      <section>
        <header>
          <strong>确认退采出库</strong
          ><button class="pur-button" @click="showShip = false">关闭</button>
        </header>
        <form class="procurement-form" @submit.prevent="ship">
          <p class="procurement-warning wide">
            从原采购目标仓按 FIFO 扣减启用库位库存，并同步创建 Finance
            贷项；任一失败会整体回滚。
          </p>
          <label
            v-for="line in selectedPurchaseReturn.lines.filter(
              (item) => item.shippedQuantity < item.quantity,
            )"
            :key="line.id"
            >{{ line.productNameSnapshot }}（剩余
            {{ line.quantity - line.shippedQuantity }}
            {{ line.procurementUnitNameSnapshot }}）<input
              v-model.number="shipQuantities[line.id]"
              type="number"
              min="0"
              :max="line.quantity - line.shippedQuantity"
              step="1"
          /></label>
          <p v-if="formError" class="procurement-warning wide">
            {{ formError }}
          </p>
          <div class="procurement-actions">
            <button class="pur-button" type="button" @click="showShip = false">
              取消</button
            ><button
              class="pur-button primary"
              type="submit"
              :disabled="saving"
            >
              确认出库并生成贷项
            </button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>
