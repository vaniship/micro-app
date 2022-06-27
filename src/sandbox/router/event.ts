import type { MicroLocation } from '@micro-app/types'
import { appInstanceMap } from '../../create_app'
import { getActiveApps } from '../../micro_app'
import { formatEventName } from '../effect'
import { getMicroPathFromURL, getMicroState } from './core'
import { updateMicroLocation } from './location'
import globalEnv from '../../libs/global_env'

type PopStateListener = (this: Window, e: PopStateEvent) => void
type MicroPopStateEvent = PopStateEvent & { onlyForParent?: boolean }

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
  const popStateHandler: PopStateListener = (e: MicroPopStateEvent): void => {
    // exclude hidden keep-alive app
    if (getActiveApps(true).includes(appName) && !e.onlyForParent) {
      const microPath = getMicroPathFromURL(appName)
      const app = appInstanceMap.get(appName)!
      const proxyWindow = app.sandBox!.proxyWindow
      let isHashChange = false
      // for hashChangeEvent
      const oldHref = proxyWindow.location.href
      // Do not attach micro state to url when microPath is empty
      if (microPath) {
        const oldHash = proxyWindow.location.hash
        updateMicroLocation(appName, microPath, proxyWindow.location as MicroLocation)
        isHashChange = proxyWindow.location.hash !== oldHash
      }

      // console.log(333333, microPath, proxyWindow.location)

      dispatchPopStateEventToMicroApp(appName, proxyWindow, rawWindow.history.state)

      // send HashChangeEvent when hash change
      if (isHashChange) dispatchHashChangeEventToMicroApp(appName, proxyWindow, oldHref)
    }
  }

  rawWindow.addEventListener('popstate', popStateHandler)

  return () => {
    rawWindow.removeEventListener('popstate', popStateHandler)
  }
}

/**
 * dispatch formatted popstate event to microApp
 * @param appName app name
 * @param proxyWindow sandbox window
 * @param eventState history.state
 */
export function dispatchPopStateEventToMicroApp (
  appName: string,
  proxyWindow: WindowProxy,
  eventState: unknown,
): void {
  // create PopStateEvent named popstate-appName with sub app state
  const newPopStateEvent = new PopStateEvent(
    formatEventName('popstate', appName),
    { state: getMicroState(appName, eventState) }
  )

  globalEnv.rawWindow.dispatchEvent(newPopStateEvent)

  // call function window.onpopstate if it exists
  typeof proxyWindow.onpopstate === 'function' && proxyWindow.onpopstate(newPopStateEvent)
}

/**
 * dispatch formatted hashchange event to microApp
 * @param appName app name
 * @param proxyWindow sandbox window
 * @param oldHref old href
 */
export function dispatchHashChangeEventToMicroApp (
  appName: string,
  proxyWindow: WindowProxy,
  oldHref: string,
): void {
  const newHashChangeEvent = new HashChangeEvent(
    formatEventName('hashchange', appName),
    {
      newURL: proxyWindow.location.href,
      oldURL: oldHref,
    }
  )

  globalEnv.rawWindow.dispatchEvent(newHashChangeEvent)

  // call function window.onhashchange if it exists
  typeof proxyWindow.onhashchange === 'function' && proxyWindow.onhashchange(newHashChangeEvent)
}

/**
 * dispatch native PopStateEvent, simulate location behavior
 */
function dispatchNativePopStateEvent (): void {
  globalEnv.rawWindow.dispatchEvent(new PopStateEvent('popstate', { state: null }))
}

/**
 * dispatch hashchange event to browser
 * @param oldHref old href of rawWindow.location
 */
function dispatchNativeHashChangeEvent (oldHref: string): void {
  const newHashChangeEvent = new HashChangeEvent(
    'hashchange',
    {
      newURL: globalEnv.rawWindow.location.href,
      oldURL: oldHref,
    }
  )

  globalEnv.rawWindow.dispatchEvent(newHashChangeEvent)
}

/**
 * dispatch popstate & hashchange event to browser
 * @param oldHref old href of rawWindow.location
 */
export function dispatchNativeEvent (oldHref?: string): void {
  dispatchNativePopStateEvent()
  if (oldHref) {
    dispatchNativeHashChangeEvent(oldHref)
  }
}
