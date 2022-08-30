import type {
  Func,
  AppInterface,
  sourceType,
  SandBoxInterface,
  MountParam,
  UnmountParam,
  PreRenderParam,
} from '@micro-app/types'
import { HTMLLoader } from './source/loader/html'
import { extractSourceDom } from './source/index'
import { execScripts } from './source/scripts'
import SandBox, { router } from './sandbox'
import {
  appStates,
  lifeCycles,
  keepAliveStates,
  microGlobalEvent,
} from './constants'
import {
  isFunction,
  cloneContainer,
  isPromise,
  logError,
  getRootContainer,
  isObject,
  callFnWithTryCatch,
  assign,
  pureCreateElement,
} from './libs/utils'
import dispatchLifecyclesEvent, { dispatchCustomEventToMicroApp } from './interact/lifecycles_event'
import globalEnv from './libs/global_env'
import { releasePatchSetAttribute } from './source/patch'
import microApp, { getActiveApps } from './micro_app'
import sourceCenter from './source/source_center'

// micro app instances
export const appInstanceMap = new Map<string, AppInterface>()

// params of CreateApp
export interface CreateAppParam {
  name: string
  url: string
  scopecss: boolean
  useSandbox: boolean
  inline?: boolean
  esmodule?: boolean
  container?: HTMLElement | ShadowRoot
  ssrUrl?: string
  isPrefetch?: boolean
  preRender?: PreRenderParam
}

export default class CreateApp implements AppInterface {
  private state: string = appStates.CREATED
  private keepAliveState: string | null = null
  private keepAliveContainer: HTMLElement | null = null
  private loadSourceLevel: -1|0|1|2 = 0
  private umdHookMount: Func | null = null
  private umdHookUnmount: Func | null = null
  private libraryName: string | null = null
  private preRenderEvent?: CallableFunction[]
  public umdMode = false
  public source: sourceType
  public sandBox: SandBoxInterface | null = null
  public name: string
  public url: string
  public container: HTMLElement | ShadowRoot | null
  public scopecss: boolean
  public useSandbox: boolean
  public inline: boolean
  public esmodule: boolean
  public ssrUrl: string
  public isPrefetch: boolean
  public preRender?: PreRenderParam
  public fiber = false
  public useMemoryRouter = true

  constructor ({
    name,
    url,
    container,
    scopecss,
    useSandbox,
    inline,
    esmodule,
    ssrUrl,
    isPrefetch,
    preRender,
  }: CreateAppParam) {
    this.name = name
    this.url = url
    this.useSandbox = useSandbox
    this.scopecss = this.useSandbox && scopecss
    this.inline = inline ?? false
    this.esmodule = esmodule ?? false

    // not exist when prefetch 👇
    this.container = container ?? null
    this.ssrUrl = ssrUrl ?? ''

    // exist only prefetch 👇
    this.isPrefetch = isPrefetch ?? false
    this.preRender = preRender

    // init actions
    appInstanceMap.set(this.name, this)
    this.source = { html: null, links: new Set(), scripts: new Set() }
    this.loadSourceCode()
    this.useSandbox && (this.sandBox = new SandBox(name, url))
  }

  // Load resources
  public loadSourceCode (): void {
    this.state = appStates.LOADING
    HTMLLoader.getInstance().run(this, extractSourceDom)
  }

  /**
   * When resource is loaded, mount app if it is not prefetch or unmount
   */
  public onLoad (html: HTMLElement): void {
    if (++this.loadSourceLevel === 2) {
      this.source.html = html
      this.state = appStates.LOADED

      if (!this.isPrefetch && appStates.UNMOUNT !== this.state) {
        // @ts-ignore
        getRootContainer(this.container!).mount(this)
      } else if (this.preRender) {
        /**
         * PreRender is an option of prefetch, it will render app during prefetch
         * Limit:
         * 1. fiber forced on
         * 2. only virtual router support
         * NOTE:
         * 1. pushState/replaceState in child can update microLocation, but will not attach router info to browser url
         * 2. prevent dispatch popstate/hashchange event to browser
         * 3. all navigation actions of location are invalid (In the future, we can consider update microLocation without trigger browser reload)
         * 4. lifecycle event will not trigger when prerender
         * Special scenes
         * 1. unmount prerender app when loading
         * 2. unmount prerender app when exec js
         * 2. unmount prerender app after exec js
         */
        const container = pureCreateElement('div')
        container.setAttribute('prerender', 'true')
        this.sandBox?.setPreRenderState(true)
        this.mount(
          assign({
            container,
            inline: this.inline,
            useMemoryRouter: true,
            baseroute: '',
            fiber: true,
            esmodule: this.esmodule,
          }, {
            defaultPage: this.preRender['default-page'] || '',
            disablePatchRequest: this.preRender['disable-patch-request'] || false,
          })
        )
      }
    }
  }

  /**
   * Error loading HTML
   * @param e Error
   */
  public onLoadError (e: Error): void {
    this.loadSourceLevel = -1

    if (appStates.UNMOUNT !== this.state) {
      this.onerror(e)
      this.state = appStates.LOAD_FAILED
    }
  }

  /**
   * mount app
   * @param container app container
   * @param inline run js in inline mode
   * @param useMemoryRouter use virtual router
   * @param defaultPage default page of virtual router
   * @param baseroute route prefix, default is ''
   * @param disablePatchRequest prevent rewrite request method of child app
   * @param fiber run js in fiber mode
   * @param esmodule support type='module' script
   */
  public mount ({
    container,
    inline,
    useMemoryRouter,
    defaultPage,
    baseroute,
    disablePatchRequest,
    fiber,
    esmodule,
    // hiddenRouter,
  }: MountParam): void {
    if (this.loadSourceLevel !== 2) {
      this.state = appStates.LOADING
      return
    }

    // TODO: test shadowDOM
    if (
      this.container instanceof HTMLDivElement &&
      this.container.hasAttribute('prerender')
    ) {
      // this.container is <div prerender='true'></div>
      cloneContainer(this.container as Element, container as Element, false)
      // set this.container of <micro-app></micro-app>
      this.container = container
      this.preRenderEvent?.forEach((cb) => {
        cb()
      })
      // reset preRender config
      this.preRender = this.preRenderEvent = undefined
      // attach router info to browser url
      router.attachToURL(this.name)
      return this.sandBox?.setPreRenderState(false)
    }
    this.container = container
    this.inline = inline
    this.esmodule = esmodule
    this.fiber = fiber
    // use in sandbox/effect
    this.useMemoryRouter = useMemoryRouter
    // this.hiddenRouter = hiddenRouter ?? this.hiddenRouter

    const dispatchBeforeMount = () => {
      dispatchLifecyclesEvent(
        this.container!,
        this.name,
        lifeCycles.BEFOREMOUNT,
      )
    }

    if (this.preRender) {
      (this.preRenderEvent ??= []).push(dispatchBeforeMount)
    } else {
      dispatchBeforeMount()
    }

    this.state = appStates.MOUNTING

    cloneContainer(this.source.html as Element, this.container as Element, !this.umdMode)

    this.sandBox?.start({
      umdMode: this.umdMode,
      baseroute,
      useMemoryRouter,
      defaultPage,
      disablePatchRequest,
    })

    let umdHookMountResult: any // result of mount function

    if (!this.umdMode) {
      let hasDispatchMountedEvent = false
      // if all js are executed, param isFinished will be true
      execScripts(this, (isFinished: boolean) => {
        if (!this.umdMode) {
          const { mount, unmount } = this.getUmdLibraryHooks()
          /**
           * umdHookUnmount can works in non UMD mode
           * register with window.unmount
           */
          this.umdHookUnmount = unmount as Func
          // if mount & unmount is function, the sub app is umd mode
          if (isFunction(mount) && isFunction(unmount)) {
            this.umdHookMount = mount as Func
            this.umdMode = true
            if (this.sandBox) this.sandBox.proxyWindow.__MICRO_APP_UMD_MODE__ = true
            // this.sandBox?.recordUmdSnapshot()
            try {
              umdHookMountResult = this.umdHookMount(microApp.getData(this.name, true))
            } catch (e) {
              logError('an error occurred in the mount function \n', this.name, e)
            }
          }
        }

        if (!hasDispatchMountedEvent && (isFinished === true || this.umdMode)) {
          hasDispatchMountedEvent = true
          const dispatchMounted = () => this.handleMounted(umdHookMountResult)
          if (this.preRender) {
            (this.preRenderEvent ??= []).push(dispatchMounted)
          } else {
            dispatchMounted()
          }
        }
      })
    } else {
      this.sandBox?.rebuildUmdSnapshot()
      try {
        umdHookMountResult = this.umdHookMount!()
      } catch (e) {
        logError('an error occurred in the mount function \n', this.name, e)
      }
      this.handleMounted(umdHookMountResult)
    }
  }

  /**
   * handle for promise umdHookMount
   * @param umdHookMountResult result of umdHookMount
   */
  private handleMounted (umdHookMountResult: any): void {
    if (isPromise(umdHookMountResult)) {
      umdHookMountResult
        .then(() => this.dispatchMountedEvent())
        .catch((e: Error) => this.onerror(e))
    } else {
      this.dispatchMountedEvent()
    }
  }

  /**
   * dispatch mounted event when app run finished
   */
  private dispatchMountedEvent (): void {
    if (appStates.UNMOUNT !== this.state) {
      this.state = appStates.MOUNTED
      // call window.onmount of child app
      callFnWithTryCatch(
        this.getGlobalEventListener(microGlobalEvent.ONMOUNT),
        this.name,
        `window.${microGlobalEvent.ONMOUNT}`,
        microApp.getData(this.name, true)
      )

      // dispatch event mounted to parent
      dispatchLifecyclesEvent(
        this.container!,
        this.name,
        lifeCycles.MOUNTED,
      )
    }
  }

  /**
   * unmount app
   * NOTE: Do not add any params on account of unmountApp
   * @param destroy completely destroy, delete cache resources
   * @param clearData clear data of dateCenter
   * @param keepRouteState keep route state when unmount, default is false
   * @param unmountcb callback of unmount
   */
  public unmount ({
    destroy,
    clearData,
    keepRouteState,
    unmountcb,
  }: UnmountParam): void {
    if (this.state === appStates.LOAD_FAILED) {
      destroy = true
    }

    this.state = appStates.UNMOUNT
    this.keepAliveState = null
    this.keepAliveContainer = null

    // result of unmount function
    let umdHookUnmountResult: any
    /**
     * send an unmount event to the micro app or call umd unmount hook
     * before the sandbox is cleared
     */
    if (isFunction(this.umdHookUnmount)) {
      try {
        umdHookUnmountResult = this.umdHookUnmount(microApp.getData(this.name, true))
      } catch (e) {
        logError('an error occurred in the unmount function \n', this.name, e)
      }
    }

    // call window.onunmount of child app
    callFnWithTryCatch(
      this.getGlobalEventListener(microGlobalEvent.ONUNMOUNT),
      this.name,
      `window.${microGlobalEvent.ONUNMOUNT}`,
    )

    // dispatch unmount event to micro app
    dispatchCustomEventToMicroApp('unmount', this.name)

    this.handleUnmounted(
      destroy,
      clearData,
      keepRouteState,
      umdHookUnmountResult,
      unmountcb
    )
  }

  /**
   * handle for promise umdHookUnmount
   * @param destroy completely destroy, delete cache resources
   * @param clearData clear data of dateCenter
   * @param keepRouteState keep route state when unmount, default is false
   * @param umdHookUnmountResult result of umdHookUnmount
   * @param unmountcb callback of unmount
   */
  private handleUnmounted (
    destroy: boolean,
    clearData: boolean,
    keepRouteState: boolean,
    umdHookUnmountResult: any,
    unmountcb?: CallableFunction,
  ): void {
    const unmountParam: UnmountParam = {
      destroy,
      clearData,
      keepRouteState,
      unmountcb,
    }
    if (isPromise(umdHookUnmountResult)) {
      umdHookUnmountResult
        .then(() => this.actionsForUnmount(unmountParam))
        .catch(() => this.actionsForUnmount(unmountParam))
    } else {
      this.actionsForUnmount(unmountParam)
    }
  }

  /**
   * actions for unmount app
   * @param destroy completely destroy, delete cache resources
   * @param clearData clear data of dateCenter
   * @param keepRouteState keep route state when unmount, default is false
   * @param unmountcb callback of unmount
   */
  private actionsForUnmount ({
    destroy,
    clearData,
    keepRouteState,
    unmountcb
  }: UnmountParam): void {
    if (destroy) {
      this.actionsForCompletelyDestroy()
    } else if (this.umdMode && (this.container as Element).childElementCount) {
      cloneContainer(this.container as Element, this.source.html as Element, false)
    }

    if (this.umdMode) {
      this.sandBox?.recordUmdSnapshot()
    }

    if (clearData || destroy) {
      microApp.clearData(this.name)
    }

    /**
     * this.container maybe contains micro-app element, stop sandbox should exec after cloneContainer
     * NOTE:
     * 1. if destroy is true, clear route state
     * 2. umd mode and keep-alive will not clear EventSource
     */
    this.sandBox?.stop({
      umdMode: this.umdMode,
      keepRouteState: keepRouteState && !destroy,
      clearEventSource: !this.umdMode || destroy,
      clearData: clearData || destroy,
    })
    if (!getActiveApps().length) {
      releasePatchSetAttribute()
    }

    // dispatch unmount event to base app
    dispatchLifecyclesEvent(
      this.container!,
      this.name,
      lifeCycles.UNMOUNT,
    )

    this.container!.innerHTML = ''
    this.container = null
    this.preRenderEvent = undefined

    unmountcb && unmountcb()
  }

  // actions for completely destroy
  public actionsForCompletelyDestroy (): void {
    if (!this.useSandbox && this.umdMode) {
      delete window[this.libraryName as any]
    }
    sourceCenter.script.deleteInlineInfo(this.source.scripts)
    appInstanceMap.delete(this.name)
  }

  // hidden app when disconnectedCallback called with keep-alive
  public hiddenKeepAliveApp (callback?: CallableFunction): void {
    const oldContainer = this.container

    cloneContainer(
      this.container as Element,
      this.keepAliveContainer ? this.keepAliveContainer : (this.keepAliveContainer = document.createElement('div')),
      false,
    )

    this.container = this.keepAliveContainer

    this.keepAliveState = keepAliveStates.KEEP_ALIVE_HIDDEN

    // event should dispatch before clone node
    // dispatch afterHidden event to micro-app
    dispatchCustomEventToMicroApp('appstate-change', this.name, {
      appState: 'afterhidden',
    })

    // dispatch afterHidden event to base app
    dispatchLifecyclesEvent(
      oldContainer!,
      this.name,
      lifeCycles.AFTERHIDDEN,
    )

    // called after lifeCyclesEvent
    this.sandBox?.removeRouteInfoForKeepAliveApp()

    callback && callback()
  }

  // show app when connectedCallback called with keep-alive
  public showKeepAliveApp (container: HTMLElement | ShadowRoot): void {
    // dispatch beforeShow event to micro-app
    dispatchCustomEventToMicroApp('appstate-change', this.name, {
      appState: 'beforeshow',
    })

    // dispatch beforeShow event to base app
    dispatchLifecyclesEvent(
      container,
      this.name,
      lifeCycles.BEFORESHOW,
    )

    cloneContainer(
      this.container as Element,
      container as Element,
      false,
    )

    this.container = container

    this.keepAliveState = keepAliveStates.KEEP_ALIVE_SHOW

    // called before lifeCyclesEvent
    this.sandBox?.setRouteInfoForKeepAliveApp()

    // dispatch afterShow event to micro-app
    dispatchCustomEventToMicroApp('appstate-change', this.name, {
      appState: 'aftershow',
    })

    // dispatch afterShow event to base app
    dispatchLifecyclesEvent(
      this.container,
      this.name,
      lifeCycles.AFTERSHOW,
    )
  }

  /**
   * app rendering error
   * @param e Error
   */
  public onerror (e: Error): void {
    dispatchLifecyclesEvent(
      this.container!,
      this.name,
      lifeCycles.ERROR,
      e,
    )
  }

  // get app state
  public getAppState (): string {
    return this.state
  }

  // get keep-alive state
  public getKeepAliveState (): string | null {
    return this.keepAliveState
  }

  // get umd library, if it not exist, return empty object
  private getUmdLibraryHooks (): Record<string, unknown> {
    // after execScripts, the app maybe unmounted
    if (appStates.UNMOUNT !== this.state) {
      const global = (this.sandBox?.proxyWindow ?? globalEnv.rawWindow) as any
      this.libraryName = getRootContainer(this.container!).getAttribute('library') || `micro-app-${this.name}`

      if (isObject(global[this.libraryName])) {
        return global[this.libraryName]
      }

      return {
        mount: this.sandBox?.proxyWindow.mount,
        unmount: this.sandBox?.proxyWindow.unmount,
      }
    }

    return {}
  }

  private getGlobalEventListener (eventName: string): Func | null {
    // @ts-ignore
    const listener = this.sandBox?.proxyWindow[eventName]
    return isFunction(listener) ? listener : null
  }
}
