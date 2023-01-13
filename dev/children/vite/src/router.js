import Page1 from './pages/page1.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Page1
  },
  {
    path: '/page2',
    name: 'page2',
    component: () => import('./pages/page2.vue')
  },
  {
    path: '/page3',
    name: 'page3',
    component: () => import('./pages/page3.vue')
  }
]

export default routes
