import type {
  microAppWindowType,
  MicroLocation,
} from '@micro-app/types'
import {
  createMicroLocation,
  updateMicroLocation,
} from '../router/location'
import {
  createMicroHistory,
} from '../router/history'
import {
  assign,
} from '../../libs/utils'
import globalEnv from '../../libs/global_env'

export function patchIframeRoute (
  appName: string,
  url: string,
  microAppWindow: microAppWindowType,
  browserHost: string,
): MicroLocation {
  const childStaticLocation = new URL(url) as MicroLocation
  const childHost = childStaticLocation.protocol + '//' + childStaticLocation.host
  const childFullPath = childStaticLocation.pathname + childStaticLocation.search + childStaticLocation.hash

  // rewrite microAppWindow.history
  const microHistory = microAppWindow.history
  microAppWindow.rawReplaceState = microHistory.replaceState
  assign(microHistory, createMicroHistory(appName, microAppWindow.location))

  /**
   * Init microLocation before exec sandbox.start (sandbox.start will sync microLocation info to browser url)
   * NOTE:
   *  1. exec updateMicroLocation after patch microHistory
   *  2.
   */
  updateMicroLocation(
    appName,
    childFullPath,
    microAppWindow.location,
    'prevent'
  )

  // create proxyLocation
  return createMicroLocation(
    appName,
    url,
    microAppWindow,
    childStaticLocation,
    browserHost,
    childHost,
  )
}

/**
 * actions when memory-route disable
 * @param appName app name
 * @param microAppWindow iframeWindow
 * @param baseroute base route for child app
 */
export function actionsForDisableMemoryRoute (
  appName: string,
  microAppWindow: microAppWindowType,
  baseroute: string,
): void {
  microAppWindow.__MICRO_APP_BASE_ROUTE__ = microAppWindow.__MICRO_APP_BASE_URL__ = baseroute

  /**
   * Sync browser router info to iframe when disable memory-router
   * e.g.:
   *  vue-router@4.x get target path by remove the base section from location.pathname
   *  code: window.location.pathname.slice(base.length) || '/'; (base is baseroute)
   * NOTE:
   *  1. iframe router and browser router are separated, we should update iframe router manually
   *  2. withSandbox location is browser location when disable memory-router, so no need to do anything
   */
  const rawLocation = globalEnv.rawWindow.location
  updateMicroLocation(
    appName,
    rawLocation.href,
    rawLocation,
    'prevent'
  )
}
