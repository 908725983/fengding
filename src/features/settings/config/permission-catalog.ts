import type { PermissionId, SettingsPermission, SettingsRole } from '../types'

export const permissionCatalog: SettingsPermission[] = [
  { id: 'settings.roles.view', label: '查看角色', module: 'settings', action: 'roles.view' },
  { id: 'settings.roles.manage', label: '管理角色', module: 'settings', action: 'roles.manage' },
  { id: 'settings.employees.view', label: '查看员工', module: 'settings', action: 'employees.view' },
  { id: 'settings.employees.manage', label: '管理员工', module: 'settings', action: 'employees.manage' },
  { id: 'settings.logs.view', label: '查看日志', module: 'settings', action: 'logs.view' },
  { id: 'settings.logs.export', label: '导出日志', module: 'settings', action: 'logs.export' },
  { id: 'finance.view', label: '查看资金', module: 'finance', action: 'view' },
  { id: 'inventory.view', label: '查看库存', module: 'inventory', action: 'view' },
  { id: 'orders.view', label: '查看订单', module: 'orders', action: 'view' },
  { id: 'customers.view', label: '查看客户', module: 'customers', action: 'view' },
  { id: 'products.view', label: '查看商品', module: 'products', action: 'view' },
]

export const defaultRolePermissionIds: Record<SettingsRole, PermissionId[]> = {
  'super-admin': permissionCatalog.map((item) => item.id),
  finance: ['finance.view', 'settings.logs.view'],
  warehouse: ['inventory.view', 'settings.logs.view'],
  'sales-supervisor': ['orders.view', 'customers.view', 'products.view', 'inventory.view', 'settings.logs.view'],
  salesperson: ['orders.view', 'customers.view', 'products.view'],
}

export function getPermissionCatalog(): SettingsPermission[] { return structuredClone(permissionCatalog) }
