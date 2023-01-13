import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import routes from './router'

function handleMicroData () {
  console.log('child-vite getData:', window.microApp?.getData())

  // 监听基座下发的数据变化
  window.microApp?.addDataListener((data) => {
    console.log('child-vite addDataListener:', data)
  })

  // 向基座发送数据
  setTimeout(() => {
    window.microApp?.dispatch({ myname: 'child-vite' })
  }, 3000)
}

/* ----------------------分割线-默认模式--------------------- */
// const router = createRouter({
//   history: createWebHashHistory(),
//   routes,
// })

// const app = createApp(App)
// app.use(router)
// app.mount('#vite-app')
// console.log('微应用vite渲染了 -- 默认模式')

// handleMicroData()


/* ----------------------分割线-umd模式--------------------- */
let app = null
let router = null
let history = null
// 将渲染操作放入 mount 函数
window.mount = (data) => {
  history = createWebHashHistory()
  router = createRouter({
    history,
    routes,
  })

  app = createApp(App)
  app.use(router)
  app.mount('#vite-app')

  console.log('微应用vite渲染了 -- UMD模式', data);

  handleMicroData()
}

// 将卸载操作放入 unmount 函数
window.unmount = () => {
  app && app.unmount()
  history && history.destroy()
  app = null
  router = null
  history = null
  console.log('微应用vite卸载了 -- UMD模式');
}

// 非微前端环境直接渲染
if (!window.__MICRO_APP_ENVIRONMENT__) {
  mount()
}

/* ---------------------- micro-app 自定义全局事件 --------------------- */

window.onmount = (data) => {
  // throw new Error('sfsdfsf')
  console.log('子应用 window.onmount 事件', data)
}

window.onunmount = () => {
  // throw new Error('sfsdfsf')
  console.log('子应用 window.onunmount 事件')
}

/* ---------------------- 全局事件 --------------------- */
// document.addEventListener('click', function () {
//   console.log(`子应用${window.__MICRO_APP_NAME__}内部的document.addEventListener(click)绑定`)
// }, false)

// document.onclick = () => {
//   console.log(`子应用${window.__MICRO_APP_NAME__}内部的document.onclick绑定`)
// }

// window.addEventListener('scroll', () => {
//   console.log(`scroll event from ${window.__MICRO_APP_NAME__}`)
// }, false)

// setInterval(() => {
//   console.log(`子应用${window.__MICRO_APP_NAME__}的setInterval`)
// }, 5000)

// setTimeout(() => {
//   location.hash = '#/page2'
// }, 3000);
