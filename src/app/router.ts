import { createRouter, createWebHistory } from 'vue-router'
import HarnessOverviewView from '@/features/dashboard/views/HarnessOverviewView.vue'
import ModulePlaceholderView from '@/shared/views/ModulePlaceholderView.vue'
import CustomerListView from '@/features/customers/views/CustomerListView.vue'
import CustomerDetailView from '@/features/customers/views/CustomerDetailView.vue'
import CustomerFormView from '@/features/customers/views/CustomerFormView.vue'
import CustomerCategoryView from '@/features/customers/views/CustomerCategoryView.vue'
import CustomerTagView from '@/features/customers/views/CustomerTagView.vue'
import CustomerSmartTagView from '@/features/customers/views/CustomerSmartTagView.vue'
import { guardCustomerSubroute } from '@/features/customers/runtime/customer-access'
import ProductListView from '@/features/products/views/ProductListView.vue'
import { guardProductSubroute } from '@/features/products/runtime/product-access'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', name: 'dashboard', component: HarnessOverviewView },
    { path: '/customers', name: 'customer-list', component: CustomerListView },
    { path: '/customers/new', name: 'customer-new', component: CustomerFormView },
    { path: '/customers/categories', name: 'customer-categories', component: CustomerCategoryView },
    { path: '/customers/tags', name: 'customer-tags', component: CustomerTagView },
    { path: '/customers/smart-tags', name: 'customer-smart-tags', component: CustomerSmartTagView },
    { path: '/customers/:customerId/edit', name: 'customer-edit', component: CustomerFormView },
    { path: '/customers/:customerId', name: 'customer-detail', component: CustomerDetailView },
    { path: '/products', name: 'product-list', component: ProductListView },
    { path: '/:module(orders|products|procurement|inventory|customers|finance|settings)', name: 'module', component: ModulePlaceholderView },
  ],
})

router.beforeEach((to) => {
  const customerResult = guardCustomerSubroute(to.path)
  if (customerResult !== true) return customerResult
  return guardProductSubroute(to.path)
})
