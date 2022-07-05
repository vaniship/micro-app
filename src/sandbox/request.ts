import globalEnv from '../libs/global_env'
import {
  isFunction,
  isUndefined,
  isString,
  createURL,
  isURL,
} from '../libs/utils'

/**
 * https://developer.mozilla.org/en-US/docs/Web/API/fetch
 * Promise<Response> fetch(input[, init])
 * input: string/Request
 * init?: object
 * @param url app url
 * @param target proxy target
 */
export function createMicroFetch (url: string, target?: Window['fetch']): Window['fetch'] {
  if (!isUndefined(target) && !isFunction(target)) return target
  const rawFetch = target || globalEnv.rawWindow.fetch
  return function microFetch (
    input: RequestInfo | URL | string,
    init?: RequestInit,
    ...rests: unknown[]
  ): Promise<Response> {
    if (isString(input) || isURL(input)) {
      input = createURL(input, url).toString()
    }
    return rawFetch.call(globalEnv.rawWindow, input, init, ...rests)
  }
}

/**
 * https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest
 * https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Using_XMLHttpRequest
 * @param url app url
 * @param target proxy target
 */
export function createMicroXMLHttpRequest (url: string, target?: XMLHttpRequest): any {
  if (!isUndefined(target) && !isFunction(target)) return target
  const rawXMLHttpRequest = target || globalEnv.rawWindow.XMLHttpRequest
  return class MicroXMLHttpRequest extends rawXMLHttpRequest {
    open (method: string, reqUrl: string, ...rests: unknown[]): void {
      if ((isString(reqUrl) && !/^f(ile|tp):\/\//.test(reqUrl)) || isURL(reqUrl)) {
        reqUrl = createURL(reqUrl, url).toString()
      }
      super.open(method, reqUrl, ...rests)
    }
  }
}

export interface EventSourceInstance {
  close(): void;
}

export interface EventSourceApi {
  createMicroEventSource(appName: string, url: string, target?: EventSource): any
  clearMicroEventSource (appName: string): void
}

export function useMicroEventSource (): EventSourceApi {
  let eventSourceMap: Map<string, Set<EventSourceInstance>>

  /**
   * https://developer.mozilla.org/en-US/docs/Web/API/EventSource
   * pc = new EventSource(url[, configuration])
   * url: string/Request
   * configuration?: object
   * @param url app url
   * @param target proxy target
   */
  function createMicroEventSource (appName: string, url: string, target?: EventSource): any {
    if (!isUndefined(target) && !isFunction(target)) return target
    const rawEventSource = target || globalEnv.rawWindow.EventSource
    return class MicroEventSource extends rawEventSource {
      constructor (
        eventSourceUrl: string | URL,
        eventSourceInitDict?: EventSourceInit,
        ...rests: unknown[]
      ) {
        if (isString(eventSourceUrl) || isURL(eventSourceUrl)) {
          eventSourceUrl = createURL(eventSourceUrl, url).toString()
        }
        super(eventSourceUrl, eventSourceInitDict, ...rests)

        if (eventSourceMap) {
          const eventSourceList = eventSourceMap.get(appName)
          if (eventSourceList) {
            eventSourceList.add(this)
          } else {
            eventSourceMap.set(appName, new Set([this]))
          }
        } else {
          eventSourceMap = new Map([[appName, new Set([this])]])
        }
      }

      close (): void {
        super.close()
        eventSourceMap.get(appName)?.delete(this)
      }
    }
  }

  function clearMicroEventSource (appName: string): void {
    const eventSourceList = eventSourceMap?.get(appName)
    if (eventSourceList?.size) {
      eventSourceList.forEach(item => {
        item.close()
      })
      eventSourceList.clear()
    }
  }

  return {
    createMicroEventSource,
    clearMicroEventSource,
  }
}
