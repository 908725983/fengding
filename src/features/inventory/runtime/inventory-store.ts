import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { InventoryScenarioName } from "../../../../mock/handlers/inventory-handler";
import { getApplicationMockRuntimeController } from "../../../app/runtime/app-mock-runtime";
import { setCurrentInventoryRole } from "./inventory-access";
import type {
  InventoryActor,
  InventoryQuery,
  InventoryThreshold,
  InventoryWorkspace,
  LocationDraft,
  LocationImportRow,
  WarehouseDraft,
  InventoryDocumentListQuery,
  InventoryTransfer,
  InventoryTransferDraft,
  InventoryOtherOutbound,
  InventoryOtherOutboundDraft,
  InventoryOtherInbound,
  InventoryOtherInboundDraft,
  InventoryStocktake,
  InventoryStocktakeDraft,
  InventoryCostAdjustment,
  InventoryCostAdjustmentDraft,
  InventoryClosingPage,
  ProcessingRecipe,
  ProcessingRecipeDraft,
  ProcessingPlan,
  ProcessingPlanDraft,
  ProcessingOrder,
  ProcessingOrderDraft,
  MaterialPick,
  MaterialPickDraft,
  MaterialReturn,
  MaterialReturnDraft,
  ProcessingYieldRow,
  ProcessingListQuery,
  CompleteProcessingOrderInput,
  ProcessingSalesOrderSnapshot,
  InventorySkuSnapshot,
  InventoryStatisticsPage,
  InventoryStatisticsQuery,
  InventoryStatisticsFilterOptions,
} from "../types";
import type {
  DeliveryRoute,
  DeliveryRouteDraft,
  DeliveryTask,
  DeliveryTaskDraft,
  DeliveryVehicle,
  DeliveryVehicleDraft,
  PendingPickingOrderRow,
  PickingDifference,
  PickingLabel,
  PickingLabelDraft,
  PickingListQuery,
  PickingOrderSnapshot,
  PickingTask,
  PickingWave,
  PickingWaveDraft,
} from "../types";

const emptyWorkspace = (): InventoryWorkspace => ({
  stocks: { items: [], total: 0, page: 1, pageSize: 30 },
  batches: [],
  movements: [],
  warehouses: [],
  locations: [],
  categories: [],
  catalogAvailable: true,
});

export const useInventoryStore = defineStore("inventory", () => {
  const runtimeController = getApplicationMockRuntimeController();
  const session = runtimeController.inventory;
  let pickingPrintRequestSequence = 1;
  const scenario = computed<InventoryScenarioName>(() => session.scenarioName);
  const actor = ref<InventoryActor>({
    role: "super-admin",
    actorId: "admin-demo",
  });
  const query = ref<InventoryQuery>({ page: 1, pageSize: 30 });
  const workspace = ref<InventoryWorkspace>(emptyWorkspace());
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const transfers = ref<InventoryTransfer[]>([]);
  const otherOutbounds = ref<InventoryOtherOutbound[]>([]);
  const otherInbounds = ref<InventoryOtherInbound[]>([]);
  const stocktakes = ref<InventoryStocktake[]>([]);
  const costAdjustments = ref<InventoryCostAdjustment[]>([]);
  const closings = ref<InventoryClosingPage>({
    year: 2026,
    items: [],
    sourceVersion: "",
    nextClosableMonth: null,
    currentMonth: "2026-08",
  });
  const processingRecipes = ref<ProcessingRecipe[]>([]);
  const processingPlans = ref<ProcessingPlan[]>([]);
  const processingOrders = ref<ProcessingOrder[]>([]);
  const materialPicks = ref<MaterialPick[]>([]);
  const materialReturns = ref<MaterialReturn[]>([]);
  const processingYields = ref<ProcessingYieldRow[]>([]);
  const eligibleProcessingOrders = ref<ProcessingSalesOrderSnapshot[]>([]);
  const processingOrderProviderState = ref<"available" | "unavailable">(
    "unavailable",
  );
  const processingSkus = ref<InventorySkuSnapshot[]>([]);
  const pendingPickingOrders = ref<PendingPickingOrderRow[]>([]);
  const pickingTasks = ref<PickingTask[]>([]);
  const pickingWaves = ref<PickingWave[]>([]);
  const pickingDifferences = ref<PickingDifference[]>([]);
  const deliveryRoutes = ref<DeliveryRoute[]>([]);
  const deliveryVehicles = ref<DeliveryVehicle[]>([]);
  const deliveryTasks = ref<DeliveryTask[]>([]);
  const deliveryCandidates = ref<PickingOrderSnapshot[]>([]);
  const pickingLabels = ref<PickingLabel[]>([]);
  const deliveryStaff = ref<Array<{ id: string; name: string }>>([]);
  const pickingPages = ref<
    Record<
      | "pending"
      | "tasks"
      | "waves"
      | "deliveries"
      | "routes"
      | "vehicles"
      | "labels",
      { total: number; page: number; pageSize: number }
    >
  >({
    pending: { total: 0, page: 1, pageSize: 30 },
    tasks: { total: 0, page: 1, pageSize: 30 },
    waves: { total: 0, page: 1, pageSize: 30 },
    deliveries: { total: 0, page: 1, pageSize: 30 },
    routes: { total: 0, page: 1, pageSize: 30 },
    vehicles: { total: 0, page: 1, pageSize: 30 },
    labels: { total: 0, page: 1, pageSize: 30 },
  });
  const transferPage = ref({ total: 0, page: 1, pageSize: 30 });
  const otherOutboundPage = ref({ total: 0, page: 1, pageSize: 30 });
  const otherInboundPage = ref({ total: 0, page: 1, pageSize: 30 });
  const stocktakePage = ref({ total: 0, page: 1, pageSize: 30 });
  const costAdjustmentPage = ref({ total: 0, page: 1, pageSize: 30 });
  const statisticsPage = ref<InventoryStatisticsPage>({
    report: "inventory-ledger",
    query: { report: "inventory-ledger", fromDate: "2026-08-01", toDate: "2026-08-10", page: 1, pageSize: 30 },
    items: [], total: 0,
    totals: { openingQuantityMilli: 0, openingAmountCents: 0, inboundQuantityMilli: 0, inboundAmountCents: 0, inboundDocumentCount: 0, outboundQuantityMilli: 0, outboundAmountCents: 0, outboundDocumentCount: 0, endingQuantityMilli: 0, endingAmountCents: 0, netQuantityMilli: 0, netAmountCents: 0, costAdjustmentCents: 0 },
    snapshotVersion: "", availability: "available", catalogState: "available", periodState: "current", message: null, amountsVisible: true,
  });
  const statisticsOptions = ref<InventoryStatisticsFilterOptions>({ warehouses: [], categories: [], catalogState: "available" });
  const canWrite = computed(() =>
    ["super-admin", "warehouse"].includes(actor.value.role),
  );
  const isEmpty = computed(
    () => !loading.value && !error.value && workspace.value.stocks.total === 0,
  );
  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      workspace.value = await session.run(() =>
        session.service.getWorkspace(actor.value, query.value),
      );
    } catch (caught) {
      error.value =
        caught instanceof Error ? caught.message : "库存数据加载失败";
      workspace.value = emptyWorkspace();
    } finally {
      loading.value = false;
    }
  }
  async function setScenario(next: InventoryScenarioName): Promise<void> {
    actor.value =
      next === "permission-denied"
        ? { role: "finance", actorId: "finance-demo" }
        : { role: "super-admin", actorId: "admin-demo" };
    setCurrentInventoryRole(actor.value.role);
    runtimeController.reset(next);
    await load();
  }
  async function setRole(role: InventoryActor["role"]): Promise<void> {
    actor.value = { role, actorId: `${role}-demo` };
    setCurrentInventoryRole(role);
    await load();
  }
  async function applyQuery(next: InventoryQuery): Promise<void> {
    query.value = { ...next, page: next.page ?? 1, pageSize: 30 };
    await load();
  }
  async function saveWarehouse(
    draft: WarehouseDraft,
    id?: string,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.saveWarehouse(actor.value, draft, id),
      );
      await load();
    } finally {
      saving.value = false;
    }
  }
  async function saveLocation(
    draft: LocationDraft,
    id?: string,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.saveLocation(actor.value, draft, id),
      );
      await load();
    } finally {
      saving.value = false;
    }
  }
  async function saveThreshold(value: InventoryThreshold): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.saveThreshold(actor.value, value),
      );
      await load();
    } finally {
      saving.value = false;
    }
  }
  async function importLocations(rows: LocationImportRow[]): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.importLocations(actor.value, rows),
      );
      await load();
    } finally {
      saving.value = false;
    }
  }
  function previewLocationImport(rows: LocationImportRow[]) {
    return session.service.previewLocationImport(actor.value, rows);
  }
  function exportStocks(selected: string[]): string {
    return session.service.exportStocksCsv(actor.value, query.value, selected);
  }
  function exportLocations(selected: string[]): string {
    return session.service.exportLocationsCsv(actor.value, selected);
  }
  async function loadTransfers(
    query: InventoryDocumentListQuery | Event = {},
  ): Promise<void> {
    const safeQuery = query instanceof Event ? {} : query;
    loading.value = true;
    error.value = null;
    try {
      const result = await session.run(() =>
        session.service.listTransfers(actor.value, safeQuery),
      );
      transfers.value = result.items;
      transferPage.value = {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    } catch (caught) {
      error.value =
        caught instanceof Error ? caught.message : "转仓数据加载失败";
      transfers.value = [];
      transferPage.value.total = 0;
    } finally {
      loading.value = false;
    }
  }
  async function loadOtherOutbounds(
    query: InventoryDocumentListQuery | Event = {},
  ): Promise<void> {
    const safeQuery = query instanceof Event ? {} : query;
    loading.value = true;
    error.value = null;
    try {
      const result = await session.run(() =>
        session.service.listOtherOutbounds(actor.value, safeQuery),
      );
      otherOutbounds.value = result.items;
      otherOutboundPage.value = {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    } catch (caught) {
      error.value =
        caught instanceof Error ? caught.message : "其他出库加载失败";
      otherOutbounds.value = [];
      otherOutboundPage.value.total = 0;
    } finally {
      loading.value = false;
    }
  }
  async function loadOtherInbounds(
    query: InventoryDocumentListQuery | Event = {},
  ): Promise<void> {
    const safeQuery = query instanceof Event ? {} : query;
    loading.value = true;
    error.value = null;
    try {
      const result = await session.run(() =>
        session.service.listOtherInbounds(actor.value, safeQuery),
      );
      otherInbounds.value = result.items;
      otherInboundPage.value = {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    } catch (caught) {
      error.value =
        caught instanceof Error ? caught.message : "其他入库加载失败";
      otherInbounds.value = [];
      otherInboundPage.value.total = 0;
    } finally {
      loading.value = false;
    }
  }
  async function createTransfer(value: InventoryTransferDraft): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.createTransfer(actor.value, value),
      );
      await loadTransfers();
    } finally {
      saving.value = false;
    }
  }
  async function createOtherOutbound(
    value: InventoryOtherOutboundDraft,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.createOtherOutbound(actor.value, value),
      );
      await loadOtherOutbounds();
    } finally {
      saving.value = false;
    }
  }
  async function createOtherInbound(
    value: InventoryOtherInboundDraft,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.createOtherInbound(actor.value, value),
      );
      await loadOtherInbounds();
    } finally {
      saving.value = false;
    }
  }
  async function approveTransfer(value: InventoryTransfer): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.approveTransfer(actor.value, value),
      );
      await loadTransfers();
    } finally {
      saving.value = false;
    }
  }
  async function shipTransfer(
    value: InventoryTransfer,
    locationId: string,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.shipTransfer(actor.value, value, locationId),
      );
      await loadTransfers();
    } finally {
      saving.value = false;
    }
  }
  async function receiveTransfer(
    value: InventoryTransfer,
    locationId: string,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.receiveTransfer(actor.value, value, locationId),
      );
      await loadTransfers();
    } finally {
      saving.value = false;
    }
  }
  async function approveOtherOutbound(
    value: InventoryOtherOutbound,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.approveOtherOutbound(actor.value, value),
      );
      await loadOtherOutbounds();
    } finally {
      saving.value = false;
    }
  }
  async function approveOtherInbound(
    value: InventoryOtherInbound,
    locationId: string,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.approveOtherInbound(actor.value, value, locationId),
      );
      await loadOtherInbounds();
    } finally {
      saving.value = false;
    }
  }
  async function deleteTransfer(value: InventoryTransfer): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.deleteTransfer(actor.value, value),
      );
      await loadTransfers();
    } finally {
      saving.value = false;
    }
  }
  async function deleteOtherOutbound(
    value: InventoryOtherOutbound,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.deleteOtherOutbound(actor.value, value),
      );
      await loadOtherOutbounds();
    } finally {
      saving.value = false;
    }
  }
  async function deleteOtherInbound(
    value: InventoryOtherInbound,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.deleteOtherInbound(actor.value, value),
      );
      await loadOtherInbounds();
    } finally {
      saving.value = false;
    }
  }
  async function loadStocktakes(
    query: InventoryDocumentListQuery = {},
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const result = await session.run(() =>
        session.service.listStocktakes(actor.value, query),
      );
      stocktakes.value = result.items;
      stocktakePage.value = {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : "盘点加载失败";
      stocktakes.value = [];
      stocktakePage.value.total = 0;
    } finally {
      loading.value = false;
    }
  }
  async function createStocktake(
    value: InventoryStocktakeDraft,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.createStocktake(actor.value, value),
      );
      await loadStocktakes();
    } finally {
      saving.value = false;
    }
  }
  async function startStocktake(value: InventoryStocktake): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.startStocktake(actor.value, value),
      );
      await loadStocktakes();
    } finally {
      saving.value = false;
    }
  }
  async function saveStocktakeCounts(value: InventoryStocktake): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.saveStocktakeCounts(actor.value, value),
      );
      await loadStocktakes();
    } finally {
      saving.value = false;
    }
  }
  async function approveStocktake(value: InventoryStocktake): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.approveStocktake(actor.value, value),
      );
      await loadStocktakes();
    } finally {
      saving.value = false;
    }
  }
  async function loadCostAdjustments(
    query: InventoryDocumentListQuery = {},
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const result = await session.run(() =>
        session.service.listCostAdjustments(actor.value, query),
      );
      costAdjustments.value = result.items;
      costAdjustmentPage.value = {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    } catch (caught) {
      error.value =
        caught instanceof Error ? caught.message : "成本调整加载失败";
      costAdjustments.value = [];
      costAdjustmentPage.value.total = 0;
    } finally {
      loading.value = false;
    }
  }
  async function createCostAdjustment(
    value: InventoryCostAdjustmentDraft,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.createCostAdjustment(actor.value, value),
      );
      await loadCostAdjustments();
    } finally {
      saving.value = false;
    }
  }
  async function approveCostAdjustment(
    value: InventoryCostAdjustment,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.approveCostAdjustment(actor.value, value),
      );
      await loadCostAdjustments();
    } finally {
      saving.value = false;
    }
  }
  async function loadClosings(year = 2026): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      closings.value = await session.run(() =>
        session.service.listClosings(actor.value, year),
      );
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : "结转加载失败";
    } finally {
      loading.value = false;
    }
  }
  async function closeMonth(month: string, requestId: string): Promise<void> {
    saving.value = true;
    try {
      closings.value = await session.run(() =>
        session.service.closeMonth(actor.value, month, requestId),
      );
    } finally {
      saving.value = false;
    }
  }
  function exportTransfers(value: InventoryDocumentListQuery = {}): string {
    return session.service.exportTransfersCsv(actor.value, value);
  }
  function exportOtherOutbounds(
    value: InventoryDocumentListQuery = {},
  ): string {
    return session.service.exportOtherOutboundsCsv(actor.value, value);
  }
  function exportOtherInbounds(value: InventoryDocumentListQuery = {}): string {
    return session.service.exportOtherInboundsCsv(actor.value, value);
  }
  function exportStocktakes(value: InventoryDocumentListQuery = {}): string {
    return session.service.exportStocktakesCsv(actor.value, value);
  }
  function exportCostAdjustments(
    value: InventoryDocumentListQuery = {},
  ): string {
    return session.service.exportCostAdjustmentsCsv(actor.value, value);
  }
  async function loadStatistics(value: InventoryStatisticsQuery = {}): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [page, options] = await Promise.all([
        session.run(() => session.service.queryStatistics(actor.value, value)),
        session.run(() => session.service.listStatisticsFilterOptions(actor.value)),
      ]);
      statisticsPage.value = page;
      statisticsOptions.value = options;
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : "库存统计加载失败";
      statisticsPage.value.items = [];
      statisticsPage.value.total = 0;
    } finally {
      loading.value = false;
    }
  }
  async function processingLoad<T>(
    operation: () => T,
    fallback: () => void,
    message: string,
  ): Promise<T | null> {
    loading.value = true;
    error.value = null;
    try {
      return await session.run(operation);
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : message;
      fallback();
      return null;
    } finally {
      loading.value = false;
    }
  }
  async function loadProcessingRecipes(
    value: ProcessingListQuery = {},
  ): Promise<void> {
    const result = await processingLoad(
      () => session.service.listProcessingRecipes(actor.value, value),
      () => {
        processingRecipes.value = [];
      },
      "加工配方加载失败",
    );
    if (result) processingRecipes.value = result.items;
  }
  async function loadProcessingPlans(
    value: ProcessingListQuery = {},
  ): Promise<void> {
    const result = await processingLoad(
      () => session.service.listProcessingPlans(actor.value, value),
      () => {
        processingPlans.value = [];
      },
      "加工计划加载失败",
    );
    if (result) processingPlans.value = result.items;
  }
  async function loadProcessingOrders(
    value: ProcessingListQuery = {},
  ): Promise<void> {
    const result = await processingLoad(
      () => session.service.listProcessingOrders(actor.value, value),
      () => {
        processingOrders.value = [];
      },
      "加工单加载失败",
    );
    if (result) processingOrders.value = result.items;
  }
  async function loadMaterialPicks(
    value: ProcessingListQuery = {},
  ): Promise<void> {
    const result = await processingLoad(
      () => session.service.listMaterialPicks(actor.value, value),
      () => {
        materialPicks.value = [];
      },
      "加工领料单加载失败",
    );
    if (result) materialPicks.value = result.items;
  }
  async function loadMaterialReturns(
    value: ProcessingListQuery = {},
  ): Promise<void> {
    const result = await processingLoad(
      () => session.service.listMaterialReturns(actor.value, value),
      () => {
        materialReturns.value = [];
      },
      "加工退料单加载失败",
    );
    if (result) materialReturns.value = result.items;
  }
  async function loadProcessingYields(
    value: ProcessingListQuery = {},
  ): Promise<void> {
    const result = await processingLoad(
      () => session.service.listProcessingYields(actor.value, value),
      () => {
        processingYields.value = [];
      },
      "出成率加载失败",
    );
    if (result) processingYields.value = result.items;
  }
  async function loadEligibleProcessingOrders(): Promise<void> {
    const result = await processingLoad(
      () => session.service.listEligibleProcessingOrders(actor.value),
      () => {
        eligibleProcessingOrders.value = [];
        processingOrderProviderState.value = "unavailable";
      },
      "销售订单来源加载失败",
    );
    if (result) {
      eligibleProcessingOrders.value = result.items;
      processingOrderProviderState.value = result.state;
    }
  }
  async function loadProcessingCatalog(): Promise<void> {
    const result = await processingLoad(
      () => session.service.listProcessingCatalog(actor.value),
      () => {
        processingSkus.value = [];
      },
      "加工商品资料加载失败",
    );
    if (result) processingSkus.value = result;
  }
  async function saveProcessingRecipe(
    value: ProcessingRecipeDraft,
    id?: string,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.saveProcessingRecipe(actor.value, value, id),
      );
      await loadProcessingRecipes();
    } finally {
      saving.value = false;
    }
  }
  function previewProcessingRecipeImport(values: ProcessingRecipeDraft[]) {
    return session.service.previewProcessingRecipeImport(actor.value, values);
  }
  async function importProcessingRecipes(
    values: ProcessingRecipeDraft[],
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.importProcessingRecipes(actor.value, values),
      );
      await loadProcessingRecipes();
    } finally {
      saving.value = false;
    }
  }
  async function deleteProcessingRecipe(id: string): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.deleteProcessingRecipe(actor.value, id),
      );
      await loadProcessingRecipes();
    } finally {
      saving.value = false;
    }
  }
  async function createProcessingPlan(
    value: ProcessingPlanDraft,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.createProcessingPlan(actor.value, value),
      );
      await loadProcessingPlans();
    } finally {
      saving.value = false;
    }
  }
  async function cancelProcessingPlan(value: ProcessingPlan): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.cancelProcessingPlan(
          actor.value,
          value.id,
          value.version,
        ),
      );
      await loadProcessingPlans();
    } finally {
      saving.value = false;
    }
  }
  async function createProcessingOrder(
    value: ProcessingOrderDraft,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.createProcessingOrder(actor.value, value),
      );
      await Promise.all([loadProcessingOrders(), loadProcessingPlans()]);
    } finally {
      saving.value = false;
    }
  }
  async function deleteProcessingOrder(value: ProcessingOrder): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.deleteProcessingOrder(
          actor.value,
          value.id,
          value.version,
        ),
      );
      await loadProcessingOrders();
    } finally {
      saving.value = false;
    }
  }
  async function createMaterialPick(value: MaterialPickDraft): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.createMaterialPick(actor.value, value),
      );
      await loadMaterialPicks();
    } finally {
      saving.value = false;
    }
  }
  async function confirmMaterialPick(value: MaterialPick): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.confirmMaterialPick(
          actor.value,
          value.id,
          value.version,
          `ui-pick-${value.id}-${value.version}`,
        ),
      );
      await Promise.all([loadMaterialPicks(), loadProcessingOrders()]);
    } finally {
      saving.value = false;
    }
  }
  async function createMaterialReturn(
    value: MaterialReturnDraft,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.createMaterialReturn(actor.value, value),
      );
      await loadMaterialReturns();
    } finally {
      saving.value = false;
    }
  }
  async function confirmMaterialReturn(value: MaterialReturn): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.confirmMaterialReturn(
          actor.value,
          value.id,
          value.version,
          `ui-return-${value.id}-${value.version}`,
        ),
      );
      await Promise.all([loadMaterialReturns(), loadProcessingOrders()]);
    } finally {
      saving.value = false;
    }
  }
  async function completeProcessingOrder(
    value: CompleteProcessingOrderInput,
  ): Promise<void> {
    saving.value = true;
    try {
      await session.run(() =>
        session.service.completeProcessingOrder(actor.value, value),
      );
      await Promise.all([
        loadProcessingOrders(),
        loadProcessingPlans(),
        loadProcessingYields(),
      ]);
    } finally {
      saving.value = false;
    }
  }
  function exportProcessingOrders(value: ProcessingListQuery = {}): string {
    return session.service.exportProcessingOrdersCsv(actor.value, value);
  }
  function exportProcessingYields(value: ProcessingListQuery = {}): string {
    return session.service.exportProcessingYieldsCsv(actor.value, value);
  }
  async function loadPickingWorkspace(
    value: PickingListQuery = {},
    section: "pending" | "tasks" | "waves" | "deliveries" | "routes" | "vehicles" | "labels" = "pending",
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    const applyPage = <T>(key: typeof section, result: { items: T[]; total: number; page: number; pageSize: number }, target: { value: T[] }) => { target.value = result.items; pickingPages.value[key] = { total: result.total, page: result.page, pageSize: result.pageSize } };
    try {
      if (section === "pending") { const [pending, routes] = await Promise.all([session.run(() => session.service.listPendingPickingOrders(actor.value, value)), session.run(() => session.service.listDeliveryRoutes(actor.value, { page: 1, pageSize: 100 }))]); applyPage(section, pending, pendingPickingOrders); deliveryRoutes.value = routes.items }
      if (section === "tasks") { const [tasks, differences, staff] = await Promise.all([session.run(() => session.service.listPickingTasks(actor.value, value)), session.run(() => session.service.listPickingDifferences(actor.value, value)), session.run(() => session.service.listDeliveryStaff(actor.value))]); applyPage(section, tasks, pickingTasks); pickingDifferences.value = differences.items; deliveryStaff.value = staff }
      if (section === "waves") { const [waves, differences, staff] = await Promise.all([session.run(() => session.service.listPickingWaves(actor.value, value)), session.run(() => session.service.listPickingDifferences(actor.value, value)), session.run(() => session.service.listDeliveryStaff(actor.value))]); applyPage(section, waves, pickingWaves); pickingDifferences.value = differences.items; deliveryStaff.value = staff }
      if (section === "deliveries") { const [tasks, candidates, routes, vehicles, staff] = await Promise.all([session.run(() => session.service.listDeliveryTasks(actor.value, value)), session.run(() => session.service.listDeliveryCandidates(actor.value)), session.run(() => session.service.listDeliveryRoutes(actor.value, { page: 1, pageSize: 100 })), session.run(() => session.service.listDeliveryVehicles(actor.value, { page: 1, pageSize: 100 })), session.run(() => session.service.listDeliveryStaff(actor.value))]); applyPage(section, tasks, deliveryTasks); deliveryCandidates.value = candidates.items; deliveryRoutes.value = routes.items; deliveryVehicles.value = vehicles.items; deliveryStaff.value = staff }
      if (section === "routes") { const [routes, vehicles, staff] = await Promise.all([session.run(() => session.service.listDeliveryRoutes(actor.value, value)), session.run(() => session.service.listDeliveryVehicles(actor.value, { page: 1, pageSize: 100 })), session.run(() => session.service.listDeliveryStaff(actor.value))]); applyPage(section, routes, deliveryRoutes); deliveryVehicles.value = vehicles.items; deliveryStaff.value = staff }
      if (section === "vehicles") { const [vehicles, staff] = await Promise.all([session.run(() => session.service.listDeliveryVehicles(actor.value, value)), session.run(() => session.service.listDeliveryStaff(actor.value))]); applyPage(section, vehicles, deliveryVehicles); deliveryStaff.value = staff }
      if (section === "labels") { const [labels, tasks, waves] = await Promise.all([session.run(() => session.service.listPickingLabels(actor.value, value)), session.run(() => session.service.listPickingTasks(actor.value, { page: 1, pageSize: 100 })), session.run(() => session.service.listPickingWaves(actor.value, { page: 1, pageSize: 100 }))]); applyPage(section, labels, pickingLabels); pickingTasks.value = tasks.items; pickingWaves.value = waves.items }
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : "分拣配送数据加载失败";
    } finally {
      loading.value = false;
    }
  }
  async function pickingSave(operation: () => unknown): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await session.run(operation);
    } catch (caught) {
      error.value =
        caught instanceof Error ? caught.message : "分拣配送操作失败";
      throw caught;
    } finally {
      saving.value = false;
    }
  }
  const createPickingTask = (orderId: string) =>
    pickingSave(() => session.service.createPickingTask(actor.value, orderId));
  const startPickingTask = (value: PickingTask, pickerId: string) =>
    pickingSave(() =>
      session.service.startPickingTask(
        actor.value,
        value.id,
        value.version,
        pickerId,
      ),
    );
  const cancelPickingTask = (value: PickingTask) =>
    pickingSave(() =>
      session.service.cancelPickingTask(actor.value, value.id, value.version),
    );
  const submitPickingTask = (
    value: PickingTask,
    actuals: Array<{ lineId: string; actualQuantityMilli: number }>,
    reason: string,
  ) =>
    pickingSave(() =>
      session.service.submitPickingTask(
        actor.value,
        value.id,
        value.version,
        actuals,
        reason,
      ),
    );
  const resolvePickingDifference = (
    value: PickingDifference,
    outcome: "continue-picking" | "accepted-short",
  ) =>
    pickingSave(() =>
      session.service.resolvePickingDifference(
        actor.value,
        value.id,
        value.version,
        outcome,
      ),
    );
  const confirmPickingOutbound = (value: PickingTask) =>
    pickingSave(() =>
      session.service.confirmPickingOutbound(
        actor.value,
        value.id,
        value.version,
        `ui-picking-outbound-${value.id}-${value.version}`,
      ),
    );
  const createPickingWave = (value: PickingWaveDraft) =>
    pickingSave(() => session.service.createPickingWave(actor.value, value));
  const startPickingWave = (value: PickingWave, pickerId: string) =>
    pickingSave(() =>
      session.service.startPickingWave(
        actor.value,
        value.id,
        value.version,
        pickerId,
      ),
    );
  const cancelPickingWave = (value: PickingWave) =>
    pickingSave(() =>
      session.service.cancelPickingWave(actor.value, value.id, value.version),
    );
  const submitPickingWave = (
    value: PickingWave,
    allocations: Array<{
      orderId: string;
      orderLineId: string;
      actualQuantityMilli: number;
    }>,
    reason: string,
  ) =>
    pickingSave(() =>
      session.service.submitPickingWave(
        actor.value,
        value.id,
        value.version,
        allocations,
        reason,
      ),
    );
  const confirmWaveOutbounds = (value: PickingWave) =>
    pickingSave(() =>
      session.service.confirmWaveOutbounds(
        actor.value,
        value.id,
        value.version,
        `ui-wave-outbound-${value.id}-${value.version}`,
      ),
    );
  const saveDeliveryRoute = (
    value: DeliveryRouteDraft,
    current?: DeliveryRoute,
  ) =>
    pickingSave(() =>
      session.service.saveDeliveryRoute(
        actor.value,
        value,
        current?.id,
        current?.version,
      ),
    );
  const deleteDeliveryRoute = (value: DeliveryRoute) =>
    pickingSave(() =>
      session.service.deleteDeliveryRoute(actor.value, value.id, value.version),
    );
  const saveDeliveryVehicle = (
    value: DeliveryVehicleDraft,
    current?: DeliveryVehicle,
  ) =>
    pickingSave(() =>
      session.service.saveDeliveryVehicle(
        actor.value,
        value,
        current?.id,
        current?.version,
      ),
    );
  const createDeliveryTask = (value: DeliveryTaskDraft) =>
    pickingSave(() => session.service.createDeliveryTask(actor.value, value));
  const updateDeliveryTask = (current: DeliveryTask, value: DeliveryTaskDraft) =>
    pickingSave(() => session.service.updateDeliveryTask(actor.value, current.id, current.version, value));
  const startDeliveryTask = (value: DeliveryTask) =>
    pickingSave(() =>
      session.service.startDeliveryTask(
        actor.value,
        value.id,
        value.version,
        `ui-delivery-start-${value.id}-${value.version}`,
      ),
    );
  const completeDeliveryTask = (value: DeliveryTask) =>
    pickingSave(() =>
      session.service.completeDeliveryTask(
        actor.value,
        value.id,
        value.version,
      ),
    );
  const cancelDeliveryTask = (value: DeliveryTask) =>
    pickingSave(() =>
      session.service.cancelDeliveryTask(actor.value, value.id, value.version),
    );
  const createPickingLabel = (value: PickingLabelDraft) =>
    pickingSave(() => session.service.createPickingLabel(actor.value, value));
  const printPickingLabels = (ids: string[], copies: number) =>
    pickingSave(() =>
      session.service.printPickingLabels(
        actor.value,
        ids,
        copies,
        `ui-label-print-${ids.join("-")}-${pickingPrintRequestSequence++}`,
      ),
    );
  const exportPicking = (
    kind:
      | "pending"
      | "tasks"
      | "waves"
      | "deliveries"
      | "routes"
      | "vehicles"
      | "labels",
    value: PickingListQuery = {},
  ) => session.service.exportPickingCsv(actor.value, kind, value);
  return {
    scenario,
    actor,
    query,
    workspace,
    transfers,
    otherOutbounds,
    otherInbounds,
    stocktakes,
    costAdjustments,
    closings,
    processingRecipes,
    processingPlans,
    processingOrders,
    materialPicks,
    materialReturns,
    processingYields,
    eligibleProcessingOrders,
    processingOrderProviderState,
    processingSkus,
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
    transferPage,
    otherOutboundPage,
    otherInboundPage,
    stocktakePage,
    costAdjustmentPage,
    statisticsPage,
    statisticsOptions,
    loading,
    saving,
    error,
    canWrite,
    isEmpty,
    load,
    setScenario,
    setRole,
    applyQuery,
    saveWarehouse,
    saveLocation,
    saveThreshold,
    importLocations,
    previewLocationImport,
    exportStocks,
    exportLocations,
    loadTransfers,
    loadOtherOutbounds,
    loadOtherInbounds,
    createTransfer,
    createOtherOutbound,
    createOtherInbound,
    approveTransfer,
    shipTransfer,
    receiveTransfer,
    approveOtherOutbound,
    approveOtherInbound,
    deleteTransfer,
    deleteOtherOutbound,
    deleteOtherInbound,
    loadStocktakes,
    createStocktake,
    startStocktake,
    saveStocktakeCounts,
    approveStocktake,
    loadCostAdjustments,
    createCostAdjustment,
    approveCostAdjustment,
    loadClosings,
    closeMonth,
    exportTransfers,
    exportOtherOutbounds,
    exportOtherInbounds,
    exportStocktakes,
    exportCostAdjustments,
    loadStatistics,
    loadProcessingRecipes,
    loadProcessingPlans,
    loadProcessingOrders,
    loadMaterialPicks,
    loadMaterialReturns,
    loadProcessingYields,
    loadEligibleProcessingOrders,
    loadProcessingCatalog,
    saveProcessingRecipe,
    previewProcessingRecipeImport,
    importProcessingRecipes,
    deleteProcessingRecipe,
    createProcessingPlan,
    cancelProcessingPlan,
    createProcessingOrder,
    deleteProcessingOrder,
    createMaterialPick,
    confirmMaterialPick,
    createMaterialReturn,
    confirmMaterialReturn,
    completeProcessingOrder,
    exportProcessingOrders,
    exportProcessingYields,
    loadPickingWorkspace,
    createPickingTask,
    startPickingTask,
    cancelPickingTask,
    submitPickingTask,
    resolvePickingDifference,
    confirmPickingOutbound,
    createPickingWave,
    startPickingWave,
    cancelPickingWave,
    submitPickingWave,
    confirmWaveOutbounds,
    saveDeliveryRoute,
    deleteDeliveryRoute,
    saveDeliveryVehicle,
    createDeliveryTask,
    updateDeliveryTask,
    startDeliveryTask,
    completeDeliveryTask,
    cancelDeliveryTask,
    createPickingLabel,
    printPickingLabels,
    exportPicking,
  };
});
