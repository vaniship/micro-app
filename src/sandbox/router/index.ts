import type {
  MicroRouter,
  MicroLocation,
} from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import {
  getMicroPathFromURL,
  setMicroPathToURL,
  removeMicroPathFromURL,
  deleteMicroState,
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

// 当沙箱执行start, 或者隐藏的keep-alive应用重新渲染时时才：根据浏览器url更新location 或者 将参数更新到url上
export function initRouteStateWithURL (
  appName: string,
  url: string,
  microLocation: MicroLocation,
): void {
  const microPath = getMicroPathFromURL(appName)
  if (microPath) {
    updateLocation(microPath, url, microLocation)
  } else {
    updateBrowserURL(globalEnv.rawWindow.history.state, setMicroPathToURL(appName, microLocation))
  }
}

export function clearRouteStateFromURL (
  appName: string,
  url: string,
  microLocation: MicroLocation,
): void {
  // 初始化location信息
  const { pathname, search, hash } = new URL(url)
  updateLocation(pathname + search + hash, url, microLocation)
  // 删除浏览器url上的子应用参数
  updateBrowserURL(
    deleteMicroState(appName, globalEnv.rawWindow.history.state),
    removeMicroPathFromURL(appName),
  )
}

export default function createMicroRouter (appName: string, url: string): MicroRouter {
  const microLocation = createMicroLocation(url)

  return {
    microLocation,
    microHistory: createMicroHistory(appName, url, microLocation),
  }
}
