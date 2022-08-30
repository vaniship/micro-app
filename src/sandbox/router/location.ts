/* eslint-disable no-void */
import type { MicroLocation, GuardLocation, ShadowLocation } from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import { assign as oAssign, rawDefineProperties, createURL, noop } from '../../libs/utils'
import { setMicroPathToURL, isEffectiveApp } from './core'
import { dispatchNativeEvent } from './event'
import { executeNavigationGuard } from './api'
import { nativeHistoryNavigate, navigateWithNativeEvent } from './history'

const shadowLocationKeys: ReadonlyArray<keyof MicroLocation> = ['href', 'pathname', 'search', 'hash']
// origin is readonly, so we ignore when updateMicroLocation
const locationKeys: ReadonlyArray<keyof MicroLocation> = [...shadowLocationKeys, 'host', 'hostname', 'port', 'protocol', 'search']
// origin, fullPath is necessary for guardLocation
const guardLocationKeys: ReadonlyArray<keyof MicroLocation> = [...locationKeys, 'origin', 'fullPath']

/**
 * Create location for microApp, each microApp has only one location object, it is a reference type
 * MDN https://developer.mozilla.org/en-US/docs/Web/API/Location
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
  const commonHandler = (value: string | URL, methodName: string): string | URL | void => {
    const targetLocation = createURL(value, microLocation.href)
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
        let oldHref = null
        if (targetLocation.hash !== shadowLocation.hash) {
          if (setMicroPathResult.isAttach2Hash) oldHref = rawLocation.href
          nativeHistoryNavigate(appName, methodName, setMicroPathResult.fullPath)
        }

        if (targetLocation.hash) {
          dispatchNativeEvent(appName, false, oldHref)
        } else {
          rawReload()
        }
        return void 0
      /**
       * when baseApp is hash router, address change of child can not reload browser
       * so we imitate behavior of browser (reload)
       */
      } else if (setMicroPathResult.isAttach2Hash) {
        nativeHistoryNavigate(appName, methodName, setMicroPathResult.fullPath)
        rawReload()
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
  function createPropertyDescriptor (
    getter: () => string,
    setter: (v: string) => void,
  ): PropertyDescriptor {
    return {
      enumerable: true,
      configurable: true,
      get: getter,
      set: setter,
    }
  }

  /**
   * common handler for location.pathname & location.search
   * @param targetPath target fullPath
   * @param key pathname/search
   */
  function handleForPathNameAndSearch (targetPath: string, key: string): void {
    const targetLocation = createURL(targetPath, url)
    // When the browser url has a hash value, the same pathname/search will not refresh browser
    if (targetLocation[key] === shadowLocation[key] && shadowLocation.hash) {
      // The href has not changed, not need to dispatch hashchange event
      dispatchNativeEvent(appName, false)
    } else {
      /**
       * When the value is the same, no new route stack will be added
       * Special scenes such as:
       * pathname: /path ==> /path#hash, /path ==> /path?query
       * search: ?query ==> ?query#hash
       */
      nativeHistoryNavigate(
        appName,
        targetLocation[key] === shadowLocation[key] ? 'replaceState' : 'pushState',
        setMicroPathToURL(appName, targetLocation).fullPath,
      )
      rawReload()
    }
  }

  function rawReload () {
    isEffectiveApp(appName) && rawLocation.reload()
  }

  /**
   * Special processing for four keys: href, pathname, search and hash
   * They take values from shadowLocation, and require special operations when assigning values
   */
  rawDefineProperties(microLocation, {
    href: createPropertyDescriptor(
      (): string => shadowLocation.href,
      (value: string): void => {
        if (isEffectiveApp(appName)) {
          const targetPath = commonHandler(value, 'pushState')
          if (targetPath) rawLocation.href = targetPath
        }
      }
    ),
    pathname: createPropertyDescriptor(
      (): string => shadowLocation.pathname,
      (value: string): void => {
        const targetPath = ('/' + value).replace(/^\/+/, '/') + shadowLocation.search + shadowLocation.hash
        handleForPathNameAndSearch(targetPath, 'pathname')
      }
    ),
    search: createPropertyDescriptor(
      (): string => shadowLocation.search,
      (value: string): void => {
        const targetPath = shadowLocation.pathname + ('?' + value).replace(/^\?+/, '?') + shadowLocation.hash
        handleForPathNameAndSearch(targetPath, 'search')
      }
    ),
    hash: createPropertyDescriptor(
      (): string => shadowLocation.hash,
      (value: string): void => {
        const targetPath = shadowLocation.pathname + shadowLocation.search + ('#' + value).replace(/^#+/, '#')
        const targetLocation = createURL(targetPath, url)
        // The same hash will not trigger popStateEvent
        if (targetLocation.hash !== shadowLocation.hash) {
          navigateWithNativeEvent(
            appName,
            'pushState',
            setMicroPathToURL(appName, targetLocation),
            false,
          )
        }
      }
    ),
    fullPath: createPropertyDescriptor(
      (): string => shadowLocation.pathname + shadowLocation.search + shadowLocation.hash,
      noop,
    ),
  })

  const createLocationMethod = (locationMethodName: string) => {
    return function (value: string | URL) {
      if (isEffectiveApp(appName)) {
        const targetPath = commonHandler(value, locationMethodName === 'assign' ? 'pushState' : 'replaceState')
        if (targetPath) rawLocation[locationMethodName](targetPath)
      }
    }
  }

  return oAssign(microLocation, {
    assign: createLocationMethod('assign'),
    replace: createLocationMethod('replace'),
    reload: (forcedReload?: boolean): void => rawLocation.reload(forcedReload),
    shadowLocation,
  })
}

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
 * The following scenes will trigger location update:
 * 1. pushState/replaceState
 * 2. popStateEvent
 * 3. query on browser url when init sub app
 * 4. set defaultPage when when init sub app
 * NOTE:
 * 1. update browser URL first, and then update microLocation
 * 2. the same fullPath will not trigger router guards
 * @param appName app name
 * @param path target path
 * @param base base url
 * @param microLocation micro app location
 * @param type auto prevent
 */
export function updateMicroLocation (
  appName: string,
  path: string,
  microLocation: MicroLocation,
  type?: string,
): void {
  const newLocation = createURL(path, microLocation.href)
  // record old values of microLocation to `from`
  const from = createGuardLocation(appName, microLocation)
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

  // The hook called only when fullPath changed
  if (type === 'auto' || (from.fullPath !== to.fullPath && type !== 'prevent')) {
    executeNavigationGuard(appName, to, from)
  }
}
