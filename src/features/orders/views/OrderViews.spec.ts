import { createPinia, setActivePinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";
import OrderListView from "./OrderListView.vue";
import OrderDetailView from "./OrderDetailView.vue";
import OrderFormView from "./OrderFormView.vue";
import OrderShareView from "./OrderShareView.vue";
import { useOrderStore } from "../runtime/order-store";

async function setup(component: typeof OrderListView, path = "/orders") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/orders", component: OrderListView },
      { path: "/orders/new", component: OrderFormView },
      { path: "/orders/:orderId/edit", component: OrderFormView },
      { path: "/orders/:orderId", component: OrderDetailView },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(component, {
    global: { plugins: [createPinia(), router] },
  });
  await new Promise((resolve) => setTimeout(resolve, 180));
  await flushPromises();
  return { wrapper, router };
}
describe("order views", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("renders dense list and canonical status labels", async () => {
    const { wrapper } = await setup(OrderListView);
    expect(wrapper.text()).toContain("客户订单列表");
    expect(wrapper.text()).toContain("共 32 条");
    expect(wrapper.findAll("tbody tr")).toHaveLength(30);
    expect(wrapper.text()).toContain("已审核（待出库）");
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
      wrapper.find('button[title*="ORD-003"]').attributes("disabled"),
    ).toBeDefined();
  });
  it("shows future tabs as explicit unavailable states", async () => {
    const { wrapper } = await setup(OrderDetailView, "/orders/order-001");
    await wrapper.findAll(".order-tabs button")[1]!.trigger("click");
    expect(wrapper.text()).toContain("出库发货记录由 ORD-004 提供");
    expect(wrapper.text()).toContain("不以空表或 0 冒充");
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
