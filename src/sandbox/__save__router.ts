/* eslint-disable */
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
  isArray,
  isNull,
  isString,
  isUndefined,
  logError,
} from '../libs/utils'
import { appInstanceMap } from '../create_app'
import { getActiveApps } from '../micro_app'
import { formatEventName } from './effect'

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
      const state = getMicroState(appName, e.state)
      rawWindow.dispatchEvent(
        new PopStateEvent(formatEventName('popstate', appName), { state })
      )
    }
  }

  rawWindow.addEventListener('popstate', popStateHandler)

  return () => {
    rawWindow.removeEventListener('popstate', popStateHandler)
  }
}

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

// delete micro app state form origin state
function deleteMicroState (appName: string, rawState: MicroState): MicroState {
  if (rawState?.microAppState?.[appName]) {
    delete rawState.microAppState[appName]
  }
  // 生成新的state对象
  return oAssign({}, rawState)
}

// history of micro app
function createMicroHistory (appName: string, base: string, microLocation: MicroLocation): MicroHistory {
  const rawHistory = globalEnv.rawWindow.history

  // 是否需要在每次调用时都创建一个函数？这样看起来麻烦，但是是函数式编程，看起来更优雅
  // 如果使用一个对象将history的方法都实现一遍，确实是不需要每次都创建函数的，但是这样太不优雅了
  function microHistoryMethod (methodName: PropertyKey): CallableFunction {
    return (...rests: any[]) => {
      console.log(444444444, rests[0], rests[1], rests[2], methodName)
      let targetPath = null
      // 对pushState/replaceState的state和path进行格式化，这里最关键的一步！！
      if ((methodName === 'pushState' || methodName === 'replaceState') && rests[2] && isString(rests[2])) {
        try {
          const targetLocation = new URL(rests[2], base) as MicroLocation
          if (targetLocation.origin === microLocation.origin) {
            targetPath = targetLocation.pathname + targetLocation.search + targetLocation.hash
            // 经过格式化后的，包含某个微应用state的全量state
            const newState = createMicroState(appName, rawHistory.state, rests[0])
            rests = [newState, rests[1], attachMicroQueryToURL(appName, targetLocation)]
          }
        } catch (e) {
          logError(e, appName)
        }
      }

      rawHistory[methodName](...rests)

      if (targetPath) updateLocation(targetPath, base, microLocation)

      console.log(5555555, microLocation, base)
    }
  }

  const microHistory = new Proxy(rawHistory, {
    get (target: Record<string, unknown>, key: PropertyKey): HistoryProxyValue {
      if (key === 'state') {
        return getMicroState(appName, rawHistory.state)
      } else if (typeof Reflect.get(target, key) === 'function') {
        return microHistoryMethod(key)
      }
      return Reflect.get(target, key)
    },
  })

  return microHistory
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

// 格式化query参数key，防止与原有参数的冲突
function formatQueryAppName (appName: string) {
  return `app-${appName}`
}

// 根据浏览器url参数，获取当前子应用的fullPath
function getMicroPathFromURL (appName: string): string | null {
  const rawLocation = globalEnv.rawWindow.location
  const queryObject = getQueryObjectFromURL(rawLocation.search, rawLocation.hash)
  const microPath = queryObject.hashQuery?.[formatQueryAppName(appName)] || queryObject.searchQuery?.[formatQueryAppName(appName)]
  // 解码
  return microPath ? decodeMicroPath(microPath as string) : null
}

// 将name=encodeUrl地址插入到浏览器url上
function attachMicroQueryToURL (appName: string, microLocation: MicroLocation): string {
  let { pathname, search, hash } = globalEnv.rawWindow.location
  const microQueryObject = getQueryObjectFromURL(search, hash)
  const encodedMicroPath = encodeMicroPath(
    microLocation.pathname +
    microLocation.search +
    microLocation.hash
  )

  // hash存在且search不存在，则认为是hash路由
  if (hash && !search) {
    if (microQueryObject.hashQuery) {
      microQueryObject.hashQuery[formatQueryAppName(appName)] = encodedMicroPath
    } else {
      microQueryObject.hashQuery = {
        [formatQueryAppName(appName)]: encodedMicroPath
      }
    }
    const baseHash = hash.includes('?') ? hash.slice(0, hash.indexOf('?') + 1) : hash + '?'
    hash = baseHash + stringifyQuery(microQueryObject.hashQuery)
  } else {
    if (microQueryObject.searchQuery) {
      microQueryObject.searchQuery[formatQueryAppName(appName)] = encodedMicroPath
    } else {
      microQueryObject.searchQuery = {
        [formatQueryAppName(appName)]: encodedMicroPath
      }
    }
    search = '?' + stringifyQuery(microQueryObject.searchQuery)
  }

  return pathname + search + hash
}

// 将name=encodeUrl的参数从浏览器url上删除
function removeMicroQueryFromURL (appName: string): string {
  let { pathname, search, hash } = globalEnv.rawWindow.location
  const microQueryObject = getQueryObjectFromURL(search, hash)

  if (microQueryObject.hashQuery?.[formatQueryAppName(appName)]) {
    delete microQueryObject.hashQuery?.[formatQueryAppName(appName)]
    const hashQueryStr = stringifyQuery(microQueryObject.hashQuery)
    hash = hash.slice(0, hash.indexOf('?') + Number(Boolean(hashQueryStr))) + hashQueryStr
  } else if (microQueryObject.searchQuery?.[formatQueryAppName(appName)]) {
    delete microQueryObject.searchQuery?.[formatQueryAppName(appName)]
    const searchQueryStr = stringifyQuery(microQueryObject.searchQuery)
    search = searchQueryStr ? '?' + searchQueryStr : ''
  }

  return pathname + search + hash
}

/**
 * 根据location获取query对象
 */
function getQueryObjectFromURL (search: string, hash: string): LocationQuery {
  const queryObject: LocationQuery = {}

  if (search !== '' && search !== '?') {
    queryObject.searchQuery = parseQuery(search.slice(1))
  }

  if (hash.includes('?')) {
    queryObject.hashQuery = parseQuery(hash.slice(hash.indexOf('?') + 1))
  }

  return queryObject
}

// 将参数字符串转换为对象
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

// 将对象转换为字符串，一次只能格式化一个，所以search和hash需要分2次处理
function stringifyQuery (queryObject: LocationQueryObject): string {
  let result = ''

  for (const key in queryObject) {
    const value = queryObject[key]
    if (isNull(value)) {
      result += (result.length ? '&' : '') + key
    } else {
      const valueList: LocationQueryValue[] = isArray(value) ? value : [value]

      valueList.forEach(value => {
        if (!isUndefined(value)) {
          result += (result.length ? '&' : '') + key
          if (!isNull(value)) result += '=' + value
        }
      })
    }
  }

  return result
}

// location of micro app
// 只会在沙箱初始化时执行一次
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

// origin is readonly, so we ignore it
const LocationKeys = ['hash', 'host', 'hostname', 'href', 'password', 'pathname', 'port', 'protocol', 'search']
function updateLocation (path: string, base: string, microLocation: MicroLocation) {
  const newLocation = new URL(path, base)
  for (const key of LocationKeys) {
    // @ts-ignore
    microLocation[key] = newLocation[key]
  }
}

// 更新浏览器url
function updateBrowserURL (state: MicroState, fullPath: string): void {
  globalEnv.rawWindow.history.replaceState(state, null, fullPath)
}

// 当沙箱执行start, 或者隐藏的keep-alive应用重新渲染时时才：根据浏览器url更新location 或者 将参数更新到url上
export function initRouteStateWithURL (appName: string, url: string, microLocation: MicroLocation) {
  const microPath = getMicroPathFromURL(appName)
  // 如果初始化时参数有子应用的数据信息，则直接复用，如果没有则重新创建

  if (microPath) {
    updateLocation(microPath, url, microLocation)
  } else {
    updateBrowserURL(globalEnv.rawWindow.history.state, attachMicroQueryToURL(appName, microLocation))
  }
}

export function clearRouteStateFromURL (appName: string, url: string, microLocation: MicroLocation) {
  // 初始化location信息
  const { pathname, search, hash } = new URL(url)
  updateLocation(pathname + search + hash, url, microLocation)
  // 删除浏览器url上的子应用参数
  updateBrowserURL(
    deleteMicroState(appName, globalEnv.rawWindow.history.state),
    removeMicroQueryFromURL(appName),
  )
}

export default function createMicroRouter (appName: string, url: string): MicroRouter {
  const microLocation = createMicroLocation(url)

  return {
    microLocation,
    microHistory: createMicroHistory(appName, url, microLocation),
  }
}
