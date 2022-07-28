MicroApp为子应用提供了一套虚拟路由系统，子应用将运行在这套虚拟路由系统中，以便和基座应用的路由进行隔离，避免相互影响。

子应用的路由信息会作为query参数同步到浏览器地址上，如下：

![alt](../../media/memory-image-1.png ':size=700')

## 导航


<!-- tabs:start -->
#### ** 基座 **
```js
import microApp from '@micro-zoe/micro-app'

microApp.router.push({name: '应用名称', path: '应用地址'})
```

#### ** 子应用 **
```js

```
<!-- tabs:end -->
