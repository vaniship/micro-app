import type {
  microAppWindowType,
} from '@micro-app/types'
import {
  rawDefineProperties,
  isNode,
} from '../../libs/utils'

export function reWriteElementInfo <T extends Node> (
  element: T,
  microAppWindow: microAppWindowType,
  appName: string,
): T {
  if (!element.__MICRO_APP_NAME__) {
    const proxyLocation = microAppWindow.microApp.proxyLocation
    rawDefineProperties(element, {
      baseURI: {
        configurable: true,
        get: () => proxyLocation.href,
      },
      ownerDocument: {
        configurable: true,
        get: () => microAppWindow.document,
      },
      __MICRO_APP_NAME__: {
        configurable: true,
        get: () => appName,
        set: (value: string) => {
          // element.__MICRO_APP_NAME__ = value
        },
      },
    })
  }

  return element
}
