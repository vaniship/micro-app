import Home from './pages/home.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: Home,
  },
  {
    path: '/element-plus',
    name: 'element-plus',
    component: () => import(/* webpackChunkName: "element-plus" */ './pages/element-plus.vue'),
  },
  {
    path: '/antd-vue',
    name: 'antd-vue',
    component: () => import(/* webpackChunkName: "antd-vue" */ './pages/antd-vue.vue'),
  },
]

export default routes
