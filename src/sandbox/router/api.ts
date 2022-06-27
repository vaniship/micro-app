import type {
  Func,
  Router,
  RouterTarget,
  navigationMethod,
  MicroLocation,
  RouterGuard,
  GuardLocation,
  AccurateGuard,
} from '@micro-app/types'
import {
  encodeMicroPath,
  decodeMicroPath,
  setMicroPathToURL, setMicroState, getMicroPathFromURL
} from './core'
import {
  logError,
  formatAppName,
  createURL,
  isFunction,
  isPlainObject,
  useSetRecord,
  useMapRecord,
  requestIdleCallback,
  isString,
  noopFalse,
} from '../../libs/utils'
import { appInstanceMap } from '../../create_app'
import { getActiveApps } from '../../micro_app'
import globalEnv from '../../libs/global_env'
import { navigateWithNativeEvent } from './history'

export interface RouterApi {
  router: Router,
  executeNavigationGuard: (appName: string, to: GuardLocation, from: GuardLocation) => void
  clearCurrentWhenUnmount: (appName: string) => void
}

function createRouterApi (): RouterApi {
  /**
   * common handler for router.push/router.replace method
   * @param appName app name
   * @param methodName replaceState/pushState
   * @param targetLocation target location
   * @param state to.state
   */
  function navigateWithRawHistory (
    appName: string,
    methodName: string,
    targetLocation: MicroLocation,
    state: unknown,
  ): void {
    navigateWithNativeEvent(
      methodName,
      setMicroPathToURL(appName, targetLocation),
      setMicroState(
        appName,
        globalEnv.rawWindow.history.state,
        state ?? null,
      ),
    )
  }
  /**
   * create method of router.push/replace
   * NOTE:
   * 1. The same fullPath will be blocked
   * 2. name & path is required
   * 3. path is fullPath except for the domain (the domain can be taken, but not valid)
   * @param replace use router.replace?
   */
  function createNavigationMethod (replace: boolean): navigationMethod {
    return function (to: RouterTarget): void {
      const appName = formatAppName(to.name)
      // console.log(3333333, appInstanceMap.get(appName))
      if (appName && isString(to.path)) {
        const app = appInstanceMap.get(appName)
        if (app && !app.sandBox) return logError(`navigation failed, sandBox of app ${appName} is closed`)
        // active apps, include hidden keep-alive app
        if (getActiveApps().includes(appName)) {
          const microLocation = app!.sandBox!.proxyWindow.location as MicroLocation
          const targetLocation = createURL(to.path, microLocation.href)
          // Only get path data, even if the origin is different from microApp
          const targetFullPath = targetLocation.pathname + targetLocation.search + targetLocation.hash
          if (microLocation.fullPath !== targetFullPath || getMicroPathFromURL(appName) !== targetFullPath) {
            const methodName = (replace && to.replace !== false) || to.replace === true ? 'replaceState' : 'pushState'
            navigateWithRawHistory(appName, methodName, targetLocation, to.state)
          }
        } else {
          /**
           * app not exit or unmounted, update browser URL with replaceState
           * use base app location.origin as baseURL
           */
          const rawLocation = globalEnv.rawWindow.location
          const targetLocation = createURL(to.path, rawLocation.origin)
          const targetFullPath = targetLocation.pathname + targetLocation.search + targetLocation.hash
          if (getMicroPathFromURL(appName) !== targetFullPath) {
            navigateWithRawHistory(
              appName,
              to.replace === false ? 'pushState' : 'replaceState',
              targetLocation,
              to.state,
            )
          }
        }
      } else {
        logError(`navigation failed, name & path are required when use router.${replace ? 'replace' : 'push'}`)
      }
    }
  }

  // create method of router.go/back/forward
  function createRawHistoryMethod (methodName: string): Func {
    return function (...rests: unknown[]): void {
      return globalEnv.rawWindow.history[methodName](...rests)
    }
  }

  const beforeGuards = useSetRecord<RouterGuard>()
  const afterGuards = useSetRecord<RouterGuard>()

  /**
   * run all of beforeEach/afterEach guards
   * @param appName app name
   * @param to target location
   * @param from old location
   * @param guards guards list
   */
  function runGuards (
    appName: string,
    to: GuardLocation,
    from: GuardLocation,
    guards: Set<RouterGuard>,
  ) {
    for (const guard of guards) {
      if (isFunction(guard)) {
        guard(appName, to, from)
      } else if (isPlainObject(guard) && isFunction((guard as AccurateGuard)[appName])) {
        guard[appName](to, from)
      }
    }
  }

  /**
   * global hook for router
   * update router information base on microLocation
   * @param appName app name
   * @param microLocation location of microApp
   */
  function executeNavigationGuard (
    appName: string,
    to: GuardLocation,
    from: GuardLocation,
  ): void {
    router.current.set(appName, to)

    runGuards(appName, to, from, beforeGuards.list())

    requestIdleCallback(() => {
      runGuards(appName, to, from, afterGuards.list())
    })
  }

  function clearCurrentWhenUnmount (appName: string): void {
    router.current.delete(appName)
  }

  // defaultPage data
  const defaultPageRecord = useMapRecord<string>()

  /**
   * defaultPage只在子应用初始化时生效，且优先级比浏览器上的子应用路由地址低
   * @param appName app name
   * @param path page path
   */
  function setDefaultPage (appName: string, path: string): () => boolean {
    appName = formatAppName(appName)
    if (!appName) return noopFalse

    return defaultPageRecord.add(appName, path)
  }

  function removeDefaultPage (appName: string): boolean {
    appName = formatAppName(appName)
    if (!appName) return false

    return defaultPageRecord.delete(appName)
  }

  // Router API for developer
  const router: Router = {
    current: new Map<string, MicroLocation>(),
    encode: encodeMicroPath,
    decode: decodeMicroPath,
    push: createNavigationMethod(false),
    replace: createNavigationMethod(true),
    go: createRawHistoryMethod('go'),
    back: createRawHistoryMethod('back'),
    forward: createRawHistoryMethod('forward'),
    beforeEach: beforeGuards.add,
    afterEach: afterGuards.add,
    // attachToURL: 将指定的子应用路由信息添加到浏览器地址上
    // attachAllToURL: 将所有正在运行的子应用路由信息添加到浏览器地址上
    setDefaultPage,
    removeDefaultPage,
    getDefaultPage: defaultPageRecord.get,
  }

  return {
    router,
    executeNavigationGuard,
    clearCurrentWhenUnmount,
  }
}

export const {
  router,
  executeNavigationGuard,
  clearCurrentWhenUnmount,
} = createRouterApi()
