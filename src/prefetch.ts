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
function preFetchInSerial (options: prefetchParam): Promise<void> {
  return promiseRequestIdle((resolve: PromiseConstructor['resolve']) => {
    if (isPlainObject(options) && navigator.onLine) {
      options.name = formatAppName(options.name)
      options.url = formatAppURL(options.url, options.name)
      if (options.name && options.url && !appInstanceMap.has(options.name)) {
        /**
         * 思考: 如果预加载参数独立
         * 1、html自带的style在预加载时进行样式隔离，micro-app元素设置关闭，如何处理这个style，正则匹配？
         *      这里还涉及到body和micro-app-body的转换问题
         *
         * 2、js沙箱也有同样的问题
         *
         *
         * 有一种解决方案：当子应用渲染时判断当前配置和预加载的配置是否一致，如果不一致，则destroy应用重新渲染，这样会重新请求html，从头解析和执行，而预加载的缓存是可以复用的
         *
         * 文档提示：
         *  1、预加载的配置建议和<micro-app>元素上的配置保持一致，且后者拥有更高的优先级，当两者产生冲突时，以<micro-app>元素上的配置为准
         * 稍等：预加载参数和全局参数哪一个优先级高？？
         *  全局配置更高！！
         *  -- 预加载只是加载和处理资源，它的参数只是表示该怎么处理预加载的资源，它不应该对应用产生任何影响，只是做了一层缓存
         * 提示各种案例
         *
         * 补充1: vite应用必须在预加载时设置esmodule配置，否则报错 Cannot use import statement outside a module
         */
        const app = new CreateApp({
          name: options.name,
          url: options.url,
          scopecss: !(options['disable-scopecss'] ?? options.disableScopecss ?? microApp['disable-scopecss']),
          useSandbox: !(options['disable-sandbox'] ?? options.disableSandbox ?? microApp['disable-sandbox']),
          useMemoryRouter: !(options['disable-memory-router'] ?? microApp['disable-memory-router']),
          isPrefetch: true,
          inline: options.inline ?? microApp.inline,
          esmodule: options.esmodule ?? microApp.esmodule,
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
