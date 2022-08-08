从0.x版本迁移到1.0是相对顺滑的，如果在迁移中发现问题，请及时反馈。

### 迁移步骤
**1、安装最新版本**
```bash
npm i @micro-zoe/micro-app@alpha --save
```

**2、在start中增加配置**
```js
// index.js
import microApp from '@micro-zoe/micro-app'

microApp.start({
  'disable-memory-router': true, // 关闭虚拟路由
  'disable-patch-request': true, // 关闭子应用请求的自动补全功能
})
```
