/* eslint-disable node/no-callback-literal */
import type {
  AppInterface,
  ScriptSourceInfo,
  plugins,
  Func,
  fiberTasks,
  AttrsType,
} from '@micro-app/types'
import { fetchSource } from './fetch'
import {
  CompletionPath,
  promiseStream,
  createNonceSrc,
  pureCreateElement,
  defer,
  logError,
  isUndefined,
  isPlainObject,
  isArray,
  isFunction,
  getAttributes,
  promiseRequestIdle,
  serialExecFiberTasks,
  isInlineScript,
} from '../libs/utils'
import {
  dispatchOnLoadEvent,
  dispatchOnErrorEvent,
} from './load_event'
import microApp from '../micro_app'
import globalEnv from '../libs/global_env'
import { globalKeyToBeCached } from '../libs/constants'
import sourceCenter from './source_center'

export type moduleCallBack = Func & { moduleCount?: number, errorCount?: number }

function isTypeModule (app: AppInterface, scriptInfo: ScriptSourceInfo): boolean {
  return scriptInfo.appSpace[app.name].module && (!app.useSandbox || app.esmodule)
}

function isSpecialScript (app: AppInterface, scriptInfo: ScriptSourceInfo): boolean {
  const attrs = scriptInfo.appSpace[app.name].attrs
  return attrs.has('id')
}

function isInlineMode (app: AppInterface, scriptInfo: ScriptSourceInfo): boolean {
  return (
    app.inline ||
    scriptInfo.appSpace[app.name].inline ||
    isTypeModule(app, scriptInfo) ||
    isSpecialScript(app, scriptInfo)
  )
}

function getExistParseResult (scriptInfo: ScriptSourceInfo, currentCode: string): Function | void {
  const appSpace = scriptInfo.appSpace
  for (const appName in scriptInfo.appSpace) {
    const appSpaceData = appSpace[appName]
    if (appSpaceData.parsedCode === currentCode && appSpaceData.parsedFunction) {
      return appSpaceData.parsedFunction
    }
  }
}

function getUniqueNonceSrc (): string {
  const nonceStr: string = createNonceSrc()
  if (sourceCenter.script.hasInfo(nonceStr)) {
    return getUniqueNonceSrc()
  }
  return nonceStr
}

function code2Function (code: string): Function {
  return new Function(code)
}

// transfer the attributes on the script to convertScript
function setConvertScriptAttr (convertScript: HTMLScriptElement, attrs: AttrsType): void {
  attrs.forEach((value, key) => {
    if ((key === 'type' && value === 'module') || key === 'defer' || key === 'async') return
    if (key === 'src') key = 'data-origin-src'
    convertScript.setAttribute(key, value)
  })
}

/**
 * Extract script elements
 * @param script script element
 * @param parent parent element of script
 * @param app app
 * @param isDynamic dynamic insert
 */
export function extractScriptElement (
  script: HTMLScriptElement,
  parent: Node,
  app: AppInterface,
  isDynamic = false,
): any {
  let replaceComment: Comment | null = null
  let src: string | null = script.getAttribute('src')
  if (src) src = CompletionPath(src, app.url)
  if (script.hasAttribute('exclude') || checkExcludeUrl(src, app.name)) {
    replaceComment = document.createComment('script element with exclude attribute removed by micro-app')
  } else if (
    (script.type && !['text/javascript', 'text/ecmascript', 'application/javascript', 'application/ecmascript', 'module', 'systemjs-module', 'systemjs-importmap'].includes(script.type)) ||
    script.hasAttribute('ignore') || checkIgnoreUrl(src, app.name)
  ) {
    return null
  } else if (
    (globalEnv.supportModuleScript && script.noModule) ||
    (!globalEnv.supportModuleScript && script.type === 'module')
  ) {
    replaceComment = document.createComment(`${script.noModule ? 'noModule' : 'module'} script ignored by micro-app`)
  } else if (src) { // remote script
    let scriptInfo = sourceCenter.script.getInfo(src)
    const appSpaceData = {
      isDynamic: isDynamic,
      async: script.hasAttribute('async'),
      defer: script.defer || script.type === 'module',
      module: script.type === 'module',
      inline: script.hasAttribute('inline'),
      pure: script.hasAttribute('pure'),
      attrs: getAttributes(script),
    }
    if (!scriptInfo) {
      scriptInfo = {
        code: '',
        isExternal: true,
        appSpace: {
          [app.name]: appSpaceData,
        }
      }
    } else {
      scriptInfo.appSpace[app.name] = scriptInfo.appSpace[app.name] || appSpaceData
    }
    if (!isDynamic) {
      app.source.scripts.add(src)
      sourceCenter.script.setInfo(src, scriptInfo)
      replaceComment = document.createComment(`script with src='${src}' extract by micro-app`)
    } else {
      return { address: src, scriptInfo }
    }
  } else if (script.textContent) { // inline script
    /**
     * NOTE:
     * 1. Each inline script is unique
     * 2. Every dynamic created inline script will be re-executed
     * ACTION:
     * 1. Delete dynamic inline script info after exec
     * 2. Delete static inline script info when destroy
     */
    const nonceStr: string = getUniqueNonceSrc()
    const scriptInfo = {
      code: script.textContent,
      isExternal: false,
      appSpace: {
        [app.name]: {
          isDynamic: isDynamic,
          async: false,
          defer: script.type === 'module',
          module: script.type === 'module',
          inline: script.hasAttribute('inline'),
          pure: script.hasAttribute('pure'),
          attrs: getAttributes(script),
        }
      }
    }
    if (!isDynamic) {
      app.source.scripts.add(nonceStr)
      sourceCenter.script.setInfo(nonceStr, scriptInfo)
      replaceComment = document.createComment('inline script extract by micro-app')
    } else {
      return { address: nonceStr, scriptInfo }
    }
  } else if (!isDynamic) {
    /**
     * script with empty src or empty script.textContent remove in static html
     * & not removed if it created by dynamic
     */
    replaceComment = document.createComment('script element removed by micro-app')
  }

  if (isDynamic) {
    return { replaceComment }
  } else {
    return parent.replaceChild(replaceComment!, script)
  }
}

/**
 * get assets plugins
 * @param appName app name
 */
export function getAssetsPlugins (appName: string): plugins['global'] {
  const globalPlugins = microApp.plugins?.global || []
  const modulePlugins = microApp.plugins?.modules?.[appName] || []

  return [...globalPlugins, ...modulePlugins]
}

/**
 * whether the address needs to be excluded
 * @param address css or js link
 * @param plugins microApp plugins
 */
export function checkExcludeUrl (address: string | null, appName: string): boolean {
  if (!address) return false
  const plugins = getAssetsPlugins(appName) || []
  return plugins.some(plugin => {
    if (!plugin.excludeChecker) return false
    return plugin.excludeChecker(address)
  })
}

/**
 * whether the address needs to be ignore
 * @param address css or js link
 * @param plugins microApp plugins
 */
export function checkIgnoreUrl (address: string | null, appName: string): boolean {
  if (!address) return false
  const plugins = getAssetsPlugins(appName) || []
  return plugins.some(plugin => {
    if (!plugin.ignoreChecker) return false
    return plugin.ignoreChecker(address)
  })
}

/**
 *  Get remote resources of script
 * @param wrapElement htmlDom
 * @param app app
 */
export function fetchScriptsFromHtml (
  wrapElement: HTMLElement,
  app: AppInterface,
): void {
  const scriptList: Array<string> = Array.from(app.source.scripts)
  const fetchScriptPromise: Array<Promise<string> | string> = []
  const fetchScriptPromiseInfo: Array<[string, ScriptSourceInfo]> = []
  for (const address of scriptList) {
    const scriptInfo = sourceCenter.script.getInfo(address)!
    const appSpaceData = scriptInfo.appSpace[app.name]
    if ((!appSpaceData.defer && !appSpaceData.async) || app.isPrefetch) {
      fetchScriptPromise.push(scriptInfo.code ? scriptInfo.code : fetchSource(address, app.name))
      fetchScriptPromiseInfo.push([address, scriptInfo])
    }
  }

  const fiberScriptTasks: fiberTasks = app.isPrefetch || app.fiber ? [] : null

  if (fetchScriptPromise.length) {
    promiseStream<string>(fetchScriptPromise, (res: {data: string, index: number}) => {
      if (fiberScriptTasks) {
        fiberScriptTasks.push(() => promiseRequestIdle((resolve: PromiseConstructor['resolve']) => {
          fetchScriptSuccess(
            fetchScriptPromiseInfo[res.index][0],
            fetchScriptPromiseInfo[res.index][1],
            res.data,
            app,
          )
          resolve()
        }))
      } else {
        fetchScriptSuccess(
          fetchScriptPromiseInfo[res.index][0],
          fetchScriptPromiseInfo[res.index][1],
          res.data,
          app,
        )
      }
    }, (err: {error: Error, index: number}) => {
      logError(err, app.name)
    }, () => {
      if (fiberScriptTasks) {
        fiberScriptTasks.push(() => Promise.resolve(app.onLoad(wrapElement)))
        serialExecFiberTasks(fiberScriptTasks)
      } else {
        app.onLoad(wrapElement)
      }
    })
  } else {
    app.onLoad(wrapElement)
  }
}

/**
 * fetch js succeeded, record the code value
 * @param address script address
 * @param scriptInfo resource script info
 * @param data code
 */
export function fetchScriptSuccess (
  address: string,
  scriptInfo: ScriptSourceInfo,
  code: string,
  app: AppInterface,
): void {
  // reset scriptInfo.code
  scriptInfo.code = code

  /**
   * Pre parse script for prefetch, improve rendering performance
   * NOTE:
   * 1. if global parseResult exist, skip this step
   * 2. if app is inline or script is esmodule, skip this step
   * 3. if global parseResult not exist, the current script occupies the position, when js is reused, parseResult is reference
   */
  if (app.isPrefetch) {
    const appSpaceData = scriptInfo.appSpace[app.name]
    appSpaceData.parsedCode = bindScope(address, app, code, scriptInfo)
    if (!isInlineMode(app, scriptInfo)) {
      appSpaceData.parsedFunction = getExistParseResult(scriptInfo, appSpaceData.parsedCode) || code2Function(appSpaceData.parsedCode)
    }
  }
}

/**
 * Execute js in the mount lifecycle
 * @param app app
 * @param initHook callback for umd mode
 */
export function execScripts (
  app: AppInterface,
  initHook: moduleCallBack,
): void {
  const fiberScriptTasks: fiberTasks = app.fiber ? [] : null
  const scriptList: Array<string> = Array.from(app.source.scripts)
  const deferScriptPromise: Array<Promise<string>|string> = []
  const deferScriptInfo: Array<[string, ScriptSourceInfo]> = []
  for (const address of scriptList) {
    const scriptInfo = sourceCenter.script.getInfo(address)!
    const appSpaceData = scriptInfo.appSpace[app.name]
    // Notice the second render
    if (appSpaceData.defer || appSpaceData.async) {
      if (scriptInfo.isExternal && !scriptInfo.code) {
        deferScriptPromise.push(fetchSource(address, app.name))
      } else {
        deferScriptPromise.push(scriptInfo.code)
      }
      deferScriptInfo.push([address, scriptInfo])

      isTypeModule(app, scriptInfo) && (initHook.moduleCount = initHook.moduleCount ? ++initHook.moduleCount : 1)
    } else {
      if (fiberScriptTasks) {
        fiberScriptTasks.push(() => promiseRequestIdle((resolve: PromiseConstructor['resolve']) => {
          runScript(address, app, scriptInfo, false)
          initHook(false)
          resolve()
        }))
      } else {
        runScript(address, app, scriptInfo, false)
        initHook(false)
      }
    }
  }

  if (deferScriptPromise.length) {
    promiseStream<string>(deferScriptPromise, (res: {data: string, index: number}) => {
      const scriptInfo = deferScriptInfo[res.index][1]
      scriptInfo.code = scriptInfo.code || res.data
    }, (err: {error: Error, index: number}) => {
      initHook.errorCount = initHook.errorCount ? ++initHook.errorCount : 1
      logError(err, app.name)
    }, () => {
      deferScriptInfo.forEach(([address, scriptInfo]) => {
        if (scriptInfo.code) {
          if (fiberScriptTasks) {
            fiberScriptTasks.push(() => promiseRequestIdle((resolve: PromiseConstructor['resolve']) => {
              runScript(address, app, scriptInfo, false, initHook)
              !isTypeModule(app, scriptInfo) && initHook(false)
              resolve()
            }))
          } else {
            runScript(address, app, scriptInfo, false, initHook)
            !isTypeModule(app, scriptInfo) && initHook(false)
          }
        }
      })

      if (fiberScriptTasks) {
        fiberScriptTasks.push(() => Promise.resolve(initHook(
          isUndefined(initHook.moduleCount) ||
          initHook.errorCount === deferScriptPromise.length
        )))
        serialExecFiberTasks(fiberScriptTasks)
      } else {
        initHook(
          isUndefined(initHook.moduleCount) ||
          initHook.errorCount === deferScriptPromise.length
        )
      }
    })
  } else {
    if (fiberScriptTasks) {
      fiberScriptTasks.push(() => Promise.resolve(initHook(true)))
      serialExecFiberTasks(fiberScriptTasks)
    } else {
      initHook(true)
    }
  }
}

/**
 * run code
 * @param address script address
 * @param app app
 * @param scriptInfo script info
 * @param isDynamic dynamically created script
 * @param callback callback of module script
 */
export function runScript (
  address: string,
  app: AppInterface,
  scriptInfo: ScriptSourceInfo,
  isDynamic: boolean,
  callback?: moduleCallBack,
): any {
  try {
    preActionForExecScript(app)
    const appSpaceData = scriptInfo.appSpace[app.name]
    /**
     * TIP:
     * 1. plugins and wrapCode will only be executed once
     * 2. if parsedCode not exist, parsedFunction is not exist
     * 3. if parsedCode exist, parsedFunction does not necessarily exist
     */
    if (!appSpaceData.parsedCode) {
      appSpaceData.parsedCode = bindScope(address, app, scriptInfo.code, scriptInfo)
    }

    if (isInlineMode(app, scriptInfo)) {
      const scriptElement = pureCreateElement('script')
      runCode2InlineScript(
        address,
        appSpaceData.parsedCode,
        isTypeModule(app, scriptInfo),
        scriptElement,
        appSpaceData.attrs,
        callback,
      )
      if (isDynamic) return scriptElement
      // TEST IGNORE
      app.container?.querySelector('micro-app-body')!.appendChild(scriptElement)
    } else {
      runParsedFunction(app, scriptInfo)
      if (isDynamic) return document.createComment('dynamic script extract by micro-app')
    }
  } catch (e) {
    console.error(`[micro-app from runScript] app ${app.name}: `, e)
  }
}

/**
 * Get dynamically created remote script
 * @param address script address
 * @param scriptInfo scriptInfo
 * @param app app
 * @param originScript origin script element
 */
export function runDynamicRemoteScript (
  address: string,
  scriptInfo: ScriptSourceInfo,
  app: AppInterface,
  originScript: HTMLScriptElement,
): HTMLScriptElement | Comment {
  const dispatchScriptOnLoadEvent = () => dispatchOnLoadEvent(originScript)

  if (scriptInfo.code) {
    !isTypeModule(app, scriptInfo) && defer(dispatchScriptOnLoadEvent)
    /**
     * TODO: 这里要改，当script初始化时动态创建远程script时，初次渲染和二次渲染的顺序不一致，会导致错误
     * 1、url不存在缓存，初始化的时候肯定是要异步请求，那么执行顺序就会靠后，至少落后于html自带的script
     * 2、url存在缓存，那么二次渲染的时候这里会同步执行，就会先于html自带的script执行
     * 3、测试一下，初次渲染和二次渲染时，onload的执行时机，是在js执行完成，还是执行之前
     * 4、将上述问题做成注释，方便后续阅读和理解
     * 5、这里只有远程js
     */
    return runScript(address, app, scriptInfo, true, dispatchScriptOnLoadEvent)
  }

  let replaceElement: Comment | HTMLScriptElement
  if (isInlineMode(app, scriptInfo)) {
    replaceElement = pureCreateElement('script')
  } else {
    replaceElement = document.createComment(`dynamic script with src='${address}' extract by micro-app`)
  }

  fetchSource(address, app.name).then((code: string) => {
    scriptInfo.code = code
    sourceCenter.script.setInfo(address, scriptInfo)
    const appSpaceData = scriptInfo.appSpace[app.name]
    try {
      preActionForExecScript(app)
      appSpaceData.parsedCode = bindScope(address, app, code, scriptInfo)
      if (isInlineMode(app, scriptInfo)) {
        runCode2InlineScript(
          address,
          appSpaceData.parsedCode,
          isTypeModule(app, scriptInfo),
          replaceElement as HTMLScriptElement,
          appSpaceData.attrs,
          dispatchScriptOnLoadEvent,
        )
      } else {
        runParsedFunction(app, scriptInfo)
      }
    } catch (e) {
      console.error(`[micro-app from runDynamicScript] app ${app.name}: `, e, address)
    }
    !isTypeModule(app, scriptInfo) && dispatchScriptOnLoadEvent()
  }).catch((err) => {
    logError(err, app.name)
    dispatchOnErrorEvent(originScript)
  })

  return replaceElement
}

/**
 * common handle for inline script
 * @param address script address
 * @param code bound code
 * @param module type='module' of script
 * @param scriptElement target script element
 * @param callback callback of module script
 */
function runCode2InlineScript (
  address: string,
  code: string,
  module: boolean,
  scriptElement: HTMLScriptElement,
  attrs: AttrsType,
  callback?: moduleCallBack,
): void {
  if (module) {
    // module script is async, transform it to a blob for subsequent operations
    if (isInlineScript(address)) {
      const blob = new Blob([code], { type: 'text/javascript' })
      scriptElement.src = URL.createObjectURL(blob)
    } else {
      scriptElement.src = address
    }
    scriptElement.setAttribute('type', 'module')
    if (callback) {
      callback.moduleCount && callback.moduleCount--
      scriptElement.onload = callback.bind(scriptElement, callback.moduleCount === 0)
    }
  } else {
    scriptElement.textContent = code
  }

  setConvertScriptAttr(scriptElement, attrs)
}

// init & run code2Function
function runParsedFunction (app: AppInterface, scriptInfo: ScriptSourceInfo) {
  const appSpaceData = scriptInfo.appSpace[app.name]
  if (!appSpaceData.parsedFunction) {
    appSpaceData.parsedFunction = getExistParseResult(scriptInfo, appSpaceData.parsedCode!) || code2Function(appSpaceData.parsedCode!)
  }
  appSpaceData.parsedFunction.call(window)
}

/**
 * bind js scope
 * @param app app
 * @param code code
 * @param scriptInfo source script info
 */
function bindScope (
  address: string,
  app: AppInterface,
  code: string,
  scriptInfo: ScriptSourceInfo,
): string {
  // TODO: 增加缓存机制
  if (isPlainObject(microApp.plugins)) {
    code = usePlugins(address, code, app.name, microApp.plugins)
  }

  if (app.sandBox && !isTypeModule(app, scriptInfo)) {
    return `;(function(proxyWindow){with(proxyWindow.__MICRO_APP_WINDOW__){(function(${globalKeyToBeCached}){;${code}\n${isInlineScript(address) ? '' : `//# sourceURL=${address}\n`}}).call(proxyWindow,${globalKeyToBeCached})}})(window.__MICRO_APP_PROXY_WINDOW__);`
  }

  return code
}

function preActionForExecScript (app: AppInterface) {
  setActiveProxyWindow(app)
}

function setActiveProxyWindow (app: AppInterface): void {
  if (app.sandBox) {
    globalEnv.rawWindow.__MICRO_APP_PROXY_WINDOW__ = app.sandBox.proxyWindow
  }
}

/**
 * Call the plugin to process the file
 * @param address script address
 * @param code code
 * @param appName app name
 * @param plugins plugin list
 */
function usePlugins (address: string, code: string, appName: string, plugins: plugins): string {
  const newCode = processCode(plugins.global, code, address)

  return processCode(plugins.modules?.[appName], newCode, address)
}

function processCode (configs: plugins['global'], code: string, address: string) {
  if (!isArray(configs)) {
    return code
  }

  return configs.reduce((preCode, config) => {
    if (isPlainObject(config) && isFunction(config.loader)) {
      return config.loader(preCode, address)
    }

    return preCode
  }, code)
}
