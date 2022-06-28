import type {
  MicroState,
  MicroLocation,
  MicroHistory,
  HistoryProxyValue,
  HandleMicroPathResult,
} from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import { isString, createURL, isPlainObject, isURL, assign, isFunction } from '../../libs/utils'
import { setMicroPathToURL, setMicroState, getMicroState } from './core'
import { dispatchNativeEvent } from './event'
import { updateMicroLocation } from './location'

/**
 * create proxyHistory for microApp
 * MDN https://developer.mozilla.org/en-US/docs/Web/API/History
 * @param appName app name
 * @param microLocation microApp location
 */
export function createMicroHistory (appName: string, microLocation: MicroLocation): MicroHistory {
  const rawHistory = globalEnv.rawWindow.history
  function getMicroHistoryMethod (methodName: PropertyKey): CallableFunction {
    return function (...rests: unknown[]): void {
      if (
        (methodName === 'pushState' || methodName === 'replaceState') &&
        (isString(rests[2]) || isURL(rests[2]))
      ) {
        const targetLocation = createURL(rests[2], microLocation.href)
        if (targetLocation.origin === microLocation.origin) {
          navigateWithNativeEvent(
            methodName,
            setMicroPathToURL(appName, targetLocation),
            true,
            setMicroState(appName, rawHistory.state, rests[0]),
            rests[1] as string,
          )
          const targetFullPath = targetLocation.pathname + targetLocation.search + targetLocation.hash
          if (targetFullPath !== microLocation.fullPath) {
            updateMicroLocation(appName, targetFullPath, microLocation)
          }
        } else {
          rawHistory[methodName].apply(rawHistory, rests)
        }
      } else {
        rawHistory[methodName].apply(rawHistory, rests)
      }
    }
  }

  return new Proxy(rawHistory, {
    get (target: History, key: PropertyKey): HistoryProxyValue {
      if (key === 'state') {
        return getMicroState(appName, rawHistory.state)
      } else if (isFunction(Reflect.get(target, key))) {
        return getMicroHistoryMethod(key)
      }
      return Reflect.get(target, key)
    },
    set (target: History, key: PropertyKey, value: unknown): boolean {
      return Reflect.set(target, key, value)
    }
  })
}

/**
 * navigate to new path base on native method of history
 * @param methodName pushState/replaceState
 * @param fullPath full path
 * @param state history.state, default is null
 * @param title history.title, default is ''
 */
export function nativeHistoryNavigate (
  methodName: string,
  fullPath: string,
  state: unknown = null,
  title = '',
): void {
  globalEnv.rawWindow.history[methodName](state, title, fullPath)
}

/**
 * Navigate to new path, and dispatch native popStateEvent/hashChangeEvent to browser
 * Use scenes:
 * 1. mount/unmount through updateBrowserURL with limited popstateEvent
 * 2. proxyHistory.pushState/replaceState with limited popstateEvent
 * 3. api microApp.router.push/replace
 * 4. proxyLocation.hash = xxx
 * @param methodName pushState/replaceState
 * @param result result of add/remove microApp path on browser url
 * @param onlyForBrowser only dispatch event to browser
 * @param state history.state, not required
 * @param title history.title, not required
 */
export function navigateWithNativeEvent (
  methodName: string,
  result: HandleMicroPathResult,
  onlyForBrowser: boolean,
  state?: unknown,
  title?: string,
): void {
  const rawLocation = globalEnv.rawWindow.location
  const oldFullPath = rawLocation.pathname + rawLocation.search + rawLocation.hash
  const oldHref = result.isAttach2Hash && oldFullPath !== result.fullPath ? rawLocation.href : null
  // navigate with native history method
  nativeHistoryNavigate(methodName, result.fullPath, state, title)
  if (oldFullPath !== result.fullPath) dispatchNativeEvent(onlyForBrowser, oldHref)
}

/**
 * update browser url when mount/unmount/hidden/show
 * @param result result of add/remove microApp path on browser url
 * @param state history.state
 */
export function updateBrowserURL (
  result: HandleMicroPathResult,
  state: MicroState,
): void {
  navigateWithNativeEvent('replaceState', result, true, state)
}

/**
 * When path is same, keep the microAppState in history.state
 * Fix bug of missing microAppState in next.js & angular
 * @param method history.pushState/replaceState
 */
function patchHistoryState (method: History['pushState' | 'replaceState']): CallableFunction {
  const rawWindow = globalEnv.rawWindow
  return function (...rests: [data: any, unused: string, url?: string]): void {
    if (
      rawWindow.history.state?.microAppState &&
      (!isPlainObject(rests[0]) || !rests[0].microAppState) &&
      (isString(rests[2]) || isURL(rests[2]))
    ) {
      const currentHref = rawWindow.location.href
      const targetLocation = createURL(rests[2], currentHref)
      if (targetLocation.href === currentHref) {
        rests[0] = assign({}, rests[0], {
          microAppState: rawWindow.history.state.microAppState,
        })
      }
    }
    method.apply(rawWindow.history, rests)
  }
}

let isReWriteHistoryState = false
/**
 * rewrite history.pushState/replaceState
 * used to fix the problem that the microAppState maybe missing when mainApp navigate to same path
 * e.g: when nextjs, angular receive popstate event, they will use history.replaceState to update browser url with a new state object
 */
export function rewriteHistoryState (): void {
  // filter nest app
  if (!isReWriteHistoryState && !window.__MICRO_APP_ENVIRONMENT__) {
    isReWriteHistoryState = true
    const rawWindow = globalEnv.rawWindow
    rawWindow.history.pushState = patchHistoryState(
      rawWindow.history.pushState,
    )
    rawWindow.history.replaceState = patchHistoryState(
      rawWindow.history.replaceState,
    )
  }
}
