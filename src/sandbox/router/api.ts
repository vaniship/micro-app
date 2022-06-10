import type {
  Router,
  RouterTarget,
  navigationMethod,
} from '@micro-app/types'
import {
  encodeMicroPath,
  decodeMicroPath,
} from './core'
import {
  logError,
  formatAppName,
  createURL,
} from '../../libs/utils'
import { appInstanceMap } from '../../create_app'
import { getActiveApps } from '../../micro_app'
import { dispatchPopStateEventToMicroApp } from './event'

/**
 * path需要注意的是两点：1、子应用的base也要加上 2、对于hash路由，要带上hash，如果开发者不知道具体地址如何写，那么单独运行子应用，跳转到对应的页面，复制浏览器地址到path
 * path 为子应用除域名外的全量地址(可以带上域名)
 * 相同的地址是否需要继续跳转？？？
 */
function createNavigationMethod (replace: boolean): navigationMethod {
  return function (to: RouterTarget): void {
    if (typeof to?.name === 'string' && typeof to.path === 'string') {
      const app = appInstanceMap.get(to.name = formatAppName(to.name))
      if (!app) return logError(`navigation failed, the app named ${to.name} not exist`)
      if (!app.sandBox) return logError(`navigation failed, the sandBox of app ${to.name} is closed`)
      if (!getActiveApps().includes(to.name)) return logError(`navigation failed, the app named ${to.name} has been unmounted`)
      const proxyWindow = app.sandBox.proxyWindow
      const microLocation = proxyWindow.location
      const currentFullPath = microLocation.pathname + microLocation.search + microLocation.hash
      const targetLocation = createURL(to.path, app.url)
      // Only get path data, even if the origin is different from microApp
      const targetPath = targetLocation.pathname + targetLocation.search + targetLocation.hash
      if (currentFullPath !== targetPath) {
        proxyWindow.history[replace || to.replace ? 'replaceState' : 'pushState'](to.state ?? null, '', targetPath)
        dispatchPopStateEventToMicroApp(to.name, proxyWindow, null)
      }
    } else {
      logError('navigation failed, name & path are required')
    }
  }
}

// Router API for developer
export const router: Router = {
  currentRoute: {},
  encode: encodeMicroPath,
  decode: decodeMicroPath,
  push: createNavigationMethod(false),
  replace: createNavigationMethod(true),
  // go:
  // back:
  // forward:
  // beforeEach:
  // afterEach:
  // onError:
}
