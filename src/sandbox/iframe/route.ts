import type {
  MicroLocation,
  HandleMicroPathResult,
  microAppWindowType,
  PopStateListener,
  MicroPopStateEvent,
} from '@micro-app/types'
import {
  getMicroPathFromURL,
  setMicroPathToURL,
  removeMicroPathFromURL,
  removeMicroState,
  setMicroState,
} from '../router/core'
import {
  autoTriggerNavigationGuard,
  createGuardLocation,
  updateMicroLocation,
} from '../router/location'
import {
  executeNavigationGuard,
  clearRouterWhenUnmount,
} from '../router/api'
import {
  nativeHistoryNavigate
} from '../router/history'
import {
  isString,
  isURL,
  createURL,
  isFunction,
} from '../../libs/utils'
import globalEnv from '../../libs/global_env'
import { appInstanceMap } from '../../create_app'
import { getActiveApps } from '../../micro_app'

export function patchIframeRoute (appName: string, microAppWindow: microAppWindowType): void {
  const microLocation = microAppWindow.location
  const microHistory = microAppWindow.history
  const microPushState = microHistory.pushState
  const microReplaceState = microHistory.replaceState
  function getMicroHistoryMethod (methodName: string): CallableFunction {
    return function (...rests: any[]): void {
      const method = methodName === 'pushState' ? microPushState : microReplaceState
      // TODO: BUG isURL不适用于iframe，要添加作用域
      if (isString(rests[2]) || isURL(rests[2])) {
        const targetLocation = createURL(rests[2], microLocation.href)
        rests[2] = microLocation.protocol + '//' + microLocation.host + targetLocation.pathname + targetLocation.search + targetLocation.hash
        method.apply(microHistory, rests)
        nativeHistoryNavigate(
          appName,
          'replaceState',
          setMicroPathToURL(appName, targetLocation).fullPath,
          null,
          '',
        )
        microAppWindow.__MICRO_APP_SANDBOX__.updateIframeBase()
      } else {
        method.apply(microHistory, rests)
      }
    }
  }

  microHistory.pushState = getMicroHistoryMethod('pushState')
  microHistory.replaceState = getMicroHistoryMethod('replaceState')

  patchRouteEvent(appName, microAppWindow)
}

function patchRouteEvent (appName: string, microAppWindow: microAppWindowType): void {
  function handleRouteChangeEvent (): void {
    nativeHistoryNavigate(
      appName,
      'replaceState',
      setMicroPathToURL(appName, microAppWindow.location).fullPath,
      null,
      '',
    )
  }

  /**
   * 1、正常的跳转有pushState/replaceState拦截和处理，但是对于直接通过location跳转的情况则无法拦截，但是可以通过监听popstate和hashchange再做一次拦截，来处理上面无法拦截的场景
   * 2、对于href、pathname、assign、replace等跳转需要刷新浏览器的场景，还需要特殊处理，只能通过proxy代理处理，但是对于esm的环境暂时还是无解的。
   *    总之location上的信息修改很容易导致浏览器刷新，放在iframe环境下会导致iframe刷新但是如何同步这些信息到浏览器？
   *    这些跳转不会触发任何事件信息，直接刷新浏览器，我们也应该这样，类似于虚拟路有的做法
   */
  microAppWindow.addEventListener('popstate', handleRouteChangeEvent)
  microAppWindow.addEventListener('hashchange', handleRouteChangeEvent)
}

export function initMicroLocation (
  appName: string,
  microAppWindow: microAppWindowType,
  childFullPath: string,
): void {
  updateMicroLocation(
    appName,
    childFullPath,
    microAppWindow.location,
    'prevent'
  )
}

export function initRouteStateWithURL (
  appName: string,
  microLocation: MicroLocation,
  defaultPage: string,
): void {
  const microPath = getMicroPathFromURL(appName)
  if (microPath) {
    updateMicroLocation(appName, microPath, microLocation, 'auto')
  } else {
    updateBrowserURLWithLocation(appName, microLocation, defaultPage)
  }
}

export function updateBrowserURLWithLocation (
  appName: string,
  microLocation: MicroLocation,
  defaultPage: string,
): void {
  // update microLocation with defaultPage
  if (defaultPage) updateMicroLocation(appName, defaultPage, microLocation, 'prevent')
  // attach microApp route info to browser URL
  attachRouteToBrowserURL(appName, setMicroPathToURL(appName, microLocation))
  // trigger guards after change browser URL
  autoTriggerNavigationGuard(appName, microLocation)
}

/**
 * In any case, microPath & microState will be removed from browser, but location will be initialized only when keep-router-state is false
 * @param appName app name
 * @param url app url
 * @param microLocation location of microApp
 * @param keepRouteState keep-router-state is only used to control whether to clear the location of microApp
 */
export function clearRouteStateFromURL (
  appName: string,
  url: string,
  microLocation: MicroLocation,
  keepRouteState: boolean,
): void {
  if (!keepRouteState) {
    const { pathname, search, hash } = createURL(url)
    updateMicroLocation(appName, pathname + search + hash, microLocation, 'prevent')
  }
  removeStateAndPathFromBrowser(appName)
  clearRouterWhenUnmount(appName)
}

/**
 * remove microState from history.state and remove microPath from browserURL
 * called on sandbox.stop or hidden of keep-alive app
 */
export function removeStateAndPathFromBrowser (appName: string): void {
  attachRouteToBrowserURL(appName, removeMicroPathFromURL(appName))
}

export function attachRouteToBrowserURL (appName: string, result: HandleMicroPathResult): void {
  nativeHistoryNavigate(
    appName,
    'replaceState',
    result.fullPath,
    null,
    '',
  )
}

// export function updateMicroLocation (
//   appName: string,
//   path: string,
//   microLocation: MicroLocation,
//   microHistory: History,
//   type?: string,
// ): void {
//   // record old values of microLocation to `from`
//   const from = createGuardLocation(appName, microLocation)
//   microHistory.replaceState(null, '', path)
//   // update latest values of microLocation to `to`
//   const to = createGuardLocation(appName, microLocation)

//   // The hook called only when fullPath changed
//   if (type === 'auto' || (from.fullPath !== to.fullPath && type !== 'prevent')) {
//     executeNavigationGuard(appName, to, from)
//   }
// }

/**
 * dispatch PopStateEvent & HashChangeEvent to child app
 * each child app will listen for popstate event when sandbox start
 * and release it when sandbox stop
 * @param appName app name
 * @returns release callback
 */
export function addHistoryListener (appName: string): CallableFunction {
  const rawWindow = globalEnv.rawWindow
  // handle popstate event and distribute to child app
  const popStateHandler: PopStateListener = (): void => {
    /**
     * 1. unmount app & hidden keep-alive app will not receive popstate event
     * 2. filter out onlyForBrowser
     */
    if (getActiveApps({ excludeHiddenApp: true, excludePreRender: true }).includes(appName)) {
      const microPath = getMicroPathFromURL(appName)
      const app = appInstanceMap.get(appName)!
      const proxyWindow = app.sandBox!.proxyWindow
      const microAppWindow = app.sandBox!.microAppWindow
      let isHashChange = false
      // for hashChangeEvent
      const oldHref = proxyWindow.location.href // equal to proxyLocation.href
      // Do not attach micro state to url when microPath is empty
      if (microPath) {
        const oldHash = proxyWindow.location.hash // equal to proxyLocation.hash
        updateMicroLocation(
          appName,
          microPath,
          microAppWindow.location,
        )
        isHashChange = proxyWindow.location.hash !== oldHash
      }

      // dispatch formatted popStateEvent to child
      // TODO: state 设置为null，对于子应用跳转有影响吗，比如：vue3、angular14
      const newPopStateEvent = new PopStateEvent('popstate', { state: null })
      microAppWindow.dispatchEvent(newPopStateEvent)
      // call function window.onpopstate if it exists
      isFunction(proxyWindow.onpopstate) && proxyWindow.onpopstate(newPopStateEvent)

      // dispatch formatted hashChangeEvent to child when hash change
      if (isHashChange) {
        const newHashChangeEvent = new HashChangeEvent(
          'hashchange',
          {
            newURL: proxyWindow.location.href,
            oldURL: oldHref,
          }
        )

        microAppWindow.dispatchEvent(newHashChangeEvent)

        // call function window.onhashchange if it exists
        isFunction(proxyWindow.onhashchange) && proxyWindow.onhashchange(newHashChangeEvent)
      }
    }
  }

  rawWindow.addEventListener('popstate', popStateHandler)

  return () => {
    rawWindow.removeEventListener('popstate', popStateHandler)
  }
}
