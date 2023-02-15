import type {
  microAppWindowType,
  MicroLocation,
  SandBoxStartParams,
  CommonIframeEffect,
  SandBoxStopParams,
  plugins,
} from '@micro-app/types'
import {
  getEffectivePath,
  removeDomScope,
  pureCreateElement,
  assign,
  clearDOM,
  isPlainObject,
  isArray,
} from '../../libs/utils'
import {
  EventCenterForMicroApp,
  rebuildDataCenterSnapshot,
  recordDataCenterSnapshot,
} from '../../interact'
import globalEnv from '../../libs/global_env'
import {
  patchIframeRoute,
} from './route'
import {
  router,
  initRouteStateWithURL,
  clearRouteStateFromURL,
  addHistoryListener,
  removeStateAndPathFromBrowser,
  updateBrowserURLWithLocation,
} from '../router'
import {
  createMicroLocation,
} from '../router/location'
import bindFunctionToRawTarget from '../bind_function'
import {
  globalPropertyList,
} from './special_key'
import {
  patchElementPrototypeMethods,
  releasePatches,
} from '../../source/patch'
import {
  patchIframeWindow,
} from './window'
import {
  patchIframeDocument,
} from './document'
import {
  patchIframeElement,
} from './element'
import microApp from '../../micro_app'

export default class IframeSandbox {
  static activeCount = 0 // number of active sandbox
  public sandboxReady!: Promise<void>
  public microAppWindow: microAppWindowType
  public proxyLocation!: MicroLocation
  public proxyWindow: WindowProxy & microAppWindowType
  public baseElement!: HTMLBaseElement
  public microHead!: HTMLHeadElement
  public microBody!: HTMLBodyElement
  private active = false
  private windowEffect!: CommonIframeEffect
  private documentEffect!: CommonIframeEffect
  private removeHistoryListener!: CallableFunction
  // Properties that can be escape to rawWindow
  private escapeProperties: PropertyKey[] = []

  constructor (appName: string, url: string) {
    const rawLocation = globalEnv.rawWindow.location
    const browserHost = rawLocation.protocol + '//' + rawLocation.host

    const childStaticLocation = new URL(url) as MicroLocation
    const childHost = childStaticLocation.protocol + '//' + childStaticLocation.host
    const childFullPath = childStaticLocation.pathname + childStaticLocation.search + childStaticLocation.hash

    const iframe = pureCreateElement('iframe')
    const iframeAttrs: Record<string, string> = {
      src: browserHost,
      style: 'display: none',
      name: appName,
    }
    Object.keys(iframeAttrs).forEach((key) => iframe.setAttribute(key, iframeAttrs[key]))

    globalEnv.rawDocument.body.appendChild(iframe)

    this.microAppWindow = iframe.contentWindow

    // TODO: 优化代码
    // exec before initStaticGlobalKeys
    this.createProxyLocation(
      appName,
      url,
      this.microAppWindow,
      childStaticLocation,
      browserHost,
      childHost,
    )

    this.createProxyWindow(
      appName,
      this.microAppWindow,
    )

    this.initStaticGlobalKeys(appName, url)
    // get escapeProperties from plugins
    this.getSpecialProperties(appName)

    this.patchIframe(this.microAppWindow, (resolve: CallableFunction) => {
      this.createIframeTemplate(this.microAppWindow)
      patchIframeRoute(appName, this.microAppWindow, childFullPath)
      this.windowEffect = patchIframeWindow(appName, this.microAppWindow)
      this.documentEffect = patchIframeDocument(appName, this.microAppWindow, this.proxyLocation)
      patchIframeElement(appName, url, this.microAppWindow, this)
      resolve()
    })
  }

  public start ({
    umdMode,
    baseroute,
    useMemoryRouter,
    defaultPage,
    disablePatchRequest,
  }: SandBoxStartParams) {
    if (!this.active) {
      this.active = true
      /**
       * TODO: 虚拟路由升级
       * 灵感：iframe模式下关闭虚拟路由如何运行
       * 问题：search，尤其是编码后的search不够美观也不易阅读
       * 思路：
       *  1、虚拟路由可以通过参数控制子应用，必然也可以通过pathname控制
       *    问题：需要基座配置泛路由(这个好解决)
       *    目标：虚拟路由拆分成search(query?)和history路由两种模式
       *  2、如何通过pathname更新子应用的信息(初始化、刷新、跳转)
       *    解决思路：通过插入特定pathname做分割线，比如基座为/path，微前端插入后的地址为/path/micro_app/子应用path
       *    分隔部固定存在
       *    问题：
       *        1、如何确保分隔部的美观和唯一？特殊字符？文档说明？可以自定义配置？
       *        2、如果分隔部重复，如何确定另外一个分隔部的path是属于基座还是子应用？
       *        3、基座是hash路由，子应用是history，如何处理？
       *           解决思路：添加在基座的hash后 #/基座path/micro_app/子应用path
       *        4、基座和子应用都是hash，如何处理？
       *           解决思路：添加在基座的hash后 #/基座path/micro_app/#/子应用path，这样会不会有问题？
       *           方案2：替换子应用的hash，比如：#/基座path/micro_app/hash/子应用path
       *                问题：如果是这样的如何替换？#abc
       *        5、基座是history，子应用是hash，如何处理？
       *           解决思路：这个简单，直接放在基座后，/基座path/micro_app/#/子应用path
       *        6、子应用带hash，但不是是hash路由，如何处理？
       *        7、同时存在多个hash子应用，如何处理？
       *  3、基座路由带search、hash时如何处理
       *    解决思路：保留
       *  4、iframe如何关闭虚拟路由
       *    解决思路：
       *      1、proxyLocation为iframeLocation
       *      2、createProxyWindow 和 patchIframeRoute
       *    结果：所有的路由跳转都在iframe内部执行
       *    问题：
       *      1、刷新后重定向到子应用首页
       *      2、iframe路由堆栈在刷新后失效，点击返回数次才能真正返回
       *    结论：总体来说符合预期，问题可以接受，但还是建议用户不关闭
       *  5、是否需要支持用户设置base，来简化路由长度
       *    比如：
       *      history模式 /main/micro_app/childBase/page，简化为 /main/micro_app/page
       *      query模式 /main/?name=%2FchildBase%2Fpage，简化为 /main/?name=%2Fpage
       *    问题：
       *      1、如何与baseroute区分，会不会导致用户的混乱
       *  6、多应用同时渲染如何处理？
       *    用 micro-app-appName 作为分隔符，这样上面的问题也解决了，分隔符就用：micro-app-appName
       *    比如：基座地址/micro-app-nameA/子应用A地址/micro-app-nameB/子应用B地址
       *  7、子应用的search和hash如何处理？
       *    search统一放在URL的最后面
       *    比如：基座地址/micro-app-nameA/子应用A地址/micro-app-nameB/子应用B地址?nameA=xxx&nameB=xxx
       *
       *    hash如何处理？如何区分是hash路由还是锚点？
       *    解决思路：将#替换为_hash_，前后加上下划线，因为单纯的hash很容易冲突，这样也好解决 #/xx 和 #xx 两种不同情况的处理
       *    比如：基座地址/micro-app-nameA/子应用A基础路由/_hash_/page1/micro-app-nameB/子应用B基础路由/_hash_page1?nameA=xxx&nameB=xxx
       *
       *  8、micro-app-xxx 和 _hash_ 最好统一使用中划线或下划线
       *
       *  9、这样格式化后的子应用地址还是不方便开发者一眼就能看出来，但相对于search要好，至少没有编码，整体也更美观一些
       *
       *  10、基座是hash路由或者带有锚点
       *    问题1：子应用的路由信息全部都拼接在hash后面吗？
       *    解决思路：是的
       *    问题2：基座带有锚点，子应用的参数添加在hash的后面还是基座的search上？
       *    解决思路：添加在锚点后面，无论是hash路由还是锚点，子应用search统一放在hash后面，即便基座有search，虽然这样看起来有点奇怪，因为我们无法确定它是hash路由还是锚点
       *    例如：基座pathname?a=xxx#abc/micro-app-nameA/子应用A地址?b=xxx
       *
       *
       * 补充：
       *  1、虚拟路有强制开启，支持模式的切换，但还需要支持关闭吗
       *    问题：对于旧版本如何兼容？
       *    对于with和iframe沙箱还是支持关闭的。iframe的关闭相当于直接使用iframe内部的路由，这样肯定会有很多问题。
       *
       * 总结：
       *  1、用-appName-做分隔符
       *  2、#用-hash-替换
       *  3、search统一放在最后面，用-appName-...-end-做分隔符
       *  4、history模式、search模式
       *
       * 例1: 基座地址/-nameA-/子应用A基础路由/-hash-/page1/-nameB-/子应用B基础路由/page1-hash-maoDian?-nameA-a=1&b=2-end-&-nameB-c=3&d=4-end-
       * 例2:
       * http://localhost:3000/micro-app/demo/vite/-vite-/micro-app/vite/-hash-/page2?-vite-a=1&b=2-end-
       * http://localhost:3000/micro-app/demo/vite/-vite-/micro-app/vite/-hash-/page2?vite=a%3D1%26b%3D2
       */
      if (useMemoryRouter) {
        this.initRouteState(defaultPage)
        // unique listener of popstate event for sub app
        this.removeHistoryListener = addHistoryListener(
          this.microAppWindow.__MICRO_APP_NAME__,
        )
      } else {
        this.microAppWindow.__MICRO_APP_BASE_ROUTE__ = this.microAppWindow.__MICRO_APP_BASE_URL__ = baseroute
      }
      // TODO: 两种沙箱同时存在 activeCount 计数有问题，改为统一记录
      if (++IframeSandbox.activeCount === 1) {
        patchElementPrototypeMethods()
      }
    }
  }

  public stop ({
    umdMode,
    keepRouteState,
    clearEventSource,
    clearData,
  }: SandBoxStopParams) {
    if (this.active) {
      // clear global event, timeout, data listener
      this.releaseGlobalEffect(clearData)

      if (this.removeHistoryListener) {
        this.clearRouteState(keepRouteState)
        // release listener of popstate
        this.removeHistoryListener()
      }

      if (!umdMode) {
        // this.injectedKeys.forEach((key: PropertyKey) => {
        //   Reflect.deleteProperty(this.microAppWindow, key)
        // })
        // this.injectedKeys.clear()

        // this.escapeKeys.forEach((key: PropertyKey) => {
        //   Reflect.deleteProperty(globalEnv.rawWindow, key)
        // })
        // this.escapeKeys.clear()
      }

      if (--IframeSandbox.activeCount === 0) {
        releasePatches()
      }

      this.active = false
    }
  }

  /**
   * clear global event, timeout, data listener
   * Scenes:
   * 1. unmount of normal/umd app
   * 2. hidden keep-alive app
   * 3. after init prerender app
   * @param clearData clear data from base app
   */
  public releaseGlobalEffect (clearData = false): void {
    this.windowEffect.release()
    this.documentEffect.release()
    this.microAppWindow.microApp.clearDataListener()
    this.microAppWindow.microApp.clearGlobalDataListener()
    if (clearData) {
      microApp.clearData(this.microAppWindow.__MICRO_APP_NAME__)
      this.microAppWindow.microApp.clearData()
    }
  }

  /**
   * record umd snapshot before the first execution of umdHookMount
   * Scenes:
   * 1. exec umdMountHook in umd mode
   * 2. hidden keep-alive app
   * 3. after init prerender app
   */
  public recordEffectSnapshot (): void {
    this.windowEffect.record()
    this.documentEffect.record()
    recordDataCenterSnapshot(this.microAppWindow.microApp)
  }

  // rebuild umd snapshot before remount umd app
  public rebuildEffectSnapshot (): void {
    this.windowEffect.rebuild()
    this.documentEffect.rebuild()
    rebuildDataCenterSnapshot(this.microAppWindow.microApp)
  }

  // set __MICRO_APP_PRE_RENDER__ state
  public setPreRenderState (state: boolean): void {
    this.microAppWindow.__MICRO_APP_PRE_RENDER__ = state
  }

  private initStaticGlobalKeys (appName: string, url: string): void {
    this.microAppWindow.__MICRO_APP_ENVIRONMENT__ = true
    this.microAppWindow.__MICRO_APP_NAME__ = appName
    this.microAppWindow.__MICRO_APP_URL__ = url
    this.microAppWindow.__MICRO_APP_PUBLIC_PATH__ = getEffectivePath(url)
    this.microAppWindow.__MICRO_APP_WINDOW__ = this.microAppWindow
    this.microAppWindow.__MICRO_APP_PRE_RENDER__ = false
    this.microAppWindow.__MICRO_APP_SANDBOX__ = this
    this.microAppWindow.rawWindow = globalEnv.rawWindow
    this.microAppWindow.rawDocument = globalEnv.rawDocument
    this.microAppWindow.microApp = assign(new EventCenterForMicroApp(appName), {
      removeDomScope,
      pureCreateElement,
      location: this.proxyLocation,
      router,
    })
  }

  // TODO: RESTRUCTURE
  private patchIframe (microAppWindow: microAppWindowType, cb: CallableFunction): void {
    this.sandboxReady = new Promise<void>((resolve) => {
      (function iframeLocationReady () {
        setTimeout(() => {
          if (microAppWindow.location.href === 'about:blank') {
            iframeLocationReady()
          } else {
            microAppWindow.stop()
            cb(resolve)
          }
        }, 0)
      })()
    })
  }

  // TODO: RESTRUCTURE
  private createIframeTemplate (microAppWindow: microAppWindowType): void {
    const microDocument = microAppWindow.document
    clearDOM(microDocument)
    const html = microDocument.createElement('html')
    html.innerHTML = '<head></head><body></body>'
    microDocument.appendChild(html)

    this.createIframeBase(microAppWindow)

    // 记录iframe原生body
    this.microBody = microDocument.body
    this.microHead = microDocument.head
  }

  private createIframeBase (microAppWindow: microAppWindowType): void {
    const microDocument = microAppWindow.document
    this.baseElement = microDocument.createElement('base')
    this.updateIframeBase()
    microDocument.head.appendChild(this.baseElement)
  }

  // 初始化和每次跳转时都要更新base的href
  public updateIframeBase = () => {
    this.baseElement.setAttribute('href', this.proxyLocation.protocol + '//' + this.proxyLocation.host + this.proxyLocation.pathname)
  }

  private createProxyLocation (
    appName: string,
    url: string,
    microAppWindow: microAppWindowType,
    childStaticLocation: MicroLocation,
    browserHost: string,
    childHost: string,
  ): void {
    this.proxyLocation = createMicroLocation(
      appName,
      url,
      microAppWindow,
      childStaticLocation,
      browserHost,
      childHost,
    )
  }

  private createProxyWindow (appName: string, microAppWindow: microAppWindowType): void {
    this.proxyWindow = new Proxy(microAppWindow, {
      get: (target: microAppWindowType, key: PropertyKey): unknown => {
        if (key === 'location') {
          return this.proxyLocation
        }

        if (globalPropertyList.includes(key.toString())) {
          return this.proxyWindow
        }

        return bindFunctionToRawTarget(Reflect.get(target, key), target)
      },
      set: (target: microAppWindowType, key: PropertyKey, value: unknown): boolean => {
        /**
         * TODO:
         * 1、location域名相同，子应用内部跳转时的处理
         * 2、和with沙箱的变量相同，提取成公共数组
         */
        if (key === 'location') {
          return Reflect.set(globalEnv.rawWindow, key, value)
        }
        Reflect.set(target, key, value)
        return true
      },
      has: (target: microAppWindowType, key: PropertyKey) => key in target,
    })
  }

  /**
   * get escapeProperties from plugins & adapter
   * @param appName app name
   */
  private getSpecialProperties (appName: string): void {
    if (isPlainObject(microApp.options.plugins)) {
      this.commonActionForSpecialProperties(microApp.options.plugins.global)
      this.commonActionForSpecialProperties(microApp.options.plugins.modules?.[appName])
    }
  }

  // common action for global plugins and module plugins
  private commonActionForSpecialProperties (plugins: plugins['global']) {
    if (isArray(plugins)) {
      for (const plugin of plugins) {
        if (isPlainObject(plugin)) {
          if (isArray(plugin.escapeProperties)) {
            this.escapeProperties = this.escapeProperties.concat(plugin.escapeProperties)
          }
        }
      }
    }
  }

  private initRouteState (defaultPage: string): void {
    initRouteStateWithURL(
      this.microAppWindow.__MICRO_APP_NAME__,
      this.microAppWindow.location as MicroLocation,
      defaultPage,
    )
  }

  private clearRouteState (keepRouteState: boolean): void {
    clearRouteStateFromURL(
      this.microAppWindow.__MICRO_APP_NAME__,
      this.microAppWindow.__MICRO_APP_URL__,
      this.microAppWindow.location as MicroLocation,
      keepRouteState,
    )
  }

  public setRouteInfoForKeepAliveApp (): void {
    updateBrowserURLWithLocation(
      this.microAppWindow.__MICRO_APP_NAME__,
      this.microAppWindow.location as MicroLocation,
    )
  }

  public removeRouteInfoForKeepAliveApp (): void {
    removeStateAndPathFromBrowser(this.microAppWindow.__MICRO_APP_NAME__)
  }
}
