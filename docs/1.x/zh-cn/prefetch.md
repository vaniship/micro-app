预加载是指在应用尚未渲染时提前加载`html、js、css`等资源并解析，从而提升子应用的渲染速度。

预加载会在浏览器空闲时间，依次加载和解析每个子应用的静态资源，以确保不会影响主应用的性能。

### microApp.preFetch(Array\<app\> | () => Array\<app\>)
preFetch接受一个数组或一个返回数组的函数，数组的配置如下：

```js
Array<{
  name: string, // 应用名称，必传
  url: string, // 应用地址，必传
  esmodule: boolean, // 是否支持esmodule，vite应用必传，其它应用可选
  inline: boolean, // 是否使用内联模式运行js，可选
  'disable-scopecss': boolean // 是否关闭样式隔离，可选
  'disable-sandbox': boolean // 是否关闭沙盒，可选
}>
```

### 使用方式
```js
import microApp from '@micro-zoe/micro-app'

// 方式一：设置数组
microApp.preFetch([
  { name: 'my-app1', url: 'xxx' },
  { name: 'my-app2', url: 'xxx' },
])

// 方式二：设置一个返回数组的函数
microApp.preFetch(() => [
  { name: 'my-app1', url: 'xxx' },
  { name: 'my-app2', url: 'xxx' },
])

// 方式三：在start中设置预加载数组
microApp.start({
  preFetchApps: [
    { name: 'my-app1', url: 'xxx' },
    { name: 'my-app2', url: 'xxx' },
  ],
})

// 方式四：在start中设置一个返回预加载数组的函数
microApp.start({
  preFetchApps: () => [
    { name: 'my-app1', url: 'xxx' }
    { name: 'my-app2', url: 'xxx' }
  ],
})
```

### vite应用
当子应用是vite时，除了name和url外，还要设置第三个参数`esmodule`为true。

例如：
```js
// 预加载vite子应用
microApp.preFetch([
  { name: 'my-vite-app', url: 'xxx', esmodule: true },
])
```

### 补充说明1
正常情况下，预加载只需要设置name和url，其它参数不需要设置。

但我们还是建议预加载的配置和`<micro-app>`元素上的配置保持一致，虽然这不是必须的。

例如：`<micro-app>`元素设置了`disable-scopecss`，那么预加载也最好保持一致

```html
<micro-app name='my-app' url='xxx' disable-scopecss></micro-app>
```
```js
microApp.preFetch([
  { name: 'my-app', url: 'xxx', 'disable-scopecss': true },
])
```

### 补充说明2

预加载参数`inline、esmodule、disable-scopecss、disable-sandbox`都是可选的，它们只表示在预加载时该如何处理资源，不会对应用的实际渲染产生任何影响，应用的渲染行为最终由`<micro-app>`元素决定。

