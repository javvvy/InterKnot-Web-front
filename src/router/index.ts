import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/HomePage.vue'),
  },
  {
    path: '/create',
    name: 'create',
    component: () => import('@/pages/CreatePage.vue'),
  },
  {
    path: '/discussion/:id',
    name: 'discussion-detail',
    component: () => import('@/pages/DiscussionDetailPage.vue'),
  },
  {
    path: '/profile/:id',
    name: 'profile',
    component: () => import('@/pages/ProfilePage.vue'),
  },
  {
    path: '/knock',
    name: 'knock',
    component: () => import('@/pages/KnockPage.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
