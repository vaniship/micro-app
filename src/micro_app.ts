import type {
  OptionsType,
  MicroAppBaseType,
  AppInterface,
  Router,
  AppName,
} from '@micro-app/types'
import { defineElement } from './micro_app_element'
import preFetch, { getGlobalAssets } from './prefetch'
import {
  logError,
  logWarn,
  isBrowser,
  isPlainObject,
  formatAppName,
  getRootContainer,
  isString,
  pureCreateElement,
} from './libs/utils'
import { EventCenterForBaseApp } from './interact'
import { initGlobalEnv } from './libs/global_env'
import { appInstanceMap } from './create_app'
import { appStates, keepAliveStates, lifeCycles, MicroAppConfig } from './constants'
import { router } from './sandbox'

/**
 * if app not prefetch & not unmount, then app is active
 * @param excludeHiddenApp exclude hidden keep-alive app, default is false
 * @returns active apps
 */
export function getActiveApps (excludeHiddenApp = false): AppName[] {
  const activeApps: AppName[] = []
  appInstanceMap.forEach((app: AppInterface, appName: AppName) => {
    if (
      appStates.UNMOUNT !== app.getAppState() &&
      !app.isPrefetch &&
      (
        !excludeHiddenApp ||
        keepAliveStates.KEEP_ALIVE_HIDDEN !== app.getKeepAliveState()
      )
    ) {
      activeApps.push(appName)
    }
  })

  return activeApps
}

// get all registered apps
export function getAllApps (): string[] {
  return Array.from(appInstanceMap.keys())
}

type unmountAppOptions = {
  destroy?: boolean // destroy app, default is false
  clearAliveState?: boolean // clear keep-alive app state, default is false
}

/**
 * unmount app by appName
 * @param appName
 * @param options unmountAppOptions
 * @returns Promise<void>
 */
export function unmountApp (appName: string, options?: unmountAppOptions): Promise<boolean> {
  const app = appInstanceMap.get(formatAppName(appName))
  return new Promise((resolve) => { // eslint-disable-line
    if (app) {
      if (app.getAppState() === appStates.UNMOUNT || app.isPrefetch) {
        if (options?.destroy) {
          app.actionsForCompletelyDestroy()
        }
        resolve(true)
      } else if (app.getKeepAliveState() === keepAliveStates.KEEP_ALIVE_HIDDEN) {
        if (options?.destroy) {
          app.unmount(true, resolve.bind(null, true))
        } else if (options?.clearAliveState) {
          app.unmount(false, resolve.bind(null, true))
        } else {
          resolve(true)
        }
      } else {
        const container = getRootContainer(app.container!)
        const unmountHandler = () => {
          container.removeEventListener(lifeCycles.UNMOUNT, unmountHandler)
          container.removeEventListener(lifeCycles.AFTERHIDDEN, afterhiddenHandler)
          resolve(true)
        }

        const afterhiddenHandler = () => {
          container.removeEventListener(lifeCycles.UNMOUNT, unmountHandler)
          container.removeEventListener(lifeCycles.AFTERHIDDEN, afterhiddenHandler)
          resolve(true)
        }

        container.addEventListener(lifeCycles.UNMOUNT, unmountHandler)
        container.addEventListener(lifeCycles.AFTERHIDDEN, afterhiddenHandler)

        if (options?.destroy) {
          let destroyAttrValue, destoryAttrValue
          container.hasAttribute('destroy') && (destroyAttrValue = container.getAttribute('destroy'))
          container.hasAttribute('destory') && (destoryAttrValue = container.getAttribute('destory'))

          container.setAttribute('destroy', 'true')
          container.parentNode!.removeChild(container)

          container.removeAttribute('destroy')

          isString(destroyAttrValue) && container.setAttribute('destroy', destroyAttrValue)
          isString(destoryAttrValue) && container.setAttribute('destory', destoryAttrValue)
        } else if (options?.clearAliveState && container.hasAttribute('keep-alive')) {
          const keepAliveAttrValue = container.getAttribute('keep-alive')!

          container.removeAttribute('keep-alive')
          container.parentNode!.removeChild(container)

          container.setAttribute('keep-alive', keepAliveAttrValue)
        } else {
          container.parentNode!.removeChild(container)
        }
      }
    } else {
      logWarn(`app ${appName} does not exist`)
      resolve(false)
    }
  })
}

// unmount all apps in turn
export function unmountAllApps (options?: unmountAppOptions): Promise<boolean> {
  return Array.from(appInstanceMap.keys()).reduce((pre, next) => pre.then(() => unmountApp(next, options)), Promise.resolve(true))
}

/**
 * Re render app from the command line
 * microApp.reload(destroy)
 * @param appName app.name
 * @param destroy unmount app with destroy mode
 * @returns Promise<boolean>
 */
export function reload (appName: string, destroy?: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const app = appInstanceMap.get(formatAppName(appName))
    if (app) {
      const rootContainer = app.container && getRootContainer(app.container)
      if (rootContainer) {
        resolve(rootContainer.reload(destroy))
      } else {
        logWarn(`app ${appName} is not rendered, cannot use reload`)
        resolve(false)
      }
    } else {
      logWarn(`app ${appName} does not exist`)
      resolve(false)
    }
  })
}

interface RenderAppOptions {
  name: string
  url: string,
  container: string | Element
  [key: string]: unknown
  [Symbol.iterator]: () => any
}

export function renderApp (options: RenderAppOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isPlainObject<RenderAppOptions>(options)) return logWarn('Options must be an object')
    const container: Element | null = options.container instanceof Element ? options.container : isString(options.container) ? document.getElementById(options.container) : null
    if (!container) return logWarn('Target container is not a DOM element.')

    const microAppElement = pureCreateElement<any>(microApp.tagName)

    microAppElement.setAttribute('name', options.name)
    microAppElement.setAttribute('url', options.url)

    for (const key of options) {
      if (key in MicroAppConfig) {
        microAppElement.setAttribute(key, options[key])
      }
    }

    const handleMount = () => {
      microAppElement.removeEventListener(lifeCycles.MOUNTED, handleMount)
      microAppElement.removeEventListener(lifeCycles.ERROR, handleError)
      resolve(true)
    }
    const handleError = () => {
      microAppElement.removeEventListener(lifeCycles.MOUNTED, handleMount)
      microAppElement.removeEventListener(lifeCycles.ERROR, handleError)
      resolve(false)
    }
    microAppElement.addEventListener(lifeCycles.MOUNTED, handleMount)
    microAppElement.addEventListener(lifeCycles.ERROR, handleError)

    container.appendChild(microAppElement)
  })
}

export class MicroApp extends EventCenterForBaseApp implements MicroAppBaseType {
  tagName = 'micro-app'
  options: OptionsType = {}
  router: Router = router
  preFetch = preFetch
  unmountApp = unmountApp
  unmountAllApps = unmountAllApps
  getActiveApps = getActiveApps
  getAllApps = getAllApps
  reload = reload
  start (options?: OptionsType): void {
    if (!isBrowser || !window.customElements) {
      return logError('micro-app is not supported in this environment')
    }

    if (options?.tagName) {
      if (/^micro-app(-\S+)?/.test(options.tagName)) {
        this.tagName = options.tagName
      } else {
        return logError(`${options.tagName} is invalid tagName`)
      }
    }

    if (window.customElements.get(this.tagName)) {
      return logWarn(`element ${this.tagName} is already defined`)
    }

    initGlobalEnv()

    if (isPlainObject<OptionsType>(options)) {
      this.options = options
      options['disable-scopecss'] = options['disable-scopecss'] ?? options.disableScopecss
      options['disable-sandbox'] = options['disable-sandbox'] ?? options.disableSandbox

      // load app assets when browser is idle
      options.preFetchApps && preFetch(options.preFetchApps)

      // load global assets when browser is idle
      options.globalAssets && getGlobalAssets(options.globalAssets)

      if (isPlainObject(options.plugins)) {
        const modules = options.plugins.modules
        if (isPlainObject(modules)) {
          for (const appName in modules) {
            const formattedAppName = formatAppName(appName)
            if (formattedAppName && appName !== formattedAppName) {
              modules[formattedAppName] = modules[appName]
              delete modules[appName]
            }
          }
        }
      }
    }

    // define customElement after init
    defineElement(this.tagName)
  }
}

const microApp = new MicroApp()

export default microApp
