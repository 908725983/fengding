import { createPinia, setActivePinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";
import OrderListView from "./OrderListView.vue";
import OrderDetailView from "./OrderDetailView.vue";
import OrderFormView from "./OrderFormView.vue";
import OrderShareView from "./OrderShareView.vue";
import OrderOutboundListView from "./OrderOutboundListView.vue";
import OrderDifferenceListView from "./OrderDifferenceListView.vue";
import { useOrderStore } from "../runtime/order-store";

async function setup(component: typeof OrderListView, path = "/orders") {
  const pinia=createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/orders", component: OrderListView },
      { path: "/orders/new", component: OrderFormView },
      { path: "/orders/outbounds", component: OrderOutboundListView },
      { path: "/orders/differences", component: OrderDifferenceListView },
      { path: "/orders/:orderId/edit", component: OrderFormView },
      { path: "/orders/:orderId", component: OrderDetailView },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(component, {
    global: { plugins: [pinia, router] },
  });
  await new Promise((resolve) => setTimeout(resolve, 180));
  await flushPromises();
  return { wrapper, router, store:useOrderStore() };
}
describe("order views", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("renders dense list and canonical status labels", async () => {
    const { wrapper } = await setup(OrderListView);
    expect(wrapper.text()).toContain("客户订单列表");
    expect(wrapper.text()).toContain("共 32 条");
    expect(wrapper.findAll("tbody tr")).toHaveLength(30);
    expect(wrapper.text()).toContain("已审核（待出库）");
    expect(wrapper.text()).toContain("批量审核");
    expect(wrapper.text()).toContain("订单审核通过");
    expect(wrapper.text()).not.toContain("急 / 赠 / 退 / 锁");
  });
  it("renders detail snapshots, deterministic finance and unavailable inventory", async () => {
    const { wrapper } = await setup(OrderDetailView, "/orders/order-001");
    expect(wrapper.text()).toContain("CA000000-260710-60001");
    expect(wrapper.text()).toContain("演示基础商品");
    expect(wrapper.text()).toContain("¥500.00");
    expect(wrapper.text()).toContain("库荐算法尚未接入");
  });
  it("renders create entry and all explicit provider-driven sections", async () => {
    const { wrapper } = await setup(
      OrderFormView as typeof OrderListView,
      "/orders/new",
    );
    expect(wrapper.text()).toContain("新建客户订单");
    expect(wrapper.text()).toContain("请选择启用客户");
    expect(wrapper.text()).toContain("粘贴商品（skuCode,quantity,unitCode）");
    expect(wrapper.text()).toContain("保存并结算出库（F8）");
    expect(
      wrapper.find('button[title*="ORD-004"]').attributes("disabled"),
    ).toBeDefined();
  });
  it("renders ORD-004 fulfillment instead of the former unavailable placeholder", async () => {
    const { wrapper } = await setup(OrderDetailView, "/orders/order-001");
    await wrapper.findAll(".order-tabs button")[1]!.trigger("click");
    expect(wrapper.text()).toContain("待出库与履约动作");
    expect(wrapper.text()).toContain("销售出库记录");
    expect(wrapper.text()).toContain("尚无出库记录");
  });
  it("renders seeded outbound and difference workspaces",async()=>{const outbounds=await setup(OrderOutboundListView as typeof OrderListView,"/orders/outbounds");expect(outbounds.wrapper.text()).toContain("销售出库单");expect(outbounds.wrapper.text()).toContain("XSCK-260810-");outbounds.wrapper.unmount();const differences=await setup(OrderDifferenceListView as typeof OrderListView,"/orders/differences");expect(differences.wrapper.text()).toContain("差异单");expect(differences.wrapper.text()).toContain("CY-260810-")});
  it("opens a governed review dialog and renders special review evidence", async () => {
    const ordinary = await setup(OrderDetailView, "/orders/order-001");
    const approve=ordinary.wrapper.findAll("button").find((item)=>item.text()==="订单审核通过");
    expect(approve).toBeDefined();
    await approve!.trigger("click");
    expect(ordinary.wrapper.text()).toContain("审核备注（选填）");
    ordinary.wrapper.unmount();
    const special=await setup(OrderDetailView,"/orders/order-010");
    expect(special.wrapper.text()).toContain("特价审批依据");
    expect(special.wrapper.text()).toContain("演示特价审批");
    expect(special.wrapper.text()).toContain("审核历史 · 第 1 轮");
  });
  it("renders a public share from the same runtime and keeps private fields out", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useOrderStore();
    const share = await store.createShare("order-001", 7);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/share/orders/:token", component: OrderShareView }],
    });
    await router.push(`/share/orders/${share!.token}`);
    await router.isReady();
    const wrapper = mount(OrderShareView, {
      global: { plugins: [pinia, router] },
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
    await flushPromises();
    expect(wrapper.text()).toContain("CA000000-260710-60001");
    expect(wrapper.text()).toContain("确认已查看");
    expect(wrapper.text()).not.toContain("000-1000-0001");
    expect(wrapper.text()).not.toContain("虚构演示路1号");
  });
});
