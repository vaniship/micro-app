declare module '@micro-app/types' {
  type AttrType = string | null

  type NormalKey = string | number

  type Func = (...rest: any[]) => void

  type microAppWindowType = Window & any

  type AppName = string

  type SourceAddress = string

  type AttrsType = Map<string, string>

  type fiberTasks = Array<() => Promise<void>> | null

  interface SandBoxStartParams {
    umdMode: boolean
    baseroute: string
    useMemoryRouter: boolean
    defaultPage: string
    disablePatchRequest: boolean
  }

  interface SandBoxStopParams {
    umdMode: boolean
    keepRouteState: boolean
    clearEventSource: boolean
    clearData: boolean
  }

  interface SandBoxInterface {
    proxyWindow: WindowProxy
    microAppWindow: Window // Proxy target
    start (startParams: SandBoxStartParams): void
    stop (stopParams: SandBoxStopParams): void
    // record umd snapshot before the first execution of umdHookMount
    recordUmdSnapshot (): void
    // rebuild umd snapshot before remount umd app
    rebuildUmdSnapshot (): void
    setRouteInfoForKeepAliveApp (): void
    removeRouteInfoForKeepAliveApp (): void
  }

  interface SandBoxAdapter {
    // Variables that can only assigned to rawWindow
    escapeSetterKeyList: PropertyKey[]

    // Variables that can escape to rawWindow
    staticEscapeProperties: PropertyKey[]

    // Variables that scoped in child app
    staticScopeProperties: PropertyKey[]

    // adapter for react
    // injectReactHRMProperty (): void
  }

  type LinkSourceInfo = {
    code: string, // source code
    appSpace: Record<string, {
      attrs: Map<string, string>, // active element.attributes
      placeholder?: Comment | null, // placeholder comment
      parsedCode?: string, // parsed code
      prefix?: string, // micro-app[name=appName]
    }>
  }

  type ScriptSourceInfo = {
    code: string, // source code
    isExternal: boolean, // external script
    appSpace: Record<string, {
      async: boolean, // async script
      defer: boolean, // defer script
      module: boolean, // module type script
      inline: boolean, // run js with inline script
      pure: boolean, // pure script
      attrs: Map<string, string>, // element attributes
      parsedCode?: string, // bind code
      parsedFunction?: Function | null, // code to function
      wrapInSandBox?: boolean // use sandbox
    }>
  }

  type sourceType = {
    html: HTMLElement | null, // html address
    links: Set<string>, // style/link address list
    scripts: Set<string>, // script address list
  }

  interface MountParam {
    container: HTMLElement | ShadowRoot
    inline: boolean
    useMemoryRouter: boolean
    baseroute: string
    keepRouteState: boolean
    defaultPage: string
    hiddenRouter: boolean
    disablePatchRequest: boolean
    fiber: boolean
    esmodule: boolean

  }

  interface UnmountParam {
    destroy: boolean,
    clearData: boolean
    unmountcb?: CallableFunction
  }

  // app instance
  interface AppInterface {
    source: sourceType // source list
    sandBox: SandBoxInterface | null // sandbox
    name: string // app name
    url: string // app url
    scopecss: boolean // whether use css scoped, default is true
    useSandbox: boolean // whether use js sandbox, default is true
    inline: boolean //  whether js runs in inline script mode, default is false
    esmodule: boolean // support esmodule in script
    ssrUrl: string // html path in ssr mode
    isPrefetch: boolean // whether prefetch app, default is false
    container: HTMLElement | ShadowRoot | null // container maybe null, micro-app, shadowRoot, div(keep-alive)
    keepRouteState: boolean // keep route state when unmount, default is false
    umdMode: boolean // is umd mode
    fiber: boolean // fiber mode
    useMemoryRouter: boolean // use virtual router
    // defaultPage: string // default page when mount
    // baseroute: string // route prefix, default is ''
    // hiddenRouter: boolean // hide router info of child from browser url

    // Load resources
    loadSourceCode (): void

    // resource is loaded
    onLoad (html: HTMLElement): void

    // Error loading HTML
    onLoadError (e: Error): void

    // mount app
    mount (mountParams: MountParam): void

    // unmount app
    unmount (unmountParam: UnmountParam): void

    // app rendering error
    onerror (e: Error): void

    // get app state
    getAppState (): string

    getKeepAliveState(): string | null

    // actions for completely destroy
    actionsForCompletelyDestroy (): void

    // hidden app when disconnectedCallback with keep-alive
    hiddenKeepAliveApp (callback?: CallableFunction): void

    // show app when connectedCallback with keep-alive
    showKeepAliveApp (container: HTMLElement | ShadowRoot): void
  }

  interface MicroAppElementType {
    appName: AttrType // app name
    appUrl: AttrType // app url

    // Hooks for element append to documents
    connectedCallback (): void

    // Hooks for element delete from documents
    disconnectedCallback (): void

    // Hooks for element attributes change
    attributeChangedCallback (a: 'name' | 'url', o: string, n: string): void
  }

  type prefetchParam = {
    name: string,
    url: string,
    // old config 👇
    disableScopecss?: boolean
    disableSandbox?: boolean
    // old config 👆
    'disable-scopecss'?: boolean
    'disable-sandbox'?: boolean
    inline?: boolean
    esmodule?: boolean
  }

  // prefetch params
  type prefetchParamList = Array<prefetchParam> | (() => Array<prefetchParam>)

  // lifeCycles
  interface lifeCyclesType {
    created(e: CustomEvent): void
    beforemount(e: CustomEvent): void
    mounted(e: CustomEvent): void
    unmount(e: CustomEvent): void
    error(e: CustomEvent): void
    beforeshow(e: CustomEvent): void
    aftershow(e: CustomEvent): void
    afterhidden(e: CustomEvent): void
  }

  type AssetsChecker = (url: string) => boolean;

  type plugins = {
    // global plugin
    global?: Array<{
      // Scoped global Properties
      scopeProperties?: Array<PropertyKey>
      // Properties that can be escape to rawWindow
      escapeProperties?: Array<PropertyKey>
      // Exclude JS or CSS
      excludeChecker?: AssetsChecker
      // Ignore JS or CSS
      ignoreChecker?: AssetsChecker
      // options for plugin as the third parameter of loader
      options?: Record<string, unknown>
      // handle function
      loader?: (code: string, url: string) => string
      // html processor
      processHtml?: (code: string, url: string) => string
    }>

    // plugin for special app
    modules?: {
      [name: string]: Array<{
        // Scoped global Properties
        scopeProperties?: Array<PropertyKey>
        // Properties that can be escape to rawWindow
        escapeProperties?: Array<PropertyKey>
        // Exclude JS or CSS
        excludeChecker?: AssetsChecker
        // Ignore JS or CSS
        ignoreChecker?: AssetsChecker
        // options for plugin as the third parameter of loader
        options?: Record<string, unknown>
        // handle function
        loader?: (code: string, url: string) => string
        // html processor
        processHtml?: (code: string, url: string) => string
      }>
    }
  }

  type fetchType = (url: string, options: Record<string, unknown>, appName: string | null) => Promise<string>

  type globalAssetsType = {
    js?: string[],
    css?: string[],
  }

  interface MicroAppConfig {
    shadowDOM?: boolean
    destroy?: boolean
    destory?: boolean
    inline?: boolean
    // old config 👇
    disableScopecss?: boolean
    disableSandbox?: boolean
    // old config 👆
    'disable-scopecss'?: boolean
    'disable-sandbox'?: boolean
    'disable-memory-router'?: boolean
    'disable-patch-request'?: boolean
    'keep-router-state'?: boolean
    'hidden-router'?: boolean
    'keep-alive'?: boolean
    'clear-data'?: boolean
    esmodule?: boolean
    ssr?: boolean
    fiber?: boolean
  }

  interface OptionsType extends MicroAppConfig {
    tagName?: string
    lifeCycles?: lifeCyclesType
    preFetchApps?: prefetchParamList
    plugins?: plugins
    fetch?: fetchType
    globalAssets?: globalAssetsType,
    excludeAssetFilter?: (assetUrl: string) => boolean
  }

  // MicroApp config
  interface MicroAppBaseType {
    tagName: string
    options: OptionsType
    preFetch(apps: prefetchParamList): void
    router: Router // eslint-disable-line
    start(options?: OptionsType): void
  }

  // special CallableFunction for interact
  type CallableFunctionForInteract = CallableFunction & { __APP_NAME__?: string, __AUTO_TRIGGER__?: boolean }

  interface ShadowLocation {
    [k: string]: string
  }

  interface MicroLocation extends Location, URL {
    // shadowLocation is the current location information (href, pathname, search, hash)
    shadowLocation: ShadowLocation
    fullPath: string
    [key: string]: any
  }

  type MicroHistory = ProxyHandler<History>
  type MicroState = any
  type HistoryProxyValue =
    Pick<
    History,
    'length' |
    'scrollRestoration' |
    'state' |
    'back' |
    'forward' |
    'go' |
    'pushState' |
    'replaceState'
    > | CallableFunction
  interface MicroRouter {
    microLocation: MicroLocation
    microHistory: MicroHistory
  }
  type LocationQueryValue = string | null
  type LocationQueryObject = Record<
  string,
  LocationQueryValue | LocationQueryValue[]
  >

  type LocationQuery = {
    hashQuery?: LocationQueryObject,
    searchQuery?: LocationQueryObject
  }

  type GuardLocation = Record<keyof MicroLocation, any>

  type CurrentRoute = Map<string, GuardLocation>

  interface RouterTarget {
    name: string
    path: string
    state?: unknown
    replace?: boolean
  }

  type navigationMethod = (to: RouterTarget) => void

  interface AccurateGuard {
    [appName: string]: (to: GuardLocation, from: GuardLocation) => void
  }

  type GlobalNormalGuard = ((to: GuardLocation, from: GuardLocation, appName: string) => void)

  type RouterGuard = AccurateGuard | GlobalNormalGuard

  type SetDefaultPageOptions = {
    name: string,
    path: string,
  }

  // Router API for developer
  interface Router {
    // current route of all apps
    readonly current: CurrentRoute
    /**
     * encodeURI of microApp path
     * @param path url path
     */
    encode(path: string): string
    /**
     * decodeURI of microApp path
     * @param path url path
     */
    decode(path: string): ReturnType<Router['encode']>
    /**
     * Navigate to a new URL by pushing an entry in the history
     * stack.
     * @param to - Route location to navigate to
     */
    push: navigationMethod
    /**
     * Navigate to a new URL by replacing the current entry in
     * the history stack.
     *
     * @param to - Route location to navigate to
     */
    replace: navigationMethod
    /**
     * Move forward or backward through the history. calling `history.go()`.
     *
     * @param delta - The position in the history to which you want to move,
     * relative to the current page
     */
    go: Func
    /**
     * Go back in history if possible by calling `history.back()`.
     */
    back: Func
    /**
     * Go forward in history if possible by calling `history.forward()`.
     */
    forward: Func
    /**
     * Add a navigation guard that executes before any navigation
     * @param guard global hook for
     */
    beforeEach(guard: RouterGuard): () => boolean
    /**
     * Add a navigation guard that executes after any navigation
     * @param guard global hook for
     */
    afterEach(guard: RouterGuard): () => boolean
    /**
     * Add defaultPage to control the first rendered page
     * @param options SetDefaultPageOptions
     */
    setDefaultPage(options: SetDefaultPageOptions): () => boolean
    /**
     * Clear data of defaultPage that set by setDefaultPage
     */
    removeDefaultPage(appName: string): boolean
    /**
     * Get defaultPage that set by setDefaultPage
     */
    getDefaultPage(key: PropertyKey): string | void
    /**
     * Attach specified active app router info to browser url
     */
    attachToURL(appName: string): void
    /**
     * Attach all active app router info to browser url
     */
    attachAllToURL(): void
    /**
     * Record base app router, let child app control base app navigation
     * It is global data
     * @param baseRouter router instance of base app
     */
    setBaseAppRouter(baseRouter: unknown): void
    /**
     * get baseRouter from cache
     */
    getBaseAppRouter(): unknown
  }

  // result of add/remove microApp path on browser url
  type HandleMicroPathResult = {
    fullPath: string,
    isAttach2Hash: boolean,
  }
}

declare namespace JSX {
  interface IntrinsicElements {
    'micro-app': any
  }
}

declare module '@micro-zoe/micro-app/polyfill/jsx-custom-event'

declare const __DEV__: boolean

declare const __TEST__: boolean
