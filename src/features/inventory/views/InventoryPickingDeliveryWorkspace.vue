<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import InventorySubnav from "../components/InventorySubnav.vue";
import { useInventoryStore } from "../runtime/inventory-store";
import type {
  DeliveryRoute,
  DeliveryRouteDraft,
  DeliveryTask,
  DeliveryVehicle,
  DeliveryVehicleDraft,
  PickingLabelDraft,
  PickingListQuery,
  PickingTask,
  PickingWave,
  PickingWaveDraft,
} from "../types";
import "./inventory-views.css";

type Section =
  | "pending"
  | "tasks"
  | "waves"
  | "deliveries"
  | "routes"
  | "vehicles"
  | "labels";
const props = defineProps<{ section: Section }>();
const store = useInventoryStore();
const route = useRoute();
const router = useRouter();
const {
  pendingPickingOrders,
  pickingTasks,
  pickingWaves,
  pickingDifferences,
  deliveryRoutes,
  deliveryVehicles,
  deliveryTasks,
  deliveryCandidates,
  pickingLabels,
  deliveryStaff,
  pickingPages,
  loading,
  saving,
  error,
  canWrite,
  actor,
} = storeToRefs(store);
const keyword = ref(String(route.query.keyword ?? ""));
const status = ref(String(route.query.status ?? ""));
const fromDate = ref(String(route.query.fromDate ?? ""));
const toDate = ref(String(route.query.toDate ?? ""));
const currentPage = ref(Math.max(1, Number(route.query.page ?? 1) || 1));
const message = ref("");
const selectedOrders = ref<string[]>([]);
const selectedDeliveryOrders = ref<string[]>([]);
const taskActuals = reactive<Record<string, number>>({});
const waveActuals = reactive<Record<string, number>>({});
const reasons = reactive<Record<string, string>>({});
const waveForm = reactive({
  strategy: "time" as PickingWaveDraft["strategy"],
  warehouseId: "",
  cutoffAt: "2026-08-11T09:00",
  routeId: "",
  area: "",
  categoryId: "",
});
const routeForm = reactive({
  name: "",
  province: "山东省",
  city: "临沂市",
  district: "兰山区",
  stops: [{ name: "", address: "" }],
  estimatedMinutes: 60,
  status: "enabled" as DeliveryRouteDraft["status"],
  driverId: "",
  vehicleId: "",
});
const vehicleForm = reactive({
  plateNumber: "",
  type: "van" as DeliveryVehicleDraft["type"],
  otherType: "",
  capacityKg: 1000,
  driverId: "",
  status: "idle" as const,
});
const deliveryForm = reactive({
  routeId: "",
  vehicleId: "",
  driverId: "",
  plannedDepartureAt: "2026-08-11T09:00",
  note: "",
});
const labelForm = reactive({
  sourceType: "task" as PickingLabelDraft["sourceType"],
  sourceId: "",
  orderId: "",
  type: "order" as PickingLabelDraft["type"],
  quantity: 1,
  templateId: "order-default",
  productName: "",
  skuId: "",
  locationText: "",
});
const editingRoute = ref<DeliveryRoute | null>(null);
const editingVehicle = ref<DeliveryVehicle | null>(null);
const editingDelivery = ref<DeliveryTask | null>(null);
const previewLabelId = ref("");
const printCopies = ref(1);
const previewPendingPrint = ref(false);
const meta = computed(
  () =>
    ({
      pending: ["待分拣订单", "查看订单域可分拣余量，创建单单任务或同仓波次。"],
      tasks: ["按订单分拣", "逐行录入实拣数量；差异处理后通过订单域正式出库。"],
      waves: ["波次分拣", "同仓订单合并拣货，再按订单守恒分播并批量出库。"],
      deliveries: [
        "配送任务",
        "仅接收已分拣出库的送货上门订单；开始配送即调用订单发货。",
      ],
      routes: ["配送线路", "维护有序站点；任务保存线路快照。"],
      vehicles: ["车辆管理", "维护车牌、车型、载重和出车状态。"],
      labels: [
        "分拣标签",
        "基于已完成分拣生成稳定条码，打印采用原型假适配器。",
      ],
    })[props.section],
);
const statusName = (value: string) =>
  ({
    pending: "待处理",
    picking: "分拣中",
    picked: "已拣货",
    completed: "已完成",
    cancelled: "已取消",
    delivering: "配送中",
    enabled: "启用",
    disabled: "停用",
    idle: "空闲",
    dispatching: "出车中",
    maintenance: "维修中",
    "continue-picking": "继续分拣",
    "accepted-short": "接受短拣",
    printed: "已打印",
  })[value] ?? value;
const quantity = (milli: number | null) =>
  milli === null ? "未录入" : (milli / 1000).toFixed(3).replace(/\.000$/, "");
const normalizeDate = (value: string) =>
  value.length === 16 ? `${value}:00+08:00` : value;
const query = (): PickingListQuery => ({
  keyword: keyword.value.trim() || undefined,
  status: status.value || undefined,
  fromDate: fromDate.value || undefined,
  toDate: toDate.value || undefined,
  page: currentPage.value,
  pageSize: 30,
});
const pageMeta = computed(() => pickingPages.value[props.section]);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(pageMeta.value.total / pageMeta.value.pageSize)),
);
const download = (content: string) => {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `inv-005-${props.section}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};
const labelSources = computed(() =>
  labelForm.sourceType === "task"
    ? pickingTasks.value.filter((item) => item.status === "completed")
    : pickingWaves.value.filter((item) => item.status === "completed"),
);
const selectedLabelSource = computed(() =>
  labelSources.value.find((item) => item.id === labelForm.sourceId),
);
const labelOrders = computed(() => {
  const source = selectedLabelSource.value;
  if (!source) return [];
  return "orderSnapshot" in source ? [source.orderSnapshot] : source.orders;
});
const labelLines = computed(
  () =>
    labelOrders.value.find((item) => item.orderId === labelForm.orderId)
      ?.lines ?? [],
);
const deliveryOrderOptions = computed(() => {
  const rows = [...deliveryCandidates.value, ...(editingDelivery.value?.orders ?? [])];
  return rows.filter((item, index) => rows.findIndex((other) => other.orderId === item.orderId) === index);
});
const waveCategories = computed(() => [
  ...new Set(
    pendingPickingOrders.value
      .flatMap((item) => item.order.lines.map((line) => line.categoryId))
      .filter((value): value is string => Boolean(value)),
  ),
]);
function waveSkuSummary(wave: PickingWave) {
  const rows = new Map<
    string,
    { name: string; expected: number; actual: number | null }
  >();
  for (const line of wave.allocations) {
    const product = wave.orders
      .flatMap((item) => item.lines)
      .find((item) => item.orderLineId === line.orderLineId);
    const current = rows.get(line.skuId) ?? {
      name: product?.productName ?? line.skuId,
      expected: 0,
      actual: 0,
    };
    current.expected += line.expectedQuantityMilli;
    current.actual =
      current.actual === null || line.actualQuantityMilli === null
        ? null
        : current.actual + line.actualQuantityMilli;
    rows.set(line.skuId, current);
  }
  return [...rows.values()];
}

async function load(updateUrl = false, resetPage = false) {
  if (resetPage) currentPage.value = 1;
  if (updateUrl)
    await router.replace({
      query: {
        keyword: keyword.value.trim() || undefined,
        status: status.value || undefined,
        fromDate: fromDate.value || undefined,
        toDate: toDate.value || undefined,
        page: currentPage.value > 1 ? currentPage.value : undefined,
      },
    });
  await store.loadPickingWorkspace(query(), props.section);
  defaults();
}
async function goPage(value: number) {
  currentPage.value = Math.min(pageCount.value, Math.max(1, value));
  await load(true);
}
function defaults() {
  waveForm.warehouseId ||=
    pendingPickingOrders.value[0]?.order.warehouseId ?? "";
  vehicleForm.driverId ||= deliveryStaff.value[0]?.id ?? "";
  deliveryForm.routeId ||=
    deliveryRoutes.value.find((item) => item.status === "enabled")?.id ?? "";
  deliveryForm.vehicleId ||=
    deliveryVehicles.value.find((item) => item.status === "idle")?.id ?? "";
  deliveryForm.driverId ||= deliveryStaff.value[0]?.id ?? "";
  labelForm.sourceId ||= labelSources.value[0]?.id ?? "";
  labelForm.orderId ||= labelOrders.value[0]?.orderId ?? "";
}
async function act(operation: () => Promise<void>, success: string) {
  message.value = "";
  try {
    await operation();
    await load();
    message.value = success;
    selectedOrders.value = [];
    selectedDeliveryOrders.value = [];
    defaults();
  } catch (caught) {
    message.value = caught instanceof Error ? caught.message : "操作失败";
  }
}
function prepareTask(task: PickingTask) {
  task.lines.forEach((line) => {
    taskActuals[line.id] ??= line.expectedQuantityMilli / 1000;
  });
}
function prepareWave(wave: PickingWave) {
  wave.allocations.forEach((line) => {
    waveActuals[`${line.orderId}:${line.orderLineId}`] ??=
      line.expectedQuantityMilli / 1000;
  });
}
async function submitTask(task: PickingTask) {
  await act(
    () =>
      store.submitPickingTask(
        task,
        task.lines.map((line) => ({
          lineId: line.id,
          actualQuantityMilli: Math.round((taskActuals[line.id] ?? 0) * 1000),
        })),
        reasons[task.id] ?? "",
      ),
    "分拣结果已提交",
  );
}
async function submitWave(wave: PickingWave) {
  await act(
    () =>
      store.submitPickingWave(
        wave,
        wave.allocations.map((line) => ({
          orderId: line.orderId,
          orderLineId: line.orderLineId,
          actualQuantityMilli: Math.round(
            (waveActuals[`${line.orderId}:${line.orderLineId}`] ?? 0) * 1000,
          ),
        })),
        reasons[wave.id] ?? "",
      ),
    "波次分播已提交",
  );
}
async function createWave() {
  const rows = pendingPickingOrders.value.filter((item) =>
    selectedOrders.value.includes(item.order.orderId),
  );
  const warehouse = rows[0]?.order.warehouseId ?? waveForm.warehouseId;
  await act(
    () =>
      store.createPickingWave({
        strategy: waveForm.strategy,
        warehouseId: warehouse,
        orderIds: selectedOrders.value,
        cutoffAt: normalizeDate(waveForm.cutoffAt),
        routeId: waveForm.strategy === "route" ? waveForm.routeId : null,
        area: waveForm.strategy === "area" ? waveForm.area : null,
        categoryId:
          waveForm.strategy === "category" ? waveForm.categoryId : null,
      }),
    "波次已创建",
  );
}
async function saveRoute() {
  const value: DeliveryRouteDraft = {
    name: routeForm.name,
    province: routeForm.province,
    city: routeForm.city,
    district: routeForm.district,
    stops: routeForm.stops.map((item) => ({
      name: item.name,
      province: routeForm.province,
      city: routeForm.city,
      district: routeForm.district,
      address: item.address,
    })),
    estimatedMinutes: routeForm.estimatedMinutes,
    status: routeForm.status,
    defaultDriverId: routeForm.driverId || null,
    defaultVehicleId: routeForm.vehicleId || null,
  };
  await act(
    () => store.saveDeliveryRoute(value, editingRoute.value ?? undefined),
    "线路已保存",
  );
  editingRoute.value = null;
}
function editRoute(value: DeliveryRoute) {
  editingRoute.value = value;
  Object.assign(routeForm, {
    name: value.name,
    province: value.province,
    city: value.city,
    district: value.district,
    stops: value.stops.map((item) => ({
      name: item.name,
      address: item.address,
    })),
    estimatedMinutes: value.estimatedMinutes ?? 60,
    status: value.status,
    driverId: value.defaultDriverId ?? "",
    vehicleId: value.defaultVehicleId ?? "",
  });
}
async function saveVehicle() {
  await act(
    () =>
      store.saveDeliveryVehicle(
        {
          plateNumber: vehicleForm.plateNumber,
          type: vehicleForm.type,
          otherType:
            vehicleForm.type === "other" ? vehicleForm.otherType : null,
          capacityKg: vehicleForm.capacityKg,
          defaultDriverId: vehicleForm.driverId || null,
          status: vehicleForm.status,
        },
        editingVehicle.value ?? undefined,
      ),
    "车辆已保存",
  );
  editingVehicle.value = null;
}
function editVehicle(value: DeliveryVehicle) {
  if (value.status === "dispatching") return;
  editingVehicle.value = value;
  Object.assign(vehicleForm, {
    plateNumber: value.plateNumber,
    type: value.type,
    otherType: value.otherType ?? "",
    capacityKg: value.capacityKg,
    driverId: value.defaultDriverId ?? "",
    status: value.status,
  });
}
async function saveDelivery() {
  const draft = {
    routeId: deliveryForm.routeId,
    vehicleId: deliveryForm.vehicleId,
    driverId: deliveryForm.driverId,
    orderIds: selectedDeliveryOrders.value,
    plannedDepartureAt: normalizeDate(deliveryForm.plannedDepartureAt),
    note: deliveryForm.note,
  };
  await act(
    () =>
      editingDelivery.value
        ? store.updateDeliveryTask(editingDelivery.value, draft)
        : store.createDeliveryTask(draft),
    editingDelivery.value ? "配送任务已修改" : "配送任务已创建",
  );
  editingDelivery.value = null;
}
function editDelivery(value: DeliveryTask) {
  editingDelivery.value = value;
  selectedDeliveryOrders.value = value.orders.map((item) => item.orderId);
  Object.assign(deliveryForm, {
    routeId: value.routeSnapshot.id,
    vehicleId: value.vehicleSnapshot.id,
    driverId: value.driverSnapshot.id,
    plannedDepartureAt: value.plannedDepartureAt.slice(0, 16),
    note: value.note ?? "",
  });
}
async function saveLabel() {
  await act(
    () =>
      store.createPickingLabel({
        sourceType: labelForm.sourceType,
        sourceId: labelForm.sourceId,
        type: labelForm.type,
        orderId: labelForm.orderId,
        skuId: labelForm.type === "order" ? null : labelForm.skuId,
        productName: labelForm.type === "order" ? null : labelForm.productName,
        quantityMilli: Math.round(labelForm.quantity * 1000),
        locationText: labelForm.locationText || null,
        templateId: labelForm.templateId,
      }),
    "标签已生成",
  );
}
watch(
  () => props.section,
  () => load(),
);
watch(
  () => labelForm.sourceType,
  () => {
    labelForm.sourceId = "";
    labelForm.orderId = "";
    defaults();
  },
);
watch(
  () => labelForm.sourceId,
  () => {
    labelForm.orderId = labelOrders.value[0]?.orderId ?? "";
  },
);
watch(
  () => labelForm.orderId,
  () => {
    labelForm.skuId = labelLines.value[0]?.skuId ?? "";
    labelForm.productName = labelLines.value[0]?.productName ?? "";
  },
);
watch(
  () => labelForm.skuId,
  (skuId) => {
    labelForm.productName =
      labelLines.value.find((item) => item.skuId === skuId)?.productName ??
      labelForm.productName;
  },
);
onMounted(load);
</script>

<template>
  <section class="inventory-page picking-page">
    <header class="inventory-header">
      <div>
        <p class="eyebrow">INV-005 · 分拣与配送</p>
        <h1>{{ meta[0] }}</h1>
        <p>{{ meta[1] }}</p>
      </div>
      <div class="processing-role">当前角色：{{ actor.role }}</div>
    </header>
    <InventorySubnav />
    <form
      class="inventory-toolbar processing-toolbar"
      @submit.prevent="load(true, true)"
    >
      <label>状态<input v-model="status" placeholder="全部" /></label
      ><label>开始日期<input v-model="fromDate" type="date" /></label
      ><label>结束日期<input v-model="toDate" type="date" /></label
      ><label
        >关键字<input
          v-model="keyword"
          placeholder="单号 / 客户 / 线路 / 车牌" /></label
      ><button class="inv-button primary" type="submit">查询</button
      ><button class="inv-button" type="button" @click="load()">刷新</button
      ><button
        v-if="canWrite"
        class="inv-button"
        type="button"
        @click="download(store.exportPicking(section, query()))"
      >
        导出 CSV
      </button>
    </form>
    <p v-if="message" class="inventory-warning">{{ message }}</p>
    <div v-if="error" class="inventory-state error">
      <strong>加载失败</strong><span>{{ error }}</span
      ><button class="inv-button" @click="load()">重试</button>
    </div>
    <div v-else-if="loading" class="inventory-state">正在加载…</div>

    <template v-else-if="section === 'pending'">
      <div v-if="canWrite" class="picking-actions">
        <label
          >波次策略<select v-model="waveForm.strategy">
            <option value="time">交货时间</option>
            <option value="area">地址区域</option>
            <option value="route">配送线路</option>
            <option value="category">商品分类</option>
          </select></label
        ><label
          >截止时间<input
            v-model="waveForm.cutoffAt"
            type="datetime-local" /></label
        ><label v-if="waveForm.strategy === 'area'"
          >区域<input v-model="waveForm.area" required /></label
        ><label v-if="waveForm.strategy === 'route'"
          >线路<select v-model="waveForm.routeId" required>
            <option value="">请选择</option>
            <option
              v-for="item in deliveryRoutes.filter(
                (x) => x.status === 'enabled',
              )"
              :key="item.id"
              :value="item.id"
            >
              {{ item.code }} · {{ item.name }}
            </option>
          </select></label
        ><label v-if="waveForm.strategy === 'category'"
          >分类<select v-model="waveForm.categoryId" required>
            <option value="">请选择</option>
            <option v-for="item in waveCategories" :key="item" :value="item">
              {{ item }}
            </option>
          </select></label
        ><button
          class="inv-button primary"
          :disabled="selectedOrders.length < 1 || saving"
          @click="createWave"
        >
          将已选订单创建波次</button
        ><button
          class="inv-button"
          :disabled="selectedOrders.length < 1"
          @click="previewPendingPrint = true"
        >
          打印预览</button
        ><small>波次仅允许同仓订单；单单分拣可直接在列表创建。</small>
      </div>
      <div v-if="!pendingPickingOrders.length" class="inventory-state">
        <strong>暂无待分拣订单</strong
        ><span>请先在订单模块从零创建并审核销售订单。</span>
      </div>
      <div v-else class="inventory-table-wrap">
        <table class="inventory-table">
          <thead>
            <tr>
              <th v-if="canWrite">选择</th>
              <th>订单</th>
              <th>客户</th>
              <th>仓库</th>
              <th>交付日期</th>
              <th>配送方式</th>
              <th>状态</th>
              <th>商品余量</th>
              <th v-if="canWrite">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in pendingPickingOrders" :key="item.order.orderId">
              <td v-if="canWrite">
                <input
                  v-model="selectedOrders"
                  type="checkbox"
                  :value="item.order.orderId"
                  :disabled="item.ownerId !== null"
                />
              </td>
              <td>{{ item.order.orderNo }}</td>
              <td>{{ item.order.customerName }}</td>
              <td>{{ item.order.warehouseName }}</td>
              <td>{{ item.order.requestedDeliveryAt.slice(0, 10) }}</td>
              <td>{{ item.order.deliveryMethod }}</td>
              <td>
                <span class="inv-status inv-status-enabled">{{
                  statusName(item.pickingStatus)
                }}</span>
              </td>
              <td>
                {{
                  item.order.lines
                    .map(
                      (line) =>
                        `${line.productName} ${quantity(line.remainingQuantityMilli)}`,
                    )
                    .join("；")
                }}
              </td>
              <td v-if="canWrite">
                <button
                  class="inv-button"
                  :disabled="item.ownerId !== null || saving"
                  @click="
                    act(
                      () => store.createPickingTask(item.order.orderId),
                      '分拣任务已创建',
                    )
                  "
                >
                  创建分拣任务
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else-if="section === 'tasks'">
      <div v-if="!pickingTasks.length" class="inventory-state">
        <strong>暂无订单分拣任务</strong><span>请先从待分拣订单创建。</span>
      </div>
      <div
        v-for="task in pickingTasks"
        v-else
        :key="task.id"
        class="picking-card"
      >
        <header>
          <div>
            <strong>{{ task.code }} · {{ task.orderSnapshot.orderNo }}</strong
            ><small
              >{{ task.orderSnapshot.customerName }} ·
              {{ statusName(task.status) }} · v{{ task.version }}</small
            >
          </div>
          <div v-if="canWrite">
            <button
              v-if="task.status === 'pending'"
              class="inv-button primary"
              @click="
                act(
                  () =>
                    store.startPickingTask(task, deliveryStaff[0]?.id ?? ''),
                  '已开始分拣',
                );
                prepareTask(task);
              "
            >
              开始分拣</button
            ><button
              v-if="task.status === 'pending'"
              class="inv-button"
              @click="act(() => store.cancelPickingTask(task), '任务已取消')"
            >
              取消</button
            ><button
              v-if="task.status === 'completed' && !task.outboundId"
              class="inv-button primary"
              @click="
                act(
                  () => store.confirmPickingOutbound(task),
                  '已通过订单域正式出库',
                )
              "
            >
              确认出库
            </button>
          </div>
        </header>
        <div class="picking-lines">
          <div v-for="line in task.lines" :key="line.id">
            <span>{{ line.productName }} · {{ line.specification }}</span
            ><span>应拣 {{ quantity(line.expectedQuantityMilli) }}</span
            ><input
              v-if="task.status === 'picking' && canWrite"
              v-model.number="taskActuals[line.id]"
              type="number"
              min="0"
              :max="line.expectedQuantityMilli / 1000"
              step="0.001"
              @focus="prepareTask(task)"
            /><span v-else>实拣 {{ quantity(line.actualQuantityMilli) }}</span
            ><small
              >建议库位：{{
                line.suggestedLocationIds.join("、") || "无"
              }}</small
            >
          </div>
        </div>
        <div
          v-if="task.status === 'picking' && canWrite"
          class="picking-actions"
        >
          <input
            v-model="reasons[task.id]"
            placeholder="短拣时必须填写原因"
            maxlength="200"
          /><button class="inv-button primary" @click="submitTask(task)">
            提交实拣
          </button>
        </div>
        <div
          v-for="difference in pickingDifferences.filter(
            (x) =>
              x.ownerType === 'task' &&
              x.ownerId === task.id &&
              x.status === 'pending',
          )"
          :key="difference.id"
          class="inventory-warning"
        >
          差异 {{ difference.code }}：{{ difference.reason }}
          <button
            class="inv-button"
            @click="
              act(
                () =>
                  store.resolvePickingDifference(
                    difference,
                    'continue-picking',
                  ),
                '已返回继续分拣',
              )
            "
          >
            继续分拣</button
          ><button
            class="inv-button primary"
            @click="
              act(
                () =>
                  store.resolvePickingDifference(difference, 'accepted-short'),
                '已接受短拣',
              )
            "
          >
            接受短拣
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="section === 'waves'">
      <div v-if="!pickingWaves.length" class="inventory-state">
        <strong>暂无波次</strong><span>从待分拣订单勾选同仓订单创建。</span>
      </div>
      <div
        v-for="wave in pickingWaves"
        v-else
        :key="wave.id"
        class="picking-card"
      >
        <header>
          <div>
            <strong>{{ wave.code }} · {{ wave.orders.length }} 张订单</strong
            ><small
              >{{ wave.strategy }} · {{ statusName(wave.status) }} · v{{
                wave.version
              }}</small
            >
          </div>
          <div v-if="canWrite">
            <button
              v-if="wave.status === 'pending'"
              class="inv-button primary"
              @click="
                act(
                  () =>
                    store.startPickingWave(wave, deliveryStaff[0]?.id ?? ''),
                  '波次已开始',
                );
                prepareWave(wave);
              "
            >
              开始波次</button
            ><button
              v-if="wave.status === 'pending'"
              class="inv-button"
              @click="act(() => store.cancelPickingWave(wave), '波次已取消')"
            >
              取消</button
            ><button
              v-if="wave.status === 'completed' && !wave.outboundResults.length"
              class="inv-button primary"
              @click="
                act(
                  () => store.confirmWaveOutbounds(wave),
                  '波次订单已原子出库',
                )
              "
            >
              批量确认出库
            </button>
          </div>
        </header>
        <fieldset class="processing-lines">
          <legend>SKU 汇总（汇总实拣 = 各订单分播合计）</legend>
          <div v-for="item in waveSkuSummary(wave)" :key="item.name" class="processing-line">
            <span>{{ item.name }}</span><span>应拣 {{ quantity(item.expected) }}</span><span>实拣 {{ quantity(item.actual) }}</span>
          </div>
        </fieldset>
        <div class="picking-lines">
          <div
            v-for="line in wave.allocations"
            :key="`${line.orderId}:${line.orderLineId}`"
          >
            <span
              >{{
                wave.orders.find((x) => x.orderId === line.orderId)?.orderNo
              }}
              ·
              {{
                wave.orders
                  .find((x) => x.orderId === line.orderId)
                  ?.lines.find((x) => x.orderLineId === line.orderLineId)
                  ?.productName
              }}</span
            ><span>应分播 {{ quantity(line.expectedQuantityMilli) }}</span
            ><input
              v-if="wave.status === 'picking' && canWrite"
              v-model.number="
                waveActuals[`${line.orderId}:${line.orderLineId}`]
              "
              type="number"
              min="0"
              :max="line.expectedQuantityMilli / 1000"
              step="0.001"
              @focus="prepareWave(wave)"
            /><span v-else
              >实分播 {{ quantity(line.actualQuantityMilli) }}</span
            >
          </div>
        </div>
        <div
          v-if="wave.status === 'picking' && canWrite"
          class="picking-actions"
        >
          <input
            v-model="reasons[wave.id]"
            placeholder="短拣时必须填写原因"
          /><button class="inv-button primary" @click="submitWave(wave)">
            提交分播
          </button>
        </div>
        <div
          v-for="difference in pickingDifferences.filter(
            (x) =>
              x.ownerType === 'wave' &&
              x.ownerId === wave.id &&
              x.status === 'pending',
          )"
          :key="difference.id"
          class="inventory-warning"
        >
          {{ difference.code }} · {{ difference.orderId }}：{{
            difference.reason
          }}
          <button
            class="inv-button"
            @click="
              act(
                () =>
                  store.resolvePickingDifference(
                    difference,
                    'continue-picking',
                  ),
                '已返回继续分播',
              )
            "
          >
            继续分拣</button
          ><button
            class="inv-button primary"
            @click="
              act(
                () =>
                  store.resolvePickingDifference(difference, 'accepted-short'),
                '已接受短拣',
              )
            "
          >
            接受短拣
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="section === 'routes'">
      <form
        v-if="canWrite"
        class="inventory-form picking-form"
        @submit.prevent="saveRoute"
      >
        <label
          >线路名称<input
            v-model="routeForm.name"
            required
            maxlength="100" /></label
        ><label>省<input v-model="routeForm.province" required /></label
        ><label>市<input v-model="routeForm.city" required /></label
        ><label>区县<input v-model="routeForm.district" required /></label>
        <fieldset class="wide processing-lines">
          <legend>有序站点</legend>
          <div
            v-for="(stop, index) in routeForm.stops"
            :key="index"
            class="processing-line"
          >
            <span>第 {{ index + 1 }} 站</span
            ><input
              v-model="stop.name"
              placeholder="站点名称"
              required
              maxlength="100"
            /><input
              v-model="stop.address"
              placeholder="详细地址"
              required
              maxlength="200"
            /><button
              v-if="routeForm.stops.length > 1"
              class="inv-button"
              type="button"
              @click="routeForm.stops.splice(index, 1)"
            >
              移除
            </button>
          </div>
          <button
            class="inv-button"
            type="button"
            @click="routeForm.stops.push({ name: '', address: '' })"
          >
            添加站点
          </button>
        </fieldset>
        <label
          >预计分钟<input
            v-model.number="routeForm.estimatedMinutes"
            type="number"
            min="1"
            required /></label
        ><label
          >状态<select v-model="routeForm.status">
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select></label
        ><label
          >默认司机<select v-model="routeForm.driverId"><option value="">不指定</option><option v-for="item in deliveryStaff" :key="item.id" :value="item.id">{{ item.name }}</option></select></label
        ><label
          >默认车辆<select v-model="routeForm.vehicleId"><option value="">不指定</option><option v-for="item in deliveryVehicles" :key="item.id" :value="item.id">{{ item.plateNumber }}</option></select></label
        ><button class="inv-button primary" :disabled="saving" type="submit">
          {{ editingRoute ? "保存线路修改" : "保存线路" }}
        </button>
      </form>
      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>编码</th>
              <th>名称</th>
              <th>区域</th>
              <th>站点</th>
              <th>预计时长</th>
              <th>状态</th>
              <th v-if="canWrite">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in deliveryRoutes" :key="item.id">
              <td>{{ item.code }}</td>
              <td>{{ item.name }}</td>
              <td>{{ item.province }}{{ item.city }}{{ item.district }}</td>
              <td>
                {{
                  item.stops.map((x) => `${x.sequence}.${x.name}`).join(" → ")
                }}
              </td>
              <td>{{ item.estimatedMinutes ?? "—" }} 分钟</td>
              <td>{{ statusName(item.status) }}</td>
              <td v-if="canWrite">
                <button class="inv-button" @click="editRoute(item)">编辑</button
                ><button
                  class="inv-button"
                  @click="
                    act(() => store.deleteDeliveryRoute(item), '线路已删除')
                  "
                >
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else-if="section === 'vehicles'">
      <form
        v-if="canWrite"
        class="inventory-form picking-form"
        @submit.prevent="saveVehicle"
      >
        <label
          >车牌号<input
            v-model="vehicleForm.plateNumber"
            required
            maxlength="30" /></label
        ><label
          >车型<select v-model="vehicleForm.type">
            <option value="van">面包车</option>
            <option value="truck-4.2m">4.2 米货车</option>
            <option value="truck-7.6m">7.6 米货车</option>
            <option value="truck-9.6m">9.6 米货车</option>
            <option value="other">其他</option>
          </select></label
        ><label v-if="vehicleForm.type === 'other'"
          >其他车型<input v-model="vehicleForm.otherType" required /></label
        ><label
          >载重（kg）<input
            v-model.number="vehicleForm.capacityKg"
            type="number"
            min="1"
            required /></label
        ><label
          >默认司机<select v-model="vehicleForm.driverId">
            <option value="">不指定</option>
            <option
              v-for="item in deliveryStaff"
              :key="item.id"
              :value="item.id"
            >
              {{ item.name }}
            </option>
          </select></label
        ><label
          >状态<select v-model="vehicleForm.status">
            <option value="idle">空闲</option>
            <option value="maintenance">维修</option>
          </select></label
        ><button class="inv-button primary" :disabled="saving" type="submit">
          {{ editingVehicle ? "保存车辆修改" : "保存车辆" }}
        </button>
      </form>
      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>车牌号</th>
              <th>车型</th>
              <th>载重</th>
              <th>默认司机</th>
              <th>状态</th>
              <th v-if="canWrite">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in deliveryVehicles" :key="item.id">
              <td>{{ item.plateNumber }}</td>
              <td>{{ item.otherType ?? item.type }}</td>
              <td>{{ item.capacityKg }} kg</td>
              <td>
                {{
                  deliveryStaff.find((x) => x.id === item.defaultDriverId)
                    ?.name ?? "—"
                }}
              </td>
              <td>{{ statusName(item.status) }}</td>
              <td v-if="canWrite">
                <button
                  class="inv-button"
                  :disabled="item.status === 'dispatching'"
                  @click="editVehicle(item)"
                >
                  编辑
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else-if="section === 'deliveries'">
      <form
        v-if="canWrite"
        class="inventory-form picking-form"
        @submit.prevent="saveDelivery"
      >
        <fieldset class="wide processing-lines">
          <legend>已分拣出库且尚未发货的送货上门订单</legend>
          <label v-for="item in deliveryOrderOptions" :key="item.orderId"
            ><input
              v-model="selectedDeliveryOrders"
              type="checkbox"
              :value="item.orderId"
            />{{ item.orderNo }} · {{ item.customerName }} ·
            {{ item.district }}</label
          ><small v-if="!deliveryCandidates.length"
            >暂无候选；物流和客户自提仍在订单履约中处理。</small
          >
        </fieldset>
        <label
          >线路<select v-model="deliveryForm.routeId" required>
            <option value="">请选择</option>
            <option
              v-for="item in deliveryRoutes.filter(
                (x) => x.status === 'enabled',
              )"
              :key="item.id"
              :value="item.id"
            >
              {{ item.code }} · {{ item.name }}
            </option>
          </select></label
        ><label
          >车辆<select v-model="deliveryForm.vehicleId" required>
            <option value="">请选择</option>
            <option
              v-for="item in deliveryVehicles.filter(
                (x) => x.status === 'idle',
              )"
              :key="item.id"
              :value="item.id"
            >
              {{ item.plateNumber }}
            </option>
          </select></label
        ><label
          >司机<select v-model="deliveryForm.driverId" required>
            <option value="">请选择</option>
            <option
              v-for="item in deliveryStaff"
              :key="item.id"
              :value="item.id"
            >
              {{ item.name }}
            </option>
          </select></label
        ><label
          >计划出发<input
            v-model="deliveryForm.plannedDepartureAt"
            type="datetime-local"
            required /></label
        ><label class="wide"
          >备注<textarea v-model="deliveryForm.note" maxlength="500" /></label
        ><button
          class="inv-button primary wide"
          :disabled="saving || !selectedDeliveryOrders.length"
          type="submit"
        >
          {{ editingDelivery ? "保存配送任务修改" : "创建配送任务" }}
        </button>
      </form>
      <div v-for="item in deliveryTasks" :key="item.id" class="picking-card">
        <header>
          <div>
            <strong>{{ item.code }} · {{ item.routeSnapshot.name }}</strong
            ><small
              >{{ item.driverSnapshot.name }} ·
              {{ item.vehicleSnapshot.plateNumber }} ·
              {{ statusName(item.status) }}</small
            >
          </div>
          <div v-if="canWrite">
            <button
              v-if="item.status === 'pending'"
              class="inv-button"
              @click="editDelivery(item)"
            >
              编辑
            </button>
            <button
              v-if="item.status === 'pending'"
              class="inv-button primary"
              @click="
                act(() => store.startDeliveryTask(item), '已发货并开始配送')
              "
            >
              开始配送</button
            ><button
              v-if="item.status === 'pending'"
              class="inv-button"
              @click="
                act(() => store.cancelDeliveryTask(item), '配送任务已取消')
              "
            >
              取消</button
            ><button
              v-if="item.status === 'delivering'"
              class="inv-button primary"
              @click="
                act(
                  () => store.completeDeliveryTask(item),
                  '配送任务已完成；客户签收仍在订单模块确认',
                )
              "
            >
              完成配送
            </button>
          </div>
        </header>
        <p>
          {{
            item.orders
              .map((x) => `${x.orderNo} · ${x.customerName}`)
              .join("；")
          }}
        </p>
      </div>
    </template>

    <template v-else>
      <form
        v-if="canWrite"
        class="inventory-form picking-form"
        @submit.prevent="saveLabel"
      >
        <label
          >分拣来源<select v-model="labelForm.sourceType">
            <option value="task">订单分拣</option>
            <option value="wave">波次分拣</option>
          </select></label
        ><label
          >来源单<select v-model="labelForm.sourceId" required>
            <option value="">请选择</option>
            <option
              v-for="item in labelSources"
              :key="item.id"
              :value="item.id"
            >
              {{ item.code }}
            </option>
          </select></label
        ><label
          >订单<select v-model="labelForm.orderId" required>
            <option
              v-for="item in labelOrders"
              :key="item.orderId"
              :value="item.orderId"
            >
              {{ item.orderNo }}
            </option>
          </select></label
        ><label
          >标签类型<select v-model="labelForm.type">
            <option value="order">订单标签</option>
            <option value="product">商品标签</option>
            <option value="box">箱标签</option>
          </select></label
        ><label v-if="labelForm.type !== 'order'"
          >商品<select v-model="labelForm.skuId" required><option value="">请选择</option><option v-for="line in labelLines" :key="line.skuId" :value="line.skuId">{{ line.productName }} · {{ line.skuCode }} · {{ line.specification }}</option></select></label
        ><label
          >数量<input
            v-model.number="labelForm.quantity"
            type="number"
            min="0.001"
            step="0.001"
            required /></label
        ><label>库位文字<input v-model="labelForm.locationText" /></label
        ><label>模板<input v-model="labelForm.templateId" required /></label
        ><button class="inv-button primary" :disabled="saving" type="submit">
          生成标签
        </button>
      </form>
      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>标签号</th>
              <th>条码</th>
              <th>类型</th>
              <th>订单</th>
              <th>商品</th>
              <th>数量</th>
              <th>打印次数</th>
              <th v-if="canWrite">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in pickingLabels" :key="item.id">
              <td>{{ item.code }}</td>
              <td>
                <code>{{ item.barcode }}</code>
              </td>
              <td>{{ item.type }}</td>
              <td>{{ item.orderNo }}</td>
              <td>{{ item.productName ?? "整单" }}</td>
              <td>{{ quantity(item.quantityMilli) }}</td>
              <td>{{ item.printCount }}</td>
              <td v-if="canWrite">
                <button class="inv-button" @click="previewLabelId = item.id">
                  打印预览
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <footer
      v-if="pageMeta.total > pageMeta.pageSize"
      class="inventory-pagination"
    >
      <span>共 {{ pageMeta.total }} 条</span
      ><button
        class="inv-button"
        :disabled="currentPage <= 1"
        @click="goPage(currentPage - 1)"
      >
        上一页</button
      ><span>{{ currentPage }} / {{ pageCount }}</span
      ><button
        class="inv-button"
        :disabled="currentPage >= pageCount"
        @click="goPage(currentPage + 1)"
      >
        下一页
      </button>
    </footer>
    <div v-if="previewPendingPrint" class="inventory-dialog">
      <section>
        <header><strong>待分拣单打印预览（原型假适配器）</strong><button class="inv-button" @click="previewPendingPrint = false">取消</button></header>
        <p>{{ pendingPickingOrders.filter((item) => selectedOrders.includes(item.order.orderId)).map((item) => `${item.order.orderNo} · ${item.order.customerName} · ${item.order.lines.length} 个 SKU`).join("；") }}</p>
        <p class="status-muted">不会连接真实打印机；取消不会产生打印记录。</p>
        <button class="inv-button primary" @click="previewPendingPrint = false; message = '待分拣单已完成模拟打印'">确认模拟打印</button>
      </section>
    </div>
    <div v-if="previewLabelId" class="inventory-dialog">
      <section>
        <header>
          <strong>标签打印预览（原型假适配器）</strong
          ><button class="inv-button" @click="previewLabelId = ''">取消</button>
        </header>
        <p>
          标签：{{
            pickingLabels.find((x) => x.id === previewLabelId)?.code
          }}　条码：{{
            pickingLabels.find((x) => x.id === previewLabelId)?.barcode
          }}
        </p>
        <label
          >打印份数
          <input v-model.number="printCopies" type="number" min="1" max="100"
        /></label>
        <p class="status-muted">
          不会连接真实打印机；只有确认后才累计打印次数。
        </p>
        <button
          class="inv-button primary"
          @click="
            act(
              () => store.printPickingLabels([previewLabelId], printCopies),
              '模拟打印已确认',
            );
            previewLabelId = '';
          "
        >
          确认模拟打印
        </button>
      </section>
    </div>
  </section>
</template>
