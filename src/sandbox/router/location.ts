/* eslint-disable no-void */
import type { MicroLocation, GuardLocation, ShadowLocation } from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import { assign as oAssign, rawDefineProperties, createURL } from '../../libs/utils'
import { setMicroPathToURL } from './core'
import { dispatchNativePopStateEvent } from './event'
import { executeNavigationGuard } from './api'
import { nativeHistoryNavigate } from './history'

const shadowLocationKeys: ReadonlyArray<keyof URL> = ['href', 'pathname', 'search', 'hash']
// origin is readonly, so we ignore when updateMicroLocation
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
export function updateMicroLocation (
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
  const commonHandler = (value: string | URL, methodName: string): string | URL | undefined => {
    const targetLocation = createURL(value, url)
    // Even if the origin is the same, developers still have the possibility of want to jump to a new page
    if (targetLocation.origin === microLocation.origin) {
      const setMicroPathResult = setMicroPathToURL(appName, targetLocation)
      /**
       * change hash with location.href will not trigger the browser reload
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
          nativeHistoryNavigate(methodName, setMicroPathResult.fullPath)
        }

        if (targetLocation.hash) {
          dispatchNativePopStateEvent()
        } else {
          rawLocation.reload()
        }
        return void 0
      /**
       * when baseApp is hash router, address change of child can not reload browser
       * so we imitate behavior of browser (reload)
       */
      } else if (setMicroPathResult.isAttach2Hash) {
        nativeHistoryNavigate(methodName, setMicroPathResult.fullPath)
        rawLocation.reload()
        return void 0
      }

      value = setMicroPathResult.fullPath
    }

    return value
  }

  /**
   * create location PropertyDescriptor (href, pathname, search, hash)
   * @param key property name
   * @param setter setter of location property
   */
  function createPropertyDescriptor (key: string, setter: (v: string) => void): PropertyDescriptor {
    return {
      enumerable: true,
      configurable: true,
      get: (): string => shadowLocation[key],
      set: setter,
    }
  }

  /**
   * common handler for location.pathname & location.search
   * @param targetPath target fullPath
   * @param key pathname/search
   */
  function handleForPathNameAndSearch (targetPath: string, key: string) {
    const targetLocation = createURL(targetPath, url)
    // When the browser url has a hash value, the same pathname/search will not refresh browser
    if (targetLocation[key] === shadowLocation[key] && shadowLocation.hash) {
      dispatchNativePopStateEvent()
    } else {
      /**
       * When the value is the same, no new route stack will be added
       * Special scenes such as:
       * pathname: /path ==> /path#hash, /path ==> /path?query
       * search: ?query ==> ?query#hash
       */
      nativeHistoryNavigate(
        targetLocation[key] === shadowLocation[key] ? 'replaceState' : 'pushState',
        setMicroPathToURL(appName, targetLocation).fullPath,
      )
      rawLocation.reload()
    }
  }

  /**
   * Special processing for four keys: href, pathname, search and hash
   * They take values from shadowLocation, and require special operations when assigning values
   */
  rawDefineProperties(microLocation, {
    href: createPropertyDescriptor('href', (value: string): void => {
      const targetPath = commonHandler(value, 'pushState')
      if (targetPath) rawLocation.href = targetPath
    }),
    pathname: createPropertyDescriptor('pathname', (value: string): void => {
      const targetPath = ('/' + value).replace(/^\/+/, '/') + shadowLocation.search + shadowLocation.hash
      handleForPathNameAndSearch(targetPath, 'pathname')
    }),
    search: createPropertyDescriptor('search', (value: string): void => {
      const targetPath = shadowLocation.pathname + ('?' + value).replace(/^\?+/, '?') + shadowLocation.hash
      handleForPathNameAndSearch(targetPath, 'search')
    }),
    hash: createPropertyDescriptor('hash', (value: string): void => {
      const targetPath = shadowLocation.pathname + shadowLocation.search + ('#' + value).replace(/^#+/, '#')
      const targetLocation = createURL(targetPath, url)
      // The same hash will not trigger popStateEvent
      if (targetLocation.hash !== shadowLocation.hash) {
        nativeHistoryNavigate('pushState', setMicroPathToURL(appName, targetLocation).fullPath)
        dispatchNativePopStateEvent()
      }
    }),
  })

  const createLocationMethod = (locationMethodName: string) => {
    return function (value: string | URL) {
      const targetPath = commonHandler(value, locationMethodName === 'assign' ? 'pushState' : 'replaceState')
      if (targetPath) rawLocation[locationMethodName](targetPath)
    }
  }

  return oAssign(microLocation, {
    assign: createLocationMethod('assign'),
    replace: createLocationMethod('replace'),
    reload: (forcedReload?: boolean): void => rawLocation.reload(forcedReload),
    shadowLocation,
  })
}
