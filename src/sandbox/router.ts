import type { MicroRouter, MicroLocation, MicroHistory, MicroState, HistoryProxyValue } from '@micro-app/types'
import globalEnv from '../libs/global_env'
import { assign as oAssign, formatEventName } from '../libs/utils'

type PopStateListener = (this: Window, e: PopStateEvent) => void

// set micro app state to origin state
function createMicroState (
  appName: string,
  rawState: MicroState,
  microState: MicroState,
): MicroState {
  // 生成新的microAppState，因为它们在第二层
  const newMicroAppState = oAssign({}, rawState?.microAppState, {
    [appName]: microState
  })
  // 生成新的state对象
  return oAssign({}, rawState, {
    microAppState: newMicroAppState
  })
}

// get micro app state form origin state
function getMicroState (appName: string, state: MicroState): MicroState {
  return state?.microAppState?.[appName] || null
}

// history of micro app
function createMicroHistory (appName: string, url: string): MicroHistory {
  const rawHistory = globalEnv.rawWindow.history

  // 是否需要在每次调用时都创建一个函数？这样看起来麻烦，但是是函数式编程，看起来更优雅
  // 如果使用一个对象将history的方法都实现一遍，确实是不需要每次都创建函数的，但是这样太不优雅了
  function bindFunctionOfHistory (methodName: PropertyKey): CallableFunction {
    return (...rests: any[]) => {
      if (methodName === 'pushState' || methodName === 'replaceState') {
        // 对pushState/replaceState的state和path进行格式化，这里最关键的一步！！
        // 经过格式化后的，包含某个微应用state的全量state
        const newState = createMicroState(appName, rawHistory.state, rests[0])
        // eslint-disable-next-line
        console.log(newState, url)
      }
      rawHistory[methodName](...rests)
    }
  }

  const microHistory = new Proxy(rawHistory, {
    get (target: Record<string, unknown>, key: PropertyKey): HistoryProxyValue {
      if (key === 'state') {
        return getMicroState(appName, rawHistory.state)
      } else if (typeof Reflect.get(target, key) === 'function') {
        return bindFunctionOfHistory(key)
      }
      return Reflect.get(target, key)
    },
  })

  return microHistory
}

// location of micro app
function createMicroLocation (url: string): MicroLocation {
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

  oAssign(microLocation, {
    assign,
    replace,
    reload
  })

  return microLocation
}

export default function createMicroRouter (appName: string, url: string): MicroRouter {
  const microLocation = createMicroLocation(url)
  // const updateLocation = (path: string) => {
  //   oAssign(microLocation, new URL(path, url))
  // }
  return {
    location: microLocation,
    // updateLocation,
    // location: rawLocation,
    history: createMicroHistory(appName, url),
  }
}

/**
 * register & release popstate event
 * @param rawWindow origin window
 * @param appName app name
 * @returns release callback
 */
export function addHistoryListener (rawWindow: Window, appName: string): CallableFunction {
  // Send to the child app after receiving the popstate event
  const popStateHandler: PopStateListener = (e: PopStateEvent): void => {
    // 向当前子应用发送popstate-appname的事件，state的值需要被格式化
    const state = getMicroState(appName, e.state)
    rawWindow.dispatchEvent(
      new PopStateEvent(formatEventName('popstate', appName), { state })
    )
  }

  rawWindow.addEventListener('popstate', popStateHandler)

  return () => {
    rawWindow.removeEventListener('popstate', popStateHandler)
  }
}
