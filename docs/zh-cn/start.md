我们分别列出主应用和子应用需要进行的修改，具体介绍`micro-app`的使用方式。

### 主应用

**1、安装依赖**
```bash
npm i @micro-zoe/micro-app --save
```

**2、初始化`micro-app`**
```js
// index.js
import microApp from '@micro-zoe/micro-app'

microApp.start()
```

**3、嵌入子应用**

micro-app会注册一个自定义元素`<micro-app>`用于加载子应用，它可以像iframe元素一样使用

<!-- tabs:start -->
#### ** React **
```js
export function MyPage () {
  return (
    <div>
      // name：应用名称, url：应用地址
      <micro-app name='my-app' url='http://localhost:3000/'></micro-app>
    </div>
  )
}
```

#### ** Vue **
```html
<template>
  <div>
    <!-- name：应用名称, url：应用地址 -->
    <micro-app name='my-app' url='http://localhost:3000/'></micro-app>
  </div>
</template>
```
<!-- tabs:end -->

### 子应用

1、在webpack-dev-server的headers中设置跨域支持。
```js
devServer: {
  headers: {
    'Access-Control-Allow-Origin': '*',
  }
},
```

完成以上步骤即完成微前端的接入。


> [!NOTE]
> 1、name：必传参数，必须以字母开头，且不可以带特殊符号(中划线、下划线除外)
>
> 2、url：必传参数，必须指向子应用的index.html，如：http://localhost:3000/ 或 http://localhost:3000/index.html
>
> 3、子应用必须支持跨域，跨域配置参考[这里](/zh-cn/questions?id=_2、子应用静态资源一定要支持跨域吗？)
