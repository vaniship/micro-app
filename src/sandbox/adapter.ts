import type { SandBoxAdapter, AppInterface } from '@micro-app/types'
import globalEnv from '../libs/global_env'
import { defer } from '../libs/utils'

export default class Adapter implements SandBoxAdapter {
  constructor () {
    this.injectReactHRMProperty()
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

  // TODO: __DEV__ process.env.NODE_ENV !== 'production'
  // adapter for react
  private injectReactHRMProperty (): void {
    if (process.env.NODE_ENV !== 'production') {
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
  if (process.env.NODE_ENV !== 'production') {
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
 * reDefine parentNode of html
 * Scenes:
 *  1. element-ui popover.js
 *     if (html.parentNode === document) ...
 */
export function throttleDeferForParentNode (proxyDocument: Document): void {
  const html = globalEnv.rawDocument.firstElementChild
  if (html && html.parentNode !== proxyDocument) {
    setRootParentNode(html, proxyDocument)
    defer(() => {
      setRootParentNode(html, globalEnv.rawDocument)
    })
  }
}

export function setRootParentNode (root: Element, value: Document): void {
  const descriptor = Object.getOwnPropertyDescriptor(root, 'parentNode')
  if (!descriptor || descriptor.configurable) {
    Object.defineProperty(root, 'parentNode', {
      value,
      configurable: true,
    })
  }
}
