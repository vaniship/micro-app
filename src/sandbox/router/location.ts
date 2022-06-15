/* eslint-disable no-void */
import type { MicroLocation, GuardLocation, ShadowLocation } from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import { assign as oAssign, rawDefineProperties, createURL } from '../../libs/utils'
import { setMicroPathToURL } from './core'
import { dispatchPurePopStateEvent } from './event'
import { executeNavigationGuard } from './api'

/**
 * Create location for micro app
 * Each microApp has only one location object, it is a reference type
 * @param appName app name
 * @param url app url
 */
export function createMicroLocation (appName: string, url: string): MicroLocation {
  const rawWindow = globalEnv.rawWindow
  const rawLocation = rawWindow.location
  // microLocation is the location of child app, it is globally unique
  const microLocation = createURL(url)
  // shadowLocation is the current location information (href, pathname, search, hash)
  const shadowLocation: ShadowLocation = {
    href: microLocation.href,
    pathname: microLocation.pathname,
    search: microLocation.search,
    hash: microLocation.hash,
  }

  /**
   * Common handler for href, assign, replace
   * It is mainly used to deal with special scenes about hash
   * @param value target path
   * @param methodName pushState/replaceState
   * @returns origin value or formatted value
   */
  const commonHandle = (value: string | URL, methodName: string): string | URL | undefined => {
    const targetLocation = createURL(value, url)
    if (targetLocation.origin === microLocation.origin) {
      const setMicroPathResult = setMicroPathToURL(appName, targetLocation)
      /**
       * change hash with location.href = xxx will not trigger the browser reload
       * so we use pushState & reload to imitate href behavior
       * NOTE:
       *    1. if child app only change hash, it should not trigger browser reload
       *    2. if address is same and has hash, it should not add route stack
       */
      if (
        targetLocation.pathname === shadowLocation.pathname &&
        targetLocation.search === shadowLocation.search
      ) {
        if (targetLocation.hash !== shadowLocation.hash) {
          rawWindow.history[methodName](null, '', setMicroPathResult.fullPath)
        }

        if (targetLocation.hash) {
          dispatchPurePopStateEvent()
        } else {
          rawLocation.reload()
        }
        return void 0
      } else if (setMicroPathResult.attach2Hash) {
        rawWindow.history[methodName](null, '', setMicroPathResult.fullPath)
        rawLocation.reload()
        return void 0
      }

      value = setMicroPathResult.fullPath
    }

    return value
  }

  /**
   * Special processing for four keys: href, pathname, search and hash
   * They take values from shadowLocation, and require special operations when assigning values
   */
  rawDefineProperties(microLocation, {
    href: {
      enumerable: true,
      configurable: true,
      get: (): string => shadowLocation.href,
      set: (value: string): void => {
        const formattedValue = commonHandle(value, 'pushState')
        if (formattedValue) rawLocation.href = formattedValue
      }
    },
    pathname: {
      enumerable: true,
      configurable: true,
      get: (): string => shadowLocation.pathname,
      set: (value: string): void => {
        const targetPath = ('/' + value).replace(/^\/+/, '/') + shadowLocation.search + shadowLocation.hash
        const targetLocation = createURL(targetPath, url)
        // When the browser url has a hash value, the same pathname will not trigger the browser refresh
        if (targetLocation.pathname === shadowLocation.pathname && shadowLocation.hash) {
          dispatchPurePopStateEvent()
        } else {
          // When the value is the same, no new route stack will be added
          // Special scenes such as: /path ==> /path#hash, /path ==> /path?query
          const methodName = targetLocation.pathname === shadowLocation.pathname ? 'replaceState' : 'pushState'
          rawWindow.history[methodName](null, '', setMicroPathToURL(appName, targetLocation).fullPath)
          rawLocation.reload()
        }
      }
    },
    search: {
      enumerable: true,
      configurable: true,
      get: (): string => shadowLocation.search,
      set: (value: string): void => {
        const targetPath = shadowLocation.pathname + ('?' + value).replace(/^\?+/, '?') + shadowLocation.hash
        const targetLocation = createURL(targetPath, url)
        // When the browser url has a hash value, the same search will not trigger the browser refresh
        if (targetLocation.search === shadowLocation.search && shadowLocation.hash) {
          dispatchPurePopStateEvent()
        } else {
          // When the value is the same, no new route stack will be added
          // Special scenes such as: ?query ==> ?query#hash
          const methodName = targetLocation.search === shadowLocation.search ? 'replaceState' : 'pushState'
          rawWindow.history[methodName](null, '', setMicroPathToURL(appName, targetLocation).fullPath)
          rawLocation.reload()
        }
      }
    },
    hash: {
      enumerable: true,
      configurable: true,
      get: (): string => shadowLocation.hash,
      set: (value: string): void => {
        const targetPath = shadowLocation.pathname + shadowLocation.search + ('#' + value).replace(/^#+/, '#')
        const targetLocation = createURL(targetPath, url)
        // The same hash will not trigger popStateEvent
        if (targetLocation.hash !== shadowLocation.hash) {
          rawWindow.history.pushState(null, '', setMicroPathToURL(appName, targetLocation).fullPath)
          dispatchPurePopStateEvent()
        }
      }
    },
  })

  const createLocationMethod = (locationMethodName: string) => {
    return function (value: string | URL) {
      const formattedValue = commonHandle(value, locationMethodName === 'assign' ? 'pushState' : 'replaceState')
      if (formattedValue) rawLocation[locationMethodName](formattedValue)
    }
  }

  return oAssign(microLocation, {
    assign: createLocationMethod('assign'),
    replace: createLocationMethod('replace'),
    reload: (forcedReload?: boolean): void => rawLocation.reload(forcedReload),
    shadowLocation,
  })
}

const shadowLocationKeys: ReadonlyArray<keyof URL> = ['href', 'pathname', 'search', 'hash']
// origin is readonly, so we ignore when updateLocation
const locationKeys: ReadonlyArray<keyof URL> = [...shadowLocationKeys, 'host', 'hostname', 'port', 'protocol', 'search']
// origin is necessary for guardLocation
const guardLocationKeys: ReadonlyArray<keyof URL> = [...locationKeys, 'origin']

/**
 * create guardLocation by microLocation, used for router guard
 */
function createGuardLocation (appName: string, microLocation: MicroLocation): GuardLocation {
  const guardLocation = oAssign({ name: appName }, microLocation) as GuardLocation
  // The prototype values on the URL needs to be manually transferred
  for (const key of guardLocationKeys) guardLocation[key] = microLocation[key]
  return guardLocation
}

// for updateBrowserURLWithLocation when initial
export function autoTriggerNavigationGuard (appName: string, microLocation: MicroLocation): void {
  executeNavigationGuard(appName, createGuardLocation(appName, microLocation), createGuardLocation(appName, microLocation))
}

/**
 * There are three situations that trigger location update:
 * 1. pushState/replaceState
 * 2. popStateEvent
 * 3. params on browser url when init sub app
 * @param appName app name
 * @param path target path
 * @param base base url
 * @param microLocation micro app location
 * @param type init clear normal
 */
export function updateLocation (
  appName: string,
  path: string,
  base: string,
  microLocation: MicroLocation,
  type?: string,
): void {
  const newLocation = createURL(path, base)
  // record old values of microLocation to `from`
  const from = createGuardLocation(appName, microLocation)
  const oldFullPath = from.pathname + from.search + from.hash
  for (const key of locationKeys) {
    if (shadowLocationKeys.includes(key)) {
      // reference of shadowLocation
      microLocation.shadowLocation[key] = newLocation[key] as string
    } else {
      // @ts-ignore reference of microLocation
      microLocation[key] = newLocation[key]
    }
  }
  // update latest values of microLocation to `to`
  const to = createGuardLocation(appName, microLocation)
  const newFullPath = to.pathname + to.search + to.hash

  // The hook called only when fullPath changed
  if (type === 'init' || (oldFullPath !== newFullPath && type !== 'clear')) {
    executeNavigationGuard(appName, to, from)
  }
}
