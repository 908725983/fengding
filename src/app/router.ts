import { createRouter, createWebHistory } from 'vue-router'
import HarnessOverviewView from '@/features/dashboard/views/HarnessOverviewView.vue'
import ModulePlaceholderView from '@/shared/views/ModulePlaceholderView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', name: 'dashboard', component: HarnessOverviewView },
    { path: '/:module(orders|products|procurement|inventory|customers|finance|settings)', name: 'module', component: ModulePlaceholderView },
  ],
})
