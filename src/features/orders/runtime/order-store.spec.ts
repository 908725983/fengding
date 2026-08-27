import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useOrderStore } from "./order-store";
describe("order store", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("loads normal and empty states", async () => {
    const store = useOrderStore();
    await store.load();
    expect(store.result.total).toBe(32);
    await store.setScenario("empty");
    expect(store.isEmpty).toBe(true);
  });
  it("keeps provider partial failure local to detail", async () => {
    const store = useOrderStore();
    await store.setScenario("partial-failure");
    expect(store.result.total).toBe(32);
    await store.loadDetail("order-001");
    expect(store.detail?.financials.creditLimitCents.state).toBe("error");
  });
  it("does not expose output to warehouse or finance", async () => {
    const store = useOrderStore();
    await store.setRole("warehouse");
    expect(store.canOutput).toBe(false);
    expect(store.result.items[0]?.order.amounts.orderAmountCents).toBeNull();
  });
  it("runs the create form through providers, preview and save", async () => {
    const store = useOrderStore();
    await store.initializeForm();
    expect(store.formOptions?.customers.map((item) => item.id)).toEqual([
      "customer-1",
    ]);
    expect(store.formOptions?.warehouses.map((item) => item.id)).toEqual([
      "warehouse-main",
    ]);
    expect(store.draft.warehouseId).toBe("warehouse-main");
    await store.selectCustomer("customer-1");
    expect(store.skus.map((item) => item.skuId)).toEqual(["sku-1"]);
    expect(store.draft.warehouseId).toBe("warehouse-main");
    store.draft.deliveryMethod = "logistics";
    store.draft.requestedDeliveryAt = "2026-08-10T18:00:00+08:00";
    store.addSku("sku-1");
    store.draft.lines[0]!.quantity = 21;
    expect(await store.previewForm()).toBe(true);
    expect(store.preview?.occupiedPrepaymentCents).toBe(
      store.preview?.amounts.orderAmountCents,
    );
    const saved = await store.saveForm("store-save-1");
    expect(store.error).toBeNull();
    expect(saved).toMatchObject({
      orderNo: "CA-260810-00001",
      status: "pending-order-review",
    });
    expect(store.detail?.order.id).toBe(saved?.id);
  });
  it("keeps provider failure input and exposes the exact error", async () => {
    const store = useOrderStore();
    await store.setScenario("partial-failure");
    await store.initializeForm();
    expect(store.formOptions).toBeNull();
    expect(store.error).toContain("依赖数据加载失败");
  });
  it("creates and consumes the same public share in one runtime session", async () => {
    const store = useOrderStore();
    const created = await store.createShare("order-001", 7);
    expect(created?.url).toContain("/share/orders/");
    await store.viewShare(created!.token);
    expect(store.sharedOrder?.shareStatus).toBe("viewed");
    await store.confirmShare(created!.token);
    expect(store.sharedOrder?.shareStatus).toBe("confirmed");
  });
  it("surfaces the concurrent edit scenario without overwriting", async () => {
    const store = useOrderStore();
    await store.setScenario("concurrent");
    await store.initializeForm("order-001");
    const saved = await store.saveForm("concurrent-save-1");
    expect(saved).toBeNull();
    expect(store.error).toContain("其他会话修改");
  });
  it("runs single and batch review through the same service state machine", async () => {
    const store = useOrderStore();
    await store.setRole("sales-supervisor");
    await store.loadDetail("order-001");
    expect(store.detail?.reviewActions).toEqual(["approve-order","return-order","cancel-order"]);
    expect(await store.reviewOrder("order-001","approve-order",store.detail!.order.updatedAt)).toBe(true);
    expect(store.detail?.order.status).toBe("pending-finance-review");
    const rows=store.result.items.filter((row)=>["order-009","order-017"].includes(row.order.id));
    expect(await store.reviewOrders(rows.map((row)=>({orderId:row.order.id,expectedUpdatedAt:row.order.updatedAt})))).toBe(true);
    expect(store.result.items.filter((row)=>["order-009","order-017"].includes(row.order.id)).every((row)=>row.order.status==="pending-finance-review")).toBe(true);
  });
  it("refreshes an already loaded fulfillment projection after review",async()=>{const store=useOrderStore();await store.loadDetail('order-001');await store.loadFulfillment('order-001');expect(store.fulfillmentDetail?.order.status).toBe('pending-order-review');await store.setRole('sales-supervisor');await store.loadDetail('order-001');await store.loadFulfillment('order-001');expect(await store.reviewOrder('order-001','approve-order',store.detail!.order.updatedAt)).toBe(true);expect(store.fulfillmentDetail?.order.status).toBe('pending-finance-review')});
  it("surfaces a concurrent review without changing the stale screen", async () => {
    const store = useOrderStore();
    await store.setScenario("concurrent");
    await store.setRole("sales-supervisor");
    await store.loadDetail("order-001");
    expect(await store.reviewOrder("order-001","approve-order",store.detail!.order.updatedAt)).toBe(false);
    expect(store.error).toContain("其他会话修改");
    expect(store.detail?.order.status).toBe("pending-order-review");
  });
  it("runs outbound, shipment and receipt through one recoverable store session",async()=>{const store=useOrderStore();await store.setRole('warehouse');await store.loadFulfillment('order-003');const line=store.fulfillmentDetail!.order.lines[0]!;const input={orderId:'order-003',warehouseId:'warehouse-main',lines:[{orderLineId:line.id,quantity:line.quantityMilli/line.unitSnapshot.conversionRateMilli}],finishShort:false};expect(await store.previewFulfillment(input)).toBe(true);expect(store.outboundPreview?.lines[0]?.allocations.length).toBeGreaterThan(0);expect(await store.confirmFulfillment(input),store.error??'确认出库失败').toBe(true);expect(store.fulfillmentDetail?.order.status).toBe('outbound');expect(await store.shipOrder({orderId:'order-003',logisticsCode:'MOCK-STORE-003'})).toBe(true);expect(store.fulfillmentDetail?.receivable).toBeNull();expect(await store.receiveOrder({orderId:'order-003',signedAt:'2026-08-10T10:00:00+08:00',signer:'演示签收人'})).toBe(true);expect(store.fulfillmentDetail?.order.status).toBe('completed')});
  it("loads six explainable ORD-005 return states and a pending finance refund",async()=>{const store=useOrderStore();await store.loadReturns();expect(store.returnResult.total).toBe(6);expect(new Set(store.returnResult.items.map((item)=>item.value.status))).toEqual(new Set(['pending-review','returned','approved','completed','cancelled']));await store.loadRefunds();expect(store.refunds.some((item)=>item.status==='pending')).toBe(true);expect(store.refunds.some((item)=>item.status==='refunded')).toBe(true)});
});
