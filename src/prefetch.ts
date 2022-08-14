import type { prefetchParamList, prefetchParam, globalAssetsType } from '@micro-app/types'
import type { SourceCenter as SourceCenterType } from './source/source_center'
import CreateApp, { appInstanceMap } from './create_app'
import {
  requestIdleCallback,
  formatAppURL,
  formatAppName,
  promiseStream,
  logError,
  isBrowser,
  isArray,
  isPlainObject,
  isString,
  isFunction,
  promiseRequestIdle,
} from './libs/utils'
import { fetchSource } from './source/fetch'
import sourceCenter from './source/source_center'
import microApp from './micro_app'

/**
 * preFetch([
 *  {
 *    name: string,
 *    url: string,
 *    disableScopecss?: boolean,
 *    disableSandbox?: boolean,
 *    disableMemoryRouter?: boolean,
 *  },
 *  ...
 * ])
 * Note:
 *  1: preFetch is asynchronous and is performed only when the browser is idle
 *  2: disableScopecss, disableSandbox, disableMemoryRouter must be same with micro-app element, if conflict, the one who executes first shall prevail
 * @param apps micro apps
 */
export default function preFetch (apps: prefetchParamList): void {
  if (!isBrowser) {
    return logError('preFetch is only supported in browser environment')
  }
  requestIdleCallback(() => {
    isFunction(apps) && (apps = apps())

    if (isArray(apps)) {
      apps.reduce((pre, next) => pre.then(() => preFetchInSerial(next)), Promise.resolve())
    }
  })
}

// sequential preload app
function preFetchInSerial (prefetchApp: prefetchParam): Promise<void> {
  return promiseRequestIdle((resolve: PromiseConstructor['resolve']) => {
    if (isPlainObject(prefetchApp) && navigator.onLine) {
      prefetchApp.name = formatAppName(prefetchApp.name)
      prefetchApp.url = formatAppURL(prefetchApp.url, prefetchApp.name)
      if (prefetchApp.name && prefetchApp.url && !appInstanceMap.has(prefetchApp.name)) {
        /**
         * TODO:
         * 1、预加载与micro-app元素不再绑定，各自定义参数
         * 2、如果预加载关闭样式隔离，micro-app元素没有关闭，则需要在mount时再次处理 -- 废弃
         *    只有在元素上明确打开样式隔离，才会进行处理
         * 3、预加载增加shadowDOM参数，当开启时关闭样式隔离
         *   但是有一个问题，如果用户在预加载设置了shadowDOM，但是在元素上没设置，他可能认为预加载设置后就不需要在元素上设置了，这样会导致出问题
         *   上面也一样，用户在预加载关闭样式隔离后，渲染时如果元素上没有明确关闭，那么还是会生效的
         *   这样吧，还是可以同时存在，但是预加载的优先级小于元素，当在预加载开启了样式隔离或者shadowDOM，如果子应用没有明确关闭这两个设置，那么默认按照预加载的执行
         *
         * 4、增加配置 inline esmodule
         *
         * 文档提示：
         *  1、预加载的配置建议和<micro-app>元素上的配置保持一致，且后者拥有更高的优先级，当两者产生冲突时，以<micro-app>元素上的配置为准
         */
        const app = new CreateApp({
          name: prefetchApp.name,
          url: prefetchApp.url,
          scopecss: !(prefetchApp['disable-scopecss'] ?? prefetchApp.disableScopecss ?? microApp['disable-scopecss']),
          useSandbox: !(prefetchApp['disable-sandbox'] ?? prefetchApp.disableSandbox ?? microApp['disable-sandbox']),
          useMemoryRouter: !(prefetchApp['disable-memory-router'] ?? microApp['disable-memory-router']),
          isPrefetch: true,
        })

        app.prefetchResolve = resolve
      } else {
        resolve()
      }
    } else {
      resolve()
    }
  })
}

/**
 * load global assets into cache
 * @param assets global assets of js, css
 */
export function getGlobalAssets (assets: globalAssetsType): void {
  if (isPlainObject(assets)) {
    requestIdleCallback(() => {
      fetchGlobalResources(assets.js, 'js', sourceCenter.script)
      fetchGlobalResources(assets.css, 'css', sourceCenter.link)
    })
  }
}

// TODO: requestIdleCallback for every file
function fetchGlobalResources (resources: string[] | void, suffix: string, sourceHandler: SourceCenterType['link'] | SourceCenterType['script']) {
  if (isArray(resources)) {
    const effectiveResource = resources!.filter((path) => isString(path) && path.includes(`.${suffix}`) && !sourceHandler.hasInfo(path))

    const fetchResourcePromise = effectiveResource.map((path) => fetchSource(path))

    // fetch resource with stream
    promiseStream<string>(fetchResourcePromise, (res: {data: string, index: number}) => {
      const path = effectiveResource[res.index]
      if (suffix === 'js') {
        if (!sourceHandler.hasInfo(path)) {
          sourceHandler.setInfo(path, {
            code: res.data,
            isExternal: false,
            appSpace: {},
          })
        }
      } else {
        if (!sourceHandler.hasInfo(path)) {
          (sourceHandler as SourceCenterType['link']).setInfo(path, {
            code: res.data,
            appSpace: {}
          })
        }
      }
    }, (err: {error: Error, index: number}) => {
      logError(err)
    })
  }
}
