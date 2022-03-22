import { appInstanceMap } from '../../create_app'
import { getActiveApps } from '../../micro_app'
import { formatEventName } from '../effect'
import { getMicroPathFromURL, getMicroState } from './core'
import { updateLocation } from './location'

type PopStateListener = (this: Window, e: PopStateEvent) => void

/**
 * register & release popstate event
 * @param rawWindow origin window
 * @param appName app name
 * @returns release callback
 */
export function addHistoryListener (rawWindow: Window, appName: string): CallableFunction {
  // Send to the child app after receiving the popstate event
  const popStateHandler: PopStateListener = (e: PopStateEvent): void => {
    const activeApps = getActiveApps(true)
    if (activeApps.includes(appName)) {
      // 先更新location，再发送popstate事件
      const microPath = getMicroPathFromURL(appName)
      if (microPath) {
        const app = appInstanceMap.get(appName)
        // @ts-ignore
        updateLocation(microPath, app.url, app.sandBox.proxyWindow.location)
        // @ts-ignore
        console.log(333333, microPath, app.sandBox.proxyWindow.location)
      }
      // 向当前子应用发送popstate-appname的事件，state的值需要被格式化
      rawWindow.dispatchEvent(
        new PopStateEvent(formatEventName('popstate', appName), { state: getMicroState(appName, e.state) })
      )
    }
  }

  rawWindow.addEventListener('popstate', popStateHandler)

  return () => {
    rawWindow.removeEventListener('popstate', popStateHandler)
  }
}
