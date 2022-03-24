import type { MicroLocation } from '@micro-app/types'
import { appInstanceMap } from '../../create_app'
import { getActiveApps } from '../../micro_app'
import { formatEventName } from '../effect'
import { getMicroPathFromURL, getMicroState } from './core'
import { updateLocation } from './location'

type PopStateListener = (this: Window, e: PopStateEvent) => void

/**
 * listen & release popstate event
 * each child app will listen for popstate event when sandbox start
 * and release it when sandbox stop
 * @param rawWindow origin window
 * @param appName app name
 * @returns release callback
 */
export function addHistoryListener (rawWindow: Window, appName: string): CallableFunction {
  // handle popstate event and distribute to child app
  const popStateHandler: PopStateListener = (e: PopStateEvent): void => {
    const activeApps = getActiveApps(true)
    if (activeApps.includes(appName)) {
      const microPath = getMicroPathFromURL(appName)
      const app = appInstanceMap.get(appName)!
      const proxyWindow = app.sandBox!.proxyWindow
      let isHashChange = false
      // for hashChangeEvent
      const oldHref = proxyWindow.location.href
      // Do not attach micro info to url when microPath is empty
      if (microPath) {
        const oldHash = proxyWindow.location.hash
        updateLocation(microPath, app.url, proxyWindow.location as MicroLocation)
        isHashChange = proxyWindow.location.hash !== oldHash
      }

      // console.log(333333, microPath, proxyWindow.location)

      // create PopStateEvent named popstate-appName with sub app state
      const newPopStateEvent = new PopStateEvent(
        formatEventName('popstate', appName),
        { state: getMicroState(appName, e.state) }
      )

      rawWindow.dispatchEvent(newPopStateEvent)

      typeof proxyWindow.onpopstate === 'function' && proxyWindow.onpopstate(newPopStateEvent)

      // send HashChangeEvent when hash change
      if (isHashChange) {
        const newHashChangeEvent = new HashChangeEvent(
          formatEventName('hashchange', appName),
          {
            newURL: proxyWindow.location.href,
            oldURL: oldHref,
          }
        )

        rawWindow.dispatchEvent(newHashChangeEvent)

        typeof proxyWindow.onhashchange === 'function' && proxyWindow.onhashchange(newHashChangeEvent)
      }
    }
  }

  rawWindow.addEventListener('popstate', popStateHandler)

  return () => {
    rawWindow.removeEventListener('popstate', popStateHandler)
  }
}
