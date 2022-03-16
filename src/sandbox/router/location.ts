import type { MicroLocation } from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import { assign as oAssign } from '../../libs/utils'

// location of micro app
// 只会在沙箱初始化时执行一次
export function createMicroLocation (url: string): MicroLocation {
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
// 触发location更新的无非3种情况：1、push/replaceState 2、popState事件 3、初始化时url上有参数
export function updateLocation (
  path: string,
  base: string,
  microLocation: MicroLocation,
): void {
  const newLocation = new URL(path, base)
  for (const key of LocationKeys) {
    // @ts-ignore
    microLocation[key] = newLocation[key]
  }
}
