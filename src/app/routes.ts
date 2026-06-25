import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'server-selection', component: () => import('../renderer/views/Connect2Server.vue'), 
      meta: {
        hideTransfers: true,
      }
    },
    { path: '/home', name: 'dashboard', component: () => import('../renderer/views/DashboardView.vue') },
    { path: '/upload-file', name: 'upload-file', component: () => import('../renderer/views/LocalUploadPanel.vue')},
    { path: '/create-link', name: 'create-link', component: () => import('../renderer/views/CreateLinkView.vue') },
  ],
})
