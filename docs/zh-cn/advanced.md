## 1、自定义fetch
通过自定义fetch替换框架自带的fetch，可以修改fetch配置(添加cookie或header信息等等)，或拦截HTML、JS、CSS等静态资源。

自定义的fetch必须是一个返回string类型的Promise。

```js
import microApp from '@micro-zoe/micro-app'

microApp.start({
  /**
   * 自定义fetch
   * @param {string} url 静态资源地址
   * @param {object} options fetch请求配置项
   * @param {string|null} appName 应用名称
   * @returns Promise<string>
  */
  fetch (url, options, appName) {
    if (url === 'http://localhost:3001/error.js') {
      // 删除 http://localhost:3001/error.js 的内容
      return Promise.resolve('')
    }
    
    const config = {
      // fetch 默认不带cookie，如果需要添加cookie需要配置credentials
      credentials: 'include', // 请求时带上cookie
    }

    return window.fetch(url, Object.assign(options, config)).then((res) => {
      return res.text()
    })
  }
})
```

> [!NOTE]
> 1、如果跨域请求带cookie，那么`Access-Control-Allow-Origin`不能设置为`*`，必须指定域名，同时设置`Access-Control-Allow-Credentials: true`

## 2、微组件

一个正常的 micro-app 子应用可以这样注册：

```js
<micro-app name='my-app' url='http://localhost:3000/'></micro-app>
```

为了实现加载js文件实现微组件的能力，我们url属性将以前仅支持html地址，升级成既支持html地址，也支持js等模块化文件。用法如下：

```js
<micro-app name='xx' url='http://xxx.js'></micro-app>
```

> [!NOTE]
> 1、微组件只是极个别场景下的解决方案（目前识别到的只有扩展点和细粒度重构），其他场景并不建议使用微组件。