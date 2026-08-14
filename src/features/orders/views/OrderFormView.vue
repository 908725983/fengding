<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRoute, useRouter } from "vue-router";
import OrderScenarioBar from "../components/OrderScenarioBar.vue";
import { useOrderStore } from "../runtime/order-store";
import type { OrderLineDraft } from "../types";
import "./order-views.css";

const route = useRoute();
const router = useRouter();
const store = useOrderStore();
const {
  draft,
  editingOrderId,
  formOptions,
  customerContext,
  skus,
  preview,
  loading,
  saving,
  error,
  scenario,
  actor,
} = storeToRefs(store);
const orderId = computed(() =>
  route.params.orderId ? String(route.params.orderId) : undefined,
);
const productToAdd = ref("");
const pasteText = ref("");
const pasteErrors = ref<string[]>([]);
const barcode = ref("");
const templateMessage = ref("");
const savedMessage = ref("");
const money = (value: number) => `¥${(value / 100).toFixed(2)}`;
const skuOf = (line: OrderLineDraft) =>
  skus.value.find((item) => item.skuId === line.skuId);
async function changeCustomer(event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  if (
    draft.value.lines.length &&
    !window.confirm("更换客户会清空商品、优惠、收货和发票信息，是否继续？")
  )
    return;
  await store.selectCustomer(id);
}
function removeLine(index: number) {
  draft.value.lines.splice(index, 1);
  store.preview = null;
}
async function paste() {
  const result = await store.pasteProducts(pasteText.value);
  pasteErrors.value = result.errors;
  if (!result.errors.length) pasteText.value = "";
}
async function scan() {
  try {
    await store.scanBarcode(barcode.value);
    barcode.value = "";
  } catch (caught) {
    store.error = caught instanceof Error ? caught.message : "扫码失败";
  }
}
async function template(id: string) {
  if (!id) return;
  const result = await store.applyTemplate(id);
  templateMessage.value = `已加入 ${result.accepted.length} 行，过滤 ${result.rejected.length} 行${result.rejected.length ? `：${result.rejected.map((item) => item.message).join("；")}` : ""}`;
}
async function save(reset = false) {
  const order = await store.saveForm(`order-ui-${Date.now()}`);
  if (!order) return;
  if (reset) {
    savedMessage.value = `${order.orderNo} 已保存，正在录入下一单`;
    await store.initializeForm();
    return;
  }
  await router.push(`/orders/${order.id}`);
}
function addAttachment(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])];
  for (const file of files) {
    const mediaType = file.type as
      | "application/pdf"
      | "image/jpeg"
      | "image/png";
    draft.value.attachments.push({
      id: `attachment-ui-${Date.now()}-${draft.value.attachments.length}`,
      name: file.name,
      mediaType,
      sizeBytes: file.size,
    });
  }
  (event.target as HTMLInputElement).value = "";
}
onMounted(() => store.initializeForm(orderId.value));
</script>

<template>
  <section class="order-page order-form-page" @keydown.f7.prevent="save(true)">
    <header class="order-detail-header">
      <div>
        <RouterLink
          class="order-back"
          :to="editingOrderId ? `/orders/${editingOrderId}` : '/orders'"
          >← 返回订单</RouterLink
        >
        <p class="eyebrow">
          ORD-002 · {{ editingOrderId ? "修改订单" : "新增订单" }}
        </p>
        <h1>{{ editingOrderId ? "修改客户订单" : "新建客户订单" }}</h1>
        <p>单号保存成功后生成；当前保存状态固定为待订单审核。</p>
      </div>
      <OrderScenarioBar
        :scenario="scenario"
        :role="actor.role"
        @scenario="
          async (value) => {
            await store.setScenario(value);
            await store.initializeForm(orderId);
          }
        "
        @role="
          async (value) => {
            await store.setRole(value);
            await store.initializeForm(orderId);
          }
        "
      />
    </header>
    <div v-if="loading" class="order-state">
      <strong>正在加载订单表单…</strong>
    </div>
    <div v-else-if="!formOptions" class="order-state error">
      <strong>订单表单不可用</strong>
      <p>{{ error }}</p>
      <RouterLink class="order-button" to="/orders">返回列表</RouterLink>
    </div>
    <form v-else class="order-form" @submit.prevent="save(false)">
      <p v-if="savedMessage" class="order-notice success">{{ savedMessage }}</p>
      <p v-if="error" class="order-notice error">{{ error }}</p>
      <section class="order-card">
        <h2>客户与订单信息</h2>
        <div class="order-form-grid">
          <label
            ><span>客户 *</span
            ><select
              :value="draft.customerId"
              required
              @change="changeCustomer"
            >
              <option value="">请选择启用客户</option>
              <option
                v-for="item in formOptions.customers"
                :key="item.id"
                :value="item.id"
              >
                {{ item.code }} · {{ item.name }}
              </option>
            </select></label
          ><label
            ><span>发货仓库 *</span
            ><select v-model="draft.warehouseId" required>
              <option value="">请选择启用且非禁售仓</option>
              <option
                v-for="item in formOptions.warehouses"
                :key="item.id"
                :value="item.id"
              >
                {{ item.code }} · {{ item.name }}
              </option>
            </select></label
          ><label
            ><span>业务员</span
            ><select v-model="draft.salespersonId">
              <option
                v-for="item in formOptions.staff"
                :key="item.id"
                :value="item.id"
              >
                {{ item.name }}
              </option>
            </select></label
          ><label
            ><span>交货时间 *</span
            ><input
              v-model="draft.requestedDeliveryAt"
              required
              type="datetime-local" /></label
          ><label
            ><span>配送方式 *</span
            ><select v-model="draft.deliveryMethod" required>
              <option value="">请选择</option>
              <option value="door-delivery">送货上门</option>
              <option value="logistics">物流配送</option>
              <option value="customer-pickup">客户自提</option>
            </select></label
          ><label
            ><span>发票类型</span
            ><select v-model="draft.invoiceType">
              <option value="none">不开票</option>
              <option value="vat-normal">增值税普通发票</option>
              <option value="vat-special">增值税专用发票</option>
            </select></label
          ><label v-if="draft.invoiceType !== 'none'"
            ><span>发票抬头 *</span
            ><input v-model="draft.invoiceTitle" maxlength="100" required
          /></label>
        </div>
        <div
          v-if="customerContext"
          class="order-financials order-form-financials"
        >
          <div>
            <span>结算方式</span
            ><strong>{{
              { cash: "现结", monthly: "月结", terms: "账期" }[
                customerContext.customer.settlementMethod
              ]
            }}</strong>
          </div>
          <div>
            <span>应收额度</span
            ><strong>{{
              customerContext.customer.creditLimitCents
                ? money(customerContext.customer.creditLimitCents)
                : "不限制"
            }}</strong>
          </div>
          <div>
            <span>应收总额</span
            ><strong>{{ money(customerContext.receivablesCents) }}</strong>
          </div>
          <div>
            <span>可用预收</span
            ><strong>{{
              money(customerContext.availablePrepaymentCents)
            }}</strong>
          </div>
        </div>
      </section>
      <section class="order-card">
        <div class="order-section-title">
          <h2>商品明细</h2>
          <div class="order-entry-tools">
            <select v-model="productToAdd" :disabled="!draft.customerId">
              <option value="">搜索并选择可订 SKU</option>
              <option
                v-for="item in skus"
                :key="item.skuId"
                :value="item.skuId"
              >
                {{ item.productCode }} / {{ item.skuCode }} ·
                {{ item.productName }} · {{ item.specification }}
              </option></select
            ><button
              type="button"
              class="order-button primary"
              :disabled="!productToAdd"
              @click="
                store.addSku(productToAdd);
                productToAdd = '';
              "
            >
              添加商品</button
            ><button
              type="button"
              class="order-button"
              :disabled="!productToAdd"
              @click="
                store.addSku(productToAdd, 'gift');
                productToAdd = '';
              "
            >
              添加赠品
            </button>
          </div>
        </div>
        <p v-if="draft.customerId && !skus.length" class="order-unavailable">
          当前客户没有可订商品，或商品/授权 provider 不可用。
        </p>
        <div class="order-table-wrap">
          <table class="order-table order-form-table">
            <thead>
              <tr>
                <th>#</th>
                <th>类型</th>
                <th>商品 / SKU</th>
                <th>单位</th>
                <th>数量</th>
                <th>成交单价（分）</th>
                <th>原因</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(line, index) in draft.lines"
                :key="line.id ?? `${line.skuId}-${line.unitId}-${index}`"
              >
                <td>{{ index + 1 }}</td>
                <td>
                  <select v-model="line.lineKind">
                    <option value="sale">销售</option>
                    <option value="gift">赠品</option>
                  </select>
                </td>
                <td>
                  <strong>{{ skuOf(line)?.productName }}</strong
                  ><small
                    >{{ skuOf(line)?.skuCode }} ·
                    {{ skuOf(line)?.specification }}</small
                  >
                </td>
                <td>
                  <select v-model="line.unitId">
                    <option
                      v-for="unit in skuOf(line)?.units"
                      :key="unit.id"
                      :value="unit.id"
                    >
                      {{ unit.name }}
                    </option>
                  </select>
                </td>
                <td>
                  <input
                    v-model.number="line.quantity"
                    type="number"
                    min="1"
                    step="1"
                  />
                </td>
                <td>
                  <input
                    v-model.number="line.manualDealUnitPriceCents"
                    :disabled="line.lineKind === 'gift'"
                    type="number"
                    min="0"
                    placeholder="自动定价"
                  />
                </td>
                <td>
                  <input
                    v-model="line.reason"
                    maxlength="500"
                    placeholder="可选"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    class="order-button danger"
                    @click="removeLine(index)"
                  >
                    删除
                  </button>
                </td>
              </tr>
              <tr v-if="!draft.lines.length">
                <td colspan="8" class="order-empty-cell">
                  请先选择客户，再添加商品。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="order-assist">
          <label
            ><span>订单模板</span
            ><select
              :disabled="!draft.customerId"
              @change="template(($event.target as HTMLSelectElement).value)"
            >
              <option value="">请选择模板</option>
              <option
                v-for="item in formOptions.templates"
                :key="item.id"
                :value="item.id"
              >
                {{ item.name }}
              </option>
            </select></label
          ><label
            ><span>扫码录入</span
            ><span class="order-inline"
              ><input v-model="barcode" placeholder="输入条码" /><button
                type="button"
                class="order-button"
                :disabled="!barcode"
                @click="scan"
              >
                加入
              </button></span
            ></label
          ><label class="order-assist-paste"
            ><span>粘贴商品（skuCode,quantity,unitCode）</span
            ><textarea
              v-model="pasteText"
              rows="3"
              placeholder="SKU-000001,21,DEMO-PIECE"
            ></textarea
            ><button
              type="button"
              class="order-button"
              :disabled="!pasteText"
              @click="paste"
            >
              校验并加入
            </button></label
          >
          <p v-if="templateMessage" class="order-notice">
            {{ templateMessage }}
          </p>
          <ul v-if="pasteErrors.length" class="order-error-list">
            <li v-for="item in pasteErrors" :key="item">{{ item }}</li>
          </ul>
        </div>
      </section>
      <section class="order-card">
        <h2>收货、金额与附属信息</h2>
        <div class="order-form-grid">
          <label
            ><span>收货人 *</span
            ><input
              v-model="draft.shipping.recipient"
              required
              maxlength="80" /></label
          ><label
            ><span>联系电话 *</span
            ><input
              v-model="draft.shipping.phone"
              required
              maxlength="40" /></label
          ><label
            ><span>省 *</span
            ><input
              v-model="draft.shipping.province"
              required
              maxlength="40" /></label
          ><label
            ><span>市 *</span
            ><input
              v-model="draft.shipping.city"
              required
              maxlength="40" /></label
          ><label
            ><span>区 *</span
            ><input
              v-model="draft.shipping.district"
              required
              maxlength="40" /></label
          ><label class="wide"
            ><span>详细地址 *</span
            ><input
              v-model="draft.shipping.address"
              required
              maxlength="200" /></label
          ><label
            ><span>整单优惠（分）</span
            ><input
              v-model.number="draft.manualOrderDiscountCents"
              type="number"
              min="0"
              step="1" /></label
          ><label
            ><span>运费（分）</span
            ><input
              v-model.number="draft.freightCents"
              type="number"
              min="0"
              step="1" /></label
          ><label class="checkbox"
            ><input v-model="draft.specialPrice" type="checkbox" @change="!draft.specialPrice && (draft.specialPriceReason = null)" /><span
              >特价订单（越过售价上下限时必须勾选）</span
            ></label
          ><label v-if="draft.specialPrice" class="wide"
            ><span>特价申请原因 *（最多200字）</span
            ><textarea v-model="draft.specialPriceReason" required maxlength="200" rows="2" placeholder="说明客户专项价格或其他特价原因"></textarea></label
          ><label class="wide"
            ><span>备注（最多500字）</span
            ><textarea
              v-model="draft.remark"
              maxlength="500"
              rows="3"
            ></textarea></label
          ><label class="wide"
            ><span>附件（pdf/jpg/png，单个≤5MB，最多10个）</span
            ><input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              @change="addAttachment"
            /><small v-for="(item, index) in draft.attachments" :key="item.id"
              >{{ item.name }} · {{ (item.sizeBytes / 1024).toFixed(1) }}KB
              <button type="button" @click="draft.attachments.splice(index, 1)">
                移除
              </button></small
            ></label
          >
        </div>
      </section>
      <section v-if="preview" class="order-card order-preview">
        <h2>保存前核算</h2>
        <div class="order-financials">
          <div>
            <span>原价金额</span
            ><strong>{{ money(preview.amounts.originalAmountCents) }}</strong>
          </div>
          <div>
            <span>商品优惠</span
            ><strong>{{ money(preview.amounts.productDiscountCents) }}</strong>
          </div>
          <div>
            <span>整单优惠</span
            ><strong>{{ money(preview.amounts.orderDiscountCents) }}</strong>
          </div>
          <div>
            <span>运费</span
            ><strong>{{ money(preview.amounts.freightCents) }}</strong>
          </div>
          <div>
            <span>订单金额</span
            ><strong>{{ money(preview.amounts.orderAmountCents) }}</strong>
          </div>
          <div>
            <span>占用预收</span
            ><strong>{{ money(preview.occupiedPrepaymentCents) }}</strong>
          </div>
          <div>
            <span>数量 / 行数</span
            ><strong
              >{{ preview.quantityTotal }} / {{ preview.lines.length }}</strong
            >
          </div>
          <div>
            <span>重量</span
            ><strong
              >{{ (preview.weightTotalGrams / 1000).toFixed(3) }} kg</strong
            >
          </div>
        </div>
        <p v-if="draft.specialPrice" class="order-notice">特价审批将在业务审核后合并到财务审核；系统会保存当前价格边界和 {{ preview.specialPriceEvidence.length }} 条越界依据。</p>
        <p class="order-unavailable">{{ preview.warnings.join("；") }}</p>
      </section>
      <footer class="order-form-actions">
        <RouterLink
          class="order-button"
          :to="editingOrderId ? `/orders/${editingOrderId}` : '/orders'"
          >取消</RouterLink
        ><button
          type="button"
          class="order-button"
          @click="store.previewForm()"
        >
          核对金额</button
        ><button
          type="button"
          class="order-button"
          :disabled="saving"
          @click="save(true)"
        >
          保存并新增（F7）</button
        ><button
          type="button"
          class="order-button"
          disabled
          title="等待 ORD-003、ORD-004 与资金编排"
        >
          保存并结算出库（F8）</button
        ><button class="order-button primary" :disabled="saving">
          {{ saving ? "保存中…" : "保存并查看详情" }}
        </button>
      </footer>
    </form>
  </section>
</template>
