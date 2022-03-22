import type { MicroLocation, LocationProxyValue } from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import { assign as oAssign, rawDefineProperties } from '../../libs/utils'
import { setMicroPathToURL } from './core'

// location of micro app
// 只会在沙箱初始化时执行一次
export function createMicroLocation (appName: string, url: string): MicroLocation {
  const rawWindow = globalEnv.rawWindow
  const rawLocation = rawWindow.location
  const microLocation = new URL(url) as MicroLocation
  const shadowLocation = {
    href: microLocation.href,
    pathname: microLocation.pathname,
    search: microLocation.search,
    hash: microLocation.hash,
  }

  function assign (url: string | URL): void {
    rawLocation.assign(url)
  }

  function replace (url: string | URL): void {
    rawLocation.replace(url)
  }

  function reload (forcedReload?: boolean): void {
    // @ts-ignore
    rawLocation.reload(forcedReload)
  }

  oAssign(microLocation, {
    assign,
    replace,
    reload,
    shadowLocation,
  })

  console.log(1111, microLocation)

  rawDefineProperties(microLocation, {
    href: {
      enumerable: true,
      configurable: true,
      get (): string {
        return shadowLocation.href
      },
      set (value: string): void {
        const targetLocation = new URL('' + value, url) as MicroLocation
        if (targetLocation.origin === microLocation.origin) {
          const setMicroPathResult = setMicroPathToURL(appName, targetLocation)
          /**
           * change hash with location.href = xxx will not trigger the browser reload
           * so we use pushState & reload to imitate href behavior
           * NOTE:
           *    1. if child app only change hash, it should not trigger browser reload
           *    2. if address is the same and has hash, it should not add route stack
           */
          if (
            targetLocation.pathname === shadowLocation.pathname &&
            targetLocation.search === shadowLocation.search
          ) {
            if (targetLocation.hash !== shadowLocation.hash) {
              rawWindow.history.pushState(null, null, setMicroPathResult.fullPath)
            }

            if (targetLocation.hash) {
              rawWindow.dispatchEvent(new PopStateEvent('popstate', { state: null }))
            } else {
              rawLocation.reload()
            }

          } else if (setMicroPathResult.attach2Hash) {
            rawWindow.history.pushState(null, null, setMicroPathResult.fullPath)
            rawLocation.reload()
          }

          value = setMicroPathResult.fullPath
        }

        console.log(9999999999)

        rawLocation.href = value
      }
    },
    pathname: {
      enumerable: true,
      configurable: true,
      get (): string {
        return shadowLocation.pathname
      },
      set (value: string): void {
        console.log(77777777777)
        const targetPath = value + shadowLocation.search + shadowLocation.hash
        const targetLocation = new URL(targetPath, url) as MicroLocation
        if (targetLocation.pathname === shadowLocation.pathname) {
          rawWindow.dispatchEvent(new PopStateEvent('popstate', { state: null }))
        } else {
          rawWindow.history.pushState(null, null, setMicroPathToURL(appName, targetLocation).fullPath)
          rawLocation.reload()
        }
      }
    },
    search: {
      enumerable: true,
      configurable: true,
      get (): string {
        return shadowLocation.search
      },
      set (value: string): void {
        const targetPath = shadowLocation.pathname + ('?' + value).replace(/^\?+/, '?') + shadowLocation.hash
        const targetLocation = new URL(targetPath, url) as MicroLocation
        if (targetLocation.search === shadowLocation.search) {
          rawWindow.dispatchEvent(new PopStateEvent('popstate', { state: null }))
        } else {
          rawWindow.history.pushState(null, null, setMicroPathToURL(appName, targetLocation).fullPath)
          rawLocation.reload()
        }
      }
    },
    hash: {
      enumerable: true,
      configurable: true,
      get (): string {
        return shadowLocation.hash
      },
      set (value: string): void {
        const targetPath = shadowLocation.pathname + shadowLocation.search + ('#' + value).replace(/^#+/, '#')
        const targetLocation = new URL(targetPath, url) as MicroLocation
        if (targetLocation.hash !== shadowLocation.hash) {
          rawWindow.history.pushState(null, null, setMicroPathToURL(appName, targetLocation).fullPath)
          rawWindow.dispatchEvent(new PopStateEvent('popstate', { state: null }))
        }
      }
    },
  })

  return microLocation

  const ownKeysOfMicroLocation: PropertyKey[] = ['assign', 'replace', 'reload', 'shadowLocation']
  return new Proxy(microLocation, {
    // get (target: MicroLocation, key: PropertyKey): LocationProxyValue {
    //   if (ownKeysOfMicroLocation.includes(key)) {
    //     return Reflect.get(target, key)
    //   }
    //   return Reflect.get(shadowLocation, key)
    // },
    // set (target: MicroLocation, key: PropertyKey, value: unknown): boolean {
    //   if (key === 'href') {
    //     const targetLocation = new URL('' + value, url) as MicroLocation
    //     if (targetLocation.origin === shadowLocation.origin) {
    //       const setMicroPathResult = setMicroPathToURL(appName, targetLocation)
    //       /**
    //        * change hash with location.href = xxx will not trigger the browser reload
    //        * so we use pushState & reload to imitate href behavior
    //        * NOTE:
    //        *    1. if child app only change hash, it should not trigger browser reload
    //        *    2. if address is the same and has hash, it should not add route stack
    //        */
    //       if (
    //         targetLocation.pathname === shadowLocation.pathname &&
    //         targetLocation.search === shadowLocation.search
    //       ) {
    //         if (targetLocation.hash !== shadowLocation.hash) {
    //           rawWindow.history.pushState(null, null, setMicroPathResult.fullPath)
    //         }

    //         if (targetLocation.hash) {
    //           rawWindow.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    //         } else {
    //           rawLocation.reload()
    //         }

    //         return true
    //       } else if (setMicroPathResult.attach2Hash) {
    //         rawWindow.history.pushState(null, null, setMicroPathResult.fullPath)
    //         rawLocation.reload()
    //         return true
    //       }

    //       value = setMicroPathResult.fullPath
    //     }

    //     return Reflect.set(rawLocation, key, value)
    //   } else if (key === 'pathname') {
    //     const targetPath = value + shadowLocation.search + shadowLocation.hash
    //     const targetLocation = new URL(targetPath, url) as MicroLocation
    //     if (targetLocation.pathname === shadowLocation.pathname) {
    //       rawWindow.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    //     } else {
    //       rawWindow.history.pushState(null, null, setMicroPathToURL(appName, targetLocation).fullPath)
    //       rawLocation.reload()
    //     }
    //     return true
    //   } else if (key === 'search') {
    //     const targetPath = shadowLocation.pathname + ('?' + value).replace(/^\?+/, '?') + shadowLocation.hash
    //     const targetLocation = new URL(targetPath, url) as MicroLocation
    //     if (targetLocation.search === shadowLocation.search) {
    //       rawWindow.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    //     } else {
    //       rawWindow.history.pushState(null, null, setMicroPathToURL(appName, targetLocation).fullPath)
    //       rawLocation.reload()
    //     }
    //     return true
    //   } else if (key === 'hash') {
    //     const targetPath = shadowLocation.pathname + shadowLocation.search + ('#' + value).replace(/^#+/, '#')
    //     const targetLocation = new URL(targetPath, url) as MicroLocation
    //     if (targetLocation.hash !== shadowLocation.hash) {
    //       rawWindow.history.pushState(null, null, setMicroPathToURL(appName, targetLocation).fullPath)
    //       rawWindow.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    //     }
    //     return true
    //   }

    //   if (ownKeysOfMicroLocation.includes(key)) {
    //     return Reflect.set(target, key, value)
    //   }

    //   if (key === 'protocol') {
    //     return Reflect.set(rawLocation, key, value)
    //   }

    //   return Reflect.set(shadowLocation, key, value)
    // }
  })
}

// origin is readonly, so we ignore it
const LocationKeys = ['hash', 'host', 'hostname', 'href', 'password', 'pathname', 'port', 'protocol', 'search']
// 触发location更新的无非3种情况：1、push/replaceState 2、popState事件 3、初始化时url上有参数
export function updateLocation (
  path: string,
  base: string,
  microLocation: MicroLocation,
): void {
  const newLocation = new URL(path, base)
  console.log(888888888, newLocation)
  for (const key of LocationKeys) {
    if (key === 'href' || key === 'pathname' || key === 'search' || key === 'hash') {
      // @ts-ignore
      microLocation.shadowLocation[key] = newLocation[key]
    } else {
      // @ts-ignore
      microLocation[key] = newLocation[key]
    }

    // @ts-ignore
    // microLocation[key] = newLocation[key]
  }
}
