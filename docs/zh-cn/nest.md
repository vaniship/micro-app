`micro-app`支持多层嵌套，即子应用可以嵌入其它子应用，但为了防止标签名冲突，中间层应用需要自定义`tagName`。

例如：A嵌套B，B嵌套C，则需要在B中做出如下修改：

```js
import microApp from '@micro-zoe/micro-app';

microApp.start({
  // 必须以`micro-app-`开头的小写字母，例如：micro-app-b、micro-app-child-b
  tagName: 'micro-app-xxx', 
})
```

在B中使用新定义的标签加载C：
```html
<micro-app-xxx name='...' url='...'></micro-app-xxx>
```

> [!WARNING]
> 无论嵌套多少层，name都要保证全局唯一。
