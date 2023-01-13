import type {
  microAppWindowType,
} from '@micro-app/types'
import {
  updateMicroLocation,
} from '../router/location'
import {
  createMicroHistory,
} from '../router/history'
import {
  rawDefineProperty,
  assign,
} from '../../libs/utils'

export function patchIframeRoute (appName: string, microAppWindow: microAppWindowType): void {
  const microHistory = microAppWindow.history
  microAppWindow.rawReplaceState = microHistory.replaceState
  assign(microHistory, createMicroHistory(appName, microAppWindow.location))
}

export function initMicroLocation (
  appName: string,
  microAppWindow: microAppWindowType,
  childFullPath: string,
): void {
  const microLocation = microAppWindow.location
  rawDefineProperty(microLocation, 'fullPath', {
    enumerable: true,
    configurable: true,
    get: () => microLocation.pathname + microLocation.search + microLocation.hash,
  })

  updateMicroLocation(
    appName,
    childFullPath,
    microLocation,
    'prevent'
  )
}
