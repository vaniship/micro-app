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
        const app = new CreateApp({
          name: options.name,
          url: options.url,
          isPrefetch: true,
          scopecss: !(options['disable-scopecss'] ?? options.disableScopecss ?? microApp.options['disable-scopecss']),
          useSandbox: !(options['disable-sandbox'] ?? options.disableSandbox ?? microApp.options['disable-sandbox']),
          inline: options.inline ?? microApp.options.inline,
          esmodule: options.esmodule ?? microApp.options.esmodule,
          // level: isNumber(options.level) ?? 2,
          preRender: options.preRender === true ? {} : options.preRender,
        })

        const oldOnload = app.onLoad
        const oldOnLoadError = app.onLoadError
        app.onLoad = (...rests): void => {
          resolve()
          oldOnload.call(app, ...rests)
        }

        app.onLoadError = (...rests): void => {
          resolve()
          oldOnLoadError.call(app, ...rests)
        }
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
