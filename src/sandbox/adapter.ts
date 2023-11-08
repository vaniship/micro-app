import type {
  SandBoxAdapter,
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

export default class Adapter implements SandBoxAdapter {
  constructor () {
    this.injectReactHMRProperty()
  }

  // keys that can only assigned to rawWindow
  public escapeSetterKeyList: PropertyKey[] = [
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
  ]

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
 */
export function patchElementTree (container: Element | ShadowRoot, appName: string): void {
  const children = Array.from(container.children)

  children.length && children.forEach((child) => {
    patchElementTree(child, appName)
  })

  for (const child of children) {
    updateElementInfo(child, appName)
  }
}

/**
 * rewrite baseURI, ownerDocument, __MICRO_APP_NAME__ of target node
 * @param node target node
 * @param appName app name
 * @returns target node
 */
export function updateElementInfo <T> (node: T, appName: string): T {
  const proxyWindow = appInstanceMap.get(appName)?.sandBox?.proxyWindow
  if (
    isNode(node) &&
    !node.__MICRO_APP_NAME__ &&
    !node.__PURE_ELEMENT__ &&
    proxyWindow
  ) {
    /**
     * TODO:
     *  1. 测试baseURI和ownerDocument在with沙箱中是否正确
     *    经过验证with沙箱不能重写ownerDocument，否则react点击事件会触发两次
     *  2. with沙箱所有node设置__MICRO_APP_NAME__都使用updateElementInfo
    */
    rawDefineProperties(node, {
      baseURI: {
        configurable: true,
        get: () => proxyWindow.location.href,
      },
      __MICRO_APP_NAME__: {
        configurable: true,
        writable: true,
        value: appName,
      },
    })

    if (isIframeSandbox(appName)) {
      rawDefineProperties(node, {
        ownerDocument: {
          configurable: true,
          get: () => proxyWindow.document,
        },
      })
      if (node instanceof globalEnv.rawWindow.Node) {
        rawDefineProperties(node, {
          /**
           * HTML built-in node belongs to base app, so it needs to be handled separately for parentNode
           * Fix error for nuxt@2.x + ElementUI@2.x
           */
          /**
           * 问题：如果设置了parentNode，则vue2项目无法正常渲染或者切换路由
           * 原因：html自带的元素并不是一定都属于基座，也有可能属于子应用的元素，此时如果设置了元素的parentNode，无论如何设置都会导致vue2渲染的异常，比如首次渲染失败、二次渲染失败、element-ui下拉框位置错误
           * 解决思路：所以这里进行了一次判断，如果当前元素属于基座，那就重写parentNode，否则此元素一定属于子应用，那么就不需要处理，因为子应用的原型链上已经处理过。
           * TODO: 再整理一下
           *  1. rawDefineProperties 换成 rawDefineProperty
           *  2. createGetterForIframeParentNode第三个参数是否需要 -- 是必须的
           */
          parentNode: {
            configurable: true,
            get: createGetterForIframeParentNode(
              appName,
              globalEnv.rawParentNodeDesc,
              true,
            )
          }
        })
      }
    }
  }

  return node
}

/**
 * patch iframe node parentNode
 * Scenes:
 *  1. iframe common node: patch Node.prototype.parentNode to hijack parentNode
 *  2. iframe HTML built-in node: belongs to base app, we should rewrite parentNode for every built-in node
 * NOTE:
 *  1. HTML built-in node parentNode cannot point to raw body, otherwise Vue2 will render failed
 * @param appName app name
 * @param parentNode parentNode Descriptor of iframe or browser
 * @param HTMLBuildInNode is HTML built-in node
 */
export function createGetterForIframeParentNode (
  appName: string,
  parentNodeDesc: PropertyDescriptor,
  HTMLBuildInNode?: boolean,
): () => ParentNode {
  return function (this: Node) {
    /**
     * set current appName for hijack parentNode of html
     * NOTE:
     *  1. Is there a problem with setting the current appName in iframe mode
     */
    throttleDeferForSetAppName(appName)
    const result: ParentNode = parentNodeDesc.get!.call(this)
    /**
      * If parentNode is <micro-app-body>, return rawDocument.body
      * Scenes:
      *  1. element-ui@2/lib/utils/vue-popper.js
      *    if (this.popperElm.parentNode === document.body) ...
      * WARNING:
      *  Will it cause other problems ?
      *  e.g. target.parentNode.remove(target)
      */
    if (
      !HTMLBuildInNode &&
      isMicroAppBody(result) &&
      appInstanceMap.get(appName)?.container
    ) {
      return microApp.options.getRootElementParentNode?.(this, appName) || globalEnv.rawDocument.body
    }
    return result
  }
}
