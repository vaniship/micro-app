import type {
  BaseSandboxType,
  AppInterface,
} from '@micro-app/types'
import globalEnv from '../libs/global_env'
import {
  defer,
  isNode,
  rawDefineProperties,
  throttleDeferForSetAppName,
  isMicroAppBody,
} from '../libs/utils'
import {
  appInstanceMap,
  isIframeSandbox,
} from '../create_app'
import microApp from '../micro_app'

export class BaseSandbox implements BaseSandboxType {
  constructor () {
    this.injectReactHMRProperty()
  }

  // keys that can only assigned to rawWindow
  public rawWindowScopeKeyList: PropertyKey[] = [
    'location',
  ]

  // keys that can escape to rawWindow
  public staticEscapeProperties: PropertyKey[] = [
    'System',
    '__cjsWrapper',
  ]

  // keys that scoped in child app
  public staticScopeProperties: PropertyKey[] = [
    'webpackJsonp',
    'webpackHotUpdate',
    'Vue',
    // TODO: 是否可以和constants/SCOPE_WINDOW_ON_EVENT合并
    'onpopstate',
    'onhashchange',
  ]

  // Properties that can only get and set in microAppWindow, will not escape to rawWindow
  public scopeProperties: PropertyKey[] = Array.from(this.staticScopeProperties)
  // Properties that can be escape to rawWindow
  public escapeProperties: PropertyKey[] = []
  // Properties newly added to microAppWindow
  public injectedKeys = new Set<PropertyKey>()
  // Properties escape to rawWindow, cleared when unmount
  public escapeKeys = new Set<PropertyKey>()
  // Promise used to mark whether the sandbox is initialized
  public sandboxReady!: Promise<void>

  // adapter for react
  private injectReactHMRProperty (): void {
    if (__DEV__) {
      // react child in non-react env
      this.staticEscapeProperties.push('__REACT_ERROR_OVERLAY_GLOBAL_HOOK__')
      // in react parent
      if (globalEnv.rawWindow.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__) {
        this.staticScopeProperties = this.staticScopeProperties.concat([
          '__REACT_ERROR_OVERLAY_GLOBAL_HOOK__',
          '__reactRefreshInjected',
        ])
      }
    }
  }
}

/**
 * TODO:
 *  1、将class Adapter去掉，改为CustomWindow，或者让CustomWindow继承Adapter
 *  2、with沙箱中的常量放入CustomWindow，虽然和iframe沙箱不一致，但更合理
 * 修改时机：在iframe沙箱支持插件后再修改
 */
export class CustomWindow {}

// Fix conflict of babel-polyfill@6.x
export function fixBabelPolyfill6 (): void {
  if (globalEnv.rawWindow._babelPolyfill) globalEnv.rawWindow._babelPolyfill = false
}

/**
 * Fix error of hot reload when parent&child created by create-react-app in development environment
 * Issue: https://github.com/micro-zoe/micro-app/issues/382
 */
export function fixReactHMRConflict (app: AppInterface): void {
  if (__DEV__) {
    const rawReactErrorHook = globalEnv.rawWindow.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__
    const childReactErrorHook = app.sandBox?.proxyWindow.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__
    if (rawReactErrorHook && childReactErrorHook) {
      globalEnv.rawWindow.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__ = childReactErrorHook
      defer(() => {
        globalEnv.rawWindow.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__ = rawReactErrorHook
      })
    }
  }
}

/**
 * update dom tree of target dom
 * @param container target dom
 * @param appName app name
 * @param isStaticElement is HTML built-in element
 */
export function patchElementTree (
  container: Element | ShadowRoot,
  appName: string,
  isStaticElement?: boolean,
): void {
  const children = Array.from(container.children)

  children.length && children.forEach((child) => {
    patchElementTree(child, appName, isStaticElement)
  })

  for (const child of children) {
    updateElementInfo(child, appName, isStaticElement)
  }
}

/**
 * rewrite baseURI, ownerDocument, __MICRO_APP_NAME__ of target node
 * @param node target node
 * @param appName app name
 * @param isStaticElement is HTML built-in element
 * @returns target node
 */
export function updateElementInfo <T> (
  node: T,
  appName: string | null,
  isStaticElement?: boolean,
): T {
  if (
    appName &&
    isNode(node) &&
    !node.__MICRO_APP_NAME__ &&
    !node.__PURE_ELEMENT__
  ) {
    /**
     * TODO:
     *  1. 测试baseURI和ownerDocument在with沙箱中是否正确
     *    经过验证with沙箱不能重写ownerDocument，否则react点击事件会触发两次
     *  2. with沙箱所有node设置__MICRO_APP_NAME__都使用updateElementInfo
    */
    rawDefineProperties(node, {
      __MICRO_APP_NAME__: {
        configurable: true,
        enumerable: true,
        writable: true,
        value: appName,
      },
    })

    /**
     * In FireFox, iframe element will convert to browser Element Instance after insert to document
     *
     * Performance:
     *  iframe element.__proto__ === browser HTMLElement.prototype // Chrome: false, FireFox: true
     *  iframe element.__proto__ === iframe HTMLElement.prototype // Chrome: true, FireFox: false
     *
     * NOTE:
     *  1. Node.prototype.baseURI
     *  2. Node.prototype.ownerDocument
     *  3. Node.prototype.parentNode
     *  4. Node.prototype.cloneNode
     *  5. Element.prototype.innerHTML
     *  6. Image
     */
    if (isIframeSandbox(appName)) {
      const proxyWindow = appInstanceMap.get(appName)?.sandBox?.proxyWindow
      if (proxyWindow) {
        rawDefineProperties(node, {
          baseURI: {
            configurable: true,
            enumerable: true,
            get: () => proxyWindow.location.href,
          },
          ownerDocument: {
            configurable: true,
            enumerable: true,
            get: () => node !== proxyWindow.document ? proxyWindow.document : null,
          },
          parentNode: getIframeParentNodeDesc(
            appName,
            globalEnv.rawParentNodeDesc,
            isStaticElement,
          )
        })
      }
    }
  }

  return node
}

/**
 * get Descriptor of Node.prototype.parentNode for iframe
 * @param appName app name
 * @param parentNode parentNode Descriptor of iframe or browser
 * @param isStaticElement is HTML built-in element
 */
export function getIframeParentNodeDesc (
  appName: string,
  parentNodeDesc: PropertyDescriptor,
  isStaticElement?: boolean,
): PropertyDescriptor {
  return {
    configurable: true,
    enumerable: true,
    get (this: Node) {
      /**
       * set current appName for hijack parentNode of html
       * NOTE:
       *  1. Is there a problem with setting the current appName in iframe mode
       */
      // TODO: 去掉 throttleDeferForSetAppName
      throttleDeferForSetAppName(appName)
      const result: ParentNode = parentNodeDesc.get?.call(this)
      /**
       * If parentNode is <micro-app-body>, return rawDocument.body
       * Scenes:
       *  1. element-ui@2/lib/utils/vue-popper.js
       *    if (this.popperElm.parentNode === document.body) ...
       * e.g.:
       *  1. element-ui@2.x el-dropdown
       * WARNING:
       *  Will it cause other problems ?
       *  e.g. target.parentNode.remove(target)
       */
      if (!isStaticElement && isMicroAppBody(result) && appInstanceMap.get(appName)?.container) {
        return microApp.options.getRootElementParentNode?.(this, appName) || globalEnv.rawDocument.body
      }
      return result
    }
  }
}
