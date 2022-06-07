import type {
  MicroRouter,
  MicroLocation,
} from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import {
  getMicroPathFromURL,
  setMicroPathToURL,
  removeMicroPathFromURL,
  removeMicroState,
  setMicroState,
} from './core'
import {
  createMicroLocation,
  updateLocation,
} from './location'
import {
  createMicroHistory,
  updateBrowserURL,
} from './history'

export { addHistoryListener } from './event'

// 当沙箱执行start, 或者隐藏的keep-alive应用重新渲染时时才根据浏览器url更新location 或者 将参数更新到url上
export function initRouteStateWithURL (
  appName: string,
  url: string,
  microLocation: MicroLocation,
): void {
  const microPath = getMicroPathFromURL(appName)
  if (microPath) {
    updateLocation(microPath, url, microLocation)
  } else {
    updateBrowserURLWithLocation(appName, url, microLocation)
  }
}

/**
 * initialize browser information according to microLocation
 * called on sandbox.start or reshow of keep-alive app
 */
export function updateBrowserURLWithLocation (
  appName: string,
  url: string,
  microLocation: MicroLocation,
): void {
  const setMicroPathResult = setMicroPathToURL(appName, microLocation)
  updateBrowserURL(
    setMicroState(appName, globalEnv.rawWindow.history.state, null, url, setMicroPathResult.searchHash),
    setMicroPathResult.fullPath,
  )
}

// 清空路由信息，主要有2点：1、本地location更新为初始化 2、删除history.state 和 浏览器url上的参数信息
/**
 * In any case, microPath & microState will be removed from browser, but location will be initialized only when keep-route-state is false
 */
export function clearRouteStateFromURL (
  appName: string,
  url: string,
  microLocation: MicroLocation,
  keepRouteState: boolean,
): void {
  if (!keepRouteState) {
    const { pathname, search, hash } = new URL(url)
    updateLocation(pathname + search + hash, url, microLocation)
  }
  removeStateAndPathFromBrowser(appName, url)
}

/**
 * remove microState from history.state and remove microPath from browserURL
 * called on sandbox.stop or hidden of keep-alive app
 */
export function removeStateAndPathFromBrowser (appName: string, url: string): void {
  updateBrowserURL(
    removeMicroState(appName, globalEnv.rawWindow.history.state, url),
    removeMicroPathFromURL(appName),
  )
}

// 所谓路由系统，无非两种操作：读、写
// 读是通过location，写是通过replace/pushState
export default function createMicroRouter (appName: string, url: string): MicroRouter {
  const microLocation = createMicroLocation(appName, url)

  return {
    microLocation,
    microHistory: createMicroHistory(appName, url, microLocation),
  }
}
