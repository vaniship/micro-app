import Home from './pages/home.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/element-plus',
    name: 'element-plus',
    component: () => import('./pages/element-plus.vue')
  },
  {
    path: '/antd-vue',
    name: 'antd-vue',
    component: () => import('./pages/antd-vue.vue')
  }
]

export default routes
