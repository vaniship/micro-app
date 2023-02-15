import { createApp } from 'vue'
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
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
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

const app = createApp(App)
app.use(router)
app.mount('#vite-app')
console.log('微应用vite渲染了 -- 默认模式')

handleMicroData()


/* ----------------------分割线-umd模式--------------------- */
// let app = null
// let router = null
// let history = null
// // 将渲染操作放入 mount 函数
// window.mount = (data) => {
//   history = createWebHistory(import.meta.env.BASE_URL)
//   router = createRouter({
//     history,
//     routes,
//   })

//   app = createApp(App)
//   app.use(router)
//   app.mount('#vite-app')

//   console.log('微应用vite渲染了 -- UMD模式', data);

//   handleMicroData()
// }

// // 将卸载操作放入 unmount 函数
// window.unmount = () => {
//   app && app.unmount()
//   history && history.destroy()
//   app = null
//   router = null
//   history = null
//   console.log('微应用vite卸载了 -- UMD模式');
// }

// // 非微前端环境直接渲染
// if (!window.__MICRO_APP_ENVIRONMENT__) {
//   mount()
// }

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

console.log('vite子应用的全局变量1', window)


/* ---------------------- location 跳转 --------------------- */
// 依次放开每个注释来，尽可能覆盖所有场景
setTimeout(() => {
  // window.microApp.location.href = 'https://www.baidu.com/' // origin不同，直接跳转页面
  // window.microApp.location.href = '/micro-app/vite/page2'
  // window.microApp.location.href = 'http://localhost:7001/micro-app/vite/page2' // path改变，刷新浏览器
  // window.microApp.location.href = 'http://localhost:7001/micro-app/vite/page2#abc' // path不变，hash改变，不刷新浏览器，发送popstate、hashchange事件
  // window.microApp.location.href = 'http://localhost:7001/micro-app/vite/page2/' // hash从有到无，刷新浏览器
  // window.microApp.location.href = 'http://localhost:7001/micro-app/vite'
  // window.microApp.location.href = 'http://localhost:7001/micro-app/vite/' // path相同，刷新浏览器
  // window.microApp.location.href = 'http://localhost:7001/micro-app/vite/?a=1' // search变化，刷新浏览器


  // window.microApp.location.pathname = '/micro-app/vite/page2' // path改变，刷新浏览器
  // window.microApp.location.pathname = '/micro-app/vite/page2#hash1' // 无法直接通过pathname修改hash的值，这里的写法是错误的，而且会导致浏览器刷新，需要完善一下
  // window.microApp.location.pathname = '/micro-app/vite/page2?b=2'

  // window.microApp.location.search = '?c=3' // search改变，刷新浏览器
  // window.microApp.location.search = '?c=3' // search不变，刷新浏览器

  // window.microApp.location.hash = '#a' // hash改变，发送popstate、hashchange事件，不刷新浏览器
  // window.microApp.location.hash = '#a' // hash不变，不发送popstate、hashchange事件


  // window.microApp.location.assign('/micro-app/vite/page2') // path改变，刷新浏览器
  // window.microApp.location.assign('http://localhost:7001/micro-app/vite/page2') // path不改变，刷新浏览器
  // window.microApp.location.assign('http://localhost:7001/micro-app/vite/page2#abc') // path不变，hash改变，不刷新浏览器，发送popstate、hashchange事件

  // window.microApp.location.assign('/micro-app/vite/page2') // 同上
  // window.microApp.location.replace('http://localhost:7001/micro-app/vite/page2') // 同上
  // window.microApp.location.replace('http://localhost:7001/micro-app/vite/page2#abc') // 同上

  // window.microApp.location.reload()

  // window.history.scrollRestoration = 'manual'
}, 5000);
