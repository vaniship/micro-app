## componentMode
- Desc: `开启componentMode`
- Type: `string(boolean)`
- Default: `false`
- 使用方式: 
```html 
<micro-app name='xx' url='xx' componentMode></micro-app>
或 <micro-app name='xx' url='xx' componentMode = 'true'></micro-app>
```

componentMode给micro-app增加加载umd.js等模块化的能力实现微组件，开启后，则加载该js资源，并进行渲染。

componentMode微组件只是极个别场景下的解决方案（目前识别到的只有扩展点和细粒度重构），其他场景并不建议使用微组件。