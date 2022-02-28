import type { MicroRouter, MicroLocation } from '@micro-app/types'
import globalEnv from '../libs/global_env'
import { assign as oAssign, formatEventName } from '../libs/utils'

type PopStateListener = (this: Window, e: PopStateEvent) => any

function addHistoryListener (appName: string): CallableFunction {
  // Send to the child app after receiving the popstate event
  const popStateHandler: PopStateListener = (e: PopStateEvent) => {
    // 向当前子应用发送popstate-appname的事件，state的值需要被格式化
    const state = e.state?.microAppState?.[appName] || null
    globalEnv.rawWindow.dispatchEvent(
      new PopStateEvent(formatEventName('popstate', appName), { state })
    )
  }

  globalEnv.rawWindow.addEventListener('popstate', popStateHandler)

  return () => {
    globalEnv.rawWindow.removeEventListener('popstate', popStateHandler)
  }
}

export default function createMicroRouter (appName: string, url: string): MicroRouter {
  const rawLocation = globalEnv.rawWindow.location
  const microLocation = new URL(url) as MicroLocation

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

  // microLocation.replace = rawLocation.replace
  // microLocation.reload = rawLocation.reload
  // microLocation.assign = rawLocation.assign

  oAssign(microLocation, {
    assign,
    replace,
    reload
  })

  microLocation.assign = assign
  microLocation.replace = replace
  microLocation.reload = reload

  return {
    location: microLocation,
    // location: rawLocation,
    history: window.history,
    removeHistoryListener: addHistoryListener(appName)
  }
}
