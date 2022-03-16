import type {
  MicroState,
  MicroLocation,
  MicroHistory,
  HistoryProxyValue,
} from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import { isString, logError } from '../../libs/utils'
import { updateLocation } from './location'
import { setMicroPathToURL, createMicroState, getMicroState } from './core'

// history of micro app
export function createMicroHistory (
  appName: string,
  base: string,
  microLocation: MicroLocation,
): MicroHistory {
  const rawHistory = globalEnv.rawWindow.history

  // 是否需要在每次调用时都创建一个函数？这样看起来麻烦，但是是函数式编程，看起来更优雅
  // 如果使用一个对象将history的方法都实现一遍，确实是不需要每次都创建函数的，但是这样太不优雅了
  function getMicroHistoryMethod (methodName: PropertyKey): CallableFunction {
    return (...rests: any[]) => {
      // console.log(444444444, rests[0], rests[1], rests[2], methodName)
      let targetPath = null
      // 对pushState/replaceState的state和path进行格式化，这里最关键的一步！！
      if ((methodName === 'pushState' || methodName === 'replaceState') && rests[2] && isString(rests[2])) {
        try {
          const targetLocation = new URL(rests[2], base) as MicroLocation
          if (targetLocation.origin === microLocation.origin) {
            targetPath = targetLocation.pathname + targetLocation.search + targetLocation.hash
            rests = [
              createMicroState(appName, rawHistory.state, rests[0]),
              rests[1],
              setMicroPathToURL(appName, targetLocation),
            ]
          }
        } catch (e) {
          logError(e, appName)
        }
      }

      rawHistory[methodName].apply(rawHistory, rests)

      if (targetPath) updateLocation(targetPath, base, microLocation)

      // console.log(5555555, microLocation, base)
    }
  }

  const microHistory = new Proxy(rawHistory, {
    get (target: History, key: PropertyKey): HistoryProxyValue {
      if (key === 'state') {
        return getMicroState(appName, rawHistory.state)
      } else if (typeof Reflect.get(target, key) === 'function') {
        return getMicroHistoryMethod(key)
      }
      return Reflect.get(target, key)
    },
  })

  return microHistory
}

// 更新浏览器url
export function updateBrowserURL (state: MicroState, fullPath: string): void {
  globalEnv.rawWindow.history.replaceState(state, null, fullPath)
}
