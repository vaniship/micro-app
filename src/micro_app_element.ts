/* eslint-disable no-new */
import type {
  AttrType,
  MicroAppElementInterface,
  AppInterface,
  OptionsType,
  NormalKey,
} from '@micro-app/types'
import microApp from './micro_app'
import dispatchLifecyclesEvent from './interact/lifecycles_event'
import globalEnv from './libs/global_env'
import {
  defer,
  formatAppName,
  formatAppURL,
  version,
  logError,
  logWarn,
  isString,
  isFunction,
  CompletionPath,
  createURL,
  isPlainObject,
  getEffectivePath,
} from './libs/utils'
import {
  ObservedAttrName,
  lifeCycles,
  appStates,
} from './constants'
import CreateApp, {
  appInstanceMap,
} from './create_app'
import {
  router,
  getNoHashMicroPathFromURL,
  initRouterMode,
} from './sandbox/router'

/**
 * define element
 * @param tagName element name
*/
export function defineElement (tagName: string): void {
  class MicroAppElement extends HTMLElement implements MicroAppElementInterface {
    static get observedAttributes (): string[] {
      return ['name', 'url']
    }

    private isWaiting = false
    private cacheData: Record<PropertyKey, unknown> | null = null
    private connectedCount = 0
    private connectStateMap: Map<number, boolean> = new Map()
    public appName = '' // app name
    public appUrl = '' // app url
    public ssrUrl = '' // html path in ssr mode
    public version = version

    // 👇 Configuration
    // name: app name
    // url: html address
    // shadowDom: use shadowDOM, default is false
    // destroy: whether delete cache resources when unmount, default is false
    // inline: whether js runs in inline script mode, default is false
    // disableScopecss: whether disable css scoped, default is false
    // disableSandbox: whether disable sandbox, default is false
    // baseRoute: route prefix, default is ''
    // keep-alive: open keep-alive mode

    public connectedCallback (): void {
      const cacheCount = ++this.connectedCount
      this.connectStateMap.set(cacheCount, true)
      /**
       * In some special scenes, such as vue's keep-alive, the micro-app will be inserted and deleted twice in an instant
       * So we execute the mount method async and record connectState to prevent repeated rendering
       */
      const effectiveApp = this.appName && this.appUrl
      defer(() => {
        if (this.connectStateMap.get(cacheCount)) {
          dispatchLifecyclesEvent(
            this,
            this.appName,
            lifeCycles.CREATED,
          )
          /**
           * If insert micro-app element without name or url, and set them in next action like angular,
           * handleConnected will be executed twice, causing the app render repeatedly,
           * so we only execute handleConnected() if url and name exist when connectedCallback
           */
          effectiveApp && this.handleConnected()
        }
      })
    }

    public disconnectedCallback (): void {
      this.connectStateMap.set(this.connectedCount, false)
      this.handleDisconnected()
    }

    /**
     * Re render app from the command line
     * MicroAppElement.reload(destroy)
     */
    public reload (destroy?: boolean): Promise<boolean> {
      return new Promise((resolve) => {
        const handleAfterReload = () => {
          this.removeEventListener(lifeCycles.MOUNTED, handleAfterReload)
          this.removeEventListener(lifeCycles.AFTERSHOW, handleAfterReload)
          resolve(true)
        }
        this.addEventListener(lifeCycles.MOUNTED, handleAfterReload)
        this.addEventListener(lifeCycles.AFTERSHOW, handleAfterReload)
        this.handleDisconnected(destroy, () => {
          this.handleConnected()
        })
      })
    }

    /**
     * common action for unmount
     * @param destroy reload param
     */
    private handleDisconnected (destroy = false, callback?: CallableFunction): void {
      const app = appInstanceMap.get(this.appName)
      if (app && !app.isUnmounted() && !app.isHidden()) {
        // keep-alive
        if (this.getKeepAliveModeResult() && !destroy) {
          this.handleHiddenKeepAliveApp(callback)
        } else {
          this.unmount(destroy, callback)
        }
      }
    }

    public attributeChangedCallback (attr: ObservedAttrName, _oldVal: string, newVal: string): void {
      if (
        this.legalAttribute(attr, newVal) &&
        this[attr === ObservedAttrName.NAME ? 'appName' : 'appUrl'] !== newVal
      ) {
        if (
          attr === ObservedAttrName.URL && (
            !this.appUrl ||
            !this.connectStateMap.get(this.connectedCount) // TODO: 这里的逻辑可否再优化一下
          )
        ) {
          newVal = formatAppURL(newVal, this.appName)
          if (!newVal) {
            return logError(`Invalid attribute url ${newVal}`, this.appName)
          }
          this.appUrl = newVal
          this.handleInitialNameAndUrl()
        } else if (
          attr === ObservedAttrName.NAME && (
            !this.appName ||
            !this.connectStateMap.get(this.connectedCount) // TODO: 这里的逻辑可否再优化一下
          )
        ) {
          const formatNewName = formatAppName(newVal)

          if (!formatNewName) {
            return logError(`Invalid attribute name ${newVal}`, this.appName)
          }

          // TODO: 当micro-app还未插入文档中就修改name，逻辑可否再优化一下
          if (this.cacheData) {
            microApp.setData(formatNewName, this.cacheData)
            this.cacheData = null
          }

          this.appName = formatNewName
          if (formatNewName !== newVal) {
            this.setAttribute('name', this.appName)
          }
          this.handleInitialNameAndUrl()
        } else if (!this.isWaiting) {
          this.isWaiting = true
          defer(this.handleAttributeUpdate)
        }
      }
    }

    // handle for connectedCallback run before attributeChangedCallback
    private handleInitialNameAndUrl (): void {
      this.connectStateMap.get(this.connectedCount) && this.handleConnected()
    }

    /**
     * first mount of this app
     */
    private handleConnected (): void {
      if (!this.appName || !this.appUrl) return

      if (this.getDisposeResult('shadowDOM') && !this.shadowRoot && isFunction(this.attachShadow)) {
        this.attachShadow({ mode: 'open' })
      }

      this.updateSsrUrl(this.appUrl)
      if (appInstanceMap.has(this.appName)) {
        const oldApp = appInstanceMap.get(this.appName)!
        const oldAppUrl = oldApp.ssrUrl || oldApp.url
        const targetUrl = this.ssrUrl || this.appUrl
        /**
         * NOTE:
         * 1. keep-alive don't care about ssrUrl
         * 2. Even if the keep-alive app is pushed into the background, it is still active and cannot be replaced. Otherwise, it is difficult for developers to troubleshoot in case of conflict and  will leave developers at a loss
         * 3. When scopecss, useSandbox of prefetch app different from target app, delete prefetch app and create new one
         */
        if (
          oldApp.isHidden() &&
          oldApp.url === this.appUrl
        ) {
          this.handleShowKeepAliveApp(oldApp)
        } else if (
          oldAppUrl === targetUrl && (
            oldApp.isUnmounted() ||
            (
              oldApp.isPrefetch &&
              this.sameCoreOptions(oldApp)
            )
          )
        ) {
          this.handleMount(oldApp)
        } else if (oldApp.isPrefetch || oldApp.isUnmounted()) {
          if (__DEV__ && this.sameCoreOptions(oldApp)) {
            /**
             * url is different & old app is unmounted or prefetch, create new app to replace old one
             */
            logWarn(`the ${oldApp.isPrefetch ? 'prefetch' : 'unmounted'} app with url ${oldAppUrl} replaced by a new app with url ${targetUrl}`, this.appName)
          }
          this.handleCreateApp()
        } else {
          logError(`app name conflict, an app named ${this.appName} with url ${oldAppUrl} is running`)
        }
      } else {
        this.handleCreateApp()
      }
    }

    /**
     * handle for change of name an url after element init
     */
    private handleAttributeUpdate = (): void => {
      this.isWaiting = false
      const formatAttrName = formatAppName(this.getAttribute('name'))
      const formatAttrUrl = formatAppURL(this.getAttribute('url'), this.appName)
      if (this.legalAttribute('name', formatAttrName) && this.legalAttribute('url', formatAttrUrl)) {
        const oldApp = appInstanceMap.get(formatAttrName)
        /**
         * If oldApp exist & appName is different, determine whether oldApp is running
         */
        if (formatAttrName !== this.appName && oldApp) {
          if (!oldApp.isUnmounted() && !oldApp.isHidden() && !oldApp.isPrefetch) {
            this.setAttribute('name', this.appName)
            return logError(`app name conflict, an app named ${formatAttrName} is running`)
          }
        }

        if (formatAttrName !== this.appName || formatAttrUrl !== this.appUrl) {
          if (formatAttrName === this.appName) {
            this.unmount(true, () => {
              this.actionsForAttributeChange(formatAttrName, formatAttrUrl, oldApp)
            })
          } else if (this.getKeepAliveModeResult()) {
            this.handleHiddenKeepAliveApp()
            this.actionsForAttributeChange(formatAttrName, formatAttrUrl, oldApp)
          } else {
            this.unmount(false, () => {
              this.actionsForAttributeChange(formatAttrName, formatAttrUrl, oldApp)
            })
          }
        }
      } else if (formatAttrName !== this.appName) {
        this.setAttribute('name', this.appName)
      }
    }

    // remount app or create app if attribute url or name change
    private actionsForAttributeChange (
      formatAttrName: string,
      formatAttrUrl: string,
      oldApp: AppInterface | void,
    ): void {
      /**
       * do not add judgment of formatAttrUrl === this.appUrl
       */
      this.updateSsrUrl(formatAttrUrl)

      this.appName = formatAttrName
      this.appUrl = formatAttrUrl
      ;(this.shadowRoot ?? this).innerHTML = ''
      if (formatAttrName !== this.getAttribute('name')) {
        this.setAttribute('name', this.appName)
      }

      /**
       * when oldApp not null: this.appName === oldApp.name
       * scene1: if formatAttrName and this.appName are equal: exitApp is the current app, the url must be different, oldApp has been unmounted
       * scene2: if formatAttrName and this.appName are different: oldApp must be prefetch or unmounted, if url is equal, then just mount, if url is different, then create new app to replace oldApp
       * scene3: url is different but ssrUrl is equal
       * scene4: url is equal but ssrUrl is different, if url is equal, name must different
       * scene5: if oldApp is KEEP_ALIVE_HIDDEN, name must different
       */
      if (oldApp) {
        if (oldApp.isHidden()) {
          if (oldApp.url === this.appUrl) {
            this.handleShowKeepAliveApp(oldApp)
          } else {
            // the hidden keep-alive app is still active
            logError(`app name conflict, an app named ${this.appName} is running`)
          }
        /**
         * TODO:
         *  1. oldApp必是unmountApp或preFetchApp，这里还应该考虑沙箱、iframe、样式隔离不一致的情况
         *  2. unmountApp要不要判断样式隔离、沙箱、iframe，然后彻底删除并再次渲染？(包括handleConnected里的处理，先不改？)
         * 推荐：if (
         *  oldApp.url === this.appUrl &&
         *  oldApp.ssrUrl === this.ssrUrl && (
         *    oldApp.isUnmounted() ||
         *    (oldApp.isPrefetch && this.sameCoreOptions(oldApp))
         *  )
         * )
         */
        } else if (oldApp.url === this.appUrl && oldApp.ssrUrl === this.ssrUrl) {
          // mount app
          this.handleMount(oldApp)
        } else {
          this.handleCreateApp()
        }
      } else {
        this.handleCreateApp()
      }
    }

    /**
     * judge the attribute is legal
     * @param name attribute name
     * @param val attribute value
     */
    private legalAttribute (name: string, val: AttrType): boolean {
      if (!isString(val) || !val) {
        logError(`unexpected attribute ${name}, please check again`, this.appName)
        return false
      }

      return true
    }

    // create app instance
    private handleCreateApp (): void {
      const createAppInstance = () => new CreateApp({
        name: this.appName,
        url: this.appUrl,
        container: this.shadowRoot ?? this,
        scopecss: this.useScopecss(),
        useSandbox: this.useSandbox(),
        inline: this.getDisposeResult('inline'),
        iframe: this.getDisposeResult('iframe'),
        ssrUrl: this.ssrUrl,
        routerMode: this.getMemoryRouterMode(),
      })

      /**
       * Actions for destroy old app
       * If oldApp exist, it must be 3 scenes:
       *  1. oldApp is unmounted app (url is is different)
       *  2. oldApp is prefetch, not prerender (url, scopecss, useSandbox, iframe is different)
       *  3. oldApp is prerender (url, scopecss, useSandbox, iframe is different)
       */
      const oldApp = appInstanceMap.get(this.appName)
      if (oldApp) {
        if (oldApp.isPrerender) {
          this.unmount(true, createAppInstance)
        } else {
          oldApp.actionsForCompletelyDestroy()
          createAppInstance()
        }
      } else {
        createAppInstance()
      }
    }

    /**
     * mount app
     * some serious note before mount:
     * 1. is prefetch ?
     * 2. is remount in another container ?
     * 3. is remount with change properties of the container ?
     */
    private handleMount (app: AppInterface): void {
      app.isPrefetch = false
      /**
       * Fix error when navigate before app.mount by microApp.router.push(...)
       * Issue: https://github.com/micro-zoe/micro-app/issues/908
       */
      app.setAppState(appStates.BEFORE_MOUNT)
      // exec mount async, simulate the first render scene
      defer(() => this.mount(app))
    }

    /**
     * public mount action for micro_app_element & create_app
     */
    public mount (app: AppInterface): void {
      app.mount({
        container: this.shadowRoot ?? this,
        inline: this.getDisposeResult('inline'),
        routerMode: this.getMemoryRouterMode(),
        baseroute: this.getBaseRouteCompatible(),
        defaultPage: this.getDefaultPage(),
        disablePatchRequest: this.getDisposeResult('disable-patch-request'),
        fiber: this.getDisposeResult('fiber'),
      })
    }

    /**
     * unmount app
     * @param destroy delete cache resources when unmount
     * @param unmountcb callback
     */
    public unmount (destroy?: boolean, unmountcb?: CallableFunction): void {
      const app = appInstanceMap.get(this.appName)
      if (app && !app.isUnmounted()) {
        app.unmount({
          destroy: destroy || this.getDestroyCompatibleResult(),
          clearData: this.getDisposeResult('clear-data'),
          keepRouteState: this.getDisposeResult('keep-router-state'),
          unmountcb,
        })
      }
    }

    // hidden app when disconnectedCallback called with keep-alive
    private handleHiddenKeepAliveApp (callback?: CallableFunction): void {
      const app = appInstanceMap.get(this.appName)
      if (app && !app.isUnmounted() && !app.isHidden()) {
        app.hiddenKeepAliveApp(callback)
      }
    }

    // show app when connectedCallback called with keep-alive
    private handleShowKeepAliveApp (app: AppInterface): void {
      // must be async
      defer(() => app.showKeepAliveApp(this.shadowRoot ?? this))
    }

    /**
     * Get configuration
     * Global setting is lowest priority
     * @param name Configuration item name
     */
    private getDisposeResult <T extends keyof OptionsType> (name: T): boolean {
      return (this.compatibleProperties(name) || !!microApp.options[name]) && this.compatibleDisableProperties(name)
    }

    // compatible of disableScopecss & disableSandbox
    private compatibleProperties (name: string): boolean {
      if (name === 'disable-scopecss') {
        return this.hasAttribute('disable-scopecss') || this.hasAttribute('disableScopecss')
      } else if (name === 'disable-sandbox') {
        return this.hasAttribute('disable-sandbox') || this.hasAttribute('disableSandbox')
      }
      return this.hasAttribute(name)
    }

    // compatible of disableScopecss & disableSandbox
    private compatibleDisableProperties (name: string): boolean {
      if (name === 'disable-scopecss') {
        return this.getAttribute('disable-scopecss') !== 'false' && this.getAttribute('disableScopecss') !== 'false'
      } else if (name === 'disable-sandbox') {
        return this.getAttribute('disable-sandbox') !== 'false' && this.getAttribute('disableSandbox') !== 'false'
      }
      return this.getAttribute(name) !== 'false'
    }

    private useScopecss (): boolean {
      return !(this.getDisposeResult('disable-scopecss') || this.getDisposeResult('shadowDOM'))
    }

    private useSandbox (): boolean {
      return !this.getDisposeResult('disable-sandbox')
    }

    /**
     * Determine whether the core options of the existApp is consistent with the new one
     */
    private sameCoreOptions (app: AppInterface): boolean {
      return (
        app.scopecss === this.useScopecss() &&
        app.useSandbox === this.useSandbox() &&
        app.iframe === this.getDisposeResult('iframe')
      )
    }

    /**
     * 2021-09-08
     * get baseRoute
     * getAttribute('baseurl') is compatible writing of versions below 0.3.1
     */
    private getBaseRouteCompatible (): string {
      return this.getAttribute('baseroute') ?? this.getAttribute('baseurl') ?? ''
    }

    // compatible of destroy
    private getDestroyCompatibleResult (): boolean {
      return this.getDisposeResult('destroy') || this.getDisposeResult('destory')
    }

    /**
     * destroy has priority over destroy keep-alive
     */
    private getKeepAliveModeResult (): boolean {
      return this.getDisposeResult('keep-alive') && !this.getDestroyCompatibleResult()
    }

    /**
     * change ssrUrl in ssr mode
     */
    private updateSsrUrl (baseUrl: string): void {
      if (this.getDisposeResult('ssr')) {
        // TODO: disable-memory-router不存在了，这里需要更新一下
        if (this.getDisposeResult('disable-memory-router') || this.getDisposeResult('disableSandbox')) {
          const rawLocation = globalEnv.rawWindow.location
          this.ssrUrl = CompletionPath(rawLocation.pathname + rawLocation.search, baseUrl)
        } else {
          // get path from browser URL
          // TODO: 新版本路由系统要重新兼容ssr
          let targetPath = getNoHashMicroPathFromURL(this.appName, baseUrl)
          const defaultPagePath = this.getDefaultPage()
          if (!targetPath && defaultPagePath) {
            const targetLocation = createURL(defaultPagePath, baseUrl)
            targetPath = targetLocation.origin + targetLocation.pathname + targetLocation.search
          }
          this.ssrUrl = targetPath
        }
      } else if (this.ssrUrl) {
        this.ssrUrl = ''
      }
    }

    /**
     * get config of default page
     */
    private getDefaultPage (): string {
      return (
        router.getDefaultPage(this.appName) ||
        this.getAttribute('default-page') ||
        this.getAttribute('defaultPage') ||
        ''
      )
    }

    /**
     * get config of router-mode
     * @returns router-mode
     */
    private getMemoryRouterMode () : string {
      return initRouterMode(
        this.getAttribute('router-mode'),
        // is micro-app element set disable-memory-router, like <micro-app disable-memory-router></micro-app>
        // or <micro-app disable-memory-router='false'></micro-app>
        this.compatibleProperties('disable-memory-router') && this.compatibleDisableProperties('disable-memory-router'),
      )
    }

    /**
     * rewrite micro-app.setAttribute, process attr data
     * @param key attr name
     * @param value attr value
     */
    public setAttribute (key: string, value: any): void {
      if (key === 'data') {
        if (isPlainObject(value)) {
          const cloneValue: Record<NormalKey, unknown> = {}
          Object.getOwnPropertyNames(value).forEach((ownKey: NormalKey) => {
            if (!(isString(ownKey) && ownKey.indexOf('__') === 0)) {
              cloneValue[ownKey] = value[ownKey]
            }
          })
          this.data = cloneValue
        } else if (value !== '[object Object]') {
          logWarn('property data must be an object', this.appName)
        }
      } else {
        globalEnv.rawSetAttribute.call(this, key, value)
      }
    }

    /**
     * get delay time of router event
     * @returns delay time
     */
    public getRouterEventDelay (): number {
      let delay = parseInt(this.getAttribute('router-event-delay') as string)
      if (isNaN(delay)) {
        delay = parseInt((isFunction(microApp.options['router-event-delay']) ? microApp.options['router-event-delay'](this.appName) : microApp.options['router-event-delay']) as unknown as string)
      }
      /**
       * 描述：
       * 主：所有框架 子：vue3、react16
       * 步骤：跳转vue3，跳转react16，刷新页面，点击返回，主应用接受到事件异步卸载，导致子应用重置了url，delay为100无事，为0则不行，卸载间隔大概50ms，怀疑是按需加载的问题
       * 总结：确实是按需加载的问题，而且是以下一个页面按需加载时间来确定的。从主应用pageA跳转pageB，刷新浏览器，点击浏览器返回，如果pageA是按需加载，则react接受到popstate事件后异步处理，等待下一个页面加载完成才真正卸载pageB，这个时间就更不好确定了，要延迟多久？
       * 异步卸载：
       *  1、按需加载时组件卸载的准确时机：从pageA跳转page2
       *    react16：顺序执行，先卸载上一个页面，然后才开始加载下一个页面静态资源并渲染
       *    react18：先加载下一个页面的静态资源，加载完成后执行代码，创建元素但不插入文档，此时再卸载上一个页面，卸载完成后将已经创建的元素插入文档。
       *    vue2：先加载下一个页面的静态资源，加载完成之后执行代码创建元素并且插入文档中，之后同步卸载上一个页面。
       *    vue3：先加载下一个页面的静态资源，加载完成之后即卸载上一个页面，卸载完成后渲染下一个页面。
       *          和react18、vue2不同的是没有做的那么极端，资源加载完成就卸载上一个页面了，没有进一步先初始化下一个页面的元素。
       *          所以即便没有transition，vue3的页面卸载也可能是异步的
       *  2、react16、vue3有会因为path和base不匹配强行修改url地址，导致点击浏览器返回时浏览器地址不对。异步卸载本身没问题，但结合这个有问题了。所以还是state模式最好，就算是异步也不会有问题，search模式会有先添加search字符串然后删除的问题，其它问题不大，只有native问题最大，主要解决的也就是native模式的问题。
       *
       * 总结：
       *  1、但整体逻辑是一样的，跳转下一个按需加载页面，会先加载资源，资源加载完成再卸载上一个页面，也就是异步卸载
       *    但最难的是下一个页面什么时候加载完成是不知道的，文件大小、网速都可能会影响，100ms完全不够用，网络延迟都可能不止100ms，线上项目尤其是一些陈年旧项目，文件大小都是非常夸张的
       *  2、非按需加载，所有操作都是同步，没有异步问题
       *  3、每个框架的表现都不一样，其它框架angular和next、nuxt表现都可能不一样，但总体来说是一定的：卸载可能是异步的，并且时间不确定，这一点最重要。那么delay的默认值应该是多少呢？？？？？？
       *
       * 2024.6.19 19:45
       *  1、看来delay解决不了问题，因为时间根本无法掌握，这里也不删了，留着吧，但用处也不大了
       *  2、用url配合baseroute判断也是不行的，因为地址根本无法预测和掌握
       * 目前看来有两种不太完善的思路：将native模式state或search化
       *  1、强行依赖于 __MICRO_APP_STATE__，如果检测到没有，就不响应popstate事件
       *     原因：最直接的原因就是popstate事件，如果主应用只是pushState，内部跳转，不会有问题，最直接的原因就是子应用接受到了popstate事件后修改了url地址
       *     思路：pushState/replaceState时如果有活动的native模式的子应用则将其__MICRO_APP_STATE__带过去，但是要将fullPath字段删除(防止刷新时强行修改url地址)，当子应用接受到popstate事件，通过history.state判断，如果有__MICRO_APP_STATE__则接收，否则不做处理
       *     原则：原则上只处理前进后退，其它场景暂时不做处理，毕竟场景太少，如果出了问题，告知用户换其它模式
       *     前进后退的特点是：没有任何痕迹就修改url地址，然后发送一个popstate事件，类似这样的特点的跳转并不少，要尽量排除掉
       *
       *     注意：修改地址无法三种方式：history、location、前进后退、a标签
       *        1、react16 hash模式通过location.hash=xxx跳转（主、子），要不要响应popstate事件？
       *          子：和2一致，肯定是要响应的，自身内部的跳转要和单独运行时一致
       *          主：与3一个道理
       *
       *        2、子应用location跳转也有修改url地址并且发送popstate事件，此时要不要响应？
       *          要，但不需要特殊处理，因为location跳转的state必定为null，popstate事件会向下发送的
       *
       *        3、用户直接通过浏览器修改url地址，比如带有hash，或者location.hash=xxx，页面不刷新但是__MICRO_APP_STATE__丢失，要不要响应？ -- 这个最难处理，因为它和前进后退的行为一样
       *          例如：1、主应用如果是hash路由，是会响应的，那么同样作为hash的子应用要不要响应？？
       *               2、用户在页面 http://localhost:5173/#/，通过其它地方复制地址 http://localhost:5173/#/page3，到浏览器，此时不会刷新，也只是发送popstate事件
       *
       *
       *          或许可以用history.state=null来判断？因为无论是vue3还是react16，懒加载页面肯定不是首页，所以history.state大概率不为null，所以判断结果为：
       *            if(history.state===null || history.state?__MICRO_APP_STATE__[appName]) {
       *                发送popstate事件，否则不发送 // 感觉到最后就是为了解决vue3的问题
       *            }
       *          好像不行，因为react16hash路由也没有history.state，history模式有，毕竟hash模式是通过location.hash=xx跳转的，没有history.state也是正常的，那react16 hash路由懒加载不就是无解的吗，正常跳转都是修改url发送popstate，并且可以确认hash路由跳转时是先修改url地址，发送popstate事件，然后再卸载组件 -- 那就只能说主应用是react16 hash路由时不能使用native模式，用state模式吧 ------ 这里用micro-app-demo再验证一下
       *
       *
       *        4、主应用通过pushState配合popstate控制跳转懒加载页面，效果和点击前进后退是一样的，要不要响应，如果响应了，就一定会出问题。
       *           此场景理论上不多吧，应用跳转一般都用框架自身的方法，除非有第三方重写了history方法，每次跳转时都会发送popstate事件，那就没办法了，换state模式吧
       *           而且旧版本中有一些通过这些方式控制子应用跳转的，如果禁止了，代码就会出错
       *
       *        5、history.back/go/forward 也会发送popstate事件
       *            它们和前进后退是一样的处理逻辑，因为功能是一样的
       *
       *        6、<a href="#/base/xxx"> <a href="/base/xxx">
       *
       *        7、如果前端框架监听到popState事件后始终调用replaceState，那就无解了
       *
       *
       *  2、像search模式一样，不阻止子应用修改url地址，但是在卸载子应用后将地址复原
       *     问题：
       *        1、如果子应用在当前页面正常卸载，没有前进后退，也没有主动pushState并发送popstate，复原的地址就不对了
       *        2、因为子应用先响应popstate事件，再在卸载掉时候复原地址，那么在子应用响应popstate事件时就有可能先兜底到子应用的404页面，然后再卸载
       *     总结：实行起来太麻烦，无法准确控制。子应用卸载后还原之前的地址，那么旧地址就需要保存，但问题是子应用内部也可能会频繁跳转，旧地址无法准确记录
       */
      return !isNaN(delay) ? delay : 0
    }

    /**
     * Data from the base application
     */
    set data (value: Record<PropertyKey, unknown> | null) {
      if (this.appName) {
        microApp.setData(this.appName, value as Record<PropertyKey, unknown>)
      } else {
        this.cacheData = value
      }
    }

    /**
     * get data only used in jsx-custom-event once
     */
    get data (): Record<PropertyKey, unknown> | null {
      if (this.appName) {
        return microApp.getData(this.appName, true)
      } else if (this.cacheData) {
        return this.cacheData
      }
      return null
    }

    /**
     * get publicPath from a valid address,it can used in micro-app-devtools
     */
    get publicPath (): string {
      return getEffectivePath(this.appUrl)
    }

    /**
     * get baseRoute from attribute,it can used in micro-app-devtools
     */
    get baseRoute (): string {
      return this.getBaseRouteCompatible()
    }
  }

  window.customElements.define(tagName, MicroAppElement)
}
