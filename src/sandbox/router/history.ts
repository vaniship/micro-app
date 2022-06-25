import type {
  MicroState,
  MicroLocation,
  MicroHistory,
  HistoryProxyValue,
} from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import { isString, logError, createURL, isPlainObject, isURL, assign } from '../../libs/utils'
import { updateMicroLocation } from './location'
import { setMicroPathToURL, setMicroState, getMicroState } from './core'
import { dispatchNativePopStateEvent } from './event'

// history of micro app
export function createMicroHistory (appName: string, microLocation: MicroLocation): MicroHistory {
  const rawHistory = globalEnv.rawWindow.history
  function getMicroHistoryMethod (methodName: PropertyKey): CallableFunction {
    return (...rests: unknown[]) => {
      // console.log(444444444, rests[0], rests[1], rests[2], methodName)
      let targetPath = null
      // 对pushState/replaceState的state和path进行格式化，这里最关键的一步！！
      if (
        (methodName === 'pushState' || methodName === 'replaceState') &&
        (isString(rests[2]) || isURL(rests[2]))
      ) {
        try {
          const targetLocation = createURL(rests[2], microLocation.href)
          if (targetLocation.origin === microLocation.origin) {
            targetPath = targetLocation.pathname + targetLocation.search + targetLocation.hash
            const setMicroPathResult = setMicroPathToURL(appName, targetLocation)
            rests = [
              setMicroState(appName, rawHistory.state, rests[0]),
              rests[1],
              setMicroPathResult.fullPath,
            ]
          }
        } catch (e) {
          logError(e, appName)
        }
      }

      rawHistory[methodName].apply(rawHistory, rests)

      if (targetPath && targetPath !== microLocation.fullPath) {
        /**
         * microRoute query may be lost from browserURL after the main app handles the popstate event
         * so we manually trigger the microLocation update
         */
        updateMicroLocation(appName, targetPath, microLocation)
        dispatchNativePopStateEvent()
      }

      // console.log(5555555, microLocation, base)
    }
  }

  return new Proxy(rawHistory, {
    get (target: History, key: PropertyKey): HistoryProxyValue {
      if (key === 'state') {
        return getMicroState(appName, rawHistory.state)
      } else if (typeof Reflect.get(target, key) === 'function') {
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
 * @param state history.state
 */
export function nativeHistoryNavigate (methodName: string, fullPath: string, state: unknown = null): void {
  globalEnv.rawWindow.history[methodName](state, '', fullPath)
}

/**
 * navigate to new path, and dispatch pure popstate event to browser
 * used to trigger base app router update
 * @param methodName pushState/replaceState
 * @param fullPath full path
 * @param state history.state
 */
export function navigateWithPopStateEvent (methodName: string, fullPath: string, state: unknown = null): void {
  nativeHistoryNavigate(methodName, fullPath, state)
  dispatchNativePopStateEvent()
}

/**
 * update browser url base on child location
 * @param state history.state
 * @param fullPath full path
 */
export function updateBrowserURL (state: MicroState, fullPath: string): void {
  navigateWithPopStateEvent('replaceState', fullPath, state)
}

/**
 * When the old and new path are the same, keep the microAppState in history.state
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
