export type ModuleStatus = 'ready' | 'planned' | 'blocked'

export interface BusinessModule {
  key: string
  label: string
  shortLabel: string
  icon: string
  description: string
  path: string
  spec: string
  status: ModuleStatus
}

export const businessModules: BusinessModule[] = [
  { key: 'dashboard', label: '首页', shortLabel: '概', icon: '⌂', description: '待办、经营概览、预警与公告', path: '/dashboard', spec: 'docs/product-specs/dashboard.md', status: 'planned' },
  { key: 'orders', label: '订单', shortLabel: '订', icon: '▤', description: '客户订单、退单、差异与销售出库', path: '/orders', spec: 'docs/product-specs/orders.md', status: 'ready' },
  { key: 'products', label: '商品', shortLabel: '商', icon: '◇', description: '商品、SKU、价格、授权与铺货', path: '/products', spec: 'docs/product-specs/products.md', status: 'planned' },
  { key: 'procurement', label: '采购', shortLabel: '采', icon: '⌑', description: '补货、采购、供应商与采购统计', path: '/procurement', spec: 'docs/product-specs/procurement.md', status: 'ready' },
  { key: 'inventory', label: '库存', shortLabel: '库', icon: '▣', description: '仓库、库存、盘点、分拣与配送', path: '/inventory', spec: 'docs/product-specs/inventory.md', status: 'ready' },
  { key: 'customers', label: '客户', shortLabel: '客', icon: '♙', description: '客户、公海、外勤、会员与营销', path: '/customers', spec: 'docs/product-specs/customers.md', status: 'planned' },
  { key: 'finance', label: '资金', shortLabel: '资', icon: '¥', description: '应收应付、核销、收付款与账户', path: '/finance', spec: 'docs/product-specs/finance.md', status: 'ready' },
  { key: 'settings', label: '设置', shortLabel: '设', icon: '⚙', description: '组织、权限、基础资料与日志', path: '/settings', spec: 'docs/product-specs/settings.md', status: 'planned' },
]

export function findBusinessModule(key: string): BusinessModule | undefined {
  return businessModules.find((item) => item.key === key)
}
