import type {
  MicroLocation,
  MicroState,
  LocationQuery,
} from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import {
  assign,
  parseQuery,
  stringifyQuery,
} from '../../libs/utils'

// set micro app state to origin state
export function createMicroState (
  appName: string,
  rawState: MicroState,
  microState: MicroState,
): MicroState {
  // 生成新的microAppState，因为它们在第二层
  const newMicroAppState = assign({}, rawState?.microAppState, {
    [appName]: microState
  })
  // 生成新的state对象
  return assign({}, rawState, {
    microAppState: newMicroAppState
  })
}

// get micro app state form origin state
export function getMicroState (appName: string, state: MicroState): MicroState {
  return state?.microAppState?.[appName] || null
}

// delete micro app state form origin state
export function deleteMicroState (appName: string, rawState: MicroState): MicroState {
  if (rawState?.microAppState?.[appName]) {
    delete rawState.microAppState[appName]
  }
  // 生成新的state对象
  return assign({}, rawState)
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

// 格式化query参数key，防止与原有参数的冲突
function formatQueryAppName (appName: string) {
  return `app-${appName}`
}

// 根据浏览器url参数，获取当前子应用的path
export function getMicroPathFromURL (appName: string): string | null {
  const rawLocation = globalEnv.rawWindow.location
  const queryObject = getQueryObjectFromURL(rawLocation.search, rawLocation.hash)
  const microPath = queryObject.hashQuery?.[formatQueryAppName(appName)] || queryObject.searchQuery?.[formatQueryAppName(appName)]
  // 解码
  return microPath ? decodeMicroPath(microPath as string) : null
}

// 将name=encodeUrl地址插入到浏览器url上
export function setMicroPathToURL (appName: string, microLocation: MicroLocation): string {
  let { pathname, search, hash } = globalEnv.rawWindow.location
  const queryObject = getQueryObjectFromURL(search, hash)
  const encodedMicroPath = encodeMicroPath(
    microLocation.pathname +
    microLocation.search +
    microLocation.hash
  )

  // hash存在且search不存在，则认为是hash路由
  if (hash && !search) {
    if (queryObject.hashQuery) {
      queryObject.hashQuery[formatQueryAppName(appName)] = encodedMicroPath
    } else {
      queryObject.hashQuery = {
        [formatQueryAppName(appName)]: encodedMicroPath
      }
    }
    const baseHash = hash.includes('?') ? hash.slice(0, hash.indexOf('?') + 1) : hash + '?'
    hash = baseHash + stringifyQuery(queryObject.hashQuery)
  } else {
    if (queryObject.searchQuery) {
      queryObject.searchQuery[formatQueryAppName(appName)] = encodedMicroPath
    } else {
      queryObject.searchQuery = {
        [formatQueryAppName(appName)]: encodedMicroPath
      }
    }
    search = '?' + stringifyQuery(queryObject.searchQuery)
  }

  return pathname + search + hash
}

// 将name=encodeUrl的参数从浏览器url上删除
export function removeMicroPathFromURL (appName: string): string {
  let { pathname, search, hash } = globalEnv.rawWindow.location
  const queryObject = getQueryObjectFromURL(search, hash)

  if (queryObject.hashQuery?.[formatQueryAppName(appName)]) {
    delete queryObject.hashQuery?.[formatQueryAppName(appName)]
    const hashQueryStr = stringifyQuery(queryObject.hashQuery)
    hash = hash.slice(0, hash.indexOf('?') + Number(Boolean(hashQueryStr))) + hashQueryStr
  } else if (queryObject.searchQuery?.[formatQueryAppName(appName)]) {
    delete queryObject.searchQuery?.[formatQueryAppName(appName)]
    const searchQueryStr = stringifyQuery(queryObject.searchQuery)
    search = searchQueryStr ? '?' + searchQueryStr : ''
  }

  return pathname + search + hash
}
