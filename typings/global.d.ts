declare module '@micro-app/types' {
  type AttrType = string | null

  type Func = (...rest: any[]) => void

  type microAppWindowType = Window & any

  interface SandBoxInterface {
    proxyWindow: WindowProxy
    microAppWindow: Window // Proxy target
    start (baseRoute: string, useMemoryRouter: boolean): void
    stop (keepRouteState: boolean): void
    // record umd snapshot before the first execution of umdHookMount
    recordUmdSnapshot (): void
    // rebuild umd snapshot before remount umd app
    rebuildUmdSnapshot (): void
    setRouteInfoForKeepAliveApp (): void
    removeRouteInfoForKeepAliveApp (): void
  }

  type sourceLinkInfo = {
    code: string // code
    placeholder?: Comment | null // placeholder comment
    isGlobal: boolean // is global asset
  }

  type sourceScriptInfo = {
    code: string // code
    isExternal: boolean // external script
    isDynamic: boolean // dynamic create script
    async: boolean // async script
    defer: boolean // defer script
    module: boolean // module type script
    isGlobal?: boolean // share js to global
    code2Function?: Function // code to Function
  }

  interface sourceType {
    html?: HTMLElement
    links: Map<string, sourceLinkInfo>
    scripts: Map<string, sourceScriptInfo>
  }

  // app instance
  interface AppInterface {
    isPrefetch: boolean // whether prefetch app, default is false
    prefetchResolve: (() => void) | null // prefetch callback
    name: string // app name
    url: string // app url
    ssrUrl: string // html path in ssr mode
    container: HTMLElement | ShadowRoot | null // container maybe null, micro-app, shadowRoot, DIV(keep-alive)
    inline: boolean //  whether js runs in inline script mode, default is false
    scopecss: boolean // whether use css scoped, default is true
    useSandbox: boolean // whether use js sandbox, default is true
    useMemoryRouter: boolean // whether use memoryRouter, default is true
    baseroute: string // route prefix, default is ''
    keepRouteState: boolean // keep route state when unmount, default is false
    source: sourceType // sources of css, js, html
    sandBox: SandBoxInterface | null // sandbox
    umdMode: boolean // is umd mode

    // Load resources
    loadSourceCode (): void

    // resource is loaded
    onLoad (html: HTMLElement): void

    // Error loading HTML
    onLoadError (e: Error): void

    // mount app
    mount (
      container?: HTMLElement | ShadowRoot,
      inline?: boolean,
      baseroute?: string,
      keepRouteState?: boolean,
    ): void

    // unmount app
    unmount (destroy: boolean, unmountcb?: CallableFunction): void

    // app rendering error
    onerror (e: Error): void

    // get app state
    getAppState (): string

    getKeepAliveState(): string | null

    // actions for completely destroy
    actionsForCompletelyDestroy (): void

    // hidden app when disconnectedCallback with keep-alive
    hiddenKeepAliveApp (): void

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
    disableScopecss?: boolean
    disableSandbox?: boolean
    disableMemoryRouter?: boolean
    shadowDOM?: boolean
  }

  // prefetch params
  type prefetchParamList = Array<prefetchParam> | (() => Array<prefetchParam>)

  // lifeCycles
  interface lifeCyclesType {
    created?(e?: CustomEvent): void
    beforemount?(e?: CustomEvent): void
    mounted?(e?: CustomEvent): void
    unmount?(e?: CustomEvent): void
    error?(e?: CustomEvent): void
  }

  type plugins = {
    // global plugin
    global?: Array<{
      // Scoped global Properties
      scopeProperties?: Array<PropertyKey>
      // Properties that can be escape to rawWindow
      escapeProperties?: Array<PropertyKey>
      // options for plugin as the third parameter of loader
      options?: unknown
      // handle function
      loader?: (code: string, url: string, options: unknown, info: sourceScriptInfo) => string
    }>

    // plugin for special app
    modules?: {
      [name: string]: Array<{
        // Scoped global Properties
        scopeProperties?: Array<PropertyKey>
        // Properties that can be escape to rawWindow
        escapeProperties?: Array<PropertyKey>
        // options for plugin as the third parameter of loader
        options?: unknown
        // handle function
        loader?: (code: string, url: string, options: unknown, info: sourceScriptInfo) => string
      }>
    }
  }

  type fetchType = (url: string, options: Record<string, unknown>, appName: string | null) => Promise<string>

  type globalAssetsType = {
    js?: string[],
    css?: string[],
  }

  type OptionsType = {
    tagName?: string
    shadowDOM?: boolean
    destroy?: boolean
    inline?: boolean
    disableScopecss?: boolean
    disableSandbox?: boolean
    disableMemoryRouter?: boolean
    ssr?: boolean
    lifeCycles?: lifeCyclesType
    preFetchApps?: prefetchParamList
    plugins?: plugins
    fetch?: fetchType
    globalAssets?: globalAssetsType,
  }

  // MicroApp config
  interface MicroAppConfigType {
    tagName: string
    shadowDOM?: boolean
    destroy?: boolean
    inline?: boolean
    disableScopecss?: boolean
    disableSandbox?: boolean
    disableMemoryRouter?: boolean
    ssr?: boolean
    lifeCycles?: lifeCyclesType
    plugins?: plugins
    fetch?: fetchType
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

  type GuardLocation = Record<keyof URL, any>

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

  type GlobalNormalGuard = ((appName: string, to: GuardLocation, from: GuardLocation) => void)

  type RouterGuard = AccurateGuard | GlobalNormalGuard

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
    // Go back in history if possible by calling `history.back()`.
    back: Func
    // Go forward in history if possible by calling `history.forward()`.
    forward: Func
    /**
     * Add a navigation guard that executes before any navigation
     * @param guard global hook for
     */
    beforeEach(guard: RouterGuard): void

    afterEach(guard: RouterGuard): void
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
