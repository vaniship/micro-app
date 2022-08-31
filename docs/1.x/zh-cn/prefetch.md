预加载是指在子应用尚未渲染时提前加载静态资源，从而提升子应用的首次渲染速度。

为了不影响主应用的性能，预加载会在浏览器空闲时间执行。

### 定义

**microApp.preFetch(Array\<options\> | () => Array\<options\>)**

preFetch接受一个数组或一个返回数组的函数，数组传入的配置如下：

```js
options: {
  name: string, // 应用名称，必传
  url: string, // 应用地址，必传
  esmodule: boolean, // 是否支持esmodule，vite应用必传，其它应用可选
  inline: boolean, // 是否使用内联模式运行js，可选
  'disable-scopecss': boolean, // 是否关闭样式隔离，可选
  'disable-sandbox': boolean, // 是否关闭沙盒，可选
  level: number, // 预加载等级，可选（分为三个等级：1、2、3，1表示只加载资源，2表示加载并解析，3表示加载解析并渲染，默认为2）
  'default-page': string, // 指定默认渲染的页面，level为3时才会生效，可选
  'disable-patch-request': boolean // 关闭子应用请求的自动补全功能，level为3时才会生效，可选
}
```

### 解释
预加载JS资源分为三个步骤，对应上述参数 - `level`：
- 1、加载静态资源(字符串）
- 2、将字符串解析成可执行代码 
- 3、执行代码并在后台渲染

level分为`1、2、3`三个层级，默认值为2，表示加载静态资源并解析。

level值越高，则预加载的程度越深，子应用首次渲染速度越快，但占用的内存也更高，反之亦然，用户可以根据项目实际情况进行选择。

我们可以在start方法中修改level的默认值：
```js
import microApp from '@micro-zoe/micro-app'

microApp.start({
  prefetchLevel: 1, // 修改level默认值为1
})
```


### 使用方式
```js
import microApp from '@micro-zoe/micro-app'

// 方式一：设置数组
microApp.preFetch([
  { name: 'my-app1', url: 'xxx' }, // 加载资源并解析
  { name: 'my-app2', url: 'xxx', level: 1 }, // 只加载资源
  { name: 'my-app3', url: 'xxx', level: 3 }, // 加载资源、解析并渲染
  { name: 'my-app4', url: 'xxx', level: 3, 'default-page': '/page2' }, // 加载资源、解析并渲染子应用的page2页面
])

// 方式二：设置一个返回数组的函数
microApp.preFetch(() => [
  { name: 'my-app1', url: 'xxx' }, // 加载资源并解析
  { name: 'my-app2', url: 'xxx', level: 1 }, // 只加载资源
  { name: 'my-app3', url: 'xxx', level: 3 }, // 加载资源、解析并渲染
  { name: 'my-app4', url: 'xxx', level: 3, 'default-page': '/page2' }, // 加载资源、解析并渲染子应用的page2页面
])

// 方式三：在start中设置预加载数组
microApp.start({
  preFetchApps: [
    { name: 'my-app1', url: 'xxx' }, // 加载资源并解析
    { name: 'my-app2', url: 'xxx', level: 1 }, // 只加载资源
    { name: 'my-app3', url: 'xxx', level: 3 }, // 加载资源、解析并渲染
    { name: 'my-app4', url: 'xxx', level: 3, 'default-page': '/page2' }, // 加载资源、解析并渲染子应用的page2页面
  ],
})

// 方式四：在start中设置一个返回预加载数组的函数
microApp.start({
  preFetchApps: () => [
    { name: 'my-app1', url: 'xxx' }, // 加载资源并解析
    { name: 'my-app2', url: 'xxx', level: 1 }, // 只加载资源
    { name: 'my-app3', url: 'xxx', level: 3 }, // 加载资源、解析并渲染
    { name: 'my-app4', url: 'xxx', level: 3, 'default-page': '/page2' }, // 加载资源、解析并渲染子应用的page2页面
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

### 补充说明
正常情况下，预加载只需要设置name和url，其它参数不需要设置。

但我们还是建议预加载的配置和`<micro-app>`元素上的配置保持一致，虽然这不是必须的。

例如：`<micro-app>`元素设置了`disable-scopecss`关闭样式隔离，那么预加载也最好保持一致

```html
<micro-app name='my-app' url='xxx' disable-scopecss></micro-app>
```
```js
microApp.preFetch([
  { name: 'my-app', url: 'xxx', 'disable-scopecss': true },
])
```

