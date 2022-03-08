import type {
  MicroRouter,
  MicroLocation,
  MicroHistory,
  MicroState,
  HistoryProxyValue,
  LocationQueryValue,
  LocationQuery,
  LocationQueryObject,
} from '@micro-app/types'
import globalEnv from '../libs/global_env'
import {
  assign as oAssign,
  formatEventName,
  isArray,
  isNull,
} from '../libs/utils'

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

const ENC_AD_RE = /&/g // %M1
const ENC_EQ_RE = /=/g // %M2
const DEC_AD_RE = /%M1/g // &
const DEC_EQ_RE = /%M2/g // =

function encodeMicroPath (path: string): string {
  return encodeURIComponent(commonDecode(path).replace(ENC_AD_RE, '%M1').replace(ENC_EQ_RE, '%M2'))
}

function decodeMicroPath (path: string): string {
  return commonDecode(path).replace(DEC_AD_RE, '&').replace(DEC_EQ_RE, '=')
}

function commonDecode (path: string): string {
  try {
    const decPath = decodeURIComponent(path)
    if (path === decPath || DEC_AD_RE.test(decPath) || DEC_EQ_RE.test(decPath)) return decPath
    return commonDecode(decPath)
  } catch {
    return path
  }
}

// 更新url地址有以下几种情况：
// 1、页面初始化
// 2、子应用页面内部发生跳转
// 3、通过micro-app api进行跳转

// 更新location有以下几种情况，根据url地址进行更新：
// 1、页面初始化
// 2、子应用页面内部发生跳转
// 3、通过micro-app api进行跳转
// 4、popstate事件
// const { pathname, search, hash } = location
// pathname + search + hash
// 如果有hash，则参数加在hash后面(默认为hash路由)，如果没有hash，则加在query上(默认history路由)
// 特殊情况：history路由有hash，hash路由没有hash -- 不管
function updateLocationFromURL () {
  const url = globalEnv.rawWindow.location
}

// 在初始化时，先从url上取当前子应用的路由信息
// 如果存在则根据存在的信息更新location，如果没有，则更新url地址
function attachRouteInfoToURL (appName: string, microLocation: MicroLocation) {
  const { pathname, search, hash } = microLocation
  const encodedMicroPath = encodeMicroPath(pathname + search + hash)
  const fullPath = attachQueryToURL(appName, encodedMicroPath)
  const rawHistory = globalEnv.rawWindow.history
  globalEnv.rawWindow.history.replaceState(
    createMicroState(appName, rawHistory.state, getMicroState(appName, rawHistory.state)),
    null,
    fullPath,
  )
}

function attachQueryToURL (appName: string, encodedMicroPath: string): string {
  let { pathname, search, hash } = globalEnv.rawWindow.location
  const microQueryObject = getQueryObjectFromURL()

  if (microQueryObject.hashQuery) {
    microQueryObject.hashQuery[appName] = encodedMicroPath
    hash = hash.slice(0, hash.indexOf('?') + 1) + stringifyQuery(microQueryObject.hashQuery)
  } else {
    if (microQueryObject.searchQuery) {
      microQueryObject.searchQuery[appName] = encodedMicroPath
    } else {
      microQueryObject.searchQuery = {
        [appName]: encodedMicroPath
      }
    }
    search = '?' + stringifyQuery(microQueryObject.searchQuery)
  }

  return pathname + search + hash
}

/**
 * 根据location获取query对象
 */
function getQueryObjectFromURL (): LocationQuery {
  const { search, hash } = globalEnv.rawWindow.location
  const microQueryObject: LocationQuery = {}

  if (search !== '' && search !== '?') {
    microQueryObject.searchQuery = parseQuery(search.slice(1))
  }

  if (hash.includes('?')) {
    microQueryObject.hashQuery = parseQuery(hash.slice(hash.indexOf('?') + 1))
  }

  return microQueryObject
}

function parseQuery (search: string): LocationQueryObject {
  const result: LocationQueryObject = {}
  const queryList = search.split('&')

  // 注意我们不会对key和value进行解码，以确保替换url时前后值一致
  // 我们只对匹配到的微应用的key和value在后续进行编解码
  for (const queryItem of queryList) {
    const eqPos = queryItem.indexOf('=')
    const key = eqPos < 0 ? queryItem : queryItem.slice(0, eqPos)
    const value = eqPos < 0 ? null : queryItem.slice(eqPos + 1)

    if (key in result) {
      let currentValue = result[key]
      if (!isArray(currentValue)) {
        currentValue = result[key] = [currentValue]
      }
      currentValue.push(value)
    } else {
      result[key] = value
    }
  }

  return result
}

// 一次只能格式化一个，所以search和hash需要分2次处理
function stringifyQuery (queryObject: LocationQueryObject): string {
  let result = ''

  for (const key in queryObject) {
    const value = queryObject[key]
    if (isNull(value)) {
      result += (result.length ? '&' : '') + key
    } else {
      const valueList: LocationQueryValue[] = isArray(value) ? value : [value]

      valueList.forEach(value => {
        result += (result.length ? '&' : '') + key
        if (value != null) result += '=' + value
      })
    }
  }

  return result
}

export default function createMicroRouter (appName: string, url: string): MicroRouter {
  const microLocation = createMicroLocation(url)
  // const updateLocation = (path: string) => {
  //   oAssign(microLocation, new URL(path, url))
  // }

  // 初始化信息
  attachRouteInfoToURL(appName, microLocation)
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
